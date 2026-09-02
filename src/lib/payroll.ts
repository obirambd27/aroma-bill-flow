/**
 * Payroll — employees, salary payments and staff advances.
 *
 * Every money movement posts a ledger entry on the paying account, exactly the
 * way Expenses and Payments Made already do, so Cash & Bank, the Day Book and
 * the Owner Report stay in sync automatically.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { round2 } from "@/lib/payment-math";
import type { Tables } from "@/integrations/supabase/types";

export type Employee = Tables<"employees">;
export type SalaryPayment = Tables<"salary_payments">;
export type EmployeeAdvance = Tables<"employee_advances">;

export const SALARY_TYPES = [
  "Fixed Monthly",
  "Daily Wage",
  "Commission-Based",
  "Mixed",
] as const;
export type SalaryType = (typeof SALARY_TYPES)[number];

export const PAYROLL_METHODS = ["Cash", "Bank Transfer"] as const;
export type PayrollMethod = (typeof PAYROLL_METHODS)[number];

export type SalaryPaymentRow = SalaryPayment & {
  employees: { id: string; name: string; role: string | null; join_date: string | null } | null;
  accounts: { name: string } | null;
};

export type AdvanceRow = EmployeeAdvance & {
  employees: { id: string; name: string } | null;
  accounts: { name: string } | null;
};

const num = (v: unknown) => Number(v ?? 0);

/* ---------------- queries ---------------- */

export function useEmployees() {
  return useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const data = await fetchAll<Employee>((f, t) =>
        supabase.from("employees").select("*").order("name").range(f, t),
      );
      return data;
    },
  });
}

export function useEmployee(employeeId: string) {
  return useQuery({
    queryKey: ["employee", employeeId],
    enabled: Boolean(employeeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("id", employeeId)
        .maybeSingle();
      if (error) throw error;
      return (data as Employee | null) ?? null;
    },
  });
}

const SALARY_SELECT = "*, employees(id, name, role, join_date), accounts(name)";

export function useSalaryPayments(employeeId?: string) {
  return useQuery({
    queryKey: ["salary-payments", employeeId ?? "all"],
    queryFn: async () => {
      const rows = await fetchAll<SalaryPaymentRow>((f, t) => {
        let q = supabase
          .from("salary_payments")
          .select(SALARY_SELECT)
          .order("payment_date", { ascending: false })
          .order("created_at", { ascending: false });
        if (employeeId) q = q.eq("employee_id", employeeId);
        return q.range(f, t) as never;
      });
      return rows;
    },
  });
}

export function useSalaryPayment(paymentId: string) {
  return useQuery({
    queryKey: ["salary-payment", paymentId],
    enabled: Boolean(paymentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salary_payments")
        .select(SALARY_SELECT)
        .eq("id", paymentId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as SalaryPaymentRow | null) ?? null;
    },
  });
}

export function useAdvances(employeeId?: string) {
  return useQuery({
    queryKey: ["employee-advances", employeeId ?? "all"],
    queryFn: async () => {
      const rows = await fetchAll<AdvanceRow>((f, t) => {
        let q = supabase
          .from("employee_advances")
          .select("*, employees(id, name), accounts(name)")
          .order("advance_date", { ascending: false });
        if (employeeId) q = q.eq("employee_id", employeeId);
        return q.range(f, t) as never;
      });
      return rows;
    },
  });
}

/** Outstanding advance balance per employee id. */
export function useOutstandingAdvances() {
  return useQuery({
    queryKey: ["employee-advance-balances"],
    queryFn: async () => {
      const rows = await fetchAll<{
        employee_id: string;
        amount: number;
        amount_recovered: number;
      }>((f, t) =>
        supabase
          .from("employee_advances")
          .select("employee_id, amount, amount_recovered")
          .range(f, t),
      );
      const map: Record<string, number> = {};
      for (const r of rows) {
        const open = num(r.amount) - num(r.amount_recovered);
        if (open <= 0) continue;
        map[r.employee_id] = round2((map[r.employee_id] ?? 0) + open);
      }
      return map;
    },
  });
}

