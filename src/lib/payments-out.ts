import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { accountIdByName } from "@/lib/payments";
import { recalcBillBalance, round2 } from "@/lib/payment-math";
import type { PurchaseBill } from "@/lib/purchases";

export type PaymentMade = Tables<"payments_made">;
export type PaymentMadeAllocation = Tables<"payment_made_allocations">;

export const PAYMENT_OUT_METHODS = ["Cash", "Bank Transfer", "Card", "Cheque"] as const;
export type PaymentOutMethod = (typeof PAYMENT_OUT_METHODS)[number];

export type PaymentMadeRow = PaymentMade & {
  vendors: { id: string; name: string } | null;
  accounts: { name: string } | null;
  payment_made_allocations: (PaymentMadeAllocation & {
    purchase_bills: { id: string; bill_number: string | null } | null;
  })[];
};

const SELECT =
  "*, vendors(id, name), accounts(name), payment_made_allocations(*, purchase_bills(id, bill_number))";

export function usePaymentsMade() {
  return useQuery({
    queryKey: ["payments-made"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments_made")
        .select(SELECT)
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as PaymentMadeRow[];
    },
  });
}

export function useVendorPaymentsMade(vendorId: string) {
  return useQuery({
    queryKey: ["payments-made", "vendor", vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments_made")
        .select(SELECT)
        .eq("vendor_id", vendorId)
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return data as unknown as PaymentMadeRow[];
    },
    enabled: Boolean(vendorId),
  });
}

/** Finalized purchase bills for a vendor that still have a balance due. */
export function useVendorOpenPurchaseBills(vendorId: string | null) {
  return useQuery({
    queryKey: ["vendor-open-purchase-bills", vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_bills")
        .select("*")
        .eq("vendor_id", vendorId!)
        .eq("status", "Finalized")
        .neq("payment_status", "Paid")
        .order("bill_date", { ascending: true });
      if (error) throw error;
      return (data as PurchaseBill[]).filter(
        (b) => Number(b.total_amount) - Number(b.amount_paid) > 0.001,
      );
    },
    enabled: Boolean(vendorId),
  });
}

async function refreshVendorTotals(vendorId: string) {
  const { data } = await supabase
    .from("purchase_bills")
    .select("total_amount, amount_paid, status")
    .eq("vendor_id", vendorId);
  const rows = (data ?? []).filter((b) => b.status === "Finalized");
  const purchased = rows.reduce((s, b) => s + Number(b.total_amount), 0);
  const outstanding = rows.reduce(
    (s, b) => s + Math.max(Number(b.total_amount) - Number(b.amount_paid), 0),
    0,
  );
  await supabase
    .from("vendors")
    .update({ total_purchased: purchased, total_outstanding: outstanding })
    .eq("id", vendorId);
}

export type RecordPaymentOutInput = {
  vendorId: string;
  vendorName: string;
  paymentDate: string;
  amount: number;
  method: PaymentOutMethod;
  accountId: string | null;
  referenceNumber: string | null;
  notes: string | null;
  chequeNumber?: string | null;
  chequeDate?: string | null;
  allocations: { purchaseBillId: string; billNumber: string | null; amount: number }[];
};

/**
 * Records money paid out to a vendor: allocations against purchase bills,
 * recalculated bill balances, and the ledger (or pending cheque) effect.
 */
export async function recordPaymentOut(input: RecordPaymentOutInput) {
  const amount = round2(Math.max(input.amount, 0));

  const { data: payment, error } = await supabase
    .from("payments_made")
    .insert({
      vendor_id: input.vendorId,
      payment_date: input.paymentDate,
      amount,
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
    const { error: allocError } = await supabase.from("payment_made_allocations").insert(
      allocations.map((a) => ({
        payment_id: payment.id,
        purchase_bill_id: a.purchaseBillId,
        amount_allocated: a.amount,
      })),
    );
    if (allocError) throw allocError;
  }

  for (const a of allocations) {
    const { data: bill } = await supabase
      .from("purchase_bills")
      .select("total_amount, amount_paid")
      .eq("id", a.purchaseBillId)
      .maybeSingle();
    if (!bill) continue;
    // Guard: always derive amount_paid / status from the freshly-read row.
    const next = recalcBillBalance(bill, a.amount);
    await supabase
      .from("purchase_bills")
      .update({ amount_paid: next.amountPaid, payment_status: next.status })
      .eq("id", a.purchaseBillId);
  }

  const billLabel = allocations
    .map((a) => a.billNumber)
    .filter(Boolean)
    .join(", ");

  if (input.method === "Cheque") {
    const chequeAccount = input.accountId ?? (await accountIdByName("Cash in Hand"));
    if (chequeAccount) {
      await supabase.from("cheques").insert({
        cheque_number: input.chequeNumber || `PO-${payment.id.slice(0, 8)}`,
        type: "Issued",
        party_name: input.vendorName,
        amount,
        cheque_date: input.chequeDate || input.paymentDate,
        account_id: chequeAccount,
        status: "Pending",
        related_purchase_id: allocations[0]?.purchaseBillId ?? null,
        notes: billLabel ? `Payment against ${billLabel}` : null,
      });
    }
  } else if (input.accountId) {
    await supabase.from("ledger_entries").insert({
      account_id: input.accountId,
      entry_date: input.paymentDate,
      entry_type: "Purchase Payment",
      amount: -amount,
      related_purchase_id: allocations[0]?.purchaseBillId ?? null,
      description: `Paid ${input.vendorName}${billLabel ? ` · ${billLabel}` : ""}`,
    });
    const apId = await accountIdByName("Accounts Payable");
    if (apId) {
      await supabase.from("ledger_entries").insert({
        account_id: apId,
        entry_date: input.paymentDate,
        entry_type: "Purchase Payment",
        amount: -amount,
        related_purchase_id: allocations[0]?.purchaseBillId ?? null,
        description: `Payable settled · ${input.vendorName}`,
      });
    }
  }

  await refreshVendorTotals(input.vendorId);
  return payment;
}
