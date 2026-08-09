# Fresh-eyes sweep of every screen and state
**Audit date:** 2026-08-08 - **Scope:** every user-facing surface on mobile (18 routes), web (11 routes + 6 lenses), and the shared hooks/services they read - **Files examined:** 71

## Verdict
Not production-ready. Three classes of defect dominate and all three are systemic rather than incidental. The first is **date/timezone incoherence**: `transacted_at` is a `timestamptz`, `profiles.timezone` is never written from the device, and every screen does its own `new Date(...)` local-time arithmetic — including one place (`CalendarLens`) where a `Date` built on the Vercel server in UTC is re-read with the browser's local getters, which shifts the entire Overview month window back by one month for every user west of UTC and is the exact cause of the "1 in the FRI column / WEDNESDAY · JUL 8" symptom. The second is **write and transport paths that fail silently**: `recurring_rules` inserts fire a foreign key at a transaction row that at that instant exists only in the local SQLite queue, so the insert loses the race, `console.warn`s, and returns null — which is why production has zero recurring rules across all six users despite the UI reporting success. The third, found during verification, is **auth and transport that never ran at all**: the Next.js middleware matcher swallows `/auth/callback`, so Google sign-in on web and desktop can never complete (F51), and the `supabase_realtime` publication contains zero tables, so all four "live update" subscriptions in the codebase are dead wire (F50). Layered on top, the money-formatting layer defaults to `$` and `en-US` grouping on mobile (`Money.tsx:44,51`) so seven of the ten offered currencies render with the wrong symbol on every hero amount, a production Settings row lets anyone redirect the AI endpoint *with the user's Supabase access token attached* (F28), and the entire Plus purchase flow is a no-op button, meaning every Plus-gated surface is a hard dead end. The single worst problem is the OAuth callback, because it means the paid desktop product cannot be signed into by the provider the login page leads with; the recurring-rules FK race is a close second, because it destroys data the user believes they saved and there is no error surface anywhere to tell them. The systemic cause behind almost all of it: **the app was built screen-by-screen against a design bundle, with each screen re-deriving dates, currency formatting, and error handling locally instead of consuming one shared, tested primitive — and no end-to-end path was ever exercised against the real deployment.**

## Findings summary
| # | Severity | Finding | Primary file |
|---|----------|---------|--------------|
| F51 | Critical | Google sign-in on web/desktop can never complete — middleware swallows `/auth/callback` | `apps/web/middleware.ts:33-35,44-46` |
| F1 | Critical | Web Overview month window is off by one month for every non-UTC user (RSC Date boundary) | `apps/web/src/components/lenses/Calendar.tsx:18-22` |
| F2 | Critical | Recurring rules are never created: FK race against the offline-first queue | `apps/mobile/src/hooks/useRecurringRules.ts:100-141` |
| F4 | Critical | Mobile `Money` hardcodes `$` and `en-US` grouping on every hero amount | `apps/mobile/src/components/Money.tsx:44,51` |
| F5 | Critical | Changing profile currency silently relabels every historical amount | `apps/mobile/app/more/settings.tsx:439-442` |
| F6 | Critical | The Plus purchase flow does not exist; every gated surface is a dead end | `apps/mobile/app/more/paywall.tsx:108-116` |
| F7 | Critical | No password-reset flow on any platform | `apps/mobile/app/(auth)/sign-in.tsx`, `apps/web/src/app/login/page.tsx` |
| F8 | Critical | Sign-out clears nothing; a poisoned queue entry from account A blocks account B forever | `apps/mobile/src/hooks/useAuth.ts:36-38` |
| F28 | Critical | "Developer → AI server URL" ships to production and redirects the Supabase access token with it | `apps/mobile/app/more/settings.tsx:331-341` |
| F3 | High | Parsed transaction date is discarded — every transaction is stamped "now" | `apps/mobile/src/hooks/useTransactions.ts:106` |
| F9 | High | Apple-signed-up users cannot sign in to web/desktop at all | `apps/web/src/app/login/page.tsx:25-39` |
| F10 | High | Web Insights forecast is naive linear extrapolation with no sample-size guard | `apps/web/src/app/dashboard/insights/page.tsx:224` |
| F11 | High | "Heaviest day — avg $X" divides 90-day sums by a hardcoded 12 | `apps/web/src/app/dashboard/insights/page.tsx:274` |
| F12 | High | Insights heatmap buckets on server-UTC hours and drops everything outside 08:00–21:59 UTC | `apps/web/src/app/dashboard/insights/page.tsx:322-338` |
| F13 | High | Transfers/investments are counted as "spend" everywhere | `apps/web/src/app/dashboard/insights/page.tsx:290-296` |
| F15 | High | `.eq('category_id', null)` never matches → duplicate active overall budgets | `apps/web/src/app/dashboard/budgets/page.tsx:173-179` |
| F19 | High | iOS Shortcuts deep link never matches; install URL is a literal placeholder | `apps/mobile/src/hooks/useShortcutHandler.ts:12-13` |
| F20 | High | Android notification listener is wired to a no-op callback — feature is dead end-to-end | `apps/mobile/app/more/settings.tsx:174-176` |
| F21 | High | Web Settings shows "Saved." even when the write fails | `apps/web/src/app/dashboard/settings/page.tsx:226-258` |
| F22 | High | Every web page: spinner never clears + query failure renders as an empty state | `apps/web/src/lib/data.ts:21-22` |
| F23 | High | Mobile has no error surface for any remote read; failures look like empty data | `apps/mobile/src/hooks/useTransactions.ts:15,196` |
| F24 | High | Mobile only ever pulls 200 transactions and never paginates | `apps/mobile/src/services/sync/SyncManager.ts:156-176` |
| F29 | High | Onboarding income screen hardcodes `$` and dollar presets | `apps/mobile/app/(onboarding)/income.tsx:16-21,137` |
| F30 | High | Onboarding ignores every write error → user can be trapped in the loop | `apps/mobile/app/(onboarding)/income.tsx:44-97` |
| F31 | High | Permissions screen "Try again" is dead once iOS denies permanently | `apps/mobile/app/(onboarding)/permissions.tsx:44-51` |
| F32 | High | Web export filters on UTC dates while the picker reads local; CSV date/time disagree | `apps/web/src/app/dashboard/export/page.tsx:70-75,104-105` |
| F33 | High | The product's only support channel is an unregistered domain | `packages/shared/src/brand.ts:17` |
| F34 | High | Web UI is English-only behind a 4-language picker | `apps/web/src/app/dashboard/settings/page.tsx:12-17` |
| F50 | High | Every realtime subscription is dead wire — `supabase_realtime` publishes zero tables | `apps/mobile/src/hooks/useTransactions.ts:52`, `apps/web/src/app/dashboard/*/page.tsx` |
| F14 | Medium | Budgets ring shows spend as budget usage when no budget exists | `apps/web/src/app/dashboard/budgets/page.tsx:404-414` |
| F16 | Medium | Web budget insert omits `currency_code`; row stored USD, displayed as profile currency | `apps/web/src/app/dashboard/budgets/page.tsx:181-187` |
| F17 | Medium | Mobile budget "spent" includes upcoming recurring, web does not | `apps/mobile/app/(tabs)/budgets.tsx:80` |
| F18 | Medium | Recurring totals sum mixed currencies on both platforms | `apps/mobile/app/recurring.tsx:95-99` |
| F25 | Medium | Paywall prices contradict the product plan and hardcode `$` | `apps/mobile/app/more/paywall.tsx:93,100` |
| F26 | Medium | Paywall claims "Free mobile tier is never limited" while three features are gated | `packages/shared/src/i18n/locales/en.json:431` (`paywall.disclaimer`) |
| F27 | Medium | Mobile Settings always says "Free plan" and always shows "Upgrade" | `apps/mobile/app/more/settings.tsx:209-218` |
| F35 | Medium | Web paywall ships a developer note to production users | `apps/web/src/components/PaywallGate.tsx:31-33` |
| F37 | Medium | Transactions table: "Recurring" in the SOURCE column, "Apple Pay" for Android, fake "Account" | `apps/web/src/app/dashboard/transactions/page.tsx:64-71,733` |
| F38 | Medium | "Next 30 days" calendar puts weekday headers over day-offset cells | `apps/web/src/app/dashboard/recurring/page.tsx:563-605` |
| F39 | Medium | No platform offers a way to create a recurring rule directly | `apps/web/src/app/dashboard/recurring/page.tsx:338` |
| F41 | Medium | Fabricated device/billing rows in web Settings and Sidebar | `apps/web/src/app/dashboard/settings/page.tsx:402-425,438-452` |
| F42 | Medium | Amount validation: $0 silently no-ops, no upper bound, no future-date guard | `apps/mobile/src/components/VoiceConfirmModal.tsx:113-135` |
| F43 | Medium | Transaction detail: rule lookup ignores `recurring_rule_id`; fake play button | `apps/mobile/app/transaction/[id].tsx:217,331-348` |
| F44 | Medium | Naming drift for the same destination across mobile/web/sidebar | `apps/web/src/components/Sidebar.tsx:40` |
| F45 | Medium | Web Calendar day-detail rows print raw `amount` under a converted total | `apps/web/src/components/lenses/Calendar.tsx:305` |
| F46 | Medium | Mobile budget period picker offers 3 of the 5 periods web can write | `apps/mobile/src/components/BudgetEditorModal.tsx:16-20` |
| F47 | Medium | Root `eas.json` production profile has no env block (divergent duplicate) | `eas.json:24-26` |
| F36 | Low | Web Recurring leaks a realtime channel on every mount | `apps/web/src/app/dashboard/recurring/page.tsx:191-221` |
| F40 | Low | Mobile Recurring lists paused rules under "Active subscriptions" | `apps/mobile/app/recurring.tsx:194-197` |
| F48 | Low | Untranslated literals and locale-blind formatting in localized screens | `apps/mobile/app/more/transactions.tsx:209` |
| F49 | Low | Non-interactive rows, missing confirmations, stale brand comments | `apps/web/src/app/dashboard/transactions/page.tsx:686-695` |

## Findings

### F1. Web Overview renders the wrong month for every user west of UTC
- **Severity:** Critical
- **Status:** User-reported (as "1 in the FRI column", "WEDNESDAY · JUL 8") — root cause newly identified
- **Where:** `apps/web/src/app/dashboard/page.tsx:55-57,80-81`, `apps/web/src/components/lenses/Calendar.tsx:18-22,29,40,65-68`, `apps/web/src/components/lenses/MindMap.tsx:499`
- **What the user sees:** The Overview header reads "August 2026 overview" but the calendar grid below is July's grid: day 1 sits in the FRI column (verified: Aug 1 2026 is a Saturday, Jul 31 2026 is a Friday), and clicking day 8 opens a detail panel headed "WEDNESDAY · JUL 8" (verified: Jul 8 2026 is a Wednesday, Aug 8 2026 is a Saturday). Every August transaction is skipped by the day-bucketing loop, so the grid reads "No transactions on this day" everywhere while the KPI line above it says "$92 out". (The day *count* happens to match for August — both July and August have 31 days — so the tell is the column offset and the detail-panel date, not the cell count.)
- **Root cause:** The page is a React Server Component. It builds the month window as a *local-time* `Date` on the server (Vercel = UTC):

```ts
// apps/web/src/app/dashboard/page.tsx:55-56
const monthStart = new Date(anchorY, anchorM, 1, 0, 0, 0, 0)   // 2026-08-01T00:00:00Z on the server
const monthEnd   = new Date(anchorY, anchorM + 1, 0, 23, 59, 59, 999)
```

That `Date` is serialized across the RSC boundary as an absolute instant and rehydrated in the browser. `CalendarLens` is a `'use client'` component, so its getters run in the *viewer's* zone:

```ts
// apps/web/src/components/lenses/Calendar.tsx:18-22
const year     = props.monthStart.getFullYear()
const monthIdx = props.monthStart.getMonth()          // 6 (July) in US Central
const daysInMonth = new Date(year, monthIdx + 1, 0).getDate()
const firstDow = (props.monthStart.getDay() + 6) % 7  // Fri → 4
```

For a US Central viewer (UTC-5), `2026-08-01T00:00:00Z` is `Fri Jul 31 2026 19:00` local. `getMonth()` → 6 (July), `getDay()` → 5 (Friday) → `firstDow` = 4 = the FRI column. `selDate = new Date(year, monthIdx, sel)` (line 68) with `sel = 8` is therefore `Jul 8 2026`, a Wednesday — the exact string observed. Note the range filter itself is *not* the problem: `monthDebits` (`lenses/types.ts:62-71`) compares absolute instants, so it correctly admits the August rows. They are then thrown away one line later by the bucketing guard `if (d.getMonth() !== monthIdx || d.getFullYear() !== year) continue` (line 29), which mixes a viewer-local month index with server-local instants.
- **Blast radius:** Everything derived from `monthStart`/`monthEnd` in a client lens. `MindMap.tsx:499` prints `props.monthStart.getFullYear()` — silently correct today, wrong every January for western users. The server-only lenses (Cashflow, Flow, Matrix, Treemap) are internally consistent but still anchored to UTC calendar boundaries, so a Central-time user's 31 Jul 8pm purchase (01:00 UTC Aug 1) lands in the August bucket on web while mobile files it under July. `apps/web/src/app/dashboard/insights/page.tsx:26-31,196-221` has the same UTC-boundary problem for all six monthly totals and the forecast denominator.
- **Same defect elsewhere:** `apps/web/src/components/lenses/MindMap.tsx:499` (client component reading `monthStart.getFullYear()`). Server-side UTC-boundary math with no user timezone: `apps/web/src/app/dashboard/page.tsx:55-56`, `apps/web/src/app/dashboard/insights/page.tsx:26-31,196-221,247-248`, `apps/web/src/app/dashboard/export/page.tsx:38-42`. Client-side local-boundary math that disagrees with all of the above: `apps/web/src/app/dashboard/transactions/page.tsx:378-382`, `apps/web/src/app/dashboard/budgets/page.tsx:37-61`, `apps/mobile/src/hooks/useBudget.ts:76-100`, `apps/mobile/app/(tabs)/insights.tsx:178-185`, `apps/mobile/src/hooks/useRecurringRules.ts:8-38`. (grepped: `new Date(.*getFullYear\(\)`, `getMonth\(\)`, `getDay\(\)`, `monthStart`, `periodStart`)
- **Fix:** Architectural, not a patch. (1) Populate `profiles.timezone` from the device on first launch (`Intl.DateTimeFormat().resolvedOptions().timeZone`) — the column exists and is `'UTC'` for all six production users. (2) Add `packages/shared/src/utils/period.ts` exporting `monthWindow(tz, isoMonth): {startUtc: string, endUtc: string}` and `localParts(tz, isoInstant): {y,m,d,dow,hour}` built on `Intl.DateTimeFormat` with an explicit `timeZone`, and make **every** screen on both platforms consume it. (3) Never pass a `Date` across the RSC boundary — pass the ISO strings plus the pre-computed `{year, monthIndex, daysInMonth, firstDow}` the lens needs, so no client-side getter can reinterpret it. Delete the local date helpers in the twelve files listed above.
- **Regression test to add:** Render `CalendarLens` with `TZ=America/Chicago` for `?month=2026-08` and assert the first cell index is 5 (Saturday, Mon-first) and that a transaction at `2026-08-08T14:33:34Z` lands in day 8's bucket.

### F2. Marking a transaction recurring never creates a rule — foreign-key race against the offline queue
- **Severity:** Critical
- **Status:** User-reported (web Recurring says "No recurring rules yet") — root cause newly identified
- **Where:** `apps/mobile/src/hooks/useRecurringRules.ts:100-141`; callers `apps/mobile/app/(tabs)/record.tsx:205-217` and `:294-306`, `apps/mobile/app/transaction/edit.tsx:164-175`, `apps/mobile/app/(onboarding)/income.tsx:80-92`; schema `supabase/migrations/001_initial_schema.sql:161-163`
- **What the user sees:** Flipping the Recurring toggle on a transaction and saving looks completely successful — no error, the detail screen even shows a "Recurring" chip. But `/recurring` on mobile shows the empty state, the web Recurring page shows "No recurring rules yet", and the sidebar's recurring badge stays at 0. Production confirms this: `recurring_rules` has zero rows for every user, and both `is_recurring=true` rows (Xtream, Charles Schwab) have `recurring_rule_id = NULL`.
- **Root cause:** Transactions are written offline-first — `createTransaction` mints a client UUID, writes it to SQLite, and **queues** the Supabase upsert:

```ts
// apps/mobile/src/hooks/useTransactions.ts:121-130
    // Write to SQLite immediately (optimistic)
    await upsertTransaction(txn)
    await loadLocal()
    DataEvents.emitTransactions(userId)

    // Queue for Supabase sync
    await enqueue('create', txn.id, txn)
    syncManager.drainQueue()          // fire-and-forget, NOT awaited

    return { id: clientId, error: null }   // "success" the moment SQLite is written
```

The caller immediately does a **direct** Supabase insert carrying that id as a foreign key:

```ts
// apps/mobile/app/(tabs)/record.tsx:205-217
    if (!error && expense.isRecurring && txnId) {
      await createRule({
        ...
        template_txn_id: txnId,
      })
    }
```

but `recurring_rules.template_txn_id` has `FOREIGN KEY ... REFERENCES public.transactions(id)` (`001_initial_schema.sql:161-163`), and at that instant the transaction row is still only in SQLite plus the queue. The two network calls are issued concurrently (`drainQueue` is not awaited), so this is a *race* rather than a guaranteed failure — but it is a race the rule insert loses in practice: production has zero `recurring_rules` rows for any user, ever, and `drainQueue` additionally short-circuits entirely when `!this.isOnline || this.isSyncing` (`SyncManager.ts:78`). When it loses, the 23503 is swallowed:

```ts
// apps/mobile/src/hooks/useRecurringRules.ts:133-139
    if (error) {
      // Previously silent — the onboarding income step relied on this
      // returning a rule and had no visibility when it didn't. A warn
      // makes the failure loud enough to notice in dev without breaking
      // production.
      console.warn('[useRecurringRules] createRule failed:', error)
      return null
    }
```

