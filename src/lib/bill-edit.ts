import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json, TablesUpdate } from "@/integrations/supabase/types";
import { accountIdByName, postSalePaymentEntry } from "@/lib/payments";

export type EditLine = {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  warehouseId: string;
  costPrice?: number | null;
};

export type BillSnapshot = {
  customerName: string;
  warehouseId: string | null;
  isTaxed: boolean;
  taxRate: number;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  lines: { name: string; quantity: number; unitPrice: number; warehouseId: string | null }[];
};

export type BillEditHistoryRow = {
  id: string;
  bill_id: string;
  edited_at: string;
  edited_fields: string[];
  changes_summary: Record<string, unknown>;
};

export function useBillEditHistory(billId: string) {
  return useQuery({
    queryKey: ["bill-edit-history", billId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bill_edit_history")
        .select("*")
        .eq("bill_id", billId)
        .order("edited_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BillEditHistoryRow[];
    },
    enabled: Boolean(billId),
  });
}

/** Build the structured before/after diff stored on every edit. */
export function diffSnapshots(before: BillSnapshot, after: BillSnapshot) {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  const fields: string[] = [];

  const push = (key: string, b: unknown, a: unknown) => {
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changes[key] = { before: b, after: a };
      fields.push(key);
    }
  };

  push("line_items", before.lines, after.lines);
  push("customer", before.customerName, after.customerName);
  push("warehouse", before.warehouseId, after.warehouseId);
  push("is_taxed", before.isTaxed, after.isTaxed);
  push("tax_rate", before.taxRate, after.taxRate);
  push("discount_amount", before.discountAmount, after.discountAmount);
  push("subtotal", before.subtotal, after.subtotal);
  push("tax_amount", before.taxAmount, after.taxAmount);
  push("total_amount", before.total, after.total);

  return { changes, fields };
}

/** Human-readable lines describing one audit entry. */
export function describeChanges(row: BillEditHistoryRow, money: (n: number) => string): string[] {
  const out: string[] = [];
  const summary = row.changes_summary as Record<string, { before: unknown; after: unknown }>;
  for (const [key, value] of Object.entries(summary ?? {})) {
    if (!value) continue;
    if (key === "line_items") {
      const before = (value.before ?? []) as BillSnapshot["lines"];
      const after = (value.after ?? []) as BillSnapshot["lines"];
      for (const b of before) {
        const match = after.find((a) => a.name === b.name);
        if (!match) {
          out.push(`Removed ${b.name} (qty ${b.quantity})`);
        } else {
          if (match.quantity !== b.quantity) {
            out.push(`Quantity of ${b.name} changed from ${b.quantity} to ${match.quantity}`);
          }
          if (match.unitPrice !== b.unitPrice) {
            out.push(
              `Price of ${b.name} changed from ${money(b.unitPrice)} to ${money(match.unitPrice)}`,
            );
          }
        }
      }
      for (const a of after) {
        if (!before.some((b) => b.name === a.name)) {
          out.push(`Added ${a.name} (qty ${a.quantity})`);
        }
      }
      continue;
    }
    const label: Record<string, string> = {
      customer: "Customer",
      warehouse: "Warehouse",
      is_taxed: "Tax applied",
      tax_rate: "Tax rate",
      discount_amount: "Discount",
      subtotal: "Subtotal",
      tax_amount: "Tax amount",
      total_amount: "Total",
    };
    const isMoney = ["discount_amount", "subtotal", "tax_amount", "total_amount"].includes(key);
    const fmt = (v: unknown) =>
      typeof v === "boolean" ? (v ? "Yes" : "No") : isMoney ? money(Number(v)) : String(v ?? "—");
    out.push(`${label[key] ?? key} changed from ${fmt(value.before)} to ${fmt(value.after)}`);
  }
  return out.length > 0 ? out : ["Bill details updated"];
}

/** Add stock back to a warehouse row, creating it if needed. */
async function addStock(productId: string, warehouseId: string, delta: number) {
  const { data: row } = await supabase
    .from("product_stock")
    .select("id, stock_on_hand")
    .eq("product_id", productId)
    .eq("warehouse_id", warehouseId)
    .maybeSingle();
  if (row) {
    await supabase
      .from("product_stock")
      .update({ stock_on_hand: Number(row.stock_on_hand) + delta })
      .eq("id", row.id);
  } else {
    await supabase
      .from("product_stock")
      .insert({ product_id: productId, warehouse_id: warehouseId, stock_on_hand: delta });
  }
}

