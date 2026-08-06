import { describe, expect, it } from "vitest";
import {
  allocateOldestFirst,
  billBalance,
  derivePaymentStatus,
  recalcBillBalance,
  validatePayment,
  type BillLike,
} from "./payment-math";

const bill = (over: Partial<BillLike> & { id: string }): BillLike => ({
  total_amount: 0,
  amount_paid: 0,
  bill_date: "2026-01-01",
  ...over,
});

describe("partial payments", () => {
  it("a 20 payment on a 35 bill leaves 15 due and reads Partial", () => {
    const b = bill({ id: "a", total_amount: 35 });
    const next = recalcBillBalance(b, 20);
    expect(next.amountPaid).toBe(20);
    expect(next.balance).toBe(15);
    expect(next.status).toBe("Partial");
  });

  it("a second payment settling the remainder marks the bill Paid", () => {
    const b = bill({ id: "a", total_amount: 35, amount_paid: 20 });
    const next = recalcBillBalance(b, 15);
    expect(next.amountPaid).toBe(35);
    expect(next.balance).toBe(0);
    expect(next.status).toBe("Paid");
  });

  it("treats cent-level rounding drift as fully paid", () => {
    expect(derivePaymentStatus(34.999, 35)).toBe("Paid");
    expect(derivePaymentStatus(0, 35)).toBe("Unpaid");
    expect(derivePaymentStatus(0.5, 35)).toBe("Partial");
  });
});

describe("balance recalculation guard", () => {
  it("never lets amount paid exceed the bill total", () => {
    const next = recalcBillBalance(bill({ id: "a", total_amount: 35, amount_paid: 30 }), 20);
    expect(next.amountPaid).toBe(35);
    expect(next.balance).toBe(0);
    expect(next.clamped).toBe(true);
  });

  it("never lets amount paid go negative on a reversal", () => {
    const next = recalcBillBalance(bill({ id: "a", total_amount: 35, amount_paid: 10 }), -25);
    expect(next.amountPaid).toBe(0);
    expect(next.status).toBe("Unpaid");
    expect(next.clamped).toBe(true);
  });

  it("rounds to 2 decimals", () => {
    const next = recalcBillBalance(bill({ id: "a", total_amount: 35, amount_paid: 10.005 }), 0.1);
    expect(next.amountPaid).toBe(10.11);
  });

  it("billBalance never returns a negative", () => {
    expect(billBalance(bill({ id: "a", total_amount: 10, amount_paid: 12 }))).toBe(0);
  });
});

describe("allocation", () => {
  const bills = [
    bill({ id: "old", total_amount: 100, amount_paid: 80, bill_date: "2026-01-01" }),
    bill({ id: "new", total_amount: 50, bill_date: "2026-02-01" }),
  ];

  it("fills the oldest bill first", () => {
    expect(allocateOldestFirst(bills, 30)).toEqual([
      { billId: "old", amount: 20 },
      { billId: "new", amount: 10 },
    ]);
  });

  it("honours a priority bill", () => {
    expect(allocateOldestFirst(bills, 30, "new")).toEqual([{ billId: "new", amount: 30 }]);
  });

  it("stops at the total outstanding", () => {
    const total = allocateOldestFirst(bills, 999).reduce((s, a) => s + a.amount, 0);
    expect(total).toBe(70);
  });
});

describe("payment validation", () => {
  const bills = [bill({ id: "a", total_amount: 35 })];
  const base = {
    customerId: "c1",
    amount: 20,
    method: "Cash",
    accountId: "acc1",
    paymentDate: "2026-01-05",
    allocations: [{ billId: "a", amount: 20 }],
    bills,
  };

  it("accepts a valid partial payment", () => {
    expect(validatePayment(base)).toEqual([]);
  });

  it("rejects zero, missing account and over-allocation", () => {
    expect(validatePayment({ ...base, amount: 0, allocations: [] }).length).toBeGreaterThan(0);
    expect(validatePayment({ ...base, accountId: null }).length).toBeGreaterThan(0);
    expect(
      validatePayment({ ...base, amount: 40, allocations: [{ billId: "a", amount: 40 }] }),
    ).toHaveLength(1);
  });

  it("flags unallocated remainders", () => {
    expect(validatePayment({ ...base, amount: 30 })[0]).toContain("unallocated");
  });

  it("requires a cheque number for cheque payments", () => {
    expect(validatePayment({ ...base, method: "Cheque", accountId: null })[0]).toContain("cheque");
  });
});
