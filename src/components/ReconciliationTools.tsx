/**
 * Reconciliation Tools panel (Day Book).
 *
 * Two rate-limited safety-net buttons: one repairs payment ledger asymmetry,
 * one repairs stock against its movement history. Results appear inline.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Coins, Loader2, Package, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  countdownTo,
  RUN_LIMIT,
  useManualReconcile,
  useReconcileAvailability,
  type ReconcileKind,
  type ReconcileOutcome,
} from "@/lib/reconcile-tools";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function stamp(iso: string | null) {
  if (!iso) return "Never run";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ToolRow({
  kind,
  title,
  description,
  icon: Icon,
  label,
}: {
  kind: ReconcileKind;
  title: string;
  description: string;
  icon: typeof Coins;
  label: string;
}) {
  const { data: availability } = useReconcileAvailability(kind);
  const run = useManualReconcile(kind);
  const [result, setResult] = useState<ReconcileOutcome | null>(null);

  const waiting = availability?.nextAvailableAt ? countdownTo(availability.nextAvailableAt) : null;
  const blocked = Boolean(availability && !availability.available && waiting);

  const handleRun = async () => {
    setResult(null);
    try {
      const outcome = await run.mutateAsync();
      setResult(outcome);
      toast.success(outcome.summary);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reconcile could not finish");
    }
  };

  return (
    <div className="rounded-lg border border-border/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </span>
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Last run: {stamp(availability?.lastRunAt ?? null)} ·{" "}
              <span className={cn(blocked ? "text-amber-600" : "text-success")}>
                {blocked
                  ? `Next reconcile available in ${waiting}`
                  : `Ready · ${availability?.runsLeft ?? RUN_LIMIT} of ${RUN_LIMIT} runs left`}
              </span>
            </p>
          </div>
        </div>
        <Button size="sm" onClick={handleRun} disabled={run.isPending || blocked}>
          {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {run.isPending ? "Checking…" : label}
        </Button>
      </div>

      {result && (
        <div className="mt-3 space-y-2 rounded-md bg-muted/50 p-3 text-xs">
          <p className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            {result.summary}
          </p>
          {result.transferMismatches > 0 && (
            <p className="flex flex-wrap items-center gap-2 text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              {result.transferMismatches} transfer mismatch
              {result.transferMismatches === 1 ? "" : "es"} found — review in Stock Ledger Audit
              <Link to="/stock-audit" className="font-medium underline underline-offset-2">
                Open Stock Audit
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function ReconciliationTools() {
  return (
    <Card className="p-5">
      <div className="mb-4">
        <h2 className="font-display text-base font-semibold tracking-tight">Reconciliation Tools</h2>
        <p className="text-xs text-muted-foreground">
          Daily safety nets. Each can be run {RUN_LIMIT} times every 8 hours.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <ToolRow
          kind="payments"
          title="Final Reconcile (Payments)"
          description="Checks every account for missing or one-sided payment entries and appends corrections."
          icon={Coins}
          label="Final Reconcile"
        />
        <ToolRow
          kind="stock"
          title="Reconcile Stock"
          description="Rebuilds stock from its movement history. Transfer mismatches are flagged, not guessed."
          icon={Package}
          label="Reconcile Stock"
        />
      </div>
    </Card>
  );
}
