CREATE SEQUENCE IF NOT EXISTS public.sales_order_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.delivery_note_number_seq START 1;

CREATE TABLE public.sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE,
  customer_id uuid REFERENCES public.customers(id),
  is_walk_in boolean NOT NULL DEFAULT false,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  warehouse_id uuid REFERENCES public.warehouses(id),
  is_taxed boolean NOT NULL DEFAULT false,
  tax_rate numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  discount_type text NOT NULL DEFAULT 'amount',
  discount_value numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Open',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_orders TO authenticated;
GRANT ALL ON public.sales_orders TO service_role;
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage sales orders" ON public.sales_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.sales_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  product_name_snapshot text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  quantity_delivered numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  warehouse_id uuid REFERENCES public.warehouses(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_order_items TO authenticated;
GRANT ALL ON public.sales_order_items TO service_role;
ALTER TABLE public.sales_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage sales order items" ON public.sales_order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.delivery_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_number text UNIQUE,
  sales_order_id uuid REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id),
  delivery_date date NOT NULL DEFAULT CURRENT_DATE,
  warehouse_id uuid REFERENCES public.warehouses(id),
  status text NOT NULL DEFAULT 'Dispatched',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_notes TO authenticated;
GRANT ALL ON public.delivery_notes TO service_role;
ALTER TABLE public.delivery_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage delivery notes" ON public.delivery_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.delivery_note_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_id uuid NOT NULL REFERENCES public.delivery_notes(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  product_name_snapshot text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_note_items TO authenticated;
GRANT ALL ON public.delivery_note_items TO service_role;
ALTER TABLE public.delivery_note_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage delivery note items" ON public.delivery_note_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_sales_order_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := 'SO-' || lpad(nextval('public.sales_order_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_delivery_note_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.delivery_number IS NULL OR NEW.delivery_number = '' THEN
    NEW.delivery_number := 'DN-' || lpad(nextval('public.delivery_note_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_sales_order_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_delivery_note_number() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER sales_orders_set_number BEFORE INSERT ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.set_sales_order_number();
CREATE TRIGGER delivery_notes_set_number BEFORE INSERT ON public.delivery_notes
FOR EACH ROW EXECUTE FUNCTION public.set_delivery_note_number();
CREATE TRIGGER sales_orders_updated_at BEFORE UPDATE ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER delivery_notes_updated_at BEFORE UPDATE ON public.delivery_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();