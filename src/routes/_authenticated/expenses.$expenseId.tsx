import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Paperclip, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ExpenseForm } from "@/components/ExpenseForm";
import { Button } from "@/components/ui/button";
import { deleteExpense, receiptUrl, useExpense } from "@/lib/expenses";

export const Route = createFileRoute("/_authenticated/expenses/$expenseId")({
  head: () => ({
    meta: [
      { title: "Edit Expense — Fragrance Billing" },
      { name: "description", content: "Update or remove a recorded shop expense." },
      { property: "og:title", content: "Edit Expense — Fragrance Billing" },
      { property: "og:description", content: "Update or remove a recorded shop expense." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EditExpensePage,
});

function EditExpensePage() {
  const { expenseId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: expense, isLoading } = useExpense(expenseId);
  const [busy, setBusy] = useState(false);

  if (isLoading) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Loading expense…</p>;
  }
  if (!expense) {
    return (
      <div className="space-y-4">
        <PageHeader title="Expense not found" description="It may have been deleted." />
        <Button asChild variant="outline">
          <Link to="/expenses">
            <ArrowLeft />
            Back to Expenses
          </Link>
        </Button>
      </div>
    );
  }

  const openReceipt = async () => {
    if (!expense.attachment_url) return;
    const url = await receiptUrl(expense.attachment_url);
    if (url) window.open(url, "_blank", "noopener");
    else toast.error("Could not open the receipt");
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteExpense(expense.id);
      queryClient.invalidateQueries();
      toast.success("Expense deleted");
      void navigate({ to: "/expenses" });
    } catch {
      toast.error("Could not delete the expense");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={expense.expense_number ?? "Expense"}
        description="Edits re-post this expense to the ledger."
        actions={
          <div className="flex flex-wrap gap-2">
            {expense.attachment_url && (
              <Button variant="outline" onClick={() => void openReceipt()}>
                <Paperclip />
                View Receipt
              </Button>
            )}
            <Button variant="outline" onClick={() => void remove()} disabled={busy}>
              <Trash2 />
              Delete
            </Button>
          </div>
        }
      />
      <ExpenseForm expense={expense} />
    </div>
  );
}
