import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Banknote, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RecordPaymentOutDialog } from "@/components/RecordPaymentOutDialog";
import { usePaymentsMade } from "@/lib/payments-out";
import { formatDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/payments-out/")({
  head: () => ({
    meta: [
      { title: "Payments Out — Fragrance Billing" },
      { name: "description", content: "Money paid to vendors and the bills each payment settled." },
      { property: "og:title", content: "Payments Out — Fragrance Billing" },
      {
        property: "og:description",
        content: "Money paid to vendors and the bills each payment settled.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentsOutPage,
});

function PaymentsOutPage() {
  const { data: payments = [], isLoading } = usePaymentsMade();
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return payments.filter((p) => {
      const matchesQuery =
        !q ||
        (p.vendors?.name ?? "").toLowerCase().includes(q) ||
        (p.reference_number ?? "").toLowerCase().includes(q) ||
        p.payment_made_allocations.some((a) =>
          (a.purchase_bills?.bill_number ?? "").toLowerCase().includes(q),
        );
      const matchesFrom = !from || p.payment_date >= from;
      const matchesTo = !to || p.payment_date <= to;
      return matchesQuery && matchesFrom && matchesTo;
    });
  }, [payments, query, from, to]);

  const total = visible.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments Out"
        description="Every payment made to a vendor, with the purchase bills it cleared."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus />
            Record Payment
          </Button>
        }
      />

      <div className="surface-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total paid out</p>
          <p className="numeric text-2xl font-bold">{formatMoney(total)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Payments</p>
          <p className="numeric text-2xl font-bold">{visible.length}</p>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 pl-9"
              placeholder="Search vendor, reference or bill"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label="From date"
              className="h-11"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <Input
              type="date"
              aria-label="To date"
              className="h-11"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading payments…</p>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Banknote}
            title={payments.length === 0 ? "No payments out yet" : "No matches"}
            description={
              payments.length === 0
                ? "Record a payment to settle open purchase bills with your vendors."
                : "Try a different vendor, reference or date range."
            }
            {...(payments.length === 0
              ? { actionLabel: "Record Payment", onAction: () => setDialogOpen(true) }
              : {})}
          />
        ) : (
          <>
            <table className="hidden w-full md:table">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Applied to</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatDate(p.payment_date)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">{p.vendors?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone="accent">{p.payment_method}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {p.accounts?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {p.payment_made_allocations.length === 0
                        ? "On account"
                        : p.payment_made_allocations
                            .map((a) => a.purchase_bills?.bill_number ?? "—")
                            .join(", ")}
                    </td>
                    <td className="numeric px-4 py-3 text-right text-sm font-bold">
                      {formatMoney(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="divide-y divide-border/60 md:hidden">
              {visible.map((p) => (
                <div key={p.id} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{p.vendors?.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(p.payment_date)} · {p.payment_method}
                      </p>
                    </div>
                    <p className="numeric shrink-0 text-base font-bold">{formatMoney(p.amount)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {p.payment_made_allocations.length === 0
                      ? "On account"
                      : p.payment_made_allocations
                          .map((a) => a.purchase_bills?.bill_number ?? "—")
                          .join(", ")}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <RecordPaymentOutDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
