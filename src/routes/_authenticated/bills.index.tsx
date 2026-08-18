import { Fragment, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ReceiptText,
  Search,
  Plus,
  Eye,
  Download,
  Wallet,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  Check,
  Trash2,
  CalendarClock,
  PackageOpen,

} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { RecordPaymentDialog } from "@/components/RecordPaymentDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBillHistory, useCustomers, useAllWarehouses, type BillHistoryRow } from "@/lib/data";
import {
  PaymentMethodTag,
  PaymentMethodTiles,
  type MethodTotals,
} from "@/components/PaymentMethodBreakdown";
import { formatDate, formatMoney } from "@/lib/format";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { usePaymentsReceived } from "@/lib/payments";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/bills/")({
  validateSearch: (search: Record<string, unknown>): { pending?: boolean } =>
    search['pending'] === true || search['pending'] === "true" ? { pending: true } : {},


  head: () => ({
    meta: [
      { title: "Bill History — Fragrance Billing" },
      {
        name: "description",
        content: "Search, filter and track every bill: payments, warehouses, returns and credits.",
      },
      { property: "og:title", content: "Bill History — Fragrance Billing" },
      {
        property: "og:description",
        content: "Search, filter and track every bill: payments, warehouses, returns and credits.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BillsPage,
});

const PAGE_SIZE = 25;
const PAYMENT_STATUSES = ["Paid", "Partial", "Unpaid"] as const;
const BILL_STATUSES = ["Draft", "Finalized", "Voided"] as const;

function paymentTone(status: string) {
  if (status === "Paid") return "success" as const;
  if (status === "Partial") return "warning" as const;
  return "error" as const;
}

function billStatusTone(status: string) {
  if (status === "Voided") return "error" as const;
  if (status === "Finalized") return "accent" as const;
  return "neutral" as const;
}

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function presetRange(preset: string): { from: string; to: string } | null {
  const now = new Date();
  const today = toISO(now);
  if (preset === "today") return { from: today, to: today };
  if (preset === "week") {
    const d = new Date(now);
    const day = (d.getDay() + 6) % 7; // Monday start
    d.setDate(d.getDate() - day);
    return { from: toISO(d), to: today };
  }
  if (preset === "month") {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toISO(d), to: today };
  }
  return null;
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const summary = selected.length === 0 ? `All ${label.toLowerCase()}` : selected.join(", ");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-11 justify-between font-normal">
          <span className="truncate">{summary}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-2">
        {options.map((opt) => {
          const checked = selected.includes(opt);
          return (
            <label
              key={opt}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() =>
                  onChange(checked ? selected.filter((s) => s !== opt) : [...selected, opt])
                }
              />
              {opt}
            </label>
          );
        })}
        {selected.length > 0 && (
          <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={() => onChange([])}>
            Clear
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function WarehouseCell({ names }: { names: string[] }) {
  if (names.length === 0) return <span className="text-sm text-muted-foreground">—</span>;
  if (names.length === 1) return <span className="text-sm text-muted-foreground">{names[0]}</span>;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Multiple ({names.length})
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-3" onClick={(e) => e.stopPropagation()}>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Warehouses
        </p>
        <ul className="space-y-1 text-sm">
          {names.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Chips for every method money actually came in on for this bill. */
function MethodCell({ row }: { row: BillHistoryRow }) {
  if (row.methods.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {row.methods.map((m) => (
        <span key={m} className="inline-flex items-center gap-1">
          <PaymentMethodTag method={m} />
          <span className="numeric text-xs text-muted-foreground">
            {formatMoney(row.paidByMethod[m] ?? 0)}
          </span>
        </span>
      ))}
    </div>
  );
}

function ReturnBadge({ row }: { row: BillHistoryRow }) {
  if (row.returns.length === 0) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button onClick={(e) => e.stopPropagation()}>
          <StatusBadge tone="warning" className="gap-1">
            <RotateCcw className="h-3 w-3" />
            {row.returns.length}
          </StatusBadge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-3" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Returned {formatMoney(row.returnedAmount)}
        </p>
        <ul className="mt-2 space-y-1 text-sm">
          {row.returns.map((r) => (
            <li key={r.id} className="flex justify-between gap-3">
              <Link
                to="/sales-returns/$returnId"
                params={{ returnId: r.id }}
                className="text-primary hover:underline"
              >
                {r.return_number}
              </Link>
              <span className="numeric">{formatMoney(r.total_amount)}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function RelatedDetail({ row }: { row: BillHistoryRow }) {
  const has =
    row.returns.length > 0 ||
    row.creditNotes.length > 0 ||
    Boolean(row.salesOrder) ||
    row.deliveryNotes.length > 0;
  return (
    <div className="grid gap-4 border-t border-border/60 bg-muted/30 p-4 text-sm sm:grid-cols-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Sales order
        </p>
        {row.salesOrder ? (
          <Link
            to="/sales-orders/$orderId"
            params={{ orderId: row.salesOrder.id }}
            className="mt-1 block text-primary hover:underline"
          >
            {row.salesOrder.order_number ?? "Order"}
          </Link>
        ) : (
          <p className="mt-1 text-muted-foreground">None</p>
        )}
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Delivery notes
        </p>
        {row.deliveryNotes.length === 0 ? (
          <p className="mt-1 text-muted-foreground">None</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {row.deliveryNotes.map((d) => (
              <li key={d.id}>
                <Link
                  to="/delivery-notes/$deliveryId"
                  params={{ deliveryId: d.id }}
                  className="text-primary hover:underline"
                >
                  {d.delivery_number ?? "Delivery"}
                </Link>{" "}
                <span className="text-xs text-muted-foreground">{d.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Sales returns
        </p>
        {row.returns.length === 0 ? (
          <p className="mt-1 text-muted-foreground">None</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {row.returns.map((r) => (
              <li key={r.id}>
                <Link
                  to="/sales-returns/$returnId"
                  params={{ returnId: r.id }}
                  className="text-primary hover:underline"
                >
                  {r.return_number}
                </Link>{" "}
                <span className="numeric text-muted-foreground">{formatMoney(r.total_amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Credit notes applied
        </p>
        {row.creditNotes.length === 0 ? (
          <p className="mt-1 text-muted-foreground">None</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {row.creditNotes.map((c) => (
              <li key={c.id}>
                <Link
                  to="/credit-notes/$creditNoteId"
                  params={{ creditNoteId: c.id }}
                  className="text-primary hover:underline"
                >
                  {c.credit_note_number}
                </Link>{" "}
                <span className="numeric text-muted-foreground">
                  {formatMoney(c.amount_applied)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Warehouses
        </p>
        <p className="mt-1 text-muted-foreground">
          {row.warehouseNames.length ? row.warehouseNames.join(", ") : "—"}
        </p>
        {!has && (
          <p className="mt-2 text-xs text-muted-foreground">
            No returns or credits issued against this bill.
          </p>
        )}
      </div>
    </div>
  );
}

function BillsPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { data: bills = [], isLoading } = useBillHistory();

  const { data: payments = [] } = usePaymentsReceived();
  const [collectionOpen, setCollectionOpen] = useState(false);
  const { data: customers = [] } = useCustomers();
  const { data: warehouses = [] } = useAllWarehouses();

  const [query, setQuery] = useState("");
  const [preset, setPreset] = useState(search.pending ? "all" : "today");
  const [pendingOnly, setPendingOnly] = useState(Boolean(search.pending));

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [customerId, setCustomerId] = useState("all");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState("all");
  const [payStatuses, setPayStatuses] = useState<string[]>([]);
  const [billStatuses, setBillStatuses] = useState<string[]>([]);
  const [tax, setTax] = useState("all");
  const [methodFilter, setMethodFilter] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [paymentFor, setPaymentFor] = useState<BillHistoryRow | null>(null);

  const range = preset === "custom" ? { from, to } : presetRange(preset);
  const warehouseNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const w of warehouses) m[w.id] = w.name;
    return m;
  }, [warehouses]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bills.filter((b) => {
      if (
        q &&
        !(b.bill_number ?? "").toLowerCase().includes(q) &&
        !(b.customers?.name ?? "walk-in customer").toLowerCase().includes(q)
      )
        return false;
      if (range?.from && b.bill_date < range.from) return false;
      if (range?.to && b.bill_date > range.to) return false;
      if (customerId !== "all") {
        if (customerId === "walk-in" ? b.customer_id : b.customer_id !== customerId) return false;
      }
      if (warehouseId !== "all" && !b.warehouseNames.includes(warehouseNameById[warehouseId] ?? ""))
        return false;
      if (payStatuses.length && !payStatuses.includes(b.payment_status)) return false;
      if (billStatuses.length && !billStatuses.includes(b.status)) return false;
      if (tax === "taxed" && !b.is_taxed) return false;
      if (tax === "untaxed" && b.is_taxed) return false;
      if (methodFilter && !b.methods.includes(methodFilter)) return false;
      if (pendingOnly && !b.hasPendingPickup) return false;
      return true;
    });
  }, [
    bills,
    query,
    range?.from,
    range?.to,
    customerId,
    warehouseId,
    warehouseNameById,
    payStatuses,
    billStatuses,
    tax,
    methodFilter,
    pendingOnly,
  ]);


  const todaysCollection = useMemo(() => {
    const today = toISO(new Date());
    const lines: {
      key: string;
      customer: string;
      billNumber: string;
      billDate: string;
      method: string | null;
      amount: number;
    }[] = [];
    let total = 0;
    for (const p of payments) {
      if ((p.payment_date ?? "").slice(0, 10) !== today) continue;
      for (const a of p.payment_allocations ?? []) {
        const bill = bills.find((b) => b.id === a.bill_id);
        if (!bill || (bill.bill_date ?? "").slice(0, 10) >= today) continue;
        const amount = Number(a.amount_allocated ?? 0);
        if (amount <= 0) continue;
        total += amount;
        lines.push({
          key: a.id,
          customer: p.customers?.name ?? bill.customers?.name ?? "Walk-in Customer",
          billNumber: bill.bill_number ?? "—",
          billDate: bill.bill_date,
          method: p.payment_method ?? null,
          amount,
        });
      }
    }
    lines.sort((a, b) => b.amount - a.amount);
    return { total, lines };
  }, [payments, bills]);

  const summary = useMemo(() => {
    let revenue = 0;
    let outstanding = 0;
    let collected = 0;
    const methodTotals: MethodTotals = {};
    const counts = { Paid: 0, Partial: 0, Unpaid: 0 } as Record<string, number>;
    for (const b of visible) {
      if (b.status === "Voided") continue;
      revenue += Number(b.total_amount);
      if (b.payment_status !== "Paid") outstanding += b.balanceDue;
      counts[b.payment_status] = (counts[b.payment_status] ?? 0) + 1;
      for (const [method, amount] of Object.entries(b.paidByMethod)) {
        methodTotals[method] = (methodTotals[method] ?? 0) + amount;
        collected += amount;
      }
    }
    return { revenue, outstanding, counts, methodTotals, collected };
  }, [visible]);

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const resetPage = () => setPage(1);

  const selectedCustomerLabel =
    customerId === "all"
      ? "All customers"
      : customerId === "walk-in"
        ? "Walk-in Customer"
        : (customers.find((c) => c.id === customerId)?.name ?? "All customers");

  const openBill = (id: string) => navigate({ to: "/bills/$billId", params: { billId: id } });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bill History"
        description="Every bill with payments, warehouses, returns and credits."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/bills/deleted">
                <Trash2 />
                Deleted Bills
              </Link>
            </Button>
            <Button asChild>
              <Link to="/new-bill" search={{}}>
                <Plus />
                New Bill
              </Link>
            </Button>
          </>
        }
      />

      {/* Summary bar */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="surface-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bills</p>
          <p className="numeric mt-1 text-2xl font-bold">{visible.length}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Revenue
          </p>
          <p className="numeric mt-1 text-2xl font-bold">{formatMoney(summary.revenue)}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Outstanding
          </p>
          <p className="numeric mt-1 text-2xl font-bold text-warning-foreground">
            {formatMoney(summary.outstanding)}
          </p>
        </div>
        <div className="surface-card flex flex-wrap items-center gap-2 p-4">
          <StatusBadge tone="success">Paid {summary.counts["Paid"] ?? 0}</StatusBadge>
          <StatusBadge tone="warning">Partial {summary.counts["Partial"] ?? 0}</StatusBadge>
          <StatusBadge tone="error">Unpaid {summary.counts["Unpaid"] ?? 0}</StatusBadge>
        </div>
      </div>

      <PaymentMethodTiles
        label="Collected"
        totals={summary.methodTotals}
        totalSales={summary.collected}
        active={methodFilter}
        onSelect={(m) => {
          setMethodFilter(m);
          setPage(1);
        }}
      />

      {/* Today's collection against previously-due bills */}
      <div className="surface-card p-4">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={() => setCollectionOpen((v) => !v)}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <CalendarClock className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Today&apos;s collection (older bills)
              </p>
              <p className="numeric text-2xl font-bold">{formatMoney(todaysCollection.total)}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            {todaysCollection.lines.length} payment
            {todaysCollection.lines.length === 1 ? "" : "s"}
            {todaysCollection.lines.length > 0 &&
              (collectionOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              ))}
          </div>
        </button>
        {collectionOpen && todaysCollection.lines.length > 0 && (
          <ul className="mt-3 divide-y divide-border/60 border-t border-border/60">
            {todaysCollection.lines.map((l) => (
              <li key={l.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{l.customer}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {l.billNumber} · billed {formatDate(l.billDate)}
                    {l.method ? ` · ${l.method}` : ""}
                  </p>
                </div>
                <span className="numeric shrink-0 font-semibold">{formatMoney(l.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="surface-card overflow-hidden">
        {/* Search + filter toggle */}
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 pl-9"
              placeholder="Search bill number or customer"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                resetPage();
              }}
            />
          </div>
          <Button
            variant="outline"
            className="h-11 sm:hidden"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <SlidersHorizontal />
            Filters
          </Button>
        </div>

        <div
          className={cn(
            "grid gap-3 border-b border-border p-4 sm:grid-cols-2 xl:grid-cols-3",
            filtersOpen ? "grid" : "hidden sm:grid",
          )}
        >
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Date range</Label>
            <Select
              value={preset}
              onValueChange={(v) => {
                setPreset(v);
                resetPage();
              }}
            >
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This week</SelectItem>
                <SelectItem value="month">This month</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
            {preset === "custom" && (
              <DateRangeFilter
                from={from}
                to={to}
                onChange={(r) => {
                  setFrom(r.from);
                  setTo(r.to);
                  resetPage();
                }}
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Customer</Label>
            <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-11 w-full justify-between font-normal">
                  <span className="truncate">{selectedCustomerLabel}</span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[260px] p-0">
                <Command>
                  <CommandInput placeholder="Search customers…" />
                  <CommandList>
                    <CommandEmpty>No customer found.</CommandEmpty>
                    <CommandGroup>
                      {[
                        { id: "all", name: "All customers" },
                        { id: "walk-in", name: "Walk-in Customer" },
                        ...customers.map((c) => ({ id: c.id, name: c.name })),
                      ].map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.name}
                          onSelect={() => {
                            setCustomerId(c.id);
                            setCustomerOpen(false);
                            resetPage();
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              customerId === c.id ? "opacity-100" : "opacity-0",
                            )}
                          />
                          {c.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Warehouse</Label>
            <Select
              value={warehouseId}
              onValueChange={(v) => {
                setWarehouseId(v);
                resetPage();
              }}
            >
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
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Payment status</Label>
            <MultiSelect
              label="payments"
              options={PAYMENT_STATUSES}
              selected={payStatuses}
              onChange={(v) => {
                setPayStatuses(v);
                resetPage();
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Bill status</Label>
            <MultiSelect
              label="statuses"
              options={BILL_STATUSES}
              selected={billStatuses}
              onChange={(v) => {
                setBillStatuses(v);
                resetPage();
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Tax</Label>
            <Select
              value={tax}
              onValueChange={(v) => {
                setTax(v);
                resetPage();
              }}
            >
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All bills</SelectItem>
                <SelectItem value="taxed">Taxed only</SelectItem>
                <SelectItem value="untaxed">No tax only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Pickup</Label>
            <Select
              value={pendingOnly ? "pending" : "all"}
              onValueChange={(v) => {
                setPendingOnly(v === "pending");
                resetPage();
              }}
            >
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All bills</SelectItem>
                <SelectItem value="pending">Pending pickup only</SelectItem>
              </SelectContent>
            </Select>
          </div>

        </div>

        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading bills…</p>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title={bills.length === 0 ? "No bills yet" : "No matches"}
            description={
              bills.length === 0
                ? "Create your first sales bill — it only takes a few seconds."
                : "Try a different search, date range or filter combination."
            }
            {...(bills.length === 0
              ? {
                  actionLabel: "Create Your First Bill",
                  onAction: () => {
                    void navigate({ to: "/new-bill", search: {} });
                  },
                }
              : {})}
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[1080px]">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="w-8 px-2 py-3" />
                  <th className="px-4 py-3">Bill</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Warehouse</th>
                  <th className="px-4 py-3">Tax</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((b) => (
                  <Fragment key={b.id}>
                    <tr
                      className="cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/50"
                      onClick={() => openBill(b.id)}
                    >
                      <td className="px-2 py-3">
                        <button
                          aria-label="Toggle related documents"
                          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpanded(expanded === b.id ? null : b.id);
                          }}
                        >
                          {expanded === b.id ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className={cn(
                              "text-sm font-medium",
                              b.status === "Voided" && "text-muted-foreground line-through",
                            )}
                          >
                            {b.bill_number}
                          </span>
                          {b.hasPendingPickup && (
                            <PackageOpen
                              className="h-4 w-4 text-warning-foreground"
                              aria-label="Pending pickup"
                            />
                          )}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatDate(b.bill_date)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {b.customers ? (
                          <Link
                            to="/customers/$customerId"
                            params={{ customerId: b.customers.id }}
                            className="text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {b.customers.name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Walk-in Customer</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <WarehouseCell names={b.warehouseNames} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={b.is_taxed ? "accent" : "neutral"}>
                          {b.is_taxed ? "Taxed" : "No Tax"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={paymentTone(b.payment_status)}>
                          {b.payment_status}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        <MethodCell row={b} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <StatusBadge tone={billStatusTone(b.status)}>{b.status}</StatusBadge>
                          <ReturnBadge row={b} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="numeric text-sm font-bold">{formatMoney(b.total_amount)}</p>
                        <p className="numeric text-xs text-muted-foreground">
                          Paid {formatMoney(b.amount_paid)} · Due {formatMoney(b.balanceDue)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div
                          className="flex justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="View bill"
                            onClick={() => openBill(b.id)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Download PDF"
                            title="Open invoice to download PDF"
                            onClick={() => openBill(b.id)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          {b.balanceDue > 0 && b.status !== "Voided" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Record payment"
                              onClick={() => setPaymentFor(b)}
                            >
                              <Wallet className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expanded === b.id && (
                      <tr className="border-b border-border/60">
                        <td colSpan={11} className="p-0">
                          <RelatedDetail row={b} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            </div>


            {/* Mobile cards */}
            <div className="divide-y divide-border/60 lg:hidden">
              {pageRows.map((b) => (
                <div key={b.id}>
                  <div
                    className="space-y-2 p-4 active:bg-muted/60"
                    onClick={() => openBill(b.id)}
                    role="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          className={cn(
                            "truncate text-sm font-semibold",
                            b.status === "Voided" && "text-muted-foreground line-through",
                          )}
                        >
                          {b.bill_number}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {b.customers?.name ?? "Walk-in Customer"} · {formatDate(b.bill_date)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="numeric text-base font-bold">{formatMoney(b.total_amount)}</p>
                        <p className="numeric text-xs text-muted-foreground">
                          Due {formatMoney(b.balanceDue)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={paymentTone(b.payment_status)}>
                        {b.payment_status}
                      </StatusBadge>
                      <StatusBadge tone={billStatusTone(b.status)}>{b.status}</StatusBadge>
                      <ReturnBadge row={b} />
                      {b.hasPendingPickup && (
                        <StatusBadge tone="warning">Pending pickup</StatusBadge>
                      )}

                      <MethodCell row={b} />
                      <button
                        className="ml-auto text-xs font-medium text-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpanded(expanded === b.id ? null : b.id);
                        }}
                      >
                        {expanded === b.id ? "Hide details" : "More details"}
                      </button>
                    </div>
                  </div>
                  {expanded === b.id && (
                    <>
                      <RelatedDetail row={b} />
                      <div className="flex gap-2 p-4 pt-3">
                        <Button variant="outline" size="sm" onClick={() => openBill(b.id)}>
                          <Eye className="h-4 w-4" />
                          View
                        </Button>
                        {b.balanceDue > 0 && b.status !== "Voided" && (
                          <Button size="sm" onClick={() => setPaymentFor(b)}>
                            <Wallet className="h-4 w-4" />
                            Record payment
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-col items-center justify-between gap-3 border-t border-border p-4 sm:flex-row">
              <p className="text-xs text-muted-foreground">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, visible.length)} of {visible.length} bills
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <RecordPaymentDialog
        open={paymentFor !== null}
        onOpenChange={(open) => {
          if (!open) setPaymentFor(null);
        }}
        {...(paymentFor?.customer_id ? { defaultCustomerId: paymentFor.customer_id } : {})}
        {...(paymentFor ? { defaultBillId: paymentFor.id } : {})}
      />
    </div>
  );
}
