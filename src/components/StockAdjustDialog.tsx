import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const REASONS = ["Damaged", "Correction", "Received New Stock", "Lost/Theft", "Other"] as const;

export type AdjustTarget = {
  productId: string;
  warehouseId: string;
  productName: string;
  warehouseName: string;
  stockOnHand: number;
};

export function StockAdjustDialog({
  target,
  onOpenChange,
}: {
  target: AdjustTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"set" | "delta">("set");
  const [value, setValue] = useState("0");
  const [reason, setReason] = useState<string>("Correction");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setMode("set");
    setValue(String(target.stockOnHand));
    setReason("Correction");
    setNote("");
  }, [target]);

  if (!target) {
    return (
      <Dialog open={false} onOpenChange={onOpenChange}>
        <DialogContent />
      </Dialog>
    );
  }

  const parsedValue = Number(value);
  const newStock = mode === "set" ? parsedValue : target.stockOnHand + parsedValue;
  const change = newStock - target.stockOnHand;

  const save = async () => {
    if (!Number.isFinite(parsedValue)) {
      toast.error("Enter a valid number");
      return;
    }
    if (newStock < 0) {
      toast.error("Stock cannot go below zero");
      return;
    }
    if (change === 0) {
      toast.error("No change to save");
      return;
    }
    if (reason === "Other" && !note.trim()) {
      toast.error("Add a reason note");
      return;
    }

    setSaving(true);
    const { error: upsertError } = await supabase.from("product_stock").upsert(
      {
        product_id: target.productId,
        warehouse_id: target.warehouseId,
        stock_on_hand: newStock,
      },
      { onConflict: "product_id,warehouse_id" },
    );
    if (upsertError) {
      setSaving(false);
      toast.error(upsertError.message);
      return;
    }

    await supabase.from("stock_movements").insert({
      product_id: target.productId,
      warehouse_id: target.warehouseId,
      movement_type: "Manual Adjustment",
      quantity_change: change,
      reason: reason === "Other" ? note.trim() : note.trim() ? `${reason} — ${note.trim()}` : reason,
    });

    setSaving(false);
    queryClient.invalidateQueries();
    toast.success("Stock adjusted");
    onOpenChange(false);
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            {target.productName} · {target.warehouseName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-border p-4">
            <p className="text-xs text-muted-foreground">Current stock on hand</p>
            <p className="numeric text-2xl font-bold">{target.stockOnHand}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as "set" | "delta")}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="set">Set new stock</SelectItem>
                  <SelectItem value="delta">Add / remove (+/-)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adj-value">{mode === "set" ? "New stock" : "Change"}</Label>
              <Input
                id="adj-value"
                type="number"
                className="numeric h-11"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Resulting stock:{" "}
            <span className="numeric font-semibold text-foreground">
              {Number.isFinite(newStock) ? newStock : "—"}
            </span>{" "}
            ({change >= 0 ? "+" : ""}
            {Number.isFinite(change) ? change : 0})
          </p>

          <div className="space-y-2">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adj-note">{reason === "Other" ? "Reason note" : "Notes (optional)"}</Label>
            <Textarea
              id="adj-note"
              rows={2}
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" className="h-11" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-11" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
