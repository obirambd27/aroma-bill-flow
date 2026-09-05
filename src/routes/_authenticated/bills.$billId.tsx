import { createFileRoute } from "@tanstack/react-router";
import { MasterDetail } from "@/components/MasterDetail";
import { BillsList } from "@/components/lists/BillsList";
import { BillDetail } from "@/components/detail/BillDetail";

export const Route = createFileRoute("/_authenticated/bills/$billId")({
  head: () => ({
    meta: [
      { title: "Invoice — Fragrance Billing" },
      {
        name: "description",
        content: "Printable tax invoice with line items, totals and payment status.",
      },
      { property: "og:title", content: "Invoice — Fragrance Billing" },
      {
        property: "og:description",
        content: "Printable tax invoice with line items, totals and payment status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BillDetailPage,
  errorComponent: ({ error }) => (
    <p role="alert" className="p-8 text-center text-sm text-destructive">
      {error.message}
    </p>
  ),
  notFoundComponent: () => (
    <p className="p-8 text-center text-sm text-muted-foreground">Bill not found.</p>
  ),
});

function BillDetailPage() {
  const { billId } = Route.useParams();
  return (
    <MasterDetail
      detailSelected
      list={<BillsList selectedId={billId} />}
      detail={<BillDetail key={billId} billId={billId} />}
    />
  );
}
