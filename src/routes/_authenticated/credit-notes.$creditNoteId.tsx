import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Printer, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { ApplyCreditDialog } from "@/components/ApplyCreditDialog";
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

      <article className="invoice-sheet surface-card space-y-8 p-6 sm:p-10">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 space-y-1">
            <p className="text-lg font-semibold">{settings?.business_name ?? "Fragrance"}</p>
            {settings?.business_address && (
              <p className="whitespace-pre-line text-sm text-muted-foreground">
                {settings.business_address}
              </p>
            )}
            {settings?.business_phone && (
              <p className="text-sm text-muted-foreground">{settings.business_phone}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tracking-tight">CREDIT NOTE</p>
            <p className="numeric mt-1 text-sm text-muted-foreground">
              {note.credit_note_number}
            </p>
          </div>
        </header>

        <section className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Credit To
            </p>
            <p className="mt-1 text-sm font-semibold">
              {note.customers ? (
                <Link
                  to="/customers/$customerId"
                  params={{ customerId: note.customers.id }}
                  className="hover:underline"
                >
                  {note.customers.name}
                </Link>
              ) : (
                "—"
              )}
            </p>
            {note.customers?.phone && (
              <p className="text-sm text-muted-foreground">{note.customers.phone}</p>
            )}
            {note.customers?.address && (
              <p className="whitespace-pre-line text-sm text-muted-foreground">
                {note.customers.address}
              </p>
            )}
          </div>
          <dl className="space-y-1 text-sm sm:text-right">
            <div className="flex justify-between sm:justify-end sm:gap-6">
              <dt className="text-muted-foreground">Date</dt>
              <dd className="font-medium">{formatDate(note.credit_note_date)}</dd>
            </div>
            <div className="flex justify-between sm:justify-end sm:gap-6">
              <dt className="text-muted-foreground">Linked Return</dt>
              <dd className="font-medium">
                {note.sales_returns ? (
                  <Link
                    to="/sales-returns/$returnId"
                    params={{ returnId: note.sales_returns.id }}
                    className="no-print hover:underline"
                  >
                    {note.sales_returns.return_number}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="flex justify-between sm:justify-end sm:gap-6">
              <dt className="text-muted-foreground">Reason</dt>
              <dd className="font-medium">{note.reason ?? "—"}</dd>
            </div>
          </dl>
        </section>

        <section className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Description</th>
                <th className="py-2 pr-3 text-right">Qty</th>
                <th className="py-2 pr-3 text-right">Rate</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {note.credit_note_items.map((item, index) => (
                <tr key={item.id} className="border-b border-border/60">
                  <td className="py-3 pr-3 text-muted-foreground">{index + 1}</td>
                  <td className="py-3 pr-3 font-medium">{item.description}</td>
                  <td className="numeric py-3 pr-3 text-right">
                    {item.quantity === null ? "—" : Number(item.quantity)}
                  </td>
                  <td className="numeric py-3 pr-3 text-right">{formatMoney(item.unit_price)}</td>
                  <td className="numeric py-3 text-right font-medium">
                    {formatMoney(item.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="flex flex-col gap-6 sm:flex-row sm:justify-between">
          <p className="max-w-sm text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Total in words: </span>
            {amountInWords(note.total_amount)}
          </p>
          <dl className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="numeric font-medium">{formatMoney(note.subtotal)}</dd>
            </div>
            {Number(note.tax_amount) > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax</dt>
                <dd className="numeric font-medium">{formatMoney(note.tax_amount)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-border pt-2">
              <dt className="font-semibold">Credit Total</dt>
              <dd className="numeric text-xl font-bold">{formatMoney(note.total_amount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Amount applied</dt>
              <dd className="numeric font-medium">{formatMoney(note.amount_applied)}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-border pt-2">
              <dt className="font-semibold">Remaining balance</dt>
              <dd className="numeric text-lg font-bold">{formatMoney(remaining)}</dd>
            </div>
          </dl>
        </section>

        {note.credit_note_applications.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold">Applied against</h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-y border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Bill</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {note.credit_note_applications.map((a) => (
                  <tr key={a.id} className="border-b border-border/60">
                    <td className="py-3 pr-3 text-muted-foreground">{formatDate(a.applied_date)}</td>
                    <td className="py-3 pr-3 font-medium">
                      <Link
                        to="/bills/$billId"
                        params={{ billId: a.bill_id }}
                        className="hover:underline"
                      >
                        {a.bills?.bill_number ?? "Bill"}
                      </Link>
                    </td>
                    <td className="numeric py-3 text-right font-medium">
                      {formatMoney(a.amount_applied)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </article>

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
