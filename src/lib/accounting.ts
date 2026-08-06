import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Account = Tables<"accounts">;
export type LedgerEntry = Tables<"ledger_entries">;
export type Cheque = Tables<"cheques">;
export type FundTransfer = Tables<"fund_transfers">;

export const ACCOUNT_TYPES = [
  "Bank",
  "Cash",
  "Income",
  "Expense",
  "Accounts Receivable",
  "Accounts Payable",
  "Asset",
  "Equity",
] as const;

export const ENTRY_TYPES = [
  "Sale",
  "Sale Payment",
  "Sale Return",
  "Purchase",
  "Purchase Payment",
  "Purchase Return",
  "Expense",
  "Transfer In",
  "Transfer Out",
  "Opening Balance",
  "Manual Adjustment",
] as const;

export type EntryType = (typeof ENTRY_TYPES)[number];

/** Insert a ledger entry. Account balances update automatically via DB trigger. */
export async function postLedgerEntry(entry: {
  account_id: string;
  entry_date: string;
  entry_type: EntryType;
  amount: number;
  description?: string | null;
  related_bill_id?: string | null;
  related_purchase_id?: string | null;
  related_expense_id?: string | null;
  related_payment_id?: string | null;
}) {
  const { error } = await supabase.from("ledger_entries").insert(entry);
  if (error) throw error;
}

export const ACCOUNTING_KEYS = ["accounts", "ledger", "cheques", "fund_transfers"];

export function useAccounts(activeOnly = false) {
  return useQuery({
    queryKey: ["accounts", activeOnly],
    queryFn: async () => {
      let q = supabase.from("accounts").select("*").order("account_type").order("name");
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data as Account[];
    },
  });
}

export function useAccount(accountId: string) {
  return useQuery({
    queryKey: ["account", accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("id", accountId)
        .maybeSingle();
      if (error) throw error;
      return data as Account | null;
    },
  });
}

export function useLedgerEntries(accountId: string) {
  return useQuery({
    queryKey: ["ledger", accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ledger_entries")
        .select("*")
        .eq("account_id", accountId)
        .order("entry_date", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as LedgerEntry[];
    },
  });
}

/** Count of ledger rows per account — used to block deleting used accounts. */
export function useLedgerCounts() {
  return useQuery({
    queryKey: ["ledger-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ledger_entries").select("account_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) counts[row.account_id] = (counts[row.account_id] ?? 0) + 1;
      return counts;
    },
  });
}

export function useCheques() {
  return useQuery({
    queryKey: ["cheques"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cheques")
        .select("*, accounts(name)")
        .order("cheque_date", { ascending: false });
      if (error) throw error;
      return data as (Cheque & { accounts: { name: string } | null })[];
    },
  });
}

export function maskAccountNumber(value: string | null | undefined) {
  if (!value) return "—";
  const trimmed = value.trim();
  if (trimmed.length <= 4) return `••••${trimmed}`;
  return `•••• ${trimmed.slice(-4)}`;
}
