import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { X, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAllProducts, type Product, type Warehouse } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  sku: z.string().trim().min(1, "SKU is required").max(60, "SKU is too long"),
  price: z.number().min(0, "Selling price cannot be negative").max(1_000_000),
});

export function ProductFormDialog({
  open,
  onOpenChange,
  warehouses,
  defaultWarehouseId,
  product,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouses: Warehouse[];
  defaultWarehouseId?: string;
  product?: Product | null;
  onSaved?: (product: Product) => void;
}) {
  const queryClient = useQueryClient();
  const { data: allProducts = [] } = useAllProducts();
  const isEdit = Boolean(product);

  const [form, setForm] = useState({
    name: "",
    sku: "",
    brand: "",
    category: "",
    unit: "pcs",
    description: "",
    costPrice: "",
    price: "0",
    imageUrl: "",
    lowStock: "",
    isActive: true,
  });
  const [gallery, setGallery] = useState<string[]>([]);
  const [galleryInput, setGalleryInput] = useState("");
  const [initialStock, setInitialStock] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const brands = useMemo(
    () => [...new Set(allProducts.map((p) => p.brand).filter(Boolean) as string[])].sort(),
    [allProducts],
  );
  const categories = useMemo(
    () => [...new Set(allProducts.map((p) => p.category).filter(Boolean) as string[])].sort(),
    [allProducts],
  );

  useEffect(() => {
    if (!open) return;
    setForm({
      name: product?.name ?? "",
      sku: product?.sku ?? "",
      brand: product?.brand ?? "",
      category: product?.category ?? "",
      unit: product?.unit ?? "pcs",
      description: product?.description ?? "",
      costPrice: product?.cost_price != null ? String(product.cost_price) : "",
      price: product ? String(product.price) : "0",
      imageUrl: product?.image_url ?? "",
      lowStock: product?.low_stock_threshold != null ? String(product.low_stock_threshold) : "",
      isActive: product?.is_active ?? true,
    });
    setGallery(product?.additional_images ?? []);
    setGalleryInput("");
    const seeds: Record<string, string> = {};
    for (const w of warehouses) seeds[w.id] = w.id === defaultWarehouseId ? "0" : "0";
    setInitialStock(seeds);
  }, [open, product, warehouses, defaultWarehouseId]);

  const cost = Number(form.costPrice);
  const sell = Number(form.price);
  const margin =
    form.costPrice !== "" && Number.isFinite(cost) && sell > 0
      ? (((sell - cost) / sell) * 100).toFixed(1)
      : null;

  const addGalleryImage = () => {
    const url = galleryInput.trim();
    if (!url) return;
    if (gallery.length >= 10) {
      toast.error("Up to 10 additional images");
      return;
    }
    setGallery((g) => [...g, url]);
    setGalleryInput("");
  };

  const save = async () => {
    const parsed = schema.safeParse({
      name: form.name,
      sku: form.sku,
      price: Number(form.price),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the form");
      return;
    }
    const duplicate = allProducts.some(
      (p) => p.id !== product?.id && (p.sku ?? "").toLowerCase() === parsed.data.sku.toLowerCase(),
    );
    if (duplicate) {
      toast.error("That SKU is already used by another product");
      return;
    }

    setSaving(true);
    const payload = {
      name: parsed.data.name,
      sku: parsed.data.sku,
      brand: form.brand.trim() || null,
      category: form.category.trim() || null,
      unit: form.unit.trim() || "pcs",
      description: form.description.trim() || null,
      cost_price: form.costPrice === "" ? null : Number(form.costPrice),
      price: parsed.data.price,
      image_url: form.imageUrl.trim() || null,
      additional_images: gallery,
      low_stock_threshold: form.lowStock === "" ? null : Number(form.lowStock),
      is_active: form.isActive,
    };

    const { data, error } = isEdit
      ? await supabase.from("products").update(payload).eq("id", product!.id).select().single()
      : await supabase
          .from("products")
          .insert({
            ...payload,
            opening_stock_note: Object.values(initialStock).reduce(
              (s, v) => s + (Number(v) || 0),
              0,
            ),
          })
          .select()
          .single();

    if (error || !data) {
      setSaving(false);
      toast.error(error?.message ?? "Could not save the product");
      return;
    }

    if (!isEdit) {
      const stockRows = warehouses.map((w) => ({
        product_id: data.id,
        warehouse_id: w.id,
        stock_on_hand: Number(initialStock[w.id]) || 0,
        committed_stock: 0,
      }));
      if (stockRows.length) {
        await supabase.from("product_stock").upsert(stockRows, {
          onConflict: "product_id,warehouse_id",
        });
        await supabase.from("stock_movements").insert(
          stockRows.map((r) => ({
            product_id: r.product_id,
            warehouse_id: r.warehouse_id,
            movement_type: "Initial Stock",
            quantity_change: r.stock_on_hand,
            reason: "Product created",
          })),
        );
      }
    }

    setSaving(false);
    queryClient.invalidateQueries();
    toast.success(isEdit ? "Product updated" : `${data.name} added`);
    onOpenChange(false);
    onSaved?.(data as Product);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit product" : "New product"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update catalogue details for this product."
              : "Add a product, pricing and opening stock per warehouse."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
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
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="prod-brand">Brand</Label>
              <Input
                id="prod-brand"
                list="brand-options"
                className="h-11"
                placeholder="Search or add new"
                maxLength={80}
                value={form.brand}
                onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
              />
              <datalist id="brand-options">
                {brands.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prod-category">Category</Label>
              <Input
                id="prod-category"
                list="category-options"
                className="h-11"
                placeholder="e.g. Eau de Parfum"
                maxLength={80}
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              />
              <datalist id="category-options">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prod-unit">Unit</Label>
              <Input
                id="prod-unit"
                list="unit-options"
                className="h-11"
                maxLength={20}
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              />
              <datalist id="unit-options">
                <option value="pcs" />
                <option value="box" />
                <option value="carton" />
              </datalist>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prod-desc">Description</Label>
            <Textarea
              id="prod-desc"
              rows={2}
              maxLength={600}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <div className="space-y-2">
              <Label htmlFor="prod-cost">Cost price</Label>
              <Input
                id="prod-cost"
                type="number"
                min={0}
                step="0.01"
                className="numeric h-11"
                value={form.costPrice}
                onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
              />
            </div>
            <div className="pb-3 text-center text-xs text-muted-foreground">
              <p className="font-medium text-foreground">{margin ? `${margin}%` : "—"}</p>
              <p>margin</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prod-price">Selling price</Label>
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="prod-image">Primary image URL</Label>
            <Input
              id="prod-image"
              className="h-11"
              placeholder="https://…"
              value={form.imageUrl}
              onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prod-gallery">Additional images (up to 10)</Label>
            <div className="flex gap-2">
              <Input
                id="prod-gallery"
                className="h-11"
                placeholder="https://…"
                value={galleryInput}
                onChange={(e) => setGalleryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addGalleryImage();
                  }
                }}
              />
              <Button type="button" variant="outline" className="h-11" onClick={addGalleryImage}>
                <Plus />
              </Button>
            </div>
            {gallery.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {gallery.map((url, i) => (
                  <span
                    key={`${url}-${i}`}
                    className="flex max-w-full items-center gap-1 rounded-full border border-border px-3 py-1 text-xs"
                  >
                    <span className="truncate">{url}</span>
                    <button
                      type="button"
                      aria-label="Remove image"
                      onClick={() => setGallery((g) => g.filter((_, idx) => idx !== i))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="prod-low">Low stock threshold (optional)</Label>
              <Input
                id="prod-low"
                type="number"
                min={0}
                className="numeric h-11"
                placeholder="Uses global default"
                value={form.lowStock}
                onChange={(e) => setForm((f) => ({ ...f, lowStock: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Available for billing</p>
              </div>
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
              />
            </div>
          </div>

          {!isEdit && warehouses.length > 0 && (
            <div className="space-y-2 rounded-xl border border-border p-4">
              <p className="text-sm font-semibold">Initial stock per warehouse</p>
              <p className="text-xs text-muted-foreground">
                A stock row is created for every warehouse, including zero quantities.
              </p>
              <div className="grid gap-3 pt-2 sm:grid-cols-2">
                {warehouses.map((w) => (
                  <div key={w.id} className="space-y-2">
                    <Label htmlFor={`stock-${w.id}`}>{w.name}</Label>
                    <Input
                      id={`stock-${w.id}`}
                      type="number"
                      min={0}
                      className="numeric h-11"
                      value={initialStock[w.id] ?? "0"}
                      onChange={(e) =>
                        setInitialStock((s) => ({ ...s, [w.id]: e.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" className="h-11" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-11" disabled={saving} onClick={save}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
