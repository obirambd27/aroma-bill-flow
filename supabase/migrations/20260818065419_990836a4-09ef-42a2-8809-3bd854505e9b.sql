ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS whatsapp_qr_link text,
  ADD COLUMN IF NOT EXISTS whatsapp_qr_name text,
  ADD COLUMN IF NOT EXISTS google_review_qr_link text,
  ADD COLUMN IF NOT EXISTS google_review_qr_name text;