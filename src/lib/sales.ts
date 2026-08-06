import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type SalesOrder = Tables<"sales_orders">;
export type SalesOrderItem = Tables<"sales_order_items">;
export type DeliveryNote = Tables<"delivery_notes">;
export type DeliveryNoteItem = Tables<"delivery_note_items">;

export const SO_STATUSES = [
  "Open",
  "Partially Delivered",
  "Fully Delivered",
  "Converted to Bill",
  "Cancelled",
] as const;

export function orderTone(status: string) {
  if (status === "Fully Delivered" || status === "Converted to Bill") return "success" as const;
  if (status === "Partially Delivered") return "warning" as const;
  if (status === "Cancelled") return "error" as const;
  return "neutral" as const;
}

export function deliveryTone(status: string) {
  return status === "Delivered" ? ("success" as const) : ("accent" as const);
}

export type SalesOrderRow = SalesOrder & {
  customers: { name: string } | null;
  warehouses: { name: string } | null;
  sales_order_items: Pick<SalesOrderItem, "quantity" | "quantity_delivered">[];
};

export function useSalesOrders() {
  return useQuery({
    queryKey: ["sales-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_orders")
        .select(
          "*, customers(name), warehouses(name), sales_order_items(quantity, quantity_delivered)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as SalesOrderRow[];
    },
  });
}

export function useSalesOrder(orderId: string) {
  return useQuery({
    queryKey: ["sales-order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_orders")
        .select("*, customers(*), warehouses(name), sales_order_items(*)")
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as
        | (SalesOrder & {
            customers: Tables<"customers"> | null;
            warehouses: { name: string } | null;
            sales_order_items: SalesOrderItem[];
          })
        | null;
    },
  });
}

export type DeliveryNoteRow = DeliveryNote & {
  customers: { name: string } | null;
  warehouses: { name: string } | null;
  sales_orders: { order_number: string | null } | null;
};

export function useDeliveryNotes() {
  return useQuery({
    queryKey: ["delivery-notes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_notes")
        .select("*, customers(name), warehouses(name), sales_orders(order_number)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as DeliveryNoteRow[];
    },
  });
}

export function useDeliveryNote(deliveryId: string) {
  return useQuery({
    queryKey: ["delivery-note", deliveryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_notes")
        .select(
          "*, customers(*), warehouses(name), sales_orders(id, order_number), delivery_note_items(*)",
        )
        .eq("id", deliveryId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as
        | (DeliveryNote & {
            customers: Tables<"customers"> | null;
            warehouses: { name: string } | null;
            sales_orders: { id: string; order_number: string | null } | null;
            delivery_note_items: DeliveryNoteItem[];
          })
        | null;
    },
  });
}

/** Adjust committed_stock for a product in a warehouse, creating the row if needed. */
export async function adjustCommitted(productId: string, warehouseId: string, delta: number) {
  if (!warehouseId || !productId || delta === 0) return;
  const { data: row } = await supabase
    .from("product_stock")
    .select("id, committed_stock")
    .eq("product_id", productId)
    .eq("warehouse_id", warehouseId)
    .maybeSingle();
  if (row) {
    await supabase
      .from("product_stock")
      .update({ committed_stock: Math.max(Number(row.committed_stock) + delta, 0) })
      .eq("id", row.id);
  } else if (delta > 0) {
    await supabase.from("product_stock").insert({
      product_id: productId,
      warehouse_id: warehouseId,
      stock_on_hand: 0,
      committed_stock: delta,
    });
  }
}
