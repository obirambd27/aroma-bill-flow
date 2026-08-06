import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookOpen, Plus, Pencil, Trash2, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { AccountFormDialog } from "@/components/AccountFormDialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAccounts, useLedgerCounts, type Account } from "@/lib/accounting";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/accounts/")({
  head: () => ({
    meta: [
      { title: "Chart of Accounts — Fragrance Billing" },
      {
        name: "description",
        content: "Manage cash, bank, income and expense accounts that drive your ledger.",
      },
      { property: "og:title", content: "Chart of Accounts — Fragrance Billing" },
      {
        property: "og:description",
        content: "Manage cash, bank, income and expense accounts that drive your ledger.",
      },
    ],
  }),
  component: AccountsPage,
});

function AccountsPage() {
  const queryClient = useQueryClient();
  const { data: accounts = [], isLoading } = useAccounts();
  const { data: counts = {} } = useLedgerCounts();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);

  const toggleActive = async (account: Account, next: boolean) => {
    const { error } = await supabase
      .from("accounts")
      .update({ is_active: next })
      .eq("id", account.id);
    if (error) return toast.error(error.message);
    toast.success(next ? "Account activated" : "Account deactivated");
    await queryClient.invalidateQueries();
  };

  const remove = async (account: Account) => {
    if ((counts[account.id] ?? 0) > 0) {
      toast.error("This account has ledger history — deactivate it instead.");
      return;
    }
    if (account.is_system) {
      toast.error("Default accounts can't be deleted.");
      return;
    }
    const { error } = await supabase.from("accounts").delete().eq("id", account.id);
    if (error) return toast.error(error.message);
    toast.success("Account deleted");
    await queryClient.invalidateQueries();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chart of Accounts"
        description="The ledger foundation behind balances, statements and reports."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New Account
          </Button>
        }
      />

      <div className="surface-card overflow-hidden">
        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading accounts…</p>
        ) : accounts.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No accounts yet"
            description="Add your first account to start tracking money in and out."
          />
        ) : (
          <>
            <table className="hidden w-full md:table">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Current balance</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to="/accounts/$accountId"
                        params={{ accountId: a.id }}
                        className="text-sm font-medium hover:underline"
                      >
                        {a.name}
                      </Link>
                      {a.bank_name && (
                        <p className="text-xs text-muted-foreground">{a.bank_name}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{a.account_type}</td>
                    <td className="numeric px-4 py-3 text-right text-sm font-semibold">
                      {formatMoney(a.current_balance)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={a.is_active}
                          onCheckedChange={(v) => toggleActive(a, v)}
                          aria-label="Toggle account status"
                        />
                        <StatusBadge tone={a.is_active ? "success" : "neutral"}>
                          {a.is_active ? "Active" : "Inactive"}
                        </StatusBadge>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit account"
                          onClick={() => {
                            setEditing(a);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete account"
                          onClick={() => remove(a)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="divide-y divide-border md:hidden">
              {accounts.map((a) => (
                <li key={a.id} className="p-4">
                  <Link
                    to="/accounts/$accountId"
                    params={{ accountId: a.id }}
                    className="flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{a.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{a.account_type}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <p className="numeric text-sm font-bold">{formatMoney(a.current_balance)}</p>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={a.is_active}
                        onCheckedChange={(v) => toggleActive(a, v)}
                        aria-label="Toggle account status"
                      />
                      <span className="text-xs text-muted-foreground">
                        {a.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Edit account"
                        onClick={() => {
                          setEditing(a);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete account"
                        onClick={() => remove(a)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <AccountFormDialog open={dialogOpen} onOpenChange={setDialogOpen} account={editing} />
    </div>
  );
}
