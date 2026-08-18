import QRCode from "qrcode";
import { downloadCSV, downloadXLSX } from "@/lib/export";
import { formatMoney } from "@/lib/format";

export type CatalogRow = {
  brand: string;
  name: string;
  sku: string | null;
  price: number;
  stock: number;
};

const HEADERS = ["Brand", "Product Name", "SKU", "Price", "Stock"];
const toCells = (rows: CatalogRow[]) =>
  rows.map((r) => [r.brand, r.name, r.sku ?? "", r.price, r.stock]);

const slug = (s: string) => s.replace(/\s+/g, "-").toLowerCase();

export function downloadCatalogCSV(listName: string, rows: CatalogRow[]) {
  downloadCSV(slug(listName), HEADERS, toCells(rows));
}

export function downloadCatalogXLSX(listName: string, rows: CatalogRow[]) {
  downloadXLSX(slug(listName), "Price List", HEADERS, toCells(rows));
}

export type CatalogBusiness = {
  name?: string | null | undefined;
  tagline?: string | null | undefined;
  phone?: string | null | undefined;
  email?: string | null | undefined;
  website?: string | null | undefined;
  address?: string | null | undefined;
  logo?: string | null | undefined;
};

const esc = (v: string) =>
  v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/**
 * Professional A4 catalog print view (grouped by brand).
 * Shows name / SKU / stock / price only — never cost price or client name.
 * Throws on failure so callers can surface a toast.
 */
export async function printCatalog(opts: {
  listName: string;
  business: CatalogBusiness;
  rows: CatalogRow[];
  /** Public order link — QR is rendered only when provided. */
  orderUrl?: string | null | undefined;
  note?: string | null | undefined;
}): Promise<void> {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  let qrDataUrl = "";
  if (opts.orderUrl) {
    qrDataUrl = await QRCode.toDataURL(opts.orderUrl, {
      margin: 0,
      width: 320,
      errorCorrectionLevel: "M",
      color: { dark: "#1a1024", light: "#ffffff" },
    });
  }

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
  <table><thead><tr><th>Product</th><th>SKU</th><th class="num">Stock</th><th class="num">Price</th></tr></thead><tbody>
  ${items
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      (i) =>
        `<tr><td>${esc(i.name)}</td><td class="sku">${esc(i.sku ?? "—")}</td><td class="num">${i.stock}</td><td class="num price">${esc(formatMoney(i.price))}</td></tr>`,
    )
    .join("")}
  </tbody></table></section>`,
    )
    .join("");

  const b = opts.business;
  const contact = [b.phone, b.email, b.website].filter(Boolean).map((v) => esc(String(v)));

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.listName)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Inter,system-ui,sans-serif;color:#1a1024;margin:0;font-size:10.5px;
       padding:104px 0 62px}
  .runner{position:fixed;left:0;right:0;background:#fff}
  .page-head{top:0;padding-bottom:8px;border-bottom:2px solid #7c3aed}
  .page-foot{bottom:0;padding-top:6px;border-top:1px solid #ece7f5;display:flex;
             align-items:center;justify-content:space-between;gap:12px;color:#6b6478;font-size:9px}
  .brand-row{display:flex;gap:14px;align-items:center;justify-content:space-between}
  .idm{display:flex;gap:12px;align-items:center;min-width:0}
  .idm img{max-height:52px;max-width:132px;object-fit:contain}
  .biz strong{display:block;font-size:15px;line-height:1.2}
  .biz span{display:block;color:#6b6478;font-size:8.5px;text-transform:uppercase;letter-spacing:.14em;margin-top:2px}
  .contact{text-align:right;color:#4b445c;font-size:9px;line-height:1.5;white-space:nowrap}
  .title{margin-top:10px}
  .title h1{font-size:14px;margin:0;letter-spacing:.02em}
  .title p{margin:1px 0 0;color:#6b6478;font-size:9px}
  .page-foot .center{text-align:center;flex:1}
  .page-foot .addr{max-width:34%;white-space:pre-line}
  .foot-qr{height:34px;width:34px}
  .pnum:after{content:counter(page) " of " counter(pages)}
  section{margin:0 0 16px;page-break-inside:auto}
  h2{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#7c3aed;margin:0 0 5px;
     padding-bottom:3px;border-bottom:1px solid #d9c9fb;page-break-after:avoid}
  table{width:100%;border-collapse:collapse}
  th,td{padding:4.5px 8px;text-align:left}
  th{background:#f6f2fe;font-size:8.5px;text-transform:uppercase;letter-spacing:.05em;color:#4b445c}
  tbody tr:nth-child(even){background:#faf8ff}
  td.sku{color:#6b6478}
  .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  td.price{font-weight:600}
  tr{page-break-inside:avoid}
  .final-qr{margin-top:22px;display:flex;gap:12px;align-items:center;page-break-inside:avoid}
  .final-qr img{height:104px;width:104px}
  .final-qr p{margin:0;color:#4b445c;font-size:10px}
  .note{margin-top:16px;color:#6b6478;font-size:9.5px}
  @page{size:A4 portrait;margin:12mm}
</style></head><body>
<div class="runner page-head">
  <div class="brand-row">
    <div class="idm">
      ${b.logo ? `<img src="${esc(String(b.logo))}" alt="Logo" />` : ""}
      <div class="biz"><strong>${esc(b.name ?? "")}</strong>
      ${b.tagline ? `<span>${esc(String(b.tagline))}</span>` : ""}</div>
    </div>
    ${contact.length ? `<div class="contact">${contact.join("<br/>")}</div>` : ""}
  </div>
  <div class="title"><h1>${esc(opts.listName)}</h1><p>Generated on ${esc(dateStr)}</p></div>
</div>
<div class="runner page-foot">
  <div class="addr">${esc(b.address ?? "")}</div>
  <div class="center">Stock levels shown as of ${esc(dateStr)} ${esc(timeStr)}</div>
  ${qrDataUrl ? `<img class="foot-qr" src="${qrDataUrl}" alt="Order QR" />` : ""}
  <div>Page <span class="pnum"></span></div>
</div>
${sections || "<p>No products in this list.</p>"}
${
  qrDataUrl
    ? `<div class="final-qr"><img src="${qrDataUrl}" alt="Order QR code" />
       <p><strong>Scan to place your order online</strong><br/>${esc(opts.orderUrl ?? "")}</p></div>`
    : ""
}
${opts.note ? `<p class="note">${esc(opts.note)}</p>` : ""}
<script>window.onload=function(){setTimeout(function(){window.print();},250);}<\/script>
</body></html>`;

  const w = window.open("", "_blank", "width=1000,height=800");
  if (!w) throw new Error("Popup blocked — allow popups to download the PDF");
  w.document.write(html);
  w.document.close();
}
