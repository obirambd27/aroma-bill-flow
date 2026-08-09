import {
  DocFooter,
  DocHero,
  DocItemsList,
  DocPartyCards,
  DocTotals,
  DocumentSheet,
} from "@/components/DocumentSheet";
import { formatDate, formatMoney } from "@/lib/format";
import { amountInWords } from "@/lib/amount-words";

/** Sample line items so the preview always looks like a real invoice. */
const SAMPLE = [
  { key: "1", name: "OUD ROYALE INTENSE EDP 100ML", subtitle: "AAP0021", quantity: 2, unitPrice: 145, lineTotal: 290 },
  { key: "2", name: "RAYHAAN NOCTURNO ELIXIR EDP 100ML", subtitle: "AAP0043", quantity: 1, unitPrice: 96, lineTotal: 96 },
  { key: "3", name: "AMBER MUSK ATTAR CONCENTRATED OIL 12ML", subtitle: "AAP0009", quantity: 3, unitPrice: 38, lineTotal: 114 },
];

const SUBTOTAL = 500;

export type InvoicePreviewSettings = {
  business_name?: string | null;
  business_tagline?: string | null;
  business_logo_url?: string | null;
  business_address?: string | null;
  business_phone?: string | null;
  business_email?: string | null;
  tax_id?: string | null;
  default_tax_rate?: number | string | null;
  bank_payment_details?: string | null;
  terms_and_conditions?: string | null;
  invoice_footer_note?: string | null;
  signature_url?: string | null;
  invoice_prefix?: string | null;
};

/** Live A4 invoice preview — mirrors the real invoice document exactly. */
export function InvoicePreview({ settings }: { settings: InvoicePreviewSettings }) {
  const rate = Number(settings.default_tax_rate ?? 0);
  const tax = Math.round(SUBTOTAL * (rate / 100) * 100) / 100;
  const total = SUBTOTAL + tax;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <DocumentSheet>
      <DocHero
        logoUrl={settings.business_logo_url}
        businessName={settings.business_name?.trim() || "Your Business Name"}
        tagline={settings.business_tagline}
        chipLabel={rate > 0 ? "Tax Invoice" : "Invoice"}
        documentNumber={`${settings.invoice_prefix || "INV-"}0001`}
        stats={[
          { label: "Issued", value: formatDate(today) },
          { label: "Due", value: formatDate(today) },
          { label: "Amount Due", value: formatMoney(0) },
        ]}
      />

      <DocPartyCards
        left={{
          title: "Billed To",
          name: "Sample Customer",
          lines: ["Al Buteen, Gold Souq Gate no, #2 Murshid Bazar, Deira, Dubai U.A.E", "+971 50 000 0000"],
        }}
        right={{
          title: "From",
          name: settings.business_name?.trim() || "Your Business Name",
          lines: [
            settings.business_address,
            settings.business_phone,
            settings.business_email,
            settings.tax_id ? `TRN: ${settings.tax_id}` : null,
          ],
        }}
      />

      <DocItemsList items={SAMPLE} />

      <DocTotals
        stamp={{ text: "Paid", sub: formatDate(today), tone: "paid" }}
        rows={[
          { label: "Subtotal", value: formatMoney(SUBTOTAL) },
          ...(rate > 0 ? [{ label: `Tax (${rate}%)`, value: formatMoney(tax) }] : []),
          { label: "Amount Paid", value: formatMoney(total) },
          { label: "Balance Due", value: formatMoney(0) },
        ]}
        totalValue={total}
      />

      <DocFooter
        paymentDetails={settings.bank_payment_details}
        terms={settings.terms_and_conditions}
        note={settings.invoice_footer_note}
        signatureUrl={settings.signature_url}
        businessName={settings.business_name?.trim() || "Your Business Name"}
      >
        <p className="mb-5 text-xs text-doc-muted">
          <span className="font-semibold text-doc-ink">Total in words: </span>
          {amountInWords(total)}
        </p>
      </DocFooter>
    </DocumentSheet>
  );
}
