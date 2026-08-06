
CREATE SEQUENCE IF NOT EXISTS public.sales_return_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.credit_note_number_seq;

CREATE TABLE public.sales_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number text UNIQUE,
  bill_id uuid REFERENCES public.bills(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  return_date date NOT NULL DEFAULT CURRENT_DATE,
  warehouse_id uuid REFERENCES public.warehouses(id),
  reason text,
  notes text,
  subtotal numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Completed',
  credit_note_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sales_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_return_id uuid NOT NULL REFERENCES public.sales_returns(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  bill_item_id uuid REFERENCES public.bill_items(id) ON DELETE SET NULL,
  product_name_snapshot text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0
);

CREATE TABLE public.credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_number text UNIQUE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  sales_return_id uuid REFERENCES public.sales_returns(id) ON DELETE SET NULL,
  credit_note_date date NOT NULL DEFAULT CURRENT_DATE,
  reason text,
  subtotal numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  amount_applied numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_returns
  ADD CONSTRAINT sales_returns_credit_note_id_fkey
  FOREIGN KEY (credit_note_id) REFERENCES public.credit_notes(id) ON DELETE SET NULL;

CREATE TABLE public.credit_note_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id uuid NOT NULL REFERENCES public.credit_notes(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric,
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0
);

CREATE TABLE public.credit_note_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id uuid NOT NULL REFERENCES public.credit_notes(id) ON DELETE CASCADE,
  bill_id uuid NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  amount_applied numeric NOT NULL DEFAULT 0,
  applied_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_returns TO authenticated;
GRANT ALL ON public.sales_returns TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_return_items TO authenticated;
GRANT ALL ON public.sales_return_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_notes TO authenticated;
GRANT ALL ON public.credit_notes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_note_items TO authenticated;
GRANT ALL ON public.credit_note_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_note_applications TO authenticated;
GRANT ALL ON public.credit_note_applications TO service_role;
GRANT USAGE ON SEQUENCE public.sales_return_number_seq TO authenticated, service_role;
GRANT USAGE ON SEQUENCE public.credit_note_number_seq TO authenticated, service_role;

ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_note_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_note_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage sales returns" ON public.sales_returns FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Owner can manage sales return items" ON public.sales_return_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Owner can manage credit notes" ON public.credit_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Owner can manage credit note items" ON public.credit_note_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Owner can manage credit note applications" ON public.credit_note_applications FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_sales_return_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.return_number IS NULL OR NEW.return_number = '' THEN
    NEW.return_number := 'SR-' || lpad(nextval('public.sales_return_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_credit_note_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.credit_note_number IS NULL OR NEW.credit_note_number = '' THEN
    NEW.credit_note_number := 'CN-' || lpad(nextval('public.credit_note_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_returns_set_number BEFORE INSERT ON public.sales_returns
  FOR EACH ROW EXECUTE FUNCTION public.set_sales_return_number();
CREATE TRIGGER credit_notes_set_number BEFORE INSERT ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_credit_note_number();
CREATE TRIGGER sales_returns_updated_at BEFORE UPDATE ON public.sales_returns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER credit_notes_updated_at BEFORE UPDATE ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_sales_return_items_return ON public.sales_return_items(sales_return_id);
CREATE INDEX idx_sales_return_items_bill_item ON public.sales_return_items(bill_item_id);
CREATE INDEX idx_credit_note_items_note ON public.credit_note_items(credit_note_id);
CREATE INDEX idx_credit_note_apps_note ON public.credit_note_applications(credit_note_id);
CREATE INDEX idx_credit_note_apps_bill ON public.credit_note_applications(bill_id);
