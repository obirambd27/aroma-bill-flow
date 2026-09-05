import { createFileRoute } from "@tanstack/react-router";
import { MasterDetail, DetailPlaceholder } from "@/components/MasterDetail";
import { BillsList } from "@/components/lists/BillsList";

export const Route = createFileRoute("/_authenticated/bills/")({
  validateSearch: (search: Record<string, unknown>): { pending?: boolean } =>
    search["pending"] === true || search["pending"] === "true" ? { pending: true } : {},

  head: () => ({
    meta: [
      { title: "Bill History — Fragrance Billing" },
      {
        name: "description",
        content: "Search, filter and track every bill: payments, warehouses, returns and credits.",
      },
      { property: "og:title", content: "Bill History — Fragrance Billing" },
      {
        property: "og:description",
        content: "Search, filter and track every bill: payments, warehouses, returns and credits.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BillsPage,
});

function BillsPage() {
  return (
    <MasterDetail
      list={<BillsList />}
      detail={<DetailPlaceholder message="Select a bill to preview the invoice here." />}
    />
  );
}
