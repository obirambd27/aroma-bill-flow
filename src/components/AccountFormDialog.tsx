import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ACCOUNT_TYPES, postLedgerEntry, type Account } from "@/lib/accounting";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AccountFormDialog({
  open,
  onOpenChange,
  account,
  bankOnly = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: Account | null;
  /** Cash & Bank module uses this to lock the type to Bank. */
  bankOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("Bank");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [opening, setOpening] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(account?.name ?? "");
    setType(account?.account_type ?? (bankOnly ? "Bank" : "Bank"));
    setBankName(account?.bank_name ?? "");
    setAccountNumber(account?.account_number ?? "");
    setOpening(String(account?.opening_balance ?? 0));
    setSaving(false);
  }, [open, account, bankOnly]);

  const save = async () => {
    if (!name.trim()) {
      toast.error("Account name is required");
      return;
    }
    setSaving(true);
    try {
      if (account) {
        const { error } = await supabase
          .from("accounts")
          .update({
            name: name.trim(),
            account_type: type,
            bank_name: bankName.trim() || null,
            account_number: accountNumber.trim() || null,
          })
          .eq("id", account.id);
        if (error) throw error;
        toast.success("Account updated");
      } else {
        const openingAmount = Number(opening) || 0;
        const { data, error } = await supabase
          .from("accounts")
          .insert({
            name: name.trim(),
            account_type: type,
            bank_name: bankName.trim() || null,
            account_number: accountNumber.trim() || null,
            opening_balance: openingAmount,
          })
          .select("id")
          .single();
        if (error) throw error;
        if (openingAmount !== 0) {
          await postLedgerEntry({
            account_id: data.id,
            entry_date: new Date().toISOString().slice(0, 10),
            entry_type: "Opening Balance",
            amount: openingAmount,
            description: "Opening balance",
          });
        }
        toast.success("Account created");
      }
      await queryClient.invalidateQueries();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save account");
    } finally {
      setSaving(false);
    }
  };

  const showBankFields = type === "Bank";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {account ? "Edit account" : bankOnly ? "New bank account" : "New account"}
          </DialogTitle>
          <DialogDescription>
            {account
              ? "Update the account details. Balances are driven by ledger entries."
              : "Accounts feed the ledger that powers balances and reports."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="acc-name">Account name</Label>
            <Input
              id="acc-name"
              className="h-11"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ADCB Current Account"
            />
          </div>

          {!bankOnly && (
            <div className="space-y-2">
              <Label>Account type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showBankFields && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="acc-bank">Bank name</Label>
                <Input
                  id="acc-bank"
                  className="h-11"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Abu Dhabi Commercial Bank"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="acc-number">Account number (optional)</Label>
                <Input
                  id="acc-number"
                  className="h-11"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="1234567890"
                />
              </div>
            </div>
          )}

          {!account && (
            <div className="space-y-2">
              <Label htmlFor="acc-open">Opening balance</Label>
              <Input
                id="acc-open"
                className="numeric h-11"
                type="number"
                step="0.01"
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Posts an “Opening Balance” ledger entry so the statement always balances.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : account ? "Save changes" : "Create account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
