import { createFileRoute } from "@tanstack/react-router";
import { MasterDetail } from "@/components/MasterDetail";
import { ProductsList } from "@/components/lists/ProductsList";
import { ProductDetail } from "@/components/detail/ProductDetail";

export const Route = createFileRoute("/_authenticated/products/$productId")({
  head: () => ({
    meta: [
      { title: "Product Details — Fragrance Billing" },
      { name: "description", content: "Stock breakdown, movement log and sales history." },
      { property: "og:title", content: "Product Details — Fragrance Billing" },
      {
        property: "og:description",
        content: "Stock breakdown, movement log and sales history.",
      },
    ],
  }),
  component: ProductDetailPage,
  errorComponent: ({ error }) => (
    <p role="alert" className="p-8 text-center text-sm text-destructive">
      {error.message}
    </p>
  ),
  notFoundComponent: () => (
    <p className="p-8 text-center text-sm text-muted-foreground">Product not found.</p>
  ),
});

function ProductDetailPage() {
  const { productId } = Route.useParams();
  return (
    <MasterDetail
      detailSelected
      list={<ProductsList selectedId={productId} />}
      detail={<ProductDetail key={productId} productId={productId} />}
    />
  );
}
