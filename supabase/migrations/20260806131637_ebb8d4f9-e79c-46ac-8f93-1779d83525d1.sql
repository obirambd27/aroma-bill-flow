ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS anniversary_date date;

CREATE TABLE public.customer_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_tags TO authenticated;
GRANT ALL ON public.customer_tags TO service_role;
ALTER TABLE public.customer_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage customer tags" ON public.customer_tags
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.customer_tag_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.customer_tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, tag_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_tag_assignments TO authenticated;
GRANT ALL ON public.customer_tag_assignments TO service_role;
ALTER TABLE public.customer_tag_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage tag assignments" ON public.customer_tag_assignments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_customer_tag_assignments_customer ON public.customer_tag_assignments(customer_id);

CREATE TABLE public.customer_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  activity_type text NOT NULL DEFAULT 'Note',
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_activities TO authenticated;
GRANT ALL ON public.customer_activities TO service_role;
ALTER TABLE public.customer_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage customer activities" ON public.customer_activities
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_customer_activities_customer ON public.customer_activities(customer_id, created_at DESC);

CREATE TABLE public.customer_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  title text NOT NULL,
  due_date date NOT NULL,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_reminders TO authenticated;
GRANT ALL ON public.customer_reminders TO service_role;
ALTER TABLE public.customer_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage customer reminders" ON public.customer_reminders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_customer_reminders_due ON public.customer_reminders(is_completed, due_date);

INSERT INTO public.customer_tags (name, color) VALUES
  ('VIP', 'amber'),
  ('Wholesale', 'plum'),
  ('Walk-in', 'slate'),
  ('New', 'emerald')
ON CONFLICT (name) DO NOTHING;