import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, PackageOpen, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";

type Item = {
  id: string;
  product_name_snapshot: string;
  quantity: number | string;
  pending_quantity?: number | string | null;
  item_note?: string | null;
  pending_resolved_at?: string | null;
};

/**
 * Lightweight, screen-only editor for bill notes and per-item partial pickup
 * tracking. Never printed with the invoice.
 */
export function BillNotesSection({
  billId,
  notes,
  items,
}: {
  billId: string;
  notes: string | null | undefined;
  items: Item[];
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { qty: string; note: string }>>({});

  useEffect(() => {
    setDraft(notes ?? "");
  }, [notes]);

  const saveNotes = async () => {
    setSavingNotes(true);
    const { error } = await supabase
      .from("bills")
      .update({ notes: draft.trim() || null })
      .eq("id", billId);
    setSavingNotes(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Notes saved");
    void queryClient.invalidateQueries();
  };

  const saveItem = async (item: Item) => {
    const edit = edits[item.id];
    if (!edit) return;
    const qty = Number(edit.qty || 0);
    if (Number.isNaN(qty) || qty < 0 || qty > Number(item.quantity)) {
      toast.error(`Pending quantity must be between 0 and ${Number(item.quantity)}`);
      return;
    }
    setBusyItem(item.id);
    const { error } = await supabase
      .from("bill_items")
      .update({
        pending_quantity: qty,
        item_note: edit.note.trim() || null,
        pending_resolved_at: qty === 0 ? new Date().toISOString() : null,
      })
      .eq("id", item.id);
    setBusyItem(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEdits((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    toast.success(qty === 0 ? "Marked as fully picked up" : "Pending pickup updated");
    void queryClient.invalidateQueries();
  };

  const resolve = async (item: Item) => {
    setBusyItem(item.id);
    const { error } = await supabase
      .from("bill_items")
      .update({ pending_quantity: 0, pending_resolved_at: new Date().toISOString() })
      .eq("id", item.id);
    setBusyItem(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Pending pickup resolved");
    void queryClient.invalidateQueries();
  };

  return (
    <section className="no-print surface-card space-y-5 p-5">
      <div className="space-y-2">
        <Label className="flex items-center gap-2 text-sm font-semibold">
          <StickyNote className="h-4 w-4" />
          Internal notes
        </Label>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="Anything worth remembering about this bill…"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={saveNotes} disabled={savingNotes || draft === (notes ?? "")}>
            {savingNotes ? "Saving…" : "Save notes"}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <PackageOpen className="h-4 w-4" />
          Pickup tracking
        </p>
        <ul className="divide-y divide-border/60">
          {items.map((item) => {
            const pending = Number(item.pending_quantity ?? 0);
            const edit = edits[item.id] ?? {
              qty: String(pending || ""),
              note: item.item_note ?? "",
            };
            const dirty = Boolean(edits[item.id]);
            return (
              <li key={item.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{item.product_name_snapshot}</span>
                  <span className="numeric text-xs text-muted-foreground">
                    Qty {Number(item.quantity)}
                  </span>
                  {pending > 0 && (
                    <StatusBadge tone="warning">{pending} pending pickup</StatusBadge>
                  )}
                  {pending === 0 && item.pending_resolved_at && (
                    <StatusBadge tone="success">Picked up</StatusBadge>
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-28 space-y-1">
                    <Label className="text-xs text-muted-foreground">Pending qty</Label>
                    <Input
                      inputMode="decimal"
                      value={edit.qty}
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [item.id]: { ...edit, qty: e.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="min-w-[200px] flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">Item note</Label>
                    <Input
                      value={edit.note}
                      placeholder="e.g. customer collecting Friday"
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [item.id]: { ...edit, note: e.target.value },
                        }))
                      }
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!dirty || busyItem === item.id}
                    onClick={() => void saveItem(item)}
                  >
                    Save
                  </Button>
                  {pending > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyItem === item.id}
                      onClick={() => void resolve(item)}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Resolve
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
