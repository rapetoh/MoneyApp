-- Migration 039: a fortnight of Plus, and what the user came for.
--
-- Two changes to the reverse trial (migration 038), both from the
-- onboarding research of Sep 20 2026:
--
-- 1. The trial runs 14 days, not 7. RevenueCat's 2026 benchmarks put
--    trials of 17 to 32 days at a 45.7% median conversion against 26.8%
--    for the usual 3 to 7 days. Our trial costs us almost nothing to run
--    (Ask is the only expensive call and it stays rate-limited), and an
--    expense tracker needs more than a week before its own history is
--    worth paying for. Existing, unexpired trials are extended rather
--    than reset, so nobody loses a day.
--
-- 2. profiles.primary_goal records what the user said they came for, on
--    the second onboarding screen. It is not decoration: it orders the
--    "Getting started" checklist and it is quoted back on the paywall.
--    Research is blunt about this, a personalization question that
--    changes nothing downstream is noise; this one changes both.
--    Client-writable, like locale or currency.

begin;

alter table public.profiles
  add column if not exists primary_goal text
    check (primary_goal is null or primary_goal in ('clarity', 'budget', 'subscriptions', 'simple'));

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, trial_ends_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    now() + interval '14 days'
  );

  insert into public.categories (user_id, client_id, name, name_normalized, color, icon, kind)
  select new.id, gen_random_uuid(), dc.name, lower(dc.name), dc.color, dc.icon, dc.kind
    from public.default_categories dc
  on conflict (user_id, name_normalized) do nothing;

  return new;
end;
$$ language plpgsql security definer;

alter function public.handle_new_user() set search_path = public, pg_temp;

-- Running trials get the extra week too.
update public.profiles
   set trial_ends_at = trial_ends_at + interval '7 days'
 where trial_ends_at is not null
   and trial_ends_at > now();

comment on column public.profiles.primary_goal is
  'What the user said they came for at onboarding: clarity | budget | subscriptions | simple. Orders the Getting started checklist and is quoted on the paywall.';

commit;
