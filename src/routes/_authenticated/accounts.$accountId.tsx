import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { AccountStatement } from "@/components/AccountStatement";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/lib/accounting";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/accounts/$accountId")({
  head: () => ({
    meta: [
      { title: "Account Statement — Fragrance Billing" },
      { name: "description", content: "Full ledger history and running balance for an account." },
      { property: "og:title", content: "Account Statement — Fragrance Billing" },
      {
        property: "og:description",
        content: "Full ledger history and running balance for an account.",
      },
    ],
  }),
  component: AccountDetailPage,
  errorComponent: ({ error }) => (
    <p role="alert" className="p-8 text-sm text-destructive">
      {error.message}
    </p>
  ),
  notFoundComponent: () => <p className="p-8 text-sm text-muted-foreground">Account not found.</p>,
});

function AccountDetailPage() {
  const { accountId } = Route.useParams();
  const { data: account, isLoading } = useAccount(accountId);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/accounts">
          <ArrowLeft className="h-4 w-4" /> Back to accounts
        </Link>
      </Button>

      <PageHeader
        title={account?.name ?? (isLoading ? "Loading…" : "Account")}
        description={
          account
            ? `${account.account_type}${account.bank_name ? ` · ${account.bank_name}` : ""}`
            : ""
        }
        actions={
          account ? (
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Balance</p>
              <p className="numeric text-2xl font-bold">
                {formatMoney(account.current_balance)}
              </p>
              <StatusBadge tone={account.is_active ? "success" : "neutral"}>
                {account.is_active ? "Active" : "Inactive"}
              </StatusBadge>
            </div>
          ) : null
        }
      />

      <AccountStatement accountId={accountId} />
    </div>
  );
}
