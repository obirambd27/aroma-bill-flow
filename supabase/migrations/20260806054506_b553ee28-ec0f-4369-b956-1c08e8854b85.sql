
-- 1. Settings: drop zoho fields
ALTER TABLE public.settings
  DROP COLUMN IF EXISTS zoho_org_id,
  DROP COLUMN IF EXISTS zoho_client_id,
  DROP COLUMN IF EXISTS zoho_client_secret,
  DROP COLUMN IF EXISTS zoho_refresh_token,
  DROP COLUMN IF EXISTS zoho_connection_status,
  DROP COLUMN IF EXISTS last_synced_at;

-- 2. Products
ALTER TABLE public.products
  DROP COLUMN IF EXISTS zoho_item_id,
  DROP COLUMN IF EXISTS last_synced_at,
  DROP COLUMN IF EXISTS stock_on_hand;

-- 3. Customers
ALTER TABLE public.customers DROP COLUMN IF EXISTS zoho_contact_id;

-- 4. Bills
ALTER TABLE public.bills
  DROP COLUMN IF EXISTS zoho_adjustment_id,
  DROP COLUMN IF EXISTS zoho_sync_status;

-- 5. Warehouses
ALTER TABLE public.warehouses
  DROP COLUMN IF EXISTS zoho_location_id,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

UPDATE public.warehouses SET is_default = true
WHERE id = (SELECT id FROM public.warehouses WHERE is_active ORDER BY sort_order LIMIT 1);

-- 6. product_stock unique constraint
ALTER TABLE public.product_stock
  DROP CONSTRAINT IF EXISTS product_stock_product_warehouse_key;
ALTER TABLE public.product_stock
  ADD CONSTRAINT product_stock_product_warehouse_key UNIQUE (product_id, warehouse_id);

-- 7. stock_movements
CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  movement_type text NOT NULL,
  quantity_change numeric NOT NULL DEFAULT 0,
  related_bill_id uuid REFERENCES public.bills(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage stock movements" ON public.stock_movements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_stock_movements_product ON public.stock_movements(product_id);
CREATE INDEX idx_stock_movements_bill ON public.stock_movements(related_bill_id);

-- 8. stock_transfers
CREATE TABLE public.stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  from_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  to_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_transfers TO authenticated;
GRANT ALL ON public.stock_transfers TO service_role;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage stock transfers" ON public.stock_transfers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
