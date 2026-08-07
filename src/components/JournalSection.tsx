import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type LinkColumn =
  | "related_bill_id"
  | "related_purchase_id"
  | "related_expense_id"
  | "related_return_id"
  | "related_payment_id";


type JournalRow = {
  id: string;
  amount: number;
  description: string | null;
  entry_date: string;
  accounts: { name: string } | null;
};

export function JournalSection({
  linkColumn,
  linkId,
  locationName,
}: {
  linkColumn: LinkColumn;
  linkId: string;
  locationName?: string | null;
}) {
  const [open, setOpen] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["journal", linkColumn, linkId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ledger_entries")
        .select("id, amount, description, entry_date, accounts(name)")
        .eq(linkColumn, linkId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as JournalRow[];
    },
  });

  const totals = rows.reduce(
    (acc, r) => {
      const amount = Number(r.amount);
      if (amount < 0) acc.debit += Math.abs(amount);
      else acc.credit += amount;
      return acc;
    },
    { debit: 0, credit: 0 },
  );

  return (
    <section className="no-print surface-card mx-auto w-full max-w-3xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium hover:bg-muted/50"
      >
        <span>{open ? "Hide Journal Entries" : "View Journal Entries"}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-border">
          {isLoading ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Loading journal…</p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No accounting entries recorded for this document.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2">Account</th>
                    {locationName && <th className="px-4 py-2">Location</th>}
                    <th className="px-4 py-2">Description</th>
                    <th className="px-4 py-2 text-right">Debit</th>
                    <th className="px-4 py-2 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const amount = Number(row.amount);
                    return (
                      <tr key={row.id} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-2.5 font-medium">{row.accounts?.name ?? "—"}</td>
                        {locationName && (
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            {locationName}
                          </td>
                        )}
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {row.description ?? "—"}
                        </td>
                        <td className="numeric px-4 py-2.5 text-right">
                          {amount < 0 ? formatMoney(Math.abs(amount)) : ""}
                        </td>
                        <td className="numeric px-4 py-2.5 text-right">
                          {amount > 0 ? formatMoney(amount) : ""}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-border font-semibold">
                    <td className="px-4 py-2.5" colSpan={locationName ? 3 : 2}>
                      Total
                    </td>
                    <td className="numeric px-4 py-2.5 text-right">{formatMoney(totals.debit)}</td>
                    <td className="numeric px-4 py-2.5 text-right">{formatMoney(totals.credit)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
