-- Migration 032: profiles.monthly_income derived from recurring income.
--
-- Owner mandate (Sep 2, 2026): "the story needs to make sense." An income
-- entered at onboarding IS a recurring credit rule; incomes added later
-- add to it; the Monthly Income shown in Settings must be the live total
-- of the user's recurring income, not a separate hand-typed number that
-- drifts. So the profile fields stop being client-written state and
-- become a server-maintained aggregate:
--
--   monthly_income          = SUM over active, non-deleted, non-ended
--                             credit rules of the rule's monthly
--                             equivalent, in the profile's currency.
--   monthly_income_source   = the single rule's name when exactly one
--                             rule contributes; NULL when several do
--                             (clients render the total; the rule list
--                             itself is the breakdown).
--   monthly_income_currency = the profile currency the total is in.
--
-- Monthly equivalents match packages/shared recurrence.monthlyEquivalent
-- exactly (calendar ratios, not 30/4.33 shortcuts): daily x 365.25/12,
-- weekly x 52/12, biweekly x 26/12, monthly x 1, quarterly / 3,
-- yearly / 12, all divided by "interval".
--
-- Rules in a currency other than the profile's are excluded from the
-- total (we have no server-side FX; a mixed-currency income is rare and
-- the rule list still shows it). Recomputed on every rules change and
-- on a profile currency change.

create or replace function public.recompute_monthly_income(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cur    text;
  v_total  numeric;
  v_count  integer;
  v_source text;
begin
  select currency_code into v_cur from public.profiles where id = p_user;
  if v_cur is null then
    return; -- no profile row (deleted account); nothing to do
  end if;

  select
    coalesce(sum(
      (case r.frequency
         when 'daily'     then r.amount * (365.25 / 12.0)
         when 'weekly'    then r.amount * (52.0 / 12.0)
         when 'biweekly'  then r.amount * (26.0 / 12.0)
         when 'monthly'   then r.amount
         when 'quarterly' then r.amount / 3.0
         when 'yearly'    then r.amount / 12.0
       end) / greatest(coalesce(r."interval", 1), 1)
    ), 0),
    count(*)
  into v_total, v_count
  from public.recurring_rules r
  where r.user_id = p_user
    and r.direction = 'credit'
    and r.is_active
    and coalesce(r.is_deleted, false) = false
    and (r.ends_at is null or r.ends_at > now())
    and r.currency_code = v_cur;

  if v_count = 1 then
    select nullif(trim(r.name), '') into v_source
    from public.recurring_rules r
    where r.user_id = p_user
      and r.direction = 'credit'
      and r.is_active
      and coalesce(r.is_deleted, false) = false
      and (r.ends_at is null or r.ends_at > now())
      and r.currency_code = v_cur
    limit 1;
  else
    v_source := null;
  end if;

  update public.profiles
  set monthly_income          = case when v_total > 0 then round(v_total, 2) else null end,
      monthly_income_source   = v_source,
      monthly_income_currency = case when v_total > 0 then v_cur else null end
  where id = p_user;
end;
$$;

-- Rules change -> recompute for that user.
create or replace function public.trg_rules_monthly_income()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_monthly_income(coalesce(new.user_id, old.user_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists recurring_rules_monthly_income on public.recurring_rules;
create trigger recurring_rules_monthly_income
after insert or update or delete on public.recurring_rules
for each row execute function public.trg_rules_monthly_income();

-- Profile currency change -> the total's currency filter changed, recompute.
-- No recursion: recompute_monthly_income never writes currency_code, and
-- this trigger only fires when currency_code actually changes.
create or replace function public.trg_profile_currency_monthly_income()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_monthly_income(new.id);
  return new;
end;
$$;

drop trigger if exists profiles_currency_monthly_income on public.profiles;
create trigger profiles_currency_monthly_income
after update of currency_code on public.profiles
for each row
when (old.currency_code is distinct from new.currency_code)
execute function public.trg_profile_currency_monthly_income();

-- Backfill every account that has income rules today, plus every account
-- with a stale hand-typed figure and no rules (those become NULL, which
-- Settings renders as "-"; the app then offers to set it up properly).
do $$
declare
  u uuid;
begin
  for u in
    select distinct p.id
    from public.profiles p
    left join public.recurring_rules r
      on r.user_id = p.id and r.direction = 'credit'
    where r.id is not null or p.monthly_income is not null
  loop
    perform public.recompute_monthly_income(u);
  end loop;
end;
$$;
