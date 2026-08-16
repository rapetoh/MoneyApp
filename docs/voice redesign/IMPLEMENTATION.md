# Voice-capture in-place redesign — implementation notes

**Implemented:** Aug 11, 2026
**Source of truth:** the screenshot (`2026-08-10_22-37-44.png`) and the Claude
Design HTML (`Murmur Mockups (Standalone) recording.html`) in this folder.
Relevant artboards: **11** (Manual keypad), **14** (Today), **14a** (Voice ·
listening in place), **14b** (Voice · result in place), **14c** (Voice · edit,
sheet expands), **15** (Today · undo snackbar).

The mic in the bottom nav is now the primary way to log. Tapping it captures
in place — no navigation. Manual entry (the old flow) moved to a **+** button
on Today's header, beside the existing AI button.

## Architecture

One provider owns the whole capture loop:

```
app/_layout.tsx
└─ UndoProvider
   └─ VoiceSessionProvider (src/hooks/useVoiceSession.tsx)
      ├─ {app}
      ├─ VoiceCaptureOverlay   (14a — src/components/VoiceCaptureOverlay.tsx)
      └─ VoiceResultSheet      (14b/14c — src/components/VoiceResultSheet.tsx)
```

The overlay and sheet are **root-level layers, not RN Modals** — they can
never get stuck the way an orphaned `<Modal>` can, they cover the tab bar by
construction, and Android hardware back is handled by a provider-level
`BackHandler` (back closes the capture surface, never navigates underneath
it).

Every capture path funnels through the same result sheet and the same save
handler:

| Path | Entry |
|---|---|
| Voice | tab-bar mic FAB → `openVoice()` (custom `tabBarButton`, no navigation) |
| Receipt / paycheck scan | Quick entry screen → `presentParsed(expense, 'scan')` |
| iOS Shortcut deep link | unchanged `useShortcutHandler` → `/(tabs)/record` bridge → `presentParsed(…, 'shortcut')` |
| Android payment notification | `useNotificationListener` inside the provider → `presentParsed(…, 'notification_listener')` |

This replaces the pre-redesign arrangement where `VoiceConfirmModal` was
mounted **twice** (Record screen + root layout) and both could theoretically
be visible at once.

## Artboard → code

| Artboard | Where |
|---|---|
| 11 · Manual keypad | `app/transaction/new.tsx` (Quick entry — the old stub redirect is now the real screen; modal presentation, custom Cancel · Quick entry · mic header) |
| 14 · Today | `app/(tabs)/index.tsx` (+ pill added to header) + `app/(tabs)/_layout.tsx` (tab bar restyle: whiter blur pill, labels, ink active tint, ink 58pt FAB) |
| 14a · Listening in place | `VoiceCaptureOverlay` + `LiveWaveform` (volume-metering-driven bars via `expo-speech-recognition`'s `volumechange` events — display telemetry only, parsing untouched) |
| 14b · Result in place | `VoiceResultSheet` confirm mode (banner + parse-time badge, amount hero, merchant card, transcript quote, Redo + Save, auto-save countdown) |
| 14c · Edit (sheet expands) | `VoiceResultSheet` edit mode — Edit expands the *same* sheet (LayoutAnimation), Cancel restores a snapshot, Done keeps edits, sticky Save changes footer |
| 15 · Undo snackbar | existing `UndoSnackbar`/`useUndo`, now fired after **every** save path (voice, scan, shortcut, notification, manual). Undo soft-deletes the just-created row via `deleteTransactionAndEnqueue` |

`/(tabs)/record` survives only as a **bridge** (`app/(tabs)/record.tsx`):
`shortcut_*` params → validated inject + result sheet; `?tab=manual` (old
Day-1 "type instead" target) → Quick entry; bare visit → Today + voice
overlay. `useShortcutHandler` is untouched so already-installed iOS Shortcuts
keep working.

## Judgment calls (mockup vs. reality)

- **Keyboard icon in 14a — kept.** Once the overlay is up, the + button is
  unreachable; the keyboard button is the only one-tap "I can't talk right
  now" escape (cancels the recording, opens Quick entry). The mirror-image
  mic in Quick entry's header was removed by owner decision (Aug 11,
  build 11 feedback): the tab-bar FAB is the one voice entry point —
  don't duplicate it.
- **Live chips while speaking — amount only.** The mockup shows live
  merchant/category/type chips; our parsing runs after stop, and live entity
  detection would be new parsing logic. The amount chip is derived locally
  by the same regex the old ListeningView used; the full result arrives with
  the sheet ~1–2s later.
