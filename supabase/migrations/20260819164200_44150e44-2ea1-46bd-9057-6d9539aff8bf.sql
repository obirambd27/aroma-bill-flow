ALTER TABLE public.ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_related_payment_id_fkey;
ALTER TABLE public.ledger_entries
  ADD CONSTRAINT ledger_entries_related_payment_id_fkey
  FOREIGN KEY (related_payment_id) REFERENCES public.payments_received(id) ON DELETE CASCADE;