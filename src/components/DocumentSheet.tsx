import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";

/**
 * "Velvet & Oud" document template — shared visual language for every
 * printable document in the system (invoices, purchase bills, returns,
 * delivery notes, credit notes).
 */

export function DocumentSheet({
  children,
  className,
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className="doc-stage no-print-bg -mx-2 rounded-[32px] bg-doc-page p-2 sm:p-6 print:m-0 print:bg-transparent print:p-0">
      <article
        className={cn(
          "invoice-sheet doc-sheet relative isolate mx-auto w-full max-w-3xl overflow-hidden rounded-[28px] bg-doc-sheet font-sans text-doc-ink",
          "shadow-[0_24px_60px_-20px_oklch(0.541_0.246_293_/_0.35)]",
          className,
        )}
      >
        {/* Decorative blurred blobs — screen only */}
        <span
          aria-hidden
          className="doc-blob pointer-events-none absolute -left-24 top-40 -z-10 h-64 w-64 rounded-full bg-doc-accent/15 blur-3xl"
        />
        <span
          aria-hidden
          className="doc-blob pointer-events-none absolute -right-20 bottom-10 -z-10 h-72 w-72 rounded-full bg-doc-accent/10 blur-3xl"
        />
        {children}
      </article>
    </div>
  );
}

export type DocStat = { label: string; value: string };

export function DocHero({
  logoUrl,
  icon,
  businessName,
  tagline,
  chipLabel,
  documentNumber,
  stats,
}: {
  logoUrl?: string | null | undefined;
  icon?: ReactNode | undefined;
  businessName: string;
  tagline?: string | null | undefined;
  chipLabel: string;
  documentNumber: string;
  stats: DocStat[];
}) {
  return (
    <header className="relative overflow-hidden bg-doc-accent px-6 py-7 text-doc-accent-foreground sm:px-10 sm:py-9">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-white/10"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-28 left-24 h-52 w-52 rounded-full bg-white/[0.07]"
      />

      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="doc-logo flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-1.5">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={`${businessName} logo`}
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="text-doc-accent">{icon ?? <BottleIcon />}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="break-words font-display text-xl font-bold leading-tight sm:text-2xl">
              {businessName}
            </p>
            {tagline && (
              <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-white/75">
                {tagline}
              </p>
            )}
          </div>
        </div>

        <div className="text-right">
          <span className="inline-block rounded-full bg-white/20 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]">
            {chipLabel}
          </span>
          <p className="numeric mt-2 font-display text-lg font-bold">{documentNumber}</p>
        </div>
      </div>

      <div className="relative mt-7 flex flex-wrap gap-x-10 gap-y-4">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/70">{s.label}</p>
            <p className="numeric font-display text-base font-bold">{s.value}</p>
          </div>
        ))}
      </div>
    </header>
  );
}

