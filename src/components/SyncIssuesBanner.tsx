import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ChevronDown, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useFixSyncIssues, useSyncIssues } from "@/lib/reconcile";

const KIND_LABEL: Record<string, string> = {
  bill_overpaid: "Overpaid invoice",
  bill_mismatch: "Bill / payments mismatch",
  payment_mismatch: "Payment amount mismatch",
  ledger_mismatch: "Missing from cash / bank",
};

/**
 * Warns when any payment total, bill total or ledger balance has drifted, with
 * a single button that repairs every affected invoice.
 */
export function SyncIssuesBanner() {
  const { data: issues = [], isLoading } = useSyncIssues();
  const fix = useFixSyncIssues();
  const [open, setOpen] = useState(false);

  if (isLoading || issues.length === 0) return null;

  const handleFix = async () => {
    try {
      const result = await fix.mutateAsync();
      toast.success(
        result.remaining === 0
          ? `Fixed ${result.repaired} record${result.repaired === 1 ? "" : "s"} — everything is in sync.`
          : `Fixed ${result.repaired}, ${result.remaining} still need a manual look.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not fix the mismatches");
    }
  };

  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-semibold">
              {issues.length} record{issues.length === 1 ? "" : "s"} out of sync
            </p>
            <p className="text-xs text-muted-foreground">
              Payment totals, bill totals or account balances don’t agree with each other.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
            Details
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </Button>
          <Button size="sm" onClick={handleFix} disabled={fix.isPending}>
            <Wrench className="h-4 w-4" />
            {fix.isPending ? "Fixing…" : "Fix all"}
          </Button>
        </div>
      </div>

      {open && (
        <ul className="mt-4 space-y-2 border-t border-destructive/20 pt-3">
          {issues.slice(0, 50).map((issue, i) => (
            <li
              key={`${issue.kind}-${issue.billId ?? issue.paymentId}-${i}`}
              className="flex flex-wrap items-baseline justify-between gap-2 text-xs"
            >
              <span className="min-w-0">
                <span className="font-medium">{KIND_LABEL[issue.kind] ?? issue.kind}</span>
                {" · "}
                {issue.billId ? (
                  <Link
                    to="/bills/$billId"
                    params={{ billId: issue.billId }}
                    className="underline underline-offset-2"
                  >
                    {issue.label}
                  </Link>
                ) : (
                  issue.label
                )}
                <span className="text-muted-foreground"> — {issue.detail}</span>
              </span>
              <span className="numeric shrink-0 text-muted-foreground">
                expected {formatMoney(issue.expected)} · found {formatMoney(issue.actual)}
              </span>
            </li>
          ))}
          {issues.length > 50 && (
            <li className="text-xs text-muted-foreground">
              …and {issues.length - 50} more, all covered by “Fix all”.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Small all-clear line, shown on the reconciliation report. */
export function SyncStatusLine() {
  const { data: issues = [], isLoading } = useSyncIssues();
  if (isLoading || issues.length > 0) return null;
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      Bills, payments and account balances all agree.
    </p>
  );
}
