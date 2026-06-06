-- Story 1.1: accounts, balances, manual exchange rates, and transfers.

CREATE TYPE public.account_type AS ENUM (
  'checking',
  'savings',
  'wallet',
  'investment'
);

CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 100),
  type public.account_type NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL'
    CHECK (currency ~ '^[A-Z]{3}$'),
  initial_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, user_id)
);

CREATE INDEX accounts_user_idx ON public.accounts(user_id);
CREATE INDEX accounts_user_currency_idx ON public.accounts(user_id, currency);

CREATE TABLE public.financial_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reporting_currency TEXT NOT NULL DEFAULT 'BRL'
    CHECK (reporting_currency ~ '^[A-Z]{3}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_currency TEXT NOT NULL CHECK (from_currency ~ '^[A-Z]{3}$'),
  to_currency TEXT NOT NULL CHECK (to_currency ~ '^[A-Z]{3}$'),
  rate NUMERIC(24,12) NOT NULL CHECK (rate > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_currency <> to_currency),
  UNIQUE (user_id, from_currency, to_currency),
  UNIQUE (id, user_id)
);

CREATE INDEX exchange_rates_user_pair_idx
  ON public.exchange_rates(user_id, from_currency, to_currency);

CREATE TABLE public.transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_account_id UUID NOT NULL,
  to_account_id UUID NOT NULL,
  from_amount NUMERIC(14,2) NOT NULL CHECK (from_amount > 0),
  to_amount NUMERIC(14,2) NOT NULL CHECK (to_amount > 0),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 200),
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),
  FOREIGN KEY (from_account_id, user_id)
    REFERENCES public.accounts(id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (to_account_id, user_id)
    REFERENCES public.accounts(id, user_id) ON DELETE RESTRICT
);

CREATE INDEX transfers_user_date_idx
  ON public.transfers(user_id, occurred_on DESC);
CREATE INDEX transfers_from_account_idx ON public.transfers(from_account_id);
CREATE INDEX transfers_to_account_idx ON public.transfers(to_account_id);

-- Existing data is BRL because the current application formats every value as BRL.
INSERT INTO public.accounts (user_id, name, type, currency, initial_balance)
SELECT p.id, 'Conta principal', 'checking', 'BRL', 0
FROM public.profiles p
ON CONFLICT DO NOTHING;

INSERT INTO public.accounts (user_id, name, type, currency, initial_balance)
SELECT DISTINCT t.user_id, 'Conta principal', 'checking', 'BRL', 0
FROM public.transactions t
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounts a WHERE a.user_id = t.user_id
);

INSERT INTO public.financial_settings (user_id, reporting_currency)
SELECT p.id, 'BRL'
FROM public.profiles p
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.transactions
  ADD COLUMN account_id UUID,
  ADD COLUMN transfer_id UUID;

UPDATE public.transactions t
SET account_id = (
  SELECT a.id
  FROM public.accounts a
  WHERE a.user_id = t.user_id
  ORDER BY a.created_at, a.id
  LIMIT 1
)
WHERE t.account_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.transactions WHERE account_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot enforce transactions.account_id: backfill left orphan rows';
  END IF;
END;
$$;

ALTER TABLE public.transactions
  ALTER COLUMN account_id SET NOT NULL,
  ADD CONSTRAINT transactions_account_user_fkey
    FOREIGN KEY (account_id, user_id)
    REFERENCES public.accounts(id, user_id) ON DELETE RESTRICT,
  ADD CONSTRAINT transactions_transfer_user_fkey
    FOREIGN KEY (transfer_id, user_id)
    REFERENCES public.transfers(id, user_id) ON DELETE RESTRICT;

CREATE INDEX transactions_user_account_date_idx
  ON public.transactions(user_id, account_id, occurred_on DESC);
CREATE INDEX transactions_transfer_idx
  ON public.transactions(transfer_id)
  WHERE transfer_id IS NOT NULL;

CREATE TRIGGER accounts_set_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER financial_settings_set_updated_at
  BEFORE UPDATE ON public.financial_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER exchange_rates_set_updated_at
  BEFORE UPDATE ON public.exchange_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER transfers_set_updated_at
  BEFORE UPDATE ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own accounts select"
  ON public.accounts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "own accounts insert"
  ON public.accounts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own accounts update"
  ON public.accounts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own accounts delete"
  ON public.accounts FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.transactions t WHERE t.account_id = accounts.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.transfers tr
      WHERE tr.from_account_id = accounts.id OR tr.to_account_id = accounts.id
    )
  );

CREATE POLICY "own financial settings"
  ON public.financial_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own exchange rates"
  ON public.exchange_rates FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own transfers select"
  ON public.transfers FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY "own transactions" ON public.transactions;
