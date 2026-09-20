# First-run fixes, Sep 19 2026 (build 1.0.1)

Source: the first-run audit in [murmur-product-review.html](./murmur-product-review.html)
(Topic 1). All 18 findings are fixed in code. Verified: `npx turbo typecheck`
(5/5), mobile tests 125/125, shared tests 306/306, eslint clean on every
changed file, `npx expo export --platform ios` bundles. Not yet run on a
device.

## The new first run

Welcome (live capture demo) → **Your setup** → **Try it now** (first
spoken expense) → **Never miss one** (evening check-in, Apple Pay) → one
soft Plus offer (or Apple Pay setup) → Today with **Getting started**.
`app/(onboarding)/permissions.tsx` and `income.tsx` are deleted.

## Finding by finding

| ID | Fix | Where |
|---|---|---|
| C1 | Setup screen seeds language, currency and speech recognizer from the phone; the recognizer now follows the app language for every user (the stored `voice_language` was always the untouched `en-US` default, so even users who switched to French in Settings were heard in English). Settings writes `voice_language` with every language change. | `app/(onboarding)/setup.tsx`, `packages/shared/src/utils/setup.ts`, `useVoiceSession.tsx`, `settings.tsx` |
| C2 | Denied mic: stable `mic-denied` code, localized explanation, Open Settings, Type instead. No retry that can't work. All capture errors are localized codes now. | `useVoice.ts`, `VoiceCaptureOverlay.tsx` |
| C3 | First log happens inside onboarding. The Today coach keys on "no expense yet" (not "no transactions"), draws the "Tap to speak" pointer and the mic glow ring, Skip persists. | `first-log.tsx`, `useFirstRun.ts`, `DayOneFirstLog.tsx`, `(tabs)/_layout.tsx` |
| C4 | Reminders rebuilt: permission asked on an explained screen (habit step, or a one-time prime sheet for older accounts), never from a transaction count. | `src/services/reminders.ts`, `useReminders.ts`, `ReminderPrimeSheet.tsx` |
| H1 | Opt-in, first-party analytics and JS crash reports (off by default, as the privacy policy promises; enforced by RLS). Funnel report from data we already hold. Privacy Center switches. Privacy manifest and public policy updated. | `src/services/analytics.ts`, migration 033, `privacy.tsx`, `app.config.js`, `apps/web/src/app/privacy/page.tsx` |
| H2 | One soft Plus offer after onboarding, "Not now" as visible as the trial. | `paywall.tsx` (`origin=onboarding`), `(tabs)/_layout.tsx` |
| H3 | Apple Pay capture offered on the habit step and on the Getting started card. | `habit.tsx`, `GettingStartedCard.tsx` |
| H4 | Welcome shows a looping real capture in the phone's language and currency; the Plus-only "Clarity on desktop" promise is gone. | `CaptureDemo.tsx`, `(auth)/sign-in.tsx` |
| H5 | Permission screen retired; mic asked when the user taps to speak. Purpose string no longer says "hold". | `first-log.tsx`, `app.config.js` |
| H6 | Closing the Google sheet is no longer an error. (Owner item: sign-in on our own domain, see below.) | `googleAuth.ts` |
| H7 | The name Apple sends once is saved to the profile. | `appleAuth.ts` |
| M1 | Sign-up shows the real address; the confirmation link returns to the app. | `sign-up.tsx`, `useAuth.ts`, `app/auth/callback.tsx` |
| M2 | Income moved out of onboarding to the Getting started card (shared save helper with Settings). | `monthlyIncome.ts`, `(tabs)/index.tsx` |
| M3 | "Who pays you?" never asks about an income entered in the same session. | `NameIncomeSheet.tsx` |
| M4 | No cold notification alert; an explanation always comes first. | `habit.tsx`, `ReminderPrimeSheet.tsx` |
| M5 | "Filed." moment; haptics on mic start/stop, save, and errors (`expo-haptics`, native). | `first-log.tsx`, `src/services/haptics.ts` |
| M6 | Evening check-in with chosen hour, day-3 / day-7 copy, quiet nudges at +1/+3/+7 days. Settings controls. | `reminders.ts`, `settings.tsx` |
| L1 | Progress dots instead of "Step 1 of 2"; Skip persists; emoji empty states replaced with icons. | `StepDots.tsx`, `index.tsx`, `budgets.tsx` |

