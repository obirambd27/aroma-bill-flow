-- Warehouses
CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  zoho_location_id text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage warehouses" ON public.warehouses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Per-warehouse stock
CREATE TABLE public.product_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  stock_on_hand numeric NOT NULL DEFAULT 0,
  committed_stock numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, warehouse_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_stock TO authenticated;
GRANT ALL ON public.product_stock TO service_role;
ALTER TABLE public.product_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage product stock" ON public.product_stock FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Payments
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id uuid REFERENCES public.bills(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL DEFAULT 0,
  payment_method text,
  status text NOT NULL DEFAULT 'Completed',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage payments" ON public.payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX payments_customer_idx ON public.payments(customer_id);
CREATE INDEX payments_bill_idx ON public.payments(bill_id);

-- Extra columns
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'amount';
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS discount_value numeric NOT NULL DEFAULT 0;
ALTER TABLE public.bill_items ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER product_stock_updated_at BEFORE UPDATE ON public.product_stock
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed warehouses
INSERT INTO public.warehouses (name, sort_order) VALUES
  ('Head Office', 1),
  ('Gym Building Warehouse', 2),
  ('Deira Small Warehouse', 3),
  ('Umm Al Quwain Warehouse', 4),
  ('AAP Khan Warehouse', 5);

-- Seed per-warehouse stock from existing product totals
INSERT INTO public.product_stock (product_id, warehouse_id, stock_on_hand, committed_stock)
SELECT p.id, w.id,
  CASE w.sort_order
    WHEN 1 THEN ceil(p.stock_on_hand * 0.4)
    WHEN 2 THEN floor(p.stock_on_hand * 0.25)
    WHEN 3 THEN floor(p.stock_on_hand * 0.15)
    WHEN 4 THEN floor(p.stock_on_hand * 0.12)
    ELSE floor(p.stock_on_hand * 0.08)
  END,
  CASE WHEN w.sort_order = 1 THEN floor(p.stock_on_hand * 0.05) ELSE 0 END
FROM public.products p CROSS JOIN public.warehouses w;