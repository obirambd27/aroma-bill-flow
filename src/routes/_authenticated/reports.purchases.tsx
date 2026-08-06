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
import {
  groupRows,
  presetRange,
  usePurchaseReport,
  type Preset,
  type PurchaseRow,
} from "@/lib/reports";
import { useAllWarehouses } from "@/lib/data";
import { useVendors, purchasePaymentTone } from "@/lib/purchases";

export const Route = createFileRoute("/_authenticated/reports/purchases")({
  head: () => ({
    meta: [
      { title: "Purchase Report — Fragrance Billing" },
      { name: "description", content: "Vendor purchases with tax and payment status." },
      { property: "og:title", content: "Purchase Report — Fragrance Billing" },
      { property: "og:description", content: "Vendor purchases with tax and payment status." },
    ],
  }),
  component: PurchaseReport,
});

type GroupBy = "none" | "vendor" | "warehouse" | "day" | "month";
type SortKey = "bill_date" | "bill_number" | "vendor" | "warehouse" | "total_amount";

function PurchaseReport() {
  const [preset, setPreset] = useState<Preset>("month");
  const [range, setRange] = useState(() => presetRange("month"));
  const [vendorId, setVendorId] = useState("all");
  const [warehouseId, setWarehouseId] = useState("all");
  const [payment, setPayment] = useState("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "bill_date",
    dir: "desc",
  });

  const { data: rowsRaw = [], isLoading } = usePurchaseReport(range);
  const { data: vendors = [] } = useVendors();
  const { data: warehouses = [] } = useAllWarehouses();

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p !== "custom") setRange(presetRange(p));
  };

  const rows = useMemo(() => {
    const filtered = rowsRaw.filter((r) => {
      if (r.status === "Draft") return false;
      if (vendorId !== "all" && r.vendor_id !== vendorId) return false;
      if (warehouseId !== "all" && r.warehouse_id !== warehouseId) return false;
      if (payment !== "all" && r.payment_status !== payment) return false;
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sort.key] ?? "";
      const bv = b[sort.key] ?? "";
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rowsRaw, vendorId, warehouseId, payment, sort]);

  const totals = useMemo(
    () => ({
      purchases: rows.reduce((s, r) => s + r.total_amount, 0),
      tax: rows.reduce((s, r) => s + r.tax_amount, 0),
      subtotal: rows.reduce((s, r) => s + r.subtotal, 0),
      count: rows.length,
    }),
    [rows],
  );

  const groups = useMemo(() => {
    if (groupBy === "none") return null;
    const keyFn = (r: PurchaseRow) =>
      groupBy === "vendor"
        ? r.vendor
        : groupBy === "warehouse"
          ? r.warehouse
          : groupBy === "day"
            ? r.bill_date
            : r.bill_date.slice(0, 7);
    return groupRows(rows, keyFn).map(([key, list]) => ({
      key,
      list,
      tax: list.reduce((s, r) => s + r.tax_amount, 0),
      total: list.reduce((s, r) => s + r.total_amount, 0),
    }));
  }, [rows, groupBy]);

  const headers = [
    "Date",
    "Bill #",
    "Vendor",
    "Warehouse",
    "Subtotal",
    "Tax",
    "Total",
    "Payment Status",
  ];
  const exportRows = rows.map((r) => [
    r.bill_date,
    r.bill_number ?? "—",
    r.vendor,
    r.warehouse,
    r.subtotal,
    r.tax_amount,
    r.total_amount,
    r.payment_status,
  ]);

  const onExport = (f: "pdf" | "csv" | "xlsx") => {
    const name = `purchase-report-${range.from}_${range.to}`;
    if (f === "csv") return downloadCSV(name, headers, exportRows);
    if (f === "xlsx") return downloadXLSX(name, "Purchases", headers, exportRows);
    printReport({
      title: "Purchase Report",
      subtitle: `${formatDate(range.from)} – ${formatDate(range.to)}`,
      summary: [
        { label: "Total Purchases", value: formatMoney(totals.purchases) },
        { label: "Tax Paid", value: formatMoney(totals.tax) },
        { label: "Bills", value: String(totals.count) },
      ],
      headers,
      rows: exportRows.map((r) =>
        r.map((c, i) => (i >= 4 && i <= 6 ? formatMoney(Number(c)) : c)),
      ),
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
        title="Purchase Report"
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
        <Field label="Vendor">
          <Select value={vendorId} onValueChange={setVendorId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vendors</SelectItem>
              {vendors.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
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
        <Field label="Group by">
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="vendor">By Vendor</SelectItem>
              <SelectItem value="warehouse">By Warehouse</SelectItem>
              <SelectItem value="day">By Day</SelectItem>
              <SelectItem value="month">By Month</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </FilterPanel>

      <SummaryCards
        items={[
          { label: "Total Purchases", value: formatMoney(totals.purchases) },
          { label: "Tax Paid", value: formatMoney(totals.tax) },
          { label: "Bills", value: String(totals.count) },
        ]}
      />

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading purchases…</Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileSpreadsheet}
            title="No purchases in this range"
            description="Adjust the date range or filters to see results."
          />
        </Card>
      ) : groups ? (
        <div className="space-y-3">
          {groups.map((g) => (
            <Card key={g.key} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-3">
                <p className="text-sm font-semibold">
                  {g.key}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {g.list.length} bill{g.list.length === 1 ? "" : "s"}
                  </span>
                </p>
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span>Tax {formatMoney(g.tax)}</span>
                  <span className="font-semibold text-foreground">{formatMoney(g.total)}</span>
                </div>
              </div>
              <ul className="divide-y divide-border">
                {g.list.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <Link
                        to="/purchase-bills/$purchaseBillId"
                        params={{ purchaseBillId: r.id }}
                        className="text-sm font-medium hover:underline"
                      >
                        {r.bill_number ?? "—"}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDate(r.bill_date)} · {r.vendor}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">{formatMoney(r.total_amount)}</p>
                      <StatusBadge tone={purchasePaymentTone(r.payment_status)}>
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
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-3 py-2">{sortBtn("bill_date", "Date")}</th>
                  <th className="px-3 py-2">{sortBtn("bill_number", "Bill #")}</th>
                  <th className="px-3 py-2">{sortBtn("vendor", "Vendor")}</th>
                  <th className="px-3 py-2">{sortBtn("warehouse", "Warehouse")}</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Subtotal
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Tax
                  </th>
                  <th className="px-3 py-2">{sortBtn("total_amount", "Total", "right")}</th>
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
                        to="/purchase-bills/$purchaseBillId"
                        params={{ purchaseBillId: r.id }}
                        className="font-medium hover:underline"
                      >
                        {r.bill_number ?? "—"}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{r.vendor}</td>
                    <td className="px-3 py-2">{r.warehouse}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(r.subtotal)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(r.tax_amount)}</td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {formatMoney(r.total_amount)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <StatusBadge tone={purchasePaymentTone(r.payment_status)}>
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
                  <td className="px-3 py-2 text-right">{formatMoney(totals.subtotal)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(totals.tax)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(totals.purchases)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </Card>

          <div className="space-y-3 md:hidden">
            {rows.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to="/purchase-bills/$purchaseBillId"
                      params={{ purchaseBillId: r.id }}
                      className="text-sm font-semibold hover:underline"
                    >
                      {r.bill_number ?? "—"}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDate(r.bill_date)} · {r.vendor}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{r.warehouse}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-base font-semibold">{formatMoney(r.total_amount)}</p>
                    <StatusBadge tone={purchasePaymentTone(r.payment_status)}>
                      {r.payment_status}
                    </StatusBadge>
                  </div>
                </div>
                <div className="mt-3 flex justify-between border-t border-border pt-2 text-xs text-muted-foreground">
                  <span>Sub {formatMoney(r.subtotal)}</span>
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
