import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* ---------- Date helpers ---------- */

export type Preset = "today" | "week" | "month" | "year" | "custom";

const iso = (d: Date) => {
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
};

export function presetRange(p: Preset): { from: string; to: string } {
  const now = new Date();
  const today = iso(now);
  if (p === "today") return { from: today, to: today };
  if (p === "week") {
    const d = new Date(now);
    const dow = (d.getDay() + 6) % 7; // Monday start
    d.setDate(d.getDate() - dow);
    return { from: iso(d), to: today };
  }
  if (p === "month") {
    return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  }
  if (p === "year") {
    return { from: iso(new Date(now.getFullYear(), 0, 1)), to: today };
  }
  return { from: today, to: today };
}

export const todayISO = () => iso(new Date());

export function shiftDay(date: string, delta: number) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return iso(d);
}

export function monthKey(date: string) {
  return date.slice(0, 7);
}

/* ---------- Sales report ---------- */

export type SalesRow = {
  id: string;
  bill_date: string;
  bill_number: string | null;
  customer_id: string | null;
  customer: string;
  warehouse_id: string | null;
  warehouse: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  payment_status: string;
  is_taxed: boolean;
  status: string;
};

export function useSalesReport(range: { from: string; to: string }) {
  return useQuery({
    queryKey: ["report-sales", range.from, range.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select(
          "id, bill_date, bill_number, customer_id, is_walk_in, warehouse_id, subtotal, discount_amount, tax_amount, total_amount, amount_paid, payment_status, is_taxed, status, customers(name), warehouses(name)",
        )
        .gte("bill_date", range.from)
        .lte("bill_date", range.to)
        .order("bill_date", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((b) => {
        const r = b as unknown as {
          customers: { name: string } | null;
          warehouses: { name: string } | null;
          is_walk_in: boolean;
        } & Record<string, unknown>;
        return {
          id: String(r["id"]),
          bill_date: String(r["bill_date"]),
          bill_number: (r["bill_number"] as string | null) ?? null,
          customer_id: (r["customer_id"] as string | null) ?? null,
          customer: r.customers?.name ?? (r.is_walk_in ? "Walk-in" : "—"),
          warehouse_id: (r["warehouse_id"] as string | null) ?? null,
          warehouse: r.warehouses?.name ?? "—",
          subtotal: Number(r["subtotal"] ?? 0),
          discount_amount: Number(r["discount_amount"] ?? 0),
          tax_amount: Number(r["tax_amount"] ?? 0),
          total_amount: Number(r["total_amount"] ?? 0),
          amount_paid: Number(r["amount_paid"] ?? 0),
          payment_status: String(r["payment_status"] ?? ""),
          is_taxed: Boolean(r["is_taxed"]),
          status: String(r["status"] ?? ""),
        } as SalesRow;
      });
    },
  });
}

/* ---------- Purchase report ---------- */

export type PurchaseRow = {
  id: string;
  bill_date: string;
  bill_number: string | null;
  vendor_id: string | null;
  vendor: string;
  warehouse_id: string | null;
  warehouse: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  payment_status: string;
  status: string;
};

export function usePurchaseReport(range: { from: string; to: string }) {
  return useQuery({
    queryKey: ["report-purchases", range.from, range.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_bills")
        .select(
          "id, bill_date, bill_number, vendor_id, warehouse_id, subtotal, tax_amount, total_amount, amount_paid, payment_status, status, vendors(name), warehouses(name)",
        )
        .gte("bill_date", range.from)
        .lte("bill_date", range.to)
        .order("bill_date", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((b) => {
        const r = b as unknown as {
          vendors: { name: string } | null;
          warehouses: { name: string } | null;
        } & Record<string, unknown>;
        return {
          id: String(r["id"]),
          bill_date: String(r["bill_date"]),
          bill_number: (r["bill_number"] as string | null) ?? null,
          vendor_id: (r["vendor_id"] as string | null) ?? null,
          vendor: r.vendors?.name ?? "—",
          warehouse_id: (r["warehouse_id"] as string | null) ?? null,
          warehouse: r.warehouses?.name ?? "—",
          subtotal: Number(r["subtotal"] ?? 0),
          tax_amount: Number(r["tax_amount"] ?? 0),
          total_amount: Number(r["total_amount"] ?? 0),
          amount_paid: Number(r["amount_paid"] ?? 0),
          payment_status: String(r["payment_status"] ?? ""),
          status: String(r["status"] ?? ""),
        } as PurchaseRow;
      });
    },
  });
}

/* ---------- Unified transaction feed ---------- */

export const TXN_TYPES = [
  "Sale",
  "Purchase",
  "Payment Received",
  "Payment Made",
  "Sales Return",
  "Purchase Return",
  "Expense",
  "Fund Transfer",
] as const;
export type TxnType = (typeof TXN_TYPES)[number];

export type TxnRow = {
  key: string;
  id: string;
  type: TxnType;
  date: string;
  at: string; // ISO timestamp used for chronological sort
  reference: string;
  party: string;
  description: string;
  accountId: string | null;
  account: string;
  amount: number;
  direction: "in" | "out" | "neutral";
  status: string;
  /** Route for row click-through, when a detail page exists. */
  link?: { to: string; params?: Record<string, string> };
};

export function txnTone(type: TxnType) {
  switch (type) {
    case "Sale":
      return "success" as const;
    case "Payment Received":
      return "success" as const;
    case "Purchase":
      return "error" as const;
    case "Payment Made":
      return "error" as const;
    case "Sales Return":
      return "warning" as const;
    case "Purchase Return":
      return "warning" as const;
    case "Expense":
      return "error" as const;
    default:
      return "accent" as const;
  }
}

type Row = Record<string, unknown>;

export function useTransactions(range: { from: string; to: string }) {
  return useQuery({
    queryKey: ["report-transactions", range.from, range.to],
    queryFn: async () => {
      const { from, to } = range;
      const accountsRes = await supabase.from("accounts").select("id, name, account_type");
      const accName: Record<string, string> = {};
      const isCashAccount: Record<string, boolean> = {};
      for (const a of accountsRes.data ?? []) {
        accName[a.id] = a.name;
        isCashAccount[a.id] = a.account_type === "Cash" || a.account_type === "Bank";
      }

      const [bills, purchases, received, salesReturns, transfers, ledger] = await Promise.all([
        supabase
          .from("bills")
          .select(
            "id, bill_number, bill_date, created_at, total_amount, payment_status, status, is_walk_in, customers(name)",
          )
          .gte("bill_date", from)
          .lte("bill_date", to),
        supabase
          .from("purchase_bills")
          .select(
            "id, bill_number, bill_date, created_at, total_amount, payment_status, status, vendors(name)",
          )
          .gte("bill_date", from)
          .lte("bill_date", to),
        supabase
          .from("payments_received")
          .select(
            "id, payment_date, created_at, amount, payment_method, account_id, reference_number, notes, customers(name)",
          )
          .gte("payment_date", from)
          .lte("payment_date", to),
        supabase
          .from("sales_returns")
          .select(
            "id, return_number, return_date, created_at, total_amount, status, customers(name)",
          )
          .gte("return_date", from)
          .lte("return_date", to),
        supabase
          .from("fund_transfers")
          .select("id, transfer_date, created_at, amount, notes, from_account_id, to_account_id")
          .gte("transfer_date", from)
          .lte("transfer_date", to),
        supabase
          .from("ledger_entries")
          .select(
            "id, entry_date, created_at, entry_type, amount, description, account_id, related_purchase_id, related_payment_id",
          )
          .gte("entry_date", from)
          .lte("entry_date", to)
          .in("entry_type", [
            "Sale Payment",
            "Purchase Payment",
            "Expense",
            "Purchase Return",
          ]),
      ]);

      // Expenses live in their own table from Part 28 onwards; ignore if absent.
      let expenseRows: Row[] = [];
      try {
        const res = await (supabase as unknown as {
          from: (t: string) => {
            select: (s: string) => {
              gte: (
                c: string,
                v: string,
              ) => { lte: (c: string, v: string) => Promise<{ data: Row[] | null }> };
            };
          };
        })
          .from("expenses")
          .select("*")
          .gte("expense_date", from)
          .lte("expense_date", to);
        expenseRows = res.data ?? [];
      } catch {
        expenseRows = [];
      }

      const out: TxnRow[] = [];
      const ts = (date: string, created?: unknown) =>
        typeof created === "string" && created.slice(0, 10) === date
          ? created
          : `${date}T00:00:00.000Z`;

      for (const b of (bills.data ?? []) as unknown as Row[]) {
        if (b["status"] === "Draft") continue;
        const voided = b["status"] === "Voided";
        out.push({
          key: `sale-${b["id"]}`,
          id: String(b["id"]),
          type: "Sale",
          date: String(b["bill_date"]),
          at: ts(String(b["bill_date"]), b["created_at"]),
          reference: (b["bill_number"] as string) ?? "—",
          party:
            (b["customers"] as { name: string } | null)?.name ??
            (b["is_walk_in"] ? "Walk-in" : "—"),
          description: voided ? "Voided sales bill" : "Sales bill",
          accountId: null,
          account: "—",
          amount: voided ? 0 : Number(b["total_amount"] ?? 0),
          direction: "in",
          status: voided ? "Voided" : String(b["payment_status"] ?? ""),
          link: { to: "/bills/$billId", params: { billId: String(b["id"]) } },
        });
      }

      for (const p of (purchases.data ?? []) as unknown as Row[]) {
        if (p["status"] === "Draft") continue;
        const voided = p["status"] === "Voided";
        out.push({
          key: `purchase-${p["id"]}`,
          id: String(p["id"]),
          type: "Purchase",
          date: String(p["bill_date"]),
          at: ts(String(p["bill_date"]), p["created_at"]),
          reference: (p["bill_number"] as string) ?? "—",
          party: (p["vendors"] as { name: string } | null)?.name ?? "—",
          description: voided ? "Voided purchase bill" : "Purchase bill",
          accountId: null,
          account: "—",
          amount: voided ? 0 : Number(p["total_amount"] ?? 0),
          direction: "out",
          status: voided ? "Voided" : String(p["payment_status"] ?? ""),
          link: {
            to: "/purchase-bills/$purchaseBillId",
            params: { purchaseBillId: String(p["id"]) },
          },
        });
      }

      for (const p of (received.data ?? []) as unknown as Row[]) {
        const accountId = (p["account_id"] as string | null) ?? null;
        out.push({
          key: `received-${p["id"]}`,
          id: String(p["id"]),
          type: "Payment Received",
          date: String(p["payment_date"]),
          at: ts(String(p["payment_date"]), p["created_at"]),
          reference: (p["reference_number"] as string) ?? "—",
          party: (p["customers"] as { name: string } | null)?.name ?? "Walk-in",
          description: `Payment received (${p["payment_method"] ?? "—"})`,
          accountId,
          account: accountId ? (accName[accountId] ?? "—") : "—",
          amount: Number(p["amount"] ?? 0),
          direction: "in",
          status: "Completed",
        });
      }

      for (const r of (salesReturns.data ?? []) as unknown as Row[]) {
        if (r["status"] === "Cancelled") continue;
        out.push({
          key: `sreturn-${r["id"]}`,
          id: String(r["id"]),
          type: "Sales Return",
          date: String(r["return_date"]),
          at: ts(String(r["return_date"]), r["created_at"]),
          reference: (r["return_number"] as string) ?? "—",
          party: (r["customers"] as { name: string } | null)?.name ?? "Walk-in",
          description: "Sales return",
          accountId: null,
          account: "—",
          amount: Number(r["total_amount"] ?? 0),
          direction: "out",
          status: String(r["status"] ?? ""),
          link: { to: "/sales-returns/$returnId", params: { returnId: String(r["id"]) } },
        });
      }

      for (const t of (transfers.data ?? []) as unknown as Row[]) {
        const fromId = String(t["from_account_id"]);
        const toId = String(t["to_account_id"]);
        out.push({
          key: `transfer-${t["id"]}`,
          id: String(t["id"]),
          type: "Fund Transfer",
          date: String(t["transfer_date"]),
          at: ts(String(t["transfer_date"]), t["created_at"]),
          reference: "—",
          party: `${accName[fromId] ?? "—"} → ${accName[toId] ?? "—"}`,
          description: (t["notes"] as string) || "Fund transfer",
          accountId: fromId,
          account: accName[fromId] ?? "—",
          amount: Number(t["amount"] ?? 0),
          direction: "neutral",
          status: "Completed",
        });
      }

      for (const l of (ledger.data ?? []) as unknown as Row[]) {
        const entryType = String(l["entry_type"]);
        const accountId = (l["account_id"] as string | null) ?? null;
        // Ledger posts both sides; keep only the cash/bank leg to avoid duplicates.
        if (!accountId || !isCashAccount[accountId]) continue;
        // Payments recorded through the Payments module are already listed above.
        if (entryType === "Sale Payment" && l["related_payment_id"]) continue;
        const type: TxnType =
          entryType === "Sale Payment"
            ? "Payment Received"
            : entryType === "Purchase Payment"
              ? "Payment Made"
              : entryType === "Purchase Return"
                ? "Purchase Return"
                : "Expense";
        const accountName = accName[accountId] ?? "—";
        out.push({
          key: `ledger-${l["id"]}`,
          id: String(l["id"]),
          type,
          date: String(l["entry_date"]),
          at: ts(String(l["entry_date"]), l["created_at"]),
          reference: "—",
          party: accountName,
          description: (l["description"] as string) || entryType,
          accountId,
          account: accountName,
          amount: Math.abs(Number(l["amount"] ?? 0)),
          direction:
            type === "Payment Received" || type === "Purchase Return" ? "in" : "out",
          status: "Posted",
        });
      }


      for (const e of expenseRows) {
        const accountId = (e["account_id"] as string | null) ?? null;
        const date = String(e["expense_date"] ?? e["created_at"] ?? from).slice(0, 10);
        out.push({
          key: `expense-${e["id"]}`,
          id: String(e["id"]),
          type: "Expense",
          date,
          at: ts(date, e["created_at"]),
          reference: (e["expense_number"] as string) ?? "—",
          party: (e["vendor_name"] as string) ?? "—",
          description: (e["description"] as string) || "Expense",
          accountId,
          account: accountId ? (accName[accountId] ?? "—") : "—",
          amount: Number(e["amount"] ?? 0),
          direction: "out",
          status: "Posted",
          link: { to: "/expenses/$expenseId", params: { expenseId: String(e["id"]) } },
        });
      }


      return out.sort((a, b) => b.at.localeCompare(a.at));
    },
  });
}

/** Cash-affecting movement for a transaction (day book running total). */
export function cashDelta(t: TxnRow) {
  if (t.type === "Payment Received") return t.amount;
  if (t.type === "Payment Made" || t.type === "Expense") return -t.amount;
  return 0;
}

export function groupRows<T>(rows: T[], key: (r: T) => string) {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r) || "—";
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
