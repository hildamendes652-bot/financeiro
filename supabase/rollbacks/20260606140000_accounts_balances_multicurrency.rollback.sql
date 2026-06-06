-- Rollback for 20260606140000_accounts_balances_multicurrency.sql.
-- WARNING: Removes account, exchange-rate, and transfer data introduced by Story 1.1.

BEGIN;

DROP VIEW IF EXISTS public.account_balances;

DROP FUNCTION IF EXISTS public.delete_account_reassign(UUID, UUID);
DROP FUNCTION IF EXISTS public.delete_transfer(UUID);
DROP FUNCTION IF EXISTS public.update_transfer(UUID, UUID, UUID, NUMERIC, NUMERIC, TEXT, DATE);
DROP FUNCTION IF EXISTS public.create_transfer(UUID, UUID, NUMERIC, NUMERIC, TEXT, DATE);

DROP POLICY IF EXISTS "own transactions select" ON public.transactions;
DROP POLICY IF EXISTS "own transactions insert" ON public.transactions;
DROP POLICY IF EXISTS "own transactions update" ON public.transactions;
DROP POLICY IF EXISTS "own transactions delete" ON public.transactions;

-- Transfer entries did not exist before Story 1.1 and must not become
-- ordinary income/expense rows when transfer_id is removed.
DELETE FROM public.transactions
WHERE transfer_id IS NOT NULL;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_transfer_user_fkey,
  DROP CONSTRAINT IF EXISTS transactions_account_user_fkey,
  DROP CONSTRAINT IF EXISTS transactions_category_user_fkey,
  DROP COLUMN IF EXISTS transfer_id,
  DROP COLUMN IF EXISTS account_id;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_category_id_fkey
    FOREIGN KEY (category_id)
    REFERENCES public.categories(id) ON DELETE SET NULL;

ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_id_user_key;

CREATE POLICY "own transactions"
  ON public.transactions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TABLE IF EXISTS public.transfers;
DROP TABLE IF EXISTS public.exchange_rates;
DROP TABLE IF EXISTS public.financial_settings;
DROP TABLE IF EXISTS public.accounts;
DROP TYPE IF EXISTS public.account_type;

-- Restore signup provisioning without Story 1.1 entities.
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
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

COMMIT;
