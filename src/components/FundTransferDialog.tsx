import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { postLedgerEntry, useAccounts } from "@/lib/accounting";
import { formatMoney } from "@/lib/format";
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

export function FundTransferDialog({
  open,
  onOpenChange,
  defaultFromAccountId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultFromAccountId?: string;
}) {
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useAccounts(true);
  const money = accounts.filter((a) => a.account_type === "Bank" || a.account_type === "Cash");

  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFromId(defaultFromAccountId ?? "");
    setToId("");
    setAmount("");
    setDate(new Date().toISOString().slice(0, 10));
    setNotes("");
    setSaving(false);
  }, [open, defaultFromAccountId]);

  const from = money.find((a) => a.id === fromId);
  const to = money.find((a) => a.id === toId);
  const amt = Number(amount) || 0;

  const willGoNegative = useMemo(
    () => !!from && amt > 0 && Number(from.current_balance) - amt < 0,
    [from, amt],
  );

  const submit = async () => {
    if (!fromId || !toId) { toast.error("Choose both accounts"); return; }
    if (fromId === toId) { toast.error("Pick two different accounts"); return; }
    if (amt <= 0) { toast.error("Enter an amount greater than zero"); return; }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("fund_transfers")
        .insert({
          from_account_id: fromId,
          to_account_id: toId,
          amount: amt,
          transfer_date: date,
          notes: notes.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;

      await postLedgerEntry({
        account_id: fromId,
        entry_date: date,
        entry_type: "Transfer Out",
        amount: -amt,
        description: `Transfer to ${to?.name ?? "account"}${notes.trim() ? ` — ${notes.trim()}` : ""}`,
      });
      await postLedgerEntry({
        account_id: toId,
        entry_date: date,
        entry_type: "Transfer In",
        amount: amt,
        description: `Transfer from ${from?.name ?? "account"}${notes.trim() ? ` — ${notes.trim()}` : ""}`,
      });

      void data;
      toast.success("Funds transferred");
      await queryClient.invalidateQueries();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Transfer funds</DialogTitle>
          <DialogDescription>Move money between your cash and bank accounts.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>From account</Label>
              <Select value={fromId} onValueChange={setFromId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {money.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} — {formatMoney(a.current_balance)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>To account</Label>
              <Select value={toId} onValueChange={setToId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {money
                    .filter((a) => a.id !== fromId)
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} — {formatMoney(a.current_balance)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tr-amount">Amount</Label>
              <Input
                id="tr-amount"
                className="numeric h-11"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tr-date">Date</Label>
              <Input
                id="tr-date"
                className="h-11"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tr-notes">Notes</Label>
            <Textarea
              id="tr-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Cash deposited at branch"
            />
          </div>

          {willGoNegative && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/35 bg-warning/10 p-3 text-sm text-warning-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                This transfer takes {from?.name} to {formatMoney(Number(from?.current_balance) - amt)}
                . You can still continue.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Transferring…" : "Transfer funds"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
