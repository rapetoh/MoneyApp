-- Migration 036: the notification system, delivery, consent, and memory.
--
-- Background (notification 360 review, Sep 19 2026,
-- docs/murmur-notifications-360.html). Murmur could send five messages,
-- all of them local notifications the phone scheduled for itself. A local
-- notification's text is fixed days in advance, so none of them could
-- carry a number: "Anything to add from today?" is the ceiling of that
-- mechanism, not a copy choice. Everything worth saying (rent lands
-- tomorrow and you will be 380 short, you passed your budget, your card
-- bounced and Plus is about to stop) is only knowable on the server, at
-- the moment of sending. This migration is the storage that lets the
-- server say it.
--
-- Three tables and one rule each:
--
--   push_tokens        where to send. One row per install, not per user:
--                      a person with an iPhone and an iPad has two.
--   notification_prefs whether to send. Per family, plus quiet hours and
--                      a weekly ceiling, defaulted to the conservative
--                      end (3 a week) because above roughly six a week
--                      uninstall risk rises sharply.
--   notification_log   what was already said. The unique key on
--                      (user_id, dedupe_key) is the whole "never repeat
--                      a claim" guarantee: sending is an INSERT, and a
--                      second attempt at the same claim fails the insert
--                      instead of reaching the user twice.
--
-- Also here, because the highest-value notification depends on it:
-- `plus_billing_issue_at` / `plus_grace_until`. RevenueCat reports
-- `billing_issues_detected_at` per subscription, but `resolveEntitlement`
-- collapsed it into `plus_will_renew = false` together with a voluntary
-- cancellation. Those two need opposite messages ("your card bounced, fix
-- it" versus "your subscription ends on the 4th"), and telling a person
-- who deliberately cancelled that their payment failed is worse than
-- saying nothing. The signal is now stored, so the two cases are
-- distinguishable.

begin;

-- ── where to send ──────────────────────────────────────────────────────

create table if not exists public.push_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- The Expo push token. Unique across the table, not per user: when a
  -- device is handed to someone else and they sign in, the token must
  -- move to the new owner rather than deliver their notifications to
  -- both accounts.
  token         text not null unique,
  platform      text not null check (platform in ('ios', 'android', 'web')),
  locale        text,
  app_version   text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  -- Set when Expo answers DeviceNotRegistered: the app was deleted or
  -- the token was rotated. Kept rather than deleted so the sweep's
  -- "does this user have anywhere to send" query stays a cheap index
  -- scan and a reinstall can revive the row.
  disabled_at   timestamptz,
  disabled_reason text
);

create index if not exists push_tokens_user_live_idx
  on public.push_tokens (user_id) where disabled_at is null;

alter table public.push_tokens enable row level security;

drop policy if exists push_tokens_own on public.push_tokens;
create policy push_tokens_own on public.push_tokens
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── whether to send ────────────────────────────────────────────────────

create table if not exists public.notification_prefs (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  -- One switch per family. `money` is deliberately absent: billing and
  -- security messages are transactional, the user asked for them by
  -- having an account, and a person who muted weekly recaps has not
  -- asked to be kept in the dark about a failed payment.
  receipts     boolean not null default true,
  bills        boolean not null default true,
  budget       boolean not null default true,
  insights     boolean not null default true,
  habit        boolean not null default true,
  -- Local wall-clock hours, resolved against profiles.timezone. Nothing
  -- is sent inside [quiet_start, quiet_end); the sweep runs hourly, so a
  -- candidate held at 23:00 is simply reconsidered at 08:00.
  quiet_start  smallint not null default 22 check (quiet_start between 0 and 23),
  quiet_end    smallint not null default 8  check (quiet_end   between 0 and 23),
  -- The ceiling the governor enforces. 0 means "nothing but transactional".
  max_per_week smallint not null default 3 check (max_per_week between 0 and 14),
  updated_at   timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

drop policy if exists notification_prefs_own on public.notification_prefs;
create policy notification_prefs_own on public.notification_prefs
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── what was already said ──────────────────────────────────────────────

create table if not exists public.notification_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  family      text not null check (family in ('receipt', 'bill', 'budget', 'insight', 'habit', 'money')),
  kind        text not null,
  -- The claim's identity, not the message's: 'budget_over:<budget>:<period start>',
  -- 'bill_tomorrow:<rule>:<occurrence date>'. Two sweeps that reach the
  -- same conclusion produce the same key, and the unique index below
  -- turns the second one into a no-op.
  dedupe_key  text not null,
  title       text not null,
  body        text not null,
  data        jsonb not null default '{}'::jsonb,
  sent_at     timestamptz not null default now(),
  -- Stamped when the user taps. The only engagement signal we keep, and
  -- it is what tells us which families to stop sending.
  opened_at   timestamptz
);

