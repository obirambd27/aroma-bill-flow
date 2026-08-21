/**
 * Owner Snapshot Report — one query hook that assembles every section of the
 * daily/weekly/monthly business summary.
 *
 * Each section is computed independently: if one calculation fails (bad cost
 * price, connectivity blip on accounts…) that section resolves to `null`
 * ("Unable to calculate") while the rest of the report still renders.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { buildPaymentBreakdown, normalizeMethod, type AllocationInput } from "@/lib/bill-payments";
import { agingBucket, type AgingBucket } from "@/lib/collections";
import { PAYMENT_METHODS } from "@/lib/payments";

export type OwnerPeriod = "daily" | "weekly" | "monthly" | "custom";

const iso = (d: Date) => {
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
};

export function ownerPeriodRange(p: OwnerPeriod): { from: string; to: string } {
  const now = new Date();
  const today = iso(now);
  if (p === "weekly") {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return { from: iso(d), to: today };
  }
  if (p === "monthly") {
    return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  }
  return { from: today, to: today };
}

export function periodLabel(p: OwnerPeriod) {
  if (p === "daily") return "Daily Business Report";
  if (p === "weekly") return "Weekly Business Report";
  if (p === "monthly") return "Monthly Business Report";
  return "Business Report";
}

const dayMs = 86_400_000;
const shift = (date: string, delta: number) => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return iso(d);
};

/** Same-length window immediately before the selected range. */
export function previousRange(range: { from: string; to: string }) {
  const days =
    Math.round(
      (new Date(`${range.to}T00:00:00`).getTime() - new Date(`${range.from}T00:00:00`).getTime()) /
        dayMs,
    ) + 1;
  return { from: shift(range.from, -days), to: shift(range.from, -1) };
}

