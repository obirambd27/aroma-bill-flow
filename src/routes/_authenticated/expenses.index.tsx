import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Receipt, RefreshCw, Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Pagination, usePaged } from "@/components/Pagination";
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
  runRecurringExpense,
  useExpenseCategories,
  useExpenses,
  type ExpenseRow,
} from "@/lib/expenses";
import { formatDate, formatMoney } from "@/lib/format";
import { todayISO } from "@/lib/reports";

export const Route = createFileRoute("/_authenticated/expenses/")({
  head: () => ({
    meta: [
      { title: "Expenses — Fragrance Billing" },
      { name: "description", content: "Track shop running costs by category, account and month." },
      { property: "og:title", content: "Expenses — Fragrance Billing" },
      {
        property: "og:description",
        content: "Track shop running costs by category, account and month.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: expenses = [], isLoading } = useExpenses();
  const { data: categories = [] } = useExpenseCategories();
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const ranRecurring = useRef(false);

  // Any recurring expense that has come due is generated once per page load.
  useEffect(() => {
    if (ranRecurring.current || expenses.length === 0) return;
    const today = todayISO();
    const due = expenses.filter(
      (e) => e.is_recurring && e.next_recurrence_date && e.next_recurrence_date <= today,
    );
    if (due.length === 0) return;
    ranRecurring.current = true;
    void (async () => {
      try {
        for (const e of due) await runRecurringExpense(e);
        queryClient.invalidateQueries();
        toast.success(`${due.length} recurring expense${due.length > 1 ? "s" : ""} generated`);
      } catch {
        toast.error("Could not generate recurring expenses");
      }
    })();
  }, [expenses, queryClient]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return expenses.filter((e) => {
      const matchesQuery =
        !q ||
        (e.expense_number ?? "").toLowerCase().includes(q) ||
        (e.vendor_name ?? "").toLowerCase().includes(q) ||
        (e.description ?? "").toLowerCase().includes(q) ||
        (e.expense_categories?.name ?? "").toLowerCase().includes(q);
      const matchesCategory = categoryId === "all" || e.category_id === categoryId;
      const matchesFrom = !from || e.expense_date >= from;
      const matchesTo = !to || e.expense_date <= to;
      return matchesQuery && matchesCategory && matchesFrom && matchesTo;
    });
  }, [expenses, query, categoryId, from, to]);

  const { pageItems: paged, props: pageProps } = usePaged(visible, 50);

  const total = visible.reduce((s, e) => s + Number(e.amount), 0);
  const thisMonth = visible
    .filter((e) => e.expense_date.slice(0, 7) === todayISO().slice(0, 7))
    .reduce((s, e) => s + Number(e.amount), 0);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of visible) {
      const name = e.expense_categories?.name ?? "Uncategorised";
      map.set(name, (map.get(name) ?? 0) + Number(e.amount));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [visible]);

  const openExpense = (e: ExpenseRow) =>
    navigate({ to: "/expenses/$expenseId", params: { expenseId: e.id } });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Rent, salaries, utilities and everything else the shop spends on."
        actions={
          <Button asChild>
            <Link to="/expenses/new">
              <Plus />
              New Expense
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total (filtered)</p>
          <p className="numeric text-2xl font-bold">{formatMoney(total)}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">This month</p>
          <p className="numeric text-2xl font-bold">{formatMoney(thisMonth)}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Top categories</p>
          <ul className="mt-2 space-y-1">
            {byCategory.length === 0 ? (
              <li className="text-sm text-muted-foreground">—</li>
            ) : (
              byCategory.map(([name, value]) => (
                <li key={name} className="flex items-center justify-between text-sm">
                  <span className="truncate text-muted-foreground">{name}</span>
                  <span className="numeric font-medium">{formatMoney(value)}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative min-w-0 lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 pl-9"
              placeholder="Search expense, payee or note"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
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
          <p className="p-8 text-center text-sm text-muted-foreground">Loading expenses…</p>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={expenses.length === 0 ? "No expenses yet" : "No matches"}
            description={
              expenses.length === 0
                ? "Record rent, salaries or utilities to see where the money goes."
                : "Try a different search, category or date range."
            }
            {...(expenses.length === 0
              ? {
                  actionLabel: "New Expense",
                  onAction: () => {
                    void navigate({ to: "/expenses/new" });
                  },
                }
              : {})}
          />
        ) : (
          <>
            <table className="hidden w-full md:table">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Expense</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Paid To</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((e) => (
                  <tr
                    key={e.id}
                    className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                    onClick={() => openExpense(e)}
                  >
                    <td className="px-4 py-3 text-sm font-medium">
                      <span className="flex items-center gap-2">
                        {e.expense_number}
                        {e.is_recurring && (
                          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatDate(e.expense_date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {e.expense_categories?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {e.vendor_name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone="accent">{e.payment_method}</StatusBadge>
                    </td>
                    <td className="numeric px-4 py-3 text-right text-sm font-bold">
                      {formatMoney(e.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="divide-y divide-border/60 md:hidden">
              {paged.map((e) => (
                <Link
                  key={e.id}
                  to="/expenses/$expenseId"
                  params={{ expenseId: e.id }}
                  className="block space-y-2 p-4 active:bg-muted/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {e.expense_categories?.name ?? "Expense"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {e.expense_number} · {formatDate(e.expense_date)}
                      </p>
                    </div>
                    <p className="numeric shrink-0 text-base font-bold">{formatMoney(e.amount)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone="accent">{e.payment_method}</StatusBadge>
                    {e.vendor_name && (
                      <span className="text-xs text-muted-foreground">{e.vendor_name}</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
            <Pagination {...pageProps} label="expenses" />
          </>
        )}
      </div>
    </div>
  );
}
