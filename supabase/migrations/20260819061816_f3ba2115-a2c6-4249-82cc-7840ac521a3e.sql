
CREATE TABLE public.price_list_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id uuid REFERENCES public.price_lists(id) ON DELETE SET NULL,
  order_number text UNIQUE,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,
  customer_address text,
  customer_note text,
  subtotal numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  admin_adjusted_total numeric,
  was_price_increased boolean NOT NULL DEFAULT false,
  increase_percent numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'New',
  rejection_reason text,
  converted_bill_id uuid REFERENCES public.bills(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.price_list_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_order_id uuid NOT NULL REFERENCES public.price_list_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name_snapshot text NOT NULL,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  quantity numeric NOT NULL,
  base_price numeric NOT NULL,
  applied_price numeric NOT NULL,
  line_total numeric NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_list_orders TO authenticated;
GRANT ALL ON public.price_list_orders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_list_order_items TO authenticated;
GRANT ALL ON public.price_list_order_items TO service_role;

ALTER TABLE public.price_list_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_list_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users manage price list orders"
  ON public.price_list_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users manage price list order items"
  ON public.price_list_order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_price_list_order_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE next_num integer;
BEGIN
  IF NEW.order_number IS NULL THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(order_number, '\D', '', 'g'), '')::integer), 0) + 1
      INTO next_num FROM public.price_list_orders;
    NEW.order_number := 'PLO-' || LPAD(next_num::text, 4, '0');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_price_list_order_number
BEFORE INSERT ON public.price_list_orders
FOR EACH ROW EXECUTE FUNCTION public.set_price_list_order_number();

CREATE TRIGGER trg_price_list_orders_updated
BEFORE UPDATE ON public.price_list_orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Places an order atomically: validates live stock, records the order and deducts stock.
CREATE OR REPLACE FUNCTION public.submit_price_list_order(
  p_token text,
  p_name text,
  p_phone text,
  p_email text,
  p_address text,
  p_note text,
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_list public.price_lists%ROWTYPE;
  v_item jsonb;
  v_pid uuid;
  v_qty numeric;
  v_available numeric;
  v_name text;
  v_base numeric;
  v_applied numeric;
  v_multiplier numeric := 1;
  v_total_qty numeric := 0;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_increased boolean := false;
  v_order_id uuid;
  v_order_number text;
  v_wh uuid;
  v_remaining numeric;
  v_row record;
  v_take numeric;
BEGIN
  SELECT * INTO v_list FROM public.price_lists WHERE share_token = p_token;
  IF NOT FOUND OR NOT v_list.is_share_enabled THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unavailable');
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_total_qty := v_total_qty + GREATEST(0, (v_item->>'quantity')::numeric);
  END LOOP;

  IF v_list.default_min_quantity IS NOT NULL
     AND v_total_qty < v_list.default_min_quantity
     AND COALESCE(v_list.below_min_increase_percent, 0) > 0 THEN
    v_multiplier := 1 + (v_list.below_min_increase_percent / 100.0);
    v_increased := true;
  END IF;

  -- Stock validation pass (locks nothing yet; the whole function is one transaction).
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    IF v_qty <= 0 THEN CONTINUE; END IF;
    SELECT p.name INTO v_name FROM public.products p WHERE p.id = v_pid AND p.is_active;
    IF v_name IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'stock', 'product_id', v_pid,
        'name', 'This product', 'available', 0);
    END IF;
    SELECT COALESCE(SUM(GREATEST(0, ps.stock_on_hand - ps.committed_stock)), 0)
      INTO v_available FROM public.product_stock ps WHERE ps.product_id = v_pid;
    IF v_available < v_qty THEN
      RETURN jsonb_build_object('ok', false, 'error', 'stock', 'product_id', v_pid,
        'name', v_name, 'available', FLOOR(v_available));
    END IF;
  END LOOP;

  INSERT INTO public.price_list_orders
    (price_list_id, customer_name, customer_phone, customer_email, customer_address,
     customer_note, subtotal, total_amount, was_price_increased, increase_percent, status)
  VALUES (v_list.id, p_name, p_phone, NULLIF(p_email, ''), NULLIF(p_address, ''),
     NULLIF(p_note, ''), 0, 0, v_increased,
     CASE WHEN v_increased THEN v_list.below_min_increase_percent ELSE 0 END, 'New')
  RETURNING id, order_number INTO v_order_id, v_order_number;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    IF v_qty <= 0 THEN CONTINUE; END IF;

    SELECT p.name, COALESCE(pli.custom_price, p.price)
      INTO v_name, v_base
      FROM public.products p
      LEFT JOIN public.price_list_items pli
        ON pli.product_id = p.id AND pli.price_list_id = v_list.id AND pli.is_included
      WHERE p.id = v_pid;

    v_applied := ROUND(v_base * v_multiplier, 2);
    v_subtotal := v_subtotal + ROUND(v_base * v_qty, 2);
    v_total := v_total + ROUND(v_applied * v_qty, 2);

    -- Deduct from the warehouse holding the most available stock, spilling over if needed.
    v_remaining := v_qty;
    v_wh := NULL;
    FOR v_row IN
      SELECT ps.id, ps.warehouse_id, GREATEST(0, ps.stock_on_hand - ps.committed_stock) AS avail
      FROM public.product_stock ps
      WHERE ps.product_id = v_pid
      ORDER BY avail DESC
    LOOP
      EXIT WHEN v_remaining <= 0;
      IF v_row.avail <= 0 THEN CONTINUE; END IF;
      v_take := LEAST(v_row.avail, v_remaining);
      UPDATE public.product_stock SET stock_on_hand = stock_on_hand - v_take, updated_at = now()
        WHERE id = v_row.id;
      INSERT INTO public.stock_movements (product_id, warehouse_id, movement_type, quantity_change, reason)
        VALUES (v_pid, v_row.warehouse_id, 'Price List Order', -v_take,
                'Order ' || v_order_number);
      IF v_wh IS NULL THEN v_wh := v_row.warehouse_id; END IF;
      v_remaining := v_remaining - v_take;
    END LOOP;

    IF v_remaining > 0 THEN
      RAISE EXCEPTION 'insufficient_stock:%', v_name;
    END IF;

    INSERT INTO public.price_list_order_items
      (price_list_order_id, product_id, product_name_snapshot, warehouse_id, quantity,
       base_price, applied_price, line_total)
    VALUES (v_order_id, v_pid, v_name, v_wh, v_qty, v_base, v_applied,
            ROUND(v_applied * v_qty, 2));
  END LOOP;

  UPDATE public.price_list_orders
    SET subtotal = v_subtotal, total_amount = v_total
    WHERE id = v_order_id;

  RETURN jsonb_build_object('ok', true, 'order_id', v_order_id, 'order_number', v_order_number);
