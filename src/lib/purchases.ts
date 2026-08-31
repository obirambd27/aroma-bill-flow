import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { accountIdByName, derivePaymentStatus } from "@/lib/payments";

export type Vendor = Tables<"vendors">;
export type PurchaseOrder = Tables<"purchase_orders">;
export type PurchaseOrderItem = Tables<"purchase_order_items">;
export type PurchaseBill = Tables<"purchase_bills">;
export type PurchaseBillItem = Tables<"purchase_bill_items">;

export const PO_STATUSES = [
  "Open",
  "Partially Received",
  "Fully Received",
  "Converted to Bill",
  "Cancelled",
] as const;

export const PB_STATUSES = ["Draft", "Finalized", "Voided"] as const;

export const PURCHASE_PAYMENT_METHODS = ["Cash", "Bank Transfer", "Card", "Cheque"] as const;
export type PurchasePaymentMethod = (typeof PURCHASE_PAYMENT_METHODS)[number];

export function purchaseOrderTone(status: string) {
  if (status === "Fully Received" || status === "Converted to Bill") return "success" as const;
  if (status === "Partially Received") return "warning" as const;
  if (status === "Cancelled") return "error" as const;
  return "neutral" as const;
}

export function purchaseBillTone(status: string) {
  if (status === "Finalized") return "success" as const;
  if (status === "Voided") return "error" as const;
  return "neutral" as const;
}

export function purchasePaymentTone(status: string) {
  if (status === "Paid") return "success" as const;
  if (status === "Partial") return "warning" as const;
  if (status === "Unpaid") return "error" as const;
  return "neutral" as const;
}

/* ---------- Vendors ---------- */

export function useVendors() {
  return useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("*").order("name");
      if (error) throw error;
      return data as Vendor[];
    },
  });
}

export function useVendor(vendorId: string) {
  return useQuery({
    queryKey: ["vendor", vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("*")
        .eq("id", vendorId)
        .maybeSingle();
      if (error) throw error;
      return data as Vendor | null;
    },
    enabled: Boolean(vendorId),
  });
}

/* ---------- Purchase orders ---------- */

export type PurchaseOrderRow = PurchaseOrder & {
  vendors: { name: string } | null;
  warehouses: { name: string } | null;
  purchase_order_items: Pick<PurchaseOrderItem, "quantity" | "quantity_received">[];
};

export function usePurchaseOrders() {
  return useQuery({
    queryKey: ["purchase-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(
          "*, vendors(name), warehouses(name), purchase_order_items(quantity, quantity_received)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as PurchaseOrderRow[];
    },
  });
}

export function usePurchaseOrder(orderId: string) {
  return useQuery({
    queryKey: ["purchase-order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*, vendors(*), warehouses(name), purchase_order_items(*)")
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as
        | (PurchaseOrder & {
            vendors: Vendor | null;
            warehouses: { name: string } | null;
            purchase_order_items: PurchaseOrderItem[];
          })
        | null;
    },
    enabled: Boolean(orderId),
  });
}

/* ---------- Purchase bills ---------- */

export type PurchaseBillRow = PurchaseBill & {
  vendors: { name: string } | null;
  warehouses: { name: string } | null;
};

