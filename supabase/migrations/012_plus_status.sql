-- Migration 012 — Plus entitlement column on profiles.
--
-- Until now, Plus state was computed three different ways:
--   1. Mobile: `__DEV__` (no production user is ever Plus).
--   2. Web client: `NODE_ENV !== 'production'`.
--   3. Web server: `MURMUR_DEV_PLUS=1 || NODE_ENV !== 'production'`.
-- Each surface had its own dev escape hatch and none of them read a
-- backing column. When IAP / RevenueCat lands, the real entitlement
-- needs to live on the profile row so the same value is visible to
-- every client. That's `plus_status` here.
--
-- Values:
--   - `'active'`   — paying Plus subscriber. The only state that
--                    unlocks gated surfaces.
--   - `'lapsed'`   — was active, subscription ended or payment
--                    failed. Treated as free; UI may surface a
--                    win-back nudge in future.
--   - `'free'` or NULL — never subscribed. NULL is the default so
--                    new profiles start free without an explicit
--                    write.
--
-- The dev escape hatches (`__DEV__` on mobile, `MURMUR_DEV_PLUS=1`
-- on web server) continue to override this column to `true` so the
-- developer can exercise gated surfaces without sandbox subscriptions.
-- Production paths read this column exclusively.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plus_status text
    CHECK (plus_status IN ('active', 'lapsed', 'free') OR plus_status IS NULL);
