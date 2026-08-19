import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, CheckCircle2, Printer } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SyncIssuesBanner, SyncStatusLine } from "@/components/SyncIssuesBanner";
import { formatDate, formatMoney } from "@/lib/format";
import { todayISO } from "@/lib/reports";
import { useDailyReconciliation } from "@/lib/reconcile";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reports/reconciliation")({
  head: () => ({
    meta: [
      { title: "Daily Reconciliation — Fragrance Billing" },
      {
        name: "description",
        content:
          "Match a day's cash, bank, card and collections against Bill History and the Payments page.",
      },
      { property: "og:title", content: "Daily Reconciliation — Fragrance Billing" },
      {
        property: "og:description",
        content:
          "Match a day's cash, bank, card and collections against Bill History and the Payments page.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReconciliationReport,
});

function Tile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="numeric mt-1 text-xl font-bold">{formatMoney(value)}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

function ReconciliationReport() {
  const [date, setDate] = useState(todayISO());
  const { data, isLoading } = useDailyReconciliation(date);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daily Reconciliation"
        description="Cash, bank, card and collections for one day — matched against Bill History and the Payments page."
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <Button asChild variant="outline" size="sm">
              <Link to="/reports">
                <ArrowLeft className="h-4 w-4" />
                Reports
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
          </div>
        }
      />

      <div className="print:hidden">
        <SyncIssuesBanner />
      </div>

      <Card className="flex flex-wrap items-end gap-4 p-4">
        <div className="space-y-2">
          <Label htmlFor="recon-date">Date</Label>
          <Input
            id="recon-date"
            type="date"
            className="h-11 w-48"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <p className="text-sm text-muted-foreground">Showing {formatDate(date)}</p>
      </Card>

      {isLoading || !data ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Building the report…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Cash collected" value={data.cashCollected} hint="Payments page" />
            <Tile label="Card collected" value={data.cardCollected} hint="Payments page" />
            <Tile label="Bank collected" value={data.bankCollected} hint="Payments page" />
            <Tile label="Total collections" value={data.totalCollected} hint="All methods" />
          </div>

          <Card className="p-5">
            <h2 className="text-sm font-semibold">Collections by method</h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2">Method</th>
                  <th className="py-2 text-right">Payments</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.collections.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-muted-foreground">
                      No collections recorded on this day.
                    </td>
                  </tr>
                ) : (
                  data.collections.map((c) => (
                    <tr key={c.method} className="border-b border-border/60 last:border-0">
                      <td className="py-2">{c.method}</td>
                      <td className="numeric py-2 text-right text-muted-foreground">{c.count}</td>
                      <td className="numeric py-2 text-right font-semibold">
                        {formatMoney(c.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold">Cross-checks</h2>
            <ul className="mt-3 space-y-3">
              {data.checks.map((c) => (
                <li
                  key={c.label}
                  className={cn(
                    "rounded-lg border p-3",
                    c.ok ? "border-border" : "border-destructive/40 bg-destructive/5",
                  )}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {c.ok ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      )}
                      {c.label}
                    </span>
                    <span className="numeric text-sm">
                      {formatMoney(c.expected)} vs {formatMoney(c.actual)}
                      {!c.ok && (
                        <span className="ml-2 font-semibold text-destructive">
                          diff {formatMoney(Math.abs(c.expected - c.actual))}
                        </span>
                      )}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{c.note}</p>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <SyncStatusLine />
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold">Bill History for this day</h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Bills issued</dt>
                <dd className="numeric text-lg font-semibold">{data.billsCount}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Invoiced</dt>
                <dd className="numeric text-lg font-semibold">{formatMoney(data.billsInvoiced)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Marked paid on those bills</dt>
                <dd className="numeric text-lg font-semibold">
                  {formatMoney(data.billsPaidToday)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              Ledger movement today — cash {formatMoney(data.ledgerCash)}, bank{" "}
              {formatMoney(data.ledgerBank)}.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
