-- Migration 029 — Seed default categories server-side, atomically with
-- account creation (fix-plan 3.6 / audit 07-F17, 08-F34).
--
-- Category seeding used to live entirely on mobile: `apps/mobile/app/
-- _layout.tsx` called `seedDefaultCategories(userId)` once per session,
-- which fetched `default_categories`, diffed against the user's existing
-- rows and batch-inserted whatever was missing in one `.insert([...])`
-- call. Two defects followed directly from that shape:
--
--   1. Surface-dependent. A web-only sign-up (Google OAuth or email/
--      password through `apps/web`, or the desktop shell) never runs any
--      mobile code, so it never seeds — the account has zero categories
--      and nothing to file a transaction under. This is the exact bug
--      class the owner reported for a real account (estellesovi6).
--   2. All-or-nothing. A single-statement batch insert fails the *entire*
--      batch on one collision (e.g. a category the user already renamed
--      into existence some other way), silently discarding all twenty
--      rows and swallowing the error.
--
-- The fix moves seeding into `handle_new_user()`, the trigger that already
-- creates the `profiles` row for every new `auth.users` insert regardless
-- of which client (mobile, web OAuth callback, web email/password) created
-- the account. `ON CONFLICT ... DO NOTHING` makes each row independently
-- idempotent — one collision no longer discards the other nineteen.
-- `apps/mobile/src/services/seedCategories.ts` and its call site are
-- deleted, not merely superseded, per the "wire it or delete it" rule:
-- leaving a second seeding path around invites the two to drift.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );

  -- One row per `default_categories` entry, skipping any the user
  -- somehow already has (defensive — a brand-new user_id never does,
  -- but this keeps the insert idempotent if the trigger is ever
  -- re-invoked or backfilled). `client_id` is generated here because
  -- this is the row's origin — no client has created it yet to supply
  -- its own.
  INSERT INTO public.categories (user_id, client_id, name, name_normalized, color, icon, kind)
  SELECT NEW.id, gen_random_uuid(), dc.name, lower(dc.name), dc.color, dc.icon, dc.kind
    FROM public.default_categories dc
  ON CONFLICT (user_id, name_normalized) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- CREATE OR REPLACE FUNCTION does not necessarily retain a prior ALTER
-- FUNCTION ... SET; re-assert it explicitly (matches migration 016's
-- search_path hardening for this same function).
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;

COMMIT;