## Owner steps (blocked for Claude by the permission guard)

1. **Apply migration 033**: paste `supabase/migrations/033_app_events_and_first_run_funnel.sql`
   into the Supabase SQL editor and run it. Until then opt-in events are dropped silently.
   Then `select * from reporting.first_run_funnel;` shows the daily funnel.
2. **Deploy the web app** (push `main`) so the updated privacy policy is live
   before 1.0.1 reaches anyone.
3. **Build and send to TestFlight**: `cd apps/mobile && npx eas-cli build --platform ios --profile production --auto-submit`.
4. **Before App Store submission**: App Store Connect > App Privacy, add
   "Product Interaction" and "Crash Data", both *not linked to you*, *not used
   for tracking*, purpose *Analytics*.
5. **Optional, H6 second half**: Supabase custom domain (e.g. `auth.itsmurmur.com`)
   so the Google sign-in sheet names Murmur's domain instead of `…supabase.co`.
   Check on a device first.

## Same-day follow-ups (owner testing on build 49)

| What | Why | Where |
|---|---|---|
| Anonymous usage and crash data now defaults to ON, the onboarding toggle is gone (one line of disclosure instead), the switches stay in the Privacy Center | An opt-in switch nobody turns on leaves the product blind; the policy is ours to set, and it now states exactly what happens | migration 034, `setup.tsx`, `privacy.tsx`, `apps/web/src/app/privacy/page.tsx` |
| "Getting started" card never appeared after onboarding | Today mounts for a moment at launch before the routing gate redirects, caching the flag as unset; the hook never re-reads a cached key, so onboarding's SecureStore write only took effect on the next cold start. `setFirstRunFlag` now writes through the cache | `useFirstRun.ts`, `queryCache.ts`, test `__tests__/useFirstRun.test.ts` |
| A silent recording raised the result sheet holding the previous expense (and saving it wrote a second, wrong transaction) | `startListening` cleared `finalTranscriptRef` but left `lastInterimRef`; the end-of-speech handler falls back to the interim text, so the old words were re-parsed and answered from the parse cache. Both refs are cleared together on start, reset and inject | `useVoice.ts`, test `__tests__/useVoice.test.ts` (fails on build 49, passes on the fix) |
| Dismissing the checklist was permanent and unrecoverable | A mis-tap cost the card for good. "Hide" is now a collapse to a one-line header (ring + "2 of 4"), reopened by tapping it. The card retires itself when all items are done, after 10 logged expenses, or two weeks after onboarding | `GettingStartedCard.tsx`, `useFirstRun.ts` |

Builds: 49 and 51 carry the first two bugs, 52 fixes them, 53 adds the
collapsible checklist. Local archives (`eas build --local`) because the
Expo free plan's cloud builds are used up until Oct 1; Xcode 27.0 GA on
this Mac is store-safe, the beta that caused "Invalid Binary" is not.

## Budget and income as centred dialogs (owner review, Sep 19 2026)

"Sauvegarder" wrapped onto two lines in the budget sheet header: the
centre title's `flex: 1` squeezed the side slots. Fixed at the source in
`BottomSheet` (side slots keep their natural width, the title gives way)
and swept through the other custom headers (VoiceResultSheet's edit
header, CategoryPicker, Settings' pickers), each label now one line.

The budget and income editors moved from full sheets to a new
`CenterModal`: a card over the screen you came from, two actions side by
side at the bottom (where a long translation cannot clip them), body
scrolls, keyboard shrinks the card instead of pushing it off-screen,
Reduce Motion honoured. The budget period became a chip row instead of a
five-row list so the dialog stays one glance tall. Used by the Budgets
tab, Settings, and the Today checklist, which now opens the budget dialog
in place instead of sending the user to another tab.
