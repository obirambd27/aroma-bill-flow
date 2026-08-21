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

/** Rows per printed page for the paginated tables. */
const PAGE_ROWS = 28;

function paginate<T>(rows: T[], size = PAGE_ROWS): T[][] {
  if (rows.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

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

  const stat = (label: string, value: string, big = false, extra = "") =>
    `<div class="stat${big ? " big" : ""}"><span>${esc(label)}</span><strong>${esc(value)}</strong>${extra}</div>`;

  const cp = data.collectedPrevious;
  const groupB = `<p class="subhead">Collected from previous bills</p>
<div class="grid">
${stat(collectedLabel(data.periodType), cp ? formatMoney(cp.total) : "Unable to calculate", true)}
${stat("Cash", cp ? formatMoney(cp.byMethod["Cash"] ?? 0) : "—")}
${stat("Bank Transfer", cp ? formatMoney(cp.byMethod["Bank Transfer"] ?? 0) : "—")}
${stat("Card Payment", cp ? formatMoney(cp.byMethod["Card Payment"] ?? 0) : "—")}
${cp && cp.uncategorized > 0.009 ? stat("Uncategorized", formatMoney(cp.uncategorized)) : ""}
</div>`;

  const salesBlock = s
    ? `<div class="grid">
${stat("Total Sell (all sell: paid + credit)", formatMoney(s.totalSell), true, deltaHtml(s.totalSell, data.prevSales?.totalSell))}
${stat(profitLabel(data.periodType), money(data.netProfit), true, data.netProfit !== null ? deltaHtml(data.netProfit, data.prevNetProfit) : "")}
${stat("Total Paid Sell", formatMoney(s.totalPaid), false, deltaHtml(s.totalPaid, data.prevSales?.totalPaid))}
${stat("Bills Issued", String(s.billCount))}
${stat("Average Bill", formatMoney(s.averageBill))}
${stat("Tax Collected", formatMoney(s.tax))}
${stat("Discount Given", formatMoney(s.discount))}
</div>
<p class="subhead">Payments on today's sales</p>
<div class="grid">
${stat("Cash", formatMoney(s.byMethod["Cash"] ?? 0))}
${stat("Bank Transfer", formatMoney(s.byMethod["Bank Transfer"] ?? 0))}
${stat("Card Payment", formatMoney(s.byMethod["Card Payment"] ?? 0))}
</div>
${groupB}`
    : `<p class="warn">Unable to calculate sales figures.</p>${groupB}`;

  /* Product Sales & Profit — paginated */
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
  const productPages = paginate(products);
  const productSections = products.length
    ? productPages
        .map((page, pi) => {
          const last = pi === productPages.length - 1;
          const rows = page
            .map((p) => {
              const tint =
                p.profit === null || p.margin === null
                  ? ""
                  : p.profit < 0
                    ? " class=\"neg\""
                    : p.margin < 10
                      ? " class=\"low\""
                      : "";
              return `<tr><td>${esc(p.name)}${p.missingCost ? " *" : ""}</td><td class="num">${n2(p.qty)}</td><td class="num">${esc(formatMoney(p.revenue))}</td><td class="num">${esc(formatMoney(p.cost))}</td><td${tint ? tint : ""}><span class="num block">${esc(formatMoney(p.profit ?? 0))}</span></td><td class="num">${p.margin === null ? "—" : `${p.margin.toFixed(1)}%`}</td></tr>`;
            })
            .join("");
          return `<section${pi > 0 ? ' class="break"' : ""}><h2>Product Sales &amp; Profit${pi > 0 ? " (continued)" : ""}</h2>
<table><thead><tr><th>Product</th><th class="num">Qty Sold</th><th class="num">Revenue</th><th class="num">Cost</th><th class="num">Profit</th><th class="num">Margin %</th></tr></thead>
<tbody>${rows}</tbody>
${
  last
    ? `<tfoot><tr><td>Total</td><td class="num">${n2(totals.qty)}</td><td class="num">${esc(formatMoney(totals.revenue))}</td><td class="num">${esc(formatMoney(totals.cost))}</td><td class="num">${esc(formatMoney(totals.profit))}</td><td class="num">${totals.revenue > 0 ? `${((totals.profit / totals.revenue) * 100).toFixed(1)}%` : "—"}</td></tr></tfoot>`
    : ""
}</table>
${last && data.hasMissingCost ? `<p class="foot">* Profit not available for items missing a recorded cost price at time of sale.</p>` : ""}
</section>`;
        })
        .join("")
    : `<section><h2>Product Sales &amp; Profit</h2><p class="muted">No products sold in this period.</p></section>`;

  /* Outstanding — paginated */
  const outRows = data.outstanding?.rows ?? [];
  const outPages = paginate(outRows);
  const outstandingSections = data.outstanding
    ? outRows.length
      ? outPages
          .map((page, pi) => {
            const last = pi === outPages.length - 1;
            const rows = page
              .map(
                (r) =>
                  `<tr><td>${esc(r.name)}</td><td>${esc(r.phone ?? "—")}</td><td>${esc(agingLabel[r.bucket])}</td><td class="num">${esc(formatMoney(r.amount))}</td></tr>`,
              )
              .join("");
            return `<section class="break"><h2>Outstanding${pi > 0 ? " (continued)" : ""}</h2>
${pi === 0 ? `<div class="grid">${stat("Total Outstanding", formatMoney(data.outstanding!.total), true)}</div>` : ""}
<table><thead><tr><th>Customer</th><th>Phone</th><th>Aging</th><th class="num">Outstanding</th></tr></thead>
<tbody>${rows}</tbody>
${last ? `<tfoot><tr><td colspan="3">Total</td><td class="num">${esc(formatMoney(data.outstanding!.total))}</td></tr></tfoot>` : ""}</table></section>`;
          })
          .join("")
      : `<section class="break"><h2>Outstanding</h2><p class="muted">No outstanding balances.</p></section>`
    : `<section class="break"><h2>Outstanding</h2><p class="warn">Unable to calculate outstanding balances.</p></section>`;

  const logoHtml = business.logo
    ? `<img class="logo" src="${esc(business.logo)}" alt="${esc(business.name)}" onerror="this.style.display='none'">`
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(head.title)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Inter,system-ui,sans-serif;color:#1a1024;margin:0;font-size:11px;padding:116px 24px 44px}
  .runner{position:fixed;left:0;right:0;background:#fff;padding:12px 24px}
  .page-head{top:0;border-bottom:2px solid #7c3aed}
  .page-foot{bottom:0;border-top:1px solid #e3e0e8;color:#7a7186;font-size:9px;text-align:center}
  .brand{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
  .bl{display:flex;gap:10px;align-items:flex-start}
  .logo{max-height:44px;max-width:120px;object-fit:contain}
  .brand h1{font-size:17px;margin:0;letter-spacing:.02em}
  .brand .sub{color:#7a7186;font-size:10px;margin-top:2px}
  .brand .rt{text-align:right}
  .brand .rt strong{display:block;font-size:13px;color:#7c3aed;text-transform:uppercase;letter-spacing:.08em}
  section{border:1px solid #e3e0e8;border-radius:8px;padding:10px 12px;margin-bottom:12px;page-break-inside:avoid}
  section.break{page-break-before:always}
  h2{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#7c3aed;margin:0 0 8px}
  .subhead{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#7a7186;margin:10px 0 4px;font-weight:700}
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
  .block{display:block}
  td.low{background:#fff5e6}
  td.neg{background:#fdeaea;color:#c0392b;font-weight:600}
  .muted{color:#7a7186;margin:6px 0 0}
  .warn{color:#c0392b;margin:4px 0 0;font-weight:600}
  .foot{color:#7a7186;font-size:9px;margin:6px 0 0}
  tr{page-break-inside:avoid}
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
      <div class="sub">${esc(head.sub)}</div>
      <div class="sub">Generated ${esc(generated)}</div>
    </div>
  </div>
</div>
<div class="runner page-foot">Generated ${esc(generated)} — ${esc(business.name)}</div>

<section><h2>Sales Overview</h2>${salesBlock}</section>
<section><h2>Purchases &amp; Expenses</h2><div class="grid">
${stat("Total Purchases", money(data.purchases))}
${stat("Total Expenses", money(data.expenses))}
${stat("Cost of Goods Sold", money(data.cogs))}
</div></section>
<section><h2>Customer Activity</h2><div class="grid">
${stat("New Customers", data.customerActivity ? String(data.customerActivity.newCustomers) : "Unable to calculate")}
${stat("Returning Customers", data.customerActivity ? String(data.customerActivity.returning) : "Unable to calculate")}
${stat("Low Stock Items", data.lowStock ? String(data.lowStock.count) : "Unable to calculate")}
</div></section>
${productSections}
${outstandingSections}
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
