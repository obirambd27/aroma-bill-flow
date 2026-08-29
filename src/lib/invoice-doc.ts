/**
 * Shared invoice data-preparation layer.
 *
 * Every A4 document template renders from this one shape, so adding a new
 * template never touches billing logic. Bills, sample previews and receipt-like
 * documents all build an `InvoiceDoc` and hand it to the active template.
 */
import { formatDate } from "@/lib/format";
import { buildPaymentBreakdown, type AllocationInput } from "@/lib/bill-payments";

export const INVOICE_TEMPLATE_IDS = ["velvet_oud", "orange_bulk", "gst_classic"] as const;
export type InvoiceTemplateId = (typeof INVOICE_TEMPLATE_IDS)[number];
export const DEFAULT_INVOICE_TEMPLATE: InvoiceTemplateId = "velvet_oud";

export function resolveTemplateId(value?: string | null): InvoiceTemplateId {
  return (INVOICE_TEMPLATE_IDS as readonly string[]).includes(String(value))
    ? (value as InvoiceTemplateId)
    : DEFAULT_INVOICE_TEMPLATE;
}

export type InvoiceQrKind = "whatsapp" | "google" | "other";
export type InvoiceQr = { value: string; label: string | null; kind: InvoiceQrKind };

/** QR codes that belong in the document header (WhatsApp contact). */
export function headerQrCodes(business: { qrCodes: InvoiceQr[] }): InvoiceQr[] {
  return business.qrCodes.filter((c) => c.kind === "whatsapp");
}

/** QR codes that belong in the document footer (Google review + others). */
export function footerQrCodes(business: { qrCodes: InvoiceQr[] }): InvoiceQr[] {
  return business.qrCodes.filter((c) => c.kind !== "whatsapp");
}

export type InvoiceBusiness = {
  name: string;
  tagline: string | null;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  bankDetails: string | null;
  terms: string | null;
  footerNote: string | null;
  signatureUrl: string | null;
  signatoryLabel: string;
  /** QR codes printed on documents (WhatsApp, Google review …). */
  qrCodes: InvoiceQr[];
};

export type InvoiceParty = {
  name: string;
  secondary?: string | null;
  lines: (string | null | undefined)[];
};