The `console.warn` reaches nobody in a TestFlight build, and no call site checks the return value. Nothing sets `transactions.recurring_rule_id` afterwards either, so even a won race leaves the link half-formed.
- **Blast radius:** Every downstream consumer of recurring rules is permanently empty: mobile `/recurring` hero and list, `computeUpcomingRecurring` (so mobile Budgets' "spent" under-counts — and F17's divergence stays invisible), `runRecurringCatchUp` (no rules → no generated occurrences → the `recurring_generated` source value and migration 008's whole dedup apparatus are dead code), the `generate-recurring` Edge Function, the web Recurring page, the sidebar count badge, and Ask Murmur's `recurring_rules` context block (`apps/web/src/app/dashboard/ask/page.tsx:160,223-230,238`) — the "grounded reasoner" answers affordability questions with zero knowledge of the user's fixed bills. The onboarding income rule is affected too, so no user has ever had a monthly income rule.
- **Same defect elsewhere:** Same mixed-transport pattern (queued local write + immediate remote write referencing it) at `apps/mobile/app/(tabs)/record.tsx:294-306` (manual tab) and `apps/mobile/app/(onboarding)/income.tsx:80-92` (onboarding) — both identical to the voice path. `apps/mobile/app/transaction/edit.tsx:164-175` is the same shape but only races when the transaction being edited has itself never drained (created offline, or queue jammed per F8); for an already-synced row its `createRule` succeeds. Ignored `createRule` return values at all four call sites, plus `apps/mobile/app/(tabs)/index.tsx:142-155` (`acceptPattern` returns `rule != null` but `RecurringPatternBanner` is only reachable for Plus users, i.e. nobody in production — F6). The web path (`apps/web/src/app/dashboard/recurring/page.tsx:234-256`) does **not** have the race — it inserts against a transaction that is already on the server — but it also never checks `error`. (grepped: `createRule`, `template_txn_id`, `recurring_rules`)
- **Fix:** Architectural. Recurring rules must go through the same sync queue as transactions, not a second transport. Add `entity_type='recurring_rule'` support to `syncQueue`/`SyncManager` and a local `recurring_rules` SQLite table, so a rule is created locally with a client UUID and drained **after** its template transaction in queue order (`ORDER BY created_at ASC` already guarantees the ordering). Set `transactions.recurring_rule_id` in the same local transaction and enqueue the update. Until that lands, no `createRule` call site may treat `null` as success — surface an `Alert` and revert the `is_recurring` flag.
- **Regression test to add:** With the network stubbed offline, save a transaction with Recurring on, bring the network back, drain the queue, and assert both a `recurring_rules` row exists **and** `transactions.recurring_rule_id` points at it.

### F3. The date the user actually spoke is thrown away — every transaction is stamped "now"
- **Severity:** High *(downgraded from Critical during verification: the amount and currency stored are correct, and for the dominant "log it as it happens" path `now` is the right answer. It is wrong only when the user states a past date, scans an older receipt, or replays a notification — and there is then no way to correct it on mobile.)*
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/hooks/useTransactions.ts:77-79,106`; `apps/mobile/src/components/VoiceConfirmModal.tsx:35-44,113-133`; producers `packages/ai/src/parser.ts` / `scanParser.ts` (`transacted_at` field), `apps/mobile/src/hooks/useNotificationListener.ts:95`, `apps/mobile/app/(tabs)/record.tsx:123`
- **What the user sees:** "I spent fifty dollars at Starbucks *yesterday*" is saved with today's date. A scanned receipt dated last Tuesday is filed as today. There is no date field anywhere in the parse-confirm sheet, so the user cannot even see the mistake, let alone correct it — the only way to fix the date is the web Transactions form.
- **Root cause:** `createTransaction`'s parameter type does not include `transacted_at`, and the body hardcodes it:

```ts
// apps/mobile/src/hooks/useTransactions.ts:77-78
    fields: Pick<Transaction, 'amount' | 'direction' | 'currency_code' | 'merchant' | 'note' | 'category_id' | 'payment_method'> &
      Partial<Pick<Transaction, 'source' | 'raw_transcript' | 'ai_confidence' | 'is_recurring' | 'recurring_rule_id' | 'merchant_domain'>>,
...
// :106
      transacted_at: now,
```

`ParsedExpense.transacted_at` is populated by the AI parser, the scan parser, the notification listener (`useNotificationListener.ts:95` computes it from `payload.timestamp`), and the shortcut injector — and `ConfirmedExpense` (`VoiceConfirmModal.tsx:35-44`, 8 fields, none is `transacted_at`) drops the field before it ever reaches the save path.
- **Blast radius:** Corrupts the primary time dimension of a money app. Wrong day bucket on Today, wrong day cell in the Calendar lens and mobile HistoryHeatmap, wrong month in Insights/Budgets/Export, and a receipt batch scanned for tax season lands entirely in the current month. Also silently defeats migration 008's dedup key, which is `(user_id, recurring_rule_id, transacted_at::date)`. **Correction made during verification:** the FX snapshot is *not* currently wrong — `snapshotFx(now, ...)` at `useTransactions.ts:90` uses the same `now` that is stored as `transacted_at:106`, so rate-date and row-date agree today. It becomes wrong the moment the fix below lands, which is why the fix must move `snapshotFx` onto the resolved date in the same change.
- **Same defect elsewhere:** None found — the web form (`apps/web/src/app/dashboard/transactions/page.tsx:281`) correctly honours a `datetime-local` input, which makes the mobile omission an inconsistency as well as a bug. `apps/mobile/app/transaction/edit.tsx` has no date field either, so a mis-dated transaction cannot be corrected on the platform that created it. (grepped: `transacted_at`, `ConfirmedExpense`, `injectParsed`)
- **Fix:** Add `transacted_at?: string` to `createTransaction`'s field type and default it to `fields.transacted_at ?? now`; add it to `ConfirmedExpense` and render an editable date row in `VoiceConfirmModal` pre-filled from `parsedExpense.transacted_at`; add the same row to `transaction/edit.tsx` and thread it through `editTransaction`/`updateTransactionFields`. Move the `snapshotFx` call to use the resolved `transacted_at`, not `now`.
- **Regression test to add:** Feed `injectParsed` a `ParsedExpense` with `transacted_at` three days in the past, confirm the sheet, and assert the persisted row's `transacted_at` matches (and that `fx_rate_date` is that day, not today).

### F4. Every hero amount on mobile is printed with a hardcoded `$` and US grouping
- **Severity:** Critical
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/components/Money.tsx:15-16,44,51`; the eleven call sites that pass no `sign`: `apps/mobile/app/(tabs)/index.tsx:275`, `(tabs)/budgets.tsx:123,125,132`, `(tabs)/insights.tsx:365,414`, `app/recurring.tsx:180,233`, `src/components/ListeningView.tsx:190`, `src/components/HistoryHeatmap.tsx:162,247`; also `apps/mobile/app/(tabs)/index.tsx:318-328`
- **What the user sees:** A user who picks EUR, GBP, JPY, NGN, GHS, XAF, or CHF in Settings sees their currency respected on individual transaction rows and on the transaction detail screen, but **every big number** — "Spent today", the Budgets ring remaining/limit, the Insights month total and category rows, the Recurring monthly total and per-rule amounts, the live listening amount — still renders with a `$`. A French user also sees `1,250.00` instead of `1 250,00`.
- **Root cause:** The shared component defaults the glyph and hardcodes the grouping locale:

```ts
// apps/mobile/src/components/Money.tsx:44
  sign = '$',
// apps/mobile/src/components/Money.tsx:51
  const intFmt = parseInt(intPart, 10).toLocaleString('en-US')
```

Only `TransactionRow.tsx:112` and `transaction/[id].tsx:272` pass `sign={currencySymbolFor(...)}`; the other eleven call sites omit it and inherit `'$'`. There is no `locale` prop at all (`Props`, lines 4-21, has no such field), so `'en-US'` is unconditional. A second, narrower copy of the same glyph table exists locally:

```ts
// apps/mobile/app/(tabs)/index.tsx:322-327 — formatBudgetShort
  const glyph =
    currency === 'USD' || currency === 'CAD' || currency === 'AUD' ? '$' :
    currency === 'EUR' ? '€' :
    currency === 'GBP' ? '£' :
    currency === 'JPY' ? '¥' : currency + ' '
  return `${glyph}${Math.round(amount).toLocaleString('en-US')}`
```
— which falls back to `"NGN 500"`-style output for NGN/GHS/XAF/CHF that `currencySymbolFor` handles properly.
- **Blast radius:** Every mobile screen that shows a total. Combined with F5 this makes the currency feature actively dangerous rather than merely cosmetic: the number and the symbol can both be wrong at the same time.
- **Same defect elsewhere:** `apps/mobile/app/(tabs)/index.tsx:318-328` (duplicate symbol table + `'en-US'`), `apps/mobile/app/more/settings.tsx:142` (`` `${currency} ${budget.amount.toFixed(0)} / ${periodLabel}` `` renders "USD 500 / Monthly", not "$500"), `apps/mobile/app/more/settings.tsx:146-148` (`toLocaleString('en-US')` on income), `apps/mobile/app/(onboarding)/income.tsx:137` (literal `$`), `apps/mobile/app/transaction/[id].tsx:151` (`formatCurrency(snapshot.amount, snapshot.currency_code || currency)` — the third `locale` argument is omitted, so the undo snackbar is always English-formatted), `apps/mobile/app/(tabs)/index.tsx:56` (`weeklySpendBars` sums raw `txn.amount` across currencies for the MiniBars chart instead of `aggAmount`), `apps/web/src/app/dashboard/export/page.tsx:105` (`toLocaleTimeString('en', ...)`). The web `Money.tsx` is correct — it requires `currency` and uses `formatToParts`. (grepped: `'\$'`, `toLocaleString('en-US')`, `<Money`, `currencySymbolFor`)
- **Fix:** Make `currency` and `locale` **required** props on `apps/mobile/src/components/Money.tsx` (delete the `sign = '$'` default), derive the glyph internally via `currencySymbolFor`, and format the integer part with `new Intl.NumberFormat(locale)`. TypeScript will then fail the build at all eleven call sites that currently pass nothing. Delete `formatBudgetShort` and the `settings.tsx` string concatenations in favour of `formatCurrency`.
- **Regression test to add:** Snapshot the Today, Budgets, Insights and Recurring screens with `profile.currency_code='EUR'`, `locale='fr'`, and assert no rendered string contains `$` and that grouping uses non-breaking spaces.

### F5. Changing the profile currency silently relabels every historical amount
- **Severity:** Critical
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/more/settings.tsx:437-448`, `apps/web/src/app/dashboard/settings/page.tsx:246-254`, `apps/mobile/src/services/fxBackfill.ts:31-43`
- **What the user sees:** A user who starts in USD, logs six months of spending, then switches to EUR in Settings sees every historical figure keep its **numeric value** and change its **symbol**: `$4,200 spent` becomes `€4,200 spent`. Their net worth appears to jump ~8% with one tap. Nothing warns them, and there is no way back — switching to USD again relabels the same numbers a third time.
- **Root cause:** `amount_in_profile_currency` is a write-time snapshot (`useTransactions.ts:89-90`) taken against whatever the profile currency was *at save time*. Every aggregation reads it via `aggAmount` and every UI labels it with the *current* `profile.currency_code`. Changing the currency updates only the label:

```ts
// apps/mobile/app/more/settings.tsx:439-442
                onPress={async () => {
                  await updateProfile({ currency_code: c })
                  setCurrencyModal(false)
                }}
```

The backfill sweep cannot repair it because it only touches rows where the snapshot is `NULL`:

```ts
// apps/mobile/src/services/fxBackfill.ts:39
    .is('amount_in_profile_currency', null)
```

After a currency change, every row still has a non-null snapshot — in the *old* currency — so `runFxBackfill` is a no-op forever.
- **Blast radius:** Every total on every screen on every platform, plus `budgets.amount` (stored in whatever currency was active when the budget was set — see F16), `profiles.monthly_income` (a bare number with no currency column), the Ask Murmur context (`currency: profile?.currency_code ?? 'USD'` at `ask/page.tsx:234` labels old-currency numbers with the new code, so the model reasons on corrupted inputs), and every export format.
- **Same defect elsewhere:** Identical on web at `apps/web/src/app/dashboard/settings/page.tsx:246-254`. `profiles.monthly_income` has the same class of problem with no snapshot column at all. (grepped: `currency_code`, `amount_in_profile_currency`, `updateProfile`)
- **Fix:** Currency change must be a migration, not a label swap. On confirm, run a re-snapshot job: for every non-deleted transaction, `fetchFxRate(transacted_at, currency_code, newProfileCurrency)` and rewrite `amount_in_profile_currency` / `fx_rate_to_profile` / `fx_rate_date`; scale `budgets.amount` and `profiles.monthly_income` by today's rate (or force the user to re-enter them). Gate the whole thing behind an explicit "This will reconvert N transactions" confirmation, and block it while offline. Loosen `fxBackfill`'s predicate to `fx_rate_to_profile IS NULL OR profile_currency_at_snapshot <> current` (which needs a new column recording which currency the snapshot targets).
- **Regression test to add:** Seed two USD transactions, switch the profile to EUR, and assert `amount_in_profile_currency` changed and equals `amount × rate(transacted_at, USD→EUR)`.

### F6. Nobody can buy Plus — the purchase button is an empty function, and the web CTA is not a button at all
- **Severity:** Critical
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/more/paywall.tsx:108-116`, `apps/web/src/components/PaywallGate.tsx:30`, entry points `apps/mobile/app/more/settings.tsx:213-218,101-107`, `apps/mobile/app/more/ask.tsx:53-55,60-63,75-79`, `apps/web/src/app/dashboard/ask/page.tsx`, `apps/web/src/app/dashboard/export/page.tsx`; entitlement resolver `apps/mobile/src/hooks/usePlusStatus.ts:21-27`
- **What the user sees:** A free user taps "Upgrade" in Settings, reads a polished dark paywall with two plan cards, picks Yearly, taps the big white "Upgrade to Plus" button — and nothing happens. Not an error, not a spinner. On web, the "Upgrade to Plus" element in the paywall overlay is a `<div>` with no click handler at all. `usePlusStatus` resolves `isPlus = isPlusFromProfile(profile) || __DEV__`, and a TestFlight build has `__DEV__ === false`, so the owner's own test account is a free user: Ask Murmur, Export, and recurring detection are all reachable dead ends.
- **Root cause:**

```tsx
// apps/mobile/app/more/paywall.tsx:108-116
<Pressable
  style={...}
  onPress={() => {
    // Purchase flow isn't wired yet. Keep the button responsive so the
    // pressed state reads; actual subscription logic is post-Phase D.
  }}
>
  <Text style={styles.upgradeBtnText}>{t('paywall.cta', locale)}</Text>
</Pressable>
```

```tsx
// apps/web/src/components/PaywallGate.tsx:30
          <div style={styles.cta}>Upgrade to Plus</div>
```

There is no IAP/RevenueCat integration anywhere in the repo (grep for `revenuecat`, `expo-in-app-purchases`, `StoreKit`, `react-native-iap` across `apps/` and `packages/` returns nothing outside build artefacts), and `profiles.plus_status` has no writer — `isPlusFromProfile` (`packages/shared/src/plus.ts:23-27`) reads a column that only a manual SQL update can ever set.
- **Blast radius:** The entire monetisation model is non-functional in production. Three advertised features are unreachable for every real user. There is also no "Restore purchases" control, which is an automatic App Store review rejection for any app displaying subscription pricing (Guideline 3.1.1).
- **Same defect elsewhere:** Related dead controls in the same flow: `apps/mobile/app/more/ask.tsx:75-79` (`onMicPress` is a no-op for Plus users — `if (!isPlus) gotoPaywall()` with no else branch), `apps/web/src/app/dashboard/settings/page.tsx:447` ("Manage" billing is a `<span style={styles.linkBtn}>`), `apps/web/src/app/dashboard/recurring/page.tsx:337-341` ("Sort: Next charge" is a `<span>`, "Add manually" is `disabled title="Coming soon"`). (grepped: `onPress={() => {`, `onClick`, `disabled`, `Upgrade`)
- **Fix:** Either wire the purchase (RevenueCat SDK on mobile writing `profiles.plus_status` via a validated webhook; Stripe Checkout on web) **or**, if that is post-launch, remove the pricing UI entirely and replace the paywall with an honest "Plus is coming — these features are in preview" state that does not present a purchasable price. Shipping a priced button that does nothing is worse than shipping neither.
- **Regression test to add:** An assertion that every element rendering `t('paywall.cta')` or the string "Upgrade to Plus" has a non-empty handler, so a stubbed CTA cannot reach main.

### F7. There is no password-reset flow anywhere in the product
- **Severity:** Critical
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/(auth)/sign-in.tsx` (entire file), `apps/mobile/app/(auth)/sign-up.tsx` (entire file), `apps/web/src/app/login/page.tsx` (entire file), `apps/mobile/src/hooks/useAuth.ts:28-38`
- **What the user sees:** A user who created an email/password account and forgets the password has no "Forgot password?" link on the mobile sign-in screen, none in the "More options" email form, and none on the web login page. There is no recovery path in the product at all — their entire financial history is unreachable.
- **Root cause:** `supabase.auth.resetPasswordForEmail` is never called anywhere in the repo, and no route exists to handle the recovery redirect. `useAuth.ts` exports exactly three auth functions:

```ts
// apps/mobile/src/hooks/useAuth.ts:28-38
export async function signInWithEmail(...)
export async function signUpWithEmail(...)
export async function signOut()
```

`apps/web/src/app/auth/callback/route.ts` handles only the OAuth code exchange — and per F51 it is unreachable anyway.
- **Blast radius:** Total lockout for every email/password user. Also means the `delete-user` Edge Function is the only way such a user can ever act on their account again, and they cannot even reach it (it's behind the sign-in wall).
- **Same defect elsewhere:** None found — this is a whole-flow omission, present identically on both platforms. (grepped: `resetPasswordForEmail`, `forgot`, `recover`, `updateUser`)
- **Fix:** Add a "Forgot password?" link to `sign-in.tsx`'s email form and to `login/page.tsx`; call `supabase.auth.resetPasswordForEmail(email, { redirectTo })`; add `apps/web/src/app/auth/reset/page.tsx` to consume the recovery token and call `supabase.auth.updateUser({ password })`; register the equivalent deep link on mobile (`voiceexpense://reset` — note F19 must be fixed first or the deep link will not fire).
- **Regression test to add:** E2E — request a reset for a seeded email account, follow the emailed link, set a new password, and sign in with it.

### F8. Signing out clears nothing; one poisoned queue entry from the previous account blocks all future syncs
- **Severity:** Critical
- **Status:** Newly discovered (the owner actively tests with two Google accounts)
- **Where:** `apps/mobile/src/hooks/useAuth.ts:36-38`, `apps/mobile/src/services/sync/syncQueue.ts:31-38`, `apps/mobile/src/services/sync/SyncManager.ts:92-144`, `apps/mobile/src/services/sync/transactionStore.ts:176-182`, `apps/mobile/src/services/profileCurrency.ts:22-24`, `apps/mobile/src/hooks/useInsightsUnlock.ts:31`, `apps/mobile/src/hooks/useApiUrl.ts:3`
- **What the user sees:** Account A logs a transaction while offline, signs out, account B signs in. Account B's transactions never reach the server — no error, no badge, nothing. They appear on the phone and vanish on reinstall. On the desktop dashboard, account B's data is simply missing. Separately, account A's currency continues to be used to compute FX snapshots for account B's first writes.
- **Root cause:** Sign-out is one line:

```ts
// apps/mobile/src/hooks/useAuth.ts:36-38
export async function signOut() {
  return supabase.auth.signOut()
}
```

No local DB wipe (`wipeAllUserData` exists at `transactionStore.ts:176-182` but is only called from the Privacy delete-all flow), no queue purge, no SecureStore reset, no `setCurrentProfileCurrency` reset — despite `profileCurrency.ts:18-19` documenting that "Signing out resets to 'USD' via useAuth's session listener (handled in app/_layout.tsx)"; `_layout.tsx` does no such thing.

The queue is explicitly not user-scoped (`transactionStore.ts:179-180`: "Sync queue is not user-scoped at the schema level (only one user is ever signed in at a time)"; `syncQueue.ts:25-27` has no `user_id` column) and is drained in strict chronological order, stopping on the first failure:

```ts
// apps/mobile/src/services/sync/SyncManager.ts:137-143
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            await incrementRetry(entry.id, message)
            // Stop draining on error — will retry next time we go online
            hasMore = false
            break
          }
```

Account A's queued row carries `user_id = A`. Upserting it with account B's JWT violates the RLS `WITH CHECK (auth.uid() = user_id)` policy (`001_initial_schema.sql:150-153`). That is a permanent failure, so the entry sits at the head of the queue (`syncQueue.ts:34`, `ORDER BY created_at ASC`) and blocks everything behind it. After five retries `getPendingEntries`' `WHERE retry_count < 5` drops it — and `SyncManager.start()` calls `resetDeadLetterEntries()` on every launch (`SyncManager.ts:45`, `syncQueue.ts:67-72`), resurrecting it to block the queue again.
- **Blast radius:** Silent, unbounded data loss for the second account on any shared device. Account A's financial rows do **not** become visible to account B (all SQLite reads are `WHERE user_id = ?` and RLS covers the server), so this is not a data-leak — but it is worse operationally, because the failure is invisible. Also leaks across accounts: the SecureStore `insights_unlocked_seen` badge, the Day-2 dunning opt-out, and the developer API-URL override (F28).
- **Same defect elsewhere:** Web sign-out (`apps/web/src/components/Sidebar.tsx:66-70`, `apps/web/src/app/dashboard/settings/page.tsx:260-263`) does a `signOut()` + navigation with no cache invalidation, but the web holds no per-user local store beyond React state that unmounts, plus the un-scoped `localStorage` key `murmur_recurring_dismissed_v1` (`apps/web/src/app/dashboard/recurring/page.tsx:74`) which carries account A's dismissed pattern keys into account B's session. (grepped: `signOut`, `SecureStore`, `localStorage`, `wipeAllUserData`)
- **Fix:** Two changes, both structural. (1) Make sign-out a real teardown: a `resetLocalState(userId)` that deletes the user's SQLite rows, deletes the whole `sync_queue`, resets `profileCurrency` to `'USD'`, and clears the per-user SecureStore/localStorage keys; call it from a single `onAuthStateChange('SIGNED_OUT')` handler in `_layout.tsx`. (2) Make the queue user-scoped: add a `user_id` column to `sync_queue`, filter `getPendingEntries` by the signed-in user, and change `drainQueue` to skip-and-continue past a permanently-failing entry instead of `break`ing the whole drain. Namespace `murmur_recurring_dismissed_v1` by user id.
- **Regression test to add:** Queue a write as user A offline, sign out, sign in as user B, write a transaction, go online, drain — assert B's row reaches the server and A's entry does not block it.

### F9. Users who signed up with Apple cannot sign in to web or desktop at all
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/login/page.tsx:25-39,89-102` vs `apps/mobile/app/(auth)/sign-in.tsx`
- **What the user sees:** The iOS sign-in screen leads with Sign in with Apple (correctly — Guideline 4.8 requires it). The web login page offers only Google and email/password. An Apple-created account has an `@privaterelay.appleid.com` email and no password, so neither web option works. That user can never open the desktop app — which is the headline Plus benefit ("Desktop app with trends, forecasts & budgets", `paywall.feature_desktop`, `en.json:421`).
- **Root cause:** `login/page.tsx` implements exactly one OAuth provider:

```ts
// apps/web/src/app/login/page.tsx:28-33
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
```
There is no Apple branch and no `signInWithApple` equivalent on web.
- **Blast radius:** Sells a desktop companion that a whole cohort of paying users cannot log into. Also breaks the delete-all and export-all recovery paths on web for those users. Compounded by F51: the one OAuth provider the web page *does* offer cannot complete its callback either, so email/password is currently the only working web sign-in of any kind.
- **Same defect elsewhere:** None found — the reverse asymmetry does not exist (mobile offers Google and email as well as Apple). (grepped: `signInWithOAuth`, `provider:`, `AppleAuthentication`)
- **Fix:** Add `provider: 'apple'` to `login/page.tsx` with the same `redirectTo`, and configure the Apple Services ID / return URL in the Supabase dashboard. Mirror the button ordering rule from mobile (Apple first on macOS/iOS user agents).
- **Regression test to add:** E2E: complete Apple sign-up on the mobile simulator, then sign in to the web dashboard with the same Apple ID and assert the transaction list loads.

### F10. The Insights forecast extrapolates from as little as one day of data with no guard
- **Severity:** High
- **Status:** User-reported ("$1,519.00 projected for August" from 3 transactions) — mechanism confirmed
- **Where:** `apps/web/src/app/dashboard/insights/page.tsx:221-241,376-380`
- **What the user sees:** On 8 August with three transactions totalling $392, the largest number on the page reads **$1,519.00 projected for August** in 34px serif type, presented with the same visual authority as a real balance.
- **Root cause:** Straight-line month-to-date scaling with no minimum:

```ts
// apps/web/src/app/dashboard/insights/page.tsx:221-224
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()   // 31
  const dayOfMonth = now.getDate()                                           // 8
  const currentTotal = monthlyTotals[monthlyTotals.length - 1].total         // 392
  const projectedCurrent = dayOfMonth > 0 ? (currentTotal / dayOfMonth) * dim : currentTotal
```
392 / 8 × 31 = 1519.0 exactly. On day 1 the projection is 31× the first transaction. There is no confidence band, no "needs N days" gate, and no caveat in the copy — it renders unconditionally at `:377` in 34px display type next to "projected for August" (`:379`).
- **Blast radius:** The projected value is also written into the chart's history array (`history[history.length - 1] = projectedCurrent`, line 236) so the "Actual" sage line ends on a forecast point styled as actual data, and it seeds the three future forecast points when `avg === 0` (line 240). The `↑ X% vs 6-mo avg` badge (line 392) inherits the same noise.
- **Same defect elsewhere:** `apps/mobile/app/(tabs)/insights.tsx:291-296` runs the identical formula — but correctly gates it: `showForecast = isCurrentMonth && usualMonthly > 0 && monthSpent > 0` (`:296`), where `usualMonthly` (`:280-290`) requires at least one of the three prior months to be non-zero. Mobile is right; web is wrong. (grepped: `projected`, `dayOfMonth`, `daysInSelectedMonth`)
- **Fix:** Port mobile's gate to web and tighten both: require at least 7 elapsed days *and* one complete prior month before rendering a projection; otherwise show month-to-date actual with "Forecast available after N more days". Extract the projection into `packages/shared/src/utils/forecast.ts` so the two platforms cannot diverge again.
- **Regression test to add:** With 3 transactions on day 8 of the month, assert the Insights page renders no "projected for" figure.

### F11. "Heaviest day — avg $X" divides a 90-day sum by a magic 12
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/insights/page.tsx:265-288`
- **What the user sees:** The Patterns card states "Saturday is your heaviest day — avg $33" as a factual per-Saturday average. For a user with eight days of history it is a meaningless number roughly 11× too small; for a user with two years of history it is roughly 8× too large.
- **Root cause:**

```ts
// apps/web/src/app/dashboard/insights/page.tsx:274
  const weekdayAvg = weekdaySums.map((sum, i) => (weekdayCounts[i] > 0 ? sum / 12 : 0))
```
`12` is presumably "weeks in 90 days" (≈12.86), but `weekdaySums` accumulates only transactions that exist — a user with 8 days of data has at most 2 Saturdays, so the true average divisor is 1 or 2, not 12. `weekdayCounts` is computed at `:272` and then used only as a non-zero test, never as the divisor. The fabricated number is formatted as currency and pushed into the Patterns copy at `:284-288`.
- **Blast radius:** The claim is rendered as body copy next to real figures, so it reads as a verified insight. Ordering is unaffected (every bucket is divided by the same constant), so the weekday *named* is correct — but the *amount* shown is fabricated.
- **Same defect elsewhere:** The trend pattern on the same page (`insights/page.tsx:304-316`) says "than the prior **6-month** average" while `prior` is `completeMonthlyTotals.slice(0, -1)` — at most **five** months, and zero-months are filtered out at line 217, so the denominator is frequently 1. The page subtitle (line 350) says "Based on N transactions across the last 6 months" while `txns` is the user's *entire* history with no date filter (`getTransactions` at `lib/data.ts:8-23` accepts only an optional `limit`, no range). (grepped: `/ 12`, `weekdayAvg`, `completeMonthlyTotals`, `last 6 months`)
- **Fix:** Count the actual number of that weekday in the window: `const occurrences = countWeekdaysBetween(ninetyAgo, now, i)` and divide by that. Fix the two copy claims to match what is computed, or compute what the copy claims.
- **Regression test to add:** Seed two Saturdays at $50 each inside the 90-day window and assert the pattern string reads "avg $50", not "avg $8".

### F12. The spending heatmap is shifted by the UTC offset and silently drops most of the evening
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/insights/page.tsx:321-338`
- **What the user sees:** The "Heatmap · weekday × hour" card places a US Central user's 9:33am coffee in the 14:00 bucket, and shows nothing at all for any purchase made after 5pm local — the card looks like the user never spends in the evening.
- **Root cause:** The page is a server component; `d.getHours()` therefore returns the *server's* hour (UTC on Vercel):

```ts
// apps/web/src/app/dashboard/insights/page.tsx:322,327-337
  const hourBuckets = [8, 10, 12, 14, 16, 18, 20]
    ...
    const d = new Date(t.transacted_at)
    const dayIdx = (d.getDay() + 6) % 7 // Mon=0
    const hour = d.getHours()                      // ← server hour, UTC on Vercel
    let bucket = -1
    for (let i = 0; i < hourBuckets.length; i++) {
      if (hour >= hourBuckets[i] && hour < hourBuckets[i] + 2) {
        bucket = i
        break
      }
    }
    if (bucket >= 0) matrix[dayIdx][bucket] += aggAmount(t)   // else: silently discarded
```
`hourBuckets` covers 08:00–21:59 only. For UTC-5, local 17:00 → 22:00 UTC → no bucket → dropped. `dayIdx` is likewise the UTC weekday, so a late-evening Friday purchase is filed as Saturday. (The page is a plain `export default async function` server component with no `'use client'`, so these getters run on the Vercel runtime, which sets `TZ=UTC`.)
- **Blast radius:** The heatmap is the only "when do I spend" surface on web. Nothing labels the discarded rows, so a user cannot tell that a large share of their transactions were excluded rather than being genuinely zero.
- **Same defect elsewhere:** The same UTC-server weekday is used for the "heaviest day" pattern (`insights/page.tsx:270`) and for the "last 6 calendar months" windows (`:26-31,199-215`). The mobile equivalent (`apps/mobile/src/components/HistoryHeatmap.tsx`) runs on-device so it uses the true local zone — another mobile/web disagreement on the same question. (grepped: `getHours`, `getDay()`, `hourBuckets`)
- **Fix:** Compute weekday and hour in the user's timezone via the shared `localParts(tz, iso)` helper from F1's fix, and either widen the buckets to cover all 24 hours or add explicit "before 8am" / "after 10pm" columns so nothing is silently discarded.
- **Regression test to add:** With `profiles.timezone='America/Chicago'`, a transaction at `2026-08-08T02:00:00Z` must land in Friday 21:00, not Saturday 02:00 (and must not be dropped).

### F13. Investments and transfers are counted as spending
- **Severity:** High
- **Status:** User-reported ("Savings & Investing is 77% of your spend") — confirmed
- **Where:** `apps/web/src/app/dashboard/insights/page.tsx:203-208,290-296`, `apps/web/src/components/lenses/types.ts:62-71,85-95`, `apps/mobile/src/hooks/useBudget.ts:103-110`, `packages/shared/src/types/transaction.ts` (`TransactionDirection`)
- **What the user sees:** A $300 monthly S&P 500 contribution — money the user still owns — is reported as spending. "Savings & Investing is 77% of your spend in the last 90 days", it inflates the month total, it inflates the forecast (F10), and it eats the budget. The Charles Schwab row in production is exactly this case.
- **Root cause:** The data model has only two directions, `'debit' | 'credit'`, and every aggregation treats `direction === 'debit'` as spend with no exclusion list:

```ts
// apps/web/src/app/dashboard/insights/page.tsx:291-296
  for (const t of txns) {
    if (t.direction !== 'debit') continue
    if (new Date(t.transacted_at) < ninetyAgo) continue
    const name = t.category_id ? catMap[t.category_id]?.name ?? 'Other' : 'Uncategorized'
    catTotals[name] = (catTotals[name] ?? 0) + aggAmount(t)
  }
```
There is no `is_transfer` column, no `category.kind`, and no way for the user to mark a category as non-spend. `supabase/migrations/004_default_categories.sql:42` seeds `('Savings & Investing', '#00897B', '💰', 18)` into `default_categories`, and `apps/mobile/src/services/seedCategories.ts:3-31` copies every default into `categories` for each new user — so the app creates the problem for every new user.
- **Blast radius:** Every spend figure on every screen: Today's "Spent today", the Budgets ring (both platforms), all six Overview lenses, mobile and web Insights, and the Ask Murmur transaction payload — so the "grounded reasoner" will tell a user they overspent when they actually saved.
- **Same defect elsewhere:** `apps/web/src/components/lenses/types.ts:62-71` (`monthDebits`) and `:85-95` (`groupByCategory`), `apps/web/src/app/dashboard/page.tsx:86-95` (KPI line), `apps/web/src/app/dashboard/budgets/page.tsx:218-223,235-242`, `apps/mobile/src/hooks/useBudget.ts:103-110`, `apps/mobile/app/(tabs)/index.tsx:50-57,168-173`, `apps/mobile/app/(tabs)/insights.tsx:128-134`, `apps/mobile/src/components/HistoryHeatmap.tsx`, `apps/web/src/app/dashboard/export/page.tsx:77-82`. (grepped: `direction === 'debit'`, `direction !== 'debit'`)
- **Fix:** Architectural — add a third concept. Either a `transactions.is_transfer boolean` or, better, `categories.kind: 'spend' | 'income' | 'transfer'` (savings, investments, debt principal, internal moves). Add a single `isSpend(txn, categoryKind)` predicate in `packages/shared` and route every one of the aggregation sites above through it. Default "Savings & Investing" to `kind='transfer'` in `default_categories`, and surface the classification in the category editor so users can correct it.
- **Regression test to add:** A $300 transaction in a `kind='transfer'` category must not appear in the Insights category breakdown, the budget spend, or the forecast, but must still appear in the transaction list.

### F14. The Budgets ring shows spending as if it were budget usage when no budget exists
- **Severity:** Medium *(downgraded from High during verification: the figure rendered is the user's real month-to-date spend, correctly computed and correctly formatted. Nothing wrong is stored or calculated — it is placed under a caption that makes it read as budget usage. That is "confusing, not wrong" per the rubric.)*
- **Status:** User-reported ("$92 inside a ring labelled No overall budget") — confirmed
- **Where:** `apps/web/src/app/dashboard/budgets/page.tsx:386-438`
- **What the user sees:** With zero budgets configured, the Overall ring shows the caption "No overall budget" and, directly beneath it in 26px display type, **$92** — the user's month-to-date spend. It reads as "you have used $92 of your budget". The progress arc is not rendered at all (it is gated on `overall` at line 388), which makes the $92 look like a remaining balance.
- **Root cause:** The big number is rendered unconditionally while every other element in the ring is gated on `overall`:

```tsx
// apps/web/src/app/dashboard/budgets/page.tsx:401-419
              <text x="110" y="100" textAnchor="middle" fontSize="12" fill={colors.ink3} fontWeight="600">
                {overall ? `${Math.round(overallPct * 100)}% used` : 'No overall budget'}
              </text>
              <text x="110" y="128" ... fontSize="26" ...>
                {fmtShort(overallSpent)}          {/* ← no `overall &&` guard */}
              </text>
              {overall && (
                <text x="110" y="148" ...>of {fmtShort(overall.amount)}</text>
              )}
```
`overallSpent` (`:218-223`) is computed from `periodStart(overall?.period ?? 'monthly')` — i.e. it falls back to a calendar month even when there is no budget at all.
- **Blast radius:** First-run experience for every user, since nobody has a budget on day one. The "Set a monthly budget to start tracking." subtitle above (`:312`) and the "Tap 'New budget' to set an overall monthly cap." caption below (`:436`) both contradict the number between them.
- **Same defect elsewhere:** None found — mobile's Budgets tab correctly branches on `limit > 0` and renders a proper empty hero (`apps/mobile/app/(tabs)/budgets.tsx:116-163`). This is a web-only regression against the mobile behaviour. (grepped: `overallSpent`, `No overall budget`)
- **Fix:** Wrap the `<text y="128">` amount in `{overall && ...}` and render a neutral placeholder (a dashed ring plus "Set a cap to see your progress") when `overall` is undefined. Skip computing `overallSpent` entirely in that branch.
- **Regression test to add:** Render Budgets with zero budget rows and assert the SVG contains no currency-formatted figure.

### F15. Saving an overall budget on web never deactivates the previous one
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/budgets/page.tsx:161-197`
- **What the user sees:** Changing the overall monthly budget from $2,000 to $1,500 on web appears to work — the ring updates. But the $2,000 budget is still `is_active = true` in the database. Which one wins depends on which screen you open: web picks the newest by `created_at`, mobile picks the newest by `starts_at`, and the Insights budget line picks whichever row Postgres returns first.
- **Root cause:** PostgREST cannot express `IS NULL` via `.eq()`. For an overall (category-less) budget, `categoryId` is `''`, so:

```ts
// apps/web/src/app/dashboard/budgets/page.tsx:173-179
    await supabase
      .from('budgets')
      .update({ is_active: false })
      .eq('user_id', user.id)
      .eq('is_active', true)
      .eq('period', period)
      .eq('category_id', categoryId || null)   // → ?category_id=eq.null
```
`supabase-js` does not special-case `null` in `.eq()` — it appends the literal `eq.null`, which PostgREST then casts to the column type (`'null'::uuid`). That either raises `22P02` or matches nothing; in neither case does it deactivate the previous overall budget. The result is discarded entirely (no `error` destructuring, no check — contrast the insert two lines below, which *does* destructure `{ error: err }` at `:181`), so the failure is invisible. It also filters on `period`, so switching from monthly to weekly would leave the monthly one active even if the null handling were correct.
- **Blast radius:** Multiple active overall budgets accumulate, one per save. Downstream, `apps/mobile/src/hooks/useBudget.ts:13-21` (`.is('category_id', null).order('starts_at', {ascending:false}).limit(1)`) and `apps/web/src/app/dashboard/budgets/page.tsx:206-211` (prefers a monthly one, then falls back) and `apps/web/src/app/dashboard/insights/page.tsx:243` (`budgets.find(b => b.category_id === null)` over a `created_at DESC` list) can each pick a different row, so the same user can see a different budget cap on mobile, on the web Budgets page, and on the web Insights chart.
- **Same defect elsewhere:** Mobile gets this right — `useBudget.ts:40-45` uses `.is('category_id', null)`. Unchecked mutation results are pervasive though: `apps/web/src/app/dashboard/budgets/page.tsx:199-202` (`handleRemove`), `apps/web/src/app/dashboard/recurring/page.tsx:238-254` (`acceptCandidate`) and `:265-268` (`toggleActive`), `apps/web/src/app/dashboard/settings/page.tsx:246-254`, `packages/shared/src/askStorage.ts:202`, `apps/mobile/src/hooks/useRecurringRules.ts:143-173` (`toggleRule`, `deleteRule`, `updateRule` all discard the result). (grepped: `\.eq\(.*null\)`, `\.is\(`, `await supabase.from`)
- **Fix:** Replace with `.is('category_id', null)` for the overall case and `.eq('category_id', id)` otherwise; drop the `period` filter (one active overall budget, regardless of period). Destructure and surface `error` on this and every other mutation listed above. Add a partial unique index `UNIQUE (user_id) WHERE category_id IS NULL AND is_active` so the invariant is enforced by the database rather than by three client implementations.
- **Regression test to add:** Save an overall budget twice with different amounts and assert exactly one row has `is_active = true`.

### F16. Web budgets are always stored as USD but displayed in the profile currency
- **Severity:** Medium *(downgraded from High during verification: no reader on either platform honours `budgets.currency_code`, so today the user sees back exactly the number they typed, in their own currency symbol. The defect is a latent schema-level lie — mobile-written and web-written rows for the same user carry different `currency_code` — with no present user-visible wrongness.)*
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/budgets/page.tsx:181-187,263-264`, schema `supabase/migrations/001_initial_schema.sql:174`
- **What the user sees:** Nothing today. A EUR user who sets a €1,500 monthly cap on web gets a row written with `currency_code` defaulted to `'USD'`; every screen formats `budget.amount` with `profile.currency_code`, so it still renders as "€1,500". The stored unit and the displayed unit disagree, and nothing converts.
- **Root cause:** The insert omits the column entirely:

```ts
// apps/web/src/app/dashboard/budgets/page.tsx:181-187
    const { error: err } = await supabase.from('budgets').insert({
      user_id: user.id,
      amount: parsed,
      period,
      category_id: categoryId || null,
      is_active: true,
    })
```
and `budgets.currency_code text NOT NULL DEFAULT 'USD'` (`001_initial_schema.sql:174`) fills the gap. Every reader then ignores the column: `fmtShort` at `:263-264` uses `profile.currency_code`; so does mobile (`apps/mobile/app/(tabs)/budgets.tsx:68`), and `usePeriodSpend` compares that amount against `aggAmount()` values which are in the *profile* currency.
- **Blast radius:** Becomes real the moment any reader starts honouring `currency_code`, or as soon as a currency change (F5) makes "profile currency" mean something different from what it meant at write time. Mobile writes the column correctly (`useBudget.ts:47-54`), so mobile-set and web-set budgets for the same user already disagree at the schema level.
- **Same defect elsewhere:** `profiles.monthly_income` has no currency column at all (`supabase/migrations/006_onboarding_fields.sql`), and both `apps/mobile/src/components/IncomeEditorModal.tsx` and `apps/web/src/app/dashboard/settings/page.tsx:378-392` write a bare number labelled with the current profile currency (the web label is literally `Monthly income ({currency})` at `:379`). (grepped: `budgets').insert`, `currency_code`, `monthly_income`)
- **Fix:** Set `currency_code: profile.currency_code` in the web insert, and make every budget reader format with `budget.currency_code` (converting to the profile currency via the FX helper when they differ). Add `profiles.monthly_income_currency` and thread it through the income editors and Ask Murmur's request payload.
- **Regression test to add:** With `profile.currency_code='EUR'`, create a budget on web and assert the persisted row has `currency_code='EUR'`.

### F17. The same budget shows a different "spent" figure on mobile and on web
- **Severity:** Medium *(downgraded from High during verification: the divergence is fully masked today. `computeUpcomingRecurring` iterates `rules`, and F2 means `recurring_rules` is empty for every user in production, so `upcomingRecurring` is always 0 and both platforms currently agree. This returns to High the moment F2 is fixed.)*
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/(tabs)/budgets.tsx:75-84` vs `apps/web/src/app/dashboard/budgets/page.tsx:218-223`; also `apps/mobile/app/(tabs)/index.tsx:174-178`
- **What the user sees:** Nothing today (see severity note). Once rules exist: with a $2,000 monthly budget, $900 spent, and $400 of upcoming recurring charges, the phone says "$700 left" and the desktop says "$1,100 remaining". Both are labelled identically. The user has no way to know which is authoritative.
- **Root cause:** Mobile deliberately folds forward-looking recurring charges into the spend figure:

```ts
// apps/mobile/app/(tabs)/budgets.tsx:80
const spent = periodSpend + upcomingRecurring
```
Web computes only realised debits:
```ts
// apps/web/src/app/dashboard/budgets/page.tsx:218-223
  const overallSpent = useMemo(() => {
    const start = periodStart(overall?.period ?? 'monthly')
    return transactions
      .filter((t) => t.direction === 'debit' && new Date(t.transacted_at) >= start)
      .reduce((s, t) => s + aggAmount(t), 0)
  }, [transactions, overall])
```
Two different definitions of the same word, and neither label says which. (Today this is masked by F2 — `upcomingRecurring` is always 0 because no rules exist — so fixing F2 will *cause* this divergence to appear.)
- **Blast radius:** The mobile Today screen's "left this month" line uses the mobile definition (`index.tsx:178`), and the Budgets ring's "On pace / Tight / Over" verdict flips on it. Fixing F2 without fixing this will make the two platforms visibly contradict each other on the owner's primary metric.
- **Same defect elsewhere:** Period boundary definitions also diverge: `periodStart('biweekly')` on both platforms is "now minus 13 days" (`budgets/page.tsx:47-52`, `useBudget.ts:94-97`), a rolling window rather than a real biweekly period anchored to `budgets.starts_at`; mobile's `usePeriodSpend` collapses quarterly and yearly into the monthly branch (`useBudget.ts:98-101`) while web handles them properly (`budgets/page.tsx:53-59`); and `daysLeftInPeriod` on mobile returns days left *in the month* for quarterly and yearly budgets (`apps/mobile/app/(tabs)/budgets.tsx:43-45`). A third definition again exists in `apps/mobile/src/hooks/useRecurringRules.ts:8-37` (`getPeriodBounds`), which *does* implement real quarterly/yearly windows — three implementations, three answers. (grepped: `periodSpend`, `upcomingRecurring`, `periodStart`, `getPeriodBounds`)
- **Fix:** Move the whole budget calculation into `packages/shared/src/utils/budget.ts` — `budgetWindow(budget, tz)` and `budgetStatus(budget, txns, rules)` returning `{spent, committed, remaining, pct}` — and have both platforms render the same three numbers with distinct labels ("$900 spent · $400 committed · $700 left"). Anchor biweekly on `budgets.starts_at`.
- **Regression test to add:** Given identical fixtures, assert mobile's and web's budget-remaining values are equal.

### F18. Recurring totals add up different currencies
- **Severity:** Medium *(downgraded from High during verification: masked today by F2 — `recurring_rules` is empty for every production user, so both platforms show the empty state and no wrong total is ever rendered. Returns to High the moment rules exist.)*
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/recurring.tsx:95-99,180,233`, `apps/web/src/app/dashboard/recurring/page.tsx:96-117,273-274,303,328-329`
- **What the user sees:** Nothing today (empty state everywhere). Once rules exist: a user with a €12/mo European subscription and a $9.99/mo US one sees "$21.99 paid monthly" — a number that is neither correct in dollars nor in euros. Individual rows are also mislabelled on mobile: `<Money value={rule.amount} />` at `recurring.tsx:233` inherits the default `$` (F4) regardless of `rule.currency_code`. Web gets the per-row case right (`currency={r.currency_code || currency}` at `recurring/page.tsx:476`).
- **Root cause:** Rules carry their own `currency_code` but every aggregation sums the raw `amount`:

```ts
// apps/mobile/app/recurring.tsx:95-99
  const monthlyTotal = useMemo(() => {
    return rules
      .filter((r) => r.is_active)
      .reduce((sum, r) => sum + r.amount * TO_MONTHLY[r.frequency], 0)
  }, [rules])
```
```ts
// apps/web/src/app/dashboard/recurring/page.tsx:273-274
  const monthlyTotal = active.reduce((sum, r) => sum + monthlyEquivalent(r), 0)
  const annualTotal = active.reduce((sum, r) => sum + annualEquivalent(r), 0)
```
`recurring_rules` has no FX snapshot column at all, so `aggAmount` — the codebase's own documented answer to exactly this problem (`packages/shared/src/utils/fx.ts:36-40`) — cannot be applied.
- **Blast radius:** Mobile's monthly hero (`:180`) and yearly projection (`:186`), web's "Monthly"/"Annual cost" stats, the "in charges hit before …" footer (`recurring/page.tsx:303,618`), and the "Potential savings" dark card (`:328-329`) which advertises a cancellation saving in the wrong currency. Once F2 is fixed and rules exist, this becomes immediately visible.
- **Same defect elsewhere:** The same currency-blind sum appears in `apps/web/src/components/lenses/MindMap.tsx:98,109` (`recurring.reduce((s, r) => s + r.amount, 0)` on the `LensRecurring` shape, which has no currency field at all). Correct handling — reading `amount_in_profile_currency` — exists everywhere transactions are summed, which is what makes the rules path an obvious omission. (grepped: `r.amount`, `monthlyEquivalent`, `TO_MONTHLY`, `aggAmount`)
- **Fix:** Add `amount_in_profile_currency` / `fx_rate_to_profile` / `fx_rate_date` to `recurring_rules` (a migration 013 mirroring 011), snapshot on rule create/update, and route every rule aggregation through `aggAmount`. Pass `rule.currency_code` to every per-row `Money`.
- **Regression test to add:** Two active rules, one EUR one USD; assert the monthly total equals the sum of the converted values, not the raw ones.

### F19. The iOS Shortcuts deep link can never fire, and its install link is a literal placeholder
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/hooks/useShortcutHandler.ts:9-27`, `apps/mobile/app/more/settings.tsx:196,277-283`, `apps/mobile/app/(tabs)/record.tsx:110-131`
- **What the user sees:** Settings → Automations → "Apple Pay shortcut · Set up" opens `https://www.icloud.com/shortcuts/placeholder` — an iCloud 404. Even if a user hand-built the shortcut, invoking `voiceexpense://shortcut?amount=4.50&merchant=Starbucks` opens the app on the Today tab and drops the payload.
- **Root cause:** Two independent breakages. The install URL is a placeholder string:

```ts
// apps/mobile/app/more/settings.tsx:196
const SHORTCUT_INSTALL_URL = 'https://www.icloud.com/shortcuts/placeholder'
```

And the parser matches the wrong field of the parsed URL:

```ts
// apps/mobile/src/hooks/useShortcutHandler.ts:12-13
    const { path, queryParams } = Linking.parse(url)
    if (path !== 'shortcut') return null
```
`expo-linking`'s `parse` is built on `new URL(url)` (`node_modules/expo-linking/build/createURL.js:129-135`: `path = parsed.pathname || null; hostname = parsed.hostname || null`). For `voiceexpense://shortcut?amount=1` the `//` introduces an authority, so `parsed.hostname === 'shortcut'` and `parsed.pathname === ''` → `path = null`. (If the runtime's `URL` throws instead, the `catch` at `:137-139` sets `path = url` — the whole string — which also fails the `=== 'shortcut'` test.) Either way the guard rejects every well-formed shortcut URL. Downstream, `record.tsx:110-131` never receives the params, so `transactionSource` is never set to `'shortcut'` — which is why `source='shortcut'` has zero rows in production despite the CHECK constraint allowing it.
- **Blast radius:** The Apple Pay capture story — and the "Apple Pay" filter chip on the web Transactions page (`transactions/page.tsx:59,69`) — is entirely non-functional. The web filter and the "N Apple Pay" subtitle count (`:417-430`) will always read 0.
- **Same defect elsewhere:** None found for the parse bug (this is the only `Linking.parse` call). Placeholder URLs elsewhere: `packages/shared/src/brand.ts:17` (see F33). (grepped: `Linking.parse`, `placeholder`, `icloud.com`)
- **Fix:** Match on `hostname ?? path` (`const route = hostname ?? path`), and add a unit test with the exact URL an iOS Shortcut produces. Publish the real shortcut to iCloud and replace `SHORTCUT_INSTALL_URL`; until it exists, hide the Automations row rather than linking to a 404.
- **Regression test to add:** `parseShortcutUrl('voiceexpense://shortcut?amount=4.50&merchant=Starbucks')` must return the four `shortcut_*` params.

