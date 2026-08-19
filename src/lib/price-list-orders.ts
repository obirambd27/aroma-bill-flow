import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type PriceListOrder = Tables<"price_list_orders">;
export type PriceListOrderItem = Tables<"price_list_order_items">;

export const ORDER_STATUSES = [
  "New",
  "Reviewed",
  "Approved",
  "Rejected",
  "Converted to Bill",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function orderStatusTone(status: string) {
  if (status === "New") return "accent" as const;
  if (status === "Approved") return "success" as const;
  if (status === "Rejected") return "error" as const;
  if (status === "Converted to Bill") return "success" as const;
  return "neutral" as const;
}

export function usePriceListOrders() {
  return useQuery({
    queryKey: ["price-list-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_list_orders")
        .select("*, price_lists(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as (PriceListOrder & { price_lists: { name: string } | null })[];
    },
  });
}

export function usePriceListOrder(orderId: string) {
  return useQuery({
    queryKey: ["price-list-order", orderId],
    queryFn: async () => {
      const [orderRes, itemsRes] = await Promise.all([
        supabase
          .from("price_list_orders")
          .select("*, price_lists(name)")
          .eq("id", orderId)
          .maybeSingle(),
        supabase
          .from("price_list_order_items")
          .select("*")
          .eq("price_list_order_id", orderId)
          .order("product_name_snapshot"),
      ]);
      if (orderRes.error) throw orderRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (!orderRes.data) return null;
      return {
        order: orderRes.data as PriceListOrder & { price_lists: { name: string } | null },
        items: (itemsRes.data ?? []) as PriceListOrderItem[],
      };
    },
    enabled: Boolean(orderId),
  });
}

/** Status changes other than rejection — rejection restores stock server-side. */
export function useUpdateOrderStatus(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (status: OrderStatus) => {
      const { error } = await supabase
        .from("price_list_orders")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["price-list-order", orderId] });
      void qc.invalidateQueries({ queryKey: ["price-list-orders"] });
    },
  });
}

/** Admin price override on a single line; keeps order totals in sync. */
export function useAdjustOrderPrices(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lines: { id: string; appliedPrice: number; quantity: number }[]) => {
      for (const line of lines) {
        const lineTotal = Math.round(line.appliedPrice * line.quantity * 100) / 100;
        const { error } = await supabase
          .from("price_list_order_items")
          .update({ applied_price: line.appliedPrice, line_total: lineTotal })
          .eq("id", line.id);
        if (error) throw error;
      }
      const total =
        Math.round(
          lines.reduce((s, l) => s + l.appliedPrice * l.quantity, 0) * 100,
        ) / 100;
      const { error } = await supabase
        .from("price_list_orders")
        .update({ admin_adjusted_total: total, updated_at: new Date().toISOString() })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["price-list-order", orderId] });
      void qc.invalidateQueries({ queryKey: ["price-list-orders"] });
    },
  });
}