export function outstandingOf(advance: EmployeeAdvance) {
  return round2(num(advance.amount) - num(advance.amount_recovered));
}

/* ---------------- employees ---------------- */

export type EmployeeInput = {
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  join_date: string | null;
  salary_type: SalaryType;
  base_salary: number | null;
  commission_rate: number | null;
  default_payment_method: PayrollMethod | null;
  default_account_id: string | null;
  is_active: boolean;
  end_date: string | null;
  notes: string | null;
};

export async function saveEmployee(input: EmployeeInput, employeeId?: string) {
  if (employeeId) {
    const { error } = await supabase.from("employees").update(input).eq("id", employeeId);
    if (error) throw error;
    return employeeId;
  }
  const { data, error } = await supabase.from("employees").insert(input).select("id").single();
  if (error || !data) throw error ?? new Error("Could not save the employee");
  return data.id as string;
}

/* ---------------- salary payments ---------------- */

export type SalaryInput = {
  employeeId: string;
  employeeName: string;
  periodLabel: string;
  periodStart: string | null;
  periodEnd: string | null;
  baseAmount: number;
  bonusAmount: number;
  bonusNote: string | null;
  deductionAmount: number;
  deductionNote: string | null;
  advanceDeducted: number;
  paymentDate: string;
  paymentMethod: PayrollMethod;
  accountId: string;
  amountPaid: number;
  notes: string | null;
};

export function netAmountOf(i: {
  baseAmount: number;
  bonusAmount: number;
  deductionAmount: number;
  advanceDeducted: number;
}) {
  return round2(i.baseAmount + i.bonusAmount - i.deductionAmount - i.advanceDeducted);
}

export function salaryStatus(netAmount: number, amountPaid: number) {
  if (amountPaid <= 0) return "Pending";
  if (round2(amountPaid) >= round2(netAmount)) return "Paid";
  return "Partial";
}

/** Warns when the same employee already has a payment covering these dates. */
export async function overlappingPeriods(
  employeeId: string,
  start: string | null,
  end: string | null,
  ignoreId?: string,
) {
  if (!start || !end) return [] as SalaryPayment[];
  let q = supabase
    .from("salary_payments")
    .select("*")
    .eq("employee_id", employeeId)
    .not("period_start", "is", null)
    .lte("period_start", end)
    .gte("period_end", start);
  if (ignoreId) q = q.neq("id", ignoreId);
  const { data } = await q;
  return (data ?? []) as SalaryPayment[];
}

async function recoverAdvances(employeeId: string, amount: number) {
  let left = round2(amount);
  if (left <= 0) return;
  const { data } = await supabase
    .from("employee_advances")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("status", "Outstanding")
    .order("advance_date", { ascending: true });
  for (const adv of (data ?? []) as EmployeeAdvance[]) {
    if (left <= 0) break;
    const open = outstandingOf(adv);
    if (open <= 0) continue;
    const take = Math.min(open, left);
    const recovered = round2(num(adv.amount_recovered) + take);
    await supabase
      .from("employee_advances")
      .update({
        amount_recovered: recovered,
        status: recovered >= round2(num(adv.amount)) ? "Fully Recovered" : "Outstanding",
      })
      .eq("id", adv.id);
    left = round2(left - take);
  }
}

/** Undoes advance recovery when a salary payment is edited or deleted. */
async function unrecoverAdvances(employeeId: string, amount: number) {
  let left = round2(amount);
  if (left <= 0) return;
  const { data } = await supabase
    .from("employee_advances")
    .select("*")
    .eq("employee_id", employeeId)
    .gt("amount_recovered", 0)
    .order("advance_date", { ascending: false });
  for (const adv of (data ?? []) as EmployeeAdvance[]) {
    if (left <= 0) break;
    const give = Math.min(num(adv.amount_recovered), left);
    const recovered = round2(num(adv.amount_recovered) - give);
    await supabase
      .from("employee_advances")
      .update({
        amount_recovered: recovered,
        status: recovered >= round2(num(adv.amount)) ? "Fully Recovered" : "Outstanding",
      })
      .eq("id", adv.id);
    left = round2(left - give);
  }
}

