/**
 * Builds shareable text/HTML versions of an invoice for WhatsApp and email.
 * Everything is derived live from the bill row + its items — no static strings.
 */
import type { Tables } from "@/integrations/supabase/types";

export type ShareBill = Tables<"bills"> & {
  customers?: { name: string; phone?: string | null; email?: string | null } | null;
  bill_items?: Pick<Tables<"bill_items">, "product_name_snapshot" | "quantity" | "unit_price" | "line_total">[];
};

export type ShareSettings = {
  business_name?: string | null;
  business_address?: string | null;
  share_message_footer?: string | null;
} | null
  | undefined;

const MAX_ITEMS = 8;

export const DEFAULT_SHARE_FOOTER =
  "Thank you for shopping with {business_name}! If you need any product query, feel free to reply here.";

function money(v: number | string | null | undefined) {
  return Number(v ?? 0).toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function qty(v: number | string | null | undefined) {
  const n = Number(v ?? 0);
  return Number.isInteger(n) ? String(n) : String(n);
}

function billDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function footerText(settings: ShareSettings) {
  const name = settings?.business_name?.trim() || "us";
  const raw = settings?.share_message_footer?.trim() || DEFAULT_SHARE_FOOTER;
  return raw.replace(/\{business_name\}/g, name);
}

type Parts = {
  businessName: string;
  address: string;
  number: string;
  date: string;
  customer: string;
  items: { name: string; quantity: number; unitPrice: number; lineTotal: number }[];
  hiddenCount: number;
  subtotal: number;
  discount: number;
  taxed: boolean;
  taxRate: number;
  tax: number;
  total: number;
  balanceDue: number;
  footer: string;
};

function parts(bill: ShareBill, settings: ShareSettings, balanceDue: number): Parts {
  const all = bill.bill_items ?? [];
  const shown = all.slice(0, MAX_ITEMS);
  return {
    businessName: settings?.business_name?.trim() || "Invoice",
    address: settings?.business_address?.trim() || "",
    number: bill.bill_number ?? "—",
    date: billDate(bill.bill_date),
    customer: bill.customers?.name ?? (bill.is_walk_in ? "Walk-in Customer" : "—"),
    items: shown.map((i) => ({
      name: i.product_name_snapshot,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unit_price),
      lineTotal: Number(i.line_total),
    })),
    hiddenCount: Math.max(0, all.length - shown.length),
    subtotal: Number(bill.subtotal),
    discount: Number(bill.discount_amount ?? 0),
    taxed: Boolean(bill.is_taxed),
    taxRate: Number(bill.tax_rate ?? 0),
    tax: Number(bill.tax_amount ?? 0),
    total: Number(bill.total_amount),
    balanceDue: Math.max(0, Number(balanceDue ?? 0)),
    footer: footerText(settings),
  };
}

/** WhatsApp-flavoured markdown (*bold*). */
export function generateInvoiceMessageText(
  bill: ShareBill,
  settings: ShareSettings,
  balanceDue = 0,
): string {
  const p = parts(bill, settings, balanceDue);
  const rule = "────────────────";
  const lines: string[] = [];

  lines.push(`*${p.businessName}*`);
  if (p.address) lines.push(p.address);
  lines.push("");
  lines.push(`🧾 *Invoice #${p.number}*`);
  lines.push(`📅 ${p.date}`);
  lines.push("");
  lines.push(`Bill To: *${p.customer}*`);
  lines.push("");
  lines.push(rule);
  for (const it of p.items) {
    lines.push(it.name);
    lines.push(`${qty(it.quantity)} x AED ${money(it.unitPrice)} = AED ${money(it.lineTotal)}`);
  }
  if (p.hiddenCount > 0) lines.push(`+ ${p.hiddenCount} more items (see attached total)`);
  lines.push(rule);
  lines.push("");
  lines.push(`Subtotal: AED ${money(p.subtotal)}`);
  if (p.discount > 0) lines.push(`Discount: -AED ${money(p.discount)}`);
  if (p.taxed) lines.push(`Tax (${p.taxRate || 5}%): AED ${money(p.tax)}`);
  lines.push("");
  lines.push(`*GRAND TOTAL: AED ${money(p.total)}*`);
  lines.push(p.balanceDue > 0 ? `Balance Due: AED ${money(p.balanceDue)}` : "✅ Paid in Full");
  lines.push("");
  lines.push(p.footer);

  return lines.join("\n");
}

