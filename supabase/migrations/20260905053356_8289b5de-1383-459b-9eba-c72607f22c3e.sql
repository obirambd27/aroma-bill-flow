
-- 1. Link movements to transfers -------------------------------------------
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS related_transfer_id uuid REFERENCES public.stock_transfers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS stock_movements_transfer_idx ON public.stock_movements(related_transfer_id);
CREATE INDEX IF NOT EXISTS stock_movements_prod_wh_idx ON public.stock_movements(product_id, warehouse_id);

-- Backfill transfer links by matching product/warehouse/quantity near the transfer timestamp.
UPDATE public.stock_movements sm
SET related_transfer_id = st.id
FROM public.stock_transfers st
WHERE sm.related_transfer_id IS NULL
  AND sm.movement_type = 'Transfer Out'
  AND sm.product_id = st.product_id
  AND sm.warehouse_id = st.from_warehouse_id
  AND sm.quantity_change = -st.quantity
  AND sm.created_at BETWEEN st.created_at - interval '2 minutes' AND st.created_at + interval '2 minutes';

UPDATE public.stock_movements sm
SET related_transfer_id = st.id
FROM public.stock_transfers st
WHERE sm.related_transfer_id IS NULL
  AND sm.movement_type = 'Transfer In'
  AND sm.product_id = st.product_id
  AND sm.warehouse_id = st.to_warehouse_id
  AND sm.quantity_change = st.quantity
  AND sm.created_at BETWEEN st.created_at - interval '2 minutes' AND st.created_at + interval '2 minutes';

-- 2. Audit run history ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL DEFAULT 'scan',
  mismatch_count integer NOT NULL DEFAULT 0,
  missing_deduction_count integer NOT NULL DEFAULT 0,
  transfer_asymmetry_count integer NOT NULL DEFAULT 0,
  products_affected integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.stock_audit_runs TO authenticated;
GRANT ALL ON public.stock_audit_runs TO service_role;
ALTER TABLE public.stock_audit_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read stock audit runs" ON public.stock_audit_runs;
CREATE POLICY "Authenticated can read stock audit runs" ON public.stock_audit_runs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can add stock audit runs" ON public.stock_audit_runs;
CREATE POLICY "Authenticated can add stock audit runs" ON public.stock_audit_runs
  FOR INSERT TO authenticated WITH CHECK (true);

