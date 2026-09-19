-- Migration 034: anonymous usage and crash data default to ON.
--
-- Sep 19, 2026, owner decision. Migration 033 shipped these as opt-in
-- because the privacy policy published before that day promised opt-in.
-- In practice nobody turns a "help us improve" switch on, which left the
-- product blind to where new users struggle. The policy is ours to set,
-- so it now states what the app really does: anonymous, first-party
-- usage and crash data is kept by default, carries a random per-install
-- id and never the account, is never sold or shared with any analytics,
-- advertising or tracking company, never includes transactions, amounts,
-- merchants or anything the user says, and a switch in the Privacy
-- Center turns it off on any device (the RLS policy from 033 then
-- refuses that user's events server-side).
--
-- Existing rows are flipped too: nothing was ever collected before this
-- release, and the switches only reach users in this same release, so
-- there is no stated preference being overwritten.

begin;

alter table public.profiles alter column analytics_opt_in set default true;
alter table public.profiles alter column crash_reports_opt_in set default true;

update public.profiles set analytics_opt_in = true where analytics_opt_in = false;
update public.profiles set crash_reports_opt_in = true where crash_reports_opt_in = false;

commit;
