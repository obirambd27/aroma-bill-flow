import { formatMoney } from "@/lib/format";
import type { PublicOrderReceipt } from "@/lib/public-order.server";

const esc = (v: string) =>
  v.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );

function orderDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** WhatsApp-flavoured order summary. Never mentions warehouses or stock. */
export function orderWhatsAppText(r: PublicOrderReceipt) {
  const rule = "────────────────";
  const lines: string[] = [];
  lines.push(`*New order — ${r.orderNumber}*`);
  if (r.business.name) lines.push(r.business.name);
  lines.push("");
  lines.push(`Name: *${r.customer.name}*`);
  lines.push(`Phone: ${r.customer.phone}`);
  if (r.customer.address) lines.push(`Address: ${r.customer.address}`);
  lines.push("");
  lines.push(rule);
  for (const i of r.items) {
    lines.push(i.name);
    lines.push(
      `${i.quantity} x AED ${formatMoney(i.appliedPrice)} = AED ${formatMoney(i.lineTotal)}`,
    );
  }
  lines.push(rule);
  if (r.priceIncreased) lines.push(`Below-minimum pricing applied (+${r.increasePercent}%)`);
  lines.push(`*Total: AED ${formatMoney(r.total)}*`);
  if (r.customer.note) {
    lines.push("");
    lines.push(`Note: ${r.customer.note}`);
  }
  return lines.join("\n");
}

/** Branded A4 "Order Receipt" print view — no stock, cost or warehouse data. */
export function printOrderReceipt(r: PublicOrderReceipt) {
  const b = r.business;
  const contact = [b.phone, b.email].filter(Boolean).map((v) => esc(String(v)));
  const rows = r.items
    .map(
      (i) =>
        `<tr><td>${esc(i.name)}</td><td class="num">${i.quantity}</td><td class="num">${esc(
          formatMoney(i.appliedPrice),
        )}</td><td class="num">${esc(formatMoney(i.lineTotal))}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Order ${esc(
    r.orderNumber,
  )}</title><style>
  *{box-sizing:border-box}
  body{font-family:Inter,system-ui,sans-serif;color:#1a1024;margin:0;padding:0;font-size:11px}
  .head{display:flex;justify-content:space-between;gap:16px;align-items:center;
        border-bottom:2px solid #7c3aed;padding-bottom:10px}
  .head img{max-height:54px;max-width:140px;object-fit:contain}
  .biz strong{display:block;font-size:16px}
  .biz span{display:block;color:#6b6478;font-size:8.5px;text-transform:uppercase;letter-spacing:.14em;margin-top:2px}
  .contact{text-align:right;color:#4b445c;font-size:9px;line-height:1.5}
  .title{margin-top:12px;text-align:center;border:1px solid #b3a3d8;background:#efeaf9;padding:6px;
         font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#3f2d63}
  .meta{display:flex;justify-content:space-between;margin-top:12px;gap:20px}
  .meta div{line-height:1.6}
  table{width:100%;border-collapse:collapse;margin-top:14px}
  th,td{border:1px solid #b3a3d8;padding:5px 8px}
  thead th{background:#6d5aa8;color:#fff;font-weight:600;font-size:10px}
  .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  tbody tr:nth-child(even){background:#f7f4fd}
  .totals{margin-top:12px;margin-left:auto;width:250px}
  .totals div{display:flex;justify-content:space-between;padding:3px 0}
  .totals .grand{border-top:1px solid #b3a3d8;margin-top:4px;padding-top:6px;font-weight:700;font-size:13px}
  .note{margin-top:14px;border:1px dashed #b3a3d8;padding:8px;color:#4b445c}
  .foot{margin-top:20px;text-align:center;color:#6b6478;font-size:9px}
  @page{size:A4 portrait;margin:14mm}
</style></head><body>
<div class="head">
  <div style="display:flex;gap:12px;align-items:center">
    ${b.logo ? `<img src="${esc(b.logo)}" alt="Logo" />` : ""}
    <div class="biz"><strong>${esc(b.name)}</strong>${
      b.tagline ? `<span>${esc(b.tagline)}</span>` : ""
    }</div>
  </div>
  ${contact.length ? `<div class="contact">${contact.join("<br/>")}</div>` : ""}
</div>
<div class="title">Order Receipt</div>
<div class="meta">
  <div><strong>${esc(r.customer.name)}</strong><br/>${esc(r.customer.phone)}<br/>${esc(
    r.customer.address ?? "",
  )}</div>
  <div style="text-align:right"><strong>${esc(r.orderNumber)}</strong><br/>${esc(
    orderDate(r.createdAt),
  )}</div>
</div>
<table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="totals">
  <div><span>Subtotal</span><span>${esc(formatMoney(r.subtotal))}</span></div>
  ${
    r.priceIncreased
      ? `<div><span>Below-minimum adjustment (+${r.increasePercent}%)</span><span>${esc(
          formatMoney(r.total - r.subtotal),
        )}</span></div>`
      : ""
  }
  <div class="grand"><span>Total</span><span>AED ${esc(formatMoney(r.total))}</span></div>
</div>
${r.customer.note ? `<div class="note"><strong>Your note:</strong> ${esc(r.customer.note)}</div>` : ""}
<div class="foot">This is an order confirmation, not a tax invoice. We'll confirm your order shortly.</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) throw new Error("Please allow pop-ups to download your receipt.");
  win.document.write(html);
  win.document.close();
}
