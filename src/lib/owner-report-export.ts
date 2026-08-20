/**
 * Owner Snapshot Report exports — A4 PDF (print window), CSV (labelled
 * sections) and XLSX (one sheet per section, raw numbers for analysis).
 * Every function throws on failure so the caller can show a retry toast.
 */
import * as XLSX from "xlsx";
import { agingLabel } from "@/lib/collections";
import { formatMoney } from "@/lib/format";
import { pctChange, rangeLabel, type OwnerReportData } from "@/lib/owner-report";

export type ReportBusiness = {
  name: string;
  tagline?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logo?: string | null;
};

const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );

const n2 = (v: number) => Math.round(v * 100) / 100;
const money = (v: number | null) => (v === null ? "Unable to calculate" : formatMoney(v));

function deltaHtml(current: number, previous: number | null | undefined) {
  const pct = pctChange(current, previous ?? null);
  if (pct === null) return "";
  const up = pct >= 0;
  return `<span class="delta ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}% vs prev</span>`;
}

/* ---------- PDF (print) ---------- */

export function printOwnerReport(opts: {
  data: OwnerReportData;
  business: ReportBusiness;
  title: string;
}): void {
  const { data, business, title } = opts;
  const s = data.sales;
  const generated = new Date(data.generatedAt).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const stat = (label: string, value: string, big = false, extra = "") =>
    `<div class="stat${big ? " big" : ""}"><span>${esc(label)}</span><strong>${esc(value)}</strong>${extra}</div>`;

  const salesBlock = s
    ? `<div class="grid">
${stat("Total Sell", formatMoney(s.totalSell), true, deltaHtml(s.totalSell, data.prevSales?.totalSell))}
${stat("Total Paid Sell", formatMoney(s.totalPaid), false, deltaHtml(s.totalPaid, data.prevSales?.totalPaid))}
${stat("Bills Issued", String(s.billCount))}
${stat("Average Bill", formatMoney(s.averageBill))}
${stat("Cash", formatMoney(s.byMethod["Cash"] ?? 0))}
${stat("Bank Transfer", formatMoney(s.byMethod["Bank Transfer"] ?? 0))}
${stat("Card Payment", formatMoney(s.byMethod["Card Payment"] ?? 0))}
${stat("Tax Collected", formatMoney(s.tax))}
${stat("Discount Given", formatMoney(s.discount))}
</div>`
    : `<p class="warn">Unable to calculate sales figures.</p>`;

  const outstandingRows = (data.outstanding?.rows ?? [])
    .map(
      (r) =>
        `<tr><td>${esc(r.name)}</td><td>${esc(r.phone ?? "—")}</td><td>${esc(agingLabel[r.bucket])}</td><td class="num">${esc(formatMoney(r.amount))}</td></tr>`,
    )
    .join("");

  const outstandingBlock = data.outstanding
    ? `<div class="grid">${stat("Total Outstanding", formatMoney(data.outstanding.total), true)}</div>
${
  data.outstanding.rows.length
    ? `<table><thead><tr><th>Customer</th><th>Phone</th><th>Aging</th><th class="num">Outstanding</th></tr></thead>
<tbody>${outstandingRows}</tbody>
<tfoot><tr><td colspan="3">Total</td><td class="num">${esc(formatMoney(data.outstanding.total))}</td></tr></tfoot></table>`
    : `<p class="muted">No outstanding balances.</p>`
}`
    : `<p class="warn">Unable to calculate outstanding balances.</p>`;

  const profitBlock = `<div class="grid">
${stat("Net Profit (Estimate)", money(data.netProfit), true, data.netProfit !== null ? deltaHtml(data.netProfit, data.prevNetProfit) : "")}
${stat("Cost of Goods Sold", money(data.cogs))}
${stat("Total Expenses", money(data.expenses))}
</div><p class="foot">Based on paid sales, recorded cost prices, and logged expenses for this period.</p>`;

  const accountsBlock = data.accounts
    ? `<table><thead><tr><th>Account</th><th>Type</th><th class="num">Balance</th></tr></thead><tbody>
${data.accounts.map((a) => `<tr><td>${esc(a.name)}</td><td>${esc(a.type)}</td><td class="num">${esc(formatMoney(a.balance))}</td></tr>`).join("")}
</tbody><tfoot><tr><td colspan="2">Total</td><td class="num">${esc(
        formatMoney(data.accounts.reduce((t, a) => t + a.balance, 0)),
      )}</td></tr></tfoot></table>`
    : `<p class="warn">Unavailable — please refresh and try again.</p>`;

  const topBlock = data.topProducts?.length
    ? `<table><thead><tr><th>#</th><th>Product</th><th class="num">Qty Sold</th><th class="num">Revenue</th></tr></thead><tbody>
${data.topProducts.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td class="num">${p.qty}</td><td class="num">${esc(formatMoney(p.revenue))}</td></tr>`).join("")}
</tbody></table>`
    : `<p class="muted">No products sold in this period.</p>`;

  const lowStockBlock = data.lowStock
    ? `<div class="grid">${stat("Low Stock Items", String(data.lowStock.count))}</div>${
        data.lowStock.count > 0 && data.lowStock.count < 15
          ? `<p class="muted">${esc(data.lowStock.names.join(", "))}</p>`
          : ""
      }`
    : `<p class="warn">Unable to calculate low stock.</p>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Inter,system-ui,sans-serif;color:#1a1024;margin:0;font-size:11px;padding:104px 24px 44px}
  .runner{position:fixed;left:0;right:0;background:#fff;padding:12px 24px}
  .page-head{top:0;border-bottom:2px solid #7c3aed}
  .page-foot{bottom:0;border-top:1px solid #e3e0e8;color:#7a7186;font-size:9px;text-align:center}
  .brand{display:flex;justify-content:space-between;align-items:flex-end;gap:16px}
  .brand h1{font-size:17px;margin:0;letter-spacing:.02em}
  .brand .sub{color:#7a7186;font-size:10px;margin-top:2px}
  .brand .rt{text-align:right}
  .brand .rt strong{display:block;font-size:12px;color:#7c3aed;text-transform:uppercase;letter-spacing:.08em}
  section{border:1px solid #e3e0e8;border-radius:8px;padding:10px 12px;margin-bottom:12px;page-break-inside:avoid}
  h2{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#7c3aed;margin:0 0 8px}
  .grid{display:flex;flex-wrap:wrap;gap:8px}
  .stat{border:1px solid #eceaf1;border-radius:6px;padding:6px 10px;min-width:118px}
  .stat span{display:block;color:#7a7186;font-size:8.5px;text-transform:uppercase;letter-spacing:.05em}
  .stat strong{font-size:13px}
  .stat.big{background:#faf7ff;border-color:#d9cdf5}
  .stat.big strong{font-size:18px}
  .delta{display:block;font-size:9px;font-weight:600;margin-top:1px}
  .delta.up{color:#12805c}.delta.down{color:#c0392b}
  table{width:100%;border-collapse:collapse;margin-top:6px}
  th,td{border:1px solid #e6e3ec;padding:4px 6px;text-align:left}
  th{background:#f6f4fa;font-size:9px;text-transform:uppercase;letter-spacing:.05em}
  tbody tr:nth-child(even){background:#fbfafd}
  tfoot td{font-weight:700;background:#f6f4fa}
  .num{text-align:right;white-space:nowrap}
  .muted{color:#7a7186;margin:6px 0 0}
  .warn{color:#c0392b;margin:4px 0 0;font-weight:600}
  .foot{color:#7a7186;font-size:9px;margin:6px 0 0}
  tr{page-break-inside:avoid}
  @page{size:A4 portrait;margin:12mm}
</style></head><body>
<div class="runner page-head">
  <div class="brand">
    <div>
      <h1>${esc(business.name)}</h1>
      <div class="sub">${esc([business.address, business.phone, business.email].filter(Boolean).join(" • "))}</div>
    </div>
    <div class="rt">
      <strong>${esc(title)}</strong>
      <div class="sub">${esc(rangeLabel(data.range))}</div>
    </div>
  </div>
</div>
<div class="runner page-foot">Generated ${esc(generated)} — ${esc(business.name)}</div>

<section><h2>Sales Overview</h2>${salesBlock}</section>
<section><h2>Outstanding</h2>${outstandingBlock}</section>
<section><h2>Purchases &amp; Expenses</h2><div class="grid">
${stat("Total Purchases", money(data.purchases))}
${stat("Total Expenses", money(data.expenses))}
</div></section>
<section><h2>Net Profit (Estimate)</h2>${profitBlock}</section>
<section><h2>Cash &amp; Bank Snapshot (Now)</h2>${accountsBlock}</section>
<section><h2>Customer Activity</h2><div class="grid">
${stat("New Customers", data.customerActivity ? String(data.customerActivity.newCustomers) : "Unable to calculate")}
${stat("Returning Customers", data.customerActivity ? String(data.customerActivity.returning) : "Unable to calculate")}
</div></section>
<section><h2>Top Selling Products</h2>${topBlock}</section>
<section><h2>Inventory Health</h2>${lowStockBlock}</section>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`;

  const w = window.open("", "_blank", "width=1000,height=900");
  if (!w) throw new Error("Popup blocked");
  w.document.write(html);
  w.document.close();
}

/* ---------- tabular data ---------- */

type Section = { name: string; headers: string[]; rows: (string | number)[][] };

export function reportSections(data: OwnerReportData): Section[] {
  const s = data.sales;
  const summary: (string | number)[][] = [
    ["Period", rangeLabel(data.range)],
    ["Generated", new Date(data.generatedAt).toISOString()],
    ["Total Sell", s ? n2(s.totalSell) : "Unable to calculate"],
    ["Total Paid Sell", s ? n2(s.totalPaid) : "Unable to calculate"],
    ["Paid — Cash", s ? n2(s.byMethod["Cash"] ?? 0) : "Unable to calculate"],
    ["Paid — Bank Transfer", s ? n2(s.byMethod["Bank Transfer"] ?? 0) : "Unable to calculate"],
    ["Paid — Card Payment", s ? n2(s.byMethod["Card Payment"] ?? 0) : "Unable to calculate"],
    ["Bills Issued", s ? s.billCount : "Unable to calculate"],
    ["Average Bill Value", s ? n2(s.averageBill) : "Unable to calculate"],
    ["Tax Collected", s ? n2(s.tax) : "Unable to calculate"],
    ["Discount Given", s ? n2(s.discount) : "Unable to calculate"],
    ["Total Outstanding", data.outstanding ? n2(data.outstanding.total) : "Unable to calculate"],
    ["Total Purchases", data.purchases === null ? "Unable to calculate" : n2(data.purchases)],
    ["Total Expenses", data.expenses === null ? "Unable to calculate" : n2(data.expenses)],
    ["Cost of Goods Sold", data.cogs === null ? "Unable to calculate" : n2(data.cogs)],
    ["Net Profit (Estimate)", data.netProfit === null ? "Unable to calculate" : n2(data.netProfit)],
    ["New Customers", data.customerActivity?.newCustomers ?? "Unable to calculate"],
    ["Returning Customers", data.customerActivity?.returning ?? "Unable to calculate"],
    ["Low Stock Items", data.lowStock?.count ?? "Unable to calculate"],
  ];
  for (const a of data.accounts ?? []) summary.push([`Balance — ${a.name}`, n2(a.balance)]);
  if (!data.accounts) summary.push(["Cash & Bank", "Unavailable"]);

  return [
    { name: "Summary", headers: ["Metric", "Value"], rows: summary },
    {
      name: "Outstanding Customers",
      headers: ["Customer", "Phone", "Oldest Unpaid Bill", "Aging", "Outstanding"],
      rows: (data.outstanding?.rows ?? []).map((r) => [
        r.name,
        r.phone ?? "",
        r.oldestDate ?? "",
        agingLabel[r.bucket],
        n2(r.amount),
      ]),
    },
    {
      name: "Top Products",
      headers: ["Product", "Qty Sold", "Revenue"],
      rows: (data.topProducts ?? []).map((p) => [p.name, n2(p.qty), n2(p.revenue)]),
    },
    {
      name: "Low Stock",
      headers: ["Product"],
      rows: (data.lowStock?.names ?? []).map((n) => [n]),
    },
  ];
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadOwnerReportCSV(data: OwnerReportData, filename: string) {
  const escCell = (v: string | number) => {
    const t = String(v ?? "");
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lines: string[] = [];
  for (const sec of reportSections(data)) {
    lines.push(`## ${sec.name}`);
    lines.push(sec.headers.map(escCell).join(","));
    for (const r of sec.rows) lines.push(r.map(escCell).join(","));
    lines.push("");
  }
  triggerDownload(
    new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" }),
    `${filename}.csv`,
  );
}

export function downloadOwnerReportXLSX(data: OwnerReportData, filename: string) {
  const wb = XLSX.utils.book_new();
  for (const sec of reportSections(data)) {
    const ws = XLSX.utils.aoa_to_sheet([sec.headers, ...sec.rows]);
    ws["!cols"] = sec.headers.map((h, i) => ({
      wch: Math.min(40, Math.max(h.length + 2, ...sec.rows.map((r) => String(r[i] ?? "").length + 2), 12)),
    }));
    XLSX.utils.book_append_sheet(wb, ws, sec.name.slice(0, 31));
  }
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/** Compact WhatsApp-friendly summary of the report. */
export function ownerReportMessage(data: OwnerReportData, business: string, title: string) {
  const s = data.sales;
  const m = (v: number | null) => (v === null ? "n/a" : formatMoney(v));
  const lines = [
    `*${business}*`,
    `${title} — ${rangeLabel(data.range)}`,
    "",
    `*Total Sell:* ${m(s ? s.totalSell : null)}`,
    `*Paid:* ${m(s ? s.totalPaid : null)}`,
    s
      ? `  Cash ${formatMoney(s.byMethod["Cash"] ?? 0)} | Bank ${formatMoney(s.byMethod["Bank Transfer"] ?? 0)} | Card ${formatMoney(s.byMethod["Card Payment"] ?? 0)}`
      : "",
    `Bills: ${s ? s.billCount : "n/a"} | Avg: ${m(s ? s.averageBill : null)}`,
    "",
    `*Outstanding:* ${m(data.outstanding ? data.outstanding.total : null)}`,
    `Purchases: ${m(data.purchases)} | Expenses: ${m(data.expenses)}`,
    `*Net Profit (est.):* ${m(data.netProfit)}`,
    "",
    data.accounts
      ? `Cash & Bank now: ${formatMoney(data.accounts.reduce((t, a) => t + a.balance, 0))}`
      : "Cash & Bank: unavailable",
    `Low stock items: ${data.lowStock?.count ?? "n/a"}`,
  ].filter(Boolean);
  return lines.join("\n");
}
