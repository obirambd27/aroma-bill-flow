import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/lib/data";
import { deliveryTone, useDeliveryNote } from "@/lib/sales";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/delivery-notes/$deliveryId")({
  head: () => ({
    meta: [
      { title: "Delivery Note — Fragrance Billing" },
      { name: "description", content: "Delivery challan showing dispatched items and status." },
      { property: "og:title", content: "Delivery Note — Fragrance Billing" },
      {
        property: "og:description",
        content: "Delivery challan showing dispatched items and status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeliveryNoteDetail,
});

function DeliveryNoteDetail() {
  const { deliveryId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: note, isLoading } = useDeliveryNote(deliveryId);
  const { data: settings } = useSettings();

  if (isLoading) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Loading delivery note…</p>;
  }
  if (!note) {
    return (
      <div className="space-y-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">This delivery note no longer exists.</p>
        <Button asChild variant="outline">
          <Link to="/delivery-notes">Back to Delivery Notes</Link>
        </Button>
      </div>
    );
  }

  const markDelivered = async () => {
    const { error } = await supabase
      .from("delivery_notes")
      .update({ status: "Delivered" })
      .eq("id", note.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries();
    toast.success("Marked as delivered");
  };

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/delivery-notes" })}>
          <ArrowLeft />
          Delivery Notes
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer />
            Print
          </Button>
          {note.status !== "Delivered" && (
            <Button size="sm" onClick={markDelivered}>
              <CheckCircle2 />
              Mark Delivered
            </Button>
          )}
        </div>
      </div>

      <div className="no-print">
        <StatusBadge tone={deliveryTone(note.status)}>{note.status}</StatusBadge>
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
            <p className="text-2xl font-bold tracking-tight">DELIVERY NOTE</p>
            <p className="numeric mt-1 text-sm text-muted-foreground">{note.delivery_number}</p>
          </div>
        </header>

        <section className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Deliver To
            </p>
            <p className="mt-1 text-sm font-semibold">
              {note.customers ? (
                <Link
                  to="/customers/$customerId"
                  params={{ customerId: note.customers.id }}
                  className="hover:underline"
                >
                  {note.customers.name}
                </Link>
              ) : (
                "Walk-in Customer"
              )}
            </p>
            {note.customers?.phone && (
              <p className="text-sm text-muted-foreground">{note.customers.phone}</p>
            )}
            {note.customers?.address && (
              <p className="whitespace-pre-line text-sm text-muted-foreground">
                {note.customers.address}
              </p>
            )}
          </div>
          <dl className="space-y-1 text-sm sm:text-right">
            <div className="flex justify-between sm:justify-end sm:gap-6">
              <dt className="text-muted-foreground">Delivery Date</dt>
              <dd className="font-medium">{formatDate(note.delivery_date)}</dd>
            </div>
            <div className="flex justify-between sm:justify-end sm:gap-6">
              <dt className="text-muted-foreground">Warehouse</dt>
              <dd className="font-medium">{note.warehouses?.name ?? "—"}</dd>
            </div>
            <div className="flex justify-between sm:justify-end sm:gap-6">
              <dt className="text-muted-foreground">Sales Order</dt>
              <dd className="font-medium">
                {note.sales_orders ? (
                  <Link
                    to="/sales-orders/$orderId"
                    params={{ orderId: note.sales_orders.id }}
                    className="no-print hover:underline"
                  >
                    {note.sales_orders.order_number}
                  </Link>
                ) : (
                  "Standalone"
                )}
              </dd>
            </div>
          </dl>
        </section>

        <section className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 text-right">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {note.delivery_note_items.map((item, index) => (
                <tr key={item.id} className="border-b border-border/60">
                  <td className="py-3 pr-3 text-muted-foreground">{index + 1}</td>
                  <td className="py-3 pr-3 font-medium">{item.product_name_snapshot}</td>
                  <td className="numeric py-3 text-right">{Number(item.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {note.notes && (
          <p className="whitespace-pre-line text-sm text-muted-foreground">{note.notes}</p>
        )}

        <footer className="flex flex-wrap justify-between gap-8 border-t border-border pt-8 text-sm">
          <div className="w-48 border-t border-border pt-2 text-muted-foreground">
            Received By
          </div>
          <div className="w-48 border-t border-border pt-2 text-right text-muted-foreground">
            Authorized Signature
          </div>
        </footer>
      </article>
    </div>
  );
}
