import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Banknote, Landmark, Plus, ArrowLeftRight, ChevronRight, Wallet } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { AccountFormDialog } from "@/components/AccountFormDialog";
import { FundTransferDialog } from "@/components/FundTransferDialog";
import { Button } from "@/components/ui/button";
import { useAccounts, maskAccountNumber } from "@/lib/accounting";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/cash-bank/")({
  head: () => ({
    meta: [
      { title: "Cash & Bank — Fragrance Billing" },
      {
        name: "description",
        content: "Track cash in hand, bank balances, fund transfers and account statements.",
      },
      { property: "og:title", content: "Cash & Bank — Fragrance Billing" },
      {
        property: "og:description",
        content: "Track cash in hand, bank balances, fund transfers and account statements.",
      },
    ],
  }),
  component: CashBankPage,
});

function CashBankPage() {
  const { data: accounts = [], isLoading } = useAccounts();
  const [accountOpen, setAccountOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const cash = accounts.filter((a) => a.account_type === "Cash");
  const bank = accounts.filter((a) => a.account_type === "Bank");
  const cashTotal = cash.reduce((s, a) => s + Number(a.current_balance), 0);
  const bankTotal = bank.reduce((s, a) => s + Number(a.current_balance), 0);

  const ordered = [...cash, ...bank];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash & Bank"
        description="Balances across every cash and bank account."
        actions={
          <>
            <Button variant="outline" onClick={() => setTransferOpen(true)}>
              <ArrowLeftRight className="h-4 w-4" /> Transfer Funds
            </Button>
            <Button onClick={() => setAccountOpen(true)}>
              <Plus className="h-4 w-4" /> New Bank Account
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={Wallet} label="Total cash" value={formatMoney(cashTotal)} />
        <StatCard icon={Landmark} label="Total bank" value={formatMoney(bankTotal)} />
        <StatCard
          icon={Banknote}
          label="Combined total"
          value={formatMoney(cashTotal + bankTotal)}
          highlight
        />
      </div>

      <div className="surface-card overflow-hidden">
        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading accounts…</p>
        ) : ordered.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title="No cash or bank accounts"
            description="Add a bank account to start tracking balances and statements."
          />
        ) : (
          <>
            <table className="hidden w-full md:table">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Bank</th>
                  <th className="px-4 py-3">Number</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3 text-right">Statement</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{a.name}</span>
                        {a.is_system && a.account_type === "Cash" && (
                          <StatusBadge tone="accent">Pinned</StatusBadge>
                        )}
                        {!a.is_active && <StatusBadge tone="neutral">Inactive</StatusBadge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {a.bank_name ?? "—"}
                    </td>
                    <td className="numeric px-4 py-3 text-sm text-muted-foreground">
                      {maskAccountNumber(a.account_number)}
                    </td>
                    <td className="numeric px-4 py-3 text-right text-sm font-semibold">
                      {formatMoney(a.current_balance)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link to="/accounts/$accountId" params={{ accountId: a.id }}>
                          View Statement
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="divide-y divide-border md:hidden">
              {ordered.map((a) => (
                <li key={a.id}>
                  <Link
                    to="/accounts/$accountId"
                    params={{ accountId: a.id }}
                    className="flex items-center justify-between gap-3 p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{a.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {a.bank_name ? `${a.bank_name} · ` : ""}
                        {a.account_type === "Cash" ? "Cash" : maskAccountNumber(a.account_number)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <p className="numeric text-sm font-bold">{formatMoney(a.current_balance)}</p>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <AccountFormDialog open={accountOpen} onOpenChange={setAccountOpen} bankOnly />
      <FundTransferDialog open={transferOpen} onOpenChange={setTransferOpen} />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`surface-card p-4 ${highlight ? "border-primary/40" : ""}`}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="numeric mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}
