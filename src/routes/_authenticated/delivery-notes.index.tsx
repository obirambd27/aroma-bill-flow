import { createFileRoute } from "@tanstack/react-router";
import { MasterDetail, DetailPlaceholder } from "@/components/MasterDetail";
import { DeliveryNotesList } from "@/components/lists/DeliveryNotesList";

export const Route = createFileRoute("/_authenticated/delivery-notes/")({
  head: () => ({
    meta: [
      { title: "Delivery Notes — Fragrance Billing" },
      { name: "description", content: "Dispatch records for goods sent out to customers." },
      { property: "og:title", content: "Delivery Notes — Fragrance Billing" },
      { property: "og:description", content: "Dispatch records for goods sent out to customers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeliveryNotesPage,
});

function DeliveryNotesPage() {
  return (
    <MasterDetail
      list={<DeliveryNotesList />}
      detail={<DetailPlaceholder message="Select a delivery note to see its details." />}
    />
  );
}
