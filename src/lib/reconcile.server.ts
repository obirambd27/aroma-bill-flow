/**
 * Server-side payment reconciliation.
 *
 * Single source of truth for "is the money on this bill consistent?":
 *  - allocations may never exceed the bill total
 *  - bills.amount_paid must equal the sum of its allocations
 *  - payments_received.amount must equal the sum of its allocations
 *  - every non-counter payment must have a matching cash/bank ledger pair
 *
 * All helpers take an authenticated Supabase client (RLS applies as the user).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

const EPS = 0.005;
const COUNTER_PAYMENT_NOTE = "Counter payment at billing";

function round2(v: number) {
  return Math.round((Number(v) + Number.EPSILON) * 100) / 100;
}

function statusFor(paid: number, total: number) {
  if (paid <= EPS) return "Unpaid";
  if (paid + EPS >= total) return "Paid";
  return "Partial";
}

/** Reads every row of a table in pages so the 1000-row API cap never truncates a scan. */
async function fetchAllRows<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const out: T[] = [];
  const size = 1000;
  for (let page = 0; page < 60; page += 1) {
    const { data, error } = await run(page * size, page * size + size - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}

async function accountIdByName(supabase: Client, name: string) {
  const { data } = await supabase.from("accounts").select("id").eq("name", name).maybeSingle();
  return data?.id ?? null;
}

/** Rewrites the cash/bank + receivable ledger pair for one payment. */
async function repostPaymentLedger(
  supabase: Client,
  payment: { id: string; account_id: string | null; payment_date: string; amount: number },
  billId: string | null,
  description: string,
) {
  await supabase.from("ledger_entries").delete().eq("related_payment_id", payment.id);
  if (!payment.account_id || payment.amount <= EPS) return;

  await supabase.from("ledger_entries").insert({
    account_id: payment.account_id,
    entry_date: payment.payment_date,
    entry_type: "Sale Payment",
    amount: payment.amount,
    related_bill_id: billId,
    related_payment_id: payment.id,
    description,
  });

  const arId = await accountIdByName(supabase, "Accounts Receivable");
  if (arId) {
    await supabase.from("ledger_entries").insert({
      account_id: arId,
      entry_date: payment.payment_date,
      entry_type: "Sale Payment",
      amount: -payment.amount,
      related_bill_id: billId,
      related_payment_id: payment.id,
      description: `Receivable settled — ${description}`,
    });
  }
}

export type ReconcileResult = {
  ok: boolean;
  billNumber: string | null;
  total: number;
  paidBefore: number;
  paidAfter: number;
  allocationsTrimmed: number;
  paymentsAdjusted: number;
  paymentsRemoved: number;
  ledgerReposted: number;
  changed: boolean;
  message: string;
};

/**
 * Repairs one bill end to end: trims over-allocated money oldest first, shrinks
 * or deletes the affected payments, realigns `amount_paid` / payment status and
 * rewrites the ledger effect for every payment still attached to the bill.
 */
export async function reconcileBill(supabase: Client, billId: string): Promise<ReconcileResult> {
  const { data: bill, error } = await supabase
    .from("bills")
    .select("id, bill_number, total_amount, amount_paid, status, payment_method")
    .eq("id", billId)
    .maybeSingle();
  if (error) throw error;
  if (!bill) throw new Error("Bill not found");

  const total = round2(Number(bill.total_amount) || 0);
  const paidBefore = round2(Number(bill.amount_paid) || 0);

  const { data: allocData, error: allocError } = await supabase
    .from("payment_allocations")
    .select("id, amount_allocated, payment_id, created_at, payments_received(*)")
    .eq("bill_id", billId)
    .order("created_at", { ascending: true });
  if (allocError) throw allocError;

  const rows = (allocData ?? []) as unknown as {
    id: string;
    amount_allocated: number;
    payment_id: string;
    payments_received: {
      id: string;
      amount: number;
      account_id: string | null;
      payment_date: string;
      notes: string | null;
    } | null;
  }[];

  let running = 0;
  let allocationsTrimmed = 0;
  let paymentsAdjusted = 0;
  let paymentsRemoved = 0;
  let ledgerReposted = 0;
  let counterTotal = 0;
  let counterAccount: string | null = null;
  let counterDate: string | null = null;

  for (const row of rows) {
    const current = round2(Number(row.amount_allocated) || 0);
    const allowed = round2(Math.max(Math.min(current, round2(total - running)), 0));
    const payment = row.payments_received;
    const isCounter = payment?.notes === COUNTER_PAYMENT_NOTE;

    if (Math.abs(allowed - current) > EPS) {
      allocationsTrimmed += 1;
      if (allowed <= EPS) {
        await supabase.from("payment_allocations").delete().eq("id", row.id);
      } else {
        await supabase
          .from("payment_allocations")
          .update({ amount_allocated: allowed })
          .eq("id", row.id);
      }
    }

    running = round2(running + allowed);

    if (!payment) continue;

    // A payment may be spread over several bills — only its share here changed.
    const delta = round2(allowed - current);
    const nextAmount = round2(Math.max(Number(payment.amount) + delta, 0));

    if (nextAmount <= EPS) {
      await supabase.from("ledger_entries").delete().eq("related_payment_id", payment.id);
      await supabase.from("payment_allocations").delete().eq("payment_id", payment.id);
      await supabase.from("payments_received").delete().eq("id", payment.id);
      paymentsRemoved += 1;
      continue;
    }

    if (Math.abs(nextAmount - Number(payment.amount)) > EPS) {
      await supabase.from("payments_received").update({ amount: nextAmount }).eq("id", payment.id);
      paymentsAdjusted += 1;
    }

    if (isCounter) {
      counterTotal = round2(counterTotal + allowed);
      counterAccount = counterAccount ?? payment.account_id;
      counterDate = counterDate ?? payment.payment_date;
      continue;
    }

    await repostPaymentLedger(
      supabase,
      {
        id: payment.id,
        account_id: payment.account_id,
        payment_date: payment.payment_date,
        amount: nextAmount,
      },
      billId,
      `Payment for ${bill.bill_number ?? "bill"} (reconciled)`,
    );
    ledgerReposted += 1;
  }

  // Money taken at the counter lives on a bill-owned ledger entry, not a payment-owned one.
  const { data: counterEntries } = await supabase
    .from("ledger_entries")
    .select("id, amount, account_id, entry_date")
    .eq("related_bill_id", billId)
    .eq("entry_type", "Sale Payment")
    .is("related_payment_id", null);

  const bookedCounter = round2(
    (counterEntries ?? []).reduce((s, e) => s + (Number(e.amount) || 0), 0),
  );
  if (Math.abs(bookedCounter - counterTotal) > EPS) {
    await supabase
      .from("ledger_entries")
      .delete()
      .eq("related_bill_id", billId)
      .eq("entry_type", "Sale Payment")
      .is("related_payment_id", null);
    const account = counterAccount ?? counterEntries?.[0]?.account_id ?? null;
    if (counterTotal > EPS && account) {
      await supabase.from("ledger_entries").insert({
        account_id: account,
        entry_date: counterDate ?? counterEntries?.[0]?.entry_date ?? new Date().toISOString().slice(0, 10),
        entry_type: "Sale Payment",
        amount: counterTotal,
        related_bill_id: billId,
        description: `Counter payment for ${bill.bill_number ?? "bill"} (reconciled)`,
      });
    }
    ledgerReposted += 1;
  }

  const paidAfter = round2(Math.min(running, total));
  if (Math.abs(paidAfter - paidBefore) > EPS) {
    await supabase
      .from("bills")
      .update({ amount_paid: paidAfter, payment_status: statusFor(paidAfter, total) })
      .eq("id", billId);
  }

  const changed =
    allocationsTrimmed + paymentsAdjusted + paymentsRemoved + ledgerReposted > 0 ||
    Math.abs(paidAfter - paidBefore) > EPS;

  return {
    ok: true,
    billNumber: bill.bill_number,
    total,
    paidBefore,
    paidAfter,
    allocationsTrimmed,
    paymentsAdjusted,
    paymentsRemoved,
    ledgerReposted,
    changed,
    message: changed
      ? `Reconciled — payments now total ${paidAfter.toFixed(2)} against a ${total.toFixed(2)} invoice.`
      : "Already in sync — nothing needed fixing.",
  };
}

/**
 * Guard used before a paid invoice is saved: refuses the save when the money
 * already recorded against the bill (or the amount being entered) would exceed
 * the invoice total.
 */
export async function validateBillPayment(
  supabase: Client,
  input: { billId?: string | null | undefined; totalAmount: number; amountPaid: number },
) {
  const total = round2(Number(input.totalAmount) || 0);
  const paid = round2(Number(input.amountPaid) || 0);
  const errors: string[] = [];

  if (paid < -EPS) errors.push("Amount paid cannot be negative.");
  if (paid - total > EPS) {
    errors.push(
      `Amount paid (${paid.toFixed(2)}) is more than the invoice total (${total.toFixed(2)}).`,
    );
  }

  if (input.billId) {
    const { data } = await supabase
      .from("payment_allocations")
      .select("amount_allocated, payments_received(notes)")
      .eq("bill_id", input.billId);

    const rows = (data ?? []) as unknown as {
      amount_allocated: number;
      payments_received: { notes: string | null } | null;
    }[];

    // Counter money is replaced on every save; only later collections are additive.
    const recorded = round2(
      rows
        .filter((r) => r.payments_received?.notes !== COUNTER_PAYMENT_NOTE)
        .reduce((s, r) => s + (Number(r.amount_allocated) || 0), 0),
    );

    if (recorded - total > EPS) {
      errors.push(
        `Payments already recorded against this invoice (${recorded.toFixed(2)}) exceed the new total (${total.toFixed(2)}). Reconcile the bill first.`,
      );
    }
    if (paid + EPS < recorded) {
      errors.push(
        `This invoice already has ${recorded.toFixed(2)} collected on the Payments page — the paid amount cannot be lower.`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

export type SyncIssue = {
  kind: "bill_overpaid" | "bill_mismatch" | "payment_mismatch" | "ledger_mismatch";
  billId: string | null;
  paymentId: string | null;
  label: string;
  detail: string;
  expected: number;
  actual: number;
};

/** Scans bills, payments and the ledger for money that no longer agrees. */
export async function scanSyncIssues(supabase: Client): Promise<SyncIssue[]> {
  const bills = await fetchAllRows<{
    id: string;
    bill_number: string | null;
    total_amount: number;
    amount_paid: number;
    status: string;
  }>((from, to) =>
    supabase
      .from("bills")
      .select("id, bill_number, total_amount, amount_paid, status")
      .neq("status", "Voided")
      .range(from, to),
  );

  const allocations = await fetchAllRows<{
    bill_id: string;
    payment_id: string;
    amount_allocated: number;
  }>((from, to) =>
    supabase
      .from("payment_allocations")
      .select("bill_id, payment_id, amount_allocated")
      .range(from, to),
  );

  const payments = await fetchAllRows<{
    id: string;
    amount: number;
    account_id: string | null;
    notes: string | null;
  }>((from, to) =>
    supabase.from("payments_received").select("id, amount, account_id, notes").range(from, to),
  );

  const ledger = await fetchAllRows<{ related_payment_id: string | null; amount: number }>(
    (from, to) =>
      supabase
        .from("ledger_entries")
        .select("related_payment_id, amount")
        .not("related_payment_id", "is", null)
        .gt("amount", 0)
        .range(from, to),
  );

  const allocByBill = new Map<string, number>();
  const allocByPayment = new Map<string, number>();
  const billOfPayment = new Map<string, string>();
  for (const a of allocations) {
    const amount = Number(a.amount_allocated) || 0;
    allocByBill.set(a.bill_id, round2((allocByBill.get(a.bill_id) ?? 0) + amount));
    allocByPayment.set(a.payment_id, round2((allocByPayment.get(a.payment_id) ?? 0) + amount));
    if (!billOfPayment.has(a.payment_id)) billOfPayment.set(a.payment_id, a.bill_id);
  }

  const ledgerByPayment = new Map<string, number>();
  for (const e of ledger) {
    if (!e.related_payment_id) continue;
    ledgerByPayment.set(
      e.related_payment_id,
      round2((ledgerByPayment.get(e.related_payment_id) ?? 0) + (Number(e.amount) || 0)),
    );
  }

  const issues: SyncIssue[] = [];

  for (const bill of bills) {
    const total = round2(Number(bill.total_amount) || 0);
    const paid = round2(Number(bill.amount_paid) || 0);
    const allocated = round2(allocByBill.get(bill.id) ?? 0);
    const label = bill.bill_number ?? "Bill";

    if (paid - total > EPS) {
      issues.push({
        kind: "bill_overpaid",
        billId: bill.id,
        paymentId: null,
        label,
        detail: "Payments recorded are more than the invoice total.",
        expected: total,
        actual: paid,
      });
      continue;
    }
    if (allocated - total > EPS) {
      issues.push({
        kind: "bill_overpaid",
        billId: bill.id,
        paymentId: null,
        label,
        detail: "Allocated payments exceed the invoice total.",
        expected: total,
        actual: allocated,
      });
      continue;
    }
    if (Math.abs(allocated - paid) > EPS) {
      issues.push({
        kind: "bill_mismatch",
        billId: bill.id,
        paymentId: null,
        label,
        detail: "Bill History and the Payments page show different amounts.",
        expected: paid,
        actual: allocated,
      });
    }
  }

  for (const payment of payments) {
    const allocated = allocByPayment.get(payment.id);
    const amount = round2(Number(payment.amount) || 0);
    if (allocated !== undefined && Math.abs(allocated - amount) > EPS) {
      issues.push({
        kind: "payment_mismatch",
        billId: billOfPayment.get(payment.id) ?? null,
        paymentId: payment.id,
        label: "Payment",
        detail: "Payment amount does not match what it is applied to.",
        expected: allocated,
        actual: amount,
      });
      continue;
    }
    if (payment.notes === COUNTER_PAYMENT_NOTE || !payment.account_id || amount <= EPS) continue;
    const booked = round2(ledgerByPayment.get(payment.id) ?? 0);
    if (Math.abs(booked - amount) > EPS) {
      issues.push({
        kind: "ledger_mismatch",
        billId: billOfPayment.get(payment.id) ?? null,
        paymentId: payment.id,
        label: "Cash / bank ledger",
        detail: "This collection is missing from (or wrong in) the account balance.",
        expected: amount,
        actual: booked,
      });
    }
  }

  return issues;
}

/** One-click repair for everything `scanSyncIssues` found. */
export async function fixSyncIssues(supabase: Client) {
  const issues = await scanSyncIssues(supabase);
  const billIds = Array.from(new Set(issues.map((i) => i.billId).filter(Boolean) as string[]));

  let repaired = 0;
  for (const billId of billIds) {
    try {
      const result = await reconcileBill(supabase, billId);
      if (result.changed) repaired += 1;
    } catch {
      // Skip a bill that disappeared mid-run; the next scan will report it again.
    }
  }

  // Ledger-only problems on payments that are not tied to a bill.
  for (const issue of issues) {
    if (issue.kind !== "ledger_mismatch" || issue.billId || !issue.paymentId) continue;
    const { data: payment } = await supabase
      .from("payments_received")
      .select("id, amount, account_id, payment_date")
      .eq("id", issue.paymentId)
      .maybeSingle();
    if (!payment) continue;
    await repostPaymentLedger(
      supabase,
      {
        id: payment.id,
        account_id: payment.account_id,
        payment_date: payment.payment_date,
        amount: round2(Number(payment.amount) || 0),
      },
      null,
      "Payment received (reconciled)",
    );
    repaired += 1;
  }

  const remaining = await scanSyncIssues(supabase);
  return { found: issues.length, repaired, remaining: remaining.length };
}
