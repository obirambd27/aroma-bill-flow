import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { ExportMenu, Field, FilterPanel, SummaryCards } from "@/components/ReportChrome";
import { formatDate, formatMoney } from "@/lib/format";
import { downloadCSV, downloadXLSX, printReport } from "@/lib/export";
import { groupRows, presetRange, useSalesReport, type Preset, type SalesRow } from "@/lib/reports";
import { useCustomers, useAllWarehouses } from "@/lib/data";
import { PAYMENT_METHODS } from "@/lib/payments";
import { PaymentMethodTag, PaymentMethodTiles } from "@/components/PaymentMethodBreakdown";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export const Route = createFileRoute("/_authenticated/reports/sales")({
  head: () => ({
    meta: [
      { title: "Sales Report — Fragrance Billing" },
      { name: "description", content: "Bill-level sales with tax, discount and payment status." },
      { property: "og:title", content: "Sales Report — Fragrance Billing" },
      {
        property: "og:description",
        content: "Bill-level sales with tax, discount and payment status.",
      },
    ],
  }),
  component: SalesReport,
});

type GroupBy = "none" | "customer" | "warehouse" | "day" | "month" | "method";
type SortKey = "bill_date" | "bill_number" | "customer" | "warehouse" | "total_amount";

function paymentTone(status: string) {
  if (status === "Paid") return "success" as const;
  if (status === "Partial") return "warning" as const;
  if (status === "Unpaid") return "error" as const;
  return "neutral" as const;
}

