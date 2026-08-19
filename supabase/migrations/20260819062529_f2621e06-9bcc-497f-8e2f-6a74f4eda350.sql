CREATE OR REPLACE FUNCTION public.convert_price_list_order(p_order_id uuid, p_bill_id uuid)
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
    SELECT product_id, warehouse_id, quantity
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

    INSERT INTO public.stock_movements (product_id, warehouse_id, movement_type, quantity_change, reason, related_bill_id)
      VALUES (v_item.product_id, v_wh, 'Price List Order Converted', v_item.quantity,
              'Order ' || COALESCE(v_number, '') || ' converted to bill', p_bill_id);
  END LOOP;

  UPDATE public.price_list_orders
    SET status = 'Converted to Bill', converted_bill_id = p_bill_id, updated_at = now()
    WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.convert_price_list_order(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_price_list_order(uuid, uuid) TO service_role;