export type InvoiceItem = {
  key: string;
  name: string;
  subtitle?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type InvoicePaymentLine = {
  key: string;
  method: string;
  date: string | null;
  amount: number;
};

export type InvoiceDoc = {
  /** "Tax Invoice" / "Invoice" / "Order Receipt" … */
  docLabel: string;
  number: string;
  date: string;
  business: InvoiceBusiness;
  customer: InvoiceParty;
  items: InvoiceItem[];
  isTaxed: boolean;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  paid: number;
  balanceDue: number;
  paymentLines: InvoicePaymentLine[];
  status: "Paid" | "Partial" | "Unpaid";
  /** Extra note rendered above the footer (e.g. amount in words). */
  amountInWordsLabel?: string | null;
  /** Customer's outstanding balance on other bills (GST Classic template). */
  previousBalance?: number | null;
};

export type SettingsLike = {
  business_name?: string | null;
  business_tagline?: string | null;
  business_logo_url?: string | null;
  business_address?: string | null;
  business_phone?: string | null;
  business_email?: string | null;
  tax_id?: string | null;
  bank_payment_details?: string | null;
  terms_and_conditions?: string | null;
  invoice_footer_note?: string | null;
  signature_url?: string | null;
  invoice_prefix?: string | null;
  default_tax_rate?: number | string | null;
  active_invoice_template?: string | null;
  whatsapp_qr_link?: string | null;
  whatsapp_qr_name?: string | null;
  google_review_qr_link?: string | null;
  google_review_qr_name?: string | null;
};

export const DEFAULT_GOOGLE_REVIEW_LINK = "https://g.page/r/CS_TpEm4RwOjEAE/review";

function qrCodesFromSettings(settings: SettingsLike | null | undefined): InvoiceQr[] {
  const phoneDigits = (settings?.business_phone ?? "").replace(/\D/g, "");
  const whatsapp =
    settings?.whatsapp_qr_link?.trim() || (phoneDigits ? `https://wa.me/${phoneDigits}` : "");
  const google = settings?.google_review_qr_link?.trim() || DEFAULT_GOOGLE_REVIEW_LINK;
  const codes: InvoiceQr[] = [];
  if (whatsapp)
    codes.push({
      value: whatsapp,
      label: settings?.whatsapp_qr_name?.trim() || "Chat on WhatsApp",
      kind: "whatsapp",
    });
  if (google)
    codes.push({
      value: google,
      label: settings?.google_review_qr_name?.trim() || "Review us on Google",
      kind: "google",
    });
  return codes;
}

export function businessFromSettings(
  settings: SettingsLike | null | undefined,
  fallbackName = "Your Business Name",
): InvoiceBusiness {
  return {
    name: settings?.business_name?.trim() || fallbackName,
    tagline: settings?.business_tagline ?? null,
    logoUrl: settings?.business_logo_url ?? null,
    address: settings?.business_address ?? null,
    phone: settings?.business_phone ?? null,
    email: settings?.business_email ?? null,
    taxId: settings?.tax_id ?? null,
    bankDetails: settings?.bank_payment_details ?? null,
    terms: settings?.terms_and_conditions ?? null,
    footerNote: settings?.invoice_footer_note ?? null,
    signatureUrl: settings?.signature_url ?? null,
    signatoryLabel: "Authorized Signatory",
    qrCodes: qrCodesFromSettings(settings),
  };
}

type BillLike = {
  bill_number: string | null;
  bill_date: string;
  is_taxed: boolean;
  tax_rate: number | string;
  subtotal: number | string;
  tax_amount: number | string;
  discount_amount: number | string;
  total_amount: number | string;
  amount_paid: number | string | null;
  payment_method?: string | null;
  customers?: { name: string; address?: string | null; phone?: string | null; email?: string | null } | null;
  bill_items: {
    id: string;
    product_id: string | null;
    product_name_snapshot: string;
    quantity: number | string;
    unit_price: number | string;
    line_total: number | string;
    warehouse_id: string | null;
  }[];
};

/** Builds the template-agnostic document model for a bill. */
export function buildInvoiceDoc(
  bill: BillLike,
  settings: SettingsLike | null | undefined,
  options: {
    allocations?: AllocationInput[];
    amountInWords?: string | null;
    previousBalance?: number | null;
  } = {},
): InvoiceDoc {
  const breakdown = buildPaymentBreakdown(bill, options.allocations ?? []);
  const total = Number(bill.total_amount) || 0;

  return {
    docLabel: bill.is_taxed ? "Tax Invoice" : "Invoice",
    number: bill.bill_number ?? "Draft",
    date: bill.bill_date,
    business: businessFromSettings(settings, "—"),
    customer: {
      name: bill.customers?.name ?? "Walk-in Customer",
      lines: [bill.customers?.address, bill.customers?.phone, bill.customers?.email],
    },
    items: bill.bill_items.map((item) => ({
      key: item.id,
      name: item.product_name_snapshot,
      subtitle: null,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      lineTotal: Number(item.line_total),
    })),
    isTaxed: bill.is_taxed,
    taxRate: Number(bill.tax_rate) || 0,
    subtotal: Number(bill.subtotal) || 0,
    taxAmount: Number(bill.tax_amount) || 0,
    discountAmount: Number(bill.discount_amount) || 0,
    total,
    paid: breakdown.totalPaid,
    balanceDue: breakdown.balanceDue,
    paymentLines: breakdown.lines.map((l) => ({
      key: l.key,
      method: l.method,
      date: l.date,
      amount: l.amount,
    })),
    status:
      breakdown.balanceDue <= 0.001 && total > 0
        ? "Paid"
        : breakdown.totalPaid > 0.001
          ? "Partial"
          : "Unpaid",
    amountInWordsLabel: options.amountInWords ?? null,
    previousBalance: options.previousBalance ?? 0,
  };
}

/** Sample document used by the Settings template gallery previews. */
export function sampleInvoiceDoc(settings: SettingsLike | null | undefined): InvoiceDoc {
  const rate = Number(settings?.default_tax_rate ?? 0);
  const subtotal = 500;
  const tax = Math.round(subtotal * (rate / 100) * 100) / 100;
  const total = subtotal + tax;
  const today = new Date().toISOString().slice(0, 10);

  return {
    docLabel: rate > 0 ? "Tax Invoice" : "Invoice",
    number: `${settings?.invoice_prefix || "INV-"}0001`,
    date: today,
    business: businessFromSettings(settings),
    customer: {
      name: "Sample Customer",
      secondary: "Sample Trading LLC",
      lines: ["Gold Souq Gate no #2, Deira, Dubai U.A.E", "+971 50 000 0000"],
    },
    items: [
      {
        key: "1",
        name: "OUD ROYALE INTENSE EDP 100ML",
        quantity: 2,
        unitPrice: 145,
        lineTotal: 290,
      },
      {
        key: "2",
        name: "RAYHAAN NOCTURNO ELIXIR EDP 100ML",
        quantity: 1,
        unitPrice: 96,
        lineTotal: 96,
      },
      {
        key: "3",
        name: "AMBER MUSK ATTAR CONCENTRATED OIL 12ML",
        quantity: 3,
        unitPrice: 38,
        lineTotal: 114,
      },
    ],
    isTaxed: rate > 0,
    taxRate: rate,
    subtotal,
    taxAmount: tax,
    discountAmount: 0,
    total,
    paid: total,
    balanceDue: 0,
    paymentLines: [{ key: "billing", method: "Cash", date: today, amount: total }],
    status: "Paid",
    amountInWordsLabel: null,
  };
}

/** Convenience for templates that want a formatted issue date. */
export const formatDocDate = formatDate;

export type OrderReceiptLine = {
  id: string;
  name: string;
  sku?: string | null;
  quantity: number;
  unitPrice: number;
};

/**
 * Builds an "Order Receipt" document from price-list quantities.
 * When the total ordered quantity is below the list minimum, every unit price
 * is increased by the configured percentage.
 */
export function buildOrderReceiptDoc(input: {
  listName: string;
  clientName?: string | null;
  settings: SettingsLike | null | undefined;
  lines: OrderReceiptLine[];
  minQuantity?: number | null;
  increasePercent?: number | null;
}): InvoiceDoc {
  const totalQty = input.lines.reduce((s, l) => s + l.quantity, 0);
  const increase =
    input.minQuantity && totalQty > 0 && totalQty < input.minQuantity
      ? Number(input.increasePercent ?? 0)
      : 0;
  const factor = 1 + increase / 100;
  const items: InvoiceItem[] = input.lines.map((l) => {
    const unitPrice = Math.round(l.unitPrice * factor * 100) / 100;
    return {
      key: l.id,
      name: l.name,
      subtitle: null,
      quantity: l.quantity,
      unitPrice,
      lineTotal: Math.round(unitPrice * l.quantity * 100) / 100,
    };
  });
  const subtotal = Math.round(items.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;

  return {
    docLabel: "Order Receipt",
    number: input.listName,
    date: new Date().toISOString().slice(0, 10),
    business: businessFromSettings(input.settings, "—"),
    customer: {
      name: input.clientName?.trim() || "Customer",
      lines: [
        increase > 0
          ? `Below minimum order of ${input.minQuantity} pcs — prices increased ${increase}%`
          : null,
      ],
    },
    items,
    isTaxed: false,
    taxRate: 0,
    subtotal,
    taxAmount: 0,
    discountAmount: 0,
    total: subtotal,
    paid: 0,
    balanceDue: subtotal,
    paymentLines: [],
    status: "Unpaid",
    amountInWordsLabel: null,
  };
}