function chunk<T>(items: T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/* ---------- section types ---------- */

export type SalesSection = {
  totalSell: number;
  totalPaid: number;
  byMethod: Record<string, number>;
  billCount: number;
  averageBill: number;
  tax: number;
  discount: number;
};

export type OutstandingRow = {
  customerId: string | null;
  name: string;
  phone: string | null;
  amount: number;
  oldestDate: string | null;
  bucket: AgingBucket;
};

export type ProductProfitRow = {
  name: string;
  qty: number;
  revenue: number;
  cost: number;
  profit: number | null;
  margin: number | null;
  missingCost: boolean;
};

export type CollectedPrevious = {
  total: number;
  byMethod: Record<string, number>;
  uncategorized: number;
  orphaned: number;
};

export type OwnerReportData = {
  range: { from: string; to: string };
  periodType: OwnerPeriod;
  generatedAt: string;
  sales: SalesSection | null;
  prevSales: { totalSell: number; totalPaid: number; hasData: boolean } | null;
  outstanding: { rows: OutstandingRow[]; total: number } | null;
  purchases: number | null;
  expenses: number | null;
  cogs: number | null;
  netProfit: number | null;
  prevNetProfit: number | null;
  collectedPrevious: CollectedPrevious | null;
  customerActivity: { newCustomers: number; returning: number } | null;
  productProfit: ProductProfitRow[] | null;
  hasMissingCost: boolean;
  lowStock: { count: number; names: string[] } | null;
};


/* ---------- primitives ---------- */

type BillLite = {
  id: string;
  customer_id: string | null;
  total_amount: number;
  amount_paid: number;
  tax_amount: number;
  discount_amount: number;
  payment_method: string | null;
  bill_date: string;
};

async function finalizedBills(range: { from: string; to: string }) {
  return fetchAll<BillLite>((f, t) =>
    supabase
      .from("bills")
      .select(
        "id, customer_id, total_amount, amount_paid, tax_amount, discount_amount, payment_method, bill_date",
      )
      .eq("status", "Finalized")
      .gte("bill_date", range.from)
      .lte("bill_date", range.to)
      .range(f, t),
  );
}

async function allocationsFor(billIds: string[]) {
  const map: Record<string, AllocationInput[]> = {};
  for (const ids of chunk(billIds)) {
    const { data, error } = await supabase
      .from("payment_allocations")
      .select("bill_id, amount_allocated, payments_received(payment_date, payment_method)")
      .in("bill_id", ids);
    if (error) throw error;
    for (const a of (data ?? []) as unknown as {
      bill_id: string;
      amount_allocated: number;
      payments_received: { payment_date: string; payment_method: string | null } | null;
    }[]) {
      (map[a.bill_id] ??= []).push({
        amount: Number(a.amount_allocated),
        method: a.payments_received?.payment_method ?? null,
        date: a.payments_received?.payment_date ?? null,
      });
    }
  }
  return map;
}

async function salesSection(bills: BillLite[]): Promise<SalesSection> {
  const allocs = await allocationsFor(bills.map((b) => b.id));
  const byMethod: Record<string, number> = {};
  for (const m of PAYMENT_METHODS) byMethod[m] = 0;
  let totalSell = 0;
  let totalPaid = 0;
  let tax = 0;
  let discount = 0;
  for (const b of bills) {
    totalSell += Number(b.total_amount ?? 0);
    tax += Number(b.tax_amount ?? 0);
    discount += Number(b.discount_amount ?? 0);
    const breakdown = buildPaymentBreakdown(
      {
        total_amount: Number(b.total_amount ?? 0),
        amount_paid: Number(b.amount_paid ?? 0),
        payment_method: b.payment_method,
        bill_date: b.bill_date,
      },
      allocs[b.id] ?? [],
    );
    totalPaid += breakdown.totalPaid;
    for (const [m, v] of Object.entries(breakdown.byMethod)) {
      byMethod[m] = (byMethod[m] ?? 0) + v;
    }
  }
  return {
    totalSell,
    totalPaid,
    byMethod,
    billCount: bills.length,
    averageBill: bills.length ? totalSell / bills.length : 0,
    tax,
    discount,
  };
}

async function outstandingSection() {
  const bills = await fetchAll<{
    id: string;
    customer_id: string | null;
    bill_date: string;
    total_amount: number;
    amount_paid: number;
    customers: { name: string; phone: string | null } | null;
  }>((f, t) =>
    supabase
      .from("bills")
      .select("id, customer_id, bill_date, total_amount, amount_paid, customers(name, phone)")
      .eq("status", "Finalized")
      .in("payment_status", ["Partial", "Unpaid"])
      .range(f, t) as never,
  );
  const grouped = new Map<string, OutstandingRow>();
  for (const b of bills) {
    const due = Number(b.total_amount ?? 0) - Number(b.amount_paid ?? 0);
    if (due <= 0.01) continue;
    const key = b.customer_id ?? "walk-in";
    const existing = grouped.get(key);
    if (existing) {
      existing.amount += due;
      if (!existing.oldestDate || b.bill_date < existing.oldestDate) existing.oldestDate = b.bill_date;
    } else {
      grouped.set(key, {
        customerId: b.customer_id,
        name: b.customers?.name ?? "Walk-in Customer",
        phone: b.customers?.phone ?? null,
        amount: due,
        oldestDate: b.bill_date,
        bucket: "unknown",
      });
    }
  }
  const rows = [...grouped.values()].map((r) => ({ ...r, bucket: agingBucket(r.oldestDate) }));
  rows.sort((a, b) => (a.oldestDate ?? "9999").localeCompare(b.oldestDate ?? "9999"));
  return { rows, total: rows.reduce((s, r) => s + r.amount, 0) };
}

async function sumPurchases(range: { from: string; to: string }) {
  const rows = await fetchAll<{ total_amount: number }>((f, t) =>
    supabase
      .from("purchase_bills")
      .select("total_amount")
      .neq("status", "Cancelled")
      .gte("bill_date", range.from)
      .lte("bill_date", range.to)
      .range(f, t),
  );
  return rows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
}

async function sumExpenses(range: { from: string; to: string }) {
  const rows = await fetchAll<{ amount: number }>((f, t) =>
    supabase
      .from("expenses")
      .select("amount")
      .gte("expense_date", range.from)
      .lte("expense_date", range.to)
      .range(f, t),
  );
  return rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
}


async function billItemsFor(billIds: string[]) {
  const out: {
    product_name_snapshot: string;
    quantity: number;
    line_total: number;
    cost_price_snapshot: number | null;
  }[] = [];
  for (const ids of chunk(billIds)) {
    const rows = await fetchAll<(typeof out)[number]>((f, t) =>
      supabase
        .from("bill_items")
        .select("product_name_snapshot, quantity, line_total, cost_price_snapshot")
        .in("bill_id", ids)
        .range(f, t),
    );
    out.push(...rows);
  }
  return out;
}

/** Lines with no recorded cost snapshot are excluded rather than counted as zero. */
function cogsOf(items: Awaited<ReturnType<typeof billItemsFor>>) {
  let total = 0;
  for (const i of items) {
    if (i.cost_price_snapshot === null || i.cost_price_snapshot === undefined) continue;
    const cost = Number(i.cost_price_snapshot);
    const qty = Number(i.quantity ?? 0);
    if (!Number.isFinite(cost) || !Number.isFinite(qty)) throw new Error("Malformed cost price");
    total += cost * qty;
  }
  return total;
}

function productProfitOf(items: Awaited<ReturnType<typeof billItemsFor>>): ProductProfitRow[] {
  const map = new Map<string, ProductProfitRow>();
  for (const i of items) {
    const key = i.product_name_snapshot || "Unnamed product";
    const row =
      map.get(key) ??
      ({
        name: key,
        qty: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        margin: null,
        missingCost: false,
      } as ProductProfitRow);
    const qty = Number(i.quantity ?? 0);
    row.qty += qty;
    row.revenue += Number(i.line_total ?? 0);
    if (i.cost_price_snapshot === null || i.cost_price_snapshot === undefined) {
      row.missingCost = true;
    } else {
      row.cost += Number(i.cost_price_snapshot) * qty;
    }
    map.set(key, row);
  }
  const rows = [...map.values()].map((r) => {
    const profit = r.revenue - r.cost;
    return {
      ...r,
      profit,
      margin: r.revenue > 0.009 ? (profit / r.revenue) * 100 : null,
    };
  });
  rows.sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0));
  return rows;
}


