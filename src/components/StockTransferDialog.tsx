import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAllProducts, useProductStock, useWarehouses } from "@/lib/data";
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

export function StockTransferDialog({
  open,
  onOpenChange,
  defaultFromWarehouseId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultFromWarehouseId?: string;
}) {
  const queryClient = useQueryClient();
  const { data: products = [] } = useAllProducts();
  const { data: warehouses = [] } = useWarehouses();
  const { data: stockRows = [] } = useProductStock();

  const [productId, setProductId] = useState("");
  const [fromId, setFromId] = useState(defaultFromWarehouseId ?? "");
  const [toId, setToId] = useState("");
  const [qty, setQty] = useState("1");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProductId("");
    setFromId(defaultFromWarehouseId ?? "");
    setToId("");
    setQty("1");
    setNotes("");
  }, [open, defaultFromWarehouseId]);

  const available = useMemo(() => {
    const row = stockRows.find((r) => r.product_id === productId && r.warehouse_id === fromId);
    if (!row) return 0;
    return Number(row.stock_on_hand) - Number(row.committed_stock);
  }, [stockRows, productId, fromId]);

  const submit = async () => {
    const quantity = Number(qty);
    if (!productId || !fromId || !toId) {
      toast.error("Pick a product and both warehouses");
      return;
    }
    if (fromId === toId) {
      toast.error("Source and destination must differ");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error("Enter a quantity greater than zero");
      return;
    }
    if (quantity > available) {
      toast.error(`Only ${available} available at the source warehouse`);
      return;
    }

    setSaving(true);
    const { data: transfer, error } = await supabase
      .from("stock_transfers")
      .insert({
        product_id: productId,
        from_warehouse_id: fromId,
        to_warehouse_id: toId,
        quantity,
        notes: notes.trim() || null,
      })
      .select()
      .single();

    if (error || !transfer) {
      setSaving(false);
      toast.error(error?.message ?? "Could not create the transfer");
      return;
    }

    const source = stockRows.find((r) => r.product_id === productId && r.warehouse_id === fromId);
    const dest = stockRows.find((r) => r.product_id === productId && r.warehouse_id === toId);

    await supabase.from("product_stock").upsert(
      [
        {
          product_id: productId,
          warehouse_id: fromId,
          stock_on_hand: Number(source?.stock_on_hand ?? 0) - quantity,
        },
        {
          product_id: productId,
          warehouse_id: toId,
          stock_on_hand: Number(dest?.stock_on_hand ?? 0) + quantity,
        },
      ],
      { onConflict: "product_id,warehouse_id" },
    );

    await supabase.from("stock_movements").insert([
      {
        product_id: productId,
        warehouse_id: fromId,
        movement_type: "Transfer Out",
        quantity_change: -quantity,
        reason: notes.trim() || "Stock transfer",
      },
      {
        product_id: productId,
        warehouse_id: toId,
        movement_type: "Transfer In",
        quantity_change: quantity,
        reason: notes.trim() || "Stock transfer",
      },
    ]);

    setSaving(false);
    queryClient.invalidateQueries();
    toast.success("Stock transferred");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer stock</DialogTitle>
          <DialogDescription>Move stock between two warehouses.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Product</Label>
            <Select value={productId} onValueChange={setProductId}>
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
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>From</Label>
              <Select value={fromId} onValueChange={setFromId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Source" />
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
              <Label>To</Label>
              <Select value={toId} onValueChange={setToId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Destination" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses
                    .filter((w) => w.id !== fromId)
                    .map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tr-qty">Quantity</Label>
            <Input
              id="tr-qty"
              type="number"
              min={1}
              max={available || undefined}
              className="numeric h-11"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Available at source: <span className="numeric font-medium">{available}</span>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tr-notes">Notes</Label>
            <Textarea
              id="tr-notes"
              rows={2}
              maxLength={300}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" className="h-11" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-11" disabled={saving} onClick={submit}>
            {saving ? "Transferring…" : "Transfer stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
