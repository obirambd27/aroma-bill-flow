CREATE TABLE public.bill_edit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  edited_at timestamptz NOT NULL DEFAULT now(),
  changes_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  edited_fields text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bill_edit_history TO authenticated;
GRANT ALL ON public.bill_edit_history TO service_role;

ALTER TABLE public.bill_edit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users manage bill edit history"
ON public.bill_edit_history FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE INDEX bill_edit_history_bill_id_idx ON public.bill_edit_history(bill_id, edited_at DESC);

CREATE OR REPLACE FUNCTION public.sync_bill_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.amount_paid, 0) >= COALESCE(NEW.total_amount, 0) - 0.001
     AND COALESCE(NEW.total_amount, 0) > 0 THEN
    NEW.payment_status := 'Paid';
  ELSIF COALESCE(NEW.amount_paid, 0) > 0 THEN
    NEW.payment_status := 'Partial';
  ELSE
    NEW.payment_status := 'Unpaid';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bills_sync_payment_status
BEFORE INSERT OR UPDATE OF amount_paid, total_amount ON public.bills
FOR EACH ROW EXECUTE FUNCTION public.sync_bill_payment_status();

UPDATE public.bills
SET payment_status = CASE
  WHEN COALESCE(amount_paid,0) >= COALESCE(total_amount,0) - 0.001 AND COALESCE(total_amount,0) > 0 THEN 'Paid'
  WHEN COALESCE(amount_paid,0) > 0 THEN 'Partial'
  ELSE 'Unpaid' END;