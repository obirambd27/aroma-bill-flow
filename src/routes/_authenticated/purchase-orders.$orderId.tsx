import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Ban, FileText, Pencil } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { purchaseOrderTone, usePurchaseOrder } from "@/lib/purchases";
import { formatDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/purchase-orders/$orderId")({
  head: () => ({
    meta: [
      { title: "Purchase Order — Fragrance Billing" },
      { name: "description", content: "Ordered versus received quantities for a supplier order." },
      { property: "og:title", content: "Purchase Order — Fragrance Billing" },
      {
        property: "og:description",
        content: "Ordered versus received quantities for a supplier order.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PurchaseOrderDetail,
});

function PurchaseOrderDetail() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: order, isLoading } = usePurchaseOrder(orderId);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [working, setWorking] = useState(false);

  if (isLoading) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Loading purchase order…</p>;
  }

  if (!order) {
    return (
      <div className="surface-card p-8 text-center">
        <p className="text-sm text-muted-foreground">This purchase order could not be found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/purchase-orders">Back to purchase orders</Link>
        </Button>
      </div>
    );
  }

  const items = order.purchase_order_items;
  const remaining = items
    .map((i) => ({ ...i, remaining: Number(i.quantity) - Number(i.quantity_received) }))
    .filter((i) => i.remaining > 0);
  const canAct = order.status !== "Cancelled" && order.status !== "Fully Received";

  const cancelOrder = async () => {
    setWorking(true);
    const { error } = await supabase
      .from("purchase_orders")
      .update({ status: "Cancelled" })
      .eq("id", order.id);
    setWorking(false);
    setCancelOpen(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries();
    toast.success("Purchase order cancelled");
  };

  return (
    <div className="space-y-6">
      <Link
        to="/purchase-orders"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Purchase Orders
      </Link>

      <PageHeader
        title={order.order_number ?? "Purchase Order"}
        description={`${order.vendors?.name ?? "Vendor"} · ${formatDate(order.order_date)}`}
        actions={
          canAct ? (
            <>
              <Button
                variant="outline"
                className="h-11"
                onClick={() =>
                  navigate({ to: "/purchase-orders/new", search: { edit: order.id } })
                }
              >
                <Pencil />
                Edit
              </Button>
              <Button
                variant="outline"
                className="h-11"
                onClick={() => setCancelOpen(true)}
              >
                <Ban />
                Cancel Order
              </Button>
              <Button
                className="h-11"
                disabled={remaining.length === 0}
                onClick={() =>
                  navigate({ to: "/purchase-bills/new", search: { poId: order.id } })
                }
              >
                <FileText />
                Convert to Purchase Bill
              </Button>
            </>
          ) : null
        }
      />

      <div className="surface-card space-y-6 p-5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Vendor
            </p>
            <p className="mt-1 text-base font-semibold">{order.vendors?.name ?? "—"}</p>
            {order.vendors?.phone && (
              <p className="text-sm text-muted-foreground">{order.vendors.phone}</p>
            )}
            {order.vendors?.address && (
              <p className="max-w-xs whitespace-pre-line text-sm text-muted-foreground">
                {order.vendors.address}
              </p>
            )}
          </div>
          <div className="text-right">
            <StatusBadge tone={purchaseOrderTone(order.status)}>{order.status}</StatusBadge>
            <p className="mt-2 text-xs text-muted-foreground">
              Deliver to {order.warehouses?.name ?? "—"}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="py-3 pr-4">Item</th>
                <th className="px-4 py-3 text-right">Ordered</th>
                <th className="px-4 py-3 text-right">Received</th>
                <th className="px-4 py-3 text-right">Unit cost</th>
                <th className="py-3 pl-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b border-border/60 last:border-0">
                  <td className="py-3 pr-4 text-sm font-medium">{i.product_name_snapshot}</td>
                  <td className="numeric px-4 py-3 text-right text-sm">{Number(i.quantity)}</td>
                  <td className="numeric px-4 py-3 text-right text-sm text-muted-foreground">
                    {Number(i.quantity_received)}
                  </td>
                  <td className="numeric px-4 py-3 text-right text-sm">
                    {formatMoney(i.unit_cost)}
                  </td>
                  <td className="numeric py-3 pl-4 text-right text-sm font-semibold">
                    {formatMoney(i.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <dl className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="numeric font-medium">{formatMoney(order.subtotal)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Tax</dt>
              <dd className="numeric font-medium">{formatMoney(order.tax_amount)}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <dt className="font-semibold">Order total</dt>
              <dd className="numeric text-2xl font-bold">{formatMoney(order.total_amount)}</dd>
            </div>
          </dl>
        </div>

        {order.notes && (
          <div className="border-t border-border pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Notes
            </p>
            <p className="mt-1 whitespace-pre-line text-sm">{order.notes}</p>
          </div>
        )}
      </div>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this purchase order?</AlertDialogTitle>
            <AlertDialogDescription>
              No stock or accounts are affected — the order is simply marked as cancelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep order</AlertDialogCancel>
            <AlertDialogAction disabled={working} onClick={cancelOrder}>
              {working ? "Cancelling…" : "Cancel order"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
