-- Add 'biweekly' to budgets.period CHECK constraint
ALTER TABLE public.budgets
  DROP CONSTRAINT IF EXISTS budgets_period_check;

ALTER TABLE public.budgets
  ADD CONSTRAINT budgets_period_check
  CHECK (period IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'));
