-- Migration 035: remembering that a user removed the "Getting started" card.
--
-- Sep 19, 2026. The card collapses to one line for "later", and can now be
-- removed outright for "never". That decision belongs to the account, not
-- to the phone: iOS deletes an app's keychain when the app is deleted, so
-- a local flag would quietly resurrect the card after a reinstall, which
-- is exactly the bug the owner hit with the card's visibility flag earlier
-- today (see useFirstRun.ts).
--
-- NULL means "not removed". Client-writable like the rest of the profile
-- preferences; RLS already restricts every profile row to its owner.

begin;

alter table public.profiles
  add column if not exists start_checklist_dismissed_at timestamptz;

commit;
