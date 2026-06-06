BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path TO public, extensions;

SELECT plan(28);

SELECT has_table('public', 'accounts', 'accounts table exists');
SELECT has_table('public', 'transfers', 'transfers table exists');
SELECT has_view('public', 'account_balances', 'account balances view exists');
SELECT has_column(
  'public',
  'transactions',
  'account_id',
  'transactions.account_id exists'
);
SELECT has_column(
  'public',
  'transactions',
  'transfer_id',
  'transactions.transfer_id exists'
);
SELECT col_not_null(
  'public',
  'transactions',
  'account_id',
  'transactions.account_id is required after backfill'
);
SELECT has_fk(
  'public',
  'transactions',
  'transactions_category_user_fkey',
  'transactions enforce category ownership'
);
SELECT has_check(
  'public',
  'transfers',
  'transfers_distinct_accounts_check',
  'transfers reject identical endpoints'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    'story-1-1-user-1@example.test',
    '{}'::jsonb
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    'story-1-1-user-2@example.test',
    '{}'::jsonb
  );

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.accounts
    WHERE user_id = '10000000-0000-0000-0000-000000000001'
      AND name = 'Conta principal'
      AND currency = 'BRL'
  ),
  1,
  'signup provisioning creates the default BRL account'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.transactions
    WHERE account_id IS NULL
  ),
  0,
  'migration leaves no transaction without an account'
);

SELECT throws_ok(
  $$
    INSERT INTO public.transactions (
      user_id,
      category_id,
      account_id,
      type,
      amount,
      description
    )
    SELECT
      '10000000-0000-0000-0000-000000000001',
      c.id,
      a.id,
      'expense',
      10,
      'cross-tenant category'
    FROM public.categories c
    CROSS JOIN public.accounts a
    WHERE c.user_id = '20000000-0000-0000-0000-000000000002'
      AND a.user_id = '10000000-0000-0000-0000-000000000001'
    LIMIT 1
  $$,
  '23503',
  NULL,
  'composite category FK rejects cross-tenant relationships'
);

SELECT throws_ok(
  $$
    INSERT INTO public.transfers (
      user_id,
      from_account_id,
      to_account_id,
      from_amount,
      to_amount
    )
    SELECT
      user_id,
      id,
      id,
      10,
      10
    FROM public.accounts
    WHERE user_id = '10000000-0000-0000-0000-000000000001'
    LIMIT 1
  $$,
  '23514',
  NULL,
  'database constraint rejects self-transfers'
);

INSERT INTO public.accounts (
  id,
  user_id,
  name,
  type,
  currency,
  initial_balance
) VALUES
  (
    '11000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000001',
    'Conta destino',
    'checking',
    'BRL',
    0
  ),
  (
    '12000000-0000-0000-0000-000000000012',
    '10000000-0000-0000-0000-000000000001',
    'Conta terceira',
    'checking',
    'BRL',
    0
  );

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.accounts
    WHERE user_id = '20000000-0000-0000-0000-000000000002'
  ),
  0,
  'RLS hides another user accounts'
);

SELECT throws_ok(
  $$
    INSERT INTO public.accounts (
      user_id,
      name,
      type,
      currency,
      initial_balance
    ) VALUES (
      '20000000-0000-0000-0000-000000000002',
      'Forbidden',
      'checking',
      'BRL',
      0
    )
  $$,
  '42501',
  NULL,
  'RLS rejects writes for another user'
);

SELECT lives_ok(
  $$
    SELECT public.create_transfer(
      (
        SELECT id
        FROM public.accounts
        WHERE user_id = '10000000-0000-0000-0000-000000000001'
          AND name = 'Conta principal'
      ),
      '11000000-0000-0000-0000-000000000011',
      25,
      NULL,
      'transfer under test',
      DATE '2026-06-06'
    )
  $$,
  'create_transfer succeeds for two owned accounts'
);

RESET ROLE;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.transfers
    WHERE user_id = '10000000-0000-0000-0000-000000000001'
      AND description = 'transfer under test'
  ),
  1,
  'create_transfer creates one transfer'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.transactions t
    JOIN public.transfers tr ON tr.id = t.transfer_id
    WHERE tr.description = 'transfer under test'
  ),
  2,
  'create_transfer atomically creates exactly two entries'
);

SELECT is(
  (
    SELECT count(DISTINCT t.account_id)::integer
    FROM public.transactions t
    JOIN public.transfers tr ON tr.id = t.transfer_id
    WHERE tr.description = 'transfer under test'
  ),
  2,
  'transfer entries belong to two distinct accounts'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

SELECT throws_ok(
  $$
    SELECT public.delete_account_reassign(
      (
        SELECT id
        FROM public.accounts
        WHERE user_id = '10000000-0000-0000-0000-000000000001'
          AND name = 'Conta principal'
      ),
      '11000000-0000-0000-0000-000000000011'
    )
  $$,
  'P0001',
  'Delete transfers between source and destination accounts before reassignment',
  'reassignment rejects accounts that are opposite transfer endpoints'
);

RESET ROLE;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.accounts
    WHERE user_id = '10000000-0000-0000-0000-000000000001'
  ),
  3,
  'failed reassignment keeps all source accounts'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.transfers
    WHERE description = 'transfer under test'
  ),
  1,
  'failed reassignment keeps the transfer intact'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.transactions t
    JOIN public.transfers tr ON tr.id = t.transfer_id
    WHERE tr.description = 'transfer under test'
  ),
  2,
  'failed reassignment keeps both transfer entries intact'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

SELECT lives_ok(
  $$
    SELECT public.create_transfer(
      '12000000-0000-0000-0000-000000000012',
      (
        SELECT id
        FROM public.accounts
        WHERE user_id = '10000000-0000-0000-0000-000000000001'
          AND name = 'Conta principal'
      ),
      5,
      NULL,
      'reassignable transfer',
      DATE '2026-06-06'
    )
  $$,
  'fixture creates a transfer that can be safely reassigned'
);

SELECT lives_ok(
  $$
    SELECT public.delete_account_reassign(
      '12000000-0000-0000-0000-000000000012',
      '11000000-0000-0000-0000-000000000011'
    )
  $$,
  'reassignment succeeds when it cannot create a self-transfer'
);

RESET ROLE;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.accounts
    WHERE id = '12000000-0000-0000-0000-000000000012'
  ),
  0,
  'successful reassignment deletes the source account'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.transfers tr
    JOIN public.accounts destination
      ON destination.id = tr.from_account_id
    JOIN public.accounts original_counterparty
      ON original_counterparty.id = tr.to_account_id
    WHERE tr.description = 'reassignable transfer'
      AND destination.id = '11000000-0000-0000-0000-000000000011'
      AND original_counterparty.name = 'Conta principal'
  ),
  1,
  'reassignment updates the transfer endpoint without collapsing both sides'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.transfers
    WHERE from_account_id = to_account_id
  ),
  0,
  'no reassignment leaves a self-transfer'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.transactions
    JOIN public.transfers
      ON transfers.id = transactions.transfer_id
      AND transfers.user_id = transactions.user_id
    WHERE (
        transactions.type = 'expense'
        AND transactions.account_id <> transfers.from_account_id
      )
      OR (
        transactions.type = 'income'
        AND transactions.account_id <> transfers.to_account_id
      )
  ),
  0,
  'transfer entries remain aligned with their respective endpoints'
);

SELECT * FROM finish();

ROLLBACK;
