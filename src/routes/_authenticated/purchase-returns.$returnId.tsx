import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
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

      <article className="print-document surface-card mx-auto w-full max-w-3xl space-y-6 p-6 sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
          <div>
            <h1 className="text-xl font-bold">{settings?.business_name ?? "Fragrance Billing"}</h1>
            <p className="text-xs text-muted-foreground">{settings?.business_address}</p>
            <p className="text-xs text-muted-foreground">{settings?.business_phone}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Purchase Return</p>
            <p className="text-lg font-bold">{ret.return_number}</p>
            <p className="text-xs text-muted-foreground">{formatDate(ret.return_date)}</p>
            <div className="mt-2 flex justify-end">
              <StatusBadge tone={purchaseReturnTone(ret.status)}>{ret.status}</StatusBadge>
            </div>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Vendor</p>
            <p className="text-sm font-medium">{ret.vendors?.name ?? "—"}</p>
            {ret.vendors?.address && (
              <p className="text-xs text-muted-foreground">{ret.vendors.address}</p>
            )}
            {ret.vendors?.phone && (
              <p className="text-xs text-muted-foreground">{ret.vendors.phone}</p>
            )}
          </div>
          <div className="sm:text-right">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Details</p>
            <p className="text-sm">Warehouse: {ret.warehouses?.name ?? "—"}</p>
            <p className="text-sm">
              Against:{" "}
              {ret.purchase_bills ? (
                <Link
                  to="/purchase-bills/$purchaseBillId"
                  params={{ purchaseBillId: ret.purchase_bills.id }}
                  className="font-medium underline underline-offset-2"
                >
                  {ret.purchase_bills.bill_number ?? "Purchase bill"}
                </Link>
              ) : (
                "Standalone"
              )}
            </p>
            {ret.reason && <p className="text-sm text-muted-foreground">Reason: {ret.reason}</p>}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <th className="py-2">Item</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Unit Cost</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {ret.purchase_return_items.map((i) => (
                <tr key={i.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5 font-medium">{i.product_name_snapshot}</td>
                  <td className="numeric py-2.5 text-right">{Number(i.quantity)}</td>
                  <td className="numeric py-2.5 text-right">{formatMoney(i.unit_cost)}</td>
                  <td className="numeric py-2.5 text-right">{formatMoney(i.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ml-auto w-full max-w-xs space-y-2 border-t border-border pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="numeric">{formatMoney(ret.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Tax</span>
            <span className="numeric">{formatMoney(ret.tax_amount)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-2">
            <span className="text-sm font-medium">Total</span>
            <span className="numeric text-xl font-bold">{formatMoney(ret.total_amount)}</span>
          </div>
        </div>

        {ret.notes && (
          <p className="border-t border-border pt-4 text-xs text-muted-foreground">{ret.notes}</p>
        )}
      </article>

      <JournalSection
        linkColumn="related_return_id"
        linkId={ret.id}
        locationName={ret.warehouses?.name ?? null}
      />
    </div>
  );
}
