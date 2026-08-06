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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProducts, useSettings, useWarehouses } from "@/lib/data";
import { useAccounts } from "@/lib/accounting";
import {
  PURCHASE_PAYMENT_METHODS,
  finalizePurchaseBill,
  usePurchaseOrder,
  useVendors,
  type PurchasePaymentMethod,
} from "@/lib/purchases";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/purchase-bills/new")({
  validateSearch: (search: Record<string, unknown>): { poId?: string; vendorId?: string } => ({
    ...(typeof search["poId"] === "string" ? { poId: search["poId"] } : {}),
    ...(typeof search["vendorId"] === "string" ? { vendorId: search["vendorId"] } : {}),
  }),
  head: () => ({
    meta: [
      { title: "New Purchase Bill — Fragrance Billing" },
      { name: "description", content: "Receive supplier stock and post it to your accounts." },
      { property: "og:title", content: "New Purchase Bill — Fragrance Billing" },
      {
        property: "og:description",
        content: "Receive supplier stock and post it to your accounts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PurchaseBillBuilder,
});

type Line = {
  productId: string;
  name: string;
  unitCost: number;
  quantity: number;
  updateCostPrice: boolean;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function PurchaseBillBuilder() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const poId = search.poId ?? "";
  const { data: po } = usePurchaseOrder(poId);

  const { data: vendors = [] } = useVendors();
  const { data: products = [] } = useProducts();
  const { data: warehouses = [] } = useWarehouses();
  const { data: settings } = useSettings();
  const { data: accounts = [] } = useAccounts(true);

  const payAccounts = useMemo(
    () => accounts.filter((a) => a.account_type === "Cash" || a.account_type === "Bank"),
    [accounts],
  );

  const [vendorId, setVendorId] = useState(search.vendorId ?? "");
  const [billDate, setBillDate] = useState(todayISO());
  const [warehouseId, setWarehouseId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [isTaxed, setIsTaxed] = useState(false);
  const [taxRateInput, setTaxRateInput] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [amountPaidInput, setAmountPaidInput] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState<PurchasePaymentMethod>("Cash");
  const [accountId, setAccountId] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDate, setChequeDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [vendorDialog, setVendorDialog] = useState(false);
  const [productDialog, setProductDialog] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!po || hydrated) return;
    setVendorId(po.vendor_id ?? "");
    setWarehouseId(po.warehouse_id ?? "");
    setIsTaxed(Number(po.tax_amount) > 0);
    setLines(
      po.purchase_order_items
        .map((i) => ({
          productId: i.product_id ?? "",
          name: i.product_name_snapshot,
          unitCost: Number(i.unit_cost),
          quantity: Number(i.quantity) - Number(i.quantity_received),
          updateCostPrice: true,
        }))
        .filter((l) => l.quantity > 0),
    );
    setHydrated(true);
  }, [po, hydrated]);

  useEffect(() => {
    if (!accountId && payAccounts.length > 0) setAccountId(payAccounts[0]!.id);
  }, [accountId, payAccounts]);

  const activeWarehouseId = warehouseId || warehouses[0]?.id || "";
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
  const amountPaid = Math.min(Math.max(Number(amountPaidInput) || 0, 0), total);
  const balanceDue = total - amountPaid;

  const addLine = (productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    setLines((prev) =>
      prev.some((l) => l.productId === productId)
        ? prev.map((l) => (l.productId === productId ? { ...l, quantity: l.quantity + 1 } : l))
        : [
            ...prev,
            {
              productId: p.id,
              name: p.name,
              unitCost: Number(p.cost_price ?? 0),
              quantity: 1,
              updateCostPrice: true,
            },
          ],
    );
    setProductSearch("");
  };

  const patchLine = (productId: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));

  const removeLine = (productId: string) =>
    setLines((prev) => prev.filter((l) => l.productId !== productId));

  const finalize = async () => {
    if (!vendorId) {
      toast.error("Select a vendor");
      return;
    }
    if (lines.length === 0) {
      toast.error("Add at least one product to the bill");
      return;
    }
    if (!activeWarehouseId) {
      toast.error("Select a warehouse");
      return;
    }
    if (amountPaid > 0 && !accountId) {
      toast.error("Select the account you are paying from");
      return;
    }
    if (amountPaid > 0 && paymentMethod === "Cheque" && !chequeNumber.trim()) {
      toast.error("Enter the cheque number");
      return;
    }

    setSaving(true);
    try {
      const bill = await finalizePurchaseBill({
        vendorId,
        vendorName: vendors.find((v) => v.id === vendorId)?.name ?? "Vendor",
        purchaseOrderId: poId || null,
        billDate,
        warehouseId: activeWarehouseId,
        taxRate,
        isTaxed,
        notes: notes || null,
        lines: lines.map((l) => ({
          productId: l.productId,
          name: l.name,
          quantity: l.quantity,
          unitCost: l.unitCost,
          updateCostPrice: l.updateCostPrice,
        })),
        amountPaid,
        paymentMethod,
        accountId: amountPaid > 0 ? accountId : null,
        chequeNumber: paymentMethod === "Cheque" ? chequeNumber.trim() : null,
        chequeDate: paymentMethod === "Cheque" ? chequeDate : null,
      });
      queryClient.invalidateQueries();
      toast.success(`Purchase bill ${bill.bill_number ?? ""} recorded`);
      navigate({
        to: "/purchase-bills/$purchaseBillId",
        params: { purchaseBillId: bill.id },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record the purchase bill");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-28 lg:pb-0">
      <PageHeader
        title="New Purchase Bill"
        description={
          po
            ? `Receiving against ${po.order_number}`
            : "Adds stock to the warehouse and posts to your accounts."
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="space-y-4">
          <div className="surface-card grid gap-4 p-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="pb-vendor">Vendor</Label>
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => setVendorDialog(true)}
                >
                  + New Vendor
                </button>
              </div>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger id="pb-vendor" className="h-11">
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
              <Label htmlFor="pb-date">Bill Date</Label>
              <Input
                id="pb-date"
                type="date"
                className="h-11"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pb-warehouse">Receive into warehouse</Label>
              <Select value={activeWarehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger id="pb-warehouse" className="h-11">
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
              <Label htmlFor="pb-product">Items received</Label>
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
                id="pb-product"
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
                <p className="text-sm text-muted-foreground">No items on this bill yet</p>
              </div>
            ) : (
              <div className="mt-2 divide-y divide-border/60">
                {lines.map((l) => {
                  const product = products.find((p) => p.id === l.productId);
                  const costChanged = Number(product?.cost_price ?? 0) !== l.unitCost;
                  return (
                    <div key={l.productId} className="space-y-2 py-3">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{l.name}</p>
                          <p className="numeric mt-0.5 text-xs text-muted-foreground">
                            Current cost {formatMoney(product?.cost_price ?? 0)}
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
                      {costChanged && (
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Checkbox
                            checked={l.updateCostPrice}
                            onCheckedChange={(v) =>
                              patchLine(l.productId, { updateCostPrice: v === true })
                            }
                          />
                          Update product&apos;s cost price to {formatMoney(l.unitCost)}
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="surface-card space-y-4 p-5">
            <h2 className="text-sm font-semibold">Payment</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pb-paid">Amount paid now</Label>
                <Input
                  id="pb-paid"
                  type="number"
                  min={0}
                  step="0.01"
                  className="numeric h-11"
                  value={amountPaidInput}
                  onChange={(e) => setAmountPaidInput(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pb-method">Method</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(v) => setPaymentMethod(v as PurchasePaymentMethod)}
                >
                  <SelectTrigger id="pb-method" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PURCHASE_PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="pb-account">Paid from account</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="pb-account" className="h-11">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {payAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} · {formatMoney(a.current_balance)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {paymentMethod === "Cheque" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="pb-cheque-no">Cheque number</Label>
                    <Input
                      id="pb-cheque-no"
                      className="h-11"
                      value={chequeNumber}
                      onChange={(e) => setChequeNumber(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pb-cheque-date">Cheque date</Label>
                    <Input
                      id="pb-cheque-date"
                      type="date"
                      className="h-11"
                      value={chequeDate}
                      onChange={(e) => setChequeDate(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="surface-card space-y-2 p-5">
            <Label htmlFor="pb-notes">Notes</Label>
            <Textarea
              id="pb-notes"
              rows={3}
              placeholder="Supplier invoice reference, delivery notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="surface-card space-y-4 p-5 lg:sticky lg:top-6">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="pb-tax">Apply tax</Label>
            <Switch id="pb-tax" checked={isTaxed} onCheckedChange={setIsTaxed} />
          </div>
          {isTaxed && (
            <div className="space-y-2">
              <Label htmlFor="pb-tax-rate">Tax rate %</Label>
              <Input
                id="pb-tax-rate"
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
              <dt className="font-semibold">Bill total</dt>
              <dd className="numeric text-2xl font-bold">{formatMoney(total)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Paid now</dt>
              <dd className="numeric font-medium">{formatMoney(amountPaid)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Balance due</dt>
              <dd className="numeric font-semibold">{formatMoney(balanceDue)}</dd>
            </div>
          </dl>

          <Button className="hidden h-12 w-full lg:flex" disabled={saving} onClick={finalize}>
            {saving ? "Recording…" : "Finalize Purchase Bill"}
          </Button>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-14 z-20 border-t border-border bg-card p-3 lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Bill total</p>
            <p className="numeric truncate text-lg font-bold">{formatMoney(total)}</p>
          </div>
          <Button className="h-11 shrink-0" disabled={saving} onClick={finalize}>
            {saving ? "Recording…" : "Finalize"}
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
