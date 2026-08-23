/**
 * Owner Snapshot Report exports — A4 PDF (print window), CSV (labelled
 * sections) and XLSX (one sheet per section, raw numbers for analysis).
 * Every function throws on failure so the caller can show a retry toast.
 */
import * as XLSX from "xlsx";
import { agingLabel } from "@/lib/collections";
import { formatMoney } from "@/lib/format";
import {
  collectedLabel,
  pctChange,
  periodHeadline,
  profitLabel,
  rangeLabel,
  type OwnerReportData,
} from "@/lib/owner-report";

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

/* ---------- tiny dependency-free SVG charts ---------- */

const PALETTE = ["#7c3aed", "#a78bfa", "#f0abfc", "#22a06b", "#f59e0b", "#ef4444"];

/** Horizontal bar chart — labels left, value right. */
function hBarChart(items: { label: string; value: number }[], opts?: { money?: boolean }) {
  const rows = items.filter((i) => Number.isFinite(i.value));
  if (!rows.length) return `<p class="muted">Not enough data to chart.</p>`;
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  const rowH = 20;
  const w = 520;
  const labelW = 168;
  const valueW = 92;
  const barW = w - labelW - valueW - 12;
  const h = rows.length * rowH + 6;
  const bars = rows
    .map((r, i) => {
      const len = Math.max(2, (Math.abs(r.value) / max) * barW);
      const y = i * rowH + 4;
      const neg = r.value < 0;
      const label = r.label.length > 30 ? `${r.label.slice(0, 29)}…` : r.label;
      return `<text x="0" y="${y + 10}" class="cl">${esc(label)}</text>
<rect x="${labelW}" y="${y + 1}" width="${len}" height="11" rx="3" fill="${neg ? "#ef4444" : PALETTE[i % 3]}"></rect>
<text x="${w}" y="${y + 10}" class="cv" text-anchor="end">${esc(opts?.money ? formatMoney(r.value) : String(n2(r.value)))}</text>`;
    })
    .join("");
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img">${bars}</svg>`;
}

/** Donut chart with legend for a small set of parts. */
function donutChart(parts: { label: string; value: number }[]) {
  const rows = parts.filter((p) => p.value > 0.009);
  const total = rows.reduce((t, p) => t + p.value, 0);
  if (!total) return `<p class="muted">No payments recorded in this period.</p>`;
  const cx = 60;
  const cy = 60;
  const r = 46;
  const inner = 27;
  let angle = -Math.PI / 2;
  const arcs = rows
    .map((p, i) => {
      const slice = (p.value / total) * Math.PI * 2;
      const a0 = angle;
      const a1 = angle + slice;
      angle = a1;
      const large = slice > Math.PI ? 1 : 0;
      const pt = (rad: number, ang: number) =>
        `${(cx + rad * Math.cos(ang)).toFixed(2)},${(cy + rad * Math.sin(ang)).toFixed(2)}`;
      if (rows.length === 1) {
        return `<circle cx="${cx}" cy="${cy}" r="${(r + inner) / 2}" fill="none" stroke="${PALETTE[i]}" stroke-width="${r - inner}"></circle>`;
      }
      return `<path d="M ${pt(r, a0)} A ${r} ${r} 0 ${large} 1 ${pt(r, a1)} L ${pt(inner, a1)} A ${inner} ${inner} 0 ${large} 0 ${pt(inner, a0)} Z" fill="${PALETTE[i % PALETTE.length]}"></path>`;
    })
    .join("");
  const legend = rows
    .map(
      (p, i) =>
        `<li><span class="dot" style="background:${PALETTE[i % PALETTE.length]}"></span>${esc(p.label)}<b>${esc(formatMoney(p.value))}</b><i>${((p.value / total) * 100).toFixed(0)}%</i></li>`,
    )
    .join("");
  return `<div class="donut-wrap"><svg viewBox="0 0 120 120" width="120" height="120" role="img">${arcs}</svg><ul class="legend">${legend}</ul></div>`;
}

/* ---------- PDF (print) ---------- */

