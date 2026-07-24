-- Migration 008 — Recurring-generated transaction de-duplication.
--
-- Background. Two writers produce recurring-generated transactions:
--   1. The `generate-recurring` Edge Function, scheduled daily via pg_cron.
--   2. The client-side `runRecurringCatchUp` in `apps/mobile/src/services/
--      recurringCatchUp.ts`, fired on every app launch as a backup for users
--      who skip a day.
-- Both compute the same target `transacted_at` from a rule's `last_generated`
-- field. If the mobile client reads a stale `last_generated` (because the
-- server's update hasn't propagated yet) it will re-generate an occurrence
-- the server already produced. Each writer mints its own UUID, so neither
-- the primary key nor the existing `version` column blocks the duplicate.
-- The user ends up with two paychecks for the month, or two Netflix charges
-- on the same Tuesday, and their budget math drifts by exactly the rule
-- amount.
--
-- Fix: a partial unique index on (user_id, recurring_rule_id, transacted_at::date),
-- limited to live (non-soft-deleted) recurring-generated rows. The first
-- write of any (rule, date) pair wins; the second fails with a Postgres
-- 23505 (unique_violation). Mobile's sync manager treats 23505 on this
-- index as "server already created this" and drops the queue entry
-- without retry. Manual / voice / scan transactions all have
-- `recurring_rule_id IS NULL` and are exempt from the index.

BEGIN;

-- Step 1 — Soft-delete any duplicates already on disk. Keep the earliest
-- row by `created_at` (typically the server cron's). Subsequent rows are
-- soft-deleted so the new unique index can be built without conflicting
-- with historical bad data, and so a user can recover them if needed
-- (a soft-delete still has the row).
WITH dupes AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, recurring_rule_id, (transacted_at AT TIME ZONE 'UTC')::date
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.transactions
  WHERE recurring_rule_id IS NOT NULL
    AND is_deleted = false
)
UPDATE public.transactions AS t
SET is_deleted = true,
    deleted_at = now(),
    version    = t.version + 1,
    updated_at = now()
FROM dupes
WHERE t.id = dupes.id
  AND dupes.rn > 1;

-- Step 2 — Partial unique index. Postgres treats NULL values as distinct
-- by default, so non-recurring rows (recurring_rule_id IS NULL) are not
-- considered duplicates of each other. We tighten further with a partial
-- predicate so soft-deleted rows can co-exist (user soft-deletes one,
-- undoes the delete, no conflict).
CREATE UNIQUE INDEX idx_txn_recurring_dedup
ON public.transactions (
  user_id,
  recurring_rule_id,
  ((transacted_at AT TIME ZONE 'UTC')::date)
)
WHERE recurring_rule_id IS NOT NULL
  AND is_deleted = false;

COMMIT;
