import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ClipboardCheck, ScanSearch, Wrench } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useMovementTrail,
  useStockAudit,
  useStockAuditRuns,
  useStockCorrection,
  type AuditIssue,
  type StockAuditReport,
} from "@/lib/stock-audit";

export const Route = createFileRoute("/_authenticated/stock-audit")({
  head: () => ({
    meta: [
      { title: "Stock Audit — Fragrance Billing" },
      {
        name: "description",
        content:
          "Find and correct stock discrepancies across every product and warehouse in your catalogue.",
      },
      { property: "og:title", content: "Stock Audit — Fragrance Billing" },
      {
        property: "og:description",
        content:
          "Find and correct stock discrepancies across every product and warehouse in your catalogue.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StockAuditPage,
});

const TYPE_LABEL: Record<AuditIssue["type"], string> = {
  stock_mismatch: "Stock mismatch",
  missing_deduction: "Missing deduction",
  transfer_asymmetry: "Transfer mismatch",
};

function StockAuditPage() {
  const [report, setReport] = useState<StockAuditReport | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [drill, setDrill] = useState<AuditIssue | null>(null);
  const [recount, setRecount] = useState("");

  const audit = useStockAudit();
  const correction = useStockCorrection();
  const { data: runs = [] } = useStockAuditRuns();
  const trail = useMovementTrail(drill?.product_id ?? null, drill?.warehouse_id ?? null);

  const rows = report?.details ?? [];
  const rowKey = (i: AuditIssue, index: number) =>
    `${i.type}-${i.product_id}-${i.warehouse_id ?? "none"}-${index}`;

  const counts = useMemo(
    () => ({
      mismatch: report?.stock_mismatches ?? 0,
      missing: report?.missing_deductions ?? 0,
      transfers: report?.transfer_asymmetries ?? 0,
      products: report?.products_affected ?? 0,
    }),
    [report],
  );

  const run = (repair: boolean) => {
    audit.mutate(repair, {
      onSuccess: (result) => {
        setReport(result);
        setSelected({});
        const total =
          result.missing_deductions + result.transfer_asymmetries + result.stock_mismatches;
        if (repair) {
          toast.success(
            total > 0
              ? `${result.missing_deductions} missing deductions backfilled, ${result.transfer_asymmetries} transfer mismatches corrected, ${result.stock_mismatches} stock figures resolved across ${result.products_affected} products.`
              : "Nothing needed fixing — stock matches its history.",
          );
        } else {
          toast[total > 0 ? "warning" : "success"](
            total > 0
              ? `${total} discrepanc${total === 1 ? "y" : "ies"} found.`
              : "No stock discrepancies found.",
          );
        }
      },
      onError: (error) => toast.error((error as Error).message),
    });
  };

  const selectedMismatches = rows.filter(
    (r, i) => r.type === "stock_mismatch" && selected[rowKey(r, i)],
  );

  const bulkTrustHistory = async () => {
    let done = 0;
    for (const row of selectedMismatches) {
      if (!row.warehouse_id) continue;
      try {
        await correction.mutateAsync({
          productId: row.product_id,
          warehouseId: row.warehouse_id,
          mode: "calculated",
        });
        done += 1;
      } catch (error) {
        toast.error((error as Error).message);
      }
    }
    toast.success(`${done} item${done === 1 ? "" : "s"} set to the calculated figure.`);
    setSelected({});
    run(false);
  };

  const applyCorrection = async (mode: "calculated" | "recount") => {
    if (!drill?.warehouse_id) return;
    const counted = Number(recount);
    if (mode === "recount" && !Number.isFinite(counted)) {
      toast.error("Enter the quantity you physically counted");
      return;
    }
    try {
      const result = await correction.mutateAsync({
        productId: drill.product_id,
        warehouseId: drill.warehouse_id,
        mode,
        ...(mode === "recount" ? { counted } : {}),
      });
      if (result.already_resolved) {
        toast.warning("This item was already resolved by someone else — nothing changed.");
      } else {
        toast.success("Stock corrected and logged in the movement history.");
      }
      setDrill(null);
      setRecount("");
      run(false);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const lastRun = runs[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Audit"
        description="Check every product and warehouse against its full movement history."
        actions={
          <>
            <Button variant="outline" disabled={audit.isPending} onClick={() => run(false)}>
              <ScanSearch />
              {audit.isPending ? "Checking…" : "Run audit"}
            </Button>
            <Button variant="secondary" disabled={audit.isPending} onClick={() => run(true)}>
              <Wrench />
              Run audit &amp; fix all
            </Button>
          </>
        }
      />

      {lastRun && (
        <p className="text-sm text-muted-foreground">
          Last check {new Date(lastRun.created_at).toLocaleString()} —{" "}
          {lastRun.mismatch_count + lastRun.missing_deduction_count + lastRun.transfer_asymmetry_count}{" "}
          issue(s) across {lastRun.products_affected} product(s).
        </p>
      )}

      {report && (
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: "Stock mismatches", value: counts.mismatch },
            { label: "Missing deductions", value: counts.missing },
            { label: "Transfer mismatches", value: counts.transfers },
            { label: "Products affected", value: counts.products },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-border bg-card p-4">
              <p className="text-2xl font-semibold">{card.value}</p>
              <p className="text-xs text-muted-foreground">{card.label}</p>
            </div>
          ))}
        </div>
      )}

      {selectedMismatches.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/40 p-3">
          <span className="text-sm">{selectedMismatches.length} selected</span>
          <Button size="sm" disabled={correction.isPending} onClick={bulkTrustHistory}>
            <ClipboardCheck />
            Trust calculated history
          </Button>
        </div>
      )}

      {!report ? (
        <EmptyState
          icon={ScanSearch}
          title="No audit run yet"
          description="Run the audit to compare stored stock against the full movement history."
        />
      ) : rows.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-6 text-sm">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          Every product and warehouse matches its movement history.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-3" />
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Warehouse</th>
                <th className="px-4 py-3">Issue</th>
                <th className="px-4 py-3 text-right">Stored</th>
                <th className="px-4 py-3 text-right">Expected</th>
                <th className="px-4 py-3 text-right">Difference</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const key = rowKey(row, index);
                return (
                  <tr
                    key={key}
                    className="cursor-pointer border-b border-border/60 bg-destructive/5 last:border-0 hover:bg-destructive/10"
                    onClick={() => setDrill(row)}
                  >
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      {row.type === "stock_mismatch" && (
                        <Checkbox
                          checked={Boolean(selected[key])}
                          onCheckedChange={(v) =>
                            setSelected((s) => ({ ...s, [key]: Boolean(v) }))
                          }
                          aria-label={`Select ${row.product ?? "product"}`}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">{row.product ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.sku ?? "—"}</td>
                    <td className="px-4 py-3">{row.warehouse ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        {TYPE_LABEL[row.type]}
                      </span>
                      {row.bill_number && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {row.bill_number}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.type === "stock_mismatch"
                        ? row.stored
                        : row.type === "transfer_asymmetry"
                          ? `${row.quantity_out} out`
                          : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.type === "stock_mismatch"
                        ? row.expected
                        : row.type === "transfer_asymmetry"
                          ? `${row.quantity_in} in`
                          : (row.quantity ?? "—")}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {row.type === "stock_mismatch"
                        ? row.difference
                        : row.type === "transfer_asymmetry"
                          ? Number(row.quantity_out ?? 0) - Number(row.quantity_in ?? 0)
                          : row.quantity}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={Boolean(drill)} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{drill?.product ?? "Movement history"}</DialogTitle>
            <DialogDescription>
              {drill?.warehouse ?? "Warehouse"} — every movement with a running total.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2 text-right">Change</th>
                  <th className="px-3 py-2 text-right">Running</th>
                </tr>
              </thead>
              <tbody>
                {(trail.data ?? []).map((m) => (
                  <tr key={m.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2">{new Date(m.created_at).toLocaleDateString()}</td>
                    <td className="px-3 py-2">{m.movement_type}</td>
                    <td className="px-3 py-2 text-muted-foreground">{m.reason ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{Number(m.quantity_change)}</td>
                    <td className="px-3 py-2 text-right font-medium">{m.running}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <DialogFooter className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Input
                value={recount}
                onChange={(e) => setRecount(e.target.value)}
                placeholder="Physical count"
                inputMode="numeric"
                className="w-36"
                aria-label="Verified physical count"
              />
              <Button
                variant="outline"
                disabled={correction.isPending}
                onClick={() => applyCorrection("recount")}
              >
                Trust recount
              </Button>
            </div>
            <Button disabled={correction.isPending} onClick={() => applyCorrection("calculated")}>
              Trust calculated history
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
