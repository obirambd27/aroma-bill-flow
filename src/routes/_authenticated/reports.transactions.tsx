import { useMemo, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ArrowLeft, ListChecks } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { ExportMenu, Field, FilterPanel, SummaryCards } from "@/components/ReportChrome";
import { formatDate, formatMoney } from "@/lib/format";
import { downloadCSV, downloadXLSX, printReport } from "@/lib/export";
import {
  presetRange,
  TXN_TYPES,
  txnTone,
  useTransactions,
  type Preset,
  type TxnType,
} from "@/lib/reports";
import { useAccounts } from "@/lib/accounting";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reports/transactions")({
  head: () => ({
    meta: [
      { title: "All Transactions — Fragrance Billing" },
      { name: "description", content: "Master filterable log across every transaction type." },
      { property: "og:title", content: "All Transactions — Fragrance Billing" },
      {
        property: "og:description",
        content: "Master filterable log across every transaction type.",
      },
    ],
  }),
  component: AllTransactions,
});

function AllTransactions() {
  const navigate = useNavigate();
  const [preset, setPreset] = useState<Preset>("month");
  const [range, setRange] = useState(() => presetRange("month"));
  const [types, setTypes] = useState<TxnType[]>([]);
  const [party, setParty] = useState("");
  const [accountId, setAccountId] = useState("all");

  const { data: all = [], isLoading } = useTransactions(range);
  const { data: accounts = [] } = useAccounts();

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p !== "custom") setRange(presetRange(p));
  };

  const toggleType = (t: TxnType) =>
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const rows = useMemo(() => {
    const q = party.trim().toLowerCase();
    return all.filter((t) => {
      if (types.length > 0 && !types.includes(t.type)) return false;
      if (q && !t.party.toLowerCase().includes(q)) return false;
      if (accountId !== "all" && t.accountId !== accountId) return false;
      return true;
    });
  }, [all, types, party, accountId]);

  const totals = useMemo(() => {
    let inAmt = 0;
    let outAmt = 0;
    for (const t of rows) {
      if (t.direction === "in") inAmt += t.amount;
      if (t.direction === "out") outAmt += t.amount;
    }
    return { inAmt, outAmt, net: inAmt - outAmt, count: rows.length };
  }, [rows]);

  const headers = ["Date", "Type", "Reference", "Party", "Account", "Amount", "Status"];
  const exportRows = rows.map((t) => [
    t.date,
    t.type,
    t.reference,
    t.party,
    t.account,
    t.direction === "out" ? -t.amount : t.amount,
    t.status,
  ]);

  const onExport = (f: "pdf" | "csv" | "xlsx") => {
    const name = `all-transactions-${range.from}_${range.to}`;
    if (f === "csv") return downloadCSV(name, headers, exportRows);
    if (f === "xlsx") return downloadXLSX(name, "Transactions", headers, exportRows);
    printReport({
      title: "All Transactions",
      subtitle: `${formatDate(range.from)} – ${formatDate(range.to)}`,
      summary: [
        { label: "Transactions", value: String(totals.count) },
        { label: "Total In", value: formatMoney(totals.inAmt) },
        { label: "Total Out", value: formatMoney(totals.outAmt) },
        { label: "Net", value: formatMoney(totals.net) },
      ],
      headers,
      rows: exportRows.map((r) => r.map((c, i) => (i === 5 ? formatMoney(Number(c)) : c))),
      numericFrom: 5,
    });
  };

  const openRow = (link?: { to: string; params?: Record<string, string> }) => {
    if (!link) return;
    navigate({ to: link.to, params: link.params as never });
  };

  return (
    <>
      <PageHeader
        title="All Transactions"
        description={`${formatDate(range.from)} – ${formatDate(range.to)}`}
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/reports">
                <ArrowLeft className="h-4 w-4" /> Reports
              </Link>
            </Button>
            <ExportMenu onExport={onExport} disabled={rows.length === 0} />
          </>
        }
      />

      <FilterPanel>
        <Field label="Period">
          <Select value={preset} onValueChange={(v) => applyPreset(v as Preset)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="From">
          <Input
            type="date"
            value={range.from}
            onChange={(e) => {
              setPreset("custom");
              setRange((r) => ({ ...r, from: e.target.value }));
            }}
          />
        </Field>
        <Field label="To">
          <Input
            type="date"
            value={range.to}
            onChange={(e) => {
              setPreset("custom");
              setRange((r) => ({ ...r, to: e.target.value }));
            }}
          />
        </Field>
        <Field label="Party">
          <Input
            placeholder="Customer or vendor…"
            value={party}
            onChange={(e) => setParty(e.target.value)}
          />
        </Field>
        <Field label="Account">
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
          <p className="text-xs font-medium text-muted-foreground">Transaction type</p>
          <div className="flex flex-wrap gap-1.5">
            {TXN_TYPES.map((t) => {
              const active = types.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleType(t)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {t}
                </button>
              );
            })}
            {types.length > 0 && (
              <button
                type="button"
                onClick={() => setTypes([])}
                className="rounded-full px-3 py-1 text-xs font-medium text-muted-foreground underline"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </FilterPanel>

      <SummaryCards
        items={[
          { label: "Transactions", value: String(totals.count) },
          { label: "Total In", value: formatMoney(totals.inAmt) },
          { label: "Total Out", value: formatMoney(totals.outAmt) },
          { label: "Net", value: formatMoney(totals.net) },
        ]}
      />

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading transactions…</Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListChecks}
            title="No transactions match"
            description="Try widening the date range or clearing some filters."
          />
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Reference</th>
                  <th className="px-3 py-2 text-left">Party</th>
                  <th className="px-3 py-2 text-left">Account</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((t) => (
                  <tr
                    key={t.key}
                    onClick={() => openRow(t.link)}
                    className={cn("hover:bg-muted/30", t.link && "cursor-pointer")}
                  >
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(t.date)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge tone={txnTone(t.type)}>{t.type}</StatusBadge>
                    </td>
                    <td className="px-3 py-2 font-medium">{t.reference}</td>
                    <td className="px-3 py-2">{t.party}</td>
                    <td className="px-3 py-2 text-muted-foreground">{t.account}</td>
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
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                      {t.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="space-y-3 md:hidden">
            {rows.map((t) => (
              <Card
                key={t.key}
                onClick={() => openRow(t.link)}
                className={cn("p-4", t.link && "cursor-pointer")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <StatusBadge tone={txnTone(t.type)}>{t.type}</StatusBadge>
                    <p className="mt-1.5 truncate text-sm font-semibold">{t.party}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDate(t.date)} · {t.reference}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{t.account}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        "text-base font-semibold",
                        t.direction === "in" && "text-success",
                        t.direction === "out" && "text-destructive",
                      )}
                    >
                      {t.direction === "out" ? "-" : t.direction === "in" ? "+" : ""}
                      {formatMoney(t.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">{t.status}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
