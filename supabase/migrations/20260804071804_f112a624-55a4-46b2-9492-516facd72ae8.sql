
-- SETTINGS
CREATE TABLE public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_org_id text,
  zoho_client_id text,
  zoho_client_secret text,
  zoho_refresh_token text,
  zoho_connection_status text NOT NULL DEFAULT 'not_connected',
  business_name text NOT NULL DEFAULT 'My Perfume Store',
  business_address text NOT NULL DEFAULT '',
  business_phone text NOT NULL DEFAULT '',
  business_email text NOT NULL DEFAULT '',
  business_logo_url text,
  tax_id text,
  default_tax_rate numeric NOT NULL DEFAULT 0,
  invoice_prefix text NOT NULL DEFAULT 'INV-',
  invoice_footer_note text,
  low_stock_threshold numeric NOT NULL DEFAULT 5,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage settings" ON public.settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- PRODUCTS
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_item_id text UNIQUE,
  name text NOT NULL,
  sku text,
  price numeric NOT NULL DEFAULT 0,
  stock_on_hand numeric NOT NULL DEFAULT 0,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage products" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX products_name_idx ON public.products (name);
CREATE INDEX products_sku_idx ON public.products (sku);

-- CUSTOMERS
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_contact_id text UNIQUE,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  total_spend numeric NOT NULL DEFAULT 0,
  last_purchase_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage customers" ON public.customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX customers_name_idx ON public.customers (name);

-- BILLS
CREATE SEQUENCE public.bill_number_seq START 1001;
CREATE TABLE public.bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_number text UNIQUE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  bill_date date NOT NULL DEFAULT CURRENT_DATE,
  is_taxed boolean NOT NULL DEFAULT false,
  tax_rate numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'Unpaid',
  payment_method text,
  status text NOT NULL DEFAULT 'Draft',
  zoho_sync_status text NOT NULL DEFAULT 'Not Synced',
  zoho_adjustment_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bills TO authenticated;
GRANT ALL ON public.bills TO service_role;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage bills" ON public.bills FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX bills_bill_date_idx ON public.bills (bill_date);
CREATE INDEX bills_customer_id_idx ON public.bills (customer_id);
CREATE INDEX bills_status_idx ON public.bills (status);

CREATE OR REPLACE FUNCTION public.set_bill_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix text;
BEGIN
  IF NEW.bill_number IS NULL OR NEW.bill_number = '' THEN
    SELECT COALESCE(invoice_prefix, 'INV-') INTO prefix FROM public.settings LIMIT 1;
    NEW.bill_number := COALESCE(prefix, 'INV-') || nextval('public.bill_number_seq')::text;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER bills_set_bill_number BEFORE INSERT ON public.bills
FOR EACH ROW EXECUTE FUNCTION public.set_bill_number();

-- BILL ITEMS
CREATE TABLE public.bill_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name_snapshot text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bill_items TO authenticated;
GRANT ALL ON public.bill_items TO service_role;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage bill items" ON public.bill_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX bill_items_bill_id_idx ON public.bill_items (bill_id);

-- SEED
INSERT INTO public.settings (business_name, business_address, business_phone, business_email, invoice_footer_note, default_tax_rate, low_stock_threshold)
VALUES ('Fragrance House', '12 Marina Walk, Dubai, UAE', '+971 50 123 4567', 'hello@fragrancehouse.ae', 'Thank you for shopping with us.', 5, 5);

INSERT INTO public.products (name, sku, price, stock_on_hand) VALUES
('Oud Royale 50ml', 'FH-OUD-050', 420.00, 12),
('Amber Nuit 100ml', 'FH-AMB-100', 320.00, 4),
('Rose Taif Extrait 30ml', 'FH-ROS-030', 560.00, 7),
('Musk Blanc 75ml', 'FH-MSK-075', 240.00, 0),
('Santal Vetiver 100ml', 'FH-SAN-100', 380.00, 18),
('Jasmine Noir 50ml', 'FH-JAS-050', 290.00, 3),
('Bergamot Azure 100ml', 'FH-BRG-100', 210.00, 25),
('Saffron Velvet 30ml', 'FH-SAF-030', 610.00, 9),
('Cedar Smoke 75ml', 'FH-CED-075', 350.00, 6),
('Vanilla Oud Travel Set', 'FH-SET-TRV', 180.00, 30);

INSERT INTO public.customers (name, phone, email, address) VALUES
('Aisha Rahman', '+971 55 220 1188', 'aisha.r@example.com', 'Jumeirah 1, Dubai'),
('Omar Haddad', '+971 50 771 4420', 'omar.h@example.com', 'Al Barsha, Dubai'),
('Leila Mansour', '+971 52 903 6612', 'leila.m@example.com', 'Downtown, Dubai'),
('Karim Yusuf', '+971 56 118 7734', 'karim.y@example.com', 'Deira, Dubai'),
('Noor Al Zahra', '+971 54 663 2201', 'noor.z@example.com', 'Business Bay, Dubai');
