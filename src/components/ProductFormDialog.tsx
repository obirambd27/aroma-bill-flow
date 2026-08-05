import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { createZohoItem } from "@/lib/zoho.functions";
import type { Product, Warehouse } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160, "Name is too long"),
  sku: z.string().trim().max(60, "SKU is too long"),
  brand: z.string().trim().max(80, "Brand is too long"),
  price: z.number().min(0, "Price cannot be negative").max(1_000_000),
  stock: z.number().min(0, "Stock cannot be negative").max(1_000_000),
  warehouseId: z.string().uuid("Pick a warehouse"),
});

export function ProductFormDialog({
  open,
  onOpenChange,
  warehouses,
  defaultWarehouseId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouses: Warehouse[];
  defaultWarehouseId?: string;
  onSaved?: (product: Product) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    sku: "",
    brand: "",
    price: "0",
    stock: "0",
    warehouseId: defaultWarehouseId ?? "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: "",
      sku: "",
      brand: "",
      price: "0",
      stock: "0",
      warehouseId: defaultWarehouseId ?? warehouses[0]?.id ?? "",
    });
  }, [open, defaultWarehouseId, warehouses]);

  const save = async () => {
    const parsed = schema.safeParse({
      name: form.name,
      sku: form.sku,
      brand: form.brand,
      price: Number(form.price),
      stock: Number(form.stock),
      warehouseId: form.warehouseId,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the form");
      return;
    }

    setSaving(true);
    const { data, error } = await supabase
      .from("products")
      .insert({
        name: parsed.data.name,
        sku: parsed.data.sku || null,
        brand: parsed.data.brand || null,
        price: parsed.data.price,
        stock_on_hand: parsed.data.stock,
      })
      .select()
      .single();

    if (error || !data) {
      setSaving(false);
      toast.error(error?.message ?? "Could not create the product");
      return;
    }

    await supabase.from("product_stock").insert({
      product_id: data.id,
      warehouse_id: parsed.data.warehouseId,
      stock_on_hand: parsed.data.stock,
      committed_stock: 0,
    });

    // Placeholder for the Zoho Books item creation (create-zoho-item).
    try {
      const result = await createZohoItem({ data: { productId: data.id } });
      if (result.ok && result.zoho_item_id) {
        await supabase
          .from("products")
          .update({ zoho_item_id: result.zoho_item_id })
          .eq("id", data.id);
      }
    } catch {
      // Never block local product creation on Zoho.
    }

    setSaving(false);
    queryClient.invalidateQueries();
    toast.success(`${data.name} added`);
    onOpenChange(false);
    onSaved?.(data as Product);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New product</DialogTitle>
          <DialogDescription>
            Saved here and pushed to Zoho Books items once your API keys are added.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="prod-name">Name</Label>
            <Input
              id="prod-name"
              className="h-11"
              maxLength={160}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="prod-sku">SKU</Label>
              <Input
                id="prod-sku"
                className="h-11"
                maxLength={60}
                value={form.sku}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prod-brand">Brand</Label>
              <Input
                id="prod-brand"
                className="h-11"
                maxLength={80}
                value={form.brand}
                onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="prod-price">Price</Label>
              <Input
                id="prod-price"
                type="number"
                min={0}
                step="0.01"
                className="numeric h-11"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prod-stock">Initial stock</Label>
              <Input
                id="prod-stock"
                type="number"
                min={0}
                className="numeric h-11"
                value={form.stock}
                onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="prod-warehouse">Warehouse</Label>
            <Select
              value={form.warehouseId}
              onValueChange={(v) => setForm((f) => ({ ...f, warehouseId: v }))}
            >
              <SelectTrigger id="prod-warehouse" className="h-11">
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

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" className="h-11" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-11" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Create product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
