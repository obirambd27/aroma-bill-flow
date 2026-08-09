import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import {
  DocFooter,
  DocHero,
  DocItemsList,
  DocPartyCards,
  DocTotals,
  DocumentSheet,
} from "@/components/DocumentSheet";
import { Button } from "@/components/ui/button";
import { JournalSection } from "@/components/JournalSection";
import { usePurchaseReturn, purchaseReturnTone } from "@/lib/purchase-returns";
import { useSettings } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/purchase-returns/$returnId")({
  head: () => ({
    meta: [
      { title: "Purchase Return — Fragrance Billing" },
      { name: "description", content: "Purchase return document with items and journal entries." },
      { property: "og:title", content: "Purchase Return — Fragrance Billing" },
      {
        property: "og:description",
        content: "Purchase return document with items and journal entries.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PurchaseReturnDetailPage,
});

function PurchaseReturnDetailPage() {
  const { returnId } = Route.useParams();
  const { data: ret, isLoading } = usePurchaseReturn(returnId);
  const { data: settings } = useSettings();

  if (isLoading) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Loading return…</p>;
  }
  if (!ret) {
    return (
      <div className="space-y-4">
        <PageHeader title="Purchase return not found" description="This document may have been removed." />
        <Button asChild variant="outline">
          <Link to="/purchase-returns">
            <ArrowLeft />
            Back to Purchase Returns
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/purchase-returns">
            <ArrowLeft />
            Purchase Returns
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer />
          Print
        </Button>
      </div>

      <div className="no-print">
        <StatusBadge tone={purchaseReturnTone(ret.status)}>{ret.status}</StatusBadge>
      </div>

      <DocumentSheet>
        <DocHero
          logoUrl={settings?.business_logo_url}
          businessName={settings?.business_name ?? "Fragrance Billing"}
          tagline={settings?.business_tagline}
          chipLabel="Purchase Return"
          documentNumber={ret.return_number ?? "Draft"}
          stats={[
            { label: "Return Date", value: formatDate(ret.return_date) },
            {
              label: "Against",
              value: ret.purchase_bills?.bill_number ?? "Standalone",
            },
            { label: "Return Total", value: formatMoney(ret.total_amount) },
          ]}
        />

        <DocPartyCards
          left={{
            title: "Vendor",
            name: ret.vendors?.name ?? "—",
            lines: [ret.vendors?.address, ret.vendors?.phone],
          }}
          right={{
            title: "Details",
            name: ret.warehouses?.name ?? "—",
            lines: [
              settings?.business_name,
              settings?.business_phone,
              ret.reason ? `Reason: ${ret.reason}` : null,
            ],
          }}
        />

        <DocItemsList
          items={ret.purchase_return_items.map((i) => ({
            key: i.id,
            name: i.product_name_snapshot,
            quantity: Number(i.quantity),
            unitPrice: i.unit_cost,
            lineTotal: i.line_total,
          }))}
        />

        <DocTotals
          rows={[
            { label: "Subtotal", value: formatMoney(ret.subtotal) },
            { label: "Tax", value: formatMoney(ret.tax_amount) },
          ]}
          totalLabel="Return Total"
          totalValue={ret.total_amount}
        />

        <DocFooter
          note={ret.notes}
          signatureUrl={settings?.signature_url}
          businessName={settings?.business_name ?? "—"}
        />
      </DocumentSheet>

      <JournalSection
        linkColumn="related_return_id"
        linkId={ret.id}
        locationName={ret.warehouses?.name ?? null}
      />
    </div>
  );
}
