import { createFileRoute } from "@tanstack/react-router";
import { MasterDetail } from "@/components/MasterDetail";
import { CustomersList } from "@/components/lists/CustomersList";
import { CustomerDetail } from "@/components/detail/CustomerDetail";

export const Route = createFileRoute("/_authenticated/customers/$customerId")({
  head: () => ({
    meta: [
      { title: "Customer Detail — Fragrance Billing" },
      {
        name: "description",
        content: "Customer profile, bills, payments and running statement balance.",
      },
      { property: "og:title", content: "Customer Detail — Fragrance Billing" },
      {
        property: "og:description",
        content: "Customer profile, bills, payments and running statement balance.",
      },
    ],
  }),
  component: CustomerDetailPage,
  errorComponent: ({ error }) => (
    <p role="alert" className="p-8 text-center text-sm text-destructive">
      {error.message}
    </p>
  ),
  notFoundComponent: () => (
    <p className="p-8 text-center text-sm text-muted-foreground">Customer not found.</p>
  ),
});

function CustomerDetailPage() {
  const { customerId } = Route.useParams();
  return (
    <MasterDetail
      detailSelected
      list={<CustomersList selectedId={customerId} />}
      detail={<CustomerDetail key={customerId} customerId={customerId} />}
    />
  );
}
