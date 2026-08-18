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

  const rows = [...opts.rows].sort((a, b) => a.name.localeCompare(b.name));
  const body = rows
    .map(
      (i) =>
        `<tr><td class="nm">${esc(i.name)}</td><td class="num">${i.stock}</td><td class="num price">${esc(
          formatMoney(i.price),
        )}</td></tr>`,
    )
    .join("");

  const b = opts.business;
  const contact = [b.phone, b.email, b.website].filter(Boolean).map((v) => esc(String(v)));

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.listName)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Inter,system-ui,sans-serif;color:#1a1024;margin:0;font-size:10px;
       padding:110px 0 58px}
  .runner{position:fixed;left:0;right:0;background:#fff}
  .page-head{top:0;padding-bottom:8px;border-bottom:2px solid #7c3aed}
  .page-foot{bottom:0;padding-top:6px;border-top:1px solid #ece7f5;display:flex;
             align-items:center;justify-content:space-between;gap:12px;color:#6b6478;font-size:8.5px}
  .brand-row{display:flex;gap:14px;align-items:center;justify-content:space-between}
  .idm{display:flex;gap:12px;align-items:center;min-width:0}
  .idm img{max-height:48px;max-width:126px;object-fit:contain}
  .biz strong{display:block;font-size:14px;line-height:1.2}
  .biz span{display:block;color:#6b6478;font-size:8px;text-transform:uppercase;letter-spacing:.14em;margin-top:2px}
  .contact{text-align:right;color:#4b445c;font-size:8.5px;line-height:1.5;white-space:nowrap}
  .doc-title{margin-top:8px;text-align:center;border:1px solid #b3a3d8;background:#efeaf9;
             padding:5px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#3f2d63}
  .gen{text-align:center;color:#6b6478;font-size:8px;margin-top:2px}
  .page-foot .center{text-align:center;flex:1}
  .page-foot .addr{max-width:34%;white-space:pre-line}
  .foot-qr{height:32px;width:32px}
  .pnum:after{content:counter(page) " of " counter(pages)}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  th,td{border:1px solid #b3a3d8;padding:2.6px 6px}
  thead th{background:#6d5aa8;color:#fff;font-size:9px;text-transform:none;font-weight:600;text-align:center}
  td.nm{text-align:center}
  .num{text-align:center;white-space:nowrap;font-variant-numeric:tabular-nums}
  td.price{font-weight:600}
  tbody tr:nth-child(even){background:#f7f4fd}
  tr{page-break-inside:avoid}
  col.c-stock{width:16%}
  col.c-price{width:18%}
  .final-qr{margin-top:18px;display:flex;gap:12px;align-items:center;page-break-inside:avoid}
  .final-qr img{height:96px;width:96px}
  .final-qr p{margin:0;color:#4b445c;font-size:9.5px}
  .note{margin-top:14px;color:#6b6478;font-size:9px}
  @page{size:A4 portrait;margin:11mm}
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
  <div class="doc-title">${esc(opts.listName)}${b.name ? ` — ${esc(String(b.name))}` : ""}</div>
  <div class="gen">Generated on ${esc(dateStr)}</div>
</div>
<div class="runner page-foot">
  <div class="addr">${esc(b.address ?? "")}</div>
  <div class="center">Stock levels shown as of ${esc(dateStr)} ${esc(timeStr)}</div>
  ${qrDataUrl ? `<img class="foot-qr" src="${qrDataUrl}" alt="Order QR" />` : ""}
  <div>Page <span class="pnum"></span></div>
</div>
${
  rows.length
    ? `<table><colgroup><col/><col class="c-stock"/><col class="c-price"/></colgroup>
<thead><tr><th>Item Name</th><th>In Stock</th><th>Selling Price</th></tr></thead>
<tbody>${body}</tbody></table>`
    : "<p>No products in this list.</p>"
}

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
