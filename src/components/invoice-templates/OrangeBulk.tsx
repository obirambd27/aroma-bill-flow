import { DocumentSheet } from "@/components/DocumentSheet";
import { DocQrCodes } from "@/components/WhatsAppQr";
import { formatDate, formatMoney } from "@/lib/format";
import type { InvoiceDoc } from "@/lib/invoice-doc";
import { cn } from "@/lib/utils";

/** "Orange Bulk" — bold wordmark, accent table header, wide totals bar. */
export function OrangeBulkTemplate({ doc }: { doc: InvoiceDoc }) {
  const b = doc.business;
  const first = b.name.slice(0, 1);
  const rest = b.name.slice(1);

  const head = (
    <div className="px-6 pt-8 sm:px-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {b.logoUrl && (
            <img
              src={b.logoUrl}
              alt={`${b.name} logo`}
              className="doc-logo h-12 w-12 shrink-0 object-contain"
            />
          )}
          <div className="min-w-0">
            <p className="break-words font-display text-2xl font-extrabold leading-tight tracking-tight">
              <span className="text-doc-accent">{first}</span>
              {rest}
            </p>
            {b.tagline && (
              <p className="mt-1 text-[10px] uppercase tracking-[0.28em] text-doc-muted">
                {b.tagline}
              </p>
            )}
          </div>
        </div>
        <p className="font-display text-3xl font-extrabold uppercase tracking-tight text-doc-accent sm:text-4xl">
          {doc.docLabel}
        </p>
      </div>

      {/* Decorative split rule */}
      <div className="mt-4 flex h-1.5 w-full overflow-hidden rounded-full">
        <span className="h-full w-[45%] bg-doc-accent" />
        <span className="h-full flex-1 bg-doc-line" />
      </div>

      {/* Meta row */}
      <div className="grid gap-4 border-b border-doc-line py-4 sm:grid-cols-3">
        <Meta label={`${doc.docLabel} No.`} value={doc.number} />
        <Meta label="Date" value={formatDate(doc.date)} />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-doc-muted">
            Invoice To:
          </p>
          <p className="mt-1 break-words font-display text-sm font-bold">{doc.customer.name}</p>
          {doc.customer.secondary && (
            <p className="break-words text-xs text-doc-muted">{doc.customer.secondary}</p>
          )}
        </div>
      </div>

      {/* Due row */}
      <div className="flex flex-wrap items-start justify-between gap-6 py-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-doc-muted">
            Total Due
          </p>
          <p className="numeric mt-1 font-display text-3xl font-extrabold text-doc-ink">
            {formatMoney(doc.balanceDue)}
          </p>
        </div>
        <div className="space-y-1 text-xs text-doc-muted sm:text-right">
          {[b.address, b.phone, b.email].filter(Boolean).map((line, i) => (
            <p key={i} className="break-words [overflow-wrap:anywhere]">
              {line}
            </p>
          ))}
          {b.taxId && <p>TRN: {b.taxId}</p>}
        </div>
      </div>
    </div>
  );

  const foot = (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-doc-line px-6 py-5 text-[11px] text-doc-muted sm:px-10">
      <div className="min-w-0 space-y-0.5">
        {[b.address, b.phone, b.email].filter(Boolean).map((line, i) => (
          <p key={i} className="break-words [overflow-wrap:anywhere]">
            {line}
          </p>
        ))}
        <p className="italic">
          This is a computer generated bill and does not require a signature.
        </p>
      </div>
      <div className="flex items-center gap-3 text-right">
        <DocQrCodes codes={b.qrCodes} size={68} />
        <div>
          <p className="font-display text-sm font-bold text-doc-ink">
            <span className="text-doc-accent">{first}</span>
            {rest}
          </p>
          {b.tagline && (
            <p className="text-[9px] uppercase tracking-[0.24em]">{b.tagline}</p>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <DocumentSheet className="doc-orange" runningHead={head} runningFoot={foot}>
      {/* Items */}
      <div className="px-6 sm:px-10">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-doc-accent text-doc-accent-foreground">
              <Th className="w-10 text-left">#</Th>
              <Th className="text-left">Item</Th>
              <Th className="text-right">Unit Price</Th>
              <Th className="text-right">Qty</Th>
              <Th className="text-right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((item, i) => (
              <tr key={item.key} className={i % 2 === 0 ? "bg-doc-tint" : "bg-doc-sheet"}>
                <Td className="numeric text-left text-doc-muted">{i + 1}</Td>
                <Td className="text-left">
                  <span className="break-words font-semibold [overflow-wrap:anywhere]">
                    {item.name}
                  </span>
                </Td>
                <Td className="numeric text-right text-doc-muted">
                  {formatMoney(item.unitPrice)}
                </Td>
                <Td className="numeric text-right text-doc-muted">{item.quantity}</Td>
                <Td className="numeric text-right font-bold">{formatMoney(item.lineTotal)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom: payment info + totals */}
      <div className="grid gap-8 px-6 pt-8 sm:grid-cols-2 sm:px-10">
        <div className="space-y-4">
          {b.bankDetails && (
            <div>
              <p className="font-display text-sm font-bold">Payment Method We Accept</p>
              <p className="mt-2 whitespace-pre-line break-words text-xs text-doc-muted">
                {b.bankDetails}
              </p>
            </div>
          )}
          {doc.amountInWordsLabel && (
            <p className="text-xs text-doc-muted">
              <span className="font-semibold text-doc-ink">Total in words: </span>
              {doc.amountInWordsLabel}
            </p>
          )}
          {b.terms && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-doc-muted">
                Terms
              </p>
              <p className="mt-1 whitespace-pre-line break-words text-xs text-doc-muted">
                {b.terms}
              </p>
            </div>
          )}
        </div>

        <dl className="space-y-2 text-sm">
          <Row label="Subtotal" value={formatMoney(doc.subtotal)} />
          {doc.isTaxed && (
            <Row label={`Tax (${doc.taxRate}%)`} value={formatMoney(doc.taxAmount)} />
          )}
          {doc.discountAmount > 0 && (
            <Row label="Discount" value={`−${formatMoney(doc.discountAmount)}`} />
          )}
          {doc.paymentLines.map((line) => (
            <Row
              key={line.key}
              label={`Paid · ${line.method}${line.date ? ` · ${formatDate(line.date)}` : ""}`}
              value={formatMoney(line.amount)}
            />
          ))}
          <Row label="Amount Paid" value={formatMoney(doc.paid)} />
          <Row label="Balance Due" value={formatMoney(doc.balanceDue)} />
          <div className="mt-3 flex items-center justify-between gap-4 bg-doc-accent px-4 py-3 text-doc-accent-foreground">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
              Grand Total
            </span>
            <span className="numeric font-display text-xl font-bold">
              {formatMoney(doc.total)}
            </span>
          </div>
        </dl>
      </div>

      {/* Signature */}
      <div className="px-6 pt-8 sm:px-10">
        <div className="ml-auto w-fit text-right">
          {b.signatureUrl ? (
            <img
              src={b.signatureUrl}
              alt="Authorised signature"
              className="ml-auto h-14 object-contain"
            />
          ) : (
            <p className="font-display text-2xl italic text-doc-ink">{b.name}</p>
          )}
          <p className="mt-1 border-t border-doc-line pt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-doc-label">
            {b.signatoryLabel}
          </p>
        </div>
      </div>

      {b.footerNote && (
        <p className="px-6 pt-6 text-center text-xs text-doc-muted sm:px-10">{b.footerNote}</p>
      )}
    </DocumentSheet>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-doc-muted">
        {label}
      </p>
      <p className="numeric mt-1 font-display text-sm font-bold">{value}</p>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em]",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2.5 align-top", className)}>{children}</td>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-doc-muted">{label}</dt>
      <dd className="numeric font-medium">{value}</dd>
    </div>
  );
}