async function customerActivity(range: { from: string; to: string }, bills: BillLite[]) {
  const { count, error } = await supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .gte("created_at", `${range.from}T00:00:00`)
    .lte("created_at", `${range.to}T23:59:59.999`);
  if (error) throw error;
  const ids = [...new Set(bills.map((b) => b.customer_id).filter(Boolean))] as string[];
  const returning = new Set<string>();
  for (const part of chunk(ids)) {
    const { data, error: e2 } = await supabase
      .from("bills")
      .select("customer_id")
      .eq("status", "Finalized")
      .lt("bill_date", range.from)
      .in("customer_id", part);
    if (e2) throw e2;
    for (const r of data ?? []) if (r.customer_id) returning.add(r.customer_id);
  }
  return { newCustomers: count ?? 0, returning: returning.size };
}

async function lowStockSection(defaultThreshold: number) {
  const products = await fetchAll<{ id: string; name: string; low_stock_threshold: number | null }>(
    (f, t) =>
      supabase
        .from("products")
        .select("id, name, low_stock_threshold")
        .eq("is_active", true)
        .range(f, t),
  );
  const stock = await fetchAll<{ product_id: string; stock_on_hand: number }>((f, t) =>
    supabase.from("product_stock").select("product_id, stock_on_hand").range(f, t),
  );
  const totals: Record<string, number> = {};
  for (const s of stock) totals[s.product_id] = (totals[s.product_id] ?? 0) + Number(s.stock_on_hand);
  const names: string[] = [];
  for (const p of products) {
    const threshold = p.low_stock_threshold ?? defaultThreshold;
    if ((totals[p.id] ?? 0) <= threshold) names.push(p.name);
  }
  names.sort((a, b) => a.localeCompare(b));
  return { count: names.length, names };
}

/**
 * Money received inside the period against bills raised BEFORE the period —
 * i.e. collections clearing old outstanding, not payment on fresh sales.
 * Payments whose bill can't be resolved are excluded (and counted separately).
 */
async function collectedPreviousSection(range: {
  from: string;
  to: string;
}): Promise<CollectedPrevious> {
  const rows = await fetchAll<{
    bill_id: string | null;
    amount_allocated: number;
    payments_received: { payment_date: string; payment_method: string | null } | null;
  }>(
    (f, t) =>
      supabase
        .from("payment_allocations")
        .select("bill_id, amount_allocated, payments_received!inner(payment_date, payment_method)")
        .gte("payments_received.payment_date", range.from)
        .lte("payments_received.payment_date", range.to)
        .range(f, t) as never,
  );

  const billIds = [...new Set(rows.map((r) => r.bill_id).filter(Boolean))] as string[];
  const billDate: Record<string, string> = {};
  for (const ids of chunk(billIds)) {
    const { data, error } = await supabase.from("bills").select("id, bill_date").in("id", ids);
    if (error) throw error;
    for (const b of data ?? []) billDate[b.id] = b.bill_date;
  }

  const byMethod: Record<string, number> = {};
  for (const m of PAYMENT_METHODS) byMethod[m] = 0;
  let total = 0;
  let uncategorized = 0;
  let orphaned = 0;

  for (const r of rows) {
    const amount = Number(r.amount_allocated ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const date = r.bill_id ? billDate[r.bill_id] : undefined;
    if (!date) {
      orphaned += amount;
      continue;
    }
    if (date >= range.from) continue; // paid against a bill from this period → Group A
    total += amount;
    const method = normalizeMethod(r.payments_received?.payment_method);
    if (method && method in byMethod) byMethod[method] = (byMethod[method] ?? 0) + amount;
    else uncategorized += amount;
  }

  if (orphaned > 0) {
    console.warn(
      `[owner-report] Excluded ${orphaned.toFixed(2)} AED of payments with no matching bill.`,
    );
  }
  return { total, byMethod, uncategorized, orphaned };
}

const settle = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
  try {
    return await fn();
  } catch {
    return null;
  }
};