async function postSalaryLedger(payment: SalaryPayment, employeeName: string) {
  const amount = round2(num(payment.amount_paid));
  if (!payment.account_id || amount <= 0) return;
  const { error } = await supabase.from("ledger_entries").insert({
    account_id: payment.account_id,
    entry_date: payment.payment_date,
    entry_type: "Salary Payment",
    amount: -amount,
    event_role: "forward",
    related_salary_payment_id: payment.id,
    description: `${payment.payment_number ?? "Salary"} · ${employeeName}`,
  });
  if (error) throw error;
}

/** Removes the forward ledger entry of a salary payment (balance unwinds via trigger). */
async function clearSalaryLedger(paymentId: string) {
  const { error } = await supabase
    .from("ledger_entries")
    .delete()
    .eq("related_salary_payment_id", paymentId);
  if (error) throw error;
}

export async function createSalaryPayment(input: SalaryInput) {
  const net = netAmountOf(input);
  if (net <= 0) throw new Error("Net amount must be greater than zero");

  const { data, error } = await supabase
    .from("salary_payments")
    .insert({
      employee_id: input.employeeId,
      period_label: input.periodLabel,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      base_amount: input.baseAmount,
      bonus_amount: input.bonusAmount,
      bonus_note: input.bonusNote,
      deduction_amount: input.deductionAmount,
      deduction_note: input.deductionNote,
      advance_deducted: input.advanceDeducted,
      net_amount: net,
      payment_date: input.paymentDate,
      payment_method: input.paymentMethod,
      account_id: input.accountId,
      amount_paid: input.amountPaid,
      payment_status: salaryStatus(net, input.amountPaid),
      notes: input.notes,
    })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("Could not save the salary payment");
  const payment = data as SalaryPayment;

  try {
    await postSalaryLedger(payment, input.employeeName);
    if (input.advanceDeducted > 0) {
      await recoverAdvances(input.employeeId, input.advanceDeducted);
    }
  } catch (err) {
    // Roll the whole thing back so no half-posted payment survives.
    await clearSalaryLedger(payment.id);
    await supabase.from("salary_payments").delete().eq("id", payment.id);
    throw err;
  }
  return payment;
}

/** Reverse-then-reapply edit: unwinds ledger + advance recovery, then re-posts. */
export async function updateSalaryPayment(
  existing: SalaryPayment,
  input: SalaryInput,
) {
  const net = netAmountOf(input);
  if (net <= 0) throw new Error("Net amount must be greater than zero");

  await clearSalaryLedger(existing.id);
  await unrecoverAdvances(existing.employee_id, num(existing.advance_deducted));

  const { data, error } = await supabase
    .from("salary_payments")
    .update({
      period_label: input.periodLabel,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      base_amount: input.baseAmount,
      bonus_amount: input.bonusAmount,
      bonus_note: input.bonusNote,
      deduction_amount: input.deductionAmount,
      deduction_note: input.deductionNote,
      advance_deducted: input.advanceDeducted,
      net_amount: net,
      payment_date: input.paymentDate,
      payment_method: input.paymentMethod,
      account_id: input.accountId,
      amount_paid: input.amountPaid,
      payment_status: salaryStatus(net, input.amountPaid),
      notes: input.notes,
    })
    .eq("id", existing.id)
    .select()
    .single();
  if (error || !data) throw error ?? new Error("Could not update the salary payment");

  await postSalaryLedger(data as SalaryPayment, input.employeeName);
  if (input.advanceDeducted > 0) await recoverAdvances(input.employeeId, input.advanceDeducted);
  return data as SalaryPayment;
}

