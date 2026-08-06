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
import {
  allocateOldestFirst,
  billBalance,
  round2,
  validatePayment,
} from "@/lib/payment-math";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  defaultCustomerId,
  defaultBillId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCustomerId?: string;
  defaultBillId?: string;
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

  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (open) {
      setCustomerId(defaultCustomerId ?? "");
      setAmountInput("");
      setAlloc({});
      setReference("");
      setNotes("");
      setMethod("Cash");
      setPaymentDate(todayISO());
      setPrefilled(false);
    }
  }, [open, defaultCustomerId]);

  const amount = Math.max(Number(amountInput) || 0, 0);
  const customer = customers.find((c) => c.id === customerId) ?? null;

  const balanceOf = (bill: { total_amount: number; amount_paid: number }) =>
    billBalance(bill as never);

  const totalOpen = openBills.reduce((s, b) => s + balanceOf(b), 0);

  // Opened from a specific bill: default the amount to that bill's balance.
  useEffect(() => {
    if (!open || prefilled || !defaultBillId) return;
    const target = openBills.find((b) => b.id === defaultBillId);
    if (!target) return;
    setAmountInput(String(Number(balanceOf(target).toFixed(2))));
    setPrefilled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefilled, defaultBillId, openBills.length]);

  const autoAllocate = (value: number) => {
    if (openBills.length === 0 || value <= 0) return {};
    const next: Record<string, string> = {};
    for (const a of allocateOldestFirst(openBills as never, value, defaultBillId ?? null)) {
      next[a.billId] = String(a.amount);
    }
    return next;
  };

  // Auto-suggest allocation: the originating bill first, then oldest-first.
  useEffect(() => {
    setAlloc(autoAllocate(amount));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, customerId, openBills.length, defaultBillId]);

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

  const allocationsPayload = openBills
    .map((b) => ({
      billId: b.id,
      billNumber: b.bill_number,
      amount: round2(Number(alloc[b.id] ?? 0) || 0),
    }))
    .filter((a) => a.amount > 0);

  const errors = validatePayment({
    customerId,
    amount,
    method,
    accountId: method === "Cheque" ? "cheque" : accountId || null,
    paymentDate,
    chequeNumber: method === "Cheque" ? chequeNumber : "n/a",
    allocations: allocationsPayload.map((a) => ({ billId: a.billId, amount: a.amount })),
    bills: openBills as never,
  });

  const submit = async () => {
    if (errors.length > 0) {
      toast.error(errors[0]!);
      return;
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
        allocations: allocationsPayload,
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
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium">Open bills</span>
                <div className="flex items-center gap-2">
                  <span className="numeric text-muted-foreground">
                    Total due {formatMoney(totalOpen)}
                  </span>
                  {openBills.length > 0 && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setAlloc(autoAllocate(amount))}
                        disabled={amount <= 0}
                      >
                        Auto-allocate
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setAlloc({})}
                      >
                        Clear
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {amount > 0 && (
                <div className="mb-3 space-y-1.5">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={
                        unallocated < -0.01
                          ? "h-full bg-destructive transition-all"
                          : "h-full bg-primary transition-all"
                      }
                      style={{
                        width: `${Math.min((allocatedTotal / amount) * 100, 100).toFixed(1)}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="numeric">Allocated {formatMoney(allocatedTotal)}</span>
                    <span
                      className={
                        Math.abs(unallocated) > 0.01
                          ? "numeric font-medium text-destructive"
                          : "numeric font-medium text-success"
                      }
                    >
                      {Math.abs(unallocated) <= 0.01
                        ? "Fully allocated"
                        : unallocated > 0
                          ? `${formatMoney(unallocated)} left to apply`
                          : `Over by ${formatMoney(Math.abs(unallocated))}`}
                    </span>
                  </div>
                </div>
              )}

              {openBills.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">
                  This customer has no outstanding bills.
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {openBills.map((b) => {
                    const applied = Number(alloc[b.id] ?? 0) || 0;
                    const remaining = round2(balanceOf(b) - applied);
                    return (
                      <li key={b.id} className="flex flex-wrap items-center gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {b.bill_number ?? "Bill"}
                            {b.id === defaultBillId && (
                              <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                                This bill
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(b.bill_date)} · Total {formatMoney(b.total_amount)} · Paid{" "}
                            {formatMoney(b.amount_paid)}
                          </p>
                          {applied > 0 && (
                            <p className="numeric text-xs text-muted-foreground">
                              After this payment:{" "}
                              <span
                                className={
                                  remaining <= 0.01 ? "text-success" : "text-foreground"
                                }
                              >
                                {formatMoney(Math.max(remaining, 0))} due
                              </span>
                            </p>
                          )}
                        </div>
                        <div className="numeric text-right text-sm">
                          <p className="text-xs text-muted-foreground">Balance</p>
                          <p className="font-semibold">{formatMoney(balanceOf(b))}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            max={balanceOf(b)}
                            aria-label={`Amount applied to ${b.bill_number ?? "bill"}`}
                            className="numeric h-10 w-28"
                            value={alloc[b.id] ?? ""}
                            onChange={(e) =>
                              setAlloc((prev) => ({ ...prev, [b.id]: e.target.value }))
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() =>
                              setAlloc((prev) => ({
                                ...prev,
                                [b.id]: String(balanceOf(b)),
                              }))
                            }
                          >
                            Full
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {errors.length > 0 && amount > 0 && (
                <ul className="mt-3 space-y-1">
                  {errors.map((e) => (
                    <li key={e} className="text-xs text-destructive">
                      {e}
                    </li>
                  ))}
                </ul>
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
          <Button onClick={submit} disabled={saving || errors.length > 0}>
            {saving ? "Saving…" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
