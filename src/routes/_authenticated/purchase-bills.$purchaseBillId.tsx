import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Ban, Download, Printer, Wallet } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSettings } from "@/lib/data";
import {
  purchaseBillTone,
  purchasePaymentTone,
  usePurchaseBill,
  voidPurchaseBill,
} from "@/lib/purchases";
import { formatDate, formatMoney } from "@/lib/format";
import { amountInWords } from "@/lib/amount-words";

export const Route = createFileRoute("/_authenticated/purchase-bills/$purchaseBillId")({
  head: () => ({
    meta: [
      { title: "Purchase Bill — Fragrance Billing" },
      { name: "description", content: "Supplier bill document with items, totals and payments." },
      { property: "og:title", content: "Purchase Bill — Fragrance Billing" },
      {
        property: "og:description",
        content: "Supplier bill document with items, totals and payments.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PurchaseBillDetail,
});

function PurchaseBillDetail() {
  const { purchaseBillId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: bill, isLoading } = usePurchaseBill(purchaseBillId);
  const { data: settings } = useSettings();
  const [voidOpen, setVoidOpen] = useState(false);
  const [working, setWorking] = useState(false);

  if (isLoading) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Loading purchase bill…</p>;
  }

  if (!bill) {
    return (
      <div className="surface-card p-8 text-center">
        <p className="text-sm text-muted-foreground">This purchase bill could not be found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/purchase-bills">Back to purchase bills</Link>
        </Button>
      </div>
    );
  }

  const balanceDue = Number(bill.total_amount) - Number(bill.amount_paid);

  const doVoid = async () => {
    setWorking(true);
    try {
      await voidPurchaseBill(bill.id);
      queryClient.invalidateQueries();
      toast.success("Purchase bill voided — stock and accounts reversed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not void the bill");
    } finally {
      setWorking(false);
      setVoidOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <Link
          to="/purchase-bills"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Purchase Bills
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
            {bill.bill_number ?? "Purchase Bill"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {bill.vendors?.name ?? "Vendor"} · {formatDate(bill.bill_date)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="h-11" onClick={() => window.print()}>
            <Download />
            Download PDF
          </Button>
          <Button variant="outline" className="h-11" onClick={() => window.print()}>
            <Printer />
            Print
          </Button>
          {bill.status === "Finalized" && balanceDue > 0.001 && (
            <Button
              className="h-11"
              onClick={() =>
                navigate({ to: "/purchase-bills/new", search: { vendorId: bill.vendor_id } })
              }
            >
              <Wallet />
              Record Payment
            </Button>
          )}
          {bill.status === "Finalized" && (
            <Button variant="outline" className="h-11" onClick={() => setVoidOpen(true)}>
              <Ban />
              Void
            </Button>
          )}
        </div>
      </div>

      <article className="surface-card space-y-8 p-5 sm:p-8 print:border-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-border pb-6">
          <div>
            <p className="text-lg font-semibold">{settings?.business_name ?? "Fragrance"}</p>
            {settings?.business_address && (
              <p className="max-w-xs whitespace-pre-line text-sm text-muted-foreground">
                {settings.business_address}
              </p>
            )}
            {settings?.tax_id && (
              <p className="text-sm text-muted-foreground">TRN: {settings.tax_id}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Purchase Bill
            </p>
            <p className="numeric text-lg font-bold">{bill.bill_number ?? "—"}</p>
            <p className="text-sm text-muted-foreground">{formatDate(bill.bill_date)}</p>
            <div className="mt-2 flex justify-end gap-2">
              <StatusBadge tone={purchasePaymentTone(bill.payment_status)}>
                {bill.payment_status}
              </StatusBadge>
              <StatusBadge tone={purchaseBillTone(bill.status)}>{bill.status}</StatusBadge>
            </div>
          </div>
        </header>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Bill from
            </p>
            <p className="mt-1 text-sm font-semibold">{bill.vendors?.name ?? "—"}</p>
            {bill.vendors?.phone && (
              <p className="text-sm text-muted-foreground">{bill.vendors.phone}</p>
            )}
            {bill.vendors?.email && (
              <p className="text-sm text-muted-foreground">{bill.vendors.email}</p>
            )}
            {bill.vendors?.address && (
              <p className="whitespace-pre-line text-sm text-muted-foreground">
                {bill.vendors.address}
              </p>
            )}
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Received into
            </p>
            <p className="mt-1 text-sm font-semibold">{bill.warehouses?.name ?? "—"}</p>
            {bill.purchase_orders?.id && (
              <Link
                to="/purchase-orders/$orderId"
                params={{ orderId: bill.purchase_orders.id }}
                className="text-sm text-primary hover:underline print:hidden"
              >
                From {bill.purchase_orders.order_number}
              </Link>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="py-3 pr-4">Item</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Unit cost</th>
                <th className="py-3 pl-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {bill.purchase_bill_items.map((i) => (
                <tr key={i.id} className="border-b border-border/60 last:border-0">
                  <td className="py-3 pr-4 text-sm font-medium">{i.product_name_snapshot}</td>
                  <td className="numeric px-4 py-3 text-right text-sm">{Number(i.quantity)}</td>
                  <td className="numeric px-4 py-3 text-right text-sm">
                    {formatMoney(i.unit_cost)}
                  </td>
                  <td className="numeric py-3 pl-4 text-right text-sm font-semibold">
                    {formatMoney(i.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap justify-between gap-6">
          <p className="max-w-xs text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Amount in words: </span>
            {amountInWords(Number(bill.total_amount))}
          </p>
          <dl className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="numeric font-medium">{formatMoney(bill.subtotal)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Tax</dt>
              <dd className="numeric font-medium">{formatMoney(bill.tax_amount)}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <dt className="font-semibold">Total</dt>
              <dd className="numeric text-2xl font-bold">{formatMoney(bill.total_amount)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Paid</dt>
              <dd className="numeric font-medium">{formatMoney(bill.amount_paid)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Balance due</dt>
              <dd className="numeric font-semibold">{formatMoney(balanceDue)}</dd>
            </div>
          </dl>
        </div>

        {bill.notes && (
          <div className="border-t border-border pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Notes
            </p>
            <p className="mt-1 whitespace-pre-line text-sm">{bill.notes}</p>
          </div>
        )}
      </article>

      <AlertDialog open={voidOpen} onOpenChange={setVoidOpen}>
        <AlertDialogContent>
          <AlertDialogTitle className="sr-only">Void purchase bill</AlertDialogTitle>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this purchase bill?</AlertDialogTitle>
            <AlertDialogDescription>
              The received stock is removed again and all related account entries are reversed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep bill</AlertDialogCancel>
            <AlertDialogAction disabled={working} onClick={doVoid}>
              {working ? "Voiding…" : "Void bill"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