/* ---------- the report ---------- */

export function useOwnerReport(
  range: { from: string; to: string },
  defaultThreshold = 5,
  enabled = true,
  periodType: OwnerPeriod = "custom",
) {
  return useQuery<OwnerReportData>({
    queryKey: ["owner-report", range.from, range.to, periodType],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const prev = previousRange(range);
      const bills = await finalizedBills(range);
      const items = await settle(() => billItemsFor(bills.map((b) => b.id)));

      const [sales, prevBills, outstanding, purchases, expenses, collected, activity, lowStock] =
        await Promise.all([
          settle(() => salesSection(bills)),
          settle(() => finalizedBills(prev)),
          settle(() => outstandingSection()),
          settle(() => sumPurchases(range)),
          settle(() => sumExpenses(range)),
          settle(() => collectedPreviousSection(range)),
          settle(() => customerActivity(range, bills)),
          settle(() => lowStockSection(defaultThreshold)),
        ] as const);

      let prevSales: OwnerReportData["prevSales"] = null;
      let prevNetProfit: number | null = null;
      if (prevBills) {
        const s = await settle(() => salesSection(prevBills));
        if (s) {
          prevSales = {
            totalSell: s.totalSell,
            totalPaid: s.totalPaid,
            hasData: prevBills.length > 0,
          };
          const prevItems = await settle(() => billItemsFor(prevBills.map((b) => b.id)));
          const prevExp = await settle(() => sumExpenses(prev));

          if (prevItems && prevExp !== null && prevBills.length > 0) {
            const c = await settle(async () => cogsOf(prevItems));
            if (c !== null) prevNetProfit = s.totalSell - c - prevExp;
          }
        }
      }

      const cogs = items ? await settle(async () => cogsOf(items)) : null;
      const netProfit =
        sales && cogs !== null && expenses !== null ? sales.totalSell - cogs - expenses : null;
      const productProfit = items ? productProfitOf(items) : null;

      return {
        range,
        periodType,
        generatedAt: new Date().toISOString(),
        sales,
        prevSales,
        outstanding,
        purchases,
        expenses,
        cogs,
        netProfit,
        prevNetProfit,
        collectedPrevious: collected,
        customerActivity: activity,
        productProfit,
        hasMissingCost: (productProfit ?? []).some((p) => p.missingCost),
        lowStock,
      };
    },
  });
}

/** Big right-aligned headline on the report header, driven by the period type. */
export function periodHeadline(
  period: OwnerPeriod,
  range: { from: string; to: string },
): { title: string; sub: string } {
  const d = (v: string) =>
    new Date(`${v}T00:00:00`).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  if (period === "daily") return { title: "DAILY REPORT", sub: d(range.from) };
  if (period === "weekly")
    return {
      title: "WEEKLY REPORT",
      sub: `${new Date(`${range.from}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} – ${d(range.to)}`,
    };
  if (period === "monthly")
    return {
      title: "MONTHLY REPORT",
      sub: new Date(`${range.from}T00:00:00`).toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      }),
    };
  return { title: "CUSTOM REPORT", sub: rangeLabel(range) };
}

/** "Today's Profit" / "This Week's Profit" / … */
export function profitLabel(period: OwnerPeriod) {
  if (period === "daily") return "Today's Profit";
  if (period === "weekly") return "This Week's Profit";
  if (period === "monthly") return "This Month's Profit";
  return "Period Profit";
}

export function collectedLabel(period: OwnerPeriod) {
  if (period === "daily") return "Collected Today (Previous Bills)";
  if (period === "weekly") return "Collected This Week (Previous Bills)";
  if (period === "monthly") return "Collected This Month (Previous Bills)";
  return "Collected in Period (Previous Bills)";
}


/** null when the comparison would be meaningless (no prior data / zero base). */
export function pctChange(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined) return null;
  if (!Number.isFinite(previous) || Math.abs(previous) < 0.01) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function rangeLabel(range: { from: string; to: string }) {
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  return range.from === range.to ? fmt(range.from) : `${fmt(range.from)} – ${fmt(range.to)}`;
}
