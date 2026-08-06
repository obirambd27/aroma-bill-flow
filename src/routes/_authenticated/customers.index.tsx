import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Users, Search, Plus, Bell, Tag, Check } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
import { CustomerTagChips } from "@/components/CustomerTags";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCustomers } from "@/lib/data";
import { useCustomerTags, useDueReminders, useTagAssignments, tagClass } from "@/lib/crm";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/customers/")({
  head: () => ({
    meta: [
      { title: "Customers — Fragrance Billing" },
      { name: "description", content: "Customer directory with tags, reminders and spend history." },
      { property: "og:title", content: "Customers — Fragrance Billing" },
      {
        property: "og:description",
        content: "Customer directory with tags, reminders and spend history.",
      },
    ],
  }),
  component: CustomersPage,
});

function CustomersPage() {
  const { data: customers = [], isLoading } = useCustomers();
  const { data: tags = [] } = useCustomerTags();
  const { data: assignments = {} } = useTagAssignments();
  const { data: dueReminders = [] } = useDueReminders();
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [remindersOnly, setRemindersOnly] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const dueByCustomer = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of dueReminders) map[r.customer_id] = (map[r.customer_id] ?? 0) + 1;
    return map;
  }, [dueReminders]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !(c.phone ?? "").toLowerCase().includes(q)) {
        return false;
      }
      if (remindersOnly && !dueByCustomer[c.id]) return false;
      if (selectedTags.length > 0) {
        const ids = new Set((assignments[c.id] ?? []).map((a) => a.tag_id));
        if (!selectedTags.some((t) => ids.has(t))) return false;
      }
      return true;
    });
  }, [customers, query, remindersOnly, dueByCustomer, selectedTags, assignments]);

  const toggleTag = (id: string) =>
    setSelectedTags((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Everyone who has shopped with you."
        actions={
          <Button className="h-11" onClick={() => setDialogOpen(true)}>
            <Plus />
            New Customer
          </Button>
        }
      />

      <div className="surface-card overflow-hidden">
        <div className="space-y-3 border-b border-border p-4">
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

            {(selectedTags.length > 0 || remindersOnly) && (
              <Button
                variant="ghost"
                className="h-10"
                onClick={() => {
                  setSelectedTags([]);
                  setRemindersOnly(false);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading customers…</p>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Users}
            title={customers.length === 0 ? "No customers yet" : "No matches"}
            description={
              customers.length === 0
                ? "Add your first customer to start tracking purchases."
                : "Try a different name, tag or filter."
            }
            {...(customers.length === 0
              ? { actionLabel: "New Customer", onAction: () => setDialogOpen(true) }
              : {})}
          />
        ) : (
          <>
            <table className="hidden w-full md:table">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3 text-right">Total spend</th>
                  <th className="px-4 py-3 text-right">Last purchase</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-0 text-sm font-medium">
                      <Link
                        to="/customers/$customerId"
                        params={{ customerId: c.id }}
                        className="block py-3 hover:text-primary"
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          {dueByCustomer[c.id] && (
                            <Bell className="h-3.5 w-3.5 shrink-0 text-destructive" />
                          )}
                          {c.name}
                          <CustomerTagChips assignments={assignments[c.id] ?? []} />
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{c.phone ?? "—"}</td>
                    <td className="numeric px-4 py-3 text-right text-sm font-semibold">
                      {formatMoney(c.total_spend)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                      {formatDate(c.last_purchase_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="divide-y divide-border/60 md:hidden">
              {visible.map((c) => (
                <Link
                  key={c.id}
                  to="/customers/$customerId"
                  params={{ customerId: c.id }}
                  className="block p-4 active:bg-muted/60"
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
                    <p className="numeric shrink-0 text-base font-bold">
                      {formatMoney(c.total_spend)}
                    </p>
                  </div>
                  <CustomerTagChips assignments={assignments[c.id] ?? []} className="mt-2" />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Last purchase: {formatDate(c.last_purchase_at)}
                  </p>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      <CustomerFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
