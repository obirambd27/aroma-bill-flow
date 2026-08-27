-- 1. Traceable ledger metadata
ALTER TABLE public.ledger_entries
  ADD COLUMN IF NOT EXISTS event_role text NOT NULL DEFAULT 'forward',
  ADD COLUMN IF NOT EXISTS reverses_entry_id uuid REFERENCES public.ledger_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_ref uuid;

ALTER TABLE public.ledger_entries
  DROP CONSTRAINT IF EXISTS ledger_entries_event_role_check;
ALTER TABLE public.ledger_entries
  ADD CONSTRAINT ledger_entries_event_role_check
  CHECK (event_role IN ('forward','reversal','correction'));

UPDATE public.ledger_entries SET payment_ref = related_payment_id
  WHERE payment_ref IS NULL AND related_payment_id IS NOT NULL;

UPDATE public.ledger_entries SET event_role = 'reversal'
  WHERE event_role = 'forward'
    AND (description ILIKE 'Reversal%' OR description ILIKE 'Receivable restored%');

-- Link legacy payment-deletion reversals to the payment they reversed
UPDATE public.ledger_entries le
   SET payment_ref = dl.payment_id
  FROM public.payment_deletion_log dl
 WHERE le.payment_ref IS NULL
   AND le.event_role = 'reversal'
   AND le.created_at = dl.deleted_at
   AND le.description ILIKE '%deleted payment%';

CREATE INDEX IF NOT EXISTS ledger_entries_payment_ref_idx ON public.ledger_entries(payment_ref);
CREATE INDEX IF NOT EXISTS ledger_entries_reverses_idx ON public.ledger_entries(reverses_entry_id);

-- 2. Deleting a payment must not erase its ledger history
ALTER TABLE public.ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_related_payment_id_fkey;
ALTER TABLE public.ledger_entries
  ADD CONSTRAINT ledger_entries_related_payment_id_fkey
  FOREIGN KEY (related_payment_id) REFERENCES public.payments_received(id) ON DELETE SET NULL;

-- Keep payment_ref filled automatically
CREATE OR REPLACE FUNCTION public.set_ledger_payment_ref()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.payment_ref IS NULL AND NEW.related_payment_id IS NOT NULL THEN
    NEW.payment_ref := NEW.related_payment_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS ledger_entries_payment_ref ON public.ledger_entries;
CREATE TRIGGER ledger_entries_payment_ref
  BEFORE INSERT OR UPDATE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_ledger_payment_ref();

-- 3. Audit log of integrity runs
CREATE TABLE IF NOT EXISTS public.ledger_integrity_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL,
  phantom_count integer NOT NULL DEFAULT 0,
  missing_forward_count integer NOT NULL DEFAULT 0,
  corrected_total numeric NOT NULL DEFAULT 0,
  accounts_affected integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.ledger_integrity_runs TO authenticated;
GRANT ALL ON public.ledger_integrity_runs TO service_role;
ALTER TABLE public.ledger_integrity_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner can read integrity runs" ON public.ledger_integrity_runs;
CREATE POLICY "Owner can read integrity runs" ON public.ledger_integrity_runs
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Owner can add integrity runs" ON public.ledger_integrity_runs;
CREATE POLICY "Owner can add integrity runs" ON public.ledger_integrity_runs
  FOR INSERT TO authenticated WITH CHECK (true);

-- 4. Recalculate balances from full ledger history
CREATE OR REPLACE FUNCTION public.recalc_account_balances()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  WITH sums AS (
    SELECT a.id, a.opening_balance + COALESCE((
      SELECT SUM(l.amount) FROM public.ledger_entries l WHERE l.account_id = a.id), 0) AS bal
    FROM public.accounts a
  )
  UPDATE public.accounts a SET current_balance = s.bal, updated_at = now()
    FROM sums s WHERE s.id = a.id AND a.current_balance IS DISTINCT FROM s.bal;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;

REVOKE ALL ON FUNCTION public.recalc_account_balances() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_account_balances() TO authenticated, service_role;