### F20. The Android notification listener is fully built and wired to a callback that does nothing
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/more/settings.tsx:174-176,285-291`, `apps/mobile/src/hooks/useNotificationListener.ts:75-105`, `apps/mobile/modules/notification-listener/src/index.ts`
- **What the user sees:** An Android user opens Settings → Automations → "Payment notifications", is sent to the system Notification Access screen, grants a highly sensitive permission that lets the app read every notification on the device — and no transaction is ever created. There is no list, no badge, no confirmation sheet. The feature appears broken, and the user has handed over a dangerous permission for nothing.
- **Root cause:** The only consumer of the hook passes an empty function:

```ts
// apps/mobile/app/more/settings.tsx:174-176
  const { permissionGranted, recheckPermission, requestPermission } = useNotificationListener(
    () => {},
  )
```
The hook itself is complete — it builds a full `ParsedExpense` from the native payload (`useNotificationListener.ts:87-101`) and hands it to `onPayment` at `:103`, which discards it. `apps/mobile/app/more/settings.tsx:174` is the only call site in the repo; nothing ever produces a transaction with `source='notification_listener'`, despite the value being in the CHECK constraint.
- **Blast radius:** A privacy-sensitive permission requested under false pretences — a Play Store policy problem as well as a product one. The web Transactions page classifies `notification_listener` under the "Apple Pay" chip (`transactions/page.tsx:69`), so even the reporting for this source is wrong before it produces anything.
- **Same defect elsewhere:** The same "designed surface, no-op handler" pattern at `apps/mobile/app/more/ask.tsx:75-79` (mic for Plus users), `apps/mobile/app/transaction/[id].tsx:331-348` (a play-styled glyph that plays nothing), `apps/mobile/app/more/paywall.tsx:108-116` (F6), `apps/web/src/app/dashboard/recurring/page.tsx:337-342`. (grepped: `useNotificationListener`, `() => {}`, `no-op`)
- **Fix:** Move `useNotificationListener` to `app/_layout.tsx` and give it a real handler that routes to the confirm sheet — `router.push('/(tabs)/record')` after `voice.injectParsed(parsed)` with `transactionSource='notification_listener'` — or, if that is not shipping now, remove the Settings row and the permission request entirely. Fix the web chip mapping to a distinct "Notification" label.
- **Regression test to add:** Emit a synthetic `onPaymentNotification` payload and assert a confirm sheet opens pre-filled with the amount and merchant.

### F21. Web Settings reports "Saved." whether or not the save succeeded
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/settings/page.tsx:226-258`; success chip rendered at `:394`
- **What the user sees:** Changing display name, currency, language, or monthly income and clicking "Save changes" always shows a green "Saved." — including when the request fails (offline, RLS rejection, expired session). Reloading the page silently reverts everything. And if the session has already expired, the button freezes on "Saving…" forever.
- **Root cause:** The mutation result is discarded and success is unconditional; the early return also strands the saving flag:

```ts
// apps/web/src/app/dashboard/settings/page.tsx:228-257 (elided)
    setSaving(true)
    setSuccess(false)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return                    // ← setSaving(true) never undone
    ...
    await supabase
      .from('profiles')
      .update({ display_name: ..., currency_code: currency, locale, monthly_income: parsedIncome })
      .eq('id', user.id)                 // ← no { error } destructure
    setSaving(false)
    setSuccess(true)                     // ← unconditional
    setTimeout(() => setSuccess(false), 3000)
```
Note the same file gets this *right* 100 lines above: `persistPrivacyFlag` (`:109-128`) destructures `{ error }`, rolls back the optimistic toggle, and logs. The account form was simply never brought up to that standard.
- **Blast radius:** The currency and language settings are the two controls with the widest downstream reach, and this is the surface that tells the user they took effect.
- **Same defect elsewhere:** The identical `if (!user) return` after a state flag is set: `apps/web/src/app/dashboard/budgets/page.tsx:170` (strands `saving`, button stuck on "Saving…"). The same early return before `setLoading(false)`, stranding a "Loading…" state permanently: `apps/web/src/app/dashboard/settings/page.tsx:84`, `budgets/page.tsx:79`, `transactions/page.tsx:128`, `recurring/page.tsx:154`, `export/page.tsx:47`, `ask/page.tsx:149`. Unchecked mutations: `settings/page.tsx:246`, `budgets/page.tsx:173,200`, `recurring/page.tsx:238,266`. (grepped: `if (!user) return`, `setSuccess(true)`, `setSaving(true)`)
- **Fix:** Destructure `{ error }` from every mutation, render the error inline, and only set `success` when `error == null`. Replace every bare `if (!user) return` with a branch that sets a visible "Your session expired — sign in again" state and clears the loading/saving flags. This is repeated in eight `load()`/save paths; extract a `withUser(async (user) => ...)` helper in `lib/` that owns the flag lifecycle.
- **Regression test to add:** Stub the profile update to return an error and assert "Saved." is not rendered and the message is shown.

### F22. Every web page turns a failed query into an empty state, and several spinners never clear
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/web/src/lib/data.ts:3-43`, `apps/web/src/app/dashboard/transactions/page.tsx:126-147,668-671`, `budgets/page.tsx:77-103,443-448`, `recurring/page.tsx:152-179,439-444`, `export/page.tsx:44-64`, `ask/page.tsx:146-172`
- **What the user sees:** If Supabase is unreachable, RLS rejects, or the session has silently expired, the Transactions page renders "No transactions match these filters.", Recurring renders "No recurring rules yet.", Budgets renders "No category budgets yet." — the user concludes their data is gone. If the failure happens before the user check, the page instead shows "Loading…" forever with no retry.
- **Root cause:** Errors are structurally discarded. The shared data layer never returns them:

```ts
// apps/web/src/lib/data.ts:21-22
  const { data } = await query
  return data ?? []
