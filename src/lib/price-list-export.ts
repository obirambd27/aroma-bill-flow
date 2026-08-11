import { downloadCSV, downloadXLSX } from "@/lib/export";
import { formatMoney } from "@/lib/format";

export type CatalogRow = { brand: string; name: string; sku: string | null; price: number };

export function downloadCatalogCSV(listName: string, rows: CatalogRow[]) {
  downloadCSV(
    listName.replace(/\s+/g, "-").toLowerCase(),
    ["Brand", "Product Name", "SKU", "Price"],
    rows.map((r) => [r.brand, r.name, r.sku ?? "", r.price]),
  );
}

export function downloadCatalogXLSX(listName: string, rows: CatalogRow[]) {
  downloadXLSX(
    listName.replace(/\s+/g, "-").toLowerCase(),
    "Price List",
    ["Brand", "Product Name", "SKU", "Price"],
    rows.map((r) => [r.brand, r.name, r.sku ?? "", r.price]),
  );
}

/** Client-facing catalog print view (grouped by brand, no stock figures). */
export function printCatalog(opts: {
  listName: string;
  clientName?: string | null | undefined;
  business: {
    name?: string | null | undefined;
    tagline?: string | null | undefined;
    phone?: string | null | undefined;
    logo?: string | null | undefined;
  };
  rows: CatalogRow[];
  note?: string | null | undefined;
}) {
  const esc = (v: string) =>
    v.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
  const groups = new Map<string, CatalogRow[]>();
  for (const r of opts.rows) {
    const key = r.brand || "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const sections = [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([brand, items]) => `<section>
  <h2>${esc(brand)}</h2>
  <table><thead><tr><th>Product</th><th>SKU</th><th class="num">Price</th></tr></thead><tbody>
  ${items
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      (i) =>
        `<tr><td>${esc(i.name)}</td><td class="sku">${esc(i.sku ?? "—")}</td><td class="num">${esc(formatMoney(i.price))}</td></tr>`,
    )
    .join("")}
  </tbody></table></section>`,
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.listName)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Inter,system-ui,sans-serif;color:#1a1024;margin:0;padding:28px;font-size:11px}
  header{display:flex;gap:16px;align-items:center;border-bottom:2px solid #7c3aed;padding-bottom:14px;margin-bottom:18px}
  header img{max-height:56px;max-width:150px;object-fit:contain}
  .biz strong{display:block;font-size:17px}
  .biz span{color:#6b6478}
  h1{font-size:16px;margin:0 0 2px}
  .meta{color:#6b6478;margin:0 0 18px}
  section{page-break-inside:auto;margin-bottom:18px}
  h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#7c3aed;margin:0 0 6px}
  table{width:100%;border-collapse:collapse}
  th,td{border-bottom:1px solid #ece7f5;padding:6px 8px;text-align:left}
  th{background:#f6f2fe;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
  td.sku{color:#6b6478}
  .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  tr{page-break-inside:avoid}
  footer{margin-top:20px;color:#6b6478;font-size:10px;border-top:1px solid #ece7f5;padding-top:10px}
  @page{size:A4 portrait;margin:12mm}
</style></head><body>
<header>
  ${opts.business.logo ? `<img src="${esc(opts.business.logo)}" alt="Logo" />` : ""}
  <div class="biz"><strong>${esc(opts.business.name ?? "")}</strong>
  <span>${esc(opts.business.tagline ?? "")}${opts.business.phone ? ` · ${esc(opts.business.phone)}` : ""}</span></div>
</header>
<h1>${esc(opts.listName)}</h1>
<p class="meta">${opts.clientName ? `Prepared for ${esc(opts.clientName)} · ` : ""}${esc(new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }))}</p>
${sections || "<p>No products in this list.</p>"}
${opts.note ? `<footer>${esc(opts.note)}</footer>` : ""}
<script>window.onload=function(){window.print();}<\/script>
</body></html>`;
  const w = window.open("", "_blank", "width=1000,height=800");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
