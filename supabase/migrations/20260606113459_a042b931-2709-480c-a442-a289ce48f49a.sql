
-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- CATEGORIES
CREATE TYPE public.tx_type AS ENUM ('income','expense');

CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.tx_type NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b6fa0',
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX categories_user_idx ON public.categories(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own categories" ON public.categories FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- TRANSACTIONS
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  type public.tx_type NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  description TEXT,
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX transactions_user_date_idx ON public.transactions(user_id, occurred_on DESC);
CREATE INDEX transactions_user_type_idx ON public.transactions(user_id, type);
CREATE INDEX transactions_user_cat_idx ON public.transactions(user_id, category_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own transactions" ON public.transactions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER transactions_set_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile + default categories on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  INSERT INTO public.categories (user_id, name, type, color, icon) VALUES
    (NEW.id, 'Salário', 'income', '#0d7a5f', 'wallet'),
    (NEW.id, 'Freelance', 'income', '#3b6fa0', 'briefcase'),
    (NEW.id, 'Investimentos', 'income', '#c9a84c', 'trending-up'),
    (NEW.id, 'Outros (Receita)', 'income', '#6b7280', 'plus-circle'),
    (NEW.id, 'Alimentação', 'expense', '#dc2626', 'utensils'),
    (NEW.id, 'Transporte', 'expense', '#ea580c', 'car'),
    (NEW.id, 'Moradia', 'expense', '#0f1b3d', 'home'),
    (NEW.id, 'Saúde', 'expense', '#0891b2', 'heart-pulse'),
    (NEW.id, 'Lazer', 'expense', '#7c3aed', 'gamepad-2'),
    (NEW.id, 'Educação', 'expense', '#1e3a5f', 'graduation-cap'),
    (NEW.id, 'Compras', 'expense', '#db2777', 'shopping-bag'),
    (NEW.id, 'Outros (Despesa)', 'expense', '#6b7280', 'more-horizontal');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
