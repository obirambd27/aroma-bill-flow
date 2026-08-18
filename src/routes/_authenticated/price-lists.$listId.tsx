import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  Printer,
  ReceiptText,
  Save,
  Search,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InvoiceDocumentView } from "@/components/invoice-templates";
import { buildOrderReceiptDoc } from "@/lib/invoice-doc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import { useAllProducts, useSettings, useStockTotals } from "@/lib/data";
import {
  usePriceList,
  usePriceListItems,
  useSavePriceList,
  useToggleSharing,
  shareUrl,
} from "@/lib/price-lists";
import {
  downloadCatalogCSV,
  downloadCatalogXLSX,
  printCatalog,
  type CatalogRow,
} from "@/lib/price-list-export";

export const Route = createFileRoute("/_authenticated/price-lists/$listId")({
  head: () => ({
    meta: [
      { title: "Build Price List — Fragrance Billing" },
      {
        name: "description",
        content: "Select products, set custom prices and share the list with a client.",
      },
      { property: "og:title", content: "Build Price List — Fragrance Billing" },
      {
        property: "og:description",
        content: "Select products, set custom prices and share the list with a client.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PriceListBuilder,
});

const ALL_BRANDS = "__all__";

type ExportFormat = "pdf" | "csv" | "xlsx";
type StockOp = "any" | "in" | "out" | "gte" | "lte";


function PriceListBuilder() {
  const { listId } = Route.useParams();
  const { data: list, isLoading } = usePriceList(listId);
  const { data: items = [] } = usePriceListItems(listId);
  const { data: products = [] } = useAllProducts();
  const { data: stockTotals = {}, isLoading: stockLoading } = useStockTotals();
  const { data: settings } = useSettings();
  const save = useSavePriceList(listId);
  const toggleShare = useToggleSharing(listId);

  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [minQty, setMinQty] = useState("");
  const [increase, setIncrease] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState(ALL_BRANDS);
  const [stockOp, setStockOp] = useState<StockOp>("any");
  const [stockValue, setStockValue] = useState("");

  const [hydrated, setHydrated] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<{
    format: ExportFormat;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!list || hydrated) return;
    setName(list.name);
    setClientName(list.client_name ?? "");
    setMinQty(list.default_min_quantity == null ? "" : String(list.default_min_quantity));
    setIncrease(
      Number(list.below_min_increase_percent) === 0
        ? ""
        : String(list.below_min_increase_percent),
    );
    const sel: Record<string, boolean> = {};
    const pr: Record<string, string> = {};
    for (const it of items) {
      if (it.is_included) sel[it.product_id] = true;
      if (it.custom_price != null) pr[it.product_id] = String(it.custom_price);
    }
    setSelected(sel);
    setPrices(pr);
    setHydrated(true);
  }, [list, items, hydrated]);

  const brands = useMemo(
    () => [...new Set(products.map((p) => p.brand?.trim()).filter(Boolean) as string[])].sort(),
    [products],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const threshold = stockValue.trim() === "" ? null : Number(stockValue);
    return products.filter((p) => {
      if (brand !== ALL_BRANDS && (p.brand?.trim() || "") !== brand) return false;
      const stock = Number(stockTotals[p.id] ?? 0);
      if (stockOp === "in") {
        if (stock <= 0) return false;
      } else if (stockOp === "out") {
        if (stock > 0) return false;
      } else if (stockOp === "gte" && threshold != null) {
        if (stock < threshold) return false;
      } else if (stockOp === "lte" && threshold != null) {
        if (stock > threshold) return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, query, brand, stockOp, stockValue, stockTotals]);

  const selectAllVisible = (value: boolean) =>
    setSelected((prev) => {
      const next = { ...prev };
      for (const p of visible) next[p.id] = value;
      return next;
    });

  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected[p.id]);

  const selectedCount = Object.values(selected).filter(Boolean).length;


  const catalogRows: CatalogRow[] = useMemo(
    () =>
      products
        .filter((p) => selected[p.id])
        .map((p) => ({
          brand: p.brand?.trim() || "Other",
          name: p.name,
          sku: p.sku,
          price: prices[p.id] ? Number(prices[p.id]) : Number(p.price),
          stock: Number(stockTotals[p.id] ?? 0),
        })),
    [products, selected, prices, stockTotals],
  );

  const orderLines = useMemo(
    () =>
      products
        .filter((p) => selected[p.id] && Number(quantities[p.id] ?? 0) > 0)
        .map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          quantity: Number(quantities[p.id]),
          unitPrice: prices[p.id]?.trim() ? Number(prices[p.id]) : Number(p.price),
        })),
    [products, selected, quantities, prices],
  );

  const orderQty = orderLines.reduce((s, l) => s + l.quantity, 0);

  const exportDisabled = catalogRows.length === 0 || stockLoading;

  const runExport = async (format: ExportFormat) => {
    if (exportDisabled || !list) return;
    setExporting(true);
    setExportError(null);
    const listName = name || list.name;
    try {
      if (format === "csv") downloadCatalogCSV(listName, catalogRows);
      else if (format === "xlsx") downloadCatalogXLSX(listName, catalogRows);
      else
        await printCatalog({
          listName,
          business: {
            name: settings?.business_name,
            tagline: settings?.business_tagline,
            phone: settings?.business_phone,
            email: settings?.business_email,
            address: settings?.business_address,
            logo: settings?.business_logo_url,
          },
          rows: catalogRows,
          orderUrl:
            list.is_share_enabled && list.share_token ? shareUrl(list.share_token) : null,
          note: settings?.share_message_footer,
        });
    } catch (e) {
      const err = e as Error;
      console.error("[price-list-export] failed", {
        listId,
        listName,
        format,
        message: err.message,
      });
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      const message = offline
        ? "Export failed — check your connection and try again."
        : format === "pdf"
          ? "Couldn't generate the PDF — please try again. If this continues, check that your logo image in Settings is valid."
          : "Export failed — please try again.";
      setExportError({ format, message });
      toast.error(message);
    } finally {
      setExporting(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      await save.mutateAsync({
        name: name.trim(),
        clientName: clientName.trim() || null,
        minQuantity: minQty.trim() ? Number(minQty) : null,
        increasePercent: increase.trim() ? Number(increase) : 0,
        selections: products
          .filter((p) => selected[p.id])
          .map((p) => ({
            productId: p.id,
            customPrice: prices[p.id]?.trim() ? Number(prices[p.id]) : null,
          })),
      });
      toast.success("Price list saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (isLoading) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Loading price list…</p>;
  }
  if (!list) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Price list not found.</p>;
  }

  const link = shareUrl(list.share_token);

  return (
    <div className="space-y-6">
      <PageHeader
        title={name || list.name}
        description={`${selectedCount} products selected`}
        actions={
          <>
            <Button variant="outline" className="h-11" asChild>
              <Link to="/price-lists">
                <ArrowLeft />
                Back
              </Link>
            </Button>
            <Button className="h-11" onClick={handleSave} disabled={save.isPending}>
              <Save />
              Save
            </Button>
          </>
        }
      />

      <div className="surface-card space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input className="h-11" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Client name (optional)</Label>
            <Input
              className="h-11"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border p-4">
          <p className="text-sm font-semibold text-foreground">Global settings</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Minimum Order Quantity (total pieces)</Label>
              <Input
                className="h-11"
                type="number"
                min="0"
                value={minQty}
                onChange={(e) => setMinQty(e.target.value)}
                placeholder="No minimum"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Price Increase Below Minimum (%)</Label>
              <Input
                className="h-11"
                type="number"
                min="0"
                value={increase}
                onChange={(e) => setIncrease(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            If a customer's combined order across all products is below this quantity, this
            percentage increase applies to their entire order.
          </p>
        </div>
      </div>

      {/* Product selection */}
      <div className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 pl-9"
              placeholder="Search by product name or SKU"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select value={brand} onValueChange={setBrand}>
            <SelectTrigger className="h-11 w-[190px]">
              <SelectValue placeholder="All brands" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_BRANDS}>All brands</SelectItem>
              {brands.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={stockOp} onValueChange={(v) => setStockOp(v as StockOp)}>
            <SelectTrigger className="h-11 w-[180px]">
              <SelectValue placeholder="Stock filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any stock</SelectItem>
              <SelectItem value="in">In stock only</SelectItem>
              <SelectItem value="out">Out of stock</SelectItem>
              <SelectItem value="gte">Stock ≥ quantity</SelectItem>
              <SelectItem value="lte">Stock ≤ quantity</SelectItem>
            </SelectContent>
          </Select>
          {(stockOp === "gte" || stockOp === "lte") && (
            <Input
              type="number"
              min="0"
              className="h-11 w-28"
              placeholder="Qty"
              value={stockValue}
              onChange={(e) => setStockValue(e.target.value)}
            />
          )}
          <Button
            variant="outline"
            className="h-11"
            disabled={visible.length === 0}
            onClick={() => selectAllVisible(!allVisibleSelected)}
          >
            {allVisibleSelected ? "Deselect all" : `Select all (${visible.length})`}
          </Button>
          {selectedCount > 0 && (
            <Button variant="ghost" className="h-11" onClick={() => setSelected({})}>
              Clear selection
            </Button>
          )}
        </div>


        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-10 p-3" />
                <th className="p-3 text-left">Brand</th>
                <th className="p-3 text-left">Product</th>
                <th className="p-3 text-left">SKU</th>
                <th className="p-3 text-right">Stock</th>
                <th className="p-3 text-right">Default price</th>
                <th className="p-3 text-right">Custom price</th>
                <th className="p-3 text-right">Order qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((p) => {
                const custom = prices[p.id]?.trim();
                const isCustom = Boolean(custom) && Number(custom) !== Number(p.price);
                return (
                  <tr key={p.id} className={selected[p.id] ? "bg-accent/30" : undefined}>
                    <td className="p-3">
                      <Checkbox
                        checked={Boolean(selected[p.id])}
                        onCheckedChange={(v) =>
                          setSelected((prev) => ({ ...prev, [p.id]: Boolean(v) }))
                        }
                      />
                    </td>
                    <td className="p-3 text-muted-foreground">{p.brand ?? "—"}</td>
                    <td className="p-3">
                      <span className="font-medium text-foreground">{p.name}</span>
                      {isCustom && (
                        <Badge variant="secondary" className="ml-2">
                          Custom
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">{p.sku ?? "—"}</td>
                    <td className="p-3 text-right tabular-nums">{stockTotals[p.id] ?? 0}</td>
                    <td className="p-3 text-right tabular-nums">{formatMoney(p.price)}</td>
                    <td className="p-3 text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        className="ml-auto h-10 w-28 text-right"
                        placeholder="Default"
                        value={prices[p.id] ?? ""}
                        onChange={(e) =>
                          setPrices((prev) => ({ ...prev, [p.id]: e.target.value }))
                        }
                      />
                    </td>
                    <td className="p-3 text-right">
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        className="ml-auto h-10 w-24 text-right"
                        placeholder="0"
                        disabled={!selected[p.id]}
                        value={quantities[p.id] ?? ""}
                        onChange={(e) =>
                          setQuantities((prev) => ({ ...prev, [p.id]: e.target.value }))
                        }
                      />
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    No products match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Share & export */}
      <div className="surface-card space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Share & export</p>
            <p className="text-xs text-muted-foreground">
              Share a public ordering link or send the catalog as a file.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="share-toggle" className="text-sm">
              Enable sharing
            </Label>
            <Switch
              id="share-toggle"
              checked={list.is_share_enabled}
              onCheckedChange={(v) =>
                toggleShare
                  .mutateAsync({ enabled: v, token: list.share_token })
                  .then(() => toast.success(v ? "Sharing enabled" : "Sharing disabled"))
                  .catch((e: Error) => toast.error(e.message))
              }
            />
          </div>
        </div>

        {list.is_share_enabled && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3">
            <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{link}</code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(link);
                toast.success("Link copied");
              }}
            >
              Copy Link
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                window.open(
                  `https://wa.me/?text=${encodeURIComponent(
                    `Hi! Here's our latest price list — you can place your order directly here: ${link}`,
                  )}`,
                  "_blank",
                )
              }
            >
              <Share2 className="h-4 w-4" />
              Share via WhatsApp
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={exportDisabled || exporting}
            onClick={() => runExport("pdf")}
          >
            <Printer className="h-4 w-4" />
            {exporting ? "Preparing export…" : "Download PDF"}
          </Button>
          <Button
            variant="outline"
            disabled={exportDisabled || exporting}
            onClick={() => runExport("csv")}
          >
            <Download className="h-4 w-4" />
            Download CSV
          </Button>
          <Button
            variant="outline"
            disabled={exportDisabled || exporting}
            onClick={() => runExport("xlsx")}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Download XLSX
          </Button>
          <Button disabled={orderLines.length === 0} onClick={() => setReceiptOpen(true)}>
            <ReceiptText className="h-4 w-4" />
            Order Receipt ({orderQty} pcs)
          </Button>
        </div>
        {catalogRows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Add at least one product to this list before exporting
          </p>
        ) : stockLoading ? (
          <p className="text-xs text-muted-foreground">Preparing export — loading stock levels…</p>
        ) : null}
        {exportError && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
            <p className="text-xs text-destructive">{exportError.message}</p>
            <Button size="sm" variant="outline" onClick={() => runExport(exportError.format)}>
              Retry
            </Button>
          </div>
        )}
      </div>

      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          <DialogHeader className="no-print">
            <DialogTitle>Order Receipt</DialogTitle>
          </DialogHeader>
          <div className="no-print flex justify-end">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
          </div>
          <InvoiceDocumentView
            doc={buildOrderReceiptDoc({
              listName: name || list.name,
              clientName: clientName || null,
              settings: settings ?? null,
              lines: orderLines,
              minQuantity: minQty.trim() ? Number(minQty) : null,
              increasePercent: increase.trim() ? Number(increase) : 0,
            })}
            templateId={settings?.active_invoice_template}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
