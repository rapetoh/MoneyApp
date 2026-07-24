# Mobile App Review — Punch List (Deep Pass)

**Date**: 2026-05-04
**Scope**: `apps/mobile/` (React Native + Expo) — the **shipped** app, not the in-progress Murmur redesign
**Method**: Read every screen + every component + every hook + every service end-to-end. Cross-checked data writes against reads, every navigation target, every callsite.

> Items marked **"needs your eyes"** are runtime-only — verify on device before deciding.
> Severity legend (top-of-section in `[brackets]`):
>   - **CRITICAL** — broken in a way real users will hit immediately
>   - **HIGH** — visible UX bug, breaks promise the app makes
>   - **MEDIUM** — polish, inconsistency, or limited audience
>   - **LOW** — cosmetic / future-facing

---

## 1. Icon ↔ function / label mismatches

### 1.1 — Today tab uses a hamburger menu icon `[HIGH]`
- **Where**: [apps/mobile/app/(tabs)/_layout.tsx:87](apps/mobile/app/(tabs)/_layout.tsx#L87)
- **What**: The Today tab's icon is `name={focused ? 'menu' : 'menu-outline'}` — that's the three-line hamburger. Hamburgers universally mean "more / list / drawer." It does not say "Today" or "home."
- **Why it matters**: This is the same kind of icon-vs-function mismatch you flagged about the search-icon-for-transactions example. The Today tab is the app's home; the icon should say "home."
- **Suggested**: `home`/`home-outline` or `today`/`today-outline`.

### 1.2 — Budgets tab uses a clock icon `[HIGH]`
- **Where**: [apps/mobile/app/(tabs)/_layout.tsx:117](apps/mobile/app/(tabs)/_layout.tsx#L117)
- **What**: `name={focused ? 'time' : 'time-outline'}` — a clock face. Clocks mean "time / scheduled," not "spending limit."
- **Suggested**: `wallet`/`wallet-outline`, `pie-chart`/`pie-chart-outline`, `cash`/`cash-outline`.

### 1.3 — Ask Murmur "send" affordance is a mic that just goes back `[CRITICAL]`
- **Where**: [apps/mobile/app/more/ask-result.tsx:165-172](apps/mobile/app/more/ask-result.tsx#L165-L172)
- **What**: The follow-up bar at the bottom of the result screen has a sage-coloured circular **mic button**. Tapping it calls `router.back()` — does not record, does not send, does not start anything. Comment at line 157-159 admits the bar is non-functional.
- **Why it matters**: Users see a chat-style input with a send-button-shaped mic. They tap it expecting "submit my follow-up." It does the opposite.

### 1.4 — Today screen budget line label is hardcoded "left this month" `[MEDIUM]`
- **Where**: [apps/mobile/app/(tabs)/index.tsx:250](apps/mobile/app/(tabs)/index.tsx#L250)
- **What**: `t('home.left_this_month', locale)` is the suffix even when the user's budget is **weekly** or **biweekly** (the period selector in BudgetEditorModal lets them pick those). So a user with a weekly budget sees "$200 left this month" — which is wrong — when they actually have $200 left this **week**.

### 1.5 — Budgets tab header hardcodes the month name regardless of period `[MEDIUM]`
- **Where**: [apps/mobile/app/(tabs)/budgets.tsx:70-73, 96-98](apps/mobile/app/(tabs)/budgets.tsx#L70-L98)
- **What**: `monthLabel` is always the current month name (e.g. "APRIL"). For a weekly budget, the eyebrow says "APRIL · 4 days left." But "April" is irrelevant to a weekly window — the eyebrow should read "THIS WEEK" or the weekday range.
- **Same root cause as 1.4** — all the period-aware UI defaults to "month."

### 1.6 — Amount card on Record screen shows currency code, not symbol `[MEDIUM]`
- **Where**: [apps/mobile/app/(tabs)/record.tsx:487-488](apps/mobile/app/(tabs)/record.tsx#L487-L488)
- **What**: `<Text style={styles.amountHeroCurrency}>{userCurrency}</Text>` — shows "USD" / "EUR" / etc. directly. But [TransactionRow](apps/mobile/src/components/TransactionRow.tsx#L116-L139) uses a proper `currencySymbolFor` mapping ($, €, £, ¥, ₦, ₵, CFA …). Inconsistent.
- **Same**: amount-edit screen at [transaction/edit.tsx:193](apps/mobile/app/transaction/edit.tsx#L193), VoiceConfirmModal at [VoiceConfirmModal.tsx:188](apps/mobile/src/components/VoiceConfirmModal.tsx#L188), BudgetEditorModal at [BudgetEditorModal.tsx:95](apps/mobile/src/components/BudgetEditorModal.tsx#L95). All show currency code, not symbol.
- **Conversely**: IncomeEditorModal hardcodes `$` glyph at [IncomeEditorModal.tsx:92](apps/mobile/src/components/IncomeEditorModal.tsx#L92) — which is wrong for non-USD users.

### 1.7 — Stale code comment about "Today's clock icon" `[LOW]`
- **Where**: [apps/mobile/app/(tabs)/more.tsx:38](apps/mobile/app/(tabs)/more.tsx#L38)
- **What**: Comment says "the second entry point to the transaction list (the other being **Today's clock icon**)." But Today actually uses `list-outline` (correctly) at [(tabs)/index.tsx:238](apps/mobile/app/(tabs)/index.tsx#L238). Doc/code drift.

### 1.8 — Stale onboarding flow comment `[LOW]`
- **Where**: [apps/mobile/app/(onboarding)/_layout.tsx:3](apps/mobile/app/(onboarding)/_layout.tsx#L3)
- **What**: Comment says "welcome → permissions → income → tabs" — but the welcome step was retired (folded into the sign-in screen, see [(auth)/sign-in.tsx:25-37](apps/mobile/app/(auth)/sign-in.tsx#L25-L37)). Real flow is permissions → income → tabs.

---

## 2. Orphan data (collected but unused)

### 2.1 — `voice_language` is in the schema but no UI sets it `[HIGH]`
- **Where**:
  - Read at [apps/mobile/app/(tabs)/record.tsx:65](apps/mobile/app/(tabs)/record.tsx#L65) — `profile?.voice_language ?? LOCALE_TO_BCP47[userLocale] ?? 'en-US'`
  - **Never written anywhere.** Confirmed by grep: `voice_language` does not appear in any updateProfile call.
  - Settings only updates UI `locale` at [more/settings.tsx:467](apps/mobile/app/more/settings.tsx#L467); voice_language is never touched.
- **Why it matters**: Bilingual users (e.g. French UI, Spanish-speaking household) can't tell the app to listen in a different language than the UI is in. The schema field exists, suggesting that *was* the design intent — but the picker never landed.
- **Two ways to fix**: add a Voice Language picker in Settings → Voice & capture, or remove the column.

### 2.2 — Monthly income is editable but barely consumed `[HIGH]`
- **Where**:
  - Collected at [(onboarding)/income.tsx:48-52](apps/mobile/app/(onboarding)/income.tsx#L48-L52)
  - Editable later at [more/settings.tsx:258-261](apps/mobile/app/more/settings.tsx#L258-L261), [IncomeEditorModal.tsx:62](apps/mobile/src/components/IncomeEditorModal.tsx#L62)
  - **Only consumer in the entire app**: Ask Murmur context payload at [ask-result.tsx:98](apps/mobile/app/more/ask-result.tsx#L98)
- **Confirmed by grep**: `monthly_income` is never read by the Today screen, Insights, Budgets, Record, or any spend math.
- **Why this matters**: Onboarding gives the income step a full screen with quick-pick presets and an optional recurring rule, signaling it's important. But:
  - **Free users** (Ask Murmur is Plus-gated): income is **completely orphan** for them.
  - **Plus users**: only Ask Murmur uses it. It does **not** flow into Insights, Today summary, "safe to spend" math, budget defaults, or any visible surface.
- **This is the exact pattern from your example** — they ask, you fill it, then nothing actually uses it the way you'd expect.

### 2.3 — `ai_confidence` is saved on every transaction but only surfaced in the parse modal, never afterward `[MEDIUM]`
- **Where**:
  - Saved at [useTransactions.ts:96](apps/mobile/src/hooks/useTransactions.ts#L96) and at [(tabs)/record.tsx:197](apps/mobile/app/(tabs)/record.tsx#L197)
  - Surfaced once at [VoiceConfirmModal.tsx:280-282](apps/mobile/src/components/VoiceConfirmModal.tsx#L280-L282) (`confidence < 0.75` shows a low-confidence note)
  - **Never read afterward** — not in transaction detail, not in transactions list. Grep confirms no other consumer.
- **Why it matters**: The PRD §5.1 says "If AI is uncertain about a field, it highlights it for user review." After save, that signal is gone — even though it's in the database. A user reviewing a list of voice-logged expenses can't tell which ones were guesses.

### 2.4 — `monthly_income_source` is set but only displayed once `[LOW]`
- **Where**:
  - Set at [(onboarding)/income.tsx:50](apps/mobile/app/(onboarding)/income.tsx#L50) and [more/settings.tsx:379](apps/mobile/app/more/settings.tsx#L379)
  - Displayed at [more/settings.tsx:150-152](apps/mobile/app/more/settings.tsx#L150-L152) only — as a suffix on the Settings income row.
- **Why it matters**: Less impactful than 2.2, but the user types in their employer name with no obvious payoff anywhere. No effect on Ask Murmur grounding (only `monthly_income` is sent), no logo shown anywhere despite the comment at [(onboarding)/income.tsx:145-146](apps/mobile/app/(onboarding)/income.tsx#L145-L146) saying MerchantAvatar would pick up the logo (it doesn't — no MerchantAvatar render is keyed off `monthly_income_source`).

---

## 3. Broken or half-wired features

### 3.1 — Ask Murmur action pills are intentionally inert `[CRITICAL]`
- **Where**: [more/ask-result.tsx:115-120](apps/mobile/app/more/ask-result.tsx#L115-L120)
- **What**: When Ask returns a structured response with action pills (e.g. "Set a budget", "Show transactions"), tapping a pill runs an empty function — comment says "intentionally inert until the target surfaces exist."
- **Workaround for now**: filter the pills out of the model's response client-side until the destinations are wired, so users never see something they can't act on.

### 3.2 — Follow-up bar on Ask result is a placeholder `[CRITICAL]`
- **Where**: [more/ask-result.tsx:157-174](apps/mobile/app/more/ask-result.tsx#L157-L174)
- **What**: Looks like a chat input. Has placeholder text. Has a circular mic-style send button. The text field is a `<Text>` not a `<TextInput>`; the button calls `router.back()`. Comment at line 157-159 admits this is a "scope-trim for Phase E."
- **Cross-platform inconsistency**: web Ask Murmur **does** support follow-ups — see [DESKTOP_REVIEW.md §3.x](docs/DESKTOP_REVIEW.md). Mobile and web are at different fidelity for the same feature.
- **Quick fix**: remove the bar until the feature ships.

### 3.3 — Ask entry mic button is a silent no-op for Plus users `[HIGH]`
- **Where**: [more/ask.tsx:75-79](apps/mobile/app/more/ask.tsx#L75-L79)
- **What**: 
  ```
  function onMicPress() {
    if (!isPlus) gotoPaywall()  // free users: go to paywall
    // plus users: nothing
  }
  ```
  Free users at least get sent somewhere. Plus users tap the mic, get nothing — no alert, no listening UI, no error. Comment confirms: "voice-in-Ask isn't built yet so a Plus user tapping the mic gets a no-op."
- **Why it matters**: This is the third dead affordance in the Ask flow alone (with action pills + follow-up bar).

### 3.4 — Apple Pay Shortcut "Set up" link goes nowhere `[HIGH]`
- **Where**: [more/settings.tsx:195](apps/mobile/app/more/settings.tsx#L195) (the URL constant), used at [L280](apps/mobile/app/more/settings.tsx#L280)
- **What**: `const SHORTCUT_INSTALL_URL = 'https://www.icloud.com/shortcuts/placeholder'` — literally the word "placeholder" in the URL. iOS users tapping "Set up" get an iCloud 404 / generic error.

### 3.5 — Paywall upgrade button is a no-op `[CRITICAL]`
- **Where**: [more/paywall.tsx:108-116](apps/mobile/app/more/paywall.tsx#L108-L116)
- **What**:
  ```
  onPress={() => {
    // Purchase flow isn't wired yet. Keep the button responsive...
  }}
  ```
- **Why it matters**: The whole monetisation surface is theatrical. Users discover the paywall, tap upgrade, nothing happens. No alert, no checkout, no flow.

### 3.6 — Privacy screen "Export all" and "Delete all my data" buttons are dead `[CRITICAL]`
- **Where**: [more/privacy.tsx:188-192](apps/mobile/app/more/privacy.tsx#L188-L192)
- **What**:
  ```tsx
  <SetGroup label={t('privacy.group_rights', locale)}>
    <SetRow label={t('privacy.export_all', locale)} />
    <SetRow label={t('privacy.delete_all', locale)} danger last />
  </SetGroup>
  ```
  **Neither row has an `onPress` handler.** The destructive "Delete all my data" row is in red, looks tappable, has a chevron — and does nothing.
- **Why this is critical**:
  - Both are GDPR-relevant ("right to data portability", "right to erasure"). A privacy screen with dead buttons that *look* like they exercise those rights is worse than not showing them at all.
  - "Delete all my data" with a destructive style + chevron specifically misleads — a privacy-conscious user thinks they've initiated deletion, but nothing happens. They may then assume the app didn't honor their request.
- **Fix**: either wire them, or remove them until they're wired.

### 3.7 — Recurring rule from income onboarding has no `template_txn_id` link `[HIGH]`
- **Where**: [(onboarding)/income.tsx:75-84](apps/mobile/app/(onboarding)/income.tsx#L75-L84)
- **What**: The income onboarding step calls `createTransaction(...)` and `createRule(...)` separately. The transaction is created with `is_recurring: true`. The rule is created **without** `template_txn_id` — the param is just omitted, so it defaults to `null` per [useRecurringRules.ts:127](apps/mobile/src/hooks/useRecurringRules.ts#L127).
- **Effect** (confirmed by reading [transaction/[id].tsx:215-231](apps/mobile/app/transaction/[id].tsx#L215-L231)): the txn detail screen looks up the linked rule by `template_txn_id`. For the onboarding income txn, no rule is found → the recurring chip falls back to bare "Recurring" with no frequency or next-due. The detail screen's comment at line 215 explicitly calls this out as the "ghost case."
- **Why it matters**: All other recurring flows (manual entry, voice flow, edit toggle) DO link `template_txn_id` correctly. Only onboarding income is broken. So the very first txn a user sees in their app — their income — is the only one with degraded recurring info.
- **Fix**: in [(onboarding)/income.tsx](apps/mobile/app/(onboarding)/income.tsx), capture `txnId` from `createTransaction` and pass it as `template_txn_id` to `createRule`.

### 3.8 — Recurring rule sync is online-only `[MEDIUM]`
- **Where**: [useRecurringRules.ts:111-143](apps/mobile/src/hooks/useRecurringRules.ts#L111-L143)
- **What**: `createRule`, `toggleRule`, `deleteRule`, and `updateRule` all call Supabase directly. **There's no offline queue for rules** — unlike transactions, which have a SQLite + sync queue ([useTransactions.ts:115-116](apps/mobile/src/hooks/useTransactions.ts#L115-L116)).
- **Effect**: Offline user marks a transaction as recurring → transaction is queued and saves on next online; rule create silently fails (just `console.warn` at line 138). When the user comes back online, the txn syncs with `is_recurring: true` but no rule exists → "ghost" recurring transaction.
- **Why it matters**: PLAN's locked decisions specifically promise "Offline-first writes via SQLite + sync queue." Recurring rules don't honor that promise.

### 3.9 — Income onboarding presets are USD-only `[MEDIUM]`
- **Where**: [(onboarding)/income.tsx:16-21](apps/mobile/app/(onboarding)/income.tsx#L16-L21)
- **What**:
  ```ts
  const PRESETS = [
    { label: '$2.5k', value: 2500 },
    { label: '$4k', value: 4000 },
    { label: '$6k', value: 6000 },
    { label: '$10k', value: 10000 },
  ]
  ```
  Hardcoded `$` glyph, hardcoded USD-scale values. A user whose currency is XAF (Central African franc), NGN (naira), JPY (yen), or even just EUR sees `$` quick-picks at numbers that are wrong for their currency. A Nigerian user with a ₦300,000 salary doesn't see anything in the right ballpark.
- **Fix**: scale presets per currency, or drop them and just show the keypad.

### 3.10 — Plus status determination is `__DEV__` only `[CRITICAL]`
- **Where**: [usePlusStatus.ts:21-24](apps/mobile/src/hooks/usePlusStatus.ts#L21-L24)
- **What**: `const isDev = typeof __DEV__ !== 'undefined' && __DEV__; return { isPlus: isDev, loading: false }`. The comment at L13-15 admits "In production, `isPlus` is always false. Production users see the paywall on every Plus-gated entry. They will continue to until IAP wires real entitlements through this hook."
- **Why it matters**: In a production build, every paying user gets the paywall on Insights' Day-3 unlock card, on Ask Murmur, on auto-recurring detection (Today's "New pattern detected" banner is gated at [(tabs)/index.tsx:261](apps/mobile/app/(tabs)/index.tsx#L261)), on export. **Combined with 3.5 (paywall has no purchase path), Plus is currently unobtainable.**

### 3.11 — Render-time setState in Record screen `[LOW]`
- **Where**: [(tabs)/record.tsx:180-182](apps/mobile/app/(tabs)/record.tsx#L180-L182)
- **What**:
  ```tsx
  if (voice.state === 'done' && !confirmModalVisible) {
    setConfirmModalVisible(true)
  }
  ```
  This is a setState call **during render** (not inside a useEffect). React will complain in dev with "Cannot update a component while rendering a different component." Currently still works, but it's an anti-pattern that breaks under Strict Mode and may cause double-mount issues.
- **Fix**: wrap in `useEffect(() => { ... }, [voice.state])`.

### 3.12 — Receipt/paycheck scan only camera, no library `[LOW]`
- **Where**: [(tabs)/record.tsx:234-241](apps/mobile/app/(tabs)/record.tsx#L234-L241)
- **What**: `ImagePicker.launchCameraAsync` — only opens the camera. Users with an existing photo of a receipt (already saved to camera roll) can't use it.
- **Why it matters**: Common pattern: snap receipt now, log later. Mobile photographs receipts often in cluttered settings — being able to upload from library is the first feature people expect.
- **Fix**: offer a sheet ("Take photo" / "Choose from library") or use `launchImageLibraryAsync` as a fallback.

---

## 4. Privacy / data integrity gaps

### 4.1 — `raw_transcript` is sent to Supabase despite the privacy claim that it stays local `[CRITICAL]`
- **The promise**:
  - PLAN.md schema comment on `transactions` says: `raw_transcript text -- stored locally only, never synced unless user opts in`
  - Privacy screen at [more/privacy.tsx:181-184](apps/mobile/app/more/privacy.tsx#L181-L184) shows row "Auto-delete voice in 24h · Not stored"
- **The reality**:
  - [useTransactions.ts:95](apps/mobile/src/hooks/useTransactions.ts#L95): `raw_transcript: fields.raw_transcript ?? null` is written to the local txn object.
  - [useTransactions.ts:115](apps/mobile/src/hooks/useTransactions.ts#L115): `enqueue('create', txn.id, txn)` enqueues the **full** txn object (including raw_transcript) for sync.
  - [SyncManager.ts:86-89](apps/mobile/src/services/sync/SyncManager.ts#L86-L89): `supabase.from('transactions').upsert(payload, { onConflict: 'id' })` — pushes the full payload to Supabase. **No field stripping.**
  - There is no opt-in toggle anywhere.
- **Why it matters**: The privacy screen explicitly claims voice is "not stored." It IS stored — locally AND on Supabase, indefinitely. This is a privacy promise that's not honored. For a product whose differentiator is privacy ("on-device voice"), this is a real issue.
- **Two ways to fix**: (a) actually strip `raw_transcript` from the sync payload in `enqueue`, or (b) add the user-facing opt-in the schema comment promised, and only sync when it's on.

### 4.2 — End-to-end encryption claim is false (cross-ref: web Settings) `[HIGH]`
- This claim doesn't appear in mobile copy as far as I read — but it does on web Settings ("End-to-end encrypted via your account. Murmur servers never see your transactions in plaintext."). Flagged in [DESKTOP_REVIEW.md](docs/DESKTOP_REVIEW.md). Worth checking that mobile copy doesn't make a similar claim — i18n strings for `privacy.*` were not directly read in this pass. **Needs your eyes** on the actual text in `privacy.on_device_detail` etc. across en/fr/es/pt locale files.

---

## 5. Navigation inconsistencies

### 5.1 — `transaction/new` is a redirect that wastes a route + flashes a header `[LOW]`
- **Where**: [transaction/new.tsx](apps/mobile/app/transaction/new.tsx) — just `<Redirect href="/(tabs)/record" />`
- **Effect**: The Stack registers it as a modal screen at [_layout.tsx:120-128](apps/mobile/app/_layout.tsx#L120-L128) with header "Add expense". Modal opens → header briefly flashes → redirect fires → user lands on Record (which has its own different header). Brief but visible flicker on slower devices.
- **Fix**: have callers link directly to `/(tabs)/record` (none currently link to `/transaction/new` from what I saw), and delete `new.tsx` + remove its Stack registration.

### 5.2 — Record screen close button always pushes `/(tabs)` instead of using `back()` `[LOW]`
- **Where**: [(tabs)/record.tsx:343](apps/mobile/app/(tabs)/record.tsx#L343)
- **What**: Close button does `router.push('/(tabs)')`. If the user came from Day-1 first-log's "type instead" link (which already pushed Record), pressing close pushes Today on top of Record on top of Today — back-button history gets noisy.
- **Fix**: `router.back()` if there's history, otherwise `router.replace('/(tabs)')`.

### 5.3 — ListeningView cancel pushes Today instead of replacing `[LOW]`
- **Where**: [(tabs)/record.tsx:332](apps/mobile/app/(tabs)/record.tsx#L332)
- **Same issue as 5.2.**

---

## 6. Copy / labelling

### 6.1 — Personal email hardcoded as the support address `[CRITICAL]`
- **Where**: [more/help.tsx:24,27](apps/mobile/app/more/help.tsx#L24-L27)
- **What**: `mailto:rapetohsenyo@gmail.com?subject=Murmur%20feedback` and the same address rendered as plain text on the row.
- **Cross-app inconsistency**: web's Settings → About uses `hello@murmur.app` (also placeholder, doesn't exist) at [apps/web/src/app/dashboard/settings/page.tsx:374](apps/web/src/app/dashboard/settings/page.tsx#L374). So mobile and web both have wrong support emails, and they're inconsistent with each other.
- **Why it matters**: Privacy/spam exposure for you. Looks unprofessional in a paid product. Bug reports go to your personal inbox.

### 6.2 — Version is hardcoded "1.0.0" in two places `[HIGH]`
- **Where**: [more/help.tsx:32](apps/mobile/app/more/help.tsx#L32) and [more/settings.tsx:348](apps/mobile/app/more/settings.tsx#L348)
- **Effect**: Bug reports become useless ("I'm on 1.0.0" — which 1.0.0?). Should pull from `Constants.expoConfig?.version`.

### 6.3 — Profile card "N expenses" counter includes incomes `[MEDIUM]`
- **Where**: [more/settings.tsx:155, 209-210](apps/mobile/app/more/settings.tsx#L155-L210)
- **What**: `txnCount = transactions.filter(x => !x.is_deleted).length` — counts everything. Then renders "Free plan · {txnCount} {settings.expenses_count}". So a user with 3 expenses + 1 income sees "4 expenses."
- **Fix**: filter `direction === 'debit'` for the count, or change the label key to "transactions."

### 6.4 — Paywall prices don't match PLAN `[MEDIUM]`
- **Where**: [more/paywall.tsx:93,100](apps/mobile/app/more/paywall.tsx#L93-L100)
- **What**: App shows `$4.99/mo` and `$39/yr`. PLAN's locked decisions say `$3.99/mo` and `$29.99/yr` (PLAN.md line 30). And the prices are hardcoded `$` even for non-USD users.
- **Why it matters**: PLAN is the source of truth for pricing decisions. Decide which is right and align both.

### 6.5 — Recurring screen eyebrow says "Detected" but rules are also created manually `[LOW]`
- **Where**: [recurring.tsx:161](apps/mobile/app/recurring.tsx#L161)
- **What**: Eyebrow `t('recurring.eyebrow_detected', locale)`. Most rules in the app are user-created (income onboarding, manual recurring toggle in voice/manual entry, edit screen toggle). Detection is one of several origins, not the only one.
- **Fix**: more neutral copy, e.g. "Your subscriptions" or "Recurring rules."

### 6.6 — Sign-up "check your email" success has no spam-folder hint `[LOW]`
- **Where**: [(auth)/sign-up.tsx:52-69](apps/mobile/app/(auth)/sign-up.tsx#L52-L69)
- **What**: Shows "Check your email" + a "Back to sign in" button. No "didn't get it? Check spam" or "resend" affordance.
- **Why it matters**: Common Supabase issue — confirmation emails land in spam. Without a hint, users get stuck.

---

## 7. Onboarding gaps

### 7.1 — Microphone asked upfront, camera asked lazily — inconsistent `[MEDIUM]`
- **Where**: mic in [(onboarding)/permissions.tsx](apps/mobile/app/(onboarding)/permissions.tsx); camera at first scan tap from [(tabs)/record.tsx:228-232](apps/mobile/app/(tabs)/record.tsx#L228-L232)
- **What**: Mic permission is requested in onboarding **before the user has tried voice**. Camera waits until first use (the right pattern).
- **Fix**: drop the upfront mic prompt, move it to first record-button tap with a brief explainer.

### 7.2 — Income skip is silent — no signal that you can edit it later `[MEDIUM]`
- **Where**: [(onboarding)/income.tsx:101-109](apps/mobile/app/(onboarding)/income.tsx#L101-L109)
- **What**: Skip button hands off without saying "you can add this in Settings later" or "this powers Ask Murmur" or "you can change it anytime."
- **Why it matters**: Users either skip without thinking and lose Ask Murmur quality (Plus), or feel forced to fill in a number they don't want to share.

### 7.3 — Notification permission is never requested for Day-2 dunning until first toggle `[LOW]`
- **Where**: dunning toggle at [more/settings.tsx:309-317](apps/mobile/app/more/settings.tsx#L309-L317), permission grant at [services/dayTwoDunning.ts](apps/mobile/src/services/dayTwoDunning.ts).
- **What**: Day-2 dunning (Day-2 nag local notification) is enabled by default per `useDayTwoDunning` (called from [(tabs)/_layout.tsx:59](apps/mobile/app/(tabs)/_layout.tsx#L59)). The notification permission flow happens lazy — first time the toggle is touched. **Needs your eyes**: confirm the first scheduled fire correctly requests permission on first launch, otherwise the Day-2 nag does nothing for users who never visit Settings.

---

## 8. Voice / capture flow

### 8.1 — Voice language unsettable (cross-ref §2.1)
- Same orphan field. Mentioned again because it's the most user-visible voice gap.

### 8.2 — Confidence not surfaced after the modal closes (cross-ref §2.3)
- Once a low-confidence transaction is saved, there's no "review these" surface to come back to.

### 8.3 — Manual entry keypad has no comma decimal support `[LOW]`
- **Where**: [(tabs)/record.tsx:149-163](apps/mobile/app/(tabs)/record.tsx#L149-L163)
- **What**: Keypad accepts only `.` for decimal. EU/Latin-locale users (fr, es, pt) typically use comma — but the keypad doesn't offer it. The `parseFloat(amount.replace(',', '.'))` at line 271 handles commas at parse time, but the keypad never produces them, so it's dead code.
- **Why it matters**: Users in fr/es/pt locales who try to type "12,50" can't.

---

## 9. Auth / permissions

### 9.1 — Sign-in providers
- **Where**: Apple (iOS hero) + Google (Android hero) + email/password — at [(auth)/sign-in.tsx](apps/mobile/app/(auth)/sign-in.tsx)
- **Needs your eyes**: walk through all three on iOS and Android. Apple SIWA in particular needs the right entitlements + Apple developer config; Google needs platform-specific client IDs. If one of these isn't fully wired, the buttons render but the flow opens a blank webview or 500s on the OAuth callback.

### 9.2 — Sign-up has no "Forgot password" affordance `[MEDIUM]`
- **Where**: [(auth)/sign-in.tsx](apps/mobile/app/(auth)/sign-in.tsx) — the "More options" expandable shows email/password + a "Create one" link to sign-up. No "Forgot password" link.
- **Why it matters**: Users who choose email/password and forget their password get locked out of their data with no in-app recovery path.
- **Fix**: add a "Forgot password" link that calls `supabase.auth.resetPasswordForEmail(...)`.

---

## 10. Empty / loading / error state holes

### 10.1 — Recurring screen — bare spinner on cold load `[LOW]`
- **Where**: [recurring.tsx:165-166](apps/mobile/app/recurring.tsx#L165-L166)
- **What**: Loading state is just `<ActivityIndicator>` centered, nothing else.

### 10.2 — Ask Murmur error state is generic `[MEDIUM]`
- **Where**: [more/ask-result.tsx:106-108](apps/mobile/app/more/ask-result.tsx#L106-L108)
- **What**: Any failure (network down, OpenAI rate limit, auth expired, server error) collapses to a single `state.kind === 'error'` branch.

### 10.3 — Voice flow `no-transcript` error message is technical `[LOW]`
- **Where**: [useVoice.ts:75-95](apps/mobile/src/hooks/useVoice.ts#L75-L95)
- **What**: When STT fails with no transcript, error code `'no-transcript'` is set; the record screen at [(tabs)/record.tsx:399-402](apps/mobile/app/(tabs)/record.tsx#L399-L402) shows a localized message — good. But for any *other* error (`'no-speech'` is special-cased at line 88, but other error codes show `Speech recognition error: ${event.error}` raw at line 93). User sees raw error code like "audio-capture" with no help.

### 10.4 — Transactions filter empty state covered `[ok]`
- **Where**: [more/transactions.tsx:237-244](apps/mobile/app/more/transactions.tsx#L237-L244) — different copy when search/filter is set vs. genuinely empty. **Working correctly.** Mentioned only because the prior review wasn't sure.

---

## 11. Other observations

### 11.1 — Income onboarding gives `transacted_at: now` to the income transaction `[LOW]`
- **Where**: [(onboarding)/income.tsx:64-73](apps/mobile/app/(onboarding)/income.tsx#L64-L73) → useTransactions.createTransaction → [useTransactions.ts:80, 93](apps/mobile/src/hooks/useTransactions.ts#L80-L93) sets `transacted_at: now`.
- **What**: Onboarding creates an income txn dated *today*, which represents "this month's income." If the user onboards on the 28th, their income shows up dated the 28th — but real income may have arrived on the 1st. Affects month-by-month income totals if they look back later.
- **Fix**: either ask "when did you last get paid" or back-date to start of month.

### 11.2 — Recurring catch-up runs every layout mount `[LOW]`
- **Where**: [_layout.tsx:97-99](apps/mobile/app/_layout.tsx#L97-L99) — `runRecurringCatchUp(session.user.id)` is invoked inside the routing useEffect, which runs on every segment change. **Needs your eyes** at [services/recurringCatchUp.ts](apps/mobile/src/services/recurringCatchUp.ts) to confirm the function is idempotent and cheap (otherwise this is a perf hit on every navigation).

### 11.3 — `usePlusStatus` has no async resolution path `[LOW]`
- **Where**: [usePlusStatus.ts](apps/mobile/src/hooks/usePlusStatus.ts) — just returns `{ isPlus, loading: false }`.
- **Why it matters**: When IAP / RevenueCat lands, this will need to await receipt validation. Currently every callsite assumes `isPlus` is synchronous + final. When the contract changes, every caller will need to handle a transient `loading: true` state. Fine for now, just noting the architectural debt.

### 11.4 — DayOneFirstLog mic-FAB callout intentionally not drawn `[LOW]`
- **Where**: [DayOneFirstLog.tsx:30-33](apps/mobile/src/components/DayOneFirstLog.tsx#L30-L33) — comment says "the mic FAB glow + 'Tap & hold to speak' callout from the mockup are intentionally not drawn — their positioning depends on the tab-bar layout and would be brittle." Acknowledged in the design doc. Less a bug, more a known compromise.

---

## Severity summary

**Critical (production blockers / privacy commitments not kept)**:
- 3.5 Paywall has no purchase wiring (entire monetisation is dead)
- 3.10 Plus determination via `__DEV__` (no production user is ever Plus)
- 3.6 Privacy "Export all" / "Delete all my data" buttons have no `onPress`
- 3.1 + 3.2 Ask action pills + follow-up bar are dead affordances
- 4.1 `raw_transcript` is synced to Supabase despite the schema comment + Privacy screen claiming it isn't
- 6.1 Personal email hardcoded as support address

**High**:
- 1.1 + 1.2 Today + Budgets tab icons are wrong
- 2.1 + 2.2 voice_language and monthly_income are mostly orphan
- 3.3 Ask entry mic = silent no-op for Plus users
- 3.4 Apple Pay Shortcut is a placeholder URL
- 3.7 Onboarding income rule has no `template_txn_id`
- 6.2 Hardcoded "1.0.0" version

**Medium**:
- 1.4 + 1.5 + 1.6 Period-aware copy + currency rendering
- 3.8 Recurring rules not offline-first
- 3.9 Onboarding income presets are USD-only
- 6.3 + 6.4 + 6.5 Copy issues
- 7.1 + 7.2 Onboarding permission ask + silent skip
- 8.3 Manual keypad doesn't accept commas
- 9.2 No "Forgot password"
- 10.2 Ask error state generic

**Low** — see individual entries.

---

## What needs your eyes (collected)

1. **3.5** Tap upgrade pill in Settings → tap a plan tile in Paywall → confirm nothing happens (no IAP wired).
2. **9.1** All three sign-in providers, on iOS and Android — particularly the post-OAuth callback chain.
3. **4.2** Spot-check `privacy.*` strings in en/fr/es/pt for any "end-to-end encrypted" claim that isn't true.
4. **7.3** First app launch on a fresh install — does Day-2 dunning actually schedule, or quietly fail because notification permission was never asked?
5. **8.x** Record an ambiguous expense ("paid that thing") — does VoiceConfirmModal show the low-confidence note? Does `needs_clarification` from the parser surface?
6. **10.3** Trigger an STT error other than "no-speech" / "no-transcript" — does the screen show a useful message or a raw error code?
7. **11.2** Inspect `recurringCatchUp.ts` to confirm it's idempotent and cheap on every nav.
8. **3.12** Try a UX flow: take a receipt photo first, then open Murmur — discover that scan doesn't accept gallery uploads.
9. Fresh install on the four locales (en/fr/es/pt) — visually scan Today / Insights / Settings / Privacy / Paywall for stray English fragments.
10. Network-killed Ask Murmur — does the user see anything specific?
