# Aug 29 2026 — Settings section review + honest privacy claims

Owner asked for a full review of the mobile Settings section ("make sure
it's correct, ready to go, and clean") ahead of App Store submission, and
separately approved fixing the two false privacy claims found on Aug 28.
One pass, both delivered. JS-only — no native module changes, so no new
EAS build is required beyond the normal next build.

## Why the privacy copy had to change (context)

An Aug 28 code-vs-copy audit found two claims the app makes that the code
does not keep:

1. **"Your iCloud — Expenses · Categories"** (Privacy Center). False.
   There is zero CloudKit/iCloud code; expenses, categories and budgets
   sync through our Supabase backend. The row came straight from the
   design mockup (`mobile-screens-4.jsx` S_Privacy), which described an
   iCloud architecture that was never built.
2. **"Speech-to-text happens on your phone / audio never leaves."**
   Not guaranteed. `useVoice.ts` started `expo-speech-recognition`
   without `requiresOnDeviceRecognition`, so iOS was free to route audio
   to Apple's servers.

## Changes

### 1. Voice recognition now forced on-device (`src/hooks/useVoice.ts`)

`requiresOnDeviceRecognition: true` added to the recognizer start
options. Per the module's contract the flag is only enabled when the
device supports on-device recognition — unsupported device/locale combos
fall back to Apple's networked recognizer instead of erroring, and the
new privacy copy discloses exactly that ("on your phone whenever your
device supports it — the audio itself never reaches our servers").

⚠️ **Verify on next TestFlight build:** a quick voice-capture sanity pass
(en + fr) to confirm on-device transcription quality is unchanged.

### 2. Privacy Center rewritten to the truth (`app/more/privacy.tsx` + locales)

"What's stored where" — four rows, one per real data flow:

| Row | Detail |
|---|---|
| 📱 On this device | Voice transcripts (stripped before sync — SyncManager) |
| ☁️ Our servers | Expenses · Categories · Budgets — encrypted, synced across devices *(was "Your iCloud" — false)* |
| 🖼️ Merchant logos | Device asks Google by name (unchanged) |
| 🌐 OpenAI | Transcript text, receipt photos & merchant text, extraction only, nothing kept |

"What we guarantee" — replaced the three old rows with claims the code
actually enforces: **Audio recordings — Never stored** (recognition
streams audio; no file ever exists — the old "delete voice recordings
after 24h" row promised a deletion schedule for recordings that don't
exist), **Analytics or tracking — None** (no analytics SDK in the app),
**Selling your data — Never**. The old "Speech-to-text stays on-device —
Always" row overclaimed; the qualified truth now lives in the lead copy.

### 3. Settings screen restructure (`app/more/settings.tsx`)

Before: 9 always-visible groups, four of them single-row. After: 8, with
honest rows. iOS + Android both verified by structure (platform branch
kept).

- **Voice & capture** now holds Voice engine + Apple Pay capture
  (iOS) / Payment notifications (Android). The one-row "Automations"
  group is gone — this is also where the design mockup places the
  Apple Pay row.
- **Voice engine row tells the truth per-device**: reads
  `supportsOnDeviceRecognition()` and shows "Local speech-to-text" or
  "Apple speech recognition" (new key) instead of an unconditional
  "Local" claim.
- **Language moved to Preferences** (it sets the whole app's locale +
  the recognizer language, not a voice-only setting). Preferences order:
  Language · Currency · Budget · Income · Recurring.
- **"Privacy & data" group** replaces the one-row "Data" and one-row
  "Privacy" groups: Privacy Center + Export transactions together.
- **Sync group: 3 rows → 2.** The permanent "Pending — 0 queued" outbox
  row was jargon with no action. Its signal now appears as the "Last
  synced" row's transient detail: "Syncing…" while a drain runs, "N
  queued" if entries are waiting (e.g. offline). Sync issues row
  unchanged (fix-plan 1.6 surface preserved).
- Group order: Subscription · Account · Voice & capture · Preferences ·
  Reminders · Privacy & data · Sync · [Developer, dev builds] · About ·
  Sign out.

Kept deliberately: profile card + Upgrade pill, Subscription row
(entitlement-driven), read-only Email/Time zone rows, day-2 nudge
toggle, Plus-gated export with format picker, all modals, dev-only AI
Server URL group, sign-out. Account deletion + GDPR export stay on the
Privacy Center (verified working via `delete-user` edge function —
App Store 5.1.1(v) compliance is intact).

### 4. Locale hygiene (en/fr/es/pt, all four in sync)

- Removed 20 dead keys (0 code references, verified): the six pre-rework
  privacy stub keys (`privacy.tagline`, `on_device_title/body`,
  `servers_title/body`, `stub_note`), `privacy.group_controls`, the
  replaced `icloud_*`/`servers_*`/`ctrl_*`/`status_always`/
  `status_not_stored` keys, and settings leftovers from pre-App-Intent
  eras: `voice_language`, `delete_account`, `apple_pay_shortcut`,
  `set_up`, `payment_notifications_hint`, `shortcut_disclaimer_ios`,
  `notification_disclaimer_android`, `manage_subscription`,
  `sync_pending`, `data`, `privacy`, `automations`.
- Added: `settings.privacy_data`, `settings.voice_engine_apple`,
  `settings.sync_in_progress`, `privacy.cloud_label/detail`,
  `privacy.openai_label/detail`, `privacy.guar_audio/analytics/selling`,
  `privacy.status_never_stored`.

### 5. DESIGN.md corrected

The design doc still asserted the iCloud/no-sign-in architecture as
fact (§1 privacy bullet, §5 Privacy Center, §6 identity). Marked all
three with *as built* notes so no future session re-derives privacy
copy from an architecture that was never implemented.

## Verification

- `packages/shared` locale integrity tests: 9/9 pass.
- `apps/mobile` `tsc --noEmit`: clean.
- Removed-key sweep: no source references (only stale copies under
  `apps/web/.next/standalone`, a build artifact).
- New-key sweep: all present in en/fr/es/pt.

## Open follow-ups

- Voice sanity pass on next TestFlight build (on-device recognition
  quality, en + fr).
- App Store privacy nutrition labels must match the new copy when
  submitting: data collected = transactions/categories/budgets (linked
  to account), email; voice audio not collected.
