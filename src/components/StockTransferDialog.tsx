import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAllProducts, useProductStock, useWarehouses } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const {
    data: products = [],
    error: productError,
    refetch: refetchProducts,
  } = useAllProducts();
  const { data: warehouses = [] } = useWarehouses();
  const { data: stockRows = [] } = useProductStock();

  const [productId, setProductId] = useState("");
  const [productOpen, setProductOpen] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [fromId, setFromId] = useState(defaultFromWarehouseId ?? "");
  const [toId, setToId] = useState("");
  const [qty, setQty] = useState("1");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProductId("");
    setProductQuery("");
    setFromId(defaultFromWarehouseId ?? "");
    setToId("");
    setQty("1");
    setNotes("");
  }, [open, defaultFromWarehouseId]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [products, productId],
  );

  const productResults = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    const matches = q
      ? products.filter((p) =>
          [p.name, p.sku, p.brand].some((v) => (v ?? "").toLowerCase().includes(q)),
        )
      : products;
    return matches.slice(0, 30);
  }, [products, productQuery]);

  const stockBreakdown = useMemo(() => {
    if (!productId) return [];
    return warehouses.map((w) => {
      const row = stockRows.find((r) => r.product_id === productId && r.warehouse_id === w.id);
      return { id: w.id, name: w.name, qty: Number(row?.stock_on_hand ?? 0) };
    });
  }, [productId, warehouses, stockRows]);

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
            <Popover open={productOpen} onOpenChange={setProductOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full justify-between font-normal"
                >
                  <span className="truncate">{selectedProduct?.name ?? "Select product"}</span>
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
                <div className="border-b border-border p-2">
                  <Input
                    autoFocus
                    className="h-10"
                    placeholder="Search name, SKU or brand"
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                  />
                </div>
                <ul className="max-h-64 overflow-y-auto py-1">
                  {productError ? (
                    <li className="space-y-2 px-3 py-3 text-sm text-muted-foreground">
                      <p>Could not load products.</p>
                      <Button size="sm" variant="outline" onClick={() => refetchProducts()}>
                        Retry
                      </Button>
                    </li>
                  ) : productResults.length === 0 ? (
                    <li className="px-3 py-3 text-sm text-muted-foreground">No products found.</li>
                  ) : (
                    productResults.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2.5 text-left text-sm hover:bg-muted"
                          onClick={() => {
                            setProductId(p.id);
                            setProductOpen(false);
                          }}
                        >
                          {p.name}
                          {p.sku ? (
                            <span className="ml-2 text-xs text-muted-foreground">{p.sku}</span>
                          ) : null}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </PopoverContent>
            </Popover>
            {productId && (
              <div className="rounded-lg border border-border bg-muted/40 p-2 text-xs">
                <p className="mb-1 font-medium">Stock by warehouse</p>
                {stockBreakdown.length === 0 ? (
                  <p className="text-muted-foreground">No stock recorded yet.</p>
                ) : (
                  <ul className="space-y-0.5">
                    {stockBreakdown.map((row) => (
                      <li key={row.id} className="flex justify-between gap-3">
                        <span className="truncate text-muted-foreground">{row.name}</span>
                        <span className="numeric font-medium">{row.qty}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
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