-- 5. Ledger integrity check (report-only by default)
CREATE OR REPLACE FUNCTION public.audit_ledger_integrity(p_repair boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_details jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_phantoms integer := 0;
  v_missing integer := 0;
  v_total numeric := 0;
  v_accounts uuid[] := '{}';
  v_ar uuid;
  v_new_id uuid;
BEGIN
  SELECT id INTO v_ar FROM public.accounts WHERE name = 'Accounts Receivable' LIMIT 1;

  -- A. Phantom reversals: a reversal booked for a deleted payment that never had an original entry.
  FOR r IN
    SELECT le.id, le.account_id, ac.name AS account_name, le.amount, le.entry_date,
           le.description, le.payment_ref
      FROM public.ledger_entries le
      JOIN public.accounts ac ON ac.id = le.account_id
     WHERE le.event_role = 'reversal'
       AND le.payment_ref IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.payment_deletion_log dl WHERE dl.payment_id = le.payment_ref)
       AND NOT EXISTS (
         SELECT 1 FROM public.ledger_entries f
          WHERE f.payment_ref = le.payment_ref AND f.event_role = 'forward')
       AND NOT EXISTS (
         SELECT 1 FROM public.ledger_entries c
          WHERE c.reverses_entry_id = le.id AND c.event_role = 'correction')
  LOOP
    v_phantoms := v_phantoms + 1;
    v_total := v_total + abs(r.amount);
    v_accounts := array_append(v_accounts, r.account_id);
    v_new_id := NULL;

    IF p_repair THEN
      INSERT INTO public.ledger_entries
        (account_id, entry_date, entry_type, amount, description,
         event_role, reverses_entry_id, payment_ref)
      VALUES (r.account_id, CURRENT_DATE, 'Manual Adjustment', -r.amount,
        'Correction — phantom reversal cancelled (' || COALESCE(r.description, 'reversal') || ')',
        'correction', r.id, r.payment_ref)
      RETURNING id INTO v_new_id;
    END IF;

    v_details := v_details || jsonb_build_object(
      'kind', 'phantom_reversal', 'entry_id', r.id, 'account', r.account_name,
      'amount', r.amount, 'entry_date', r.entry_date, 'description', r.description,
      'corrected', p_repair, 'correction_entry_id', v_new_id);
  END LOOP;

  -- B. Collections that never reached the account balance.
  FOR r IN
    SELECT p.id, p.amount, p.account_id, p.payment_date, ac.name AS account_name,
           c.name AS customer_name
      FROM public.payments_received p
      JOIN public.accounts ac ON ac.id = p.account_id
      LEFT JOIN public.customers c ON c.id = p.customer_id
     WHERE p.amount > 0.005
       AND COALESCE(p.notes, '') <> 'Counter payment at billing'
       AND NOT EXISTS (
         SELECT 1 FROM public.ledger_entries l
          WHERE l.payment_ref = p.id AND l.event_role = 'forward' AND l.amount > 0)
  LOOP
    v_missing := v_missing + 1;
    v_accounts := array_append(v_accounts, r.account_id);
    v_new_id := NULL;

    IF p_repair THEN
      INSERT INTO public.ledger_entries
        (account_id, entry_date, entry_type, amount, description,
         event_role, payment_ref, related_payment_id)
      VALUES (r.account_id, r.payment_date, 'Sale Payment', r.amount,
        'Integrity repair — payment from ' || COALESCE(r.customer_name, 'customer'),
        'forward', r.id, r.id)
      RETURNING id INTO v_new_id;

      IF v_ar IS NOT NULL THEN
        INSERT INTO public.ledger_entries
          (account_id, entry_date, entry_type, amount, description,
           event_role, payment_ref, related_payment_id)
        VALUES (v_ar, r.payment_date, 'Sale Payment', -r.amount,
          'Integrity repair — receivable settled for ' || COALESCE(r.customer_name, 'customer'),
          'forward', r.id, r.id);
        v_accounts := array_append(v_accounts, v_ar);
      END IF;
      v_total := v_total + r.amount;
    END IF;

    v_details := v_details || jsonb_build_object(
      'kind', 'missing_forward', 'payment_id', r.id, 'account', r.account_name,
      'amount', r.amount, 'entry_date', r.payment_date,
      'description', 'Collection recorded without a matching account movement',
      'corrected', p_repair, 'correction_entry_id', v_new_id);
  END LOOP;

  -- C. Report-only warnings: money still sitting in the ledger for a payment that was deleted.
  FOR r IN
    SELECT le.id, ac.name AS account_name, le.amount, le.entry_date, le.payment_ref
      FROM public.ledger_entries le
      JOIN public.accounts ac ON ac.id = le.account_id
     WHERE le.event_role = 'forward'
       AND le.payment_ref IS NOT NULL
       AND le.amount <> 0
       AND NOT EXISTS (SELECT 1 FROM public.payments_received p WHERE p.id = le.payment_ref)
       AND NOT EXISTS (
         SELECT 1 FROM public.ledger_entries rv
          WHERE rv.reverses_entry_id = le.id AND rv.event_role IN ('reversal','correction'))
  LOOP
    v_warnings := v_warnings || jsonb_build_object(
      'kind', 'unreversed_forward', 'entry_id', r.id, 'account', r.account_name,
      'amount', r.amount, 'entry_date', r.entry_date,
      'description', 'Original entry remains for a collection that no longer exists');
  END LOOP;

  IF p_repair THEN
    PERFORM public.recalc_account_balances();
  END IF;

  INSERT INTO public.ledger_integrity_runs
    (mode, phantom_count, missing_forward_count, corrected_total, accounts_affected, details, warnings)
  VALUES (CASE WHEN p_repair THEN 'repair' ELSE 'report' END, v_phantoms, v_missing,
    CASE WHEN p_repair THEN v_total ELSE 0 END,
    COALESCE(array_length(ARRAY(SELECT DISTINCT unnest(v_accounts)), 1), 0),
    v_details, v_warnings);

  RETURN jsonb_build_object(
    'ok', true,
    'mode', CASE WHEN p_repair THEN 'repair' ELSE 'report' END,
    'phantom_count', v_phantoms,
    'missing_forward_count', v_missing,
    'total_amount', v_total,
    'accounts_affected', COALESCE(array_length(ARRAY(SELECT DISTINCT unnest(v_accounts)), 1), 0),
    'details', v_details,
    'warnings', v_warnings);
