import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, FileText, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
import { formatDate, formatMoney } from "@/lib/format";
import { rejectPriceListOrderFn } from "@/lib/public-order.functions";
import {
  orderStatusTone,
  useAdjustOrderPrices,
  usePriceListOrder,
  useUpdateOrderStatus,
} from "@/lib/price-list-orders";

export const Route = createFileRoute("/_authenticated/price-list-orders/$orderId")({
  head: () => ({
    meta: [
      { title: "Online Order — Fragrance Billing" },
      { name: "description", content: "Review, price and convert a customer's online order." },
      { property: "og:title", content: "Online Order — Fragrance Billing" },
      {
        property: "og:description",
        content: "Review, price and convert a customer's online order.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OnlineOrderDetail,
});

function OnlineOrderDetail() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = usePriceListOrder(orderId);
  const updateStatus = useUpdateOrderStatus(orderId);
  const adjustPrices = useAdjustOrderPrices(orderId);
  const rejectOrder = useServerFn(rejectPriceListOrderFn);

  const [prices, setPrices] = useState<Record<string, string>>({});
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    if (!data) return;
    setPrices(
      Object.fromEntries(data.items.map((i) => [i.id, String(Number(i.applied_price))])),
    );
  }, [data]);

  if (isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (!data)
    return (
      <div className="space-y-4">
        <PageHeader title="Order not found" description="This order may have been removed." />
        <Button asChild variant="outline">
          <Link to="/price-list-orders">Back to online orders</Link>
        </Button>
      </div>
    );

  const { order, items } = data;
  const editable = order.status !== "Rejected" && order.status !== "Converted to Bill";
  const liveTotal = items.reduce(
    (s, i) => s + (Number(prices[i.id] ?? i.applied_price) || 0) * Number(i.quantity),
    0,
  );

  const saveAdjustments = () =>
    adjustPrices.mutate(
      items.map((i) => ({
        id: i.id,
        appliedPrice: Number(prices[i.id] ?? i.applied_price) || 0,
        quantity: Number(i.quantity),
      })),
      {
        onSuccess: () => toast.success("Prices updated"),
        onError: () => toast.error("Couldn't update prices"),
      },
    );

  const doReject = async () => {
    setRejecting(true);
    try {
      const result = await rejectOrder({ data: { orderId, reason } });
      if (!result?.ok) throw new Error("failed");
      toast.success("Order rejected — stock restored");
      setRejectOpen(false);
      void qc.invalidateQueries({ queryKey: ["price-list-order", orderId] });
      void qc.invalidateQueries({ queryKey: ["price-list-orders"] });
    } catch {
      toast.error("Couldn't reject this order");
    } finally {
      setRejecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/price-list-orders">
          <ArrowLeft />
          Back to online orders
        </Link>
      </Button>

      <PageHeader
        title={order.order_number ?? "Online Order"}
        description={`Placed ${formatDate(order.created_at.slice(0, 10))} from ${
          order.price_lists?.name ?? "a price list"
        }`}
        actions={<StatusBadge tone={orderStatusTone(order.status)}>{order.status}</StatusBadge>}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const price = Number(prices[i.id] ?? i.applied_price) || 0;
                  return (
                    <tr key={i.id} className="border-t border-border">
                      <td className="px-4 py-3">{i.product_name_snapshot}</td>
                      <td className="px-4 py-3 text-right">{Number(i.quantity)}</td>
                      <td className="px-4 py-3 text-right">
                        {editable ? (
                          <Input
                            aria-label={`Price for ${i.product_name_snapshot}`}
                            className="ml-auto h-9 w-28 text-right"
                            inputMode="decimal"
                            value={prices[i.id] ?? ""}
                            onChange={(e) =>
                              setPrices((prev) => ({ ...prev, [i.id]: e.target.value }))
                            }
                          />
                        ) : (
                          formatMoney(Number(i.applied_price))
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatMoney(price * Number(i.quantity))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
            <div className="text-sm text-muted-foreground">
              {order.was_price_increased
                ? `Below-minimum pricing applied (+${Number(order.increase_percent)}%)`
                : "Standard price list pricing"}
            </div>
            <div className="text-lg font-bold">Total {formatMoney(liveTotal)}</div>
          </div>

          {editable && (
            <div className="border-t border-border p-4">
              <Button onClick={saveAdjustments} disabled={adjustPrices.isPending}>
                {adjustPrices.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                Save price adjustments
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="surface-card space-y-2 p-4 text-sm">
            <h2 className="text-sm font-semibold text-foreground">Customer</h2>
            <p className="font-medium">{order.customer_name}</p>
            <p className="text-muted-foreground">{order.customer_phone}</p>
            {order.customer_email && (
              <p className="text-muted-foreground">{order.customer_email}</p>
            )}
            {order.customer_address && (
              <p className="whitespace-pre-line text-muted-foreground">{order.customer_address}</p>
            )}
            {order.customer_note && (
              <p className="rounded-lg bg-muted/50 p-3 text-muted-foreground">
                <span className="font-medium text-foreground">Note: </span>
                {order.customer_note}
              </p>
            )}
            {order.rejection_reason && (
              <p className="rounded-lg bg-destructive/10 p-3 text-destructive">
                Rejected: {order.rejection_reason}
              </p>
            )}
          </div>

          <div className="surface-card space-y-3 p-4">
            <h2 className="text-sm font-semibold text-foreground">Actions</h2>
            {order.status === "Converted to Bill" && order.converted_bill_id ? (
              <Button asChild variant="outline" className="w-full">
                <Link to="/bills/$billId" params={{ billId: order.converted_bill_id }}>
                  <FileText />
                  View bill
                </Link>
              </Button>
            ) : null}

            {editable && (
              <>
                {order.status === "New" && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => updateStatus.mutate("Reviewed")}
                    disabled={updateStatus.isPending}
                  >
                    Mark as Reviewed
                  </Button>
                )}
                {order.status !== "Approved" && (
                  <Button
                    className="w-full"
                    onClick={() => updateStatus.mutate("Approved")}
                    disabled={updateStatus.isPending}
                  >
                    Approve order
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    navigate({ to: "/new-bill", search: { fromPriceListOrder: order.id } })
                  }
                >
                  Convert to Bill
                </Button>
                <Button
                  variant="outline"
                  className="w-full text-destructive"
                  onClick={() => setRejectOpen(true)}
                >
                  Reject &amp; restore stock
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this order?</AlertDialogTitle>
            <AlertDialogDescription>
              The reserved stock will be returned to inventory and the order marked as rejected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rejecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={rejecting}
              onClick={(e) => {
                e.preventDefault();
                void doReject();
              }}
            >
              {rejecting ? "Rejecting…" : "Reject order"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