/**
 * Deletes every ledger entry this bill created itself (sale, receivable and the
 * counter payment), leaving entries owned by the Payments Received module.
 * Account balances self-correct through the delete trigger, so re-applying the
 * corrected figures afterwards can never leave a duplicate behind.
 */
export async function clearBillLedgerEntries(billId: string) {
  const { error } = await supabase
    .from("ledger_entries")
    .delete()
    .eq("related_bill_id", billId)
    .is("related_payment_id", null);
  if (error) throw error;
}

export type ApplyEditInput = {

  billId: string;
  billNumber: string | null;
  originalStatus: string;
  originalItems: {
    product_id: string | null;
    warehouse_id: string | null;
    quantity: number;
    product_name_snapshot: string;
  }[];
  lines: EditLine[];
  billFields: TablesUpdate<"bills">;
  billDate: string;
  customerName: string;
  amountPaid: number;
  paymentAccountId: string | null;
  before: BillSnapshot;
  after: BillSnapshot;
};

/**
 * Saves an edit to an existing bill. Finalized bills get their stock and ledger
 * effects reversed (append-only) and re-applied from the new line items.
 */
export async function applyBillEdit(input: ApplyEditInput) {
  const wasFinalized = input.originalStatus === "Finalized";

  if (wasFinalized) {
    // Reverse only the stock effects that actually exist, validate the new
    // quantities against post-reversal availability, then re-apply — all in
    // one database transaction. Identical re-saves write nothing at all.
    const { data: stockResult, error: stockError } = await supabase.rpc("apply_bill_edit_stock", {
      p_bill_id: input.billId,
      p_lines: input.lines.map((l) => ({
        product_id: l.productId,
        warehouse_id: l.warehouseId || null,
        quantity: l.quantity,
      })) as unknown as Json,
    });
    if (stockError) throw new Error(stockError.message);
    const flags = (stockResult as { flags?: { product?: string; warehouse?: string }[] } | null)
      ?.flags;
    if (flags && flags.length > 0) {
      console.warn("Stock integrity issue while editing bill", input.billNumber, flags);
    }

    // Remove the bill's own ledger effects (revenue, receivable and the
    // Sale Payment taken at the counter) so they can be re-applied cleanly.
    // Entries created by the Payments Received module carry a
    // related_payment_id and are left untouched.
    await clearBillLedgerEntries(input.billId);
  }


  // Replace line items and bill header.
  await supabase.from("bill_items").delete().eq("bill_id", input.billId);
  const { error: itemsError } = await supabase.from("bill_items").insert(
    input.lines.map((l) => ({
      bill_id: input.billId,
      product_id: l.productId,
      product_name_snapshot: l.name,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      cost_price_snapshot: l.costPrice ?? null,
      line_total: l.unitPrice * l.quantity,
      warehouse_id: l.warehouseId || null,
    })),
  );
  if (itemsError) throw itemsError;

  const { error: billError } = await supabase
    .from("bills")
    .update(input.billFields)
    .eq("id", input.billId);
  if (billError) throw billError;

  if (wasFinalized) {


    const total = input.after.total;
    const revenueId = await accountIdByName("Sales Revenue");
    if (revenueId) {
      await supabase.from("ledger_entries").insert({
        account_id: revenueId,
        entry_date: input.billDate,
        entry_type: "Sale",
        amount: total,
        related_bill_id: input.billId,
        description: `${input.billNumber ?? "Bill"} (edited) · ${input.customerName}`,
      });
    }

    if (input.paymentAccountId) {
      await postSalePaymentEntry({
        billId: input.billId,
        accountId: input.paymentAccountId,
        entryDate: input.billDate,
        amount: input.amountPaid,
        description: `Payment for ${input.billNumber ?? "bill"} · ${input.customerName}`,
      });
    }

    const outstanding = total - input.amountPaid;
    if (outstanding > 0.001) {
      const arId = await accountIdByName("Accounts Receivable");
      if (arId) {
        await supabase.from("ledger_entries").insert({
          account_id: arId,
          entry_date: input.billDate,
          entry_type: "Sale",
          amount: outstanding,
          related_bill_id: input.billId,
          description: `Outstanding on ${input.billNumber ?? "bill"} · ${input.customerName}`,
        });
      }
    }
  }

  // 5. Audit log.
  const { changes, fields } = diffSnapshots(input.before, input.after);
  if (fields.length > 0) {
    await supabase.from("bill_edit_history").insert({
      bill_id: input.billId,
      changes_summary: changes as unknown as Json,
      edited_fields: fields,
    });
  }
}
