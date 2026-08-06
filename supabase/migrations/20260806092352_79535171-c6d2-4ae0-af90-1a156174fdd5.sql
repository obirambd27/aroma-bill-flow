ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'pcs',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS cost_price numeric,
  ADD COLUMN IF NOT EXISTS additional_images text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS low_stock_threshold numeric,
  ADD COLUMN IF NOT EXISTS opening_stock_note numeric;

UPDATE public.products SET sku = 'SKU-' || substr(id::text, 1, 8) WHERE sku IS NULL OR sku = '';

CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique ON public.products (sku);

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS related_purchase_id uuid;
