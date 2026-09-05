/**
 * Customer merge — consolidates two duplicate customer records into one.
 *
 * All reassignment happens inside the `merge_customers` database routine so the
 * whole move either completes or rolls back; the merge is written to
 * `customer_merge_log` for traceability.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MergeableCustomer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes?: string | null;
  total_spend?: number | string | null;
  last_purchase_at?: string | null;
};

export const MERGE_FIELDS = [
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "address", label: "Address" },
  { key: "notes", label: "Notes" },
] as const;

export type MergeFieldKey = (typeof MERGE_FIELDS)[number]["key"];

/** Fields where the two records genuinely differ and need a choice. */
export function differingFields(a: MergeableCustomer, b: MergeableCustomer) {
  return MERGE_FIELDS.filter((f) => {
    const av = (a[f.key] ?? "").toString().trim();
    const bv = (b[f.key] ?? "").toString().trim();
    return av !== bv && (av !== "" || bv !== "");
  });
}

export function useMergeCustomers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      survivorId: string;
      duplicateId: string;
      finalValues: Partial<Record<MergeFieldKey, string | null>>;
    }) => {
      if (!input.survivorId || !input.duplicateId) {
        throw new Error("Pick two customers to merge.");
      }
      if (input.survivorId === input.duplicateId) {
        throw new Error("A customer cannot be merged with itself.");
      }
      const { data, error } = await supabase.rpc("merge_customers", {
        p_survivor_id: input.survivorId,
        p_duplicate_id: input.duplicateId,
        p_final: input.finalValues as never,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}

/** If a customer id was merged away, returns the surviving record it points at. */
export function useMergeRedirect(customerId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["customer-merge-redirect", customerId],
    enabled: enabled && Boolean(customerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_merge_log")
        .select("surviving_customer_id, surviving_customer_name")
        .eq("merged_customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}
