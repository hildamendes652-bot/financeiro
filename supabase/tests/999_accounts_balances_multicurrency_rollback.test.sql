CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path TO public, extensions;

SELECT plan(12);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  '30000000-0000-0000-0000-000000000003',
  'story-1-1-rollback@example.test',
  '{}'::jsonb
);

INSERT INTO public.accounts (
  id,
  user_id,
  name,
  type,
  currency,
  initial_balance
) VALUES (
  '31000000-0000-0000-0000-000000000031',
  '30000000-0000-0000-0000-000000000003',
  'Rollback destination',
  'checking',
  'BRL',
  0
);

INSERT INTO public.transactions (
  user_id,
  account_id,
  type,
  amount,
  description
)
SELECT
  a.user_id,
  a.id,
  'income',
  99,
  'ordinary row survives rollback'
FROM public.accounts a
WHERE a.user_id = '30000000-0000-0000-0000-000000000003'
ORDER BY a.created_at, a.id
LIMIT 1;

SET ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '30000000-0000-0000-0000-000000000003',
  false
);

SELECT lives_ok(
  $$
    SELECT public.create_transfer(
      (
        SELECT id
        FROM public.accounts
        WHERE user_id = '30000000-0000-0000-0000-000000000003'
          AND name = 'Conta principal'
      ),
      '31000000-0000-0000-0000-000000000031',
      10,
      NULL,
      'rollback transfer rows',
      DATE '2026-06-06'
    )
  $$,
  'rollback fixture creates transfer entries'
);

RESET ROLE;

\ir ../rollbacks/20260606140000_accounts_balances_multicurrency.rollback.sql

SELECT hasnt_table('public', 'accounts', 'rollback removes accounts');
SELECT hasnt_table('public', 'transfers', 'rollback removes transfers');
SELECT hasnt_view(
  'public',
  'account_balances',
  'rollback removes account balances view'
);
SELECT hasnt_column(
  'public',
  'transactions',
  'account_id',
  'rollback removes transactions.account_id'
);
SELECT hasnt_column(
  'public',
  'transactions',
  'transfer_id',
  'rollback removes transactions.transfer_id'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.transactions
    WHERE description = 'rollback transfer rows'
  ),
  0,
  'rollback removes movements created by transfers'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.transactions
    WHERE description = 'ordinary row survives rollback'
  ),
  1,
  'rollback preserves ordinary movements'
);
SELECT has_fk(
  'public',
  'transactions',
  'transactions_category_id_fkey',
  'rollback restores the original category foreign key'
);

\ir ../migrations/20260606140000_accounts_balances_multicurrency.sql

SELECT has_column(
  'public',
  'transactions',
  'account_id',
  'migration can be reapplied after rollback'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.transactions
    WHERE description = 'ordinary row survives rollback'
      AND account_id IS NULL
  ),
  0,
  'reapplied migration backfills the legacy transaction account'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.transactions t
    JOIN public.accounts a
      ON a.id = t.account_id
      AND a.user_id = t.user_id
    WHERE t.description = 'ordinary row survives rollback'
  ),
  1,
  'backfilled transaction references an account owned by the same user'
);

SELECT * FROM finish();
