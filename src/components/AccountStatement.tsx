import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { useAccount, useLedgerEntries } from "@/lib/accounting";
import { formatDate, formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export function AccountStatement({ accountId }: { accountId: string }) {
  const { data: account } = useAccount(accountId);
  const { data: entries = [], isLoading } = useLedgerEntries(accountId);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const rows = useMemo(() => {
    let running = 0;
    const all = entries.map((e) => {
      running += Number(e.amount);
      return { entry: e, balance: running };
    });
    return all.filter(
      ({ entry }) => (!from || entry.entry_date >= from) && (!to || entry.entry_date <= to),
    );
  }, [entries, from, to]);

  const totals = useMemo(() => {
    let inSum = 0;
    let outSum = 0;
    for (const { entry } of rows) {
      const amt = Number(entry.amount);
      if (amt >= 0) inSum += amt;
      else outSum += Math.abs(amt);
    }
    return { inSum, outSum };
  }, [rows]);

  const exportCsv = () => {
    const header = ["Date", "Description", "Type", "Money In", "Money Out", "Running Balance"];
    const body = rows.map(({ entry, balance }) => [
      entry.entry_date,
      (entry.description ?? "").replace(/"/g, '""'),
      entry.entry_type,
      Number(entry.amount) >= 0 ? Number(entry.amount).toFixed(2) : "",
      Number(entry.amount) < 0 ? Math.abs(Number(entry.amount)).toFixed(2) : "",
      balance.toFixed(2),
    ]);
    const csv = [header, ...body].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${account?.name ?? "account"}-statement.csv`.replace(/\s+/g, "-").toLowerCase();
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="surface-card flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end print:hidden">
        <div className="space-y-2">
          <Label htmlFor="st-from">From</Label>
          <Input
            id="st-from"
            type="date"
            className="h-11"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="st-to">To</Label>
          <Input
            id="st-to"
            type="date"
            className="h-11"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
          {(from || to) && (
            <Button
              variant="ghost"
              className="h-11"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
            >
              Clear
            </Button>
          )}
          <Button variant="outline" className="h-11" onClick={exportCsv}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" className="h-11" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile label="Money in" value={formatMoney(totals.inSum)} tone="text-success" />
        <SummaryTile label="Money out" value={formatMoney(totals.outSum)} tone="text-destructive" />
        <SummaryTile
          label="Current balance"
          value={formatMoney(account?.current_balance ?? 0)}
          tone="text-foreground"
        />
      </div>

      <div className="surface-card overflow-hidden">
        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading statement…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No transactions"
            description="Entries appear here as bills, payments, expenses and transfers are recorded."
          />
        ) : (
          <>
            <table className="hidden w-full md:table">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Money in</th>
                  <th className="px-4 py-3 text-right">Money out</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ entry, balance }) => {
                  const amt = Number(entry.amount);
                  return (
                    <tr key={entry.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3 text-sm">{formatDate(entry.entry_date)}</td>
                      <td className="px-4 py-3 text-sm">{entry.description ?? "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone="neutral">{entry.entry_type}</StatusBadge>
                      </td>
                      <td className="numeric px-4 py-3 text-right text-sm font-semibold text-success">
                        {amt >= 0 ? formatMoney(amt) : "—"}
                      </td>
                      <td className="numeric px-4 py-3 text-right text-sm font-semibold text-destructive">
                        {amt < 0 ? formatMoney(Math.abs(amt)) : "—"}
                      </td>
                      <td className="numeric px-4 py-3 text-right text-sm font-semibold">
                        {formatMoney(balance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile feed */}
            <ul className="divide-y divide-border md:hidden">
              {rows.map(({ entry, balance }) => {
                const amt = Number(entry.amount);
                return (
                  <li key={entry.id} className="flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{entry.description ?? "—"}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDate(entry.entry_date)} · {entry.entry_type}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={cn(
                          "numeric text-sm font-bold",
                          amt >= 0 ? "text-success" : "text-destructive",
                        )}
                      >
                        {amt >= 0 ? "+" : "−"}
                        {formatMoney(Math.abs(amt))}
                      </p>
                      <p className="numeric mt-0.5 text-xs text-muted-foreground">
                        {formatMoney(balance)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="surface-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("numeric mt-1 text-xl font-bold", tone)}>{value}</p>
    </div>
  );
}
