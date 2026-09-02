ALTER TABLE public.ledger_entries
  ADD COLUMN related_salary_payment_id uuid REFERENCES public.salary_payments(id) ON DELETE SET NULL,
  ADD COLUMN related_advance_id uuid REFERENCES public.employee_advances(id) ON DELETE SET NULL;
CREATE INDEX ledger_entries_salary_idx ON public.ledger_entries(related_salary_payment_id);
CREATE INDEX ledger_entries_advance_idx ON public.ledger_entries(related_advance_id);