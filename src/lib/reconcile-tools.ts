/**
 * Manual reconciliation tools shown on the Day Book.
 *
 * Two independent one-click safety nets:
 *  - Payments: the Ledger Integrity Check (phantom reversals / missing forward entries)
 *  - Stock: the Stock Ledger Audit, repairing mismatches and missing deductions but
 *    never guessing at warehouse transfer mismatches
 *
 * Both are rate limited to RUN_LIMIT successful runs per rolling WINDOW_HOURS.
 * The limit is derived from the server-side `reconcile_runs` log, so it survives
 * reloads, new sessions and other devices. Failed runs are logged but never
 * consume an allowance.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { IntegrityReport } from "@/lib/ledger-integrity";
import type { StockAuditReport } from "@/lib/stock-audit";

export const RUN_LIMIT = 2;
export const WINDOW_HOURS = 8;

export type ReconcileKind = "payments" | "stock";

export type ReconcileRun = {
  id: string;
  kind: string;
  trigger: string;
  success: boolean;
  issues_found: number;
  issues_corrected: number;
  summary: string | null;
  created_at: string;
};

export type ReconcileOutcome = {
  summary: string;
  found: number;
  corrected: number;
  /** Transfer mismatches deliberately left for manual review (stock only). */
  transferMismatches: number;
};

async function logRun(input: {
  kind: ReconcileKind;
  trigger: "Manual" | "Auto-on-Edit";
  success: boolean;
  found?: number;
  corrected?: number;
  summary: string;
  details?: unknown;
}) {
  await supabase.from("reconcile_runs").insert({
    kind: input.kind,
    trigger: input.trigger,
    success: input.success,
    issues_found: input.found ?? 0,
    issues_corrected: input.corrected ?? 0,
    summary: input.summary,
    details: (input.details ?? {}) as Json,
  });
}

/** Public logger so the automatic reconcile on bill edit joins the same trail. */
export function logAutoReconcile(input: {
  success: boolean;
  summary: string;
  details?: unknown;
}) {
  return logRun({
    kind: "payments",
    trigger: "Auto-on-Edit",
    success: input.success,
    summary: input.summary,
    ...(input.details === undefined ? {} : { details: input.details }),
  });
}

function windowStart() {
  return new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();
}

async function fetchRecentManualRuns(kind: ReconcileKind) {
  const { data, error } = await supabase
    .from("reconcile_runs")
    .select("id, kind, trigger, success, issues_found, issues_corrected, summary, created_at")
    .eq("kind", kind)
    .eq("trigger", "Manual")
    .eq("success", true)
    .gte("created_at", windowStart())
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ReconcileRun[];
}

export type ReconcileAvailability = {
  runsUsed: number;
  runsLeft: number;
  available: boolean;
  nextAvailableAt: string | null;
  lastRunAt: string | null;
};

/** Availability + last-run timestamp for one button, read from the server log. */
export function useReconcileAvailability(kind: ReconcileKind) {
  return useQuery({
    queryKey: ["reconcile-availability", kind],
    queryFn: async (): Promise<ReconcileAvailability> => {
      const recent = await fetchRecentManualRuns(kind);
      const { data: last } = await supabase
        .from("reconcile_runs")
        .select("created_at")
        .eq("kind", kind)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const runsUsed = recent.length;
      const oldestInWindow = recent[recent.length - 1];
      const nextAvailableAt =
        runsUsed >= RUN_LIMIT && oldestInWindow
          ? new Date(
              new Date(oldestInWindow.created_at).getTime() + WINDOW_HOURS * 60 * 60 * 1000,
            ).toISOString()
          : null;

      return {
        runsUsed,
        runsLeft: Math.max(RUN_LIMIT - runsUsed, 0),
        available: runsUsed < RUN_LIMIT,
        nextAvailableAt,
        lastRunAt: last?.created_at ?? null,
      };
    },
    refetchInterval: 60_000,
  });
}

/** Recent reconcile activity (both kinds, manual and automatic) for the audit trail. */
export function useReconcileRuns(limit = 6) {
  return useQuery({
    queryKey: ["reconcile-runs", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reconcile_runs")
        .select("id, kind, trigger, success, issues_found, issues_corrected, summary, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as ReconcileRun[];
    },
  });
}

async function assertAllowed(kind: ReconcileKind) {
  const recent = await fetchRecentManualRuns(kind);
  if (recent.length >= RUN_LIMIT) {
    const oldest = recent[recent.length - 1]!;
    const next = new Date(
      new Date(oldest.created_at).getTime() + WINDOW_HOURS * 60 * 60 * 1000,
    );
    throw new Error(
      `Limit reached — next reconcile available ${next.toLocaleString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "short",
      })}`,
    );
  }
}

/** Runs one of the two manual reconciles, enforcing the limit and logging the outcome. */
export function useManualReconcile(kind: ReconcileKind) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ReconcileOutcome> => {
      await assertAllowed(kind);

      if (kind === "payments") {
        try {
          const { data, error } = await supabase.rpc("audit_ledger_integrity", { p_repair: true });
          if (error) throw error;
          const report = data as unknown as IntegrityReport;
          const found = Number(report.phantom_count) + Number(report.missing_forward_count);
          const summary =
            found > 0
              ? `${found} discrepanc${found === 1 ? "y" : "ies"} found and corrected across ${report.accounts_affected} account${report.accounts_affected === 1 ? "" : "s"}`
              : "No issues found — ledger is clean";
          await logRun({
            kind,
            trigger: "Manual",
            success: true,
            found,
            corrected: found,
            summary,
            details: report,
          });
          return { summary, found, corrected: found, transferMismatches: 0 };
        } catch (err) {
          const message = err instanceof Error ? err.message : "Reconcile failed";
          await logRun({ kind, trigger: "Manual", success: false, summary: message });
          throw err;
        }
      }

      try {
        const { data, error } = await supabase.rpc("audit_stock_ledger", {
          p_repair: true,
          p_skip_transfer_repair: true,
        });
        if (error) throw error;
        const report = data as unknown as StockAuditReport;
        const transfers = Number(report.transfer_asymmetries) || 0;
        const corrected =
          (Number(report.missing_deductions) || 0) + (Number(report.stock_mismatches) || 0);
        const summary =
          corrected > 0
            ? `${corrected} stock discrepanc${corrected === 1 ? "y" : "ies"} found and corrected across ${report.products_affected} product${report.products_affected === 1 ? "" : "s"}`
            : "No issues found — stock matches its history";
        await logRun({
          kind,
          trigger: "Manual",
          success: true,
          found: corrected + transfers,
          corrected,
          summary,
          details: report,
        });
        return { summary, found: corrected + transfers, corrected, transferMismatches: transfers };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Reconcile failed";
        await logRun({ kind, trigger: "Manual", success: false, summary: message });
        throw err;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}

/** "3 hours 12 minutes" style countdown text. */
export function countdownTo(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours} hour${hours === 1 ? "" : "s"} ${minutes} minute${minutes === 1 ? "" : "s"}`;
}
