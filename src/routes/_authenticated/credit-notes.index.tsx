import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, Search, Ticket } from "lucide-react";
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
import { CREDIT_NOTE_STATUSES, creditTone, useCreditNotes } from "@/lib/returns";
import { formatDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/credit-notes/")({
  head: () => ({
    meta: [
      { title: "Credit Notes — Fragrance Billing" },
      { name: "description", content: "Customer credits issued, applied and still available." },
      { property: "og:title", content: "Credit Notes — Fragrance Billing" },
      {
        property: "og:description",
        content: "Customer credits issued, applied and still available.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CreditNotesPage,
});

function CreditNotesPage() {
  const navigate = useNavigate();
  const { data: notes = [], isLoading } = useCreditNotes();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes.filter((n) => {
      const matchesQuery =
        !q ||
        (n.credit_note_number ?? "").toLowerCase().includes(q) ||
        (n.customers?.name ?? "").toLowerCase().includes(q) ||
        (n.sales_returns?.return_number ?? "").toLowerCase().includes(q);
      const matchesStatus = status === "all" || n.status === status;
      const matchesFrom = !from || n.credit_note_date >= from;
      const matchesTo = !to || n.credit_note_date <= to;
      return matchesQuery && matchesStatus && matchesFrom && matchesTo;
    });
  }, [notes, query, status, from, to]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Credit Notes"
        description="Formal credits that reduce what a customer owes."
        actions={
          <Button asChild>
            <Link to="/credit-notes/new">
              <Plus />
              New Credit Note
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
              placeholder="Search credit note, customer or return"
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
              {CREDIT_NOTE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
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
          <p className="p-8 text-center text-sm text-muted-foreground">Loading credit notes…</p>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Ticket}
            title={notes.length === 0 ? "No credit notes yet" : "No matches"}
            description={
              notes.length === 0
                ? "Issue a credit note from a return, or standalone for a goodwill adjustment."
                : "Try a different number, customer, status or date range."
            }
            {...(notes.length === 0
              ? {
                  actionLabel: "New Credit Note",
                  onAction: () => {
                    void navigate({ to: "/credit-notes/new" });
                  },
                }
              : {})}
          />
        ) : (
          <>
            <table className="hidden w-full md:table">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Credit Note</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Return</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Applied</th>
                  <th className="px-4 py-3 text-right">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((n) => {
                  const remaining = Number(n.total_amount) - Number(n.amount_applied);
                  return (
                    <tr
                      key={n.id}
                      className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                      onClick={() =>
                        navigate({
                          to: "/credit-notes/$creditNoteId",
                          params: { creditNoteId: n.id },
                        })
                      }
                    >
                      <td className="px-4 py-3 text-sm font-medium">{n.credit_note_number}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatDate(n.credit_note_date)}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {n.customers?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {n.sales_returns?.return_number ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={creditTone(n.status)}>{n.status}</StatusBadge>
                      </td>
                      <td className="numeric px-4 py-3 text-right text-sm">
                        {formatMoney(n.total_amount)}
                      </td>
                      <td className="numeric px-4 py-3 text-right text-sm text-muted-foreground">
                        {formatMoney(n.amount_applied)}
                      </td>
                      <td className="numeric px-4 py-3 text-right text-sm font-bold">
                        {formatMoney(remaining)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="divide-y divide-border/60 md:hidden">
              {visible.map((n) => {
                const remaining = Number(n.total_amount) - Number(n.amount_applied);
                return (
                  <Link
                    key={n.id}
                    to="/credit-notes/$creditNoteId"
                    params={{ creditNoteId: n.id }}
                    className="block space-y-2 p-4 active:bg-muted/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{n.credit_note_number}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {n.customers?.name ?? "—"} · {formatDate(n.credit_note_date)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="numeric text-base font-bold">{formatMoney(remaining)}</p>
                        <p className="text-[11px] text-muted-foreground">remaining</p>
                      </div>
                    </div>
                    <StatusBadge tone={creditTone(n.status)}>{n.status}</StatusBadge>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
