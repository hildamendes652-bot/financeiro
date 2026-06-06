# Story 1.1 Data Design

## Entities

- `accounts`: user-owned financial accounts with type, ISO-style currency code,
  and initial balance.
- `financial_settings`: one reporting currency per user.
- `exchange_rates`: manual user-owned rates for a directed currency pair.
- `transfers`: transfer header linking source and destination accounts and the
  two monetary amounts.
- `transactions`: extended with required `account_id` and optional
  `transfer_id`.
- `account_balances`: security-invoker view deriving balances from initial
  balance and transactions.

## Integrity

- Composite foreign keys include `user_id` to prevent cross-user references.
- Direct transaction mutations can only operate on non-transfer transactions.
- Transfer mutations run through security-definer RPCs that validate
  `auth.uid()` and update both transaction sides atomically.
- Account deletion with history runs through an RPC that requires a destination
  account in the same currency, transfers the source initial balance, and
  reassigns history before deletion.
- Account foreign keys use `RESTRICT`; transactions are never deleted by account
  cascade.
- Monetary columns use `NUMERIC`; currency codes require three uppercase
  letters.

## Migration

1. Create Story 1.1 entities.
2. Create a BRL "Conta principal" for existing profiles.
3. Add nullable account and transfer references to transactions.
4. Backfill all transactions to the user's first account.
5. Abort if any transaction remains without an account.
6. Make `account_id` required and install constraints, indexes, RLS, view, and
   RPCs.
7. Extend signup provisioning.

BRL is used for existing data because the pre-migration application formats all
stored amounts as BRL.

## Operations

The migration was prepared locally but not applied. The workspace has no
Supabase CLI or `psql`, and no live database mutation was authorized. Apply only
after snapshot, dry run, and RLS tests in a disposable environment.

Rollback:

`supabase/rollbacks/20260606140000_accounts_balances_multicurrency.rollback.sql`
