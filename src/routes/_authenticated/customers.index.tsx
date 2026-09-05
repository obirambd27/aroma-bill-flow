import { createFileRoute } from "@tanstack/react-router";
import { MasterDetail, DetailPlaceholder } from "@/components/MasterDetail";
import { CustomersList } from "@/components/lists/CustomersList";

export const Route = createFileRoute("/_authenticated/customers/")({
  head: () => ({
    meta: [
      { title: "Customers — Fragrance Billing" },
      {
        name: "description",
        content: "Customer list with outstanding balances, aging and collections reports.",
      },
      { property: "og:title", content: "Customers — Fragrance Billing" },
      {
        property: "og:description",
        content: "Customer list with outstanding balances, aging and collections reports.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CustomersPage,
});

function CustomersPage() {
  return (
    <MasterDetail
      list={<CustomersList />}
      detail={<DetailPlaceholder message="Select a customer to see their profile here." />}
    />
  );
}
