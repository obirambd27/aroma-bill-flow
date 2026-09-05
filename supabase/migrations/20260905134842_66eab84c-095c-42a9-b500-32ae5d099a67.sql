CREATE OR REPLACE FUNCTION public.audit_stock_ledger(p_repair boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
  v_details jsonb := '[]'::jsonb;
  v_missing integer := 0;
  v_transfers integer := 0;
  v_mismatch integer := 0;
  v_products integer := 0;
BEGIN
  -- Finalized bill lines whose NET stock effect does not equal the currently saved quantity.
  -- This catches an orphan Edit Reversal even when later Sale rows exist.
  FOR r IN
    SELECT bi.product_id, bi.warehouse_id, b.id AS bill_id, b.bill_number,
           SUM(bi.quantity) AS qty,
           coalesce((
             SELECT SUM(sm.quantity_change)
             FROM public.stock_movements sm
             WHERE sm.related_bill_id = b.id
               AND sm.product_id = bi.product_id
               AND sm.warehouse_id = bi.warehouse_id
               AND sm.movement_type IN ('Sale', 'Edit Reversal', 'Backfilled Original Deduction')
           ), 0) AS recorded_net,
           -SUM(bi.quantity) - coalesce((
             SELECT SUM(sm.quantity_change)
             FROM public.stock_movements sm
             WHERE sm.related_bill_id = b.id
               AND sm.product_id = bi.product_id
               AND sm.warehouse_id = bi.warehouse_id
               AND sm.movement_type IN ('Sale', 'Edit Reversal', 'Backfilled Original Deduction')
           ), 0) AS correction,
           (SELECT name FROM public.products p WHERE p.id = bi.product_id) AS product,
           (SELECT sku FROM public.products p WHERE p.id = bi.product_id) AS sku,
           (SELECT name FROM public.warehouses w WHERE w.id = bi.warehouse_id) AS warehouse
    FROM public.bill_items bi
    JOIN public.bills b ON b.id = bi.bill_id
    WHERE b.status = 'Finalized' AND bi.product_id IS NOT NULL AND bi.warehouse_id IS NOT NULL
    GROUP BY bi.product_id, bi.warehouse_id, b.id, b.bill_number
    HAVING coalesce((
      SELECT SUM(sm.quantity_change)
      FROM public.stock_movements sm
      WHERE sm.related_bill_id = b.id
        AND sm.product_id = bi.product_id
        AND sm.warehouse_id = bi.warehouse_id
        AND sm.movement_type IN ('Sale', 'Edit Reversal', 'Backfilled Original Deduction')
    ), 0) <> -SUM(bi.quantity)
  LOOP
    v_missing := v_missing + 1;
    v_details := v_details || jsonb_build_object(
      'type', 'missing_deduction', 'product_id', r.product_id, 'product', r.product, 'sku', r.sku,
      'warehouse_id', r.warehouse_id, 'warehouse', r.warehouse,
      'bill_id', r.bill_id, 'bill_number', r.bill_number, 'quantity', abs(r.correction),
      'recorded_net', r.recorded_net, 'required_net', -r.qty, 'correction', r.correction);
    IF p_repair THEN
      INSERT INTO public.stock_movements
        (product_id, warehouse_id, movement_type, quantity_change, related_bill_id, reason)
      VALUES
        (r.product_id, r.warehouse_id, 'Backfilled Original Deduction', r.correction, r.bill_id,
         'Corrected net stock effect for ' || coalesce(r.bill_number, 'bill') ||
         ' (recorded ' || r.recorded_net || ', required ' || (-r.qty) || ')');
    END IF;
  END LOOP;

  FOR r IN
    SELECT st.id, st.quantity, st.product_id, st.from_warehouse_id, st.to_warehouse_id,
           (SELECT name FROM public.products p WHERE p.id = st.product_id) AS product,
           (SELECT sku FROM public.products p WHERE p.id = st.product_id) AS sku,
           coalesce((SELECT SUM(-sm.quantity_change) FROM public.stock_movements sm
             WHERE sm.related_transfer_id = st.id AND sm.warehouse_id = st.from_warehouse_id
               AND sm.movement_type IN ('Transfer Out', 'Transfer Correction')), 0) AS qty_out,
           coalesce((SELECT SUM(sm.quantity_change) FROM public.stock_movements sm
             WHERE sm.related_transfer_id = st.id AND sm.warehouse_id = st.to_warehouse_id
               AND sm.movement_type IN ('Transfer In', 'Transfer Correction')), 0) AS qty_in
    FROM public.stock_transfers st
  LOOP
    IF r.qty_out = r.quantity AND r.qty_in = r.quantity THEN CONTINUE; END IF;
    v_transfers := v_transfers + 1;
    v_details := v_details || jsonb_build_object(
      'type', 'transfer_asymmetry', 'transfer_id', r.id, 'product_id', r.product_id,
      'product', r.product, 'sku', r.sku, 'quantity', r.quantity,
      'quantity_out', r.qty_out, 'quantity_in', r.qty_in,
      'warehouse_id', r.from_warehouse_id,
      'warehouse', (SELECT name FROM public.warehouses w WHERE w.id = r.from_warehouse_id));
    IF p_repair THEN
      IF r.qty_out <> r.quantity THEN
        INSERT INTO public.stock_movements
          (product_id, warehouse_id, movement_type, quantity_change, reason, related_transfer_id)
        VALUES (r.product_id, r.from_warehouse_id, 'Transfer Correction', -(r.quantity - r.qty_out),
                'Corrected transfer out to match transfer of ' || r.quantity, r.id);
      END IF;
      IF r.qty_in <> r.quantity THEN
        INSERT INTO public.stock_movements
          (product_id, warehouse_id, movement_type, quantity_change, reason, related_transfer_id)
        VALUES (r.product_id, r.to_warehouse_id, 'Transfer Correction', r.quantity - r.qty_in,
                'Corrected transfer in to match transfer of ' || r.quantity, r.id);
      END IF;
    END IF;
  END LOOP;

  FOR r IN
    SELECT ps.product_id, ps.warehouse_id, ps.stock_on_hand,
           coalesce((SELECT SUM(sm.quantity_change) FROM public.stock_movements sm
             WHERE sm.product_id = ps.product_id AND sm.warehouse_id = ps.warehouse_id), 0) AS expected,
           (SELECT count(*) FROM public.stock_movements sm
             WHERE sm.product_id = ps.product_id AND sm.warehouse_id = ps.warehouse_id) AS moves,
           (SELECT name FROM public.products p WHERE p.id = ps.product_id) AS product,
           (SELECT sku FROM public.products p WHERE p.id = ps.product_id) AS sku,
           (SELECT name FROM public.warehouses w WHERE w.id = ps.warehouse_id) AS warehouse
    FROM public.product_stock ps
  LOOP
    IF r.stock_on_hand = r.expected OR r.moves = 0 THEN CONTINUE; END IF;
    v_mismatch := v_mismatch + 1;
    v_details := v_details || jsonb_build_object(
      'type', 'stock_mismatch', 'product_id', r.product_id, 'product', r.product, 'sku', r.sku,
      'warehouse_id', r.warehouse_id, 'warehouse', r.warehouse,
      'stored', r.stock_on_hand, 'expected', r.expected, 'difference', r.stock_on_hand - r.expected);
    IF p_repair THEN
      UPDATE public.product_stock SET stock_on_hand = r.expected, updated_at = now()
      WHERE product_id = r.product_id AND warehouse_id = r.warehouse_id;
    END IF;
  END LOOP;

  SELECT count(DISTINCT d->>'product_id') INTO v_products FROM jsonb_array_elements(v_details) d;

  INSERT INTO public.stock_audit_runs
    (mode, mismatch_count, missing_deduction_count, transfer_asymmetry_count, products_affected, details)
  VALUES
    (CASE WHEN p_repair THEN 'repair' ELSE 'scan' END, v_mismatch, v_missing, v_transfers, v_products,
     (SELECT coalesce(jsonb_agg(d), '[]'::jsonb)
      FROM (SELECT d FROM jsonb_array_elements(v_details) d LIMIT 500) x));

  RETURN jsonb_build_object(
    'mode', CASE WHEN p_repair THEN 'repair' ELSE 'scan' END,
    'missing_deductions', v_missing,
    'transfer_asymmetries', v_transfers,
    'stock_mismatches', v_mismatch,
    'products_affected', v_products,
    'details', v_details);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.audit_stock_ledger(boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.audit_stock_ledger(boolean) TO authenticated, service_role;