export function usePurchaseBills() {
  return useQuery({
    queryKey: ["purchase-bills"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_bills")
        .select("*, vendors(name), warehouses(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as PurchaseBillRow[];
    },
  });
}

export function useVendorPurchaseBills(vendorId: string) {
  return useQuery({
    queryKey: ["vendor-purchase-bills", vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_bills")
        .select("*, warehouses(name)")
        .eq("vendor_id", vendorId)
        .order("bill_date", { ascending: false });
      if (error) throw error;
      return data as unknown as (PurchaseBill & { warehouses: { name: string } | null })[];
    },
    enabled: Boolean(vendorId),
  });
}

export type PaymentOutRow = Tables<"ledger_entries"> & {
  accounts: { name: string } | null;
  purchase_bills: { id: string; bill_number: string | null } | null;
};

/** Money paid out to a vendor, taken from Purchase Payment ledger entries. */
export function useVendorPaymentsOut(vendorId: string) {
  return useQuery({
    queryKey: ["vendor-payments-out", vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ledger_entries")
        .select("*, accounts(name), purchase_bills!inner(id, bill_number, vendor_id)")
        .eq("entry_type", "Purchase Payment")
        .eq("purchase_bills.vendor_id", vendorId)
        .lt("amount", 0)
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return data as unknown as PaymentOutRow[];
    },
    enabled: Boolean(vendorId),
  });
}

export function usePurchaseBill(billId: string) {
  return useQuery({
    queryKey: ["purchase-bill", billId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_bills")
        .select(
          "*, vendors(*), warehouses(name), purchase_orders(id, order_number), purchase_bill_items(*)",
        )
        .eq("id", billId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as
        | (PurchaseBill & {
            vendors: Vendor | null;
            warehouses: { name: string } | null;
            purchase_orders: { id: string; order_number: string | null } | null;
            purchase_bill_items: PurchaseBillItem[];
          })
        | null;
    },
    enabled: Boolean(billId),
  });
}

/* ---------- Stock + accounting effects ---------- */

/** Add (or remove, with a negative delta) stock on hand for a product in a warehouse. */
export async function addStock(productId: string, warehouseId: string, delta: number) {
  if (!productId || !warehouseId || delta === 0) return;
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
    await supabase.from("product_stock").insert({
      product_id: productId,
      warehouse_id: warehouseId,
      stock_on_hand: delta,
      committed_stock: 0,
    });
  }
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

export type PurchaseBillLine = {
  productId: string;
  name: string;
  quantity: number;
  unitCost: number;
  updateCostPrice: boolean;
};

export type FinalizePurchaseBillInput = {
  vendorId: string;
  vendorName: string;
  purchaseOrderId: string | null;
  billDate: string;
  warehouseId: string;
  taxRate: number;
  isTaxed: boolean;
  discountAmount?: number;
  notes: string | null;
  lines: PurchaseBillLine[];
  amountPaid: number;
  paymentMethod: PurchasePaymentMethod;
  accountId: string | null;
  chequeNumber?: string | null;
  chequeDate?: string | null;
};

/** Creates a finalized purchase bill: stock in, movements, ledger and vendor totals. */
export async function finalizePurchaseBill(input: FinalizePurchaseBillInput) {
  const subtotal = input.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);
  const taxAmount = input.isTaxed ? (subtotal * input.taxRate) / 100 : 0;
  const discount = Math.min(Math.max(Number(input.discountAmount) || 0, 0), subtotal + taxAmount);
  const total = subtotal + taxAmount - discount;
  const amountPaid = Math.min(Math.max(input.amountPaid, 0), total);


  const { data: bill, error } = await supabase
    .from("purchase_bills")
    .insert({
      vendor_id: input.vendorId,
      purchase_order_id: input.purchaseOrderId,
      bill_date: input.billDate,
      warehouse_id: input.warehouseId,
      subtotal,
      tax_amount: taxAmount,
      discount_amount: discount,
      total_amount: total,
      amount_paid: amountPaid,
      payment_status: derivePaymentStatus(amountPaid, total),
      status: "Finalized",
      notes: input.notes,
    })
    .select()
    .single();
  if (error || !bill) throw error ?? new Error("Could not save the purchase bill");

  const { error: itemsError } = await supabase.from("purchase_bill_items").insert(
    input.lines.map((l) => ({
      purchase_bill_id: bill.id,
      product_id: l.productId,
      product_name_snapshot: l.name,
      warehouse_id: input.warehouseId,
      quantity: l.quantity,
      unit_cost: l.unitCost,
      line_total: l.quantity * l.unitCost,
    })),
  );
  if (itemsError) throw itemsError;

  for (const l of input.lines) {
    await addStock(l.productId, input.warehouseId, l.quantity);
    await supabase.from("stock_movements").insert({
      product_id: l.productId,
      warehouse_id: input.warehouseId,
      movement_type: "Purchase",
      quantity_change: l.quantity,
      related_purchase_id: bill.id,
      reason: `Purchase bill ${bill.bill_number} · ${input.vendorName}`,
    });
    if (l.updateCostPrice) {
      await supabase.from("products").update({ cost_price: l.unitCost }).eq("id", l.productId);
    }
  }

  // Receive against the linked purchase order.
  if (input.purchaseOrderId) {
    const { data: poItems } = await supabase
      .from("purchase_order_items")
      .select("*")
      .eq("purchase_order_id", input.purchaseOrderId);
    for (const item of poItems ?? []) {
      const line = input.lines.find((l) => l.productId === item.product_id);
      if (!line) continue;
      const received = Math.min(
        Number(item.quantity_received) + line.quantity,
        Number(item.quantity),
      );
      await supabase
        .from("purchase_order_items")
        .update({ quantity_received: received })
        .eq("id", item.id);
    }
    const { data: fresh } = await supabase
      .from("purchase_order_items")
      .select("quantity, quantity_received")
      .eq("purchase_order_id", input.purchaseOrderId);
    const fullyReceived = (fresh ?? []).every(
      (i) => Number(i.quantity_received) + 0.001 >= Number(i.quantity),
    );
    await supabase
      .from("purchase_orders")
      .update({ status: fullyReceived ? "Fully Received" : "Partially Received" })
      .eq("id", input.purchaseOrderId);
  }

  // Inventory asset value in.
  const inventoryId = await accountIdByName("Inventory Asset");
  if (inventoryId) {
    await supabase.from("ledger_entries").insert({
      account_id: inventoryId,
      entry_date: input.billDate,
      entry_type: "Purchase",
      amount: total,
      related_purchase_id: bill.id,
      description: `Purchase ${bill.bill_number} from ${input.vendorName}`,
    });
  }

  // Money paid now.
  if (amountPaid > 0) {
    if (input.paymentMethod === "Cheque") {
      const chequeAccount = input.accountId ?? (await accountIdByName("Cash in Hand"));
      if (chequeAccount) {
        await supabase.from("cheques").insert({
          cheque_number: input.chequeNumber || `PB-${bill.id.slice(0, 8)}`,
          type: "Issued",
          party_name: input.vendorName,
          amount: amountPaid,
          cheque_date: input.chequeDate || input.billDate,
          account_id: chequeAccount,
          status: "Pending",
          related_purchase_id: bill.id,
          notes: `Payment for ${bill.bill_number}`,
        });
      }
    } else if (input.accountId) {
      await supabase.from("ledger_entries").insert({
        account_id: input.accountId,
        entry_date: input.billDate,
        entry_type: "Purchase Payment",
        amount: -amountPaid,
        related_purchase_id: bill.id,
        description: `Paid ${input.vendorName} · ${bill.bill_number}`,
      });
    }
  }

  // Anything unpaid sits in Accounts Payable.
  const balance = total - amountPaid;
  if (balance > 0.001) {
    const apId = await accountIdByName("Accounts Payable");
    if (apId) {
      await supabase.from("ledger_entries").insert({
        account_id: apId,
        entry_date: input.billDate,
        entry_type: "Purchase",
        amount: balance,
        related_purchase_id: bill.id,
        description: `Payable to ${input.vendorName} · ${bill.bill_number}`,
      });
    }
  }

  await refreshVendorTotals(input.vendorId);
  return bill;
}

/** Reverses a finalized purchase bill: stock back out and ledger entries removed. */
export async function voidPurchaseBill(billId: string) {
  const { data: bill } = await supabase
    .from("purchase_bills")
    .select("*, purchase_bill_items(*)")
    .eq("id", billId)
    .maybeSingle();
  if (!bill) throw new Error("Purchase bill not found");

  const items = (bill as unknown as { purchase_bill_items: PurchaseBillItem[] })
    .purchase_bill_items;

  for (const item of items) {
    const wId = item.warehouse_id ?? bill.warehouse_id;
    if (item.product_id && wId) {
      await addStock(item.product_id, wId, -Number(item.quantity));
      await supabase.from("stock_movements").insert({
        product_id: item.product_id,
        warehouse_id: wId,
        movement_type: "Purchase Return",
        quantity_change: -Number(item.quantity),
        related_purchase_id: bill.id,
        reason: `Voided purchase bill ${bill.bill_number}`,
      });
    }
  }

  // Roll back received quantities on the linked order.
  if (bill.purchase_order_id) {
    const { data: poItems } = await supabase
      .from("purchase_order_items")
      .select("*")
      .eq("purchase_order_id", bill.purchase_order_id);
    for (const poItem of poItems ?? []) {
      const line = items.find((i) => i.product_id === poItem.product_id);
      if (!line) continue;
      await supabase
        .from("purchase_order_items")
        .update({
          quantity_received: Math.max(
            Number(poItem.quantity_received) - Number(line.quantity),
            0,
          ),
        })
        .eq("id", poItem.id);
    }
    const { data: fresh } = await supabase
      .from("purchase_order_items")
      .select("quantity, quantity_received")
      .eq("purchase_order_id", bill.purchase_order_id);
    const anyReceived = (fresh ?? []).some((i) => Number(i.quantity_received) > 0);
    const allReceived = (fresh ?? []).every(
      (i) => Number(i.quantity_received) + 0.001 >= Number(i.quantity),
    );
    await supabase
      .from("purchase_orders")
      .update({ status: allReceived ? "Fully Received" : anyReceived ? "Partially Received" : "Open" })
      .eq("id", bill.purchase_order_id);
  }

  await supabase.from("ledger_entries").delete().eq("related_purchase_id", bill.id);
  await supabase
    .from("purchase_bills")
    .update({ status: "Voided", payment_status: "Unpaid", amount_paid: 0 })
    .eq("id", bill.id);

  if (bill.vendor_id) await refreshVendorTotals(bill.vendor_id);
}
