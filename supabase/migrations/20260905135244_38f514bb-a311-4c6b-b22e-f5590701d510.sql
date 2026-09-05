CREATE TABLE public.reconcile_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('payments','stock')),
  trigger text NOT NULL CHECK (trigger IN ('Manual','Auto-on-Edit')),
  success boolean NOT NULL DEFAULT true,
  issues_found integer NOT NULL DEFAULT 0,
  issues_corrected integer NOT NULL DEFAULT 0,
  summary text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.reconcile_runs TO authenticated;
GRANT ALL ON public.reconcile_runs TO service_role;

ALTER TABLE public.reconcile_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read reconcile runs"
  ON public.reconcile_runs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can log reconcile runs"
  ON public.reconcile_runs FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX reconcile_runs_kind_created_idx
  ON public.reconcile_runs (kind, created_at DESC);