```
All four exported readers (`getProfile:4`, `getTransactions:21-22`, `getCategories:32`, `getActiveBudgets:42`) do this, and every client page repeats the pattern:
```ts
// apps/web/src/app/dashboard/recurring/page.tsx:174-178
    setRules((r.data ?? []) as RecurringRule[])
    setTransactions((t.data ?? []) as Txn[])
    setCategories((c.data ?? []) as Cat[])
    setProfile(p.data)
    setLoading(false)
```
Every `?? []` site swallows its `error`. Verified by search: there is no `error.tsx` or `global-error.tsx` anywhere under `apps/web/src/app`, so there is no boundary to catch a server-component throw either.
- **Blast radius:** All ten web page routes. For a money app this is the difference between "we couldn't load your data" and "you have no data" — the second one causes support tickets and account-deletion attempts.
- **Same defect elsewhere:** Mobile equivalent is F23. `apps/web/src/app/dashboard/settings/page.tsx:126` and `apps/web/src/app/dashboard/ask/page.tsx:308` log to `console.error` with no user-visible surface (Ask at least renders a retry turn). `packages/shared/src/askStorage.ts:144,167,190` do the same. (grepped: `data ?? []`, `console.error`, `setLoading(false)`, `error.tsx`)
- **Fix:** Change `lib/data.ts` to return `{ data, error }` and make every consumer render one of three states: loading, error-with-retry, empty. Add `apps/web/src/app/dashboard/error.tsx` as a backstop for the server components. Distinguish "empty" from "failed" in every empty-state string.
- **Regression test to add:** Stub the transactions query to reject and assert the page shows an error with a Retry control, not "No transactions match these filters."

### F23. Mobile has no error surface for any remote read; a failed fetch is indistinguishable from empty data
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/hooks/useTransactions.ts:15,196`, `apps/mobile/src/hooks/useRecurringRules.ts:87-95`, `apps/mobile/src/hooks/useCategories.ts:9-19`, `apps/mobile/src/hooks/useBudget.ts:11-24`, `apps/mobile/src/services/sync/SyncManager.ts:170-171`
- **What the user sees:** On a flaky connection, `/recurring` shows "No recurring rules yet" instead of "Couldn't load — retry". The Budgets tab shows the "set a budget" empty hero even when the user has one. There is no offline indicator, no pending-sync count, and no sign that anything failed.
- **Root cause:** `useTransactions` declares an error slot and never writes to it:

```ts
// apps/mobile/src/hooks/useTransactions.ts:15
  const [error, setError] = useState<string | null>(null)
...
// :196 — returned, but setError is never called anywhere in the file
  return { transactions, loading, error, createTransaction, deleteTransaction, editTransaction }
```
`useRecurringRules.fetch` destructures only `data` (`:89-95`). `pullRemote` returns silently on error (`SyncManager.ts:171: if (error || !data) return`). `SyncManager` has an `addListener(syncing, pendingCount)` API (`:60-63`) that **no screen subscribes to** — verified by grep: the only `addListener` hits in `apps/mobile` are `useNotificationListener.ts:47` and the three `DeviceEventEmitter` calls in `src/events/dataEvents.ts`.
- **Blast radius:** Combined with F8 and F50, a user whose queue is jammed sees a perfectly normal-looking app while nothing reaches the server and nothing arrives from it. The pieces for a sync indicator are already built and simply unused.
- **Same defect elsewhere:** `apps/mobile/src/hooks/useBudget.ts:13-22`, `apps/mobile/src/hooks/useCategories.ts:11-17`, `apps/mobile/src/hooks/useProfile.ts:23-62` (a failed fetch is indistinguishable from "row not there yet"; after `PROFILE_RETRY_BUDGET_MS` it sets `profile = null` at `:54`, and `_layout.tsx:71-72` then holds the user on `/(auth)` with no else branch). (grepped: `setError`, `const { data }`, `addListener`)
- **Fix:** Return `{ data, error }` from every hook's fetch, render an inline error strip with retry on each screen, and mount a global sync-status pill (bound to the already-existing `syncManager.addListener`) showing offline / N pending / failed. Every empty state must be reachable only when the read succeeded.
- **Regression test to add:** With Supabase stubbed to error, assert `/recurring` renders an error state and not `recurring.empty`.

### F24. Mobile only ever pulls the 200 most recently updated transactions
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/services/sync/SyncManager.ts:156-176`
- **What the user sees:** A user with more than 200 transactions who reinstalls the app, or signs in on a second device, gets a truncated history. Insights, the heatmap, and the category breakdown are computed from a partial dataset with no indication that anything is missing. On the first launch the totals are simply wrong.
- **Root cause:**

```ts
// apps/mobile/src/services/sync/SyncManager.ts:159-168
    let query = supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(200)

    if (since) {
      query = query.gt('updated_at', since)
    }
```
There is no pagination loop and no "did we get a full page, fetch the next" logic. The incremental path (`since`) is fine, but the initial hydration (where `lastSyncedAt.current` is undefined) silently caps at 200. `lastSyncedAt.current` is then set to now (`useTransactions.ts:32`), so the missing older rows are never requested again.
- **Blast radius:** Every mobile aggregation on a mature account. It also interacts with F13/F10: a truncated history makes the "6-month average" comparisons quietly wrong rather than absent.
- **Same defect elsewhere:** The web has no limit (`lib/data.ts:8-23` takes an optional `limit` that no caller passes, and the client pages fetch unbounded) — the opposite problem at scale, but at least not lossy. `apps/web/src/app/dashboard/ask/page.tsx:206-214` deliberately caps the model payload at the last 500 rows within 90 days, which is appropriate. (grepped: `.limit(`, `pullRemote`)
- **Fix:** Loop `pullRemote` with keyset pagination on `(updated_at, id)` until a short page is returned, and persist a real `last_pulled_at` cursor in SQLite so an interrupted hydration resumes instead of skipping.
- **Regression test to add:** Seed 250 server transactions, run `pullRemote` on a fresh SQLite DB, and assert all 250 land locally.

### F25. Paywall prices contradict the product plan and are hardcoded in dollars
- **Severity:** Medium *(downgraded from High during verification: nothing can be purchased at all (F6), so no user is ever charged a price that differs from the one displayed. The defect is an unauthorised, un-localised price string in shipped copy — a content and store-review problem, not a functional one.)*
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/more/paywall.tsx:90-106`; contradicted by `docs/PLAN.md:30`
- **What the user sees:** The paywall advertises **$4.99/month** and **$39/year**. `docs/PLAN.md:30` records the locked decision as "Murmur Plus $3.99/mo or $29.99/yr". Whichever is intended, the shipped screen shows a price the product owner has not agreed to — and shows it in dollars to every user regardless of their currency or App Store storefront.
- **Root cause:** Literal strings in JSX:

```tsx
// apps/mobile/app/more/paywall.tsx:91-105
              <PlanCard
                period={t('paywall.plan_monthly', locale)}
                price="$4.99"
                ...
              <PlanCard
                period={t('paywall.plan_yearly', locale)}
                price="$39"
```
Prices are not read from StoreKit/RevenueCat product metadata (there is none — see F6), and are not localised.
- **Blast radius:** Once IAP is wired, the displayed price and the charged price will differ unless someone remembers to reconcile them by hand — App Store Guideline 3.1.2 requires the displayed price to match the product. Also every non-USD storefront sees the wrong symbol and the wrong number.
- **Same defect elsewhere:** `apps/web/src/app/dashboard/settings/page.tsx:439-451` hardcodes "Murmur Plus · Yearly" and "Renews on your billing date" for any `isPlus` user, regardless of which plan they hold (see F41). (grepped: `price=`, `\$4.99`, `\$39`, `Yearly`)
- **Fix:** Read `localizedPriceString` from the store product objects once IAP lands; until then remove the price strings entirely (see F6) rather than shipping a number that is both unauthorised and unbuyable.
- **Regression test to add:** Assert no hardcoded currency literal appears in `paywall.tsx` (a lint rule banning `/\$\d/` in `app/**`).

### F26. The paywall claims the free mobile tier "is never limited" while gating three features on mobile
- **Severity:** Medium *(downgraded from High during verification: this is a false copy claim in a purchase flow — real, and worth fixing before submission — but it changes no computed value and blocks no interaction. Above Low because a false pricing statement is not "polish".)*
- **Status:** Newly discovered
- **Where:** `packages/shared/src/i18n/locales/en.json:431` key `paywall.disclaimer` → "Cancel any time · Free mobile tier is never limited", rendered at `apps/mobile/app/more/paywall.tsx:118`; contradicted by `apps/mobile/app/more/settings.tsx:101-107`, `apps/mobile/app/more/ask.tsx:60-63`, `apps/mobile/app/(tabs)/index.tsx:261-268`
- **What the user sees:** The bottom line of the paywall — the reassurance line — tells the user the free mobile tier is never limited. Two taps away, mobile Settings sends free users from "Export my data" to this same paywall, mobile Ask Murmur refuses to answer, and the "New pattern detected" recurring banner never renders. The disclaimer is false on the very screen that lists what Plus unlocks.
- **Root cause:** Copy written against an earlier "mobile free forever, desktop paid" model, never updated when the gates were added:

```ts
// apps/mobile/app/more/settings.tsx:101-107
  function openExport() {
    if (!isPlus) {
      router.push('/more/paywall')
      return
    }
    setExportPickerOpen(true)
  }
```
```ts
// apps/mobile/app/more/ask.tsx:60-63
    if (!isPlus) {
      gotoPaywall()
      return
    }
```
```tsx
// apps/mobile/app/(tabs)/index.tsx:261 — Plus-gated pattern banner
        {isPlus && (
          <RecurringPatternBanner ... />
        )}
```
- **Blast radius:** A false pricing claim inside a purchase flow. Also drifts against `settings.export_detail_free`, which renders as the *detail* of the Export row (`settings.tsx:299-303`) — a label, not an explanation.
- **Same defect elsewhere:** `apps/web/src/app/dashboard/settings/page.tsx:443` tells free users "Free forever · no trial, no upsells" on the same card that then upsells them (`:453-`). (grepped: `paywall.disclaimer`, `never limited`, `Free forever`)
- **Fix:** Rewrite `paywall.disclaimer` in all four locales to state the truth: "Cancel any time · Voice capture, budgets and insights stay free". Change `settings.export_detail_free` to "Plus feature" so the row explains itself.
- **Regression test to add:** A content test asserting the set of features gated by `isPlus` matches the feature list rendered on the paywall.

### F27. Mobile Settings always says "Free plan" and always shows an Upgrade button
- **Severity:** Medium *(downgraded from High during verification: `usePlusStatus` returns `isPlusFromProfile(profile) || __DEV__`, `profiles.plus_status` has no writer, and `__DEV__` is false in TestFlight — so every real user today genuinely is on the free plan and the string is accurate. It only becomes a lie for an early-access account flipped by hand in SQL, or once F6 lands.)*
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/more/settings.tsx:72,209-218`
- **What the user sees:** A Plus subscriber (today: only an account manually flipped via SQL) opens Settings and reads "Free plan · 47 expenses" with a prominent sage "Upgrade" pill. There is no plan status, no renewal date, no manage-subscription link, and no way to confirm the purchase took effect.
- **Root cause:** `isPlus` is read into the component (line 72) and used only to pick the Export row's subtitle (`:299-303`). The profile card ignores it entirely:

```tsx
// apps/mobile/app/more/settings.tsx:209-218
              <Text style={styles.profilePlan} numberOfLines={1}>
                {t('settings.plan_free', locale)} · {txnCount} {t('settings.expenses_count', locale)}
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.upgradePill, pressed && styles.upgradePillPressed]}
              onPress={() => router.push('/more/paywall')}
            >
              <Text style={styles.upgradePillText}>{t('settings.upgrade', locale)}</Text>
            </Pressable>
```
`settings.plan_free` is a fixed string, not a branch.
- **Blast radius:** Once purchases work, this is the screen a user checks after paying. Telling them they are still on the free plan is the fastest possible route to a refund request. Also there is no "Restore purchases" affordance anywhere on mobile.
- **Same defect elsewhere:** The inverse on web — `apps/web/src/app/dashboard/settings/page.tsx:438-452` shows "Murmur Plus · Yearly / Renews on your billing date" for any `isPlus` user, regardless of which plan they actually hold (F41). (grepped: `plan_free`, `isPlus`, `Upgrade`)
- **Fix:** Branch the plan line and the pill on `isPlus`, add a "Restore purchases" row (required by App Store review), and render the real entitlement source once `profiles.plus_status` has a writer.
- **Regression test to add:** With `profile.plus_status='active'`, assert Settings renders neither "Free plan" nor the Upgrade pill.

### F28. A production Settings row lets any user redirect the AI endpoint — and the auth token goes with it
- **Severity:** Critical *(upgraded from High during verification: this is a security hole under the rubric, not a UX defect. The `SetGroup` has no `__DEV__` guard, so it ships in the TestFlight/App Store binary; `getApiUrl()` applies no scheme or host allow-list; `app.config.js:21-23` sets `NSAllowsArbitraryLoads: true` so a plain-HTTP destination is accepted; and every AI call attaches a live Supabase access token that grants full RLS-scoped read/write of that user's financial data. Persisted in SecureStore, which F8 never clears — so the redirect survives sign-out into the next account.)*
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/more/settings.tsx:330-341` (the row) and `:480-531` (the editor modal), `apps/mobile/src/hooks/useApiUrl.ts:1-34`, consumers `apps/mobile/src/hooks/useVoice.ts:101-112`, `apps/mobile/app/(tabs)/record.tsx:251-261`, `apps/mobile/src/services/askMurmurClient.ts`
- **What the user sees:** Settings contains a group literally labelled "Developer" with an editable "AI server URL" row showing `https://money-app-web-w6su.vercel.app`. Any user — or anyone with 30 seconds of physical access to an unlocked phone — can point it anywhere.
- **Root cause:** The override is persisted and used unconditionally, and every AI call attaches the user's Supabase access token to the request:

```ts
// apps/mobile/src/hooks/useVoice.ts:101-112
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData?.session?.access_token ?? ''

        const apiBaseUrl = await getApiUrl()          // ← attacker-controlled
        const result = await parseExpense({
          ...
          apiBaseUrl,
          authToken: token,
        })
```
```ts
// apps/mobile/src/hooks/useApiUrl.ts:31-34 — no validation of any kind
export async function getApiUrl(): Promise<string> {
  const stored = await SecureStore.getItemAsync(STORAGE_KEY)
  return stored ?? DEFAULT_URL
}
```
There is no `__DEV__` guard on the Settings row (`settings.tsx:330-341` renders unconditionally, between the Privacy and About groups) and no allow-list on the URL. `apps/mobile/app.config.js:21-23` also sets `NSAllowsArbitraryLoads: true`, so a plain-HTTP destination is permitted. Combined with F8 (SecureStore survives sign-out), an override set under one account persists into the next.
- **Blast radius:** Every voice utterance, every scanned receipt image, every Ask Murmur question — and a live Supabase JWT that grants full RLS-scoped access to the user's financial data — can be sent to an arbitrary host.
- **Same defect elsewhere:** None found — this is the only user-editable endpoint. But the same token is attached in three call sites, all of which read `getApiUrl()`. (grepped: `getApiUrl`, `authToken`, `NSAllowsArbitraryLoads`)
- **Fix:** Wrap the entire Developer `SetGroup` (`settings.tsx:330-341`) in `{__DEV__ && ...}` so it cannot render in a TestFlight or App Store build, and validate any stored override against an `https://` + known-host allow-list inside `getApiUrl()` itself (not at the call sites) before returning it. Remove `NSAllowsArbitraryLoads` from `apps/mobile/app.config.js:21-23` — nothing in the app needs cleartext. Patching only the Settings row would be a workaround: the SecureStore value already written on any device that used the override must also be validated on read.
- **Regression test to add:** With `__DEV__ === false`, assert Settings renders no "AI server URL" row and `getApiUrl()` ignores a stored `http://evil.test` value.

### F29. The onboarding income screen is hardcoded to dollars
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/(onboarding)/income.tsx:16-21,137,148-150`
- **What the user sees:** The third onboarding step — the first money-entry surface a new user ever touches — shows a `$` glyph next to the amount field and four quick-pick chips labelled `$2.5k / $4k / $6k / $10k`, then a hint line underneath reading "per month · NGN". A Nigerian user is offered dollar presets for their naira salary.
- **Root cause:** Both the glyph and the presets are literals:

```tsx
// apps/mobile/app/(onboarding)/income.tsx:16-21
const PRESETS = [
  { label: '$2.5k', value: 2500 },
  { label: '$4k', value: 4000 },
  { label: '$6k', value: 6000 },
  { label: '$10k', value: 10000 },
]
// :137
            <Text style={styles.currencyGlyph}>$</Text>
// :148-150 — while the hint line right underneath prints the real code
          <Text style={styles.amountHint}>
            {t('onboarding.income.per_month', locale)} · {currency}
          </Text>
```
There is also no currency picker in onboarding at all — `currency` comes from `profile?.currency_code ?? 'USD'` (`:34`) and the profile default is USD, so the very first thing every non-US user must do after onboarding is go to Settings and change the currency (which then corrupts the income they just entered — F5).
- **Blast radius:** The stored `monthly_income` is the input to Ask Murmur's affordability reasoning (`ask/page.tsx:236`) and to every savings-rate calculation, and it has no currency column of its own (F16).
- **Same defect elsewhere:** `apps/mobile/app/(tabs)/index.tsx:318-328` (`formatBudgetShort`), `apps/mobile/src/components/Money.tsx:44` (F4). `apps/mobile/src/components/IncomeEditorModal.tsx` is *not* an occurrence — it receives `currency` as a prop and resolves the glyph via `currencySymbolFor`. (grepped: `'\$'`, `PRESETS`, `currencyGlyph`)
- **Fix:** Replace the glyph with `currencySymbolFor(currency)` and derive the presets from the currency (or drop them for non-USD). Add a currency step to onboarding — before income — defaulting from `expo-localization`'s region rather than hardcoding USD.
- **Regression test to add:** Render the onboarding income step with `currency_code='NGN'` and assert no `$` appears.

### F30. Onboarding ignores every write error and can trap the user in the flow
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/(onboarding)/income.tsx:44-97`, gate at `apps/mobile/app/_layout.tsx:78-90`
- **What the user sees:** If the profile update fails (offline, expired session), the screen still navigates to the Today tab — and then the routing gate immediately bounces the user back to `/(onboarding)/permissions`, because `onboarding_completed_at` is still null. The user loops through onboarding with no explanation.
- **Root cause:** Every result is discarded:

