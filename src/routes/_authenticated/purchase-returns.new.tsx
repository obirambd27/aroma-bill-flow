import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { defaultWarehouseId, useAllProducts, useWarehouses } from "@/lib/data";
import { useVendors } from "@/lib/purchases";
import { useAccounts } from "@/lib/accounting";
import {
  PURCHASE_RETURN_REASONS,
  createPurchaseReturn,
  usePurchaseBillReturnableItems,
  useReturnablePurchaseBills,
} from "@/lib/purchase-returns";
import { formatMoney } from "@/lib/format";
import { todayISO } from "@/lib/reports";

type Line = {
  key: string;
  productId: string | null;
  purchaseBillItemId: string | null;
  name: string;
  quantity: string;
  unitCost: string;
  max: number | null;
};

export const Route = createFileRoute("/_authenticated/purchase-returns/new")({
  validateSearch: (search: Record<string, unknown>) => ({
    purchaseBillId: typeof search["purchaseBillId"] === "string" ? search["purchaseBillId"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "New Purchase Return — Fragrance Billing" },
      { name: "description", content: "Return goods to a vendor and reverse stock and payables." },
      { property: "og:title", content: "New Purchase Return — Fragrance Billing" },
      {
        property: "og:description",
        content: "Return goods to a vendor and reverse stock and payables.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewPurchaseReturnPage,
});

function NewPurchaseReturnPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = useSearch({ from: "/_authenticated/purchase-returns/new" });

  const { data: bills = [] } = useReturnablePurchaseBills();
  const { data: vendors = [] } = useVendors();
  const { data: warehouses = [] } = useWarehouses();
  const { data: products = [] } = useAllProducts();
  const { data: accounts = [] } = useAccounts(true);

  const [billId, setBillId] = useState<string>(search.purchaseBillId ?? "");
  const [vendorId, setVendorId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [returnDate, setReturnDate] = useState(todayISO());
  const [reason, setReason] = useState<string>(PURCHASE_RETURN_REASONS[0]);
  const [notes, setNotes] = useState("");
  const [taxAmount, setTaxAmount] = useState("0");
  const [refund, setRefund] = useState(false);
  const [refundAccountId, setRefundAccountId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: returnable = [] } = usePurchaseBillReturnableItems(billId || null);
  const selectedBill = bills.find((b) => b.id === billId);

  const cashAccounts = useMemo(
    () => accounts.filter((a) => a.account_type === "Cash" || a.account_type === "Bank"),
    [accounts],
  );

  useEffect(() => {
    if (!selectedBill) return;
    setVendorId(selectedBill.vendor_id ?? "");
    setWarehouseId(selectedBill.warehouse_id ?? "");
  }, [selectedBill]);

  useEffect(() => {
    if (!billId) return;
    setLines(
      returnable
        .filter((r) => r.remaining > 0)
        .map((r) => ({
          key: r.item.id,
          productId: r.item.product_id,
          purchaseBillItemId: r.item.id,
          name: r.item.product_name_snapshot,
          quantity: "",
          unitCost: String(r.item.unit_cost),
          max: r.remaining,
        })),
    );
  }, [billId, returnable]);

  useEffect(() => {
    if (!warehouseId && warehouses.length > 0) setWarehouseId(defaultWarehouseId(warehouses));
  }, [warehouses, warehouseId]);

  const subtotal = lines.reduce(
    (s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0),
    0,
  );
  const total = subtotal + (Number(taxAmount) || 0);

  const addBlankLine = () =>
    setLines((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}`,
        productId: null,
        purchaseBillItemId: null,
        name: "",
        quantity: "",
        unitCost: "",
        max: null,
      },
    ]);

  const update = (key: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = async () => {
    const vendor = vendors.find((v) => v.id === vendorId);
    if (!vendor) {
      toast.error("Select a vendor");
      return;
    }
    if (!warehouseId) {
      toast.error("Select the warehouse the goods leave from");
      return;
    }
    const payload = lines
      .map((l) => ({
        productId: l.productId,
        purchaseBillItemId: l.purchaseBillItemId,
        name: l.name,
        quantity: Number(l.quantity) || 0,
        unitCost: Number(l.unitCost) || 0,
      }))
      .filter((l) => l.quantity > 0 && l.name.trim());
    if (payload.length === 0) {
      toast.error("Add at least one item with a quantity");
      return;
    }
    const overRemaining = lines.find(
      (l) => l.max !== null && (Number(l.quantity) || 0) > l.max + 0.001,
    );
    if (overRemaining) {
      toast.error(`${overRemaining.name}: only ${overRemaining.max} left to return on this bill`);
      return;
    }
    if (refund && !refundAccountId) {
      toast.error("Select the account the refund lands in");
      return;
    }

    setSaving(true);
    try {
      const ret = await createPurchaseReturn({
        purchaseBillId: billId || null,
        vendorId,
        vendorName: vendor.name,
        returnDate,
        warehouseId,
        reason,
        notes: notes.trim() || null,
        subtotal,
        taxAmount: Number(taxAmount) || 0,
        total,
        refundAccountId: refund ? refundAccountId : null,
        items: payload,
      });
      queryClient.invalidateQueries();
      toast.success(`Purchase return ${ret.return_number ?? ""} recorded`);
      void navigate({ to: "/purchase-returns/$returnId", params: { returnId: ret.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record the return");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-28 lg:pb-0">
      <PageHeader
        title="New Purchase Return"
        description="Start from a purchase bill, or build a standalone return."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <section className="surface-card space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pr-bill">Purchase Bill (optional)</Label>
                <Select value={billId || "none"} onValueChange={(v) => setBillId(v === "none" ? "" : v)}>
                  <SelectTrigger id="pr-bill" className="h-11">
                    <SelectValue placeholder="Standalone return" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Standalone return</SelectItem>
                    {bills.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.bill_number ?? "—"} · {b.vendors?.name ?? "—"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pr-vendor">Vendor</Label>
                <Select value={vendorId} onValueChange={setVendorId} disabled={Boolean(billId)}>
                  <SelectTrigger id="pr-vendor" className="h-11">
                    <SelectValue placeholder="Select vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pr-warehouse">Warehouse</Label>
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger id="pr-warehouse" className="h-11">
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
                <Label htmlFor="pr-date">Return Date</Label>
                <Input
                  id="pr-date"
                  type="date"
                  className="h-11"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pr-reason">Reason</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger id="pr-reason" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PURCHASE_RETURN_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pr-tax">Tax Reversed</Label>
                <Input
                  id="pr-tax"
                  type="number"
                  min="0"
                  step="0.01"
                  className="h-11"
                  value={taxAmount}
                  onChange={(e) => setTaxAmount(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pr-notes">Notes</Label>
              <Textarea
                id="pr-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </section>

          <section className="surface-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border p-4">
              <p className="text-sm font-medium">Items returned</p>
              <Button type="button" size="sm" variant="outline" onClick={addBlankLine}>
                <Plus />
                Add item
              </Button>
            </div>

            {lines.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Pick a purchase bill or add items manually.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {lines.map((l) => (
                  <li key={l.key} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {l.purchaseBillItemId ? (
                          <>
                            <p className="truncate text-sm font-medium">{l.name}</p>
                            {l.max !== null && (
                              <p className="text-xs text-muted-foreground">
                                {l.max} still returnable on this bill
                              </p>
                            )}
                          </>
                        ) : (
                          <Select
                            value={l.productId ?? ""}
                            onValueChange={(v) => {
                              const p = products.find((x) => x.id === v);
                              update(l.key, {
                                productId: v,
                                name: p?.name ?? "",
                                unitCost: p?.cost_price ? String(p.cost_price) : l.unitCost,
                              });
                            }}
                          >
                            <SelectTrigger className="h-11">
                              <SelectValue placeholder="Select product" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove item"
                        onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Quantity</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          className="h-11"
                          value={l.quantity}
                          onChange={(e) => update(l.key, { quantity: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Unit Cost</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          className="h-11"
                          value={l.unitCost}
                          onChange={(e) => update(l.key, { unitCost: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Line Total</Label>
                        <p className="numeric flex h-11 items-center text-sm font-semibold">
                          {formatMoney((Number(l.quantity) || 0) * (Number(l.unitCost) || 0))}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="surface-card space-y-3 p-5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="numeric font-medium">{formatMoney(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Tax</span>
              <span className="numeric font-medium">{formatMoney(Number(taxAmount) || 0)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-sm font-medium">Return Total</span>
              <span className="numeric text-2xl font-bold">{formatMoney(total)}</span>
            </div>

            <div className="space-y-3 border-t border-border pt-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={refund}
                  onCheckedChange={(v) => setRefund(v === true)}
                  aria-label="Vendor refunds this amount"
                />
                Vendor refunds this amount
              </label>
              {refund ? (
                <Select value={refundAccountId} onValueChange={setRefundAccountId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Refund into…" />
                  </SelectTrigger>
                  <SelectContent>
                    {cashAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Accounts Payable will be reduced instead.
                </p>
              )}
            </div>

            <Button className="hidden w-full lg:flex" onClick={submit} disabled={saving}>
              {saving ? "Saving…" : "Record Return"}
            </Button>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-card p-3 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Return total</p>
            <p className="numeric text-lg font-bold">{formatMoney(total)}</p>
          </div>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Record Return"}
          </Button>
        </div>
      </div>
    </div>
  );
}