- **Auto-save ("Saving in 2s · tap to hold") — implemented, then REMOVED
  by owner decision (Aug 11, 2026, after testing build 10).** Two-three
  seconds is not enough time to verify a parse; the countdown pressured
  the user during exactly the moment the sheet exists for. The result
  sheet now waits indefinitely — Save, Edit, or discard, at the user's
  pace. Do not resurrect the countdown. The undo snackbar stays (it
  covers mis-taps on Save).
- **"Tap to replay" (14c) — dropped.** No audio file ever exists (on-device
  STT, transcript-only). The transcript card stays, the replay affordance
  does not.
- **Merchant suggestion chips (14c) — dropped.** The parser returns exactly
  one merchant; inventing alternatives is new logic.
- **Date & time (14c) — read-only row, no chevron.** The app has no date
  picker anywhere (manual entry and edit never had one); building one is a
  tracked follow-up, and a read-only row doesn't look half-built.
- **"Processed on-device · nothing uploaded" — second half not adopted.**
  The transcript *is* sent to the parse API. The existing honest
  `listening.processed_on_device` copy ("Processed securely") stays.
- **Scan buttons — moved to Quick entry** (below category/recurring). They
  had lived in the dissolved Record voice tab; they're on the non-regression
  list and now feed the shared result sheet.
- **Tab-bar glyphs — kept semantic** (home/stats/wallet/ellipsis) with the
  mockup's *styling*; the mockup's clock glyph for Budgets reads as
  "history" and its plain list glyph for Today loses the home affordance.
- **Search icon in the mockup header — not added** (reference design, per
  the owner). Today's top-right keeps sparkles (Ask) + history, with the +
  pill added beside them.
- **Clarification chips & low-confidence hint — preserved** in the confirm
  sheet (they're working features the mockup simply doesn't depict); a
  clarification parse never auto-saves.

## Layering rules (learned the hard way, worth keeping)

- The provider's layers sit above the navigator but **below native modals**
  (iOS `pageSheet`). Anything that opens the overlay/sheet from inside a
  native modal must dismiss the modal first — Quick entry's mic button and
  scan flow both do `router.navigate('/(tabs)')` before/after handing off.
- `useVoice` gained a **session generation counter**: `startListening`,
  `injectParsed`, and `reset` each bump it; an in-flight parse that finishes
  under a stale generation drops its result. `injectParsed`/`reset` also
  abort an active recognizer with a discard flag, so (a) an injected
  notification can't be overwritten by the aborted session's end-of-speech
  parse, and (b) cancelling mid-recording actually stops the mic — before
  this, cancel left the recognizer running and the confirm sheet could pop
  open seconds after the user cancelled (pre-existing bug, fixed here).
- **Both layers mount through `<Presence>`** (`src/components/Presence.tsx`,
  Aug 16 2026) rather than `{visible && …}`. Presence keeps the layer
  mounted through its exit, freezes the last element it was given while
  visible (so the transcript / parsed result don't blank when
  `voice.reset()` clears state mid-fade), disables touches, and hands the
  layer a native-driven 0→1 `presence` value from `usePresence()`. The
  overlay fades its scrim and rises its content 22 pt; the result sheet
  fades its dim and rises 60 pt — both on `Motion` (`src/theme/motion.ts`).
  The overlay's exit and the sheet's entrance overlap when a parse lands.
  The single-driver rule above still holds: presence is native-driven and
  is the only animation on the sheet node.

## Deleted

`src/components/ListeningView.tsx`, `src/components/VoiceWaveform.tsx`,
`src/components/VoiceConfirmModal.tsx` (its `extractClarificationAmounts` and
`ConfirmedExpense` moved to `VoiceResultSheet.tsx`; `ConfirmedExpense` gained
`paymentMethod`, editable in 14c).

## i18n

14 new `voice.*` keys in all four locales (en/fr/es/pt): `got_it`, `redo`,
`save_expense`, `save_income`, `autosave_hint` (`{s}` placeholder), `edit`,
`edit_expense`, `edit_income`, `discard_expense`, `discard_income`,
`date_time`, `quick_entry`, `saved`, `type_instead`.

## Verification

`turbo run typecheck test` — 9/9 tasks green (107 mobile tests); `eslint` —
0 errors; `knip` — clean.

## Build 8 field defects → fixed for build 9 (Aug 11, 2026)

The owner's first TestFlight session surfaced four real defects:

1. **Every save dead-lettered** (`function uuid_generate_v4() does not
   exist`). Server bug, not client: `sync_upsert_transaction` (migration
   018) pins `search_path = public, pg_temp` while Supabase keeps
   uuid-ossp in the `extensions` schema — the RPC's first-ever real
   execution was this session. Fixed in production immediately
   (migration 030: `gen_random_uuid()`, pg_catalog); repo file mirrors it.
   Existing dead-lettered items sync on "Retry All" with no app update.
