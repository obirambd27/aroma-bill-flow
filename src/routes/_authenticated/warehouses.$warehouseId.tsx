import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, Pencil, ArrowLeftRight, ArrowLeft, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge, stockTone } from "@/components/StatusBadge";
import { MovementBadge } from "@/components/MovementBadge";
import { WarehouseFormDialog } from "@/components/WarehouseFormDialog";
import { StockTransferDialog } from "@/components/StockTransferDialog";
import { StockAdjustDialog, type AdjustTarget } from "@/components/StockAdjustDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useSettings,
  useStockMovements,
  useWarehouse,
  useWarehouseStock,
} from "@/lib/data";
import { formatDateTime, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/warehouses/$warehouseId")({
  head: () => ({
    meta: [
      { title: "Warehouse Stock — Fragrance Billing" },
      { name: "description", content: "Stock on hand, availability and movement history." },
      { property: "og:title", content: "Warehouse Stock — Fragrance Billing" },
      {
        property: "og:description",
        content: "Stock on hand, availability and movement history.",
      },
    ],
  }),
  component: WarehouseDetailPage,
  errorComponent: ({ error }) => (
    <p role="alert" className="p-8 text-center text-sm text-destructive">
      {error.message}
    </p>
  ),
  notFoundComponent: () => (
    <p className="p-8 text-center text-sm text-muted-foreground">Warehouse not found.</p>
  ),
});

