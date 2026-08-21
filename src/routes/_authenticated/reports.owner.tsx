import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  FileText,
  MessageCircle,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { formatDate, formatMoney } from "@/lib/format";
import { useSettings } from "@/lib/data";
import { agingLabel } from "@/lib/collections";
import { cleanPhone } from "@/lib/invoice-share";
import { agingTone } from "@/lib/collections";
import {
  ownerPeriodRange,
  pctChange,
  periodLabel,
  rangeLabel,
  useOwnerReport,
  type OwnerPeriod,
} from "@/lib/owner-report";
import {
  downloadOwnerReportCSV,
  downloadOwnerReportXLSX,
  ownerReportMessage,
  printOwnerReport,
} from "@/lib/owner-report-export";

export const Route = createFileRoute("/_authenticated/reports/owner")({
  head: () => ({
    meta: [
      { title: "Owner Report — Fragrance Billing" },
      {
        name: "description",
        content:
          "Daily, weekly and monthly business snapshot: sales, outstanding, profit, cash and stock.",
      },
      { property: "og:title", content: "Owner Report — Fragrance Billing" },
      {
        property: "og:description",
        content:
          "Daily, weekly and monthly business snapshot: sales, outstanding, profit, cash and stock.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OwnerReportPage,
});

const PERIODS: { key: OwnerPeriod; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "custom", label: "Custom" },
];

function Delta({ current, previous }: { current: number; previous: number | null | undefined }) {
  const pct = pctChange(current, previous ?? null);
  if (pct === null) return null;
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`mt-0.5 inline-flex items-center gap-1 text-xs font-medium ${
        up ? "text-success" : "text-destructive"
      }`}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(pct).toFixed(1)}% vs prev
    </span>
  );
}

