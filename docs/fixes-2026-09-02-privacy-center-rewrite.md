# Sep 2, 2026: Privacy Center rewrite + owner field-testing answers

Owner raised three things after field-testing. One turned into a ship;
two turned into findings recorded here.

## 1. "Monthly income in Settings is empty" (finding, no code change yet)

Verified against production: the profile row for rapetohsenyo@gmail.com
HAS `monthly_income = 4500.00`, source "The20" (set during onboarding,
which also created the recurring credit rule + first income transaction,
migration 013 trigger). The Settings row reads `profile.monthly_income`
straight from Supabase with no cache in between, so if the phone shows
"-" the phone is signed into a DIFFERENT account (the app offers Apple
sign-in, which creates a separate user with a private-relay email;
Settings > Account > Email shows which one is active).

The real product gap underneath: `profiles.monthly_income` is written
ONLY by the onboarding income step and the Settings editor. Logging
income by voice, even marked recurring, NEVER populates it. Its one
consumer is Ask Murmur context (savings-rate style questions). Edge
cases if we ever auto-derive it: multiple recurring incomes (sum?),
salary changes (which rule wins?), deleted rules leaving a stale figure,
currency mismatches, and manual-edit-then-overwrite conflicts. Decision
deferred to the owner; candidate design = suggest, never silently write
("Set 4,500 as your monthly income?" prompt when a recurring credit rule
exists and the field is null).

## 2. Two export paths (working as designed)

- Settings > Export transactions: the Plus convenience exporter (CSV /
  JSON / PDF picker, `exportData.ts`). Gated at the call site.
- Privacy Center > Export all my data: the GDPR right to data
  portability. Free for every user by legal requirement (a privacy
  right cannot be paywalled) and by App Store expectation. Ships one
  complete JSON dump via the share sheet.

Yes, a technical free user can get their transactions out through the
JSON dump. That is the intended cost of doing privacy correctly; the
Plus pitch is formats + filters + PDF, not access to your own data.
Both platforms implement the same split (web settings mirrors it).

## 3. Privacy Center rewrite (shipped)

Owner review: the screen read like AI wrote it. Rows like "Selling your
data: Never" and "Analytics or tracking: None" enumerate bad things we
don't do; real apps state facts and link the policy. Em dashes had also
crept back into `privacy.lead`, `privacy.cloud_detail`,
`privacy.openai_detail` in all four locales during the Aug 29 rewrite
(standing mandate: none, ever).

Changes (mobile `privacy.tsx`, web dashboard settings, locales x4):

- "What we guarantee" group DELETED. Substance folded into the lead:
  audio never stored, only transcript text leaves the phone. No
  negatives enumeration anywhere.
- New "Legal" group: Privacy Policy + Terms of Service rows opening
  `LEGAL_URLS` (itsmurmur.com/privacy, /terms), same documents the
  paywall links. This is what the owner expected the screen to hold.
- "Your rights" group relabeled "Your data" (export + delete rows
  unchanged in behavior).
- Lead + detail copy rewritten in en/fr/es/pt, no em dashes.
- Web settings Privacy card: "Anonymous usage analytics / Crash
  reporting: Not collected." rows replaced with Privacy Policy + Terms
  link rows (export/delete rows unchanged).
- Keys removed everywhere: `privacy.group_guarantees`, `privacy.guar_*`,
  `privacy.status_never`, `privacy.status_never_stored`. Keys added:
  `privacy.group_legal`, `privacy.policy_label`, `privacy.terms_label`.
- Mobile `SetRow` in privacy.tsx trimmed: the toggle/chevron-suppression
  branches only existed for the deleted guarantee rows.

## Verification

- `packages/shared` vitest: 19 files, 300 tests pass (locale integrity
  + parity included).
- `apps/mobile` and `apps/web` `tsc --noEmit`: clean.
- Removed-key sweep across apps/packages: no references left.
- Em-dash sweep of all four locale files: clean.

## Ship path

Web/desktop get it on the next Vercel deploy (this commit). Mobile
rides the next TestFlight build; no native change, but iOS-mandate =
TestFlight only, so it lands with the next submitted build.

## Round 2 (same day): Privacy Center slimmed to its actual job

