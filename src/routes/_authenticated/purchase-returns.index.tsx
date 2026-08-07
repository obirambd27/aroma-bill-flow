import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, RotateCcw, Search } from "lucide-react";
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
import {
  PURCHASE_RETURN_STATUSES,
  purchaseReturnTone,
  usePurchaseReturns,
} from "@/lib/purchase-returns";
import { formatDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/purchase-returns/")({
  head: () => ({
    meta: [
      { title: "Purchase Returns — Fragrance Billing" },
      {
        name: "description",
        content: "Goods sent back to vendors, stock deductions and payable reversals.",
      },
      { property: "og:title", content: "Purchase Returns — Fragrance Billing" },
      {
        property: "og:description",
        content: "Goods sent back to vendors, stock deductions and payable reversals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PurchaseReturnsPage,
});

function PurchaseReturnsPage() {
  const navigate = useNavigate();
  const { data: returns = [], isLoading } = usePurchaseReturns();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return returns.filter((r) => {
      const matchesQuery =
        !q ||
        (r.return_number ?? "").toLowerCase().includes(q) ||
        (r.vendors?.name ?? "").toLowerCase().includes(q) ||
        (r.purchase_bills?.bill_number ?? "").toLowerCase().includes(q);
      const matchesStatus = status === "all" || r.status === status;
      const matchesFrom = !from || r.return_date >= from;
      const matchesTo = !to || r.return_date <= to;
      return matchesQuery && matchesStatus && matchesFrom && matchesTo;
    });
  }, [returns, query, status, from, to]);

  const total = visible.reduce((s, r) => s + Number(r.total_amount), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Returns"
        description="Send goods back to a vendor and reverse the stock and payable."
        actions={
          <Button asChild>
            <Link to="/purchase-returns/new" search={{ purchaseBillId: undefined }}>
              <Plus />
              New Purchase Return
            </Link>
          </Button>
        }
      />

      <div className="surface-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Returned value</p>
          <p className="numeric text-2xl font-bold">{formatMoney(total)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Returns</p>
          <p className="numeric text-2xl font-bold">{visible.length}</p>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative min-w-0 lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 pl-9"
              placeholder="Search return, vendor or bill"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {PURCHASE_RETURN_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <p className="p-8 text-center text-sm text-muted-foreground">Loading purchase returns…</p>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={RotateCcw}
            title={returns.length === 0 ? "No purchase returns yet" : "No matches"}
            description={
              returns.length === 0
                ? "Record a return when goods go back to a vendor."
                : "Try a different return number, vendor, status or date range."
            }
            {...(returns.length === 0
              ? {
                  actionLabel: "New Purchase Return",
                  onAction: () => {
                    void navigate({ to: "/purchase-returns/new", search: { purchaseBillId: undefined } });
                  },
                }
              : {})}
          />
        ) : (
          <>
            <table className="hidden w-full md:table">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Return</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Purchase Bill</th>
                  <th className="px-4 py-3">Warehouse</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                    onClick={() =>
                      navigate({ to: "/purchase-returns/$returnId", params: { returnId: r.id } })
                    }
                  >
                    <td className="px-4 py-3 text-sm font-medium">{r.return_number}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatDate(r.return_date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {r.vendors?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {r.purchase_bills?.bill_number ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {r.warehouses?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={purchaseReturnTone(r.status)}>{r.status}</StatusBadge>
                    </td>
                    <td className="numeric px-4 py-3 text-right text-sm font-bold">
                      {formatMoney(r.total_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="divide-y divide-border/60 md:hidden">
              {visible.map((r) => (
                <Link
                  key={r.id}
                  to="/purchase-returns/$returnId"
                  params={{ returnId: r.id }}
                  className="block space-y-2 p-4 active:bg-muted/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{r.return_number}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.vendors?.name ?? "—"} · {formatDate(r.return_date)}
                      </p>
                    </div>
                    <p className="numeric shrink-0 text-base font-bold">
                      {formatMoney(r.total_amount)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={purchaseReturnTone(r.status)}>{r.status}</StatusBadge>
                    {r.purchase_bills?.bill_number && (
                      <span className="text-xs text-muted-foreground">
                        against {r.purchase_bills.bill_number}
                      </span>
                    )}
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
