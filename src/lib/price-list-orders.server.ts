import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Restores stock and marks the order rejected in a single database transaction. */
export async function rejectPriceListOrder(orderId: string, reason: string) {
  const { data, error } = await supabaseAdmin.rpc("reject_price_list_order", {
    p_order_id: orderId,
    p_reason: reason,
  });
  if (error) return { ok: false as const, error: "failed" };
  const result = data as Record<string, unknown> | null;
  if (!result?.["ok"]) return { ok: false as const, error: String(result?.["error"] ?? "failed") };
  return { ok: true as const };
}
