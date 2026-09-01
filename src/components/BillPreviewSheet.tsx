import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { InvoiceDocumentView } from "@/components/invoice-templates";
import { useBill, useSettings } from "@/lib/data";
import { useBillAllocations } from "@/lib/bill-payments";
import { buildInvoiceDoc } from "@/lib/invoice-doc";
import { amountInWords } from "@/lib/amount-words";

/** Quick read-only invoice preview shown in a side panel, without leaving the page. */
export function BillPreviewSheet({
  billId,
  onOpenChange,
}: {
  billId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={!!billId} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
        {billId ? <PreviewBody billId={billId} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function PreviewBody({ billId }: { billId: string }) {
  const { data: bill, isLoading } = useBill(billId);
  const { data: settings } = useSettings();
  const { data: allocations = [] } = useBillAllocations(billId);

  return (
    <>
      <SheetHeader className="mb-4">
        <SheetTitle className="flex flex-wrap items-center justify-between gap-2 pr-8">
          <span>{bill?.bill_number ?? "Invoice"}</span>
          <Button asChild size="sm" variant="outline">
            <Link to="/bills/$billId" params={{ billId }}>
              <ExternalLink />
              Open full bill
            </Link>
          </Button>
        </SheetTitle>
      </SheetHeader>

      {isLoading && <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && !bill && (
        <p className="py-12 text-center text-sm text-muted-foreground">Bill not found.</p>
      )}
      {bill && (
        <div className="origin-top scale-[0.92]">
          <InvoiceDocumentView
            doc={buildInvoiceDoc(bill, settings, {
              allocations,
              amountInWords: amountInWords(Number(bill.total_amount)),
            })}
            templateId={settings?.active_invoice_template}
          />
        </div>
      )}
    </>
  );
}
