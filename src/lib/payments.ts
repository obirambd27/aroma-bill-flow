import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { Bill } from "@/lib/data";

export type PaymentReceived = Tables<"payments_received">;
export type PaymentAllocation = Tables<"payment_allocations">;

export const PAYMENT_METHODS = ["Cash", "Bank Transfer", "Card", "Cheque"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function derivePaymentStatus(amountPaid: number, total: number) {
  if (amountPaid <= 0) return "Unpaid";
  if (amountPaid + 0.001 >= total) return "Paid";
  return "Partial";
}

/** Resolve a system account id by its name (e.g. "Sales Revenue"). */
export async function accountIdByName(name: string) {
  const { data } = await supabase.from("accounts").select("id").eq("name", name).maybeSingle();
  return data?.id ?? null;
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
      account_id: input.method === "Cheque" ? null : input.accountId,
      reference_number: input.referenceNumber,
      notes: input.notes,
    })
    .select()
    .single();
  if (error || !payment) throw error ?? new Error("Could not save the payment");

  const allocations = input.allocations.filter((a) => a.amount > 0);
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

  for (const a of allocations) {
    const { data: bill } = await supabase
      .from("bills")
      .select("total_amount, amount_paid")
      .eq("id", a.billId)
      .maybeSingle();
    if (!bill) continue;
    const paid = Number(bill.amount_paid) + a.amount;
    await supabase
      .from("bills")
      .update({
        amount_paid: paid,
        payment_status: derivePaymentStatus(paid, Number(bill.total_amount)),
      })
      .eq("id", a.billId);
  }

  const billLabel = allocations
    .map((a) => a.billNumber)
    .filter(Boolean)
    .join(", ");

  if (input.method === "Cheque") {
    const chequeAccount = input.accountId ?? (await accountIdByName("Cash in Hand"));
    if (chequeAccount) {
      await supabase.from("cheques").insert({
        cheque_number: input.chequeNumber || `PAY-${payment.id.slice(0, 8)}`,
        type: "Received",
        party_name: input.customerName,
        amount: input.amount,
        cheque_date: input.chequeDate || input.paymentDate,
        account_id: chequeAccount,
        status: "Pending",
        related_bill_id: allocations[0]?.billId ?? null,
        notes: billLabel ? `Payment against ${billLabel}` : null,
      });
    }
  } else if (input.accountId) {
    await supabase.from("ledger_entries").insert({
      account_id: input.accountId,
      entry_date: input.paymentDate,
      entry_type: "Sale Payment",
      amount: input.amount,
      related_bill_id: allocations[0]?.billId ?? null,
      description: `Payment from ${input.customerName}${billLabel ? ` · ${billLabel}` : ""}`,
    });
    const arId = await accountIdByName("Accounts Receivable");
    if (arId) {
      await supabase.from("ledger_entries").insert({
        account_id: arId,
        entry_date: input.paymentDate,
        entry_type: "Sale Payment",
        amount: -input.amount,
        related_bill_id: allocations[0]?.billId ?? null,
        description: `Receivable settled by ${input.customerName}`,
      });
    }
  }

  return payment;
}
