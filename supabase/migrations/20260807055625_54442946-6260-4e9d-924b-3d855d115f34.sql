
-- PAYMENTS MADE
CREATE TABLE public.payments_made (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'Cash',
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  reference_number text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments_made TO authenticated;
GRANT ALL ON public.payments_made TO service_role;
ALTER TABLE public.payments_made ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage payments made" ON public.payments_made FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.payment_made_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments_made(id) ON DELETE CASCADE,
  purchase_bill_id uuid NOT NULL REFERENCES public.purchase_bills(id) ON DELETE CASCADE,
  amount_allocated numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_made_allocations TO authenticated;
GRANT ALL ON public.payment_made_allocations TO service_role;
ALTER TABLE public.payment_made_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage payment made allocations" ON public.payment_made_allocations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- PURCHASE RETURNS
CREATE SEQUENCE IF NOT EXISTS public.purchase_return_number_seq START 1;

CREATE TABLE public.purchase_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number text UNIQUE,
  purchase_bill_id uuid REFERENCES public.purchase_bills(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  return_date date NOT NULL DEFAULT CURRENT_DATE,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  reason text,
  notes text,
  subtotal numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Completed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_returns TO authenticated;
GRANT ALL ON public.purchase_returns TO service_role;
ALTER TABLE public.purchase_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage purchase returns" ON public.purchase_returns FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_purchase_return_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.return_number IS NULL OR NEW.return_number = '' THEN
    NEW.return_number := 'PR-' || lpad(nextval('public.purchase_return_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER purchase_returns_set_number BEFORE INSERT ON public.purchase_returns
FOR EACH ROW EXECUTE FUNCTION public.set_purchase_return_number();
CREATE TRIGGER purchase_returns_updated_at BEFORE UPDATE ON public.purchase_returns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.purchase_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_return_id uuid NOT NULL REFERENCES public.purchase_returns(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  purchase_bill_item_id uuid REFERENCES public.purchase_bill_items(id) ON DELETE SET NULL,
  product_name_snapshot text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_return_items TO authenticated;
GRANT ALL ON public.purchase_return_items TO service_role;
ALTER TABLE public.purchase_return_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage purchase return items" ON public.purchase_return_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.ledger_entries ADD COLUMN IF NOT EXISTS related_return_id uuid;

-- EXPENSES
CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage expense categories" ON public.expense_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.expense_categories (name) VALUES
  ('Rent'), ('Salaries'), ('Utilities'), ('Marketing'), ('Packaging'), ('Transport');

CREATE SEQUENCE IF NOT EXISTS public.expense_number_seq START 1;

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_number text UNIQUE,
  category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'Cash',
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  vendor_name text,
  description text,
  attachment_url text,
  is_recurring boolean NOT NULL DEFAULT false,
  recurrence_frequency text,
  next_recurrence_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage expenses" ON public.expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_expense_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.expense_number IS NULL OR NEW.expense_number = '' THEN
    NEW.expense_number := 'EXP-' || lpad(nextval('public.expense_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER expenses_set_number BEFORE INSERT ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.set_expense_number();
CREATE TRIGGER expenses_updated_at BEFORE UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
