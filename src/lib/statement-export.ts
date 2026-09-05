/**
 * Printable customer Account Statement — A4 document with a repeating page
 * header/footer (same `table.sheet` technique as the Owner Snapshot export) and
 * a prominent Total Outstanding block styled like Balance Due on invoices.
 */
import { formatDate, formatMoney } from "@/lib/format";
import type { ReportBusiness } from "@/lib/owner-report-export";

export type StatementRow = {
  date: string;
  label: string;
  debit: number;
  credit: number;
  balance: number;
};

export type StatementCustomer = {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );

export function statementPeriodLabel(rows: StatementRow[], from?: string, to?: string) {
  if (from || to) {
    return `${from ? formatDate(from) : "Beginning"} — ${to ? formatDate(to) : "Today"}`;
  }
  if (!rows.length) return "All activity";
  const first = rows[0]!.date;
  const last = rows[rows.length - 1]!.date;
  return `${formatDate(first)} — ${formatDate(last)}`;
}

export function buildStatementHtml(opts: {
  business: ReportBusiness;
  customer: StatementCustomer;
  rows: StatementRow[];
  outstanding: number;
  periodLabel: string;
}) {
  const { business, customer, rows, outstanding, periodLabel } = opts;
  const generated = new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const logoHtml = business.logo
    ? `<img class="logo" src="${esc(business.logo)}" alt="${esc(business.name)} logo" />`
    : "";

  const body = rows.length
    ? rows
        .map(
          (r) => `<tr>
      <td>${esc(formatDate(r.date))}</td>
      <td>${esc(r.label)}</td>
      <td class="num">${r.debit ? esc(formatMoney(r.debit)) : "—"}</td>
      <td class="num">${r.credit ? esc(formatMoney(r.credit)) : "—"}</td>
      <td class="num strong">${esc(formatMoney(r.balance))}</td>
    </tr>`,
        )
        .join("")
    : `<tr><td colspan="5" class="empty">No transactions on record</td></tr>`;

  const paidInFull = Math.abs(outstanding) < 0.005;

  return `<!doctype html><html><head><meta charset="utf-8" />
<title>Account Statement — ${esc(customer.name)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:"Helvetica Neue",Arial,sans-serif;color:#1a1024;margin:0;font-size:10.5px}
  table.sheet{width:100%;border-collapse:collapse}
  .page-head{padding-bottom:8px;border-bottom:2px solid #7c3aed;margin-bottom:10px}
  .brand{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}
  .bl{display:flex;gap:10px;align-items:center}
  .logo{height:42px;width:auto;object-fit:contain}
  h1{font-size:16px;margin:0;letter-spacing:.01em}
  .sub{color:#7a7186;font-size:9px;margin-top:2px}
  .rt{text-align:right}
  .rt strong{font-size:13px;display:block;text-transform:uppercase;letter-spacing:.08em}
  .rt .date{font-size:9px;color:#7a7186;margin-top:2px}
  .party{display:flex;justify-content:space-between;gap:14px;margin:0 0 10px}
  .party .box{border:1px solid #eceaf1;border-radius:9px;padding:8px 10px;min-width:45%}
  .party h3{margin:0 0 3px;font-size:8.5px;text-transform:uppercase;letter-spacing:.07em;color:#7a7186}
  .party b{font-size:12px}
  .party div{font-size:9px;color:#4a4155;margin-top:2px}
  table.tx{width:100%;border-collapse:collapse;margin-top:4px}
  table.tx th,table.tx td{border-bottom:1px solid #ece8f3;padding:5px 7px;text-align:left}
  table.tx th{background:#f6f4fa;font-size:8.5px;text-transform:uppercase;letter-spacing:.06em}
  table.tx thead{display:table-header-group}
  table.tx tr{page-break-inside:avoid}
  table.tx tbody tr:nth-child(even){background:#fbfafd}
  .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  .strong{font-weight:700}
  .empty{text-align:center;color:#7a7186;padding:18px 0}
  .totals{margin-top:14px;display:flex;justify-content:flex-end}
  .due{min-width:260px;border:1.5px solid ${paidInFull ? "#12805c" : "#7c3aed"};border-radius:10px;
       background:${paidInFull ? "#eefaf4" : "#f5efff"};padding:10px 14px;text-align:right}
  .due span{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#4a4155}
  .due b{font-size:17px;color:${paidInFull ? "#12805c" : "#3b1d70"}}
  .page-foot{border-top:1px solid #ece8f3;margin-top:8px;padding-top:5px;color:#7a7186;font-size:8.5px}
  @page{size:A4 portrait;margin:12mm}
</style></head><body>
<table class="sheet">
<thead><tr><td>
  <div class="page-head">
    <div class="brand">
      <div class="bl">${logoHtml}<div>
        <h1>${esc(business.name)}</h1>
        <div class="sub">${esc([business.address, business.phone, business.email].filter(Boolean).join(" • "))}</div>
      </div></div>
      <div class="rt">
        <strong>Account Statement</strong>
        <div class="date">${esc(periodLabel)}</div>
        <div class="date">Generated ${esc(generated)}</div>
      </div>
    </div>
  </div>
</td></tr></thead>
<tfoot><tr><td><div class="page-foot">Account Statement — ${esc(customer.name)} · ${esc(business.name)}</div></td></tr></tfoot>
<tbody><tr><td>
  <div class="party">
    <div class="box">
      <h3>Statement for</h3>
      <b>${esc(customer.name)}</b>
      <div>${esc([customer.phone, customer.email].filter(Boolean).join(" • ") || "—")}</div>
      ${customer.address ? `<div>${esc(customer.address)}</div>` : ""}
    </div>
    <div class="box">
      <h3>Period</h3>
      <b>${esc(periodLabel)}</b>
      <div>${rows.length} entr${rows.length === 1 ? "y" : "ies"}</div>
    </div>
  </div>
  <table class="tx">
    <thead><tr>
      <th>Date</th><th>Details</th>
      <th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table>
  <div class="totals"><div class="due">
    <span>Total Outstanding</span>
    <b>${esc(formatMoney(Math.max(outstanding, 0)))}${paidInFull ? " — Paid in Full" : ""}</b>
  </div></div>
</td></tr></tbody>
</table>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`;
}

/** Opens the statement in a print window (used for both Print and Save as PDF). */
export function printCustomerStatement(opts: {
  business: ReportBusiness;
  customer: StatementCustomer;
  rows: StatementRow[];
  outstanding: number;
  periodLabel: string;
}) {
  const w = window.open("", "_blank", "width=1000,height=900");
  if (!w) throw new Error("Popup blocked");
  w.document.write(buildStatementHtml(opts));
  w.document.close();
}
