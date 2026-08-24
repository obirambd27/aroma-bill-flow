CREATE TABLE public.payment_deletion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid,
  customer_id uuid,
  customer_name text,
  payment_date date,
  amount numeric NOT NULL DEFAULT 0,
  payment_method text,
  account_id uuid,
  reason text,
  affected_bills jsonb NOT NULL DEFAULT '[]'::jsonb,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.payment_deletion_log TO authenticated;
GRANT ALL ON public.payment_deletion_log TO service_role;

ALTER TABLE public.payment_deletion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view payment deletion log"
  ON public.payment_deletion_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can add payment deletion log entries"
  ON public.payment_deletion_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.delete_payment_received(p_payment_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pay public.payments_received%ROWTYPE;
  v_cust_name text;
  v_alloc record;
  v_bill record;
  v_next_paid numeric;
  v_status text;
  v_bills jsonb := '[]'::jsonb;
  v_ar uuid;
BEGIN
  SELECT * INTO v_pay FROM public.payments_received WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT name INTO v_cust_name FROM public.customers WHERE id = v_pay.customer_id;

  -- Validate first: no bill may go negative.
  FOR v_alloc IN
    SELECT pa.bill_id, pa.amount_allocated FROM public.payment_allocations pa
    WHERE pa.payment_id = p_payment_id
  LOOP
    SELECT id, bill_number, total_amount, amount_paid INTO v_bill
      FROM public.bills WHERE id = v_alloc.bill_id FOR UPDATE;
    IF FOUND AND round(COALESCE(v_bill.amount_paid,0)::numeric - v_alloc.amount_allocated, 2) < -0.005 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'negative_balance',
        'bill_number', v_bill.bill_number);
    END IF;
  END LOOP;

  FOR v_alloc IN
    SELECT pa.bill_id, pa.amount_allocated FROM public.payment_allocations pa
    WHERE pa.payment_id = p_payment_id
  LOOP
    SELECT id, bill_number, total_amount, amount_paid INTO v_bill
      FROM public.bills WHERE id = v_alloc.bill_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_next_paid := GREATEST(round(COALESCE(v_bill.amount_paid,0)::numeric - v_alloc.amount_allocated, 2), 0);
    IF v_next_paid <= 0.005 THEN
      v_status := 'Unpaid';
    ELSIF v_next_paid + 0.005 >= COALESCE(v_bill.total_amount,0) THEN
      v_status := 'Paid';
    ELSE
      v_status := 'Partial';
    END IF;

    UPDATE public.bills SET amount_paid = v_next_paid, payment_status = v_status
      WHERE id = v_bill.id;

    v_bills := v_bills || jsonb_build_object(
      'bill_id', v_bill.id, 'bill_number', v_bill.bill_number,
      'amount_reversed', v_alloc.amount_allocated,
      'amount_paid_after', v_next_paid, 'status_after', v_status);
  END LOOP;

  -- Append-only reversal of the ledger effect of this payment.
  IF v_pay.account_id IS NOT NULL AND COALESCE(v_pay.amount,0) > 0.001 THEN
    INSERT INTO public.ledger_entries (account_id, entry_date, entry_type, amount, description)
    VALUES (v_pay.account_id, CURRENT_DATE, 'Manual Adjustment', -v_pay.amount,
      'Reversal of deleted payment from ' || COALESCE(v_cust_name, 'customer'));

    SELECT id INTO v_ar FROM public.accounts WHERE name = 'Accounts Receivable' LIMIT 1;
    IF v_ar IS NOT NULL THEN
      INSERT INTO public.ledger_entries (account_id, entry_date, entry_type, amount, description)
      VALUES (v_ar, CURRENT_DATE, 'Manual Adjustment', v_pay.amount,
        'Receivable restored after deleted payment from ' || COALESCE(v_cust_name, 'customer'));
    END IF;
  END IF;

  -- Remove the original ledger rows tied to this payment so balances net out cleanly.
  DELETE FROM public.ledger_entries WHERE related_payment_id = p_payment_id;

  -- Cancel any uncleared cheque recorded for this collection.
  DELETE FROM public.cheques c
    WHERE c.type = 'Received'
      AND c.status <> 'Cleared'
      AND c.amount = v_pay.amount
      AND c.cheque_date = v_pay.payment_date
      AND c.party_name = COALESCE(v_cust_name, c.party_name);

  INSERT INTO public.payment_deletion_log
    (payment_id, customer_id, customer_name, payment_date, amount, payment_method,
     account_id, reason, affected_bills, snapshot)
  VALUES (v_pay.id, v_pay.customer_id, v_cust_name, v_pay.payment_date, v_pay.amount,
     v_pay.payment_method, v_pay.account_id, NULLIF(p_reason, ''), v_bills, to_jsonb(v_pay));

  DELETE FROM public.payment_allocations WHERE payment_id = p_payment_id;
  DELETE FROM public.payments_received WHERE id = p_payment_id;

  RETURN jsonb_build_object('ok', true, 'bills', v_bills, 'amount', v_pay.amount);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_payment_received(uuid, text) TO authenticated;