Owner follow-up: the "What's stored where" rows (naming OpenAI, Google,
our servers) do not belong in the app UI at all; that detail belongs in
the privacy policy. None of it is legally required in-app: the policy
must disclose third-party processing (it does, including the
subprocessor table), Apple wants data TYPES in the questionnaire, and
nothing anywhere requires naming models, databases or hosting.

Final screen: headline + three-sentence lead, "Your data" (export /
delete), "Legal" (Privacy Policy / Terms). Removed: the stored-where
group, PrivacyRow component + styles, and 9 more locale keys
(group_where, on_device_*, cloud_*, merchant_logos_*, openai_*) across
en/fr/es/pt. Policy page: dropped its now-stale "disclosed in the app
under Settings > Privacy" cross-reference (the policy already documents
on-device voice, receipts flow, and the Google logo lookup, so nothing
was lost by the removal). Verified live on the simulator: the whole
screen fits one view. Tests 300/300, both tsc clean.

Income coherence (settings figure = recurring income story) is the next
work item; owner is sending more remarks before it starts.

## Round 3 (same day): Ask insights on Insights + the income story rebuilt

### Ask insight cards now also live on Insights (owner idea, analyzed: yes)

The Ask entry cards (upcoming bill, budget pace, surges, large purchase)
are the app's best proactive insights and were locked behind opening
Ask. Now: `AskInsightCard` + `performAskAction` extracted from ask.tsx
into `src/components/AskInsightCard.tsx` (one implementation, two
surfaces), and the Insights tab renders a "Highlights" section (top 3
from the same `computeAskInsights` engine, always current-month, no_data
filtered) between the hero and Categories. Tapping a card opens Ask;
the action chip routes identically to Ask's. Verified rendering on the
simulator. Web Insights page: not yet, follow-up candidate.

### Income: one coherent story (owner mandate: "the story must make sense")

Architecture: `profiles.monthly_income` stopped being client-written
state. Migration 032 derives it server-side as the SUM of active,
non-deleted, non-ended recurring CREDIT rules (monthlyEquivalent
calendar ratios, matching packages/shared/recurrence.ts; profile
currency only), maintained by triggers on recurring_rules and on
profile currency change, with a backfill. `monthly_income_source` = the
single rule's name when exactly one contributes.

Client changes riding it:
- Onboarding no longer writes monthly_income directly; the recurring
  credit rule it creates (via migration 013's transaction trigger) now
  feeds the profile through 032.
- Mobile Settings > Monthly Income: with income rules, the row routes
  to /recurring (the source of truth); with none, the editor modal
  creates a REAL recurring income (credit transaction -> rule ->
  profile), exactly like onboarding.
- Web Settings: the income input became a read-only derived display
  linking to /dashboard/recurring; the form no longer writes the column.
- New NameIncomeSheet on Today: one-time "Who pays you?" prompt when an
  active income rule is unnamed or still the localized "Salary"
  placeholder; renaming the rule flows into monthly_income_source and
  the merchant logo. New i18n keys x4 (income.name_prompt_*,
  insights.highlights).

Owner-account effect (verified in prod): his gmail profile had a
hand-typed 4500/"The20" but NO income rule (his onboarding predated
migration 013's trigger; his one rule is an unnamed 20,000 DEBIT test
rule from April). The backfill therefore derived NULL, which is honest;
setting income through the new Settings flow recreates it properly.

### Applying migration 032 to prod: the runbook that actually works

`supabase db push` fails on this project: the remote history table
holds 25 timestamp-style versions (SQL-editor era) that don't match the
local NNN_ files, and `migration repair --status applied NNN` rejects
non-timestamp versions. DO NOT push. The working path: direct Postgres
connection with `SUPABASE_DB_PASSWORD` (root .env) through the SESSION
POOLER `aws-1-us-east-2.pooler.supabase.com:5432`, user
`postgres.ohaqhwampmyoeaopdybd` (the direct db.<ref> host is IPv6-only
and unreachable here; aws-0 is the wrong pooler instance). A
mid-attempt `repair --status reverted` had emptied the history table;
all 25 rows were re-inserted and verified (26 total). Triggers verified
present; backfill verified (1 of 6 profiles derived a value).

### Verification (round 3)

- packages/shared vitest 300/300; mobile + web tsc clean; web
  production build clean.
- Simulator: Highlights section live on Insights.
- Prod DB: functions + both triggers exist; backfill ran; owner profile
  inspected before/after.
