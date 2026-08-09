# Mobile UI, layout, safe-area and interaction
**Audit date:** 2026-08-08 - **Scope:** every screen in `apps/mobile/app/` and every component in `apps/mobile/src/components/` — layout, safe areas, sheets, loading state, interaction affordances - **Files examined:** 54

## Verdict
This layer is **not production-ready**. The single worst problem is that the app's primary save affordance — the "Parsed Transaction" sheet's Save button — is pushed below the physical screen edge by a flex-sizing bug in `VoiceConfirmModal`, which means the core capture flow (voice, receipt scan, paycheck scan) can fail to complete on the exact path the product is built around. The systemic cause is that **this codebase treats device chrome as a constant instead of a measurement**: `useSafeAreaInsets` is called zero times in the entire app, `useBottomTabBarHeight` zero times, and clearance for the floating tab bar and the home indicator is hard-coded as magic numbers (`110`, `120`, `140`, `bottom: 14 + 68 + 8`) in 14 places. The second systemic cause is that several screens are built as **fixed-height, non-scrolling flex columns sized for one specific phone** — on a 375×667 device (iPhone SE 2/3, iPhone 8) the Manual-entry "Add expense" CTA lands entirely inside the floating tab bar's 68pt band, and the onboarding income screen overflows its own viewport on every iPhone except the Max sizes, pushing Continue off-screen with no scroll to recover it (the un-dismissable `decimal-pad` keyboard then makes it worse). A third, newly-found systemic defect: React Native's `KeyboardAvoidingView` measures its own frame in **parent-relative** coordinates and compares it to a **screen-space** keyboard frame, so every KAV in this app that is not mounted at the screen origin under-lifts — which is why the confirm sheet, the edit screen and Ask all still hide their inputs behind the keyboard despite having a KAV (F37). Compounding all of it: **no font is ever loaded** — `expo-font` is a dependency, there are no `.ttf`/`.otf` files in the repo, no `useFonts()` call anywhere, yet 305 `fontFamily` declarations across 39 files name a family (262 of them a `PlusJakartaSans` face, 1 `DMMono`), so the entire brand type system silently falls back to San Francisco and every bold/semibold rule that omits `fontWeight` renders at regular weight. All four user-reported bugs reproduce from source and each has an exact line.

