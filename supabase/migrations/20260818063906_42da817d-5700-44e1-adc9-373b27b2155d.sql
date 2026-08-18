ALTER TABLE public.delivery_notes ADD COLUMN IF NOT EXISTS last_edited_at timestamptz;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.bill_items ADD COLUMN IF NOT EXISTS pending_quantity numeric NOT NULL DEFAULT 0;
ALTER TABLE public.bill_items ADD COLUMN IF NOT EXISTS item_note text;
ALTER TABLE public.bill_items ADD COLUMN IF NOT EXISTS pending_resolved_at timestamptz;