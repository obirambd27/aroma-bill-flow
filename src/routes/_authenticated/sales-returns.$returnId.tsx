import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import {
  DocFooter,
  DocHero,
  DocItemsList,
  DocPartyCards,
  DocTotals,
  DocumentSheet,
} from "@/components/DocumentSheet";
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
      const note = await createCreditNoteFromReturn({ id: ret.id });
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

      <DocumentSheet>
        <DocHero
          logoUrl={settings?.business_logo_url}
          businessName={settings?.business_name ?? "Fragrance"}
          tagline={settings?.business_tagline}
          chipLabel="Sales Return"
          documentNumber={ret.return_number ?? "Draft"}
          stats={[
            { label: "Return Date", value: formatDate(ret.return_date) },
            { label: "Original Bill", value: ret.bills?.bill_number ?? "—" },
            { label: "Return Total", value: formatMoney(ret.total_amount) },
          ]}
        />

        <DocPartyCards
          left={{
            title: "Returned By",
            name: ret.customers?.name ?? "Walk-in Customer",
            lines: [ret.customers?.address, ret.customers?.phone],
          }}
          right={{
            title: "From",
            name: settings?.business_name ?? "—",
            lines: [
              settings?.business_address,
              settings?.business_phone,
              ret.warehouses?.name ? `Restocked to: ${ret.warehouses.name}` : null,
              ret.reason ? `Reason: ${ret.reason}` : null,
            ],
          }}
        />

        <DocItemsList
          items={ret.sales_return_items.map((item) => ({
            key: item.id,
            name: item.product_name_snapshot,
            quantity: Number(item.quantity),
            unitPrice: item.unit_price,
            lineTotal: item.line_total,
          }))}
        />

        <DocTotals
          rows={[
            { label: "Subtotal", value: formatMoney(ret.subtotal) },
            ...(Number(ret.tax_amount) > 0
              ? [{ label: "Tax", value: formatMoney(ret.tax_amount) }]
              : []),
          ]}
          totalLabel="Return Total"
          totalValue={ret.total_amount}
        />

        <DocFooter
          terms={settings?.terms_and_conditions}
          note={ret.notes}
          signatureUrl={settings?.signature_url}
          businessName={settings?.business_name ?? "—"}
        >
          <p className="mb-5 text-xs text-doc-muted">
            <span className="font-semibold text-doc-ink">Total in words: </span>
            {amountInWords(ret.total_amount)}
          </p>
        </DocFooter>
      </DocumentSheet>
    </div>
  );
}
