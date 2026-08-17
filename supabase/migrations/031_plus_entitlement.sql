-- Migration 031 — Plus entitlement: server-owned, RevenueCat-fed.
--
-- Payments (Aug 16, 2026 owner decision): Murmur Plus is sold as an
-- iOS auto-renewable subscription through RevenueCat (monthly $3.99 /
-- yearly $29.99, 7-day free trial on both); web and desktop unlock from
-- the same account. `profiles.plus_status` (migration 012) stays the one
-- gate every surface reads. This migration does two things:
--
-- 1. Adds the columns the product needs to *describe* the entitlement
--    honestly (Settings: "Murmur Plus · Yearly · renews Sep 16" /
--    "Free trial · ends Aug 23" / "Expired Aug 1"), all written by the
--    server from RevenueCat's subscriber record — see
--    supabase/functions/_shared/entitlement.ts and the two functions
--    that call it (revenuecat-webhook, plus-sync).
--
-- 2. Closes a hole that becomes real money the moment purchases go
--    live: RLS "Users can update own profile" (001) lets an authenticated
--    user UPDATE *any* column of their own row, including plus_status —
--    i.e. `supabase.from('profiles').update({ plus_status: 'active' })`
--    from the anon key + their JWT would have granted Plus for free. The
--    trigger below rejects any change to an entitlement column unless
--    the request runs as the service role (Edge Functions) or from a
--    non-JWT session (SQL editor / migrations, where auth.role() is
--    NULL). Every existing client write to profiles is a partial-column
--    UPDATE (display_name, locale, currency, timezone, …), so OLD and NEW
--    agree on these columns and the trigger is a no-op for them.
--
-- Column semantics (all NULL for a profile that never subscribed):
--   plus_status           'active' | 'lapsed' | 'free' | NULL — unchanged
--                         meaning; 'active' includes the free-trial period.
--   plus_product_id       store product, e.g. murmur_plus_yearly
--   plus_period_type      'trial' | 'intro' | 'normal' (RevenueCat's
--                         period_type for the current subscription)
--   plus_expires_at       when the current period ends (renews or lapses)
--   plus_will_renew       false once the user cancelled / billing failed
--                         — Settings shows "expires" instead of "renews"
--   plus_store            'app_store' | 'play_store' | 'stripe' | …
--   plus_is_sandbox       true for TestFlight / sandbox purchases
--   plus_synced_at        last time the server wrote these from RevenueCat

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plus_product_id text,
  ADD COLUMN IF NOT EXISTS plus_period_type text
    CHECK (plus_period_type IN ('trial', 'intro', 'normal') OR plus_period_type IS NULL),
  ADD COLUMN IF NOT EXISTS plus_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS plus_will_renew boolean,
  ADD COLUMN IF NOT EXISTS plus_store text,
  ADD COLUMN IF NOT EXISTS plus_is_sandbox boolean,
  ADD COLUMN IF NOT EXISTS plus_synced_at timestamptz;

CREATE OR REPLACE FUNCTION public.guard_plus_entitlement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    changed := NEW.plus_status IS NOT NULL
      OR NEW.plus_product_id IS NOT NULL
      OR NEW.plus_period_type IS NOT NULL
      OR NEW.plus_expires_at IS NOT NULL
      OR NEW.plus_will_renew IS NOT NULL
      OR NEW.plus_store IS NOT NULL
      OR NEW.plus_is_sandbox IS NOT NULL
      OR NEW.plus_synced_at IS NOT NULL;
  ELSE
    changed := NEW.plus_status IS DISTINCT FROM OLD.plus_status
      OR NEW.plus_product_id IS DISTINCT FROM OLD.plus_product_id
      OR NEW.plus_period_type IS DISTINCT FROM OLD.plus_period_type
      OR NEW.plus_expires_at IS DISTINCT FROM OLD.plus_expires_at
      OR NEW.plus_will_renew IS DISTINCT FROM OLD.plus_will_renew
      OR NEW.plus_store IS DISTINCT FROM OLD.plus_store
      OR NEW.plus_is_sandbox IS DISTINCT FROM OLD.plus_is_sandbox
      OR NEW.plus_synced_at IS DISTINCT FROM OLD.plus_synced_at;
  END IF;

  -- auth.role() is 'authenticated' / 'anon' for PostgREST requests made
  -- with a user or anon JWT, 'service_role' for the service key, and
  -- NULL for direct database sessions (SQL editor, migrations, the
  -- signup trigger). Only JWT-bearing client roles are refused.
  IF changed AND coalesce(auth.role(), '') IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'plus entitlement is managed by the server'
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Subscribe through the app; the entitlement is written from the store receipt.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_plus_entitlement ON public.profiles;
CREATE TRIGGER guard_plus_entitlement
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_plus_entitlement();

COMMENT ON COLUMN public.profiles.plus_status IS
  'Murmur Plus gate. Written only by the server from RevenueCat (revenuecat-webhook / plus-sync); client writes are rejected by guard_plus_entitlement.';