export function DocPartyCards({
  left,
  right,
}: {
  left: { title: string; name: string; lines: (string | null | undefined)[] };
  right: { title: string; name: string; lines: (string | null | undefined)[] };
}) {
  return (
    <section className="grid gap-4 px-6 pt-7 sm:grid-cols-2 sm:px-10">
      {[left, right].map((party) => (
        <div key={party.title} className="rounded-2xl bg-doc-tint p-4 sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-doc-label">
            {party.title}
          </p>
          <p className="mt-2 font-display text-base font-bold">{party.name}</p>
          <div className="mt-1 space-y-0.5 text-xs text-doc-muted">
            {party.lines.filter(Boolean).map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

export type DocItem = {
  key: string;
  name: string;
  subtitle?: string | null | undefined;
  quantity: number | string;
  unitPrice?: number | string | undefined;
  lineTotal?: number | string | undefined;
};

export function DocItemsList({
  items,
  qtyLabel = "Qty",
  showPrices = true,
}: {
  items: DocItem[];
  qtyLabel?: string | undefined;
  showPrices?: boolean | undefined;
}) {
  const cols = showPrices
    ? "grid-cols-[1fr_auto_auto_auto]"
    : "grid-cols-[1fr_auto]";
  return (
    <section className="px-6 pt-8 sm:px-10">
      <div className={cn(
        "grid items-center gap-3 px-3 pb-2",
        cols, "text-[10px] font-semibold uppercase tracking-[0.16em] text-doc-label sm:gap-6",
      )}>
        <span>Product</span>
        <span className="w-12 text-center">{qtyLabel}</span>
        {showPrices && <span className="w-20 text-right sm:w-24">Price</span>}
        {showPrices && <span className="w-20 text-right sm:w-28">Total</span>}
      </div>

      <div className="space-y-1">
        {items.map((item, index) => (
          <div
            key={item.key}
            className={cn(
              "grid items-center gap-3 rounded-2xl px-3 py-3 sm:gap-6",
              cols,
              index % 2 === 0 ? "bg-doc-tint" : "bg-doc-sheet",
            )}
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="numeric mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-doc-accent text-[10px] font-bold text-doc-accent-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{item.name}</p>
                {item.subtitle && (
                  <p className="truncate text-xs text-doc-muted">{item.subtitle}</p>
                )}
              </div>
            </div>
            <span className="numeric inline-flex w-12 justify-center rounded-full bg-doc-accent/10 px-2 py-1 text-xs font-semibold text-doc-label">
              {item.quantity}
            </span>
            {showPrices && (
              <span className="numeric w-20 text-right text-xs text-doc-muted sm:w-24">
                {formatMoney(item.unitPrice ?? 0)}
              </span>
            )}
            {showPrices && (
              <span className="numeric w-20 text-right text-sm font-bold sm:w-28">
                {formatMoney(item.lineTotal ?? 0)}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export type DocStamp = { text: string; sub?: string | null | undefined; tone: "paid" | "unpaid" | "partial" };

const stampTone: Record<DocStamp["tone"], string> = {
  paid: "border-success text-success",
  unpaid: "border-destructive text-destructive",
  partial: "border-warning text-warning",
};

export function DocTotals({
  rows,
  totalLabel = "Total Due",
  totalValue,
  stamp,
}: {
  rows: { label: string; value: string }[];
  totalLabel?: string;
  totalValue: number | string;
  stamp?: DocStamp | null | undefined;
}) {
  return (
    <section className="flex flex-wrap items-end justify-between gap-6 px-6 pt-8 sm:px-10">
      {stamp ? (
        <div
          className={cn(
            "flex h-28 w-28 -rotate-12 flex-col items-center justify-center rounded-full border-[3px] text-center",
            stampTone[stamp.tone],
          )}
        >
          <span className="font-display text-lg font-bold uppercase tracking-[0.12em]">
            {stamp.text}
          </span>
          {stamp.sub && <span className="numeric mt-0.5 text-[10px]">{stamp.sub}</span>}
        </div>
      ) : (
        <span />
      )}

      <dl className="ml-auto w-full max-w-xs space-y-2 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-4">
            <dt className="text-doc-muted">{row.label}</dt>
            <dd className="numeric font-medium">{row.value}</dd>
          </div>
        ))}
        <div className="mt-3 flex items-center justify-between gap-4 rounded-2xl bg-doc-accent px-4 py-3 text-doc-accent-foreground">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">
            {totalLabel}
          </span>
          <span className="numeric font-display text-xl font-bold">{formatMoney(totalValue)}</span>
        </div>
      </dl>
    </section>
  );
}

export function DocFooter({
  paymentDetails,
  terms,
  note,
  signatureUrl,
  businessName,
  children,
}: {
  paymentDetails?: string | null | undefined;
  terms?: string | null | undefined;
  note?: string | null | undefined;
  signatureUrl?: string | null | undefined;
  businessName: string;
  children?: ReactNode | undefined;
}) {
  return (
    <footer className="mt-8 border-t border-dashed border-doc-line px-6 py-7 sm:px-10">
      {children}
      <div className="flex flex-col gap-6 sm:flex-row sm:justify-between">
        {paymentDetails ? (
          <div className="max-w-xs">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-doc-label">
              Payment Information
            </p>
            <p className="mt-2 whitespace-pre-line text-xs text-doc-muted">{paymentDetails}</p>
          </div>
        ) : (
          <span />
        )}

        <div className="max-w-xs sm:text-right">
          {terms && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-doc-label">
                Terms
              </p>
              <p className="mt-2 whitespace-pre-line text-xs text-doc-muted">{terms}</p>
            </>
          )}
          {note && <p className="mt-2 text-xs text-doc-muted">{note}</p>}
          {signatureUrl ? (
            <div className="mt-4 sm:flex sm:flex-col sm:items-end">
              <img src={signatureUrl} alt="Authorised signature" className="h-14 object-contain" />
              <p className="mt-1 font-display text-sm font-bold text-doc-label">{businessName}</p>
              <p className="text-[10px] uppercase tracking-[0.16em] text-doc-muted">
                Authorized Signatory
              </p>
            </div>
          ) : (
            <p className="mt-3 text-[11px] italic text-doc-muted">
              This is a computer generated bill and does not require a signature.
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}

function BottleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 2h4v3h-4z" />
      <path d="M9 5h6a4 4 0 0 1 4 4v9a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9a4 4 0 0 1 4-4Z" />
      <path d="M8.5 12h7" />
    </svg>
  );
}
