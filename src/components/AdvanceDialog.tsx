import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAccounts } from "@/lib/accounting";
import { createAdvance, type Employee } from "@/lib/payroll";
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

export function AdvanceDialog({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee;
}) {
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useAccounts(true);
  const money = accounts.filter((a) => a.account_type === "Bank" || a.account_type === "Cash");

  const [advanceDate, setAdvanceDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [accountId, setAccountId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAdvanceDate(today());
    setAmount("");
    setReason("");
    setAccountId(employee.default_account_id ?? money[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employee.id]);

  const save = async () => {
    if (!accountId) {
      toast.error("Choose the account the advance is paid from");
      return;
    }
    setSaving(true);
    try {
      await createAdvance({
        employeeId: employee.id,
        employeeName: employee.name,
        advanceDate,
        amount: Number(amount || 0),
        reason: reason.trim() || null,
        accountId,
      });
      await queryClient.invalidateQueries();
      toast.success("Advance recorded");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record the advance");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Give advance — {employee.name}</DialogTitle>
          <DialogDescription>
            The amount leaves the chosen account now and is recovered from future salary payments.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="adv-date">Date</Label>
              <Input
                id="adv-date"
                type="date"
                value={advanceDate}
                onChange={(e) => setAdvanceDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adv-amount">Amount</Label>
              <Input
                id="adv-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
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
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adv-reason">Reason</Label>
            <Textarea
              id="adv-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Record advance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