/** Plain text for mailto bodies — no asterisks, clean spacing. */
export function generateInvoicePlainText(
  bill: ShareBill,
  settings: ShareSettings,
  balanceDue = 0,
): string {
  const p = parts(bill, settings, balanceDue);
  const rule = "----------------------------------------";
  const lines: string[] = [];

  lines.push(p.businessName.toUpperCase());
  if (p.address) lines.push(p.address);
  lines.push("");
  lines.push(`Invoice #${p.number}`);
  lines.push(`Date: ${p.date}`);
  lines.push(`Bill To: ${p.customer}`);
  lines.push("");
  lines.push(rule);
  for (const it of p.items) {
    lines.push(it.name);
    lines.push(`  ${qty(it.quantity)} x AED ${money(it.unitPrice)} = AED ${money(it.lineTotal)}`);
  }
  if (p.hiddenCount > 0) lines.push(`+ ${p.hiddenCount} more items (see total below)`);
  lines.push(rule);
  lines.push("");
  lines.push(`Subtotal:      AED ${money(p.subtotal)}`);
  if (p.discount > 0) lines.push(`Discount:     -AED ${money(p.discount)}`);
  if (p.taxed) lines.push(`Tax (${p.taxRate || 5}%):    AED ${money(p.tax)}`);
  lines.push(`GRAND TOTAL:   AED ${money(p.total)}`);
  lines.push(p.balanceDue > 0 ? `Balance Due:   AED ${money(p.balanceDue)}` : "Status: Paid in Full");
  lines.push("");
  lines.push(p.footer);

  return lines.join("\n");
}

function esc(v: string) {
  return v.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
}

/** Styled HTML mini-invoice, for real email sending. */
export function generateInvoiceHtml(
  bill: ShareBill,
  settings: ShareSettings,
  balanceDue = 0,
): string {
  const p = parts(bill, settings, balanceDue);
  const rows = p.items
    .map(
      (it) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(it.name)}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${qty(it.quantity)}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${money(it.unitPrice)}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${money(it.lineTotal)}</td></tr>`,
    )
    .join("");
  const more =
    p.hiddenCount > 0
      ? `<tr><td colspan="4" style="padding:6px 8px;color:#666">+ ${p.hiddenCount} more items</td></tr>`
      : "";
  const line = (label: string, value: string, strong = false) =>
    `<tr><td colspan="3" style="padding:4px 8px;text-align:right;${strong ? "font-weight:700" : ""}">${esc(label)}</td>` +
    `<td style="padding:4px 8px;text-align:right;${strong ? "font-weight:700" : ""}">${esc(value)}</td></tr>`;

  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#141414;max-width:600px">
<h2 style="margin:0 0 2px">${esc(p.businessName)}</h2>
${p.address ? `<div style="color:#666;font-size:13px">${esc(p.address)}</div>` : ""}
<p style="margin:16px 0 4px"><b>Invoice #${esc(p.number)}</b><br>${esc(p.date)}</p>
<p style="margin:0 0 12px">Bill To: <b>${esc(p.customer)}</b></p>
<table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e3e3e3">
<thead><tr style="background:#f5f5f5">
<th style="padding:6px 8px;text-align:left">Item</th>
<th style="padding:6px 8px;text-align:right">Qty</th>
<th style="padding:6px 8px;text-align:right">Rate</th>
<th style="padding:6px 8px;text-align:right">Amount</th>
</tr></thead>
<tbody>${rows}${more}
${line("Subtotal", `AED ${money(p.subtotal)}`)}
${p.discount > 0 ? line("Discount", `-AED ${money(p.discount)}`) : ""}
${p.taxed ? line(`Tax (${p.taxRate || 5}%)`, `AED ${money(p.tax)}`) : ""}
${line("GRAND TOTAL", `AED ${money(p.total)}`, true)}
${p.balanceDue > 0 ? line("Balance Due", `AED ${money(p.balanceDue)}`, true) : line("Status", "Paid in Full", true)}
</tbody></table>
<p style="margin:16px 0 0;font-size:13px">${esc(p.footer)}</p>
</div>`;
}

/** Strips spaces/symbols so wa.me accepts the number. */
export function cleanPhone(phone: string) {
  const digits = phone.replace(/[^\d]/g, "");
  return digits.replace(/^0+/, "");
}
