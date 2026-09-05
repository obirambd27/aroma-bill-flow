import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronDown,
  Download,
  Merge,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
import { CustomerMergeDialog } from "@/components/CustomerMergeDialog";
import { DetailError } from "@/components/MasterDetail";
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
import { CustomerTagEditor } from "@/components/CustomerTags";
import { CustomerActivityPanel, CustomerRemindersPanel } from "@/components/CustomerActivityPanel";
import { useCustomer, useCustomerBills, useSettings } from "@/lib/data";
import { useCustomerPaymentsReceived, type PaymentRow } from "@/lib/payments";
import { DeletePaymentDialog } from "@/components/DeletePaymentDialog";
import { BillPreviewSheet } from "@/components/BillPreviewSheet";
import { useMergeRedirect } from "@/lib/customer-merge";
import { printCustomerStatement, statementPeriodLabel } from "@/lib/statement-export";
import { useCustomerCredit } from "@/lib/returns";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

function formatOptionalDate(value: string | null) {
  return value ? formatDate(value) : null;
}

function paymentTone(status: string) {
  if (status === "Paid") return "success" as const;
  if (status === "Partial") return "warning" as const;
  if (status === "Unpaid") return "error" as const;
  return "neutral" as const;
}

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "activity", label: "Activity & Notes" },
  { value: "transactions", label: "Transactions" },
  { value: "statement", label: "Statement" },
] as const;

