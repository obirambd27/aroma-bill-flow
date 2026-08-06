import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCustomerOpenBills } from "@/lib/payments";
import { applyCreditToBill } from "@/lib/returns";
import { formatDate, formatMoney } from "@/lib/format";

export function ApplyCreditDialog({
  open,
  onOpenChange,
  creditNoteId,
  creditNoteNumber,
  customerId,
  customerName,
  remaining,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creditNoteId: string;
  creditNoteNumber: string | null;
  customerId: string;
  customerName: string;
  remaining: number;
}) {
  const queryClient = useQueryClient();
  const { data: bills = [] } = useCustomerOpenBills(open ? customerId : null);
  const [billId, setBillId] = useState("");
  const [amount, setAmount] = useState(0);
  const [appliedDate, setAppliedDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const selected = bills.find((b) => b.id === billId) ?? null;
  const billDue = selected ? Number(selected.total_amount) - Number(selected.amount_paid) : 0;
  const cap = useMemo(() => Math.min(remaining, billDue), [remaining, billDue]);

  useEffect(() => {
    if (selected) setAmount(Number(cap.toFixed(2)));
  }, [selected, cap]);

  useEffect(() => {
    if (!open) {
      setBillId("");
      setAmount(0);
    }
  }, [open]);

  const submit = async () => {
    if (!billId || amount <= 0) {
      toast.error("Select a bill and an amount to apply");
      return;
    }
    setSaving(true);
    try {
      await applyCreditToBill({
        creditNoteId,
        creditNoteNumber,
        billId,
        amount: Math.min(amount, cap),
        appliedDate,
        customerName,
      });
      queryClient.invalidateQueries();
      toast.success("Credit applied to the bill");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not apply the credit");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apply credit to a bill</DialogTitle>
          <DialogDescription>
            {formatMoney(remaining)} of credit is available for {customerName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Open bill</Label>
            <Select value={billId} onValueChange={setBillId}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Select a bill with a balance due" />
              </SelectTrigger>
              <SelectContent>
                {bills.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.bill_number} · {formatDate(b.bill_date)} ·{" "}
                    {formatMoney(Number(b.total_amount) - Number(b.amount_paid))} due
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {bills.length === 0 && (
              <p className="text-xs text-muted-foreground">
                This customer has no bills with a balance due.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="apply-amount">Amount to apply</Label>
              <Input
                id="apply-amount"
                type="number"
                min={0}
                step="0.01"
                max={cap}
                className="h-11"
                value={amount}
                onChange={(e) => setAmount(Math.min(Number(e.target.value) || 0, cap))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apply-date">Date</Label>
              <Input
                id="apply-date"
                type="date"
                className="h-11"
                value={appliedDate}
                onChange={(e) => setAppliedDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving || !billId} onClick={submit}>
            {saving ? "Applying…" : `Apply ${formatMoney(Math.min(amount, cap))}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
