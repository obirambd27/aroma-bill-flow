import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Filter, Printer, RefreshCw, Search, Sheet } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ReconciliationTools } from "@/components/ReconciliationTools";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { Field, FilterPanel } from "@/components/ReportChrome";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate, formatMoney } from "@/lib/format";
import { downloadXLSX, printReport } from "@/lib/export";
import { shiftDay, todayISO } from "@/lib/reports";
import {
  useDayBook,
  useDayBookOverride,
  useSaveDayBookOverride,
  voucherTone,
  VOUCHER_TYPES,
  type VoucherType,
} from "@/lib/day-book";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reports/day-book")({
  head: () => ({
    meta: [
      { title: "Day Book — Fragrance Billing" },
      {
        name: "description",
        content: "Daily cash reconciliation: opening and closing cash, collections and vouchers.",
      },
      { property: "og:title", content: "Day Book — Fragrance Billing" },
      {
        property: "og:description",
        content: "Daily cash reconciliation: opening and closing cash, collections and vouchers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DayBookPage,
});

function timeOf(at: string) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "positive" | "negative";
}) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-display text-lg font-semibold tracking-tight sm:text-xl",
          tone === "positive" && "text-success",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

function DayBookPage() {
  const navigate = useNavigate();
  const [date, setDate] = useState(todayISO());
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<VoucherType[]>([]);
  const [overrideInput, setOverrideInput] = useState("");
  const [touchedOverride, setTouchedOverride] = useState(false);

  const { data: book, isLoading, refetch, isFetching } = useDayBook(date);
  const { data: override } = useDayBookOverride(date);
  const saveOverride = useSaveDayBookOverride();

  const overrideValue = touchedOverride
    ? overrideInput
    : override
      ? String(override.opening_cash)
      : "";

  const rows = useMemo(() => {
    const list = book?.vouchers ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((v) => {
      if (types.length > 0 && !types.includes(v.type)) return false;
      if (!q) return true;
      return (
        v.party.toLowerCase().includes(q) ||
        v.number.toLowerCase().includes(q) ||
        v.reference.toLowerCase().includes(q)
      );
    });
  }, [book, query, types]);

  const typeSummary = useMemo(() => {
    const map = new Map<VoucherType, { count: number; total: number }>();
    for (const v of book?.vouchers ?? []) {
      const cur = map.get(v.type) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += v.amount;
      map.set(v.type, cur);
    }
    return VOUCHER_TYPES.filter((t) => map.has(t)).map((t) => ({
      type: t,
      ...(map.get(t) as { count: number; total: number }),
    }));
  }, [book]);

  const applyOverride = async () => {
    const raw = overrideValue.trim();
    const value = raw === "" ? null : Number(raw);
    if (value !== null && Number.isNaN(value)) {
      toast.error("Opening cash override must be a number");
      return;
    }
    await saveOverride.mutateAsync({ date, value });
    setTouchedOverride(false);
    await refetch();
    toast.success(value === null ? "Opening cash back to auto" : "Day book recalculated");
  };

  const headers = ["Time", "Date", "Type", "Number", "Party", "Reference", "Amount", "Status"];
  const exportRows = rows.map((v) => [
    timeOf(v.at),
    v.date,
    v.type,
    v.number,
    v.party,
    v.reference,
    v.amount,
    v.status,
  ]);

  const summaryPairs = book
    ? [
        { label: "Opening Cash", value: formatMoney(book.openingCash) },
        { label: "Closing Cash", value: formatMoney(book.closingCash) },
        { label: "Cash Collection", value: formatMoney(book.collection["Cash"] ?? 0) },
        { label: "POS (Card Payment)", value: formatMoney(book.collection["Card Payment"] ?? 0) },
        { label: "Bank Transfer", value: formatMoney(book.collection["Bank Transfer"] ?? 0) },
        { label: "Total Purchase Bills", value: formatMoney(book.totalPurchaseBills) },
        { label: "Total Expenses", value: formatMoney(book.totalExpenses) },
        { label: "Collected — Other Inv. Date", value: formatMoney(book.collectedOtherInvoiceDate) },
        { label: "Cash → Bank", value: formatMoney(book.cashToBank) },
        { label: "Bank → Cash", value: formatMoney(book.bankToCash) },
        { label: "Net Sales", value: formatMoney(book.netSales) },
        { label: "Net Purchases", value: formatMoney(book.netPurchases) },
        { label: "Total Collected", value: formatMoney(book.totalCollected) },
        { label: "Total Out", value: formatMoney(book.totalOut) },
        { label: "Net Cash Movement", value: formatMoney(book.netCashMovement) },
      ]
    : [];

  const onExcel = () => {
    if (!book) return;
    const sheetRows: (string | number)[][] = [
      ...summaryPairs.map((s) => [s.label, s.value]),
      ["", ""],
      ["Type", "Count", "Total"],
      ...typeSummary.map((t) => [t.type, t.count, t.total] as (string | number)[]),
      ["", ""],
      headers as unknown as (string | number)[],
      ...(exportRows as (string | number)[][]),
    ];
    downloadXLSX(`day-book-${date}`, "Day Book", ["Day Book", formatDate(date)], sheetRows);
  };

  const onPrint = () => {
    printReport({
      title: "Day Book",
      subtitle: formatDate(date),
      summary: summaryPairs,
      headers,
      rows: exportRows.map((r) => r.map((c, i) => (i === 6 ? formatMoney(Number(c)) : c))),
      numericFrom: 6,
    });
  };

  const toggleType = (t: VoucherType) =>
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  return (
    <>
      <PageHeader
        title="Day Book"
        description={`${formatDate(date)} · full cash reconciliation`}
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/reports">
                <ArrowLeft className="h-4 w-4" /> Reports
              </Link>
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous day"
              onClick={() => setDate((d) => shiftDay(d, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next day"
              onClick={() => setDate((d) => shiftDay(d, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={onExcel} disabled={!book}>
              <Sheet className="h-4 w-4" /> Export Excel
            </Button>
            <Button variant="outline" size="sm" onClick={onPrint} disabled={!book}>
              <Printer className="h-4 w-4" /> Print / PDF
            </Button>
          </>
        }
      />

      <FilterPanel>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Opening cash override">
          <Input
            inputMode="decimal"
            placeholder="auto"
            value={overrideValue}
            onChange={(e) => {
              setTouchedOverride(true);
              setOverrideInput(e.target.value);
            }}
          />
        </Field>
        <Field label="Run">
          <Button
            className="w-full"
            onClick={applyOverride}
            disabled={saveOverride.isPending || isFetching}
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} /> Run Day Book
          </Button>
        </Field>
        <Field label="Voucher types">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <span className="flex items-center gap-2 truncate">
                  <Filter className="h-4 w-4" />
                  {types.length === 0 ? "All types" : `${types.length} selected`}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Filter voucher types</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {VOUCHER_TYPES.map((t) => (
                <DropdownMenuCheckboxItem
                  key={t}
                  checked={types.includes(t)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => toggleType(t)}
                >
                  {t}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setTypes([])}>Clear filter</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Field>
        <Field label="Search">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Party, voucher number or reference"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </Field>
      </FilterPanel>

      {isLoading || !book ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading day book…</Card>
      ) : (
        <>
          <ReconciliationTools />

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Executive summary</h2>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Opening Cash"
                value={formatMoney(book.openingCash)}
                hint={
                  book.openingOverridden
                    ? `Manual override (auto: ${formatMoney(book.openingCashCalculated)})`
                    : book.cashAccountName
                }
              />
              <StatCard
                label="Closing Cash"
                value={formatMoney(book.closingCash)}
                hint="Expected in drawer"
                tone={book.closingCash >= 0 ? "positive" : "negative"}
              />
              <StatCard
                label="In Hand Cash"
                value={formatMoney(book.inHandCash)}
                hint="Matches Cash & Bank · Cash in Hand"
                tone={book.inHandCash >= 0 ? "positive" : "negative"}
              />

              <StatCard label="Cash Collection" value={formatMoney(book.collection["Cash"] ?? 0)} />
              <StatCard label="Total Purchase Bills" value={formatMoney(book.totalPurchaseBills)} />
              <StatCard label="Total Expenses" value={formatMoney(book.totalExpenses)} />

              <StatCard
                label="POS Collection (Card Payment)"
                value={formatMoney(book.collection["Card Payment"] ?? 0)}
              />
              <StatCard
                label="Bank Transfer Collection"
                value={formatMoney(book.collection["Bank Transfer"] ?? 0)}
              />
              <StatCard
                label="Collected — Other Invoice Date"
                value={formatMoney(book.collectedOtherInvoiceDate)}
                hint="Money moved today for bills dated elsewhere"
              />
              <Card className="p-4 sm:col-span-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Journal: Cash ⇄ Bank
                </p>
                <div className="mt-1 flex flex-wrap gap-6">
                  <div>
                    <p className="text-xs text-muted-foreground">Cash → Bank</p>
                    <p className="font-display text-lg font-semibold">
                      {formatMoney(book.cashToBank)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Bank → Cash</p>
                    <p className="font-display text-lg font-semibold">
                      {formatMoney(book.bankToCash)}
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Voucher type summary</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <StatCard label="Net Sales" value={formatMoney(book.netSales)} hint="Invoices − credit notes" />
              <StatCard
                label="Net Purchases"
                value={formatMoney(book.netPurchases)}
                hint="Bills + expenses"
              />
              <StatCard
                label="Total Amount Collected"
                value={formatMoney(book.totalCollected)}
                tone="positive"
              />
              <StatCard label="Total Amount Out" value={formatMoney(book.totalOut)} tone="negative" />
              <StatCard
                label="Net Cash Movement"
                value={formatMoney(book.netCashMovement)}
                tone={book.netCashMovement >= 0 ? "positive" : "negative"}
              />
            </div>

            {typeSummary.length > 0 && (
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-right">Count</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {typeSummary.map((t) => (
                      <tr key={t.type}>
                        <td className="px-3 py-2">
                          <StatusBadge tone={voucherTone(t.type)}>{t.type}</StatusBadge>
                        </td>
                        <td className="px-3 py-2 text-right">{t.count}</td>
                        <td className="px-3 py-2 text-right font-semibold">
                          {formatMoney(t.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Voucher detail</h2>
            {rows.length === 0 ? (
              <Card>
                <EmptyState
                  icon={BookOpen}
                  title="Nothing to show"
                  description="No vouchers match this date and filter."
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
                        <th className="px-3 py-2 text-left">Number</th>
                        <th className="px-3 py-2 text-left">Party</th>
                        <th className="px-3 py-2 text-left">Reference</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((v) => (
                        <tr
                          key={v.key}
                          className={cn("hover:bg-muted/30", v.link && "cursor-pointer")}
                          onClick={() =>
                            v.link &&
                            navigate({ to: v.link.to, params: v.link.params as never })
                          }
                        >
                          <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                            {formatDate(v.date)} · {timeOf(v.at)}
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge tone={voucherTone(v.type)}>{v.type}</StatusBadge>
                          </td>
                          <td className="px-3 py-2 font-medium">{v.number}</td>
                          <td className="px-3 py-2">{v.party}</td>
                          <td className="px-3 py-2 text-muted-foreground">{v.reference}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">
                            {formatMoney(v.amount)}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{v.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>

                <div className="space-y-3 md:hidden">
                  {rows.map((v) => (
                    <Card
                      key={v.key}
                      className="p-4"
                      onClick={() =>
                        v.link && navigate({ to: v.link.to, params: v.link.params as never })
                      }
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <StatusBadge tone={voucherTone(v.type)}>{v.type}</StatusBadge>
                          <p className="mt-1.5 truncate text-sm font-semibold">{v.party}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {timeOf(v.at)} · {v.number}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{v.status}</p>
                        </div>
                        <p className="shrink-0 font-display text-base font-semibold">
                          {formatMoney(v.amount)}
                        </p>
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}
