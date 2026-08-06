import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCustomers } from "@/lib/data";
import { useAccounts } from "@/lib/accounting";
import {
  PAYMENT_METHODS,
  recordPayment,
  useCustomerOpenBills,
  type PaymentMethod,
} from "@/lib/payments";
import { formatDate, formatMoney } from "@/lib/format";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  defaultCustomerId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCustomerId?: string;
}) {
  const queryClient = useQueryClient();
  const { data: customers = [] } = useCustomers();
  const { data: accounts = [] } = useAccounts(true);
  const cashBankAccounts = accounts.filter(
    (a) => a.account_type === "Cash" || a.account_type === "Bank",
  );

  const [customerId, setCustomerId] = useState<string>(defaultCustomerId ?? "");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [amountInput, setAmountInput] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [accountId, setAccountId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDate, setChequeDate] = useState(todayISO());
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: openBills = [] } = useCustomerOpenBills(customerId || null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!accountId && cashBankAccounts.length > 0) setAccountId(cashBankAccounts[0]!.id);
  }, [accountId, cashBankAccounts]);

  useEffect(() => {
    if (open) {
      setCustomerId(defaultCustomerId ?? "");
      setAmountInput("");
      setAlloc({});
      setReference("");
      setNotes("");
      setMethod("Cash");
      setPaymentDate(todayISO());
    }
  }, [open, defaultCustomerId]);

  const amount = Math.max(Number(amountInput) || 0, 0);
  const customer = customers.find((c) => c.id === customerId) ?? null;

  const balanceOf = (bill: { total_amount: number; amount_paid: number }) =>
    Number(bill.total_amount) - Number(bill.amount_paid);

  const totalOpen = openBills.reduce((s, b) => s + balanceOf(b), 0);

  // Auto-suggest oldest-bill-first allocation whenever amount or customer changes.
  useEffect(() => {
    if (openBills.length === 0 || amount <= 0) {
      setAlloc({});
      return;
    }
    let left = amount;
    const next: Record<string, string> = {};
    for (const b of openBills) {
      const take = Math.min(left, balanceOf(b));
      if (take > 0) next[b.id] = String(Number(take.toFixed(2)));
      left -= take;
      if (left <= 0) break;
    }
    setAlloc(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, customerId, openBills.length]);

  const allocatedTotal = useMemo(
    () => Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0),
    [alloc],
  );
  const unallocated = Number((amount - allocatedTotal).toFixed(2));

  const customerResults = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    const list = q
      ? customers.filter(
          (c) => c.name.toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q),
        )
      : customers;
    return list.slice(0, 20);
  }, [customers, debounced]);

  const submit = async () => {
    if (!customerId) {
      toast.error("Select a customer");
      return;
    }
    if (amount <= 0) {
      toast.error("Enter a payment amount");
      return;
    }
    if (method !== "Cheque" && !accountId) {
      toast.error("Select an account");
      return;
    }
    if (Math.abs(unallocated) > 0.01) {
      toast.error("Allocated amounts must add up to the payment amount");
      return;
    }
    for (const b of openBills) {
      const v = Number(alloc[b.id] ?? 0);
      if (v > balanceOf(b) + 0.01) {
        toast.error(`Allocation exceeds the balance on ${b.bill_number ?? "a bill"}`);
        return;
      }
    }

    setSaving(true);
    try {
      await recordPayment({
        customerId,
        customerName: customer?.name ?? "Customer",
        paymentDate,
        amount,
        method,
        accountId: accountId || null,
        referenceNumber: reference.trim() || null,
        notes: notes.trim() || null,
        chequeNumber: chequeNumber.trim() || null,
        chequeDate,
        allocations: openBills
          .map((b) => ({
            billId: b.id,
            billNumber: b.bill_number,
            amount: Number(alloc[b.id] ?? 0),
          }))
          .filter((a) => a.amount > 0),
      });
      queryClient.invalidateQueries();
      toast.success("Payment recorded");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record the payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Apply a payment received against one or more outstanding bills.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pay-customer">Customer</Label>
            <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="pay-customer"
                  type="button"
                  variant="outline"
                  className="h-11 w-full justify-between font-normal"
                >
                  <span className="truncate">{customer?.name ?? "Select customer"}</span>
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
                <div className="border-b border-border p-2">
                  <Input
                    autoFocus
                    className="h-10"
                    placeholder="Search name or phone"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <ul className="max-h-64 overflow-y-auto py-1">
                  {customerResults.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2.5 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setCustomerId(c.id);
                          setCustomerOpen(false);
                        }}
                      >
                        {c.name}
                        {c.phone ? (
                          <span className="ml-2 text-xs text-muted-foreground">{c.phone}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                  {customerResults.length === 0 && (
                    <li className="px-3 py-3 text-sm text-muted-foreground">No customers found.</li>
                  )}
                </ul>
              </PopoverContent>
            </Popover>
          </div>

          {customerId && (
            <div className="rounded-xl border border-border p-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">Open bills</span>
                <span className="numeric text-muted-foreground">
                  Total due {formatMoney(totalOpen)}
                </span>
              </div>
              {openBills.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">
                  This customer has no outstanding bills.
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {openBills.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{b.bill_number ?? "Bill"}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(b.bill_date)} · Total {formatMoney(b.total_amount)} · Paid{" "}
                          {formatMoney(b.amount_paid)}
                        </p>
                      </div>
                      <div className="numeric text-right text-sm">
                        <p className="text-xs text-muted-foreground">Balance</p>
                        <p className="font-semibold">{formatMoney(balanceOf(b))}</p>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        aria-label={`Amount applied to ${b.bill_number ?? "bill"}`}
                        className="numeric h-10 w-28"
                        value={alloc[b.id] ?? ""}
                        onChange={(e) =>
                          setAlloc((prev) => ({ ...prev, [b.id]: e.target.value }))
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
              {amount > 0 && Math.abs(unallocated) > 0.01 && (
                <p className="mt-2 text-xs text-destructive">
                  {unallocated > 0
                    ? `${formatMoney(unallocated)} still unallocated`
                    : `Over-allocated by ${formatMoney(Math.abs(unallocated))}`}
                </p>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pay-amount">Amount</Label>
              <Input
                id="pay-amount"
                type="number"
                min={0}
                step="0.01"
                className="numeric h-11"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-date">Date</Label>
              <Input
                id="pay-date"
                type="date"
                className="h-11"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-method">Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger id="pay-method" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-account">
                {method === "Cheque" ? "Cheque deposit account" : "Account"}
              </Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="pay-account" className="h-11">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {cashBankAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {method === "Cheque" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="pay-cheque-number">Cheque number</Label>
                  <Input
                    id="pay-cheque-number"
                    className="h-11"
                    value={chequeNumber}
                    onChange={(e) => setChequeNumber(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pay-cheque-date">Cheque date</Label>
                  <Input
                    id="pay-cheque-date"
                    type="date"
                    className="h-11"
                    value={chequeDate}
                    onChange={(e) => setChequeDate(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="pay-ref">Reference number</Label>
              <Input
                id="pay-ref"
                className="h-11"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="pay-notes">Notes</Label>
              <Textarea
                id="pay-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {method === "Cheque" && (
            <p className="text-xs text-muted-foreground">
              Cheque payments are logged as Pending and only move money once cleared.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
