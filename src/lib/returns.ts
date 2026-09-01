import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { accountIdByName, derivePaymentStatus } from "@/lib/payments";

export type SalesReturn = Tables<"sales_returns">;
export type SalesReturnItem = Tables<"sales_return_items">;
export type CreditNote = Tables<"credit_notes">;
export type CreditNoteItem = Tables<"credit_note_items">;
export type CreditNoteApplication = Tables<"credit_note_applications">;

export const RETURN_REASONS = [
  "Wrong item",
  "Damaged",
  "Customer changed mind",
  "Expired stock",
  "Other",
] as const;

export const RETURN_STATUSES = ["Completed", "Cancelled"] as const;
export const CREDIT_NOTE_STATUSES = [
  "Open",
  "Partially Applied",
  "Fully Applied",
  "Closed",
] as const;

export function returnTone(status: string) {
  if (status === "Completed") return "success" as const;
  if (status === "Cancelled") return "error" as const;
  return "neutral" as const;
}

export function creditTone(status: string) {
  if (status === "Fully Applied" || status === "Closed") return "neutral" as const;
  if (status === "Partially Applied") return "warning" as const;
  return "success" as const;
}

export function creditStatus(total: number, applied: number) {
  if (applied <= 0.001) return "Open";
  if (applied + 0.001 >= total) return "Fully Applied";
  return "Partially Applied";
}

/* ---------- Sales returns ---------- */

export type SalesReturnRow = SalesReturn & {
  customers: { name: string } | null;
  warehouses: { name: string } | null;
  bills: { bill_number: string | null } | null;
  credit_notes: { credit_note_number: string | null } | null;
};

export function useSalesReturns() {
  return useQuery({
    queryKey: ["sales-returns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_returns")
        .select(
          "*, customers(name), warehouses(name), bills(bill_number), credit_notes!sales_returns_credit_note_id_fkey(credit_note_number)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as SalesReturnRow[];
    },
  });
}

