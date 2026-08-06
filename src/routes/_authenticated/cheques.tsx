import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ReceiptText, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { ChequeFormDialog } from "@/components/ChequeFormDialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { postLedgerEntry, useCheques, type Cheque } from "@/lib/accounting";
import { formatDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/cheques")({
  head: () => ({
    meta: [
      { title: "Cheques — Fragrance Billing" },
      {
        name: "description",
        content: "Track received and issued cheques and clear them into your accounts.",
      },
      { property: "og:title", content: "Cheques — Fragrance Billing" },
      {
        property: "og:description",
        content: "Track received and issued cheques and clear them into your accounts.",
      },
    ],
  }),
  component: ChequesPage,
});

const statusTone = (status: string) =>
  status === "Cleared" ? "success" : status === "Bounced" ? "error" : "warning";

function ChequesPage() {
  const queryClient = useQueryClient();
  const { data: cheques = [], isLoading } = useCheques();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");

  const visible = useMemo(
    () =>
      cheques.filter(
        (c) => (status === "all" || c.status === status) && (type === "all" || c.type === type),
      ),
    [cheques, status, type],
  );

  const markCleared = async (cheque: Cheque) => {
    try {
      const amount = cheque.type === "Received" ? Number(cheque.amount) : -Number(cheque.amount);
      const { error } = await supabase
        .from("cheques")
        .update({ status: "Cleared" })
        .eq("id", cheque.id);
      if (error) throw error;
      await postLedgerEntry({
        account_id: cheque.account_id,
        entry_date: cheque.cheque_date,
        entry_type: cheque.type === "Received" ? "Sale Payment" : "Purchase Payment",
        amount,
        description: `Cheque ${cheque.cheque_number} cleared — ${cheque.party_name}`,
        related_bill_id: cheque.related_bill_id,
      });
      toast.success("Cheque cleared");
      await queryClient.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not clear cheque");
    }
  };

  const markBounced = async (cheque: Cheque) => {
    const reason = window.prompt("Reason for bounce (optional)") ?? "";
    const { error } = await supabase
      .from("cheques")
      .update({
        status: "Bounced",
        notes: reason.trim() ? `${cheque.notes ? `${cheque.notes}\n` : ""}Bounced: ${reason.trim()}` : cheque.notes,
      })
      .eq("id", cheque.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Cheque marked bounced");
    await queryClient.invalidateQueries();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cheques"
        description="Pending cheques are tracked only — money moves when they clear."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" /> New Cheque
          </Button>
        }
      />

      <div className="surface-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-11 sm:w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Cleared">Cleared</SelectItem>
              <SelectItem value="Bounced">Bounced</SelectItem>
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-11 sm:w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="Received">Received</SelectItem>
              <SelectItem value="Issued">Issued</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading cheques…</p>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title={cheques.length === 0 ? "No cheques yet" : "No matches"}
            description={
              cheques.length === 0
                ? "Record a cheque to keep track of money waiting to clear."
                : "No cheques match the selected filters."
            }
          />
        ) : (
          <>
            <table className="hidden w-full md:table">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Cheque #</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Party</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.id} className="border-b border-border/60 last:border-0">
                    <td className="numeric px-4 py-3 text-sm font-medium">{c.cheque_number}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={c.type === "Received" ? "success" : "accent"}>
                        {c.type}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-sm">{c.party_name}</td>
                    <td className="numeric px-4 py-3 text-right text-sm font-semibold">
                      {formatMoney(c.amount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatDate(c.cheque_date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {c.accounts?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={statusTone(c.status)}>{c.status}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.status === "Pending" ? (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => markCleared(c)}>
                            <Check className="h-4 w-4" /> Clear
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => markBounced(c)}>
                            <X className="h-4 w-4" /> Bounce
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="divide-y divide-border md:hidden">
              {visible.map((c) => (
                <li key={c.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{c.party_name}</p>
                      <p className="numeric mt-0.5 text-xs text-muted-foreground">
                        #{c.cheque_number} · {formatDate(c.cheque_date)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {c.accounts?.name ?? "—"}
                      </p>
                    </div>
                    <div className="shrink-0 space-y-1 text-right">
                      <p className="numeric text-sm font-bold">{formatMoney(c.amount)}</p>
                      <StatusBadge tone={c.type === "Received" ? "success" : "accent"}>
                        {c.type}
                      </StatusBadge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <StatusBadge tone={statusTone(c.status)}>{c.status}</StatusBadge>
                    {c.status === "Pending" && (
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => markCleared(c)}>
                          Clear
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => markBounced(c)}>
                          Bounce
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <ChequeFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
