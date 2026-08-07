import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  Bell,
  Package,
  Plus,
  Receipt,
  ReceiptText,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
import { ProductFormDialog } from "@/components/ProductFormDialog";
import { RecordPaymentDialog } from "@/components/RecordPaymentDialog";
import {
  useAllProducts,
  useAllWarehouses,
  useCustomers,
  useSettings,
} from "@/lib/data";
import { useAccounts } from "@/lib/accounting";
import { useDueReminders } from "@/lib/crm";
import {
  buildTrend,
  useDashboardBillItems,
  useDashboardBills,
  useDashboardExpenses,
  useDashboardPurchaseBills,
  useDashboardStock,
  usePendingCheques,
  type TrendMode,
} from "@/lib/dashboard";
import { formatDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Fragrance Billing" },
      {
        name: "description",
        content:
          "Sales, purchases, receivables, stock value and follow-ups across your perfume business.",
      },
      { property: "og:title", content: "Dashboard — Fragrance Billing" },
      {
        property: "og:description",
        content:
          "Sales, purchases, receivables, stock value and follow-ups across your perfume business.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function compact(value: number) {
  return new Intl.NumberFormat("en-AE", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
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
  tone?: "default" | "warning" | "success";
}) {
  return (
    <div className="surface-card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={[
          "numeric mt-2 truncate text-2xl font-bold xl:text-xl 2xl:text-2xl",
          tone === "warning" ? "text-warning-foreground" : "",
          tone === "success" ? "text-success" : "",
        ].join(" ")}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon?: React.ElementType;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-card flex min-w-0 flex-col">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <h2 className="truncate text-sm font-semibold">{title}</h2>
        </div>
        {action}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex shrink-0 rounded-lg bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={[
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            value === o.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DonutCard({
  title,
  data,
}: {
  title: string;
  data: { name: string; value: number }[];
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="min-w-0">
      <p className="mb-1 text-center text-xs font-medium text-muted-foreground">{title}</p>
      {total === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">No data yet</p>
      ) : (
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%">
                {data.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <RTooltip
                formatter={(v: number, n: string) => [formatMoney(v), n]}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function DashboardPage() {
  const navigate = useNavigate();
  const { data: settings } = useSettings();
  const { data: bills = [] } = useDashboardBills();
  const { data: purchaseBills = [] } = useDashboardPurchaseBills();
  const { data: billItems = [] } = useDashboardBillItems();
  const { data: products = [] } = useAllProducts();
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: stockRows = [] } = useDashboardStock();
  const { data: customers = [] } = useCustomers();
  const { data: accounts = [] } = useAccounts();
  const { data: dueReminders = [] } = useDueReminders();
  const { data: cheques } = usePendingCheques();
  const { data: expenses = [] } = useDashboardExpenses();

  const [trendMode, setTrendMode] = useState<TrendMode>("daily");
  const [showPurchases, setShowPurchases] = useState(true);
  const [topMetric, setTopMetric] = useState<"revenue" | "quantity">("revenue");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [payBillId, setPayBillId] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const monthPrefix = today.slice(0, 7);

  const summary = useMemo(() => {
    let todaySales = 0;
    let todayCount = 0;
    let monthSales = 0;
    let monthCount = 0;
    let totalRevenue = 0;
    let receivables = 0;
    for (const b of bills) {
      totalRevenue += b.total_amount;
      receivables += Math.max(0, b.total_amount - b.amount_paid);
      if (b.bill_date === today) {
        todaySales += b.total_amount;
        todayCount += 1;
      }
      if (b.bill_date.startsWith(monthPrefix)) {
        monthSales += b.total_amount;
        monthCount += 1;
      }
    }
    const payables = purchaseBills.reduce(
      (s, b) => s + Math.max(0, b.total_amount - b.amount_paid),
      0,
    );
    const cashBank = accounts
      .filter((a) => a.account_type === "Cash" || a.account_type === "Bank")
      .reduce((s, a) => s + Number(a.current_balance), 0);
    return {
      todaySales,
      todayCount,
      monthSales,
      monthCount,
      totalRevenue,
      receivables,
      payables,
      cashBank,
    };
  }, [bills, purchaseBills, accounts, today, monthPrefix]);

  const expenseSummary = useMemo(() => {
    let total = 0;
    let month = 0;
    const byCategory = new Map<string, number>();
    for (const e of expenses) {
      total += e.amount;
      if (e.expense_date.startsWith(monthPrefix)) month += e.amount;
      byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
    }
    const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    return { total, month, top };
  }, [expenses, monthPrefix]);

  const trend = useMemo(
    () => buildTrend(trendMode, bills, purchaseBills),
    [trendMode, bills, purchaseBills],
  );

  const topProducts = useMemo(() => {
    const map = new Map<string, { id: string | null; name: string; revenue: number; qty: number }>();
    for (const item of billItems) {
      const key = item.product_id ?? item.product_name_snapshot;
      const row = map.get(key) ?? {
        id: item.product_id,
        name: item.product_name_snapshot,
        revenue: 0,
        qty: 0,
      };
      row.revenue += item.line_total;
      row.qty += item.quantity;
      map.set(key, row);
    }
    return [...map.values()]
      .sort((a, b) => (topMetric === "revenue" ? b.revenue - a.revenue : b.qty - a.qty))
      .slice(0, 5);
  }, [billItems, topMetric]);

  const topCustomers = useMemo(() => {
    const totals = new Map<string, number>();
    for (const b of bills) {
      if (!b.customer_id) continue;
      totals.set(b.customer_id, (totals.get(b.customer_id) ?? 0) + b.total_amount);
    }
    return [...totals.entries()]
      .map(([id, amount]) => ({
        id,
        amount,
        name: customers.find((c) => c.id === id)?.name ?? "Customer",
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [bills, customers]);

  const taxSplit = useMemo(() => {
    let taxed = 0;
    let untaxed = 0;
    for (const b of bills) {
      if (b.is_taxed) taxed += b.total_amount;
      else untaxed += b.total_amount;
    }
    return [
      { name: "Taxed", value: taxed },
      { name: "No tax", value: untaxed },
    ];
  }, [bills]);

  const salesStatusSplit = useMemo(() => {
    const acc = { Paid: 0, Partial: 0, Unpaid: 0 } as Record<string, number>;
    for (const b of bills) acc[b.payment_status] = (acc[b.payment_status] ?? 0) + b.total_amount;
    return Object.entries(acc).map(([name, value]) => ({ name, value }));
  }, [bills]);

  const purchaseStatusSplit = useMemo(() => {
    const acc = { Paid: 0, Partial: 0, Unpaid: 0 } as Record<string, number>;
    for (const b of purchaseBills)
      acc[b.payment_status] = (acc[b.payment_status] ?? 0) + b.total_amount;
    return Object.entries(acc).map(([name, value]) => ({ name, value }));
  }, [purchaseBills]);

  const defaultThreshold = Number(settings?.low_stock_threshold ?? 5);

  const lowStock = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of stockRows) {
      totals.set(r.product_id, (totals.get(r.product_id) ?? 0) + r.stock_on_hand);
    }
    return products
      .filter((p) => p.is_active)
      .map((p) => ({
        id: p.id,
        name: p.name,
        stock: totals.get(p.id) ?? 0,
        threshold: Number(p.low_stock_threshold ?? defaultThreshold),
      }))
      .filter((p) => p.stock <= p.threshold)
      .sort((a, b) => a.stock - b.stock);
  }, [products, stockRows, defaultThreshold]);

  const warehouseValues = useMemo(() => {
    const priceById = new Map(
      products.map((p) => [p.id, Number(p.cost_price ?? p.price ?? 0)] as const),
    );
    const totals = new Map<string, number>();
    for (const r of stockRows) {
      const value = r.stock_on_hand * (priceById.get(r.product_id) ?? 0);
      totals.set(r.warehouse_id, (totals.get(r.warehouse_id) ?? 0) + value);
    }
    return warehouses
      .map((w) => ({ id: w.id, name: w.name, value: totals.get(w.id) ?? 0 }))
      .sort((a, b) => b.value - a.value);
  }, [products, stockRows, warehouses]);

  const openBills = useMemo(
    () =>
      bills
        .filter((b) => b.payment_status !== "Paid" && b.total_amount - b.amount_paid > 0.009)
        .sort((a, b) => a.bill_date.localeCompare(b.bill_date))
        .slice(0, 5),
    [bills],
  );

  const openPurchaseBills = useMemo(
    () =>
      purchaseBills
        .filter((b) => b.payment_status !== "Paid" && b.total_amount - b.amount_paid > 0.009)
        .sort((a, b) => a.bill_date.localeCompare(b.bill_date))
        .slice(0, 5),
    [purchaseBills],
  );

  const tooltipStyle = {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
  } as const;

  return (
    <div className="space-y-6 pb-4">
      <PageHeader
        title={settings?.business_name ?? "Dashboard"}
        description="Sales, purchases, stock and follow-ups at a glance."
      />

      {/* Quick actions */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
        <div className="flex w-max items-center gap-2 sm:w-auto sm:flex-wrap">
          <Button asChild size="sm">
            <Link to="/new-bill" search={{}}>
              <Plus />
              New Bill
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/sales-orders/new" search={{}}>
              <ShoppingCart />
              New Sales Order
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/purchase-bills/new" search={{}}>
              <Truck />
              New Purchase Bill
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCustomerOpen(true)}>
            <Users />
            New Customer
          </Button>
          <Button variant="outline" size="sm" onClick={() => setProductOpen(true)}>
            <Package />
            New Product
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Today's sales"
          value={formatMoney(summary.todaySales)}
          hint={`${summary.todayCount} bill${summary.todayCount === 1 ? "" : "s"}`}
        />
        <StatCard
          label="This month"
          value={formatMoney(summary.monthSales)}
          hint={`${summary.monthCount} bill${summary.monthCount === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Total revenue"
          value={formatMoney(summary.totalRevenue)}
          hint="All finalized bills"
        />
        <StatCard
          label="Receivables"
          value={formatMoney(summary.receivables)}
          hint="Due from customers"
          tone="warning"
        />
        <StatCard
          label="Payables"
          value={formatMoney(summary.payables)}
          hint="Due to vendors"
          tone="warning"
        />
        <StatCard
          label="Cash & bank"
          value={formatMoney(summary.cashBank)}
          hint="Across all accounts"
          tone="success"
        />
      </div>

      {/* Sales trend */}
      <Panel
        title="Sales trend"
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Segmented
              value={trendMode}
              onChange={setTrendMode}
              options={[
                { value: "daily", label: "30d" },
                { value: "weekly", label: "12w" },
                { value: "monthly", label: "12m" },
              ]}
            />
            <Button
              variant={showPurchases ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setShowPurchases((v) => !v)}
            >
              Purchases
            </Button>
          </div>
        }
      >
        <div className="h-64 w-full p-4 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
                minTickGap={16}
                stroke="var(--muted-foreground)"
              />
              <YAxis
                tick={{ fontSize: 10 }}
                tickFormatter={compact}
                stroke="var(--muted-foreground)"
                width={48}
              />
              <RTooltip
                formatter={(v: number, n: string) => [formatMoney(v), n]}
                contentStyle={tooltipStyle}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="sales"
                name="Sales"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={false}
              />
              {showPurchases && (
                <Line
                  type="monotone"
                  dataKey="purchases"
                  name="Purchases"
                  stroke="var(--chart-3)"
                  strokeWidth={2}
                  dot={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      {/* Breakdown widgets */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Top 5 products"
          action={
            <Segmented
              value={topMetric}
              onChange={setTopMetric}
              options={[
                { value: "revenue", label: "Revenue" },
                { value: "quantity", label: "Qty" },
              ]}
            />
          }
        >
          {topProducts.length === 0 ? (
            <EmptyState icon={Package} title="No sales yet" description="Finalize a bill to see your best sellers." />
          ) : (
            <ul className="divide-y divide-border/60">
              {topProducts.map((p, i) => (
                <li key={p.id ?? p.name} className="flex items-center gap-3 px-5 py-3">
                  <span className="numeric w-5 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                  {p.id ? (
                    <Link
                      to="/products/$productId"
                      params={{ productId: p.id }}
                      className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                    >
                      {p.name}
                    </Link>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                  )}
                  <span className="numeric shrink-0 text-sm font-bold">
                    {topMetric === "revenue" ? formatMoney(p.revenue) : `${p.qty} pcs`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Top 5 customers" icon={Users}>
          {topCustomers.length === 0 ? (
            <EmptyState icon={Users} title="No customer sales" description="Bills linked to a customer appear here." />
          ) : (
            <ul className="divide-y divide-border/60">
              {topCustomers.map((c, i) => (
                <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="numeric w-5 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                  <Link
                    to="/customers/$customerId"
                    params={{ customerId: c.id }}
                    className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                  >
                    {c.name}
                  </Link>
                  <span className="numeric shrink-0 text-sm font-bold">{formatMoney(c.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Tax split">
          <div className="p-4">
            <DonutCard title="Taxed vs untaxed sales" data={taxSplit} />
          </div>
        </Panel>

        <Panel title="Payment status">
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
            <DonutCard title="Sales bills" data={salesStatusSplit} />
            <DonutCard title="Purchase bills" data={purchaseStatusSplit} />
          </div>
        </Panel>

        <Panel
          title="Low stock alerts"
          icon={AlertTriangle}
          action={
            <Link to="/products" className="text-xs font-medium text-primary hover:underline">
              Products
            </Link>
          }
        >
          {lowStock.length === 0 ? (
            <EmptyState icon={Package} title="Stock looks healthy" description="Nothing is at or below its threshold." />
          ) : (
            <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto">
              {lowStock.slice(0, 12).map((p) => (
                <li key={p.id}>
                  <Link
                    to="/products/$productId"
                    params={{ productId: p.id }}
                    className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/50"
                  >
                    <span className="min-w-0 truncate text-sm">{p.name}</span>
                    <StatusBadge tone={p.stock <= 0 ? "error" : "warning"}>
                      {p.stock} left
                    </StatusBadge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Stock value by warehouse" icon={WarehouseIcon}>
          {warehouseValues.length === 0 ? (
            <EmptyState icon={WarehouseIcon} title="No warehouses" description="Add a warehouse to track stock value." />
          ) : (
            <div className="h-64 w-full p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={warehouseValues}
                  layout="vertical"
                  margin={{ top: 4, right: 12, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={compact}
                    tick={{ fontSize: 10 }}
                    stroke="var(--muted-foreground)"
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    width={90}
                    stroke="var(--muted-foreground)"
                  />
                  <RTooltip
                    formatter={(v: number) => [formatMoney(v), "Stock value"]}
                    contentStyle={tooltipStyle}
                  />
                  <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      {/* Financial health + CRM */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Unpaid sales bills"
          icon={ReceiptText}
          action={
            <Link to="/bills" className="text-xs font-medium text-primary hover:underline">
              All bills
            </Link>
          }
        >
          {openBills.length === 0 ? (
            <EmptyState icon={ReceiptText} title="All settled" description="No outstanding customer bills." />
          ) : (
            <ul className="divide-y divide-border/60">
              {openBills.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/bills/$billId"
                      params={{ billId: b.id }}
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {b.bill_number ?? "Bill"}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDate(b.bill_date)} · Due{" "}
                      {formatMoney(b.total_amount - b.amount_paid)}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setPayBillId(b.id)}>
                    <Wallet />
                    Record payment
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Unpaid purchase bills"
          icon={Truck}
          action={
            <Link to="/purchase-bills" className="text-xs font-medium text-primary hover:underline">
              All purchases
            </Link>
          }
        >
          {openPurchaseBills.length === 0 ? (
            <EmptyState icon={Truck} title="Nothing due" description="No outstanding vendor bills." />
          ) : (
            <ul className="divide-y divide-border/60">
              {openPurchaseBills.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <Link
                      to="/purchase-bills/$purchaseBillId"
                      params={{ purchaseBillId: b.id }}
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {b.bill_number ?? "Purchase bill"}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{formatDate(b.bill_date)}</p>
                  </div>
                  <span className="numeric shrink-0 text-sm font-bold">
                    {formatMoney(b.total_amount - b.amount_paid)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Pending cheques"
          icon={Wallet}
          action={
            <Link to="/cheques" className="text-xs font-medium text-primary hover:underline">
              Cheques
            </Link>
          }
        >
          <div className="grid grid-cols-2 divide-x divide-border/60">
            {(
              [
                ["Received", cheques?.received],
                ["Issued", cheques?.issued],
              ] as const
            ).map(([label, bucket]) => (
              <div key={label} className="px-5 py-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                </p>
                <p className="numeric mt-1 text-xl font-bold">
                  {formatMoney(bucket?.amount ?? 0)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {bucket?.count ?? 0} pending cheque{(bucket?.count ?? 0) === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Expenses this month"
          icon={Receipt}
          action={
            <Link to="/expenses" className="text-xs font-medium text-primary hover:underline">
              Expenses
            </Link>
          }
        >
          <div className="px-5 py-4">
            <p className="numeric text-2xl font-bold">{formatMoney(expenseSummary.month)}</p>
            <p className="text-xs text-muted-foreground">
              {formatMoney(expenseSummary.total)} recorded all time
            </p>
          </div>
          {expenseSummary.top.length > 0 && (
            <ul className="divide-y divide-border/60 border-t border-border/60">
              {expenseSummary.top.map(([name, value]) => (
                <li key={name} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="truncate text-muted-foreground">{name}</span>
                  <span className="numeric font-medium">{formatMoney(value)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>


        <Panel
          title="Reminders due today / overdue"
          icon={Bell}
          action={
            <Link to="/customers" className="text-xs font-medium text-primary hover:underline">
              Customers
            </Link>
          }
        >
          {dueReminders.length === 0 ? (
            <EmptyState icon={Bell} title="Nothing due" description="Scheduled follow-ups appear here on their due date." />
          ) : (
            <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto">
              {dueReminders.map((r) => {
                const overdue = r.due_date < today;
                return (
                  <li key={r.id}>
                    <Link
                      to="/customers/$customerId"
                      params={{ customerId: r.customer_id }}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{r.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {r.customers?.name ?? "Customer"} · {formatDate(r.due_date)}
                        </p>
                      </div>
                      <StatusBadge tone={overdue ? "error" : "warning"}>
                        {overdue ? "Overdue" : "Due today"}
                      </StatusBadge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <CustomerFormDialog
        open={customerOpen}
        onOpenChange={setCustomerOpen}
        onSaved={(c) => navigate({ to: "/customers/$customerId", params: { customerId: c.id } })}
      />
      <ProductFormDialog
        open={productOpen}
        onOpenChange={setProductOpen}
        warehouses={warehouses}
        onSaved={(p) => navigate({ to: "/products/$productId", params: { productId: p.id } })}
      />
      <RecordPaymentDialog
        open={payBillId !== null}
        onOpenChange={(open) => !open && setPayBillId(null)}
        {...(payBillId ? { defaultBillId: payBillId } : {})}
      />
    </div>
  );
}

