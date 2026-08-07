import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Ban, Download, Pencil, Printer, Wallet } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { RecordPaymentDialog } from "@/components/RecordPaymentDialog";
import { JournalSection } from "@/components/JournalSection";
import { EditHistorySection } from "@/components/EditHistorySection";
import { useBillEditHistory } from "@/lib/bill-edit";
import { ThermalReceipt } from "@/components/ThermalReceipt";
import { supabase } from "@/integrations/supabase/client";
import { useAllProducts, useAllWarehouses, useBill, useSettings } from "@/lib/data";
import { amountInWords } from "@/lib/amount-words";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type PrintView = "a4" | "thermal";
/** Session-level memory of the last chosen print view. */
let lastPrintView: PrintView = "a4";


export const Route = createFileRoute("/_authenticated/bills/$billId")({
  head: () => ({
    meta: [
      { title: "Invoice — Fragrance Billing" },
      {
        name: "description",
        content: "Printable tax invoice with line items, totals and payment status.",
      },
      { property: "og:title", content: "Invoice — Fragrance Billing" },
      {
        property: "og:description",
        content: "Printable tax invoice with line items, totals and payment status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BillDetailPage,
});

function BillDetailPage() {
  const { billId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: bill, isLoading } = useBill(billId);
  const { data: settings } = useSettings();
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: products = [] } = useAllProducts();
  const { data: editHistory = [] } = useBillEditHistory(billId);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [printView, setPrintView] = useState<PrintView>(lastPrintView);

  useEffect(() => {
    lastPrintView = printView;
    const style = document.createElement("style");
    document.head.appendChild(style);
    document.body.classList.toggle("print-thermal", printView === "thermal");

    /** Thermal rolls are continuous: size the page to the receipt so no paper is wasted. */
    const applyPageRule = () => {
      if (printView !== "thermal") {
        style.textContent = "@media print { @page { size: A4; margin: 12mm; } }";
        return;
      }
      const sheet = document.querySelector<HTMLElement>(".thermal-sheet");
      // On-screen sheet is 302px wide (~80mm) at ~11px text; print is 72mm at 8.5pt,
      // so the printed height is close. Add a small buffer, never a full extra page.
      const heightMm = sheet
        ? Math.max(Math.ceil((sheet.scrollHeight / 96) * 25.4 * 1.05) + 4, 40)
        : 150;
      style.textContent = `@media print { @page { size: 72mm ${heightMm}mm; margin: 0; } }`;

    };

    applyPageRule();
    window.addEventListener("beforeprint", applyPageRule);
    return () => {
      window.removeEventListener("beforeprint", applyPageRule);
      document.body.classList.remove("print-thermal");
      style.remove();
    };
  }, [printView]);




  if (isLoading) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Loading invoice…</p>;
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

  const taxed = bill.is_taxed;
  const total = Number(bill.total_amount);
  const paid = Number(bill.amount_paid ?? 0);
  const balanceDue = Math.max(total - paid, 0);
  const warehouseName = (id: string | null) =>
    warehouses.find((w) => w.id === id)?.name ?? bill.warehouses?.name ?? "—";

  const voidBill = async () => {
    setVoiding(true);
    try {
      for (const item of bill.bill_items) {
        if (!item.product_id || !item.warehouse_id) continue;
        const { data: row } = await supabase
          .from("product_stock")
          .select("id, stock_on_hand")
          .eq("product_id", item.product_id)
          .eq("warehouse_id", item.warehouse_id)
          .maybeSingle();
        if (row) {
          await supabase
            .from("product_stock")
            .update({ stock_on_hand: Number(row.stock_on_hand) + Number(item.quantity) })
            .eq("id", row.id);
        } else {
          await supabase.from("product_stock").insert({
            product_id: item.product_id,
            warehouse_id: item.warehouse_id,
            stock_on_hand: Number(item.quantity),
          });
        }
        await supabase.from("stock_movements").insert({
          product_id: item.product_id,
          warehouse_id: item.warehouse_id,
          movement_type: "Void Restock",
          quantity_change: Number(item.quantity),
          related_bill_id: bill.id,
          reason: `Void of ${bill.bill_number ?? "bill"}`,
        });
      }

      const { data: entries } = await supabase
        .from("ledger_entries")
        .select("*")
        .eq("related_bill_id", bill.id);
      for (const e of entries ?? []) {
        await supabase.from("ledger_entries").insert({
          account_id: e.account_id,
          entry_date: new Date().toISOString().slice(0, 10),
          entry_type: "Manual Adjustment",
          amount: -Number(e.amount),
          related_bill_id: bill.id,
          description: `Reversal — void of ${bill.bill_number ?? "bill"}`,
        });
      }

      const { error } = await supabase
        .from("bills")
        .update({ status: "Voided" })
        .eq("id", bill.id);
      if (error) throw error;

      toast.success("Bill voided and stock restored");
      setVoidOpen(false);
      queryClient.invalidateQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not void this bill");
    } finally {
      setVoiding(false);
    }
  };

  const handlePdf = () => {
    toast.info("Choose “Save as PDF” in the print dialog");
    setTimeout(() => window.print(), 250);
  };

  return (
    <div className="space-y-5">
      <div className="no-print space-y-4">
        <Link
          to="/bills"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Bill history
        </Link>

        {/* Status strip */}
        <div className="surface-card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
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
            {editHistory.length > 0 && <StatusBadge tone="warning">Edited</StatusBadge>}
            {balanceDue > 0 && bill.status !== "Voided" && (
              <span className="numeric text-sm text-muted-foreground">
                Balance due {formatMoney(balanceDue)}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-border p-0.5">
              {(["a4", "thermal"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setPrintView(view)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    printView === view
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {view === "a4" ? "A4" : "Thermal (72mm)"}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={handlePdf}>

              <Download className="h-4 w-4" />
              Download PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
            {bill.status !== "Voided" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate({ to: "/new-bill", search: { editBill: bill.id } })
                }
              >
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            )}
            {balanceDue > 0 && bill.status === "Finalized" && bill.customer_id && (
              <Button size="sm" onClick={() => setPaymentOpen(true)}>
                <Wallet className="h-4 w-4" />
                Record Payment
              </Button>
            )}
            {bill.status === "Finalized" && (
              <Button variant="ghost" size="sm" onClick={() => setVoidOpen(true)}>
                <Ban className="h-4 w-4" />
                Void Bill
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Invoice document */}
      {printView === "thermal" ? (
        <ThermalReceipt bill={bill} settings={settings} />
      ) : (
      <article className="invoice-sheet mx-auto w-full max-w-3xl rounded-2xl bg-card p-6 shadow-lg sm:p-10">

        <header className="flex flex-col gap-6 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            {settings?.business_logo_url && (
              <img
                src={settings.business_logo_url}
                alt={`${settings.business_name} logo`}
                className="h-14 w-14 rounded-lg object-contain"
              />
            )}
            <div className="space-y-0.5 text-xs text-muted-foreground">
              <p className="text-base font-semibold text-foreground">
                {settings?.business_name ?? "—"}
              </p>
              {settings?.business_address && <p>{settings.business_address}</p>}
              {settings?.business_phone && <p>{settings.business_phone}</p>}
              {settings?.business_email && <p>{settings.business_email}</p>}
              {settings?.tax_id && <p>TRN: {settings.tax_id}</p>}
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-right sm:text-3xl">
            {taxed ? "TAX INVOICE" : "INVOICE"}
          </h1>
        </header>

        <section className="grid gap-6 border-b border-border py-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Bill To
            </p>
            {bill.customers ? (
              <>
                <Link
                  to="/customers/$customerId"
                  params={{ customerId: bill.customers.id }}
                  className="mt-1 block text-sm font-semibold hover:text-primary hover:underline"
                >
                  {bill.customers.name}
                </Link>
                {bill.customers.phone && (
                  <p className="text-xs text-muted-foreground">{bill.customers.phone}</p>
                )}
                {bill.customers.address && (
                  <p className="text-xs text-muted-foreground">{bill.customers.address}</p>
                )}
              </>
            ) : (
              <p className="mt-1 text-sm font-semibold">Walk-in Customer</p>
            )}
          </div>

          <dl className="space-y-1.5 text-sm sm:text-right">
            <div className="flex justify-between gap-4 sm:justify-end">
              <dt className="text-muted-foreground">Invoice #</dt>
              <dd className="numeric font-medium sm:w-40">{bill.bill_number ?? "Draft"}</dd>
            </div>
            <div className="flex justify-between gap-4 sm:justify-end">
              <dt className="text-muted-foreground">Invoice Date</dt>
              <dd className="numeric font-medium sm:w-40">{formatDate(bill.bill_date)}</dd>
            </div>
            <div className="flex justify-between gap-4 sm:justify-end">
              <dt className="text-muted-foreground">Payment Terms</dt>
              <dd className="font-medium sm:w-40">
                {settings?.default_payment_terms || "Due on Receipt"}
              </dd>
            </div>
            <div className="flex justify-between gap-4 sm:justify-end">
              <dt className="text-muted-foreground">Due Date</dt>
              <dd className="numeric font-medium sm:w-40">{formatDate(bill.bill_date)}</dd>
            </div>
          </dl>
        </section>

        <div className="-mx-2 overflow-x-auto py-6">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">Item</th>
                <th className="px-2 py-2">SKU</th>
                <th className="px-2 py-2 text-right">Qty</th>
                <th className="px-2 py-2 text-right">Rate</th>
                {taxed && <th className="px-2 py-2 text-right">Amount</th>}
                {taxed && <th className="px-2 py-2 text-right">Taxable</th>}
                {taxed && <th className="px-2 py-2 text-right">Tax %</th>}
                {taxed && <th className="px-2 py-2 text-right">Tax</th>}
                <th className="px-2 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {bill.bill_items.map((item, index) => {
                const amount = Number(item.line_total);
                const rate = Number(bill.tax_rate);
                const tax = taxed ? (amount * rate) / 100 : 0;
                return (
                  <tr key={item.id} className="border-b border-border/60 align-top last:border-0">
                    <td className="numeric px-2 py-3 text-muted-foreground">{index + 1}</td>
                    <td className="px-2 py-3">
                      <p className="font-medium">{item.product_name_snapshot}</p>
                      <p className="text-xs text-muted-foreground">
                        From {warehouseName(item.warehouse_id)}
                      </p>
                    </td>
                    <td className="px-2 py-3 text-xs text-muted-foreground">
                      {products.find((p) => p.id === item.product_id)?.sku ?? "—"}
                    </td>
                    <td className="numeric px-2 py-3 text-right">{item.quantity}</td>
                    <td className="numeric px-2 py-3 text-right">
                      {formatMoney(item.unit_price)}
                    </td>
                    {taxed && (
                      <td className="numeric px-2 py-3 text-right">{formatMoney(amount)}</td>
                    )}
                    {taxed && (
                      <td className="numeric px-2 py-3 text-right">{formatMoney(amount)}</td>
                    )}
                    {taxed && <td className="numeric px-2 py-3 text-right">{rate}%</td>}
                    {taxed && <td className="numeric px-2 py-3 text-right">{formatMoney(tax)}</td>}
                    <td className="numeric px-2 py-3 text-right font-semibold">
                      {formatMoney(amount + tax)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <section className="border-t border-border pt-6">
          <dl className="ml-auto max-w-sm space-y-2 text-sm">
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
            {taxed && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax ({Number(bill.tax_rate)}%)</dt>
                <dd className="numeric font-medium">{formatMoney(bill.tax_amount)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-border pt-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Grand Total
              </dt>
              <dd className="numeric text-2xl font-bold">{formatMoney(total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Amount Paid</dt>
              <dd className="numeric font-medium">{formatMoney(paid)}</dd>
            </div>
            <div
              className={
                balanceDue > 0
                  ? "flex justify-between rounded-lg bg-destructive/10 px-3 py-2 text-destructive"
                  : "flex justify-between"
              }
            >
              <dt className="font-medium">Balance Due</dt>
              <dd className="numeric font-bold">{formatMoney(balanceDue)}</dd>
            </div>
          </dl>

          <p className="mt-5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Total in words: </span>
            {amountInWords(total)}
          </p>
        </section>

        <footer className="mt-8 flex flex-col gap-8 border-t border-border pt-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-sm space-y-3 text-xs text-muted-foreground">
            {settings?.invoice_footer_note && <p>{settings.invoice_footer_note}</p>}
            {settings?.terms_and_conditions && (
              <div>
                <p className="font-medium text-foreground">Terms &amp; Conditions</p>
                <p className="whitespace-pre-line">{settings.terms_and_conditions}</p>
              </div>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            <div className="mt-10 w-52 border-t border-border pt-2 text-center">
              Authorized Signature
            </div>
          </div>
        </footer>
      </article>
      )}

      <EditHistorySection billId={bill.id} />

      <JournalSection
        linkColumn="related_bill_id"
        linkId={bill.id}
        locationName={bill.warehouses?.name ?? null}
      />


      {bill.customer_id && (
        <RecordPaymentDialog
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
          defaultCustomerId={bill.customer_id}
          defaultBillId={bill.id}
        />
      )}

      <AlertDialog open={voidOpen} onOpenChange={setVoidOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this bill?</AlertDialogTitle>
            <AlertDialogDescription>
              All items on this invoice will be returned to their warehouses and the related
              accounting entries will be reversed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={voiding}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void voidBill();
              }}
              disabled={voiding}
            >
              {voiding ? "Voiding…" : "Void bill"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
