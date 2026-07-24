-- Migration 010 — Persistent privacy toggles on profiles.
--
-- The web Settings → Privacy section ships two switches: anonymous
-- usage analytics, and crash reporting. Until now they were local
-- React state and forgotten on reload — the user thought they had
-- exercised a privacy preference but nothing changed. For privacy
-- controls specifically, "dead toggle that looks live" is worse than
-- "no toggle at all", so this migration gives them a real backing
-- column and the Settings page wires read + write.
--
-- Defaults: analytics OFF, crash reports ON. These match the mobile
-- product's stance that we collect nothing by default; the only
-- exception is automatic crash logs, which are operationally
-- necessary to ship a stable native app and are pseudonymous.
-- The user can flip either at any time.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS analytics_opt_in     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS crash_reports_opt_in boolean NOT NULL DEFAULT true;
