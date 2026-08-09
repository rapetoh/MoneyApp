-- Migration 022 — categories.kind: the missing concept of a transfer
-- (fix-plan 1.4 "One money and aggregation module" — audit 05-F2, 05-F12,
-- 05-F29, 05-F32, 07-F8, 07-F28, 07-F29, 07-F30, 06-F34, 08-F13, 02-F17).
--
-- Background. Every aggregation in the app classified a transaction as
-- spend or income purely from `direction` (`debit`/`credit`). There was
-- no data-model concept of a transfer, so a $300 Schwab investment
-- contribution — a `debit` — counted as consumption in every total
-- while every figure labelled "saved" read $0 on the same screen. In
-- production this showed up as a real transaction filed under
-- "Savings & Investing" rendering as an ordinary expense category on
-- the web Overview's MindMap lens.
--
-- Fix. `categories.kind` classifies how a category's transactions
-- contribute to aggregation: `'spend'` (the default — ordinary
-- consumption), `'income'`, or `'transfer'` (money relocated, not
-- earned or spent — savings and investment contributions). A column on
-- `categories` rather than a per-transaction flag because it is
-- user-editable (re-categorising a transaction re-classifies it) and
-- survives re-categorisation. `packages/shared/src/domain/money.ts`
-- (already landed) exports the `CategoryKind` union these three
-- literals mirror, and `classifyFlow()`/`isSpend()` are the predicates
-- that consume this column once callers join it in.
--
-- `default_categories` gets the same column so `seedCategories` (which
-- copies `default_categories` rows into a new user's `categories`) has
-- a `kind` to carry over, and "Savings & Investing" — the one seeded
-- category that has always meant "money relocated, not spent" — is set
-- to `'transfer'` there, matching `DEFAULT_TRANSFER_CATEGORY_NAMES` in
-- money.ts (the name-based fallback that predates this column and
-- keeps working for existing categories row this migration cannot see,
-- e.g. a user's own renamed copy).

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'spend'
  CONSTRAINT categories_kind_check CHECK (kind IN ('spend', 'income', 'transfer'));

-- Migrate existing rows by category name once. Every category literally
-- named "Savings & Investing" — the only default category that has ever
-- meant "transfer" — becomes a transfer category going forward instead
-- of relying solely on the name-match fallback in money.ts.
UPDATE public.categories
   SET kind = 'transfer'
 WHERE kind = 'spend'
   AND name = 'Savings & Investing';

ALTER TABLE public.default_categories
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'spend'
  CONSTRAINT default_categories_kind_check CHECK (kind IN ('spend', 'income', 'transfer'));

UPDATE public.default_categories
   SET kind = 'transfer'
 WHERE name = 'Savings & Investing';
