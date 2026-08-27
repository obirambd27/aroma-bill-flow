/**
 * Ledger Integrity Check.
 *
 * Wraps the server routine that looks for money asymmetry in the ledger:
 *  - reversals that were booked without an original entry (phantom deductions)
 *  - collections that never reached an account balance
 *  - original entries left behind after their collection was deleted
 *
 * The check is report-only by default; repair appends correction entries and
 * recalculates every account balance from full history.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type IntegrityDetail = {
  kind: "phantom_reversal" | "missing_forward";
  entry_id?: string;
  payment_id?: string;
  account: string;
  amount: number;
  entry_date: string;
  description: string | null;
  corrected: boolean;
  correction_entry_id: string | null;
};

export type IntegrityWarning = {
  kind: string;
  entry_id: string;
  account: string;
  amount: number;
  entry_date: string;
  description: string;
};

export type IntegrityReport = {
  ok: boolean;
  mode: "report" | "repair";
  phantom_count: number;
  missing_forward_count: number;
  total_amount: number;
  accounts_affected: number;
  details: IntegrityDetail[];
  warnings: IntegrityWarning[];
};

async function runAudit(repair: boolean): Promise<IntegrityReport> {
  const { data, error } = await supabase.rpc("audit_ledger_integrity", { p_repair: repair });
  if (error) throw error;
  return data as unknown as IntegrityReport;
}

export function useLedgerIntegrityRuns() {
  return useQuery({
    queryKey: ["ledger-integrity-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ledger_integrity_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });
}

export function useLedgerIntegrityCheck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (repair: boolean) => runAudit(repair),
    onSuccess: (_r, repair) => {
      void queryClient.invalidateQueries({ queryKey: ["ledger-integrity-runs"] });
      if (repair) void queryClient.invalidateQueries();
    },
  });
}
