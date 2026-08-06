import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ChevronDown, Pencil, Plus, ReceiptText, Wallet } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { VendorFormDialog } from "@/components/VendorFormDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  purchasePaymentTone,
  useVendor,
  useVendorPaymentsOut,
  useVendorPurchaseBills,
} from "@/lib/purchases";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/vendors/$vendorId")({
  head: () => ({
    meta: [
      { title: "Vendor Detail — Fragrance Billing" },
      {
        name: "description",
        content: "Vendor profile, purchase bills, payments out and running statement.",
      },
      { property: "og:title", content: "Vendor Detail — Fragrance Billing" },
      {
        property: "og:description",
        content: "Vendor profile, purchase bills, payments out and running statement.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VendorDetailPage,
});

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "transactions", label: "Transactions" },
  { value: "statement", label: "Statement" },
] as const;

function VendorDetailPage() {
  const { vendorId } = Route.useParams();
  const navigate = useNavigate();
  const { data: vendor, isLoading } = useVendor(vendorId);
  const { data: bills = [] } = useVendorPurchaseBills(vendorId);
  const { data: paymentsOut = [] } = useVendorPaymentsOut(vendorId);
  const [tab, setTab] = useState<string>("overview");
  const [editOpen, setEditOpen] = useState(false);

  const statement = useMemo(() => {
    const rows = [
      ...bills
        .filter((b) => b.status === "Finalized")
        .map((b) => ({
          id: `bill-${b.id}`,
          date: b.bill_date,
          label: `Purchase bill ${b.bill_number ?? ""}`.trim(),
          billId: b.id as string | null,
          credit: Number(b.total_amount),
          debit: 0,
        })),
      ...paymentsOut.map((p) => ({
        id: `pay-${p.id}`,
        date: p.entry_date,
        label: `Payment out${p.accounts?.name ? ` · ${p.accounts.name}` : ""}`,
        billId: p.purchase_bills?.id ?? null,
        credit: 0,
        debit: Math.abs(Number(p.amount)),
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    let balance = 0;
    return rows.map((r) => {
      balance += r.credit - r.debit;
      return { ...r, balance };
    });
  }, [bills, paymentsOut]);

  const outstanding = statement.length > 0 ? statement[statement.length - 1]!.balance : 0;

  if (isLoading) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Loading vendor…</p>;
  }

  if (!vendor) {
    return (
      <div className="surface-card p-8 text-center">
        <p className="text-sm text-muted-foreground">This vendor could not be found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/vendors">Back to vendors</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to="/vendors"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Vendors
      </Link>

      <PageHeader
        title={vendor.name}
        description={vendor.phone ?? vendor.email ?? "No contact details yet"}
        actions={
          <>
            <Button variant="outline" className="h-11" onClick={() => setEditOpen(true)}>
              <Pencil />
              Edit
            </Button>
            <Button
              className="h-11"
              onClick={() =>
                navigate({ to: "/purchase-bills/new", search: { vendorId: vendor.id } })
              }
            >
              <Plus />
              New Purchase Bill
            </Button>
          </>
        }
      />

      <div className="md:hidden">
        <Select value={tab} onValueChange={setTab}>
          <SelectTrigger className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TABS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="hidden md:inline-flex">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard label="Total purchased" value={formatMoney(vendor.total_purchased)} big />
            <SummaryCard label="Purchase bills" value={String(bills.length)} big />
            <SummaryCard
              label="Outstanding"
              value={formatMoney(outstanding)}
              big
              tone={outstanding > 0.001 ? "warning" : "success"}
            />
          </div>

          <div className="surface-card p-5">
            <h2 className="text-sm font-semibold">Contact information</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Phone" value={vendor.phone} />
              <Field label="Email" value={vendor.email} />
              <Field label="Address" value={vendor.address} />
              <Field label="Notes" value={vendor.notes} />
            </dl>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
              Edit details
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="transactions" className="mt-4 space-y-4">
          <Section
            title="Purchase Bills"
            icon={ReceiptText}
            count={bills.length}
            emptyText="No purchase bills for this vendor yet."
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Bill #</th>
                    <th className="px-4 py-3">Warehouse</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((b) => (
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
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatDate(b.bill_date)}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">{b.bill_number ?? "—"}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {b.warehouses?.name ?? "—"}
                      </td>
                      <td className="numeric px-4 py-3 text-right text-sm font-semibold">
                        {formatMoney(b.total_amount)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <StatusBadge tone={purchasePaymentTone(b.payment_status)}>
                          {b.status === "Voided" ? "Voided" : b.payment_status}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="Payments Out"
            icon={Wallet}
            count={paymentsOut.length}
            emptyText="No payments made to this vendor yet."
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px]">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Bill</th>
                    <th className="px-4 py-3">Paid from</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentsOut.map((p) => (
                    <tr
                      key={p.id}
                      className={cn(
                        "border-b border-border/60 transition-colors last:border-0",
                        p.purchase_bills?.id && "cursor-pointer hover:bg-muted/50",
                      )}
                      onClick={() =>
                        p.purchase_bills?.id &&
                        navigate({
                          to: "/purchase-bills/$purchaseBillId",
                          params: { purchaseBillId: p.purchase_bills.id },
                        })
                      }
                    >
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatDate(p.entry_date)}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {p.purchase_bills?.bill_number ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {p.accounts?.name ?? "—"}
                      </td>
                      <td className="numeric px-4 py-3 text-right text-sm font-semibold">
                        {formatMoney(Math.abs(Number(p.amount)))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="statement" className="mt-4">
          <div className="surface-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border p-4">
              <h2 className="text-sm font-semibold">Running statement</h2>
              <p className="numeric text-sm font-bold">You owe {formatMoney(outstanding)}</p>
            </div>
            {statement.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                No transactions yet for this vendor.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px]">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Detail</th>
                      <th className="px-4 py-3 text-right">Bill</th>
                      <th className="px-4 py-3 text-right">Paid</th>
                      <th className="px-4 py-3 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.map((row) => (
                      <tr
                        key={row.id}
                        className={cn(
                          "border-b border-border/60 transition-colors last:border-0",
                          row.billId && "cursor-pointer hover:bg-muted/50",
                        )}
                        onClick={() =>
                          row.billId &&
                          navigate({
                            to: "/purchase-bills/$purchaseBillId",
                            params: { purchaseBillId: row.billId },
                          })
                        }
                      >
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {formatDate(row.date)}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium">{row.label}</td>
                        <td className="numeric px-4 py-3 text-right text-sm">
                          {row.credit ? formatMoney(row.credit) : "—"}
                        </td>
                        <td className="numeric px-4 py-3 text-right text-sm">
                          {row.debit ? formatMoney(row.debit) : "—"}
                        </td>
                        <td className="numeric px-4 py-3 text-right text-sm font-semibold">
                          {formatMoney(row.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <VendorFormDialog open={editOpen} onOpenChange={setEditOpen} vendor={vendor} />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  big,
  tone,
}: {
  label: string;
  value: string;
  big?: boolean;
  tone?: "warning" | "success";
}) {
  return (
    <div className="surface-card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "numeric mt-2 font-bold",
          big ? "text-2xl" : "text-base",
          tone === "warning" && "text-warning-foreground",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm">{value || "—"}</dd>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  count,
  emptyText,
  children,
}: {
  title: string;
  icon: typeof ReceiptText;
  count: number;
  emptyText: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="surface-card overflow-hidden">
      <CollapsibleTrigger className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/50">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</span>
        <span className="numeric shrink-0 text-xs text-muted-foreground">{count}</span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        {count === 0 ? (
          <p className="border-t border-border p-8 text-center text-sm text-muted-foreground">
            {emptyText}
          </p>
        ) : (
          <div className="border-t border-border">{children}</div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
