import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  Minus,
  Package,
  Plus,
  Search,
  Share,
  ShoppingCart,
  Star,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/format";
import { getPublicPriceList, submitPublicOrderFn } from "@/lib/public-order.functions";
import type { PublicOrderReceipt } from "@/lib/public-order.server";
import { orderWhatsAppText, printOrderReceipt } from "@/lib/order-receipt";
import {
  clearSavedCheckout,
  loadSavedCheckout,
  saveCheckout,
  type SavedCheckout,
} from "@/lib/order-storage";
import { initInstallPrompt, isIOS, isStandalone, useInstallPrompt } from "@/lib/pwa";
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
    links: [{ rel: "manifest", href: "/order-manifest.webmanifest" }],
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

type View = "browse" | "cart" | "checkout" | "done";

function PublicOrderPage() {
  const { token } = Route.useParams();
  const fetchList = useServerFn(getPublicPriceList);
  const submitOrder = useServerFn(submitPublicOrderFn);

  const query = useQuery({
    queryKey: ["public-price-list", token],
    queryFn: () => fetchList({ data: { token } }),
    retry: 1,
  });

  const [view, setView] = useState<View>("browse");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [brand, setBrand] = useState<string>("all");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [capNote, setCapNote] = useState<Record<string, number>>({});
  const [shortfall, setShortfall] = useState<Record<string, number>>({});
  const [verifying, setVerifying] = useState(false);
  const [verifyFailed, setVerifyFailed] = useState(false);
  const [form, setForm] = useState<SavedCheckout>({
    name: "",
    phone: "",
    email: "",
    address: "",
  });
  const [hasSaved, setHasSaved] = useState(false);
  const [note, setNote] = useState("");
  const [placing, setPlacing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<PublicOrderReceipt | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const install = useInstallPrompt();
  const [installDismissed, setInstallDismissed] = useState(false);

  useEffect(() => {
    const cleanup = initInstallPrompt();
    const saved = loadSavedCheckout(token);
    if (saved && (saved.name || saved.phone)) {
      setForm(saved);
      setHasSaved(true);
    }
    return cleanup;
  }, [token]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebounced(search), 200);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  const data = query.data;
  const products = useMemo(() => (data?.available ? data.products : []), [data]);

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

  const cartLines = useMemo(
    () =>
      products
        .filter((p) => (cart[p.id] ?? 0) > 0)
        .map((p) => ({ ...p, quantity: cart[p.id] ?? 0 })),
    [products, cart],
  );

  const itemCount = cartLines.reduce((a, l) => a + l.quantity, 0);
  const minQty = data?.available ? data.list.minQuantity : null;
  const increasePercent = data?.available ? data.list.increasePercent : 0;
  const belowMin = Boolean(minQty && increasePercent > 0 && itemCount > 0 && itemCount < minQty);
  const multiplier = belowMin ? 1 + increasePercent / 100 : 1;
  const baseSubtotal = cartLines.reduce((sum, l) => sum + l.quantity * l.price, 0);
  const total = cartLines.reduce(
    (sum, l) => sum + l.quantity * Math.round(l.price * multiplier * 100) / 100,
    0,
  );
  const hasShortfall = cartLines.some((l) => (shortfall[l.id] ?? 0) > 0);

  const setQty = (id: string, qty: number, stock: number) => {
    const clamped = Math.max(0, Math.min(qty, stock));
    setCapNote((prev) => ({ ...prev, [id]: qty > stock ? stock : 0 }));
    setShortfall((prev) => ({ ...prev, [id]: 0 }));
    setCart((prev) => {
      const next = { ...prev };
      if (clamped <= 0) delete next[id];
      else next[id] = clamped;
      return next;
    });
  };

  /** Re-verifies live stock before showing the cart; blocks checkout when it fails. */
  const openCart = async () => {
    setVerifying(true);
    setVerifyFailed(false);
    setView("cart");
    try {
      const fresh = await query.refetch();
      if (fresh.error || !fresh.data?.available) {
        setVerifyFailed(true);
      } else {
        const next: Record<string, number> = {};
        for (const [id, qty] of Object.entries(cart)) {
          const stock = fresh.data.products.find((p) => p.id === id)?.stock ?? 0;
          if (qty > stock) next[id] = stock;
        }
        setShortfall(next);
      }
    } catch {
      setVerifyFailed(true);
    } finally {
      setVerifying(false);
    }
  };

  const placeOrder = async () => {
    if (placing) return;
    setPlacing(true);
    setSubmitError(null);
    try {
      const result = await submitOrder({
        data: {
          token,
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || null,
          address: form.address.trim() || null,
          note: note.trim() || null,
          items: cartLines.map((l) => ({ productId: l.id, quantity: l.quantity })),
        },
      });
      if (!result.ok) {
        if (result.error === "stock") {
          setShortfall({ [result.productId]: result.available });
          setSubmitError(
            `Only ${result.available} of ${result.name} available — please adjust your order.`,
          );
          setView("cart");
          void query.refetch();
        } else if (result.error === "unavailable") {
          setSubmitError("This price list is no longer available.");
        } else {
          setSubmitError("We couldn't place your order. Please try again.");
        }
        setPlacing(false);
        return;
      }
      saveCheckout(token, form);
      setHasSaved(true);
      setReceipt(result.receipt);
      setCart({});
      setView("done");
      setPlacing(false);
    } catch {
      setSubmitError("We couldn't reach our server. Please check your connection and try again.");
      setPlacing(false);
    }
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

  const business = data.business;

  if (view === "done" && receipt) {
    const waText = orderWhatsAppText(receipt);
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto max-w-lg space-y-5">
          <div className="rounded-2xl border border-success/30 bg-success/5 p-5 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
            <h1 className="mt-3 text-lg font-semibold text-foreground">
              Order {receipt.orderNumber}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              We&apos;ve received your order and will confirm shortly.
            </p>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card p-4">
            <ul className="divide-y divide-border/60">
              {receipt.items.map((i) => (
                <li key={i.name} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block font-medium text-foreground">{i.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {i.quantity} × {formatMoney(i.appliedPrice)}
                    </span>
                  </span>
                  <span className="font-semibold">{formatMoney(i.lineTotal)}</span>
                </li>
              ))}
            </ul>
            {receipt.priceIncreased && (
              <p className="mt-3 rounded-lg bg-warning/15 px-3 py-2 text-xs text-warning-foreground">
                Your order was below our minimum quantity, so a {receipt.increasePercent}% price
                increase was applied.
              </p>
            )}
            <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-base font-bold">
              <span>Total</span>
              <span>{formatMoney(receipt.total)}</span>
            </div>
          </div>

          {business.whatsapp && (
            <Button
              className="h-12 w-full text-base"
              onClick={() =>
                window.open(
                  `https://wa.me/${business.whatsapp}?text=${encodeURIComponent(waText)}`,
                  "_blank",
                  "noopener",
                )
              }
            >
              Send order to {business.name || "us"} on WhatsApp
            </Button>
          )}

          <Button
            variant="outline"
            className="h-11 w-full"
            onClick={() => {
              try {
                printOrderReceipt(receipt);
              } catch {
                setSubmitError("Please allow pop-ups to download your receipt.");
              }
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Download PDF receipt
          </Button>

          {submitError && <p className="text-center text-xs text-destructive">{submitError}</p>}

          {install.available && !installDismissed && (
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-sm">
              <span className="flex-1">Add this store to your home screen for faster ordering.</span>
              <Button size="sm" onClick={() => void install.install()}>
                Install
              </Button>
              <button
                type="button"
                aria-label="Dismiss install banner"
                className="text-muted-foreground"
                onClick={() => setInstallDismissed(true)}
              >
                ✕
              </button>
            </div>
          )}
          {!install.available && isIOS() && !isStandalone() && !installDismissed && (
            <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
              <Share className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                To add this store to your home screen: tap the Share button, then “Add to Home
                Screen”.
              </span>
            </div>
          )}

          <div className="pt-2 text-center">
            <a
              href={business.googleReview ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4"
            >
              <Star className="h-3.5 w-3.5" />
              Enjoyed shopping with us? Leave us a review
            </a>
          </div>

          <button
            type="button"
            className="mx-auto block text-xs text-muted-foreground underline underline-offset-4"
            onClick={() => {
              setReceipt(null);
              setView("browse");
            }}
          >
            Place another order
          </button>
        </div>
      </div>
    );
  }

  if (view === "checkout") {
    const canSubmit = form.name.trim().length > 0 && form.phone.trim().length >= 5;
    return (
      <div className="min-h-screen bg-background px-4 py-6">
        <div className="mx-auto max-w-lg space-y-4">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
            onClick={() => setView("cart")}
          >
            <ArrowLeft className="h-4 w-4" /> Back to cart
          </button>
          <h1 className="text-lg font-semibold text-foreground">Your details</h1>

          {hasSaved && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-4"
              onClick={() => {
                clearSavedCheckout(token);
                setForm({ name: "", phone: "", email: "", address: "" });
                setHasSaved(false);
              }}
            >
              Not you? Clear saved info
            </button>
          )}

          <div className="space-y-3">
            <div>
              <Label htmlFor="o-name">Full Name *</Label>
              <Input
                id="o-name"
                className="mt-1 h-12"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="o-phone">Phone *</Label>
              <Input
                id="o-phone"
                type="tel"
                className="mt-1 h-12"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="o-email">Email (optional)</Label>
              <Input
                id="o-email"
                type="email"
                className="mt-1 h-12"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="o-address">Delivery Address (optional)</Label>
              <Textarea
                id="o-address"
                className="mt-1"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="o-note">Note (optional)</Label>
              <Textarea
                id="o-note"
                className="mt-1"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Need a different price or have a special request? Let us know here.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </span>
              <span className="text-lg font-bold">{formatMoney(total)}</span>
            </div>
          </div>

          {submitError && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {submitError}
            </p>
          )}

          <Button
            className="h-14 w-full text-base"
            disabled={!canSubmit || placing || itemCount === 0}
            onClick={() => void placeOrder()}
          >
            {placing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Placing your order…
              </>
            ) : (
              "Place Order"
            )}
          </Button>
        </div>
      </div>
    );
  }

  if (view === "cart") {
    return (
      <div className="min-h-screen bg-background pb-32">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
          <button type="button" aria-label="Back to products" onClick={() => setView("browse")}>
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-base font-semibold">Your cart</h1>
        </header>

        <div className="mx-auto max-w-2xl space-y-3 px-4 pt-4">
          {verifying && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking current stock…
            </p>
          )}

          {verifyFailed && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p className="text-destructive">
                Couldn&apos;t verify current stock — please check your connection.
              </p>
              <Button size="sm" className="mt-3" onClick={() => void openCart()}>
                Retry
              </Button>
            </div>
          )}

          {submitError && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {submitError}
            </p>
          )}

          {cartLines.length === 0 ? (
            <p className="py-20 text-center text-sm text-muted-foreground">Your cart is empty.</p>
          ) : (
            <>
              {minQty && increasePercent > 0 ? (
                belowMin ? (
                  <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
                    Your order is below our minimum of {minQty} pieces — a {increasePercent}% price
                    increase applies to this order. Add {Math.max(0, minQty - itemCount)} more
                    pieces to unlock standard pricing.
                  </div>
                ) : (
                  <div className="rounded-xl border border-success/40 bg-success/10 p-3 text-sm text-success">
                    Minimum order of {minQty} pieces met — standard pricing applies.
                  </div>
                )
              ) : null}

              <ul className="space-y-3">
                {cartLines.map((l) => {
                  const short = shortfall[l.id] ?? 0;
                  const isShort = l.quantity > l.stock || short > 0;
                  return (
                    <li
                      key={l.id}
                      className={cn(
                        "flex gap-3 rounded-2xl border bg-card p-3",
                        isShort ? "border-destructive" : "border-border/60",
                      )}
                    >
                      <ProductImage src={l.imageUrl} alt={l.name} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">{l.name}</p>
                        <p className="mt-0.5 text-sm">
                          {belowMin ? (
                            <>
                              <span className="mr-2 text-muted-foreground line-through">
                                {formatMoney(l.price)}
                              </span>
                              <span className="font-bold">
                                {formatMoney(Math.round(l.price * multiplier * 100) / 100)}
                              </span>
                            </>
                          ) : (
                            <span className="font-bold">{formatMoney(l.price)}</span>
                          )}
                        </p>
                        {isShort && (
                          <p className="text-xs font-medium text-destructive">
                            Only {l.stock} left — please adjust
                          </p>
                        )}
                        <div className="mt-2 flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={`Decrease quantity of ${l.name}`}
                            className="h-11 w-11"
                            onClick={() => setQty(l.id, l.quantity - 1, l.stock)}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <Input
                            inputMode="numeric"
                            aria-label={`Quantity of ${l.name}`}
                            value={l.quantity}
                            onChange={(e) => setQty(l.id, Number(e.target.value) || 0, l.stock)}
                            className="h-11 w-16 text-center"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={`Increase quantity of ${l.name}`}
                            className="h-11 w-11"
                            onClick={() => setQty(l.id, l.quantity + 1, l.stock)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${l.name}`}
                            className="h-11 w-11 text-muted-foreground"
                            onClick={() => setQty(l.id, 0, l.stock)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="rounded-xl border border-border/60 bg-card p-4 text-sm">
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatMoney(baseSubtotal)}</span>
                </div>
                {belowMin && (
                  <div className="flex justify-between py-0.5">
                    <span className="text-muted-foreground">
                      Below-minimum adjustment (+{increasePercent}%)
                    </span>
                    <span>{formatMoney(total - baseSubtotal)}</span>
                  </div>
                )}
                <div className="mt-2 flex justify-between border-t border-border/60 pt-2 text-base font-bold">
                  <span>Total</span>
                  <span>{formatMoney(total)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto max-w-2xl">
            <Button
              className="h-13 w-full py-3.5 text-base"
              disabled={itemCount === 0 || verifying || verifyFailed || hasShortfall}
              onClick={() => {
                setSubmitError(null);
                setView("checkout");
              }}
            >
              Proceed to checkout · {formatMoney(total)}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto grid max-w-5xl grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-4 py-3">
          {business.logo ? (
            <img
              src={business.logo}
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
              {business.name || "Price List"}
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
            disabled={itemCount === 0 || verifying}
            onClick={() => void openCart()}
          >
            <ShoppingCart className="mr-2 h-4 w-4" />
            View cart
          </Button>
        </div>
      </div>
    </div>
  );
}
