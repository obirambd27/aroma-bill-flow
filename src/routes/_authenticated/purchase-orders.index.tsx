import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ClipboardList, Plus, Search } from "lucide-react";
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
import { PO_STATUSES, purchaseOrderTone, usePurchaseOrders, useVendors } from "@/lib/purchases";
import { formatDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/purchase-orders/")({
  head: () => ({
    meta: [
      { title: "Purchase Orders — Fragrance Billing" },
      { name: "description", content: "Stock you have ordered from suppliers, and what arrived." },
      { property: "og:title", content: "Purchase Orders — Fragrance Billing" },
      {
        property: "og:description",
        content: "Stock you have ordered from suppliers, and what arrived.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PurchaseOrdersPage,
});

function progress(items: { quantity: number; quantity_received: number }[]) {
  const ordered = items.reduce((s, i) => s + Number(i.quantity), 0);
  const received = items.reduce((s, i) => s + Number(i.quantity_received), 0);
  return { ordered, received };
}

function PurchaseOrdersPage() {
  const navigate = useNavigate();
  const { data: orders = [], isLoading } = usePurchaseOrders();
  const { data: vendors = [] } = useVendors();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [vendorId, setVendorId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      const matchesQuery =
        !q ||
        (o.order_number ?? "").toLowerCase().includes(q) ||
        (o.vendors?.name ?? "").toLowerCase().includes(q);
      const matchesStatus = status === "all" || o.status === status;
      const matchesVendor = vendorId === "all" || o.vendor_id === vendorId;
      const matchesFrom = !from || o.order_date >= from;
      const matchesTo = !to || o.order_date <= to;
      return matchesQuery && matchesStatus && matchesVendor && matchesFrom && matchesTo;
    });
  }, [orders, query, status, vendorId, from, to]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Orders"
        description="Plan what you order from suppliers before the stock arrives."
        actions={
          <Button asChild>
            <Link to="/purchase-orders/new">
              <Plus />
              New Purchase Order
            </Link>
          </Button>
        }
      />

      <div className="surface-card overflow-hidden">
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative min-w-0 lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 pl-9"
              placeholder="Search order number or vendor"
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
              {PO_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={vendorId} onValueChange={setVendorId}>
            <SelectTrigger className="h-11">
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
          <div className="flex items-center gap-2 sm:col-span-2">
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
          <p className="p-8 text-center text-sm text-muted-foreground">Loading purchase orders…</p>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={orders.length === 0 ? "No purchase orders yet" : "No matches"}
            description={
              orders.length === 0
                ? "Create a purchase order to plan the stock you're buying from a supplier."
                : "Try a different order number, vendor, status or date range."
            }
            {...(orders.length === 0
              ? {
                  actionLabel: "New Purchase Order",
                  onAction: () => {
                    void navigate({ to: "/purchase-orders/new" });
                  },
                }
              : {})}
          />
        ) : (
          <>
            <table className="hidden w-full md:table">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Warehouse</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Received</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => {
                  const p = progress(o.purchase_order_items ?? []);
                  return (
                    <tr
                      key={o.id}
                      className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                      onClick={() =>
                        navigate({ to: "/purchase-orders/$orderId", params: { orderId: o.id } })
                      }
                    >
                      <td className="px-4 py-3 text-sm font-medium">{o.order_number}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatDate(o.order_date)}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {o.vendors?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {o.warehouses?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={purchaseOrderTone(o.status)}>{o.status}</StatusBadge>
                      </td>
                      <td className="numeric px-4 py-3 text-sm text-muted-foreground">
                        {p.received}/{p.ordered} received
                      </td>
                      <td className="numeric px-4 py-3 text-right text-sm font-bold">
                        {formatMoney(o.total_amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="divide-y divide-border/60 md:hidden">
              {visible.map((o) => {
                const p = progress(o.purchase_order_items ?? []);
                return (
                  <Link
                    key={o.id}
                    to="/purchase-orders/$orderId"
                    params={{ orderId: o.id }}
                    className="block space-y-2 p-4 active:bg-muted/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{o.order_number}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {o.vendors?.name ?? "—"} · {formatDate(o.order_date)}
                        </p>
                      </div>
                      <p className="numeric shrink-0 text-base font-bold">
                        {formatMoney(o.total_amount)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={purchaseOrderTone(o.status)}>{o.status}</StatusBadge>
                      <span className="numeric text-xs text-muted-foreground">
                        {p.received}/{p.ordered} received
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
