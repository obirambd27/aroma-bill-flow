import { createFileRoute } from "@tanstack/react-router";
import { MasterDetail } from "@/components/MasterDetail";
import { PurchaseBillsList } from "@/components/lists/PurchaseBillsList";
import { PurchaseBillDetail } from "@/components/detail/PurchaseBillDetail";

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
  component: PurchaseBillDetailPage,
});

function PurchaseBillDetailPage() {
  const { purchaseBillId } = Route.useParams();
  return (
    <MasterDetail
      detailSelected
      list={<PurchaseBillsList selectedId={purchaseBillId} />}
      detail={<PurchaseBillDetail purchaseBillId={purchaseBillId} />}
    />
  );
}
