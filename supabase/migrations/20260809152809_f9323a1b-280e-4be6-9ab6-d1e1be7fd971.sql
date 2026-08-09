CREATE TABLE public.day_book_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_date date NOT NULL UNIQUE,
  opening_cash numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.day_book_overrides TO authenticated;
GRANT ALL ON public.day_book_overrides TO service_role;
ALTER TABLE public.day_book_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage day book overrides" ON public.day_book_overrides FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER day_book_overrides_updated_at BEFORE UPDATE ON public.day_book_overrides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();