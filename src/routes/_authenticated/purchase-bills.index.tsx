import { createFileRoute } from "@tanstack/react-router";
import { MasterDetail, DetailPlaceholder } from "@/components/MasterDetail";
import { PurchaseBillsList } from "@/components/lists/PurchaseBillsList";

export const Route = createFileRoute("/_authenticated/purchase-bills/")({
  head: () => ({
    meta: [
      { title: "Purchase Bills — Fragrance Billing" },
      { name: "description", content: "Supplier bills, stock received and what you still owe." },
      { property: "og:title", content: "Purchase Bills — Fragrance Billing" },
      {
        property: "og:description",
        content: "Supplier bills, stock received and what you still owe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PurchaseBillsPage,
});

function PurchaseBillsPage() {
  return (
    <MasterDetail
      list={<PurchaseBillsList />}
      detail={<DetailPlaceholder message="Select a purchase bill to see its details." />}
    />
  );
}
