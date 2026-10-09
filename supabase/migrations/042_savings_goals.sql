-- 042: Savings goals (Oct 2026).
--
-- "Save $2,000 for Lagos by June." A goal is a target and, optionally, a
-- date; progress is the money the person puts toward it, one contribution
-- at a time (a negative contribution is money taken back out). Murmur has
-- no bank connection, so contributions are recorded, never inferred.
--
-- Amounts are in the profile's currency, like budgets; the change-currency
-- function converts both tables with everything else.
--
-- Additive only: nothing reads these tables until the app version that
-- writes them.

BEGIN;

CREATE TABLE IF NOT EXISTS public.savings_goals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name           text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  target_amount  numeric(12, 2) NOT NULL CHECK (target_amount > 0),
  currency_code  text NOT NULL DEFAULT 'USD',
  -- Optional deadline, a civil day in the profile's zone.
  target_date    date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- Removed from the list but kept, with its history, for exports.
  archived_at    timestamptz
);

CREATE INDEX IF NOT EXISTS savings_goals_user_idx
  ON public.savings_goals (user_id) WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS savings_goals_updated_at ON public.savings_goals;
CREATE TRIGGER savings_goals_updated_at
  BEFORE UPDATE ON public.savings_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS savings_goals_own ON public.savings_goals;
CREATE POLICY savings_goals_own ON public.savings_goals
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.goal_contributions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id         uuid NOT NULL REFERENCES public.savings_goals(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Positive: money put toward the goal. Negative: money taken back out.
  amount          numeric(12, 2) NOT NULL CHECK (amount <> 0),
  note            text CHECK (note IS NULL OR length(note) <= 200),
  contributed_at  timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS goal_contributions_goal_idx
  ON public.goal_contributions (goal_id, contributed_at);

ALTER TABLE public.goal_contributions ENABLE ROW LEVEL SECURITY;

-- Own rows, against one's own goals only.
DROP POLICY IF EXISTS goal_contributions_own ON public.goal_contributions;
CREATE POLICY goal_contributions_own ON public.goal_contributions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.savings_goals g
      WHERE g.id = goal_id AND g.user_id = auth.uid()
    )
  );

-- Live updates across the phone and the web, like budgets (migration 019).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.savings_goals;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.goal_contributions;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

COMMIT;
