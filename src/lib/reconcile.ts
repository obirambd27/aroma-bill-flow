/**
 * Client-side hooks around the server reconciliation helpers.
 * All money decisions happen on the server; this file only fetches and caches.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { normalizeMethod } from "@/lib/bill-payments";
import { round2 } from "@/lib/payment-math";
import {
  fixSyncIssuesFn,
  reconcileBillFn,
  scanSyncIssuesFn,
  validateBillPaymentFn,
} from "@/lib/reconcile.functions";
import type { SyncIssue } from "@/lib/reconcile.server";

export type { SyncIssue };

export function useSyncIssues() {
  const scan = useServerFn(scanSyncIssuesFn);
  return useQuery({
    queryKey: ["sync-issues"],
    queryFn: () => scan(),
    staleTime: 60_000,
  });
}

export function useFixSyncIssues() {
  const fix = useServerFn(fixSyncIssuesFn);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => fix(),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export function useReconcileBill() {
  const reconcile = useServerFn(reconcileBillFn);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (billId: string) => reconcile({ data: { billId } }),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

/** Server guard used by the billing screen before a paid invoice is written. */
export function useValidateBillPayment() {
  const validate = useServerFn(validateBillPaymentFn);
  return (input: { billId?: string | null; totalAmount: number; amountPaid: number }) =>
    validate({ data: { ...input, billId: input.billId ?? null } });
}

export type DailyReconciliation = {
  collections: { method: string; amount: number; count: number }[];
  totalCollected: number;
  cashCollected: number;
  bankCollected: number;
  cardCollected: number;
  ledgerCash: number;
  ledgerBank: number;
  billsInvoiced: number;
  billsCount: number;
  billsPaidToday: number;
  checks: { label: string; expected: number; actual: number; ok: boolean; note: string }[];
};

const METHOD_ORDER = ["Cash", "Card Payment", "Bank Transfer", "Cheque"];

/**
 * Daily cash / bank / card reconciliation: what the Payments page recorded for
 * the day versus what actually moved through the cash and bank ledgers, plus a
 * Bill History cross-check on bills dated that day.
 */
export function useDailyReconciliation(date: string) {
  return useQuery({
    queryKey: ["daily-reconciliation", date],
    queryFn: async (): Promise<DailyReconciliation> => {
      const [paymentsRes, accountsRes, ledgerRes, billsRes] = await Promise.all([
        supabase
          .from("payments_received")
          .select("id, amount, payment_method, account_id")
          .eq("payment_date", date),
        supabase.from("accounts").select("id, name, account_type"),
        supabase
          .from("ledger_entries")
          .select("account_id, amount, entry_type")
          .eq("entry_date", date),
        supabase
          .from("bills")
          .select("id, total_amount, amount_paid, status")
          .eq("bill_date", date)
          .neq("status", "Voided"),
      ]);

      const payments = paymentsRes.data ?? [];
      const accounts = accountsRes.data ?? [];
      const ledger = ledgerRes.data ?? [];
      const bills = billsRes.data ?? [];

      const byMethod = new Map<string, { amount: number; count: number }>();
      for (const p of payments) {
        const method = normalizeMethod(p.payment_method) ?? "Other";
        const prev = byMethod.get(method) ?? { amount: 0, count: 0 };
        byMethod.set(method, {
          amount: round2(prev.amount + (Number(p.amount) || 0)),
          count: prev.count + 1,
        });
      }

      const collections = Array.from(byMethod.entries())
        .map(([method, v]) => ({ method, ...v }))
        .sort((a, b) => {
          const ia = METHOD_ORDER.indexOf(a.method);
          const ib = METHOD_ORDER.indexOf(b.method);
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });

      const amountFor = (method: string) => round2(byMethod.get(method)?.amount ?? 0);
      const cashCollected = amountFor("Cash");
      const cardCollected = amountFor("Card Payment");
      const bankCollected = amountFor("Bank Transfer");
      const totalCollected = round2(collections.reduce((s, c) => s + c.amount, 0));

      const typeOf = new Map(accounts.map((a) => [a.id, a.account_type]));
      let ledgerCash = 0;
      let ledgerBank = 0;
      for (const e of ledger) {
        if (e.entry_type !== "Sale Payment") continue;
        const amount = Number(e.amount) || 0;
        if (amount <= 0) continue;
        const type = typeOf.get(e.account_id ?? "");
        if (type === "Cash") ledgerCash = round2(ledgerCash + amount);
        if (type === "Bank") ledgerBank = round2(ledgerBank + amount);
      }

      const billsInvoiced = round2(bills.reduce((s, b) => s + (Number(b.total_amount) || 0), 0));
      const billsPaidToday = round2(bills.reduce((s, b) => s + (Number(b.amount_paid) || 0), 0));

      const check = (label: string, expected: number, actual: number, note: string) => ({
        label,
        expected: round2(expected),
        actual: round2(actual),
        ok: Math.abs(round2(expected) - round2(actual)) < 0.005,
        note,
      });

      return {
        collections,
        totalCollected,
        cashCollected,
        bankCollected,
        cardCollected,
        ledgerCash,
        ledgerBank,
        billsInvoiced,
        billsCount: bills.length,
        billsPaidToday,
        checks: [
          check(
            "Cash collected vs cash ledger",
            cashCollected,
            ledgerCash,
            "Payments page cash should equal what entered your Cash in Hand account.",
          ),
          check(
            "Card + bank collected vs bank ledger",
            round2(cardCollected + bankCollected),
            ledgerBank,
            "Card and bank collections should land in your bank accounts.",
          ),
          check(
            "Bill History paid vs collections on today's bills",
            billsPaidToday,
            totalCollected,
            "Money marked paid on today's bills should match today's recorded collections (older bills settled today will differ).",
          ),
        ],
      };
    },
  });
}