CREATE POLICY "own transactions select"
  ON public.transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "own transactions insert"
  ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND transfer_id IS NULL);
CREATE POLICY "own transactions update"
  ON public.transactions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND transfer_id IS NULL)
  WITH CHECK (auth.uid() = user_id AND transfer_id IS NULL);
CREATE POLICY "own transactions delete"
  ON public.transactions FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND transfer_id IS NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exchange_rates TO authenticated;
GRANT SELECT ON public.transfers TO authenticated;
GRANT ALL ON public.accounts, public.financial_settings, public.exchange_rates,
  public.transfers TO service_role;

CREATE VIEW public.account_balances
WITH (security_invoker = true) AS
SELECT
  a.id,
  a.user_id,
  a.name,
  a.type,
  a.currency,
  a.initial_balance,
  a.initial_balance
    + COALESCE(SUM(
        CASE
          WHEN t.type = 'income' THEN t.amount
          WHEN t.type = 'expense' THEN -t.amount
          ELSE 0
        END
      ), 0)::NUMERIC(14,2) AS balance,
  a.created_at,
  a.updated_at
FROM public.accounts a
LEFT JOIN public.transactions t ON t.account_id = a.id
GROUP BY a.id;

GRANT SELECT ON public.account_balances TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_transfer(
  p_from_account_id UUID,
  p_to_account_id UUID,
  p_from_amount NUMERIC,
  p_to_amount NUMERIC DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_occurred_on DATE DEFAULT CURRENT_DATE
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_from_currency TEXT;
  v_to_currency TEXT;
  v_to_amount NUMERIC(14,2);
  v_transfer_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_from_account_id = p_to_account_id THEN
    RAISE EXCEPTION 'Transfer accounts must be different';
  END IF;
  IF p_from_amount IS NULL OR p_from_amount <= 0 THEN
    RAISE EXCEPTION 'Source amount must be positive';
  END IF;

  SELECT currency INTO v_from_currency
  FROM public.accounts
  WHERE id = p_from_account_id AND user_id = v_user_id;
  SELECT currency INTO v_to_currency
  FROM public.accounts
  WHERE id = p_to_account_id AND user_id = v_user_id;

  IF v_from_currency IS NULL OR v_to_currency IS NULL THEN
    RAISE EXCEPTION 'Account not found or access denied';
  END IF;

  IF v_from_currency = v_to_currency THEN
    IF p_to_amount IS NOT NULL AND p_to_amount <> p_from_amount THEN
      RAISE EXCEPTION 'Same-currency transfers require equal amounts';
    END IF;
    v_to_amount := p_from_amount;
  ELSE
    IF p_to_amount IS NULL OR p_to_amount <= 0 THEN
      RAISE EXCEPTION 'Destination amount is required for cross-currency transfers';
    END IF;
    v_to_amount := p_to_amount;
  END IF;

  INSERT INTO public.transfers (
    user_id, from_account_id, to_account_id, from_amount, to_amount,
    description, occurred_on
  ) VALUES (
    v_user_id, p_from_account_id, p_to_account_id, p_from_amount, v_to_amount,
    NULLIF(trim(p_description), ''), p_occurred_on
  )
  RETURNING id INTO v_transfer_id;

  INSERT INTO public.transactions (
    user_id, account_id, type, amount, description, occurred_on, transfer_id
  ) VALUES
    (v_user_id, p_from_account_id, 'expense', p_from_amount,
      NULLIF(trim(p_description), ''), p_occurred_on, v_transfer_id),
    (v_user_id, p_to_account_id, 'income', v_to_amount,
      NULLIF(trim(p_description), ''), p_occurred_on, v_transfer_id);

  RETURN v_transfer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_transfer(
  p_transfer_id UUID,
  p_from_account_id UUID,
  p_to_account_id UUID,
  p_from_amount NUMERIC,
  p_to_amount NUMERIC DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_occurred_on DATE DEFAULT CURRENT_DATE
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_from_currency TEXT;
  v_to_currency TEXT;
  v_to_amount NUMERIC(14,2);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.transfers
    WHERE id = p_transfer_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Transfer not found or access denied';
  END IF;
  IF p_from_account_id = p_to_account_id THEN
    RAISE EXCEPTION 'Transfer accounts must be different';
  END IF;
  IF p_from_amount IS NULL OR p_from_amount <= 0 THEN
    RAISE EXCEPTION 'Source amount must be positive';
  END IF;

  SELECT currency INTO v_from_currency
  FROM public.accounts
  WHERE id = p_from_account_id AND user_id = v_user_id;
  SELECT currency INTO v_to_currency
  FROM public.accounts
  WHERE id = p_to_account_id AND user_id = v_user_id;

  IF v_from_currency IS NULL OR v_to_currency IS NULL THEN
    RAISE EXCEPTION 'Account not found or access denied';
  END IF;

  IF v_from_currency = v_to_currency THEN
    IF p_to_amount IS NOT NULL AND p_to_amount <> p_from_amount THEN
      RAISE EXCEPTION 'Same-currency transfers require equal amounts';
    END IF;
    v_to_amount := p_from_amount;
  ELSE
    IF p_to_amount IS NULL OR p_to_amount <= 0 THEN
      RAISE EXCEPTION 'Destination amount is required for cross-currency transfers';
    END IF;
    v_to_amount := p_to_amount;
  END IF;

  UPDATE public.transfers
  SET from_account_id = p_from_account_id,
      to_account_id = p_to_account_id,
      from_amount = p_from_amount,
      to_amount = v_to_amount,
      description = NULLIF(trim(p_description), ''),
      occurred_on = p_occurred_on
  WHERE id = p_transfer_id AND user_id = v_user_id;

  UPDATE public.transactions
  SET account_id = p_from_account_id,
      amount = p_from_amount,
      description = NULLIF(trim(p_description), ''),
      occurred_on = p_occurred_on
  WHERE transfer_id = p_transfer_id AND user_id = v_user_id AND type = 'expense';

  UPDATE public.transactions
  SET account_id = p_to_account_id,
      amount = v_to_amount,
      description = NULLIF(trim(p_description), ''),
      occurred_on = p_occurred_on
  WHERE transfer_id = p_transfer_id AND user_id = v_user_id AND type = 'income';

  IF (
    SELECT count(*)
    FROM public.transactions
    WHERE transfer_id = p_transfer_id AND user_id = v_user_id
  ) <> 2 THEN
    RAISE EXCEPTION 'Transfer must contain exactly two transaction entries';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_transfer(
  p_transfer_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.transfers
    WHERE id = p_transfer_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Transfer not found or access denied';
  END IF;

  DELETE FROM public.transactions
  WHERE transfer_id = p_transfer_id AND user_id = v_user_id;
  DELETE FROM public.transfers
  WHERE id = p_transfer_id AND user_id = v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_account_reassign(
  p_account_id UUID,
  p_destination_account_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_source_currency TEXT;
  v_destination_currency TEXT;
  v_source_initial_balance NUMERIC(14,2);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_account_id = p_destination_account_id THEN
    RAISE EXCEPTION 'Destination account must be different';
  END IF;

  SELECT currency, initial_balance
  INTO v_source_currency, v_source_initial_balance
  FROM public.accounts
  WHERE id = p_account_id AND user_id = v_user_id;
  SELECT currency INTO v_destination_currency
  FROM public.accounts
  WHERE id = p_destination_account_id AND user_id = v_user_id;

  IF v_source_currency IS NULL OR v_destination_currency IS NULL THEN
    RAISE EXCEPTION 'Account not found or access denied';
  END IF;
  IF v_source_currency <> v_destination_currency THEN
    RAISE EXCEPTION 'Destination account must use the same currency';
  END IF;

  UPDATE public.accounts
  SET initial_balance = initial_balance + v_source_initial_balance
  WHERE id = p_destination_account_id AND user_id = v_user_id;

  UPDATE public.transactions
  SET account_id = p_destination_account_id
  WHERE account_id = p_account_id AND user_id = v_user_id;

  UPDATE public.transfers
  SET from_account_id = p_destination_account_id
  WHERE from_account_id = p_account_id AND user_id = v_user_id;

  UPDATE public.transfers
  SET to_account_id = p_destination_account_id
  WHERE to_account_id = p_account_id AND user_id = v_user_id;

  DELETE FROM public.accounts
  WHERE id = p_account_id AND user_id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_transfer(UUID, UUID, NUMERIC, NUMERIC, TEXT, DATE)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_transfer(UUID, UUID, UUID, NUMERIC, NUMERIC, TEXT, DATE)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_transfer(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_account_reassign(UUID, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_transfer(UUID, UUID, NUMERIC, NUMERIC, TEXT, DATE)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_transfer(UUID, UUID, UUID, NUMERIC, NUMERIC, TEXT, DATE)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_transfer(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_account_reassign(UUID, UUID)
  TO authenticated, service_role;

-- Extend signup provisioning with a default BRL account and reporting settings.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

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

  INSERT INTO public.accounts (user_id, name, type, currency, initial_balance)
  VALUES (NEW.id, 'Conta principal', 'checking', 'BRL', 0);

  INSERT INTO public.financial_settings (user_id, reporting_currency)
  VALUES (NEW.id, 'BRL');

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
