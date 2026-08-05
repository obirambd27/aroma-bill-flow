import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { useBill } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/bills/$billId")({
  head: () => ({
    meta: [
      { title: "Bill Detail — Fragrance Billing" },
      { name: "description", content: "Invoice detail with line items, totals and sync status." },
      { property: "og:title", content: "Bill Detail — Fragrance Billing" },
      {
        property: "og:description",
        content: "Invoice detail with line items, totals and sync status.",
      },
    ],
  }),
  component: BillDetailPage,
});

function BillDetailPage() {
  const { billId } = Route.useParams();
  const { data: bill, isLoading } = useBill(billId);

  if (isLoading) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Loading bill…</p>;
  }

  if (!bill) {
    return (
      <div className="surface-card p-8 text-center">
        <p className="text-sm text-muted-foreground">This bill could not be found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/bills">Back to bills</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to="/bills"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Bill history
      </Link>

      <PageHeader
        title={bill.bill_number ?? "Draft bill"}
        description={`${bill.customers?.name ?? "Walk-in customer"} · ${formatDate(bill.bill_date)}`}
        actions={
          <>
            <StatusBadge tone={bill.status === "Voided" ? "error" : "neutral"}>
              {bill.status}
            </StatusBadge>
            <StatusBadge
              tone={
                bill.payment_status === "Paid"
                  ? "success"
                  : bill.payment_status === "Partial"
                    ? "warning"
                    : "error"
              }
            >
              {bill.payment_status}
            </StatusBadge>
            <StatusBadge tone={bill.zoho_sync_status === "Synced" ? "success" : "neutral"}>
              Zoho: {bill.zoho_sync_status}
            </StatusBadge>
          </>
        }
      />

      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Unit price</th>
                <th className="px-4 py-3 text-right">Line total</th>
              </tr>
            </thead>
            <tbody>
              {bill.bill_items.map((item) => (
                <tr key={item.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 text-sm font-medium">{item.product_name_snapshot}</td>
                  <td className="numeric px-4 py-3 text-right text-sm">{item.quantity}</td>
                  <td className="numeric px-4 py-3 text-right text-sm">
                    {formatMoney(item.unit_price)}
                  </td>
                  <td className="numeric px-4 py-3 text-right text-sm font-semibold">
                    {formatMoney(item.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-border p-5">
          <dl className="ml-auto max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="numeric font-medium">{formatMoney(bill.subtotal)}</dd>
            </div>
            {Number(bill.discount_amount) > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Discount</dt>
                <dd className="numeric font-medium">−{formatMoney(bill.discount_amount)}</dd>
              </div>
            )}
            {bill.is_taxed && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax ({Number(bill.tax_rate)}%)</dt>
                <dd className="numeric font-medium">{formatMoney(bill.tax_amount)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-border pt-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Total
              </dt>
              <dd className="numeric text-2xl font-bold">{formatMoney(bill.total_amount)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Warehouse: {bill.warehouses?.name ?? "—"}
            {bill.payment_method ? ` · Paid by ${bill.payment_method}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
