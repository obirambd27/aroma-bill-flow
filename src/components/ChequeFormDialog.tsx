import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAccounts } from "@/lib/accounting";
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

export function ChequeFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useAccounts(true);
  const money = accounts.filter((a) => a.account_type === "Bank" || a.account_type === "Cash");

  const [number, setNumber] = useState("");
  const [type, setType] = useState("Received");
  const [party, setParty] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNumber("");
    setType("Received");
    setParty("");
    setAmount("");
    setDate(new Date().toISOString().slice(0, 10));
    setAccountId("");
    setNotes("");
    setSaving(false);
  }, [open]);

  const submit = async () => {
    if (!number.trim()) { toast.error("Cheque number is required"); return; }
    if (!party.trim()) { toast.error("Party name is required"); return; }
    if (!accountId) { toast.error("Select a linked account"); return; }
    const amt = Number(amount) || 0;
    if (amt <= 0) { toast.error("Enter an amount greater than zero"); return; }

    setSaving(true);
    try {
      const { error } = await supabase.from("cheques").insert({
        cheque_number: number.trim(),
        type,
        party_name: party.trim(),
        amount: amt,
        cheque_date: date,
        account_id: accountId,
        notes: notes.trim() || null,
      });
      if (error) throw error;
      toast.success("Cheque recorded");
      await queryClient.invalidateQueries();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save cheque");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New cheque</DialogTitle>
          <DialogDescription>
            Pending cheques are tracked only. Money moves when you mark one as cleared.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="chq-no">Cheque number</Label>
              <Input
                id="chq-no"
                className="h-11"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Received">Received</SelectItem>
                  <SelectItem value="Issued">Issued</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="chq-party">Party name</Label>
            <Input
              id="chq-party"
              className="h-11"
              value={party}
              onChange={(e) => setParty(e.target.value)}
              placeholder="Customer or vendor"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="chq-amount">Amount</Label>
              <Input
                id="chq-amount"
                className="numeric h-11"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chq-date">Cheque date</Label>
              <Input
                id="chq-date"
                className="h-11"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Linked account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="h-11">
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

          <div className="space-y-2">
            <Label htmlFor="chq-notes">Notes</Label>
            <Textarea id="chq-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Record cheque"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
