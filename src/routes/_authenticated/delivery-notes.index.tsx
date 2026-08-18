import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Truck, Plus, Search } from "lucide-react";
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
import { deliveryTone, useDeliveryNotes } from "@/lib/sales";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/delivery-notes/")({
  head: () => ({
    meta: [
      { title: "Delivery Notes — Fragrance Billing" },
      { name: "description", content: "Dispatch records for goods sent out to customers." },
      { property: "og:title", content: "Delivery Notes — Fragrance Billing" },
      { property: "og:description", content: "Dispatch records for goods sent out to customers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeliveryNotesPage,
});

function DeliveryNotesPage() {
  const navigate = useNavigate();
  const { data: notes = [], isLoading } = useDeliveryNotes();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes.filter((n) => {
      const matchesQuery =
        !q ||
        (n.delivery_number ?? "").toLowerCase().includes(q) ||
        (n.customers?.name ?? "").toLowerCase().includes(q) ||
        (n.sales_orders?.order_number ?? "").toLowerCase().includes(q);
      return matchesQuery && (status === "all" || n.status === status);
    });
  }, [notes, query, status]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Delivery Notes"
        description="Record what physically left the warehouse, with or without a sales order."
        actions={
          <Button asChild>
            <Link to="/delivery-notes/new">
              <Plus />
              New Delivery Note
            </Link>
          </Button>
        }
      />

      <div className="surface-card overflow-hidden">
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-[minmax(0,1fr)_200px]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 pl-9"
              placeholder="Search delivery number, customer or order"
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
              <SelectItem value="Dispatched">Dispatched</SelectItem>
              <SelectItem value="Delivered">Delivered</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading delivery notes…</p>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Truck}
            title={notes.length === 0 ? "No delivery notes yet" : "No matches"}
            description={
              notes.length === 0
                ? "Create a delivery note when goods are dispatched to a customer."
                : "Try a different delivery number, customer or status."
            }
            {...(notes.length === 0
              ? {
                  actionLabel: "New Delivery Note",
                  onAction: () => {
                    void navigate({ to: "/delivery-notes/new" });
                  },
                }
              : {})}
          />
        ) : (
          <>
            <table className="hidden w-full md:table">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Delivery #</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Sales Order</th>
                  <th className="px-4 py-3">Warehouse</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((n) => (
                  <tr
                    key={n.id}
                    className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                    onClick={() =>
                      navigate({ to: "/delivery-notes/$deliveryId", params: { deliveryId: n.id } })
                    }
                  >
                    <td className="px-4 py-3 text-sm font-medium">{n.delivery_number}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatDate(n.delivery_date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {n.customers?.name ?? "Walk-in"}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {n.bills ? (
                        <Link
                          to="/bills/$billId"
                          params={{ billId: n.bills.id }}
                          className="font-medium text-foreground underline underline-offset-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          From Bill {n.bills.bill_number ?? "—"}
                        </Link>
                      ) : (
                        "Standalone"
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {n.sales_orders?.order_number ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {n.warehouses?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={deliveryTone(n.status)}>{n.status}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>


            <div className="divide-y divide-border/60 md:hidden">
              {visible.map((n) => (
                <Link
                  key={n.id}
                  to="/delivery-notes/$deliveryId"
                  params={{ deliveryId: n.id }}
                  className="block space-y-2 p-4 active:bg-muted/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{n.delivery_number}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {n.customers?.name ?? "Walk-in"} · {formatDate(n.delivery_date)}
                      </p>
                    </div>
                    <StatusBadge tone={deliveryTone(n.status)}>{n.status}</StatusBadge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {n.bills
                      ? `From Bill ${n.bills.bill_number ?? "—"}`
                      : (n.sales_orders?.order_number ?? "Standalone")}{" "}
                    · {n.warehouses?.name ?? "—"}

                  </p>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
