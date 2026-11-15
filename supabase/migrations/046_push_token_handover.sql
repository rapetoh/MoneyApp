-- 046: a phone's push token moves to whoever signs in on it last.
--
-- 036 made `push_tokens.token` unique so a phone handed to someone else
-- would deliver to the new owner only, and the app upserts on `token`
-- for that reason. But the row-level policy only lets a user update their
-- own rows, so when the token's row belongs to the previous account the
-- upsert's update half is refused ("new row violates row-level security
-- policy (USING expression)"). Seen Nov 13 2026: the owner's phone,
-- signed out of one account and into another on Oct 23, failed every
-- registration since and never received a server notification.
--
-- The hand-over happens before the insert: the previous owner's row is
-- removed, so the app's insert goes through as a plain insert under the
-- normal policy. If that policy then refuses the row (a user_id that is
-- not the caller's), the statement fails and the removal rolls back with
-- it. Works for every shipped build; no app change.
--
-- Re-runnable.

BEGIN;

create or replace function public.push_tokens_hand_over()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.push_tokens
   where token = new.token
     and user_id <> new.user_id;
  return new;
end
$$;

revoke all on function public.push_tokens_hand_over() from public, anon, authenticated;

drop trigger if exists push_tokens_hand_over on public.push_tokens;
create trigger push_tokens_hand_over
  before insert on public.push_tokens
  for each row execute function public.push_tokens_hand_over();

COMMIT;
