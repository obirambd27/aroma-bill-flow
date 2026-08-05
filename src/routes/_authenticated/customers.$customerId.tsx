import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ChevronDown, Pencil, Plus, ReceiptText, Wallet } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
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
import { useCustomer, useCustomerBills, useCustomerPayments } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

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
});

function paymentTone(status: string) {
  if (status === "Paid") return "success" as const;
  if (status === "Partial") return "warning" as const;
  if (status === "Unpaid") return "error" as const;
  return "neutral" as const;
}

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "transactions", label: "Transactions" },
  { value: "statement", label: "Statement" },
] as const;

function CustomerDetailPage() {
  const { customerId } = Route.useParams();
  const navigate = useNavigate();
  const { data: customer, isLoading } = useCustomer(customerId);
  const { data: bills = [] } = useCustomerBills(customerId);
  const { data: payments = [] } = useCustomerPayments(customerId);
  const [tab, setTab] = useState<string>("overview");
  const [editOpen, setEditOpen] = useState(false);

  const statement = useMemo(() => {
    const rows = [
      ...bills
        .filter((b) => b.status !== "Draft")
        .map((b) => ({
          id: `bill-${b.id}`,
          date: b.bill_date,
          label: `Bill ${b.bill_number ?? ""}`.trim(),
          billId: b.id,
          debit: Number(b.total_amount),
          credit: 0,
        })),
      ...payments.map((p) => ({
        id: `pay-${p.id}`,
        date: p.payment_date,
        label: `Payment${p.payment_method ? ` · ${p.payment_method}` : ""}`,
        billId: p.bill_id,
        debit: 0,
        credit: Number(p.amount),
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    let balance = 0;
    return rows.map((r) => {
      balance += r.debit - r.credit;
      return { ...r, balance };
    });
  }, [bills, payments]);

  const outstanding = statement.length > 0 ? statement[statement.length - 1]!.balance : 0;

  if (isLoading) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Loading customer…</p>;
  }

  if (!customer) {
    return (
      <div className="surface-card p-8 text-center">
        <p className="text-sm text-muted-foreground">This customer could not be found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/customers">Back to customers</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to="/customers"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Customers
      </Link>

      <PageHeader
        title={customer.name}
        description={customer.phone ?? customer.email ?? "No contact details yet"}
        actions={
          <>
            <Button variant="outline" className="h-11" onClick={() => setEditOpen(true)}>
              <Pencil />
              Edit
            </Button>
            <Button
              className="h-11"
              onClick={() =>
                navigate({ to: "/new-bill", search: { customerId: customer.id } })
              }
            >
              <Plus />
              New Bill
            </Button>
          </>
        }
      />

      {/* Mobile: tabs become a dropdown */}
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Lifetime spend" value={formatMoney(customer.total_spend)} big />
            <SummaryCard label="Bills issued" value={String(bills.length)} big />
            <SummaryCard label="Last purchase" value={formatDate(customer.last_purchase_at)} />
            <SummaryCard
              label="Outstanding"
              value={formatMoney(outstanding)}
              big
              tone={outstanding > 0 ? "warning" : "success"}
            />
          </div>

          <div className="surface-card p-5">
            <h2 className="text-sm font-semibold">Contact information</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Phone" value={customer.phone} />
              <Field label="Email" value={customer.email} />
              <Field label="Address" value={customer.address} />
            </dl>
          </div>
        </TabsContent>

        <TabsContent value="transactions" className="mt-4 space-y-4">
          <Section
            title="Bills"
            icon={ReceiptText}
            count={bills.length}
            emptyText="No bills for this customer yet."
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Warehouse</th>
                    <th className="px-4 py-3">Bill number</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-right">Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((b) => (
                    <tr
                      key={b.id}
                      className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                      onClick={() => navigate({ to: "/bills/$billId", params: { billId: b.id } })}
                    >
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatDate(b.bill_date)}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {b.warehouses?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">{b.bill_number ?? "Draft"}</td>
                      <td className="numeric px-4 py-3 text-right text-sm font-semibold">
                        {formatMoney(b.total_amount)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <StatusBadge tone={paymentTone(b.payment_status)}>
                          {b.payment_status}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="Payments"
            icon={Wallet}
            count={payments.length}
            emptyText="No payments recorded yet."
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px]">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Bill</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr
                      key={p.id}
                      className={cn(
                        "border-b border-border/60 transition-colors last:border-0",
                        p.bill_id && "cursor-pointer hover:bg-muted/50",
                      )}
                      onClick={() =>
                        p.bill_id &&
                        navigate({ to: "/bills/$billId", params: { billId: p.bill_id } })
                      }
                    >
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatDate(p.payment_date)}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {p.bills?.bill_number ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {p.payment_method ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={p.status === "Completed" ? "success" : "warning"}>
                          {p.status}
                        </StatusBadge>
                      </td>
                      <td className="numeric px-4 py-3 text-right text-sm font-semibold">
                        {formatMoney(p.amount)}
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
              <p className="numeric text-sm font-bold">
                Balance due {formatMoney(outstanding)}
              </p>
            </div>
            {statement.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                No transactions yet for this customer.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px]">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Detail</th>
                      <th className="px-4 py-3 text-right">Bill</th>
                      <th className="px-4 py-3 text-right">Payment</th>
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
                          navigate({ to: "/bills/$billId", params: { billId: row.billId } })
                        }
                      >
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {formatDate(row.date)}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium">{row.label}</td>
                        <td className="numeric px-4 py-3 text-right text-sm">
                          {row.debit ? formatMoney(row.debit) : "—"}
                        </td>
                        <td className="numeric px-4 py-3 text-right text-sm">
                          {row.credit ? formatMoney(row.credit) : "—"}
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

      <CustomerFormDialog open={editOpen} onOpenChange={setEditOpen} customer={customer} />
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