create unique index if not exists notification_log_dedupe_idx
  on public.notification_log (user_id, dedupe_key);

-- The governor's frequency question ("how many in the last 7 days") and
-- the in-app inbox's ordering are the same scan.
create index if not exists notification_log_user_sent_idx
  on public.notification_log (user_id, sent_at desc);

alter table public.notification_log enable row level security;

-- Read-only to the user: this is the in-app inbox, so a push missed on
-- the lock screen is never lost. Writes are the sweep's alone (service
-- role bypasses RLS); no insert/update/delete policy exists on purpose,
-- so a client cannot fabricate a "we already told you" row and mute
-- itself.
drop policy if exists notification_log_read_own on public.notification_log;
create policy notification_log_read_own on public.notification_log
  for select to authenticated
  using (auth.uid() = user_id);

-- ── the billing-issue signal ───────────────────────────────────────────

alter table public.profiles
  add column if not exists plus_billing_issue_at timestamptz,
  add column if not exists plus_grace_until      timestamptz;

comment on column public.profiles.plus_billing_issue_at is
  'RevenueCat subscriptions[].billing_issues_detected_at. Distinguishes a failed payment from a deliberate cancellation, which plus_will_renew = false alone cannot. Written only by the entitlement sync.';
comment on column public.profiles.plus_grace_until is
  'RevenueCat entitlement grace_period_expires_date: Plus keeps working until this instant while the store retries the card. The deadline quoted in the billing-issue notification.';

-- Migration 031 protects the entitlement columns with a TRIGGER
-- (`guard_plus_entitlement`), not with column grants: it rejects any
-- client-JWT write that changes one of them. The two columns added above
-- are entitlement state and must be inside that guard, or a client could
-- clear its own billing issue and silence the notification that says the
-- card bounced. Replacing the function is the whole change; the trigger
-- binding from 031 still points at it.
create or replace function public.guard_plus_entitlement()
returns trigger
language plpgsql
as $$
declare
  changed boolean;
begin
  if TG_OP = 'INSERT' then
    changed := NEW.plus_status IS NOT NULL
      OR NEW.plus_product_id IS NOT NULL
      OR NEW.plus_period_type IS NOT NULL
      OR NEW.plus_expires_at IS NOT NULL
      OR NEW.plus_will_renew IS NOT NULL
      OR NEW.plus_store IS NOT NULL
      OR NEW.plus_is_sandbox IS NOT NULL
      OR NEW.plus_synced_at IS NOT NULL
      OR NEW.plus_billing_issue_at IS NOT NULL
      OR NEW.plus_grace_until IS NOT NULL;
  else
    changed := NEW.plus_status IS DISTINCT FROM OLD.plus_status
      OR NEW.plus_product_id IS DISTINCT FROM OLD.plus_product_id
      OR NEW.plus_period_type IS DISTINCT FROM OLD.plus_period_type
      OR NEW.plus_expires_at IS DISTINCT FROM OLD.plus_expires_at
      OR NEW.plus_will_renew IS DISTINCT FROM OLD.plus_will_renew
      OR NEW.plus_store IS DISTINCT FROM OLD.plus_store
      OR NEW.plus_is_sandbox IS DISTINCT FROM OLD.plus_is_sandbox
      OR NEW.plus_synced_at IS DISTINCT FROM OLD.plus_synced_at
      OR NEW.plus_billing_issue_at IS DISTINCT FROM OLD.plus_billing_issue_at
      OR NEW.plus_grace_until IS DISTINCT FROM OLD.plus_grace_until;
  end if;

  if changed and coalesce(auth.role(), '') in ('authenticated', 'anon') then
    raise exception 'plus entitlement is managed by the server'
      using errcode = 'insufficient_privilege',
            hint = 'Subscribe through the app; the entitlement is written from the store receipt.';
  end if;

  return NEW;
end;
$$;

commit;