2. **"$6 today" displayed as "Aug 10 · 7:00 PM" under YESTERDAY.** Two
   stacked date bugs, both fixed: (a) the parse API derived "today" from
   the *server's UTC clock* (wrong day after ~7 PM in the Americas) — the
   client now sends `todayCivilDate` in the user's timezone and the route
   validates + uses it; (b) a date-only parse reads as midnight UTC =
   previous evening locally — `normalizeParsedTransactedAt`
   (packages/shared/period.ts, unit-tested) passes real times through,
   maps date-only-today to null (→ save defaults to now), and anchors
   other date-only days at noon in the user's zone.
3. **Duplicate rows after a failed save.** The row is written locally
   before the server answers; the sheet stayed open after a rejected
   sync, so Save could fire again. The sheet now closes after every
   completed save attempt (the sync banner owns retry/discard), and a
   `submittedRef` makes the sheet one-shot even if the auto-save timer
   and a Save tap land in the same beat.
4. **Listening animation read as dead.** Build 8 gated all waveform
   motion on `volumechange` metering; when a device session doesn't emit
   it, the bars froze. The bars now run the mockup's own `waveBar` loop
   continuously while listening (staggered per bar, native driver) with
   mic level as an amplitude multiplier on top, and the edge glow layers
   are wider/brighter so they register as a glow rather than a hairline.
   Cosmetic fix in the same pass: no duplicated category chip on the
   merchant card when the parse has no merchant.

