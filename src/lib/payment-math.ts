/**
 * Pure money helpers for payments and bill balances.
 * No network / React here so the rules stay unit-testable.
 */

export type PaymentStatus = "Unpaid" | "Partial" | "Paid";

export type BillLike = {
  id: string;
  bill_number?: string | null;
  bill_date?: string;
  total_amount: number | string;
  amount_paid: number | string;
};

/** Money tolerance — anything under this is treated as zero. */
export const EPSILON = 0.005;

export function round2(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function derivePaymentStatus(amountPaid: number, total: number): PaymentStatus {
  const paid = Number(amountPaid) || 0;
  const due = Number(total) || 0;
  if (paid <= EPSILON) return "Unpaid";
  if (paid + EPSILON >= due) return "Paid";
  return "Partial";
}

export function billBalance(bill: BillLike) {
  return round2(Math.max(Number(bill.total_amount) - Number(bill.amount_paid), 0));
}

/**
 * Balance recalculation guard: applies a payment delta to a bill and keeps
 * `amount_paid` inside [0, total] so rounding drift or double-submits can never
 * push a bill negative or "more than paid".
 */
export function recalcBillBalance(
  bill: Pick<BillLike, "total_amount" | "amount_paid">,
  delta: number,
) {
  const total = round2(Number(bill.total_amount) || 0);
  const current = Number(bill.amount_paid) || 0;
  const raw = current + (Number(delta) || 0);
  const amountPaid = round2(Math.min(Math.max(raw, 0), total));
  return {
    amountPaid,
    balance: round2(Math.max(total - amountPaid, 0)),
    status: derivePaymentStatus(amountPaid, total),
    clamped: Math.abs(raw - amountPaid) > EPSILON,
  };
}

export type Allocation = { billId: string; amount: number };

/**
 * Spreads `amount` across open bills, oldest first, optionally starting with a
 * specific bill. Never allocates more than a bill's outstanding balance.
 */
export function allocateOldestFirst(
  bills: BillLike[],
  amount: number,
  priorityBillId?: string | null,
): Allocation[] {
  let left = round2(Math.max(Number(amount) || 0, 0));
  if (left <= 0) return [];

  const ordered = [...bills].sort((a, b) => {
    if (priorityBillId) {
      const pa = a.id === priorityBillId ? 0 : 1;
      const pb = b.id === priorityBillId ? 0 : 1;
      if (pa !== pb) return pa - pb;
    }
    return (a.bill_date ?? "").localeCompare(b.bill_date ?? "");
  });

  const out: Allocation[] = [];
  for (const bill of ordered) {
    if (left <= EPSILON) break;
    const take = round2(Math.min(left, billBalance(bill)));
    if (take > 0) {
      out.push({ billId: bill.id, amount: take });
      left = round2(left - take);
    }
  }
  return out;
}

export type PaymentDraft = {
  customerId: string;
  amount: number;
  method: string;
  accountId: string | null;
  paymentDate: string;
  chequeNumber?: string | null;
  allocations: Allocation[];
  bills: BillLike[];
};

/** Full validation of a payment before it is written. Returns a list of problems. */
export function validatePayment(draft: PaymentDraft): string[] {
  const errors: string[] = [];
  const amount = Number(draft.amount);

  if (!draft.customerId) errors.push("Select a customer.");
  if (!Number.isFinite(amount) || amount <= 0) errors.push("Enter a payment amount greater than 0.");
  if (Number.isFinite(amount) && amount > 0 && round2(amount) !== amount) {
    errors.push("Payment amount can have at most 2 decimals.");
  }
  if (draft.method !== "Cheque" && !draft.accountId) {
    errors.push("Select the account the money went into.");
  }
  if (draft.method === "Cheque" && !draft.chequeNumber?.trim()) {
    errors.push("Enter the cheque number.");
  }
  if (draft.paymentDate && draft.paymentDate > new Date().toISOString().slice(0, 10)) {
    errors.push("Payment date cannot be in the future.");
  }

  const byId = new Map(draft.bills.map((b) => [b.id, b]));
  let allocated = 0;
  for (const a of draft.allocations) {
    const bill = byId.get(a.billId);
    const value = Number(a.amount) || 0;
    if (value < 0) {
      errors.push("Allocated amounts cannot be negative.");
      continue;
    }
    allocated = round2(allocated + value);
    if (!bill) {
      if (value > 0) errors.push("An allocated bill is no longer open.");
      continue;
    }
    if (value > billBalance(bill) + EPSILON) {
      errors.push(
        `Allocation exceeds the balance on ${bill.bill_number ?? "a bill"} (${billBalance(bill).toFixed(2)}).`,
      );
    }
  }

  if (Number.isFinite(amount) && amount > 0 && draft.bills.length > 0) {
    const diff = round2(amount - allocated);
    if (diff > EPSILON) errors.push(`${diff.toFixed(2)} of this payment is still unallocated.`);
    if (diff < -EPSILON) {
      errors.push(`Allocations exceed the payment by ${Math.abs(diff).toFixed(2)}.`);
    }
  }

  return errors;
}
