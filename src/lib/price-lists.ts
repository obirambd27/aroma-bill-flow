import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type PriceList = Tables<"price_lists">;
export type PriceListItem = Tables<"price_list_items">;

export type PriceListRow = PriceList & { itemCount: number };

/** All price lists with a count of included products. */
export function usePriceLists() {
  return useQuery({
    queryKey: ["price-lists"],
    queryFn: async () => {
      const [listsRes, itemsRes] = await Promise.all([
        supabase.from("price_lists").select("*").order("updated_at", { ascending: false }),
        supabase.from("price_list_items").select("price_list_id, is_included"),
      ]);
      if (listsRes.error) throw listsRes.error;
      if (itemsRes.error) throw itemsRes.error;
      const counts: Record<string, number> = {};
      for (const it of itemsRes.data ?? []) {
        if (it.is_included) counts[it.price_list_id] = (counts[it.price_list_id] ?? 0) + 1;
      }
      return (listsRes.data ?? []).map((l) => ({
        ...l,
        itemCount: counts[l.id] ?? 0,
      })) as PriceListRow[];
    },
  });
}

export function usePriceList(listId: string) {
  return useQuery({
    queryKey: ["price-list", listId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_lists")
        .select("*")
        .eq("id", listId)
        .maybeSingle();
      if (error) throw error;
      return data as PriceList | null;
    },
    enabled: Boolean(listId),
  });
}

export function usePriceListItems(listId: string) {
  return useQuery({
    queryKey: ["price-list-items", listId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_list_items")
        .select("*")
        .eq("price_list_id", listId);
      if (error) throw error;
      return (data ?? []) as PriceListItem[];
    },
    enabled: Boolean(listId),
  });
}

function randomToken() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function useCreatePriceList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from("price_lists")
        .insert({ name, share_token: randomToken() })
        .select("*")
        .single();
      if (error) throw error;
      return data as PriceList;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["price-lists"] }),
  });
}

export function useDeletePriceList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("price_lists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["price-lists"] }),
  });
}

/** Copies a list (products + custom prices) with a fresh token and sharing off. */
export function useDuplicatePriceList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (source: PriceList) => {
      const { data: created, error } = await supabase
        .from("price_lists")
        .insert({
          name: `${source.name} (Copy)`,
          client_name: source.client_name,
          default_min_quantity: source.default_min_quantity,
          below_min_increase_percent: source.below_min_increase_percent,
          share_token: randomToken(),
          is_share_enabled: false,
        })
        .select("*")
        .single();
      if (error) throw error;
      const { data: items, error: itemsError } = await supabase
        .from("price_list_items")
        .select("product_id, custom_price, is_included")
        .eq("price_list_id", source.id);
      if (itemsError) throw itemsError;
      if (items?.length) {
        const { error: insertError } = await supabase.from("price_list_items").insert(
          items.map((i) => ({
            price_list_id: created.id,
            product_id: i.product_id,
            custom_price: i.custom_price,
            is_included: i.is_included,
          })),
        );
        if (insertError) throw insertError;
      }
      return created as PriceList;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["price-lists"] }),
  });
}

export type SaveSelection = { productId: string; customPrice: number | null };

/** Saves list settings plus its selected products (removes deselected rows). */
export function useSavePriceList(listId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      clientName: string | null;
      minQuantity: number | null;
      increasePercent: number;
      selections: SaveSelection[];
    }) => {
      const { error } = await supabase
        .from("price_lists")
        .update({
          name: input.name,
          client_name: input.clientName,
          default_min_quantity: input.minQuantity,
          below_min_increase_percent: input.increasePercent,
        })
        .eq("id", listId);
      if (error) throw error;

      const { error: deleteError } = await supabase
        .from("price_list_items")
        .delete()
        .eq("price_list_id", listId);
      if (deleteError) throw deleteError;

      if (input.selections.length) {
        const { error: insertError } = await supabase.from("price_list_items").insert(
          input.selections.map((s) => ({
            price_list_id: listId,
            product_id: s.productId,
            custom_price: s.customPrice,
            is_included: true,
          })),
        );
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["price-list", listId] });
      qc.invalidateQueries({ queryKey: ["price-list-items", listId] });
      qc.invalidateQueries({ queryKey: ["price-lists"] });
    },
  });
}

export function useToggleSharing(listId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { enabled: boolean; token: string | null }) => {
      const { error } = await supabase
        .from("price_lists")
        .update({
          is_share_enabled: input.enabled,
          share_token: input.token || randomToken(),
        })
        .eq("id", listId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["price-list", listId] });
      qc.invalidateQueries({ queryKey: ["price-lists"] });
    },
  });
}

export function shareUrl(token: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/order/${token}`;
}
