import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCustomers, useProducts, useWarehouses } from "@/lib/data";
import { useAccounts } from "@/lib/accounting";
import {
  RETURN_REASONS,
  createCreditNoteFromReturn,
  createSalesReturn,
  useBillReturnableItems,
  useReturnableBills,
} from "@/lib/returns";
import { formatDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/sales-returns/new")({
  head: () => ({
    meta: [
      { title: "New Sales Return — Fragrance Billing" },
      { name: "description", content: "Take returned stock back in against a bill or standalone." },
      { property: "og:title", content: "New Sales Return — Fragrance Billing" },
      {
        property: "og:description",
        content: "Take returned stock back in against a bill or standalone.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewSalesReturnPage,
});

const today = () => new Date().toISOString().slice(0, 10);

type Line = {
  key: string;
  productId: string | null;
  billItemId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  max: number | null;
};

function NewSalesReturnPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: bills = [] } = useReturnableBills();
  const { data: customers = [] } = useCustomers();
  const { data: products = [] } = useProducts();
  const { data: warehouses = [] } = useWarehouses();
  const { data: accounts = [] } = useAccounts(true);

  const [mode, setMode] = useState<"bill" | "standalone">("bill");
  const [billId, setBillId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string>("");
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [returnDate, setReturnDate] = useState(today());
  const [reason, setReason] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [isTaxed, setIsTaxed] = useState(false);
  const [taxRate, setTaxRate] = useState(5);
  const [refundMode, setRefundMode] = useState<"receivable" | "account">("receivable");
  const [refundAccountId, setRefundAccountId] = useState<string>("");
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [creditPrompt, setCreditPrompt] = useState<null | { returnId: string }>(null);

  const { data: billLines } = useBillReturnableItems(mode === "bill" ? billId : null);
  const selectedBill = bills.find((b) => b.id === billId) ?? null;

  useEffect(() => {
    if (!warehouseId && warehouses.length > 0) setWarehouseId(warehouses[0]!.id);
  }, [warehouses, warehouseId]);

  useEffect(() => {
    if (mode !== "bill" || !billLines) return;
    setLines(
      billLines
        .filter((b) => b.remaining > 0)
        .map((b) => ({
          key: b.item.id,
          productId: b.item.product_id,
          billItemId: b.item.id,
          name: b.item.product_name_snapshot,
          quantity: 0,
          unitPrice: Number(b.item.unit_price),
          max: b.remaining,
        })),
    );
  }, [billLines, mode]);

  useEffect(() => {
    if (mode === "bill" && selectedBill) {
      setCustomerId(selectedBill.customer_id ?? "");
      if (selectedBill.warehouse_id) setWarehouseId(selectedBill.warehouse_id);
    }
  }, [selectedBill, mode]);

  const activeLines = lines.filter((l) => l.quantity > 0);
  const subtotal = useMemo(
    () => activeLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
    [activeLines],
  );
  const taxAmount = isTaxed ? (subtotal * taxRate) / 100 : 0;
  const total = subtotal + taxAmount;

  const setLine = (key: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const addStandaloneLine = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setLines((prev) => [
      ...prev,
      {
        key: `${productId}-${Date.now()}`,
        productId: product.id,
        billItemId: null,
        name: product.name,
        quantity: 1,
        unitPrice: Number(product.price),
        max: null,
      },
    ]);
  };

  const save = async () => {
    if (activeLines.length === 0) {
      toast.error("Add at least one returned item");
      return;
    }
    if (!warehouseId) {
      toast.error("Choose the warehouse the stock goes back into");
      return;
    }
    setSaving(true);
    try {
      const ret = await createSalesReturn({
        billId: mode === "bill" ? billId : null,
        customerId: customerId || null,
        returnDate,
        warehouseId,
        reason: reason || null,
        notes: notes.trim() || null,
        subtotal,
        taxAmount,
        total,
        refundAccountId: refundMode === "account" ? refundAccountId || null : null,
        items: activeLines.map((l) => ({
          productId: l.productId,
          billItemId: l.billItemId,
          name: l.name,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      });
      queryClient.invalidateQueries();
      toast.success(`Return ${ret.return_number ?? ""} recorded and stock restocked`);
      if (customerId) {
        setCreditPrompt({ returnId: ret.id });
      } else {
        void navigate({ to: "/sales-returns/$returnId", params: { returnId: ret.id } });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the return");
    } finally {
      setSaving(false);
    }
  };

  const generateCredit = async () => {
    if (!creditPrompt) return;
    setSaving(true);
    try {
      const note = await createCreditNoteFromReturn({
        id: creditPrompt.returnId,
        customer_id: customerId,
        return_number: null,
        return_date: returnDate,
        reason: reason || null,
        subtotal,
        tax_amount: taxAmount,
        total_amount: total,
        sales_return_items: activeLines.map((l) => ({
          product_id: l.productId,
          product_name_snapshot: l.name,
          quantity: l.quantity,
          unit_price: l.unitPrice,
        })),
      });
      queryClient.invalidateQueries();
      toast.success(`Credit note ${note.credit_note_number ?? ""} created`);
      void navigate({ to: "/credit-notes/$creditNoteId", params: { creditNoteId: note.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the credit note");
    } finally {
      setSaving(false);
      setCreditPrompt(null);
    }
  };

  return (
    <div className="space-y-6 pb-28 md:pb-0">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/sales-returns">
          <ArrowLeft />
          Sales Returns
        </Link>
      </Button>

      <PageHeader
        title="New Sales Return"
        description="Restock returned goods and settle the customer's balance."
      />

      <div className="surface-card space-y-4 p-5">
        <div className="flex flex-wrap gap-2">
          {(["bill", "standalone"] as const).map((m) => (
            <Button
              key={m}
              type="button"
              variant={mode === m ? "default" : "outline"}
              className="h-10"
              onClick={() => {
                setMode(m);
                setLines([]);
                setBillId(null);
              }}
            >
              {m === "bill" ? "Against a bill" : "Standalone"}
            </Button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {mode === "bill" ? (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Original bill</Label>
              <Select value={billId ?? ""} onValueChange={setBillId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select a finalized bill" />
                </SelectTrigger>
                <SelectContent>
                  {bills.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.bill_number} · {b.customers?.name ?? "Walk-in"} ·{" "}
                      {formatDate(b.bill_date)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Walk-in customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="return-date">Return date</Label>
            <Input
              id="return-date"
              type="date"
              className="h-11"
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Restock to warehouse</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger className="h-11">
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

          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {RETURN_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="return-notes">Notes</Label>
            <Textarea
              id="return-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything worth recording about this return"
            />
          </div>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <h2 className="text-sm font-semibold">Returned items</h2>
          {mode === "standalone" && (
            <div className="w-full sm:w-64">
              <Select value="" onValueChange={addStandaloneLine}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Add a product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {lines.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {mode === "bill"
              ? "Select a bill to load its returnable line items."
              : "Add the products the customer brought back."}
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {lines.map((l) => (
              <div key={l.key} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{l.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.max !== null ? `Up to ${l.max} returnable` : "Standalone line"}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Qty</Label>
                  <Input
                    type="number"
                    min={0}
                    {...(l.max !== null ? { max: l.max } : {})}
                    className="h-10 w-24"
                    value={l.quantity}
                    onChange={(e) => {
                      const raw = Number(e.target.value) || 0;
                      setLine(l.key, {
                        quantity: l.max !== null ? Math.min(Math.max(raw, 0), l.max) : Math.max(raw, 0),
                      });
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Rate</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    className="h-10 w-28"
                    value={l.unitPrice}
                    onChange={(e) => setLine(l.key, { unitPrice: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="flex items-end justify-between gap-2 sm:justify-end">
                  <p className="numeric text-sm font-semibold">
                    {formatMoney(l.quantity * l.unitPrice)}
                  </p>
                  {mode === "standalone" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove line"
                      onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface-card space-y-4 p-5">
          <h2 className="text-sm font-semibold">Refund handling</h2>
          <Select
            value={refundMode}
            onValueChange={(v) => setRefundMode(v as "receivable" | "account")}
          >
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="receivable">Reduce Accounts Receivable</SelectItem>
              <SelectItem value="account">Refund from a cash / bank account</SelectItem>
            </SelectContent>
          </Select>
          {refundMode === "account" && (
            <Select value={refundAccountId} onValueChange={setRefundAccountId}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts
                  .filter((a) => a.account_type === "Cash" || a.account_type === "Bank")
                  .map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Apply tax</p>
              <p className="text-xs text-muted-foreground">Mirror the tax charged on the sale</p>
            </div>
            <div className="flex items-center gap-2">
              {isTaxed && (
                <Input
                  type="number"
                  min={0}
                  className="h-9 w-20"
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
                />
              )}
              <Switch checked={isTaxed} onCheckedChange={setIsTaxed} />
            </div>
          </div>
        </div>

        <div className="surface-card space-y-3 p-5">
          <h2 className="text-sm font-semibold">Summary</h2>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="numeric font-medium">{formatMoney(subtotal)}</span>
          </div>
          {isTaxed && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax ({taxRate}%)</span>
              <span className="numeric font-medium">{formatMoney(taxAmount)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between border-t border-border pt-3">
            <span className="text-sm font-semibold">Return total</span>
            <span className="numeric text-2xl font-bold">{formatMoney(total)}</span>
          </div>
          <Button className="h-11 w-full" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save Return"}
          </Button>
        </div>
      </div>

      <AlertDialog
        open={Boolean(creditPrompt)}
        onOpenChange={(open) => {
          if (!open && creditPrompt) {
            const id = creditPrompt.returnId;
            setCreditPrompt(null);
            void navigate({ to: "/sales-returns/$returnId", params: { returnId: id } });
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate a credit note for this return?</AlertDialogTitle>
            <AlertDialogDescription>
              A credit note of {formatMoney(total)} will be created for this customer and can be
              applied against their open bills later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={generateCredit}>
              Generate credit note
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
