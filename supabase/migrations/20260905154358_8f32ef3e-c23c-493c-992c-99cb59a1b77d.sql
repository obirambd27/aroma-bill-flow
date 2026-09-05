CREATE TABLE public.customer_merge_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surviving_customer_id uuid,
  surviving_customer_name text,
  merged_customer_id uuid,
  merged_customer_name text,
  merged_customer_phone text,
  merged_customer_email text,
  field_choices jsonb NOT NULL DEFAULT '{}'::jsonb,
  moved_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.customer_merge_log TO authenticated;
GRANT ALL ON public.customer_merge_log TO service_role;

ALTER TABLE public.customer_merge_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read customer merges"
  ON public.customer_merge_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can log customer merges"
  ON public.customer_merge_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.merge_customers(
  p_survivor_id uuid,
  p_duplicate_id uuid,
  p_final jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_survivor public.customers%ROWTYPE;
  v_dup public.customers%ROWTYPE;
  v_counts jsonb := '{}'::jsonb;
  v_n integer;
  v_spend numeric;
  v_outstanding numeric;
  v_last timestamptz;
BEGIN
  IF p_survivor_id IS NULL OR p_duplicate_id IS NULL THEN
    RAISE EXCEPTION 'Both customers are required';
  END IF;
  IF p_survivor_id = p_duplicate_id THEN
    RAISE EXCEPTION 'Cannot merge a customer with itself';
  END IF;

  SELECT * INTO v_survivor FROM public.customers WHERE id = p_survivor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Surviving customer not found'; END IF;
  SELECT * INTO v_dup FROM public.customers WHERE id = p_duplicate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Duplicate customer not found'; END IF;

  UPDATE public.bills SET customer_id = p_survivor_id WHERE customer_id = p_duplicate_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('bills', v_n);

  UPDATE public.payments_received SET customer_id = p_survivor_id WHERE customer_id = p_duplicate_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('payments_received', v_n);

  UPDATE public.payments SET customer_id = p_survivor_id WHERE customer_id = p_duplicate_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('payments', v_n);

  UPDATE public.sales_orders SET customer_id = p_survivor_id WHERE customer_id = p_duplicate_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('sales_orders', v_n);

  UPDATE public.delivery_notes SET customer_id = p_survivor_id WHERE customer_id = p_duplicate_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('delivery_notes', v_n);

  UPDATE public.credit_notes SET customer_id = p_survivor_id WHERE customer_id = p_duplicate_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('credit_notes', v_n);

  UPDATE public.sales_returns SET customer_id = p_survivor_id WHERE customer_id = p_duplicate_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('sales_returns', v_n);

  UPDATE public.customer_activities SET customer_id = p_survivor_id WHERE customer_id = p_duplicate_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('customer_activities', v_n);

  UPDATE public.customer_reminders SET customer_id = p_survivor_id WHERE customer_id = p_duplicate_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('customer_reminders', v_n);

  DELETE FROM public.customer_tag_assignments d
   WHERE d.customer_id = p_duplicate_id
     AND EXISTS (
       SELECT 1 FROM public.customer_tag_assignments s
        WHERE s.customer_id = p_survivor_id AND s.tag_id = d.tag_id
     );
  UPDATE public.customer_tag_assignments SET customer_id = p_survivor_id WHERE customer_id = p_duplicate_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('customer_tag_assignments', v_n);

  UPDATE public.customers SET
    name = COALESCE(NULLIF(p_final->>'name', ''), v_survivor.name),
    phone = COALESCE(NULLIF(p_final->>'phone', ''), v_survivor.phone),
    email = COALESCE(NULLIF(p_final->>'email', ''), v_survivor.email),
    address = COALESCE(NULLIF(p_final->>'address', ''), v_survivor.address),
    notes = COALESCE(NULLIF(p_final->>'notes', ''), v_survivor.notes),
    updated_at = now()
  WHERE id = p_survivor_id;

  SELECT COALESCE(SUM(b.total_amount), 0),
         COALESCE(SUM(GREATEST(b.total_amount - COALESCE(b.amount_paid, 0), 0)), 0),
         MAX(b.bill_date)::timestamptz
    INTO v_spend, v_outstanding, v_last
    FROM public.bills b
   WHERE b.customer_id = p_survivor_id AND b.status <> 'Void';

  UPDATE public.customers
     SET total_spend = COALESCE(v_spend, 0),
         last_purchase_at = v_last,
         updated_at = now()
   WHERE id = p_survivor_id;

  DELETE FROM public.customers WHERE id = p_duplicate_id;

  INSERT INTO public.customer_merge_log (
    surviving_customer_id, surviving_customer_name,
    merged_customer_id, merged_customer_name, merged_customer_phone, merged_customer_email,
    field_choices, moved_counts
  ) VALUES (
    p_survivor_id, COALESCE(NULLIF(p_final->>'name', ''), v_survivor.name),
    p_duplicate_id, v_dup.name, v_dup.phone, v_dup.email,
    COALESCE(p_final, '{}'::jsonb), v_counts
  );

  RETURN jsonb_build_object(
    'survivor_id', p_survivor_id,
    'moved', v_counts,
    'total_spend', COALESCE(v_spend, 0),
    'outstanding', COALESCE(v_outstanding, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_customers(uuid, uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.merge_customers(uuid, uuid, jsonb) TO authenticated;