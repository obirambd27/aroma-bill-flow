import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Ban, FileText, Pencil, Printer, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
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
import { useSettings } from "@/lib/data";
import { adjustCommitted, orderTone, useSalesOrder } from "@/lib/sales";
import { formatDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/sales-orders/$orderId")({
  head: () => ({
    meta: [
      { title: "Sales Order — Fragrance Billing" },
      { name: "description", content: "Sales order details, deliveries and conversion to a bill." },
      { property: "og:title", content: "Sales Order — Fragrance Billing" },
      {
        property: "og:description",
        content: "Sales order details, deliveries and conversion to a bill.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SalesOrderDetail,
});

function SalesOrderDetail() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: order, isLoading } = useSalesOrder(orderId);
  const { data: settings } = useSettings();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [working, setWorking] = useState(false);

  if (isLoading) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Loading sales order…</p>;
  }
  if (!order) {
    return (
      <div className="space-y-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">This sales order no longer exists.</p>
        <Button asChild variant="outline">
          <Link to="/sales-orders">Back to Sales Orders</Link>
        </Button>
      </div>
    );
  }

  const items = order.sales_order_items;
  const ordered = items.reduce((s, i) => s + Number(i.quantity), 0);
  const delivered = items.reduce((s, i) => s + Number(i.quantity_delivered), 0);
  const open = order.status !== "Cancelled" && order.status !== "Converted to Bill";

  const cancelOrder = async () => {
    setWorking(true);
    try {
      for (const item of items) {
        const remaining = Number(item.quantity) - Number(item.quantity_delivered);
        const wId = item.warehouse_id ?? order.warehouse_id;
        if (item.product_id && wId && remaining > 0) {
          await adjustCommitted(item.product_id, wId, -remaining);
        }
      }
      const { error } = await supabase
        .from("sales_orders")
        .update({ status: "Cancelled" })
        .eq("id", order.id);
      if (error) throw error;
      queryClient.invalidateQueries();
      toast.success("Sales order cancelled and reserved stock released");
      setCancelOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel the order");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/sales-orders" })}>
          <ArrowLeft />
          Sales Orders
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer />
            Print
          </Button>
          {open && (
            <>
              <Button asChild variant="outline" size="sm">
                <Link to="/sales-orders/new" search={{ edit: order.id }}>
                  <Pencil />
                  Edit
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/delivery-notes/new" search={{ orderId: order.id }}>
                  <Truck />
                  Create Delivery Note
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/new-bill" search={{ fromOrder: order.id }}>
                  <FileText />
                  Convert to Bill
                </Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)}>
                <Ban />
                Cancel Order
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="no-print flex flex-wrap items-center gap-2">
        <StatusBadge tone={orderTone(order.status)}>{order.status}</StatusBadge>
        <span className="numeric text-xs text-muted-foreground">
          {delivered}/{ordered} units delivered
        </span>
      </div>

      <article className="invoice-sheet surface-card space-y-8 p-6 sm:p-10">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 space-y-1">
            <p className="text-lg font-semibold">{settings?.business_name ?? "Fragrance"}</p>
            {settings?.business_address && (
              <p className="whitespace-pre-line text-sm text-muted-foreground">
                {settings.business_address}
              </p>
            )}
            {settings?.business_phone && (
              <p className="text-sm text-muted-foreground">{settings.business_phone}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tracking-tight">SALES ORDER</p>
            <p className="numeric mt-1 text-sm text-muted-foreground">{order.order_number}</p>
          </div>
        </header>

        <section className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Order To
            </p>
            <p className="mt-1 text-sm font-semibold">
              {order.customers ? (
                <Link
                  to="/customers/$customerId"
                  params={{ customerId: order.customers.id }}
                  className="hover:underline"
                >
                  {order.customers.name}
                </Link>
              ) : (
                "Walk-in Customer"
              )}
            </p>
            {order.customers?.phone && (
              <p className="text-sm text-muted-foreground">{order.customers.phone}</p>
            )}
            {order.customers?.address && (
              <p className="whitespace-pre-line text-sm text-muted-foreground">
                {order.customers.address}
              </p>
            )}
          </div>
          <dl className="space-y-1 text-sm sm:text-right">
            <div className="flex justify-between sm:justify-end sm:gap-6">
              <dt className="text-muted-foreground">Order Date</dt>
              <dd className="font-medium">{formatDate(order.order_date)}</dd>
            </div>
            <div className="flex justify-between sm:justify-end sm:gap-6">
              <dt className="text-muted-foreground">Warehouse</dt>
              <dd className="font-medium">{order.warehouses?.name ?? "—"}</dd>
            </div>
            <div className="flex justify-between sm:justify-end sm:gap-6">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-medium">{order.status}</dd>
            </div>
          </dl>
        </section>

        <section className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 pr-3 text-right">Ordered</th>
                <th className="py-2 pr-3 text-right">Delivered</th>
                <th className="py-2 pr-3 text-right">Rate</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id} className="border-b border-border/60">
                  <td className="py-3 pr-3 text-muted-foreground">{index + 1}</td>
                  <td className="py-3 pr-3 font-medium">{item.product_name_snapshot}</td>
                  <td className="numeric py-3 pr-3 text-right">{Number(item.quantity)}</td>
                  <td className="numeric py-3 pr-3 text-right">
                    {Number(item.quantity_delivered)}
                  </td>
                  <td className="numeric py-3 pr-3 text-right">{formatMoney(item.unit_price)}</td>
                  <td className="numeric py-3 text-right font-medium">
                    {formatMoney(item.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="flex justify-end">
          <dl className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="numeric font-medium">{formatMoney(order.subtotal)}</dd>
            </div>
            {Number(order.discount_amount) > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Discount</dt>
                <dd className="numeric font-medium">− {formatMoney(order.discount_amount)}</dd>
              </div>
            )}
            {order.is_taxed && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax ({Number(order.tax_rate)}%)</dt>
                <dd className="numeric font-medium">{formatMoney(order.tax_amount)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-border pt-2">
              <dt className="font-semibold">Order Total</dt>
              <dd className="numeric text-xl font-bold">{formatMoney(order.total_amount)}</dd>
            </div>
          </dl>
        </section>

        {order.notes && (
          <footer className="border-t border-border pt-4 text-sm text-muted-foreground">
            <p className="whitespace-pre-line">{order.notes}</p>
          </footer>
        )}
      </article>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this sales order?</AlertDialogTitle>
            <AlertDialogDescription>
              Any stock still reserved for this order will be released back to available stock.
              This cannot be undone.
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
