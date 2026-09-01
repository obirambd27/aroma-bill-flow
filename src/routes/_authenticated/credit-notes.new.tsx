import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Trash2 } from "lucide-react";
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
import { useCustomers, useProducts } from "@/lib/data";
import { CustomerPicker } from "@/components/CustomerPicker";
import { createCreditNote, updateCreditNote, useCreditNote } from "@/lib/returns";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/credit-notes/new")({
  validateSearch: (search: Record<string, unknown>): { edit?: string } => ({
    ...(typeof search["edit"] === "string" ? { edit: search["edit"] as string } : {}),
  }),
  head: () => ({
    meta: [
      { title: "New Credit Note — Fragrance Billing" },
      { name: "description", content: "Issue a standalone customer credit or billing correction." },
      { property: "og:title", content: "New Credit Note — Fragrance Billing" },
      {
        property: "og:description",
        content: "Issue a standalone customer credit or billing correction.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewCreditNotePage,
});

type Line = {
  key: string;
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
};

const newLine = (): Line => ({
  key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  productId: null,
  description: "",
  quantity: 1,
  unitPrice: 0,
});

function NewCreditNotePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: products = [] } = useProducts();
  const search = Route.useSearch();
  const editId = search.edit ?? "";
  const { data: editing } = useCreditNote(editId);
  const [hydrated, setHydrated] = useState(false);

  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing || hydrated) return;
    setCustomerId(editing.customers?.id ?? "");
    setDate(editing.credit_note_date);
    setReason(editing.reason ?? "");
    setLines(
      editing.credit_note_items.map((i) => ({
        key: i.id,
        productId: i.product_id,
        description: i.description,
        quantity: Number(i.quantity ?? 1),
        unitPrice: Number(i.unit_price),
      })),
    );
    setHydrated(true);
  }, [editing, hydrated]);

  const setLine = (key: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const total = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

  const save = async () => {
    if (!customerId) {
      toast.error("Select the customer this credit belongs to");
      return;
    }
    const valid = lines.filter((l) => l.description.trim() && l.quantity * l.unitPrice > 0);
    if (valid.length === 0) {
      toast.error("Add at least one credit line with a description and amount");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        customerId,
        salesReturnId: null,
        creditNoteDate: date,
        reason: reason.trim() || null,
        subtotal: total,
        taxAmount: 0,
        total,
        items: valid.map((l) => ({
          productId: l.productId,
          description: l.description.trim(),
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      };
      const noteId = editId
        ? (await updateCreditNote({ creditNoteId: editId, ...payload })).id
        : (await createCreditNote(payload)).id;
      queryClient.invalidateQueries();
      toast.success(editId ? "Credit note updated" : "Credit note created");
      void navigate({ to: "/credit-notes/$creditNoteId", params: { creditNoteId: noteId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the credit note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-28 md:pb-0">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/credit-notes">
          <ArrowLeft />
          Credit Notes
        </Link>
      </Button>

      <PageHeader
        title={editId ? `Edit ${editing?.credit_note_number ?? "Credit Note"}` : "New Credit Note"}
        description="Issue credit for a goodwill adjustment or billing correction."
      />

      <div className="surface-card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Customer</Label>
          <CustomerPicker allowWalkIn={false} value={customerId} onChange={setCustomerId} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cn-date">Credit note date</Label>
          <Input
            id="cn-date"
            type="date"
            className="h-11"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
          <Label htmlFor="cn-reason">Reason</Label>
          <Textarea
            id="cn-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Goodwill discount on delayed order"
          />
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <h2 className="text-sm font-semibold">Credit lines</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLines((prev) => [...prev, newLine()])}
          >
            Add line
          </Button>
        </div>
        <div className="divide-y divide-border/60">
          {lines.map((l) => (
            <div key={l.key} className="grid gap-3 p-4 lg:grid-cols-[1.6fr_1fr_auto_auto_auto]">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Description</Label>
                <Input
                  className="h-10"
                  placeholder="Goodwill discount"
                  value={l.description}
                  onChange={(e) => setLine(l.key, { description: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Link a product</Label>
                <Select
                  value={l.productId ?? ""}
                  onValueChange={(v) => {
                    const p = products.find((x) => x.id === v);
                    setLine(l.key, {
                      productId: v,
                      description: l.description || (p?.name ?? ""),
                      unitPrice: l.unitPrice || Number(p?.price ?? 0),
                    });
                  }}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Optional" />
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
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Qty</Label>
                <Input
                  type="number"
                  min={0}
                  className="h-10 w-24"
                  value={l.quantity}
                  onChange={(e) => setLine(l.key, { quantity: Number(e.target.value) || 0 })}
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
              <div className="flex items-end justify-between gap-2 lg:justify-end">
                <p className="numeric text-sm font-semibold">
                  {formatMoney(l.quantity * l.unitPrice)}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove line"
                  onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="surface-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Credit total
          </p>
          <p className="numeric text-2xl font-bold">{formatMoney(total)}</p>
        </div>
        <Button className="h-11" disabled={saving} onClick={save}>
          {saving ? "Saving…" : editId ? "Save Changes" : "Create Credit Note"}
        </Button>
      </div>
    </div>
  );
}
