ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS terms_and_conditions text,
  ADD COLUMN IF NOT EXISTS default_payment_terms text NOT NULL DEFAULT 'Due on Receipt';