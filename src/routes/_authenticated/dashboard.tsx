import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, ReceiptText, AlertTriangle, Package, Bell } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { useBills, useProducts, useSettings, useStockTotals } from "@/lib/data";
import { useDueReminders } from "@/lib/crm";
import { formatDate, formatMoney } from "@/lib/format";


export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Fragrance Billing" },
      { name: "description", content: "Today's sales, recent bills and low stock at a glance." },
      { property: "og:title", content: "Dashboard — Fragrance Billing" },
      {
        property: "og:description",
        content: "Today's sales, recent bills and low stock at a glance.",
      },
    ],
  }),
  component: DashboardPage,
});

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="surface-card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="numeric mt-2 text-2xl font-bold sm:text-3xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function DashboardPage() {
  const { data: bills = [] } = useBills();
  const { data: products = [] } = useProducts();
  const { data: settings } = useSettings();
  const { data: stockTotals = {} } = useStockTotals();

  const threshold = Number(settings?.low_stock_threshold ?? 5);
  const today = new Date().toISOString().slice(0, 10);

  const stats = useMemo(() => {
    const finalized = bills.filter((b) => b.status === "Finalized");
    const todaySales = finalized
      .filter((b) => b.bill_date === today)
      .reduce((sum, b) => sum + Number(b.total_amount), 0);
    const monthPrefix = today.slice(0, 7);
    const monthSales = finalized
      .filter((b) => b.bill_date.startsWith(monthPrefix))
      .reduce((sum, b) => sum + Number(b.total_amount), 0);
    const lowStock = products.filter((p) => (stockTotals[p.id] ?? 0) <= threshold);
    return { todaySales, monthSales, billCount: finalized.length, lowStock };
  }, [bills, products, stockTotals, threshold, today]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={settings?.business_name ?? "Dashboard"}
        description="Your store at a glance."
        actions={
          <Button asChild>
            <Link to="/new-bill" search={{ customerId: undefined }}>
              <Plus />
              New Bill
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Today's sales" value={formatMoney(stats.todaySales)} />
        <StatCard label="This month" value={formatMoney(stats.monthSales)} />
        <StatCard label="Bills issued" value={String(stats.billCount)} hint="Finalized bills" />
        <StatCard
          label="Low stock items"
          value={String(stats.lowStock.length)}
          hint={`At or below ${threshold} units`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface-card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Recent bills</h2>
            <Link to="/bills" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          {bills.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="No bills yet"
              description="Create your first sales bill and it will show up here."
            />
          ) : (
            <ul className="divide-y divide-border/60">
              {bills.slice(0, 6).map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{b.bill_number}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {b.customers?.name ?? "Walk-in"} · {formatDate(b.bill_date)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <StatusBadge
                      tone={
                        b.payment_status === "Paid"
                          ? "success"
                          : b.payment_status === "Partial"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {b.payment_status}
                    </StatusBadge>
                    <span className="numeric text-sm font-bold">{formatMoney(b.total_amount)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="surface-card">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <h2 className="text-sm font-semibold">Low stock</h2>
          </div>
          {stats.lowStock.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Stock looks healthy"
              description="No products are at or below your low stock threshold."
            />
          ) : (
            <ul className="divide-y divide-border/60">
              {stats.lowStock.slice(0, 8).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="truncate text-sm">{p.name}</span>
                  <StatusBadge tone={(stockTotals[p.id] ?? 0) === 0 ? "error" : "warning"}>
                    {stockTotals[p.id] ?? 0} left
                  </StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="surface-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-destructive" />
            <h2 className="text-sm font-semibold">Reminders due today / overdue</h2>
          </div>
          <Link to="/customers" className="text-xs font-medium text-primary hover:underline">
            Customers
          </Link>
        </div>
        {dueReminders.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Nothing due"
            description="Customer follow-ups you schedule will appear here on their due date."
          />
        ) : (
          <ul className="divide-y divide-border/60">
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
      </div>
    </div>
  );
}

