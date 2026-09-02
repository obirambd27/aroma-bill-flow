CREATE TABLE public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  phone text,
  email text,
  join_date date,
  salary_type text not null default 'Fixed Monthly',
  base_salary numeric default 0,
  commission_rate numeric,
  default_payment_method text,
  default_account_id uuid references public.accounts(id) on delete set null,
  is_active boolean not null default true,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage employees" ON public.employees FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE SEQUENCE public.salary_payment_number_seq;

CREATE TABLE public.salary_payments (
  id uuid primary key default gen_random_uuid(),
  payment_number text unique,
  employee_id uuid not null references public.employees(id) on delete cascade,
  period_label text not null default '',
  period_start date,
  period_end date,
  base_amount numeric not null default 0,
  bonus_amount numeric not null default 0,
  bonus_note text,
  deduction_amount numeric not null default 0,
  deduction_note text,
  advance_deducted numeric not null default 0,
  net_amount numeric not null default 0,
  payment_date date not null default current_date,
  payment_method text not null default 'Cash',
  account_id uuid references public.accounts(id) on delete set null,
  payment_status text not null default 'Paid',
  amount_paid numeric not null default 0,
  notes text,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salary_payments TO authenticated;
GRANT ALL ON public.salary_payments TO service_role;
ALTER TABLE public.salary_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage salary payments" ON public.salary_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_salary_payment_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_number IS NULL OR NEW.payment_number = '' THEN
    NEW.payment_number := 'SAL-' || lpad(nextval('public.salary_payment_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER salary_payments_number BEFORE INSERT ON public.salary_payments
FOR EACH ROW EXECUTE FUNCTION public.set_salary_payment_number();

CREATE TABLE public.employee_advances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  advance_date date not null default current_date,
  amount numeric not null default 0,
  reason text,
  amount_recovered numeric not null default 0,
  status text not null default 'Outstanding',
  account_id uuid references public.accounts(id) on delete set null,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_advances TO authenticated;
GRANT ALL ON public.employee_advances TO service_role;
ALTER TABLE public.employee_advances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage employee advances" ON public.employee_advances FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX salary_payments_employee_idx ON public.salary_payments(employee_id, payment_date DESC);
CREATE INDEX employee_advances_employee_idx ON public.employee_advances(employee_id, advance_date DESC);

CREATE TRIGGER employees_updated_at BEFORE UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();