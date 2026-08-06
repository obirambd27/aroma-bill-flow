CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  account_type text NOT NULL DEFAULT 'Bank',
  bank_name text,
  account_number text,
  opening_balance numeric NOT NULL DEFAULT 0,
  current_balance numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage accounts" ON public.accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER accounts_updated_at BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  entry_type text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  related_bill_id uuid REFERENCES public.bills(id) ON DELETE SET NULL,
  related_purchase_id uuid,
  related_expense_id uuid,
  related_payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_entries TO authenticated;
GRANT ALL ON public.ledger_entries TO service_role;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage ledger entries" ON public.ledger_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX ledger_entries_account_date_idx ON public.ledger_entries (account_id, entry_date, created_at);

CREATE OR REPLACE FUNCTION public.apply_ledger_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.accounts SET current_balance = current_balance + NEW.amount WHERE id = NEW.account_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.accounts SET current_balance = current_balance - OLD.amount WHERE id = OLD.account_id;
    RETURN OLD;
  ELSE
    UPDATE public.accounts SET current_balance = current_balance - OLD.amount WHERE id = OLD.account_id;
    UPDATE public.accounts SET current_balance = current_balance + NEW.amount WHERE id = NEW.account_id;
    RETURN NEW;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.apply_ledger_balance() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER ledger_entries_balance
AFTER INSERT OR UPDATE OR DELETE ON public.ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.apply_ledger_balance();

CREATE TABLE public.cheques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cheque_number text NOT NULL,
  type text NOT NULL DEFAULT 'Received',
  party_name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  cheque_date date NOT NULL DEFAULT CURRENT_DATE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'Pending',
  related_bill_id uuid REFERENCES public.bills(id) ON DELETE SET NULL,
  related_purchase_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cheques TO authenticated;
GRANT ALL ON public.cheques TO service_role;
ALTER TABLE public.cheques ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage cheques" ON public.cheques FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER cheques_updated_at BEFORE UPDATE ON public.cheques FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.fund_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  to_account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  amount numeric NOT NULL DEFAULT 0,
  transfer_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fund_transfers TO authenticated;
GRANT ALL ON public.fund_transfers TO service_role;
ALTER TABLE public.fund_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage fund transfers" ON public.fund_transfers FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.accounts (name, account_type, is_system) VALUES
  ('Cash in Hand', 'Cash', true),
  ('Sales Revenue', 'Income', true),
  ('Cost of Goods Sold', 'Expense', true),
  ('Accounts Receivable', 'Accounts Receivable', true),
  ('Accounts Payable', 'Accounts Payable', true);