-- Migration 028 — `deleted_at` on the three generic-store sync-contract
-- tables (fix-plan 3.3 "Recurring rule CRUD" / 3.7 "A sync surface that
-- reports reality").
--
-- Background. Migration 018 gave `categories`, `budgets` and
-- `recurring_rules` the same sync contract as `transactions`
-- (`client_id`, `version`, `is_deleted`, `synced_at`) — its own comment
-- calls this "the same sync contract" — but only `transactions` carries
-- a `deleted_at` column (migration 001). `entityRegistry.ts`'s shared
-- `versionGuardedDelete()`, written against that "same contract" for
-- all four entities, has always included `deleted_at: payload.deleted_at
-- ?? null` in its `.update()` call regardless of entity type — so a
-- queued delete for a category, a budget or a recurring rule would fail
-- with PostgREST 400 "column deleted_at does not exist" the first time
-- any of those three hooks actually enqueued one. Nothing has, yet
-- (`useCategories`/`useBudget`/`useRecurringRules` still write online-
-- only), which is exactly why this has sat unobserved since Stage 1.
--
-- 3.3 gives `useRecurringRules.deleteRule` a real soft delete (the
-- fix-plan's explicit "delete (soft)" requirement, replacing a hard
-- `.delete()` that left no trace and bypassed the `is_deleted`
-- contract). That write needs `deleted_at` to exist server-side — fixing
-- it for `recurring_rules` alone and leaving `categories`/`budgets`
-- mismatched from the "same sync contract" they were explicitly built
-- to share is the kind of partial fix this project's owner has
-- rejected; all three get the column in the same migration that
-- discovered the gap.

BEGIN;

ALTER TABLE public.categories       ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.budgets          ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.recurring_rules  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.recurring_rules.deleted_at IS
  'Set by deleteRule() (apps/mobile/src/hooks/useRecurringRules.ts) and '
  'apps/web/src/app/dashboard/recurring/page.tsx alongside is_deleted = '
  'true. Nullable, no default — mirrors transactions.deleted_at.';

COMMIT;
