-- Migration 027 — budget invariants (fix-plan 2.5, "One budget window,
-- one budget status" — audit 04-F9, 04-F12, 04-F28, 04-F34, 05-F5,
-- 05-F17, 05-F18, 05-F23, 05-F31, 08-F14, 08-F15, 08-F16, 08-F46).
--
-- Before this migration, "at most one active overall budget per user"
-- and "at most one active budget per (user, category)" were application
-- conventions, enforced by a web `.eq('category_id', null)` deactivation
-- query that never actually matched a row — PostgREST's `eq.null` is
-- literal-value equality, not `IS NULL` — so every "Save" on the overall
-- budget form appended a new active row instead of retiring the old one.
-- `budgets/page.tsx`, `useBudget.ts` and Ask Murmur's budget lookups each
-- independently picked "the most recent" or "the first" active row and
-- could therefore each render a different budget for the same user.
--
-- These two partial unique indexes make the invariant the database's
-- job rather than a client query's. The application code (fix-plan 2.5)
-- now also deactivates correctly via `.is('category_id', null)`, but the
-- index is the backstop: a second writer, a retried request, or a bug
-- in a future call site cannot silently create two active budgets in
-- the same scope again.
--
-- `is_deleted` is excluded from both predicates (fix-plan 1.6's sync
-- contract) so a soft-deleted budget never blocks a legitimate new one
-- from being created in its place.

BEGIN;

-- Deactivate the accumulated duplicates first — the exact production
-- consequence of the no-op deactivation bug above — keeping the most
-- recently created active row in each scope, or `CREATE UNIQUE INDEX`
-- below fails against live data rather than only guarding it going
-- forward.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, category_id
           ORDER BY created_at DESC
         ) AS rn
  FROM public.budgets
  WHERE is_active AND NOT is_deleted
)
UPDATE public.budgets b
SET is_active = false
FROM ranked
WHERE b.id = ranked.id AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_one_active_overall
  ON public.budgets (user_id)
  WHERE category_id IS NULL AND is_active AND NOT is_deleted;

CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_one_active_per_category
  ON public.budgets (user_id, category_id)
  WHERE category_id IS NOT NULL AND is_active AND NOT is_deleted;

COMMIT;
