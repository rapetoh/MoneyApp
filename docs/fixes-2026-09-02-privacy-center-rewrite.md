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
