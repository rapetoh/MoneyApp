# Fixes — 2026-08-16: launch screen, brand-mark size, and presentation motion

**Scope:** the five points the owner raised on Aug 16 2026 after using the
TestFlight build — (1) blank white screen on launch, no logo, no animation;
(2) the app icon's coin "too zoomed out" on every surface; (3) do screen
transitions feel like a premium app; (4) the bottom sheets' dark layer
"pulled up and down with the sheet"; (5) the mic tap "throws" the recording
screen at you. Each was verified against the code before anything changed;
the verdicts are recorded below, including the one where the app was
already right.

Owner instruction that governed this pass: *"You have full ownership … you
know how premium apps do it … if what I'm saying is not correct, tell me."*
Every decision below names the reference behaviour it copies.

---

## 1. Launch — a white screen, then Home. Verified: **owner correct, and worse than described.**

### What was actually happening

`apps/mobile/app.config.js` carried *two* splash configurations: the legacy
top-level `expo.splash { image, resizeMode, backgroundColor }` **and** an
`expo-splash-screen` plugin entry with only `{ backgroundColor }`. Since
SDK 52 the plugin is the only thing prebuild reads once it receives any
props — `@expo/prebuild-config`'s `getIosSplashConfig` /
`getAndroidSplashConfig` return `props.image` (undefined) and never look at
`expo.splash`. With no image, `applySplashScreenStoryboard` calls
`removeImageFromSplashScreen`, which also never writes the background
colour. The generated `ios/Murmur/SplashScreen.storyboard` therefore had
`<subviews/>` (empty) and `systemBackgroundColor` = **pure white**. Not
cream, not a logo — white. Then `app/_layout.tsx` returned `null` while its
gates (fonts, session, profile, data preload) resolved and called
`SplashScreen.hideAsync()` on the frame it became ready, with no fade
(iOS default). White → Home, hard cut. Exactly the report.

### What it is now

Three layers, one source of truth (`apps/mobile/assets/brand/launch.js`:
`SPLASH_IMAGE`, `SPLASH_IMAGE_WIDTH = 120`, `SPLASH_BACKGROUND`):

1. **Native launch screen** — the plugin now receives
   `{ image, imageWidth, resizeMode: 'contain', backgroundColor }`. The
   regenerated storyboard has a 120 pt `SplashScreenLogo` image view
   centred on the `SplashScreenBackground` (cream) named colour; Android
   gets the same PNG at 120 dp on the API 31+ system splash and the legacy
   window drawable. The legacy `expo.splash` object was **deleted** with a
   NOTE explaining why (a second copy that does nothing is how this broke).
