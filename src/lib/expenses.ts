import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import type { Tables } from "@/integrations/supabase/types";
import { accountIdByName } from "@/lib/payments";

export type Expense = Tables<"expenses">;
export type ExpenseCategory = Tables<"expense_categories">;

export const EXPENSE_METHODS = ["Cash", "Bank Transfer", "Card", "Cheque"] as const;
export type ExpenseMethod = (typeof EXPENSE_METHODS)[number];

export const RECURRENCE_FREQUENCIES = ["Weekly", "Monthly", "Yearly"] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export type ExpenseRow = Expense & {
  expense_categories: { id: string; name: string } | null;
  accounts: { name: string } | null;
};

const SELECT = "*, expense_categories(id, name), accounts(name)";

export function useExpenses() {
  return useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const data = await fetchAll<ExpenseRow>((f, t) =>
        supabase
          .from("expenses")
          .select(SELECT)
          .order("expense_date", { ascending: false })
          .order("created_at", { ascending: false })
          .range(f, t) as never,
      );
      return data;
    },
  });
}

export function useExpense(expenseId: string) {
  return useQuery({
    queryKey: ["expense", expenseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select(SELECT)
        .eq("id", expenseId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as ExpenseRow | null;
    },
    enabled: Boolean(expenseId),
  });
}

export function useExpenseCategories() {
  return useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_categories")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as ExpenseCategory[];
    },
  });
}

/** How many expenses reference each category — used to block deletes. */
export function useCategoryUsage() {
  return useQuery({
    queryKey: ["expense-category-usage"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("category_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        if (!row.category_id) continue;
        counts[row.category_id] = (counts[row.category_id] ?? 0) + 1;
      }
      return counts;
    },
  });
}

export function addFrequency(date: string, frequency: RecurrenceFrequency) {
  const d = new Date(`${date}T00:00:00`);
  if (frequency === "Weekly") d.setDate(d.getDate() + 7);
  else if (frequency === "Monthly") d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
}

export type ExpenseInput = {
  categoryId: string | null;
  expenseDate: string;
  amount: number;
  method: ExpenseMethod;
  accountId: string | null;
  vendorName: string | null;
  description: string | null;
  attachmentUrl: string | null;
  isRecurring: boolean;
  recurrenceFrequency: RecurrenceFrequency | null;
};

async function postExpenseEffect(expense: Expense, input: ExpenseInput, label: string) {
  if (input.amount <= 0) return;
  if (input.method === "Cheque") {
    const chequeAccount = input.accountId ?? (await accountIdByName("Cash in Hand"));
    if (chequeAccount) {
      await supabase.from("cheques").insert({
        cheque_number: `EXP-${expense.id.slice(0, 8)}`,
        type: "Issued",
        party_name: input.vendorName || label,
        amount: input.amount,
        cheque_date: input.expenseDate,
        account_id: chequeAccount,
        status: "Pending",
        notes: `${expense.expense_number ?? "Expense"} · ${label}`,
      });
    }
  } else if (input.accountId) {
    await supabase.from("ledger_entries").insert({
      account_id: input.accountId,
      entry_date: input.expenseDate,
      entry_type: "Expense",
      amount: -input.amount,
      related_expense_id: expense.id,
      description: `${expense.expense_number ?? "Expense"} · ${label}`,
    });
  }
}

export async function createExpense(input: ExpenseInput, label = "Expense") {
  const { data: expense, error } = await supabase
    .from("expenses")
    .insert({
      category_id: input.categoryId,
      expense_date: input.expenseDate,
      amount: input.amount,
      payment_method: input.method,
      account_id: input.method === "Cheque" ? null : input.accountId,
      vendor_name: input.vendorName,
      description: input.description,
      attachment_url: input.attachmentUrl,
      is_recurring: input.isRecurring,
      recurrence_frequency: input.isRecurring ? input.recurrenceFrequency : null,
      next_recurrence_date:
        input.isRecurring && input.recurrenceFrequency
          ? addFrequency(input.expenseDate, input.recurrenceFrequency)
          : null,
    })
    .select()
    .single();
  if (error || !expense) throw error ?? new Error("Could not save the expense");

  await postExpenseEffect(expense as Expense, input, label);
  return expense as Expense;
}

/** Edits an expense and re-posts its ledger effect from scratch. */
export async function updateExpense(expenseId: string, input: ExpenseInput, label = "Expense") {
  const { data: expense, error } = await supabase
    .from("expenses")
    .update({
      category_id: input.categoryId,
      expense_date: input.expenseDate,
      amount: input.amount,
      payment_method: input.method,
      account_id: input.method === "Cheque" ? null : input.accountId,
      vendor_name: input.vendorName,
      description: input.description,
      attachment_url: input.attachmentUrl,
      is_recurring: input.isRecurring,
      recurrence_frequency: input.isRecurring ? input.recurrenceFrequency : null,
      next_recurrence_date:
        input.isRecurring && input.recurrenceFrequency
          ? addFrequency(input.expenseDate, input.recurrenceFrequency)
          : null,
    })
    .eq("id", expenseId)
    .select()
    .single();
  if (error || !expense) throw error ?? new Error("Could not update the expense");

  await supabase.from("ledger_entries").delete().eq("related_expense_id", expenseId);
  await postExpenseEffect(expense as Expense, input, label);
  return expense as Expense;
}

export async function deleteExpense(expenseId: string) {
  await supabase.from("ledger_entries").delete().eq("related_expense_id", expenseId);
  const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
  if (error) throw error;
}

/** Creates the next occurrence of a recurring expense and advances its schedule. */
export async function runRecurringExpense(expense: ExpenseRow) {
  const frequency = (expense.recurrence_frequency ?? "Monthly") as RecurrenceFrequency;
  const dueDate = expense.next_recurrence_date ?? expense.expense_date;
  await createExpense(
    {
      categoryId: expense.category_id,
      expenseDate: dueDate,
      amount: Number(expense.amount),
      method: (expense.payment_method as ExpenseMethod) ?? "Cash",
      accountId: expense.account_id,
      vendorName: expense.vendor_name,
      description: expense.description,
      attachmentUrl: null,
      isRecurring: false,
      recurrenceFrequency: null,
    },
    expense.expense_categories?.name ?? "Expense",
  );
  await supabase
    .from("expenses")
    .update({ next_recurrence_date: addFrequency(dueDate, frequency) })
    .eq("id", expense.id);
}

/** Uploads a receipt to private storage and returns its path. */
export async function uploadReceipt(file: File) {
  const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
  const { error } = await supabase.storage.from("receipts").upload(path, file);
  if (error) throw error;
  return path;
}

export async function receiptUrl(path: string) {
  const { data } = await supabase.storage.from("receipts").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
