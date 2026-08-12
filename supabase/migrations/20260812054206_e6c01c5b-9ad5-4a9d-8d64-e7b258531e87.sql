CREATE TABLE public.bill_delete_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_id uuid,
  bill_number text,
  bill_date date,
  customer_name text,
  total_amount numeric NOT NULL DEFAULT 0,
  reason text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.bill_delete_log TO authenticated;
GRANT ALL ON public.bill_delete_log TO service_role;

ALTER TABLE public.bill_delete_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view delete log"
  ON public.bill_delete_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can add delete log entries"
  ON public.bill_delete_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX bill_delete_log_deleted_at_idx ON public.bill_delete_log (deleted_at DESC);