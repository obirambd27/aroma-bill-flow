import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { Bill } from "@/lib/data";
import { derivePaymentStatus, recalcBillBalance, round2 } from "@/lib/payment-math";

export type PaymentReceived = Tables<"payments_received">;
export type PaymentAllocation = Tables<"payment_allocations">;


export const PAYMENT_METHODS = ["Cash", "Card Payment", "Bank Transfer"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Badge tone used wherever a payment method is displayed as a tag. */
export const PAYMENT_METHOD_TONE: Record<string, "success" | "accent" | "warning" | "neutral"> = {
  Cash: "success",
  "Card Payment": "accent",
  "Credit Card": "accent",
  "Bank Transfer": "warning",
};

/**
 * Cash always lands in "Cash in Hand"; card/bank payments may pick any bank
 * (or cash) account the business holds.
 */
export function accountsForMethod<T extends { name: string; account_type: string }>(
  method: PaymentMethod,
  accounts: T[],
) {
  const cashBank = accounts.filter(
    (a) => a.account_type === "Cash" || a.account_type === "Bank",
  );
  if (method === "Cash") {
    const cash = cashBank.filter((a) => a.account_type === "Cash");
    const preferred = cash.filter((a) => a.name === "Cash in Hand");
    return preferred.length > 0 ? preferred : cash.length > 0 ? cash : cashBank;
  }
  const banks = cashBank.filter((a) => a.account_type === "Bank");
  return banks.length > 0 ? banks : cashBank;
}

export { derivePaymentStatus };


/** Resolve a system account id by its name (e.g. "Sales Revenue"). */
export async function accountIdByName(name: string) {
  const { data } = await supabase.from("accounts").select("id").eq("name", name).maybeSingle();
  return data?.id ?? null;
}

/**
 * Guard rail: a bill may only ever hold ONE counter Sale Payment ledger entry.
 * Any existing bill-owned Sale Payment row is removed first (its balance effect
 * unwinds through the delete trigger), so editing a bill corrects the payment
 * instead of stacking a second one on top of it.
 */
export async function postSalePaymentEntry(entry: {
  billId: string;
  accountId: string;
  entryDate: string;
  amount: number;
  description: string;
}) {
  const { error: delError } = await supabase
    .from("ledger_entries")
    .delete()
    .eq("related_bill_id", entry.billId)
    .eq("entry_type", "Sale Payment")
    .is("related_payment_id", null);
  if (delError) throw delError;
  if (entry.amount <= 0.001) return;
  const { error } = await supabase.from("ledger_entries").insert({
    account_id: entry.accountId,
    entry_date: entry.entryDate,
    entry_type: "Sale Payment",
    amount: entry.amount,
    related_bill_id: entry.billId,
    description: entry.description,
  });
  if (error) throw error;
}

export type PaymentRow = PaymentReceived & {
  customers: { name: string } | null;
  accounts: { name: string } | null;
  payment_allocations: (PaymentAllocation & { bills: { bill_number: string | null } | null })[];
};

export function usePaymentsReceived() {
  return useQuery({
    queryKey: ["payments-received"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments_received")
        .select(
          "*, customers(name), accounts(name), payment_allocations(*, bills(bill_number))",
        )
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as PaymentRow[];
    },
  });
}

export function useCustomerPaymentsReceived(customerId: string) {
  return useQuery({
    queryKey: ["payments-received", "customer", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments_received")
        .select("*, accounts(name), payment_allocations(*, bills(bill_number))")
        .eq("customer_id", customerId)
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return data as unknown as PaymentRow[];
    },
    enabled: Boolean(customerId),
  });
}

/** Finalized bills for a customer that still have a balance due. */
export function useCustomerOpenBills(customerId: string | null) {
  return useQuery({
    queryKey: ["customer-open-bills", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select("*")
        .eq("customer_id", customerId!)
        .eq("status", "Finalized")
        .neq("payment_status", "Paid")
        .order("bill_date", { ascending: true });
      if (error) throw error;
      return (data as Bill[]).filter(
        (b) => Number(b.total_amount) - Number(b.amount_paid) > 0.001,
      );
    },
    enabled: Boolean(customerId),
  });
}

/** Last unit price a product was sold to a customer on a finalized bill. */
export function useCustomerLastPrices(customerId: string | null) {
  return useQuery({
    queryKey: ["customer-last-prices", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bill_items")
        .select("product_id, unit_price, bills!inner(bill_date, status, customer_id)")
        .eq("bills.customer_id", customerId!)
        .eq("bills.status", "Finalized");
      if (error) throw error;
      const map: Record<string, { price: number; date: string }> = {};
      for (const row of (data ?? []) as unknown as {
        product_id: string | null;
        unit_price: number;
        bills: { bill_date: string } | null;
      }[]) {
        if (!row.product_id || !row.bills) continue;
        const prev = map[row.product_id];
        if (!prev || prev.date < row.bills.bill_date) {
          map[row.product_id] = { price: Number(row.unit_price), date: row.bills.bill_date };
        }
      }
      return map;
    },
    enabled: Boolean(customerId),
  });
}

export type RecordPaymentInput = {
  customerId: string;
  customerName: string;
  paymentDate: string;
  amount: number;
  method: PaymentMethod;
  accountId: string | null;
  referenceNumber: string | null;
  notes: string | null;
  chequeNumber?: string | null;
  chequeDate?: string | null;
  allocations: { billId: string; billNumber: string | null; amount: number }[];
};

/**
 * Records a payment against already-finalized bills: allocations, bill balances,
 * and the matching ledger (or cheque) effect.
 */
export async function recordPayment(input: RecordPaymentInput) {
  const { data: payment, error } = await supabase
    .from("payments_received")
    .insert({
      customer_id: input.customerId,
      payment_date: input.paymentDate,
      amount: input.amount,
      payment_method: input.method,
      account_id: input.accountId,
      reference_number: input.referenceNumber,
      notes: input.notes,
    })
    .select()
    .single();
  if (error || !payment) throw error ?? new Error("Could not save the payment");

  // Clamp every allocation to the bill's live outstanding balance so a stale
  // screen can never allocate more money to a bill than it still owes.
  const allocations: { billId: string; billNumber: string | null; amount: number }[] = [];
  for (const a of input.allocations.filter((x) => x.amount > 0)) {
    const { data: bill } = await supabase
      .from("bills")
      .select("total_amount, amount_paid")
      .eq("id", a.billId)
      .maybeSingle();
    if (!bill) continue;
    const balance = round2(
      Math.max(Number(bill.total_amount) - Number(bill.amount_paid), 0),
    );
    const amount = round2(Math.min(a.amount, balance));
    if (amount <= 0.005) continue;
    allocations.push({ ...a, amount });

    const next = recalcBillBalance(bill, amount);
    await supabase
      .from("bills")
      .update({ amount_paid: next.amountPaid, payment_status: next.status })
      .eq("id", a.billId);
  }

  if (allocations.length > 0) {
    const { error: allocError } = await supabase.from("payment_allocations").insert(
      allocations.map((a) => ({
        payment_id: payment.id,
        bill_id: a.billId,
        amount_allocated: a.amount,
      })),
    );
    if (allocError) throw allocError;
  }



  const billLabel = allocations
    .map((a) => a.billNumber)
    .filter(Boolean)
    .join(", ");

  await postPaymentLedger({
    paymentId: payment.id,
    accountId: input.accountId,
    entryDate: input.paymentDate,
    amount: input.amount,
    billId: allocations[0]?.billId ?? null,
    receivedDescription: `Payment from ${input.customerName}${billLabel ? ` · ${billLabel}` : ""}`,
    receivableDescription: `Receivable settled by ${input.customerName}`,
  });

  return payment;
}

/**
 * Writes the cash/bank + receivable ledger pair for a collection. Any existing
 * pair for the same payment is removed first, so re-running it corrects the
 * amounts instead of stacking a second effect on the account balance.
 */
export async function postPaymentLedger(input: {
  paymentId: string;
  accountId: string | null;
  entryDate: string;
  amount: number;
  billId?: string | null;
  receivedDescription: string;
  receivableDescription: string;
}) {
  const { error: delError } = await supabase
    .from("ledger_entries")
    .delete()
    .eq("related_payment_id", input.paymentId);
  if (delError) throw delError;
  if (!input.accountId || input.amount <= 0.001) return;

  const { error } = await supabase.from("ledger_entries").insert({
    account_id: input.accountId,
    entry_date: input.entryDate,
    entry_type: "Sale Payment",
    amount: input.amount,
    related_bill_id: input.billId ?? null,
    related_payment_id: input.paymentId,
    description: input.receivedDescription,
  });
  if (error) throw error;

  const arId = await accountIdByName("Accounts Receivable");
  if (arId) {
    const { error: arError } = await supabase.from("ledger_entries").insert({
      account_id: arId,
      entry_date: input.entryDate,
      entry_type: "Sale Payment",
      amount: -input.amount,
      related_bill_id: input.billId ?? null,
      related_payment_id: input.paymentId,
      description: input.receivableDescription,
    });
    if (arError) throw arError;
  }
}

/**
 * Keeps money collected against a bill in step with the bill total after an
 * edit (e.g. a discount lowers the invoice). Allocations are trimmed oldest
 * first, and each affected payment — plus its ledger effect — is reduced or
 * removed so a bill can never hold more money than it is worth.
 *
 * Returns the amount that remains allocated to the bill.
 */
export async function reconcileBillPayments(billId: string, billTotal: number) {
  const { data } = await supabase
    .from("payment_allocations")
    .select("id, amount_allocated, payment_id, created_at, payments_received(*)")
    .eq("bill_id", billId)
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as unknown as {
    id: string;
    amount_allocated: number;
    payment_id: string;
    payments_received: PaymentReceived | null;
  }[];

  let running = 0;
  for (const row of rows) {
    const current = Number(row.amount_allocated) || 0;
    const allowed = round2(Math.max(Math.min(current, round2(billTotal - running)), 0));
    running = round2(running + allowed);
    if (Math.abs(allowed - current) < 0.005) continue;

    const payment = row.payments_received;
    const delta = round2(allowed - current);
    const nextPaymentAmount = payment ? round2(Number(payment.amount) + delta) : 0;

    if (allowed <= 0.005) {
      await supabase.from("payment_allocations").delete().eq("id", row.id);
    } else {
      await supabase
        .from("payment_allocations")
        .update({ amount_allocated: allowed })
        .eq("id", row.id);
    }

    if (!payment) continue;

    if (nextPaymentAmount <= 0.005) {
      await supabase.from("ledger_entries").delete().eq("related_payment_id", payment.id);
      await supabase.from("payment_allocations").delete().eq("payment_id", payment.id);
      await supabase.from("payments_received").delete().eq("id", payment.id);
      continue;
    }

    await supabase
      .from("payments_received")
      .update({ amount: nextPaymentAmount })
      .eq("id", payment.id);

    if (payment.notes !== COUNTER_PAYMENT_NOTE) {
      await postPaymentLedger({
        paymentId: payment.id,
        accountId: payment.account_id,
        entryDate: payment.payment_date,
        amount: nextPaymentAmount,
        billId,
        receivedDescription: "Payment received (adjusted after bill edit)",
        receivableDescription: "Receivable settled (adjusted after bill edit)",
      });
    }
  }

  return running;
}


/** Marker stored on payments created from the billing screen itself. */
export const COUNTER_PAYMENT_NOTE = "Counter payment at billing";

export type CounterPaymentInput = {
  billId: string;
  customerId: string | null;
  paymentDate: string;
  amount: number;
  method: PaymentMethod | string;
  accountId: string | null;
  referenceNumber: string | null;
};

/**
 * Mirrors money taken on the New Bill screen into `payments_received` so the
 * Payments page, day book and reports see it like any other collection.
 *
 * It does NOT touch `bills.amount_paid` or the ledger — the billing screen
 * already writes those. Re-running it replaces the previous counter payment
 * for the same bill (used when a bill is edited).
 */
export async function syncCounterPayment(input: CounterPaymentInput) {
  const { data: existing } = await supabase
    .from("payment_allocations")
    .select("payment_id, amount_allocated, payments_received(notes)")
    .eq("bill_id", input.billId);

  const rows = (existing ?? []) as unknown as {
    payment_id: string;
    amount_allocated: number;
    payments_received: { notes: string | null } | null;
  }[];

  const staleIds = rows
    .filter((r) => r.payments_received?.notes === COUNTER_PAYMENT_NOTE)
    .map((r) => r.payment_id);

  // Money already collected through the Payments Received screen for this bill.
  // It is part of `bills.amount_paid`, so the counter mirror must not repeat it,
  // otherwise editing a bill shows the same money twice on the Payments page.
  const alreadyRecorded = round2(
    rows
      .filter((r) => r.payments_received?.notes !== COUNTER_PAYMENT_NOTE)
      .reduce((s, r) => s + (Number(r.amount_allocated) || 0), 0),
  );

  if (staleIds.length > 0) {
    await supabase.from("payment_allocations").delete().in("payment_id", staleIds);
    await supabase.from("payments_received").delete().in("id", staleIds);
  }

  const counterAmount = round2(Math.max((Number(input.amount) || 0) - alreadyRecorded, 0));
  if (counterAmount <= 0.001) return null;


  const { data: payment, error } = await supabase
    .from("payments_received")
    .insert({
      customer_id: input.customerId,
      payment_date: input.paymentDate,
      amount: counterAmount,
      payment_method: input.method,
      account_id: input.accountId,
      reference_number: input.referenceNumber,
      notes: COUNTER_PAYMENT_NOTE,
    })
    .select()
    .single();
  if (error || !payment) throw error ?? new Error("Could not log the counter payment");

  await supabase.from("payment_allocations").insert({
    payment_id: payment.id,
    bill_id: input.billId,
    amount_allocated: counterAmount,
  });

  return payment;
}

/**
 * Reverses a collection through the atomic `delete_payment_received` routine:
 * bill balances, statuses, ledger effect and uncleared cheques are all undone,
 * and the event is written to the deletion log.
 */
export async function deletePaymentReceived(paymentId: string, reason: string | null) {
  const { data, error } = await supabase.rpc("delete_payment_received", {
    p_payment_id: paymentId,
    ...(reason ? { p_reason: reason } : {}),
  });

  if (error) throw error;
  const result = data as { ok: boolean; error?: string; bill_number?: string } | null;
  if (!result?.ok) {
    if (result?.error === "negative_balance") {
      throw new Error(
        `Reversing this payment would leave bill ${result.bill_number ?? ""} with a negative balance.`.trim(),
      );
    }
    if (result?.error === "not_found") throw new Error("This payment no longer exists.");
    throw new Error("Could not reverse this payment.");
  }
  return result;
}

/** Mutation wrapper that refreshes every screen touched by a reversal. */
export function useDeletePaymentReceived() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { paymentId: string; reason: string | null }) =>
      deletePaymentReceived(input.paymentId, input.reason),
    onSuccess: () => {
      for (const key of [
        "payments-received",
        "bills",
        "bill",
        "accounts",
        "account-statement",
        "ledger-entries",
        "customer-open-bills",
        "customer-totals",
        "cheques",
        "day-book",
        "dashboard",
        "reconciliation",
        "owner-report",
      ]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
