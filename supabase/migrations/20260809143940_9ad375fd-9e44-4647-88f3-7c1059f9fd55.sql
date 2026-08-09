ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS business_tagline text,
  ADD COLUMN IF NOT EXISTS bank_payment_details text,
  ADD COLUMN IF NOT EXISTS signature_url text;