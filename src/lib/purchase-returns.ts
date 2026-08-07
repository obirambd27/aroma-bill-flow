import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { accountIdByName } from "@/lib/payments";

export type PurchaseReturn = Tables<"purchase_returns">;
export type PurchaseReturnItem = Tables<"purchase_return_items">;

export const PURCHASE_RETURN_REASONS = [
  "Damaged goods",
  "Wrong item supplied",
  "Expired stock",
  "Over-supplied",
  "Quality issue",
  "Other",
] as const;

export const PURCHASE_RETURN_STATUSES = ["Completed", "Cancelled"] as const;

export function purchaseReturnTone(status: string) {
  if (status === "Completed") return "success" as const;
  if (status === "Cancelled") return "error" as const;
  return "neutral" as const;
}

export type PurchaseReturnRow = PurchaseReturn & {
  vendors: { id: string; name: string } | null;
  warehouses: { name: string } | null;
  purchase_bills: { id: string; bill_number: string | null } | null;
};

export function usePurchaseReturns() {
  return useQuery({
    queryKey: ["purchase-returns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_returns")
        .select("*, vendors(id, name), warehouses(name), purchase_bills(id, bill_number)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as PurchaseReturnRow[];
    },
  });
}

export function usePurchaseReturn(returnId: string) {
  return useQuery({
    queryKey: ["purchase-return", returnId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_returns")
        .select(
          "*, vendors(*), warehouses(name), purchase_bills(id, bill_number), purchase_return_items(*)",
        )
        .eq("id", returnId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as
        | (PurchaseReturn & {
            vendors: Tables<"vendors"> | null;
            warehouses: { name: string } | null;
            purchase_bills: { id: string; bill_number: string | null } | null;
            purchase_return_items: PurchaseReturnItem[];
          })
        | null;
    },
    enabled: Boolean(returnId),
  });
}

/** Finalized purchase bills that can be returned against. */
export function useReturnablePurchaseBills() {
  return useQuery({
    queryKey: ["returnable-purchase-bills"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_bills")
        .select(
          "id, bill_number, bill_date, vendor_id, warehouse_id, total_amount, amount_paid, vendors(name)",
        )
        .eq("status", "Finalized")
        .order("bill_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as {
        id: string;
        bill_number: string | null;
        bill_date: string;
        vendor_id: string | null;
        warehouse_id: string | null;
        total_amount: number;
        amount_paid: number;
        vendors: { name: string } | null;
      }[];
    },
  });
}

/** Purchase bill lines plus how much of each has already been returned. */
export function usePurchaseBillReturnableItems(billId: string | null) {
  return useQuery({
    queryKey: ["purchase-bill-returnable-items", billId],
    queryFn: async () => {
      const { data: items, error } = await supabase
        .from("purchase_bill_items")
        .select("*")
        .eq("purchase_bill_id", billId!);
      if (error) throw error;
      const { data: returned, error: rErr } = await supabase
        .from("purchase_return_items")
        .select(
          "purchase_bill_item_id, quantity, purchase_returns!inner(purchase_bill_id, status)",
        )
        .eq("purchase_returns.purchase_bill_id", billId!)
        .eq("purchase_returns.status", "Completed");
      if (rErr) throw rErr;
      const returnedBy: Record<string, number> = {};
      for (const row of (returned ?? []) as unknown as {
        purchase_bill_item_id: string | null;
        quantity: number;
      }[]) {
        if (!row.purchase_bill_item_id) continue;
        returnedBy[row.purchase_bill_item_id] =
          (returnedBy[row.purchase_bill_item_id] ?? 0) + Number(row.quantity);
      }
      return (items as Tables<"purchase_bill_items">[]).map((i) => ({
        item: i,
        alreadyReturned: returnedBy[i.id] ?? 0,
        remaining: Math.max(Number(i.quantity) - (returnedBy[i.id] ?? 0), 0),
      }));
    },
    enabled: Boolean(billId),
  });
}

/** Available-for-sale stock (on hand minus committed) per product in a warehouse. */
export async function availableStockFor(productIds: string[], warehouseId: string) {
  if (productIds.length === 0 || !warehouseId) return {};
  const { data } = await supabase
    .from("product_stock")
    .select("product_id, stock_on_hand, committed_stock")
    .eq("warehouse_id", warehouseId)
    .in("product_id", productIds);
  const map: Record<string, number> = {};
  for (const row of data ?? []) {
    map[row.product_id] = Number(row.stock_on_hand) - Number(row.committed_stock);
  }
  return map;
}

export type PurchaseReturnInput = {
  purchaseBillId: string | null;
  vendorId: string;
  vendorName: string;
  returnDate: string;
  warehouseId: string;
  reason: string | null;
  notes: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  /** When set, the vendor refunds into this cash/bank account instead of reducing payables. */
  refundAccountId: string | null;
  items: {
    productId: string | null;
    purchaseBillItemId: string | null;
    name: string;
    quantity: number;
    unitCost: number;
  }[];
};

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

export async function createPurchaseReturn(input: PurchaseReturnInput) {
  const lines = input.items.filter((i) => i.quantity > 0);
  if (lines.length === 0) throw new Error("Add at least one item to return");

  // Stock guard — the warehouse must actually hold the goods being sent back.
  const productIds = lines.map((l) => l.productId).filter(Boolean) as string[];
  const available = await availableStockFor(productIds, input.warehouseId);
  for (const line of lines) {
    if (!line.productId) continue;
    const have = available[line.productId] ?? 0;
    if (have + 0.001 < line.quantity) {
      throw new Error(
        `${line.name}: only ${have} available in this warehouse, cannot return ${line.quantity}`,
      );
    }
  }

  const { data: ret, error } = await supabase
    .from("purchase_returns")
    .insert({
      purchase_bill_id: input.purchaseBillId,
      vendor_id: input.vendorId,
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
  if (error || !ret) throw error ?? new Error("Could not save the purchase return");

  const { error: itemsError } = await supabase.from("purchase_return_items").insert(
    lines.map((l) => ({
      purchase_return_id: ret.id,
      product_id: l.productId,
      purchase_bill_item_id: l.purchaseBillItemId,
      product_name_snapshot: l.name,
      quantity: l.quantity,
      unit_cost: l.unitCost,
      line_total: l.quantity * l.unitCost,
    })),
  );
  if (itemsError) throw itemsError;

  for (const line of lines) {
    if (!line.productId) continue;
    const { data: row } = await supabase
      .from("product_stock")
      .select("id, stock_on_hand")
      .eq("product_id", line.productId)
      .eq("warehouse_id", input.warehouseId)
      .maybeSingle();
    if (row) {
      await supabase
        .from("product_stock")
        .update({ stock_on_hand: Number(row.stock_on_hand) - line.quantity })
        .eq("id", row.id);
    }
    await supabase.from("stock_movements").insert({
      product_id: line.productId,
      warehouse_id: input.warehouseId,
      movement_type: "Purchase Return",
      quantity_change: -line.quantity,
      related_purchase_id: input.purchaseBillId,
      reason: `Purchase return ${ret.return_number ?? ""} · ${input.vendorName}`.trim(),
    });
  }

  if (input.total > 0) {
    // Goods leave inventory.
    const inventoryId = await accountIdByName("Inventory Asset");
    if (inventoryId) {
      await supabase.from("ledger_entries").insert({
        account_id: inventoryId,
        entry_date: input.returnDate,
        entry_type: "Purchase Return",
        amount: -input.total,
        related_purchase_id: input.purchaseBillId,
        related_return_id: ret.id,
        description: `Return ${ret.return_number ?? ""} to ${input.vendorName}`.trim(),
      });
    }
    // Either the vendor refunds cash, or what we owe them drops.
    if (input.refundAccountId) {
      await supabase.from("ledger_entries").insert({
        account_id: input.refundAccountId,
        entry_date: input.returnDate,
        entry_type: "Purchase Return",
        amount: input.total,
        related_purchase_id: input.purchaseBillId,
        related_return_id: ret.id,
        description: `Refund from ${input.vendorName} · ${ret.return_number ?? ""}`.trim(),
      });
    } else {
      const apId = await accountIdByName("Accounts Payable");
      if (apId) {
        await supabase.from("ledger_entries").insert({
          account_id: apId,
          entry_date: input.returnDate,
          entry_type: "Purchase Return",
          amount: -input.total,
          related_purchase_id: input.purchaseBillId,
          related_return_id: ret.id,
          description: `Payable reduced · ${ret.return_number ?? ""}`.trim(),
        });
      }
    }
  }

  await refreshVendorTotals(input.vendorId);
  return ret;
}