-- 3. Helper: move stock atomically -----------------------------------------
CREATE OR REPLACE FUNCTION public.adjust_stock_on_hand(p_product_id uuid, p_warehouse_id uuid, p_delta numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_new numeric;
BEGIN
  INSERT INTO public.product_stock (product_id, warehouse_id, stock_on_hand)
  VALUES (p_product_id, p_warehouse_id, p_delta)
  ON CONFLICT (product_id, warehouse_id)
  DO UPDATE SET stock_on_hand = public.product_stock.stock_on_hand + EXCLUDED.stock_on_hand,
                updated_at = now()
  RETURNING stock_on_hand INTO v_new;
  RETURN v_new;
END;
$$;

-- 4. Finalize a bill's stock atomically, with a post-commit assertion -------
CREATE OR REPLACE FUNCTION public.apply_bill_stock(p_bill_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_applied integer := 0;
  v_missing integer := 0;
BEGIN
  FOR r IN
    SELECT bi.product_id, bi.warehouse_id, SUM(bi.quantity) AS qty
    FROM public.bill_items bi
    WHERE bi.bill_id = p_bill_id AND bi.product_id IS NOT NULL AND bi.warehouse_id IS NOT NULL
    GROUP BY 1, 2
  LOOP
    PERFORM public.adjust_stock_on_hand(r.product_id, r.warehouse_id, -r.qty);
    INSERT INTO public.stock_movements (product_id, warehouse_id, movement_type, quantity_change, related_bill_id)
    VALUES (r.product_id, r.warehouse_id, 'Sale', -r.qty, p_bill_id);
    v_applied := v_applied + 1;
  END LOOP;

  -- Assertion: every line must now own a Sale movement.
  SELECT count(*) INTO v_missing
  FROM (
    SELECT bi.product_id, bi.warehouse_id, SUM(bi.quantity) AS qty
    FROM public.bill_items bi
    WHERE bi.bill_id = p_bill_id AND bi.product_id IS NOT NULL AND bi.warehouse_id IS NOT NULL
    GROUP BY 1, 2
  ) l
  WHERE NOT EXISTS (
    SELECT 1 FROM public.stock_movements sm
    WHERE sm.related_bill_id = p_bill_id
      AND sm.product_id = l.product_id
      AND sm.warehouse_id = l.warehouse_id
      AND sm.movement_type = 'Sale'
      AND sm.quantity_change = -l.qty
  );

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Stock deduction assertion failed: % line(s) on this bill were not recorded', v_missing;
  END IF;

  RETURN jsonb_build_object('applied', v_applied);
END;
$$;

-- 5. Bill edit: reverse (only what exists) -> validate -> re-apply ----------
CREATE OR REPLACE FUNCTION public.apply_bill_edit_stock(p_bill_id uuid, p_lines jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_avail numeric;
  v_pname text;
  v_wname text;
  v_flags jsonb := '[]'::jsonb;
  v_identical boolean;
  v_bill_number text;
BEGIN
  SELECT bill_number INTO v_bill_number FROM public.bills WHERE id = p_bill_id;

  CREATE TEMP TABLE _desired ON COMMIT DROP AS
  SELECT (l->>'product_id')::uuid AS product_id,
         (l->>'warehouse_id')::uuid AS warehouse_id,
         SUM((l->>'quantity')::numeric) AS qty
  FROM jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l
  WHERE nullif(l->>'product_id','') IS NOT NULL AND nullif(l->>'warehouse_id','') IS NOT NULL
  GROUP BY 1, 2;

  CREATE TEMP TABLE _existing ON COMMIT DROP AS
  SELECT sm.product_id, sm.warehouse_id, SUM(sm.quantity_change) AS net
  FROM public.stock_movements sm
  WHERE sm.related_bill_id = p_bill_id
    AND sm.movement_type IN ('Sale', 'Edit Reversal', 'Backfilled Original Deduction')
  GROUP BY 1, 2
  HAVING SUM(sm.quantity_change) <> 0;

  -- Nothing changed? Skip all stock writes.
  SELECT NOT EXISTS (
    SELECT product_id, warehouse_id, qty FROM (
      SELECT product_id, warehouse_id, qty FROM _desired
      EXCEPT
      SELECT product_id, warehouse_id, -net FROM _existing
    ) a
    UNION ALL
    SELECT product_id, warehouse_id, -net FROM (
      SELECT product_id, warehouse_id, net FROM _existing
      EXCEPT
      SELECT product_id, warehouse_id, -qty FROM _desired
    ) b
  ) INTO v_identical;

  IF v_identical THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'No stock-affecting changes');
  END IF;

  -- (a) Reverse only the effects that actually exist.
  FOR r IN SELECT * FROM _existing LOOP
    PERFORM public.adjust_stock_on_hand(r.product_id, r.warehouse_id, -r.net);
    INSERT INTO public.stock_movements (product_id, warehouse_id, movement_type, quantity_change, related_bill_id, reason)
    VALUES (r.product_id, r.warehouse_id, 'Edit Reversal', -r.net, p_bill_id,
            'Edit of ' || coalesce(v_bill_number, 'bill'));
  END LOOP;

  -- Flag lines that never had an original deduction.
  FOR r IN
    SELECT d.product_id, d.warehouse_id FROM _desired d
    WHERE NOT EXISTS (SELECT 1 FROM _existing e WHERE e.product_id = d.product_id AND e.warehouse_id = d.warehouse_id)
  LOOP
    SELECT name INTO v_pname FROM public.products WHERE id = r.product_id;
    SELECT name INTO v_wname FROM public.warehouses WHERE id = r.warehouse_id;
    v_flags := v_flags || jsonb_build_object(
      'product_id', r.product_id, 'product', v_pname,
      'warehouse_id', r.warehouse_id, 'warehouse', v_wname,
      'issue', 'No original deduction found - treated as first-time deduction');
  END LOOP;

  -- (b) Validate the NEW quantities against post-reversal availability.
  FOR r IN SELECT * FROM _desired LOOP
    SELECT coalesce(ps.stock_on_hand, 0) INTO v_avail
    FROM public.product_stock ps
    WHERE ps.product_id = r.product_id AND ps.warehouse_id = r.warehouse_id;
    v_avail := coalesce(v_avail, 0);
    IF r.qty > v_avail THEN
      SELECT name INTO v_pname FROM public.products WHERE id = r.product_id;
      SELECT name INTO v_wname FROM public.warehouses WHERE id = r.warehouse_id;
      RAISE EXCEPTION 'Not enough stock for % in %: only % available, this bill needs %',
        coalesce(v_pname, 'product'), coalesce(v_wname, 'warehouse'), v_avail, r.qty;
    END IF;
  END LOOP;

  -- (c) Apply the new deductions.
  FOR r IN SELECT * FROM _desired LOOP
    PERFORM public.adjust_stock_on_hand(r.product_id, r.warehouse_id, -r.qty);
    INSERT INTO public.stock_movements (product_id, warehouse_id, movement_type, quantity_change, related_bill_id, reason)
    VALUES (r.product_id, r.warehouse_id, 'Sale', -r.qty, p_bill_id,
            'Edit of ' || coalesce(v_bill_number, 'bill'));
  END LOOP;

  RETURN jsonb_build_object('skipped', false, 'flags', v_flags);
END;
$$;

-- 6. Atomic, symmetric stock transfer --------------------------------------
CREATE OR REPLACE FUNCTION public.create_stock_transfer(
  p_product_id uuid, p_from_warehouse_id uuid, p_to_warehouse_id uuid,
  p_quantity numeric, p_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer_id uuid;
  v_avail numeric;
  v_out numeric;
  v_in numeric;
  v_wname text;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Transfer quantity must be greater than zero';
  END IF;
  IF p_from_warehouse_id = p_to_warehouse_id THEN
    RAISE EXCEPTION 'Source and destination warehouses must be different';
  END IF;

  SELECT coalesce(stock_on_hand, 0) INTO v_avail FROM public.product_stock
  WHERE product_id = p_product_id AND warehouse_id = p_from_warehouse_id;
  v_avail := coalesce(v_avail, 0);
  IF p_quantity > v_avail THEN
    SELECT name INTO v_wname FROM public.warehouses WHERE id = p_from_warehouse_id;
    RAISE EXCEPTION 'Only % available in %', v_avail, coalesce(v_wname, 'the source warehouse');
  END IF;

  INSERT INTO public.stock_transfers (product_id, from_warehouse_id, to_warehouse_id, quantity, notes)
  VALUES (p_product_id, p_from_warehouse_id, p_to_warehouse_id, p_quantity, nullif(btrim(coalesce(p_notes, '')), ''))
  RETURNING id INTO v_transfer_id;

  PERFORM public.adjust_stock_on_hand(p_product_id, p_from_warehouse_id, -p_quantity);
  PERFORM public.adjust_stock_on_hand(p_product_id, p_to_warehouse_id, p_quantity);

  INSERT INTO public.stock_movements (product_id, warehouse_id, movement_type, quantity_change, reason, related_transfer_id)
  VALUES
    (p_product_id, p_from_warehouse_id, 'Transfer Out', -p_quantity, coalesce(nullif(btrim(coalesce(p_notes,'')),''), 'Stock transfer'), v_transfer_id),
    (p_product_id, p_to_warehouse_id, 'Transfer In', p_quantity, coalesce(nullif(btrim(coalesce(p_notes,'')),''), 'Stock transfer'), v_transfer_id);

  SELECT coalesce(SUM(-quantity_change), 0) INTO v_out FROM public.stock_movements
  WHERE related_transfer_id = v_transfer_id AND movement_type = 'Transfer Out';
  SELECT coalesce(SUM(quantity_change), 0) INTO v_in FROM public.stock_movements
  WHERE related_transfer_id = v_transfer_id AND movement_type = 'Transfer In';

  IF v_out <> p_quantity OR v_in <> p_quantity THEN
    RAISE EXCEPTION 'Transfer check failed: recorded % out and % in for a transfer of %', v_out, v_in, p_quantity;
  END IF;

  RETURN jsonb_build_object('transfer_id', v_transfer_id, 'quantity_out', v_out, 'quantity_in', v_in);
END;
$$;

-- 7. Full catalogue audit ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_stock_ledger(p_repair boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_details jsonb := '[]'::jsonb;
  v_missing integer := 0;
  v_transfers integer := 0;
  v_mismatch integer := 0;
  v_products integer := 0;
  v_expected numeric;
  v_delta numeric;
BEGIN
  -- (a) Finalized bill lines with no Sale movement.
  FOR r IN
    SELECT bi.product_id, bi.warehouse_id, b.id AS bill_id, b.bill_number,
           SUM(bi.quantity) AS qty,
           (SELECT name FROM public.products p WHERE p.id = bi.product_id) AS product,
           (SELECT sku FROM public.products p WHERE p.id = bi.product_id) AS sku,
           (SELECT name FROM public.warehouses w WHERE w.id = bi.warehouse_id) AS warehouse
    FROM public.bill_items bi
    JOIN public.bills b ON b.id = bi.bill_id
    WHERE b.status = 'Finalized' AND bi.product_id IS NOT NULL AND bi.warehouse_id IS NOT NULL
    GROUP BY bi.product_id, bi.warehouse_id, b.id, b.bill_number
    HAVING NOT EXISTS (
      SELECT 1 FROM public.stock_movements sm
      WHERE sm.related_bill_id = b.id AND sm.product_id = bi.product_id
        AND sm.warehouse_id = bi.warehouse_id
        AND sm.movement_type IN ('Sale', 'Backfilled Original Deduction')
    )
  LOOP
    v_missing := v_missing + 1;
    v_details := v_details || jsonb_build_object(
      'type', 'missing_deduction', 'product_id', r.product_id, 'product', r.product, 'sku', r.sku,
      'warehouse_id', r.warehouse_id, 'warehouse', r.warehouse,
      'bill_id', r.bill_id, 'bill_number', r.bill_number, 'quantity', r.qty);
    IF p_repair THEN
      INSERT INTO public.stock_movements (product_id, warehouse_id, movement_type, quantity_change, related_bill_id, reason)
      VALUES (r.product_id, r.warehouse_id, 'Backfilled Original Deduction', -r.qty, r.bill_id,
              'Backfilled missing sale deduction for ' || coalesce(r.bill_number, 'bill'));
    END IF;
  END LOOP;

  -- (b) Transfers whose out and in sides do not match.
  FOR r IN
    SELECT st.id, st.quantity, st.product_id, st.from_warehouse_id, st.to_warehouse_id,
           (SELECT name FROM public.products p WHERE p.id = st.product_id) AS product,
           (SELECT sku FROM public.products p WHERE p.id = st.product_id) AS sku,
           coalesce((SELECT SUM(-sm.quantity_change) FROM public.stock_movements sm
             WHERE sm.related_transfer_id = st.id AND sm.movement_type = 'Transfer Out'), 0) AS qty_out,
           coalesce((SELECT SUM(sm.quantity_change) FROM public.stock_movements sm
             WHERE sm.related_transfer_id = st.id AND sm.movement_type = 'Transfer In'), 0) AS qty_in
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
        INSERT INTO public.stock_movements (product_id, warehouse_id, movement_type, quantity_change, reason, related_transfer_id)
        VALUES (r.product_id, r.from_warehouse_id, 'Transfer Correction', -(r.quantity - r.qty_out),
                'Corrected transfer out to match transfer of ' || r.quantity, r.id);
      END IF;
      IF r.qty_in <> r.quantity THEN
        INSERT INTO public.stock_movements (product_id, warehouse_id, movement_type, quantity_change, reason, related_transfer_id)
        VALUES (r.product_id, r.to_warehouse_id, 'Transfer Correction', (r.quantity - r.qty_in),
                'Corrected transfer in to match transfer of ' || r.quantity, r.id);
      END IF;
    END IF;
  END LOOP;

  -- (c) Stored stock vs stock calculated from movement history.
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

  SELECT count(DISTINCT d->>'product_id') INTO v_products
  FROM jsonb_array_elements(v_details) d;

  INSERT INTO public.stock_audit_runs (mode, mismatch_count, missing_deduction_count, transfer_asymmetry_count, products_affected, details)
  VALUES (CASE WHEN p_repair THEN 'repair' ELSE 'scan' END, v_mismatch, v_missing, v_transfers, v_products,
          (SELECT coalesce(jsonb_agg(d), '[]'::jsonb) FROM (SELECT d FROM jsonb_array_elements(v_details) d LIMIT 500) x));

  RETURN jsonb_build_object(
    'mode', CASE WHEN p_repair THEN 'repair' ELSE 'scan' END,
    'missing_deductions', v_missing,
    'transfer_asymmetries', v_transfers,
    'stock_mismatches', v_mismatch,
    'products_affected', v_products,
    'details', v_details);
END;
$$;

-- 8. Per-item correction ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_stock_correction(
  p_product_id uuid, p_warehouse_id uuid, p_mode text, p_counted numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected numeric;
  v_stored numeric;
  v_delta numeric;
  v_who text := coalesce(auth.uid()::text, 'system');
BEGIN
  SELECT coalesce(SUM(quantity_change), 0) INTO v_expected FROM public.stock_movements
  WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;
  SELECT coalesce(stock_on_hand, 0) INTO v_stored FROM public.product_stock
  WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;
  v_stored := coalesce(v_stored, 0);

  IF p_mode = 'calculated' THEN
    IF v_stored = v_expected THEN
      RETURN jsonb_build_object('already_resolved', true, 'stored', v_stored, 'expected', v_expected);
    END IF;
    UPDATE public.product_stock SET stock_on_hand = v_expected, updated_at = now()
    WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;
    INSERT INTO public.stock_movements (product_id, warehouse_id, movement_type, quantity_change, reason)
    VALUES (p_product_id, p_warehouse_id, 'Audit Correction', 0,
            'Trusted calculated history: stock set from ' || v_stored || ' to ' || v_expected || ' by ' || v_who);
    RETURN jsonb_build_object('already_resolved', false, 'stored', v_expected, 'expected', v_expected);
  ELSIF p_mode = 'recount' THEN
    IF p_counted IS NULL THEN
      RAISE EXCEPTION 'A verified counted quantity is required for a recount';
    END IF;
    v_delta := p_counted - v_expected;
    INSERT INTO public.stock_movements (product_id, warehouse_id, movement_type, quantity_change, reason)
    VALUES (p_product_id, p_warehouse_id, 'Audit Correction', v_delta,
            'Physical recount of ' || p_counted || ' by ' || v_who);
    INSERT INTO public.product_stock (product_id, warehouse_id, stock_on_hand)
    VALUES (p_product_id, p_warehouse_id, p_counted)
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET stock_on_hand = p_counted, updated_at = now();
    RETURN jsonb_build_object('already_resolved', false, 'stored', p_counted, 'expected', p_counted);
  END IF;
  RAISE EXCEPTION 'Unknown correction mode %', p_mode;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_stock_on_hand(uuid, uuid, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_bill_stock(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_bill_edit_stock(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_stock_transfer(uuid, uuid, uuid, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.audit_stock_ledger(boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_stock_correction(uuid, uuid, text, numeric) TO authenticated, service_role;
