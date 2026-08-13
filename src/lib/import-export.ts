import * as XLSX from "xlsx";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { downloadCSV, downloadXLSX } from "@/lib/export";

/* ---------------- Sheet parsing ---------------- */

export type SheetRow = Record<string, string>;

export type ParsedSheet = {
  fileName: string;
  sheetName: string;
  headers: string[];
  rows: SheetRow[];
  /** Every physical row read from the sheet, including the header row and blanks. */
  rawRowCount: number;
  /** rawRowCount minus the header row. */
  dataRowCount: number;
  /** Rows that were entirely empty and therefore not counted as data. */
  blankRowsDropped: number;
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export async function parseWorkbook(file: File): Promise<ParsedSheet> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("The file has no sheets.");
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error("The first sheet could not be read.");
  // blankrows: true so nothing is silently truncated; we count blanks explicitly.
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: true,
    defval: "",
    raw: false,
  });
  if (matrix.length === 0) throw new Error("The sheet is empty.");
  const headerRow = (matrix[0] ?? []).map((c) => String(c ?? "").trim());
  const headers = headerRow.filter((h) => h.length > 0);
  if (headers.length === 0) throw new Error("No column headers found in the first row.");
  const rows: SheetRow[] = [];
  let blankRowsDropped = 0;
  matrix.slice(1).forEach((raw, i) => {
    const row: SheetRow = {};
    let hasValue = false;
    headerRow.forEach((h, c) => {
      if (!h) return;
      const value = String((raw as unknown[])[c] ?? "").trim();
      row[h] = value;
      if (value) hasValue = true;
    });
    if (hasValue) {
      row["__sheetRow"] = String(i + 2);
      rows.push(row);
    } else {
      blankRowsDropped += 1;
    }
  });
  return {
    fileName: file.name,
    sheetName,
    headers,
    rows,
    rawRowCount: matrix.length,
    dataRowCount: matrix.length - 1,
    blankRowsDropped,
  };
}


/** Find the first header whose normalised name matches one of the candidates. */
export function matchHeader(headers: string[], candidates: string[]): string | null {
  const wanted = candidates.map(norm);
  for (const w of wanted) {
    const exact = headers.find((h) => norm(h) === w);
    if (exact) return exact;
  }
  for (const w of wanted) {
    const loose = headers.find((h) => norm(h).includes(w));
    if (loose) return loose;
  }
  return null;
}

