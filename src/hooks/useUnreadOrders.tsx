import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/format";

const UNREAD_KEY = ["price-list-orders", "unread-count"];

async function fetchUnreadCount() {
  const { count, error } = await supabase
    .from("price_list_orders")
    .select("id", { count: "exact", head: true })
    .eq("is_viewed", false);
  if (error) return 0;
  return count ?? 0;
}

/** Live unread-order count for the sidebar badge. Fails silently offline. */
export function useUnreadOrderCount() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: count = 0 } = useQuery({
    queryKey: UNREAD_KEY,
    queryFn: fetchUnreadCount,
    staleTime: 30_000,
  });

  useEffect(() => {
    const refetch = () => {
      // Always re-read the true count instead of incrementing locally.
      void qc.invalidateQueries({ queryKey: UNREAD_KEY });
      void qc.invalidateQueries({ queryKey: ["price-list-orders"] });
    };

    const channel = supabase
      .channel("price-list-orders-unread")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "price_list_orders" },
        (payload) => {
          refetch();
          const row = payload.new as {
            id?: string;
            customer_name?: string;
            total_amount?: number | string;
          };
          if (!row?.id) return;
          toast(`New order from ${row.customer_name ?? "a customer"}`, {
            description: formatMoney(Number(row.total_amount ?? 0)),
            action: {
              label: "View",
              onClick: () =>
                void navigate({
                  to: "/price-list-orders/$orderId",
                  params: { orderId: row.id as string },
                }),
            },
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "price_list_orders" },
        () => refetch(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, navigate]);

  return count;
}

/** Marks an order read; retries quietly in the background on failure. */
export function useMarkOrderViewed(orderId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    let attempt = 0;

    const run = async () => {
      const { error } = await supabase
        .from("price_list_orders")
        .update({ is_viewed: true })
        .eq("id", orderId)
        .eq("is_viewed", false);
      if (cancelled) return;
      if (error) {
        attempt += 1;
        if (attempt <= 3) setTimeout(() => void run(), attempt * 3000);
        return;
      }
      void qc.invalidateQueries({ queryKey: UNREAD_KEY });
      void qc.invalidateQueries({ queryKey: ["price-list-orders"] });
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [orderId, qc]);
}
