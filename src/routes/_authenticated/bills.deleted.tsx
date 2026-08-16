import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/bills/deleted")({
  head: () => ({
    meta: [
      { title: "Deleted Bills Log — Fragrance Billing" },
      {
        name: "description",
        content: "Audit log of permanently deleted invoices with full snapshots.",
      },
      { property: "og:title", content: "Deleted Bills Log — Fragrance Billing" },
      {
        property: "og:description",
        content: "Audit log of permanently deleted invoices with full snapshots.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeletedBillsPage,
});

type DeleteLogRow = {
  id: string;
  bill_number: string | null;
  bill_date: string | null;
  customer_name: string | null;
  total_amount: number;
  reason: string | null;
  deleted_at: string;
};

function useDeletedBills() {
  return useQuery({
    queryKey: ["bill-delete-log"],
    queryFn: async (): Promise<DeleteLogRow[]> => {
      const { data, error } = await supabase
        .from("bill_delete_log")
        .select("id, bill_number, bill_date, customer_name, total_amount, reason, deleted_at")
        .order("deleted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DeleteLogRow[];
    },
  });
}

function DeletedBillsPage() {
  const { data: rows = [], isLoading } = useDeletedBills();

  return (
    <div className="space-y-5">
      <Link
        to="/bills"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Bill history
      </Link>

      <PageHeader
        title="Deleted Bills Log"
        description="Every permanently deleted invoice is recorded here with its full snapshot."
      />

      <div className="surface-card overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading log…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="No deleted bills" description="Deleted invoices will appear here." />
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Bill</th>
                  <th className="px-4 py-3 text-left font-medium">Customer</th>
                  <th className="px-4 py-3 text-left font-medium">Bill date</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-left font-medium">Deleted</th>
                  <th className="px-4 py-3 text-left font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 font-medium">{row.bill_number ?? "—"}</td>
                    <td className="px-4 py-3">{row.customer_name ?? "—"}</td>
                    <td className="px-4 py-3">{formatDate(row.bill_date)}</td>
                    <td className="numeric px-4 py-3 text-right">
                      {formatMoney(row.total_amount)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDateTime(row.deleted_at)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
