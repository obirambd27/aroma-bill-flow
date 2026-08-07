import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useAccounts } from "@/lib/accounting";
import { useVendors } from "@/lib/purchases";
import {
  PAYMENT_OUT_METHODS,
  recordPaymentOut,
  useVendorOpenPurchaseBills,
  type PaymentOutMethod,
} from "@/lib/payments-out";
import { allocateOldestFirst, billBalance, round2, validatePayment } from "@/lib/payment-math";
import { formatDate, formatMoney } from "@/lib/format";
import { todayISO } from "@/lib/reports";

export function RecordPaymentOutDialog({
  open,
  onOpenChange,
  defaultVendorId,
  defaultBillId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultVendorId?: string | null;
  defaultBillId?: string | null;
}) {
  const queryClient = useQueryClient();
  const { data: vendors = [] } = useVendors();
  const { data: accounts = [] } = useAccounts(true);

  const [vendorId, setVendorId] = useState(defaultVendorId ?? "");
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentOutMethod>("Cash");
  const [accountId, setAccountId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDate, setChequeDate] = useState(todayISO());
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: openBills = [] } = useVendorOpenPurchaseBills(vendorId || null);

  const cashAccounts = useMemo(
    () => accounts.filter((a) => a.account_type === "Cash" || a.account_type === "Bank"),
    [accounts],
  );

  useEffect(() => {
    if (!open) return;
    setVendorId(defaultVendorId ?? "");
    setPaymentDate(todayISO());
    setAmount("");
    setMethod("Cash");
    setReference("");
    setNotes("");
    setAlloc({});
    setAccountId((prev) => prev || cashAccounts[0]?.id || "");
  }, [open, defaultVendorId, cashAccounts]);

  const amountNumber = round2(Number(amount) || 0);
  const allocated = round2(
    Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0),
  );
  const unallocated = round2(amountNumber - allocated);

  const billLike = openBills.map((b) => ({
    id: b.id,
    bill_number: b.bill_number,
    bill_date: b.bill_date,
    total_amount: Number(b.total_amount),
    amount_paid: Number(b.amount_paid),
  }));

  const autoAllocate = () => {
    const rows = allocateOldestFirst(billLike, amountNumber, defaultBillId ?? null);
    const next: Record<string, string> = {};
    for (const r of rows) next[r.billId] = String(r.amount);
    setAlloc(next);
  };

  const fillAll = () => {
    const total = round2(billLike.reduce((s, b) => s + billBalance(b), 0));
    setAmount(String(total));
    const next: Record<string, string> = {};
    for (const b of billLike) next[b.id] = String(billBalance(b));
    setAlloc(next);
  };

  const submit = async () => {
    const vendor = vendors.find((v) => v.id === vendorId);
    if (!vendor) {
      toast.error("Select a vendor");
      return;
    }
    const problems = validatePayment({
      amount: amountNumber,
      method,
      accountId: method === "Cheque" ? "cheque" : accountId,
      allocations: billLike.map((b) => ({
        billId: b.id,
        amount: Number(alloc[b.id]) || 0,
        balance: billBalance(b),
      })),
    });
    if (problems.length > 0) {
      toast.error(problems[0]);
      return;
    }

    setSaving(true);
    try {
      await recordPaymentOut({
        vendorId,
        vendorName: vendor.name,
        paymentDate,
        amount: amountNumber,
        method,
        accountId: method === "Cheque" ? null : accountId || null,
        referenceNumber: reference.trim() || null,
        notes: notes.trim() || null,
        chequeNumber: chequeNumber.trim() || null,
        chequeDate,
        allocations: billLike
          .map((b) => ({
            purchaseBillId: b.id,
            billNumber: b.bill_number,
            amount: round2(Number(alloc[b.id]) || 0),
          }))
          .filter((a) => a.amount > 0),
      });
      queryClient.invalidateQueries();
      toast.success("Payment recorded");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record the payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record Payment Out</DialogTitle>
          <DialogDescription>Pay a vendor and settle open purchase bills.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="po-vendor">Vendor</Label>
              <Select
                value={vendorId}
                onValueChange={(v) => {
                  setVendorId(v);
                  setAlloc({});
                }}
              >
                <SelectTrigger id="po-vendor" className="h-11">
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-date">Payment Date</Label>
              <Input
                id="po-date"
                type="date"
                className="h-11"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-amount">Amount</Label>
              <Input
                id="po-amount"
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
              <Label htmlFor="po-method">Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentOutMethod)}>
                <SelectTrigger id="po-method" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_OUT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {method !== "Cheque" ? (
              <div className="space-y-2">
                <Label htmlFor="po-account">Paid From</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="po-account" className="h-11">
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
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="po-cheque">Cheque Number</Label>
                  <Input
                    id="po-cheque"
                    className="h-11"
                    value={chequeNumber}
                    onChange={(e) => setChequeNumber(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="po-cheque-date">Cheque Date</Label>
                  <Input
                    id="po-cheque-date"
                    type="date"
                    className="h-11"
                    value={chequeDate}
                    onChange={(e) => setChequeDate(e.target.value)}
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="po-ref">Reference #</Label>
              <Input
                id="po-ref"
                className="h-11"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="po-notes">Notes</Label>
            <Textarea
              id="po-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {vendorId && (
            <div className="rounded-xl border border-border p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Open purchase bills</p>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={autoAllocate}>
                    Auto-allocate
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={fillAll}>
                    Pay all
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setAlloc({})}>
                    Clear
                  </Button>
                </div>
              </div>

              {openBills.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No open bills for this vendor.
                </p>
              ) : (
                <ul className="space-y-3">
                  {billLike.map((b) => {
                    const balance = billBalance(b);
                    const applied = Number(alloc[b.id]) || 0;
                    return (
                      <li key={b.id} className="grid gap-2 sm:grid-cols-[1fr_10rem] sm:items-center">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{b.bill_number ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(b.bill_date)} · Total {formatMoney(b.total_amount)} · Due{" "}
                            {formatMoney(balance)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            After this payment: {formatMoney(Math.max(balance - applied, 0))}
                          </p>
                        </div>
                        <Input
                          type="number"
                          min="0"
                          max={balance}
                          step="0.01"
                          className="h-10"
                          value={alloc[b.id] ?? ""}
                          placeholder="0.00"
                          onChange={(e) =>
                            setAlloc((prev) => ({ ...prev, [b.id]: e.target.value }))
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm">
                <span className="text-muted-foreground">Allocated</span>
                <span className="numeric font-semibold">
                  {formatMoney(allocated)}{" "}
                  <span
                    className={
                      Math.abs(unallocated) < 0.005 ? "text-muted-foreground" : "text-destructive"
                    }
                  >
                    ({formatMoney(unallocated)} left)
                  </span>
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Record Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
