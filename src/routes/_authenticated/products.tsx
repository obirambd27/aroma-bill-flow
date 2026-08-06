import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Package, Search, ArrowUpDown, LayoutGrid, List } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge, stockTone } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProducts, useSettings, useStockTotals } from "@/lib/data";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/products")({
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: products = [], isLoading } = useProducts();
  const { data: settings } = useSettings();
  const { data: stockTotals = {} } = useStockTotals();

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name-asc");
  const [view, setView] = useState<"table" | "grid">("table");

  const threshold = Number(settings?.low_stock_threshold ?? 5);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = products.filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q),
    );
    const [key, dir] = sort.split("-") as ["name" | "price" | "stock", "asc" | "desc"];
    const sorted = [...filtered].sort((a, b) => {
      if (key === "name") return a.name.localeCompare(b.name);
      if (key === "price") return Number(a.price) - Number(b.price);
      return (stockTotals[a.id] ?? 0) - (stockTotals[b.id] ?? 0);
    });
    return dir === "desc" ? sorted.reverse() : sorted;
  }, [products, query, sort, stockTotals]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Catalogue and stock levels."
      />

      <div className="surface-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 pl-9"
              placeholder="Search by name or SKU"
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
            description="No products match your search. Try a different name or SKU."
          />
        ) : (
          <>
            {/* Desktop table */}
            <table
              className={`w-full ${view === "table" ? "hidden md:table" : "hidden"}`}
            >
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const s = stockTone(stockTotals[p.id] ?? 0, threshold);
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
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
                          <span className="truncate text-sm font-medium">{p.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{p.sku ?? "—"}</td>
                      <td className="numeric px-4 py-3 text-right text-sm font-semibold">
                        {formatMoney(p.price)}
                      </td>
                      <td className="numeric px-4 py-3 text-right text-sm font-semibold">
                        {stockTotals[p.id] ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Cards: mobile always, desktop when grid view */}
            <div
              className={`grid gap-3 p-4 sm:grid-cols-2 ${
                view === "table" ? "md:hidden" : "lg:grid-cols-3"
              }`}
            >
              {visible.map((p) => {
                const s = stockTone(stockTotals[p.id] ?? 0, threshold);
                return (
                  <div key={p.id} className="rounded-xl border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{p.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{p.sku ?? "No SKU"}</p>
                      </div>
                      <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
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
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
