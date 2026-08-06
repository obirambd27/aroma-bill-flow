CREATE TABLE public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  address text,
  notes text,
  total_purchased numeric NOT NULL DEFAULT 0,
  total_outstanding numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT ALL ON public.vendors TO service_role;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage vendors" ON public.vendors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER vendors_updated_at BEFORE UPDATE ON public.vendors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE SEQUENCE public.purchase_order_number_seq START 1;
CREATE SEQUENCE public.purchase_bill_number_seq START 1;

CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE,
  vendor_id uuid REFERENCES public.vendors(id),
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  warehouse_id uuid REFERENCES public.warehouses(id),
  subtotal numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Open',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage purchase orders" ON public.purchase_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_purchase_order_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := 'PO-' || lpad(nextval('public.purchase_order_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER purchase_orders_set_number BEFORE INSERT ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.set_purchase_order_number();
CREATE TRIGGER purchase_orders_updated_at BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  product_name_snapshot text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  quantity_received numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_order_items TO service_role;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage purchase order items" ON public.purchase_order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_po_items_order ON public.purchase_order_items(purchase_order_id);

CREATE TABLE public.purchase_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_number text UNIQUE,
  purchase_order_id uuid REFERENCES public.purchase_orders(id),
  vendor_id uuid REFERENCES public.vendors(id),
  bill_date date NOT NULL DEFAULT CURRENT_DATE,
  warehouse_id uuid REFERENCES public.warehouses(id),
  subtotal numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'Unpaid',
  status text NOT NULL DEFAULT 'Finalized',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_bills TO authenticated;
GRANT ALL ON public.purchase_bills TO service_role;
ALTER TABLE public.purchase_bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage purchase bills" ON public.purchase_bills FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_purchase_bill_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.bill_number IS NULL OR NEW.bill_number = '' THEN
    NEW.bill_number := 'PB-' || lpad(nextval('public.purchase_bill_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER purchase_bills_set_number BEFORE INSERT ON public.purchase_bills FOR EACH ROW EXECUTE FUNCTION public.set_purchase_bill_number();
CREATE TRIGGER purchase_bills_updated_at BEFORE UPDATE ON public.purchase_bills FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.purchase_bill_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_bill_id uuid NOT NULL REFERENCES public.purchase_bills(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  product_name_snapshot text NOT NULL,
  warehouse_id uuid REFERENCES public.warehouses(id),
  quantity numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_bill_items TO authenticated;
GRANT ALL ON public.purchase_bill_items TO service_role;
ALTER TABLE public.purchase_bill_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage purchase bill items" ON public.purchase_bill_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_pb_items_bill ON public.purchase_bill_items(purchase_bill_id);

ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_purchase_fk FOREIGN KEY (related_purchase_id) REFERENCES public.purchase_bills(id) ON DELETE SET NULL;
ALTER TABLE public.ledger_entries ADD CONSTRAINT ledger_entries_purchase_fk FOREIGN KEY (related_purchase_id) REFERENCES public.purchase_bills(id) ON DELETE SET NULL;
ALTER TABLE public.cheques ADD CONSTRAINT cheques_purchase_fk FOREIGN KEY (related_purchase_id) REFERENCES public.purchase_bills(id) ON DELETE SET NULL;