**Ask Murmur — build 14 → build 16 (owner's ultimatum, Aug 15 night):**

Owner screenshots: (1) sending a question navigated to a second screen
("a new chat every time"); (2) "Can I afford a PS5 this month?" →
"To determine…we need to compare…" — a fluent stall with no numbers;
(3) "Ok" / "Okay?????" → the identical stall repeated verbatim; (4) no
charts on mobile. Traced locally (`AI_DEBUG_TRACE=1` + the harness with
`API_BASE=http://localhost:3111`) and fixed at each source:

- **One screen.** `app/more/ask.tsx` is the whole feature — hero + starter
  prompts while empty, the thread once a question is sent, one always-
  present input bar; sending never navigates. `ask-result` route deleted.
  New `AskChart` (bar / line / horizontal_bar / donut, single-hue sage,
  ink labels) renders the reasoner's chart the web already drew.
  Attribution shows only under answers that used data.
- **Stall + repeat detectors** in the route (narration/permission-seeking
  with no digits/breakdown/chart; verdict == last history answer) → retry
  with a pointed instruction → summarize fallback if still broken.
- **Conversation rules** in the reasoner prompt: lead with the answer and
  its number; named item without a price → typical retail price as a
  stated assumption (the design's own "PS5 (you searched) · $499");
  contentless follow-ups never repeat; greetings = one warm line + 2–3
  grounded offers; charts for 3+ buckets / time series; **subject
  filtering** (a "coffee" breakdown must come from a coffee/category-
  filtered tool call — never unfiltered top merchants under a subject
  caption); one definition of income per conversation; never add
  `recurring_total` on top of a period's spending.
- **429 handling.** The off-topic answers in production were the
  question-blind summarize fallback firing on OpenAI rate limits — **the
  OpenAI org is on a 30k tokens/min gpt-4o tier**. Now: honor Retry-After
  (1.5–6s), one more full attempt, then a real 503 `{error:'busy'}` the
  client retries with one tap. The fallback itself is now question-aware.
  **Ops action for the owner:** raise the OpenAI usage tier before public
  release — under real load 30k TPM will trip.
- **One number for "this month".** Overview gained `this_month_debit` /
  `this_month_credit` computed exactly like the `total` tool; the
  greeting had quoted the 90-day `total_debit` as "this month" and the
  same month showed $881 vs $1,331 across turns.
- **Verified live in production** with `apps/web/scripts/ask-murmur-e2e.mjs`
  (now the owner's exact three conversations, paced, with stall / repeat /
  off-subject checks): ALL PASSED + 401/400/no-data paths. Run before any
  release touching Ask.

**Ask Murmur 360 — beyond the screenshots (Aug 15–16 night, build 16 → 17):**

The owner asked whether the fix was a real 360 or a screenshot patch. It
was the latter, so this pass hunted for what a real user would hit next
and fixed each at its source; every item was verified with the tracing
harness (`AI_DEBUG_TRACE=1` local + `API_BASE`) and then in production.

- **Time windows.** The fixed list could not compute "last week",
  "yesterday", "in June", "between the 1st and the 10th" (one of the app's
  own starter prompts asks about last week). Added `yesterday`,
  `thisWeek`/`lastWeek` (Mon–Sun), `thisQuarter`/`lastQuarter`, and
  `custom` (`start_date`/`end_date`, inclusive civil dates in the user's
  zone) through the one shared row filter — every tool gets them. Unit
  tests: April 11–15, named month == lastMonth, bad/reversed dates.
- **Data reach.** Clients sent 90 days / 500 rows, so "this year" was a
  90-day number labelled as a year. Now 12 months / 2,000 rows on mobile,
  web and server (rows never reach the model — no token cost).
- **Budget awareness.** New `AskMurmurBudget` on the wire, filled from the
  app's own `budgetStatus` (mobile `budgetStatusFor`, web same shared fn —
  identical numbers to the Budgets tab), validated server-side, presented
  in a BUDGET block; "how am I doing against my budget?" → remaining +
  per-day pace; "no budget set" handled honestly. Budget figures are
  trusted by the numeric validator.
- **Still-due bills, deterministically.** `recurring_total` now reports
  `charged_this_month` per rule and `still_due_this_month_total` (name /
  recurring-amount match against this month's rows). The end-of-month
  forecast had counted bills charged on the 12th as upcoming.
- **Grounding, structurally.** Trace of "and last month?": the model
  answered with *zero* tool calls and an invented $91; the validator had
  flagged it only as a soft issue. New hard retry triggers:
  `detectUngrounded` (numeric answer, no successful tool call, untraced
  figures) and `detectWindowMismatch` (question names a period in
  en/fr/es/pt but no tool queried it). Overview totals and BUDGET figures
  are trusted so a grounded greeting isn't retried.
- **Tool contract.** Trace of "coffee": the model correctly called
  `top_merchants` with `merchant_contains`, which that tool didn't accept —
  the filter was silently dropped and unfiltered merchants shipped under
  a coffee caption. Every tool now rejects unknown arguments with a
  self-correcting error; `top_merchants` / `sum_by_category` / `series`
  accept `merchant_contains` (`series` also `category_name`).
- **Fallback consistency.** The summarize fallback's snapshot excluded
  transfers ($881 for a month every tool reported as $1,331); it now uses
  the same "spent" definition as the tools and every app screen. A
  fallback answer can no longer disagree with the grounded ones.
- **Verified.** 14-question battery (last week, yesterday, July, Uber this
  year, budget / no budget, subscriptions, biggest expense, weekday chart,
  Tesla refusal, French, gibberish, forecast, starter prompt) hand-checked
  against planted data — all exact; the standing harness (owner's three
  conversations + error paths) **ALL PASSED in production** after each
  deploy.
- **Ops:** EAS free-plan iOS build quota ran out for the month during this
  pass (resets Sep 1); build 17 (12-month reach + budget context on
  mobile) was produced with `eas build --local` on the owner's Mac and
  submitted with `eas submit`. Server changes need no build.

**Build 12 → build 13 (owner's six-item review, Aug 11 late evening):**

1. **Glow rendered as visible concentric rings** (vs. the Claude app's
   smooth feathered glow). The stacked-stroke approximation is gone;
   `VoiceEdgeGlow` now draws each of the mockup's three inset shadows as a
   real Gaussian-blurred stroke (react-native-svg native `FeGaussianBlur`,
   σ = blur/2, half the stroke clipped outside the viewport) plus the crisp
   2.5px edge line — one continuous gradient per layer, mockup timings,
   mic-driven inner flare. Rings are impossible by construction.
2. **"Add manually" recurring sheet cut off at the bottom.** Two shared
   `BottomSheet` defects for tall content, fixed for every sheet: (a) with
   the keyboard up, the sheet's max height is now capped at
   `keyboardTop − safeTop − 8` so it *shrinks* (header stays on screen)
   instead of being lifted off the top; (b) `RecurringRuleEditor`'s Save
   moved from the header to a pinned footer so the sheet has a visible
   floor above the home indicator and the body scrolls above it. The
   native page-sheet modals (category picker, budget editor, settings
   pickers) were audited — they scroll natively; the two with text inputs
   gained `automaticallyAdjustKeyboardInsets`.
3. **Recurring screen made legible.** Eyebrow "Detected automatically" →
   "Subscriptions, bills & income" (rules are user-created; nothing here
   was auto-detected). Hero: two labelled figures — recurring *expenses*
   per month (+ "That's $X a year." — no longer "in subscriptions", which
   mislabelled a savings transfer) and recurring *income* per month —
   plus a one-line footnote on how per-month figures are derived. List
   split into **Expenses** and **Income** sections, each header carrying
   its monthly subtotal (the same two numbers as the hero); rows show
   signed/coloured amounts and "≈ $X/mo" whenever the cadence isn't plain
   monthly, so every total is reproducible row by row. Shared math fixed
   to exact calendar ratios (26/12, 52/12, 365.25/12 — the old 2.17
   factor showed $5,425 for a $2,500 biweekly paycheck; correct is
   $5,416.67), unit-tested; web dashboard/MindMap inherit the fix.
4. **Merchant logos popping in one by one.** `MerchantAvatar` now uses
   `expo-image` (memory + disk cache, off-thread decode) and
   `useTransactions` prefetches every logo the moment the list loads
   (`src/services/merchantLogo.ts`). **Build 13 regression, fixed in
   build 15:** the logo was drawn directly over the coloured letter tile,
   so any favicon with a transparent background (Render, Ally, The20, LV…)
   showed the letter and tile colour bleeding through. The logo now mounts
   invisible on an opaque white ground and fades in only once expo-image
   reports it decoded (`onLoad`); the tile is the only thing visible
   before that and is fully covered after. Rule: a logo and its fallback
   tile must never be visible at the same time.
5. **Stale-then-current flash on every screen.** Root cause: every data
   hook instance started empty and refetched on mount (categories,
   profile, budget, rules from the *network*). New app-wide query cache
   (`src/services/queryCache.ts`, `useCachedState`): each hook reads the
   last known value synchronously on first render, refreshes in the
   background, and writes through — notifying every other instance, so
   cross-screen updates are immediate. Root layout preloads
   transactions/categories/budget/rules before the splash lifts (SQLite
   always; network up to 2.5s so offline still boots). Cleared on
   sign-out.
6. **Ask Murmur was single-shot.** The API and the web thread already
   support multi-turn `history`; mobile asked one question and had a dead
   follow-up bar (removed earlier). `more/ask-result.tsx` is now a real
   conversation: per-turn loading/answer/error (retry a turn alone),
   follow-ups sent with the completed turns as context, every turn
   appended to the same persisted conversation, always-present input bar
   above the keyboard.
   **Verified live against production** (`apps/web/scripts/ask-murmur-e2e.mjs`,
   Aug 15): a 4-turn conversation on data shaped like the owner's — food
   this month ($107.20 ✓ hand-checked), "compare to last month" as a bare
   follow-up understood in context ($84.50 ✓), biggest merchant ✓,
   affordability; plus 401 / 400 / no-data paths. The affordability turn
   exposed a reasoning defect — the model added `recurring_total` on top
   of the month's spending, which already contained the bills paid that
   month — fixed in the prompt (`packages/ai/src/askMurmur.ts`, "never
   add recurring_total to a period's spending") and re-verified live:
   income received $3,000 − spent $1,054 = $1,946 left, consistent
   across both the affordability verdict and the "what's left" follow-up.

**Build 11 follow-ups (same day):**

- **Crash on focusing any field in the expanded edit sheet.** The sheet's
  entrance animation ran on the native driver while `useKeyboardLift`'s
  JS-driven value shared the same transform — a mixed-driver exception,
  fatal in release, guaranteed on first keyboard show (the hook's own doc
  comment warns of exactly this). Fixed by removing the custom lift from
  the sheet entirely: the edit ScrollView uses iOS's native
  `automaticallyAdjustKeyboardInsets` and Android's window `adjustResize`,
  leaving a single animation driver on the sheet node. Rule for this
  codebase: never combine `useKeyboardLift`'s value with a node that has
  native-driven animations — apply it to a plain layout node only.
- **Mic removed from Quick entry's header** (owner decision — see the
  keyboard-icon judgment call above).

**Build 9 follow-up (same day):** the edge "glow" rendered as a solid
picture-frame band — RN has no inset box-shadow, and the borderWidth
approximation was flat-out wrong against the reference (the Claude app's
feathered voice glow, which the mockup's `VoiceEdge` reproduces with
three inset shadows: 2.5px edge line + 18/60/120px blur halos at
1.7s/2.3s/3.1s breathing loops). Rebuilt as `VoiceEdgeGlow`
(src/components/VoiceEdgeGlow.tsx): each shadow becomes a stack of
concentric SVG strokes following the shadow's gaussian falloff —
edge-bright, feathering to nothing — with the mockup's exact loop
timings, plus a fourth copy of the inner halo whose opacity is driven by
the live mic level (the design bundle's own "drive the innermost layer
off the mic amplitude buffer" note). No new dependency; react-native-svg
was already in the app.