function SalesReport() {
  const [preset, setPreset] = useState<Preset>("month");
  const [range, setRange] = useState(() => presetRange("month"));
  const [customerId, setCustomerId] = useState("all");
  const [warehouseId, setWarehouseId] = useState("all");
  const [payment, setPayment] = useState("all");
  const [taxStatus, setTaxStatus] = useState("all");
  const [methods, setMethods] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "bill_date",
    dir: "desc",
  });

  const { data: rowsRaw = [], isLoading } = useSalesReport(range);
  const { data: customers = [] } = useCustomers();
  const { data: warehouses = [] } = useAllWarehouses();

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p !== "custom") setRange(presetRange(p));
  };

  const rows = useMemo(() => {
    const filtered = rowsRaw.filter((r) => {
      if (r.status === "Draft") return false;
      if (customerId !== "all" && r.customer_id !== customerId) return false;
      if (warehouseId !== "all" && r.warehouse_id !== warehouseId) return false;
      if (payment !== "all" && r.payment_status !== payment) return false;
      if (taxStatus === "taxed" && !r.is_taxed) return false;
      if (taxStatus === "untaxed" && r.is_taxed) return false;
      if (methods.length > 0 && !r.methods.some((m) => methods.includes(m))) return false;
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sort.key] ?? "";
      const bv = b[sort.key] ?? "";
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rowsRaw, customerId, warehouseId, payment, taxStatus, methods, sort]);

  // Amounts actually received per method (upfront + later payments).
  const methodTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const m of PAYMENT_METHODS) totals[m] = 0;
    for (const r of rows) {
      for (const [method, amount] of Object.entries(r.paidByMethod)) {
        totals[method] = (totals[method] ?? 0) + amount;
      }
    }
    return totals;
  }, [rows]);
  const collected = useMemo(
    () => Object.values(methodTotals).reduce((s, v) => s + v, 0),
    [methodTotals],
  );
  const methodChart = useMemo(
    () =>
      PAYMENT_METHODS.map((m, i) => ({
        name: m,
        value: methodTotals[m] ?? 0,
        fill: `var(--chart-${i + 1})`,
      })).filter((d) => d.value > 0),
    [methodTotals],
  );

  const totals = useMemo(
    () => ({
      sales: rows.reduce((s, r) => s + r.total_amount, 0),
      tax: rows.reduce((s, r) => s + r.tax_amount, 0),
      discount: rows.reduce((s, r) => s + r.discount_amount, 0),
      count: rows.length,
    }),
    [rows],
  );

  const groups = useMemo(() => {
    if (groupBy === "none") return null;
    const keyFn = (r: SalesRow) =>
      groupBy === "customer"
        ? r.customer
        : groupBy === "warehouse"
          ? r.warehouse
          : groupBy === "day"
            ? r.bill_date
            : groupBy === "month"
              ? r.bill_date.slice(0, 7)
              : r.methods.join(" + ") || "Unpaid / No method";
    return groupRows(rows, keyFn).map(([key, list]) => ({
      key,
      list,
      subtotal: list.reduce((s, r) => s + r.subtotal, 0),
      discount: list.reduce((s, r) => s + r.discount_amount, 0),
      tax: list.reduce((s, r) => s + r.tax_amount, 0),
      total: list.reduce((s, r) => s + r.total_amount, 0),
    }));
  }, [rows, groupBy]);

  const headers = [
    "Date",
    "Bill #",
    "Customer",
    "Warehouse",
    "Subtotal",
    "Discount",
    "Tax",
    "Total",
    "Payment Method",
    "Payment Status",
  ];
  const exportRows = rows.map((r) => [
    r.bill_date,
    r.bill_number ?? "—",
    r.customer,
    r.warehouse,
    r.subtotal,
    r.discount_amount,
    r.tax_amount,
    r.total_amount,
    r.methods.map((m) => `${m}: ${r.paidByMethod[m] ?? 0}`).join(" | ") || "—",
    r.payment_status,
  ]);

  const onExport = (f: "pdf" | "csv" | "xlsx") => {
    const name = `sales-report-${range.from}_${range.to}`;
    if (f === "csv") return downloadCSV(name, headers, exportRows);
    if (f === "xlsx") return downloadXLSX(name, "Sales", headers, exportRows);
    printReport({
      title: "Sales Report",
      subtitle: `${formatDate(range.from)} – ${formatDate(range.to)}`,
      summary: [
        { label: "Total Sales", value: formatMoney(totals.sales) },
        { label: "Tax Collected", value: formatMoney(totals.tax) },
        { label: "Discount Given", value: formatMoney(totals.discount) },
        { label: "Bills", value: String(totals.count) },
      ],
      headers,
      rows: exportRows.map((r) => r.map((c, i) => (i >= 4 && i <= 7 ? formatMoney(Number(c)) : c))),
      numericFrom: 4,
    });
  };

  const sortBtn = (key: SortKey, label: string, align?: "right") => (
    <button
      type="button"
      onClick={() =>
        setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }))
      }
      className={`w-full text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground ${align === "right" ? "text-right" : "text-left"}`}
    >
      {label}
      {sort.key === key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
    </button>
  );

  return (
    <>
      <PageHeader
        title="Sales Report"
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
        <Field label="Customer">
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All customers</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Warehouse">
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All warehouses</SelectItem>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Payment status">
          <Select value={payment} onValueChange={setPayment}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="Paid">Paid</SelectItem>
              <SelectItem value="Partial">Partial</SelectItem>
              <SelectItem value="Unpaid">Unpaid</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Tax status">
          <Select value={taxStatus} onValueChange={setTaxStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="taxed">Taxed</SelectItem>
              <SelectItem value="untaxed">Non-taxed</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Payment method">
          <div className="flex flex-wrap gap-1.5">
            {PAYMENT_METHODS.map((m) => {
              const on = methods.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() =>
                    setMethods((prev) =>
                      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
                    )
                  }
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Group by">
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="customer">By Customer</SelectItem>
              <SelectItem value="warehouse">By Warehouse</SelectItem>
              <SelectItem value="day">By Day</SelectItem>
              <SelectItem value="month">By Month</SelectItem>
              <SelectItem value="method">By Payment Method</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </FilterPanel>

      <SummaryCards
        items={[
          { label: "Total Sales", value: formatMoney(totals.sales) },
          { label: "Tax Collected", value: formatMoney(totals.tax) },
          { label: "Discount Given", value: formatMoney(totals.discount) },
          { label: "Bills", value: String(totals.count) },
        ]}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <PaymentMethodTiles label="Collected" totals={methodTotals} totalSales={collected} />
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Sales by payment method
          </p>
          {methodChart.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No payments recorded in this range.
            </p>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={methodChart}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="80%"
                  >
                    {methodChart.map((d) => (
                      <Cell key={d.name} fill={d.fill} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                  <Legend verticalAlign="bottom" height={24} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading sales…</Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileSpreadsheet}
            title="No sales in this range"
            description="Adjust the date range or filters to see results."
          />
        </Card>
      ) : groups ? (
        <div className="space-y-3">
          {groups.map((g) => (
            <Card key={g.key} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-3">
                <p className="text-sm font-semibold">
                  {groupBy === "day" || groupBy === "month"
                    ? formatDate(`${g.key}-01`.slice(0, 10))
                    : g.key}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {g.list.length} bill{g.list.length === 1 ? "" : "s"}
                  </span>
                </p>
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span>Tax {formatMoney(g.tax)}</span>
                  <span>Disc {formatMoney(g.discount)}</span>
                  <span className="font-semibold text-foreground">{formatMoney(g.total)}</span>
                </div>
              </div>
              <ul className="divide-y divide-border">
                {g.list.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <Link
                        to="/bills/$billId"
                        params={{ billId: r.id }}
                        className="text-sm font-medium hover:underline"
                      >
                        {r.bill_number ?? "—"}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDate(r.bill_date)} · {r.customer}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">{formatMoney(r.total_amount)}</p>
                      <StatusBadge tone={paymentTone(r.payment_status)}>
                        {r.payment_status}
                      </StatusBadge>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-3 py-2">{sortBtn("bill_date", "Date")}</th>
                  <th className="px-3 py-2">{sortBtn("bill_number", "Bill #")}</th>
                  <th className="px-3 py-2">{sortBtn("customer", "Customer")}</th>
                  <th className="px-3 py-2">{sortBtn("warehouse", "Warehouse")}</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Subtotal
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Discount
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Tax
                  </th>
                  <th className="px-3 py-2">{sortBtn("total_amount", "Total", "right")}</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Method
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(r.bill_date)}</td>
                    <td className="px-3 py-2">
                      <Link
                        to="/bills/$billId"
                        params={{ billId: r.id }}
                        className="font-medium hover:underline"
                      >
                        {r.bill_number ?? "—"}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{r.customer}</td>
                    <td className="px-3 py-2">{r.warehouse}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(r.subtotal)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(r.discount_amount)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(r.tax_amount)}</td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {formatMoney(r.total_amount)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {r.methods.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          r.methods.map((m) => (
                            <span key={m} className="inline-flex items-center gap-1">
                              <PaymentMethodTag method={m} />
                              <span className="numeric text-xs text-muted-foreground">
                                {formatMoney(r.paidByMethod[m] ?? 0)}
                              </span>
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <StatusBadge tone={paymentTone(r.payment_status)}>
                        {r.payment_status}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/40 font-semibold">
                  <td className="px-3 py-2" colSpan={4}>
                    Total
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatMoney(rows.reduce((s, r) => s + r.subtotal, 0))}
                  </td>
                  <td className="px-3 py-2 text-right">{formatMoney(totals.discount)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(totals.tax)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(totals.sales)}</td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          </Card>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {rows.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to="/bills/$billId"
                      params={{ billId: r.id }}
                      className="text-sm font-semibold hover:underline"
                    >
                      {r.bill_number ?? "—"}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDate(r.bill_date)} · {r.customer}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{r.warehouse}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-base font-semibold">{formatMoney(r.total_amount)}</p>
                    <StatusBadge tone={paymentTone(r.payment_status)}>
                      {r.payment_status}
                    </StatusBadge>
                  </div>
                </div>
                <div className="mt-3 flex justify-between border-t border-border pt-2 text-xs text-muted-foreground">
                  <span>Sub {formatMoney(r.subtotal)}</span>
                  <span>Disc {formatMoney(r.discount_amount)}</span>
                  <span>Tax {formatMoney(r.tax_amount)}</span>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
