import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Printer, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { ApplyCreditDialog } from "@/components/ApplyCreditDialog";
import {
  DocFooter,
  DocHero,
  DocItemsList,
  DocPartyCards,
  DocTotals,
  DocumentSheet,
} from "@/components/DocumentSheet";
import { useSettings } from "@/lib/data";
import { creditTone, useCreditNote } from "@/lib/returns";
import { formatDate, formatMoney } from "@/lib/format";
import { amountInWords } from "@/lib/amount-words";

export const Route = createFileRoute("/_authenticated/credit-notes/$creditNoteId")({
  head: () => ({
    meta: [
      { title: "Credit Note — Fragrance Billing" },
      { name: "description", content: "Credit note detail, applied amounts and remaining balance." },
      { property: "og:title", content: "Credit Note — Fragrance Billing" },
      {
        property: "og:description",
        content: "Credit note detail, applied amounts and remaining balance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CreditNoteDetail,
});

function CreditNoteDetail() {
  const { creditNoteId } = Route.useParams();
  const navigate = useNavigate();
  const { data: note, isLoading } = useCreditNote(creditNoteId);
  const { data: settings } = useSettings();
  const [applyOpen, setApplyOpen] = useState(false);

  if (isLoading) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Loading credit note…</p>;
  }
  if (!note) {
    return (
      <div className="space-y-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">This credit note no longer exists.</p>
        <Button asChild variant="outline">
          <Link to="/credit-notes">Back to Credit Notes</Link>
        </Button>
      </div>
    );
  }

  const remaining = Number(note.total_amount) - Number(note.amount_applied);

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/credit-notes" })}>
          <ArrowLeft />
          Credit Notes
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer />
            Print / PDF
          </Button>
          {remaining > 0.001 && note.customers && (
            <Button size="sm" onClick={() => setApplyOpen(true)}>
              <Wallet />
              Apply to Bill
            </Button>
          )}
        </div>
      </div>

      <div className="no-print flex flex-wrap items-center gap-2">
        <StatusBadge tone={creditTone(note.status)}>{note.status}</StatusBadge>
        <span className="numeric text-xs text-muted-foreground">
          {formatMoney(remaining)} remaining of {formatMoney(note.total_amount)}
        </span>
      </div>

      <DocumentSheet>
        <DocHero
          logoUrl={settings?.business_logo_url}
          businessName={settings?.business_name ?? "Fragrance"}
          tagline={settings?.business_tagline}
          chipLabel="Credit Note"
          documentNumber={note.credit_note_number}
          stats={[
            { label: "Issued", value: formatDate(note.credit_note_date) },
            { label: "Credit Total", value: formatMoney(note.total_amount) },
            { label: "Remaining", value: formatMoney(remaining) },
          ]}
        />

        <DocPartyCards
          left={{
            title: "Credit To",
            name: note.customers?.name ?? "—",
            lines: [note.customers?.address, note.customers?.phone],
          }}
          right={{
            title: "From",
            name: settings?.business_name ?? "—",
            lines: [
              settings?.business_address,
              settings?.business_phone,
              settings?.business_email,
              note.sales_returns ? `Return: ${note.sales_returns.return_number}` : null,
              note.reason ? `Reason: ${note.reason}` : null,
            ],
          }}
        />

        <DocItemsList
          items={note.credit_note_items.map((item) => ({
            key: item.id,
            name: item.description,
            quantity: item.quantity === null ? "—" : Number(item.quantity),
            unitPrice: item.unit_price,
            lineTotal: item.line_total,
          }))}
        />

        <DocTotals
          rows={[
            { label: "Subtotal", value: formatMoney(note.subtotal) },
            ...(Number(note.tax_amount) > 0
              ? [{ label: "Tax", value: formatMoney(note.tax_amount) }]
              : []),
            { label: "Amount applied", value: formatMoney(note.amount_applied) },
            { label: "Remaining balance", value: formatMoney(remaining) },
          ]}
          totalLabel="Credit Total"
          totalValue={note.total_amount}
        />

        {note.credit_note_applications.length > 0 && (
          <section className="px-6 pt-8 sm:px-10">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-doc-label">
              Applied against
            </p>
            <div className="mt-2 space-y-1">
              {note.credit_note_applications.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-4 rounded-2xl bg-doc-tint px-4 py-2.5 text-sm"
                >
                  <span className="text-doc-muted">{formatDate(a.applied_date)}</span>
                  <Link
                    to="/bills/$billId"
                    params={{ billId: a.bill_id }}
                    className="font-semibold hover:underline"
                  >
                    {a.bills?.bill_number ?? "Bill"}
                  </Link>
                  <span className="numeric font-semibold">{formatMoney(a.amount_applied)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <DocFooter
          paymentDetails={settings?.bank_payment_details}
          terms={settings?.terms_and_conditions}
          signatureUrl={settings?.signature_url}
          businessName={settings?.business_name ?? "—"}
        >
          <p className="mb-5 text-xs text-doc-muted">
            <span className="font-semibold text-doc-ink">Total in words: </span>
            {amountInWords(note.total_amount)}
          </p>
        </DocFooter>
      </DocumentSheet>

      {note.customers && (
        <ApplyCreditDialog
          open={applyOpen}
          onOpenChange={setApplyOpen}
          creditNoteId={note.id}
          creditNoteNumber={note.credit_note_number}
          customerId={note.customers.id}
          customerName={note.customers.name}
          remaining={remaining}
        />
      )}
    </div>
  );
}
