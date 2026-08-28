import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Ban, Download, Printer, RotateCcw, Wallet } from "lucide-react";
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
import { RecordPaymentOutDialog } from "@/components/RecordPaymentOutDialog";
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
  const [payOpen, setPayOpen] = useState(false);

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
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusBadge tone={purchasePaymentTone(bill.payment_status)}>
              {bill.payment_status}
            </StatusBadge>
            <StatusBadge tone={purchaseBillTone(bill.status)}>{bill.status}</StatusBadge>
          </div>
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
            <Button className="h-11" onClick={() => setPayOpen(true)}>
              <Wallet />
              Record Payment
            </Button>
          )}
          {bill.status === "Finalized" && (
            <Button
              variant="outline"
              className="h-11"
              onClick={() =>
                navigate({ to: "/purchase-returns/new", search: { purchaseBillId: bill.id } })
              }
            >
              <RotateCcw />
              Return Goods
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

      <DocumentSheet>
        <DocHero
          logoUrl={settings?.business_logo_url}
          businessName={settings?.business_name ?? "Fragrance"}
          tagline={settings?.business_tagline}
          chipLabel="Purchase Bill"
          documentNumber={bill.bill_number ?? "—"}
          stats={[
            { label: "Bill Date", value: formatDate(bill.bill_date) },
            { label: "Paid", value: formatMoney(bill.amount_paid) },
            { label: "Balance Due", value: formatMoney(balanceDue) },
          ]}
        />

        <DocPartyCards
          left={{
            title: "Bill From",
            name: bill.vendors?.name ?? "—",
            lines: [bill.vendors?.address, bill.vendors?.phone, bill.vendors?.email],
          }}
          right={{
            title: "Received Into",
            name: bill.warehouses?.name ?? "—",
            lines: [
              settings?.business_name,
              settings?.tax_id ? `TRN: ${settings.tax_id}` : null,
              bill.purchase_orders?.order_number
                ? `From ${bill.purchase_orders.order_number}`
                : null,
            ],
          }}
        />

        <DocItemsList
          items={bill.purchase_bill_items.map((i) => ({
            key: i.id,
            name: i.product_name_snapshot,
            quantity: Number(i.quantity),
            unitPrice: i.unit_cost,
            lineTotal: i.line_total,
          }))}
        />

        <DocTotals
          stamp={
            bill.payment_status === "Paid"
              ? { text: "Paid", sub: formatDate(bill.bill_date), tone: "paid" as const }
              : bill.payment_status === "Partial"
                ? { text: "Partial", sub: formatMoney(balanceDue), tone: "partial" as const }
                : { text: "Unpaid", sub: formatDate(bill.bill_date), tone: "unpaid" as const }
          }
          rows={[
            { label: "Subtotal", value: formatMoney(bill.subtotal) },
            { label: "Tax", value: formatMoney(bill.tax_amount) },
            { label: "Paid", value: formatMoney(bill.amount_paid) },
            { label: "Balance due", value: formatMoney(balanceDue) },
          ]}
          totalLabel="Bill Total"
          totalValue={bill.total_amount}
        />

        <DocFooter
          paymentDetails={settings?.bank_payment_details}
          note={bill.notes}
          signatureUrl={settings?.signature_url}
          businessName={settings?.business_name ?? "—"}
        >
          <p className="mb-5 text-xs text-doc-muted">
            <span className="font-semibold text-doc-ink">Amount in words: </span>
            {amountInWords(Number(bill.total_amount))}
          </p>
        </DocFooter>
      </DocumentSheet>

      <RecordPaymentOutDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        defaultVendorId={bill.vendor_id}
        defaultBillId={bill.id}
      />

      <AlertDialog open={voidOpen} onOpenChange={setVoidOpen}>
        <AlertDialogContent>
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
