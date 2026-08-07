import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccounts } from "@/lib/accounting";
import {
  EXPENSE_METHODS,
  RECURRENCE_FREQUENCIES,
  createExpense,
  updateExpense,
  uploadReceipt,
  useExpenseCategories,
  type ExpenseMethod,
  type ExpenseRow,
  type RecurrenceFrequency,
} from "@/lib/expenses";
import { todayISO } from "@/lib/reports";

export function ExpenseForm({ expense }: { expense?: ExpenseRow | null }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: categories = [] } = useExpenseCategories();
  const { data: accounts = [] } = useAccounts(true);

  const [categoryId, setCategoryId] = useState(expense?.category_id ?? "");
  const [expenseDate, setExpenseDate] = useState(expense?.expense_date ?? todayISO());
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [method, setMethod] = useState<ExpenseMethod>(
    (expense?.payment_method as ExpenseMethod) ?? "Cash",
  );
  const [accountId, setAccountId] = useState(expense?.account_id ?? "");
  const [vendorName, setVendorName] = useState(expense?.vendor_name ?? "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [attachmentUrl, setAttachmentUrl] = useState(expense?.attachment_url ?? "");
  const [isRecurring, setIsRecurring] = useState(expense?.is_recurring ?? false);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(
    (expense?.recurrence_frequency as RecurrenceFrequency) ?? "Monthly",
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const cashAccounts = useMemo(
    () => accounts.filter((a) => a.account_type === "Cash" || a.account_type === "Bank"),
    [accounts],
  );

  useEffect(() => {
    if (!accountId && cashAccounts.length > 0) setAccountId(cashAccounts[0]!.id);
  }, [cashAccounts, accountId]);

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const path = await uploadReceipt(file);
      setAttachmentUrl(path);
      toast.success("Receipt attached");
    } catch {
      toast.error("Could not upload the receipt");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    const value = Number(amount) || 0;
    if (value <= 0) {
      toast.error("Enter an amount greater than 0");
      return;
    }
    if (!categoryId) {
      toast.error("Pick a category");
      return;
    }
    if (method !== "Cheque" && !accountId) {
      toast.error("Select the account the money came from");
      return;
    }

    const label = categories.find((c) => c.id === categoryId)?.name ?? "Expense";
    const input = {
      categoryId,
      expenseDate,
      amount: value,
      method,
      accountId: accountId || null,
      vendorName: vendorName.trim() || null,
      description: description.trim() || null,
      attachmentUrl: attachmentUrl || null,
      isRecurring,
      recurrenceFrequency: isRecurring ? frequency : null,
    };

    setSaving(true);
    try {
      if (expense) await updateExpense(expense.id, input, label);
      else await createExpense(input, label);
      queryClient.invalidateQueries();
      toast.success(expense ? "Expense updated" : "Expense recorded");
      void navigate({ to: "/expenses" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the expense");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="surface-card space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ex-category">Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="ex-category" className="h-11">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex-date">Date</Label>
            <Input
              id="ex-date"
              type="date"
              className="h-11"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex-amount">Amount</Label>
            <Input
              id="ex-amount"
              type="number"
              min="0"
              step="0.01"
              className="h-11"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex-method">Paid Via</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as ExpenseMethod)}>
              <SelectTrigger id="ex-method" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex-account">
              {method === "Cheque" ? "Cheque drawn on" : "Paid from"}
            </Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="ex-account" className="h-11">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {cashAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex-payee">Paid To</Label>
            <Input
              id="ex-payee"
              className="h-11"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="Vendor or payee"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ex-description">Description</Label>
          <Textarea
            id="ex-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ex-receipt">Receipt</Label>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              id="ex-receipt"
              type="file"
              accept="image/*,application/pdf"
              className="h-11 max-w-xs"
              onChange={(e) => void onUpload(e.target.files?.[0])}
            />
            {uploading && <span className="text-xs text-muted-foreground">Uploading…</span>}
            {attachmentUrl && !uploading && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Paperclip className="h-3.5 w-3.5" />
                Receipt attached
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={isRecurring}
              onCheckedChange={(v) => setIsRecurring(v === true)}
              aria-label="This is a recurring expense"
            />
            This is a recurring expense
          </label>
          {isRecurring && (
            <Select value={frequency} onValueChange={(v) => setFrequency(v as RecurrenceFrequency)}>
              <SelectTrigger className="h-11 max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECURRENCE_FREQUENCIES.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </section>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => void navigate({ to: "/expenses" })}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={saving || uploading}>
          {saving ? "Saving…" : expense ? "Save Changes" : "Record Expense"}
        </Button>
      </div>
    </div>
  );
}
