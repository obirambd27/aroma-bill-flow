import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Download, Pencil, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { DeliveryNoteSheet } from "@/components/DeliveryNoteSheet";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/lib/data";
import { deliveryTone, useDeliveryNote } from "@/lib/sales";

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

  const handlePdf = () => {
    toast.info("Choose “Save as PDF” in the print dialog");
    setTimeout(() => window.print(), 250);
  };

  const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/delivery-notes" })}>
          <ArrowLeft />
          Delivery Notes
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate({ to: "/delivery-notes/new", search: { editId: note.id } })
            }
          >
            <Pencil />
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={handlePdf}>
            <Download />
            Download PDF
          </Button>

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

      <div className="no-print flex flex-wrap items-center gap-3">
        <StatusBadge tone={deliveryTone(note.status)}>{note.status}</StatusBadge>
        {note.bills && (
          <p className="text-sm text-muted-foreground">
            Converted from Bill{" "}
            <Link
              to="/bills/$billId"
              params={{ billId: note.bills.id }}
              className="font-medium text-foreground underline underline-offset-4"
            >
              {note.bills.bill_number ?? "—"}
            </Link>
          </p>
        )}
        {note.sales_orders && (
          <p className="text-sm text-muted-foreground">
            Sales Order {note.sales_orders.order_number ?? "—"}
          </p>
        )}
      </div>

      <DeliveryNoteSheet
        doc={{
          number: note.delivery_number ?? "Draft",
          date: note.delivery_date,
          buyerName: note.buyer_name ?? note.customers?.name ?? "Walk-in Customer",
          buyerAddress: note.buyer_address ?? note.customers?.address ?? null,
          buyerTel: note.buyer_tel ?? note.customers?.phone ?? null,
          marka: note.marka,
          cargoTransport: note.cargo_transport,
          cargoPhone: note.cargo_phone,
          totalAmount: num(note.total_amount),
          advanceAmount: num(note.advance_amount),
          balanceAmount: num(note.balance_amount),
          items: note.delivery_note_items.map((item) => ({
            key: item.id,
            name: item.product_name_snapshot,
            quantity: Number(item.quantity),
            cartonBag: item.carton_bag_count,
          })),
          business: {
            name: settings?.business_name ?? "—",
            addressLines: (settings?.business_address ?? "")
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean),
            phone: settings?.business_phone ?? null,
            email: settings?.business_email ?? null,
            logoUrl: settings?.business_logo_url ?? null,
            tagline: settings?.business_tagline ?? null,
          },
        }}
      />
    </div>
  );
}