export async function deleteSalaryPayment(payment: SalaryPayment) {
  await clearSalaryLedger(payment.id);
  await unrecoverAdvances(payment.employee_id, num(payment.advance_deducted));
  const { error } = await supabase.from("salary_payments").delete().eq("id", payment.id);
  if (error) throw error;
}

/* ---------------- advances ---------------- */

export type AdvanceInput = {
  employeeId: string;
  employeeName: string;
  advanceDate: string;
  amount: number;
  reason: string | null;
  accountId: string;
};

export async function createAdvance(input: AdvanceInput) {
  if (input.amount <= 0) throw new Error("Enter an amount greater than zero");
  const { data, error } = await supabase
    .from("employee_advances")
    .insert({
      employee_id: input.employeeId,
      advance_date: input.advanceDate,
      amount: input.amount,
      reason: input.reason,
      account_id: input.accountId,
      status: "Outstanding",
      amount_recovered: 0,
    })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("Could not save the advance");
  const advance = data as EmployeeAdvance;

  const { error: ledgerError } = await supabase.from("ledger_entries").insert({
    account_id: input.accountId,
    entry_date: input.advanceDate,
    entry_type: "Employee Advance",
    amount: -round2(input.amount),
    event_role: "forward",
    related_advance_id: advance.id,
    description: `Advance · ${input.employeeName}`,
  });
  if (ledgerError) {
    await supabase.from("employee_advances").delete().eq("id", advance.id);
    throw ledgerError;
  }
  return advance;
}

export async function deleteAdvance(advance: EmployeeAdvance) {
  if (num(advance.amount_recovered) > 0) {
    throw new Error("This advance has already been partly recovered from a salary payment");
  }
  await supabase.from("ledger_entries").delete().eq("related_advance_id", advance.id);
  const { error } = await supabase.from("employee_advances").delete().eq("id", advance.id);
  if (error) throw error;
}

/* ---------------- payroll summary ---------------- */

export function usePayrollSummary(range: { from: string; to: string }) {
  return useQuery({
    queryKey: ["payroll-summary", range.from, range.to],
    queryFn: async () => {
      const [payments, advances] = await Promise.all([
        fetchAll<SalaryPaymentRow>((f, t) =>
          supabase
            .from("salary_payments")
            .select(SALARY_SELECT)
            .gte("payment_date", range.from)
            .lte("payment_date", range.to)
            .order("payment_date", { ascending: false })
            .range(f, t) as never,
        ),
        fetchAll<AdvanceRow>((f, t) =>
          supabase
            .from("employee_advances")
            .select("*, employees(id, name), accounts(name)")
            .gte("advance_date", range.from)
            .lte("advance_date", range.to)
            .range(f, t) as never,
        ),
      ]);
      const totalPaid = round2(payments.reduce((s, p) => s + num(p.amount_paid), 0));
      const totalAdvances = round2(advances.reduce((s, a) => s + num(a.amount), 0));
      const employeesPaid = new Set(payments.map((p) => p.employee_id)).size;
      return { payments, advances, totalPaid, totalAdvances, employeesPaid };
    },
  });
}

/** Active employees with no salary payment covering the current month. */
export function useSalariesDueThisMonth() {
  return useQuery({
    queryKey: ["salaries-due-this-month"],
    queryFn: async () => {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const iso = (d: Date) =>
        new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

      const [{ data: employees }, { data: payments }] = await Promise.all([
        supabase.from("employees").select("id, name, role, base_salary").eq("is_active", true),
        supabase
          .from("salary_payments")
          .select("employee_id")
          .gte("payment_date", iso(first))
          .lte("payment_date", iso(last)),
      ]);
      const paid = new Set((payments ?? []).map((p) => p.employee_id));
      const due = (employees ?? []).filter((e) => !paid.has(e.id));
      return {
        month: now.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
        due: due as { id: string; name: string; role: string | null; base_salary: number | null }[],
        total: round2(due.reduce((s, e) => s + num(e.base_salary), 0)),
      };
    },
  });
}
