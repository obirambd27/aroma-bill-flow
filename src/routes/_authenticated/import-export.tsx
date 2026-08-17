import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAllWarehouses } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";
import {
  autoMapCustomerColumns,
  buildCustomerPreview,
  buildProductPreview,
  commitCustomerImport,
  commitProductImport,
  downloadFailureLog,
  downloadSkipReport,

  exportCustomers,
  exportProductsByWarehouse,
  exportProductsZoho,
  parseWorkbook,
  useImportLogs,
  CUSTOMER_FIELDS,
  CUSTOMER_FIELD_LABELS,
  type CustomerField,
  type CustomerPreview,
  type ImportSummary,
  type ParsedSheet,
  type ProductPreview,
} from "@/lib/import-export";

export const Route = createFileRoute("/_authenticated/import-export")({
  head: () => ({
    meta: [
      { title: "Data Import & Export — Fragrance Billing" },
      {
        name: "description",
        content: "Bulk-load products and customers from Excel, or export them for backup.",
      },
      { property: "og:title", content: "Data Import & Export — Fragrance Billing" },
      {
        property: "og:description",
        content: "Bulk-load products and customers from Excel, or export them for backup.",
      },
    ],
  }),
  component: ImportExportPage,
});

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-card">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

function SummaryCard({
  summary,
  prefix,
  onReset,
}: {
  summary: ImportSummary;
  prefix: string;
  onReset: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-sm font-semibold">Import complete</p>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {(
          [
            ["Created", summary.created],
            ["Updated", summary.updated],
            ["Skipped", summary.skipped],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-md border border-border bg-background px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="numeric text-lg font-bold">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {summary.failures.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadFailureLog(prefix, summary.failures)}
          >
            <Download />
            Download failure log ({summary.failures.length})
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onReset}>
          Import another file
        </Button>
      </div>
    </div>
  );
}

function FilePicker({
  label,
  onFile,
  busy,
}: {
  label: string;
  onFile: (file: File) => void;
  busy: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border p-6 text-center sm:items-center">
      <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        Choose an .xlsx file exported from your previous system.
      </p>
      <input
        ref={ref}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <Button onClick={() => ref.current?.click()} disabled={busy}>
        <Upload />
        {busy ? "Reading file…" : label}
      </Button>
    </div>
  );
}

/* ---------------- Products ---------------- */

