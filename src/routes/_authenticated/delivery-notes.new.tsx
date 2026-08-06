import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Package, Search, Trash2, Truck } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCustomers, useProducts, useWarehouses } from "@/lib/data";
import { useSalesOrder } from "@/lib/sales";

export const Route = createFileRoute("/_authenticated/delivery-notes/new")({
  validateSearch: (search: Record<string, unknown>): { orderId?: string } => ({
    ...(typeof search["orderId"] === "string" ? { orderId: search["orderId"] as string } : {}),
  }),
  head: () => ({
    meta: [
      { title: "New Delivery Note — Fragrance Billing" },
      { name: "description", content: "Record a dispatch of goods against an order or ad hoc." },
      { property: "og:title", content: "New Delivery Note — Fragrance Billing" },
      {
        property: "og:description",
        content: "Record a dispatch of goods against an order or ad hoc.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeliveryNoteBuilder,
});

type Line = { productId: string; name: string; quantity: number; max: number | null };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function DeliveryNoteBuilder() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const { data: order } = useSalesOrder(search.orderId ?? "");
  const { data: products = [] } = useProducts();
  const { data: customers = [] } = useCustomers();
  const { data: warehouses = [] } = useWarehouses();

  const [customerId, setCustomerId] = useState("walk-in");
  const [deliveryDate, setDeliveryDate] = useState(todayISO());
  const [warehouseId, setWarehouseId] = useState("");
  const [status, setStatus] = useState("Dispatched");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!order || hydrated) return;
    setCustomerId(order.customer_id ?? "walk-in");
    if (order.warehouse_id) setWarehouseId(order.warehouse_id);
    setLines(
      order.sales_order_items
        .map((i) => {
          const remaining = Number(i.quantity) - Number(i.quantity_delivered);
          return {
            productId: i.product_id ?? "",
            name: i.product_name_snapshot,
            quantity: Math.max(remaining, 0),
            max: remaining,
          };
        })
        .filter((l) => l.productId && (l.max ?? 0) > 0),
    );
    setHydrated(true);
  }, [order, hydrated]);

  const activeWarehouseId = warehouseId || warehouses[0]?.id || "";

  const results = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q || order) return [];
    return products
      .filter(
        (p) => p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [products, productSearch, order]);

  const addLine = (productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    setLines((prev) =>
      prev.some((l) => l.productId === productId)
        ? prev.map((l) => (l.productId === productId ? { ...l, quantity: l.quantity + 1 } : l))
        : [...prev, { productId: p.id, name: p.name, quantity: 1, max: null }],
    );
    setProductSearch("");
  };

  const save = async () => {
    const payload = lines.filter((l) => l.quantity > 0);
    if (payload.length === 0) {
      toast.error("Add at least one item to deliver");
      return;
    }
    if (!activeWarehouseId) {
      toast.error("Select a warehouse");
      return;
    }
    setSaving(true);
    try {
      const { data: note, error } = await supabase
        .from("delivery_notes")
        .insert({
          sales_order_id: order?.id ?? null,
          customer_id: customerId === "walk-in" ? null : customerId,
          delivery_date: deliveryDate,
          warehouse_id: activeWarehouseId,
          status,
          notes: notes || null,
        })
        .select()
        .single();
      if (error || !note) throw error ?? new Error("Could not save the delivery note");

      const { error: itemsError } = await supabase.from("delivery_note_items").insert(
        payload.map((l) => ({
          delivery_note_id: note.id,
          product_id: l.productId,
          product_name_snapshot: l.name,
          quantity: l.quantity,
        })),
      );
      if (itemsError) throw itemsError;

      // Roll the delivered quantities back onto the sales order.
      if (order) {
        for (const item of order.sales_order_items) {
          const line = payload.find((l) => l.productId === item.product_id);
          if (!line) continue;
          await supabase
            .from("sales_order_items")
            .update({
              quantity_delivered: Math.min(
                Number(item.quantity_delivered) + line.quantity,
                Number(item.quantity),
              ),
            })
            .eq("id", item.id);
        }
        const { data: fresh } = await supabase
          .from("sales_order_items")
          .select("quantity, quantity_delivered")
          .eq("sales_order_id", order.id);
        const allDelivered = (fresh ?? []).every(
          (i) => Number(i.quantity_delivered) >= Number(i.quantity),
        );
        const anyDelivered = (fresh ?? []).some((i) => Number(i.quantity_delivered) > 0);
        if (order.status === "Open" || order.status === "Partially Delivered") {
          await supabase
            .from("sales_orders")
            .update({
              status: allDelivered
                ? "Fully Delivered"
                : anyDelivered
                  ? "Partially Delivered"
                  : order.status,
            })
            .eq("id", order.id);
        }
      }

      queryClient.invalidateQueries();
      toast.success(`Delivery note ${note.delivery_number} created`);
      navigate({ to: "/delivery-notes/$deliveryId", params: { deliveryId: note.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the delivery note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Delivery Note"
        description={
          order
            ? `Dispatching against ${order.order_number} — quantities are capped at what's still pending.`
            : "Record a dispatch. Stock on hand is not deducted by a delivery note."
        }
      />

      <div className="surface-card grid gap-4 p-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="dn-customer">Customer</Label>
          <Select value={customerId} onValueChange={setCustomerId} disabled={!!order}>
            <SelectTrigger id="dn-customer" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="walk-in">Walk-in customer</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="dn-date">Delivery Date</Label>
          <Input
            id="dn-date"
            type="date"
            className="h-11"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dn-warehouse">Warehouse</Label>
          <Select value={activeWarehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger id="dn-warehouse" className="h-11">
              <SelectValue placeholder="Select warehouse" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="dn-status">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="dn-status" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Dispatched">Dispatched</SelectItem>
              <SelectItem value="Delivered">Delivered</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="surface-card p-5">
        <Label htmlFor="dn-product">Items</Label>
        {!order && (
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="dn-product"
              className="h-11 pl-9"
              placeholder="Search products to dispatch"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
            {results.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2.5 text-left text-sm hover:bg-muted"
                      onClick={() => addLine(p.id)}
                    >
                      {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {lines.length === 0 ? (
          <div className="mt-4 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-10 text-center">
            <Package className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nothing to dispatch yet</p>
          </div>
        ) : (
          <div className="mt-2 divide-y divide-border/60">
            {lines.map((l) => (
              <div key={l.productId} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.name}</p>
                  {l.max !== null && (
                    <p className="numeric mt-0.5 text-xs text-muted-foreground">
                      {l.max} pending on the order
                    </p>
                  )}
                </div>
                <Input
                  type="number"
                  min={0}
                  aria-label={`Quantity for ${l.name}`}
                  className="numeric h-10 w-24 text-center"
                  value={String(l.quantity)}
                  onChange={(e) => {
                    const raw = Math.max(0, Number(e.target.value) || 0);
                    const capped = l.max !== null ? Math.min(raw, l.max) : raw;
                    setLines((prev) =>
                      prev.map((x) =>
                        x.productId === l.productId ? { ...x, quantity: capped } : x,
                      ),
                    );
                  }}
                />
                {!order && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${l.name}`}
                    onClick={() =>
                      setLines((prev) => prev.filter((x) => x.productId !== l.productId))
                    }
                  >
                    <Trash2 className="text-muted-foreground" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="surface-card space-y-2 p-5">
        <Label htmlFor="dn-notes">Notes</Label>
        <Textarea
          id="dn-notes"
          rows={3}
          placeholder="Driver, vehicle, reference…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <Button className="w-full sm:w-auto" disabled={saving} onClick={save}>
        <Truck />
        {saving ? "Saving…" : "Create Delivery Note"}
      </Button>
    </div>
  );
}
