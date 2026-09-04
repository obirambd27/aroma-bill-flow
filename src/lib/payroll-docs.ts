import { amountInWords } from "@/lib/amount-words";
import { formatDate, formatMoney } from "@/lib/format";
import type { Employee, SalaryPayment } from "@/lib/payroll";
import type { Tables } from "@/integrations/supabase/types";

type Settings = Tables<"settings">;

const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string,
  );

function openPrint(html: string) {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

function shell(title: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Georgia,"Times New Roman",serif;color:#1b1b1b;margin:0;padding:28mm 20mm;font-size:12px;line-height:1.55}
  .head{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;border-bottom:2px solid #3b1d3d;padding-bottom:14px}
  .head img{max-height:64px;max-width:200px;object-fit:contain}
  .biz h1{font-size:18px;margin:0 0 2px;letter-spacing:.02em}
  .biz p{margin:0;font-size:11px;color:#555}
  .doctitle{margin:26px 0 4px;font-size:17px;letter-spacing:.14em;text-transform:uppercase;text-align:center}
  .rule{width:70px;height:2px;background:#3b1d3d;margin:0 auto 22px}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th,td{border:1px solid #d8d8d8;padding:7px 10px;text-align:left}
  th{background:#f4f0f4;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
  td.num,th.num{text-align:right;white-space:nowrap}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-top:6px;font-size:12px}
  .meta span{color:#666}
  .net{margin-top:14px;border:2px solid #3b1d3d;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;font-size:14px;font-weight:bold}
  .words{margin-top:8px;font-style:italic;color:#444}
  .body p{margin:0 0 12px;text-align:justify}
  .sign{margin-top:56px;display:flex;justify-content:space-between;align-items:flex-end}
  .sign div{width:45%}
  .sign img{max-height:52px;display:block;margin-bottom:4px}
  .sign .line{border-top:1px solid #999;padding-top:5px;font-size:11px;color:#555}
  .foot{margin-top:34px;text-align:center;font-size:10px;color:#888}
  @page{size:A4;margin:0}
</style></head><body>${body}
<script>window.onload=function(){window.print();}<\/script>
</body></html>`;
}

function header(s: Settings | null | undefined) {
  return `<div class="head">
    <div class="biz">
      <h1>${esc(s?.business_name ?? "Fragrance Billing")}</h1>
      <p>${esc(s?.business_address ?? "")}</p>
      <p>${esc([s?.business_phone, s?.business_email].filter(Boolean).join(" · "))}</p>
    </div>
    ${s?.business_logo_url ? `<img src="${esc(s.business_logo_url)}" alt="Logo" />` : ""}
  </div>`;
}

function signature(s: Settings | null | undefined, leftLabel: string) {
  return `<div class="sign">
    <div><div class="line">${esc(leftLabel)}</div></div>
    <div>
      ${s?.signature_url ? `<img src="${esc(s.signature_url)}" alt="Signature" />` : ""}
      <div class="line">For ${esc(s?.business_name ?? "the Company")}</div>
    </div>
  </div>`;
}

export function printPayslip(
  payment: SalaryPayment,
  employee: Pick<Employee, "name" | "role" | "join_date">,
  settings: Settings | null | undefined,
) {
  const n = (v: unknown) => Number(v ?? 0);
  const rows: [string, number][] = [
    ["Basic salary", n(payment.base_amount)],
    ["Bonus / incentive", n(payment.bonus_amount)],
    ["Deductions", -n(payment.deduction_amount)],
    ["Advance recovered", -n(payment.advance_deducted)],
  ];
  const body = `${header(settings)}
  <h2 class="doctitle">Payslip</h2><div class="rule"></div>
  <div class="meta">
    <div><span>Employee:</span> <strong>${esc(employee.name)}</strong></div>
    <div><span>Payslip No:</span> <strong>${esc(payment.payment_number ?? "—")}</strong></div>
    <div><span>Designation:</span> ${esc(employee.role ?? "—")}</div>
    <div><span>Pay period:</span> ${esc(payment.period_label)}</div>
    <div><span>Date of joining:</span> ${esc(formatDate(employee.join_date))}</div>
    <div><span>Payment date:</span> ${esc(formatDate(payment.payment_date))}</div>
    <div><span>Payment method:</span> ${esc(payment.payment_method)}</div>
    <div><span>Status:</span> ${esc(payment.payment_status)}</div>
  </div>
  <table><thead><tr><th>Description</th><th class="num">Amount</th></tr></thead><tbody>
  ${rows
    .filter(([, v]) => v !== 0)
    .map(([l, v]) => `<tr><td>${esc(l)}</td><td class="num">${esc(formatMoney(v))}</td></tr>`)
    .join("")}
  </tbody></table>
  <div class="net"><span>Net Pay</span><span>${esc(formatMoney(payment.net_amount))}</span></div>
  <p class="words">${esc(amountInWords(payment.net_amount))}</p>
  ${
    n(payment.amount_paid) < n(payment.net_amount)
      ? `<p class="words">Amount paid: ${esc(formatMoney(payment.amount_paid))} · Balance: ${esc(
          formatMoney(n(payment.net_amount) - n(payment.amount_paid)),
        )}</p>`
      : ""
  }
  ${payment.bonus_note ? `<p class="words">Bonus note: ${esc(payment.bonus_note)}</p>` : ""}
  ${payment.deduction_note ? `<p class="words">Deduction note: ${esc(payment.deduction_note)}</p>` : ""}
  ${signature(settings, "Received by (Employee)")}
  <p class="foot">This is a computer generated payslip.</p>`;
  return openPrint(shell(`Payslip ${payment.payment_number ?? ""}`, body));
}

export function printExperienceCertificate(
  employee: Employee,
  settings: Settings | null | undefined,
) {
  const to = employee.end_date ? formatDate(employee.end_date) : "the present date";
  const body = `${header(settings)}
  <h2 class="doctitle">Experience Certificate</h2><div class="rule"></div>
  <div class="body">
    <p style="text-align:right">Date: ${esc(formatDate(new Date().toISOString().slice(0, 10)))}</p>
    <p><strong>TO WHOM IT MAY CONCERN</strong></p>
    <p>This is to certify that <strong>${esc(employee.name)}</strong> was employed with
    ${esc(settings?.business_name ?? "our organisation")} as
    <strong>${esc(employee.role ?? "a member of staff")}</strong> from
    <strong>${esc(formatDate(employee.join_date))}</strong> to <strong>${esc(to)}</strong>.</p>
    <p>During this period, we found ${esc(employee.name)} to be sincere, hardworking and
    professional in carrying out the assigned duties and responsibilities. Their conduct and
    character throughout the tenure were found to be satisfactory.</p>
    <p>We wish ${esc(employee.name)} every success in all future endeavours.</p>
  </div>
  ${signature(settings, "")}
  <p class="foot">${esc(settings?.business_name ?? "")} · ${esc(settings?.business_phone ?? "")}</p>`;
  return openPrint(shell(`Experience Certificate — ${employee.name}`, body));
}