END; $$;

REVOKE ALL ON FUNCTION public.submit_price_list_order(text, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_price_list_order(text, text, text, text, text, text, jsonb) TO service_role;

-- Rejects an order and restores its stock in one transaction.
CREATE OR REPLACE FUNCTION public.reject_price_list_order(p_order_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
  v_number text;
  v_item record;
  v_wh uuid;
BEGIN
  SELECT status, order_number INTO v_status, v_number
    FROM public.price_list_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_status IN ('Rejected', 'Converted to Bill') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_' || v_status);
  END IF;

  FOR v_item IN
    SELECT product_id, warehouse_id, quantity, product_name_snapshot
    FROM public.price_list_order_items WHERE price_list_order_id = p_order_id
  LOOP
    IF v_item.product_id IS NULL THEN CONTINUE; END IF;
    v_wh := v_item.warehouse_id;
    IF v_wh IS NULL THEN
      SELECT id INTO v_wh FROM public.warehouses WHERE is_active ORDER BY is_default DESC, sort_order LIMIT 1;
    END IF;
    IF v_wh IS NULL THEN RAISE EXCEPTION 'no_warehouse'; END IF;

    IF EXISTS (SELECT 1 FROM public.product_stock WHERE product_id = v_item.product_id AND warehouse_id = v_wh) THEN
      UPDATE public.product_stock
        SET stock_on_hand = stock_on_hand + v_item.quantity, updated_at = now()
        WHERE product_id = v_item.product_id AND warehouse_id = v_wh;
    ELSE
      INSERT INTO public.product_stock (product_id, warehouse_id, stock_on_hand, committed_stock)
        VALUES (v_item.product_id, v_wh, v_item.quantity, 0);
    END IF;

    INSERT INTO public.stock_movements (product_id, warehouse_id, movement_type, quantity_change, reason)
      VALUES (v_item.product_id, v_wh, 'Price List Order Cancelled', v_item.quantity,
              'Order ' || COALESCE(v_number, '') || ' rejected');
  END LOOP;

  UPDATE public.price_list_orders
    SET status = 'Rejected', rejection_reason = NULLIF(p_reason, '')
    WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true);
END; $$;

REVOKE ALL ON FUNCTION public.reject_price_list_order(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_price_list_order(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_price_list_order(uuid, text) TO service_role;