2. **JS handoff overlay** — new `src/components/LaunchScreen.tsx`. Draws
   the *identical* frame (same PNG, same 120 pt, same centre, same cream)
   and only after its own `<Image onLoad>` fires does it call
   `SplashScreen.hideAsync()`; a 1.5 s fallback hides the native layer
   regardless so a bad asset can never strand the OS logo. From the
   handoff the mark **breathes** (scale 1 → 1.045 → 1, 1.3 s each way —
   the brand's 2.6 s cadence from Brand Sheet §06, and the exact thing
   PLAN.md's Aug 7 entry deferred as "needs a custom splash-to-app
   transition surface").
3. **Reveal** — `app/_layout.tsx` no longer returns `null` while loading.
   It always renders `<LaunchScreen ready={ready}>`; when `ready` flips it
   mounts the navigator *under* the veil, waits 90 ms for the first screen
   to paint, then the mark lifts (scale → 1.16, fade) while the cream veil
   dissolves over 360 ms into whatever screen the routing gate chose. A
   minimum dwell of 800 ms after the JS handoff (Brand Sheet §06: "hold for
   800 ms after first paint") stops the mark flashing for two frames on a
   warm launch. Reduce Motion → fade only. Both children of the root
   `<View>` carry stable keys so the veil instance survives the `ready`
   flip (a remount would restart the breath = flicker).

Reference behaviour: Cash App, Spotify and Claude iOS — static native
logo → seamless JS takeover → logo dissolves into content. iOS launch
storyboards cannot animate; every "animated splash" you have seen is this
two-layer trick.

**Deliberately not added:** the wordmark + tagline the brand sheet mock
shows under the mark. Fonts are one of the loading gates, so text can't be
in the first JS frame without a system-font pop, and the reference apps
are mark-only. Revisit only as its own design decision.

**Also fixed while here:** the three top-level route groups `(auth)`,
`(onboarding)`, `(tabs)` now `animation: 'fade'` in the root Stack. They
only ever swap via `router.replace` (sign-in → app, onboarding → app,
sign-out → auth); a horizontal push there implied "one step deeper", a
cross-fade says "new world". Every other screen keeps the native push /
sheet.

---

## 2. App icon coin "too zoomed out". Verified: **owner correct.**

Coin diameter was 527 px of the 1024 px icon (51%). Apple's app-icon
template puts the circular keyline at **768/1024 (75%)**; that is the
diameter every mark-in-a-circle icon on the home screen sits on, which is
why ours read as a badge floating in cream. Standardised on 75%
everywhere the mark appears on a tile:

| Surface | Source | Before | After |
|---|---|---|---|
| iOS / App Store icon | `assets/brand/murmur-mark-cream.svg` → `assets/icon.png` | 51% | 75% (Apple keyline) |
| Android adaptive foreground | `murmur-mark-adaptive-foreground.svg` → `adaptive-icon.png` | 30% of canvas (44% of the visible mask) | 48% of canvas = Material's 52/108 keyline (72% of the visible mask) |
| Launch-screen mark | `murmur-mark-splash.svg` → `splash-icon.png` | 29% of canvas | 96% (tight crop, so `imageWidth` ≈ on-screen coin diameter) |
| Favicon + web `app/icon.png` | `murmur-mark-favicon.svg` → `favicon.png`, `apps/web/src/app/icon.png` | 48% | 75% |
| macOS `.icns`, Windows `.ico`, `build/icon.png` | `apps/desktop/scripts/generate-icns.mjs` (reads the cream SVG) | 51% | 75% (regenerated) |
| In-app tile — sign-in / sign-up / reset (mobile) | `src/components/MurmurMark.tsx` — was a 19%-per-side inset (48% coin) | 48% | 75% via exported `COIN_TILE_RATIO` |
| In-app tile — web sidebar / login / Ask | `apps/web/src/components/MurmurMark.tsx` (mirrors the mobile constant) | 77.5% | 75% |

`generate-icons.mjs` now also writes `apps/web/src/app/icon.png` (it was a
hand-copied duplicate of `favicon.png` and would have drifted). Regenerate
order after any mark change: `node apps/mobile/assets/brand/generate-icons.mjs`
then `npm run icns -w @voice-expense/desktop`.

The 160-unit mark grid itself (coin r=62, wave geometry) is untouched — only
the transform placing it on each canvas changed.

---

## 3. Screen-to-screen transitions. Verified: **the app was already right; one refinement made.**

Audit of every navigator surface:

- **Stack pushes** (transaction detail, recurring, settings, privacy, help,
  ask, transactions list) — `presentation: 'card'` on `expo-router`'s
  native stack = UIKit's own push with the interactive back swipe. That *is*
  the premium behaviour; nothing to add.
- **Modals** (quick entry, edit, paywall; the six settings pickers,
  category picker, budget editor) — `presentation: 'modal'` /
  `presentationStyle="pageSheet"` = UIKit's sheet presentation, which fades
  its own dim natively. Correct.
- **Tabs** — no cross-fade on tab switch. iOS convention (Cash App,
  Spotify): tabs switch instantly. Left as is on purpose.
- **Onboarding** — `slide_from_right`, gestures off. Correct for a wizard.
- **Group swaps** — the one refinement (fade), see §1.

---

## 4. Bottom sheets — "the dark layer comes up and goes down with the sheet." Verified: **owner correct.**

`src/components/BottomSheet.tsx` was `<Modal transparent
animationType="slide">`. RN's `Modal` slide animates the modal's whole
content view — the full-screen 40% black backdrop included — so the dim
travelled with the sheet on open and close. UIKit's sheet presentation,
`@gorhom/bottom-sheet`, Cash App's and Spotify's sheets all fade the dim
in place while the sheet slides.

Rebuilt (component API unchanged — every call site still owns `visible`):

- `<Modal animationType="none">` is now purely a host window.
- Backdrop is its own layer, warm ink `rgba(27,25,21,0.42)`, **fades**
  in/out (`Motion.backdropInMs` 280 / `backdropOutMs` 240).
- The sheet **slides** by exactly its own measured height (`onLayout`), in
  over 400 ms on the decelerating curve, out over 260 ms on the
  accelerating one.
- Internal `mounted` state keeps the Modal up until the exit finishes —
  the sheet is never removed mid-frame. Re-opening mid-close continues
  from the current position.
- Keyboard lift now measures the untransformed **host** rather than the
  sliding sheet, so an `autoFocus` field (Income editor) that raises the
  keyboard mid-entrance can't over-lift by the in-flight translation.

Curves and durations live in the new `src/theme/motion.ts` (`Motion`) and
are shared with §5 so the sheets and the voice surfaces move as one
product. `BottomSheet.test.ts` mock extended (`parallel`, `add`, `setValue`,
`Easing`); all 4 cases still pass, 107/107 suite green.

Consumers: Quick-entry "More options", Insights month picker, Income
editor, Recurring-rule editor. The `pageSheet` modals were already native
and were left alone.

---

## 5. Mic tap — the recording screen "thrown at you". Verified: **owner correct.**

`useVoiceSession.tsx` rendered `{overlayVisible && <VoiceCaptureOverlay/>}`
and `{sheetVisible && <VoiceResultSheet/>}` — conditional mounts, so both
appeared and disappeared in one frame (the result sheet had an entrance
but no exit, and its backdrop popped).

New `src/components/Presence.tsx`: keeps a root layer mounted through its
exit and hands it a native-driven `presence` value (0→1 in over
`Motion.enterMs`, 1→0 out over `Motion.exitMs`). While exiting it renders
the *last element it was given while visible* — a React element is an
immutable props snapshot, so the transcript / parsed result stay on screen
during the fade instead of blanking as `voice.reset()` clears state —
disables touches, and unmounts when the value lands.

- **Capture overlay (14a):** cream scrim fades up; status pill, transcript,
  waveform and controls rise 22 pt into place; edge glow fades. Reverse on
  cancel / stop.
- **Result sheet (14b):** dim fades, sheet rises 60 pt (the design doc's
  "rises in place"); reverse on save / dismiss. Its own one-shot entrance
  animation was removed in favour of presence.
- **Listening → result:** the overlay's exit and the sheet's entrance
  overlap, i.e. a cross-fade from "listening" to "here's what I heard".
- Reduce Motion → fades only (`src/hooks/useReduceMotion.ts`).

Nothing about the capture state machine, the save path, undo, the Shortcut
/ notification entry points or the Android back handling changed.

---

## Verification

- `tsc --noEmit` clean (mobile, web); `eslint` 0 errors (mobile: only the
  six pre-existing "unused eslint-disable" warnings); `vitest` 107/107.
- `expo prebuild --platform ios --clean` — regenerated storyboard verified
  by hand: `SplashScreenLogo` 120×120 imageView, `SplashScreenBackground`
  named colour, `SplashScreenLogo.imageset` present in `Images.xcassets`.
- Release-configuration build on the iPhone 17 Pro simulator (`expo run:ios
  --configuration Release`), cold-launched with a screenshot burst:
  springboard zoom shows the 75% coin icon → native launch screen with the
  120 pt mark centred on cream (no white frame anywhere) → mark holds /
  breathes through the JS handoff with no visible seam or size change →
  the mark scales up and the veil dissolves over the sign-in screen (the
  `router.replace` to `(auth)` happened under the veil; no slide was
  visible) → sign-in with the enlarged tile mark. Sequence in
  `docs/fixes-2026-08-16-launch-frames.png`.
- **Not verified on a device in this session:** the BottomSheet and voice
  overlay / result-sheet motion. They need a signed-in session; the
  simulator had none and creating a throwaway production account was
  ruled out. Covered by typecheck, the BottomSheet unit test, and code
  review of the first-frame states (sheet parked a full window below the
  fold until its own layout reports a height; presence starts at 0). First
  eyes on them will be TestFlight build 17 — check: dim fades in place
  while the sheet slides; sheet slides *down* on Cancel/backdrop tap; mic
  tap fades the cream scrim up and the controls rise; Save fades the
  result sheet down.

**Ship note:** the storyboard, the app icon and the Android splash all
change at **prebuild**, so they reach users only through a new EAS build
(TestFlight), not an OTA update. The JS-side motion (sheets, overlay,
launch veil) would go OTA, but the veil is designed to match the *new*
storyboard — ship them together.