export function CustomerDetail({ customerId }: { customerId: string }) {
  const navigate = useNavigate();
  const { data: customer, isLoading, isError, refetch } = useCustomer(customerId);
  const { data: mergeInfo } = useMergeRedirect(customerId, !isLoading && !customer && !isError);
  const { data: bills = [] } = useCustomerBills(customerId);
  const { data: payments = [] } = useCustomerPaymentsReceived(customerId);
  const { data: credit } = useCustomerCredit(customerId);
  const [tab, setTab] = useState<string>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<PaymentRow | null>(null);
  const [previewBillId, setPreviewBillId] = useState<string | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const { data: settings } = useSettings();


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
        billId: p.payment_allocations[0]?.bill_id ?? null,
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

  // Live money figures: derived from each finalized bill's own total vs amount paid,
  // matching the "Balance due" shown on the bill detail page.
  const { lifetimeSpend, outstanding } = useMemo(() => {
    let paid = 0;
    let due = 0;
    for (const b of bills) {
      if (b.status !== "Finalized") continue;
      const billPaid = Number(b.amount_paid ?? 0);
      paid += billPaid;
      const balance = Number(b.total_amount ?? 0) - billPaid;
      if (balance > 0.001) due += balance;
    }
    return { lifetimeSpend: paid, outstanding: due };
  }, [bills]);

  const printStatement = () => {
    if (!customer) return;
    try {
      printCustomerStatement({
        business: {
          name: settings?.business_name ?? "Fragrance Billing",
          address: settings?.business_address ?? "",
          phone: settings?.business_phone ?? "",
          email: settings?.business_email ?? "",
          logo: settings?.business_logo_url ?? null,
        },
        customer: {
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          address: customer.address,
        },
        rows: statement.map((r) => ({
          date: r.date,
          label: r.label,
          debit: r.debit,
          credit: r.credit,
          balance: r.balance,
        })),
        outstanding,
        periodLabel: statementPeriodLabel(statement),
      });
    } catch {
      toast.error("Allow pop-ups to print the statement.");
    }
  };

  if (isLoading) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Loading customer…</p>;
  }

  if (isError) {
    return <DetailError message="Could not load this customer." onRetry={() => refetch()} />;
  }

  if (!customer) {
    if (mergeInfo) {
      return (
        <div className="surface-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            This customer has been merged into{" "}
            <Link
              to="/customers/$customerId"
              params={{ customerId: mergeInfo.surviving_customer_id }}
              className="font-medium text-primary hover:underline"
            >
              {mergeInfo.surviving_customer_name}
            </Link>
            .
          </p>
        </div>
      );
    }
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
      <PageHeader
        title={customer.name}
        description={customer.phone ?? customer.email ?? "No contact details yet"}
        actions={
          <>
            <Button variant="outline" className="h-11" onClick={() => setEditOpen(true)}>
              <Pencil />
              Edit
            </Button>
            <Button variant="outline" className="h-11" onClick={() => setMergeOpen(true)}>
              <Merge />
              Merge duplicate
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
            <SummaryCard label="Lifetime spend" value={formatMoney(lifetimeSpend)} big />
            <SummaryCard label="Bills issued" value={String(bills.length)} big />
            <SummaryCard label="Last purchase" value={formatDate(customer.last_purchase_at)} />
            <SummaryCard
              label="Outstanding"
              value={formatMoney(outstanding)}
              big
              tone={outstanding > 0 ? "warning" : "success"}
            />
          </div>

          {credit && credit.remaining > 0.001 && (
            <div className="surface-card flex flex-wrap items-center justify-between gap-4 border-success/30 bg-success/5 p-5">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Credits available
                </p>
                <p className="numeric mt-1 text-2xl font-bold text-success">
                  {formatMoney(credit.remaining)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Across {credit.notes.length} open credit note
                  {credit.notes.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {credit.notes.map((n) => (
                  <Button key={n.id} asChild variant="outline" size="sm">
                    <Link to="/credit-notes/$creditNoteId" params={{ creditNoteId: n.id }}>
                      {n.credit_note_number}
                    </Link>
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="surface-card p-5">
            <h2 className="text-sm font-semibold">Tags</h2>
            <div className="mt-3">
              <CustomerTagEditor customerId={customer.id} />
            </div>
          </div>

          <div className="surface-card p-5">
            <h2 className="text-sm font-semibold">Contact information</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Phone" value={customer.phone} />
              <Field label="Email" value={customer.email} />
              <Field label="Address" value={customer.address} />
              <Field label="Date of birth" value={formatOptionalDate(customer.date_of_birth)} />
              <Field label="Anniversary" value={formatOptionalDate(customer.anniversary_date)} />
              <Field label="Notes" value={customer.notes} />
            </dl>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
              Edit details
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="activity" className="mt-4 space-y-4">
          <CustomerRemindersPanel customerId={customer.id} />
          <CustomerActivityPanel customerId={customer.id} />
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
                      onClick={() => setPreviewBillId(b.id)}
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
                    <th className="px-4 py-3">Bills</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>

                </thead>
                <tbody>
                  {payments.map((p) => {
                    const firstBillId = p.payment_allocations[0]?.bill_id ?? null;
                    const billNumbers =
                      p.payment_allocations
                        .map((a) => a.bills?.bill_number)
                        .filter(Boolean)
                        .join(", ") || "—";
                    return (
                      <tr
                        key={p.id}
                        className={cn(
                          "border-b border-border/60 transition-colors last:border-0",
                          firstBillId && "cursor-pointer hover:bg-muted/50",
                        )}
                        onClick={() => firstBillId && setPreviewBillId(firstBillId)}
                      >
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {formatDate(p.payment_date)}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium">{billNumbers}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {p.payment_method ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {p.reference_number ?? "—"}
                        </td>
                        <td className="numeric px-4 py-3 text-right text-sm font-semibold">
                          {formatMoney(p.amount)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Reverse payment of ${formatMoney(p.amount)}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPaymentToDelete(p);
                            }}
                          >
                            <Trash2 className="text-destructive" />
                          </Button>
                        </td>
                      </tr>

                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="statement" className="mt-4">
          <div className="surface-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border p-4">
              <h2 className="text-sm font-semibold">Running statement</h2>
              <div className="flex flex-wrap items-center gap-2">
                <p className="numeric text-sm font-bold">Balance due {formatMoney(outstanding)}</p>
                <Button variant="outline" size="sm" onClick={printStatement}>
                  <Printer className="h-3.5 w-3.5" />
                  Print
                </Button>
                <Button variant="outline" size="sm" onClick={printStatement}>
                  <Download className="h-3.5 w-3.5" />
                  Save as PDF
                </Button>
              </div>
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
                        onClick={() => row.billId && setPreviewBillId(row.billId)}
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
      <DeletePaymentDialog
        payment={paymentToDelete}
        onOpenChange={(o) => !o && setPaymentToDelete(null)}
      />
      <CustomerMergeDialog open={mergeOpen} onOpenChange={setMergeOpen} primaryId={customerId} />
      <BillPreviewSheet
        billId={previewBillId}
        onOpenChange={(o) => !o && setPreviewBillId(null)}
      />

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
