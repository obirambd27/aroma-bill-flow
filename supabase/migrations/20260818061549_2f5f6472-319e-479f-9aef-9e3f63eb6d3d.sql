ALTER TABLE public.delivery_notes
  ADD COLUMN IF NOT EXISTS buyer_name text,
  ADD COLUMN IF NOT EXISTS buyer_address text,
  ADD COLUMN IF NOT EXISTS buyer_tel text,
  ADD COLUMN IF NOT EXISTS marka text,
  ADD COLUMN IF NOT EXISTS cargo_transport text,
  ADD COLUMN IF NOT EXISTS cargo_phone text,
  ADD COLUMN IF NOT EXISTS total_amount numeric,
  ADD COLUMN IF NOT EXISTS advance_amount numeric,
  ADD COLUMN IF NOT EXISTS balance_amount numeric,
  ADD COLUMN IF NOT EXISTS bill_id uuid REFERENCES public.bills(id) ON DELETE SET NULL;

ALTER TABLE public.delivery_note_items
  ADD COLUMN IF NOT EXISTS carton_bag_count text;

CREATE INDEX IF NOT EXISTS delivery_notes_bill_id_idx ON public.delivery_notes(bill_id);