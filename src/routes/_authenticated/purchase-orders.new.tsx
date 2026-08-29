import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Package, Search, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ProductFormDialog } from "@/components/ProductFormDialog";
import { VendorFormDialog } from "@/components/VendorFormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { defaultWarehouseId, useProducts, useSettings, useWarehouses } from "@/lib/data";
import { usePurchaseOrder, useVendors } from "@/lib/purchases";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/purchase-orders/new")({
  validateSearch: (search: Record<string, unknown>): { edit?: string; vendorId?: string } => ({
    ...(typeof search["edit"] === "string" ? { edit: search["edit"] } : {}),
    ...(typeof search["vendorId"] === "string" ? { vendorId: search["vendorId"] } : {}),
  }),
  head: () => ({
    meta: [
      { title: "New Purchase Order — Fragrance Billing" },
      { name: "description", content: "Plan an order of stock from one of your suppliers." },
      { property: "og:title", content: "New Purchase Order — Fragrance Billing" },
      {
        property: "og:description",
        content: "Plan an order of stock from one of your suppliers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PurchaseOrderBuilder,
});

type Line = { productId: string; name: string; unitCost: number; quantity: number };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function PurchaseOrderBuilder() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const editId = search.edit ?? "";
  const { data: existing } = usePurchaseOrder(editId);

  const { data: vendors = [] } = useVendors();
  const { data: products = [] } = useProducts();
  const { data: warehouses = [] } = useWarehouses();
  const { data: settings } = useSettings();

  const [vendorId, setVendorId] = useState(search.vendorId ?? "");
  const [orderDate, setOrderDate] = useState(todayISO());
  const [warehouseId, setWarehouseId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [isTaxed, setIsTaxed] = useState(false);
  const [taxRateInput, setTaxRateInput] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [vendorDialog, setVendorDialog] = useState(false);
  const [productDialog, setProductDialog] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!existing || hydrated) return;
    setVendorId(existing.vendor_id ?? "");
    setOrderDate(existing.order_date);
    setWarehouseId(existing.warehouse_id ?? "");
    setNotes(existing.notes ?? "");
    setIsTaxed(Number(existing.tax_amount) > 0);
    setLines(
      existing.purchase_order_items.map((i) => ({
        productId: i.product_id ?? "",
        name: i.product_name_snapshot,
        unitCost: Number(i.unit_cost),
        quantity: Number(i.quantity),
      })),
    );
    setHydrated(true);
  }, [existing, hydrated]);

  const activeWarehouseId = warehouseId || defaultWarehouseId(warehouses);
  const taxRate = Number(taxRateInput ?? settings?.default_tax_rate ?? 0);

  const results = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku ?? "").toLowerCase().includes(q) ||
          (p.brand ?? "").toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [products, productSearch]);

  const subtotal = lines.reduce((s, l) => s + l.unitCost * l.quantity, 0);
  const taxAmount = isTaxed ? (subtotal * taxRate) / 100 : 0;
  const total = subtotal + taxAmount;

  const addLine = (productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    setLines((prev) =>
      prev.some((l) => l.productId === productId)
        ? prev.map((l) => (l.productId === productId ? { ...l, quantity: l.quantity + 1 } : l))
        : [
            ...prev,
            { productId: p.id, name: p.name, unitCost: Number(p.cost_price ?? 0), quantity: 1 },
          ],
    );
    setProductSearch("");
  };

  const patchLine = (productId: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));

  const removeLine = (productId: string) =>
    setLines((prev) => prev.filter((l) => l.productId !== productId));

  const save = async () => {
    if (!vendorId) {
      toast.error("Select a vendor");
      return;
    }
    if (lines.length === 0) {
      toast.error("Add at least one product to the order");
      return;
    }
    if (!activeWarehouseId) {
      toast.error("Select a warehouse");
      return;
    }

    setSaving(true);
    const payload = {
      vendor_id: vendorId,
      order_date: orderDate,
      warehouse_id: activeWarehouseId,
      subtotal,
      tax_amount: taxAmount,
      total_amount: total,
      notes: notes || null,
    };

    try {
      if (existing) {
        const { error } = await supabase
          .from("purchase_orders")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
        await supabase.from("purchase_order_items").delete().eq("purchase_order_id", existing.id);
        const { error: itemsError } = await supabase.from("purchase_order_items").insert(
          lines.map((l) => ({
            purchase_order_id: existing.id,
            product_id: l.productId,
            product_name_snapshot: l.name,
            quantity: l.quantity,
            unit_cost: l.unitCost,
            line_total: l.unitCost * l.quantity,
          })),
        );
        if (itemsError) throw itemsError;
        queryClient.invalidateQueries();
        toast.success("Purchase order updated");
        navigate({ to: "/purchase-orders/$orderId", params: { orderId: existing.id } });
        return;
      }

      const { data: order, error } = await supabase
        .from("purchase_orders")
        .insert({ ...payload, status: "Open" })
        .select()
        .single();
      if (error || !order) throw error ?? new Error("Could not save the purchase order");

      const { error: itemsError } = await supabase.from("purchase_order_items").insert(
        lines.map((l) => ({
          purchase_order_id: order.id,
          product_id: l.productId,
          product_name_snapshot: l.name,
          quantity: l.quantity,
          unit_cost: l.unitCost,
          line_total: l.unitCost * l.quantity,
        })),
      );
      if (itemsError) throw itemsError;

      queryClient.invalidateQueries();
      toast.success(`Purchase order ${order.order_number} created`);
      navigate({ to: "/purchase-orders/$orderId", params: { orderId: order.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the purchase order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-28 lg:pb-0">
      <PageHeader
        title={existing ? `Edit ${existing.order_number}` : "New Purchase Order"}
        description="A planning document — stock only moves once you record the purchase bill."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="space-y-4">
          <div className="surface-card grid gap-4 p-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="po-vendor">Vendor</Label>
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => setVendorDialog(true)}
                >
                  + New Vendor
                </button>
              </div>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger id="po-vendor" className="h-11">
                  <SelectValue placeholder="Select a vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                      {v.phone ? ` · ${v.phone}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="po-date">Order Date</Label>
              <Input
                id="po-date"
                type="date"
                className="h-11"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="po-warehouse">Deliver to warehouse</Label>
              <Select value={activeWarehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger id="po-warehouse" className="h-11">
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
          </div>

          <div className="surface-card p-5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="po-product">Items</Label>
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => setProductDialog(true)}
              >
                + New Product
              </button>
            </div>

            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="po-product"
                className="h-11 pl-9"
                placeholder="Search products by name, SKU or brand"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
              {results.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
                  {results.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted"
                        onClick={() => addLine(p.id)}
                      >
                        <span className="min-w-0 truncate">{p.name}</span>
                        <span className="numeric shrink-0 text-xs text-muted-foreground">
                          cost {formatMoney(p.cost_price ?? 0)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {lines.length === 0 ? (
              <div className="mt-4 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-10 text-center">
                <Package className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No items on this order yet</p>
              </div>
            ) : (
              <div className="mt-2 divide-y divide-border/60">
                {lines.map((l) => (
                  <div key={l.productId} className="space-y-2 py-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{l.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Unit cost × quantity</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${l.name}`}
                        onClick={() => removeLine(l.productId)}
                      >
                        <Trash2 className="text-muted-foreground" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_88px_auto] items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        aria-label={`Unit cost for ${l.name}`}
                        className="numeric h-10"
                        value={String(l.unitCost)}
                        onChange={(e) =>
                          patchLine(l.productId, { unitCost: Number(e.target.value) || 0 })
                        }
                      />
                      <Input
                        type="number"
                        min={1}
                        aria-label={`Quantity for ${l.name}`}
                        className="numeric h-10 text-center"
                        value={String(l.quantity)}
                        onChange={(e) =>
                          patchLine(l.productId, {
                            quantity: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                      />
                      <p className="numeric w-24 text-right text-sm font-semibold">
                        {formatMoney(l.unitCost * l.quantity)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="surface-card space-y-2 p-5">
            <Label htmlFor="po-notes">Notes</Label>
            <Textarea
              id="po-notes"
              rows={3}
              placeholder="Expected delivery, payment terms…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="surface-card space-y-4 p-5 lg:sticky lg:top-6">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="po-tax">Apply tax</Label>
            <Switch id="po-tax" checked={isTaxed} onCheckedChange={setIsTaxed} />
          </div>
          {isTaxed && (
            <div className="space-y-2">
              <Label htmlFor="po-tax-rate">Tax rate %</Label>
              <Input
                id="po-tax-rate"
                type="number"
                min={0}
                step="0.01"
                className="numeric h-10"
                value={String(taxRateInput ?? settings?.default_tax_rate ?? 0)}
                onChange={(e) => setTaxRateInput(e.target.value)}
              />
            </div>
          )}

          <dl className="space-y-2 border-t border-border pt-4 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="numeric font-medium">{formatMoney(subtotal)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Tax</dt>
              <dd className="numeric font-medium">{formatMoney(taxAmount)}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <dt className="text-sm font-semibold">Order total</dt>
              <dd className="numeric text-2xl font-bold">{formatMoney(total)}</dd>
            </div>
          </dl>

          <Button className="hidden h-12 w-full lg:flex" disabled={saving} onClick={save}>
            {saving ? "Saving…" : existing ? "Save changes" : "Create Purchase Order"}
          </Button>
        </div>
      </div>

      {/* Mobile sticky bar */}
      <div className="fixed inset-x-0 bottom-14 z-20 border-t border-border bg-card p-3 lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Order total</p>
            <p className="numeric truncate text-lg font-bold">{formatMoney(total)}</p>
          </div>
          <Button className="h-11 shrink-0" disabled={saving} onClick={save}>
            {saving ? "Saving…" : existing ? "Save" : "Create Order"}
          </Button>
        </div>
      </div>

      <VendorFormDialog
        open={vendorDialog}
        onOpenChange={setVendorDialog}
        onSaved={(v) => setVendorId(v.id)}
      />
      <ProductFormDialog
        open={productDialog}
        onOpenChange={setProductDialog}
        warehouses={warehouses}
        {...(activeWarehouseId ? { defaultWarehouseId: activeWarehouseId } : {})}
      />
    </div>
  );
}
