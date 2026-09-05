/**
 * Stock Ledger Audit.
 *
 * Wraps the server routine that compares stored stock against the full
 * movement history, finds finalized bill lines that never deducted stock, and
 * finds warehouse transfers whose two sides do not match.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AuditIssue = {
  type: "missing_deduction" | "transfer_asymmetry" | "stock_mismatch";
  product_id: string;
  product: string | null;
  sku: string | null;
  warehouse_id: string | null;
  warehouse: string | null;
  bill_id?: string;
  bill_number?: string | null;
  quantity?: number;
  quantity_out?: number;
  quantity_in?: number;
  stored?: number;
  expected?: number;
  difference?: number;
};

export type StockAuditReport = {
  mode: "scan" | "repair";
  missing_deductions: number;
  transfer_asymmetries: number;
  stock_mismatches: number;
  products_affected: number;
  details: AuditIssue[];
};

export type StockAuditRun = {
  id: string;
  mode: string;
  mismatch_count: number;
  missing_deduction_count: number;
  transfer_asymmetry_count: number;
  products_affected: number;
  created_at: string;
};

export function useStockAuditRuns() {
  return useQuery({
    queryKey: ["stock-audit-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_audit_runs")
        .select("id, mode, mismatch_count, missing_deduction_count, transfer_asymmetry_count, products_affected, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as StockAuditRun[];
    },
  });
}

/** Total unresolved discrepancies from the latest run — powers the dashboard alert. */
export function useStockDiscrepancyCount() {
  const { data } = useStockAuditRuns();
  const last = data?.[0];
  if (!last) return 0;
  return (
    Number(last.mismatch_count) +
    Number(last.missing_deduction_count) +
    Number(last.transfer_asymmetry_count)
  );
}

export function useStockAudit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (repair: boolean) => {
      const { data, error } = await supabase.rpc("audit_stock_ledger", { p_repair: repair });
      if (error) throw error;
      return data as unknown as StockAuditReport;
    },
    onSuccess: (_r, repair) => {
      void queryClient.invalidateQueries({ queryKey: ["stock-audit-runs"] });
      if (repair) void queryClient.invalidateQueries();
    },
  });
}

/** Applies one correction: trust the calculated history, or a physical recount. */
export function useStockCorrection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      productId: string;
      warehouseId: string;
      mode: "calculated" | "recount";
      counted?: number;
    }) => {
      const { data, error } = await supabase.rpc("apply_stock_correction", {
        p_product_id: input.productId,
        p_warehouse_id: input.warehouseId,
        p_mode: input.mode,
        ...(input.counted === undefined ? {} : { p_counted: input.counted }),
      });
      if (error) throw error;
      return data as unknown as { already_resolved: boolean; stored: number; expected: number };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}

/** Full movement history for one product in one warehouse, with a running total. */
export function useMovementTrail(productId: string | null, warehouseId: string | null) {
  return useQuery({
    queryKey: ["movement-trail", productId, warehouseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id, created_at, movement_type, quantity_change, reason")
        .eq("product_id", productId!)
        .eq("warehouse_id", warehouseId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      let running = 0;
      return (data ?? []).map((m) => {
        running += Number(m.quantity_change);
        return { ...m, running };
      });
    },
    enabled: Boolean(productId && warehouseId),
  });
}
