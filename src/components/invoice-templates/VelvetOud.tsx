import {
  DocFooter,
  DocHero,
  DocItemsList,
  DocPartyCards,
  DocTotals,
  DocumentSheet,
} from "@/components/DocumentSheet";
import { formatDate, formatMoney } from "@/lib/format";
import type { InvoiceDoc } from "@/lib/invoice-doc";

/** "Velvet & Oud" — violet hero band, tinted item rows, rotated status stamp. */
export function VelvetOudTemplate({ doc }: { doc: InvoiceDoc }) {
  const b = doc.business;

  const head = (
    <DocHero
      logoUrl={b.logoUrl}
      businessName={b.name}
      tagline={b.tagline}
      chipLabel={doc.docLabel}
      documentNumber={doc.number}
      stats={[
        { label: "Issued", value: formatDate(doc.date) },
        { label: "Due", value: formatDate(doc.date) },
        { label: "Amount Due", value: formatMoney(doc.balanceDue) },
      ]}
    />
  );

  const foot = (
    <DocFooter
      paymentDetails={b.bankDetails}
      terms={b.terms}
      note={b.footerNote}
      signatureUrl={b.signatureUrl}
      businessName={b.name}
      qrCodes={b.qrCodes}
    >
      {doc.amountInWordsLabel && (
        <p className="mb-5 text-xs text-doc-muted">
          <span className="font-semibold text-doc-ink">Total in words: </span>
          {doc.amountInWordsLabel}
        </p>
      )}
    </DocFooter>
  );

  return (
    <DocumentSheet runningHead={head} runningFoot={foot}>
      <DocPartyCards
        left={{
          title: "Billed To",
          name: doc.customer.name,
          lines: [doc.customer.secondary, ...doc.customer.lines],
        }}
        right={{
          title: "From",
          name: b.name,
          lines: [b.address, b.phone, b.email, b.taxId ? `TRN: ${b.taxId}` : null],
        }}
      />

      <DocItemsList
        items={doc.items.map((item) => ({
          key: item.key,
          name: item.name,
          subtitle: null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        }))}
      />

      <DocTotals
        stamp={
          doc.status === "Paid"
            ? { text: "Paid", sub: formatDate(doc.date), tone: "paid" as const }
            : doc.status === "Partial"
              ? { text: "Partial", sub: formatMoney(doc.balanceDue), tone: "partial" as const }
              : { text: "Unpaid", sub: formatDate(doc.date), tone: "unpaid" as const }
        }
        rows={[
          { label: "Subtotal", value: formatMoney(doc.subtotal) },
          ...(doc.isTaxed
            ? [{ label: `Tax (${doc.taxRate}%)`, value: formatMoney(doc.taxAmount) }]
            : []),
          ...(doc.discountAmount > 0
            ? [{ label: "Discount", value: `−${formatMoney(doc.discountAmount)}` }]
            : []),
          ...doc.paymentLines.map((line) => ({
            label: `Paid · ${line.method}${line.date ? ` · ${formatDate(line.date)}` : ""}`,
            value: formatMoney(line.amount),
          })),
        ]}
        totalValue={doc.total}
        paid={doc.paid}
        balanceDue={doc.balanceDue}
      />
    </DocumentSheet>
  );
}
