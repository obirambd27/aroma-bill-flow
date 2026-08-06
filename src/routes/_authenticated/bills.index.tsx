import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ReceiptText, Search, Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBills } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/bills/")({
  head: () => ({
    meta: [
      { title: "Bill History — Fragrance Billing" },
      { name: "description", content: "Every bill issued, with payment status." },
      { property: "og:title", content: "Bill History — Fragrance Billing" },
      { property: "og:description", content: "Every bill issued, with payment status." },
    ],
  }),
  component: BillsPage,
});

function paymentTone(status: string) {
  if (status === "Paid") return "success" as const;
  if (status === "Partial") return "warning" as const;
  return "neutral" as const;
}

function BillsPage() {
  const navigate = useNavigate();
  const { data: bills = [], isLoading } = useBills();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bills.filter((b) => {
      const matchesQuery =
        !q ||
        (b.bill_number ?? "").toLowerCase().includes(q) ||
        (b.customers?.name ?? "").toLowerCase().includes(q);
      const matchesStatus = status === "all" || b.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [bills, query, status]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bill History"
        description="All bills, drafts and voided records."
        actions={
          <Button asChild>
            <Link to="/new-bill">
              <Plus />
              New Bill
            </Link>
          </Button>
        }
      />

      <div className="surface-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 pl-9"
              placeholder="Search bill number or customer"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-11 sm:w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="Draft">Draft</SelectItem>
              <SelectItem value="Finalized">Finalized</SelectItem>
              <SelectItem value="Voided">Voided</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading bills…</p>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title={bills.length === 0 ? "No bills yet" : "No matches"}
            description={
              bills.length === 0
                ? "Create your first sales bill — it only takes a few seconds."
                : "Try a different bill number, customer or status."
            }
          />
        ) : (
          <>
            <table className="hidden w-full md:table">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Bill</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((b) => (
                  <tr
                    key={b.id}
                    className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                    onClick={() => navigate({ to: "/bills/$billId", params: { billId: b.id } })}
                  >
                    <td className="px-4 py-3 text-sm font-medium">{b.bill_number}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {b.customers?.name ?? "Walk-in"}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatDate(b.bill_date)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={b.status === "Voided" ? "error" : "neutral"}>
                        {b.status}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={paymentTone(b.payment_status)}>
                        {b.payment_status}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3"></td>
                    <td className="numeric px-4 py-3 text-right text-sm font-bold">
                      {formatMoney(b.total_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="divide-y divide-border/60 md:hidden">
              {visible.map((b) => (
                <Link
                  key={b.id}
                  to="/bills/$billId"
                  params={{ billId: b.id }}
                  className="block space-y-2 p-4 active:bg-muted/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{b.bill_number}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {b.customers?.name ?? "Walk-in"} · {formatDate(b.bill_date)}
                      </p>
                    </div>
                    <p className="numeric shrink-0 text-base font-bold">
                      {formatMoney(b.total_amount)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge tone={b.status === "Voided" ? "error" : "neutral"}>
                      {b.status}
                    </StatusBadge>
                    <StatusBadge tone={paymentTone(b.payment_status)}>
                      {b.payment_status}
                    </StatusBadge>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