function Stat({
  label,
  value,
  big,
  children,
}: {
  label: string;
  value: string;
  big?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Card className={big ? "border-primary/30 bg-accent/30 p-4" : "p-4"}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={big ? "mt-1 text-2xl font-bold tracking-tight" : "mt-1 text-lg font-semibold"}>
        {value}
      </p>
      {children}
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

const NA = "Unable to calculate";
const m = (v: number | null | undefined) => (v === null || v === undefined ? NA : formatMoney(v));

function OwnerReportPage() {
  const [period, setPeriod] = useState<OwnerPeriod>("daily");
  const [draft, setDraft] = useState(() => ownerPeriodRange("daily"));
  const [range, setRange] = useState(draft);

  const { data: settings } = useSettings();
  const { data, isFetching, isError, refetch } = useOwnerReport(
    range,
    settings?.low_stock_threshold ?? 5,
  );

  const title = periodLabel(period);
  const business = useMemo(
    () => ({
      name: settings?.business_name ?? "Fragrance Billing",
      tagline: settings?.business_tagline ?? null,
      address: settings?.business_address ?? null,
      phone: settings?.business_phone ?? null,
      email: settings?.business_email ?? null,
      logo: settings?.business_logo_url ?? null,
    }),
    [settings],
  );

  const applyPeriod = (p: OwnerPeriod) => {
    setPeriod(p);
    if (p !== "custom") {
      const r = ownerPeriodRange(p);
      setDraft(r);
      setRange(r);
    }
  };

  const fileBase = `owner-report-${range.from}${range.to !== range.from ? `_${range.to}` : ""}`;

  const guarded = (fn: () => void) => {
    if (!data) return;
    try {
      fn();
    } catch {
      toast.error("Report generation failed — please try again", {
        action: { label: "Retry", onClick: () => guarded(fn) },
      });
    }
  };

  const waNumber = cleanPhone(business.phone ?? "");
  const canShare = waNumber.length >= 8 && !!data;

  return (
    <>
      <PageHeader
        title="Owner Report"
        description="Full business snapshot for the selected period."
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link to="/reports">
              <ArrowLeft className="h-4 w-4" /> Reports
            </Link>
          </Button>
        }
      />

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={period === p.key ? "default" : "outline"}
              onClick={() => applyPeriod(p.key)}
            >
              {p.label}
            </Button>
          ))}
          {period === "custom" && (
            <div className="w-full sm:w-72">
              <DateRangeFilter
                from={draft.from}
                to={draft.to}
                onChange={(r) => setDraft({ from: r.from || draft.from, to: r.to || r.from || draft.to })}
              />
            </div>
          )}
          <Button size="sm" onClick={() => setRange(draft)} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Generate Report
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!data}
            onClick={() => guarded(() => printOwnerReport({ data: data!, business, title }))}
          >
            <FileText className="h-4 w-4" /> PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!data}
            onClick={() => guarded(() => downloadOwnerReportCSV(data!, fileBase))}
          >
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!data}
            onClick={() => guarded(() => downloadOwnerReportXLSX(data!, fileBase))}
          >
            <FileSpreadsheet className="h-4 w-4" /> XLSX
          </Button>
          {canShare && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                guarded(() =>
                  window.open(
                    `https://wa.me/${waNumber}?text=${encodeURIComponent(
                      ownerReportMessage(data!, business.name, title),
                    )}`,
                    "_blank",
                  ),
                )
              }
            >
              <MessageCircle className="h-4 w-4" /> Share via WhatsApp
            </Button>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {title} · {rangeLabel(range)}
          </span>
        </div>
      </Card>

      {isError && !data && (
        <Card className="p-6 text-sm text-destructive">
          Report generation failed — please try again.
          <Button className="ml-3" size="sm" variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </Card>
      )}

      {!data && isFetching && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {data && (
        <div className="space-y-6">
          <Section title="Sales Overview">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Total Sell" value={m(data.sales?.totalSell ?? null)} big>
                {data.sales && (
                  <Delta current={data.sales.totalSell} previous={data.prevSales?.totalSell} />
                )}
              </Stat>
              <Stat label="Total Paid Sell" value={m(data.sales?.totalPaid ?? null)}>
                {data.sales && (
                  <Delta current={data.sales.totalPaid} previous={data.prevSales?.totalPaid} />
                )}
              </Stat>
              <Stat label="Bills Issued" value={data.sales ? String(data.sales.billCount) : NA} />
              <Stat label="Average Bill" value={m(data.sales?.averageBill ?? null)} />
              <Stat label="Paid — Cash" value={m(data.sales?.byMethod["Cash"] ?? null)} />
              <Stat
                label="Paid — Bank Transfer"
                value={m(data.sales?.byMethod["Bank Transfer"] ?? null)}
              />
              <Stat
                label="Paid — Card Payment"
                value={m(data.sales?.byMethod["Card Payment"] ?? null)}
              />
              <Stat label="Tax Collected" value={m(data.sales?.tax ?? null)} />
              <Stat label="Discount Given" value={m(data.sales?.discount ?? null)} />
            </div>
          </Section>

          <Section title="Outstanding">
            {data.outstanding ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="Total Outstanding" value={formatMoney(data.outstanding.total)} big />
                  <Stat label="Customers" value={String(data.outstanding.rows.length)} />
                </div>
                {data.outstanding.rows.length > 0 && (
                  <Card className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">Customer</th>
                          <th className="px-3 py-2 text-left">Phone</th>
                          <th className="px-3 py-2 text-left">Oldest Unpaid</th>
                          <th className="px-3 py-2 text-left">Aging</th>
                          <th className="px-3 py-2 text-right">Outstanding</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.outstanding.rows.map((r) => (
                          <tr key={r.customerId ?? r.name} className="border-t border-border">
                            <td className="px-3 py-2">{r.name}</td>
                            <td className="px-3 py-2 text-muted-foreground">{r.phone ?? "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {formatDate(r.oldestDate)}
                            </td>
                            <td className="px-3 py-2">
                              <StatusBadge tone={agingTone(r.bucket)}>
                                {agingLabel[r.bucket]}
                              </StatusBadge>
                            </td>
                            <td className="px-3 py-2 text-right font-medium">
                              {formatMoney(r.amount)}
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
                            {formatMoney(data.outstanding.total)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </Card>
                )}
              </>
            ) : (
              <Card className="p-4 text-sm text-destructive">{NA}</Card>
            )}
          </Section>

          <Section title="Purchases, Expenses & Profit">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Total Purchases" value={m(data.purchases)} />
              <Stat label="Total Expenses" value={m(data.expenses)} />
              <Stat label="Cost of Goods Sold" value={m(data.cogs)} />
              <Stat label="Net Profit (Estimate)" value={m(data.netProfit)} big>
                {data.netProfit !== null && (
                  <Delta current={data.netProfit} previous={data.prevNetProfit} />
                )}
              </Stat>
            </div>
            <p className="text-xs text-muted-foreground">
              Estimate — based on total sell, recorded cost prices, and logged expenses for this
              period.
            </p>
          </Section>

          <Section title="Cash & Bank Snapshot (now)">
            {data.accounts ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {data.accounts.map((a) => (
                  <Stat key={a.name} label={`${a.name} (${a.type})`} value={formatMoney(a.balance)} />
                ))}
                <Stat
                  label="Total"
                  value={formatMoney(data.accounts.reduce((t, a) => t + a.balance, 0))}
                  big
                />
              </div>
            ) : (
              <Card className="p-4 text-sm text-destructive">
                Unavailable — please refresh and try again.
              </Card>
            )}
          </Section>

          <Section title="Customer Activity">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="New Customers"
                value={data.customerActivity ? String(data.customerActivity.newCustomers) : NA}
              />
              <Stat
                label="Returning Customers"
                value={data.customerActivity ? String(data.customerActivity.returning) : NA}
              />
            </div>
          </Section>

          <Section title="Top Selling Products">
            {data.topProducts?.length ? (
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">Product</th>
                      <th className="px-3 py-2 text-right">Qty Sold</th>
                      <th className="px-3 py-2 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topProducts.map((p, i) => (
                      <tr key={p.name} className="border-t border-border">
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2">{p.name}</td>
                        <td className="px-3 py-2 text-right">{p.qty}</td>
                        <td className="px-3 py-2 text-right font-medium">
                          {formatMoney(p.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ) : (
              <Card className="p-4 text-sm text-muted-foreground">
                No products sold in this period.
              </Card>
            )}
          </Section>

          <Section title="Inventory Health">
            {data.lowStock ? (
              <Card className="space-y-2 p-4">
                <p className="text-sm">
                  <span className="text-lg font-semibold">{data.lowStock.count}</span>{" "}
                  <span className="text-muted-foreground">
                    product{data.lowStock.count === 1 ? "" : "s"} at or below their low-stock
                    threshold
                  </span>
                </p>
                {data.lowStock.count > 0 && data.lowStock.count < 15 ? (
                  <p className="text-sm text-muted-foreground">{data.lowStock.names.join(", ")}</p>
                ) : data.lowStock.count > 0 ? (
                  <Link to="/products" className="text-sm font-medium text-primary underline">
                    View all low stock products
                  </Link>
                ) : null}
              </Card>
            ) : (
              <Card className="p-4 text-sm text-destructive">{NA}</Card>
            )}
          </Section>
        </div>
      )}
    </>
  );
}