export function useSalesReturn(returnId: string) {
  return useQuery({
    queryKey: ["sales-return", returnId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_returns")
        .select(
          "*, customers(*), warehouses(name), bills(id, bill_number), credit_notes!sales_returns_credit_note_id_fkey(id, credit_note_number), sales_return_items(*)",
        )
        .eq("id", returnId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as
        | (SalesReturn & {
            customers: Tables<"customers"> | null;
            warehouses: { name: string } | null;
            bills: { id: string; bill_number: string | null } | null;
            credit_notes: { id: string; credit_note_number: string | null } | null;
            sales_return_items: SalesReturnItem[];
          })
        | null;
    },
    enabled: Boolean(returnId),
  });
}

/** Finalized bills that can be returned against. */
export function useReturnableBills() {
  return useQuery({
    queryKey: ["returnable-bills"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select("id, bill_number, bill_date, customer_id, warehouse_id, total_amount, customers(name)")
        .eq("status", "Finalized")
        .order("bill_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as {
        id: string;
        bill_number: string | null;
        bill_date: string;
        customer_id: string | null;
        warehouse_id: string | null;
        total_amount: number;
        customers: { name: string } | null;
      }[];
    },
  });
}

/** Bill line items plus how much of each has already been returned. */
export function useBillReturnableItems(billId: string | null) {
  return useQuery({
    queryKey: ["bill-returnable-items", billId],
    queryFn: async () => {
      const { data: items, error } = await supabase
        .from("bill_items")
        .select("*")
        .eq("bill_id", billId!);
      if (error) throw error;
      const { data: returned, error: rErr } = await supabase
        .from("sales_return_items")
        .select("bill_item_id, quantity, sales_returns!inner(bill_id, status)")
        .eq("sales_returns.bill_id", billId!)
        .eq("sales_returns.status", "Completed");
      if (rErr) throw rErr;
      const returnedBy: Record<string, number> = {};
      for (const row of (returned ?? []) as unknown as {
        bill_item_id: string | null;
        quantity: number;
      }[]) {
        if (!row.bill_item_id) continue;
        returnedBy[row.bill_item_id] = (returnedBy[row.bill_item_id] ?? 0) + Number(row.quantity);
      }
      return (items as Tables<"bill_items">[]).map((i) => ({
        item: i,
        alreadyReturned: returnedBy[i.id] ?? 0,
        remaining: Math.max(Number(i.quantity) - (returnedBy[i.id] ?? 0), 0),
      }));
    },
    enabled: Boolean(billId),
  });
}

/** Add returned quantity back into a warehouse's stock, creating the row if needed. */
async function restock(productId: string, warehouseId: string, qty: number) {
  const { data: row } = await supabase
    .from("product_stock")
    .select("id, stock_on_hand")
    .eq("product_id", productId)
    .eq("warehouse_id", warehouseId)
    .maybeSingle();
  if (row) {
    await supabase
      .from("product_stock")
      .update({ stock_on_hand: Number(row.stock_on_hand) + qty })
      .eq("id", row.id);
  } else {
    await supabase.from("product_stock").insert({
      product_id: productId,
      warehouse_id: warehouseId,
      stock_on_hand: qty,
      committed_stock: 0,
    });
  }
}

export type SalesReturnInput = {
  billId: string | null;
  customerId: string | null;
  returnDate: string;
  warehouseId: string;
  reason: string | null;
  notes: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  /** When set, the refund is credited to this cash/bank account instead of Accounts Receivable. */
  refundAccountId: string | null;
  items: {
    productId: string | null;
    billItemId: string | null;
    name: string;
    quantity: number;
    unitPrice: number;
  }[];
};

export async function createSalesReturn(input: SalesReturnInput) {
  const { data: ret, error } = await supabase
    .from("sales_returns")
    .insert({
      bill_id: input.billId,
      customer_id: input.customerId,
      return_date: input.returnDate,
      warehouse_id: input.warehouseId,
      reason: input.reason,
      notes: input.notes,
      subtotal: input.subtotal,
      tax_amount: input.taxAmount,
      total_amount: input.total,
      status: "Completed",
    })
    .select()
    .single();
  if (error || !ret) throw error ?? new Error("Could not save the return");

  const lines = input.items.filter((i) => i.quantity > 0);
  if (lines.length > 0) {
    const { error: itemsError } = await supabase.from("sales_return_items").insert(
      lines.map((i) => ({
        sales_return_id: ret.id,
        product_id: i.productId,
        bill_item_id: i.billItemId,
        product_name_snapshot: i.name,
        quantity: i.quantity,
        unit_price: i.unitPrice,
        line_total: i.quantity * i.unitPrice,
      })),
    );
    if (itemsError) throw itemsError;
  }

  for (const line of lines) {
    if (!line.productId) continue;
    await restock(line.productId, input.warehouseId, line.quantity);
    await supabase.from("stock_movements").insert({
      product_id: line.productId,
      warehouse_id: input.warehouseId,
      movement_type: "Sale Return",
      quantity_change: line.quantity,
      related_bill_id: input.billId,
      reason: `Sales return ${ret.return_number ?? ""}`.trim(),
    });
  }

  if (input.total > 0) {
    const revenueId = await accountIdByName("Sales Revenue");
    if (revenueId) {
      await supabase.from("ledger_entries").insert({
        account_id: revenueId,
        entry_date: input.returnDate,
        entry_type: "Sale Return",
        amount: -input.total,
        related_bill_id: input.billId,
        description: `Return ${ret.return_number ?? ""}`.trim(),
      });
    }
    const creditAccountId = input.refundAccountId ?? (await accountIdByName("Accounts Receivable"));
    if (creditAccountId) {
      await supabase.from("ledger_entries").insert({
        account_id: creditAccountId,
        entry_date: input.returnDate,
        entry_type: "Sale Return",
        amount: -input.total,
        related_bill_id: input.billId,
        description: `Return ${ret.return_number ?? ""} refund`.trim(),
      });
    }
  }

  return ret;
}

/* ---------- Credit notes ---------- */

export type CreditNoteRow = CreditNote & {
  customers: { name: string } | null;
  sales_returns: { return_number: string | null } | null;
};

export function useCreditNotes() {
  return useQuery({
    queryKey: ["credit-notes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_notes")
        .select("*, customers(name), sales_returns!credit_notes_sales_return_id_fkey(return_number)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as CreditNoteRow[];
    },
  });
}

export function useCreditNote(creditNoteId: string) {
  return useQuery({
    queryKey: ["credit-note", creditNoteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_notes")
        .select(
          "*, customers(*), sales_returns!credit_notes_sales_return_id_fkey(id, return_number), credit_note_items(*), credit_note_applications(*, bills(bill_number))",
        )
        .eq("id", creditNoteId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as
        | (CreditNote & {
            customers: Tables<"customers"> | null;
            sales_returns: { id: string; return_number: string | null } | null;
            credit_note_items: CreditNoteItem[];
            credit_note_applications: (CreditNoteApplication & {
              bills: { bill_number: string | null } | null;
            })[];
          })
        | null;
    },
    enabled: Boolean(creditNoteId),
  });
}

/** Remaining credit balance for a customer across open credit notes. */
export function useCustomerCredit(customerId: string | null) {
  return useQuery({
    queryKey: ["customer-credit", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_notes")
        .select("id, credit_note_number, total_amount, amount_applied, status")
        .eq("customer_id", customerId!)
        .in("status", ["Open", "Partially Applied"]);
      if (error) throw error;
      const notes = data ?? [];
      const remaining = notes.reduce(
        (sum, n) => sum + (Number(n.total_amount) - Number(n.amount_applied)),
        0,
      );
      return { notes, remaining };
    },
    enabled: Boolean(customerId),
  });
}

export type CreditNoteInput = {
  customerId: string;
  salesReturnId: string | null;
  creditNoteDate: string;
  reason: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  items: {
    productId: string | null;
    description: string;
    quantity: number | null;
    unitPrice: number;
  }[];
};

export async function createCreditNote(input: CreditNoteInput) {
  const { data: note, error } = await supabase
    .from("credit_notes")
    .insert({
      customer_id: input.customerId,
      sales_return_id: input.salesReturnId,
      credit_note_date: input.creditNoteDate,
      reason: input.reason,
      subtotal: input.subtotal,
      tax_amount: input.taxAmount,
      total_amount: input.total,
      amount_applied: 0,
      status: "Open",
    })
    .select()
    .single();
  if (error || !note) throw error ?? new Error("Could not create the credit note");

  if (input.items.length > 0) {
    const { error: itemsError } = await supabase.from("credit_note_items").insert(
      input.items.map((i) => ({
        credit_note_id: note.id,
        product_id: i.productId,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unitPrice,
        line_total: (i.quantity ?? 1) * i.unitPrice,
      })),
    );
    if (itemsError) throw itemsError;
  }

  if (input.salesReturnId) {
    await supabase
      .from("credit_notes")
      .update({ sales_return_id: input.salesReturnId })
      .eq("id", note.id);
    await supabase
      .from("sales_returns")
      .update({ credit_note_id: note.id })
      .eq("id", input.salesReturnId);
  }

  return note;
}

/**
 * Create a credit note that mirrors a completed sales return.
 * The return and its lines are re-read from the database so the credit note can
 * never be built from stale/cleared form state (which produced empty notes).
 */
export async function createCreditNoteFromReturn(source: { id: string }) {
  const { data: ret, error } = await supabase
    .from("sales_returns")
    .select("*, sales_return_items(*)")
    .eq("id", source.id)
    .maybeSingle();
  if (error) throw error;
  if (!ret) throw new Error("The sales return could not be found");
  if (!ret.customer_id) throw new Error("Walk-in returns cannot be credited — select a customer");

  const items = (ret.sales_return_items ?? []) as SalesReturnItem[];
  if (items.length === 0) throw new Error("This return has no items to credit");

  const subtotal = Number(ret.subtotal) || items.reduce((s, i) => s + Number(i.line_total), 0);
  const total = Number(ret.total_amount) || subtotal + Number(ret.tax_amount ?? 0);

  return createCreditNote({
    customerId: ret.customer_id,
    salesReturnId: ret.id,
    creditNoteDate: ret.return_date,
    reason: ret.reason ?? `Against return ${ret.return_number ?? ""}`.trim(),
    subtotal,
    taxAmount: Number(ret.tax_amount) || 0,
    total,
    items: items.map((i) => ({
      productId: i.product_id,
      description: i.product_name_snapshot,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unit_price),
    })),
  });
}


export async function applyCreditToBill(input: {
  creditNoteId: string;
  creditNoteNumber: string | null;
  billId: string;
  amount: number;
  appliedDate: string;
  customerName: string;
}) {
  const { error } = await supabase.from("credit_note_applications").insert({
    credit_note_id: input.creditNoteId,
    bill_id: input.billId,
    amount_applied: input.amount,
    applied_date: input.appliedDate,
  });
  if (error) throw error;

  const { data: bill } = await supabase
    .from("bills")
    .select("total_amount, amount_paid")
    .eq("id", input.billId)
    .maybeSingle();
  if (bill) {
    const paid = Number(bill.amount_paid) + input.amount;
    await supabase
      .from("bills")
      .update({
        amount_paid: paid,
        payment_status: derivePaymentStatus(paid, Number(bill.total_amount)),
      })
      .eq("id", input.billId);
  }

  const { data: note } = await supabase
    .from("credit_notes")
    .select("total_amount, amount_applied")
    .eq("id", input.creditNoteId)
    .maybeSingle();
  if (note) {
    const applied = Number(note.amount_applied) + input.amount;
    await supabase
      .from("credit_notes")
      .update({
        amount_applied: applied,
        status: creditStatus(Number(note.total_amount), applied),
      })
      .eq("id", input.creditNoteId);
  }

  const arId = await accountIdByName("Accounts Receivable");
  if (arId) {
    await supabase.from("ledger_entries").insert({
      account_id: arId,
      entry_date: input.appliedDate,
      entry_type: "Sale Return",
      amount: -input.amount,
      related_bill_id: input.billId,
      description: `Credit note ${input.creditNoteNumber ?? ""} applied for ${input.customerName}`.trim(),
    });
  }
}

/**
 * Edit a standalone credit note. Only allowed while the note is still Open,
 * has nothing applied to a bill, and was not generated from a sales return.
 */
export async function updateCreditNote(input: CreditNoteInput & { creditNoteId: string }) {
  const { data: note, error } = await supabase
    .from("credit_notes")
    .select("id, status, amount_applied, sales_return_id")
    .eq("id", input.creditNoteId)
    .maybeSingle();
  if (error) throw error;
  if (!note) throw new Error("This credit note no longer exists");
  if (note.sales_return_id)
    throw new Error("Credit notes generated from a sales return cannot be edited");
  if (Number(note.amount_applied) > 0.001 || note.status !== "Open")
    throw new Error("This credit note has already been applied and can no longer be edited");

  const { error: delError } = await supabase
    .from("credit_note_items")
    .delete()
    .eq("credit_note_id", note.id);
  if (delError) throw delError;

  if (input.items.length > 0) {
    const { error: itemsError } = await supabase.from("credit_note_items").insert(
      input.items.map((i) => ({
        credit_note_id: note.id,
        product_id: i.productId,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unitPrice,
        line_total: (i.quantity ?? 1) * i.unitPrice,
      })),
    );
    if (itemsError) throw itemsError;
  }

  const { error: headError } = await supabase
    .from("credit_notes")
    .update({
      customer_id: input.customerId,
      credit_note_date: input.creditNoteDate,
      reason: input.reason,
      subtotal: input.subtotal,
      tax_amount: input.taxAmount,
      total_amount: input.total,
    })
    .eq("id", note.id);
  if (headError) throw headError;

  return note;
}
