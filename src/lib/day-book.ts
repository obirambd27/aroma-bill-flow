/**
 * Day Book — full daily cash reconciliation.
 *
 * Opening Cash is derived from the Cash in Hand account: opening_balance plus
 * every signed ledger entry strictly before the selected date. Closing Cash is
 * Opening Cash plus the same day's cash ledger movement, so today's closing
 * always equals tomorrow's opening.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildPaymentBreakdown, normalizeMethod, type AllocationInput } from "@/lib/bill-payments";
import { fetchAll } from "@/lib/fetch-all";
import { round2 } from "@/lib/payment-math";
import { COUNTER_PAYMENT_NOTE } from "@/lib/payments";

export const VOUCHER_TYPES = [
  "Sales Invoice",
  "Purchase Bill",
  "Payment Received",
  "Payment Made",
  "Expense",
  "Sales Return",
  "Purchase Return",
  "Credit Note",
  "Fund Transfer",
  "Salary Payment",
  "Employee Advance",
] as const;
export type VoucherType = (typeof VOUCHER_TYPES)[number];

export type VoucherTone = "success" | "warning" | "error" | "neutral" | "accent";

export function voucherTone(type: VoucherType): VoucherTone {
  switch (type) {
    case "Sales Invoice":
    case "Payment Received":
      return "success";
    case "Purchase Bill":
    case "Payment Made":
      return "warning";
    case "Expense":
    case "Salary Payment":
    case "Employee Advance":
      return "error";
    case "Sales Return":
    case "Purchase Return":
    case "Credit Note":
      return "neutral";
    default:
      return "accent";
  }
}

export type Voucher = {
  key: string;
  date: string;
  at: string;
  type: VoucherType;
  number: string;
  party: string;
  reference: string;
  amount: number;
  status: string;
  link?: { to: string; params: Record<string, string> };
};

export type DayBook = {
  date: string;
  cashAccountName: string;
  openingCashCalculated: number;
  openingCash: number;
  openingOverridden: boolean;
  closingCash: number;
  collection: Record<string, number>;
  totalCollected: number;
  totalPurchaseBills: number;
  totalExpenses: number;
  todaysSales: number;
  paymentsCollected: number;
  inHandCash: number;
  collectedOtherInvoiceDate: number;

  cashToBank: number;
  bankToCash: number;
  netSales: number;
  netPurchases: number;
  totalOut: number;
  netCashMovement: number;
  vouchers: Voucher[];
};

type Row = Record<string, unknown>;

const num = (v: unknown) => Number(v ?? 0);
const ts = (date: string, created?: unknown) =>
  typeof created === "string" && created.slice(0, 10) === date ? created : `${date}T00:00:00.000Z`;

export function useDayBookOverride(date: string) {
  return useQuery({
    queryKey: ["day-book-override", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("day_book_overrides")
        .select("*")
        .eq("book_date", date)
        .maybeSingle();
      if (error) throw error;
      return (data as { opening_cash: number } | null) ?? null;
    },
  });
}

export function useSaveDayBookOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ date, value }: { date: string; value: number | null }) => {
      if (value === null) {
        const { error } = await supabase.from("day_book_overrides").delete().eq("book_date", date);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("day_book_overrides")
        .upsert({ book_date: date, opening_cash: value }, { onConflict: "book_date" });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ["day-book-override", vars.date] });
      void qc.invalidateQueries({ queryKey: ["day-book", vars.date] });
    },
  });
}

async function allocationsByBill(billIds: string[]) {
  const map: Record<string, AllocationInput[]> = {};
  if (billIds.length === 0) return map;
  const { data, error } = await supabase
    .from("payment_allocations")
    .select("bill_id, amount_allocated, payments_received(payment_date, payment_method, notes)")
    .in("bill_id", billIds);
  if (error) throw error;
  for (const a of (data ?? []) as unknown as Row[]) {
    const p = a["payments_received"] as {
      payment_date: string;
      payment_method: string;
      notes: string | null;
    } | null;
    // Counter payments are already represented by the bill's own upfront amount.
    if (p?.notes === COUNTER_PAYMENT_NOTE) continue;
    (map[String(a["bill_id"])] ??= []).push({
      amount: num(a["amount_allocated"]),
      method: p?.payment_method ?? null,
      date: p?.payment_date ?? null,
    });
  }
  return map;
}

export function useDayBook(date: string) {
  return useQuery({
    queryKey: ["day-book", date],
    queryFn: async (): Promise<DayBook> => {
      const [
        accountsRes,
        overrideRes,
        billsRes,
        purchasesRes,
        receivedRes,
        madeRes,
        salesReturnsRes,
        purchaseReturnsRes,
        creditNotesRes,
        expensesRes,
        transfersRes,
      ] = await Promise.all([
        supabase.from("accounts").select("id, name, account_type, opening_balance, current_balance"),
        supabase.from("day_book_overrides").select("opening_cash").eq("book_date", date).maybeSingle(),
        supabase
          .from("bills")
          .select(
            "id, bill_number, bill_date, created_at, total_amount, amount_paid, payment_method, payment_status, status, is_walk_in, customers(name)",
          )
          .eq("bill_date", date),
        supabase
          .from("purchase_bills")
          .select(
            "id, bill_number, bill_date, created_at, total_amount, amount_paid, payment_status, status, vendors(name)",
          )
          .eq("bill_date", date),
        supabase
          .from("payments_received")
          .select(
            "id, payment_date, created_at, amount, payment_method, reference_number, notes, customers(name), payment_allocations(amount_allocated, bills(bill_date, bill_number))",
          )
          .eq("payment_date", date),
        supabase
          .from("payments_made")
          .select(
            "id, payment_date, created_at, amount, payment_method, reference_number, vendors(name), payment_made_allocations(amount_allocated, purchase_bills(bill_date, bill_number))",
          )
          .eq("payment_date", date),
        supabase
          .from("sales_returns")
          .select("id, return_number, return_date, created_at, total_amount, status, customers(name)")
          .eq("return_date", date),
        supabase
          .from("purchase_returns")
          .select("id, return_number, return_date, created_at, total_amount, status, vendors(name)")
          .eq("return_date", date),
        supabase
          .from("credit_notes")
          .select(
            "id, credit_note_number, credit_note_date, created_at, total_amount, status, customers(name)",
          )
          .eq("credit_note_date", date),
        supabase
          .from("expenses")
          .select(
            "id, expense_number, expense_date, created_at, amount, vendor_name, description, payment_method, account_id",
          )
          .eq("expense_date", date),
        supabase
          .from("fund_transfers")
          .select("id, transfer_date, created_at, amount, notes, from_account_id, to_account_id")
          .eq("transfer_date", date),
        supabase
          .from("salary_payments")
          .select(
            "id, payment_number, payment_date, created_at, net_amount, amount_paid, period_label, payment_method, payment_status, employees(name)",
          )
          .eq("payment_date", date),
        supabase
          .from("employee_advances")
          .select("id, advance_date, created_at, amount, reason, status, employees(name)")
          .eq("advance_date", date),
      ]);

      const accounts = (accountsRes.data ?? []) as unknown as Row[];
      const accName: Record<string, string> = {};
      for (const a of accounts) accName[String(a["id"])] = String(a["name"]);
      const cashAccount =
        accounts.find(
          (a) => a["account_type"] === "Cash" && /cash in hand/i.test(String(a["name"])),
        ) ?? accounts.find((a) => a["account_type"] === "Cash");
      const cashId = cashAccount ? String(cashAccount["id"]) : null;

      // Opening Cash mirrors the live "Total cash" shown on Cash & Bank:
      // the sum of every Cash account's current balance (cash sales + collections
      // − cash expenses/purchases − transfers to bank).
      const cashBalanceNow = round2(
        accounts
          .filter((a) => a["account_type"] === "Cash")
          .reduce((s, a) => s + num(a["current_balance"]), 0),
      );

      let todaysCashMovement = 0;
      if (cashId) {
        const rows = await fetchAll<{ entry_date: string; amount: number }>((from, to) =>
          supabase
            .from("ledger_entries")
            .select("entry_date, amount")
            .eq("account_id", cashId)
            .eq("entry_date", date)
            .range(from, to),
        );
        for (const e of rows) todaysCashMovement += num(e.amount);
      }
      const openingCalc = cashBalanceNow;

      const override = (overrideRes.data as { opening_cash: number } | null) ?? null;
      const openingCash = override ? num(override.opening_cash) : openingCalc;



      /* ---------- collections by method ---------- */
      const collection: Record<string, number> = {
        Cash: 0,
        "Card Payment": 0,
        "Bank Transfer": 0,
      };
      const addCollection = (method: string | null, amount: number) => {
        if (!method || amount === 0) return;
        collection[method] = (collection[method] ?? 0) + amount;
      };

      const billRows = (billsRes.data ?? []) as unknown as Row[];
      const allocs = await allocationsByBill(billRows.map((b) => String(b["id"])));

      const vouchers: Voucher[] = [];
      let netSalesInvoices = 0;

      for (const b of billRows) {
        if (b["status"] === "Draft") continue;
        const voided = b["status"] === "Voided";
        const breakdown = buildPaymentBreakdown(
          {
            total_amount: num(b["total_amount"]),
            amount_paid: num(b["amount_paid"]),
            payment_method: (b["payment_method"] as string | null) ?? null,
            bill_date: String(b["bill_date"]),
          },
          allocs[String(b["id"])] ?? [],
        );
        if (!voided) {
          netSalesInvoices += num(b["total_amount"]);
          for (const [m, amt] of Object.entries(breakdown.upfrontByMethod)) addCollection(m, amt);
        }
        vouchers.push({
          key: `bill-${b["id"]}`,
          date: String(b["bill_date"]),
          at: ts(String(b["bill_date"]), b["created_at"]),
          type: "Sales Invoice",
          number: (b["bill_number"] as string) ?? "—",
          party:
            (b["customers"] as { name: string } | null)?.name ??
            (b["is_walk_in"] ? "Walk-in" : "—"),
          reference: breakdown.methods.join(", ") || "—",
          amount: voided ? 0 : num(b["total_amount"]),
          status: voided ? "Voided" : String(b["payment_status"] ?? ""),
          link: { to: "/bills/$billId", params: { billId: String(b["id"]) } },
        });
      }

      let collectedOther = 0;
      let receivedTotal = 0;
      for (const p of (receivedRes.data ?? []) as unknown as Row[]) {
        // Counter payments already appear on their sales invoice voucher.
        if (p["notes"] === COUNTER_PAYMENT_NOTE) continue;
        const method = normalizeMethod(p["payment_method"] as string | null);
        const amount = num(p["amount"]);
        receivedTotal += amount;
        addCollection(method, amount);

        const lines = (p["payment_allocations"] ?? []) as {
          amount_allocated: number;
          bills: { bill_date: string; bill_number: string | null } | null;
        }[];
        for (const l of lines) {
          if (l.bills && l.bills.bill_date !== date) collectedOther += num(l.amount_allocated);
        }
        vouchers.push({
          key: `received-${p["id"]}`,
          date: String(p["payment_date"]),
          at: ts(String(p["payment_date"]), p["created_at"]),
          type: "Payment Received",
          number: (p["reference_number"] as string) ?? "—",
          party: (p["customers"] as { name: string } | null)?.name ?? "Walk-in",
          reference:
            lines
              .map((l) => l.bills?.bill_number)
              .filter(Boolean)
              .join(", ") || (method ?? "—"),
          amount,
          status: method ?? "Completed",
        });
      }

      let totalPaymentsMade = 0;
      for (const p of (madeRes.data ?? []) as unknown as Row[]) {
        const amount = num(p["amount"]);
        totalPaymentsMade += amount;
        const lines = (p["payment_made_allocations"] ?? []) as {
          amount_allocated: number;
          purchase_bills: { bill_date: string; bill_number: string | null } | null;
        }[];
        for (const l of lines) {
          if (l.purchase_bills && l.purchase_bills.bill_date !== date) {
            collectedOther += num(l.amount_allocated);
          }
        }
        vouchers.push({
          key: `made-${p["id"]}`,
          date: String(p["payment_date"]),
          at: ts(String(p["payment_date"]), p["created_at"]),
          type: "Payment Made",
          number: (p["reference_number"] as string) ?? "—",
          party: (p["vendors"] as { name: string } | null)?.name ?? "—",
          reference:
            lines
              .map((l) => l.purchase_bills?.bill_number)
              .filter(Boolean)
              .join(", ") || (normalizeMethod(p["payment_method"] as string | null) ?? "—"),
          amount,
          status: normalizeMethod(p["payment_method"] as string | null) ?? "Completed",
        });
      }

      let totalPurchaseBills = 0;
      let purchaseUpfront = 0;
      for (const p of (purchasesRes.data ?? []) as unknown as Row[]) {
        if (p["status"] === "Draft") continue;
        const voided = p["status"] === "Voided";
        if (!voided) {
          totalPurchaseBills += num(p["total_amount"]);
          purchaseUpfront += num(p["amount_paid"]);
        }
        vouchers.push({
          key: `purchase-${p["id"]}`,
          date: String(p["bill_date"]),
          at: ts(String(p["bill_date"]), p["created_at"]),
          type: "Purchase Bill",
          number: (p["bill_number"] as string) ?? "—",
          party: (p["vendors"] as { name: string } | null)?.name ?? "—",
          reference: "—",
          amount: voided ? 0 : num(p["total_amount"]),
          status: voided ? "Voided" : String(p["payment_status"] ?? ""),
          link: {
            to: "/purchase-bills/$purchaseBillId",
            params: { purchaseBillId: String(p["id"]) },
          },
        });
      }

      for (const r of (salesReturnsRes.data ?? []) as unknown as Row[]) {
        vouchers.push({
          key: `sreturn-${r["id"]}`,
          date: String(r["return_date"]),
          at: ts(String(r["return_date"]), r["created_at"]),
          type: "Sales Return",
          number: (r["return_number"] as string) ?? "—",
          party: (r["customers"] as { name: string } | null)?.name ?? "Walk-in",
          reference: "—",
          amount: num(r["total_amount"]),
          status: String(r["status"] ?? ""),
          link: { to: "/sales-returns/$returnId", params: { returnId: String(r["id"]) } },
        });
      }

      for (const r of (purchaseReturnsRes.data ?? []) as unknown as Row[]) {
        vouchers.push({
          key: `preturn-${r["id"]}`,
          date: String(r["return_date"]),
          at: ts(String(r["return_date"]), r["created_at"]),
          type: "Purchase Return",
          number: (r["return_number"] as string) ?? "—",
          party: (r["vendors"] as { name: string } | null)?.name ?? "—",
          reference: "—",
          amount: num(r["total_amount"]),
          status: String(r["status"] ?? ""),
          link: { to: "/purchase-returns/$returnId", params: { returnId: String(r["id"]) } },
        });
      }

      let creditNotesTotal = 0;
      for (const c of (creditNotesRes.data ?? []) as unknown as Row[]) {
        if (c["status"] !== "Cancelled") creditNotesTotal += num(c["total_amount"]);
        vouchers.push({
          key: `credit-${c["id"]}`,
          date: String(c["credit_note_date"]),
          at: ts(String(c["credit_note_date"]), c["created_at"]),
          type: "Credit Note",
          number: (c["credit_note_number"] as string) ?? "—",
          party: (c["customers"] as { name: string } | null)?.name ?? "—",
          reference: "—",
          amount: num(c["total_amount"]),
          status: String(c["status"] ?? ""),
          link: { to: "/credit-notes/$creditNoteId", params: { creditNoteId: String(c["id"]) } },
        });
      }

      let totalExpenses = 0;
      for (const e of (expensesRes.data ?? []) as unknown as Row[]) {
        totalExpenses += num(e["amount"]);
        vouchers.push({
          key: `expense-${e["id"]}`,
          date: String(e["expense_date"]),
          at: ts(String(e["expense_date"]), e["created_at"]),
          type: "Expense",
          number: (e["expense_number"] as string) ?? "—",
          party: (e["vendor_name"] as string) ?? "—",
          reference: (e["description"] as string) ?? "—",
          amount: num(e["amount"]),
          status: (e["payment_method"] as string) ?? "Posted",
          link: { to: "/expenses/$expenseId", params: { expenseId: String(e["id"]) } },
        });
      }

      let cashToBank = 0;
      let bankToCash = 0;
      for (const t of (transfersRes.data ?? []) as unknown as Row[]) {
        const fromId = String(t["from_account_id"]);
        const toId = String(t["to_account_id"]);
        const amount = num(t["amount"]);
        if (cashId && fromId === cashId) cashToBank += amount;
        if (cashId && toId === cashId) bankToCash += amount;
        vouchers.push({
          key: `transfer-${t["id"]}`,
          date: String(t["transfer_date"]),
          at: ts(String(t["transfer_date"]), t["created_at"]),
          type: "Fund Transfer",
          number: "—",
          party: `${accName[fromId] ?? "—"} → ${accName[toId] ?? "—"}`,
          reference: (t["notes"] as string) || "—",
          amount,
          status: "Completed",
        });
      }

      const totalCollected = round2(Object.values(collection).reduce((s, v) => s + v, 0));
      // Money out = purchase settlements + standalone vendor payments + expenses.
      const totalOut = round2(purchaseUpfront + totalPaymentsMade + totalExpenses);

      return {
        date,
        cashAccountName: cashAccount ? String(cashAccount["name"]) : "Cash in Hand",
        openingCashCalculated: round2(openingCalc),
        openingCash: round2(openingCash),
        openingOverridden: Boolean(override),
        // Closing Cash = Opening Cash + every cash ledger movement booked today
        // (cash collections, cash expenses/purchases and fund transfers).
        closingCash: override ? round2(openingCash + todaysCashMovement) : cashBalanceNow,
        collection,
        totalCollected,
        totalPurchaseBills: round2(totalPurchaseBills),
        totalExpenses: round2(totalExpenses),
        todaysSales: round2(netSalesInvoices),
        paymentsCollected: round2(receivedTotal),
        inHandCash: override ? round2(openingCash + todaysCashMovement) : cashBalanceNow,
        collectedOtherInvoiceDate: round2(collectedOther),

        cashToBank: round2(cashToBank),
        bankToCash: round2(bankToCash),
        netSales: round2(netSalesInvoices - creditNotesTotal),
        netPurchases: round2(totalPurchaseBills + totalExpenses),
        totalOut,
        netCashMovement: round2(totalCollected - totalOut),
        vouchers: vouchers.sort((a, b) => a.at.localeCompare(b.at)),
      };
    },
  });
}
