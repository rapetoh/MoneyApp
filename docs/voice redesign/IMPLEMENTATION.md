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
  now" escape (cancels the recording, opens Quick entry). Mirrored by the
  mic button in Quick entry's header.
- **Live chips while speaking — amount only.** The mockup shows live
  merchant/category/type chips; our parsing runs after stop, and live entity
  detection would be new parsing logic. The amount chip is derived locally
  by the same regex the old ListeningView used; the full result arrives with
  the sheet ~1–2s later.
- **Auto-save ("Saving in 2s · tap to hold") — implemented**, voice-only,
  gated on confidence ≥ 0.75 and no clarification needed. Any touch on the
  sheet pauses it permanently. Undo snackbar is the recovery (the design's
  own sticky: "Undo is non-negotiable").
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