function WarehouseDetailPage() {
  const { warehouseId } = Route.useParams();
  const { data: warehouse, isLoading } = useWarehouse(warehouseId);
  const { data: rows = [] } = useWarehouseStock(warehouseId);
  const { data: movements = [] } = useStockMovements({ warehouseId });
  const { data: settings } = useSettings();

  const [query, setQuery] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [adjust, setAdjust] = useState<AdjustTarget | null>(null);

  const globalThreshold = Number(settings?.low_stock_threshold ?? 5);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => r.products)
      .filter((r) => {
        if (!q) return true;
        const p = r.products!;
        return (
          p.name.toLowerCase().includes(q) ||
          (p.sku ?? "").toLowerCase().includes(q) ||
          (p.brand ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.products?.name ?? "").localeCompare(b.products?.name ?? ""));
  }, [rows, query]);

  const totalValue = useMemo(
    () =>
      rows.reduce(
        (sum, r) => sum + Number(r.stock_on_hand) * Number(r.products?.price ?? 0),
        0,
      ),
    [rows],
  );

  if (isLoading) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Loading warehouse…</p>;
  }
  if (!warehouse) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Warehouse not found.</p>;
  }

  return (
    <div className="space-y-6">
      <Link
        to="/warehouses"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Warehouses
      </Link>

      <PageHeader
        title={warehouse.name}
        description={warehouse.address ?? "No address on file"}
        actions={
          <>
            <Button variant="outline" className="h-11" onClick={() => setTransferOpen(true)}>
              <ArrowLeftRight /> Transfer
            </Button>
            <Button variant="outline" className="h-11" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="surface-card p-4">
          <p className="text-xs text-muted-foreground">Products stocked</p>
          <p className="numeric mt-1 text-2xl font-bold">
            {rows.filter((r) => Number(r.stock_on_hand) > 0).length}
          </p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs text-muted-foreground">Units on hand</p>
          <p className="numeric mt-1 text-2xl font-bold">
            {rows.reduce((s, r) => s + Number(r.stock_on_hand), 0)}
          </p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs text-muted-foreground">Stock value</p>
          <p className="numeric mt-1 text-2xl font-bold">{formatMoney(totalValue)}</p>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="border-b border-border p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 pl-9"
              placeholder="Search product, SKU or brand"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No stock rows"
            description="Nothing is stocked here yet — transfer stock in or adjust a product."
          />
        ) : (
          <>
            <table className="hidden w-full md:table">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Brand</th>
                  <th className="px-4 py-3 text-right">On hand</th>
                  <th className="px-4 py-3 text-right">Committed</th>
                  <th className="px-4 py-3 text-right">Available</th>
                  <th className="px-4 py-3 text-right">Value</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const p = r.products!;
                  const onHand = Number(r.stock_on_hand);
                  const committed = Number(r.committed_stock);
                  const threshold = Number(p.low_stock_threshold ?? globalThreshold);
                  const tone = stockTone(onHand, threshold);
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                    >
                      <td className="px-4 py-3">
                        <Link
                          to="/products/$productId"
                          params={{ productId: p.id }}
                          className="text-sm font-medium hover:underline"
                        >
                          {p.name}
                        </Link>
                        <div className="mt-1">
                          <StatusBadge tone={tone.tone}>{tone.label}</StatusBadge>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{p.sku ?? "—"}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{p.brand ?? "—"}</td>
                      <td className="numeric px-4 py-3 text-right text-sm font-semibold">
                        {onHand}
                      </td>
                      <td className="numeric px-4 py-3 text-right text-sm">{committed}</td>
                      <td className="numeric px-4 py-3 text-right text-sm font-semibold">
                        {onHand - committed}
                      </td>
                      <td className="numeric px-4 py-3 text-right text-sm">
                        {formatMoney(onHand * Number(p.price))}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setAdjust({
                              productId: p.id,
                              warehouseId: warehouse.id,
                              productName: p.name,
                              warehouseName: warehouse.name,
                              stockOnHand: onHand,
                            })
                          }
                        >
                          <SlidersHorizontal className="h-4 w-4" /> Adjust
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="grid gap-3 p-4 sm:grid-cols-2 md:hidden">
              {visible.map((r) => {
                const p = r.products!;
                const onHand = Number(r.stock_on_hand);
                const committed = Number(r.committed_stock);
                const threshold = Number(p.low_stock_threshold ?? globalThreshold);
                const tone = stockTone(onHand, threshold);
                return (
                  <div key={r.id} className="rounded-xl border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{p.name}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {p.sku ?? "No SKU"} · {p.brand ?? "No brand"}
                        </p>
                      </div>
                      <StatusBadge tone={tone.tone}>{tone.label}</StatusBadge>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="numeric text-base font-bold">{onHand}</p>
                        <p className="text-[11px] text-muted-foreground">On hand</p>
                      </div>
                      <div>
                        <p className="numeric text-base font-bold">{committed}</p>
                        <p className="text-[11px] text-muted-foreground">Committed</p>
                      </div>
                      <div>
                        <p className="numeric text-base font-bold">{onHand - committed}</p>
                        <p className="text-[11px] text-muted-foreground">Available</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="mt-3 h-11 w-full"
                      onClick={() =>
                        setAdjust({
                          productId: p.id,
                          warehouseId: warehouse.id,
                          productName: p.name,
                          warehouseName: warehouse.name,
                          stockOnHand: onHand,
                        })
                      }
                    >
                      <SlidersHorizontal /> Adjust stock
                    </Button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="surface-card overflow-hidden">
        <div className="border-b border-border p-4">
          <h2 className="text-sm font-semibold">Recent stock movements</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Last 50 entries at this location.</p>
        </div>
        {movements.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No movements recorded.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {movements.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.products?.name ?? "Product"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDateTime(m.created_at)}
                    {m.reason ? ` · ${m.reason}` : ""}
                    {m.related_bill_id && m.bills?.bill_number ? ` · ${m.bills.bill_number}` : ""}
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
                  {m.related_bill_id && (
                    <Link
                      to="/bills/$billId"
                      params={{ billId: m.related_bill_id }}
                      className="text-xs text-primary hover:underline"
                    >
                      View bill
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <WarehouseFormDialog open={editOpen} onOpenChange={setEditOpen} warehouse={warehouse} />
      <StockTransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        defaultFromWarehouseId={warehouse.id}
      />
      <StockAdjustDialog target={adjust} onOpenChange={(o) => !o && setAdjust(null)} />
    </div>
  );
}
