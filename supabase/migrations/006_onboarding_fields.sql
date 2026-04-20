-- Onboarding fields: employer/source name for income (so the avatar logo
-- fetcher can pick up e.g. "Microsoft" → microsoft.com) and a completion
-- timestamp so the flow only runs once per profile.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS monthly_income_source text,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- Backfill onboarding_completed_at for existing profiles so pre-migration
-- users don't suddenly see an onboarding prompt. New profiles land with
-- NULL and the mobile app routes them through the flow.
UPDATE public.profiles
   SET onboarding_completed_at = created_at
 WHERE onboarding_completed_at IS NULL;
