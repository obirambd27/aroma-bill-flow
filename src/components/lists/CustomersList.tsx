import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Users,
  Search,
  Plus,
  Bell,
  Tag,
  Check,
  FileSpreadsheet,
  Wallet,
  ArrowUp,
  ArrowDown,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
import { CustomerTagChips } from "@/components/CustomerTags";
import { Pagination, usePaged } from "@/components/Pagination";
import { ExportMenu, SummaryCards, type ExportFormat } from "@/components/ReportChrome";
import { StatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCustomers, useCustomerTotals, useSettings } from "@/lib/data";
import { useCustomerTags, useDueReminders, useTagAssignments, tagClass } from "@/lib/crm";
import { formatDate, formatMoney } from "@/lib/format";
import { downloadCSV, downloadXLSX, printReport } from "@/lib/export";
import {
  agingBucket,
  agingLabel,
  agingTone,
  reminderMessage,
  validWhatsAppNumber,
  type AgingBucket,
} from "@/lib/collections";
import { cn } from "@/lib/utils";

type SortKey = "name" | "spend" | "outstanding" | "last" | "aging";
type OutstandingFilter = "all" | "has" | "none";

function SortHeader({
  label,
  column,
  sort,
  dir,
  onSort,
  className,
}: {
  label: string;
  column: SortKey;
  sort: SortKey;
  dir: "asc" | "desc";
  onSort: (c: SortKey) => void;
  className?: string;
}) {
  const active = sort === column;
  return (
    <th className={cn("px-4 py-3", className)}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {label}
        {active &&
          (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );
}

export function CustomersList({ selectedId }: { selectedId?: string }) {
  const { data: customers = [], isLoading } = useCustomers();
  const { data: totals = {} } = useCustomerTotals();
  const { data: tags = [] } = useCustomerTags();
  const { data: assignments = {} } = useTagAssignments();
  const { data: dueReminders = [] } = useDueReminders();
  const { data: settings } = useSettings();
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [remindersOnly, setRemindersOnly] = useState(false);
  const [outstandingFilter, setOutstandingFilter] = useState<OutstandingFilter>("all");
  const [agingFilter, setAgingFilter] = useState<AgingBucket | "all">("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reminderIndex, setReminderIndex] = useState<number | null>(null);

  const businessName = settings?.business_name ?? "our store";

  const dueByCustomer = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of dueReminders) map[r.customer_id] = (map[r.customer_id] ?? 0) + 1;
    return map;
  }, [dueReminders]);

  const rows = useMemo(
    () =>
      customers.map((c) => {
        const t = totals[c.id];
        const outstanding = t?.outstanding ?? 0;
        const oldest = t?.oldestDueDate ?? null;
        return {
          customer: c,
          paid: t?.paid ?? 0,
          outstanding,
          oldestDueDate: oldest,
          aging: outstanding > 0 ? agingBucket(oldest) : null,
        };
      }),
    [customers, totals],
  );

  const stats = useMemo(() => {
    let totalOutstanding = 0;
    let overdue60 = 0;
    for (const r of rows) {
      totalOutstanding += r.outstanding;
      if (r.outstanding > 0 && r.aging === "60+") overdue60 += 1;
    }
    return { totalOutstanding, overdue60 };
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      const c = r.customer;
      if (q && !c.name.toLowerCase().includes(q) && !(c.phone ?? "").toLowerCase().includes(q)) {
        return false;
      }
      if (remindersOnly && !dueByCustomer[c.id]) return false;
      if (outstandingFilter === "has" && r.outstanding <= 0) return false;
      if (outstandingFilter === "none" && r.outstanding > 0) return false;
      if (agingFilter !== "all" && r.aging !== agingFilter) return false;
      if (selectedTags.length > 0) {
        const ids = new Set((assignments[c.id] ?? []).map((a) => a.tag_id));
        if (!selectedTags.some((t) => ids.has(t))) return false;
      }
      return true;
    });

    const order = { current: 0, "30-60": 1, "60+": 2, unknown: 3 } as const;
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sort === "name") cmp = a.customer.name.localeCompare(b.customer.name);
      else if (sort === "spend") cmp = a.paid - b.paid;
      else if (sort === "outstanding") cmp = a.outstanding - b.outstanding;
      else if (sort === "aging")
        cmp = (a.aging ? order[a.aging] : -1) - (b.aging ? order[b.aging] : -1);
      else
        cmp =
          new Date(a.customer.last_purchase_at ?? 0).getTime() -
          new Date(b.customer.last_purchase_at ?? 0).getTime();
      if (cmp === 0) cmp = a.customer.name.localeCompare(b.customer.name);
      return dir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [
    rows,
    query,
    remindersOnly,
    dueByCustomer,
    outstandingFilter,
    agingFilter,
    selectedTags,
    assignments,
    sort,
    dir,
  ]);

  const { pageItems: paged, props: pageProps } = usePaged(visible, 50);

  const toggleTag = (id: string) =>
    setSelectedTags((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));

  const onSort = (c: SortKey) => {
    if (sort === c) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(c);
      setDir(c === "name" ? "asc" : "desc");
    }
  };

  const hasFilters =
    selectedTags.length > 0 || remindersOnly || outstandingFilter !== "all" || agingFilter !== "all";

  // ---- Export ------------------------------------------------------------
  const exportHeaders = [
    "Customer Name",
    "Phone",
    "Outstanding Amount",
    "Aging Bucket",
    "Last Purchase Date",
    "Oldest Unpaid Bill Date",
  ];
  const buildRows = () =>
    visible.map((r) => [
      r.customer.name,
      r.customer.phone ?? "",
      r.outstanding.toFixed(2),
      r.aging ? agingLabel[r.aging] : "—",
      r.customer.last_purchase_at ? formatDate(r.customer.last_purchase_at) : "—",
      r.oldestDueDate ? formatDate(r.oldestDueDate) : r.outstanding > 0 ? "Unknown" : "—",
    ]);

  const handleExport = (f: ExportFormat) => {
    if (visible.length === 0) {
      toast.error("No customers match the current filter — adjust filters to export");
      return;
    }
    try {
      const data = buildRows();
      const totalOut = visible.reduce((s, r) => s + r.outstanding, 0);
      const summaryLine = `Total Outstanding: ${formatMoney(totalOut)} across ${visible.length} customers`;
      const name = `collections-report-${new Date().toISOString().slice(0, 10)}`;
      if (f === "csv") {
        downloadCSV(name, exportHeaders, [...data, [summaryLine, "", "", "", "", ""]]);
      } else if (f === "xlsx") {
        downloadXLSX(name, "Collections", exportHeaders, [
          ...data,
          [summaryLine, "", "", "", "", ""],
        ]);
      } else {
        const ok = printReport({
          title: `${businessName} — Collections Report`,
          subtitle: `Generated ${formatDate(new Date().toISOString())}`,
          summary: [
            { label: "Total Outstanding", value: formatMoney(totalOut) },
            { label: "Customers", value: String(visible.length) },
          ],
          headers: exportHeaders,
          rows: data,
          numericFrom: 2,
        });
        if (!ok) throw new Error("popup blocked");
      }
    } catch {
      toast.error("Export failed — please try again", {
        action: { label: "Retry", onClick: () => handleExport(f) },
      });
    }
  };

  // ---- Bulk WhatsApp reminders -------------------------------------------
  const selectedRows = visible.filter((r) => selected.includes(r.customer.id));
  const sendable = selectedRows.filter((r) => validWhatsAppNumber(r.customer.phone));
  const skipped = selectedRows.filter((r) => !validWhatsAppNumber(r.customer.phone));

  const startReminders = () => {
    if (sendable.length === 0) {
      toast.error(
        `No valid phone numbers among the ${selectedRows.length} selected customer(s).`,
      );
      return;
    }
    setReminderIndex(0);
  };

  const openReminder = (i: number) => {
    const r = sendable[i];
    if (!r) return;
    const digits = validWhatsAppNumber(r.customer.phone);
    const text = reminderMessage(r.customer.name, formatMoney(r.outstanding), businessName);
    window.open(
      `https://wa.me/${digits}?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener",
    );
  };

  const toggleRow = (id: string) =>
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const allPagedSelected = paged.length > 0 && paged.every((r) => selected.includes(r.customer.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Everyone who has shopped with you."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="h-11">
              <Link to="/import-export">
                <FileSpreadsheet /> Import / Export
              </Link>
            </Button>
            <Button className="h-11" onClick={() => setDialogOpen(true)}>
              <Plus />
              New Customer
            </Button>
          </div>
        }
      />

      <SummaryCards
        items={[
          { label: "Total Customers", value: String(customers.length) },
          { label: "Total Outstanding", value: formatMoney(stats.totalOutstanding) },
          { label: "Overdue 60+ Days", value: String(stats.overdue60), hint: "customers" },
        ]}
      />

      <div className="surface-card overflow-hidden">
        <div className="sticky top-0 z-10 space-y-3 border-b border-border bg-card p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 pl-9"
              placeholder="Search by name or phone"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-10">
                  <Tag className="h-4 w-4" />
                  {selectedTags.length > 0 ? `${selectedTags.length} tag filter` : "Filter by tag"}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-1.5">
                {tags.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-muted-foreground">
                    No tags created yet. Add tags from a customer profile.
                  </p>
                ) : (
                  tags.map((t) => {
                    const active = selectedTags.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                        onClick={() => toggleTag(t.id)}
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 items-center justify-center rounded border",
                            active ? "border-primary bg-primary text-primary-foreground" : "border-border",
                          )}
                        >
                          {active && <Check className="h-3 w-3" />}
                        </span>
                        <span
                          className={cn("h-2.5 w-2.5 rounded-full border", tagClass(t.color))}
                          aria-hidden
                        />
                        {t.name}
                      </button>
                    );
                  })
                )}
              </PopoverContent>
            </Popover>

            <Select
              value={outstandingFilter}
              onValueChange={(v) => setOutstandingFilter(v as OutstandingFilter)}
            >
              <SelectTrigger className="h-10 w-[190px]">
                <Wallet className="h-4 w-4" />
                <SelectValue placeholder="Outstanding" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All balances</SelectItem>
                <SelectItem value="has">Has outstanding balance</SelectItem>
                <SelectItem value="none">No outstanding</SelectItem>
              </SelectContent>
            </Select>

            <Select value={agingFilter} onValueChange={(v) => setAgingFilter(v as AgingBucket | "all")}>
              <SelectTrigger className="h-10 w-[160px]">
                <SelectValue placeholder="Aging" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any aging</SelectItem>
                <SelectItem value="current">Current (0-30)</SelectItem>
                <SelectItem value="30-60">31-60 days</SelectItem>
                <SelectItem value="60+">60+ days</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant={remindersOnly ? "default" : "outline"}
              className="h-10"
              onClick={() => setRemindersOnly((v) => !v)}
            >
              <Bell className="h-4 w-4" />
              Reminders due
              {dueReminders.length > 0 && (
                <span className="numeric ml-1 text-xs">({dueReminders.length})</span>
              )}
            </Button>

            <ExportMenu onExport={handleExport} disabled={visible.length === 0} />

            {selected.length > 0 && (
              <Button className="h-10" onClick={startReminders}>
                <MessageCircle className="h-4 w-4" />
                Send Reminder ({selected.length})
              </Button>
            )}

            {hasFilters && (
              <Button
                variant="ghost"
                className="h-10"
                onClick={() => {
                  setSelectedTags([]);
                  setRemindersOnly(false);
                  setOutstandingFilter("all");
                  setAgingFilter("all");
                }}
              >
                Clear
              </Button>
            )}
          </div>

          {visible.length === 0 && !isLoading && customers.length > 0 && (
            <p className="text-xs text-muted-foreground">
              No customers match the current filter — adjust filters to export.
            </p>
          )}
        </div>

        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading customers…</p>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Users}
            title={customers.length === 0 ? "No customers yet" : "No customers match these filters"}
            description={
              customers.length === 0
                ? "Add your first customer to start tracking purchases."
                : "Try a different name, tag, balance or aging filter."
            }
            {...(customers.length === 0
              ? { actionLabel: "New Customer", onAction: () => setDialogOpen(true) }
              : {})}
          />
        ) : (
          <>
            <div className="divide-y divide-border/60">
              {paged.map(({ customer: c, paid, outstanding, aging }) => (
                <div
                  key={c.id}
                  className={cn(
                    "flex items-start gap-3 p-4",
                    selectedId === c.id && "bg-muted/60",
                  )}
                >
                  <Checkbox
                    className="mt-1"
                    checked={selected.includes(c.id)}
                    aria-label={`Select ${c.name}`}
                    onCheckedChange={() => toggleRow(c.id)}
                  />
                  <Link
                    to="/customers/$customerId"
                    params={{ customerId: c.id }}
                    className="min-w-0 flex-1 active:opacity-70"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                          {dueByCustomer[c.id] && (
                            <Bell className="h-3.5 w-3.5 shrink-0 text-destructive" />
                          )}
                          {c.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{c.phone ?? "—"}</p>
                      </div>
                      <p className="numeric shrink-0 text-base font-bold">{formatMoney(paid)}</p>
                    </div>
                    <CustomerTagChips assignments={assignments[c.id] ?? []} className="mt-2" />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Last purchase: {formatDate(c.last_purchase_at)}
                    </p>
                    {outstanding > 0 && (
                      <p className="mt-1 flex items-center gap-2 text-xs font-medium text-warning-foreground">
                        Outstanding: {formatMoney(outstanding)}
                        {aging && <StatusBadge tone={agingTone(aging)}>{agingLabel[aging]}</StatusBadge>}
                      </p>
                    )}
                  </Link>
                </div>
              ))}
            </div>
            <Pagination {...pageProps} label="customers" />
          </>
        )}
      </div>

      <CustomerFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      <Dialog
        open={reminderIndex !== null}
        onOpenChange={(o) => {
          if (!o) setReminderIndex(null);
        }}
      >
        <DialogContent>
          {reminderIndex !== null && reminderIndex < sendable.length ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  Reminder {reminderIndex + 1} of {sendable.length}
                </DialogTitle>
                <DialogDescription>
                  {sendable[reminderIndex]?.customer.name} —{" "}
                  {formatMoney(sendable[reminderIndex]?.outstanding ?? 0)} outstanding. WhatsApp
                  opens in a new tab; come back here and continue to the next customer.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:justify-between">
                <Button variant="outline" onClick={() => setReminderIndex(null)}>
                  Stop
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => openReminder(reminderIndex)}>
                    <MessageCircle className="h-4 w-4" /> Open WhatsApp
                  </Button>
                  <Button onClick={() => setReminderIndex(reminderIndex + 1)}>
                    {reminderIndex + 1 < sendable.length ? "Next customer" : "Finish"}
                  </Button>
                </div>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Reminders complete</DialogTitle>
                <DialogDescription>
                  {sendable.length} reminder{sendable.length === 1 ? "" : "s"} prepared.
                  {skipped.length > 0 &&
                    ` ${skipped.length} customer${skipped.length === 1 ? "" : "s"} skipped — no phone number: ${skipped
                      .map((s) => s.customer.name)
                      .join(", ")}`}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  onClick={() => {
                    setReminderIndex(null);
                    setSelected([]);
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
