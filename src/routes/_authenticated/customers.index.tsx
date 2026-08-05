import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Users, Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { useCustomers } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({
    meta: [
      { title: "Customers — Fragrance Billing" },
      { name: "description", content: "Customer directory with spend and purchase history." },
      { property: "og:title", content: "Customers — Fragrance Billing" },
      {
        property: "og:description",
        content: "Customer directory with spend and purchase history.",
      },
    ],
  }),
  component: CustomersPage,
});

function CustomersPage() {
  const { data: customers = [], isLoading } = useCustomers();
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q),
    );
  }, [customers, query]);

  return (
    <div className="space-y-6">
      <PageHeader title="Customers" description="Everyone who has shopped with you." />

      <div className="surface-card overflow-hidden">
        <div className="border-b border-border p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 pl-9"
              placeholder="Search by name, phone or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
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
                ? "Customers are created as you issue bills, or synced from Zoho Books."
                : "Try a different name, phone number or email."
            }
          />
        ) : (
          <>
            <table className="hidden w-full md:table">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Email</th>
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
                    <td className="px-4 py-3 text-sm font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{c.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{c.email ?? "—"}</td>
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
                <div key={c.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{c.phone ?? "—"}</p>
                    </div>
                    <p className="numeric shrink-0 text-base font-bold">
                      {formatMoney(c.total_spend)}
                    </p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Last purchase: {formatDate(c.last_purchase_at)}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
