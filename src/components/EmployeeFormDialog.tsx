import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAccounts } from "@/lib/accounting";
import {
  PAYROLL_METHODS,
  SALARY_TYPES,
  saveEmployee,
  type Employee,
  type PayrollMethod,
  type SalaryType,
} from "@/lib/payroll";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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

export function EmployeeFormDialog({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee?: Employee | null;
}) {
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useAccounts(true);
  const money = accounts.filter((a) => a.account_type === "Bank" || a.account_type === "Cash");

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [joinDate, setJoinDate] = useState("");
  const [salaryType, setSalaryType] = useState<SalaryType>("Fixed Monthly");
  const [baseSalary, setBaseSalary] = useState("");
  const [commission, setCommission] = useState("");
  const [method, setMethod] = useState<PayrollMethod>("Cash");
  const [accountId, setAccountId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(employee?.name ?? "");
    setRole(employee?.role ?? "");
    setPhone(employee?.phone ?? "");
    setEmail(employee?.email ?? "");
    setJoinDate(employee?.join_date ?? "");
    setSalaryType((employee?.salary_type as SalaryType) ?? "Fixed Monthly");
    setBaseSalary(employee?.base_salary != null ? String(employee.base_salary) : "");
    setCommission(employee?.commission_rate != null ? String(employee.commission_rate) : "");
    setMethod((employee?.default_payment_method as PayrollMethod) ?? "Cash");
    setAccountId(employee?.default_account_id ?? "");
    setIsActive(employee?.is_active ?? true);
    setEndDate(employee?.end_date ?? "");
    setNotes(employee?.notes ?? "");
    setSaving(false);
  }, [open, employee]);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Enter the staff member's name");
      return;
    }
    setSaving(true);
    try {
      await saveEmployee(
        {
          name: name.trim(),
          role: role.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          join_date: joinDate || null,
          salary_type: salaryType,
          base_salary: baseSalary === "" ? null : Number(baseSalary),
          commission_rate: commission === "" ? null : Number(commission),
          default_payment_method: method,
          default_account_id: accountId || null,
          is_active: isActive,
          end_date: endDate || null,
          notes: notes.trim() || null,
        },
        employee?.id,
      );
      await queryClient.invalidateQueries();
      toast.success(employee ? "Staff member updated" : "Staff member added");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the staff member");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{employee ? "Edit staff member" : "Add staff member"}</DialogTitle>
          <DialogDescription>
            Salary setup here becomes the default when you record a payment.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="emp-name">Name</Label>
            <Input id="emp-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emp-role">Role</Label>
            <Input
              id="emp-role"
              value={role}
              placeholder="Sales, Packing…"
              onChange={(e) => setRole(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emp-join">Join date</Label>
            <Input
              id="emp-join"
              type="date"
              value={joinDate}
              onChange={(e) => setJoinDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emp-phone">Phone</Label>
            <Input id="emp-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emp-email">Email</Label>
            <Input id="emp-email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Salary type</Label>
            <Select value={salaryType} onValueChange={(v) => setSalaryType(v as SalaryType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SALARY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emp-base">Base salary (AED)</Label>
            <Input
              id="emp-base"
              inputMode="decimal"
              value={baseSalary}
              onChange={(e) => setBaseSalary(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emp-comm">Commission rate (%)</Label>
            <Input
              id="emp-comm"
              inputMode="decimal"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Default payment method</Label>
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
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Default account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick the paying account" />
              </SelectTrigger>
              <SelectContent>
                {money.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Currently employed</p>
              <p className="text-xs text-muted-foreground">
                Turn off when the staff member leaves.
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
          {!isActive && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="emp-end">Last working day</Label>
              <Input
                id="emp-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="emp-notes">Notes</Label>
            <Textarea
              id="emp-notes"
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
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
