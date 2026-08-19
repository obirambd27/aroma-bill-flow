import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShoppingBag, Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, formatMoney } from "@/lib/format";
import { ORDER_STATUSES, orderStatusTone, usePriceListOrders } from "@/lib/price-list-orders";

export const Route = createFileRoute("/_authenticated/price-list-orders/")({
  head: () => ({
    meta: [
      { title: "Online Orders — Fragrance Billing" },
      {
        name: "description",
        content: "Orders placed by customers through your shared price list links.",
      },
      { property: "og:title", content: "Online Orders — Fragrance Billing" },
      {
        property: "og:description",
        content: "Orders placed by customers through your shared price list links.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OnlineOrdersPage,
});

function OnlineOrdersPage() {
  const navigate = useNavigate();
  const { data: orders = [], isLoading } = usePriceListOrders();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      const matchesQuery =
        !q ||
        (o.order_number ?? "").toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        o.customer_phone.toLowerCase().includes(q);
      return matchesQuery && (status === "all" || o.status === status);
    });
  }, [orders, query, status]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Online Orders"
        description="Orders customers placed through your shared price list links."
      />

      <div className="surface-card overflow-hidden">
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-[minmax(0,1fr)_200px]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 pl-9"
              placeholder="Search order number, name or phone"
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
              {ORDER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="No online orders yet"
            description="Share a price list link with customers and their orders will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Price List</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => (
                  <tr
                    key={o.id}
                    tabIndex={0}
                    onClick={() =>
                      navigate({
                        to: "/price-list-orders/$orderId",
                        params: { orderId: o.id },
                      })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        void navigate({
                          to: "/price-list-orders/$orderId",
                          params: { orderId: o.id },
                        });
                    }}
                    className="cursor-pointer border-t border-border hover:bg-muted/40"
                  >
                    <td className="px-4 py-3 font-medium">
                      <span className="flex items-center gap-2">
                        {!o.is_viewed && (
                          <span
                            aria-label="Unread"
                            className="h-2 w-2 shrink-0 rounded-full bg-destructive"
                          />
                        )}
                        <span className={o.is_viewed ? "" : "font-bold"}>
                          {o.order_number ?? "—"}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={o.is_viewed ? "block" : "block font-bold"}>
                        {o.customer_name}
                      </span>
                      <span className="text-xs text-muted-foreground">{o.customer_phone}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {o.price_lists?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(o.created_at.slice(0, 10))}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatMoney(Number(o.admin_adjusted_total ?? o.total_amount))}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={orderStatusTone(o.status)}>{o.status}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