function ImportBreakdown({ preview }: { preview: ProductPreview }) {
  const [open, setOpen] = useState<string | null>(null);
  const { stats, skipCounts, skipped } = preview;
  const categories = (Object.keys(skipCounts) as (keyof typeof skipCounts)[]).filter(
    (k) => skipCounts[k] > 0,
  );

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-sm">
        <span className="font-semibold numeric">{stats.consideredRows}</span> rows read from file →{" "}
        <span className="font-semibold numeric">{preview.rows.length}</span> will import (
        {preview.creates} create, {preview.updates} update) →{" "}
        <span className="font-semibold numeric">{skipped.length}</span> skipped
      </p>
      <p className="text-xs text-muted-foreground">
        Sheet “{stats.sheetName}” · {stats.rawRowCount} physical rows read ({stats.dataRowCount}{" "}
        after the header row) · {stats.blankRowsDropped} blank rows ignored
      </p>

      {categories.length > 0 && (
        <ul className="space-y-1.5">
          {categories.map((reason) => {
            const rows = skipped.filter((s) => s.reason === reason);
            const isOpen = open === reason;
            return (
              <li key={reason} className="rounded-md border border-border bg-background">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
                  onClick={() => setOpen(isOpen ? null : reason)}
                >
                  <span>
                    <span className="numeric font-semibold">{skipCounts[reason]}</span> {reason}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {isOpen ? "Hide rows" : "Show rows"}
                  </span>
                </button>
                {isOpen && (
                  <div className="max-h-56 overflow-auto border-t border-border">
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-border">
                        {rows.map((s, i) => (
                          <tr key={`${s.row}-${i}`}>
                            <td className="numeric w-16 px-3 py-1.5 text-muted-foreground">
                              Row {s.row}
                            </td>
                            <td className="px-3 py-1.5">{s.name || "—"}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{s.sku || "—"}</td>
                            <td className="px-3 py-1.5 text-right text-muted-foreground">
                              {s.collidesWith ? `Rows ${s.collidesWith.join(", ")}` : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}



function ProductImport() {
  const queryClient = useQueryClient();
  const { data: warehouses = [] } = useAllWarehouses();
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [preview, setPreview] = useState<ProductPreview | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [stockMode, setStockMode] = useState<StockImportMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [lastPreview, setLastPreview] = useState<ProductPreview | null>(null);

  const matchedIds = (preview?.rows ?? [])
    .filter((r) => r.action === "update" && r.existingId && r.stock !== null)
    .map((r) => r.existingId!);

  const { data: currentStock } = useQuery({
    queryKey: ["import-current-stock", warehouseId, matchedIds.length, sheet?.fileName],
    queryFn: () => fetchWarehouseStockMap(warehouseId, matchedIds),
    enabled: Boolean(warehouseId && matchedIds.length),
  });

  const impact =
    preview && currentStock
      ? summarizeStockImpact(preview, currentStock, stockMode ?? "add")
      : null;

  const reset = () => {
    setSheet(null);
    setPreview(null);
    setSummary(null);
    setLastPreview(null);
    setStockMode(null);
  };

  const onFile = async (file: File) => {
    setBusy(true);
    try {
      const parsed = await parseWorkbook(file);
      const built = await buildProductPreview(parsed);
      setSheet(parsed);
      setPreview(built);
      setStockMode(null);
      setSummary(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that file");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!preview || !sheet || !warehouseId || !stockMode) return;
    setBusy(true);
    try {
      const result = await commitProductImport(preview, {
        warehouseId,
        fileName: sheet.fileName,
        stockMode,
      });
      setSummary(result);
      setLastPreview(preview);
      setPreview(null);
      queryClient.invalidateQueries();
      toast.success(`${result.created} created · ${result.updated} updated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  if (summary)
    return (
      <div className="space-y-3">
        <SummaryCard summary={summary} prefix="products" onReset={reset} />
        {lastPreview && lastPreview.skipped.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => downloadSkipReport(lastPreview)}>
            <Download />
            Download Skip Report (CSV) — {lastPreview.skipped.length} rows
          </Button>
        )}
      </div>
    );

  if (!preview) return <FilePicker label="Import Products" onFile={onFile} busy={busy} />;

  return (
    <div className="space-y-4">
      <ImportBreakdown preview={preview} />


      <div className="space-y-2 sm:max-w-sm">
        <Label>Assign imported stock to warehouse</Label>
        <Select value={warehouseId} onValueChange={setWarehouseId}>
          <SelectTrigger className="h-11">
            <SelectValue placeholder="Select a warehouse" />
          </SelectTrigger>
          <SelectContent>
            {warehouses.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          All imported stock lands here; redistribute later with a Stock Transfer.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <div>
          <p className="text-sm font-semibold">
            How should imported stock quantities be applied to products that already exist?
          </p>
          <p className="text-xs text-muted-foreground">
            Required — pick one before importing. Applies only to matched SKUs in the selected
            warehouse. New products always start at their imported quantity.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              {
                value: "add" as const,
                title: "Add to existing stock",
                desc: "For new shipments/restocks — imported quantity is added on top of current stock.",
              },
              {
                value: "replace" as const,
                title: "Replace existing stock",
                desc: "For a fresh physical count — imported quantity becomes the new stock figure.",
              },
            ]
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStockMode(opt.value)}
              className={`rounded-lg border p-3 text-left transition ${
                stockMode === opt.value
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <span
                  className={`flex size-4 items-center justify-center rounded-full border ${
                    stockMode === opt.value ? "border-primary" : "border-muted-foreground/50"
                  }`}
                >
                  {stockMode === opt.value && (
                    <span className="size-2 rounded-full bg-primary" />
                  )}
                </span>
                {opt.title}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">{opt.desc}</span>
            </button>
          ))}
        </div>

        {stockMode && (
          <div className="rounded-md bg-muted/40 p-3 text-sm">
            <p className="font-medium">
              Mode: {stockMode === "replace" ? "Replace existing stock" : "Add to existing stock"}
            </p>
            {!warehouseId ? (
              <p className="text-xs text-muted-foreground">
                Select a warehouse to see how existing stock will change.
              </p>
            ) : impact ? (
              <p className="text-xs text-muted-foreground">
                <span className="numeric font-semibold text-foreground">{impact.matched}</span>{" "}
                products matched —{" "}
                {stockMode === "replace"
                  ? "stock will be corrected based on your file's counts: "
                  : "stock will be added on top of current stock: "}
                <span className="numeric">{impact.increased}</span> increased,{" "}
                <span className="numeric">{impact.decreased}</span> decreased,{" "}
                <span className="numeric">{impact.unchanged}</span> unchanged
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Calculating stock impact…</p>
            )}
          </div>
        )}
      </div>


      <div className="max-h-80 overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Action</th>
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2 text-left">SKU</th>
              <th className="px-3 py-2 text-right">Cost</th>
              <th className="px-3 py-2 text-right">Rate</th>
              <th className="px-3 py-2 text-right">Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {preview.rows.slice(0, 200).map((r) => (
              <tr key={r.row}>
                <td className="px-3 py-2">
                  <span
                    className={
                      r.action === "create"
                        ? "rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                        : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                    }
                  >
                    {r.action === "create" ? "Create" : "Update"}
                  </span>
                </td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.sku ?? "—"}</td>
                <td className="numeric px-3 py-2 text-right">
                  {r.costPrice != null ? formatMoney(r.costPrice) : "—"}
                </td>
                <td className="numeric px-3 py-2 text-right">
                  {r.price != null ? formatMoney(r.price) : "—"}
                </td>
                <td className="numeric px-3 py-2 text-right">{r.stock ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {preview.rows.length > 200 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            Showing the first 200 of {preview.rows.length} rows.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={confirm} disabled={busy || !warehouseId || preview.rows.length === 0}>
          {busy
            ? "Importing…"
            : `Confirm Import (${preview.creates} new, ${preview.updates} updates)`}
        </Button>
        {preview.skipped.length > 0 && (
          <Button variant="outline" onClick={() => downloadSkipReport(preview)}>
            <Download />
            Download Skip Report (CSV)
          </Button>
        )}
        <Button variant="ghost" onClick={reset}>
          Cancel
        </Button>
      </div>

    </div>
  );
}

/* ---------------- Customers ---------------- */

function CustomerImport() {
  const queryClient = useQueryClient();
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<Record<string, CustomerField>>({});
  const [preview, setPreview] = useState<CustomerPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const reset = () => {
    setSheet(null);
    setPreview(null);
    setSummary(null);
    setMapping({});
  };

  const onFile = async (file: File) => {
    setBusy(true);
    try {
      const parsed = await parseWorkbook(file);
      const auto = autoMapCustomerColumns(parsed.headers);
      setSheet(parsed);
      setMapping(auto);
      setSummary(null);
      setPreview(await buildCustomerPreview(parsed, auto));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that file");
    } finally {
      setBusy(false);
    }
  };

  const remap = async (header: string, field: CustomerField) => {
    if (!sheet) return;
    const next = { ...mapping, [header]: field };
    setMapping(next);
    try {
      setPreview(await buildCustomerPreview(sheet, next));
    } catch (err) {
      setPreview(null);
      toast.error(err instanceof Error ? err.message : "Mapping is incomplete");
    }
  };

  const confirm = async () => {
    if (!preview || !sheet) return;
    setBusy(true);
    try {
      const result = await commitCustomerImport(preview, { fileName: sheet.fileName });
      setSummary(result);
      setPreview(null);
      setSheet(null);
      queryClient.invalidateQueries();
      toast.success(`${result.created} created · ${result.updated} updated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  if (summary) return <SummaryCard summary={summary} prefix="customers" onReset={reset} />;

  if (!sheet) return <FilePicker label="Import Customers" onFile={onFile} busy={busy} />;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-semibold">Column mapping</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {sheet.headers.map((h) => (
            <div key={h} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{h}</span>
              <Select
                value={mapping[h] ?? "skip"}
                onValueChange={(v) => remap(h, v as CustomerField)}
              >
                <SelectTrigger className="h-10 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOMER_FIELDS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {CUSTOMER_FIELD_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>

      {preview && (
        <>
          <p className="text-sm">
            <span className="font-semibold">{preview.rows.length}</span> customers found,{" "}
            <span className="font-semibold">{preview.duplicates}</span> duplicates detected by phone
            number
            {preview.failures.length > 0 && (
              <>
                , <span className="font-semibold">{preview.failures.length}</span> invalid rows
              </>
            )}
            .
          </p>

          <div className="max-h-80 overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Action</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Phone</th>
                  <th className="px-3 py-2 text-left">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.rows.slice(0, 200).map((r) => (
                  <tr key={r.row}>
                    <td className="px-3 py-2">
                      <span
                        className={
                          r.action === "create"
                            ? "rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                            : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                        }
                      >
                        {r.action === "create" ? "Create" : "Update"}
                      </span>
                    </td>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.phone ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.email ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={confirm} disabled={busy || preview.rows.length === 0}>
              {busy ? "Importing…" : "Confirm Import"}
            </Button>
            {preview.failures.length > 0 && (
              <Button
                variant="outline"
                onClick={() => downloadFailureLog("customers", preview.failures)}
              >
                <Download />
                Invalid rows
              </Button>
            )}
            <Button variant="ghost" onClick={reset}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Page ---------------- */

function ImportExportPage() {
  const { data: logs = [] } = useImportLogs();
  const [exporting, setExporting] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setExporting(key);
    try {
      await fn();
      toast.success("Export ready");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(null);
    }
  };

  const totals = useMemo(
    () => ({
      created: logs.reduce((s, l) => s + l.records_created, 0),
      updated: logs.reduce((s, l) => s + l.records_updated, 0),
    }),
    [logs],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Import & Export"
        description="This app works fully offline from any external service. Use this only as a manual backup or bulk-load tool — not required for normal use."
      />

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-4 space-y-6">
          <Section
            title="Import products"
            description="Reads Item Name, SKU, Brand, Rate, Purchase/Cost Price, Stock On Hand, Item Type and Status. Only Inventory items are imported. For existing SKUs only the columns present in your file are updated — so a file with just SKU + Purchase Price updates cost prices alone."
          >
            <ProductImport />
          </Section>
          <Section title="Export products">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={exporting !== null}
                onClick={() => run("p1", exportProductsZoho)}
              >
                <Download />
                Export Products (standard format)
              </Button>
              <Button
                variant="outline"
                disabled={exporting !== null}
                onClick={() => run("p2", exportProductsByWarehouse)}
              >
                <Download />
                Export with Warehouse Breakdown
              </Button>
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="customers" className="mt-4 space-y-6">
          <Section
            title="Import customers"
            description="Headers are matched automatically; adjust the mapping below if your file uses different names."
          >
            <CustomerImport />
          </Section>
          <Section title="Export customers">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={exporting !== null}
                onClick={() => run("c1", () => exportCustomers("zoho"))}
              >
                <Download />
                Compatible format (core columns)
              </Button>
              <Button
                variant="outline"
                disabled={exporting !== null}
                onClick={() => run("c2", () => exportCustomers("full"))}
              >
                <Download />
                Full export (with spend history)
              </Button>
            </div>
          </Section>
        </TabsContent>
      </Tabs>

      <Section
        title="Import history"
        description={
          logs.length
            ? `${totals.created} records created and ${totals.updated} updated across ${logs.length} imports.`
            : undefined
        }
      >
        {logs.length === 0 ? (
          <EmptyState
            icon={FileSpreadsheet}
            title="No imports yet"
            description="Every bulk import you run will be logged here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">File</th>
                  <th className="px-3 py-2 text-right">Created</th>
                  <th className="px-3 py-2 text-right">Updated</th>
                  <th className="px-3 py-2 text-right">Skipped</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap px-3 py-2">
                      {formatDate(l.created_at.slice(0, 10))}
                    </td>
                    <td className="px-3 py-2">{l.import_type}</td>
                    <td className="max-w-[220px] truncate px-3 py-2 text-muted-foreground">
                      {l.file_name}
                    </td>
                    <td className="numeric px-3 py-2 text-right">{l.records_created}</td>
                    <td className="numeric px-3 py-2 text-right">{l.records_updated}</td>
                    <td className="numeric px-3 py-2 text-right">{l.records_skipped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
