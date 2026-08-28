import { DocumentSheet } from "@/components/DocumentSheet";
import { formatDate, formatMoney } from "@/lib/format";

export type DeliveryNoteDoc = {
  number: string;
  date: string;
  buyerName: string;
  buyerAddress: string | null;
  buyerTel: string | null;
  marka: string | null;
  cargoTransport: string | null;
  cargoPhone: string | null;
  totalAmount: number | null;
  advanceAmount: number | null;
  balanceAmount: number | null;
  items: { key: string; name: string; quantity: number; cartonBag: string | null }[];
  business: {
    name: string;
    addressLines: string[];
    phone: string | null;
    email: string | null;
    logoUrl: string | null;
    tagline: string | null;
  };
};

const DASH = "-";
const DOTS = "............";

function money(value: number | null) {
  return value === null || value === undefined ? DOTS : formatMoney(value);
}

/** Delivery Note document — deliberately separate from the invoice templates. */
export function DeliveryNoteSheet({ doc }: { doc: DeliveryNoteDoc }) {
  const b = doc.business;
  const items = doc.items ?? [];

  const totalQty = items.reduce((sum, item) => {
    const n = Number(item.quantity);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);

  // Ctn/Bag is free text — only sum it when every filled value is numeric.
  const cartonValues = items.map((i) => (i.cartonBag ?? "").trim()).filter(Boolean);
  const cartonNumeric =
    cartonValues.length > 0 && cartonValues.every((v) => Number.isFinite(Number(v)));
  const totalCarton = cartonNumeric
    ? cartonValues.reduce((sum, v) => sum + Number(v), 0)
    : null;

  /* Short notes get vertically centred on the printed A4 page instead of
     leaving a large blank area beneath the content. */
  const isShort = items.length <= 8;

  const head = (
    <div className="flex flex-wrap items-start justify-between gap-6 border-b border-doc-line px-8 pb-5 pt-8">
      <div className="flex min-w-0 items-start gap-3">
        {b.logoUrl && (
          <img
            src={b.logoUrl}
            alt={`${b.name} logo`}
            className="doc-logo h-14 w-14 shrink-0 object-contain"
          />
        )}
        <div className="min-w-0">
          <p className="break-words text-xl font-bold leading-tight text-doc-accent">{b.name}</p>
          {b.tagline && (
            <p className="text-[10px] uppercase tracking-[0.24em] text-doc-muted">{b.tagline}</p>
          )}
          {b.addressLines.map((line) => (
            <p key={line} className="mt-0.5 break-words text-xs text-doc-muted">
              {line}
            </p>
          ))}
          {b.phone && <p className="mt-0.5 text-xs text-doc-muted">Tel: {b.phone}</p>}
          {b.email && <p className="text-xs text-doc-muted">{b.email}</p>}
        </div>
      </div>

      <div className="shrink-0 space-y-1 text-right text-xs">
        <p className="text-base font-bold uppercase tracking-[0.3em] text-doc-accent">
          Delivery Note
        </p>
        <MetaRow label="Invoice No" value={doc.number} />
        <MetaRow label="Date" value={formatDate(doc.date)} />
      </div>
    </div>
  );

  return (
    <DocumentSheet className={`doc-dn${isShort ? " doc-dn-short" : ""}`} runningHead={head}>
      <div className="space-y-5 px-8 pb-10 pt-5">
        <div className="space-y-1 text-xs">
          <Field label="Buyer" value={doc.buyerName || DASH} strong />
          <Field label="Address" value={doc.buyerAddress || DASH} />
          <Field label="Tel" value={doc.buyerTel || DASH} />
        </div>

        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-doc-tint text-[10px] uppercase tracking-[0.16em] text-doc-label">
              <th className="w-12 border border-doc-line px-2 py-2 text-left font-semibold">SL</th>
              <th className="border border-doc-line px-2 py-2 text-left font-semibold">
                Description
              </th>
              <th className="w-20 border border-doc-line px-2 py-2 text-right font-semibold">
                Qty
              </th>
              <th className="w-28 border border-doc-line px-2 py-2 text-left font-semibold">
                Ctn/Bag
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="border border-doc-line px-2 py-4 text-center text-doc-muted"
                >
                  No items added
                </td>
              </tr>
            ) : (
              items.map((item, index) => (
                <tr key={item.key} className="break-inside-avoid">
                  <td className="numeric border border-doc-line px-2 py-1.5">{index + 1}</td>
                  <td className="border border-doc-line px-2 py-1.5">{item.name}</td>
                  <td className="numeric border border-doc-line px-2 py-1.5 text-right">
                    {Number.isFinite(Number(item.quantity)) ? item.quantity : 0}
                  </td>
                  <td className="border border-doc-line px-2 py-1.5">{item.cartonBag || ""}</td>
                </tr>
              ))
            )}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr className="break-inside-avoid bg-doc-tint font-bold">
                <td className="border border-doc-line px-2 py-2" />
                <td className="border border-doc-line px-2 py-2 text-right uppercase tracking-[0.12em]">
                  Total
                </td>
                <td className="numeric border border-doc-line px-2 py-2 text-right">{totalQty}</td>
                <td className="numeric border border-doc-line px-2 py-2">
                  {totalCarton === null ? "" : totalCarton}
                </td>
              </tr>
            </tfoot>
          )}
        </table>

        <div className="inline-block border-2 border-doc-accent px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-doc-accent">
          Marka: {doc.marka || DASH}
        </div>

        <div className="space-y-1 text-xs">
          <Field label="Cargo" value={doc.cargoTransport || DASH} />
          <Field label="Phone" value={doc.cargoPhone || DASH} />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-8 border-t border-doc-line pt-4">
          <div className="space-y-1 text-xs">
            <Field label="Total" value={money(doc.totalAmount)} strong />
            <Field label="Advance" value={money(doc.advanceAmount)} />
            <Field label="Balance" value={money(doc.balanceAmount)} strong />
          </div>

          <div className="ml-auto w-52 shrink-0 break-inside-avoid text-center">
            <div className="mt-8 border-b border-doc-ink" />
            <p className="mt-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-doc-accent">
              Received By
            </p>
            <p className="mt-3 text-[10px] text-doc-muted">Name &amp; Date</p>
            <div className="mt-1 border-b border-dotted border-doc-line" />
          </div>
        </div>
      </div>
    </DocumentSheet>
  );
}


function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-end gap-2">
      <span className="text-doc-muted">{label}:</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function Field({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <span className="w-20 shrink-0 text-doc-muted">{label}:</span>
      <span className={strong ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}
