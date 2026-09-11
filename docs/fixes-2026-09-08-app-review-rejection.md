# Sep 8, 2026: App Store rejection of 1.0.0 (46), and the fixes

Apple rejected iOS App 1.0.0 (46) on Sep 8, 2026. Submission
`a9062528-cfbe-4187-806c-88c6f34499c3`, reviewed on an **iPad Air
11-inch (M3)**. The subscription group and both subscriptions stayed
"Ready for Review": they cannot be approved while the app version is
rejected.

The reviewer's message named three things. The paste-ready reply is in
`docs/app-review-reply-2026-09-08.md`.

| Guideline | What Apple actually said |
| --- | --- |
| 2.3.7 Accurate Metadata | Screenshots reference the price of the app or its service. References to **free** or discounted service count as price references. Put price information in the description instead. |
| 2.1 Information Needed | Answer three questions: does the app use third-party AI, which provider, and what data is collected and sent to it. |
| 5.1.1(v) Data Collection and Storage | The app supports account creation but offers no way to initiate account deletion. Add it, then reply with a screen recording made on a physical device showing sign-in, navigation to the option, and the complete deletion flow. |

## 2.3.7 - pricing in screenshots

**The violation.** `10-free-forever.png` was built entirely around price:
the headline "Start free. Stay free.", the subtitle "…are free forever",
and a floating chip reading "No credit card". Two more screenshots named
the paid tier in their subtitles: iPhone `08-ask-murmur` ("Part of Murmur
Plus.") and iPad `04-patterns` ("Both in Murmur Plus."). Nothing else in
the 14 shots referred to price; the dollar figures elsewhere are the
sample user's own spending.

**The fix.**

- `10-free-forever.png` is no longer submitted. It moved to
  `apps/mobile/store/apple/screenshot/_not-submitted/` and is out of
  `store.config.json`. Apple's own guidance is that this belongs in the
  description, where it already is.
- The two paid-tier subtitles were rewritten at the source and both
  screenshots regenerated.
- The listing now submits 9 iPhone and 5 iPad screenshots.

**A defect found while doing it.** The shipped Budgets screenshots
displayed six rows reading `$412.00 of $ $NaN left`. Cause: two modules
in the screenshot bundle each declare a top-level `function BudgetRow`.
The desktop one (`c0ea2791…`, expecting `b.cap`) loads after the mobile
one (`3d429104…`, which passes `b.limit`), so it won everywhere and
`b.cap` was always undefined. Renamed to `D_BudgetRow` with its one call
site. iPhone `06-budgets` and iPad `03-understand` were regenerated and
now read `$412.00 of $600.00`. This had been live on the App Store
listing.

**`07-recurring.png` never existed.** `store.config.json` listed it but
no file was on disk, so the listing silently carried one screenshot
fewer than intended. Rendered and added.

**Screenshots are now reproducible.**
`apps/mobile/store/apple/render-screenshots.mjs` unpacks the standalone
bundle in `docs/`, serves it, and drives headless Chrome once per shot,
writing PNGs at exactly Apple's pixel sizes and failing loudly if a size
is wrong. Run it with no arguments for all shots, or pass a name
fragment. The bundle itself was patched in place (backup alongside it as
`…pre-2026-09-08.bak`), so the source and the submitted PNGs agree.

## 2.1 - third-party AI

Nothing to fix in code; Apple wants answers. Verified against the
shipped server routes, and written up in the reply document:

| Feature | Route | Model | Sent to OpenAI |
| --- | --- | --- | --- |
| Voice entry | `api/ai/parse-expense` | gpt-4o-mini-2024-07-18 | The transcribed sentence, locale, currency, the user's category names, today's civil date |
| Receipt / paycheck scan | `api/ai/parse-scan` | gpt-4o-mini | The one image the user chose to scan, currency |
| Ask Murmur | `api/ai/ask-murmur/turn` | gpt-4o | The user's transactions (amount, merchant, category, date), recurring rules, monthly income, currency, time zone, locale, and the typed question |

No name, email, account id, device id or location reaches OpenAI: the
routes authenticate the user and then build the payload from financial
records only. `buildAskSystemPrompt` carries no identity fields. Audio
never leaves the phone; `useVoice` starts recognition with
`requiresOnDeviceRecognition: true`, and the privacy policy discloses
the networked fallback for locales the device cannot handle on-device.

## 5.1.1(v) - account deletion

Deletion existed, but only inside Privacy Center, labelled "Delete
everything permanently". The reviewer's own attached screenshot shows
Settings scrolled to the bottom, ending at Sign Out, with no deletion
row anywhere. On an iPad in compatibility mode, the Privacy Center row
reads only "Privacy Center · Review", which does not announce deletion.

**The fix.** Deletion is now where a reviewer and a user look for it,
and both entry points run one implementation:

- `apps/mobile/src/services/deleteAccount.ts` calls the `delete-user`
  Edge Function, wipes local SQLite, then runs the regular `signOut()`
  teardown.
- `apps/mobile/src/hooks/useDeleteAccount.ts` owns the confirmation
  Alert and busy state.
- **Settings > Account > Delete account** (red, after Timezone).
- **Settings > Privacy Center > Your data** keeps its row; its inline
  handler is gone.
- Copy in en/fr/es/pt now names what is removed and states that a Murmur
  Plus subscription is managed by Apple and is not cancelled by deleting
  the account.
- The web dashboard row and confirm text mirror it; the privacy policy
  page points at Settings > Account > Delete account.

**Apple still needs a screen recording** from a physical iPhone showing
sign-in, navigation to the option, and the whole flow through
confirmation. That has to be made on the device once the new build is
installed, and Apple asks that it also live in App Review Information >
Notes for future submissions.

## Also changed

- **App privacy manifest.** `ios.privacyManifests` in `app.config.js`
  declares the six data types the privacy policy already discloses
  (email, name, user id, other financial info, purchase history, other
  user content), all linked to the user, none for tracking. It had
  declared nothing collected.
- **Purpose strings.** Photo library and Face ID were still the library
  defaults ("Allow Murmur to access your photos"); microphone, speech
  and camera said what but not why. All five now say what Murmur does
  with the resource, and the two voice strings state that audio is never
  stored.
- **Description.** The Murmur Plus paragraph claimed Plus includes
  "unlimited voice entries, Apple Pay capture, receipt scanning". The
  app gates none of those. It now says what Plus actually is and opens
  with "Everything above is free", which is allowed in the description.
- **Keywords.** "apple pay" (an Apple trademark) replaced with
  "receipts".
- **Review notes** rewritten: demo sign-in path, the pre-loaded data,
  the deletion and export paths, the AI disclosure, and that wallet
  capture is optional.
- **Demo account seeded.** `apps/web/scripts/seed-review-account.mjs`
  signs in as the review user, clears the account and writes 19
  transactions over 12 days plus a monthly budget. The account was
  empty; the reviewer saw a blank Today, Insights and Budgets. Apple did
  not cite this, but an empty app invites a 2.1 rejection. Run it before
  every submission.
- **App name unchanged.** It stays the owner's pick, "Expense Tracker -
  Murmur". Apple's 2.3.7 text is about screenshots; the renaming link in
  their Resources section is boilerplate attached to metadata
  rejections.

## Verification

- `apps/mobile` and `apps/web` `tsc --noEmit`: clean.
- `packages/shared` vitest: 19 files, 300 tests pass.
- `expo config --type introspect`: the five usage descriptions resolve
  to the new text; display name stays "Murmur".
- `expo prebuild --platform ios --no-install`: generated
  `PrivacyInfo.xcprivacy` carries the six collected data types plus
  Expo's accessed-API reasons.
- Rendered DOM of the patched screenshot bundle: no `NaN` in any shot;
  no "free", "credit card" or "Murmur Plus" text in any submitted shot.
- Every regenerated PNG verified at its required pixel size, and diffed
  against the shipped version band by band: differences are confined to
  the changed subtitle and the corrected budget rows.
- Seed script run against production: 19 live transactions and a budget,
  confirmed by count read-back.

## Resubmission runbook

1. `node apps/web/scripts/seed-review-account.mjs`.
2. `node apps/mobile/store/apple/render-screenshots.mjs` (only if the
   bundle changed again; the PNGs in the repo are current).
3. `cd apps/mobile && npx eas-cli metadata:push` for name, description,
   keywords, screenshots and review notes. Apple login is interactive.
4. `npx eas-cli build --platform ios --profile production` on **EAS
   cloud** (local toolchains carry beta-stamped SDKs, see the Sep 3 entry
   in `docs/payments.md`), then `npx eas-cli submit --platform ios
   --latest`.
5. Install that build from TestFlight on a physical iPhone and record
   the deletion flow.
6. In App Store Connect: attach the build to 1.0.0, confirm the
   subscription group is still attached, check the App Privacy answers
   against the manifest, paste the reply from
   `docs/app-review-reply-2026-09-08.md` into the App Review thread with
   the recording attached, then Resubmit to App Review.
7. On approval, re-lock the hand-granted `plus_status` test accounts
   before pressing Release. Release mode is manual.
