import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Ban, FileText, Pencil, Printer, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import {
  DocFooter,
  DocHero,
  DocItemsList,
  DocPartyCards,
  DocTotals,
  DocumentSheet,
} from "@/components/DocumentSheet";
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

      <DocumentSheet>
        <DocHero
          logoUrl={settings?.business_logo_url}
          businessName={settings?.business_name ?? "Fragrance"}
          tagline={settings?.business_tagline}
          chipLabel="Sales Order"
          documentNumber={order.order_number ?? "Draft"}
          stats={[
            { label: "Order Date", value: formatDate(order.order_date) },
            { label: "Delivered", value: `${delivered}/${ordered} units` },
            { label: "Order Total", value: formatMoney(order.total_amount) },
          ]}
        />

        <DocPartyCards
          left={{
            title: "Order To",
            name: order.customers?.name ?? "Walk-in Customer",
            lines: [order.customers?.address, order.customers?.phone],
          }}
          right={{
            title: "From",
            name: settings?.business_name ?? "—",
            lines: [
              settings?.business_address,
              settings?.business_phone,
              order.warehouses?.name ? `Warehouse: ${order.warehouses.name}` : null,
              `Status: ${order.status}`,
            ],
          }}
        />

        <DocItemsList
          qtyLabel="Ordered"
          items={items.map((item) => ({
            key: item.id,
            name: item.product_name_snapshot,
            subtitle: `${Number(item.quantity_delivered)} delivered`,
            quantity: Number(item.quantity),
            unitPrice: item.unit_price,
            lineTotal: item.line_total,
          }))}
        />

        <DocTotals
          rows={[
            { label: "Subtotal", value: formatMoney(order.subtotal) },
            ...(Number(order.discount_amount) > 0
              ? [{ label: "Discount", value: `−${formatMoney(order.discount_amount)}` }]
              : []),
            ...(order.is_taxed
              ? [
                  {
                    label: `Tax (${Number(order.tax_rate)}%)`,
                    value: formatMoney(order.tax_amount),
                  },
                ]
              : []),
          ]}
          totalLabel="Order Total"
          totalValue={order.total_amount}
        />

        <DocFooter
          terms={settings?.terms_and_conditions}
          note={order.notes}
          signatureUrl={settings?.signature_url}
          businessName={settings?.business_name ?? "—"}
        />
      </DocumentSheet>

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
