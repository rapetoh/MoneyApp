-- Migration 038: the reverse trial.
--
-- Pricing decision, Sep 20 2026 (docs/murmur-pricing-model.html): every
-- new account gets the full Plus product for 7 days, with no card and no
-- store transaction, and then drops to the free tier unless they
-- subscribe. Capture stays free forever; what the trial shows off is the
-- thinking: Ask Murmur, the desktop app, recurring detection, history and
-- forecasts, formatted exports.
--
-- The grant is server-side state, exactly like a store entitlement, so a
-- client cannot extend its own trial:
--   trial_ends_at   when the free-Plus period runs out. NULL = no trial.
-- `handle_new_user` stamps it at sign-up, and the same guard trigger that
-- protects the plus_* columns now refuses client writes to it.
--
-- Existing accounts get a trial that ends 7 days from this migration:
-- they have been using a product where everything was unlocked, so they
-- are given the same week everyone else gets rather than losing features
-- the moment this ships.
--
-- Entitlement resolution lives in packages/shared/src/plus.ts
-- (`isPlusFromProfile`): Plus is `plus_status = 'active'` OR an unexpired
-- trial_ends_at. A real subscription always wins over the trial.

begin;

alter table public.profiles
  add column if not exists trial_ends_at timestamptz;

-- Every new account: seven days, from the moment it is created.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, trial_ends_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    now() + interval '7 days'
  );

  insert into public.categories (user_id, client_id, name, name_normalized, color, icon, kind)
  select new.id, gen_random_uuid(), dc.name, lower(dc.name), dc.color, dc.icon, dc.kind
    from public.default_categories dc
  on conflict (user_id, name_normalized) do nothing;

  return new;
end;
$$ language plpgsql security definer;

alter function public.handle_new_user() set search_path = public, pg_temp;

-- Accounts that predate the trial get their week now.
update public.profiles
   set trial_ends_at = now() + interval '7 days'
 where trial_ends_at is null
   and coalesce(plus_status, 'free') <> 'active';

-- The trial is server state: extend migration 031's guard to cover it.
create or replace function public.guard_plus_entitlement()
returns trigger
language plpgsql
as $$
declare
  changed boolean;
begin
  if tg_op = 'INSERT' then
    changed := new.plus_status is not null
      or new.plus_product_id is not null
      or new.plus_period_type is not null
      or new.plus_expires_at is not null
      or new.plus_will_renew is not null
      or new.plus_store is not null
      or new.plus_is_sandbox is not null
      or new.plus_synced_at is not null
      or new.trial_ends_at is not null;
  else
    changed := new.plus_status is distinct from old.plus_status
      or new.plus_product_id is distinct from old.plus_product_id
      or new.plus_period_type is distinct from old.plus_period_type
      or new.plus_expires_at is distinct from old.plus_expires_at
      or new.plus_will_renew is distinct from old.plus_will_renew
      or new.plus_store is distinct from old.plus_store
      or new.plus_is_sandbox is distinct from old.plus_is_sandbox
      or new.plus_synced_at is distinct from old.plus_synced_at
      or new.trial_ends_at is distinct from old.trial_ends_at;
  end if;

  if changed and coalesce(auth.role(), '') in ('authenticated', 'anon') then
    raise exception 'plus entitlement is managed by the server'
      using errcode = 'insufficient_privilege',
            hint = 'Subscribe through the app; the entitlement is written from the store receipt.';
  end if;

  return new;
end;
$$;

comment on column public.profiles.trial_ends_at is
  'Reverse trial: full Plus until this instant, granted at sign-up. Server-written only.';

commit;
