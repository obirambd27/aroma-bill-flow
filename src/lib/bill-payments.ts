/**
 * Per-bill payment breakdown.
 *
 * A bill can be settled in two ways (often both):
 *  1. money taken at billing time  → `bills.amount_paid` minus later allocations,
 *     tagged with `bills.payment_method`
 *  2. payments recorded afterwards → `payment_allocations` joined to
 *     `payments_received.payment_method`
 *
 * Every screen that shows "paid by Cash / Card Payment" must use this so the
 * same money is never counted twice or attributed to the wrong method.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EPSILON, round2 } from "@/lib/payment-math";

/** Maps legacy / free-text method values onto the canonical three. */
export function normalizeMethod(method?: string | null): string | null {
  if (!method) return null;
  const t = String(method).trim().toLowerCase();
  if (!t) return null;
  if (t === "cash" || t === "cash in hand") return "Cash";
  if (
    t === "card" ||
    t === "card payment" ||
    t === "credit card" ||
    t === "creditcard" ||
    t === "debit card"
  ) {
    return "Card Payment";
  }
  if (t === "bank" || t === "bank transfer" || t === "transfer" || t === "online") {
    return "Bank Transfer";
  }
  if (t === "cheque" || t === "check") return "Cheque";
  return String(method).trim();
}

export type AllocationInput = {
  amount: number;
  method?: string | null;
  date?: string | null;
  reference?: string | null;
};

export type PaymentLine = {
  key: string;
  date: string | null;
  method: string;
  amount: number;
  reference: string | null;
  source: "billing" | "payment";
};

export type BillPaymentBreakdown = {
  lines: PaymentLine[];
  byMethod: Record<string, number>;
  /** Only the money taken at billing time, per method. */
  upfrontByMethod: Record<string, number>;
  methods: string[];
  totalPaid: number;
  balanceDue: number;
};

/**
 * Splits a bill's `amount_paid` into method-tagged lines.
 * Allocation totals are clamped to `amount_paid` so a stale allocation can never
 * make the invoice show more paid than the bill records.
 */
export function buildPaymentBreakdown(
  bill: {
    total_amount: number | string;
    amount_paid: number | string | null;
    payment_method?: string | null;
    bill_date?: string | null;
  },
  allocations: AllocationInput[] = [],
): BillPaymentBreakdown {
  const total = round2(Number(bill.total_amount) || 0);
  const totalPaid = round2(Math.min(Math.max(Number(bill.amount_paid) || 0, 0), total));

  const sorted = [...allocations]
    .filter((a) => Number(a.amount) > EPSILON)
    .sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));

  const lines: PaymentLine[] = [];
  let remaining = totalPaid;

  // Money taken when the bill was raised = paid total not covered by allocations.
  const allocated = round2(sorted.reduce((s, a) => s + (Number(a.amount) || 0), 0));
  const upfront = round2(Math.max(totalPaid - allocated, 0));
  if (upfront > EPSILON) {
    lines.push({
      key: "billing",
      date: bill.bill_date ?? null,
      method: normalizeMethod(bill.payment_method) ?? "Cash",
      amount: upfront,
      reference: null,
      source: "billing",
    });
    remaining = round2(remaining - upfront);
  }

  sorted.forEach((a, i) => {
    if (remaining <= EPSILON) return;
    const amount = round2(Math.min(Number(a.amount) || 0, remaining));
    if (amount <= EPSILON) return;
    remaining = round2(remaining - amount);
    lines.push({
      key: `alloc-${i}`,
      date: a.date ?? null,
      method: normalizeMethod(a.method) ?? "Cash",
      amount,
      reference: a.reference ?? null,
      source: "payment",
    });
  });

  const byMethod: Record<string, number> = {};
  const upfrontByMethod: Record<string, number> = {};
  for (const l of lines) {
    byMethod[l.method] = round2((byMethod[l.method] ?? 0) + l.amount);
    if (l.source === "billing") {
      upfrontByMethod[l.method] = round2((upfrontByMethod[l.method] ?? 0) + l.amount);
    }
  }

  return {
    lines,
    byMethod,
    upfrontByMethod,
    methods: Object.keys(byMethod),
    totalPaid,
    balanceDue: round2(Math.max(total - totalPaid, 0)),
  };
}

type AllocRow = {
  bill_id: string;
  amount_allocated: number;
  payments_received: {
    payment_date: string;
    payment_method: string | null;
    reference_number: string | null;
  } | null;
};

async function fetchAllocations(billId?: string) {
  let q = supabase
    .from("payment_allocations")
    .select(
      "bill_id, amount_allocated, payments_received(payment_date, payment_method, reference_number)",
    );
  if (billId) q = q.eq("bill_id", billId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as AllocRow[];
}

function toInputs(rows: AllocRow[]): AllocationInput[] {
  return rows.map((r) => ({
    amount: Number(r.amount_allocated),
    method: r.payments_received?.payment_method ?? null,
    date: r.payments_received?.payment_date ?? null,
    reference: r.payments_received?.reference_number ?? null,
  }));
}

/** Allocations applied to one bill, ready for `buildPaymentBreakdown`. */
export function useBillAllocations(billId: string) {
  return useQuery({
    queryKey: ["bill-allocations", billId],
    queryFn: async () => toInputs(await fetchAllocations(billId)),
    enabled: Boolean(billId),
  });
}

/** bill id → allocations, for list screens that need every bill's methods. */
export function useAllBillAllocations() {
  return useQuery({
    queryKey: ["bill-allocations", "all"],
    queryFn: async () => {
      const rows = await fetchAllocations();
      const map: Record<string, AllocationInput[]> = {};
      for (const r of rows) {
        (map[r.bill_id] ??= []).push(...toInputs([r]));
      }
      return map;
    },
  });
}
