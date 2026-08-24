import { DocumentSheet } from "@/components/DocumentSheet";
import { DocQrCodes } from "@/components/WhatsAppQr";
import { formatDate, formatMoney } from "@/lib/format";
import type { InvoiceDoc } from "@/lib/invoice-doc";
import { cn } from "@/lib/utils";

/**
 * "GST Classic" — plain, fully bordered black-and-white invoice.
 * Everything sits inside one outer box; head/foot repeat on printed pages.
 */

/** Rows the items table is padded to, so a short bill still prints a full grid. */
const MIN_ROWS = 12;

export function GstClassicTemplate({ doc }: { doc: InvoiceDoc }) {
  const b = doc.business;
  const title = doc.isTaxed ? "TAX INVOICE" : "INVOICE";
  const fillers = Math.max(0, MIN_ROWS - doc.items.length);

  const head = (
    <div className="border-b border-doc-line">
      <p className="border-b border-doc-line py-1.5 text-center font-display text-base font-bold uppercase tracking-[0.24em]">
        {title}
      </p>
      <div className="flex items-stretch">
        <div className="flex w-24 shrink-0 items-center justify-center border-r border-doc-line p-2">
          {b.logoUrl ? (
            <img src={b.logoUrl} alt={`${b.name} logo`} className="doc-logo max-h-16 object-contain" />
          ) : (
            <span className="text-[9px] uppercase tracking-widest text-doc-muted">Logo</span>
          )}
        </div>
        <div className="min-w-0 flex-1 px-3 py-2 text-center">
          <p className="break-words font-display text-lg font-bold uppercase leading-tight">
            {b.name}
          </p>
          {b.tagline && (
            <p className="text-[10px] uppercase tracking-[0.2em] text-doc-muted">{b.tagline}</p>
          )}
          <p className="mt-1 whitespace-pre-line break-words text-[11px] leading-snug">
            {[b.address, b.phone, b.email, b.taxId ? `TRN: ${b.taxId}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      <div className="flex items-stretch border-t border-doc-line">
        <div className="min-w-0 flex-1 border-r border-doc-line p-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em]">Details of Buyer</p>
          <p className="mt-1 break-words text-sm font-bold">{doc.customer.name}</p>
          <div className="text-[11px] leading-snug text-doc-muted [overflow-wrap:anywhere]">
            {[doc.customer.secondary, ...doc.customer.lines].filter(Boolean).map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
        </div>
        <div className="w-56 shrink-0">
          <div className="flex border-b border-doc-line text-[11px]">
            <span className="w-24 shrink-0 border-r border-doc-line p-2 font-semibold">
              Invoice No.
            </span>
            <span className="numeric p-2 font-bold">{doc.number}</span>
          </div>
          <div className="flex text-[11px]">
            <span className="w-24 shrink-0 border-r border-doc-line p-2 font-semibold">Date</span>
            <span className="numeric p-2 font-bold">{formatDate(doc.date)}</span>
          </div>
        </div>
      </div>
    </div>
  );

  const foot = (
    <div className="border-t border-doc-line px-2 py-1 text-[9px] uppercase tracking-[0.14em] text-doc-muted">
      {b.name}
      {b.phone ? ` · ${b.phone}` : ""} — computer generated invoice
    </div>
  );

  return (
    <DocumentSheet className="doc-gst" runningHead={head} runningFoot={foot}>
      {/* Items */}
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="bg-doc-tint">
            <Th className="w-10">Sr No</Th>
            <Th className="text-left">Item Description</Th>
            <Th className="w-14 text-right">Qty</Th>
            <Th className="w-20 text-right">Rate</Th>
            <Th className="w-24 text-right">Total Amount</Th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((item, i) => (
            <tr key={item.key} className={i % 2 === 0 ? "bg-doc-sheet" : "bg-doc-tint/60"}>
              <Td className="numeric text-center">{i + 1}</Td>
              <Td className="break-words [overflow-wrap:anywhere]">{item.name}</Td>
              <Td className="numeric text-right">{item.quantity}</Td>
              <Td className="numeric text-right">{formatMoney(item.unitPrice)}</Td>
              <Td className="numeric text-right font-semibold">{formatMoney(item.lineTotal)}</Td>
            </tr>
          ))}
          {Array.from({ length: fillers }).map((_, i) => (
            <tr key={`filler-${i}`} className="gst-filler">
              <Td>&nbsp;</Td>
              <Td />
              <Td />
              <Td />
              <Td />
            </tr>
          ))}
          <tr className="bg-doc-tint font-bold">
            <Td className="text-center" colSpan={2}>
              Total
            </Td>
            <Td className="numeric text-right">
              {doc.items.reduce((s, i) => s + Number(i.quantity), 0)}
            </Td>
            <Td />
            <Td className="numeric text-right">{formatMoney(doc.total)}</Td>
          </tr>
        </tbody>
      </table>

      {/* Bottom grid */}
      <div className="flex items-stretch border-t border-doc-line text-[11px]">
        {b.bankDetails && (
          <div className="min-w-0 flex-1 border-r border-doc-line p-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em]">
              Company&apos;s Bank Details
            </p>
            <p className="mt-1 whitespace-pre-line break-words leading-snug text-doc-muted">
              {b.bankDetails}
            </p>
          </div>
        )}
        {b.qrCodes.length > 0 && (
          <div className="shrink-0 border-r border-doc-line p-2 text-center">
            <DocQrCodes codes={b.qrCodes} size={68} />
          </div>
        )}
        <div className="min-w-0 flex-1 border-r border-doc-line" />
        <div className="w-56 shrink-0">
          <Line label="Sub Total" value={formatMoney(doc.subtotal)} />
          {doc.isTaxed && (
            <Line label={`Tax (${doc.taxRate}%)`} value={formatMoney(doc.taxAmount)} />
          )}
          {doc.discountAmount > 0 && (
            <Line label="Discount" value={`−${formatMoney(doc.discountAmount)}`} />
          )}
          <Line label="Grand Total" value={formatMoney(doc.total)} bold />
          <Line label="Amount Paid" value={formatMoney(doc.paid)} />
          <div
            className={cn(
              "flex justify-between border-b border-doc-line px-2 py-1.5 text-[12px] font-bold",
              doc.balanceDue <= 0.0001 ? "bg-emerald-100 text-emerald-900" : "bg-doc-tint",
            )}
          >
            <span className="uppercase tracking-[0.1em]">
              {doc.balanceDue <= 0.0001 ? "Balance Due — Paid in Full" : "Balance Due"}
            </span>
            <span className="numeric">{formatMoney(doc.balanceDue)}</span>
          </div>
        </div>
      </div>

      {doc.amountInWordsLabel && (
        <div className="border-t border-doc-line p-2 text-[11px]">
          <span className="font-bold uppercase tracking-[0.14em]">Amount In Word: </span>
          {doc.amountInWordsLabel}
        </div>
      )}


      <div className="gst-declaration flex items-stretch border-t border-doc-line text-[11px]">
        <div className="min-w-0 flex-1 border-r border-doc-line p-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em]">Declaration</p>
          <p className="mt-1 leading-snug text-doc-muted">
            We declare that this invoice shows the actual price of the goods described and that all
            particulars are true and correct.
          </p>
          {b.terms && (
            <p className="mt-1 whitespace-pre-line leading-snug text-doc-muted">{b.terms}</p>
          )}
        </div>
        <div className="w-56 shrink-0 p-2 text-right">
          <p className="font-bold">For {b.name}</p>
          {b.signatureUrl ? (
            <img
              src={b.signatureUrl}
              alt="Authorised signature"
              className="ml-auto mt-1 h-12 object-contain"
            />
          ) : (
            <div className="h-12" />
          )}
          <p className="mt-1 border-t border-doc-line pt-1 text-[10px] uppercase tracking-[0.14em]">
            {b.signatoryLabel}
          </p>
        </div>
      </div>
    </DocumentSheet>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "border border-doc-line px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.1em]",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td className={cn("border border-doc-line px-2 py-1.5 align-top", className)} colSpan={colSpan}>
      {children}
    </td>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={cn("flex justify-between border-b border-doc-line px-2 py-1", bold && "font-bold")}>
      <span>{label}</span>
      <span className="numeric">{value}</span>
    </div>
  );
}

