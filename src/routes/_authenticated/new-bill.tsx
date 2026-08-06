import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Search, Warehouse as WarehouseIcon, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
import { ProductFormDialog } from "@/components/ProductFormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCustomers, useProducts, useProductStock, useSettings, useWarehouses } from "@/lib/data";
import { useAccounts } from "@/lib/accounting";
import {
  PAYMENT_METHODS,
  accountIdByName,
  derivePaymentStatus,
  useCustomerLastPrices,
  type PaymentMethod,
} from "@/lib/payments";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/new-bill")({
  validateSearch: (search: Record<string, unknown>) => ({
    customerId:
      typeof search["customerId"] === "string" ? (search["customerId"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "New Bill — Fragrance Billing" },
      { name: "description", content: "Create a sales bill and deduct stock automatically." },
      { property: "og:title", content: "New Bill — Fragrance Billing" },
      {
        property: "og:description",
        content: "Create a sales bill and deduct stock automatically.",
      },
    ],
  }),
  component: NewBillPage,
});

type Line = {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  warehouseId: string;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function NewBillPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const { data: products = [] } = useProducts();
  const { data: customers = [] } = useCustomers();
  const { data: warehouses = [] } = useWarehouses();
  const { data: stock = [] } = useProductStock();
  const { data: settings } = useSettings();

  const [customerId, setCustomerId] = useState<string>(search.customerId ?? "walk-in");
  const [billDate, setBillDate] = useState(todayISO());
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [lines, setLines] = useState<Line[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [isTaxed, setIsTaxed] = useState(false);
  const [taxRateInput, setTaxRateInput] = useState<string | null>(null);
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [discountValue, setDiscountValue] = useState("0");
  const [paymentStatus, setPaymentStatus] = useState("Paid");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [saving, setSaving] = useState(false);
  const [customerDialog, setCustomerDialog] = useState(false);
  const [productDialog, setProductDialog] = useState(false);
  const [warehousePickerFor, setWarehousePickerFor] = useState<string | null>(null);

  const activeWarehouseId = warehouseId || warehouses[0]?.id || "";
  const taxRate = Number(taxRateInput ?? settings?.default_tax_rate ?? 0);

  const stockFor = (productId: string, wId: string) => {
    const row = stock.find((s) => s.product_id === productId && s.warehouse_id === wId);
    const onHand = Number(row?.stock_on_hand ?? 0);
    const committed = Number(row?.committed_stock ?? 0);
    return { onHand, committed, available: Math.max(onHand - committed, 0) };
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

  const overselling = lines.filter(
    (l) => l.quantity > stockFor(l.productId, l.warehouseId).available,
  );

  const addLine = (productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === productId);
      if (existing) {
        const cap = stockFor(productId, existing.warehouseId).available;
        return prev.map((l) =>
          l.productId === productId
            ? { ...l, quantity: Math.min(l.quantity + 1, Math.max(cap, 1)) }
            : l,
        );
      }
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          unitPrice: Number(p.price),
          quantity: 1,
          warehouseId: activeWarehouseId,
        },
      ];
    });
    setProductSearch("");
  };

  const patchLine = (productId: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));

  const removeLine = (productId: string) =>
    setLines((prev) => prev.filter((l) => l.productId !== productId));

  const save = async (status: "Draft" | "Finalized") => {
    if (lines.length === 0) {
      toast.error("Add at least one product to the bill");
      return;
    }
    if (status === "Finalized" && overselling.length > 0) {
      toast.error(`Not enough stock for ${overselling[0]!.name}`);
      return;
    }

    setSaving(true);
    const { data: bill, error } = await supabase
      .from("bills")
      .insert({
        customer_id: customerId === "walk-in" ? null : customerId,
        bill_date: billDate,
        warehouse_id: activeWarehouseId || null,
        is_taxed: isTaxed,
        tax_rate: isTaxed ? taxRate : 0,
        subtotal,
        tax_amount: taxAmount,
        discount_amount: discountAmount,
        discount_type: discountType,
        discount_value: Number(discountValue) || 0,
        total_amount: total,
        payment_status: paymentStatus,
        payment_method: paymentStatus === "Unpaid" ? null : paymentMethod,
        status,
      })
      .select()
      .single();

    if (error || !bill) {
      setSaving(false);
      toast.error(error?.message ?? "Could not save the bill");
      return;
    }

    const { error: itemsError } = await supabase.from("bill_items").insert(
      lines.map((l) => ({
        bill_id: bill.id,
        product_id: l.productId,
        product_name_snapshot: l.name,
        quantity: l.quantity,
        unit_price: l.unitPrice,
        line_total: l.unitPrice * l.quantity,
        warehouse_id: l.warehouseId || null,
      })),
    );

    if (itemsError) {
      setSaving(false);
      toast.error(itemsError.message);
      return;
    }

    if (status === "Draft") {
      setSaving(false);
      queryClient.invalidateQueries();
      toast.success("Draft saved");
      navigate({ to: "/bills/$billId", params: { billId: bill.id } });
      return;
    }

    // Deduct stock per warehouse and log a stock movement for each line.
    for (const l of lines) {
      const row = stock.find(
        (s) => s.product_id === l.productId && s.warehouse_id === l.warehouseId,
      );
      if (row) {
        await supabase
          .from("product_stock")
          .update({ stock_on_hand: Number(row.stock_on_hand) - l.quantity })
          .eq("id", row.id);
      }
      if (l.warehouseId) {
        await supabase.from("stock_movements").insert({
          product_id: l.productId,
          warehouse_id: l.warehouseId,
          movement_type: "Sale",
          quantity_change: -l.quantity,
          related_bill_id: bill.id,
        });
      }
    }

    if (paymentStatus !== "Unpaid") {
      await supabase.from("payments").insert({
        bill_id: bill.id,
        customer_id: customerId === "walk-in" ? null : customerId,
        payment_date: billDate,
        amount: paymentStatus === "Paid" ? total : 0,
        payment_method: paymentMethod,
        status: paymentStatus === "Paid" ? "Completed" : "Partial",
      });
    }

    if (customerId !== "walk-in") {
      const c = customers.find((x) => x.id === customerId);
      if (c) {
        await supabase
          .from("customers")
          .update({
            total_spend: Number(c.total_spend) + total,
            last_purchase_at: new Date().toISOString(),
          })
          .eq("id", c.id);
      }
    }

    setSaving(false);
    queryClient.invalidateQueries();
    toast.success(`Bill ${bill.bill_number} finalized`);
    navigate({ to: "/bills/$billId", params: { billId: bill.id } });
  };

  const pickerLine = lines.find((l) => l.productId === warehousePickerFor) ?? null;

  return (
    <div className="space-y-6 pb-28 lg:pb-0">
      <PageHeader title="New Bill" description="Add products, confirm totals, finalize." />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="space-y-4">
          <div className="surface-card grid gap-4 p-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="customer">Customer</Label>
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => setCustomerDialog(true)}
                >
                  + New Customer
                </button>
              </div>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger id="customer" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="walk-in">Walk-in customer</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bill-date">Bill date</Label>
              <Input
                id="bill-date"
                type="date"
                className="h-11"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="warehouse">Warehouse</Label>
              <Select value={activeWarehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger id="warehouse" className="h-11">
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
              <Label htmlFor="product-search">Add products</Label>
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
                id="product-search"
                className="h-11 pl-9"
                placeholder="Search product name, SKU or brand"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
              {results.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
                  {results.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted"
                        onClick={() => addLine(p.id)}
                      >
                        <span className="min-w-0 truncate">
                          {p.name}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {stockFor(p.id, activeWarehouseId).available} available
                          </span>
                        </span>
                        <span className="numeric shrink-0 font-semibold">
                          {formatMoney(p.price)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4 divide-y divide-border/60">
              {lines.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No items yet. Search above to add products.
                </p>
              ) : (
                lines.map((l) => {
                  const { available } = stockFor(l.productId, l.warehouseId);
                  const wName =
                    warehouses.find((w) => w.id === l.warehouseId)?.name ?? "No warehouse";
                  const over = l.quantity > available;
                  return (
                    <div key={l.productId} className="space-y-2 py-3">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{l.name}</p>
                          <button
                            type="button"
                            className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                            onClick={() => setWarehousePickerFor(l.productId)}
                          >
                            <WarehouseIcon className="h-3.5 w-3.5" />
                            <span className="truncate">{wName}</span>
                            <span className="numeric">· {available} available</span>
                          </button>
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
                          max={Math.max(available, 1)}
                          aria-label={`Quantity for ${l.name}`}
                          className={cn("numeric h-10 text-center", over && "border-destructive")}
                          value={String(l.quantity)}
                          onChange={(e) =>
                            patchLine(l.productId, {
                              quantity: Math.max(
                                1,
                                Math.min(Number(e.target.value) || 1, Math.max(available, 1)),
                              ),
                            })
                          }
                        />
                        <p className="numeric w-24 text-right text-sm font-semibold">
                          {formatMoney(l.unitPrice * l.quantity)}
                        </p>
                      </div>
                      {over && (
                        <p className="flex items-center gap-1.5 text-xs text-destructive">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Only {available} available in {wName}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <div className="surface-card space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Apply tax</p>
                <p className="text-xs text-muted-foreground">
                  Default rate {Number(settings?.default_tax_rate ?? 0)}%
                </p>
              </div>
              <Switch checked={isTaxed} onCheckedChange={setIsTaxed} />
            </div>

            {isTaxed && (
              <div className="space-y-2">
                <Label htmlFor="tax-rate">Tax rate (%)</Label>
                <Input
                  id="tax-rate"
                  type="number"
                  min={0}
                  step="0.01"
                  className="numeric h-11"
                  value={taxRateInput ?? String(Number(settings?.default_tax_rate ?? 0))}
                  onChange={(e) => setTaxRateInput(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="discount">Discount</Label>
                <div className="flex overflow-hidden rounded-lg border border-border">
                  {(["amount", "percent"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={cn(
                        "px-2.5 py-1 text-xs font-medium transition-colors",
                        discountType === t
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted",
                      )}
                      onClick={() => setDiscountType(t)}
                    >
                      {t === "amount" ? "AED" : "%"}
                    </button>
                  ))}
                </div>
              </div>
              <Input
                id="discount"
                type="number"
                min={0}
                step="0.01"
                className="numeric h-11"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment-status">Payment status</Label>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger id="payment-status" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Paid">Paid</SelectItem>
                  <SelectItem value="Partial">Partial</SelectItem>
                  <SelectItem value="Unpaid">Unpaid</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentStatus !== "Unpaid" && (
              <div className="space-y-2">
                <Label htmlFor="payment-method">Payment method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger id="payment-method" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="UPI">UPI</SelectItem>
                    <SelectItem value="Card">Card</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="surface-card p-5">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="numeric font-medium">{formatMoney(subtotal)}</dd>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Discount</dt>
                  <dd className="numeric font-medium">−{formatMoney(discountAmount)}</dd>
                </div>
              )}
              {isTaxed && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Tax ({taxRate}%)</dt>
                  <dd className="numeric font-medium">{formatMoney(taxAmount)}</dd>
                </div>
              )}
            </dl>
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Grand total
              </p>
              <p className="numeric mt-1 text-3xl font-bold">{formatMoney(total)}</p>
            </div>
            <div className="mt-5 hidden space-y-2 lg:block">
              <Button className="h-11 w-full" disabled={saving} onClick={() => save("Finalized")}>
                {saving ? "Finalizing…" : "Finalize Bill"}
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full"
                disabled={saving}
                onClick={() => save("Draft")}
              >
                Save as Draft
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Finalizing deducts stock from the selected warehouse and records a stock movement for
              every line.
            </p>
          </div>
        </aside>
      </div>

      {/* Mobile sticky action bar */}
      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-border bg-background/95 p-3 backdrop-blur lg:hidden">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Grand total
          </span>
          <span className="numeric text-xl font-bold">{formatMoney(total)}</span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="h-12 flex-1"
            disabled={saving}
            onClick={() => save("Draft")}
          >
            Draft
          </Button>
          <Button className="h-12 flex-[2]" disabled={saving} onClick={() => save("Finalized")}>
            <Plus />
            {saving ? "Finalizing…" : "Review & Finalize"}
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
        defaultWarehouseId={activeWarehouseId}
        onSaved={(p) => addLine(p.id)}
      />

      <Dialog open={Boolean(pickerLine)} onOpenChange={(o) => !o && setWarehousePickerFor(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Select warehouse</DialogTitle>
            <DialogDescription>
              {pickerLine ? `Source warehouse for ${pickerLine.name}` : ""}
            </DialogDescription>
          </DialogHeader>
          {pickerLine && (
            <RadioGroup
              value={pickerLine.warehouseId}
              onValueChange={(v) => {
                const cap = stockFor(pickerLine.productId, v).available;
                patchLine(pickerLine.productId, {
                  warehouseId: v,
                  quantity: Math.max(1, Math.min(pickerLine.quantity, Math.max(cap, 1))),
                });
                setWarehousePickerFor(null);
              }}
              className="gap-0 overflow-x-auto"
            >
              <table className="w-full min-w-[420px]">
                <thead>
                  <tr className="border-b border-border text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 text-left">Warehouse</th>
                    <th className="py-2">On hand</th>
                    <th className="py-2">Committed</th>
                    <th className="py-2">Available</th>
                  </tr>
                </thead>
                <tbody>
                  {warehouses.map((w) => {
                    const s = stockFor(pickerLine.productId, w.id);
                    return (
                      <tr key={w.id} className="border-b border-border/60 last:border-0">
                        <td className="py-3">
                          <label className="flex items-center gap-3 text-sm">
                            <RadioGroupItem value={w.id} id={`wh-${w.id}`} />
                            <span className="min-w-0 truncate">{w.name}</span>
                          </label>
                        </td>
                        <td className="numeric py-3 text-right text-sm">{s.onHand}</td>
                        <td className="numeric py-3 text-right text-sm text-muted-foreground">
                          {s.committed}
                        </td>
                        <td className="numeric py-3 text-right text-sm font-semibold">
                          {s.available}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </RadioGroup>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
