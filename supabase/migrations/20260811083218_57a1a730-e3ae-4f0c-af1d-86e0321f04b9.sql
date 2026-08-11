CREATE TABLE public.price_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  client_name text,
  share_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(12), 'hex'),
  is_share_enabled boolean NOT NULL DEFAULT false,
  default_min_quantity numeric,
  below_min_increase_percent numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_lists TO authenticated;
GRANT SELECT ON public.price_lists TO anon;
GRANT ALL ON public.price_lists TO service_role;

ALTER TABLE public.price_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users manage price lists"
  ON public.price_lists FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can view shared price lists"
  ON public.price_lists FOR SELECT TO anon
  USING (is_share_enabled = true);

CREATE TABLE public.price_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id uuid NOT NULL REFERENCES public.price_lists(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  custom_price numeric,
  is_included boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (price_list_id, product_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_list_items TO authenticated;
GRANT SELECT ON public.price_list_items TO anon;
GRANT ALL ON public.price_list_items TO service_role;

ALTER TABLE public.price_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users manage price list items"
  ON public.price_list_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can view items of shared price lists"
  ON public.price_list_items FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.price_lists pl
    WHERE pl.id = price_list_items.price_list_id AND pl.is_share_enabled = true
  ));

CREATE INDEX idx_price_list_items_list ON public.price_list_items(price_list_id);

CREATE TRIGGER update_price_lists_updated_at
  BEFORE UPDATE ON public.price_lists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_price_list_items_updated_at
  BEFORE UPDATE ON public.price_list_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();