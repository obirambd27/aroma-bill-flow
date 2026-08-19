import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  BookOpen,
  Boxes,
  ClipboardList,
  FileText,
  Layers,
  ListChecks,
  PieChart,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";

type Report = {
  name: string;
  description: string;
  icon: typeof BarChart3;
  to?: string;
};

const GROUPS: { title: string; reports: Report[] }[] = [
  {
    title: "Sales & Purchases",
    reports: [
      {
        name: "Sales Report",
        description: "Bill-level sales with tax, discount and payment status.",
        icon: TrendingUp,
        to: "/reports/sales",
      },
      {
        name: "Purchase Report",
        description: "Vendor purchases with tax and payment status.",
        icon: ShoppingCart,
        to: "/reports/purchases",
      },
      {
        name: "Day Book",
        description: "Everything that happened on a day, in order.",
        icon: BookOpen,
        to: "/reports/day-book",
      },
      {
        name: "Daily Reconciliation",
        description: "Match cash, bank, card and collections against bills and payments.",
        icon: ListChecks,
        to: "/reports/reconciliation",
      },
      {
        name: "All Transactions",
        description: "Master log across every transaction type.",
        icon: ListChecks,
        to: "/reports/transactions",
      },
    ],
  },
  {
    title: "Financial",
    reports: [
      { name: "Profit & Loss", description: "Income vs expenses over a period.", icon: BarChart3 },
      { name: "Cash Flow", description: "Cash in and out by account.", icon: Wallet },
      { name: "Balance Sheet", description: "Assets, liabilities and equity.", icon: PieChart },
    ],
  },
  {
    title: "Inventory",
    reports: [
      { name: "Stock Summary", description: "Stock on hand and value by warehouse.", icon: Boxes },
      { name: "Item Profit / Loss", description: "Margin earned per product.", icon: Layers },
      { name: "Low Stock", description: "Items at or below threshold.", icon: ClipboardList },
      { name: "Item Detail", description: "Full movement history per item.", icon: FileText },
      {
        name: "Sale / Purchase by Item",
        description: "Quantity and value sold vs purchased.",
        icon: BarChart3,
      },
    ],
  },
];

export const Route = createFileRoute("/_authenticated/reports/")({
  head: () => ({
    meta: [
      { title: "Reports — Fragrance Billing" },
      {
        name: "description",
        content: "Sales, purchase, day book and transaction reports for your perfume business.",
      },
      { property: "og:title", content: "Reports — Fragrance Billing" },
      {
        property: "og:description",
        content: "Sales, purchase, day book and transaction reports for your perfume business.",
      },
    ],
  }),
  component: ReportsIndex,
});

function ReportsIndex() {
  return (
    <>
      <PageHeader title="Reports" description="Analyse sales, purchases and daily activity." />
      {GROUPS.map((group) => (
        <section key={group.title} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {group.title}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.reports.map((r) => {
              const body = (
                <Card
                  className={
                    r.to
                      ? "h-full p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
                      : "h-full border-dashed p-4 opacity-60"
                  }
                >
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent">
                      <r.icon className="h-4 w-4 text-accent-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{r.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{r.description}</p>
                      {!r.to && (
                        <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Coming soon
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              );
              return r.to ? (
                <Link key={r.name} to={r.to} className="block">
                  {body}
                </Link>
              ) : (
                <div key={r.name}>{body}</div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
