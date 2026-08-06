import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, ReceiptText, Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PB_STATUSES,
  purchaseBillTone,
  purchasePaymentTone,
  usePurchaseBills,
  useVendors,
} from "@/lib/purchases";
import { useWarehouses } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/purchase-bills/")({
  head: () => ({
    meta: [
      { title: "Purchase Bills — Fragrance Billing" },
      { name: "description", content: "Supplier bills, stock received and what you still owe." },
      { property: "og:title", content: "Purchase Bills — Fragrance Billing" },
      {
        property: "og:description",
        content: "Supplier bills, stock received and what you still owe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PurchaseBillsPage,
});

function PurchaseBillsPage() {
  const navigate = useNavigate();
  const { data: bills = [], isLoading } = usePurchaseBills();
  const { data: vendors = [] } = useVendors();
  const { data: warehouses = [] } = useWarehouses();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [vendorId, setVendorId] = useState("all");
  const [warehouseId, setWarehouseId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bills.filter((b) => {
      const matchesQuery =
        !q ||
        (b.bill_number ?? "").toLowerCase().includes(q) ||
        (b.vendors?.name ?? "").toLowerCase().includes(q);
      const matchesStatus = status === "all" || b.status === status;
      const matchesVendor = vendorId === "all" || b.vendor_id === vendorId;
      const matchesWarehouse = warehouseId === "all" || b.warehouse_id === warehouseId;
      const matchesFrom = !from || b.bill_date >= from;
      const matchesTo = !to || b.bill_date <= to;
      return (
        matchesQuery &&
        matchesStatus &&
        matchesVendor &&
        matchesWarehouse &&
        matchesFrom &&
        matchesTo
      );
    });
  }, [bills, query, status, vendorId, warehouseId, from, to]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Bills"
        description="Recording a purchase bill brings stock in and updates your accounts."
        actions={
          <Button asChild>
            <Link to="/purchase-bills/new">
              <Plus />
              New Purchase Bill
            </Link>
          </Button>
        }
      />

      <div className="surface-card overflow-hidden">
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative min-w-0 lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 pl-9"
              placeholder="Search bill number or vendor"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {PB_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={vendorId} onValueChange={setVendorId}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vendors</SelectItem>
              {vendors.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All warehouses</SelectItem>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
            <Input
              type="date"
              aria-label="From date"
              className="h-11"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <Input
              type="date"
              aria-label="To date"
              className="h-11"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading purchase bills…</p>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title={bills.length === 0 ? "No purchase bills yet" : "No matches"}
            description={
              bills.length === 0
                ? "Record a purchase bill when stock arrives from a supplier."
                : "Try a different bill number, vendor, warehouse or date range."
            }
            {...(bills.length === 0
              ? {
                  actionLabel: "New Purchase Bill",
                  onAction: () => {
                    void navigate({ to: "/purchase-bills/new" });
                  },
                }
              : {})}
          />
        ) : (
          <>
            <table className="hidden w-full md:table">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Bill #</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Warehouse</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((b) => (
                  <tr
                    key={b.id}
                    className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                    onClick={() =>
                      navigate({
                        to: "/purchase-bills/$purchaseBillId",
                        params: { purchaseBillId: b.id },
                      })
                    }
                  >
                    <td className="px-4 py-3 text-sm font-medium">{b.bill_number ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatDate(b.bill_date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {b.vendors?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {b.warehouses?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={purchasePaymentTone(b.payment_status)}>
                        {b.payment_status}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={purchaseBillTone(b.status)}>{b.status}</StatusBadge>
                    </td>
                    <td className="numeric px-4 py-3 text-right text-sm font-bold">
                      {formatMoney(b.total_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="divide-y divide-border/60 md:hidden">
              {visible.map((b) => (
                <Link
                  key={b.id}
                  to="/purchase-bills/$purchaseBillId"
                  params={{ purchaseBillId: b.id }}
                  className="block space-y-2 p-4 active:bg-muted/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{b.bill_number ?? "—"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {b.vendors?.name ?? "—"} · {formatDate(b.bill_date)}
                      </p>
                    </div>
                    <p className="numeric shrink-0 text-base font-bold">
                      {formatMoney(b.total_amount)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={purchasePaymentTone(b.payment_status)}>
                      {b.payment_status}
                    </StatusBadge>
                    <StatusBadge tone={purchaseBillTone(b.status)}>{b.status}</StatusBadge>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
