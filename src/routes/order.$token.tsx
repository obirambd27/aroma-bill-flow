import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Minus, Package, Plus, Search, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/format";
import { getPublicPriceList } from "@/lib/public-order.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/order/$token")({
  head: () => ({
    meta: [
      { title: "Order Online — Price List" },
      {
        name: "description",
        content: "Browse the live price list, check stock and build your order in seconds.",
      },
      { property: "og:title", content: "Order Online — Price List" },
      {
        property: "og:description",
        content: "Browse the live price list, check stock and build your order in seconds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PublicOrderPage,
});

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      {children}
    </div>
  );
}

function ProductImage({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-accent">
        <Package className="h-7 w-7 text-accent-foreground" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="h-20 w-20 shrink-0 rounded-xl border border-border/60 object-cover"
    />
  );
}

function PublicOrderPage() {
  const { token } = Route.useParams();
  const fetchList = useServerFn(getPublicPriceList);

  const query = useQuery({
    queryKey: ["public-price-list", token],
    queryFn: () => fetchList({ data: { token } }),
    retry: 1,
  });

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [brand, setBrand] = useState<string>("all");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [capNote, setCapNote] = useState<Record<string, number>>({});
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebounced(search), 200);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  const data = query.data;
  const products = data?.available ? data.products : [];

  // Drop cart lines for products that went out of stock while browsing.
  useEffect(() => {
    if (!data?.available) return;
    const live = new Set(products.map((p) => p.id));
    setCart((prev) => {
      const next: Record<string, number> = {};
      let changed = false;
      for (const [id, qty] of Object.entries(prev)) {
        const product = products.find((p) => p.id === id);
        if (!live.has(id)) {
          changed = true;
          continue;
        }
        const capped = Math.min(qty, product?.stock ?? 0);
        if (capped !== qty) changed = true;
        if (capped > 0) next[id] = capped;
      }
      return changed ? next : prev;
    });
  }, [data, products]);

  const brands = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) if (p.brand) set.add(p.brand);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const visible = useMemo(() => {
    const term = debounced.trim().toLowerCase();
    return products.filter((p) => {
      if (brand !== "all" && (p.brand ?? "") !== brand) return false;
      if (term && !p.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [products, brand, debounced]);

  const itemCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const total = products.reduce((sum, p) => sum + (cart[p.id] ?? 0) * p.price, 0);

  const setQty = (id: string, qty: number, stock: number) => {
    const clamped = Math.max(0, Math.min(qty, stock));
    setCapNote((prev) => ({ ...prev, [id]: qty > stock ? stock : 0 }));
    setCart((prev) => {
      const next = { ...prev };
      if (clamped <= 0) delete next[id];
      else next[id] = clamped;
      return next;
    });
  };

  if (query.isLoading) {
    return (
      <div className="min-h-screen bg-background px-4 py-6">
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="mt-4 h-10 w-full rounded-xl" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <Centered>
        <h1 className="text-lg font-semibold text-foreground">
          We couldn&apos;t load this price list
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Please check your connection and try again.
        </p>
        <Button onClick={() => query.refetch()}>Retry</Button>
      </Centered>
    );
  }

  if (!data?.available) {
    return (
      <Centered>
        <h1 className="text-base font-medium text-foreground">
          This price list is no longer available.
        </h1>
      </Centered>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto grid max-w-5xl grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-4 py-3">
          {data.business.logo ? (
            <img
              src={data.business.logo}
              alt=""
              className="h-10 w-10 shrink-0 rounded-xl object-contain"
            />
          ) : (
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent">
              <Package className="h-5 w-5 text-accent-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-foreground">
              {data.business.name || "Price List"}
            </h1>
            <p className="truncate text-xs text-muted-foreground">{data.list.name}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 pt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products"
            aria-label="Search products"
            className="h-12 pl-9"
          />
        </div>

        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
          {[{ key: "all", label: "All Brands" }, ...brands.map((b) => ({ key: b, label: b }))].map(
            (b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => setBrand(b.key)}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-2 text-sm transition-colors",
                  brand === b.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                {b.label}
              </button>
            ),
          )}
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Showing {visible.length} of {products.length} products
        </p>

        {products.length === 0 ? (
          <div className="py-20 text-center text-sm text-muted-foreground">
            No products are currently available in this price list. Please check back soon.
          </div>
        ) : visible.length === 0 ? (
          <div className="py-20 text-center text-sm text-muted-foreground">
            No products found — try a different search or brand.
          </div>
        ) : (
          <ul className="mt-3 space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
            {visible.map((p) => {
              const qty = cart[p.id] ?? 0;
              return (
                <li
                  key={p.id}
                  className="flex gap-3 rounded-2xl border border-border/60 bg-card p-3"
                >
                  <ProductImage src={p.imageUrl} alt={p.name} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug text-foreground">{p.name}</p>
                    {p.brand && <p className="text-xs text-muted-foreground">{p.brand}</p>}
                    <p className="mt-1 text-base font-bold text-foreground">
                      {formatMoney(p.price)}
                    </p>
                    <p className="text-xs text-muted-foreground">{p.stock} in stock</p>
                    {capNote[p.id] ? (
                      <p className="text-xs font-medium text-destructive">
                        Only {p.stock} available
                      </p>
                    ) : null}
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={`Decrease quantity of ${p.name}`}
                        className="h-11 w-11"
                        onClick={() => setQty(p.id, qty - 1, p.stock)}
                        disabled={qty === 0}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        inputMode="numeric"
                        aria-label={`Quantity of ${p.name}`}
                        value={qty}
                        onChange={(e) => setQty(p.id, Number(e.target.value) || 0, p.stock)}
                        className="h-11 w-16 text-center"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={`Increase quantity of ${p.name}`}
                        className="h-11 w-11"
                        onClick={() => setQty(p.id, qty + 1, p.stock)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </p>
            <p className="truncate text-base font-bold text-foreground">{formatMoney(total)}</p>
          </div>
          <Button
            className="h-12 px-5"
            disabled={itemCount === 0 || query.isFetching}
            onClick={() => query.refetch()}
          >
            {query.isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ShoppingCart className="mr-2 h-4 w-4" />
            )}
            View cart
          </Button>
        </div>
      </div>
    </div>
  );
}
