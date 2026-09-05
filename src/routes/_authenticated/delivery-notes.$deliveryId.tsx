import { createFileRoute } from "@tanstack/react-router";
import { MasterDetail } from "@/components/MasterDetail";
import { DeliveryNotesList } from "@/components/lists/DeliveryNotesList";
import { DeliveryNoteDetail } from "@/components/detail/DeliveryNoteDetail";

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
  component: DeliveryNoteDetailPage,
});

function DeliveryNoteDetailPage() {
  const { deliveryId } = Route.useParams();
  return (
    <MasterDetail
      detailSelected
      list={<DeliveryNotesList selectedId={deliveryId} />}
      detail={<DeliveryNoteDetail deliveryId={deliveryId} />}
    />
  );
}
