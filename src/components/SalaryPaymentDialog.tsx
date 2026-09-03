import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { useAccounts } from "@/lib/accounting";
import { formatMoney } from "@/lib/format";
import {
  PAYROLL_METHODS,
  createSalaryPayment,
  netAmountOf,
  overlappingPeriods,
  updateSalaryPayment,
  useOutstandingAdvances,
  type Employee,
  type PayrollMethod,
  type SalaryPayment,
} from "@/lib/payroll";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const today = () => new Date().toISOString().slice(0, 10);
const monthLabel = (d = new Date()) =>
  d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

export function SalaryPaymentDialog({
  open,
  onOpenChange,
  employee,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee;
  existing?: SalaryPayment | null;
}) {
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useAccounts(true);
  const { data: advanceBalances = {} } = useOutstandingAdvances();
  const money = accounts.filter((a) => a.account_type === "Bank" || a.account_type === "Cash");
  const openAdvance = advanceBalances[employee.id] ?? 0;

  const [periodLabel, setPeriodLabel] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [base, setBase] = useState("");
  const [bonus, setBonus] = useState("");
  const [bonusNote, setBonusNote] = useState("");
  const [deduction, setDeduction] = useState("");
  const [deductionNote, setDeductionNote] = useState("");
  const [advance, setAdvance] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());
  const [method, setMethod] = useState<PayrollMethod>("Cash");
  const [accountId, setAccountId] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [overlapWarning, setOverlapWarning] = useState("");

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    setPeriodLabel(existing?.period_label ?? monthLabel());
    setPeriodStart(existing?.period_start ?? first);
    setPeriodEnd(existing?.period_end ?? last);
    setBase(String(existing?.base_amount ?? employee.base_salary ?? ""));
    setBonus(existing ? String(existing.bonus_amount) : "");
    setBonusNote(existing?.bonus_note ?? "");
    setDeduction(existing ? String(existing.deduction_amount) : "");
    setDeductionNote(existing?.deduction_note ?? "");
    setAdvance(existing ? String(existing.advance_deducted) : "");
    setPaymentDate(existing?.payment_date ?? today());
    setMethod(
      (existing?.payment_method as PayrollMethod) ??
        (employee.default_payment_method as PayrollMethod) ??
        "Cash",
    );
    setAccountId(existing?.account_id ?? employee.default_account_id ?? "");
    setAmountPaid(existing ? String(existing.amount_paid) : "");
    setNotes(existing?.notes ?? "");
    setOverlapWarning("");
    setSaving(false);
  }, [open, employee, existing]);

  const n = (v: string) => Number(v) || 0;
  const net = useMemo(
    () =>
      netAmountOf({
        baseAmount: n(base),
        bonusAmount: n(bonus),
        deductionAmount: n(deduction),
        advanceDeducted: n(advance),
      }),
    [base, bonus, deduction, advance],
  );

  // Default the paid amount to the full net once the figures settle.
  useEffect(() => {
    if (!open || existing) return;
    setAmountPaid(net > 0 ? String(net) : "");
  }, [net, open, existing]);

  useEffect(() => {
    if (!open || !periodStart || !periodEnd) return;
    let cancelled = false;
    void (async () => {
      const rows = await overlappingPeriods(
        employee.id,
        periodStart,
        periodEnd,
        existing?.id,
      );
      if (cancelled) return;
      setOverlapWarning(
        rows.length > 0
          ? `${employee.name} already has a payment covering these dates (${rows[0]?.period_label}).`
          : "",
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [open, employee, periodStart, periodEnd, existing?.id]);

  const submit = async () => {
    if (!accountId) {
      toast.error("Pick the account the salary is paid from");
      return;
    }
    if (net <= 0) {
      toast.error("Net amount must be greater than zero");
      return;
    }
    if (n(advance) > openAdvance + Number(existing?.advance_deducted ?? 0)) {
      toast.error("Advance deduction is more than the outstanding advance");
      return;
    }
    if (n(amountPaid) > net) {
      toast.error("Paid amount cannot exceed the net salary");
      return;
    }
    setSaving(true);
    const input = {
      employeeId: employee.id,
      employeeName: employee.name,
      periodLabel: periodLabel.trim() || monthLabel(),
      periodStart: periodStart || null,
      periodEnd: periodEnd || null,
      baseAmount: n(base),
      bonusAmount: n(bonus),
      bonusNote: bonusNote.trim() || null,
      deductionAmount: n(deduction),
      deductionNote: deductionNote.trim() || null,
      advanceDeducted: n(advance),
      paymentDate,
      paymentMethod: method,
      accountId,
      amountPaid: n(amountPaid),
      notes: notes.trim() || null,
    };
    try {
      if (existing) await updateSalaryPayment(existing, input);
      else await createSalaryPayment(input);
      await queryClient.invalidateQueries();
      toast.success(existing ? "Salary payment updated" : "Salary payment recorded");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record the salary payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit salary payment" : `Pay ${employee.name}`}</DialogTitle>
          <DialogDescription>
            The payment posts to the chosen account, exactly like an expense.
          </DialogDescription>
        </DialogHeader>

        {overlapWarning && (
          <p className="flex items-start gap-2 rounded-lg border border-warning/35 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {overlapWarning}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sal-period">Period</Label>
            <Input
              id="sal-period"
              value={periodLabel}
              onChange={(e) => setPeriodLabel(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sal-start">From</Label>
            <Input
              id="sal-start"
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sal-end">To</Label>
            <Input
              id="sal-end"
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sal-base">Base amount</Label>
            <Input
              id="sal-base"
              inputMode="decimal"
              value={base}
              onChange={(e) => setBase(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sal-bonus">Bonus / commission</Label>
            <Input
              id="sal-bonus"
              inputMode="decimal"
              value={bonus}
              onChange={(e) => setBonus(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sal-bonus-note">Bonus note</Label>
            <Input
              id="sal-bonus-note"
              value={bonusNote}
              onChange={(e) => setBonusNote(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sal-ded">Deduction</Label>
            <Input
              id="sal-ded"
              inputMode="decimal"
              value={deduction}
              onChange={(e) => setDeduction(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sal-ded-note">Deduction note</Label>
            <Input
              id="sal-ded-note"
              value={deductionNote}
              onChange={(e) => setDeductionNote(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sal-adv">
              Advance recovered{" "}
              <span className="text-xs text-muted-foreground">
                (outstanding {formatMoney(openAdvance)})
              </span>
            </Label>
            <Input
              id="sal-adv"
              inputMode="decimal"
              value={advance}
              onChange={(e) => setAdvance(e.target.value)}
            />
          </div>

          <div className="rounded-lg border border-border px-3 py-2 sm:col-span-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Net payable</p>
            <p className="numeric text-2xl font-bold">{formatMoney(net)}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sal-date">Payment date</Label>
            <Input
              id="sal-date"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sal-paid">Amount paid now</Label>
            <Input
              id="sal-paid"
              inputMode="decimal"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PayrollMethod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYROLL_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Paid from</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {money.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} · {formatMoney(a.current_balance)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sal-notes">Notes</Label>
            <Textarea
              id="sal-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : existing ? "Update payment" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
