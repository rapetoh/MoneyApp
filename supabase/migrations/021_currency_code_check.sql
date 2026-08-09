-- Migration 021 — currency_code format CHECK on transactions
-- (fix-plan 1.7, "a typed parse boundary" — audit 02-F11).
--
-- `validateParsedExpense` (packages/ai/src/validateParsedExpense.ts)
-- already rejects any currency that isn't a real ISO 4217 code before a
-- parse response reaches a save path, and `validateTransactionWriteFields`
-- runs the same check as `createTransaction`'s last line of defence. This
-- migration is the belt to that suspenders: today `currency_code` fails
-- *silently*, not loudly — a bogus value still satisfies `NOT NULL`, syncs
-- cleanly, and then the FX snapshot has nothing to convert against, so
-- the row counts as $0 in every total forever. A CHECK constraint turns
-- that into a write-time rejection (surfaced to the caller as a Postgres
-- `23514`, the same class `retryPolicy.ts` — fix-plan 1.6 — already
-- dead-letters immediately rather than retrying) instead of a permanent,
-- invisible zero.
--
-- The check is a format check — three uppercase letters — not the full
-- ISO 4217 allow-list `validateParsedExpense` enforces. A regex is what
-- the fix-plan text specifies here; the allow-list is deliberately kept
-- at the application boundary, where it's a `Set` update rather than a
-- migration when a currency is added or deprecated.

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_currency_code_format
  CHECK (currency_code ~ '^[A-Z]{3}$');
