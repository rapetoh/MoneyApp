-- 040: Budget rollover (Oct 2026).
--
-- `rollover`: what was left (or overspent) in each past period carries
-- into the current one. Off by default, so every existing budget reads
-- exactly as before.
--
-- `rollover_carry_in`: the balance a budget inherited from the one it
-- replaced. Editing a budget retires the row and inserts a new one with a
-- new `starts_at` (one active budget per scope, migration 027), which would
-- otherwise drop every rolled-over dollar on each edit. The client that
-- saves the replacement computes the old row's carry through the shared
-- `budgetStatus` (packages/shared/src/domain/budget.ts) and stores it here.
--
-- Additive only: apps that predate this migration never read either column.

BEGIN;

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS rollover boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rollover_carry_in numeric(12, 2) NOT NULL DEFAULT 0;

COMMIT;
