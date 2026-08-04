import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCustomers, useProducts, useSettings } from "@/lib/data";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/new-bill")({
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

type Line = { productId: string; name: string; unitPrice: number; quantity: number };

function NewBillPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: products = [] } = useProducts();
  const { data: customers = [] } = useCustomers();
  const { data: settings } = useSettings();

  const [customerId, setCustomerId] = useState<string>("walk-in");
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [isTaxed, setIsTaxed] = useState(false);
  const [discount, setDiscount] = useState("0");
  const [paymentStatus, setPaymentStatus] = useState("Paid");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [saving, setSaving] = useState(false);

  const taxRate = Number(settings?.default_tax_rate ?? 0);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q))
      .slice(0, 6);
  }, [products, search]);

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const discountAmount = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const taxable = subtotal - discountAmount;
  const taxAmount = isTaxed ? (taxable * taxRate) / 100 : 0;
  const total = taxable + taxAmount;

  const addLine = (productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === productId);
      if (existing) {
        return prev.map((l) =>
          l.productId === productId ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...prev,
        { productId: p.id, name: p.name, unitPrice: Number(p.price), quantity: 1 },
      ];
    });
    setSearch("");
  };

  const updateQty = (productId: string, qty: number) =>
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, quantity: Math.max(qty, 1) } : l)),
    );

  const removeLine = (productId: string) =>
    setLines((prev) => prev.filter((l) => l.productId !== productId));

  const save = async (status: "Draft" | "Finalized") => {
    if (lines.length === 0) {
      toast.error("Add at least one product to the bill");
      return;
    }

    if (status === "Finalized") {
      const short = lines.find((l) => {
        const p = products.find((x) => x.id === l.productId);
        return p && Number(p.stock_on_hand) < l.quantity;
      });
      if (short) {
        toast.error(`Not enough stock for ${short.name}`);
        return;
      }
    }

    setSaving(true);
    const { data: bill, error } = await supabase
      .from("bills")
      .insert({
        customer_id: customerId === "walk-in" ? null : customerId,
        is_taxed: isTaxed,
        tax_rate: isTaxed ? taxRate : 0,
        subtotal,
        tax_amount: taxAmount,
        discount_amount: discountAmount,
        total_amount: total,
        payment_status: paymentStatus,
        payment_method: paymentMethod,
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
      })),
    );

    if (itemsError) {
      setSaving(false);
      toast.error(itemsError.message);
      return;
    }

    if (status === "Finalized") {
      // Deduct stock locally. A Zoho stock adjustment will be pushed from here
      // once the Zoho Books credentials are wired up.
      for (const l of lines) {
        const p = products.find((x) => x.id === l.productId);
        if (!p) continue;
        await supabase
          .from("products")
          .update({ stock_on_hand: Number(p.stock_on_hand) - l.quantity })
          .eq("id", l.productId);
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
    }

    setSaving(false);
    queryClient.invalidateQueries();
    toast.success(
      status === "Finalized" ? `Bill ${bill.bill_number} finalized` : "Draft saved",
    );
    navigate({ to: "/bills" });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="New Bill" description="Add products, confirm totals, finalize." />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <div className="surface-card p-5">
            <Label htmlFor="customer">Customer</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger id="customer" className="mt-2 h-11">
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

          <div className="surface-card p-5">
            <Label htmlFor="product-search">Add products</Label>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="product-search"
                className="h-11 pl-9"
                placeholder="Search product name or SKU"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
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
                        <span className="min-w-0 truncate">{p.name}</span>
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
                lines.map((l) => (
                  <div key={l.productId} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.name}</p>
                      <p className="numeric text-xs text-muted-foreground">
                        {formatMoney(l.unitPrice)} each
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      className="numeric h-10 w-20 text-center"
                      value={String(l.quantity)}
                      onChange={(e) => updateQty(l.productId, Number(e.target.value))}
                    />
                    <p className="numeric w-24 text-right text-sm font-semibold">
                      {formatMoney(l.unitPrice * l.quantity)}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${l.name}`}
                      onClick={() => removeLine(l.productId)}
                    >
                      <Trash2 className="text-muted-foreground" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="surface-card space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Apply tax</p>
                <p className="text-xs text-muted-foreground">Default rate {taxRate}%</p>
              </div>
              <Switch checked={isTaxed} onCheckedChange={setIsTaxed} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="discount">Discount</Label>
              <Input
                id="discount"
                type="number"
                min={0}
                step="0.01"
                className="numeric h-11"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
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
          </div>

          <div className="surface-card p-5">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="numeric font-medium">{formatMoney(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Discount</dt>
                <dd className="numeric font-medium">−{formatMoney(discountAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax</dt>
                <dd className="numeric font-medium">{formatMoney(taxAmount)}</dd>
              </div>
            </dl>
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Total
              </p>
              <p className="numeric mt-1 text-3xl font-bold">{formatMoney(total)}</p>
            </div>
            <div className="mt-5 space-y-2">
              <Button className="h-11 w-full" disabled={saving} onClick={() => save("Finalized")}>
                <Plus />
                Finalize Bill
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full"
                disabled={saving}
                onClick={() => save("Draft")}
              >
                Save as Draft
              </Button>
              <Button
                variant="ghost"
                className="h-11 w-full"
                onClick={() => navigate({ to: "/dashboard" })}
              >
                Cancel
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Finalizing deducts stock locally. Zoho stock adjustments are pushed once your Zoho
              Books keys are added.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
