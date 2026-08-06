import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Package, Pencil, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge, stockTone } from "@/components/StatusBadge";
import { MovementBadge } from "@/components/MovementBadge";
import { ProductFormDialog } from "@/components/ProductFormDialog";
import { StockAdjustDialog, type AdjustTarget } from "@/components/StockAdjustDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useProduct,
  useProductSales,
  useProductStockRows,
  useSettings,
  useStockMovements,
  useWarehouses,
} from "@/lib/data";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/products/$productId")({
  head: () => ({
    meta: [
      { title: "Product Details — Fragrance Billing" },
      { name: "description", content: "Stock breakdown, movement log and sales history." },
      { property: "og:title", content: "Product Details — Fragrance Billing" },
      {
        property: "og:description",
        content: "Stock breakdown, movement log and sales history.",
      },
    ],
  }),
  component: ProductDetailPage,
  errorComponent: ({ error }) => (
    <p role="alert" className="p-8 text-center text-sm text-destructive">
      {error.message}
    </p>
  ),
  notFoundComponent: () => (
    <p className="p-8 text-center text-sm text-muted-foreground">Product not found.</p>
  ),
});

function ProductDetailPage() {
  const { productId } = Route.useParams();
  const { data: product, isLoading } = useProduct(productId);
  const { data: stockRows = [] } = useProductStockRows(productId);
  const { data: movements = [] } = useStockMovements({ productId });
  const { data: sales = [] } = useProductSales(productId);
  const { data: settings } = useSettings();
  const { data: warehouses = [] } = useWarehouses();

  const [editOpen, setEditOpen] = useState(false);
  const [adjust, setAdjust] = useState<AdjustTarget | null>(null);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const totalStock = useMemo(
    () => stockRows.reduce((s, r) => s + Number(r.stock_on_hand), 0),
    [stockRows],
  );

  const filteredSales = useMemo(
    () =>
      sales.filter((s) =>
        statusFilter === "all" ? true : s.bills?.payment_status === statusFilter,
      ),
    [sales, statusFilter],
  );

  if (isLoading) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Loading product…</p>;
  }
  if (!product) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Product not found.</p>;
  }

  const images = [product.image_url, ...(product.additional_images ?? [])].filter(
    Boolean,
  ) as string[];
  const hero = activeImage ?? images[0] ?? null;
  const threshold = Number(product.low_stock_threshold ?? settings?.low_stock_threshold ?? 5);
  const tone = stockTone(totalStock, threshold);
  const cost = product.cost_price != null ? Number(product.cost_price) : null;
  const margin =
    cost != null && Number(product.price) > 0
      ? (((Number(product.price) - cost) / Number(product.price)) * 100).toFixed(1)
      : null;

  return (
    <div className="space-y-6">
      <Link
        to="/products"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Products
      </Link>

      <PageHeader
        title={product.name}
        description={`${product.sku ?? "No SKU"} · ${product.brand ?? "No brand"} · ${
          product.category ?? "Uncategorised"
        }`}
        actions={
          <Button variant="outline" className="h-11" onClick={() => setEditOpen(true)}>
            <Pencil /> Edit
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="surface-card p-4">
          <div className="grid aspect-square w-full place-items-center overflow-hidden rounded-xl bg-muted">
            {hero ? (
              <img src={hero} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <Package className="h-10 w-10 text-muted-foreground" />
            )}
          </div>
          {images.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {images.map((url) => (
                <button
                  key={url}
                  onClick={() => setActiveImage(url)}
                  className={`h-14 w-14 overflow-hidden rounded-lg border ${
                    hero === url ? "border-primary" : "border-border"
                  }`}
                >
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
          {product.description && (
            <p className="mt-4 text-sm text-muted-foreground">{product.description}</p>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="surface-card p-4">
              <p className="text-xs text-muted-foreground">Total stock</p>
              <p className="numeric mt-1 text-2xl font-bold">{totalStock}</p>
              <div className="mt-1">
                <StatusBadge tone={tone.tone}>{tone.label}</StatusBadge>
              </div>
            </div>
            <div className="surface-card p-4">
              <p className="text-xs text-muted-foreground">Cost price</p>
              <p className="numeric mt-1 text-xl font-bold">
                {cost != null ? formatMoney(cost) : "—"}
              </p>
            </div>
            <div className="surface-card p-4">
              <p className="text-xs text-muted-foreground">Selling price</p>
              <p className="numeric mt-1 text-xl font-bold">{formatMoney(product.price)}</p>
            </div>
            <div className="surface-card p-4">
              <p className="text-xs text-muted-foreground">Margin</p>
              <p className="numeric mt-1 text-xl font-bold">{margin ? `${margin}%` : "—"}</p>
            </div>
          </div>

          <div className="surface-card overflow-hidden">
            <div className="border-b border-border p-4">
              <h2 className="text-sm font-semibold">Stock by warehouse</h2>
            </div>
            <div className="divide-y divide-border/60">
              {stockRows.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  No warehouse stock rows yet.
                </p>
              ) : (
                stockRows.map((r) => {
                  const onHand = Number(r.stock_on_hand);
                  const committed = Number(r.committed_stock);
                  return (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4"
                    >
                      <Link
                        to="/warehouses/$warehouseId"
                        params={{ warehouseId: r.warehouse_id }}
                        className="text-sm font-medium hover:underline"
                      >
                        {r.warehouses?.name ?? "Warehouse"}
                      </Link>
                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <p className="numeric text-sm font-semibold">{onHand}</p>
                          <p className="text-[11px] text-muted-foreground">On hand</p>
                        </div>
                        <div className="text-center">
                          <p className="numeric text-sm font-semibold">{committed}</p>
                          <p className="text-[11px] text-muted-foreground">Committed</p>
                        </div>
                        <div className="text-center">
                          <p className="numeric text-sm font-semibold">{onHand - committed}</p>
                          <p className="text-[11px] text-muted-foreground">Available</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setAdjust({
                              productId: product.id,
                              warehouseId: r.warehouse_id,
                              productName: product.name,
                              warehouseName: r.warehouses?.name ?? "Warehouse",
                              stockOnHand: onHand,
                            })
                          }
                        >
                          <SlidersHorizontal className="h-4 w-4" /> Adjust
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="movements" className="space-y-4">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="movements" className="flex-1 sm:flex-none">
            Stock movements
          </TabsTrigger>
          <TabsTrigger value="sales" className="flex-1 sm:flex-none">
            Sales history
          </TabsTrigger>
        </TabsList>

        <TabsContent value="movements">
          <div className="surface-card divide-y divide-border/60 overflow-hidden">
            {movements.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                No stock movements recorded.
              </p>
            ) : (
              movements.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {m.warehouses?.name ?? "Warehouse"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDateTime(m.created_at)}
                      {m.reason ? ` · ${m.reason}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <MovementBadge type={m.movement_type} />
                    <span
                      className={`numeric text-sm font-semibold ${
                        Number(m.quantity_change) < 0 ? "text-destructive" : "text-success"
                      }`}
                    >
                      {Number(m.quantity_change) > 0 ? "+" : ""}
                      {Number(m.quantity_change)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="sales" className="space-y-3">
          <div className="grid gap-2 sm:max-w-md sm:grid-cols-2">
            <Select value="invoices" onValueChange={() => undefined}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="invoices">Invoices</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Paid">Paid</SelectItem>
                <SelectItem value="Partially Paid">Partially Paid</SelectItem>
                <SelectItem value="Unpaid">Unpaid</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="surface-card divide-y divide-border/60 overflow-hidden">
            {filteredSales.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                No sales recorded for this product.
              </p>
            ) : (
              filteredSales.map((s) => (
                <Link
                  key={s.id}
                  to="/bills/$billId"
                  params={{ billId: s.bills?.id ?? "" }}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {s.bills?.bill_number ?? "Draft"} ·{" "}
                      {s.bills?.customers?.name ?? "Walk-in customer"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(s.bills?.bill_date)} · {s.warehouses?.name ?? "—"} ·{" "}
                      {Number(s.quantity)} × {formatMoney(s.unit_price)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge
                      tone={
                        s.bills?.payment_status === "Paid"
                          ? "success"
                          : s.bills?.payment_status === "Partially Paid"
                            ? "warning"
                            : "error"
                      }
                    >
                      {s.bills?.payment_status ?? "Unpaid"}
                    </StatusBadge>
                    <span className="numeric text-sm font-semibold">
                      {formatMoney(s.line_total)}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      <ProductFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        warehouses={warehouses}
        product={product}
      />
      <StockAdjustDialog target={adjust} onOpenChange={(o) => !o && setAdjust(null)} />
    </div>
  );
}
