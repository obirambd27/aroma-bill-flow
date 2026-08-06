import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Package, Search, ArrowUpDown, LayoutGrid, List, Plus, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge, stockTone } from "@/components/StatusBadge";
import { ProductFormDialog } from "@/components/ProductFormDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  useAllProducts,
  useSettings,
  useStockTotals,
  useWarehouses,
  type Product,
} from "@/lib/data";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/products/")({
  head: () => ({
    meta: [
      { title: "Products — Fragrance Billing" },
      { name: "description", content: "Perfume catalogue with live stock levels and pricing." },
      { property: "og:title", content: "Products — Fragrance Billing" },
      {
        property: "og:description",
        content: "Perfume catalogue with live stock levels and pricing.",
      },
    ],
  }),
  component: ProductsPage,
});

type SortKey = "name-asc" | "name-desc" | "price-asc" | "price-desc" | "stock-asc" | "stock-desc";

function ProductsPage() {
  const queryClient = useQueryClient();
  const { data: products = [], isLoading } = useAllProducts();
  const { data: settings } = useSettings();
  const { data: stockTotals = {} } = useStockTotals();
  const { data: warehouses = [] } = useWarehouses();

  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("all");
  const [category, setCategory] = useState("all");
  const [stockStatus, setStockStatus] = useState("all");
  const [sort, setSort] = useState<SortKey>("name-asc");
  const [view, setView] = useState<"table" | "grid">("table");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const globalThreshold = Number(settings?.low_stock_threshold ?? 5);

  const brands = useMemo(
    () => [...new Set(products.map((p) => p.brand).filter(Boolean) as string[])].sort(),
    [products],
  );
  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean) as string[])].sort(),
    [products],
  );

  const statusOf = (p: Product) => {
    const total = stockTotals[p.id] ?? 0;
    const threshold = Number(p.low_stock_threshold ?? globalThreshold);
    return stockTone(total, threshold);
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = products.filter((p) => {
      if (
        q &&
        !p.name.toLowerCase().includes(q) &&
        !(p.sku ?? "").toLowerCase().includes(q) &&
        !(p.brand ?? "").toLowerCase().includes(q)
      )
        return false;
      if (brand !== "all" && p.brand !== brand) return false;
      if (category !== "all" && p.category !== category) return false;
      if (stockStatus !== "all") {
        const total = stockTotals[p.id] ?? 0;
        const threshold = Number(p.low_stock_threshold ?? globalThreshold);
        if (stockStatus === "out" && total > 0) return false;
        if (stockStatus === "low" && !(total > 0 && total <= threshold)) return false;
        if (stockStatus === "in" && total <= threshold) return false;
      }
      return true;
    });
    const [key, dir] = sort.split("-") as ["name" | "price" | "stock", "asc" | "desc"];
    const sorted = [...filtered].sort((a, b) => {
      if (key === "name") return a.name.localeCompare(b.name);
      if (key === "price") return Number(a.price) - Number(b.price);
      return (stockTotals[a.id] ?? 0) - (stockTotals[b.id] ?? 0);
    });
    return dir === "desc" ? sorted.reverse() : sorted;
  }, [products, query, brand, category, stockStatus, sort, stockTotals, globalThreshold]);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const remove = async (p: Product) => {
    const { count, error: countError } = await supabase
      .from("bill_items")
      .select("id", { count: "exact", head: true })
      .eq("product_id", p.id);
    if (countError) {
      toast.error(countError.message);
      return;
    }
    if ((count ?? 0) > 0) {
      toast.error("This product appears on bills. Mark it inactive instead of deleting.");
      return;
    }
    if (!confirm(`Delete ${p.name}? This cannot be undone.`)) return;
    await supabase.from("stock_movements").delete().eq("product_id", p.id);
    await supabase.from("product_stock").delete().eq("product_id", p.id);
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries();
    toast.success("Product deleted");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Catalogue, pricing and stock levels."
        actions={
          <Button className="h-11" onClick={openNew}>
            <Plus /> New Product
          </Button>
        }
      />

      <div className="surface-card overflow-hidden">
        <div className="space-y-3 border-b border-border p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-11 pl-9"
                placeholder="Search by name, SKU or brand"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="h-11 w-[170px]">
                  <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name-asc">Name A–Z</SelectItem>
                  <SelectItem value="name-desc">Name Z–A</SelectItem>
                  <SelectItem value="price-asc">Price low–high</SelectItem>
                  <SelectItem value="price-desc">Price high–low</SelectItem>
                  <SelectItem value="stock-asc">Stock low–high</SelectItem>
                  <SelectItem value="stock-desc">Stock high–low</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                className="hidden h-11 w-11 sm:inline-flex"
                onClick={() => setView(view === "table" ? "grid" : "table")}
                aria-label="Toggle view"
              >
                {view === "table" ? <LayoutGrid /> : <List />}
              </Button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Select value={brand} onValueChange={setBrand}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Brand" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All brands</SelectItem>
                {brands.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stockStatus} onValueChange={setStockStatus}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Stock status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stock levels</SelectItem>
                <SelectItem value="in">In stock</SelectItem>
                <SelectItem value="low">Low stock</SelectItem>
                <SelectItem value="out">Out of stock</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading products…</p>
        ) : products.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No products yet"
            description="Add your first product to start building your perfume catalogue."
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No matches"
            description="No products match your filters. Try a different search."
          />
        ) : (
          <>
            <table className={`w-full ${view === "table" ? "hidden md:table" : "hidden"}`}>
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Brand</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Cost</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3 text-right">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const s = statusOf(p);
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                    >
                      <td className="px-4 py-3">
                        <Link
                          to="/products/$productId"
                          params={{ productId: p.id }}
                          className="flex min-w-0 items-center gap-3"
                        >
                          <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
                            {p.image_url ? (
                              <img
                                src={p.image_url}
                                alt={p.name}
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Package className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <span className="truncate text-sm font-medium hover:underline">
                            {p.name}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{p.sku ?? "—"}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{p.brand ?? "—"}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {p.category ?? "—"}
                      </td>
                      <td className="numeric px-4 py-3 text-right text-sm text-muted-foreground">
                        {p.cost_price != null ? formatMoney(p.cost_price) : "—"}
                      </td>
                      <td className="numeric px-4 py-3 text-right text-sm font-semibold">
                        {formatMoney(p.price)}
                      </td>
                      <td className="numeric px-4 py-3 text-right text-sm font-semibold">
                        {stockTotals[p.id] ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.is_active ? (
                          <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                        ) : (
                          <StatusBadge tone="neutral">Inactive</StatusBadge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Edit"
                            onClick={() => {
                              setEditing(p);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete"
                            onClick={() => remove(p)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div
              className={`grid gap-3 p-4 sm:grid-cols-2 ${
                view === "table" ? "md:hidden" : "lg:grid-cols-3"
              }`}
            >
              {visible.map((p) => {
                const s = statusOf(p);
                return (
                  <div key={p.id} className="rounded-xl border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        to="/products/$productId"
                        params={{ productId: p.id }}
                        className="min-w-0"
                      >
                        <p className="truncate text-sm font-semibold">{p.name}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {p.sku ?? "No SKU"} · {p.brand ?? "No brand"}
                        </p>
                      </Link>
                      {p.is_active ? (
                        <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">Inactive</StatusBadge>
                      )}
                    </div>
                    <div className="mt-4 flex items-end justify-between">
                      <p className="numeric text-xl font-bold">{formatMoney(p.price)}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="numeric text-sm font-semibold text-foreground">
                          {stockTotals[p.id] ?? 0}
                        </span>{" "}
                        in stock
                      </p>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        variant="outline"
                        className="h-11 flex-1"
                        onClick={() => {
                          setEditing(p);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil /> Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11"
                        aria-label="Delete"
                        onClick={() => remove(p)}
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        warehouses={warehouses}
        product={editing}
      />
    </div>
  );
}