const num = (v: string | undefined) => {
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

const isActiveValue = (v: string | undefined) => {
  const s = (v ?? "").trim().toLowerCase();
  if (!s) return true;
  return !(s === "inactive" || s === "false" || s === "0" || s === "no" || s === "disabled");
};

/* ---------------- Shared types ---------------- */

export type FailedRow = { row: number; reason: string; data: string };

export type ImportSummary = {
  created: number;
  updated: number;
  skipped: number;
  failures: FailedRow[];
};

export function downloadFailureLog(prefix: string, failures: FailedRow[]) {
  downloadCSV(
    `${prefix}-import-errors`,
    ["Row", "Reason", "Row data"],
    failures.map((f) => [f.row, f.reason, f.data]),
  );
}

/* ---------------- Product import ---------------- */

export const PRODUCT_HEADERS = {
  name: ["Item Name", "Product Name", "Name"],
  sku: ["SKU", "Item SKU", "Code"],
  brand: ["Brand", "Manufacturer"],
  price: ["Rate", "Selling Price", "Price"],
  costPrice: ["Purchase Price", "Cost Price", "Purchase Rate", "Cost", "Buying Price"],
  stock: ["Stock On Hand", "Opening Stock", "Quantity", "Stock"],
  itemType: ["Item Type", "Product Type", "Type"],
  status: ["Status", "Is Active"],
};

export type ProductPreviewRow = {
  row: number;
  name: string;
  sku: string | null;
  brand: string | null;
  price: number | null;
  costPrice: number | null;
  stock: number | null;
  isActive: boolean | null;
  action: "create" | "update";
  existingId?: string;
};

export const SKIP_REASONS = [
  "Non-Inventory Item Type",
  "Missing SKU",
  "Missing Name",
  "Invalid Price",
  "Invalid Cost Price",
  "Invalid Stock Quantity",
  "Duplicate SKU within file",
] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export type SkippedRow = {
  row: number;
  name: string;
  sku: string;
  reason: SkipReason;
  /** For duplicates: all row numbers sharing this SKU. */
  collidesWith?: number[];
  data: string;
};

export type ProductPreview = {
  rows: ProductPreviewRow[];
  creates: number;
  updates: number;
  skipped: SkippedRow[];
  skipCounts: Record<SkipReason, number>;
  /** Legacy alias kept for the failure-log helper. */
  failures: FailedRow[];
  mapped: Record<string, string | null>;
  stats: {
    rawRowCount: number;
    dataRowCount: number;
    blankRowsDropped: number;
    consideredRows: number;
    sheetName: string;
  };
};

/** Strips currency symbols/formatting: "AED 65.00" → 65, "1,250.50" → 1250.5 */
export function parseAmount(raw: string | undefined): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return 0;
  const cleaned = s.replace(/[^\d.,\-]/g, "").replace(/,/g, "");
  if (!cleaned || !/\d/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const skuKey = (s: string) => s.trim().toLowerCase();

export async function buildProductPreview(sheet: ParsedSheet): Promise<ProductPreview> {
  const h = sheet.headers;
  const mapped = {
    name: matchHeader(h, PRODUCT_HEADERS.name),
    sku: matchHeader(h, PRODUCT_HEADERS.sku),
    brand: matchHeader(h, PRODUCT_HEADERS.brand),
    price: matchHeader(h, PRODUCT_HEADERS.price),
    costPrice: matchHeader(h, PRODUCT_HEADERS.costPrice),
    stock: matchHeader(h, PRODUCT_HEADERS.stock),
    itemType: matchHeader(h, PRODUCT_HEADERS.itemType),
    status: matchHeader(h, PRODUCT_HEADERS.status),
  };
  if (!mapped.name) throw new Error("Could not find an “Item Name” column in this file.");

  const existing = await fetchAll<{ id: string; sku: string | null; name: string }>((f, t) =>
    supabase.from("products").select("id, sku, name").range(f, t),
  );
  const error = null as { message: string } | null;
  if (error) throw error;
  const bySku = new Map<string, string>();
  for (const p of existing ?? []) if (p.sku && p.sku.trim()) bySku.set(skuKey(p.sku), p.id);

  const rowNumber = (r: SheetRow, i: number) => Number(r["__sheetRow"] ?? i + 2);

  // Pass 1 — find SKUs that appear more than once in the file (case-insensitive, trimmed).
  const skuRows = new Map<string, number[]>();
  sheet.rows.forEach((r, i) => {
    const sku = mapped.sku ? (r[mapped.sku] ?? "").trim() : "";
    if (!sku) return;
    const list = skuRows.get(skuKey(sku)) ?? [];
    list.push(rowNumber(r, i));
    skuRows.set(skuKey(sku), list);
  });

  const rows: ProductPreviewRow[] = [];
  const skipped: SkippedRow[] = [];
  const skipCounts = Object.fromEntries(SKIP_REASONS.map((r) => [r, 0])) as Record<
    SkipReason,
    number
  >;
  const usedSku = new Set<string>();

  const skip = (
    rowNo: number,
    name: string,
    sku: string,
    reason: SkipReason,
    dump: string,
    collidesWith?: number[],
  ) => {
    skipCounts[reason] += 1;
    skipped.push({
      row: rowNo,
      name,
      sku,
      reason,
      data: dump,
      ...(collidesWith ? { collidesWith } : {}),
    });
  };

  sheet.rows.forEach((r, i) => {
    const rowNo = rowNumber(r, i);
    const dump = Object.entries(r)
      .filter(([k, v]) => k !== "__sheetRow" && v)
      .map(([, v]) => v)
      .join(" | ")
      .slice(0, 200);
    const name = (r[mapped.name!] ?? "").trim();
    const sku = mapped.sku ? (r[mapped.sku] ?? "").trim() : "";

    const itemType = mapped.itemType ? (r[mapped.itemType] ?? "") : "Inventory";
    if (mapped.itemType && itemType.trim() && norm(itemType) !== "inventory") {
      skip(rowNo, name, sku, "Non-Inventory Item Type", dump);
      return;
    }
    if (!name) {
      skip(rowNo, name, sku, "Missing Name", dump);
      return;
    }
    if (!sku) {
      skip(rowNo, name, sku, "Missing SKU", dump);
      return;
    }
    let price: number | null = null;
    if (mapped.price) {
      price = parseAmount(r[mapped.price]);
      if (price === null || price < 0) {
        skip(rowNo, name, sku, "Invalid Price", dump);
        return;
      }
    }
    let costPrice: number | null = null;
    if (mapped.costPrice) {
      costPrice = parseAmount(r[mapped.costPrice]);
      if (costPrice === null || costPrice < 0) {
        skip(rowNo, name, sku, "Invalid Cost Price", dump);
        return;
      }
    }
    let stock: number | null = null;
    if (mapped.stock) {
      stock = parseAmount(r[mapped.stock]);
      if (stock === null) {
        skip(rowNo, name, sku, "Invalid Stock Quantity", dump);
        return;
      }
    }
    const key = skuKey(sku);
    const collisions = skuRows.get(key) ?? [];
    if (collisions.length > 1 && usedSku.has(key)) {
      skip(rowNo, name, sku, "Duplicate SKU within file", dump, collisions);
      return;
    }
    usedSku.add(key);
    const existingId = bySku.get(key);
    rows.push({
      row: rowNo,
      name,
      sku,
      brand: mapped.brand ? (r[mapped.brand] ?? "").trim() || null : null,
      price,
      costPrice,
      stock,
      isActive: mapped.status ? isActiveValue(r[mapped.status]) : null,
      action: existingId ? "update" : "create",
      ...(existingId ? { existingId } : {}),
    });
  });

  const creates = rows.filter((r) => r.action === "create").length;
  return {
    rows,
    creates,
    updates: rows.length - creates,
    skipped,
    skipCounts,
    failures: skipped.map((s) => ({ row: s.row, reason: s.reason, data: s.data })),
    mapped,
    stats: {
      rawRowCount: sheet.rawRowCount,
      dataRowCount: sheet.dataRowCount,
      blankRowsDropped: sheet.blankRowsDropped,
      consideredRows: sheet.rows.length,
      sheetName: sheet.sheetName,
    },
  };
}

export function downloadSkipReport(preview: ProductPreview) {
  downloadCSV(
    "product-import-skip-report",
    ["Row", "Item Name", "SKU", "Reason", "Collides with rows", "Row data"],
    preview.skipped.map((s) => [
      s.row,
      s.name,
      s.sku,
      s.reason,
      s.collidesWith?.join(", ") ?? "",
      s.data,
    ]),
  );
}


export async function commitProductImport(
  preview: ProductPreview,
  opts: { warehouseId: string; fileName: string },
): Promise<ImportSummary> {
  const created: string[] = [];
  let updated = 0;
  const { warehouseId, fileName } = opts;

  try {
    for (const row of preview.rows) {
      if (row.action === "update" && row.existingId) {
        // Only write back the columns that were actually present in the file.
        const patch: {
          name: string;
          brand?: string | null;
          price?: number;
          cost_price?: number;
          is_active?: boolean;
        } = { name: row.name };
        if (row.brand !== null) patch.brand = row.brand;
        if (row.price !== null) patch.price = row.price;
        if (row.costPrice !== null) patch.cost_price = row.costPrice;
        if (row.isActive !== null) patch.is_active = row.isActive;
        const { error } = await supabase
          .from("products")
          .update(patch)
          .eq("id", row.existingId);
        if (error) throw error;
        if (row.stock !== null) await addStock(row.existingId, warehouseId, row.stock);
        updated += 1;
      } else {
        const { data, error } = await supabase
          .from("products")
          .insert({
            name: row.name,
            sku: row.sku,
            brand: row.brand,
            price: row.price ?? 0,
            cost_price: row.costPrice,
            is_active: row.isActive ?? true,
            unit: "pcs",
          })
          .select("id")
          .single();
        if (error) throw error;
        created.push(data.id);
        await addStock(data.id, warehouseId, row.stock ?? 0);
      }
    }
  } catch (err) {
    // Roll back the whole batch: remove products created in this run.
    if (created.length) {
      await supabase.from("stock_movements").delete().in("product_id", created);
      await supabase.from("product_stock").delete().in("product_id", created);
      await supabase.from("products").delete().in("id", created);
    }
    throw new Error(
      `Import failed and was rolled back: ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }

  const summary: ImportSummary = {
    created: created.length,
    updated,
    skipped: preview.skipped.length,
    failures: preview.failures,
  };
  await logImport("Products", fileName, summary, warehouseId);
  return summary;
}

async function addStock(productId: string, warehouseId: string, quantity: number) {
  const { data: existing, error } = await supabase
    .from("product_stock")
    .select("id, stock_on_hand")
    .eq("product_id", productId)
    .eq("warehouse_id", warehouseId)
    .maybeSingle();
  if (error) throw error;

  if (existing) {
    const { error: upErr } = await supabase
      .from("product_stock")
      .update({ stock_on_hand: Number(existing.stock_on_hand) + quantity })
      .eq("id", existing.id);
    if (upErr) throw upErr;
  } else {
    const { error: insErr } = await supabase
      .from("product_stock")
      .insert({ product_id: productId, warehouse_id: warehouseId, stock_on_hand: quantity });
    if (insErr) throw insErr;
  }

  if (quantity !== 0) {
    const { error: mvErr } = await supabase.from("stock_movements").insert({
      product_id: productId,
      warehouse_id: warehouseId,
      movement_type: "Initial Stock",
      quantity_change: quantity,
      reason: "Excel import",
    });
    if (mvErr) throw mvErr;
  }
}

/* ---------------- Customer import ---------------- */

export const CUSTOMER_FIELDS = ["name", "phone", "email", "address", "status", "skip"] as const;
export type CustomerField = (typeof CUSTOMER_FIELDS)[number];

export const CUSTOMER_FIELD_LABELS: Record<CustomerField, string> = {
  name: "Name",
  phone: "Phone",
  email: "Email",
  address: "Address",
  status: "Status",
  skip: "Skip this column",
};

export function autoMapCustomerColumns(headers: string[]): Record<string, CustomerField> {
  const map: Record<string, CustomerField> = {};
  const name = matchHeader(headers, ["Display Name", "Contact Name", "Customer Name", "Name"]);
  const phone = matchHeader(headers, ["Phone", "Phone Number"]);
  const mobile = matchHeader(headers, ["Mobile", "MobilePhone"]);
  const email = matchHeader(headers, ["Email Address", "Email"]);
  const address = matchHeader(headers, [
    "Billing Address",
    "Billing Street",
    "Billing Street 2",
    "Address",
  ]);
  const status = matchHeader(headers, ["Status"]);
  for (const h of headers) map[h] = "skip";
  if (name) map[name] = "name";
  if (mobile) map[mobile] = "phone";
  if (phone) map[phone] = "phone";
  if (email) map[email] = "email";
  if (address) map[address] = "address";
  if (status) map[status] = "status";
  return map;
}

export type CustomerPreviewRow = {
  row: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
  action: "create" | "update";
  existingId?: string;
};

export type CustomerPreview = {
  rows: CustomerPreviewRow[];
  duplicates: number;
  failures: FailedRow[];
};

const digits = (s: string) => s.replace(/\D/g, "");

export async function buildCustomerPreview(
  sheet: ParsedSheet,
  mapping: Record<string, CustomerField>,
): Promise<CustomerPreview> {
  const columnsFor = (field: CustomerField) =>
    sheet.headers.filter((h) => mapping[h] === field);
  const nameCols = columnsFor("name");
  if (nameCols.length === 0) throw new Error("Map at least one column to “Name”.");

  const existing = await fetchAll<{ id: string; phone: string | null; email: string | null }>(
    (f, t) => supabase.from("customers").select("id, phone, email").range(f, t),
  );
  const byPhone = new Map<string, string>();
  const byEmail = new Map<string, string>();
  for (const c of existing ?? []) {
    if (c.phone && digits(c.phone)) byPhone.set(digits(c.phone), c.id);
    if (c.email) byEmail.set(c.email.trim().toLowerCase(), c.id);
  }

  const first = (r: SheetRow, field: CustomerField) => {
    for (const col of columnsFor(field)) {
      const v = (r[col] ?? "").trim();
      if (v) return v;
    }
    return "";
  };

  const rows: CustomerPreviewRow[] = [];
  const failures: FailedRow[] = [];
  let duplicates = 0;

  sheet.rows.forEach((r, i) => {
    const rowNo = i + 2;
    const dump = Object.values(r).filter(Boolean).join(" | ").slice(0, 200);
    const name = first(r, "name");
    if (!name) {
      failures.push({ row: rowNo, reason: "Missing customer name", data: dump });
      return;
    }
    const phone = first(r, "phone") || null;
    const email = first(r, "email") || null;
    const addressParts = columnsFor("address")
      .map((c) => (r[c] ?? "").trim())
      .filter(Boolean);
    const statusRaw = first(r, "status");
    const existingId =
      (phone && byPhone.get(digits(phone))) || (email && byEmail.get(email.toLowerCase())) || undefined;
    if (existingId) duplicates += 1;
    rows.push({
      row: rowNo,
      name,
      phone,
      email,
      address: addressParts.length ? addressParts.join(", ") : null,
      isActive: isActiveValue(statusRaw),
      action: existingId ? "update" : "create",
      ...(existingId ? { existingId } : {}),
    });
  });

  return { rows, duplicates, failures };
}

export async function commitCustomerImport(
  preview: CustomerPreview,
  opts: { fileName: string },
): Promise<ImportSummary> {
  const created: string[] = [];
  let updated = 0;

  try {
    for (const row of preview.rows) {
      const payload = {
        name: row.name,
        phone: row.phone,
        email: row.email,
        address: row.address,
        is_active: row.isActive,
      };
      if (row.action === "update" && row.existingId) {
        const { error } = await supabase.from("customers").update(payload).eq("id", row.existingId);
        if (error) throw error;
        updated += 1;
      } else {
        const { data, error } = await supabase
          .from("customers")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        created.push(data.id);
      }
    }
  } catch (err) {
    if (created.length) await supabase.from("customers").delete().in("id", created);
    throw new Error(
      `Import failed and was rolled back: ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }

  const summary: ImportSummary = {
    created: created.length,
    updated,
    skipped: preview.failures.length,
    failures: preview.failures,
  };
  await logImport("Customers", opts.fileName, summary, null);
  return summary;
}

/* ---------------- Import history ---------------- */

async function logImport(
  type: "Products" | "Customers",
  fileName: string,
  summary: ImportSummary,
  warehouseId: string | null,
) {
  await supabase.from("import_logs").insert({
    import_type: type,
    file_name: fileName.slice(0, 200),
    records_created: summary.created,
    records_updated: summary.updated,
    records_skipped: summary.skipped,
    warehouse_id: warehouseId,
  });
}

export function useImportLogs() {
  return useQuery({
    queryKey: ["import-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
}

/* ---------------- Exports ---------------- */

export async function exportProductsZoho() {
  const [{ data: products, error }, { data: stock, error: stockErr }] = await Promise.all([
    fetchAll<Record<string, unknown>>((f, t) =>
      supabase.from("products").select("id, name, sku, brand, price, is_active").order("name").range(f, t),
    ).then((data) => ({ data, error: null })),
    supabase.from("product_stock").select("product_id, stock_on_hand"),
  ]);
  if (error) throw error;
  if (stockErr) throw stockErr;
  const totals: Record<string, number> = {};
  for (const s of stock ?? [])
    totals[s.product_id] = (totals[s.product_id] ?? 0) + Number(s.stock_on_hand);
  downloadXLSX(
    "products-zoho-format",
    "Items",
    ["Item Name", "SKU", "Brand", "Rate", "Stock On Hand", "Item Type", "Status"],
    (products ?? []).map((p) => [
      p.name,
      p.sku ?? "",
      p.brand ?? "",
      Number(p.price),
      totals[p.id] ?? 0,
      "Inventory",
      p.is_active ? "Active" : "Inactive",
    ]),
  );
}

export async function exportProductsByWarehouse() {
  const [{ data: products, error }, { data: stock, error: stockErr }, { data: warehouses }] =
    await Promise.all([
      fetchAll<Record<string, unknown>>((f, t) =>
        supabase.from("products").select("id, name, sku").order("name").range(f, t),
      ).then((data) => ({ data, error: null })),
      supabase.from("product_stock").select("product_id, warehouse_id, stock_on_hand"),
      supabase.from("warehouses").select("id, name"),
    ]);
  if (error) throw error;
  if (stockErr) throw stockErr;
  const productById = new Map((products ?? []).map((p) => [p.id, p]));
  const warehouseById = new Map((warehouses ?? []).map((w) => [w.id, w.name]));
  const rows = (stock ?? [])
    .map((s) => {
      const p = productById.get(s.product_id);
      if (!p) return null;
      return [
        p.name,
        p.sku ?? "",
        warehouseById.get(s.warehouse_id) ?? "—",
        Number(s.stock_on_hand),
      ];
    })
    .filter(Boolean) as (string | number)[][];
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  downloadXLSX(
    "products-warehouse-breakdown",
    "Stock",
    ["Item Name", "SKU", "Warehouse", "Stock On Hand"],
    rows,
  );
}

export async function exportCustomers(mode: "zoho" | "full") {
  const data = await fetchAll<{
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    is_active: boolean;
    total_spend: number;
    last_purchase_at: string | null;
  }>((f, t) =>
    supabase
      .from("customers")
      .select("name, phone, email, address, is_active, total_spend, last_purchase_at")
      .order("name")
      .range(f, t),
  );
  const core = ["Display Name", "Phone", "Email", "Billing Address", "Status"];
  const headers = mode === "full" ? [...core, "Total Spend", "Last Purchase Date"] : core;
  const rows = (data ?? []).map((c) => {
    const base = [
      c.name,
      c.phone ?? "",
      c.email ?? "",
      c.address ?? "",
      c.is_active ? "Active" : "Inactive",
    ];
    return mode === "full"
      ? [...base, Number(c.total_spend ?? 0), c.last_purchase_at ? c.last_purchase_at.slice(0, 10) : ""]
      : base;
  });
  downloadXLSX(
    mode === "full" ? "customers-full-export" : "customers-zoho-format",
    "Contacts",
    headers,
    rows,
  );
}
