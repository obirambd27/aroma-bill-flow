import { createFileRoute } from "@tanstack/react-router";
import { MasterDetail, DetailPlaceholder } from "@/components/MasterDetail";
import { ProductsList } from "@/components/lists/ProductsList";

export const Route = createFileRoute("/_authenticated/products/")({
  head: () => ({
    meta: [
      { title: "Products — Fragrance Billing" },
      { name: "description", content: "Perfume catalogue with live stock levels and pricing." },
      { property: "og:title", content: "Products — Fragrance Billing" },
      {
        property: "og:description",
        content: "Perfume catalogue with live stock levels and pricing.",
      },
    ],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  return (
    <MasterDetail
      list={<ProductsList />}
      detail={<DetailPlaceholder message="Select a product to preview it here." />}
    />
  );
}
