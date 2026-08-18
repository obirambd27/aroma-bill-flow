import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Ban, Download, Pencil, Printer, Share2, Trash2, Truck, Wallet } from "lucide-react";
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
import { useBillDeliveryNotes } from "@/lib/sales";

import { ThermalReceipt } from "@/components/ThermalReceipt";
import { InvoiceDocumentView } from "@/components/invoice-templates";
import { buildInvoiceDoc } from "@/lib/invoice-doc";
import { ShareInvoiceDialog } from "@/components/ShareInvoiceDialog";

import { supabase } from "@/integrations/supabase/client";
import { useBill, useCustomerOutstanding, useSettings } from "@/lib/data";
import { amountInWords } from "@/lib/amount-words";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { buildPaymentBreakdown, useBillAllocations } from "@/lib/bill-payments";

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
  const { data: outstanding = {} } = useCustomerOutstanding();
  const { data: editHistory = [] } = useBillEditHistory(billId);
  const { data: allocations = [] } = useBillAllocations(billId);
  const { data: linkedNotes = [] } = useBillDeliveryNotes(billId);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
  const breakdown = buildPaymentBreakdown(bill, allocations);
  const paid = breakdown.totalPaid;
  const balanceDue = breakdown.balanceDue;
  /** Customer's outstanding on their *other* finalized bills. */
  const previousBalance = bill.customer_id
    ? Math.max(0, (outstanding[bill.customer_id] ?? 0) - balanceDue)
    : 0;

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

  /** Permanently removes a voided bill, keeping an immutable snapshot in the delete log. */
  const deleteBill = async () => {
    setDeleting(true);
    try {
      const { error: logError } = await supabase.from("bill_delete_log").insert({
        bill_id: bill.id,
        bill_number: bill.bill_number,
        bill_date: bill.bill_date,
        customer_name: bill.customers?.name ?? "Walk-in Customer",
        total_amount: Number(bill.total_amount),
        reason: "Deleted from invoice page (voided bill)",
        snapshot: JSON.parse(JSON.stringify(bill)),
      });
      if (logError) throw logError;

      await supabase.from("bill_edit_history").delete().eq("bill_id", bill.id);
      await supabase.from("ledger_entries").delete().eq("related_bill_id", bill.id);
      await supabase.from("stock_movements").delete().eq("related_bill_id", bill.id);
      await supabase.from("payment_allocations").delete().eq("bill_id", bill.id);
      await supabase.from("payments").delete().eq("bill_id", bill.id);
      await supabase.from("bill_items").delete().eq("bill_id", bill.id);

      const { error } = await supabase.from("bills").delete().eq("id", bill.id);
      if (error) throw error;

      toast.success("Bill deleted — a snapshot is kept in the delete log");
      queryClient.invalidateQueries();
      void navigate({ to: "/bills" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete this bill");
    } finally {
      setDeleting(false);
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
            <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
              <Share2 className="h-4 w-4" />
              Share
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
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate({ to: "/delivery-notes/new", search: { billId: bill.id } })
                }
              >
                <Truck className="h-4 w-4" />
                Convert to Delivery Note
              </Button>
            )}
            {bill.status === "Finalized" && (
              <Button variant="ghost" size="sm" onClick={() => setVoidOpen(true)}>
                <Ban className="h-4 w-4" />
                Void Bill
              </Button>
            )}

            {bill.status === "Voided" && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete Bill
              </Button>
            )}

          </div>
        </div>

        {linkedNotes.length > 0 && (
          <div className="surface-card px-4 py-3 text-sm text-muted-foreground">
            {linkedNotes.map((n) => (
              <p key={n.id}>
                Delivery Note{" "}
                <Link
                  to="/delivery-notes/$deliveryId"
                  params={{ deliveryId: n.id }}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  {n.delivery_number ?? "—"}
                </Link>{" "}
                created from this bill
              </p>
            ))}
          </div>
        )}
      </div>


      {/* Invoice document */}
      {printView === "thermal" ? (
        <ThermalReceipt
          bill={bill}
          settings={settings}
          payments={breakdown.lines}
          paid={paid}
          balanceDue={balanceDue}
        />
      ) : (
        <InvoiceDocumentView
          templateId={settings?.active_invoice_template}
          doc={buildInvoiceDoc(bill, settings, {
            allocations,
            amountInWords: amountInWords(total),
            previousBalance: previousBalance,
          })}
        />
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

      <ShareInvoiceDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        bill={bill}
        settings={settings}
        balanceDue={balanceDue}
      />



      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this bill permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              The invoice and its line items will be removed from bill history. A full snapshot is
              written to the deleted-bills log first, so the record is never lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void deleteBill();
              }}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete bill"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
