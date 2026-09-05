import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
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
import { cn } from "@/lib/utils";

export function DeliveryNotesList({ selectedId }: { selectedId?: string }) {
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
          <div className="divide-y divide-border/60">
            {visible.map((n) => (
              <Link
                key={n.id}
                to="/delivery-notes/$deliveryId"
                params={{ deliveryId: n.id }}
                className={cn(
                  "block space-y-2 p-4 transition-colors active:bg-muted/60",
                  selectedId === n.id && "bg-muted/60",
                )}
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
        )}
      </div>
    </div>
  );
}