export function printOwnerReport(opts: {
  data: OwnerReportData;
  business: ReportBusiness;
  title?: string;
}): void {
  const { data, business } = opts;
  const s = data.sales;
  const head = periodHeadline(data.periodType, data.range);
  const generated = new Date(data.generatedAt).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const stat = (label: string, value: string, extra = "") =>
    `<div class="stat"><span>${esc(label)}</span><strong>${esc(value)}</strong>${extra}</div>`;

  const hero = (label: string, value: string, extra = "", tone = "") =>
    `<div class="hero ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong>${extra}</div>`;

  const cp = data.collectedPrevious;

  const heroBand = `<div class="hero-band">
${hero("Total Sell (paid + credit)", s ? formatMoney(s.totalSell) : "—", s ? deltaHtml(s.totalSell, data.prevSales?.totalSell) : "")}
${hero(profitLabel(data.periodType), money(data.netProfit), data.netProfit !== null ? deltaHtml(data.netProfit, data.prevNetProfit) : "", "accent")}
${hero("Total Paid Sell", s ? formatMoney(s.totalPaid) : "—", s ? deltaHtml(s.totalPaid, data.prevSales?.totalPaid) : "")}
${hero("Outstanding", data.outstanding ? formatMoney(data.outstanding.total) : "—", "", "warn")}
</div>`;

  const methodDonut = s
    ? donutChart([
        { label: "Cash", value: s.byMethod["Cash"] ?? 0 },
        { label: "Bank Transfer", value: s.byMethod["Bank Transfer"] ?? 0 },
        { label: "Card Payment", value: s.byMethod["Card Payment"] ?? 0 },
      ])
    : `<p class="warn">Unable to calculate.</p>`;

  const collectedDonut = cp
    ? donutChart([
        { label: "Cash", value: cp.byMethod["Cash"] ?? 0 },
        { label: "Bank Transfer", value: cp.byMethod["Bank Transfer"] ?? 0 },
        { label: "Card Payment", value: cp.byMethod["Card Payment"] ?? 0 },
        { label: "Uncategorized", value: cp.uncategorized },
      ])
    : `<p class="warn">Unable to calculate.</p>`;

  const salesBlock = s
    ? `<div class="grid">
${stat("Bills Issued", String(s.billCount))}
${stat("Average Bill", formatMoney(s.averageBill))}
${stat("Tax Collected", formatMoney(s.tax))}
${stat("Discount Given", formatMoney(s.discount))}
${stat("Cost of Goods Sold", money(data.cogs))}
${stat("Total Expenses", money(data.expenses))}
${stat("Total Purchases", money(data.purchases))}
</div>`
    : `<p class="warn">Unable to calculate sales figures.</p>`;

  const paymentsBlock = `<div class="cols">
  <div class="col">
    <p class="subhead">Payments on this period's sales</p>
    <p class="colTotal">${esc(s ? formatMoney((s.byMethod["Cash"] ?? 0) + (s.byMethod["Bank Transfer"] ?? 0) + (s.byMethod["Card Payment"] ?? 0)) : "—")}</p>
    ${methodDonut}
  </div>
  <div class="col">
    <p class="subhead">${esc(collectedLabel(data.periodType))}</p>
    <p class="colTotal">${esc(cp ? formatMoney(cp.total) : "—")}</p>
    ${collectedDonut}
  </div>
</div>`;

  /* Product Sales & Profit — single flowing table (thead repeats per page) */
  const products = data.productProfit ?? [];
  const totals = products.reduce(
    (t, p) => ({
      qty: t.qty + p.qty,
      revenue: t.revenue + p.revenue,
      cost: t.cost + p.cost,
      profit: t.profit + (p.profit ?? 0),
    }),
    { qty: 0, revenue: 0, cost: 0, profit: 0 },
  );

  const topProfit = [...products]
    .filter((p) => p.profit !== null)
    .sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0))
    .slice(0, 8)
    .map((p) => ({ label: p.name, value: n2(p.profit ?? 0) }));
  const topRevenue = [...products]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8)
    .map((p) => ({ label: p.name, value: n2(p.revenue) }));

  const productRows = products
    .map((p) => {
      const tint =
        p.profit === null || p.margin === null
          ? ""
          : p.profit < 0
            ? ' class="num neg"'
            : p.margin < 10
              ? ' class="num low"'
              : ' class="num"';
      return `<tr><td>${esc(p.name)}${p.missingCost ? " *" : ""}</td><td class="num">${n2(p.qty)}</td><td class="num">${esc(formatMoney(p.revenue))}</td><td class="num">${esc(formatMoney(p.cost))}</td><td${tint || ' class="num"'}>${esc(formatMoney(p.profit ?? 0))}</td><td class="num">${p.margin === null ? "—" : `${p.margin.toFixed(1)}%`}</td></tr>`;
    })
    .join("");

  const productSection = products.length
    ? `<section class="break"><h2>Product Sales &amp; Profit</h2>
<div class="cols charts">
  <div class="col"><p class="subhead">Top products by profit</p>${hBarChart(topProfit, { money: true })}</div>
  <div class="col"><p class="subhead">Top products by revenue</p>${hBarChart(topRevenue, { money: true })}</div>
</div>
<table class="flow"><thead><tr><th>Product</th><th class="num">Qty Sold</th><th class="num">Revenue</th><th class="num">Cost</th><th class="num">Profit</th><th class="num">Margin %</th></tr></thead>
<tbody>${productRows}</tbody>
<tfoot><tr><td>Total</td><td class="num">${n2(totals.qty)}</td><td class="num">${esc(formatMoney(totals.revenue))}</td><td class="num">${esc(formatMoney(totals.cost))}</td><td class="num">${esc(formatMoney(totals.profit))}</td><td class="num">${totals.revenue > 0 ? `${((totals.profit / totals.revenue) * 100).toFixed(1)}%` : "—"}</td></tr></tfoot></table>
${data.hasMissingCost ? `<p class="foot">* Profit not available for items missing a recorded cost price at time of sale.</p>` : ""}
</section>`
    : `<section class="break"><h2>Product Sales &amp; Profit</h2><p class="muted">No products sold in this period.</p></section>`;

  /* Outstanding — flowing table with an aging chart */
  const outRows = data.outstanding?.rows ?? [];
  const bucketTotals = outRows.reduce<Record<string, number>>((acc, r) => {
    const key = agingLabel[r.bucket];
    acc[key] = (acc[key] ?? 0) + r.amount;
    return acc;
  }, {});
  const agingChart = outRows.length
    ? hBarChart(
        Object.entries(bucketTotals).map(([label, value]) => ({ label, value: n2(value) })),
        { money: true },
      )
    : "";

  const outstandingSection = data.outstanding
    ? outRows.length
      ? `<section class="break"><h2>Outstanding</h2>
<div class="grid">${stat("Total Outstanding", formatMoney(data.outstanding.total))}${stat("Customers", String(outRows.length))}</div>
<p class="subhead">Outstanding by aging bucket</p>${agingChart}
<table class="flow"><thead><tr><th>Customer</th><th>Phone</th><th>Aging</th><th class="num">Outstanding</th></tr></thead>
<tbody>${outRows
          .map(
            (r) =>
              `<tr><td>${esc(r.name)}</td><td>${esc(r.phone ?? "—")}</td><td>${esc(agingLabel[r.bucket])}</td><td class="num">${esc(formatMoney(r.amount))}</td></tr>`,
          )
          .join("")}</tbody>
<tfoot><tr><td colspan="3">Total</td><td class="num">${esc(formatMoney(data.outstanding.total))}</td></tr></tfoot></table></section>`
      : `<section class="break"><h2>Outstanding</h2><p class="muted">No outstanding balances.</p></section>`
    : `<section class="break"><h2>Outstanding</h2><p class="warn">Unable to calculate outstanding balances.</p></section>`;

  const logoHtml = business.logo
    ? `<img class="logo" src="${esc(business.logo)}" alt="${esc(business.name)}" onerror="this.style.display='none'">`
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(head.title)}</title>
<style>
  *{box-sizing:border-box}
  html,body{width:100%;max-width:100%;overflow-x:hidden}
  body{font-family:Inter,system-ui,sans-serif;color:#1a1024;margin:0;font-size:10.5px;padding:104px 2px 40px}
  .runner{position:fixed;left:0;right:0;background:#fff}
  .page-head{top:0;padding:14px 0 10px;border-bottom:2px solid #7c3aed}
  .page-foot{bottom:0;padding:8px 0;border-top:1px solid #e3e0e8;color:#7a7186;font-size:8.5px;text-align:center}
  .brand{display:flex;justify-content:space-between;align-items:center;gap:20px}
  .bl{display:flex;gap:12px;align-items:center}
  .logo{max-height:46px;max-width:130px;object-fit:contain}
  .brand h1{font-size:17px;margin:0;letter-spacing:.01em}
  .brand .sub{color:#7a7186;font-size:9px;margin-top:3px;max-width:330px;line-height:1.45}
  .rt{text-align:right;white-space:nowrap}
  .rt strong{display:block;font-size:12.5px;color:#7c3aed;text-transform:uppercase;letter-spacing:.12em}
  .rt .date{font-size:11px;font-weight:600;margin-top:2px}
  .rt .gen{font-size:8.5px;color:#7a7186;margin-top:2px}
  section{margin-bottom:14px;max-width:100%}
  section.break{page-break-before:auto;break-inside:auto}
  section > h2{break-after:avoid}
  h2{font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:#7c3aed;margin:0 0 8px;padding-bottom:5px;border-bottom:1px solid #e6e1f2}
  .subhead{font-size:8.5px;text-transform:uppercase;letter-spacing:.1em;color:#7a7186;margin:10px 0 6px;font-weight:700}
  .hero-band{display:flex;gap:8px;margin-bottom:12px}
  .hero{flex:1;border:1px solid #e3dcf3;border-radius:10px;padding:10px 12px;background:#fbfaff}
  .hero.accent{background:#7c3aed;border-color:#7c3aed;color:#fff}
  .hero.accent span,.hero.accent .delta{color:rgba(255,255,255,.82)}
  .hero.warn{background:#fff7ed;border-color:#f6d5a8}
  .hero span{display:block;color:#7a7186;font-size:8px;text-transform:uppercase;letter-spacing:.08em}
  .hero strong{display:block;font-size:17px;margin-top:3px;letter-spacing:-.01em}
  .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
  .stat{min-width:0;border:1px solid #eceaf1;border-radius:7px;padding:6px 9px;background:#fff;overflow:hidden}
  .stat span{display:block;color:#7a7186;font-size:8px;text-transform:uppercase;letter-spacing:.06em}
  .stat strong{font-size:12.5px}
  .delta{display:block;font-size:8.5px;font-weight:600;margin-top:2px}
  .delta.up{color:#12805c}.delta.down{color:#c0392b}
  .cols{display:flex;gap:12px;margin-top:8px}
  .col{flex:1;border:1px solid #eceaf1;border-radius:9px;padding:8px 10px;background:#fff}
  .cols.charts .col{background:#fdfcff}
  .colTotal{margin:0 0 4px;font-size:15px;font-weight:700}
  .donut-wrap{display:flex;align-items:center;gap:12px}
  .legend{list-style:none;margin:0;padding:0;font-size:9px;flex:1}
  .legend li{display:flex;align-items:center;gap:6px;padding:2px 0;border-bottom:1px dotted #eae6f2}
  .legend b{margin-left:auto;font-variant-numeric:tabular-nums}
  .legend i{font-style:normal;color:#7a7186;width:30px;text-align:right}
  .dot{width:8px;height:8px;border-radius:2px;display:inline-block}
  .chart .cl{font-size:8px;fill:#4a4155}
  .chart .cv{font-size:8px;fill:#1a1024;font-weight:600}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{border-bottom:1px solid #ece8f3;padding:4.5px 7px;text-align:left}
  th{background:#f6f4fa;font-size:8.5px;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #ddd6ec}
  tbody tr:nth-child(even){background:#fbfafd}
  tfoot td{font-weight:700;background:#f2edfc;border-top:1.5px solid #7c3aed}
  thead{display:table-header-group}
  tfoot{display:table-row-group}
  tr{page-break-inside:avoid}
  .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  td.low{background:#fff5e6}
  td.neg{background:#fdeaea;color:#c0392b;font-weight:600}
  .muted{color:#7a7186;margin:6px 0 0}
  .warn{color:#c0392b;margin:4px 0 0;font-weight:600}
  .foot{color:#7a7186;font-size:8.5px;margin:6px 0 0}
  @page{size:A4 portrait;margin:12mm}
</style></head><body>
<div class="runner page-head">
  <div class="brand">
    <div class="bl">
      ${logoHtml}
      <div>
        <h1>${esc(business.name)}</h1>
        <div class="sub">${esc([business.address, business.phone, business.email].filter(Boolean).join(" • "))}</div>
      </div>
    </div>
    <div class="rt">
      <strong>${esc(head.title)}</strong>
      <div class="date">${esc(head.sub)}</div>
      <div class="gen">Generated ${esc(generated)}</div>
    </div>
  </div>
</div>
<div class="runner page-foot">Generated ${esc(generated)} — ${esc(business.name)}</div>

<section><h2>Sales Overview</h2>${heroBand}${salesBlock}${paymentsBlock}</section>
<section><h2>Customer Activity &amp; Inventory</h2><div class="grid">
${stat("New Customers", data.customerActivity ? String(data.customerActivity.newCustomers) : "Unable to calculate")}
${stat("Returning Customers", data.customerActivity ? String(data.customerActivity.returning) : "Unable to calculate")}
${stat("Low Stock Items", data.lowStock ? String(data.lowStock.count) : "Unable to calculate")}
</div></section>
${productSection}
${outstandingSection}
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
  const cp = data.collectedPrevious;
  const NA = "Unable to calculate";
  const summary: (string | number)[][] = [
    ["Period", rangeLabel(data.range)],
    ["Report Type", periodHeadline(data.periodType, data.range).title],
    ["Generated", new Date(data.generatedAt).toISOString()],
    ["Total Sell (all sell: paid + credit)", s ? n2(s.totalSell) : NA],
    [profitLabel(data.periodType), data.netProfit === null ? NA : n2(data.netProfit)],
    ["Total Paid Sell", s ? n2(s.totalPaid) : NA],
    ["Paid on period sales — Cash", s ? n2(s.byMethod["Cash"] ?? 0) : NA],
    ["Paid on period sales — Bank Transfer", s ? n2(s.byMethod["Bank Transfer"] ?? 0) : NA],
    ["Paid on period sales — Card Payment", s ? n2(s.byMethod["Card Payment"] ?? 0) : NA],
    [collectedLabel(data.periodType), cp ? n2(cp.total) : NA],
    ["Collected (previous bills) — Cash", cp ? n2(cp.byMethod["Cash"] ?? 0) : NA],
    ["Collected (previous bills) — Bank Transfer", cp ? n2(cp.byMethod["Bank Transfer"] ?? 0) : NA],
    ["Collected (previous bills) — Card Payment", cp ? n2(cp.byMethod["Card Payment"] ?? 0) : NA],
    ["Collected (previous bills) — Uncategorized", cp ? n2(cp.uncategorized) : NA],
    ["Bills Issued", s ? s.billCount : NA],
    ["Average Bill Value", s ? n2(s.averageBill) : NA],
    ["Tax Collected", s ? n2(s.tax) : NA],
    ["Discount Given", s ? n2(s.discount) : NA],
    ["Total Outstanding", data.outstanding ? n2(data.outstanding.total) : NA],
    ["Total Purchases", data.purchases === null ? NA : n2(data.purchases)],
    ["Total Expenses", data.expenses === null ? NA : n2(data.expenses)],
    ["Cost of Goods Sold", data.cogs === null ? NA : n2(data.cogs)],
    ["New Customers", data.customerActivity?.newCustomers ?? NA],
    ["Returning Customers", data.customerActivity?.returning ?? NA],
    ["Low Stock Items", data.lowStock?.count ?? NA],
  ];

  const products = data.productProfit ?? [];
  const productRows: (string | number)[][] = products.map((p) => [
    p.name,
    n2(p.qty),
    n2(p.revenue),
    n2(p.cost),
    n2(p.profit ?? 0),
    p.margin === null ? "" : Math.round(p.margin * 10) / 10,
    p.missingCost ? "Missing cost on some lines" : "",
  ]);
  if (products.length) {
    productRows.push([
      "TOTAL",
      n2(products.reduce((t, p) => t + p.qty, 0)),
      n2(products.reduce((t, p) => t + p.revenue, 0)),
      n2(products.reduce((t, p) => t + p.cost, 0)),
      n2(products.reduce((t, p) => t + (p.profit ?? 0), 0)),
      "",
      "",
    ]);
  }

  return [
    { name: "Summary", headers: ["Metric", "Value"], rows: summary },
    {
      name: "Product Sales & Profit",
      headers: ["Product", "Qty Sold", "Revenue", "Cost", "Profit", "Margin %", "Note"],
      rows: productRows,
    },
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
  const cp = data.collectedPrevious;
  const m = (v: number | null) => (v === null ? "n/a" : formatMoney(v));
  const lines = [
    `*${business}*`,
    `${title} — ${rangeLabel(data.range)}`,
    "",
    `*Total Sell (paid + credit):* ${m(s ? s.totalSell : null)}`,
    `*${profitLabel(data.periodType)}:* ${m(data.netProfit)}`,
    `*Paid:* ${m(s ? s.totalPaid : null)}`,
    s
      ? `  Cash ${formatMoney(s.byMethod["Cash"] ?? 0)} | Bank ${formatMoney(s.byMethod["Bank Transfer"] ?? 0)} | Card ${formatMoney(s.byMethod["Card Payment"] ?? 0)}`
      : "",
    `*${collectedLabel(data.periodType)}:* ${m(cp ? cp.total : null)}`,
    cp
      ? `  Cash ${formatMoney(cp.byMethod["Cash"] ?? 0)} | Bank ${formatMoney(cp.byMethod["Bank Transfer"] ?? 0)} | Card ${formatMoney(cp.byMethod["Card Payment"] ?? 0)}`
      : "",
    `Bills: ${s ? s.billCount : "n/a"} | Avg: ${m(s ? s.averageBill : null)}`,
    "",
    `*Outstanding:* ${m(data.outstanding ? data.outstanding.total : null)}`,
    `Purchases: ${m(data.purchases)} | Expenses: ${m(data.expenses)}`,
    `Low stock items: ${data.lowStock?.count ?? "n/a"}`,
  ].filter(Boolean);
  return lines.join("\n");
}
