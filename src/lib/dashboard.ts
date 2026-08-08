import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DashBill = {
  id: string;
  bill_number: string | null;
  bill_date: string;
  customer_id: string | null;
  total_amount: number;
  amount_paid: number;
  payment_status: string;
  payment_method: string | null;
  is_taxed: boolean;
};

export type DashPurchaseBill = {
  id: string;
  bill_number: string | null;
  bill_date: string;
  vendor_id: string | null;
  total_amount: number;
  amount_paid: number;
  payment_status: string;
};

/** Finalized sales bills, lightweight projection for dashboard aggregates. */
export function useDashboardBills() {
  return useQuery({
    queryKey: ["dashboard", "bills"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select(
          "id, bill_number, bill_date, customer_id, total_amount, amount_paid, payment_status, payment_method, is_taxed",
        )
        .eq("status", "Finalized")
        .order("bill_date", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((b) => ({
        ...b,
        total_amount: Number(b.total_amount),
        amount_paid: Number(b.amount_paid),
      })) as DashBill[];
    },
  });
}

export function useDashboardPurchaseBills() {
  return useQuery({
    queryKey: ["dashboard", "purchase-bills"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_bills")
        .select(
          "id, bill_number, bill_date, vendor_id, total_amount, amount_paid, payment_status",
        )
        .eq("status", "Finalized")
        .order("bill_date", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((b) => ({
        ...b,
        total_amount: Number(b.total_amount),
        amount_paid: Number(b.amount_paid),
      })) as DashPurchaseBill[];
    },
  });
}

export type DashBillItem = {
  product_id: string | null;
  product_name_snapshot: string;
  quantity: number;
  line_total: number;
};

/** All sold line items (finalized bills only) for top-product ranking. */
export function useDashboardBillItems() {
  return useQuery({
    queryKey: ["dashboard", "bill-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bill_items")
        .select("product_id, product_name_snapshot, quantity, line_total, bills!inner(status)")
        .eq("bills.status", "Finalized");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        product_id: r.product_id,
        product_name_snapshot: r.product_name_snapshot,
        quantity: Number(r.quantity),
        line_total: Number(r.line_total),
      })) as DashBillItem[];
    },
  });
}

export type StockValueRow = {
  product_id: string;
  warehouse_id: string;
  stock_on_hand: number;
};

/** Per-warehouse stock rows joined with product costing info. */
export function useDashboardStock() {
  return useQuery({
    queryKey: ["dashboard", "stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_stock")
        .select("product_id, warehouse_id, stock_on_hand");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        product_id: r.product_id,
        warehouse_id: r.warehouse_id,
        stock_on_hand: Number(r.stock_on_hand),
      })) as StockValueRow[];
    },
  });
}

export type PendingChequeSummary = {
  received: { count: number; amount: number };
  issued: { count: number; amount: number };
};

export function usePendingCheques() {
  return useQuery({
    queryKey: ["dashboard", "pending-cheques"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cheques")
        .select("type, amount")
        .eq("status", "Pending");
      if (error) throw error;
      const summary: PendingChequeSummary = {
        received: { count: 0, amount: 0 },
        issued: { count: 0, amount: 0 },
      };
      for (const c of data ?? []) {
        const bucket = c.type === "Received" ? summary.received : summary.issued;
        bucket.count += 1;
        bucket.amount += Number(c.amount);
      }
      return summary;
    },
  });
}

export type DashExpense = {
  expense_date: string;
  amount: number;
  category: string;
};

/** Expenses with their category name, for the dashboard spend widget. */
export function useDashboardExpenses() {
  return useQuery({
    queryKey: ["dashboard", "expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("expense_date, amount, expense_categories(name)");
      if (error) throw error;
      return (data ?? []).map((r) => {
        const row = r as unknown as {
          expense_date: string;
          amount: number;
          expense_categories: { name: string } | null;
        };
        return {
          expense_date: row.expense_date,
          amount: Number(row.amount),
          category: row.expense_categories?.name ?? "Uncategorised",
        } satisfies DashExpense;
      });
    },
  });
}


export type TrendBucket = { label: string; sales: number; purchases: number };

function startOfWeek(d: Date) {
  const copy = new Date(d);
  const day = (copy.getDay() + 6) % 7; // Monday start
  copy.setDate(copy.getDate() - day);
  return copy;
}

const DAY_FMT = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });
const MONTH_FMT = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" });

export type TrendMode = "daily" | "weekly" | "monthly";

/** Build zero-filled trend buckets and fold sales/purchase totals into them. */
export function buildTrend(
  mode: TrendMode,
  sales: { bill_date: string; total_amount: number }[],
  purchases: { bill_date: string; total_amount: number }[],
): TrendBucket[] {
  const now = new Date();
  const keys: { key: string; label: string }[] = [];

  if (mode === "daily") {
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      keys.push({ key: d.toISOString().slice(0, 10), label: DAY_FMT.format(d) });
    }
  } else if (mode === "weekly") {
    for (let i = 11; i >= 0; i--) {
      const d = startOfWeek(now);
      d.setDate(d.getDate() - i * 7);
      keys.push({ key: d.toISOString().slice(0, 10), label: DAY_FMT.format(d) });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push({ key: d.toISOString().slice(0, 7), label: MONTH_FMT.format(d) });
    }
  }

  const index = new Map(keys.map((k, i) => [k.key, i]));
  const buckets: TrendBucket[] = keys.map((k) => ({ label: k.label, sales: 0, purchases: 0 }));

  const keyFor = (dateStr: string) => {
    if (mode === "monthly") return dateStr.slice(0, 7);
    if (mode === "daily") return dateStr.slice(0, 10);
    return startOfWeek(new Date(dateStr)).toISOString().slice(0, 10);
  };

  const fold = (rows: { bill_date: string; total_amount: number }[], field: "sales" | "purchases") => {
    for (const r of rows) {
      const i = index.get(keyFor(r.bill_date));
      if (i === undefined) continue;
      buckets[i]![field] += Number(r.total_amount);
    }
  };

  fold(sales, "sales");
  fold(purchases, "purchases");
  return buckets;
}
