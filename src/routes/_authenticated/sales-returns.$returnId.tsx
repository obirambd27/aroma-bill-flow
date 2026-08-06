import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { useSettings } from "@/lib/data";
import { createCreditNoteFromReturn, returnTone, useSalesReturn } from "@/lib/returns";
import { formatDate, formatMoney } from "@/lib/format";
import { amountInWords } from "@/lib/amount-words";

export const Route = createFileRoute("/_authenticated/sales-returns/$returnId")({
  head: () => ({
    meta: [
      { title: "Sales Return — Fragrance Billing" },
      { name: "description", content: "Returned items, restocked warehouse and credit issued." },
      { property: "og:title", content: "Sales Return — Fragrance Billing" },
      {
        property: "og:description",
        content: "Returned items, restocked warehouse and credit issued.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SalesReturnDetail,
});

function SalesReturnDetail() {
  const { returnId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: ret, isLoading } = useSalesReturn(returnId);
  const { data: settings } = useSettings();
  const [working, setWorking] = useState(false);

  if (isLoading) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Loading return…</p>;
  }
  if (!ret) {
    return (
      <div className="space-y-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">This sales return no longer exists.</p>
        <Button asChild variant="outline">
          <Link to="/sales-returns">Back to Sales Returns</Link>
        </Button>
      </div>
    );
  }

  const generateCredit = async () => {
    setWorking(true);
    try {
      const note = await createCreditNoteFromReturn(ret);
      queryClient.invalidateQueries();
      toast.success(`Credit note ${note.credit_note_number ?? ""} created`);
      void navigate({ to: "/credit-notes/$creditNoteId", params: { creditNoteId: note.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the credit note");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/sales-returns" })}>
          <ArrowLeft />
          Sales Returns
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer />
            Print / PDF
          </Button>
          {ret.credit_notes ? (
            <Button asChild size="sm" variant="outline">
              <Link
                to="/credit-notes/$creditNoteId"
                params={{ creditNoteId: ret.credit_notes.id }}
              >
                <FileText />
                {ret.credit_notes.credit_note_number}
              </Link>
            </Button>
          ) : (
            ret.status === "Completed" && (
              <Button size="sm" disabled={working} onClick={generateCredit}>
                <FileText />
                {working ? "Creating…" : "Generate Credit Note"}
              </Button>
            )
          )}
        </div>
      </div>

      <div className="no-print flex flex-wrap items-center gap-2">
        <StatusBadge tone={returnTone(ret.status)}>{ret.status}</StatusBadge>
        {ret.reason && <span className="text-xs text-muted-foreground">{ret.reason}</span>}
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
            <p className="text-2xl font-bold tracking-tight">SALES RETURN</p>
            <p className="numeric mt-1 text-sm text-muted-foreground">{ret.return_number}</p>
          </div>
        </header>

        <section className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Returned By
            </p>
            <p className="mt-1 text-sm font-semibold">
              {ret.customers ? (
                <Link
                  to="/customers/$customerId"
                  params={{ customerId: ret.customers.id }}
                  className="hover:underline"
                >
                  {ret.customers.name}
                </Link>
              ) : (
                "Walk-in Customer"
              )}
            </p>
            {ret.customers?.phone && (
              <p className="text-sm text-muted-foreground">{ret.customers.phone}</p>
            )}
            {ret.customers?.address && (
              <p className="whitespace-pre-line text-sm text-muted-foreground">
                {ret.customers.address}
              </p>
            )}
          </div>
          <dl className="space-y-1 text-sm sm:text-right">
            <div className="flex justify-between sm:justify-end sm:gap-6">
              <dt className="text-muted-foreground">Return Date</dt>
              <dd className="font-medium">{formatDate(ret.return_date)}</dd>
            </div>
            <div className="flex justify-between sm:justify-end sm:gap-6">
              <dt className="text-muted-foreground">Original Bill</dt>
              <dd className="font-medium">
                {ret.bills ? (
                  <Link
                    to="/bills/$billId"
                    params={{ billId: ret.bills.id }}
                    className="no-print hover:underline"
                  >
                    {ret.bills.bill_number}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="flex justify-between sm:justify-end sm:gap-6">
              <dt className="text-muted-foreground">Restocked To</dt>
              <dd className="font-medium">{ret.warehouses?.name ?? "—"}</dd>
            </div>
            <div className="flex justify-between sm:justify-end sm:gap-6">
              <dt className="text-muted-foreground">Reason</dt>
              <dd className="font-medium">{ret.reason ?? "—"}</dd>
            </div>
          </dl>
        </section>

        <section className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 pr-3 text-right">Qty</th>
                <th className="py-2 pr-3 text-right">Rate</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {ret.sales_return_items.map((item, index) => (
                <tr key={item.id} className="border-b border-border/60">
                  <td className="py-3 pr-3 text-muted-foreground">{index + 1}</td>
                  <td className="py-3 pr-3 font-medium">{item.product_name_snapshot}</td>
                  <td className="numeric py-3 pr-3 text-right">{Number(item.quantity)}</td>
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
            {amountInWords(ret.total_amount)}
          </p>
          <dl className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="numeric font-medium">{formatMoney(ret.subtotal)}</dd>
            </div>
            {Number(ret.tax_amount) > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax</dt>
                <dd className="numeric font-medium">{formatMoney(ret.tax_amount)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-border pt-2">
              <dt className="font-semibold">Return Total</dt>
              <dd className="numeric text-xl font-bold">{formatMoney(ret.total_amount)}</dd>
            </div>
          </dl>
        </section>

        {ret.notes && (
          <footer className="border-t border-border pt-4 text-sm text-muted-foreground">
            <p className="whitespace-pre-line">{ret.notes}</p>
          </footer>
        )}
      </article>
    </div>
  );
}
