-- Migration 033: opt-in product events + the first-run funnel report.
--
-- First-run audit H1 (Sep 19, 2026): nothing in the app was measured, so
-- no one could see where new users stop. Two pieces, both first-party
-- (no third-party SDK, data stays in this database):
--
-- 1. public.app_events: anonymous events from the apps, written ONLY for a
--    signed-in user who opted in. The privacy policy promises analytics
--    will be opt-in, so consent is enforced here, by RLS, not just by the
--    client: an insert passes only when the caller's profile has
--    analytics_opt_in = true (or crash_reports_opt_in = true for the
--    'js_error' event). No user id is stored: a random per-install id is
--    the only key. Clients can insert and nothing else (no select, update
--    or delete policy exists).
--
-- 2. reporting.first_run_funnel: daily sign-up cohorts computed from data
--    the product already stores to work (profiles, transactions). No new
--    collection. The reporting schema is not exposed through the API and
--    is readable only by the database owner (SQL editor / psql).

begin;

create table if not exists public.app_events (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  install_id   uuid not null,
  event        text not null check (event ~ '^[a-z0-9_]{1,48}$'),
  props        jsonb not null default '{}'::jsonb check (pg_column_size(props) <= 4096),
  app_version  text check (char_length(app_version) <= 32),
  platform     text check (platform in ('ios', 'android', 'web'))
);

create index if not exists app_events_event_created_idx on public.app_events (event, created_at);

alter table public.app_events enable row level security;

drop policy if exists app_events_insert_opted_in on public.app_events;
create policy app_events_insert_opted_in on public.app_events
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and (p.analytics_opt_in or (app_events.event = 'js_error' and p.crash_reports_opt_in))
    )
  );

revoke all on public.app_events from anon;
revoke all on public.app_events from authenticated;
grant insert on public.app_events to authenticated;

create schema if not exists reporting;
revoke all on schema reporting from public;
revoke all on schema reporting from anon, authenticated;

create or replace view reporting.first_run_funnel as
with cohort as (
  select p.id,
         p.created_at,
         (p.created_at at time zone coalesce(nullif(p.timezone, ''), 'UTC'))::date as signup_day,
         p.onboarding_completed_at,
         p.plus_status,
         p.plus_period_type
    from public.profiles p
),
logs as (
  select t.user_id,
         t.direction,
         t.source,
         t.client_created_at as logged_at
    from public.transactions t
   where not t.is_deleted
     and t.source <> 'recurring_generated'
),
firsts as (
  select l.user_id,
         min(l.logged_at) filter (where l.direction = 'debit') as first_expense_at,
         bool_or(l.source = 'voice') as used_voice,
         bool_or(l.source = 'shortcut') as used_apple_pay
    from logs l
   group by l.user_id
),
days as (
  select distinct l.user_id, (l.logged_at at time zone 'UTC')::date as day
    from logs l
)
select c.signup_day,
       count(*)                                                                  as accounts,
       count(*) filter (where c.onboarding_completed_at is not null)              as finished_onboarding,
       count(*) filter (where f.first_expense_at is not null)                     as logged_an_expense,
       count(*) filter (where f.first_expense_at <= c.created_at + interval '10 minutes') as first_expense_in_10_min,
       count(*) filter (where f.used_voice)                                        as used_voice,
       count(*) filter (where f.used_apple_pay)                                    as used_apple_pay,
       count(*) filter (where exists (select 1 from days d where d.user_id = c.id
                                        and d.day = (c.created_at at time zone 'UTC')::date + 1)) as logged_on_day_1,
       count(*) filter (where exists (select 1 from days d where d.user_id = c.id
                                        and d.day between (c.created_at at time zone 'UTC')::date + 6
                                                      and (c.created_at at time zone 'UTC')::date + 8)) as logged_on_day_7,
       count(*) filter (where c.plus_status = 'active' and c.plus_period_type = 'trial') as in_trial_now,
       count(*) filter (where c.plus_status = 'active' and coalesce(c.plus_period_type, '') <> 'trial') as paying_now
  from cohort c
  left join firsts f on f.user_id = c.id
 group by c.signup_day
 order by c.signup_day desc;

create or replace view reporting.app_events_daily as
select (created_at at time zone 'UTC')::date as day,
       event,
       count(*) as events,
       count(distinct install_id) as installs
  from public.app_events
 group by 1, 2
 order by 1 desc, 2;

commit;
