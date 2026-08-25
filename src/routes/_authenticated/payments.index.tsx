import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2, Wallet } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { RecordPaymentDialog } from "@/components/RecordPaymentDialog";
import { DeletePaymentDialog } from "@/components/DeletePaymentDialog";
import { SyncIssuesBanner } from "@/components/SyncIssuesBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCustomers } from "@/lib/data";
import { PAYMENT_METHODS, usePaymentsReceived, type PaymentRow } from "@/lib/payments";
import { formatDate, formatMoney } from "@/lib/format";
import { todayISO } from "@/lib/reports";


export const Route = createFileRoute("/_authenticated/payments/")({
  head: () => ({
    meta: [
      { title: "Payments Received — Fragrance Billing" },
      {
        name: "description",
        content: "Record and review customer payments applied to outstanding bills.",
      },
      { property: "og:title", content: "Payments Received — Fragrance Billing" },
      {
        property: "og:description",
        content: "Record and review customer payments applied to outstanding bills.",
      },
    ],
  }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { data: payments = [], isLoading } = usePaymentsReceived();
  const { data: customers = [] } = useCustomers();
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<PaymentRow | null>(null);

  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [customerId, setCustomerId] = useState("all");
  const [method, setMethod] = useState("all");

  const rows = useMemo(
    () =>
      payments.filter((p) => {
        if (from && p.payment_date < from) return false;
        if (to && p.payment_date > to) return false;
        if (customerId !== "all" && p.customer_id !== customerId) return false;
        if (method !== "all" && p.payment_method !== method) return false;
        return true;
      }),
    [payments, from, to, customerId, method],
  );

  const totalReceived = rows.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments Received"
        description="Payments collected against finalized bills."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus />
            Record Payment
          </Button>
        }
      />

      <SyncIssuesBanner />

      <div className="surface-card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="from">From</Label>
          <Input
            id="from"
            type="date"
            className="h-11"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="to">To</Label>
          <Input
            id="to"
            type="date"
            className="h-11"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="filter-customer">Customer</Label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger id="filter-customer" className="h-11">
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
        </div>
        <div className="space-y-2">
          <Label htmlFor="filter-method">Method</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger id="filter-method" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All methods</SelectItem>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="surface-card p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <p className="text-sm font-medium">
            {rows.length} payment{rows.length === 1 ? "" : "s"}
          </p>
          <p className="numeric text-xl font-bold">{formatMoney(totalReceived)}</p>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading payments…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No payments yet"
            description="Record a payment when a customer settles an outstanding bill."
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">Customer</th>
                    <th className="px-3 py-3">Method</th>
                    <th className="px-3 py-3">Reference</th>
                    <th className="px-3 py-3">Bills</th>
                    <th className="px-3 py-3 text-right">Amount</th>
                    <th className="px-3 py-3 text-right">
                      <span className="sr-only">Actions</span>
                    </th>

                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-3 text-sm text-muted-foreground">
                        {formatDate(p.payment_date)}
                      </td>
                      <td className="px-3 py-3 text-sm font-medium">
                        {p.customers?.name ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-sm text-muted-foreground">
                        {p.payment_method}
                      </td>
                      <td className="px-3 py-3 text-sm text-muted-foreground">
                        {p.reference_number ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-sm text-muted-foreground">
                        {p.payment_allocations
                          .map((a) => a.bills?.bill_number)
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </td>
                      <td className="numeric px-3 py-3 text-right text-sm font-semibold">
                        {formatMoney(p.amount)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Reverse payment of ${formatMoney(p.amount)}`}
                          onClick={() => setToDelete(p)}
                        >
                          <Trash2 className="text-destructive" />
                        </Button>
                      </td>
                    </tr>

                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="space-y-3 md:hidden">
              {rows.map((p) => (
                <li key={p.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.customers?.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(p.payment_date)} · {p.payment_method}
                      </p>
                    </div>
                    <p className="numeric shrink-0 text-base font-bold">{formatMoney(p.amount)}</p>
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      {p.payment_allocations
                        .map((a) => a.bills?.bill_number)
                        .filter(Boolean)
                        .join(", ") || "Unallocated"}
                      {p.reference_number ? ` · Ref ${p.reference_number}` : ""}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Reverse payment of ${formatMoney(p.amount)}`}
                      onClick={() => setToDelete(p)}
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </div>
                </li>

              ))}
            </ul>
          </>
        )}
      </div>

      <RecordPaymentDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
