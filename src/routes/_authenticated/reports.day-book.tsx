import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronLeft, ChevronRight, BookOpen } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { ExportMenu, Field, FilterPanel, SummaryCards } from "@/components/ReportChrome";
import { formatDate, formatMoney } from "@/lib/format";
import { downloadCSV, printReport } from "@/lib/export";
import { cashDelta, shiftDay, todayISO, txnTone, useTransactions } from "@/lib/reports";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reports/day-book")({
  head: () => ({
    meta: [
      { title: "Day Book — Fragrance Billing" },
      { name: "description", content: "Every transaction for a day, in chronological order." },
      { property: "og:title", content: "Day Book — Fragrance Billing" },
      {
        property: "og:description",
        content: "Every transaction for a day, in chronological order.",
      },
    ],
  }),
  component: DayBook,
});

function timeOf(at: string) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function DayBook() {
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const range = useMemo(() => ({ from: from <= to ? from : to, to: to >= from ? to : from }), [from, to]);
  const { data: all = [], isLoading } = useTransactions(range);

  const rows = useMemo(() => [...all].sort((a, b) => a.at.localeCompare(b.at)), [all]);

  const totals = useMemo(() => {
    let inAmt = 0;
    let outAmt = 0;
    for (const t of rows) {
      const d = cashDelta(t);
      if (d > 0) inAmt += d;
      if (d < 0) outAmt += -d;
    }
    return { inAmt, outAmt, net: inAmt - outAmt };
  }, [rows]);

  const stepDay = (delta: number) => {
    const next = shiftDay(range.from, delta);
    setFrom(next);
    setTo(next);
  };

  const headers = ["Time", "Type", "Reference", "Party", "Description", "In", "Out"];
  const exportRows = rows.map((t) => [
    `${t.date} ${timeOf(t.at)}`,
    t.type,
    t.reference,
    t.party,
    t.description,
    t.direction === "in" ? t.amount : "",
    t.direction === "out" ? t.amount : "",
  ]);

  const onExport = (f: "pdf" | "csv" | "xlsx") => {
    const name = `day-book-${range.from}${range.from === range.to ? "" : `_${range.to}`}`;
    if (f === "csv") return downloadCSV(name, headers, exportRows);
    printReport({
      title: "Day Book",
      subtitle:
        range.from === range.to
          ? formatDate(range.from)
          : `${formatDate(range.from)} – ${formatDate(range.to)}`,
      summary: [
        { label: "Cash In", value: formatMoney(totals.inAmt) },
        { label: "Cash Out", value: formatMoney(totals.outAmt) },
        { label: "Net Movement", value: formatMoney(totals.net) },
        { label: "Transactions", value: String(rows.length) },
      ],
      headers,
      rows: exportRows.map((r) =>
        r.map((c, i) => (i >= 5 ? (c === "" ? "" : formatMoney(Number(c))) : c)),
      ),
      numericFrom: 5,
    });
  };

  return (
    <>
      <PageHeader
        title="Day Book"
        description={
          range.from === range.to
            ? formatDate(range.from)
            : `${formatDate(range.from)} – ${formatDate(range.to)}`
        }
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/reports">
                <ArrowLeft className="h-4 w-4" /> Reports
              </Link>
            </Button>
            <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => stepDay(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" aria-label="Next day" onClick={() => stepDay(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <ExportMenu onExport={onExport} formats={["pdf", "csv"]} disabled={rows.length === 0} />
          </>
        }
      />

      <FilterPanel>
        <Field label="From">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Quick">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setFrom(todayISO());
              setTo(todayISO());
            }}
          >
            Today
          </Button>
        </Field>
      </FilterPanel>

      <SummaryCards
        items={[
          { label: "Transactions", value: String(rows.length) },
          { label: "Cash In", value: formatMoney(totals.inAmt) },
          { label: "Cash Out", value: formatMoney(totals.outAmt) },
          { label: "Net Movement", value: formatMoney(totals.net) },
        ]}
      />

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading day book…</Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title="Nothing happened here"
            description="No transactions were recorded for this date."
          />
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 text-left">Time</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Reference</th>
                  <th className="px-3 py-2 text-left">Party</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((t) => (
                  <tr key={t.key} className="hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {timeOf(t.at)}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge tone={txnTone(t.type)}>{t.type}</StatusBadge>
                    </td>
                    <td className="px-3 py-2">
                      {t.link ? (
                        <Link
                          to={t.link.to}
                          params={t.link.params as never}
                          className="font-medium hover:underline"
                        >
                          {t.reference}
                        </Link>
                      ) : (
                        t.reference
                      )}
                    </td>
                    <td className="px-3 py-2">{t.party}</td>
                    <td className="px-3 py-2 text-muted-foreground">{t.description}</td>
                    <td
                      className={cn(
                        "whitespace-nowrap px-3 py-2 text-right font-semibold",
                        t.direction === "in" && "text-success",
                        t.direction === "out" && "text-destructive",
                      )}
                    >
                      {t.direction === "out" ? "-" : t.direction === "in" ? "+" : ""}
                      {formatMoney(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/40 font-semibold">
                  <td className="px-3 py-2" colSpan={5}>
                    Net cash movement for the day
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right",
                      totals.net >= 0 ? "text-success" : "text-destructive",
                    )}
                  >
                    {formatMoney(totals.net)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>

          <div className="space-y-3 md:hidden">
            {rows.map((t) => (
              <Card key={t.key} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <StatusBadge tone={txnTone(t.type)}>{t.type}</StatusBadge>
                    <p className="mt-1.5 truncate text-sm font-semibold">{t.party}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {timeOf(t.at)} · {t.reference}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{t.description}</p>
                  </div>
                  <p
                    className={cn(
                      "shrink-0 text-base font-semibold",
                      t.direction === "in" && "text-success",
                      t.direction === "out" && "text-destructive",
                    )}
                  >
                    {t.direction === "out" ? "-" : t.direction === "in" ? "+" : ""}
                    {formatMoney(t.amount)}
                  </p>
                </div>
              </Card>
            ))}
            <Card className="flex items-center justify-between p-4">
              <span className="text-sm font-medium">Net cash movement</span>
              <span
                className={cn(
                  "text-base font-semibold",
                  totals.net >= 0 ? "text-success" : "text-destructive",
                )}
              >
                {formatMoney(totals.net)}
              </span>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
