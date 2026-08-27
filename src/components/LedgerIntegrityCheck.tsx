import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ShieldCheck, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import {
  useLedgerIntegrityCheck,
  useLedgerIntegrityRuns,
  type IntegrityReport,
} from "@/lib/ledger-integrity";

/** Admin tool: scans the ledger for asymmetric money and optionally repairs it. */
export function LedgerIntegrityCheck() {
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const check = useLedgerIntegrityCheck();
  const { data: runs } = useLedgerIntegrityRuns();

  const run = (repair: boolean) => {
    check.mutate(repair, {
      onSuccess: (result) => {
        setReport(result);
        const issues = result.phantom_count + result.missing_forward_count;
        if (repair) {
          toast.success(
            issues > 0
              ? `Corrected ${issues} entr${issues === 1 ? "y" : "ies"} totalling ${formatCurrency(result.total_amount)}.`
              : "Nothing needed fixing — the ledger is balanced.",
          );
        } else {
          toast[issues > 0 ? "warning" : "success"](
            issues > 0
              ? `Found ${issues} issue${issues === 1 ? "" : "s"} to review.`
              : "No ledger issues found.",
          );
        }
      },
      onError: (error) => toast.error((error as Error).message),
    });
  };

  const issues = report ? report.phantom_count + report.missing_forward_count : 0;
  const lastRun = runs?.[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={check.isPending} onClick={() => run(false)}>
          <ShieldCheck />
          {check.isPending ? "Checking…" : "Run check"}
        </Button>
        <Button
          variant="secondary"
          disabled={check.isPending || (report ? issues === 0 : false)}
          onClick={() => run(true)}
        >
          <Wrench />
          Run check &amp; repair
        </Button>
      </div>

      {report && (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <div className="flex items-start gap-2 text-sm">
            {issues === 0 ? (
              <CheckCircle2 className="mt-0.5 size-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="mt-0.5 size-4 text-amber-600" />
            )}
            <p>
              {issues === 0
                ? "Every reversal has a matching original entry and every collection is reflected in an account balance."
                : `Found ${report.phantom_count} unmatched reversal${report.phantom_count === 1 ? "" : "s"} and ${report.missing_forward_count} collection${report.missing_forward_count === 1 ? "" : "s"} missing from account balances across ${report.accounts_affected} account${report.accounts_affected === 1 ? "" : "s"}${report.mode === "repair" ? ` — corrections applied totalling ${formatCurrency(report.total_amount)}` : ""}.`}
            </p>
          </div>

          {report.details.length > 0 && (
            <ul className="space-y-2 text-sm">
              {report.details.map((d, i) => (
                <li key={d.entry_id ?? d.payment_id ?? i} className="rounded-lg bg-muted/50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 font-medium">
                    <span>
                      {d.kind === "phantom_reversal"
                        ? "Reversal without an original entry"
                        : "Collection missing from account balance"}
                    </span>
                    <span>{formatCurrency(Math.abs(Number(d.amount)))}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {d.account} · {d.entry_date} · {d.description ?? "—"} ·{" "}
                    {d.corrected ? "corrected" : "not corrected yet"}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {report.warnings.length > 0 && (
            <ul className="space-y-2 text-sm">
              {report.warnings.map((w) => (
                <li key={w.entry_id} className="rounded-lg bg-amber-500/10 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 font-medium">
                    <span>{w.description}</span>
                    <span>{formatCurrency(Math.abs(Number(w.amount)))}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {w.account} · {w.entry_date} · review manually
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {lastRun && !report && (
        <p className="text-xs text-muted-foreground">
          Last check {new Date(lastRun.created_at).toLocaleString()} — {lastRun.phantom_count}{" "}
          unmatched reversal(s), {lastRun.missing_forward_count} missing collection(s),{" "}
          {formatCurrency(Number(lastRun.corrected_total))} corrected.
        </p>
      )}
    </div>
  );
}
