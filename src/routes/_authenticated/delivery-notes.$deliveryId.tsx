import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import {
  DocFooter,
  DocHero,
  DocItemsList,
  DocPartyCards,
  DocumentSheet,
} from "@/components/DocumentSheet";
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

      <DocumentSheet>
        <DocHero
          logoUrl={settings?.business_logo_url}
          businessName={settings?.business_name ?? "Fragrance"}
          tagline={settings?.business_tagline}
          chipLabel="Delivery Note"
          documentNumber={note.delivery_number ?? "Draft"}
          stats={[
            { label: "Delivery Date", value: formatDate(note.delivery_date) },
            { label: "Warehouse", value: note.warehouses?.name ?? "—" },
            {
              label: "Sales Order",
              value: note.sales_orders?.order_number ?? "Standalone",
            },
          ]}
        />

        <DocPartyCards
          left={{
            title: "Deliver To",
            name: note.customers?.name ?? "Walk-in Customer",
            lines: [note.customers?.address, note.customers?.phone],
          }}
          right={{
            title: "From",
            name: settings?.business_name ?? "—",
            lines: [
              settings?.business_address,
              settings?.business_phone,
              settings?.business_email,
            ],
          }}
        />

        <DocItemsList
          showPrices={false}
          qtyLabel="Quantity"
          items={note.delivery_note_items.map((item) => ({
            key: item.id,
            name: item.product_name_snapshot,
            quantity: Number(item.quantity),
          }))}
        />

        <DocFooter
          terms={settings?.terms_and_conditions}
          note={note.notes}
          signatureUrl={settings?.signature_url}
          businessName={settings?.business_name ?? "—"}
        >
          <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-doc-label">
            Received By ________________________
          </p>
        </DocFooter>
      </DocumentSheet>
    </div>
  );
}