END; $$;

REVOKE ALL ON FUNCTION public.audit_ledger_integrity(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_ledger_integrity(boolean) TO authenticated, service_role;

-- 6. Symmetric payment deletion: append reversals only for entries that really exist.
CREATE OR REPLACE FUNCTION public.delete_payment_received(p_payment_id uuid, p_reason text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pay public.payments_received%ROWTYPE;
  v_cust_name text;
  v_alloc record;
  v_bill record;
  v_next_paid numeric;
  v_status text;
  v_bills jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_fwd record;
  v_net numeric;
  v_reversed numeric := 0;
BEGIN
  SELECT * INTO v_pay FROM public.payments_received WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT name INTO v_cust_name FROM public.customers WHERE id = v_pay.customer_id;

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

  -- Reverse ONLY the original entries that actually exist for this exact payment.
  FOR v_fwd IN
    SELECT le.id, le.account_id, le.amount, le.related_bill_id
      FROM public.ledger_entries le
     WHERE le.payment_ref = p_payment_id AND le.event_role = 'forward'
     FOR UPDATE
  LOOP
    SELECT v_fwd.amount + COALESCE(SUM(rv.amount), 0) INTO v_net
      FROM public.ledger_entries rv
     WHERE rv.reverses_entry_id = v_fwd.id;

    IF abs(COALESCE(v_net, v_fwd.amount)) <= 0.005 THEN CONTINUE; END IF;

    INSERT INTO public.ledger_entries
      (account_id, entry_date, entry_type, amount, description,
       event_role, reverses_entry_id, payment_ref, related_bill_id)
    VALUES (v_fwd.account_id, CURRENT_DATE, 'Manual Adjustment', -v_net,
      'Reversal of deleted payment from ' || COALESCE(v_cust_name, 'customer'),
      'reversal', v_fwd.id, p_payment_id, v_fwd.related_bill_id);

    v_reversed := v_reversed + 1;
  END LOOP;

  IF v_reversed = 0 THEN
    v_warnings := v_warnings || jsonb_build_object(
      'kind', 'no_forward_entry',
      'message', 'This collection had no account movement recorded, so no money was deducted on deletion.');
  END IF;

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
     v_pay.payment_method, v_pay.account_id, NULLIF(p_reason, ''), v_bills,
     to_jsonb(v_pay) || jsonb_build_object('ledger_warnings', v_warnings));

  DELETE FROM public.payment_allocations WHERE payment_id = p_payment_id;
  DELETE FROM public.payments_received WHERE id = p_payment_id;

  PERFORM public.recalc_account_balances();

  RETURN jsonb_build_object('ok', true, 'bills', v_bills, 'amount', v_pay.amount,
    'warnings', v_warnings);
END; $$;

REVOKE ALL ON FUNCTION public.delete_payment_received(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_payment_received(uuid, text) TO authenticated, service_role;