## Findings summary
| # | Severity | Finding | Primary file |
|---|----------|---------|--------------|
| F1 | Critical | Parsed-Transaction sheet overflows its own `maxHeight`; Save button lands below the screen edge (user bug #1) | `src/components/VoiceConfirmModal.tsx:138-142` |
| F2 | Critical | Manual tab is a fixed non-scrolling column; on 667pt devices "Add expense" + "More options" sit entirely behind the floating tab bar | `app/(tabs)/record.tsx:818-824` |
| F3 | High | `ListeningView` has no top safe-area inset — LISTENING/PROCESSING pill renders under the status-bar clock (user bug #3) | `src/components/ListeningView.tsx:243-254` |
| F4 | High | One `scanLoading` flag drives two buttons and only the Receipt button renders the spinner (user bug #2) | `app/(tabs)/record.tsx:107,248,429-452` |
| F5 | High | No font is ever loaded; 305 `fontFamily` rules fall back to system font, collapsing weight hierarchy | `src/theme/typography.ts:22-32` |
| F6 | High | `<Money>` defaults to a hard-coded `$`; 11 of 13 call sites omit `sign`, so every non-USD user sees dollar amounts | `src/components/Money.tsx:44` |
| F7 | High | History heatmap renders a 6-column grid under a 7-column weekday header on every iPhone | `src/components/HistoryHeatmap.tsx:303-311` |
| F8 | High | Onboarding income overflows its viewport on all but Max-size iPhones — Continue is off-screen with no ScrollView to recover it, and the `decimal-pad` has no dismiss key | `app/(onboarding)/income.tsx:138-146,202-221` |
| F9 | High | "Mark as recurring" is buried in a More-options sheet whose keyboard covers it; promoting it needs a layout rebuild (user request #4) | `app/(tabs)/record.tsx:534-638` |
| F10 | High | Paywall's primary CTA is an empty handler — every Plus-gated path dead-ends | `app/more/paywall.tsx:108-116` |
| F11 | Medium | `KeyboardAvoidingView` nested *inside* a `ScrollView` on Ask — input bar stays behind the keyboard | `app/more/ask.tsx:151-203` |
| F12 | Low | Floating tab bar hard-codes its offset instead of reading the bottom safe-area inset | `app/(tabs)/_layout.tsx:140-161` |
| F13 | Medium | Tab-bar/home-indicator clearance is hard-coded in 14 places instead of measured | `app/(tabs)/index.tsx:336` (+13) |
| F14 | Medium | 8 of 11 `<Modal>`s have no `onRequestClose` — Android back button is inert inside them | `app/more/settings.tsx:389,425,453,481,534` |
| F15 | Medium | `CategoryPicker` modal: create-category input is covered by the keyboard, no bottom safe area, no close on back | `src/components/CategoryPicker.tsx:82-138` |
| F16 | Medium | Settings currency/locale pickers are un-scrollable fixed lists with no safe area inside the modal | `app/more/settings.tsx:425-478` |
| F17 | High | More-options sheet has no `KeyboardAvoidingView`; the Note keyboard covers the *entire* sheet, including the field being typed into | `app/(tabs)/record.tsx:573-638` |
| F18 | Medium | Insights month sheet: no bottom inset, no `onRequestClose`, tapping sheet padding dismisses it | `app/(tabs)/insights.tsx:470-498` |
| F19 | Medium | `AmountAdjustChips` labels are hard-coded `−$1 / +$1 / +$5 / +$10` regardless of currency | `src/components/AmountAdjustChips.tsx:31` |
| F20 | Medium | `RecurringPatternBanner` renders raw ISO codes: "USD 42.00" instead of "$42.00" | `src/components/RecurringPatternBanner.tsx:115` |
| F21 | Medium | `Money` formats thousands with hard-coded `'en-US'`, ignoring the user's locale | `src/components/Money.tsx:51` |
| F22 | Low | Status-bar style is set once at the root (`style="dark"`) and never varied per screen; low contrast around the dark paywall | `app/_layout.tsx:112` + `app/more/paywall.tsx:163-166` |
| F23 | Low | Edit-transaction: `autoFocus` opens the keyboard on mount over a Save button that is the last child of a long ScrollView | `app/transaction/edit.tsx:247,316-326` |
| F24 | Medium | Nothing in the app handles Dynamic Type; the fixed-height layouts break at accessibility text sizes | app-wide |
| F25 | Medium | Scan buttons show no disabled affordance, and the loading one hides its label instead of graying out | `app/(tabs)/record.tsx:429-452` |
| F26 | Medium | 3 genuine sub-44pt touch targets out of 10 audited (settings toggle, recurring-banner buttons, Voice/Manual tabs) | `src/components/SettingsList.tsx:172-178` (+2) |
| F27 | Medium | Paywall prices ($4.99 / $39) contradict the documented pricing ($3.99 / $29.99) and are USD-only strings | `app/more/paywall.tsx:93,100` |
| F28 | Medium | `MerchantAvatar` ships every merchant name to `t0.gstatic.com`; the Privacy Center never discloses the third-party call | `src/components/MerchantAvatar.tsx:136-141` |
| F29 | Low | Hard-coded English strings in shipped UI ("All", "used", "/mo", "OK", "Plus") | `app/more/transactions.tsx:209` (+4) |
| F30 | Low | `SafeToSpend.tsx` is dead code — imported nowhere, still bundled | `src/components/SafeToSpend.tsx` |
| F31 | Low | `SafeAreaView` `edges` are inconsistent across 20 screens with no rule behind the variation | app-wide |
| F32 | Low | Detail/Recurring/Privacy back pills live inside the ScrollView and scroll off screen | `app/transaction/[id].tsx:244-252` (+3) |
| F33 | Low | `UndoSnackbar` is positioned for the tab bar but renders on tab-less Stack screens too | `src/components/UndoSnackbar.tsx:76-89` |
| F34 | Low | Record screen's close button uses `router.push('/(tabs)')` instead of dismissing | `app/(tabs)/record.tsx:347` |
| F35 | Low | Scan spinner is set *after* the camera round-trip, so the tap has no immediate feedback | `app/(tabs)/record.tsx:231-248` |
| F36 | Low | Two stale brand comments: "The Listening Drop" survives the Coin & Wave mark change | `app/(auth)/sign-in.tsx:125,282` |
| F37 | Medium | Every `KeyboardAvoidingView` not mounted at the screen origin under-lifts, because RN compares a parent-relative frame to a screen-space keyboard frame | `src/components/VoiceConfirmModal.tsx:141` (+2) |

---

## Findings

### F1. Parsed-Transaction sheet overflows its own `maxHeight`; the Save button lands below the screen edge
- **Severity:** Critical
- **Status:** User-reported (bug #1)
- **Where:** `apps/mobile/src/components/VoiceConfirmModal.tsx:138-142` (the broken nesting), `:285-297` (the footer that falls off), `:312-322` (`sheet` style), `:358-365` (`footer` style). Consumed by `apps/mobile/app/(tabs)/record.tsx:643-657` for all three variants (voice parse, receipt scan, paycheck scan — `handleScan` at `:231-272` funnels both scan types into the same modal via `voice.injectParsed`).
- **What the user sees:** After a voice parse or either scan type, the "Parsed Transaction" sheet slides up and the green **Save** button is cut in half by the bottom of the screen, or is entirely off-screen. It is worse when the AI flags the transaction as recurring (the frequency chip row expands) and on smaller phones. Scrolling the sheet's body does not bring it back, because the body is not the thing that is scrolling.
- **Root cause:** The sheet declares a bounded height, but the child chain between the bound and the ScrollView is not allowed to shrink, so the ScrollView never becomes scrollable and the content simply overflows past the sheet's clipped bottom edge.

```tsx
// VoiceConfirmModal.tsx:138-142
<Modal visible={visible} animationType="slide" transparent onRequestClose={onDismiss}>
  <Pressable style={styles.backdrop} onPress={onDismiss}>
    <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView edges={['bottom']}>
```

```tsx
// VoiceConfirmModal.tsx:312-322
sheet: {
  backgroundColor: Colors.background,
  borderTopLeftRadius: 28,
  borderTopRightRadius: 28,
  maxHeight: '72%',          // <-- the only height bound in the tree
  ...
},
```

  Mechanism, step by step:
  1. `backdrop` is `flex: 1, justifyContent: 'flex-end'`, so `sheet` is bottom-anchored and clamped to 72% of the screen.
  2. `KeyboardAvoidingView` with `behavior="padding"` renders `<View style={[style, {paddingBottom}]}>`. **No `style` prop is passed here**, so it is a bare RN `View`: `flexGrow: 0`, and — critically — RN's default `flexShrink` is **0**, not 1 as on the web. It therefore refuses to shrink under the sheet's `maxHeight`.
  3. `SafeAreaView` (`:142`) is likewise a plain view with `flexShrink: 0` and no style.
  4. The `ScrollView` at `:152` *does* carry RN's built-in `flexGrow: 1, flexShrink: 1` (`ScrollView`'s `baseVertical` style), but its parents have handed it an **unbounded** height, so its flex-basis resolves to its content size. It grows to full content height instead of scrolling.
  5. Measured against the real token values (`Spacing.xs/sm/md/base/lg = 4/8/12/16/20`, `Typography.size.base = 15`): handle 12 + header ~40 + scroll content (amount card ~155, merchant field ~53, category field ~57, note field ~53, `RecurringToggle` 57 collapsed / ~103 expanded, 4 × 12pt gaps, 24pt content padding) + footer (`paddingTop 8` + 42pt button + `paddingBottom 20` + 34pt bottom inset ≈ 104). On a 390×844 iPhone that totals **≈603pt collapsed against a 607pt cap** — i.e. it lands within a few points of the edge, and tips over as soon as *anything* adds height: the AI marks the transaction recurring and the frequency chip row expands (**≈649pt, ~42pt of overflow**), or `needs_clarification` renders the clarify card (`:157-161`), or the low-confidence line renders (`:280-282`), or the merchant/category text wraps. On a 375×667 device the cap is 480pt and the sheet overflows by **~120pt collapsed and ~170pt expanded, unconditionally**. That razor-thin margin is exactly why the bug reads as intermittent to the user.
  6. RN `View` defaults to `overflow: 'visible'` on iOS, so the excess renders *outside* the sheet — i.e. past the bottom of the display. The footer is the last child, so the Save button is exactly what falls off.
  7. **Aggravator (see F37):** tapping the amount field to correct a mis-parse — the single most common action in this sheet, per the component's own comment at `:378-379` — opens a `decimal-pad` that has no Done key, and the `KeyboardAvoidingView` at `:141` computes its lift from a frame whose origin is the *sheet*, not the screen, so it under-lifts by the sheet's own top offset (~240pt on an iPhone 14). Save is then unreachable even on a device where the collapsed sheet fits.

  The contrast that proves the diagnosis is the sibling sheet in `record.tsx:972-979`: `moreOptionsSheet` uses the identical `maxHeight` bottom-sheet pattern but puts the `ScrollView` as a **direct child** of the bounded view — no KAV, no SafeAreaView in between — and that sheet's scroll region shrinks correctly. Same for `insights.tsx`'s `monthSheet` (`:763-770`).
- **Blast radius:** This is the terminal step of the app's three highest-value flows (voice capture, receipt scan, paycheck scan) — the entire product promise. A user who cannot reach Save either loses the transaction or force-taps a half-visible target. It is also the only place `is_recurring` gets set from voice, which feeds the (empty) recurring pipeline — production `recurring_rules` has **zero rows ever**, and this sheet plus F9 are the two places a rule could have been created from. (Note: `transactions.note` being NULL on all 18 production rows is *not* attributable to this finding — `ParsedExpense` in `packages/shared/src/types/ai.ts` has no `note` field at all, so the Note input is never pre-filled from a parse; see the AI-parsing audit.)
- **Same defect elsewhere:** Grepped `maxHeight: '` and `<KeyboardAvoidingView` across `apps/mobile`. The exact "bounded sheet + non-shrinking wrapper" combination is unique to `VoiceConfirmModal.tsx:140-142`. Related but distinct height-management defects: `src/components/IncomeEditorModal.tsx:70-74` (KAV with `sheetWrap: { justifyContent: 'flex-end' }` and **no** `maxHeight` at all — the sheet has no scroll container, so at large Dynamic Type or on a short phone with the keyboard up, the source input and helper text simply run off the bottom); `app/(tabs)/insights.tsx:763-770` (`monthSheet` `maxHeight: '60%'` — this one is safe, ScrollView is a direct child); `app/(tabs)/record.tsx:972-979` (safe, same reason).
- **Fix:** Make the height bound propagate to the ScrollView. In `VoiceConfirmModal`, give the sheet a real flex column and let the scroll region shrink:
  - `styles.sheet` → keep `maxHeight: '72%'` and add `overflow: 'hidden'` so a future regression clips visibly instead of silently painting off-screen.
  - `<KeyboardAvoidingView style={{ flexShrink: 1 }} …>` and `<SafeAreaView edges={['bottom']} style={{ flexShrink: 1 }}>`.
  - Add `style={{ flexShrink: 1 }}` to the `ScrollView` at `:152` so it is the element that gives.
  - The KAV must additionally be moved *outside* the sheet (wrapping the backdrop) or replaced, because at its current depth it cannot compute a correct lift — see F37.
  The architectural version — which I recommend, because this pattern is repeated in four sheets — is a single shared `<BottomSheet>` primitive in `src/components/BottomSheet.tsx` that owns backdrop, handle, header, a `flexShrink: 1` scroll body, a pinned footer, `useSafeAreaInsets().bottom` padding, `onRequestClose`, and one correctly-rooted keyboard strategy; then have `VoiceConfirmModal`, the record More-options sheet, `IncomeEditorModal` and the Insights month picker all render through it. Patching the four call sites individually is exactly the patch-stacking the owner has rejected.
- **Regression test to add:** Render `VoiceConfirmModal` with a parsed expense that has `is_recurring_suggestion: true` and 12 categories on a 667×375 viewport; assert via `onLayout` that the Save button's `pageY + height <= screenHeight - insets.bottom`.

---

### F2. Manual tab is a fixed, non-scrolling column; on 667pt devices the "Add expense" CTA sits entirely behind the floating tab bar
- **Severity:** Critical
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/(tabs)/record.tsx:458-569` (the JSX), `:818-824` (`manualContainer`), `:911-934` (`keypad`), `:937-942` (`footerRow`), `:1007-1014` (`addButton`). Interacts with `app/(tabs)/_layout.tsx:140-161` (the absolutely-positioned tab bar).
- **What the user sees:** On an iPhone SE / 8 / SE-3 (375×667), switching to the Manual tab and typing an amount shows the keypad, but the "More options" pill and the dark "Add expense" button are hidden underneath the frosted floating tab bar. The manual-entry flow cannot be completed on those devices.
- **Root cause:** `manualContainer` is a `flex: 1` column with `justifyContent: 'space-between'` and a hard-coded `paddingBottom: 120` and **no ScrollView anywhere**. When the intrinsic content height exceeds the content box, `space-between` degenerates to zero spacing and the last child simply overflows the bottom.

```tsx
// record.tsx:818-824
manualContainer: {
  flex: 1,
  paddingHorizontal: Spacing.base,
  paddingTop: 4,
  paddingBottom: 120,          // "clears the absolute tab bar ... on every supported iPhone"
  justifyContent: 'space-between',
},
```

  The arithmetic on a 375×667 device (top inset 20, bottom inset 0):
  - `SafeAreaView edges={['top']}` height = 667 − 20 = **647**
  - `pageHeader` (`:664-671`) = 8 + 36 + 4 = **48**
  - `tabRow` (`:690-702`) = marginTop 16 + border 2 + padding 8 + (8 + ~17 + 8) = 59, + marginBottom 8 = **67**
  - ⇒ `manualContainer` height = 647 − 48 − 67 = **532**; content box = 532 − 4 − 120 = **408**
  - `topCluster`: `amountCard` (14 + 33 + 8 + 64 + 8 + 15 + 14 + borders) ≈ 158, gap 8, `quickFields` (35 + 4 + 45) = 84 → **250**
  - `bottomCluster`: keypad (4 × 44 + 3 × 5) = 191, gap 8, `footerRow` (marginTop 4 + height 44) = 48 → **247**
  - Content needed **497** vs **408** available ⇒ **89pt overflow**.
  - The footer's bottom edge therefore lands at `screenBottom − 120 + 89 = screenBottom − 31`, i.e. its 44pt box spans `screenBottom − 75 … − 31`.
  - The tab bar (`_layout.tsx:140-161`: `position: 'absolute', bottom: 14, height: 68`) occupies `screenBottom − 82 … screenBottom − 14` and is painted *after* the screen. The entire footer row is inside that band.

  Even on an iPhone 14 Pro (852pt, top inset 59) the slack is only ~65pt, and the comment at `:810-817` asserting the content "is sized to fit in one viewport" is an assumption that was never guarded.
- **Blast radius:** Manual entry is the documented fallback for every voice failure (`DayOneFirstLog`'s "Or type instead" routes here via `index.tsx:193-201`). On small devices the fallback for the flaky flow is itself broken. It also removes all headroom for user request #4 (F9): there is nowhere to put the recurring toggle. The same fixed-column pattern with a bottom-pinned CTA and no scroll appears in the onboarding flow (see "Same defect elsewhere").
- **Same defect elsewhere:** Grepped for `justifyContent: 'space-between'` on `flex: 1` containers and for screens with a bottom-anchored primary action and no `ScrollView`:
  - `app/(onboarding)/income.tsx:253` — `content: { flex: 1, … }` with `<View style={{flex:1}} />` at `:202` and the CTA at `:207-221`, no ScrollView (see F8; overflows by ~90pt on 667pt devices before the keyboard is even considered).
  - `app/(onboarding)/permissions.tsx:116` — same shape (`content: { flex: 1 }`, spacer at `:101`, CTA at `:103-108`, no ScrollView). Survives today only because the card list is short; one added permission card or 150% Dynamic Type pushes Continue off-screen.
  - `app/more/paywall.tsx:89-119` — the plan cards + Upgrade CTA are in a fixed `bottom` block outside the ScrollView. Safe today (the ScrollView absorbs the overflow) but the same "the bottom block is assumed to fit" assumption.
  - `src/components/IncomeEditorModal.tsx:137-142` — sheet with no scroll container.
- **Fix:** The Manual tab needs an architectural change, not a padding tweak. Two coupled changes: (1) replace the hard-coded `paddingBottom: 120` with `useBottomTabBarHeight()` from `@react-navigation/bottom-tabs` (the tab bar's real height including its 14pt offset and the bottom inset) — this is the only correct source for that number and it is currently used nowhere in the app; (2) make the container tolerate overflow by wrapping `topCluster` in a `ScrollView` with `contentContainerStyle={{ flexGrow: 1 }}` while keeping `bottomCluster` (keypad + CTA) pinned outside it as a fixed footer. That guarantees the keypad and the CTA are always on-screen and only the amount/merchant/category block scrolls when space runs out. Add a `minHeight` assertion in dev so the layout fails loudly rather than silently sliding under the bar.
- **Regression test to add:** Layout snapshot of the Manual tab at 375×667 asserting `addButton.pageY + addButton.height <= screenHeight - tabBarHeight`.

---

### F3. `ListeningView` has no top safe-area inset — the LISTENING/PROCESSING pill renders under the status bar
- **Severity:** High
- **Status:** User-reported (bug #3)
- **Where:** `apps/mobile/src/components/ListeningView.tsx:166-183` (the `screen` root + top row), `:243-254` (`screen` + `topRow` styles). Rendered from `apps/mobile/app/(tabs)/record.tsx:330-341`.
- **What the user sees:** While recording (and again while the parse runs), the pulsing sage dot and the "LISTENING" / "PROCESSING" eyebrow render *behind the status bar* — colliding with the clock on the left, and the close pill colliding with the battery/signal cluster on the right. Every device with a top inset ≥ 20pt is affected, which is every supported iPhone.
- **Root cause:** The Record screen's `SafeAreaView` is *bypassed* by an early return, and `ListeningView` opens with a bare `View`.

```tsx
// record.tsx:330-341  — this return happens BEFORE the <SafeAreaView edges={['top']}> at :344
if (isListening || isProcessing) {
  return (
    <ListeningView ... />
  )
}
```

```tsx
// ListeningView.tsx:243-254
screen: {
  flex: 1,                    // no SafeAreaView, no useSafeAreaInsets
  backgroundColor: Colors.background,
},
topRow: {
  paddingHorizontal: 20,
  paddingTop: 8,              // <-- 8pt, vs a 47-59pt top inset on modern iPhones
  ...
},
```

  The `liveWrap` row is 20pt tall (`dotStyles.wrap`, `:392-397`), so it occupies y = 8…28 — entirely inside the status-bar region (20pt on SE, 47-59pt on notch/Island devices). The close pill at `:175-182` (36pt, y = 8…44) is in the same band. **Correction to an over-claim:** the pill is right-aligned (`topRow` is `justifyContent: 'space-between'` with `paddingHorizontal: 20`), so it does *not* sit under the horizontally-centred Dynamic Island and remains tappable; the defect is purely visual collision with the status-bar glyphs, on the app's most important screen.
- **Blast radius:** This is the full-screen takeover the user sees for the entire duration of every voice capture — the app's signature interaction. It also affects the close/cancel affordance, which is the only escape from a stuck recording.
- **Same defect elsewhere:** Grepped every top-level screen render for `SafeAreaView`/`useSafeAreaInsets`. `useSafeAreaInsets` is used **zero times** in the app. Components rendered full-bleed without a top inset:
  - `src/components/ListeningView.tsx:243` — this finding.
  - `src/components/DayOneFirstLog.tsx:36-39,96-99` — `topRow` has `paddingTop: 8`; it is saved only because its host wraps it in `<SafeAreaView edges={['top']}>` at `index.tsx:189`. Fragile by construction — the component itself makes no guarantee.
  - `app/more/settings.tsx:425-478,481-531,534-558` — three `<Modal presentationStyle="pageSheet">` bodies use a plain `<View style={styles.modal}>` (`:643`) with no SafeAreaView, unlike the export modal at `:390` which does use one. On Android `pageSheet` degrades to full-screen, so those three modals render under the status bar.
  - `src/components/CategoryPicker.tsx:83` and `src/components/BudgetEditorModal.tsx:78` — same: `modal: { flex: 1 }` with no inset, full-screen on Android.
- **Fix:** Add `const insets = useSafeAreaInsets()` in `ListeningView` and apply `paddingTop: insets.top + 8` to `topRow` and `paddingBottom: insets.bottom + …` to `bottom` (which currently hard-codes `110` at `:331`). Do **not** wrap it in a `SafeAreaView` inside `record.tsx` — the view is deliberately full-bleed and its own hero spacing depends on that. Then apply the same treatment to the four modal bodies listed above; the shared `<BottomSheet>` / `<ModalScreen>` primitive proposed in F1 should own this so it cannot drift again.
- **Regression test to add:** Render `ListeningView` with `SafeAreaProvider initialMetrics={{ insets: { top: 59, … } }}` and assert the "LISTENING" text's measured `pageY >= 59`.

---

### F4. One `scanLoading` flag drives two buttons, and only the Receipt button renders the spinner
- **Severity:** High
- **Status:** User-reported (bug #2)
- **Where:** `apps/mobile/app/(tabs)/record.tsx:107` (state), `:231-272` (`handleScan`), `:429-452` (the two buttons).
- **What the user sees:** Tap **Scan Paycheck**, take the photo, come back — and the spinner appears on the **Scan Receipt** button next to it. The Paycheck button looks idle, so the user taps it again.
- **Root cause:** A single boolean is shared by two sibling buttons, and only one of them was given a loading branch.

```tsx
// record.tsx:107
const [scanLoading, setScanLoading] = useState(false)

// record.tsx:248 — set for BOTH scan types, with no record of which one
setScanLoading(true)

// record.tsx:430-451
<Pressable style={styles.scanButton} onPress={() => handleScan('receipt')} disabled={scanLoading}>
  {scanLoading ? (
    <ActivityIndicator color={Colors.primary} size="small" />   // <-- the ONLY spinner
  ) : (
    <><Ionicons name="scan-outline" .../><Text …>{t('voice.scan_receipt', …)}</Text></>
  )}
</Pressable>
<Pressable style={styles.scanButton} onPress={() => handleScan('paycheck')} disabled={scanLoading}>
  <Ionicons name="card-outline" size={18} color={Colors.primary} />
  <Text style={styles.scanLabel}>{t('voice.scan_paycheck', …)}</Text>   // <-- never shows loading
</Pressable>
```

  The `type` argument (`'receipt' | 'paycheck'`) is never stored in state, so the render has no way to know which button is busy even if the second branch existed. `handleScan` also collapses both types into `setTransactionSource('scan')` at `:264`, so the distinction is lost in the database too.
- **Blast radius:** A double-tap during an in-flight scan is prevented by `disabled`, so no duplicate transaction is created — but the user is told the wrong thing about their own money capture. The same ambiguity means the two flows are indistinguishable in `transactions.source` (production shows only `'scan'`, never a paycheck-specific value), which removes the ability to ever measure or debug paycheck-scan quality.
- **Same defect elsewhere:** Grepped every `useState<boolean>` used as a loading flag against the number of buttons it gates:
  - `app/(tabs)/record.tsx:107` — this finding (2 buttons, 1 flag, 1 spinner).
  - `app/more/settings.tsx:100` — **correct pattern**, `exporting: ExportFormat | null` keys the spinner per row (`:399,416`). This is the model to copy.
  - `app/recurring.tsx:80` — **correct**, `toggling: string | null` keyed by rule id (`:199,229`).
  - `app/(auth)/sign-in.tsx` `loading` gates the Google button, the Apple button *and* the email submit (`:168,183,241`) but renders the spinner only inside the email submit at `:243`. Same class of bug: pressing "Continue with Google" leaves all three buttons silently inert with no visible progress.
  - `app/more/privacy.tsx:277,281` — `exporting` and `deleting` swap the row *label* to a `…_busy` string, with no spinner and no `disabled` prop. **Partially refuted:** a second tap does *not* re-enter, because `handleExportAll` early-returns on `if (exporting)` (`:131`) and `handleDeleteAll` on `if (deleting || !user?.id)` (`:149`). The remaining defect is presentational only — the row stays visually tappable and the localized busy label is the sole feedback.
- **Fix:** Replace `scanLoading: boolean` with `scanning: 'receipt' | 'paycheck' | null`. Extract the two buttons into a single local `ScanButton({ type, icon, label })` component that reads `scanning === type` for its own spinner and `scanning !== null` for its disabled state, so the two can never diverge again. Then apply the same keyed-state shape to `sign-in.tsx` (`loading: 'google' | 'apple' | 'email' | null`) and `privacy.tsx`. Also thread the scan type through to `source` — `'scan'` should become distinguishable (a `scan_type` column, or `source: 'scan'` + `note`), since the DB CHECK constraint already only allows `'scan'`.
- **Regression test to add:** Fire `press` on the Paycheck button with a stubbed `parseScan` that never resolves; assert an `ActivityIndicator` exists inside the Paycheck `Pressable` and not inside the Receipt one.

---

### F5. No font is ever loaded; 305 `fontFamily` rules silently fall back to the system font
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/theme/typography.ts:22-32` (the family names), `apps/mobile/app/_layout.tsx` (where `useFonts` should be and isn't), `apps/mobile/package.json:26` (`expo-font` declared but never imported). Counted by grep: **305** `fontFamily` declarations across **39** files, of which **262** resolve to a `PlusJakartaSans` face, **1** to `DMMono`, and 41 to the system serif.
- **What the user sees:** Nothing renders in Plus Jakarta Sans. Everything is San Francisco. Worse: every style that names a bold/semibold family but omits `fontWeight` renders at **regular** weight, so the intended hierarchy flattens — the Record screen's "Speak it." H1, the Parsed-Transaction sheet title, the CategoryPicker modal title and the transaction-detail labels all render as body text.
- **Root cause:** The font files do not exist and nothing loads them.

```ts
// src/theme/typography.ts:22-32  (comments elided)
fontFamily: {
  sans: 'PlusJakartaSans',
  sansBold: 'PlusJakartaSans-Bold',
  sansSemiBold: 'PlusJakartaSans-SemiBold',
  serif: serifFamily,            // 'New York' on iOS
  serifBold: serifFamily,
  mono: 'DMMonoRegular',
  monoBold: 'DMMonoBold',
},
```

  The file's own header comment at `:1-9` states the sans and mono families are "loaded via expo-font". Nothing loads them.

  Verification run against the repo:
  - `find . -name "*.ttf" -o -name "*.otf"` (excluding `node_modules`) → **zero results**. `apps/mobile/assets/` contains only `icon.png`, `adaptive-icon.png`, `splash-icon.png`, `favicon.png`, `brand/`.
  - `grep -rn "useFonts\|Font.loadAsync" apps/mobile` → **zero results**. `app/_layout.tsx` calls `SplashScreen.preventAutoHideAsync()` (`:16`) and hides it at `:55` with no font gate.
  - `app.config.js` has no `expo-font` plugin entry and no `fonts` asset config.

  On iOS, `RCTFont` resolves an unknown family via `[UIFont fontNamesForFamilyName:]`; an empty result falls through to `[UIFont systemFontOfSize:weight:]` using whatever `fontWeight` the style declares — **default regular**. Concrete casualties (family set, `fontWeight` absent): `src/theme/typography.ts:60-64` `Text.h1` (used by `record.tsx:722-726` for the "Speak it." headline), `:55-59` `Text.navTitle` (the Record page title, `record.tsx:686`), `src/components/VoiceConfirmModal.tsx:339-343` `title`, `src/components/CategoryPicker.tsx:209-213` `modalTitle`, `app/(tabs)/record.tsx:1026-1030` `label`, `app/transaction/edit.tsx:365` `label`.
- **Blast radius:** Every screen on every platform. The redesign this codebase spent a phase on (`docs/PLAN.md` Phase A: "sage palette, serif amounts") is not what ships. It also means the padding arithmetic in F1/F2 is computed against SF metrics rather than Jakarta metrics — so fixing the fonts will *change* every layout that is already at its overflow margin.
- **Same defect elsewhere:** This is the single root; there are no partial instances. Grepped: `useFonts`, `Font.loadAsync`, `expo-font`, `*.ttf`, `*.otf`, `PlusJakartaSans`, `DMMono`.
- **Fix:** Either load the fonts or delete the lie. Loading: add `PlusJakartaSans-{Regular,SemiBold,Bold}.ttf` + `DMMono-{Regular,Bold}.ttf` to `apps/mobile/assets/fonts/`, call `useFonts({...})` in `app/_layout.tsx`, and gate the existing `ready` flag (`:33`) on `fontsLoaded` so the splash stays up until they're registered — the splash gate already exists, it just needs the extra condition. Not loading: strip `fontFamily` from `src/theme/typography.ts` entirely and express the type system in `fontWeight` alone, so that no style silently claims a face it doesn't have. Do **not** leave it half-way. Additionally, sweep the 6 styles listed above to always pair `fontFamily` with an explicit `fontWeight` — that pairing is the only thing that keeps the design intact under any fallback.
- **Regression test to add:** A unit test that walks `src/theme/typography.ts`'s `fontFamily` map and asserts every value resolves to a file in `assets/fonts/` or to a documented system family.

---

### F6. `<Money>` defaults to a hard-coded `$`; 11 of 13 call sites omit `sign`
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/components/Money.tsx:15-16` (prop doc), `:44` (the default), `:90` (render). Call sites that omit `sign`: `app/recurring.tsx:180,233`, `app/(tabs)/index.tsx:275`, `app/(tabs)/insights.tsx:365,414`, `app/(tabs)/budgets.tsx:123,125,132`, `src/components/ListeningView.tsx:190`, `src/components/HistoryHeatmap.tsx:162,247`. Only `app/transaction/[id].tsx:266-271` and `src/components/TransactionRow.tsx:103-113` pass it.
- **What the user sees:** A user whose profile currency is EUR/GBP/XAF/NGN sees their Today "Spent today" hero, Insights monthly total, Budgets remaining/limit, Recurring monthly total and per-rule amounts, and the live Listening hero all rendered with a `$`. Transaction rows and the detail screen show the correct symbol. Two screens disagree about the same number.
- **Root cause:**

```tsx
// Money.tsx:38-47
export function Money({
  value, size = 28, serif = true, muted = false,
  sansWeight = '600',
  sign = '$',          // <-- silent USD assumption
  color, style,
}: Props) {
```

  Because the default is valid-looking, every omission compiles and renders plausibly. The two call sites that got it right (`TransactionRow.tsx:109-112` even carries a comment about "a €45 dinner must not render as $45") prove the team knows the rule; the component's API just doesn't enforce it.
- **Blast radius:** Every aggregate surface in the app. A US-only launch masks it today (all 6 production profiles are USD), but `settings.tsx:46` ships a currency picker with 10 currencies including XAF, NGN and GHS, and `TransactionRow` already renders per-row currency correctly — so a multi-currency user gets a row reading "€45.00" summing into a hero reading "$1,250.00". The Listening hero (`ListeningView.tsx:190`) shows "$" during live capture regardless of what the user is about to log.
- **Same defect elsewhere:** Grepped for literal `'$'` and `"$"` in rendered strings:
  - `src/components/AmountAdjustChips.tsx:31` — `` const label = d < 0 ? `−$${Math.abs(d)}` : `+$${d}` `` (F19).
  - `src/components/ListeningView.tsx:192` — `heroPlaceholder` renders the literal string `"$—"`.
  - `app/(onboarding)/income.tsx:137` — `<Text style={styles.currencyGlyph}>$</Text>` hard-coded, even though `currency` is read at `:34` and printed two lines below at `:149`.
  - `app/(onboarding)/income.tsx:16-21` — `PRESETS` labels `'$2.5k' … '$10k'`.
  - `app/more/paywall.tsx:93,100` — `price="$4.99"` / `price="$39"` (F27).
  - `app/(tabs)/index.tsx:319-328` — `formatBudgetShort` hand-rolls a 5-entry glyph map that duplicates and diverges from `currencySymbolFor` in `@voice-expense/shared` (which every other call site uses).
- **Fix:** Make the omission impossible: change `Money`'s `sign` prop from optional-with-default to **required**, delete the `= '$'` default, and fix the 11 call sites to pass `currencySymbolFor(currency)` (the profile currency is already in scope at every one of them). Delete `formatBudgetShort`'s local glyph map in `index.tsx` and route it through `currencySymbolFor`. TypeScript then enforces the rule permanently instead of a code-review convention doing it.
- **Regression test to add:** Set `profile.currency_code = 'EUR'` and snapshot Today/Insights/Budgets/Recurring; assert no rendered string contains `$`.

---

### F7. History heatmap renders a 6-column grid under a 7-column weekday header on every iPhone
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/components/HistoryHeatmap.tsx:165-208` (header + grid JSX), `:295-296` (`weekdayRow`/`weekdayCell`), `:303-311` (`grid`/`cell`/`cellEmpty`). Rendered by `app/(tabs)/insights.tsx:465`.
- **What the user sees:** On Insights → History, the calendar is wrong. Seven single-letter weekday headers (S M T W T F S) sit above a grid that wraps after **six** cells, so day numbers land under the wrong weekday and the month reads as ~5-6 misaligned rows.
- **Root cause:** Percentage widths plus a fixed `gap` that together exceed 100%.

```tsx
// HistoryHeatmap.tsx:303-311
grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
cell: {
  width: '13.1%',        // 7 × 13.1% = 91.7%
  aspectRatio: 1,
  ...
},
cellEmpty: { width: '13.1%', aspectRatio: 1 },
```

  In flexbox, `N` items on a line consume `N` widths **plus** `N−1` gaps. Seven cells need `0.917·W + 6·6 = 0.917W + 36`. That fits only when `W ≥ 36 / 0.083 = 434pt`. The container's content width is `screenWidth − 40` (`heatmapWrap` paddingHorizontal 20 ×2) `− 36` (`heatmapCard` paddingHorizontal 18 ×2) = `screenWidth − 76`. The widest shipping iPhone (440pt) yields 364pt. **No iPhone reaches 434pt**, so the seventh cell always wraps. RN `View`s default to `flexShrink: 0`, so the cells never shrink to compensate.

  Meanwhile `weekdayRow` (`:295-296`) uses `flex: 1` cells, which *do* share the space — producing 7 headers of `(W−36)/7 ≈ 37.6pt` above 6 body cells of `0.131W ≈ 41.2pt`. The two rows can never line up.

  Note that the *column offset logic* is correct: `firstWeekday = new Date(year, month, 1).getDay()` (`:101`) is Sunday-indexed, and `history.weekday_labels` is Sunday-first in all four locales (`packages/shared/src/i18n/locales/en.json:278` = `"S,M,T,W,T,F,S"`, `fr` = `"D,L,M,M,J,V,S"`). This is purely a sizing bug — which makes it the mobile analogue of the confirmed web calendar defect, arriving by a completely different mechanism.
- **Blast radius:** The heatmap is the "year at a glance" surface that Insights was reorganised around (`insights.tsx:459-466`). Every day cell is attributed to the wrong weekday, and the `cellToday` highlight (`:312-315`) marks a cell in the wrong column. Users reading spending-by-weekday from this chart draw wrong conclusions.
- **Same defect elsewhere:** Grepped for percentage widths combined with `gap` in a wrapping container: `grep -rn "width: '" apps/mobile/src apps/mobile/app`. Only `HistoryHeatmap.tsx:305,311` uses a fixed percentage inside a `flexWrap` row. `insights.tsx:422` uses `width: \`${barWidthPct}%\`` but inside a non-wrapping track, which is fine. `MiniBars.tsx:55-63` uses fixed-width bars with `gap` in a non-wrapping row — safe. No other instances.
- **Fix:** Stop expressing the cell width as a percentage of a gap-bearing container. Two correct options: (a) drop `gap` from `grid`, give each cell `width: '14.2857%'` and move the spacing to an inner view with `margin: 3`; or (b) — cleaner and consistent with `weekdayRow` — measure the card's width with `onLayout` and compute `cellSize = (W − 6 * gap) / 7` as a number, using the same value for both the header cells and the grid cells so they are guaranteed to share one source of truth. Option (b) also fixes the header/body mismatch permanently. Do not simply tune `13.1%` down — that is a device-specific patch that breaks on the next screen size.
- **Regression test to add:** Render `HistoryHeatmap` for a 31-day month starting on a Friday at 375pt and 440pt widths; assert exactly 7 cells share each distinct `pageY`.

---

### F8. Onboarding income: the `decimal-pad` keyboard cannot be dismissed and covers the Continue CTA
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/(onboarding)/income.tsx:138-146` (the amount input), `:99-223` (the screen — no `ScrollView`, no `KeyboardAvoidingView`), `:202` (the flex spacer), `:207-221` (the CTA), `:253` (`content` style).
- **What the user sees:** On the last onboarding step the user taps the big amount field, the numeric keypad slides up and covers the source input, the quick-pick presets and the "Continue" button. There is no Done key on the iOS decimal pad, no tap-outside-to-dismiss handler, and no scroll view to swipe-dismiss. The user's only exit is "Skip" in the top bar — which discards the income they just typed.
- **Root cause:** Three missing pieces compound.

```tsx
// income.tsx:138-146
<TextInput
  value={amount}
  onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ''))}
  placeholder="0"
  keyboardType="decimal-pad"     // iOS decimal pad has NO return/done key
  style={styles.amountInput}
  maxLength={9}
/>
```

```tsx
// income.tsx:99-100, 253 — the whole screen is a fixed flex column
<SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
  <View style={styles.topBar}> … </View>
  <View style={styles.content}>   // content: { flex: 1, paddingHorizontal: 28, paddingTop: 32, paddingBottom: 40 }
```

  1. `keyboardType="decimal-pad"` has no dismiss key on iOS, and no `inputAccessoryView`/`returnKeyType` is supplied.
  2. There is no `ScrollView`, so `keyboardDismissMode="on-drag"` isn't available.
  3. There is no `KeyboardAvoidingView`, so nothing lifts the CTA above the keyboard.

  Even with the keyboard *down*, the screen overflows. Measured with the real strings (`en.json:170` headline = "What's your monthly income?" → 2 lines at `lineHeight: 40`; `:171` lead = 104 chars → 3 lines at `lineHeight: 22`): topBar 34 + content padding 72 + iconTile 52 + headline 98 + lead 76 + amountCard ~153 + fieldLabel 40 + sourceInput 44 + presetLabel 42 + presetRow 44 + privacyNote 82 + CTA 56 ≈ **793pt**. Against the available height that is:
  - 375×667 (SE 2/3, iPhone 8): 647pt available → **~145pt of overflow**
  - 390×844 (iPhone 12–16): 763pt available → **~30pt of overflow**
  - 430×932 (Pro Max): 839pt available → fits, ~45pt of slack

  In every overflowing case the `flex: 1` spacer at `:202` collapses to 0 and the CTA — the last child — is pushed past the bottom edge with no scroll container to recover it. The arithmetic carries error bars of a few points on text line-height, but the structural conclusion does not depend on them: **there is no `ScrollView`, so any overflow is unrecoverable.**
- **Blast radius:** This is the terminal step of onboarding for every new user, and on the two most common iPhone sizes the Continue button is off-screen before the keyboard is even considered. `income.tsx:61-93` is the one path in the app that creates a recurring rule *plus* a linked transaction in a single step, and production `recurring_rules` has **zero rows ever** — this finding is a plausible contributor, though it is not the only one (F9 buries the two other entry points, and Skip at `:110-117` completes onboarding without writing anything).
- **Same defect elsewhere:** Grepped every `keyboardType="decimal-pad"` / `"numeric"` against the presence of a dismiss affordance:
  - `app/(onboarding)/income.tsx:143` — this finding: no Done, no scroll, no KAV, CTA below the keyboard.
  - `src/components/IncomeEditorModal.tsx:98,101` — `decimal-pad` + `autoFocus`, no Done key — but "Save" lives in the sheet header *above* the keyboard (`:80-84`), so the user can escape. Acceptable.
  - `src/components/BudgetEditorModal.tsx:102-105` — `decimal-pad` + `autoFocus` + `returnKeyType="done"` (which the decimal pad ignores) — saved by the header Save at `:84-88`. Acceptable.
  - `src/components/VoiceConfirmModal.tsx:195-196` — `decimal-pad` + conditional `autoFocus`, and the Save button is **below** the keyboard in the footer, which is exactly the compounding half of F1. Not acceptable.
  - `app/transaction/edit.tsx:246-247` — `decimal-pad` + unconditional `autoFocus` and the Save button is the last child of a long ScrollView (F23). Recoverable via drag-dismiss, but poor.
  - `app/(tabs)/record.tsx` Manual tab deliberately replaced the native pad with an on-screen keypad (`:517-531`) specifically to avoid this — the correct precedent, applied in exactly one place.
- **Fix:** Wrap `income.tsx`'s `content` in `<ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">` inside a `<KeyboardAvoidingView style={{flex:1}} behavior="padding">` — the exact pattern already used correctly in `app/(auth)/sign-in.tsx:115-124`. Copy that structure rather than inventing a third one. Separately, every `decimal-pad` field in the app should get a shared `InputAccessoryView` with a Done button (a 20-line `src/components/NumericAccessory.tsx` referenced by `inputAccessoryViewID`), so the "numeric keyboards can't be dismissed" class is closed everywhere at once instead of per-screen.
- **Regression test to add:** Mount the income screen at 375×667 with the keyboard shown; assert the Continue button is within the visible viewport.

---

### F9. "Mark as recurring" is buried in a More-options sheet whose own keyboard covers it — and there is no room to lift it out
- **Severity:** High
- **Status:** User-reported (request #4)
- **Where:** `apps/mobile/app/(tabs)/record.tsx:145` (state), `:534-548` (the "More options" trigger), `:571-638` (the modal sheet), `:628-634` (the `RecurringToggle` inside it), `:960-1003` (sheet styles). The control itself: `src/components/RecurringToggle.tsx:35-79`.
- **What the user sees:** To mark a manually-entered transaction as recurring, the user must (1) notice a small grey "More options" pill sitting to the left of the Add button, (2) tap it, (3) scroll past Note and Payment method inside a 70%-height sheet, (4) flip the switch, (5) tap Done. If they touch the Note field on the way, the keyboard opens and hides the toggle they came for, and there is no `KeyboardAvoidingView` in that sheet to recover it.
- **Root cause (structure assessment, as requested):** `moreOptionsOpen` is a plain boolean; the sheet is an inline `<Modal transparent>` whose body is a `ScrollView` containing exactly three things in this order:

```tsx
// record.tsx:593-635
<ScrollView contentContainerStyle={styles.moreOptionsContent} …>
  <View style={styles.field}> …Note TextInput… </View>          // :598-607
  <View style={styles.field}> …Payment method chips… </View>    // :609-626
  <RecurringToggle                                              // :628-634  <-- the target
    isRecurring={manualIsRecurring}
    frequency={manualRecurringFreq}
    onToggle={setManualIsRecurring}
    onFrequencyChange={setManualRecurringFreq}
    locale={userLocale}
  />
</ScrollView>
```

  **What lifting it out actually requires.** The state is already at screen scope (`manualIsRecurring` / `manualRecurringFreq` at `:142-143`) and `handleManualSave` already consumes it (`:291`, `:294-306`), so *the state move is zero work*. The blocker is purely spatial:
  - The natural home is `styles.quickFields` (`:494-510`), immediately under `<CategoryPicker>` at `:503-509` — that is the "category row" the owner named.
  - `RecurringToggle` as it exists is a **card**: bordered container (`RecurringToggle.tsx:82-88`), a 56pt toggle row (`:89-95`: `paddingVertical: Spacing.md` ×2 + a 15pt label + a 31pt iOS `Switch`), and when ON an extra horizontally-scrolling chip row (`:58-76`, `:124-129`) worth another ~54pt. So it costs **~58pt collapsed, ~112pt expanded**.
  - Per F2, the Manual tab already overflows its content box by ~89pt on a 667pt device and has only ~65pt of slack on an iPhone 14 Pro. **Adding 58-112pt breaks the layout on every device.**

  So this is an architectural change, not a component move.
- **Blast radius:** Production `recurring_rules` has **zero rows ever** (confirmed against the live DB) and the Recurring page therefore reads "No recurring rules yet" for every user. Every code path that writes a rule — `record.tsx:294-306` (manual), `record.tsx:205-217` (voice) and `income.tsx:80-92` (onboarding) — is gated behind a control the user has to hunt for or a screen that overflows (F8). It also affects `app/transaction/edit.tsx:307-313`, which renders the same card at the bottom of a long scroll — the same discoverability problem on the edit path.
- **Same defect elsewhere:** Grepped for primary controls hidden behind a disclosure: `record.tsx:534-548` ("More options") is the only progressive-disclosure trigger in the app. `RecurringToggle` is rendered in exactly three places — `record.tsx:628` (behind More options), `VoiceConfirmModal.tsx:271-278` (inline, but in the overflow zone of F1, so effectively hidden too), and `transaction/edit.tsx:307-313` (inline at the bottom of a scroll). **All three of the app's recurring entry points are below the fold.**
- **Fix:** Two coordinated changes.
  1. **Add a compact variant to `RecurringToggle`.** Give it a `variant?: 'card' | 'inline'` prop. `inline` renders a single 44pt pill row — repeat glyph + "Recurring" label + `Switch` — with the frequency selector demoted to a `Pressable` that shows the current frequency (`"Monthly ›"`) and opens a small action sheet, instead of an always-expanding 54pt chip row. Cost: a flat ~44pt with no expansion jump.
  2. **Do F2's fix first.** Wrap the Manual tab's `topCluster` in a `ScrollView` with `contentContainerStyle={{ flexGrow: 1 }}` and pin the keypad + footer. Then place `<RecurringToggle variant="inline" />` inside `styles.quickFields` directly after `<CategoryPicker>` (`record.tsx:509`). With the scroll container in place the 44pt is absorbable on every device.
  3. Keep Note + Payment method in the More-options sheet (they are genuinely secondary), and add a `KeyboardAvoidingView` around that sheet so the Note keyboard stops covering the remaining content (see F17).
  Do not simply move the existing card into `quickFields` — that ships F2 as a guaranteed break on small devices.
- **Regression test to add:** Render the Manual tab at 375×667, assert the "Recurring" switch is visible without opening any sheet, and that the Add button is still fully above the tab bar.

---

### F10. The paywall's primary CTA is an empty handler — every Plus-gated path dead-ends
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/more/paywall.tsx:108-116`. Reached from `app/more/ask.tsx:53-55,60-63,78`, `app/more/settings.tsx:102-105` (export), `app/more/settings.tsx:213-218` (Upgrade pill).
- **What the user sees:** Tap "Ask Murmur", or "Export data", or the "Upgrade" pill — land on a polished dark paywall — tap the big white **Upgrade** button — nothing happens. No spinner, no error, no App Store sheet. The button even animates its pressed state, so it reads as working.
- **Root cause:**

```tsx
// paywall.tsx:108-116
<Pressable
  style={({ pressed }) => [styles.upgradeBtn, pressed && styles.upgradeBtnPressed]}
  onPress={() => {
    // Purchase flow isn't wired yet. Keep the button responsive so the
    // pressed state reads; actual subscription logic is post-Phase D.
  }}
>
  <Text style={styles.upgradeBtnText}>{t('paywall.cta', locale)}</Text>
</Pressable>
```

  The comment is explicit that this is intentional, but the *affordance* is not. A pressed state on a no-op button is worse than a disabled button: it actively signals that the tap registered.
- **Blast radius:** Three separate entry points funnel into a dead end. Apple's review guideline 3.1.1 requires that an in-app purchase surface actually transact; an inert Upgrade button on a screen that advertises "$4.99/month" is a plausible App Store rejection. Users who wanted export or Ask are left with no path and no explanation.
- **Same defect elsewhere:** Grepped for `onPress` handlers with empty or comment-only bodies:
  - `app/more/paywall.tsx:110-113` — this finding.
  - `app/more/ask.tsx:75-79` `onMicPress` — for a Plus user this is a deliberate no-op ("voice-in-Ask isn't built yet"), so a paying user taps the prominent sage mic button and gets nothing.
  - `app/more/ask-result.tsx:141-146` `onActionPress` — the model-generated action pills render and are pressable but are documented inert.
  - `app/transaction/[id].tsx:331-348` — the transcript card renders a play button (`Ionicons name="play"` in a sage circle) that plays nothing; the comment at `:325-330` confirms it is decorative.
  That is **four** pressable-looking controls in the app that do nothing on press. This is a consistent product-honesty problem, not four isolated ones.
- **Fix:** Until IAP is wired, every one of the four must stop looking interactive. For the paywall: render the Upgrade button in a disabled style with a "Coming soon" label, or replace it with a waitlist/notify action that actually does something. For `ask.tsx`'s mic and `ask-result.tsx`'s action pills: remove them from the tree rather than rendering inert affordances (the codebase already made this exact call once — see the removed follow-up bar at `ask-result.tsx:183-189`, which was deleted for precisely this reason; apply the same judgement consistently). For the detail transcript: drop the play glyph for a non-interactive quote mark. The rule to adopt: **nothing in this app renders a pressed state unless it does work.**
- **Regression test to add:** A lint rule or test asserting no `<Pressable>` in `apps/mobile` has an `onPress` whose body is empty.

---

### F11. `KeyboardAvoidingView` nested inside a `ScrollView` on Ask — the input bar stays behind the keyboard
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/more/ask.tsx:89-92` (the ScrollView), `:151-203` (the KAV **inside** it), `:216-217` (`content`/`flex` styles).
- **What the user sees:** On Ask Murmur, tapping the question field opens the keyboard and the input bar plus the "Processed privately" footnote stay underneath it. The user types blind.
- **Root cause:** `KeyboardAvoidingView` with `behavior="padding"` adds `paddingBottom` to **its own** view. Its children are laid out at the top of that view and the padding is appended *below* them — it does not translate them upward. That is only useful when the KAV is the scroll/flex root whose available height shrinks. Here it is the last child *inside* the scroll content:

```tsx
// ask.tsx:89-92, 146, 151-155
<ScrollView contentContainerStyle={styles.content} …>   // content: { flexGrow: 1, paddingBottom: 24 }
  …
  <View style={styles.flex} />                          // flex: 1 spacer
  <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
    <View style={styles.inputWrap}> … </View>
```

  Two things go wrong at once, and both were verified against `node_modules/react-native/Libraries/Components/Keyboard/KeyboardAvoidingView.js` (RN 0.81.5):
  1. **The lift is computed from the wrong origin.** `_onLayout` stores `event.nativeEvent.layout` (`:129`), which is **parent-relative**, and `_relativeKeyboardHeight` returns `Math.max(frame.y + frame.height - keyboardY, 0)` (`:110`) where `keyboardY` is a **screen** coordinate. Here the KAV's parent is the scroll content container, so `frame.y` is an offset inside the scroll content, not a window position. The number it produces is arbitrary. This is the general defect written up as F37.
  2. **Padding cannot move a child up.** `behavior="padding"` appends `paddingBottom` *below* the KAV's children; it only helps when the KAV is the flex root whose available height shrinks. Inside a scroll container it just makes the content taller. The `flex: 1` spacer at `:146` collapses to 0, which pulls the bar up by at most the spacer's height (≈65pt on an iPhone 14) — nowhere near the ~336pt of keyboard.

  Measured on a 390×844 iPhone: non-spacer content is ≈674pt (topRow 52 + hero 214 + four 64pt suggestion rows with 10pt gaps 314 + inputWrap 94), so the input bar occupies viewport y 580…674 while the keyboard's top edge lands at viewport y ≈461. It is ~120pt below the fold and there is nothing left to scroll. The correct arrangement (KAV wrapping the ScrollView, mounted at the screen origin) is already used correctly two files away in `app/(auth)/sign-in.tsx:115-124` and `app/(auth)/sign-up.tsx:72-73`.
- **Blast radius:** Ask Murmur is the headline Plus feature. Also note the screen has `contentContainerStyle: { flexGrow: 1 }` plus a `flex: 1` spacer, so on tall phones the content exactly fills the viewport and there is nothing to scroll — meaning the user cannot even manually scroll the input into view.
- **Same defect elsewhere:** Grepped every `KeyboardAvoidingView` — there are **6** instances in `apps/mobile` (`grep -rn "KeyboardAvoidingView" app src`, excluding import lines and one comment at `record.tsx:456`):
  - `app/more/ask.tsx:151` — inside a ScrollView. **Broken** (this finding).
  - `src/components/VoiceConfirmModal.tsx:141` — outside the ScrollView but with no `flexShrink` (F1) *and* mounted inside the sheet, so its lift is short by the sheet's top offset (F37). **Broken.**
  - `app/transaction/edit.tsx:208-211` — right shape (`style={{flex:1}}`, wraps the ScrollView) but mounted below a native header inside a `presentation: 'modal'` card, so it under-lifts by that offset (F37).
  - `src/components/IncomeEditorModal.tsx:70-73` — `sheetWrap` has no `flex`, so it is content-sized, but its parent `backdrop` (`flex: 1`, `justifyContent: 'flex-end'`) puts `frame.y + frame.height` exactly at the screen bottom, so the lift is correct. Works today by construction, not by design.
  - `app/(auth)/sign-in.tsx:116-119`, `app/(auth)/sign-up.tsx:73` — **correct**: the enclosing `SafeAreaView` is at the screen origin, so `frame.y` picks up the top inset and the arithmetic resolves right. Use these as the reference.
  Screens with a `TextInput` and **no** KAV at all: `app/(tabs)/record.tsx` More-options sheet (F17) and Manual merchant field, `app/(onboarding)/income.tsx` (F8), `src/components/CategoryPicker.tsx` (F15), `app/more/settings.tsx` name + API-URL modals, `app/more/transactions.tsx:185-192` (search — benign, the list scrolls).
- **Fix:** Move the KAV to wrap the ScrollView in `ask.tsx` — `<KeyboardAvoidingView style={{flex:1}} behavior="padding"><ScrollView …>…</ScrollView><View style={styles.inputWrap}>…</View></KeyboardAvoidingView>` — pinning the input bar as a sibling *outside* the scroll region, which is also the right IA (a chat composer should not scroll away). Then delete the `flex: 1` spacer at `:146`, which exists only to fake that pinning.
- **Regression test to add:** Show the keyboard on the Ask screen and assert the send/mic button's `pageY + height <= screenHeight - keyboardHeight`.

---

### F12. The floating tab bar hard-codes its offset instead of reading the bottom safe-area inset
- **Severity:** Low — *downgraded from Medium during verification: nothing is actually blocked. The bar's touch targets sit at 24–82pt from the bottom edge (`paddingBottom: 10` above `bottom: 14`), i.e. above the ~20pt system edge-swipe strip, so the original "taps get swallowed" claim does not hold. What survives is a robustness/consistency defect.*
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/(tabs)/_layout.tsx:140-161`.
- **What the user sees:** On any home-indicator iPhone the frosted pill sits a fixed 14pt from the physical bottom edge, overlapping the lower part of the 34pt home-indicator band; the pill's bottom edge and the indicator crowd each other. On a future device with a different bottom inset the geometry does not adapt at all.
- **Root cause:** React Navigation's `BottomTabBar` normally computes `height = tabBarHeight + insets.bottom` and applies `paddingBottom: insets.bottom`. The custom `tabBarStyle` is merged **last**, so it overrides both:

```tsx
// _layout.tsx:140-161
tabBar: {
  position: 'absolute',
  left: 16, right: 16,
  bottom: 14,        // <-- constant, not insets.bottom + 14
  height: 68,        // <-- overrides React Navigation's inset-aware height
  borderRadius: 34,
  ...
  paddingBottom: 10, // <-- overrides insets.bottom
  ...
},
```

  Note also that `left: 16, right: 16` (`:142-143`) coexists with `paddingHorizontal: 9` (`:153`) and `marginHorizontal: 21` (`:154`), so the bar's actual inset from the screen edge is 37pt, not the 16pt the style reads as. That's not a bug per se, but it means nobody can reason about this geometry from the source — which is why every screen's bottom padding is guessed.
- **Blast radius:** Every tab screen's bottom padding is derived from these numbers by hand (F13). Getting the bar wrong propagates to five screens.
- **Same defect elsewhere:** `src/components/UndoSnackbar.tsx:81` — `bottom: 14 + 68 + Spacing.sm`, which re-derives the same constants a second time (F33). No other absolutely-positioned bottom chrome.
- **Fix:** In `TabsLayout`, read `const insets = useSafeAreaInsets()` and build `tabBarStyle` as an array: `[styles.tabBar, { bottom: insets.bottom + 8 }]`. Export the resulting total height from a single module (`src/theme/chrome.ts`: `export const TAB_BAR_HEIGHT = 68`) so screens and the snackbar consume one value instead of three copies of a magic number.
- **Regression test to add:** Render the tabs layout with `insets.bottom = 34` and assert `tabBarStyle.bottom >= 34`.

---

### F13. Tab-bar / home-indicator clearance is hard-coded in 14 places instead of measured
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** Every scroll container that has to clear the floating tab bar picks its own number.
- **What the user sees:** Inconsistent bottom gaps between tabs — Today leaves 140pt of dead space under the last transaction, Insights 120pt, More 120pt, Budgets 140pt — and on Stack screens with no tab bar at all (`more/transactions.tsx`) 120pt of empty space below the last row.
- **Root cause:** No screen measures anything. `useSafeAreaInsets` is called **zero** times and `useBottomTabBarHeight` **zero** times in the entire app; every clearance is a literal.

```tsx
// index.tsx:335-337
content: {
  paddingBottom: 140, // clear the floating tab bar
},
```
- **Blast radius:** Any change to the tab bar's geometry silently breaks or over-pads five screens. It is also the direct cause of F2 (the `120` in `record.tsx:822` was chosen for a tall phone) and of the 120pt of dead space on tab-less screens.
- **Same defect elsewhere:** Exhaustive list of hard-coded bottom clearances (grepped `paddingBottom: 1[0-9][0-9]`, `paddingBottom: 40`, `bottom: `):
  - `app/(tabs)/index.tsx:336` — `140`
  - `app/(tabs)/budgets.tsx:189` — `140`
  - `app/(tabs)/insights.tsx:509` — `120`
  - `app/(tabs)/more.tsx:141` — `120`
  - `app/(tabs)/record.tsx:716` — `110` (voice tab)
  - `app/(tabs)/record.tsx:822` — `120` (manual tab)
  - `app/(tabs)/record.tsx:977` — `paddingBottom: 32` on the More-options sheet
  - `src/components/ListeningView.tsx:331` — `110`
  - `src/components/DayOneFirstLog.tsx:94` — `120`
  - `src/components/UndoSnackbar.tsx:81` — `bottom: 14 + 68 + Spacing.sm`
  - `src/components/IncomeEditorModal.tsx:141` — `paddingBottom: 32`
  - `app/more/transactions.tsx:393` — `120` (on a screen with **no** tab bar)
  - `app/more/help.tsx:43` — `120` (no tab bar)
  - `app/(tabs)/_layout.tsx:144,145` — `bottom: 14`, `height: 68`, the source constants

  (Also grepped and deliberately excluded: `app/(auth)/sign-in.tsx:279` and `app/(auth)/sign-up.tsx:149` both use `paddingBottom: 32`, but those are form padding on tab-less auth screens, not tab-bar clearance.)
- **Fix:** Create `apps/mobile/src/theme/chrome.ts` exporting `TAB_BAR_HEIGHT`, `TAB_BAR_BOTTOM_OFFSET`, and a `useTabBarClearance()` hook returning `TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_OFFSET + insets.bottom`. Replace all 14 literals. On tab-less Stack screens use `useSafeAreaInsets().bottom + 24` instead of the copy-pasted 120.
- **Regression test to add:** A lint rule banning numeric literals ≥ 100 in a `paddingBottom` within `apps/mobile`.

---

### F14. 8 of 11 `<Modal>`s have no `onRequestClose` — the Android back button is inert inside them
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `app/more/settings.tsx:389,425,453,481,534`; `app/(tabs)/insights.tsx:470`; `src/components/BudgetEditorModal.tsx:77`; `src/components/CategoryPicker.tsx:82`.
- **What the user sees:** On Android, pressing the hardware/gesture Back button inside the export picker, currency picker, language picker, API-URL editor, display-name editor, Insights month picker, budget editor or category picker does nothing. The user must find the on-screen Cancel/Done.
- **Root cause:** RN's `Modal` only routes the Android back button through the `onRequestClose` prop; without it the event is swallowed. Three modals do it right (`record.tsx:577`, `VoiceConfirmModal.tsx:138`, `IncomeEditorModal.tsx:68`), eight don't.
- **Blast radius:** Android-only, but it is the platform's single most-used navigation gesture. It also means an Android user who opens the Insights month picker (`insights.tsx:470`, whose only other dismissal is a backdrop tap that is easy to miss because the sheet's own padding also dismisses it — see F18) has no keyboard-independent escape.
- **Same defect elsewhere:** Exhaustive — grepped `<Modal` (11 hits) against `onRequestClose` (3 hits). The 8 above are the complete list. Additionally, all 7 `presentationStyle="pageSheet"` modals (`settings.tsx` ×5, `BudgetEditorModal.tsx:77`, `CategoryPicker.tsx:82`) fall back to full-screen on Android, where `pageSheet` is unsupported — so those bodies also render under the status bar (already noted in F3).
- **Fix:** Add `onRequestClose` to all eight. Better: the shared `<BottomSheet>` / `<ModalScreen>` primitive proposed in F1 should take a single `onClose` and wire it to `onRequestClose`, the backdrop press, and the header Cancel, so the three can never diverge.
- **Regression test to add:** Fire `BackHandler` while each modal is open and assert its `visible` prop flips to false.

---

### F15. `CategoryPicker` modal: the create-category input is covered by the keyboard and there is no bottom safe area
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/components/CategoryPicker.tsx:82-138`, specifically `:100-136` (the `FlatList` with the create form as `ListFooterComponent`) and `:197-200` (`modal: { flex: 1 }`).
- **What the user sees:** Opening the category picker and scrolling to the bottom to add a new category, the "New category" input sits at the very bottom of the list. Tapping it opens the keyboard directly over the input and its Add button. There is no `KeyboardAvoidingView` and the `FlatList` has no `automaticallyAdjustKeyboardInsets`.
- **Root cause:**

```tsx
// CategoryPicker.tsx:82-83, 100-136
<Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
  <View style={styles.modal}>          // { flex: 1 } — no SafeAreaView, no KAV
    …
    <FlatList
      data={categories}
      …
      ListFooterComponent={ /* create-category form */ }
    />
```

  Additionally there is no bottom inset, so the last category row and the create form run into the home indicator, and there is no `onRequestClose` (F14).
- **Blast radius:** Category creation is reachable from the Manual tab (`record.tsx:503-509`) and the edit screen (`edit.tsx:265-271`). It is the only way to add a category on mobile.
- **Same defect elsewhere:** Same shape in `app/more/settings.tsx:481-531` (API-URL modal, `nameInput` at `:499-513`) and `:534-558` (display-name modal, `autoFocus` at `:552`) — both plain `<View style={styles.modal}>` with no SafeAreaView and no KAV; both survive only because Save sits in the header above the keyboard. `BudgetEditorModal.tsx:78-121` — same, saved by its header Save.
- **Fix:** Add `automaticallyAdjustKeyboardInsets` to the `FlatList` (RN supports it on iOS and it is the right tool for a list whose footer holds an input), wrap the modal body in `<SafeAreaView style={{flex:1}} edges={['top','bottom']}>`, add `keyboardShouldPersistTaps="handled"` so tapping Add while the keyboard is up registers on the first tap, and add `onRequestClose`. Route it through the shared modal primitive from F1 so all six modal bodies get identical treatment.
- **Regression test to add:** Open the picker, focus the new-category input with a 300pt keyboard, assert the Add button is visible.

---

### F16. Settings currency/locale pickers are un-scrollable fixed lists
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/more/settings.tsx:425-450` (currency, 10 rows), `:453-478` (locale, 4 rows), `:46` (`CURRENCIES`), `:40-45` (`LOCALES`), `:749-756` (`localeRow`).
- **What the user sees:** Today, the currency list just fits. At 150% Dynamic Type, or when an eleventh currency is added, the last rows fall off the bottom with no way to scroll to them.
- **Root cause:** The rows are `.map()`ed directly into a `<View style={styles.modal}>` with no `ScrollView`:

```tsx
// settings.tsx:425-434
<Modal visible={currencyModal} animationType="slide" presentationStyle="pageSheet">
  <View style={styles.modal}>              // flex: 1, no scroll
    <View style={styles.modalHeader}> … </View>
    {CURRENCIES.map((c, i) => ( … ))}      // 10 rows × ~46pt = 460pt + 60pt header
```

  On a 667pt device inside a pageSheet the available height is ~627pt, so 520pt fits — with 107pt of headroom that one added currency or one accessibility text step consumes.
- **Blast radius:** A user on XAF/NGN/GHS (the last three entries) is exactly the user most likely to lose access to their own currency when the list grows.
- **Same defect elsewhere:** Grepped for `.map(` rendering list rows outside a scroll container: `settings.tsx:434` (currency), `:462` (locale), `:398` (export formats, 3 rows — safe), `src/components/BudgetEditorModal.tsx:111` (3 periods, inside a ScrollView — safe), `app/(tabs)/more.tsx:97-130` (inside a ScrollView — safe), `app/more/privacy.tsx` (inside a ScrollView — safe). The two settings pickers are the only unbounded ones.
- **Fix:** Wrap both bodies in a `ScrollView` with `contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}`. Same shared modal primitive from F1.
- **Regression test to add:** Render the currency modal at 375×568 and assert the last currency row is reachable by scrolling.

---

### F17. More-options sheet has no `KeyboardAvoidingView`; the Note keyboard covers the entire sheet, including the field being typed into
- **Severity:** High — *upgraded from Medium during verification: the sheet is content-sized, not 70% tall, so the keyboard does not merely cover the content below the Note field — it covers the Note field itself.*
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/(tabs)/record.tsx:573-638` (the modal), `:600-606` (the Note input), `:611-626` (payment chips), `:628-634` (`RecurringToggle`), `:972-979` (`moreOptionsSheet`, `maxHeight: '70%'`, `paddingBottom: 32`).
- **What the user sees:** Open "More options", tap Note, and the keyboard slides up over the whole sheet. The user types blind — they cannot see the Note field, the Payment method chips, the Recurring toggle or the Done button. `decimal-pad` isn't involved here so the return key exists, but there is no visible way back to the sheet's contents.
- **Root cause:** `maxHeight: '70%'` is a *cap*, not a height. The sheet's intrinsic content is far smaller than the cap, so the sheet is content-sized and hugs the bottom edge:

  `paddingTop 8` + header (`paddingVertical 12` ×2 + 16pt title ≈ 44) + `moreOptionsContent` (`padding 16` ×2 + Note field ≈64 + gap 16 + Payment field ≈54 + gap 16 + `RecurringToggle` ≈57 = 239) + `paddingBottom 32` ≈ **323pt**, well under the 590pt cap on an iPhone 14. Bottom-anchored, that sheet spans screen y 521…844. An iOS text keyboard's top edge lands at ≈508. **The whole sheet is behind the keyboard**, Note field included. There is no `KeyboardAvoidingView`, no `keyboardDismissMode`, and the `paddingBottom: 32` is a hard-coded stand-in for `insets.bottom`.
- **Blast radius:** Adding a note to a manually-entered transaction is unusable — which is one plausible contributor to `transactions.note` being NULL on all 18 production rows (the other, and larger, being that `ParsedExpense` has no `note` field at all). It also directly compounds F9: the recurring toggle the owner wants promoted lives in this sheet.
- **Same defect elsewhere:** See F11's exhaustive KAV inventory. The other sheets with an input and no KAV are `CategoryPicker.tsx` (F15) and the two `settings.tsx` text modals.
- **Fix:** A KAV added *inside* the sheet will not work — see F37; at that depth it computes its lift from a sheet-relative frame. The KAV has to wrap the modal's backdrop (which is at the screen origin), or the sheet has to be positioned from a `Keyboard` listener directly. Concretely: `<KeyboardAvoidingView style={{flex:1}} behavior="padding">` **around** `moreOptionsBackdrop`, `keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled"` on the `ScrollView`, and `paddingBottom: insets.bottom + 16` instead of the literal 32. This is the same requirement as F1's sheet, which is why both should be solved once in the shared `<BottomSheet>` primitive rather than patched twice. Once F9 lands, the Recurring block leaves this sheet entirely, which also mitigates it.
- **Regression test to add:** Open More options, focus Note with a 336pt keyboard, assert the Note `TextInput`'s `pageY + height <= screenHeight - keyboardHeight`.

---

### F18. Insights month sheet: no bottom inset, no `onRequestClose`, and tapping the sheet's own padding dismisses it
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/(tabs)/insights.tsx:470-498`, styles at `:758-786`.
- **What the user sees:** The month picker's last option sits under the home indicator; tapping anywhere in the sheet's 16pt padding (between rows, above the title) closes it without selecting; Android Back does nothing.
- **Root cause:**

```tsx
// insights.tsx:470-473
<Modal visible={monthPickerOpen} animationType="slide" transparent>       // no onRequestClose
  <Pressable style={styles.modalBackdrop} onPress={() => setMonthPickerOpen(false)}>
    <View style={styles.monthSheet}>                                     // plain View, NOT a Pressable
      <Text style={styles.monthSheetTitle}> … </Text>
```

  The sheet is a plain `View`, so touches that don't land on a `monthOption` bubble up to the backdrop `Pressable` and dismiss. Compare `VoiceConfirmModal.tsx:140` and `record.tsx:583`, which both correctly use `<Pressable onPress={(e) => e.stopPropagation()}>` for the sheet body. And `monthSheet` (`:763-770`) has `padding: 16` with no `insets.bottom`.
- **Blast radius:** Month selection drives every number on the Insights screen. A mis-tap silently reverts to the current month, which looks like the data changed.
- **Same defect elsewhere:** Grepped every `transparent` modal for the backdrop/sheet stop-propagation pattern: `VoiceConfirmModal.tsx:139-140` ✅, `record.tsx:579-583` ✅, `IncomeEditorModal.tsx:69-74` ✅, `insights.tsx:471-472` ❌. This is the only one.
- **Fix:** Change the `<View style={styles.monthSheet}>` to `<Pressable style={styles.monthSheet} onPress={(e) => e.stopPropagation()}>`, add `onRequestClose`, and set `paddingBottom: insets.bottom + 16`. Shared modal primitive (F1) closes all three at once.
- **Regression test to add:** Tap the sheet's title area and assert `monthPickerOpen` is still true.

---

### F19. `AmountAdjustChips` labels are hard-coded `−$1 / +$1 / +$5 / +$10`
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/components/AmountAdjustChips.tsx:31`. Rendered inside the amount card of `src/components/VoiceConfirmModal.tsx:199`.
- **What the user sees:** A EUR user correcting a parsed amount is offered "−$1 +$1 +$5 +$10" chips that adjust their euro amount.
- **Root cause:**

```tsx
// AmountAdjustChips.tsx:30-31
{deltas.map((d) => {
  const label = d < 0 ? `−$${Math.abs(d)}` : `+$${d}`
```

  The component takes no `currency`/`sign` prop at all, and `VoiceConfirmModal` has `parsedExpense.currency` in scope one line above (`:188` already calls `currencySymbolFor` for the adjacent symbol) but doesn't pass it.
- **Blast radius:** Sits directly beside a correctly-symbolled currency glyph in the same card, so the mismatch is visible within a single 100pt-tall component.
- **Same defect elsewhere:** See F6's exhaustive list of hard-coded `$`.
- **Fix:** Add a required `sign: string` prop to `AmountAdjustChips` and pass `currencySymbolFor(parsedExpense?.currency ?? 'USD')` from `VoiceConfirmModal.tsx:199`. The delta magnitudes should also scale with currency (a ±1 JPY chip is meaningless) — take `deltas` from a shared per-currency table in `@voice-expense/shared` rather than the `[-1, 1, 5, 10]` default.
- **Regression test to add:** Render with `sign="€"` and assert no chip label contains `$`.

---

### F20. `RecurringPatternBanner` renders raw ISO codes: "USD 42.00"
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/components/RecurringPatternBanner.tsx:115`, consumed at `:139-141`.
- **What the user sees:** The Today "New pattern detected" card reads "Xtream USD 42.00 monthly" instead of "Xtream $42.00 monthly".
- **Root cause:**

```tsx
// RecurringPatternBanner.tsx:115
const amountDisplay = `${candidate.currency_code} ${candidate.amount.toFixed(2)}`
```

  `formatCurrency` from `@voice-expense/shared` is used by 8 other files but not here.
- **Blast radius:** Only this banner, but it is a Plus-gated proactive surface — the one place the app is supposed to look smart.
- **Same defect elsewhere:** Grepped for `currency_code` interpolated directly into display strings: this is the only instance. `app/(onboarding)/income.tsx:149` and `src/components/IncomeEditorModal.tsx:105` print `· {currency}` as an explicit secondary label, which is intentional and correct.
- **Fix:** `const amountDisplay = formatCurrency(candidate.amount, candidate.currency_code, locale)` — the import already exists in sibling files.
- **Regression test to add:** Assert the banner title contains `$42.00` and not `USD 42.00`.

---

### F21. `Money` formats thousands with hard-coded `'en-US'`
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/components/Money.tsx:51`; also `app/(tabs)/index.tsx:327`.
- **What the user sees:** A French or Spanish user sees "1,250.00" where their locale expects "1 250,00" / "1.250,00".
- **Root cause:**

```tsx
// Money.tsx:50-51
const [intPart, decPart] = abs.toFixed(2).split('.')
const intFmt = parseInt(intPart, 10).toLocaleString('en-US')   // <-- locale ignored
```

  `Money` takes no `locale` prop. The decimal separator is likewise fixed to `.` by `:93` (`{`.${decPart}`}`).
- **Blast radius:** Every rendered amount in the app, in every non-English locale. The app ships four locales (`settings.tsx:40-45`) and `formatCurrency(amount, currency, locale)` in `@voice-expense/shared` already does this correctly — `Money` just doesn't use it.
- **Same defect elsewhere:** `app/(tabs)/index.tsx:327` — `formatBudgetShort` also calls `.toLocaleString('en-US')`. Grepped `toLocaleString('` across `apps/mobile`: those are the only two hard-coded locales; every other date/number call correctly passes the user's `locale`.
- **Fix:** Add a required `locale: Locale` prop to `Money` (or read it from a context) and use it for both the grouping and the decimal separator. Given F6 also wants a required `sign`, the cleanest change is one `Money` API rev: `<Money value locale currency … />`, deriving the symbol internally via `currencySymbolFor` — removing two whole classes of call-site omission at once.
- **Regression test to add:** Render `<Money value={1250} locale="fr" />` and assert the output contains a non-comma group separator.

---

### F22. Status-bar style is set once at the root and never varied per screen
- **Severity:** Low — *downgraded from Medium during verification. The original claim ("dark glyphs on the paywall's near-black canvas") is not what happens: `more/paywall` is registered with `presentation: 'modal'` (`_layout.tsx:210`), which react-native-screens maps to `UIModalPresentationPageSheet`, so the paywall card starts **below** the status bar and the glyphs sit over the dimmed presenting screen, not over `#0B0B0C`. The contrast is degraded, not eliminated.*
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/_layout.tsx:112` (`<StatusBar style="dark" backgroundColor="#FBFAF7" />`) vs `apps/mobile/app/more/paywall.tsx:163-166` (`root: { backgroundColor: '#0B0B0C' }`).
- **What the user sees:** Opening the paywall, the clock/battery/signal glyphs stay dark while the screen behind them is dimmed for the sheet presentation, so they read as muddy and low-contrast. Nothing is invisible.
- **Root cause:** The status-bar style is declared exactly once, at the root, and never varied. `app.config.js:9` sets `userInterfaceStyle: 'light'`, so the system will not adapt it either. Note also that the paywall's `<SafeAreaView edges={['top', …]}>` (`:49`) is a no-op inside a page-sheet presentation, where the top inset is 0 — so the "close" row's own 8pt `paddingTop` is all the clearance it gets.
- **Blast radius:** Cosmetic, confined to the paywall today. Worth recording because the app has no per-screen status-bar convention at all, so the next full-screen dark surface will hit the real version of this.
- **Same defect elsewhere:** Grepped `StatusBar` — exactly one usage, at `_layout.tsx:112`. Grepped for dark screen backgrounds: `paywall.tsx:165` (`#0B0B0C`) is the only full-screen dark canvas; `insights.tsx:705-710` (`forecastCard`, `Colors.ink`) and the `index.tsx`/`record.tsx` dark CTAs are components, not full screens.
- **Fix:** Adopt a per-screen rule: any screen that sets a dark canvas declares its own `<StatusBar style="light" />`. **Caveat the fix must respect:** for a `presentation: 'modal'` (page-sheet) screen, iOS takes the status-bar style from the *presenting* view controller, so an inner `<StatusBar>` may not take effect — if the paywall is meant to own the status bar it must be registered as `fullScreenModal` instead. Verify on device before declaring this fixed.
- **Regression test to add:** Snapshot assertion that any screen whose root `backgroundColor` is darker than 50% luminance renders its own `StatusBar`.

---

### F23. Edit-transaction: `autoFocus` opens the keyboard on mount over a Save button that is the last child of a long ScrollView
- **Severity:** Low — *downgraded from Medium during verification. The finding's load-bearing claim — a double-counted bottom inset producing an extra ~34pt gap — is **refuted** (see below), and the flow is recoverable: `keyboardShouldPersistTaps="handled"` (`:215`) means a tap on any non-touchable area dismisses the keyboard, and the ScrollView reaches Save. What remains is an avoidable first-impression annoyance.*
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/transaction/edit.tsx:240-248` (`autoFocus` at `:247`), `:316-326` (Save at the bottom of the scroll), `:207-211` (`SafeAreaView edges={['bottom']}` wrapping a `KeyboardAvoidingView`).
- **What the user sees:** Tapping Edit on a transaction opens the sheet with the numeric keyboard already up and the screen scrolled to the top. Save sits below the direction toggle, amount, merchant, category, note, payment chips and the recurring card — around 640pt down, i.e. below the fold on every iPhone once the keyboard is up. The user must dismiss the keyboard (there is no Done key on `decimal-pad`; a tap on blank space works, a drag does not, since `keyboardDismissMode` is unset) and then scroll to save.
- **Root cause:**

```tsx
// edit.tsx:240-248
<TextInput … keyboardType="decimal-pad" autoFocus />       // keyboard up on mount
```

  The amount is already pre-filled from the stored transaction, so `autoFocus` buys nothing and costs the user a keyboard they have to get rid of.

  **Refuted sub-claim (kept here so it isn't re-reported):** the original finding asserted that `<SafeAreaView edges={['bottom']}>` at `:207` and the KAV at `:208` double-count the 34pt bottom inset. They do not. RN's `KeyboardAvoidingView` computes `frame.y + frame.height - keyboardY` from its **own** layout box (`node_modules/react-native/.../KeyboardAvoidingView.js:110`), and that box already ends 34pt above the screen edge because the SafeAreaView's padding shrank it. If anything the error runs the *other* way: this KAV sits below a native header inside a `presentation: 'modal'` card, so `frame.y` is 0 while its true screen origin is ~66pt down, and it therefore **under**-lifts by that amount (F37).
- **Blast radius:** Edit is the only place a user can correct a wrong amount or a wrong debit/credit direction after saving, so it is a path users reach precisely when something is already wrong.
- **Same defect elsewhere:** `autoFocus` on a pre-filled numeric field — `edit.tsx:247` only (`BudgetEditorModal.tsx:103` and `IncomeEditorModal.tsx:101` also `autoFocus`, but both have a header Save above the keyboard, so they are acceptable; `settings.tsx:552` autofocuses a text field with the same header-Save escape). Primary-action-below-the-fold — `edit.tsx:316` (Save), `app/more/privacy.tsx:275-286` (Export/Delete rights rows are the last thing on a long scroll), `app/(auth)/sign-in.tsx:234-250` (email submit, but it's a disclosure so acceptable).
- **Fix:** Pin the Save button as a fixed footer outside the `ScrollView` (the pattern `VoiceConfirmModal` intends), and drop `autoFocus`. Leave the `SafeAreaView edges={['bottom']}` alone — it is correct. If the keyboard behaviour is touched, fix it via F37, not by adding another inset.
- **Regression test to add:** Open the edit screen and assert no `TextInput` is focused on mount.

---

### F24. Nothing in the app handles Dynamic Type; the fixed-height layouts break at accessibility text sizes
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** App-wide. `grep -rn "allowFontScaling" apps/mobile` → **zero results**, so every `<Text>` scales with the system font-scale (RN default). Meanwhile 40+ containers have fixed heights.
- **What the user sees:** At the iOS "Larger Text" settings above ~130%, the Manual keypad, the onboarding CTAs, the tab bar labels and the transaction rows either clip or push their neighbours off-screen. At 200% (an accessibility setting Apple expects apps to survive) several primary actions are unreachable.
- **Root cause:** Text scales; the boxes around it don't. Representative fixed heights that will be outgrown by their own text:
  - `app/(tabs)/record.tsx:918-922` `keypadKey: { height: 44 }` with a 22pt glyph — clips at ~150%.
  - `app/(tabs)/record.tsx:1007-1014` `addButton: { height: 44 }`, `:943-953` `moreOptionsButton: { height: 44 }`.
  - `app/(onboarding)/income.tsx:389-395` and `permissions.tsx:200-206` `cta: { height: 56 }` with 17pt text.
  - `app/more/paywall.tsx:269-275` `upgradeBtn: { height: 56 }`.
  - `app/(tabs)/_layout.tsx:145` `tabBar: { height: 68 }` with a 10pt label (`:175-179`) — the label wraps and clips.
  - `src/components/SettingsList.tsx:172-178` `toggle: { width: 42, height: 26 }`.
  - Every `numberOfLines` cap that will truncate: `TransactionRow.tsx:71,94` (merchant + category chip, `maxWidth: 140` at `:162`), `[id].tsx:342` (transcript, 4 lines), `DayOneFirstLog.tsx:69` (2 lines), `ask.tsx:132` (2 lines), `budgets.tsx:140` (pace pill, 1 line), `settings.tsx:208,209` (name + plan), `more/transactions.tsx:158` (page title).
- **Blast radius:** Every screen. It also interacts with F2 and F8: those layouts already overflow at default type size, so they fail immediately at any accessibility setting.
- **Same defect elsewhere:** This is the systemic version of F2/F8. Exhaustive grep: `allowFontScaling` — 0 hits; `maxFontSizeMultiplier` — 0 hits.
- **Fix:** Two-part. (1) Set a global cap — RN's `Text.defaultProps.maxFontSizeMultiplier = 1.4` (or a `<Text>`/`<TextInput>` wrapper in `src/components/`) so type can grow but bounded, which is what the fixed-height design language actually assumes. (2) Replace `height:` with `minHeight:` on the eight button/row styles listed above so they grow rather than clip. Neither alone is sufficient.
- **Regression test to add:** Render the Manual tab and the onboarding income screen with `fontScale: 1.4` and assert both primary CTAs are fully visible.

---

### F25. Scan buttons show no disabled affordance, and the loading one hides its label instead of graying out
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/(tabs)/record.tsx:430-451`, `:785-798` (`scanButton` style).
- **What the user sees:** While a scan is uploading, both buttons are `disabled` but look completely normal — no opacity change, no color change. And the busy one has swapped its icon+label for a bare spinner, so the user loses the label telling them what is in flight.
- **Root cause:** `styles.scanButton` has no pressed or disabled variant, and the loading branch replaces the content rather than overlaying it:

```tsx
// record.tsx:430-443
<Pressable style={styles.scanButton} onPress={() => handleScan('receipt')} disabled={scanLoading}>
  {scanLoading ? (
    <ActivityIndicator … />        // label disappears
  ) : ( … )}
```
- **Blast radius:** Both scan entry points. Compounds F4 — the user has neither a correct spinner location nor a disabled cue.
- **Same defect elsewhere:** Grepped `disabled={` (23 hits) against the presence of a matching disabled style:
  - **Missing disabled style:** `record.tsx:433` and `:447` (both scan buttons), `app/more/privacy.tsx:277,281` (Export/Delete rows change label only, and carry no `disabled` prop at all), `settings.tsx:406` (export rows — `disabled={exporting !== null}` with no disabled style, though the *running* row does get a spinner at `:416`).
  - **Correct:** `record.tsx:413,416` (mic — `micButtonDisabled` opacity 0.5), `record.tsx:552-556` (`addButtonDisabled` opacity 0.4), `VoiceConfirmModal.tsx:287-289` (`saveButtonDisabled` 0.5), `edit.tsx:317` + `:383` (0.6), `CategoryPicker.tsx:127-129` (0.5), `income.tsx:210` (`ctaDisabled` 0.5), `BudgetEditorModal.tsx:85` (`modalDoneDisabled` 0.5), `IncomeEditorModal.tsx:81` (opacity 0.4), `sign-in.tsx:237` (`btnDisabled`), `RecurringPatternBanner.tsx:156` (`btnDisabled`). (`app/recurring.tsx` uses Alert-based action sheets — N/A.)
  So 5 of 15 disabled/busy controls give no visual feedback.
- **Fix:** Add `scanButtonDisabled: { opacity: 0.45 }` and apply it via the style callback; render the spinner *alongside* the label (`<ActivityIndicator/><Text>Scan receipt</Text>`) rather than instead of it, so the row's width doesn't jump and the user keeps the context. Apply the same to `privacy.tsx`'s two rights rows and the settings export rows.
- **Regression test to add:** With `scanning='receipt'`, assert both buttons render at reduced opacity and the Receipt label text is still present.

---

### F26. Touch targets under 44pt
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** Every sub-44pt interactive element in the app was audited (grep for `width:`/`height:`/`paddingVertical:` on a `Pressable`, cross-checked against `hitSlop`). **Three** end up below Apple's 44×44pt minimum. The rest are already rescued by `hitSlop` and are listed below so they aren't re-flagged.
- **What the user sees:** Fiddly taps, especially the settings toggles and the heatmap month arrows.
- **Root cause / exhaustive list** (grepped every `width:`/`height:` on a `Pressable` and cross-checked for `hitSlop`):
  - `src/components/SettingsList.tsx:172-178` — `toggle: { width: 42, height: 26 }`, no `hitSlop`. This is the switch for "Payment notifications" and "Reminders" — two settings the user is meant to toggle.
  - `src/components/HistoryHeatmap.tsx:279-285` — `navBtn: { width: 28, height: 28 }` with `hitSlop={8}` → effective 44. **Acceptable.**
  - `app/(tabs)/insights.tsx:521-526` — `monthChev: { width: 24, height: 24 }` with `hitSlop={10}` → 44. **Acceptable.**
  - `app/(tabs)/insights.tsx:573-579` — `welcomeClose: { width: 24, height: 24 }` with `hitSlop={12}` → 48. **Acceptable.**
  - `src/components/RecurringPatternBanner.tsx:219-225` — `dismiss: { width: 24, height: 24 }` with `hitSlop={12}` → 48 ✅; but `acceptBtn`/`notNowBtn` (`:247-273`) are `minHeight: 36` with **no** `hitSlop`. The "Set up" button that creates a recurring rule is 36pt tall.
  - `src/components/VoiceConfirmModal.tsx:344-351` — `closeBtn: { width: 28, height: 28 }` with `hitSlop={8}` → 44 ✅.
  - `app/more/paywall.tsx:185-192` — `closeBtn: { width: 36, height: 36 }` with `hitSlop={8}` → 52 ✅.
  - `src/components/AmountAdjustChips.tsx:55-64` — `paddingVertical: 8` around 13pt text ≈ 33pt tall, `hitSlop={6}` → ~45. Borderline ✅.
  - `app/(tabs)/record.tsx:702` — `tab: { paddingVertical: 8 }` around 14pt text ≈ 34pt, no `hitSlop`. The Voice/Manual segmented control.
  - `app/(auth)/sign-in.tsx` / `income.tsx:110-117` — the "Skip" text button has `hitSlop={10}` on a ~20pt text node → ~40pt. Marginal.
  So the genuine misses are: `SettingsList` toggle (42×26), `RecurringPatternBanner` action buttons (36), `record.tsx` Voice/Manual tabs (~34).
- **Blast radius:** Accessibility conformance, and three of the misses are on primary settings/actions.
- **Fix:** Add `hitSlop={{ top: 9, bottom: 9, left: 2, right: 2 }}` to the `SettingsList` toggle, raise `RecurringPatternBanner`'s buttons to `minHeight: 44`, and raise `record.tsx`'s tab `paddingVertical` to 12. Better: add a `<Tappable>` wrapper in `src/components/` that asserts a 44pt minimum in dev, so new controls can't regress.
- **Regression test to add:** A test that walks rendered `Pressable`s and asserts `height + hitSlop.top + hitSlop.bottom >= 44`.

---

### F27. Paywall prices contradict the documented pricing and are USD-only strings
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/more/paywall.tsx:93,100` vs `docs/PLAN.md:30`.
- **What the user sees:** The paywall advertises **$4.99/mo** and **$39/yr**. `docs/PLAN.md:30` states "Murmur Plus $3.99/mo or $29.99/yr". Two sources of truth disagree by 25% and 30%.
- **Root cause:**

```tsx
// paywall.tsx:91-105
<PlanCard period={t('paywall.plan_monthly', locale)} price="$4.99" … />
<PlanCard period={t('paywall.plan_yearly',  locale)} price="$39"   … />
```

  Hard-coded literal strings, not localized, not derived from any product config, and not read from StoreKit (which is the only correct source once IAP exists — App Store prices are per-storefront and the app must display the storefront price, never a baked-in string).
- **Blast radius:** Displaying a price that doesn't match the actual App Store product is an App Store review rejection and a consumer-protection problem in the US. Every non-US storefront would see a wrong currency and a wrong number.
- **Same defect elsewhere:** Grepped for hard-coded prices: `paywall.tsx:93,100` only. Related: `app/(onboarding)/income.tsx:16-21` (`PRESETS` labelled in dollars), covered in F6.
- **Fix:** Do not fix the literals — remove them. Render prices from `StoreKit`'s `Product.displayPrice` once IAP lands; until then, render the plan cards without a price (or hide the card row entirely, consistent with F10's "nothing renders that doesn't work"). Reconcile the intended price with `docs/PLAN.md` before it goes into a product config.
- **Regression test to add:** Assert no currency literal appears in any component under `app/more/`.

---

### F28. `MerchantAvatar` ships every merchant name to `t0.gstatic.com`, and the Privacy Center never discloses it
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/components/MerchantAvatar.tsx:95-98` (`guessDomain`), `:136-141` (the URL), `:156-161` (the `<Image>`) vs `apps/mobile/app/more/privacy.tsx:235-240` (`privacy.servers_label` / `privacy.servers_detail`) and `:251-268` ("Guarantees").
- **What the user sees:** Every transaction row on Today, every recurring rule and the transaction detail screen fire a request to Google's favicon service with the merchant name embedded in the URL. The Privacy Center — a whole screen dedicated to what leaves the device — never mentions it. **Correction to the original wording:** the screen does *not* say "no servers". `en.json:316-317` renders the row as **"Our servers · Nothing identifying"**, and the three read-only guarantees at `:320-322` are "Always" (on-device voice), "Never" (analytics) and "Not stored" (audio). So the defect is a disclosure gap plus a strained reading of "nothing identifying", not a directly self-contradicting sentence.
- **Root cause:**

```tsx
// MerchantAvatar.tsx:136-141
const domain = hasMerchant
  ? (merchantDomain ?? guessDomain(merchant!))
  : null
const logoUrl = domain && !logoFailed
  ? `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${domain}&size=128`
  : null
```

  `guessDomain` (`:95-98`) falls back to `normalized + '.com'`, so a manually-typed merchant like "Dr Chen Therapy" becomes a request for `drchentherapy.com`'s favicon — sending a health-adjacent string to a third party along with the device IP and a timestamp.
- **Blast radius:** The network behaviour itself is the data/security stream's call (see the sync-and-security audit); what belongs to this audit is that the app's own privacy surface gives the user no way to learn about it. There is also no placeholder while the remote image loads, so avatars pop in after the row paints.
- **Same defect elsewhere:** Grepped for remote `<Image source={{ uri }}>` — `MerchantAvatar.tsx:157` is the only one in the app.
- **Fix:** Either (a) proxy favicon lookups through the app's own API so no third party sees merchant strings, and cache results locally; or (b) drop remote logos and use the existing deterministic letter tile (`:164-174`), which already works and already carries the brand palette. Under either option the Privacy Center needs a row that names the behaviour — `privacy.servers_detail` ("Nothing identifying") is not an accurate summary of a request whose query string is the merchant name.
- **Regression test to add:** Assert that rendering a `TransactionRow` issues no network request to a host outside the app's API base URL.

---

### F29. Hard-coded English strings in shipped UI
- **Severity:** Low
- **Status:** Newly discovered
- **Where / exhaustive list** (grepped for string literals inside `<Text>` and for `text:` in `Alert` buttons):
  - `apps/mobile/app/more/transactions.tsx:209` — the "All" category filter pill.
  - `apps/mobile/src/components/BudgetRing.tsx:66` — `<Text style={styles.caption}>used</Text>` in the budget ring center.
  - `apps/mobile/app/recurring.tsx:48-55` — `FREQ_SHORT` (`'/day'`, `'/wk'`, `'/2wk'`, `'/mo'`, `'/qtr'`, `'/yr'`) rendered at `:234`.
  - `apps/mobile/app/more/settings.tsx:183` — `[{ text: 'OK' }]` in the disable-notifications alert.
  - `apps/mobile/app/(tabs)/more.tsx:117` — `<Text style={styles.plusPillText}>Plus</Text>` (arguably a brand term; `settings.tsx:217` uses `t('settings.upgrade')` for the adjacent pill, so the two disagree).
  - `apps/mobile/src/components/UndoSnackbar.tsx:26` — `undoLabel = 'Undo'` default; both call sites pass a localized value, so this is latent only.
- **What the user sees:** A French user sees "All", "used", "/mo" and "OK" in an otherwise French UI.
- **Root cause:** The i18n dictionary at `packages/shared/src/i18n/locales/*.json` is comprehensive (280+ keys × 4 locales) — these six were simply never routed through `t()`.
- **Blast radius:** Cosmetic, but the app ships four locales and one of them (fr) is fully translated.
- **Same defect elsewhere:** The list above is exhaustive for `apps/mobile`.
- **Fix:** Add `transactions.filter_all`, `budgets.ring_used`, `recurring.short_{daily,weekly,…}` and `common.ok` to all four locale files and route the six call sites through `t()`.
- **Regression test to add:** A lint rule flagging string literals passed as `<Text>` children in `apps/mobile/app` and `apps/mobile/src/components`.

---

### F30. `SafeToSpend.tsx` is dead code
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/components/SafeToSpend.tsx` (148 lines, 6 `Typography.fontFamily` references).
- **What the user sees:** Nothing — which is the point. It ships in the bundle and never renders.
- **Root cause:** `grep -rn "SafeToSpend" apps/mobile/app apps/mobile/src` returns only the file's own `export function` line plus a stale mention in a comment at `src/hooks/useBudget.ts:66`. No import anywhere.
- **Blast radius:** Bundle size and, more importantly, maintenance signal — a future contributor will "fix" a component nobody sees.
- **Same defect elsewhere:** `src/components/` holds 20 files; the other 19 are all imported somewhere. Orphaned *style rules*, verified with `grep -c "styles.<name>"` (each returns 0): `record.tsx:776` `micIcon`, `:799-801` `scanLabelWrap`, `:802` `scanIcon`, `:960-963` `moreOptionsPanel`, `:1024` `fields`; `more/transactions.tsx:320-324` `title`; `more/help.tsx:44` `title`; `ask.tsx:342-347` `inputPlaceholder`. (`record.tsx:687-689` `transcriptPlaceholder` *is* used, at `:383` — not an orphan.) Eight orphaned style rules.
- **Fix:** Delete `SafeToSpend.tsx` and the six orphaned style keys, or wire `SafeToSpend` into Today if it was meant to ship (it duplicates the budget one-liner at `index.tsx:244-256`, so deletion is the likely right call — confirm with the design doc first).
- **Regression test to add:** A `knip`/`ts-prune` step in CI failing on unreferenced exports under `apps/mobile/src`.

---

### F31. `SafeAreaView` `edges` are inconsistent across 20 screens with no rule behind the variation
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** Five distinct `edges` configurations across 20 screens:
  - `['top']` — `app/(tabs)/index.tsx:189,208`, `app/(tabs)/insights.tsx:302`, `app/(tabs)/more.tsx:90`, `app/(tabs)/record.tsx:344`
  - `['top','left','right']` — `app/(tabs)/budgets.tsx:87` (the only tab screen that differs)
  - `['top','bottom','left','right']` — `app/(auth)/sign-in.tsx:115`, `app/(onboarding)/income.tsx:100`, `app/(onboarding)/permissions.tsx:54`, `app/more/ask.tsx:88`, `app/more/ask-result.tsx:151`, `app/more/paywall.tsx:49`, `app/more/privacy.tsx:200`, `app/more/transactions.tsx:145`, `app/recurring.tsx:145`, `app/transaction/[id].tsx:243`, `app/more/settings.tsx:390`
  - `['bottom','left','right']` — `app/more/help.tsx:18`, `app/more/settings.tsx:199`
  - `['bottom']` — `app/transaction/edit.tsx:207`, `src/components/VoiceConfirmModal.tsx:142`
  - **no `edges` prop at all** (defaults to all four) — `app/(auth)/sign-up.tsx:54,72`
- **What the user sees:** Small inconsistent gaps between tab screens; Budgets in particular has landscape-safe side insets that the four other tabs lack.
- **Root cause:** No convention. The correct value is determined by whether the native Stack header is shown (`_layout.tsx:113-212` shows it for `more/settings`, `more/help`, `more/privacy`, `transaction/*`, `recurring` — but `recurring.tsx:144`, `transactions.tsx:144`, `[id].tsx:242`, `privacy.tsx:199`, `ask.tsx:87` and `ask-result.tsx:150` all override with `headerShown: false` and draw their own, so the root layout's options are half-dead). That coupling is invisible at each call site.
- **Blast radius:** Cosmetic, but it is why nobody can tell at a glance whether a given screen handles its own top inset — which is what let F3 through.
- **Same defect elsewhere:** The list above is exhaustive.
- **Fix:** Pick one rule and encode it: tab screens use `edges={['top','left','right']}` (the tab bar owns the bottom); Stack screens that hide the native header use `['top','bottom','left','right']`; Stack screens that keep the header use `['bottom','left','right']`. Then delete the now-dead `headerTitle`/`headerBackTitle` options in `_layout.tsx` for the six screens that override `headerShown: false`, so the root layout stops describing chrome that never renders.
- **Regression test to add:** N/A — enforce with a lint rule requiring an explicit `edges` prop on every `SafeAreaView`.

---

### F32. Back pills live inside the ScrollView and scroll off screen
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `app/transaction/[id].tsx:244-252`, `app/recurring.tsx:146-157`, `app/more/privacy.tsx:201-212`, `app/more/ask.tsx:89-107`. All four hide the native header (`Stack.Screen options={{ headerShown: false }}`) and render a custom back pill as the **first child of the ScrollView**.
- **What the user sees:** Scroll down a transaction detail, a recurring list or the Privacy Center and the back button disappears. On a long Privacy page the user has to scroll back to the top to leave (the iOS edge-swipe still works, but it is not discoverable and is disabled for `presentation: 'modal'` on some screens).
- **Root cause:** The mockups drew a static top row; the implementation put it inside the scroll content rather than as a sibling above it.
- **Blast radius:** Four screens. `app/more/transactions.tsx:146-162` gets this **right** — its `topRow` is a sibling of the `SectionList`, not a child. That is the reference.
- **Same defect elsewhere:** The four above are exhaustive (grepped `topRow` / `backPill` / `closePill` against `ScrollView` nesting).
- **Fix:** Move the `topRow` `<View>` out of the `ScrollView` in all four, matching `more/transactions.tsx:146-162`.
- **Regression test to add:** Scroll each screen 400pt and assert the back pill is still within the viewport.

---

### F33. `UndoSnackbar` is positioned for the tab bar but renders on tab-less Stack screens too
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/components/UndoSnackbar.tsx:76-89`, mounted by `src/hooks/useUndo.tsx:44-64` which wraps the entire root `Stack` in `app/_layout.tsx:111-214`.
- **What the user sees:** Deleting a transaction from the detail screen (`app/transaction/[id].tsx:166-182`) calls `router.back()` and then `showUndo`, so the snackbar usually lands on a tab screen — correct. But if it is shown while a Stack screen is still on top (a race, or any future call site), it floats 90pt above the bottom edge with nothing under it.
- **Root cause:**

```tsx
// UndoSnackbar.tsx:76-81
// Floats above the tab bar (tab bar bottom = 14, height = 68 → clear above).
container: {
  position: 'absolute',
  left: Spacing.base, right: Spacing.base,
  bottom: 14 + 68 + Spacing.sm,      // third copy of the tab-bar constants
```
- **Blast radius:** Minor visual. Its real cost is that it is the third independent copy of the tab-bar geometry (see F12, F13).
- **Same defect elsewhere:** Only absolutely-positioned floating chrome in the app besides the tab bar itself.
- **Fix:** Consume the `useTabBarClearance()` hook proposed in F13 and add `insets.bottom`; when no tab bar is present it should fall back to `insets.bottom + 16`.
- **Regression test to add:** Show the snackbar over a Stack screen with `insets.bottom = 34` and assert it clears the home indicator.

---

### F34. Record screen's close button pushes a new route instead of dismissing
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/(tabs)/record.tsx:347`, and the same pattern at `:227` (after a voice save), `:321` (after a manual save), `:336` (cancel from `ListeningView`).
- **What the user sees:** No visible bug today, but the back stack grows on every capture. Repeated capture → close → capture cycles push `/(tabs)` repeatedly.
- **Root cause:** `router.push('/(tabs)')` where `router.navigate` (which reuses an existing route) or `router.back()` is meant. Four call sites all use `push`.
- **Blast radius:** Latent. `expo-router` deduplicates identical pathname+params in many cases (the code at `record.tsx:79-83` explicitly relies on that dedup for the `_nonce` param), so it mostly self-corrects — which is why it hasn't surfaced.
- **Same defect elsewhere:** Grepped `router.push('/(tabs)')` — the four sites in `record.tsx` above. Every other navigation to a tab uses either `router.replace` (auth/onboarding, correct) or `router.push` to a genuinely new Stack route (correct).
- **Fix:** Use `router.navigate('/(tabs)')` for the close/cancel paths and `router.replace('/(tabs)')` after a successful save.
- **Regression test to add:** Capture → close → capture → close and assert the navigation state depth is unchanged.

---

### F35. Scan spinner is set after the camera round-trip, so the tap has no immediate feedback
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/(tabs)/record.tsx:231-248`.
- **What the user sees:** Tapping "Scan Receipt" does nothing visible for the ~300-800ms it takes to request camera permission and present the camera. On a cold permission prompt it is longer.
- **Root cause:** `setScanLoading(true)` is at `:248`, *after* `requestCameraPermissionsAsync` (`:232`) and `launchCameraAsync` (`:238-243`) have both resolved. Everything before that point is unguarded — including the double-tap window, since `disabled={scanLoading}` is still false.
- **Blast radius:** Two rapid taps launch the camera twice (the second `launchCameraAsync` will reject or stack a second presentation).
- **Same defect elsewhere:** Grepped async handlers for the position of their loading setter: `handleManualSave` (`record.tsx:274-282`) sets `setManualSaving(true)` before the await ✅; `handleConfirmVoice` (`:184-186`) ✅; `handleSave` in `edit.tsx:132` ✅ (though the scope-choice `Alert` at `:117-130` runs before it, same class, smaller window); `runExport` (`settings.tsx:108-110`) ✅. `handleScan` is the only one that sets it late.
- **Fix:** Move `setScanLoading(true)` (or `setScanning(type)` after F4) to the first line of `handleScan`, and clear it in the `finally` that already exists at `:269-271` plus on the `result.canceled` early return at `:245`.
- **Regression test to add:** Assert `scanning === 'receipt'` synchronously after the press, before the camera promise resolves.

---

### F36. Two stale brand comments still name the old logo mark
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/(auth)/sign-in.tsx:125` — `{/* Murmur — The Listening Drop, sage-tile variant per brand sheet §02. */}` — and `apps/mobile/app/(auth)/sign-in.tsx:282` — `// Brand mark + headline + lead. The Listening Drop is a self-contained …`.
- **What the user sees:** Nothing — they are comments. Recorded only because the audit brief asked whether the "Coin & Wave vs Murmur" naming discrepancy is real.
- **Root cause / resolution of the brief's question:** **The discrepancy is not real, and this is settled.** `docs/PLAN.md:800` records `App name — Murmur`; `docs/PLAN.md:3441` records "Coin & Wave" as the adopted **logo mark** (Aug 7, 2026), replacing the "The Listening Drop" mark; `packages/shared/src/brand.ts:11` exports `PRODUCT_NAME = 'Murmur'`; `apps/mobile/app.config.js:3` sets `name: 'Murmur'`. "The Listening Drop" and "Coin & Wave" are successive names for the *glyph*, never for the product. The only residue is these two stale comments.
- **Blast radius:** None functional.
- **Same defect elsewhere:** **Two grep claims in the original write-up were wrong and are corrected here.** `grep -rn "Listening Drop" apps packages supabase` returns 5 hits, not 1: `app/(auth)/sign-in.tsx:125` and `:282` are genuinely stale; `apps/web/src/components/MurmurMark.tsx:2`, `apps/mobile/src/components/MurmurMark.tsx:8` and `apps/mobile/assets/brand/murmur-mark-cream.svg:4` all say "…replacing The Listening Drop", which is correct history and should be left alone. `grep -rn "Coin & Wave" apps packages supabase` returns **7** hits, not zero — both `MurmurMark.tsx` files and four `assets/brand/*.svg` headers — so the current mark name *is* present in the codebase.
- **Fix:** Update the two `sign-in.tsx` comments to name the current mark. Optionally add a one-line note to `packages/shared/src/brand.ts` distinguishing `PRODUCT_NAME` (Murmur) from the mark name (Coin & Wave) so the next reader doesn't repeat this investigation.
- **Regression test to add:** N/A.

---

### F37. Every `KeyboardAvoidingView` not mounted at the screen origin under-lifts, because RN compares a parent-relative frame to a screen-space keyboard frame
- **Severity:** Medium
- **Status:** Newly discovered during verification
- **Where:** `node_modules/react-native/Libraries/Components/Keyboard/KeyboardAvoidingView.js:110,125-141` (RN 0.81.5) is the mechanism. Affected call sites: `apps/mobile/src/components/VoiceConfirmModal.tsx:141`, `apps/mobile/app/transaction/edit.tsx:208-211`, `apps/mobile/app/more/ask.tsx:151-154`.
- **What the user sees:** Screens that *look* like they handle the keyboard still hide the field or the button the user is aiming at. The confirm sheet's Save stays covered; Ask's input bar stays covered; the edit screen lifts, but not far enough.
- **Root cause:** RN stores the KAV's own frame from `onLayout`, which is **relative to its parent**, and then subtracts a **screen-space** keyboard coordinate from it:

```js
// KeyboardAvoidingView.js:125-129 — parent-relative frame
_onLayout = async (event: ViewLayoutEvent) => {
  event.persist();
  const oldFrame = this._frame;
  this._frame = event.nativeEvent.layout;

// KeyboardAvoidingView.js:98-110 — screen-space keyboard coordinate
const keyboardY = keyboardFrame.screenY - (this.props.keyboardVerticalOffset ?? 0);
…
return Math.max(frame.y + frame.height - keyboardY, 0);
```

  The subtraction is only meaningful when `frame.y` happens to equal the view's window-space Y — that is, when the KAV is mounted at the screen origin (or under a parent whose padding is its only offset). Concretely in this codebase:
  - `VoiceConfirmModal.tsx:141` — parent is `styles.sheet`, so `frame.y = 0` while the sheet's real top is `screenHeight − sheetHeight` (≈244pt on an iPhone 14). The KAV therefore lifts ≈92pt where ≈336pt is needed: **short by ~244pt.** This is why tapping the amount field in the confirm sheet buries Save even on devices where F1's collapsed sheet fits.
  - `edit.tsx:208-211` — parent `SafeAreaView` sits below a native header inside a `presentation: 'modal'` card, so the KAV is short by the header + card offset (~66pt).
  - `ask.tsx:151-154` — parent is a scroll content container, so `frame.y` is a scroll-content offset with no fixed relationship to the window at all (compounded by F11's separate "padding cannot move a child up" problem).
  - **Correct by construction:** `sign-in.tsx:116` and `sign-up.tsx:73` (enclosing `SafeAreaView` is at the screen origin, so `frame.y` is exactly the top inset) and `IncomeEditorModal.tsx:70-73` (its `backdrop` is `flex: 1` at the screen origin with `justifyContent: 'flex-end'`, so `frame.y + frame.height` lands exactly on the screen bottom).
- **Blast radius:** Three of the six KAVs in the app. It is the reason F1, F11 and F17 all resist the obvious "just add/keep a KAV" fix — and the reason a reviewer looking at `edit.tsx` would conclude the keyboard handling is already correct when it is not.
- **Same defect elsewhere:** Exhaustive — `grep -rn "KeyboardAvoidingView" apps/mobile/app apps/mobile/src` yields 6 rendered instances, enumerated above. No other component in the app reads keyboard metrics.
- **Fix:** Do not add `keyboardVerticalOffset` guesses per screen — that is exactly the patch-stacking the owner rejects, and the offset differs by device, header presence and presentation style. Two correct options: (a) mount the KAV at the screen root of each screen — for the modals that means wrapping the **backdrop**, not the sheet; or (b) stop using `KeyboardAvoidingView` for sheets entirely and drive sheet offset from `Keyboard.addListener('keyboardWillChangeFrame')` inside the shared `<BottomSheet>` primitive proposed in F1, which measures `endCoordinates.screenY` against the sheet's own `measureInWindow()` result. (b) is the option that survives the next RN upgrade.
- **Regression test to add:** For each screen with a KAV, show a 336pt keyboard and assert the deepest focusable `TextInput` and its primary action both satisfy `pageY + height <= screenHeight - 336`.

---

## Refuted during verification

No finding was refuted in full — every F-number above rests on a real defect that reproduces from source. The following **sub-claims** were refuted and have been corrected in place rather than deleted, so they are not re-reported later:

- **F3 — "the close pill is partially untappable because the system intercepts touches over the Dynamic Island."** False. `topRow` is `justifyContent: 'space-between'` with `paddingHorizontal: 20`, so the pill is right-aligned and the Island is horizontally centred; they do not overlap. The visual collision with the status bar is real; the tappability claim was not.
- **F4 — "a second tap on 'Delete all data' while the first is in flight re-enters `handleDeleteAll`."** False. `privacy.tsx:149` early-returns on `if (deleting || !user?.id)`, and `:131` does the same for export. The missing-affordance half of the claim stands.
- **F22 — "the clock, battery and signal icons turn invisible — dark glyphs on a near-black canvas."** False. `more/paywall` is registered `presentation: 'modal'`, which maps to a page-sheet on iOS, so the status bar sits over the dimmed presenting screen, not over `#0B0B0C`. Downgraded Medium → Low; the proposed fix was also corrected, because an inner `<StatusBar>` does not necessarily win inside a page sheet.
- **F23 — "an extra ~34pt gap above the keyboard because `SafeAreaView edges={['bottom']}` applies the bottom inset *and* the KAV then adds the full keyboard height on top of it."** False, and backwards. RN's KAV measures from its own already-inset layout box; the real error at that site is an **under**-lift (now F37). Downgraded Medium → Low.
- **F23 — "the user must dismiss the keyboard … so: swipe-drag."** False. `keyboardDismissMode` is unset, so dragging does nothing; `keyboardShouldPersistTaps="handled"` (`edit.tsx:215`) means a tap on blank space *is* the escape hatch.
- **F28 — "the Privacy Center presents a '🚫 no servers' guarantee row."** False. `en.json:316-317` renders "Our servers · Nothing identifying". The finding survives as an undisclosed third-party call, not as a self-contradicting guarantee.
- **F36 — "`sign-in.tsx:125` is the only remaining code reference to 'The Listening Drop'"** (there are two stale ones, at `:125` and `:282`) **and "`Coin & Wave` has zero references in `apps/`, `packages/` or `supabase/`"** (there are seven). Both grep claims corrected.
- **F11 — "7 `KeyboardAvoidingView` instances."** There are 6 rendered instances; the seventh hit was a comment at `record.tsx:456`.
- **F30 — "all 20 others are referenced."** `src/components/` contains 20 files total, so the correct count is 19 others.
- **Line-number drift corrected without changing any conclusion:** F1 `:140-142`→`:138-142`; F3 `:165-183`→`:166-183`; F4 table entry `:435-451`→`:429-452`; F5 `:21-32`→`:22-32` (and the quoted map was missing `serifBold`); F7 table entry `:304-311`→`:303-311`; F12 `:152-153`→`:153-154`; F13 `record.tsx:978`→`:977` and `_layout.tsx:143`→`:144`; F24 `_layout.tsx:143`→`:145`; F28 `:139-141`→`:136-141`.

---

## Unverified suspicions

1. **`fontFamily: 'New York'` may also silently fall back on iOS.** `src/theme/typography.ts:15-19` selects `'New York'` as the serif family on iOS. New York is a system-provided face exposed through `UIFontDescriptor`'s `.serif` design rather than through `UIFont.familyNames`, and RN's `RCTFont` resolves families via `[UIFont fontNamesForFamilyName:]`. If that returns empty for `"New York"`, every serif money amount in the app (the 92pt Listening hero, the 56pt detail hero, all `<Money serif>` renders) is actually San Francisco. I could not confirm this without running on a device. If it is true, it merges into F5 and means *zero* of the app's three type faces render as designed. **How to check:** log `Platform.OS === 'ios' && require('react-native').Text` metrics, or simply render `<Text style={{fontFamily:'New York'}}>` next to `<Text>` and compare on-device.

2. **`react-native-safe-area-context` insets inside an RN `Modal` on Android.** `VoiceConfirmModal.tsx:142` uses `<SafeAreaView edges={['bottom']}>` inside a `<Modal>`. The library's documented caveat is that a `Modal` creates a separate native window on Android, so insets from the root `SafeAreaProvider` can be stale there; the documented fix is a nested `SafeAreaProvider` inside the modal. On iOS this is fine. I could not confirm the Android behaviour on this library version (`~5.6.0`) without a device. If confirmed, the fix is one extra `<SafeAreaProvider>` inside each `<Modal transparent>`.

3. **The `blurRadius`/`BlurView` tab bar over a light background.** `app/(tabs)/_layout.tsx:70-76` sets `intensity={80} tint="light"` with a `rgba(255,255,255,0.55)` overlay (`:171`). Against the app's `#FBFAF7` canvas the blur may be visually indistinguishable from a plain translucent fill, in which case it costs a real-time GPU pass for no perceived benefit. Needs an on-device A/B look, not a code read.

4. **Whether `expo-router`'s deduplication actually masks F34.** The comment at `record.tsx:79-83` asserts that repeat `push` with identical pathname+params is deduped. I read that as true for the `_nonce` workaround to make sense, but I did not verify it in `expo-router@6`'s router store. If it is not deduped, F34's severity rises from Low to Medium.

5. **`edges={['top']}` inside a `presentationStyle="pageSheet"` modal.** `app/more/settings.tsx:390` wraps the export sheet in `<SafeAreaView edges={['top','bottom','left','right']}>`. A page-sheet already starts below the status bar, so if `react-native-safe-area-context` reports the *root window's* 47-59pt top inset there rather than the sheet's own 0, that modal gets a large dead band at the top — the mirror image of F3. `RNCSafeAreaView` reads insets from its own native view, which should give the correct 0, so I expect this is fine on iOS; I could not confirm without a device. Same question applies to `paywall.tsx:49` (`presentation: 'modal'`, F22). **How to check:** log `useSafeAreaInsets()` from inside the export modal on a notch device.

---

**Verified:** every finding above was independently re-checked against the code on 2026-08-08.
