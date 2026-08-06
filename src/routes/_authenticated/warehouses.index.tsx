import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Warehouse as WarehouseIcon, Plus, Pencil, Trash2, ArrowLeftRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { WarehouseFormDialog } from "@/components/WarehouseFormDialog";
import { StockTransferDialog } from "@/components/StockTransferDialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAllProducts, useAllWarehouses, useProductStock, type Warehouse } from "@/lib/data";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/warehouses/")({
  head: () => ({
    meta: [
      { title: "Warehouses — Fragrance Billing" },
      {
        name: "description",
        content: "Manage store locations, per-warehouse stock levels and transfers.",
      },
      { property: "og:title", content: "Warehouses — Fragrance Billing" },
      {
        property: "og:description",
        content: "Manage store locations, per-warehouse stock levels and transfers.",
      },
    ],
  }),
  component: WarehousesPage,
});

function WarehousesPage() {
  const queryClient = useQueryClient();
  const { data: warehouses = [], isLoading } = useAllWarehouses();
  const { data: stockRows = [] } = useProductStock();
  const { data: products = [] } = useAllProducts();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const priceById = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of products) map[p.id] = Number(p.price);
    return map;
  }, [products]);

  const stats = useMemo(() => {
    const map: Record<string, { skus: number; value: number; hasStock: boolean }> = {};
    for (const row of stockRows) {
      const entry = (map[row.warehouse_id] ??= { skus: 0, value: 0, hasStock: false });
      const qty = Number(row.stock_on_hand);
      if (qty > 0) {
        entry.skus += 1;
        entry.hasStock = true;
      }
      entry.value += qty * (priceById[row.product_id] ?? 0);
    }
    return map;
  }, [stockRows, priceById]);

  const toggleActive = async (w: Warehouse, active: boolean) => {
    const { error } = await supabase
      .from("warehouses")
      .update({ is_active: active })
      .eq("id", w.id);
    if (error) { toast.error(error.message); return; }
    queryClient.invalidateQueries();
  };

  const remove = async (w: Warehouse) => {
    if (stats[w.id]?.hasStock) {
      toast.error("This warehouse still holds stock. Transfer it out before deleting.");
      return;
    }
    if (!confirm(`Delete ${w.name}? This cannot be undone.`)) return;
    const { error } = await supabase.from("warehouses").delete().eq("id", w.id);
    if (error) { toast.error(error.message); return; }
    queryClient.invalidateQueries();
    toast.success("Warehouse deleted");
  };

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Warehouses"
        description="Locations, stock value and transfers."
        actions={
          <>
            <Button variant="outline" className="h-11" onClick={() => setTransferOpen(true)}>
              <ArrowLeftRight /> Transfer
            </Button>
            <Button className="h-11" onClick={openNew}>
              <Plus /> New Warehouse
            </Button>
          </>
        }
      />

      <div className="surface-card overflow-hidden">
        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading warehouses…</p>
        ) : warehouses.length === 0 ? (
          <EmptyState
            icon={WarehouseIcon}
            title="No warehouses yet"
            description="Add your first location to start tracking stock per store."
          />
        ) : (
          <>
            <table className="hidden w-full md:table">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Warehouse</th>
                  <th className="px-4 py-3">Address</th>
                  <th className="px-4 py-3 text-right">Products</th>
                  <th className="px-4 py-3 text-right">Stock value</th>
                  <th className="px-4 py-3 text-center">Active</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {warehouses.map((w) => (
                  <tr
                    key={w.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to="/warehouses/$warehouseId"
                        params={{ warehouseId: w.id }}
                        className="flex items-center gap-2 text-sm font-medium hover:underline"
                      >
                        {w.name}
                        {w.is_default && <StatusBadge tone="accent">Default</StatusBadge>}
                      </Link>
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-sm text-muted-foreground">
                      {w.address ?? "—"}
                    </td>
                    <td className="numeric px-4 py-3 text-right text-sm">
                      {stats[w.id]?.skus ?? 0}
                    </td>
                    <td className="numeric px-4 py-3 text-right text-sm font-semibold">
                      {formatMoney(stats[w.id]?.value ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Switch
                        checked={w.is_active}
                        onCheckedChange={(v) => toggleActive(w, v)}
                        aria-label={`Toggle ${w.name}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit"
                          onClick={() => {
                            setEditing(w);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete"
                          onClick={() => remove(w)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="grid gap-3 p-4 sm:grid-cols-2 md:hidden">
              {warehouses.map((w) => (
                <div key={w.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      to="/warehouses/$warehouseId"
                      params={{ warehouseId: w.id }}
                      className="min-w-0"
                    >
                      <p className="truncate text-sm font-semibold">{w.name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {w.address ?? "No address"}
                      </p>
                    </Link>
                    {w.is_default && <StatusBadge tone="accent">Default</StatusBadge>}
                  </div>
                  <div className="mt-4 flex items-end justify-between">
                    <div>
                      <p className="numeric text-lg font-bold">
                        {formatMoney(stats[w.id]?.value ?? 0)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {stats[w.id]?.skus ?? 0} products stocked
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Switch
                        checked={w.is_active}
                        onCheckedChange={(v) => toggleActive(w, v)}
                        aria-label={`Toggle ${w.name}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Edit"
                        onClick={() => {
                          setEditing(w);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete"
                        onClick={() => remove(w)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <WarehouseFormDialog open={formOpen} onOpenChange={setFormOpen} warehouse={editing} />
      <StockTransferDialog open={transferOpen} onOpenChange={setTransferOpen} />
    </div>
  );
}