```ts
// apps/mobile/app/(onboarding)/income.tsx:48-52, 95-96
    await updateProfile({
      monthly_income: useIncome ? amountNum : null,
      monthly_income_source: useIncome && source.trim() ? source.trim() : null,
      onboarding_completed_at: new Date().toISOString(),
    })
...
    setSaving(false)
    router.replace('/(tabs)')
```
`updateProfile` returns `!error` (`useProfile.ts:77-88`) and the caller drops it. `createTransaction`'s result is destructured for `id` only (`:64`), never `error`. `createRule`'s null return (F2) is ignored (`:81`). The layout gate then re-pushes:
```ts
// apps/mobile/app/_layout.tsx:78-90
    } else if (
      session &&
      !inAuthGroup &&
      !inOnboardingGroup &&
      !justLeftOnboarding &&
      profile &&
      profile.onboarding_completed_at == null
    ) {
      router.replace('/(onboarding)/permissions')
    }
```
- **Blast radius:** First-run experience. A user who onboards on a train cannot get into the app at all, and the loop gives no hint that connectivity is the issue.
- **Same defect elsewhere:** `apps/mobile/app/(onboarding)/permissions.tsx:103-108` (Continue always navigates, no state persisted), `apps/mobile/app/more/settings.tsx:167-172` (`handleSaveName` discards `updateProfile`'s boolean), `apps/mobile/app/more/settings.tsx:439-442` and `:467-470` (currency and locale modals both discard it). (grepped: `await updateProfile`, `router.replace`, `onboarding_completed_at`)
- **Fix:** Check `updateProfile`'s return; on failure show an `Alert` with retry and do not navigate. Same for `createTransaction`'s error. Make the onboarding-complete write the *last* step and treat it as the transaction boundary.
- **Regression test to add:** Stub `updateProfile` to fail and assert the user stays on the income step with a visible error.

### F31. "Try again" on the permissions screen is a dead control after the first denial
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/(onboarding)/permissions.tsx:44-51,87-97`
- **What the user sees:** A user who taps "Don't Allow" on the microphone prompt sees the button change to "Try again". Tapping it does nothing — no prompt, no navigation, no message — forever. Voice capture, the app's entire premise, is now unusable and the UI offers no route out.
- **Root cause:** iOS only presents the permission dialog once; subsequent `requestPermissionsAsync()` calls resolve immediately with `granted: false`. The handler has no `canAskAgain` branch and no path to Settings:

```ts
// apps/mobile/app/(onboarding)/permissions.tsx:44-51
  async function handleAllowMic() {
    try {
      const res = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
      setMicStatus(res.granted ? 'granted' : 'denied')
    } catch {
      setMicStatus('denied')
    }
  }
```
Only `res.granted` is read; `canAskAgain` is never inspected, and the button at `:87-96` keeps calling the same handler with the label swapped to `onboarding.permissions.try_again`.
- **Blast radius:** The same silent dead-end exists on the primary capture path — `useVoice.startListening` sets `errorMessage: 'Microphone permission denied'` (`useVoice.ts:124-130`) and `record.tsx:401-407` renders it as a line of red text with no action, so tapping the mic on the Record tab is also a permanent no-op with no way to recover.
- **Same defect elsewhere:** `apps/mobile/app/(tabs)/record.tsx:231-236` (camera permission — an `Alert` with only an OK button, no Settings link), `apps/mobile/src/hooks/useVoice.ts:124-130`. (grepped: `requestPermissionsAsync`, `granted`, `openSettings`, `canAskAgain`)
- **Fix:** Inspect `canAskAgain` from the permission response; when it is false, change the button to "Open Settings" and call `Linking.openSettings()`. Apply the same treatment to the camera prompt and to the Record tab's denied state.
- **Regression test to add:** With the permission API stubbed as `{granted:false, canAskAgain:false}`, assert the button label is "Open Settings" and invokes `Linking.openSettings`.

### F32. Web export selects rows by UTC date while the picker reads as local, and stamps each row with two disagreeing times
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/export/page.tsx:38-42,70-75,102-114`
- **What the user sees:** A US user exporting "1 July → 31 July" for tax purposes silently omits every transaction made after 7pm on 31 July (those are 1 August in UTC) and silently includes the evening of 30 June. In the CSV, a row can read `Date: 2026-08-01, Time: 19:33` — a date in August next to a time from the evening of 31 July.
- **Root cause:** The range filter compares a UTC-derived date slice against locally-authored date inputs:

```ts
// apps/web/src/app/dashboard/export/page.tsx:70-75
  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      const d = t.transacted_at.slice(0, 10)    // UTC calendar date
      return d >= dateFrom && d <= dateTo       // user thinks these are local dates
    })
  }, [transactions, dateFrom, dateTo])
```
and the CSV mixes the two representations in one row:
```ts
// apps/web/src/app/dashboard/export/page.tsx:104-105
        t.transacted_at.slice(0, 10),
        new Date(t.transacted_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false }),
```
— the first is a UTC date, the second is a browser-local time forced to the `'en'` locale. The range defaults are inconsistent with each other too: `defaultFrom` (`:39`) is built from local `getFullYear/getMonth` then serialised through `toISOString()`, while `defaultTo` (`:40`) is `now.toISOString().slice(0,10)` (UTC).
- **Blast radius:** The card above the buttons is titled "Records, tax filings". Missing or extra rows in a tax export are the highest-consequence version of this bug class. The JSON and PDF exports share the same `filtered` array.
- **Same defect elsewhere:** `apps/mobile/src/services/exportData.ts:87` uses `tx.transacted_at.split('T')[0]` (UTC) while `todayStamp()` at `:55-64` is deliberately local and says so in its comment — the same file mixes both conventions. (grepped: `slice(0, 10)`, `split('T')`, `toISOString().slice`)
- **Fix:** Convert the range bounds to UTC instants using the user's timezone (`zonedStartOfDay(tz, dateFrom)` … `zonedEndOfDay(tz, dateTo)`) and compare against `transacted_at` directly. Render the CSV date and time from the *same* zone-aware formatter, with the user's locale rather than `'en'`. Add an explicit timezone note to the export header.
- **Regression test to add:** With `tz='America/Chicago'`, a transaction at `2026-08-01T01:00:00Z` must appear in a "1 Jul – 31 Jul" export and not in "1 Aug – 31 Aug".

### F33. The product's only support channel points at an unregistered domain
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `packages/shared/src/brand.ts:13-20`; rendered at `apps/mobile/app/more/help.tsx:23-29`, `apps/web/src/app/dashboard/settings/page.tsx:570-581`
- **What the user sees:** Help says "write us — it lands directly in the inbox of the person building it" and offers `support@murmur.app`. `murmur.app` is not registered (the code says so), so every message bounces. This is the only contact route in the entire product.
- **Root cause:** The constant is documented as a deliberate placeholder that was never replaced before shipping:

```ts
// packages/shared/src/brand.ts:13-17
/** Customer support inbox. Until `murmur.app` is registered + DNS is
 *  pointing at a real inbox, this is intentionally a placeholder; the
 *  important property is that nothing in the shipping app exposes a
 *  developer's personal email. Replace once the domain is live. */
export const SUPPORT_EMAIL = 'support@murmur.app'
```
`SUPPORT_MAILTO` (`:20`) wraps it, and both the mobile Help row (`help.tsx:23-29`) and the web About row (`settings/page.tsx:570-581`) render it as a live `mailto:` link.
- **Blast radius:** Every bug report, refund request, and GDPR enquiry is silently lost. App Store review requires a working support URL/contact.
- **Same defect elsewhere:** `apps/mobile/app/more/settings.tsx:196` (the placeholder iCloud shortcut URL, F19). (grepped: `SUPPORT_EMAIL`, `murmur.app`, `placeholder`)
- **Fix:** Register the domain and point MX at a real inbox, or switch to an address that already works. Until then the Help screen must not promise a reply.
- **Regression test to add:** A release check asserting `SUPPORT_EMAIL`'s domain resolves MX records.

### F34. The web dashboard is English-only behind a four-language picker
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/settings/page.tsx:12-17,363-372`; every web page (all strings are inline literals)
- **What the user sees:** A user sets Language → Français in web Settings. Dates and currency reformat; every label, heading, empty state, button, and error message stays in English — "Recurring & subscriptions", "Auto-detected from your spend patterns", "No transactions match these filters", "Set a monthly budget to start tracking". Meanwhile the mobile app for the same account is fully French.
- **Root cause:** `packages/shared/src/i18n` ships complete `en/fr/es/pt` bundles (verified by key count: 432 in each of the four files, zero gaps) and **no web file imports `t`**. Verified by grep over `apps/web/src`: the only `@voice-expense/shared` imports are `aggAmount`, `snapshotFx`, `formatCurrency`, `merchantColor`, `SUPPORT_EMAIL`/`SUPPORT_MAILTO`, and types — never `t`. Every web string is a JSX literal. The Settings picker writes `profiles.locale`, which the web then uses only as an `Intl` argument.
- **Blast radius:** Every web and desktop screen for three of the four supported languages. The desktop app is the paid product.
- **Same defect elsewhere:** A handful of untranslated literals leak into the mobile app too: `apps/mobile/app/more/transactions.tsx:208-210` (the "All" filter pill), `apps/mobile/app/(auth)/sign-in.tsx:55` and `sign-up.tsx:30` (`const locale: Locale = 'en'` hardcoded pre-auth, so the whole sign-in surface is English even on a French device). (grepped: `from '@voice-expense/shared'` in `apps/web`, `t(`, `locale: Locale = 'en'`)
- **Fix:** Import `t` from `@voice-expense/shared` in the web app, thread `profile.locale` through a small `LocaleProvider` alongside `PlusProvider` in `dashboard/layout.tsx`, and replace the literals. Add the ~200 new web keys to all four locale files. On mobile, seed the pre-auth locale from `getLocales()` instead of hardcoding `'en'`.
- **Regression test to add:** With `profile.locale='fr'`, assert the web Budgets page renders no occurrence of "Set a monthly budget".

### F35. The web paywall ships a developer note to production users
- **Severity:** Medium *(downgraded from High during verification: shipped copy that leaks an internal build detail and hints at a free unlock. Real and embarrassing, but it changes no value and blocks no action.)*
- **Status:** Newly discovered
- **Where:** `apps/web/src/components/PaywallGate.tsx:30-33`
- **What the user sees:** A free user who opens Ask Murmur or Export on the web dashboard sees, directly under the (non-functional) "Upgrade to Plus" element: *"Plus is free in the dev build — production sees the upgrade flow here."*
- **Root cause:** An engineering note rendered unconditionally:

```tsx
// apps/web/src/components/PaywallGate.tsx:30-33
          <div style={styles.cta}>Upgrade to Plus</div>
          <div style={styles.note}>
            {'Plus is free in the dev build — production sees the upgrade flow here.'}
          </div>
```
There is no environment guard anywhere in the file.
- **Blast radius:** Both Plus-gated web routes (`/dashboard/ask`, `/dashboard/export`). It advertises to users that a free unlock exists.
- **Same defect elsewhere:** `apps/web/src/app/dashboard/recurring/page.tsx:338` (`title="Coming soon"` on a disabled button), `apps/mobile/app/(tabs)/budgets.tsx:169` (`budgets.by_category_coming_soon` → "Per-category budgets arrive in the next release" — while the web already ships them, F46). (grepped: `dev build`, `Coming soon`, `TODO`, `FIXME`)
- **Fix:** Delete the note. If a dev affordance is needed, gate it on `process.env.NODE_ENV !== 'production'`.
- **Regression test to add:** Render `PaywallGate` with `NODE_ENV=production` and assert the string "dev build" is absent.

### F36. The web Recurring page leaks a realtime channel on every mount
- **Severity:** Low *(downgraded from Medium during verification. The leak is real, but the stated symptom is not reachable: `supabase_realtime` publishes zero tables (F50, confirmed by query against the live project), so a stale channel receives no events, never calls `load()`, and issues no extra queries. What actually accumulates is idle channel objects and their phoenix topics. This returns to Medium the moment F50 is fixed.)*
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/recurring/page.tsx:191-221`
- **What the user sees:** Nothing today. Navigating in and out of Recurring accumulates idle websocket channel objects in the client; with realtime enabled they would each re-fire `load()` (four Supabase queries) on every change until the socket's channel limit is hit.
- **Root cause:** The cleanup function is returned from inside an async IIFE, where the `void` operator discards it:

```ts
// apps/web/src/app/dashboard/recurring/page.tsx:194-219
    void (async () => {
      ...
      const channel = supabase
        .channel(`web:recurring:${userId}:${Math.random().toString(36).slice(2)}`)
        ...
        .subscribe()
      return () => {                     // ← returned to nobody
        active = false
        channel.unsubscribe()
        void supabase.removeChannel(channel)
      }
    })()
    return () => {
      active = false                     // ← the real cleanup: never touches the channel
    }
```
`active` is only read *before* subscribing (`:196`), so setting it false on unmount has no effect on an already-open channel.
- **Blast radius:** Recurring is the page the owner reloads most while debugging F2, so this compounds. React Strict Mode double-invokes effects in dev, doubling the leak rate.
- **Same defect elsewhere:** None — the two sibling implementations are correct: `apps/web/src/app/dashboard/transactions/page.tsx:159-190` hoists `channel` to the effect scope and unsubscribes in the outer cleanup; `apps/web/src/app/dashboard/budgets/page.tsx:115-159` assigns a `cleanup` closure. Three different hand-rolled shapes for one job is itself the problem. (grepped: `void (async () =>`, `supabase.channel`, `removeChannel`)
- **Fix:** Extract a `useRealtime(table, filter, onChange)` hook in `apps/web/src/lib/` and use it in all three pages, so the subscribe/unsubscribe lifecycle exists once.
- **Regression test to add:** Mount and unmount the Recurring page ten times and assert `supabase.getChannels()` is empty.

### F37. The Transactions table's SOURCE column shows a value that is not a source, mislabels Android as Apple Pay, and invents an Account column
- **Severity:** Medium
- **Status:** User-reported (the "Recurring" chip on the Xtream row) — mechanism confirmed
- **Where:** `apps/web/src/app/dashboard/transactions/page.tsx:64-71,417-430,733,757-788`
- **What the user sees:** The Xtream row's SOURCE chip reads "Recurring", but production shows that row as `source='manual'` — the database's `source` CHECK constraint has no `'recurring'` value at all. A row logged by the Android notification listener would show "Apple Pay". Every row's ACCOUNT column reads "Murmur".
- **Root cause:** The classifier conflates a boolean flag with the source enum, and lets it win:

```ts
// apps/web/src/app/dashboard/transactions/page.tsx:64-71
function classifySource(t: Txn): 'voice' | 'apple-pay' | 'typed' | 'recurring' {
  // Recurring takes precedence — it's the most useful chip on a row
  // that's both recurring and (e.g.) voice-logged.
  if (t.is_recurring || t.source === 'recurring_generated') return 'recurring'
  if (t.source === 'voice') return 'voice'
  if (t.source === 'shortcut' || t.source === 'notification_listener') return 'apple-pay'
  return 'typed'
}
```
The comment shows the precedence was deliberate — but the consequence was not: a voice-logged transaction the user flagged recurring loses its "Voice" chip entirely, which also skews the "N voice · N Apple Pay · N typed · N recurring" subtitle counts (`:417-430`), since the four buckets are mutually exclusive. The Account column is a literal:
```tsx
// apps/web/src/app/dashboard/transactions/page.tsx:733
                    <div style={{ color: colors.ink3, fontSize: 12 }}>Murmur</div>
```
`notification_listener` is Android's payment-notification reader; `SourceChip` (`:766-772`) renders it as "Apple Pay", which is simply wrong.
- **Blast radius:** The column header claims to report provenance; users will reasonably read the chip as "this came from a recurring rule", which for the Xtream row is false in two ways (no rule exists — F2 — and the source is `manual`). The subtitle counts under-report voice and typed usage.
- **Same defect elsewhere:** `apps/mobile/app/transaction/[id].tsx:93-104` (`humanSource`) maps `'recurring_generated'` to `t('source.recurring')` — the same word for a genuinely different thing, so the two platforms use "Recurring" to mean two different states. (grepped: `classifySource`, `is_recurring`, `source ===`)
- **Fix:** Make the SOURCE chip render `t.source` only (Voice / Typed / Scan / Shortcut / Notification / Auto-generated), and move recurring to its own indicator — the row already renders `<Icon.recurring>` next to the merchant (`:719`). Split the filter chips accordingly so counts sum to the row count. Delete the Account column until multi-account exists.
- **Regression test to add:** A `source='voice', is_recurring=true` row must render the Voice chip and be counted in the voice total.

### F38. The "Next 30 days" mini-calendar puts weekday headers over cells that are not weekdays
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/recurring/page.tsx:120-140,563-605`
- **What the user sees:** A 7-column grid headed `M T W T F S S`, but the cells beneath are "day 1 … day 30" counted forward from *today*. On a Saturday, "day 1" (today) sits under the M header, so every charge appears in the wrong weekday column and every cell number is an offset rather than a date.
- **Root cause:** The cells are offsets, not dates:

```ts
// apps/web/src/app/dashboard/recurring/page.tsx:132-133
        const dayOffset = Math.round((nxt.getTime() - today.getTime()) / 86_400_000)
        out.push({ day: dayOffset + 1, rule: r })
```
```tsx
// :564-577,596
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => ( ... ))}
                {Array.from({ length: 30 }).map((_, i) => {
                  const day = i + 1
                  ...
                      <div>{day}</div>
```
No leading blanks are inserted to align offset 1 with today's actual weekday, and the cell label is the offset number, not the day-of-month.
- **Blast radius:** The 30 numbered cells and the misleading weekday header render even with zero rules, so this part is visible today. The charge highlighting is masked by F2 and will surface the moment recurring rules work. **Correction made during verification:** the "Heaviest day" line below the grid is *not* affected — `heaviestDate` (`:316-323`) converts the offset back to a real calendar date before formatting, so it prints correctly.
- **Same defect elsewhere:** The Overview Calendar lens does this correctly with a `firstDow` offset (`Calendar.tsx:22,65-68`) — though that computation is itself broken by F1. (grepped: `Array.from({ length: 30 })`, `firstDow`, `dayOffset`)
- **Fix:** Build the 30-day strip from real dates: compute `firstDow` for today, pad with blanks, and label each cell with its day-of-month. Reuse the Calendar lens's cell builder rather than writing a third one.
- **Regression test to add:** With today = Saturday and a charge today, assert the highlighted cell is in the Saturday column.

### F39. Neither platform lets a user create a recurring rule directly
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/recurring/page.tsx:337-341,441-444`, `apps/mobile/app/recurring.tsx:141-249`
- **What the user sees:** The web Recurring toolbar has an "Add manually" button that is permanently `disabled` with `title="Coming soon"`. The mobile Recurring screen has no add control at all. The web empty state instructs: *"Mark a transaction as recurring on mobile or accept a detected pattern"* — but pattern acceptance is Plus-gated (`candidates` returns `[]` when `!isPlus`, `:225-232`) and no user is Plus (F6), and marking on mobile does not work (F2). Every route the empty state suggests is closed.
- **Root cause:**

```tsx
// apps/web/src/app/dashboard/recurring/page.tsx:338
            <button style={styles.addBtn} type="button" disabled title="Coming soon">
```
```tsx
// :442-444 — the empty state
                <div style={styles.empty}>
                  No recurring rules yet. Mark a transaction as recurring on mobile or accept a detected pattern.
                </div>
```
The web page can also only toggle active/paused (`:265-268`, surfaced by the ACTIVE pill at `:490`); it cannot edit amount, frequency, or name, and cannot delete. Mobile can pause and delete (via the `Alert` action sheet at `recurring.tsx:102-`) but not create or edit.
- **Blast radius:** "Recurring" is a paid feature (`paywall.feature_auto_recurring`) that no user can populate.
- **Same defect elsewhere:** `apps/mobile/app/(tabs)/budgets.tsx:166-171` — the "By category" section is an empty card reading "Per-category budgets arrive in the next release" while the web has fully shipped them (F46). Same shape: an empty state that describes a capability the user cannot reach from where they are standing. (grepped: `disabled`, `Coming soon`, `empty`)
- **Fix:** Ship a create/edit form on both Recurring surfaces (name, amount, currency, category, direction, frequency, next date), sharing one form component. Rewrite the web empty state to describe only reachable actions, and gate the "accept a detected pattern" clause on `isPlus`.
- **Regression test to add:** Assert the web Recurring empty-state copy mentions only actions available to the current user's plan.

### F40. Mobile lists paused rules under "Active subscriptions"
- **Severity:** Low *(downgraded from Medium during verification: entirely invisible today — F2 means `rules` is always empty, so the whole screen renders its empty state and the section never appears. Returns to Medium once rules exist.)*
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/recurring.tsx:194-197`
- **What the user sees:** Nothing today. Once rules exist: the section is headed "Active subscriptions" and contains every rule, paused ones included (dimmed via `styles.ruleRowInactive` with a "Paused" sub-label at `:225`). The list disagrees with the hero total above it, which correctly filters to `is_active`.
- **Root cause:**

```tsx
// apps/mobile/app/recurring.tsx:195-197
                <Text style={styles.sectionLabel}>{t('recurring.active_subs', locale)}</Text>
                <View style={styles.listCard}>
                  {rules.map((rule, i) => {     // ← every rule, not rules.filter(r => r.is_active)
```
while `monthlyTotal` at `:95-99` does filter.
- **Blast radius:** Cosmetic, but it will read as a data inconsistency the moment rules exist — hero total excludes paused, list includes them.
- **Same defect elsewhere:** The web version handles this correctly by splitting `active` and `inactive` into separate blocks (`recurring/page.tsx:270-271,447-542`). (grepped: `active_subs`, `rules.map`, `is_active`)
- **Fix:** Split the mobile list into "Active" and "Paused" sections, matching web.
- **Regression test to add:** With one active and one paused rule, assert the "Active subscriptions" section contains exactly one row.

### F41. Web Settings and the sidebar display fabricated device and billing information
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/settings/page.tsx:402-425,438-452`, `apps/web/src/components/Sidebar.tsx` (user card, "Synced just now")
- **What the user sees:** "Sync & devices" lists exactly one row — "This device · Synced just now · web companion" — regardless of how many devices the account has or when it last synced. The sidebar user card says "Synced just now" on every render, including offline. "Plan & billing" tells any `isPlus` user they hold a **Yearly** plan that "Renews on your billing date", with a "Manage" link that is a non-clickable `<span>`.
- **Root cause:** All four values are literals:

```tsx
// apps/web/src/app/dashboard/settings/page.tsx:406-410
              <SettingRow
                label="This device"
                sub="Synced just now · web companion"
                right={<Tag color={colors.accent} bg={colors.accentSoft}>THIS DEVICE</Tag>}
              />
// :438-452
              <SettingRow
                label={isPlus ? 'Murmur Plus · Yearly' : 'Mobile app'}
                sub={isPlus ? 'Renews on your billing date · cancel anytime' : 'Free forever · no trial, no upsells'}
                right={isPlus ? <span style={styles.linkBtn}>Manage</span> : <span ...>Always</span>}
              />
```
A `devices` table exists (`001_initial_schema.sql:192-199`, with `last_seen_at` / `last_synced_at`) and **nothing writes to it** — grep for `from('devices')` across `apps/`, `packages/` and `supabase/` returns zero hits. `transactions.synced_at` is likewise NULL on 17 of 18 production rows because `SyncManager` sets it only on the local SQLite copy (`SyncManager.ts:126`) after having already sent `serverPayload` — whose `synced_at` is the `null` set at `useTransactions.ts:117` — at `:105-108`.
- **Blast radius:** A money app claiming "synced just now" when nothing has synced is the most damaging possible false statement — and F8 and F50 both make silent sync failure a real scenario. The fabricated billing plan compounds F6/F27.
- **Same defect elsewhere:** `apps/web/src/app/dashboard/settings/page.tsx:535-539` ("Recognition language" renders `{locale.toUpperCase()}`, the UI locale — but mobile actually drives speech recognition from `profiles.voice_language`, a separate BCP-47 column (`001_initial_schema.sql:17`, read at `apps/mobile/app/(tabs)/record.tsx:65`) that this row ignores). (grepped: `Synced just now`, `from('devices')`, `synced_at`, `voice_language`)
- **Fix:** Either populate `devices` on every app launch and render real rows with real `last_synced_at`, or delete the section. Set `synced_at` in the payload sent to the server (`SyncManager.ts:105`) so the column means something. Replace the billing card with the real entitlement + a working store-management deep link once F6 lands. Read `voice_language` for the recognition-language row.
- **Regression test to add:** Assert the Sync section renders a timestamp derived from `devices.last_synced_at`, and that a drained queue entry leaves `synced_at` non-null on the server row.

### F42. Amount validation: zero silently does nothing, there is no upper bound, and future dates are unrestricted
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/components/VoiceConfirmModal.tsx:113-135`, `apps/mobile/app/(tabs)/record.tsx:274-279,549-557`, `apps/mobile/app/transaction/edit.tsx:90-95`, `apps/web/src/app/dashboard/transactions/page.tsx:261-266,558-566`, `apps/web/src/app/dashboard/budgets/page.tsx:161-166`; schema constraint `supabase/migrations/001_initial_schema.sql` (`amount numeric(12,2) ... CHECK (amount > 0)`)
- **What the user sees:** In the voice-confirm sheet, typing `0` leaves the Save button fully enabled; tapping it does nothing at all — no error, no dismissal. On the manual keypad the Add button correctly disables, so two entry paths behave differently for the same input. On web, a transaction can be dated `3026-01-01`; nothing rejects it, and it then dominates every chart's axis. Nothing anywhere caps the magnitude, so a mis-parsed voice amount above `9,999,999,999.99` overflows `numeric(12,2)` and the row fails to sync — silently, forever (F8/F23).
- **Root cause:** The enable predicate and the guard disagree:

```ts
// apps/mobile/src/components/VoiceConfirmModal.tsx:114-115
    const parsed = parseFloat(amount.replace(',', '.'))
    if (isNaN(parsed) || parsed <= 0) return          // silent — no state change, no message
// :135
  const canSave = amount.length > 0 && !isNaN(parseFloat(amount.replace(',', '.')))  // 0 and -5 pass
```
`0`, `0.00`, and `-5` (pasteable into the field) all satisfy `canSave` and then hit the silent `return`. Contrast the manual keypad on the same flow, and `budgets/page.tsx:161-166`, which both set a visible error for the same input. Database constraints do exist (`amount numeric(12,2) NOT NULL CHECK (amount > 0)`), but they are the last line of defence and their violation is invisible on mobile. On web the `datetime-local` input (`transactions/page.tsx:560-565`) has no `max` and `handleFormSave` validates only the amount.
- **Blast radius:** Every entry surface. Future-dated rows also break `computeUpcomingRecurring`, the forecast, and the "days to go" math.
- **Same defect elsewhere:** Missing upper bound at all five amount inputs above and at `apps/mobile/src/components/BudgetEditorModal.tsx:59-65`, `apps/mobile/src/components/IncomeEditorModal.tsx`, `apps/mobile/app/(onboarding)/income.tsx:41`. Missing future-date guard at `apps/web/src/app/dashboard/transactions/page.tsx:560-565` (the only date input in the product). Empty merchant is accepted everywhere and renders as "Unnamed" / "Unknown" — acceptable, but it means the Insights "Top merchants" card can be topped by "Unnamed". (grepped: `parseFloat`, `<= 0`, `canSave`, `type="number"`, `datetime-local`)
- **Fix:** Put one validator in `packages/shared/src/utils/validation.ts` — `validateAmount(raw, currency): {ok, value, error}` enforcing `> 0`, `<= 9_999_999_999.99`, at most 2 decimals — and use it at all eight call sites, rendering the returned message rather than silently returning. Add `max={todayIso}` to the web date input and reject future `transacted_at` (or require an explicit "scheduled" opt-in).
- **Regression test to add:** Entering `0` in the voice-confirm sheet must render an inline error, and the Save button must be disabled.

### F43. The transaction detail screen resolves the linked rule differently from the edit screen, and shows a play button that plays nothing
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/transaction/[id].tsx:217,331-348` vs `apps/mobile/app/transaction/edit.tsx:103-106`
- **What the user sees:** For a server-generated recurring occurrence, the detail screen shows a bare "Recurring" chip with no frequency and no next-due date, while tapping Edit on the same transaction correctly finds the rule and offers the "this occurrence / all future" scope prompt. Separately, voice-logged transactions show a sage circle with a play triangle next to the transcript; it is inside a plain `View`, so tapping it does nothing and nothing indicates it is decorative.
- **Root cause:** Two different lookup strategies for the same relationship:

```ts
// apps/mobile/app/transaction/[id].tsx:217
  const linkedRule = txn.is_recurring ? rules.find((r) => r.template_txn_id === txn.id) ?? null : null
```
```ts
// apps/mobile/app/transaction/edit.tsx:98-106 — with an explanatory comment about this exact bug
    // Look up the linked rule. Template txns (the original "this is
    // recurring" entry) are found via `template_txn_id`. Server-cron-
    // or catch-up-generated occurrences carry the rule's id on the
    // row itself via `recurring_rule_id` — those won't match the
    // template lookup, which is the LOGIC §3.3 bug. Try both.
    const linkedRule =
      (txn.recurring_rule_id
        ? rules.find((r) => r.id === txn.recurring_rule_id)
        : null) ?? rules.find((r) => r.template_txn_id === txn.id) ?? null
```
The edit screen's comment documents the defect by name — and the fix was applied in one file only. The transcript card (`[id].tsx:331-348`) is a plain `<View style={styles.transcriptCard}>` containing a non-interactive `<Ionicons name="play">`; the surrounding comment concedes "tapping it doesn't play anything yet".
- **Blast radius:** Every generated occurrence once F2 is fixed. The play glyph is a false affordance on the app's signature surface and is visible today on any voice-logged transaction with a transcript.
- **Same defect elsewhere:** `apps/mobile/src/components/RecurringPatternBanner.tsx` and `apps/web/src/app/dashboard/recurring/page.tsx` each resolve rule↔transaction linkage their own way. (grepped: `template_txn_id`, `recurring_rule_id`, `linkedRule`)
- **Fix:** Extract `findRuleForTransaction(txn, rules)` into `packages/shared` and use it at all four sites. Replace the play triangle with a non-interactive quote glyph, or wire real playback (which requires storing audio — a privacy decision, not a UI one).
- **Regression test to add:** A transaction with `source='recurring_generated'` and a valid `recurring_rule_id` must render frequency and next-due on the detail screen.

### F44. The same destination has three different names across the product
- **Severity:** Medium
- **Status:** User-reported (Insights vs Reports & forecast) — full inventory below
- **Where:** `apps/web/src/components/Sidebar.tsx:40`, `apps/web/src/app/dashboard/insights/page.tsx:342,347`, `apps/mobile/app/(tabs)/_layout.tsx` (`tabs.insights`), `packages/shared/src/i18n/locales/en.json` (`insights.heading`)
- **What the user sees:** The web sidebar row says **"Reports & forecast"**; clicking it opens a page whose toolbar title is **"Insights"** and whose H1 is **"Forecast & patterns"**; the mobile tab for the same feature is **"Insights"**. Three names, one destination, on two screens.
- **Root cause:** Each surface labels itself independently:

```ts
// apps/web/src/components/Sidebar.tsx:40
  { key: 'reports', label: 'Reports & forecast', href: '/dashboard/insights', icon: Icon.chart, group: 'analyze' },
```
```tsx
// apps/web/src/app/dashboard/insights/page.tsx:342,347
      <Toolbar title="Insights" right={<InsightsToolbarRight />} />
            Forecast & patterns
```
- **Blast radius:** Navigation confidence, support conversations, and documentation. Full inventory of mobile↔web naming disagreements for the same concept, all verified in code:
  - Insights (mobile tab) / "Reports & forecast" (web sidebar) / "Insights" (web toolbar) / "Forecast & patterns" (web H1)
  - "History" (mobile Today header icon → `/more/transactions`, labelled `more.transactions`) / "Transactions" (web sidebar)
  - "More" (mobile tab) — no web equivalent; its children are split between the sidebar and Settings
  - "Recurring" (both) but "Recurring & subscriptions" as the web H1 and "Active subscriptions" as the mobile section head
  - "Recurring" as a *source* chip on web (`transactions/page.tsx:774-780`) vs "Recurring" as a *state* chip on mobile (`transaction/[id].tsx:285-296`) — same word, different meanings (F37)
  - "Export" (web sidebar, Plus) / "Export my data" (mobile Settings → Data, Plus) / "Export all my data" (web Settings → Privacy, free) / "Export all" (mobile Privacy, free) — four labels for two different features with different gating
  - "Murmur Plus · Desktop" (paywall eyebrow) / "desktop companion" (web Settings About) / "web companion" (web Settings Sync)
- **Same defect elsewhere:** Listed exhaustively above. (grepped: `label:`, `title=`, `Toolbar title`, `tabs\.`, `more\.`)
- **Fix:** Write one naming table into `docs/DESIGN.md`, put every navigation label in the shared i18n bundle (which F34 requires anyway), and have both platforms read from it. One key per destination.
- **Regression test to add:** A test asserting the sidebar label, toolbar title, and page H1 for each route all derive from the same i18n key.

### F45. The Calendar lens shows a converted day total above unconverted row amounts
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/web/src/components/lenses/Calendar.tsx:31,74,245,305`
- **What the user sees:** In the day-detail panel, the big total is computed from `amount_in_profile_currency` but each row beneath prints the transaction's raw `amount` formatted with the *profile* currency symbol. For a EUR-profile user with a $50 US charge, the rows say "−€50.00" while the total says "−€43.12", and the rows do not add up to the total shown directly above them.
- **Root cause:** Two different fields, one formatter:

```ts
// apps/web/src/components/lenses/Calendar.tsx:31  — total
    dayTotal[day] += aggAmount(t)
// :305  — row
                  −{fmt(t.amount, props.currency, props.locale)}
```
`LensTxn` (`lenses/types.ts:11-21` — nine fields, none of them `currency_code`) omits the currency, so the lens cannot format the row in its own currency even if it wanted to. The file header at `types.ts:1-9` explicitly warns that "The raw `amount` column is the transaction's own currency and is the right field for rendering a single-row figure" — but the type it introduces does not carry the currency needed to do that.
- **Blast radius:** The Calendar lens day panel. Any FX-pending row (`amount_in_profile_currency = null`) contributes 0 to the total (`aggAmount` at `fx.ts:36-40`) while still showing a full row amount, so the arithmetic visibly fails.
- **Same defect elsewhere:** `apps/mobile/app/(tabs)/index.tsx:56` (`weeklySpendBars` sums raw `txn.amount` for the MiniBars chart instead of `aggAmount`). `apps/web/src/app/dashboard/recurring/page.tsx:408-415,474-481` renders `Money value={-c.amount} currency={c.currency_code || currency}` — correct per-row, but summed currency-blind in the header stats (F18). `apps/web/src/app/dashboard/export/page.tsx:109-110` correctly emits both amount and currency per CSV row. (grepped: `t.amount`, `aggAmount`, `LensTxn`)
- **Fix:** Add `currency_code` to `LensTxn` (`types.ts:11-21`) and populate it in `dashboard/page.tsx:62-71`, then format each row with its own currency. Show a "N transactions pending conversion" note when any row in the day has a null snapshot — `isFxPending` already exists at `fx.ts:48-52` and, verified by grep, has zero call sites anywhere in the repo.
- **Regression test to add:** A EUR profile with one USD row must render the row in USD and a converted total, with a pending-conversion note when the snapshot is null.

### F46. Mobile offers three budget periods; web writes five, and mobile mislabels the two it cannot edit
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/components/BudgetEditorModal.tsx:16-20` vs `apps/web/src/app/dashboard/budgets/page.tsx:13-19`; label logic `apps/mobile/app/(tabs)/budgets.tsx:32-56`
- **What the user sees:** A user sets a **quarterly** budget on web. On mobile, the Budgets tab header shows "AUGUST · 24 days to go" (days left in the *month*, not the quarter) and opening the editor shows only Weekly / Bi-weekly / Monthly with none selected — saving from that sheet silently converts their quarterly budget to monthly. Per-category budgets set on web are invisible on mobile, which says "Per-category budgets arrive in the next release".
- **Root cause:** Divergent option lists:

```ts
// apps/mobile/src/components/BudgetEditorModal.tsx:16-20
const BUDGET_PERIODS: { value: BudgetPeriod; key: string }[] = [
  { value: 'weekly',   key: 'settings.period_weekly' },
  { value: 'biweekly', key: 'settings.period_biweekly' },
  { value: 'monthly',  key: 'settings.period_monthly' },
]                                                              // 3
// apps/web/src/app/dashboard/budgets/page.tsx:13-19
const PERIODS = [weekly, biweekly, monthly, quarterly, yearly]  // 5
```
and mobile's `daysLeftInPeriod` falls through quarterly/yearly to the monthly branch:
```ts
// apps/mobile/app/(tabs)/budgets.tsx:43-45
  // monthly (default) / quarterly / yearly: days-left in the current month.
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return Math.max(1, end.getDate() - now.getDate() + 1)
```
`usePeriodSpend` (`useBudget.ts:98-101`, the `else` branch commented "monthly (default) and others") likewise treats quarterly and yearly as monthly.
- **Blast radius:** A quarterly or yearly budget is computed against a one-month window on mobile, so it will read as ~3× or ~12× under-spent against the cap while the header says "days to go" for the wrong period. The schema allows all five (`001_initial_schema.sql:173` plus `002_add_biweekly_budget_period.sql:7`), so this is a client-side gap on the platform that is the primary interface.
- **Same defect elsewhere:** The per-category budget gap is the same shape — web ships the feature (`budgets/page.tsx:229-247,442-508`) while mobile renders `budgets.by_category_coming_soon` ("Per-category budgets arrive in the next release.", `en.json:302`) at `budgets.tsx:166-171`. `useActiveBudget` filters to `.is('category_id', null)` (`useBudget.ts:18`), so mobile silently ignores every category budget the user creates on web. (grepped: `BUDGET_PERIODS`, `PERIODS`, `daysLeftInPeriod`, `category_id`)
- **Fix:** Ship all five periods in `BudgetEditorModal`, implement real quarterly/yearly windows in the shared `budgetWindow` helper from F17, and either build the mobile per-category list or hide the web feature until mobile can read it. An empty state must never claim "next release" for something already shipping on a sibling platform.
- **Regression test to add:** Create a quarterly budget on web, and assert mobile's Budgets tab shows a quarter-scoped spend and a quarter-scoped "days to go".

### F47. The root `eas.json` production profile has no environment block
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `eas.json:24-26` vs `apps/mobile/eas.json:45-54`
- **What the user sees:** Nothing today — the shipping build is driven from `apps/mobile/eas.json`, whose production profile does define the three `EXPO_PUBLIC_*` variables. But the repo contains a second, divergent `eas.json` at the root whose `production` profile is exactly `{ "autoIncrement": true }` with no `env`. A build run from the repo root would ship with `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` undefined (no sign-in possible at all) and `EXPO_PUBLIC_API_BASE_URL` falling back to `http://localhost:3000` (`apps/mobile/src/hooks/useApiUrl.ts:5`), so every voice parse, scan, and Ask request would fail on-device.
- **Root cause:** Two config files for one app, drifting. The root file has env for `development` and `preview` only; the mobile file has env for all four profiles (`development`, `development-simulator`, `preview`, `production`) plus the pinned `ascAppId` in its `submit` block.
- **Blast radius:** A silent, catastrophic, hard-to-diagnose release. `apps/mobile/.env` is git-ignored, so a fresh clone has no local fallback either.
- **Same defect elsewhere:** None found — but note the anon key is committed in plaintext in both files (acceptable for a publishable key, worth confirming it is the publishable and not the service role: it is `sb_publishable_…`). (grepped: `EXPO_PUBLIC_API_BASE_URL`, `eas.json`)
- **Fix:** Delete the root `eas.json`. One app, one config. Add a boot-time assertion that `EXPO_PUBLIC_SUPABASE_URL` is defined and throws loudly rather than falling back.
- **Regression test to add:** A CI check that every profile in every `eas.json` defines the three required `EXPO_PUBLIC_*` keys.

### F48. Untranslated literals and locale-blind formatting inside otherwise-localized screens
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/more/transactions.tsx:208-210`, `apps/mobile/app/(auth)/sign-in.tsx:55`, `apps/mobile/app/(auth)/sign-up.tsx:30`, `apps/mobile/app/transaction/[id].tsx:151`, `apps/mobile/app/(tabs)/insights.tsx:190-193`, `apps/mobile/app/more/settings.tsx:142,146-148`
- **What the user sees:** A French user sees an "All" pill among translated category filters; the entire sign-in and sign-up experience in English regardless of device language; an undo snackbar formatted in English (`formatCurrency(amount, code)` with the `locale` argument omitted, so it defaults to `'en'`); an Insights range label assembled as `"août 1 – 18"` by string-joining a localized month name with a bare `1`; and Settings showing `USD 500` instead of `$500`.
- **Root cause:** Hardcoded strings and dropped locale arguments:

```tsx
// apps/mobile/app/more/transactions.tsx:208-210
              <Text style={[styles.pillLabel, !selectedCategoryId && styles.pillLabelActive]}>
                All
              </Text>
```
```ts
// apps/mobile/app/(auth)/sign-in.tsx:52-55 — with a comment acknowledging the choice
  // Locale source: pre-auth, the user has no Supabase profile yet, so we fall
  // back to English. The full locale picker lives in Settings + onboarding's
  // income step — both reachable post-sign-in.
  const locale: Locale = 'en'
```
```ts
// apps/mobile/app/transaction/[id].tsx:151
    const formatted = formatCurrency(snapshot.amount, snapshot.currency_code || currency)  // no locale arg
```
```ts
// apps/mobile/app/(tabs)/insights.tsx:190-193
  const rangeLabel = [
    `${monthStart.toLocaleDateString(locale, { month: 'short' })} 1`,
    rangeEnd.getDate().toString(),
  ].join(' – ')
```
- **Blast radius:** Cosmetic, but the sign-in screen is the first impression for every non-English user.
- **Same defect elsewhere:** All listed above; the locale bundles themselves are complete (432 keys in each of en/fr/es/pt, zero gaps — verified by key count). (grepped: `formatCurrency\(`, `locale: Locale = 'en'`, `>All<`)
- **Fix:** Add the missing keys, seed the pre-auth locale from `expo-localization`'s `getLocales()`, always pass `locale` to `formatCurrency`, and use `Intl.DateTimeFormat.formatRange` for the Insights label.
- **Regression test to add:** A lint rule banning bare string literals inside `<Text>` in `apps/mobile/app/**`.

### F49. Non-interactive rows, missing confirmations, and stale brand comments
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/transactions/page.tsx:686-695`, `apps/web/src/app/dashboard/budgets/page.tsx:199-202,490-492`, `apps/web/src/components/Toolbar.tsx:59-66`, `apps/mobile/app/(auth)/sign-in.tsx:125,282`, `apps/web/src/app/dashboard/settings/page.tsx:337-399`
- **What the user sees:**
  - Transaction rows on web are `<div key onClick title="Click to edit" style={...}>` with no `role`, `tabIndex`, or key handler — the edit form is unreachable by keyboard or screen reader, on the app's densest data surface.
  - The `×` on a category budget (`budgets/page.tsx:490-492` → `handleRemove:199-202`) deactivates it immediately with no confirmation and no undo, unlike the transaction delete which does confirm (`transactions/page.tsx:352`).
  - The toolbar search box appears on Budgets, Recurring, Insights, and Settings, but its `submit` handler (`Toolbar.tsx:59-66`) always `router.push`es to `/dashboard/transactions?q=` — it looks like a filter for the current page and is not.
  - Code comments in the sign-in screen still describe the retired logo — `sign-in.tsx:125` ("Murmur — The Listening Drop, sage-tile variant per brand sheet §02") and `:282` ("The Listening Drop is a self-contained…") — after the Coin & Wave mark change (commit 944f631).
  - The Settings account form has no unsaved-changes guard; navigating away silently discards edits.
- **Root cause:** Each is an isolated omission; together they read as an unfinished polish pass. **Verification note on the brand question:** there is no branding inconsistency. `docs/PLAN.md:3441-3445` records "Coin & Wave" as the adopted *logo mark*, replacing The Listening Drop mark on Aug 7 2026 — it was never a product rename. `PRODUCT_NAME` in `packages/shared/src/brand.ts:11` is and remains `'Murmur'`, which is correct and current. The two stale comments above are the entire issue; the "replacing The Listening Drop" mentions in `apps/mobile/src/components/MurmurMark.tsx:8`, `apps/web/src/components/MurmurMark.tsx:2` and `apps/mobile/assets/brand/murmur-mark-cream.svg:4` are accurate historical notes and need no change.
- **Same defect elsewhere:** Other `<div onClick>` rows: `apps/web/src/app/dashboard/ask/page.tsx` history items use real `<button>`s (correct). Unconfirmed destructive actions: `apps/web/src/app/dashboard/recurring/page.tsx:490` (pause is reversible, acceptable). (grepped: `onClick={() =>`, `role=`, `tabIndex`, `window.confirm`, `Listening Drop`)
- **Fix:** Convert the transaction row to a `<button>` (or add `role="button" tabIndex={0}` plus an `onKeyDown` Enter/Space handler); add a confirm to budget removal; scope the toolbar search to the current page or move it into the Transactions page only; update the two `sign-in.tsx` comments; add a `beforeunload` + route-change guard to the Settings form.
- **Regression test to add:** An axe-core accessibility assertion on `/dashboard/transactions` with zero critical violations.

### F50. Every "live update" in the product is dead wire — the realtime publication is empty
- **Severity:** High
- **Status:** Newly discovered during verification
- **Where:** `apps/mobile/src/hooks/useTransactions.ts:44-73` (`.channel(channelName)` at `:52`), `apps/web/src/app/dashboard/transactions/page.tsx:159-190` (`:167`), `apps/web/src/app/dashboard/budgets/page.tsx:115-159` (`:125`), `apps/web/src/app/dashboard/recurring/page.tsx:191-221` (`:199`); live database object `pg_publication` / `supabase_realtime`
- **What the user sees:** Nothing ever updates by itself. An expense logged on the phone does not appear on the open desktop dashboard — the Budgets ring, the Transactions table, and the Recurring list all stay on the numbers they were rendered with until the user reloads or re-navigates. On mobile, a transaction added or edited on the web never lands in SQLite until the next cold start (which then also hits F24's 200-row cap). Four separate code comments promise the opposite behaviour, e.g. `budgets/page.tsx:109-114` ("Without this, an expense logged on mobile leaves the desktop Budgets ring stuck on stale numbers until the user reloads the page (DESKTOP §4.4)").
- **Root cause:** Nothing is published. Verified directly against the live project (`ohaqhwampmyoeaopdybd`):

```sql
select schemaname, tablename from pg_publication_tables where pubname = 'supabase_realtime';
-- []   (zero rows)
```

Supabase only forwards `postgres_changes` for tables added to the `supabase_realtime` publication. `transactions`, `budgets` and `recurring_rules` are all absent, so every `.on('postgres_changes', ...)` handler in the four files above is registered against a stream that will never emit. The subscriptions themselves succeed (the channel joins), which is why nothing errors and nothing logs — the failure mode is pure silence. No migration in `supabase/migrations/` ever runs `ALTER PUBLICATION supabase_realtime ADD TABLE ...`, so this was never configured, in any environment.
- **Blast radius:** The entire cross-device story, which is the stated justification for the paid desktop tier. It also masks F36 (a leaked channel that receives nothing costs nothing) and compounds F41 — the Settings row says "Synced just now" on a page whose live-sync machinery has never once fired. Combined with F8 and F23 a user can have a jammed outbound queue *and* a dead inbound stream while every screen looks perfectly healthy.
- **Same defect elsewhere:** These are the only four realtime subscriptions in the repo (grepped `\.channel\(` across `apps/mobile/src`, `apps/mobile/app`, `apps/web/src` — five hits, one of which is a type annotation at `transactions/page.tsx:161`). All four are equally dead.
- **Fix:** Add a migration that publishes the tables the clients subscribe to — `ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions, public.budgets, public.recurring_rules;` — so the configuration is version-controlled rather than a dashboard click that can be lost on a project restore. Set `REPLICA IDENTITY FULL` on those tables if the client filters need pre-image columns. Then add a smoke test to CI that asserts `pg_publication_tables` contains them; otherwise this silently regresses the next time the project is recreated. Do **not** "fix" this by adding polling to the four pages — that would stack a workaround on a one-line configuration gap.
- **Regression test to add:** A migration test asserting `select count(*) from pg_publication_tables where pubname='supabase_realtime'` is 3, plus an integration test that inserts a transaction as user A and asserts a subscribed client receives the change event.

### F51. Google sign-in on web and desktop can never complete — the middleware swallows `/auth/callback`
- **Severity:** Critical
- **Status:** Newly discovered during verification
- **Where:** `apps/web/middleware.ts:30-35,44-46`; the unreachable handler `apps/web/src/app/auth/callback/route.ts:4-18`; entry point `apps/web/src/app/login/page.tsx:25-39`
- **What the user sees:** On the web dashboard (and therefore inside the packaged desktop app), clicking "Continue with Google" completes the Google consent screen, bounces back to the app — and lands on the login page again, unauthenticated. No error is shown; the URL just returns to `/login`. The only web sign-in that works at all is email/password, and Apple accounts have no password (F9).
- **Root cause:** The middleware matcher excludes only static assets, so `/auth/callback` runs through it. At that moment the PKCE `?code=` has not been exchanged yet, so there is no session cookie and `getUser()` returns null — which trips the unauthenticated redirect before the route handler is ever invoked:

```ts
// apps/web/middleware.ts:28-35
  const { data: { user } } = await supabase.auth.getUser()

  const isLoginPage = request.nextUrl.pathname.startsWith('/login')
  const isApiRoute = request.nextUrl.pathname.startsWith('/api')

  if (!user && !isLoginPage && !isApiRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
```
```ts
// apps/web/middleware.ts:44-46
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```
`/auth/callback` is neither a login page nor an API route, so it is redirected away. `apps/web/src/app/auth/callback/route.ts:11` (`exchangeCodeForSession(code)`) is therefore dead code: the only path that would set the session is the one path the middleware refuses to let run.
- **Blast radius:** The paid desktop companion — the headline Plus benefit — cannot be signed into by the provider the login page leads with. Combined with F9 (no Apple on web) and F7 (no password reset), a user who signed up on mobile with Google or Apple has no way into web or desktop at all, and no way to recover if they try email/password instead. The `?error=auth_failed` branch at `route.ts:17` never fires either, so the failure produces no diagnostic anywhere.
- **Same defect elsewhere:** None found — `/auth/callback` is the only non-`/api`, non-`/login` route that must be reachable while unauthenticated. Verified by listing the App Router tree: the other nine `page.tsx` routes are `/`, `/login`, and the seven `/dashboard/*` pages, all of which correctly require a session. (grepped: `middleware`, `matcher`, `exchangeCodeForSession`, `auth/callback`)
- **Fix:** Add the callback to the middleware's public set — the honest form is an explicit allow-list rather than another `startsWith` bolted onto the condition: `const PUBLIC_PREFIXES = ['/login', '/api', '/auth']` and `if (!user && !PUBLIC_PREFIXES.some(p => pathname.startsWith(p)))`. Do not solve it by removing the matcher's coverage of `/auth`, which would also stop the session-refresh cookie write that the same middleware performs. Because this is an "it never worked" defect rather than a regression, the fix must be paired with an end-to-end test, not just a code review.
- **Regression test to add:** E2E — complete a Google OAuth round trip against the deployed preview and assert the browser ends on `/dashboard` with a session cookie set, not on `/login`.

## Refuted during verification

No finding was deleted outright — every one of F1–F49 describes a defect that exists in the code as cited. The following **sub-claims inside otherwise-valid findings** were refuted and have been corrected in place:

- **F3 — "wrong FX snapshot date".** Refuted: `snapshotFx(now, ...)` at `useTransactions.ts:90` uses the same `now` that is written to `transacted_at:106`, so rate-date and row-date agree today. It becomes a defect only after F3's own fix lands.
- **F11 — "at most four months" in the trend denominator.** Refuted: `monthlyTotals` has six entries and `slice(0, -1)` yields five, not four. Corrected.
- **F14 — "the arc is empty".** Partially refuted: the progress arc is not rendered at all when `overall` is undefined (gated at `budgets/page.tsx:388`), rather than rendered empty. Symptom rewritten; severity reduced to Medium because the figure shown is real, correctly computed spend.
- **F17 / F18 / F27 / F38 / F40 — "the user sees X".** Refuted as present-tense symptoms: all are masked today (F17/F18/F40 by F2's zero rules; F27 by `plus_status` having no writer; F38's charge highlighting by the same zero rules). Each has been reworded to state what is visible now versus what surfaces after the blocking fix, with severity adjusted accordingly.
- **F29 — `IncomeEditorModal` listed as a hardcoded-`$` occurrence.** Refuted: it takes `currency` as a prop and resolves the glyph through `currencySymbolFor`. Removed from the list.
- **F36 — "each stale subscription issues four Supabase queries per change; the connection is eventually dropped".** Refuted: the `supabase_realtime` publication contains zero tables (confirmed by query — see F50), so a stale channel receives no events and issues no queries. The cleanup leak is real; the stated consequence is not. Downgraded to Low.
- **F38 — "the Heaviest day line is derived from the same offsets".** Refuted: `heaviestDate` (`recurring/page.tsx:316-323`) converts the offset back to a real calendar date before formatting and prints correctly. Clause removed.
- **F49 — stale brand comment at `sign-up.tsx:81`.** Refuted: `sign-up.tsx` contains no "Listening Drop" comment. The two real occurrences are `sign-in.tsx:125` and `sign-in.tsx:282`. Corrected. The broader "branding is inconsistent" premise is also explicitly **not** a finding: `docs/PLAN.md:3441-3445` records Coin & Wave as a logo-mark replacement, never a product rename, and `PRODUCT_NAME` is correctly `'Murmur'`.

## Unverified suspicions

- **`useProfile`'s 5-second retry budget may strand users on a slow network.** `apps/mobile/src/hooks/useProfile.ts:24-70` cannot distinguish "trigger hasn't fired yet" from "the query failed", and after `PROFILE_RETRY_BUDGET_MS` it sets `profile = null` and `loading = false`. `_layout.tsx:71-77` then holds the user on `/(auth)` indefinitely because `if (!profile)` has no else branch. I could not confirm the observable symptom without a device on a degraded connection, but the code path exists.
- **`record.tsx:180-182` calls `setConfirmModalVisible(true)` during render.** React tolerates a same-component setState during render, but combined with the `useFocusEffect` tab sync at `:99-104` I suspect a double-render or a modal that reopens after dismissal in some navigation orders. I could not reproduce it by reading alone.
- **`upsertTransaction`'s `WHERE excluded.version >= transactions.version` guard (`transactionStore.ts:77`) versus web edits.** Web bumps `version` explicitly (`transactions/page.tsx:307`) but `handleDelete` (`:360-368`) bumps it too, so the guard should hold. I did not verify what happens when the `set_transactions_updated_at` trigger and the client-supplied `updated_at` disagree, which could make `pullRemote`'s `.gt('updated_at', since)` cursor skip a row.
- ~~**The `generate-recurring` Edge Function's schedule.**~~ **Resolved during verification.** The cron job *does* exist in the live database — `cron.job` id 1, `generate-recurring-daily`, schedule `0 6 * * *` — but it is untracked by any migration (created by hand in the dashboard, so a project restore loses it), and it stores a `sb_secret_…` Supabase secret key in plaintext inside `cron.job.command` as a Bearer header, readable by anything that can select from `cron.job`. That is a credential-exposure finding in its own right; it belongs to the database/infrastructure section of this audit rather than the screen sweep, and is recorded there.
- **`useProfile`'s 5-second retry budget** (above) is now partly confirmed by reading: `useProfile.ts:53-57` does set `profile = null` and `loading = false` after the budget expires, and `_layout.tsx:71-72` has an empty `if (!profile)` branch that holds the user on `/(auth)`. What remains unverified is only the real-world frequency on a degraded connection.
- **Desktop shell specifics.** `apps/desktop/src/main.ts` and `DesktopChrome.tsx` were only skimmed for the `--desktop-title-bar` variable referenced by `dashboard/layout.tsx`. Electron-specific interaction bugs (window state, menu, deep links into the packaged app) are out of the depth I reached.

**Verified:** every finding above was independently re-checked against the code on 2026-08-08.
