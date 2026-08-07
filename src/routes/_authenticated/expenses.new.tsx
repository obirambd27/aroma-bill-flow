import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { ExpenseForm } from "@/components/ExpenseForm";

export const Route = createFileRoute("/_authenticated/expenses/new")({
  head: () => ({
    meta: [
      { title: "New Expense — Fragrance Billing" },
      { name: "description", content: "Record a shop expense with receipt and recurring schedule." },
      { property: "og:title", content: "New Expense — Fragrance Billing" },
      {
        property: "og:description",
        content: "Record a shop expense with receipt and recurring schedule.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewExpensePage,
});

function NewExpensePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="New Expense" description="Log what the shop spent and where it came from." />
      <ExpenseForm />
    </div>
  );
}
