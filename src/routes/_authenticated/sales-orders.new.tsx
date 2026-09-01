import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, Trash2, Package } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
import { ProductFormDialog } from "@/components/ProductFormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { defaultWarehouseId, useCustomers, useProducts, useProductStock, useSettings, useWarehouses } from "@/lib/data";
import { adjustCommitted, useSalesOrder } from "@/lib/sales";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/sales-orders/new")({
  validateSearch: (search: Record<string, unknown>): { edit?: string } => ({
    ...(typeof search["edit"] === "string" ? { edit: search["edit"] as string } : {}),
  }),
  head: () => ({
    meta: [
      { title: "New Sales Order — Fragrance Billing" },
      { name: "description", content: "Confirm a customer order and reserve warehouse stock." },
      { property: "og:title", content: "New Sales Order — Fragrance Billing" },
      {
        property: "og:description",
        content: "Confirm a customer order and reserve warehouse stock.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SalesOrderBuilder,
});

type Line = { productId: string; name: string; unitPrice: number; quantity: number };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function SalesOrderBuilder() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const editId = search.edit ?? "";
  const { data: existing } = useSalesOrder(editId);

  const { data: products = [] } = useProducts();
  const { data: customers = [] } = useCustomers();
  const { data: warehouses = [] } = useWarehouses();
  const { data: stock = [] } = useProductStock();
  const { data: settings } = useSettings();

  const [customerId, setCustomerId] = useState("walk-in");
  const [orderDate, setOrderDate] = useState(todayISO());
  const [warehouseId, setWarehouseId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [isTaxed, setIsTaxed] = useState(false);
  const [taxRateInput, setTaxRateInput] = useState<string | null>(null);
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [discountValue, setDiscountValue] = useState("0");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [customerDialog, setCustomerDialog] = useState(false);
  const [productDialog, setProductDialog] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!existing || hydrated) return;
    setCustomerId(existing.customer_id ?? "walk-in");
    setOrderDate(existing.order_date);
    setWarehouseId(existing.warehouse_id ?? "");
    setIsTaxed(existing.is_taxed);
    setTaxRateInput(String(existing.tax_rate));
    setDiscountType(existing.discount_type === "percent" ? "percent" : "amount");
    setDiscountValue(String(existing.discount_value ?? 0));
    setNotes(existing.notes ?? "");
    setLines(
      existing.sales_order_items.map((i) => ({
        productId: i.product_id ?? "",
        name: i.product_name_snapshot,
        unitPrice: Number(i.unit_price),
        quantity: Number(i.quantity),
      })),
    );
    setHydrated(true);
  }, [existing, hydrated]);

  const activeWarehouseId = warehouseId || defaultWarehouseId(warehouses);
  const taxRate = Number(taxRateInput ?? settings?.default_tax_rate ?? 0);

  const availableFor = (productId: string) => {
    const row = stock.find(
      (s) => s.product_id === productId && s.warehouse_id === activeWarehouseId,
    );
    return Math.max(Number(row?.stock_on_hand ?? 0) - Number(row?.committed_stock ?? 0), 0);
  };

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

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const discountAmount = Math.min(
    Math.max(
      discountType === "percent"
        ? (subtotal * (Number(discountValue) || 0)) / 100
        : Number(discountValue) || 0,
      0,
    ),
    subtotal,
  );
  const taxable = subtotal - discountAmount;
  const taxAmount = isTaxed ? (taxable * taxRate) / 100 : 0;
  const total = taxable + taxAmount;

  const addLine = (productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    setLines((prev) =>
      prev.some((l) => l.productId === productId)
        ? prev.map((l) => (l.productId === productId ? { ...l, quantity: l.quantity + 1 } : l))
        : [...prev, { productId: p.id, name: p.name, unitPrice: Number(p.price), quantity: 1 }],
    );
    setProductSearch("");
  };

  const patchLine = (productId: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));

  const removeLine = (productId: string) =>
    setLines((prev) => prev.filter((l) => l.productId !== productId));

  const save = async () => {
    if (lines.length === 0) {
      toast.error("Add at least one product to the order");
      return;
    }
    if (!activeWarehouseId) {
      toast.error("Select a warehouse");
      return;
    }
    setSaving(true);
    const isWalkIn = customerId === "walk-in";
    const payload = {
      customer_id: isWalkIn ? null : customerId,
      is_walk_in: isWalkIn,
      order_date: orderDate,
      warehouse_id: activeWarehouseId,
      is_taxed: isTaxed,
      tax_rate: isTaxed ? taxRate : 0,
      subtotal,
      tax_amount: taxAmount,
      discount_amount: discountAmount,
      discount_type: discountType,
      discount_value: Number(discountValue) || 0,
      total_amount: total,
      notes: notes || null,
    };

    try {
      if (existing) {
        // Release the previously reserved quantities before re-reserving.
        for (const item of existing.sales_order_items) {
          if (item.product_id && existing.warehouse_id) {
            await adjustCommitted(item.product_id, existing.warehouse_id, -Number(item.quantity));
          }
        }
        const { error } = await supabase
          .from("sales_orders")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
        await supabase.from("sales_order_items").delete().eq("sales_order_id", existing.id);
        const { error: itemsError } = await supabase.from("sales_order_items").insert(
          lines.map((l) => ({
            sales_order_id: existing.id,
            product_id: l.productId,
            product_name_snapshot: l.name,
            quantity: l.quantity,
            unit_price: l.unitPrice,
            line_total: l.unitPrice * l.quantity,
            warehouse_id: activeWarehouseId,
          })),
        );
        if (itemsError) throw itemsError;
        for (const l of lines) await adjustCommitted(l.productId, activeWarehouseId, l.quantity);
        queryClient.invalidateQueries();
        toast.success("Sales order updated");
        navigate({ to: "/sales-orders/$orderId", params: { orderId: existing.id } });
        return;
      }

      const { data: order, error } = await supabase
        .from("sales_orders")
        .insert({ ...payload, status: "Open" })
        .select()
        .single();
      if (error || !order) throw error ?? new Error("Could not save the order");

      const { error: itemsError } = await supabase.from("sales_order_items").insert(
        lines.map((l) => ({
          sales_order_id: order.id,
          product_id: l.productId,
          product_name_snapshot: l.name,
          quantity: l.quantity,
          unit_price: l.unitPrice,
          line_total: l.unitPrice * l.quantity,
          warehouse_id: activeWarehouseId,
        })),
      );
      if (itemsError) throw itemsError;

      for (const l of lines) await adjustCommitted(l.productId, activeWarehouseId, l.quantity);

      queryClient.invalidateQueries();
      toast.success(`Sales order ${order.order_number} created`);
      navigate({ to: "/sales-orders/$orderId", params: { orderId: order.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-28 lg:pb-0">
      <PageHeader
        title={existing ? `Edit ${existing.order_number}` : "New Sales Order"}
        description="Reserves stock as committed — nothing leaves the shelf until the bill is finalized."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="space-y-4">
          <div className="surface-card grid gap-4 p-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="so-customer">Customer</Label>
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => setCustomerDialog(true)}
                >
                  + New Customer
                </button>
              </div>
              <CustomerPicker
                id="so-customer"
                value={customerId}
                onChange={setCustomerId}
                onCreateNew={() => setCustomerDialog(true)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="so-date">Order Date</Label>
              <Input
                id="so-date"
                type="date"
                className="h-11"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="so-warehouse">Warehouse</Label>
              <Select value={activeWarehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger id="so-warehouse" className="h-11">
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
              <Label htmlFor="so-product">Items</Label>
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
                id="so-product"
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
                          {formatMoney(p.price)} · {availableFor(p.id)} avail.
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
                        <p className="numeric mt-0.5 text-xs text-muted-foreground">
                          {availableFor(l.productId)} available for sale
                        </p>
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
                        aria-label={`Unit price for ${l.name}`}
                        className="numeric h-10"
                        value={String(l.unitPrice)}
                        onChange={(e) =>
                          patchLine(l.productId, { unitPrice: Number(e.target.value) || 0 })
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
                        {formatMoney(l.unitPrice * l.quantity)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="surface-card space-y-2 p-5">
            <Label htmlFor="so-notes">Notes</Label>
            <Textarea
              id="so-notes"
              rows={3}
              placeholder="Delivery instructions, references…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Summary */}
        <div className="surface-card space-y-4 p-5 lg:sticky lg:top-6">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="so-tax">Apply tax</Label>
            <Switch id="so-tax" checked={isTaxed} onCheckedChange={setIsTaxed} />
          </div>
          {isTaxed && (
            <div className="space-y-2">
              <Label htmlFor="so-tax-rate">Tax rate %</Label>
              <Input
                id="so-tax-rate"
                type="number"
                min={0}
                step="0.01"
                className="numeric h-10"
                value={String(taxRateInput ?? settings?.default_tax_rate ?? 0)}
                onChange={(e) => setTaxRateInput(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Discount</Label>
            <RadioGroup
              className="flex gap-4"
              value={discountType}
              onValueChange={(v) => setDiscountType(v as "amount" | "percent")}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="amount" id="so-disc-amount" />
                <Label htmlFor="so-disc-amount" className="text-sm font-normal">
                  Flat
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="percent" id="so-disc-percent" />
                <Label htmlFor="so-disc-percent" className="text-sm font-normal">
                  Percent
                </Label>
              </div>
            </RadioGroup>
            <Input
              type="number"
              min={0}
              step="0.01"
              aria-label="Discount value"
              className="numeric h-10"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
            />
          </div>

          <dl className="space-y-2 border-t border-border pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="numeric font-medium">{formatMoney(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Discount</dt>
              <dd className="numeric font-medium">− {formatMoney(discountAmount)}</dd>
            </div>
            {isTaxed && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax ({taxRate}%)</dt>
                <dd className="numeric font-medium">{formatMoney(taxAmount)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-border pt-3">
              <dt className="font-medium">Order total</dt>
              <dd className="numeric text-2xl font-bold">{formatMoney(total)}</dd>
            </div>
          </dl>

          <Button className="w-full" disabled={saving} onClick={save}>
            <Plus />
            {saving ? "Saving…" : existing ? "Save changes" : "Create Sales Order"}
          </Button>
        </div>
      </div>

      <CustomerFormDialog
        open={customerDialog}
        onOpenChange={setCustomerDialog}
        onSaved={(c) => setCustomerId(c.id)}
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
