# Architecture, wiring, duplication and error handling
**Audit date:** 2026-08-08 - **Scope:** cross-cutting architecture — duplicated business logic, mobile→Supabase→web wiring, package boundaries, error handling, config/env, desktop shell, dead code - **Files examined:** 68 (all findings independently re-verified against source and the live production DB on 2026-08-08)

## Verdict

Not production-ready. The single worst problem is that **the transaction save path is architecturally incapable of reporting failure**: `createTransaction` hard-codes `return { id, error: null }`, the sync drain swallows every exception into a retry counter with no UI, and the one place that does see a real error (`createRule`) answers with `console.warn`. That is why `recurring_rules` has zero rows across all six production users while the UI has been telling people "saved" for weeks. Verification added a fourth compounding fault: **the outbox has no retry scheduler at all** (F43) — `retryTimer` is declared and cleared but never set, so a queue that fails while the device stays online is parked until the app is relaunched.

The systemic cause is that **`packages/shared` holds types and three utilities, but every behavioural rule lives twice — once in `apps/mobile` and once in `apps/web` — and the two copies are kept in sync by comments that say "copy the change over here."** There is no shared domain layer. `packages/supabase` exists, exports query helpers for exactly the tables both apps read, and is imported by zero source files (only by a babel alias, a tsconfig path and a package.json dep). So mobile and web each invented their own answer to "what is this transaction's source?", "what colour is this category?", "what symbol is this currency?", "when does this rule fire next?" — and those answers disagree.

A second structural fault compounds it: the web app passes **`Date` objects across the React Server Component boundary**. A server-built local-midnight `Date` re-materialises in the browser five hours earlier, which is the exact, arithmetically-confirmed cause of the calendar rendering August's 1st in the FRI column and reporting "WEDNESDAY · JUL 8".

**What verification changed.** Every mechanism in the five Critical findings held up under re-reading, and the live DB confirmed F1 (the `fk_template_txn` constraint exists; 3 rows carry `is_recurring=true` and zero carry a `recurring_rule_id`). What did *not* hold up was the severity distribution: the original draft rated 20 findings High. All six production profiles are `currency_code='USD'`, `locale='en'`, `timezone='UTC'`, and all 17 live transactions have a non-null FX snapshot — so several "High" findings are real defects that are currently *latent* rather than currently *firing*, and have been downgraded and labelled as such. Three genuine findings were added (F43–F45), one was deleted as refuted (F38).

## Findings summary

| # | Severity | Finding | Primary file |
|---|----------|---------|--------------|
| F1 | Critical | Marking a transaction recurring can never create a rule — FK race against an unsynced transaction, failure swallowed | `apps/mobile/app/(tabs)/record.tsx:205` |
| F2 | Critical | Overview lenses render the wrong month — `Date` crosses the RSC boundary and shifts a day/month back | `apps/web/src/components/lenses/Calendar.tsx:18-22` |
| F3 | High | Mobile renders a hard-coded `$` and `en-US` grouping on eleven money surfaces regardless of the user's currency (latent: all 6 prod profiles are USD/en) | `apps/mobile/src/components/Money.tsx:44,51` |
| F4 | Critical | `createTransaction` can never return an error — the save path is structurally unable to fail | `apps/mobile/src/hooks/useTransactions.ts:131` |
| F5 | Critical | Sync failures are invisible, unbounded, and self-resurrecting; the dead-letter UI does not exist | `apps/mobile/src/services/sync/SyncManager.ts:137-143` |
| F6 | Medium | Web renders a "Recurring" **source chip** derived from `is_recurring`; mobile's detail screen shows "Manual"/"Voice" for the same row | `apps/web/src/app/dashboard/transactions/page.tsx:64-71` |
| F7 | High | The AI's `transacted_at` is discarded — every voice/scan/shortcut transaction is stamped "now" | `apps/mobile/src/hooks/useTransactions.ts:106` |
| F8 | High | `aggAmount` silently returns 0 for un-snapshotted rows — money vanishes from every total with no indicator; `isFxPending` exists to surface it and has zero callers | `packages/shared/src/utils/fx.ts:36-40,48-52` |
| F9 | Medium | `recurring_rule_id` is never written back onto the transaction after a rule is created | `apps/mobile/app/(tabs)/record.tsx:205-217` |
| F10 | Medium | Android notification listener is wired to a no-op callback — the whole feature is a permission prompt (Android-only surface; not rendered on the shipping iOS build) | `apps/mobile/app/more/settings.tsx:174-176` |
| F11 | Medium | "Apple Pay" filter and chip are a fabrication over two unrelated sources; zero production rows carry either | `apps/web/src/app/dashboard/transactions/page.tsx:59,69` |
| F12 | High | Apple Pay Shortcut install link is literally `.../shortcuts/placeholder` — the only iOS automation surface is a dead link | `apps/mobile/app/more/settings.tsx:196` |
| F13 | Low | `synced_at` is only ever stamped locally, and `pullRemote`'s blind upsert wipes it — but nothing reads the column | `apps/mobile/src/services/sync/SyncManager.ts:126,170-175` |
| F14 | Medium | `profile.timezone` is declared, typed, defaulted — and neither written nor read; the app has no user-timezone concept at all | `supabase/migrations/001_initial_schema.sql:18` |
| F15 | Medium | Root layout re-runs recurring catch-up, FX backfill and category seeding on **every navigation** | `apps/mobile/app/_layout.tsx:94-106` |
| F16 | Medium | Web forecast extrapolates with no history gate; mobile gates it — same feature, two answers | `apps/web/src/app/dashboard/insights/page.tsx:216-223` |
| F17 | Medium | The web dashboard translates no UI strings, yet ships a Language picker (locale *is* threaded into `Intl`) | `apps/web/src/app/layout.tsx:12` |
| F18 | High | `NSAllowsArbitraryLoads: true` ships in the production iOS build — and an ungated Settings → Developer row lets any user repoint the AI endpoint at a plaintext host | `apps/mobile/app.config.js:21-23` |
| F19 | High | No environment separation — all four EAS profiles point at production Supabase and production Vercel | `apps/mobile/eas.json:13-53` |
| F20 | Medium | Two divergent config trees; the root `eas.json` production profile has no env at all | `eas.json:24-26` |
| F21 | Medium | The `NODE_ENV` hatch cannot fire in either shipping path; the real hole is the user-writable `MURMUR_DEV_PLUS=1` file hatch on desktop | `apps/web/src/lib/plus.server.ts:29-30` |
| F22 | High | Recurrence scheduling is implemented three times in three runtimes, all carrying the same month-end overflow bug | `apps/mobile/src/hooks/useRecurringRules.ts:42-60` |
| F23 | Medium | `parseExpenseLocally` can never return a result — its result block and both fallback branches are unreachable | `packages/ai/src/localParser.ts:50-53` |
| F24 | Medium | `ParsedExpense` has no `note` field — the AI can never capture the descriptive half of an utterance | `packages/shared/src/types/ai.ts:3-18` |
| F25 | Medium | `recurringPatternDetector` duplicated, with a comment inviting drift | `apps/web/src/lib/recurringPatternDetector.ts:1-4` |
| F26 | Medium | 65-entry `KNOWN_DOMAINS` duplicated byte-for-byte; the fallback tile is white-on-mid-tone at ~2.2–2.8:1 contrast on **both** platforms | `apps/web/src/components/MerchantLogo.tsx:13-81` |
| F27 | Medium | Category colour is defined three times with three different palettes and three different key sets | `apps/web/src/lib/theme.ts:52-61` |
| F28 | Medium | `Money` implemented twice with incompatible APIs | `apps/mobile/src/components/Money.tsx:38-47` |
| F29 | Medium | A second, divergent currency-symbol mapping with a shorter list than the shared one | `apps/mobile/app/(tabs)/index.tsx:319-327` |
| F30 | Medium | `formatCurrency` called without a locale at **eleven** lines across mobile *and* web, including inside locale-aware components | `apps/mobile/src/components/SafeToSpend.tsx:43` |
| F31 | Medium | `packages/supabase` is a fully dead workspace package | `packages/supabase/src/index.ts:1-5` |
| F32 | Low | `deleteTransaction` drops the sync enqueue when the row is not in React state — **latent only**: it has zero callers; the live delete path is a divergent inline copy | `apps/mobile/src/hooks/useTransactions.ts:134-154` |
| F33 | Medium | Desktop shell has no `will-navigate` guard and the web app serves no CSP | `apps/desktop/src/main.ts:191-217` |
| F34 | Medium | `profileCurrency` defaults to `'USD'` and the sign-out reset its own docstring promises does not exist | `apps/mobile/src/services/profileCurrency.ts:21` |
| F35 | Medium | Delete sync has no version guard — a stale delete clobbers a newer server edit | `apps/mobile/src/services/sync/SyncManager.ts:127-134` |
| F36 | Low | Nine exported functions with zero callers, including the entire dead-letter recovery surface | `apps/mobile/src/services/sync/syncQueue.ts:53-64` |
| F37 | Low | Month-boundary helpers exist in `shared` and are used by nobody; both apps re-implement them | `packages/shared/src/utils/date.ts:1-11` |
| F39 | Low | Support address points at an unregistered domain and is shipped on two platforms | `packages/shared/src/brand.ts:17` |
| F40 | Low | Desktop app loads fonts from Google over the network; offline launch degrades typography | `apps/web/src/app/layout.tsx:14-17` |
| F41 | Low | `/auth/callback` is unreachable dead code behind the middleware (not a redirect vulnerability) | `apps/web/src/app/auth/callback/route.ts:7,13` |
| F42 | Low | `.gitignore` tail is corrupted UTF-16, so its last two rules never match | `.gitignore` (final lines) |
| F43 | High | **New.** The outbox has no retry scheduler — `retryTimer` is declared and cleared but never set, despite a docstring promising exponential backoff | `apps/mobile/src/services/sync/SyncManager.ts:32,54-57` |
| F44 | High | **New.** `pullRemote` restores at most 200 rows and never paginates; its `since` argument is always `undefined` | `apps/mobile/src/services/sync/SyncManager.ts:156-176` |
| F45 | Medium | **New.** `useTransactions` is instantiated independently by eleven screens — eleven SQLite readers, eleven full pulls, eleven realtime channels, no shared store | `apps/mobile/src/hooks/useTransactions.ts:12-74` |

## Findings

### F1. Marking a transaction recurring can never create a rule — foreign-key race against a transaction that only exists locally
- **Severity:** Critical
- **Status:** User-reported (production evidence: `recurring_rules` has ZERO rows for every user; 3 of 17 live transactions carry `is_recurring = true` and **zero** carry a `recurring_rule_id`)
- **Where:** `apps/mobile/app/(tabs)/record.tsx:205-217` (voice), `apps/mobile/app/(tabs)/record.tsx:294-306` (manual), `apps/mobile/app/transaction/edit.tsx:161-172` (edit), `apps/mobile/src/hooks/useRecurringRules.ts:133-140` (the swallow), `apps/mobile/src/hooks/useTransactions.ts:122-131` (local-only write), `supabase/migrations/001_initial_schema.sql:161-163` (the constraint)
- **What the user sees:** They flip "Recurring" on in the confirm sheet, tap save, get a success animation, and land on Today. The transaction appears. On the web Recurring page they see "No recurring rules yet". Nothing ever generates. There is no error, no toast, no retry — the switch simply did nothing, permanently.
- **Root cause:** `createTransaction` writes to **local SQLite only** and queues the server write for later:

```ts
// apps/mobile/src/hooks/useTransactions.ts:122-131
    // Write to SQLite immediately (optimistic)
    await upsertTransaction(txn)
    await loadLocal()
    DataEvents.emitTransactions(userId)

    // Queue for Supabase sync
    await enqueue('create', txn.id, txn)
    syncManager.drainQueue()          // fire-and-forget, not awaited

    return { id: clientId, error: null }
```

  Control returns to `record.tsx` the instant the SQLite insert lands. The Postgres row does not exist yet — `drainQueue()` was not awaited, and it begins with `await getPendingEntries(10)` (a SQLite round-trip) before it issues any HTTP call. `record.tsx` meanwhile issues its insert with no intervening await:

```ts
// apps/mobile/app/(tabs)/record.tsx:205-216
    if (!error && expense.isRecurring && txnId) {
      await createRule({
        ...
        template_txn_id: txnId,        // ← references a row Postgres has never seen
      })
    }
```

  So the rule's HTTP request reaches Postgres *first*, and migration 001 declares:

```sql
-- supabase/migrations/001_initial_schema.sql:161-163
ALTER TABLE public.recurring_rules
  ADD CONSTRAINT fk_template_txn
  FOREIGN KEY (template_txn_id) REFERENCES public.transactions(id) ON DELETE SET NULL;
```

  Verified present in the live database: `pg_get_constraintdef` returns `FOREIGN KEY (template_txn_id) REFERENCES transactions(id) ON DELETE SET NULL`. The insert fails with SQLSTATE 23503 (foreign key violation). And the failure is deliberately muted:

```ts
// apps/mobile/src/hooks/useRecurringRules.ts:133-140
    if (error) {
      // Previously silent — the onboarding income step relied on this
      // returning a rule and had no visibility when it didn't. A warn
      // makes the failure loud enough to notice in dev without breaking
      // production.
      console.warn('[useRecurringRules] createRule failed:', error)
      return null
    }
```

  `console.warn` in a TestFlight build goes nowhere. The comment explicitly reasons that a warn is enough — it is not. This is a stacked patch on top of a broken ordering, exactly the pattern the owner has rejected.
- **Blast radius:** Every downstream recurring surface is empty or wrong: the web Recurring page ("No recurring rules yet"), the sidebar's `recurringCount` badge (`apps/web/src/app/dashboard/layout.tsx`), `computeUpcomingRecurring` feeding Safe-to-Spend (`apps/mobile/src/hooks/useRecurringRules.ts:64-79` — always returns 0, so Safe-to-Spend over-states what the user can spend), the `generate-recurring` cron (it iterates `recurring_rules`, which is empty, so the whole recurring product is inert), `runRecurringCatchUp` (`recurringCatchUp.ts:40` returns 0 immediately), the Ask reasoner's `recurring_rules` context array, and the Overview's `recurring` fetch (`apps/web/src/app/dashboard/page.tsx:32-38`). The `is_recurring=true` flag on the transaction is the only surviving trace, which is why web then renders a bogus "Recurring" source chip (see F6).
- **Same defect elsewhere:** The identical create-then-reference-remotely ordering appears at `apps/mobile/app/(tabs)/record.tsx:294-306` (manual tab) and `apps/mobile/app/(onboarding)/income.tsx:32,64` (onboarding income → `createTransaction` then a rule). `apps/mobile/app/transaction/edit.tsx:161-172` calls `createRule({ template_txn_id: txn.id })` on an *existing* row, so it only fails when that row has not yet drained — i.e. intermittently, which is worse to diagnose. The same "log/ignore and return null" swallow pattern also appears at `apps/mobile/src/hooks/useCategories.ts:37-38` (`if (!error) await fetch(); return error ? null : data`) and `apps/mobile/src/hooks/useBudget.ts:40-45`. Grepped: `template_txn_id`, `createRule(`, `console.warn`, `return null` after `error`.
- **Fix:** Architectural, not a patch. The rule and the transaction are one atomic user intent and must be written in one transaction. Two correct options, in order of preference:
  1. **Make the rule the parent.** Create the `recurring_rules` row *first* with `template_txn_id: null`, then create the transaction with `recurring_rule_id` set to the returned rule id, then `UPDATE recurring_rules SET template_txn_id = <txn id>` once the transaction has drained (or drop `template_txn_id` entirely — `recurring_rule_id` on the transaction already expresses the link, and `edit.tsx:103-106` already has to try both directions because of this redundancy).
  2. **Move both writes behind a single Postgres RPC** (`create_transaction_with_rule`) invoked by the sync queue as one queued operation, so ordering and atomicity are the database's problem rather than the client's.
  Either way, `createRule` must **return** its error to the caller and the caller must surface it; delete the `console.warn`.
- **Regression test to add:** Integration test: call `createTransaction({ is_recurring: true })` while the network is offline, bring the network up, drain the queue, and assert that exactly one `recurring_rules` row exists and that the transaction's `recurring_rule_id` points at it.

### F2. Overview lenses render the wrong month — a `Date` crossing the RSC boundary shifts back one day and therefore one month
- **Severity:** Critical
- **Status:** User-reported (calendar showed "1" under FRI; day 8 reported "WEDNESDAY · JUL 8")
- **Where:** `apps/web/src/app/dashboard/page.tsx:55-56` (server constructs), `apps/web/src/components/lenses/types.ts:40-43` (passes `Date` through props), `apps/web/src/components/lenses/Calendar.tsx:1,18-22,70` (client consumes), `apps/web/src/components/lenses/MindMap.tsx:1,499`, `apps/web/src/components/lenses/types.ts:62-82` (`monthDebits` / `monthCredits`)
- **What the user sees:** On 2026-08-08 with no `?month=` in the URL, the Overview header correctly says "August 2026 overview · $0 in · $92 out · 2 transactions", but the Calendar lens directly beneath it draws a **July** grid: the "1" sits in the FRI column, and clicking cell 8 opens a detail panel headed "WEDNESDAY · JUL 8" showing "0 transactions". The page contradicts itself within one screen.
- **Root cause:** `dashboard/page.tsx` is a Server Component. On Vercel the server runs in UTC, so:

```ts
// apps/web/src/app/dashboard/page.tsx:55-56
  const monthStart = new Date(anchorY, anchorM, 1, 0, 0, 0, 0)   // 2026-08-01T00:00:00Z
  const monthEnd = new Date(anchorY, anchorM + 1, 0, 23, 59, 59, 999)
```

  `Date` is a supported type in the React Flight payload, so these objects survive the boundary as the same absolute instants and are handed to a **client** component:

```tsx
// apps/web/src/components/lenses/Calendar.tsx:1,18-22
'use client'
  const year = props.monthStart.getFullYear()
  const monthIdx = props.monthStart.getMonth()
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate()
  // Mon-first offset: Sun=0..Sat=6 -> Mon=0..Sun=6
  const firstDow = (props.monthStart.getDay() + 6) % 7
```

  `getMonth()` / `getDay()` / `getDate()` are **local-time** accessors. In the tester's US Central (CDT, UTC−5) browser, the instant `2026-08-01T00:00:00Z` is *Friday 31 July 2026, 19:00 local*. Therefore:

  - `getMonth()` → **6 (July)**, not 7
  - `getDay()` → 5 (Friday) → `firstDow = (5 + 6) % 7 = 4` → column index 4 of `['Mon','Tue','Wed','Thu','Fri','Sat','Sun']` = **FRI** — exactly the reported grid
  - `daysInMonth = new Date(2026, 7, 0).getDate()` = 31 (July's length)
  - `selDate = new Date(2026, 6, 8)` (line 70) = **Wednesday 8 July 2026** — exactly the reported detail header

  Both reported symptoms fall straight out of the arithmetic. The Overview KPI line is right because it is computed on the server (`page.tsx:86-95`) where the same `Date` still reads as August. Verified by inspecting the first line of every lens file: only `Calendar.tsx` and `MindMap.tsx` carry `'use client'`; `Cashflow.tsx`, `Flow.tsx`, `Matrix.tsx` and `Treemap.tsx` are server components and read the same `Date` in the server's timezone, consistently with how it was constructed. That server/client split is precisely why the page disagrees with itself.
- **Blast radius:** Every client lens. `monthDebits` / `monthCredits` (`types.ts:62-82`) compare `d < p.monthStart || d > p.monthEnd` against the shifted bounds, so in a UTC−5 browser they **exclude** transactions in the last five hours of the month's final day and **include** transactions from the last five hours of the previous month — wrong money in the Calendar and MindMap totals, not just wrong labels. `MindMap.tsx:499` prints the wrong year on 1 January. Any user east of UTC (positive offset) sees the mirror-image failure: `monthStart` lands on the 1st at 01:00+ local, so the month label is right but the boundary still misaligns by the offset. Only users at exactly UTC see correct output — and `profile.timezone` is hard-coded `'UTC'` for all six production profiles (see F14), so nothing server-side can even reason about the discrepancy.
- **Same defect elsewhere:** None found beyond the Overview lens pipeline. `apps/web/src/app/dashboard/transactions/page.tsx:378-382` builds `monthStart`/`monthEnd` inside the client component from `monthY`/`monthM` integers — that path is **correct** and is the model to follow. `Cashflow.tsx:26-27` and `Matrix.tsx:37` read `props.monthStart` with local accessors too, but they are server components, so their reads match their construction; they become defective the moment either file gains a `'use client'` directive. Grepped: `monthStart`, `monthEnd`, `getMonth()`, `getDay()`, `'use client'` across `apps/web/src`.
- **Fix:** Stop passing `Date` across the RSC boundary. Change `LensProps` in `apps/web/src/components/lenses/types.ts` to carry `monthIso: string` (`"YYYY-MM"`) — the same primitive the URL already uses — and have each lens derive its own `monthStart`/`monthEnd` locally via the existing `parseMonthIso` helper. That makes the month a value, not an instant, and removes the timezone from the equation entirely. As a repo-wide rule: **RSC props must be JSON primitives; dates cross as ISO strings.** Add an ESLint rule (`no-restricted-syntax` on `Date` in a client component's prop type) so this cannot come back.
- **Regression test to add:** Render `CalendarLens` with `TZ=America/Chicago` and `monthIso='2026-08'`; assert the first cell offset is 5 (Sat) and that selecting day 8 yields a heading containing "Saturday" and "Aug 8".

### F3. Mobile renders a hard-coded `$` and `en-US` grouping on eleven money surfaces regardless of the user's currency
- **Severity:** High *(downgraded from Critical: currently latent — all six production profiles are `currency_code='USD'`, `locale='en'`, so no shipped user sees a wrong glyph today. It becomes wrong money on screen the moment any user taps Settings → Currency, which is a one-tap, ungated action at `apps/mobile/app/more/settings.tsx:264-266,425-446`.)*
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/components/Money.tsx:44` (the `sign = '$'` default) and `:51` (the hard-coded locale), and every call site that omits `sign`: `apps/mobile/app/(tabs)/index.tsx:275`, `apps/mobile/app/(tabs)/insights.tsx:365`, `:414`, `apps/mobile/app/(tabs)/budgets.tsx:123`, `:125`, `:132`, `apps/mobile/app/recurring.tsx:180`, `:233`, `apps/mobile/src/components/ListeningView.tsx:190`, `apps/mobile/src/components/HistoryHeatmap.tsx:162`, `:247` — eleven sites, verified exhaustive by `grep -rn "<Money" apps/mobile`
- **What the user sees:** A user whose profile currency is EUR opens Today and reads **"$1,250.00"** as their spend. They open the same account on the web dashboard and read **"1.250,00 €"**. The Budgets ring, the Insights hero, the Recurring monthly total, and the live "DETECTED" amount during recording all say `$`. Only the transaction rows and the transaction detail screen are correct.
- **Root cause:** The mobile `Money` component takes a currency *glyph* with a dollar default and formats the integer with a hard-coded `en-US` grouping:

```tsx
// apps/mobile/src/components/Money.tsx:38-51
export function Money({
  value,
  size = 28,
  serif = true,
  muted = false,
  sansWeight = '600',
  sign = '$',                                   // ← default
  color,
  style,
}: Props) {
  const isNeg = value < 0
  const abs = Math.abs(value)
  const [intPart, decPart] = abs.toFixed(2).split('.')
  const intFmt = parseInt(intPart, 10).toLocaleString('en-US')   // ← hard-coded locale
```

  The web twin takes a **currency code** and a **locale** and delegates to `Intl`:

```tsx
// apps/web/src/components/Money.tsx:22-40
export function Money({ value, currency, locale = 'en', ... }: Props) {
  const parts = new Intl.NumberFormat(locale, {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).formatToParts(abs)
```

  Two components, same name, same brand spec, incompatible contracts. Exactly two mobile call sites remembered to pass `sign` (`TransactionRow.tsx:112`, `transaction/[id].tsx:270`, both via `currencySymbolFor`); eleven did not, and TypeScript cannot catch it because the prop is optional with a default. The web component makes `currency` **required** (`apps/web/src/components/Money.tsx:10` — no `?`), which is why the web surface has no instances of this bug.
- **Blast radius:** Every hero amount on mobile for any non-USD user — that is the primary number on four of five tabs. It also breaks decimal grouping independently of the glyph: a USD user with `locale='fr'` sees `1,250.00` where their web dashboard shows `1 250,00`, so the same figure is unreadable-by-convention on one platform even when the currency matches. The `parseInt(intPart, 10)` round-trip additionally discards precision above 2^53, though that is theoretical at these amounts.
- **Same defect elsewhere:** `apps/mobile/app/(tabs)/index.tsx:319-327` is a second, divergent currency-symbol mapping that also hard-codes `toLocaleString('en-US')` (see F29). `apps/mobile/src/components/SafeToSpend.tsx:43,58,62,68,73,78` calls `formatCurrency(x, currency)` with no locale, so it gets the right symbol but `en` grouping (see F30). Grepped: `<Money`, `sign=`, `toLocaleString('en-US')`, `currencySymbolFor`, `case 'EUR'`.
- **Fix:** Delete both `Money` components and put **one** in `packages/shared` — but it cannot be a React component, because RN and DOM need different primitives. Instead export `formatMoneyParts(value, currencyCode, locale)` from `packages/shared/src/utils/currency.ts` returning `{ sign, symbol, symbolFirst, integer, decimal, fraction }`, and let each app own a ~30-line renderer that consumes it. Then make `currency` a **required** prop on both renderers so the compiler rejects every call site that forgets it. Delete the `sign?: string` glyph API — passing a glyph instead of a currency code is what allowed the default to exist.
- **Regression test to add:** Snapshot `Money` on both platforms for `(1250, 'EUR', 'fr')` and assert the output contains `€` and `1 250,00`, and that a call omitting the currency fails to typecheck.

### F4. `createTransaction` can never return an error — the save path is structurally unable to fail
- **Severity:** Critical
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/hooks/useTransactions.ts:76-132` (signature and body), `:131` (the literal), `:134-154` (`deleteTransaction`, same, `:153`), `:156-194` (`editTransaction`, same, `:193`), consumed at `apps/mobile/app/(tabs)/record.tsx:186-228`, `:283-323`, `apps/mobile/app/(onboarding)/income.tsx:64`, `apps/mobile/app/transaction/edit.tsx:133`
- **What the user sees:** Nothing — which is the problem. If Supabase rejects the row (bad `category_id` FK, a `source` outside the CHECK list, RLS mismatch, an expired JWT, `amount <= 0` from a rounding artefact), the user still gets the success path: sheet closes, `voice.reset()` runs, the router pushes to Today, and the transaction is visible because it lives in local SQLite. It is never on the server. On the web dashboard it does not exist. Reinstall the app and it is gone forever.
- **Root cause:** The function advertises an error channel and then hard-codes it shut:

```ts
// apps/mobile/src/hooks/useTransactions.ts:79-80, 128-131
  ): Promise<{ id: string | null; error: string | null }> {
    if (!userId) return { id: null, error: 'Not authenticated' }
    ...
    await enqueue('create', txn.id, txn)
    syncManager.drainQueue()
    return { id: clientId, error: null }        // ← line 131, the only non-auth return
```

  `'Not authenticated'` is the *only* error this function can ever produce. Every caller then branches on it:

```ts
// apps/mobile/app/(tabs)/record.tsx:221-228
    if (error) {
      Alert.alert(t('common.error', userLocale), error)
    } else {
      setConfirmModalVisible(false)
      setTransactionSource('voice')
      voice.reset()
      router.push('/(tabs)')
    }
```

  so the `if (error)` arm is dead code in every one of the four call sites. The design is "offline-first, therefore always report success", but offline-first means *deferred* confirmation, not *fabricated* confirmation — and nothing anywhere ever delivers the deferred verdict (see F5, F43). `deleteTransaction:153` and `editTransaction:193` have exactly the same shape.
- **Blast radius:** Combined with F5 and F43, this is the data-loss mechanism for the whole app. Any row the server permanently rejects sits in local SQLite forever, counts toward the user's totals on the phone, is absent from every total on web and desktop, and disappears on reinstall or device change. Because `pullRemote` (`SyncManager.ts:156-176`) only *adds* server rows and never reconciles local-only rows, there is no path by which the app ever discovers the divergence.
- **Same defect elsewhere:** `apps/mobile/src/hooks/useRecurringRules.ts:145-173` — `toggleRule`, `deleteRule`, `updateRule` all `await supabase…` and discard the result entirely, returning `void`. `apps/mobile/src/hooks/useBudget.ts:39-45` discards the deactivation update's error before inserting the replacement, so a failed deactivate silently produces **two active overall budgets**. `apps/mobile/src/services/seedCategories.ts:23-31` discards the bulk insert error — which is the most likely explanation for the production user `estellesovi6@gmail.com` having **zero** categories while the other five have exactly 20. `apps/mobile/src/hooks/useProfile.ts:25-29` discards the profile fetch error (it only checks `data`, so an RLS/network failure is indistinguishable from "row not created yet" and burns the full 5 s retry budget). `apps/mobile/src/services/recurringCatchUp.ts:65-68` and `:127-130` discard the `last_generated` update error, which means an interrupted catch-up replays occurrences. Grepped: `await supabase`, `const { error }`, `const { data }`, `Promise<{ error`.
- **Fix:** `createTransaction` must return a three-state result, not a boolean-shaped lie: `{ id, status: 'synced' | 'queued' | 'rejected', error }`. Await the first drain attempt with a short timeout (~2 s); if it completes, return `'synced'`; if it times out with the entry still pending, return `'queued'` and let the UI show a pending affordance; if the entry was rejected with a non-retryable Postgres error (any 23xxx class), return `'rejected'` and keep the confirm sheet open with the real message. The queue already stores `last_error` (`syncQueue.ts:45-51`) — nothing reads it. Wire that column to the return value.
- **Regression test to add:** Stub Supabase to return a 23514 check-constraint violation on insert; assert `createTransaction` resolves with `status: 'rejected'`, that the confirm sheet stays open, and that the row is not counted in `useMonthSummary`.

### F5. Sync failures are invisible, unbounded, and self-resurrecting; the dead-letter recovery surface does not exist
- **Severity:** Critical
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/services/sync/SyncManager.ts:137-143` (the swallow), `:146-149` (the lie), `:43-45` (the resurrection), `:170-171` (`pullRemote` silent return), `apps/mobile/src/services/sync/syncQueue.ts:34` (the cliff), `:53-64` (the unused recovery API)
- **What the user sees:** The sync indicator finishes and reports zero pending. Transactions look saved. In reality a permanently-rejected row cycles forever: it fails, its retry counter climbs to 5, it drops out of `getPendingEntries`, and on the very next app launch `resetDeadLetterEntries()` sets it back to 0 so it can fail five more times. Forever, silently. Meanwhile the row is on the phone and nowhere else.
- **Root cause:** Three defects compound. First, the drain catch reports to a counter and nothing else:

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

  No listener notification, no error state, no user-visible signal. Worse, a **single** failing entry sets `hasMore = false` and breaks the whole loop, so one poisoned row blocks every healthy row behind it — head-of-line blocking on the user's money. The comment's promise ("will retry next time we go online") is itself false unless the network actually flaps: see F43.

  Second, the `finally` block asserts a clean result unconditionally:

```ts
// apps/mobile/src/services/sync/SyncManager.ts:146-149
    } finally {
      this.isSyncing = false
      this.notify(false, 0)        // ← "0 pending", even when N entries just failed
    }
```

  Third, the dead-letter cliff is reset on every start:

```ts
// apps/mobile/src/services/sync/SyncManager.ts:43-45
    // Reset any previously dead-lettered entries — they may have failed due to a
    // transient bug (e.g. missing unique constraint). Give them a fresh chance.
    resetDeadLetterEntries().catch(() => {})
```

  The comment reveals the intent (recover from a shipped bug) but the implementation is unconditional and permanent, converting a bounded retry into an infinite loop. And `.catch(() => {})` swallows even *that*.

  `getDeadLetterEntries` and `clearDeadLetterEntry` (`syncQueue.ts:53-64`) exist to power a "these N items couldn't sync" screen. Grepping the entire repo finds **zero callers**. The recovery UI was never built.

  `pullRemote` has the mirror defect on the read side:

```ts
// apps/mobile/src/services/sync/SyncManager.ts:170-171
    const { data, error } = await query
    if (error || !data) return        // indistinguishable from "no changes"
```

  A failed pull and an empty pull are the same event. `useTransactions.ts:31-33` then advances `lastSyncedAt.current = new Date().toISOString()` **inside the `.then()` regardless**, so a failed pull silently marks that window as consumed.
- **Blast radius:** This is the mechanism that turns any F4-class rejection into permanent divergence. There is no surface anywhere in the app that reports sync health. The `notify(false, 0)` lie means any future "syncing…" UI built on `addListener` will also report healthy.
- **Same defect elsewhere:** `apps/mobile/src/services/fxBackfill.ts:43` (`if (error || !data?.length) return 0` — a failed query and a finished backfill are indistinguishable), `apps/mobile/src/services/recurringCatchUp.ts:40` (`if (error || !rules?.length) return 0` — same), `apps/mobile/src/services/fxBackfill.ts:67` (`if (!writeError) filled++` — failures counted as skips), `apps/mobile/src/hooks/useRecurringRules.ts:89-94` and `apps/mobile/src/hooks/useCategories.ts` (destructure `{ data }` only, so a failed fetch renders as an empty list), `apps/web/src/lib/data.ts` (all five server fetchers discard `error` and return `[]`/`null`, so a Supabase outage renders as "you have no transactions" rather than an error), `apps/web/src/app/dashboard/page.tsx:38`, `apps/web/src/app/dashboard/transactions/page.tsx:145-147` and `apps/web/src/app/dashboard/recurring/page.tsx` (`(x.data ?? [])`). Grepped: `if (error`, `?? []`, `.catch(() => {})`, `catch {`, `const { data }`.
- **Fix:** Rebuild the queue as a real outbox, not a best-effort loop.
  1. Classify errors at the point of failure: Postgres `23xxx` and `42xxx` are **permanent** (constraint/schema) → move the entry to a `dead` state immediately, no retries; network/5xx/401 are **transient** → exponential backoff (which does not currently exist at all — see F43).
  2. On a permanent failure, `continue` to the next entry rather than `break` — one poisoned row must not block the queue.
  3. Replace `notify(false, 0)` with `notify(false, await countPending(), await countDead())` and render a persistent banner in `_layout.tsx` when `countDead() > 0`, wired to the already-written `getDeadLetterEntries` / `clearDeadLetterEntry`.
  4. Delete the unconditional `resetDeadLetterEntries()` on start. If a shipped bug needs a one-time reset, gate it behind a schema-version marker in SQLite so it runs once, not every launch.
  5. `pullRemote` must return `{ ok: boolean }` and `useTransactions` must only advance `lastSyncedAt` when `ok`.
- **Regression test to add:** Enqueue three entries where the middle one triggers a 23514; drain; assert entries 1 and 3 synced, entry 2 is `dead` with `last_error` populated, `pendingCount` reported to listeners is accurate, and a second `start()` does not reset entry 2's state.

### F6. Web renders a "Recurring" source chip derived from `is_recurring`; mobile shows the row's real source for the same transaction
- **Severity:** Medium *(downgraded from High: a labelling disagreement, no wrong money and no blocked interaction)*
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/transactions/page.tsx:64-71` (`classifySource`), `:677` and `:731` (the chip), `:757-780` (`SourceChip`); mobile counterpart `apps/mobile/app/transaction/[id].tsx:92-103` (`humanSource`)
- **What the user sees:** A transaction the user typed on the keypad and flagged "Recurring" shows a **"Recurring"** chip in the web Transactions table's Source column. Opening the same row on the phone shows Source: **"Manual"**. Three of the seventeen live production rows are in exactly this state (`is_recurring = true`, `source` in `{voice, manual}`).
- **Root cause:** Web derives the chip from a boolean flag, not from the `source` column:

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

  Mobile maps the actual enum value one-to-one (`'manual' → "Manual"`, `'voice' → "Voice"`, `'recurring_generated' → "Recurring"`). The two surfaces are answering different questions under the same column heading. Note the earlier draft's claim that a CHECK constraint is involved is wrong: nothing here is written to the database, and the live `transactions.source` CHECK (`voice|manual|scan|shortcut|notification_listener|recurring_generated`) is never exercised by this code.
- **Blast radius:** The `Recurring` filter pill (`:60`, via `matchesFilter` at `:73-77`) inherits the same conflation, so filtering by "Recurring" on web returns voice- and keypad-logged rows that mobile does not call recurring. The `:423` grouping (`const k = classifySource(t)`) drives the filter counts, so the counts are wrong by the same rule.
- **Same defect elsewhere:** None found — mobile has exactly one source-mapping function and web has exactly one classifier. Grepped: `classifySource`, `humanSource`, `source ===`, `is_recurring`.
- **Fix:** Separate the two axes in the UI, because they are two facts about the row. Render the `source` enum as the Source chip (using one shared `sourceLabel(source)` exported from `packages/shared` and consumed by both apps), and render recurrence as a separate small badge or an icon on the merchant cell. Keep the "Recurring" *filter* — but have it filter on `is_recurring`, not on a fabricated source value.
- **Regression test to add:** Assert `sourceLabel({ source: 'manual', is_recurring: true })` returns the same string on web and mobile, and that the Recurring filter matches on `is_recurring` alone.

### F7. The AI's `transacted_at` is discarded — every voice, scan and shortcut transaction is stamped "now"
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/hooks/useTransactions.ts:77-78` (the `Pick` that omits `transacted_at`), `:106` (`transacted_at: now`); producers that fill the field and are ignored: `packages/ai/src/parser.ts:85`, `packages/ai/src/scanParser.ts`, `apps/mobile/src/hooks/useNotificationListener.ts:95`, `apps/mobile/app/(tabs)/record.tsx:123`
- **What the user sees:** They say "I spent forty dollars at Whole Foods **yesterday**", or scan a receipt dated last Tuesday. The AI correctly returns `transacted_at` for that earlier date. The transaction is saved with today's timestamp. It lands in the wrong day on the Calendar lens, the wrong bar on the Insights trend, the wrong month if the receipt crosses a month boundary, and the wrong day cell in the History heatmap.
- **Root cause:** `createTransaction` does not accept `transacted_at` at all — it is absent from both the required `Pick` and the optional `Partial<Pick<…>>` on lines 77-78 — and unconditionally stamps the clock:

```ts
// apps/mobile/src/hooks/useTransactions.ts:82, 106
    const now = new Date().toISOString()
    …
      transacted_at: now,
```

  Every producer in the pipeline populates `ParsedExpense.transacted_at` faithfully; the value dies at the hook boundary. The scan path is the worst case, because a receipt's printed date is the entire point of scanning it.
- **Blast radius:** Every date-bucketed surface on both platforms: mobile Today ("spent today"), `useMonthSummary` (`useTransactions.ts:200-219`), Insights trend and forecast, `HistoryHeatmap`, and on web the Calendar/MindMap/Cashflow/Matrix lenses and the month filter. It also corrupts the FX snapshot: `snapshotFx(now, …)` at `:90` dates the rate to today rather than to the transaction date, so a back-dated foreign-currency expense is converted at the wrong rate — and `editTransaction`'s comment at `:164-170` explicitly assumes "the rate is dated to the transaction's `transacted_at` — that day doesn't change", an assumption this defect breaks.
- **Same defect elsewhere:** `apps/mobile/src/services/recurringCatchUp.ts:98` is the **correct** counter-example — it passes `transactedAt` (the computed occurrence date) rather than `now`, and snapshots FX against it at `:82`. That path proves the plumbing is possible; the interactive path just never adopted it. Grepped: `transacted_at:`, `new Date().toISOString()`, `snapshotFx(`.
- **Fix:** Add `transacted_at` to the optional `Partial<Pick<…>>` on line 78, default it to `now` only when absent, and pass `voice.parsedExpense?.transacted_at` from `record.tsx:186-203` and `:283-292`. Then feed the same value into `snapshotFx` at `:90` instead of `now`. Also surface the parsed date in `VoiceConfirmModal` so the user can see and correct it before saving — a silently back-dated transaction is as confusing as a silently forward-dated one.
- **Regression test to add:** Parse "spent forty dollars at Whole Foods yesterday", confirm, and assert the stored `transacted_at` is yesterday's date and `fx_rate_date` matches it.

### F8. `aggAmount` silently returns 0 for un-snapshotted rows — money vanishes from every total with no indicator
- **Severity:** High *(currently latent: all 17 live transactions are USD with a non-null `amount_in_profile_currency`, so nothing is being dropped today)*
- **Status:** Newly discovered
- **Where:** `packages/shared/src/utils/fx.ts:36-40` (the accessor), `:48-52` (`isFxPending`, zero callers), `:109-133` (`snapshotFx` returns `null` on any failure), `apps/mobile/src/hooks/useTransactions.ts:90,103-105` (the write that can produce a null snapshot); consumed at 49 call sites across both apps
- **What the user sees:** They log a €50 dinner while their profile currency is USD, at a moment when `api.frankfurter.app` is unreachable. The row saves. It appears in the transaction list showing "€50.00". It contributes **zero** to Today's spend, to the month total, to the budget ring, to every chart, and to every web total — with no asterisk, no badge, and no "1 transaction pending conversion" hint anywhere.
- **Root cause:** The canonical aggregation accessor treats "not yet converted" as "worth nothing":

```ts
// packages/shared/src/utils/fx.ts:36-40
export function aggAmount(t: {
  amount_in_profile_currency?: number | null
}): number {
  return t.amount_in_profile_currency ?? 0
}
```

  The docstring argues this is honest ("A `$1000 + (skipped €50, will appear once converted)` sum is honest") and explicitly delegates the disclosure: *"UI surfaces that care can count `null` rows separately and prompt the user."* The companion predicate exists —

```ts
// packages/shared/src/utils/fx.ts:48-52
export function isFxPending(t: { amount_in_profile_currency?: number | null }): boolean {
  return t.amount_in_profile_currency == null
}
```

  — and grepping the whole repo finds **zero** callers. No surface counts them. No surface prompts. So the reasoning that makes the `?? 0` defensible was never completed, and silently-dropped money is the shipped behaviour. The row becomes un-snapshotted whenever `snapshotFx` catches (any non-2xx from frankfurter, any network failure, any unexpected body shape — `fx.ts:129-132`), which the code path at `useTransactions.ts:103-105` handles by writing nulls.
- **Blast radius:** All 49 `aggAmount` call sites: mobile `useMonthSummary`, `SafeToSpend`, Budgets, Insights, `HistoryHeatmap`; web `dashboard/page.tsx` KPI line, all six lenses, `groupByCategory` in `lenses/types.ts:86-96` (which inlines `t.amount_in_profile_currency ?? 0` rather than calling `aggAmount`), Budgets, Insights, Export. `runFxBackfill` is supposed to repair these rows on a later launch, but it also stops silently on error (`fxBackfill.ts:43,67`) and only runs from `_layout.tsx:104`.
- **Same defect elsewhere:** `apps/web/src/components/lenses/types.ts:93` re-implements the same `?? 0` inline instead of calling `aggAmount`, so a future change to the accessor will not reach it. `apps/mobile/src/hooks/useBudget.ts` sums via `aggAmount` too. Grepped: `aggAmount`, `amount_in_profile_currency ?? 0`, `isFxPending`.
- **Fix:** `aggAmount` should not decide policy. Return `{ value: number; pending: boolean }` (or have callers use `aggAmount` alongside a mandatory `countFxPending(txns)`), and make every total-rendering component show a pending count when it is non-zero — the docstring's own contract, actually implemented. Then make `snapshotFx`'s failure loud at the write: keep the save (offline-first is correct) but mark the row so the pending indicator has something to key on, and let `runFxBackfill` report how many it could not fill.
- **Regression test to add:** Stub `fetchFxRate` to throw, save a EUR transaction against a USD profile, and assert the month total renders with a "1 pending conversion" indicator rather than silently excluding it.

### F9. `recurring_rule_id` is never written back onto the transaction after a rule is created
- **Severity:** Medium *(downgraded from High: cannot fire today because F1 means `createRule` never succeeds; it becomes a real defect the moment F1 is fixed)*
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/(tabs)/record.tsx:205-217` (voice), `:294-306` (manual), `apps/mobile/app/transaction/edit.tsx:161-172` (edit), `apps/mobile/app/(onboarding)/income.tsx:64`
- **What the user sees:** (Once F1 is fixed.) The link between a transaction and its rule exists in only one direction. Editing the template transaction later has to guess which rule it belongs to, and the "edit this occurrence or all future?" prompt cannot be shown for the template row.
- **Root cause:** `createRule` returns the inserted `RecurringRule` (`useRecurringRules.ts:142`), and every caller throws the return value away:

```ts
// apps/mobile/app/(tabs)/record.tsx:206-217
      await createRule({
        …
        template_txn_id: txnId,
      })
    }
```

  No assignment, no follow-up `editTransaction(txnId, { recurring_rule_id: rule.id })`. Confirmed in production: 3 rows have `is_recurring = true` and **0** rows have a non-null `recurring_rule_id`. The redundancy is already causing pain — `edit.tsx:103-106` has to try *both* directions and its own comment calls this "the LOGIC §3.3 bug":

```ts
// apps/mobile/app/transaction/edit.tsx:103-106
    const linkedRule =
      (txn.recurring_rule_id
        ? rules.find((r) => r.id === txn.recurring_rule_id)
        : null) ?? rules.find((r) => r.template_txn_id === txn.id) ?? null
```
- **Blast radius:** The local dedup index (`localDb.ts:182-183`, keyed on `(user_id, recurring_rule_id, date)`) and the server's `idx_txn_recurring_dedup` both key on `recurring_rule_id`; a template row with a null value is invisible to both, so the catch-up generator can produce a duplicate occurrence on the template's own date. `edit.tsx:114-115`'s `isGenerated` check also fails for template rows.
- **Same defect elsewhere:** None found — these four are the only `createRule` call sites. Grepped: `createRule(`, `recurring_rule_id`.
- **Fix:** Fold into F1's fix. If the rule becomes the parent (F1 option 1), `recurring_rule_id` is set at insert time and `template_txn_id` can be dropped entirely, which also deletes the dual-direction lookup in `edit.tsx`. Do not patch this by adding a second write after `createRule` — that just adds another un-awaited, unverified round-trip to a path that already has one too many.
- **Regression test to add:** After saving a recurring transaction, assert `transaction.recurring_rule_id === rule.id` and that `edit.tsx` resolves `linkedRule` through the `recurring_rule_id` branch, not the fallback.

### F10. Android notification listener is wired to a no-op callback — the whole feature is a permission prompt
- **Severity:** Medium *(downgraded from High: the row is Android-only and the product ships iOS-only via TestFlight, so no shipped user can reach it)*
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/more/settings.tsx:174-176` (the only call site), `apps/mobile/src/hooks/useNotificationListener.ts:81-107` (the machinery), `apps/mobile/app/more/settings.tsx:277,285-291` (the Android-only row), `apps/mobile/app.config.js:76` (the manifest plugin)
- **What the user sees:** On Android, Settings → Automations → "Payment notifications" opens the system Notification Access screen and the toggle flips on. Nothing is ever logged. On iOS the row is not rendered at all.
- **Root cause:** The hook does all the work and hands the result to an empty function:

```ts
// apps/mobile/app/more/settings.tsx:174-176
  const { permissionGranted, recheckPermission, requestPermission } = useNotificationListener(
    () => {},
  )
```

  `useNotificationListener` parses the payload, builds a complete `ParsedExpense` (`useNotificationListener.ts:87-101`) with amount, currency, merchant, `payment_method: 'digital_wallet'` and a clarifying question, then calls `onPayment(parsed)` — into the void. This is the only call site in the repo. Confirmed in the live DB: zero transactions have `source = 'notification_listener'`.
- **Blast radius:** The web Transactions page builds an "Apple Pay" chip and filter partly out of `source === 'notification_listener'` (see F11), a value nothing can ever write. The Android manifest ships a `MoneyNotificationListenerService` (via `./modules/notification-listener/plugin`) that reads every notification on the device — a significant privacy surface for a feature that does nothing with the data.
- **Same defect elsewhere:** None found — one hook, one call site. Grepped: `useNotificationListener`, `onPayment`, `addPaymentNotificationListener`.
- **Fix:** Either wire it or remove it; do not ship a permission request for a no-op. To wire it, the callback must route into the same confirm sheet the shortcut path uses (`record.tsx:115-129` calls `voice.injectParsed(...)` and sets `transactionSource`), which means the listener has to live at a level that can navigate — a root-level provider, not a Settings-screen hook. To remove it, delete the hook, the native module, the plugin entry at `app.config.js:76`, and the `notification_listener` branch of `classifySource`.
- **Regression test to add:** Emit a synthetic payment notification and assert a transaction with `source='notification_listener'` reaches the confirm sheet.

### F11. "Apple Pay" filter and chip are a fabrication over two unrelated sources
- **Severity:** Medium *(downgraded from High: zero production rows carry either source, so the filter is simply always empty rather than actively misleading)*
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/transactions/page.tsx:59` (the filter pill), `:69` (the classifier branch), `:766-773` (the chip)
- **What the user sees:** The Transactions page offers an "Apple Pay" filter pill. Selecting it always returns zero rows.
- **Root cause:** The classifier maps two unrelated sources onto one Apple-branded label:

```ts
// apps/web/src/app/dashboard/transactions/page.tsx:69
  if (t.source === 'shortcut' || t.source === 'notification_listener') return 'apple-pay'
```

  `notification_listener` is an **Android** NotificationListenerService source — labelling it "Apple Pay" is categorically wrong, and it is unwritable anyway (F10). `shortcut` is any iOS Shortcut, not necessarily an Apple Pay one, and the only route to installing that shortcut is a placeholder URL (F12). Confirmed in the live DB: `select source, count(*) from transactions group by 1` returns only `voice` (13), `manual` (3), `scan` (2).
- **Blast radius:** The filter counts at `:423` and the chip at `:731` inherit the miscategorisation. A user who does log via a Shortcut will see their transaction badged "Apple Pay" whether or not Apple Pay was involved.
- **Same defect elsewhere:** None found — mobile's `humanSource` (`transaction/[id].tsx:92-103`) maps `shortcut` and `notification_listener` to two distinct, honest labels. Grepped: `apple-pay`, `'shortcut'`, `notification_listener`.
- **Fix:** Drop the "Apple Pay" label. Show `shortcut` as "Shortcut" and `notification_listener` as "Auto-detected", matching mobile's existing `source.shortcut` / `source.notification` i18n keys, and export one `sourceLabel()` from `packages/shared` so the two platforms cannot diverge again (same fix as F6).
- **Regression test to add:** Assert the web chip label for `source='shortcut'` equals mobile's `t('source.shortcut', 'en')`.

### F12. Apple Pay Shortcut install link is literally `.../shortcuts/placeholder`
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/more/settings.tsx:196` (the constant), `:278-284` (the iOS-only row that opens it)
- **What the user sees:** On iOS — the only shipping platform — Settings → Automations shows "Apple Pay Shortcut · Set up". Tapping it opens `https://www.icloud.com/shortcuts/placeholder` in the browser, which is an iCloud error page. The single advertised automation feature is a dead link for every user.
- **Root cause:**

```ts
// apps/mobile/app/more/settings.tsx:196
  const SHORTCUT_INSTALL_URL = 'https://www.icloud.com/shortcuts/placeholder'
```

  There is no build-time check, no env override, and no feature flag hiding the row until a real shortcut exists. The deep-link *receiver* is fully implemented (`record.tsx:111-131` handles `voiceexpense://shortcut?amount=…`, and `useShortcutHandler` is mounted at `_layout.tsx:35`), so the only missing piece is the published shortcut itself.
- **Blast radius:** Zero production transactions have `source = 'shortcut'`, which is consistent with nobody having been able to install it. The entire "Apple Pay" story on the web dashboard (F11) depends on this source existing.
- **Same defect elsewhere:** None found — this is the only placeholder URL in the mobile app. `packages/shared/src/brand.ts:17` ships a placeholder *email* (F39) with the same shape of problem. Grepped: `placeholder`, `icloud.com`, `Linking.openURL`.
- **Fix:** Publish the shortcut, put the real iCloud link in `packages/shared/src/brand.ts` next to the other brand constants, and hide the Settings row behind a constant that is empty until then. A row that leads nowhere is worse than an absent row, especially on a screen App Review will open.
- **Regression test to add:** Assert `SHORTCUT_INSTALL_URL` does not contain "placeholder" and that the Automations row is not rendered when the constant is empty.

### F13. `synced_at` is only ever stamped locally, and `pullRemote`'s blind upsert wipes it
- **Severity:** Low *(downgraded from High: nothing in the repo reads the column, so there is no user-visible consequence — it is a dead diagnostic, not a broken feature)*
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/hooks/useTransactions.ts:117` (`synced_at: null` in the create payload), `apps/mobile/src/services/sync/SyncManager.ts:126` (the local stamp), `:173-175` (`pullRemote`'s loop), `apps/mobile/src/services/sync/transactionStore.ts:75` (`synced_at = excluded.synced_at`)
- **What the user sees:** Nothing directly. The observable trace is in the database: `synced_at` is NULL on 17 of 18 rows ever written.
- **Root cause:** Not "never sent" — it *is* sent, as `null`. `createTransaction` initialises `synced_at: null` (`:117`) and the whole `txn` object is what gets enqueued and upserted to Postgres, so the server always receives an explicit null. Only the *local* copy is then stamped:

```ts
// apps/mobile/src/services/sync/SyncManager.ts:126
              await upsertTransaction({ ...payload, synced_at: new Date().toISOString() })
```

  and the next `pullRemote` (`:173-175`) upserts the server row back over it. `transactionStore.upsertTransaction`'s conflict clause sets `synced_at = excluded.synced_at` under `WHERE excluded.version >= transactions.version`; the pulled row has the same version, so the guard passes and the local stamp is replaced by the server's null. The one non-null production row is explained by the `update` path: `editTransaction` enqueues the *local* row (`useTransactions.ts:185-189`), which by then carries a stamped `synced_at`, and that value reaches the server.
- **Blast radius:** None today — grepping the repo for `synced_at` finds only the schema, the row mapper, the two writes above, and the type. No UI, no query, no export reads it. The cost is that the one column that could have exposed the F4/F5 divergence is unusable for diagnosis.
- **Same defect elsewhere:** None found. Grepped: `synced_at`, `last_synced_at`.
- **Fix:** Decide what the column is for. If it is a server-side receipt, make it `DEFAULT now()` on the Postgres side and stop sending it from the client at all (the client's clock is not authoritative). If it is a local "this row is confirmed on the server" flag, it belongs in the SQLite schema only and must be excluded from both the upsert payload and the `ON CONFLICT` set list so `pullRemote` cannot clear it. Either way, then use it — a sync-state column nothing reads is what allowed F5 to go unnoticed.
- **Regression test to add:** Drain a create, then run `pullRemote`, and assert the local row's confirmed-on-server flag survives.

### F14. `profile.timezone` is declared, typed and defaulted — and neither written nor read
- **Severity:** Medium *(downgraded from High: no user-visible symptom on its own; it is the missing half of the date architecture that F2 and F7 break on)*
- **Status:** Newly discovered
- **Where:** `supabase/migrations/001_initial_schema.sql:18`, `packages/shared/src/types/profile.ts:10`, referenced in prose at `packages/shared/src/types/ai.ts:74`
- **What the user sees:** Nothing named "timezone" anywhere. The consequence is that every date boundary in the product is computed in whatever timezone the rendering runtime happens to be in — the phone's, the browser's, or Vercel's UTC — and those three disagree (F2).
- **Root cause:** The column exists and defaults:

```sql
-- supabase/migrations/001_initial_schema.sql:18
  timezone        text NOT NULL DEFAULT 'UTC',
```

  A repo-wide grep for `timezone` returns exactly three hits: this line, the TypeScript field declaration, and a docstring in `types/ai.ts` describing an unrelated field. There is no settings UI, no `updateProfile({ timezone })` call, no read in any query, and no use in the `generate-recurring` edge function. All six production profiles are `'UTC'` because nothing has ever written anything else.
- **Blast radius:** The `generate-recurring` cron runs at `0 6 * * *` UTC and has no way to know a user's local midnight, so a daily rule fires at 1am for a US-Central user and 3pm for a Tokyo user. The web Overview computes month bounds in Vercel's UTC (F2). Mobile computes them in the device timezone. Three runtimes, three answers, no shared authority.
- **Same defect elsewhere:** None found (the column is unique in being wholly unused). The *pattern* — a schema column with no reader or writer — also affects nothing else; every other column in `001_initial_schema.sql` has at least one consumer.
- **Fix:** Either populate it and use it, or drop it. Populating is the correct choice for a money app: capture `Intl.DateTimeFormat().resolvedOptions().timeZone` at onboarding, write it to the profile, expose it in Settings, and make it the single authority for every month/day boundary — the web server computing bounds in the *user's* zone rather than its own, and `generate-recurring` scheduling against it. That is also the durable fix for F2: once bounds are derived from a stored IANA zone rather than from whichever runtime constructs the `Date`, the RSC boundary stops mattering.
- **Regression test to add:** Sign up with `TZ=Asia/Tokyo`, assert the profile stores `Asia/Tokyo`, and assert the Overview month bounds are Tokyo-local rather than UTC.

### F15. Root layout re-runs recurring catch-up, FX backfill and category seeding on every navigation
- **Severity:** Medium *(downgraded from High: wasteful and re-entrant, but the idempotency guards hold, so no confirmed user-visible defect)*
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/_layout.tsx:94-106` (the block and its dependency array), `apps/mobile/src/services/seedCategories.ts:3-32`, `apps/mobile/src/services/recurringCatchUp.ts:32-138`, `apps/mobile/src/services/fxBackfill.ts:31-71`
- **What the user sees:** Nothing visible; battery and cellular data. Every tab switch and every screen push fires at least three Supabase round-trips before anything else happens.
- **Root cause:** The three launch-time services live inside the *routing* effect, whose dependency array changes identity on every navigation:

```tsx
// apps/mobile/app/_layout.tsx:94-106
    if (session?.user?.id) {
      // Seed default categories for new users (no-op if categories already exist)
      seedDefaultCategories(session.user.id)

      // Generate any missed recurring transactions since last app open
      runRecurringCatchUp(session.user.id)

      // Convert any foreign-currency historical rows that pre-date the
      // FX snapshot migration. Self-throttles to FX_BACKFILL_BATCH per
      // launch and is a no-op once everything is filled in.
      runFxBackfill(session.user.id)
    }
  }, [session, loading, segments, router, profile, ready])
```

  `segments` comes from `useSegments()`, which returns a new array on every route change, so the effect re-runs on every navigation. Each comment says "on app launch" / "per launch"; none of them is launch-scoped. `seedDefaultCategories` issues two queries every time (`default_categories`, then the user's `categories`) before deciding it has nothing to do. None of the three has a re-entrancy guard, so overlapping invocations are possible.
- **Blast radius:** `runRecurringCatchUp` is the risky one: two overlapping runs can both pass the `hasRecurringOccurrence` check (`recurringCatchUp.ts:58-62`) before either writes, then both enqueue the same occurrence. That is caught downstream by migration 008's partial unique index and handled by `SyncManager.isRecurringDedupConflict` (`SyncManager.ts:117-121`), which soft-deletes the loser — so no duplicate reaches the user, but the queue churns. `runFxBackfill` re-issues its 100-row query per navigation.
- **Same defect elsewhere:** None found — these are the only three launch-scoped services. Note `syncManager.start()` is correctly isolated in its own `useEffect(…, [])` at `_layout.tsx:38-41`, which is the pattern the other three should follow. Grepped: `useEffect`, `useSegments`, `seedDefaultCategories`, `runRecurringCatchUp`, `runFxBackfill`.
- **Fix:** Move the three calls into their own effect keyed on `[session?.user?.id]` only, so they run once per signed-in session rather than once per navigation, and guard each service with a module-level in-flight promise so a second call returns the first's promise instead of starting a second pass. Do not add a debounce — that would be a patch on the wrong dependency array.
- **Regression test to add:** Mount the layout, navigate across four routes, and assert `seedDefaultCategories` was invoked exactly once.

### F16. Web forecast extrapolates with no history gate; mobile gates it — same feature, two answers
- **Severity:** Medium *(downgraded from High: both outputs are labelled projections, so this is a heuristic disagreement rather than a wrong stored or displayed actual)*
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/insights/page.tsx:216-223` (avg + projection, no gate), `:226-240` (the forecast line, always rendered); mobile counterpart `apps/mobile/app/(tabs)/insights.tsx:278-296` (`usualMonthly`, `projectedMonthly`, `showForecast`), `:434-457` (gated render)
- **What the user sees:** A brand-new user with one $300 transaction on the 2nd of the month opens the web Insights page and reads a three-month forecast built by multiplying that single day out. Opening mobile Insights on the same account shows no forecast card at all.
- **Root cause:** Mobile gates on three conditions; web gates on none. Mobile:

```ts
// apps/mobile/app/(tabs)/insights.tsx:295
  const showForecast = isCurrentMonth && usualMonthly > 0 && monthSpent > 0
```

  and `usualMonthly` is the average of the previous three *complete* months, filtered to non-zero (`:279-289`). Web:

```ts
// apps/web/src/app/dashboard/insights/page.tsx:216-223
  const completeMonthlyTotals = monthlyTotals.slice(0, -1).map((m) => m.total).filter((v) => v > 0)
  const avg = completeMonthlyTotals.length
    ? completeMonthlyTotals.reduce((s, v) => s + v, 0) / completeMonthlyTotals.length
    : 0
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dayOfMonth = now.getDate()
  const currentTotal = monthlyTotals[monthlyTotals.length - 1].total
  const projectedCurrent = dayOfMonth > 0 ? (currentTotal / dayOfMonth) * dim : currentTotal
```

  and then `forecastLine[history.length + k] = avg > 0 ? avg : projectedCurrent` (`:238`) unconditionally paints three future points — falling back to the day-1 extrapolation when there is no history at all. There is no `showForecast` equivalent.
- **Blast radius:** The web Insights forecast chart and its `projectedDelta` percentage (`:224`). Because `avg` is computed from `aggAmount`, F8's dropped rows also depress the baseline that the forecast is compared against.
- **Same defect elsewhere:** The two files also disagree on the averaging window — web uses up to five prior months, mobile uses exactly three — so even with sufficient history the two platforms show different "usual" figures for the same account. Grepped: `forecast`, `projected`, `avg`, `usualMonthly`.
- **Fix:** Move the projection into `packages/shared` as `forecastMonthly(txns, now)` returning `{ projected, usual, confident: boolean }`, with one definition of the window and one definition of the gate, and have both Insights screens render from it. This is the archetypal case for the missing shared domain layer: two teams answering the same question with two heuristics is the defect, not the specific gate.
- **Regression test to add:** With a single transaction in the current month and no history, assert both platforms report `confident: false` and render no forecast.

### F17. The web dashboard translates no UI strings, yet ships a Language picker
- **Severity:** Medium *(downgraded from High, and the mechanism corrected: `locale` **is** threaded into every `Intl` call on web — what is missing is string translation, not all i18n)*
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/layout.tsx:12` (`<html lang="en">`, hard-coded), `apps/web/src/app/dashboard/settings/page.tsx:364-365` (the picker), `:251` (the write); the shared translator `packages/shared/src/i18n/index.ts` is imported by **zero** files under `apps/web/src`
- **What the user sees:** A French user sets Language → Français. The mobile app switches to French. The web dashboard stays entirely in English — "Overview", "Transactions", "Safe to spend", every label — while dates and currency quietly switch to French conventions. Half the page obeys the setting and half ignores it.
- **Root cause:** Web never imports `t`. Verified by grepping every `from '@voice-expense/shared'` import under `apps/web/src`: the imports are `aggAmount`, `snapshotFx`, `formatCurrency`, `merchantColor`, `SUPPORT_EMAIL`, and types — never `t` and never anything from `./i18n`. Every visible string is an English literal in JSX. Meanwhile `locale` *is* read from the profile and passed to `Intl.NumberFormat` / `toLocaleDateString` throughout (`dashboard/page.tsx:45,57,97`, `transactions/page.tsx:435`, `lenses/Calendar.tsx:71-72`), and `<html lang="en">` contradicts that at the document level for screen readers.
- **Blast radius:** Every web screen for the three non-English locales the product claims to support (`fr`, `es`, `pt` — enumerated in the profile CHECK constraint at `001_initial_schema.sql:16`). The desktop app wraps the same web build, so it inherits the gap.
- **Same defect elsewhere:** None found — mobile calls `t(...)` consistently. The `lang` attribute is the only other hard-coded locale on web. Grepped: `from '@voice-expense/shared'`, `t(`, `lang=`, `locale`.
- **Fix:** `packages/shared/src/i18n` already holds the catalogue that mobile uses; wire it into web rather than building a second one. Read `profile.locale` once in `dashboard/layout.tsx`, put it on a context, and replace the English literals with `t(key, locale)`. Set `<html lang={locale}>` from the same value — which means `layout.tsx` needs the profile, so the lang attribute either moves to the dashboard segment or the root layout becomes async. Until the strings are translated, the honest interim is to hide the web Language picker rather than let it half-work.
- **Regression test to add:** Render the dashboard with `profile.locale='fr'` and assert a known nav label renders in French and `<html lang>` is `fr`.

### F18. `NSAllowsArbitraryLoads: true` ships in the production iOS build, and an ungated Settings → Developer row repoints the AI endpoint
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/app.config.js:20-28` (ATS exemption at `:21-23`), `apps/mobile/app/more/settings.tsx:330-338` (the ungated Developer group), `:480-520` (the URL modal), `apps/mobile/src/hooks/useApiUrl.ts:16-20` (the setter), `:31-34` (`getApiUrl`, read on every AI call)
- **What the user sees:** Settings shows a "Developer" section with an "API URL" row, on every TestFlight build, for every user. Tapping it opens a free-text field. Whatever is typed there becomes the base URL for `/api/ai/parse-expense`, `/api/ai/parse-scan` and `/api/ai/ask-murmur`.
- **Root cause:** Two independent decisions combine. First, App Transport Security is globally disabled:

```js
// apps/mobile/app.config.js:20-23
      infoPlist: {
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,
        },
```

  Second, the Developer group has no `__DEV__` guard — the only `Platform` check in `settings.tsx` is at `:277` for the Automations row, and there is no `__DEV__` reference in the file at all. The stored value is persisted to SecureStore (`useApiUrl.ts:18`) and read by `getApiUrl()` before every AI call (`record.tsx:254`, `useVoice`, `askMurmurClient`). Those calls send `Authorization: Bearer ${session.access_token}` (`packages/ai/src/parser.ts:58`) plus the user's raw transcript or receipt image.
- **Blast radius:** With ATS off, a user (or anyone with a few seconds of physical access to an unlocked phone) can point the app at a plaintext `http://` host and every subsequent voice transcript, receipt photo and Supabase access token leaves the device unencrypted. Apple also asks for a justification for a blanket `NSAllowsArbitraryLoads` at review, which is a submission risk independent of the security issue.
- **Same defect elsewhere:** None found — this is the only ATS declaration and the only ungated developer surface. `apps/mobile/app/more/privacy.tsx` promises voice is not stored, a promise this row lets a user unknowingly break. Grepped: `NSAllowsArbitraryLoads`, `__DEV__`, `setApiUrl`, `getApiUrl`.
- **Fix:** Remove `NSAllowsArbitraryLoads` entirely — every endpoint the app talks to (Supabase, Vercel, frankfurter.app, gstatic favicons) is HTTPS, so nothing needs it. Gate the whole Developer `SetGroup` behind `__DEV__` so it is compiled out of release builds. If a QA override is genuinely needed in TestFlight, validate it against an allow-list of `https://` hosts rather than accepting free text.
- **Regression test to add:** Assert the release Info.plist contains no `NSAllowsArbitraryLoads`, and that the Developer group does not render when `__DEV__` is false.

### F19. No environment separation — all four EAS profiles point at production Supabase and production Vercel
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/eas.json:13-19` (development), `:27-33` (development-simulator), `:37-43` (preview), `:47-53` (production)
- **What the user sees:** Nothing — until a developer testing on a dev-client build writes rows into the same database real users depend on.
- **Root cause:** All four `env` blocks are byte-identical in the three variables that matter:

```json
"EXPO_PUBLIC_SUPABASE_URL": "https://ohaqhwampmyoeaopdybd.supabase.co",
"EXPO_PUBLIC_SUPABASE_ANON_KEY": "sb_publishable_HseSmiHYgNP-C3J5XvG6ag_UK6JbfDU",
"EXPO_PUBLIC_API_BASE_URL": "https://money-app-web-w6su.vercel.app"
```

  There is no staging project, no seeded test database, and no way to exercise a destructive migration or the `delete-user` edge function without doing it against live user money.
- **Blast radius:** The production dataset is already small and contaminated in ways consistent with development traffic (18 rows across 6 users, one user with zero categories). Any migration test, any RLS experiment, and any load test hits the same instance. It also means the audit's own findings cannot be reproduced safely.
- **Same defect elsewhere:** The root `eas.json` has the same single-environment pointer for its `development` and `preview` profiles (`eas.json:10-22`) and no env at all for `production` (F20). `apps/web` has no `.env.example` or documented staging target either. Grepped: `SUPABASE_URL`, `API_BASE_URL`, `eas.json`, `vercel.json`.
- **Fix:** Create a second Supabase project and a Vercel preview deployment, and point `development`, `development-simulator` and `preview` at them. Migrations then run against staging first, which is the only way the `generate-recurring` cron and the RLS policies can ever be tested. This is a prerequisite for fixing F1 and F5 safely — both require exercising failure paths that currently can only be exercised in production.
- **Regression test to add:** CI assertion that no non-`production` EAS profile references the production Supabase project ref.

### F20. Two divergent config trees; the root `eas.json` production profile has no env at all
- **Severity:** Medium *(downgraded from High: a build-time footgun, not a defect in the shipped binary — the TestFlight builds come from `apps/mobile/eas.json`)*
- **Status:** Newly discovered
- **Where:** `eas.json:24-26` (root, production with no env), `eas.json:28-30` (empty submit block), versus `apps/mobile/eas.json:45-54` (production with env) and `:56-62` (submit with `ascAppId`)
- **What the user sees:** Nothing, unless a build is ever run from the repo root — in which case the resulting binary has no `EXPO_PUBLIC_SUPABASE_URL`, no anon key and no API base URL, and fails at the sign-in screen for every user.
- **Root cause:** Two `eas.json` files exist with different CLI version floors (`>= 18.0.0` vs `>= 18.5.0`), different profile sets, and different env completeness:

```json
// eas.json:24-30 — root
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
```

  EAS resolves `eas.json` relative to the directory the command is run in, so which file wins is a function of the operator's shell history. The root file also lacks the `ascAppId` that a prior commit added specifically so TestFlight submits run non-interactively.
- **Blast radius:** A single mis-rooted `eas build --profile production` ships a binary that cannot authenticate. The root file's presence also makes it ambiguous which one is authoritative for anyone reading the repo.
- **Same defect elsewhere:** The same duplication exists for the Expo app manifest — `app.json` at the repo root alongside `apps/mobile/app.config.js`. Grepped: `eas.json`, `app.json`, `app.config.js`.
- **Fix:** Delete the root `eas.json` (and the root `app.json` if it is likewise vestigial). One config tree, in `apps/mobile`, so there is nothing to diverge. Do not "sync" the two files — keeping two copies in agreement by hand is the same anti-pattern as F25 and F26.
- **Regression test to add:** CI assertion that exactly one `eas.json` exists in the repo.

### F21. The `NODE_ENV` Plus hatch cannot fire in either shipping path; the real hole is the user-writable `MURMUR_DEV_PLUS=1` file
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/web/src/lib/plus.server.ts:29` (the file hatch), `:30` (the `NODE_ENV` hatch), `apps/desktop/src/main.ts:90-111` (the `.env` loader), `:137-138` (the merge order)
- **What the user sees:** On the desktop app, creating `~/Library/Application Support/Murmur/.env` containing `MURMUR_DEV_PLUS=1` unlocks every Plus-gated surface — export, Insights, Ask — with no purchase.
- **Root cause:** The resolver has two env hatches:

```ts
// apps/web/src/lib/plus.server.ts:28-31
  if (isPlusFromProfile(profile)) return { isPlus: true }
  if (process.env.MURMUR_DEV_PLUS === '1') return { isPlus: true }
  if (process.env.NODE_ENV !== 'production') return { isPlus: true }
  return { isPlus: false }
```

  The `NODE_ENV` hatch (line 30) is **not** reachable in either shipping path, contrary to how it reads: Vercel sets `NODE_ENV=production` for its builds, and the desktop shell hard-sets it *after* the file spread so a `.env` cannot override it —

```ts
// apps/desktop/src/main.ts:136-138
      ...envFromFile,
      NODE_ENV: 'production',
```

  But `MURMUR_DEV_PLUS` is read from that same user-writable file and is *not* overridden, so line 29 fires. The file lives in the user's own `userData` directory with no integrity check.
- **Blast radius:** Desktop only — the web deployment on Vercel does not read a user-writable env file, and mobile resolves Plus through `usePlusStatus` against the profile column. Practically the exposure is limited today because the purchase flow does not exist at all (`apps/mobile/app/more/paywall.tsx` has an empty `onPress`), so there is nothing to bypass; it becomes a revenue hole the day IAP ships.
- **Same defect elsewhere:** None found — `packages/shared/src/plus.ts`'s `isPlusFromProfile` is the only other entitlement decision and it reads the profile column with no hatch. Grepped: `MURMUR_DEV_PLUS`, `NODE_ENV`, `isPlus`, `resolvePlusStatus`.
- **Fix:** Delete both env hatches from `plus.server.ts`. Entitlement must have exactly one source — `profile.plus_status` — so that the packaged app and the hosted app cannot disagree. For local development, set `plus_status='active'` on the dev account in the staging database (which F19 says needs to exist anyway) rather than teaching the production resolver about developer conveniences.
- **Regression test to add:** With `MURMUR_DEV_PLUS=1` set and `profile.plus_status='free'`, assert `resolvePlusStatus` returns `{ isPlus: false }`.

### F22. Recurrence scheduling is implemented three times in three runtimes, all carrying the same month-end overflow bug
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/hooks/useRecurringRules.ts:42-60`, `apps/web/src/app/dashboard/recurring/page.tsx:49-68`, `supabase/functions/generate-recurring/index.ts:45-54`
- **What the user sees:** A monthly rule anchored to 31 January generates its next occurrence on **3 March**, skipping February entirely. Anchored to 31 March, it lands on 1 May. A yearly rule anchored to 29 February 2028 lands on 1 March 2029. The user's rent shows up on the wrong date, and the amount is missing from the month it belongs to.
- **Root cause:** All three copies advance the date with `Date.prototype.setMonth`, which overflows rather than clamping:

```ts
// apps/mobile/src/hooks/useRecurringRules.ts:49-56 (identical logic in the other two)
  switch (rule.frequency) {
    case 'daily':     next.setDate(next.getDate() + rule.interval); break
    case 'weekly':    next.setDate(next.getDate() + 7 * rule.interval); break
    case 'biweekly':  next.setDate(next.getDate() + 14 * rule.interval); break
    case 'monthly':   next.setMonth(next.getMonth() + rule.interval); break
    case 'quarterly': next.setMonth(next.getMonth() + 3 * rule.interval); break
    case 'yearly':    next.setFullYear(next.getFullYear() + rule.interval); break
  }
```

  `new Date(2026, 0, 31).setMonth(1)` yields 3 March 2026, because 31 February does not exist and JavaScript rolls forward. The correct behaviour for a billing rule is to clamp to the last day of the target month. All three copies are wrong in the same way, so the bug is invisible to cross-checking — mobile, web and the cron all agree on the wrong answer.
- **Blast radius:** Every recurring rule anchored to the 29th, 30th or 31st — roughly 10% of anchor dates, and disproportionately common for rent and salary. The generated transaction carries the overflowed `transacted_at`, so it lands in the wrong month's totals on every surface, and `computeUpcomingRecurring`'s Safe-to-Spend window (`useRecurringRules.ts:64-79`) misses it. The Deno copy additionally runs in the edge function's UTC while the mobile copy runs in device-local time, so the same rule can produce two different dates on the same day. Currently dormant only because F1 means no rules exist.
- **Same defect elsewhere:** The three sites above are exhaustive for next-occurrence computation. A related `setMonth` overflow exists in `apps/mobile/src/hooks/useRecurringRules.ts:22-24` (`getPeriodBounds`, quarterly) and `:32` (monthly end) — those use the `setMonth(m, 0)` last-day idiom correctly. `apps/web/src/app/dashboard/recurring/page.tsx:124,621` use `setDate(getDate() + 30)` for a horizon, which is an approximation but not a correctness bug. Grepped: `setMonth(`, `setFullYear(`, `computeNextOccurrence`, `frequency`.
- **Fix:** One implementation, in `packages/shared`, exported as `computeNextOccurrence(rule, from)` and imported by all three runtimes — the edge function included, since Deno can import from the workspace. Implement the monthly/quarterly/yearly cases by clamping: compute the target year/month, then `Math.min(anchorDay, daysInMonth(targetYear, targetMonth))`. Store the anchor day-of-month on the rule rather than re-deriving it from `last_generated`, otherwise a single clamped occurrence permanently drags the anchor earlier (31 → 28 → 28 → …).
- **Regression test to add:** A monthly rule anchored 2026-01-31 must generate 2026-02-28, 2026-03-31, 2026-04-30 — asserted against all three implementations.

### F23. `parseExpenseLocally` can never return a result, so the AI-failure fallback is dead
- **Severity:** Medium *(downgraded from High: the unreachable branch only ever covered bare amounts with no merchant, so the degradation gap is narrow)*
- **Status:** Newly discovered
- **Where:** `packages/ai/src/localParser.ts:50-53` (the impossible guard), `:55-71` (the unreachable result), `packages/ai/src/parser.ts:43-46` (tier 1), `:68-72` (the dead fallback)
- **What the user sees:** When the AI endpoint is unreachable, saying "twenty dollars" throws `AI parse failed: <status>` instead of falling back to the local parse the code was written to provide.
- **Root cause:** The confidence is a constant compared against a threshold it can never meet:

```ts
// packages/ai/src/localParser.ts:44-53
  const merchant = parseMerchant(transcript)
  // Always send to AI when we have a merchant …
  if (merchant) return { result: null, confidence: 0 }

  const confidence = 0.75

  // Bare amount without merchant — low confidence, will go to AI
  if (confidence < 0.85) return { result: null, confidence }
```

  `0.75 < 0.85` is always true, so lines 55-71 are unreachable and `parseExpenseLocally` returns `{ result: null }` on every input. That makes both consumers dead:

```ts
// packages/ai/src/parser.ts:43-46 and 68-72
  const { result: localResult, confidence } = parseExpenseLocally(opts.transcript)
  if (localResult && confidence >= 0.85) { … }        // never taken
  …
  if (!response.ok) {
    if (localResult) return { ...localResult, currency: opts.currency }   // never taken
    throw new Error(`AI parse failed: ${response.status}`)                 // always taken
  }
```

  Note the unreachable block would also have been wrong if reached: line 59 assigns `merchant`, which is provably `null` at that point.
- **Blast radius:** The whole "Tier 1: local parser (no AI call)" tier documented at `parser.ts:42` does not exist; every utterance costs an AI round-trip. And every AI outage becomes a hard error on the voice path rather than a degraded save.
- **Same defect elsewhere:** None found — `scanParser.ts` has no local tier by design. Grepped: `parseExpenseLocally`, `confidence >=`, `localResult`.
- **Fix:** Decide whether a local tier is wanted. If yes, make `confidence` a function of what was actually matched (a currency-symbol-anchored amount with an explicit unit is high confidence; a bare number is not) and drop the constant. If no, delete `localParser.ts` and both call sites, and make `parseExpense` degrade explicitly — return a `ParsedExpense` with `needs_clarification: true` so the confirm sheet opens with the amount pre-filled and the user finishes it by hand, rather than throwing. Leaving a hard-coded 0.75 next to a 0.85 threshold is the worst of both.
- **Regression test to add:** With the AI endpoint stubbed to 500, assert "twenty dollars" resolves to a confirm-sheet-ready result rather than throwing.

### F24. `ParsedExpense` has no `note` field — the AI can never capture the descriptive half of an utterance
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `packages/shared/src/types/ai.ts:3-18` (13 fields, none of them `note`), `packages/ai/src/parser.ts:77-91` (the normaliser, no note), `apps/mobile/src/components/VoiceConfirmModal.tsx` (`ConfirmedExpense` carries a `note` the parser never populates), `apps/mobile/src/hooks/useTransactions.ts:77` (`note` is a required field of the create payload)
- **What the user sees:** They say "forty dollars at Whole Foods **for the dinner party**". The amount, merchant and category are captured; "for the dinner party" is discarded. The saved transaction's note is empty. Confirmed against production: `transactions.note` is NULL on **all 18 rows ever written, for every user, for all time**.
- **Root cause:** The type the AI is normalised into simply has no slot for it. `ParsedExpense` declares `amount`, `currency`, `direction`, `merchant`, `merchant_domain`, `category_suggestion`, `payment_method`, `transacted_at`, `confidence`, `needs_clarification`, `clarifying_question`, `is_recurring_suggestion`, `recurring_frequency_suggestion` — thirteen fields, no `note`. `parser.ts:77-91` builds the object field-by-field, so even if the model returned a note it would be dropped at the boundary. The manual keypad path *does* have a note input (`record.tsx:598-607`), which is why the column exists at all — and it is behind the "More options" sheet, which explains why no user has ever filled it either.
- **Blast radius:** The note column is dead data in production. Search on the web Transactions page matches against `t.note` (`transactions/page.tsx:394`) and therefore never matches anything. Ask Murmur's context arrays include notes that are always null. Export ships an always-empty column.
- **Same defect elsewhere:** The same drop happens on the scan path (`scanParser.ts` produces a `ParsedExpense`) and the notification-listener path (`useNotificationListener.ts:87-101`). Grepped: `ParsedExpense`, `note`, `note:`.
- **Fix:** Add `note: string | null` to `ParsedExpense`, to the prompt's output schema in `packages/ai/src/prompt.ts`, and to `parser.ts`'s normaliser; surface it as an editable field in `VoiceConfirmModal` so the user sees what was captured. Also promote the manual note field out of the "More options" sheet — a note the user cannot find is the same as no note.
- **Regression test to add:** Parse "forty dollars at Whole Foods for the dinner party" and assert `note` contains "dinner party" and survives to the stored row.

### F25. `recurringPatternDetector` duplicated across web and mobile, with a comment inviting drift
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/web/src/lib/recurringPatternDetector.ts:1-4` (the comment), whole file; `apps/mobile/src/services/recurringPatternDetector.ts`, whole file
- **What the user sees:** Nothing yet — the two copies currently agree. The defect is that nothing keeps them agreeing, and this module decides when the "new pattern detected" banner appears, which is the entry point to the recurring feature.
- **Root cause:** The web copy opens by naming the problem:

```ts
// apps/web/src/lib/recurringPatternDetector.ts:1-4
// Web mirror of apps/mobile/src/services/recurringPatternDetector.ts.
// Same heuristics, same return shape — kept in lock-step so the two surfaces
// surface the same candidates from the same data. If the mobile detector is
// updated, copy the change over here.
```

  "Copy the change over here" is a process, not a mechanism. `diff` of the two files shows they are already not identical: the mobile copy carries a 30-line docstring documenting the heuristics and every threshold, which the web copy dropped, and the web copy recomputes `patternKey(anchor.merchant, anchor.amount)` where mobile reuses the bucket key. The two are currently equivalent in behaviour, but the web reader has no access to the reasoning that justifies the thresholds (≥2 occurrences, ≥21-day spread, the median-gap frequency table) — so the next person to tune one side has nothing telling them the other exists except a comment they may not read.
- **Blast radius:** Both platforms' recurring-suggestion banners. Because F1 makes accepting a suggestion a no-op, this is currently upstream of a broken feature.
- **Same defect elsewhere:** The identical "copy the change over here" arrangement exists for `KNOWN_DOMAINS` (F26, `MerchantLogo.tsx:7`) and, without even a comment, for `Money` (F28), the currency-symbol map (F29), the category palette (F27), and `computeNextOccurrence` (F22). Grepped: `mirror of`, `copy the change`, `lock-step`.
- **Fix:** Move the detector to `packages/shared/src/domain/recurringPatterns.ts` and delete both copies. It is pure logic over `Transaction[]` and `RecurringRule[]` — both types already live in `shared` — so there is no platform-specific dependency to unpick. This is the first and easiest brick of the shared domain layer the Verdict calls for.
- **Regression test to add:** One test file in `packages/shared` covering the threshold table, run once instead of twice.

### F26. 65-entry `KNOWN_DOMAINS` duplicated byte-for-byte, and the fallback tile fails contrast on both platforms
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/web/src/components/MerchantLogo.tsx:7` (the comment), `:13-80` (the map), `:81` (the lookup), `:156` (`color: '#fff'`); `apps/mobile/src/components/MerchantAvatar.tsx:29-96` (the map), `:97` (the lookup), `:183` (`color: '#FFFFFF'`)
- **What the user sees:** Merchants without a resolvable logo get a coloured circle with a white initial. On the mid-tone palette used for the background, the initial is hard to read — roughly 2.2–2.8:1 contrast, against the WCAG AA minimum of 4.5:1 for text. Identical on both platforms.
- **Root cause:** Two problems in one pair of files. The map is a literal duplicate — `diff` of `MerchantLogo.tsx:13-80` against `MerchantAvatar.tsx:29-96` reports **no differences**, 65 entries each — maintained by the same comment-driven process as F25:

```ts
// apps/web/src/components/MerchantLogo.tsx:7
// logos). If mobile's KNOWN_DOMAINS list is updated, copy the change here.
```

  The contrast problem is that both files render white text over `merchantColor(name)` from `packages/shared/src/utils/currency.ts:52-72`, whose palette is deliberately mid-tone (`#2A9D8F`, `#457B9D`, `#6D6875`, `#B5838D`, …). White on `#2A9D8F` is ~2.6:1; on `#B5838D` it is ~2.9:1. The web copy hard-codes `color: '#fff'` at `:156` and mobile at `:183`.
- **Blast radius:** Every transaction row on both platforms whose merchant has no favicon, plus every category-fallback tile. This is a persistent, high-frequency surface — it is the left edge of every list row.
- **Same defect elsewhere:** `merchantColor` is also used by `apps/mobile/src/theme/colors.ts`'s `avatarColors` array, which is a *third* palette for the same purpose, with deeper values (`#8C4A2A`, `#3F5A3E`, …) that would actually pass contrast against white — so the correct colours already exist in the repo and the wrong ones are the ones wired up. Grepped: `KNOWN_DOMAINS`, `merchantColor`, `avatarColors`, `#fff`.
- **Fix:** Move `KNOWN_DOMAINS` and `guessDomain` into `packages/shared` next to `merchantColor` and delete both copies. Then either darken the `merchantColor` palette to the `avatarColors` values (which were chosen for exactly this) or compute the foreground per-background with a relative-luminance check rather than assuming white. Do not fix only the web copy.
- **Regression test to add:** Assert every entry of the merchant-avatar palette reaches ≥4.5:1 against the chosen foreground.

### F27. Category colour is defined three times with three different palettes and three different key sets
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/web/src/lib/theme.ts:52-61` (8 tint keys), `apps/mobile/src/theme/colors.ts:59-66` (6 tint keys, different names), `public.default_categories.color` in the live database (20 rows, a fourth palette entirely), plus the mapping heuristic at `apps/web/src/lib/categories.ts:6-22`
- **What the user sees:** The same category is one colour on the transaction row and a different colour in the chart directly above it. "Groceries" is `#4CAF50` (a saturated Material green) on the row because that is what is stored in `categories.color`, but the web Treemap/Flow/Calendar tint it `#E1E6E0` sage or `#F3E7DC` peach depending on what the regex heuristic decides its name means. Mobile applies a third set again.
- **Root cause:** Three independent sources of truth. Web tints:

```ts
// apps/web/src/lib/theme.ts:52-61
export const cat = {
  food: { bg: '#F3E7DC', fg: '#7A4A22' },      // peach
  transit: { bg: '#E1E6E0', fg: '#395435' },   // sage
  shopping: { bg: '#EEE6F0', fg: '#5C3F66' },  // lavender
  bills: { bg: '#E4E8EE', fg: '#334155' },     // sky-slate
  coffee: { bg: '#F2E8D5', fg: '#7A5A1C' },    // butter
  health: { bg: '#F4DDDD', fg: '#843C3C' },    // rose
  work: { bg: '#E6E7E0', fg: '#45463A' },      // olive
  other: { bg: '#ECE8E0', fg: '#5A5247' },
} as const
```

  Mobile keys the same idea by *colour name* rather than by *category*, with six entries and different `fg` values (`peach: { bg: '#F3E7DC', ink: '#8C4A2A' }` versus web's `food: { bg: '#F3E7DC', fg: '#7A4A22' }` — same background, different ink, and no `bills`/`work`/`other` equivalents). And the database ships a third, unrelated palette: `Groceries #4CAF50`, `Food & Dining #FF6B35`, `Transport #4A90E2`, … 20 saturated colours that are what actually gets copied onto each user's `categories.color` by `seedDefaultCategories`. Web bridges the gap with a regex heuristic (`categories.ts:6-14`) that guesses a tint from the category *name*, so a user who renames "Food & Dining" to "Eating out" silently changes its chart colour.
- **Blast radius:** Every chart, chip and avatar on both platforms. It also means the DB colour — the only per-user, user-editable one — is authoritative on rows and ignored everywhere else.
- **Same defect elsewhere:** `apps/web/src/lib/categories.ts:24-26` (`tintColors`) is a fourth accessor with zero callers (see F36). Grepped: `categoryTints`, `cat = {`, `tintFor`, `default_categories`.
- **Fix:** Make `categories.color` the single source of truth, since it is the only one the user can edit, and derive everything else from it: export `categoryPalette(hexColor)` from `packages/shared` returning `{ bg, fg }` computed by lightening/darkening the stored hex, and delete both hard-coded tint tables and the name-regex heuristic. If the brand sheet's pastels are non-negotiable, then change `default_categories.color` to those pastels so the stored value *is* the brand value — but pick one, do not keep three in sync by hand.
- **Regression test to add:** Assert the colour rendered for a category on a transaction row equals the colour rendered for it in the chart, on both platforms.

### F28. `Money` implemented twice with incompatible APIs
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/components/Money.tsx:4-21` (props), `:38-47` (signature); `apps/web/src/components/Money.tsx:8-20` (props), `:22-32` (signature)
- **What the user sees:** The direct consequence is F3 — mobile shows `$` for a EUR user. The structural finding here is that the two components share a name, a brand spec and a docstring lineage but not a contract, so nothing about them is transferable.
- **Root cause:** Mobile takes a **glyph** with a `$` default and formats with a hard-coded `en-US`; web takes a **currency code** (required) plus a **locale** and delegates to `Intl.NumberFormat.formatToParts`. Mobile has `sign`, `sansWeight`, `muted`, `style`; web has `currency`, `locale`, `bold`, `showPositiveSign`, `color`. The only overlapping props are `value`, `size`, `serif` and `muted`. Web's header comment even states the goal mobile misses:

```tsx
// apps/web/src/components/Money.tsx:1-5
// Money figures with serif (New York / Iowan Old Style) per brand sheet §03.
// Smaller figures fall back to display sans. Currency + locale come from the
// caller (usually plumbed from `profile.currency_code` / `profile.locale`) so
// EUR/GBP/XAF/JPY users see the right symbol + grouping conventions instead
// of a hard-coded `$`.
```
- **Blast radius:** Thirteen mobile call sites and every web money surface. Any future change to money rendering has to be made twice, in two different vocabularies.
- **Same defect elsewhere:** `MurmurMark` is also implemented twice (`apps/mobile/src/components/MurmurMark.tsx`, `apps/web/src/components/MurmurMark.tsx`) — unavoidable for SVG across RN/DOM, but the same "one name, two files" pattern. Grepped: `components/Money`, `export function Money`.
- **Fix:** As in F3: one `formatMoneyParts(value, currencyCode, locale)` in `packages/shared`, two thin renderers that consume its output, and `currency` required on both so the compiler enforces it. The formatting *logic* is platform-independent; only the two dozen lines of markup are not.
- **Regression test to add:** One shared test over `formatMoneyParts` covering USD/en, EUR/fr, JPY/ja and XAF, asserting symbol placement and grouping.

### F29. A second, divergent currency-symbol mapping with a shorter list than the shared one
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/(tabs)/index.tsx:319-327` (`formatBudgetShort`), versus the shared `currencySymbolFor` at `packages/shared/src/utils/currency.ts:19-42`
- **What the user sees:** A CHF, NGN, GHS or XAF user sees their budget header rendered as `CHF473` / `NGN473` with no space, where every other surface in the app renders `CHF 473` / `₦473`.
- **Root cause:** A private ternary chain re-implements the shared switch and drops four of its cases:

```ts
// apps/mobile/app/(tabs)/index.tsx:318-328
/** Compact budget-header amount: "$473" (no decimals — this is a quick-glance surface). */
function formatBudgetShort(amount: number, currency: string): string {
  const glyph =
    currency === 'USD' || currency === 'CAD' || currency === 'AUD' ? '$' :
    currency === 'EUR' ? '€' :
    currency === 'GBP' ? '£' :
    currency === 'JPY' ? '¥' : currency + ' '
  return `${glyph}${Math.round(amount).toLocaleString('en-US')}`
}
```

  The shared `currencySymbolFor` additionally handles `CHF` (`'CHF '`), `NGN` (`'₦'`), `GHS` (`'₵'`) and `XAF` (`'CFA '`). This copy falls through those to `code + ' '`, which for NGN/GHS produces a code where a glyph exists. It also hard-codes `toLocaleString('en-US')`, so it carries F3's grouping bug independently.
- **Blast radius:** The Today screen's budget header — a primary surface. Because the function is file-local, a fix to `currencySymbolFor` will never reach it.
- **Same defect elsewhere:** `apps/mobile/src/components/Money.tsx:44` is the third place a currency glyph is decided (via the `sign` default). Grepped: `case 'EUR'`, `=== 'EUR'`, `currencySymbolFor`, `'$'`. Those three are exhaustive; web decides glyphs only through `Intl`.
- **Fix:** Delete `formatBudgetShort`'s glyph chain and call `currencySymbolFor(currency)`; take the locale as a parameter and pass it to `toLocaleString`. Better, express it as `formatMoneyParts(amount, currency, locale)` from F3's fix with `maximumFractionDigits: 0`, so "compact" is a rendering option rather than a second formatter.
- **Regression test to add:** Assert `formatBudgetShort(473, 'NGN', 'en')` renders `₦473`, matching `currencySymbolFor('NGN')`.

### F30. `formatCurrency` called without a locale at eleven lines across mobile and web
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/components/SafeToSpend.tsx:43`, `:58` (two calls on this line), `:62`, `:68`, `:73`, `:78`; `apps/mobile/app/transaction/[id].tsx:151`; `apps/web/src/components/CategoryChart.tsx:47`, `:64`; `apps/web/src/components/SpendingChart.tsx:56`, `:67` — eleven lines, twelve calls. Verified exhaustive by `grep -rn "formatCurrency("`. The signature that permits it: `packages/shared/src/utils/currency.ts:1-12`
- **What the user sees:** A French user's Safe-to-Spend card reads `$1,250.00` grouping where the rest of their French-locale app reads `1 250,00`. The currency symbol is right; the separators are not.
- **Root cause:** The shared helper defaults the locale rather than requiring it:

```ts
// packages/shared/src/utils/currency.ts:1-5
export function formatCurrency(
  amount: number,
  currencyCode: string,
  locale: string = 'en',
): string {
```

  so omitting the third argument compiles cleanly and silently formats in English. `SafeToSpend` is the sharpest case: it *receives* `locale` as a prop and uses it for every `t(...)` call on the same lines, then drops it from all six `formatCurrency` calls beside them — e.g. `{t('home.over_budget', locale)} {formatCurrency(overBy, currency)}`. `transaction/[id].tsx:151` does the same inside a screen that has `locale` in scope. On web, both chart components receive `currency` from the page but never plumb `locale` down at all.
- **Blast radius:** Safe-to-Spend is on the Today screen — the app's most-viewed surface. The two web charts are on the dashboard home. Currently invisible because all six production profiles are `locale='en'`.
- **Same defect elsewhere:** `packages/shared/src/utils/currency.ts:44-49` (`formatAmount`) has the identical defaulted-locale signature and zero callers (F36). `apps/mobile/src/components/Money.tsx:51` and `apps/mobile/app/(tabs)/index.tsx:327` hard-code `'en-US'` outright rather than defaulting (F3, F29). Grepped: `formatCurrency(`, `formatAmount(`, `toLocaleString(`.
- **Fix:** Make `locale` a required parameter of `formatCurrency` and let the compiler find all eleven sites — that is the whole fix, and it is mechanical. A default that is silently wrong for three of four supported locales is not a convenience. Then thread `locale` into `CategoryChart` and `SpendingChart` from the page that already has it.
- **Regression test to add:** Typecheck assertion that `formatCurrency(1, 'EUR')` (two args) fails to compile.

### F31. `packages/supabase` is a fully dead workspace package
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `packages/supabase/src/index.ts:1-5`, `packages/supabase/src/client.ts`, `packages/supabase/src/queries/{transactions,categories,budgets,profiles}.ts`; wired up but unused at `apps/mobile/package.json:17`, `apps/mobile/babel.config.js:11`, `apps/mobile/tsconfig.json:9`
- **What the user sees:** Nothing. The cost is that the package it was meant to be — the one shared data-access layer both apps read through — exists, compiles, is in the dependency graph, and is bypassed by every consumer.
- **Root cause:** The package exports exactly the surface both apps need:

```ts
// packages/supabase/src/index.ts:1-5
export { createBrowserClient, createServerClient } from './client'
export * from './queries/transactions'
export * from './queries/categories'
export * from './queries/budgets'
export * from './queries/profiles'
```

  and a repo-wide grep for `@voice-expense/supabase` returns **five** hits, all of them build configuration: the mobile `package.json` dependency, the babel module-resolver alias, the tsconfig path, the package's own name field, and a turbo log. **Zero** source files import it. Mobile builds its own client at `apps/mobile/src/lib/supabase.ts` and web builds two more at `apps/web/src/lib/supabase/{client,server}.ts`; every query is written inline at its call site.
- **Blast radius:** This is the direct cause of the duplication catalogue in this report. Because there is no shared data layer, `apps/web/src/lib/data.ts` and `apps/mobile/src/hooks/*` each invented their own fetch shape, error policy (F5), and aggregation (F8) for the same four tables.
- **Same defect elsewhere:** `packages/shared/src/utils/date.ts` is dead in the same way (F37). Grepped: `@voice-expense/supabase`, `packages/supabase`.
- **Fix:** Either adopt it or delete it. Adopting is the right call and is the concrete form of the Verdict's recommendation: move the query bodies from `apps/web/src/lib/data.ts` and the mobile hooks into `packages/supabase/src/queries/*`, give each one an explicit `Result<T, Error>` return so the error policy is decided once (fixing F5's web half), and have both apps call them. Deleting it without a replacement leaves the duplication permanent.
- **Regression test to add:** CI assertion that `apps/web/src/lib/data.ts` contains no direct `.from(` calls once the migration lands.

### F32. `deleteTransaction` drops the sync enqueue when the row is not in React state — and has zero callers
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/hooks/useTransactions.ts:134-154` (the dead function, `:141-151` the defect); the live delete path that duplicates it is `apps/mobile/app/transaction/[id].tsx:147-182`
- **What the user sees:** Nothing today. The function is exported from the hook (`:196`) but no screen destructures it — verified by grepping every `useTransactions(` call site: eleven screens, and the only one that takes a mutation other than `createTransaction` is `edit.tsx:41`, which takes `editTransaction`.
- **Root cause:** The local soft-delete happens unconditionally, but the queue write is conditional on the row being present in this hook instance's React state:

```ts
// apps/mobile/src/hooks/useTransactions.ts:137-151
    await softDeleteTransaction(id)
    await loadLocal()
    DataEvents.emitTransactions(userId)

    const txn = transactions.find((t) => t.id === id)
    if (txn) {
      await enqueue('delete', id, { … version: (txn.version ?? 1) + 1 })
      syncManager.drainQueue()
    }
```

  `transactions` is the state captured by this render's closure. If the row was never loaded into this instance (a different screen's instance, a row that arrived after the last `loadLocal`, or the stale closure of a component that has not re-rendered), the delete lands in SQLite and never reaches Postgres — the row reappears on the next `pullRemote`, or persists forever on the server.
- **Blast radius:** None currently. The live path at `transaction/[id].tsx:153-162` reimplements the same logic *correctly*, reading `snapshot.version` from the loaded transaction rather than from list state — so the dead copy is the buggy one and the live copy is the good one, which is the opposite of what a reader would assume.
- **Same defect elsewhere:** `editTransaction` (`:156-194`) avoids the trap by re-reading through `getTransactionById` before enqueueing (`:185-187`) — a third pattern for the same operation. Grepped: `deleteTransaction`, `softDeleteTransaction`, `enqueue('delete'`.
- **Fix:** Delete the dead function and move `transaction/[id].tsx`'s implementation into the hook, so there is one delete path. Read the row through `getTransactionById` (as `editTransaction` does) rather than through React state, so the enqueue is unconditional.
- **Regression test to add:** Delete a transaction that is not present in the calling component's state and assert a `delete` queue entry exists.

### F33. Desktop shell has no `will-navigate` guard and the web app serves no CSP
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/desktop/src/main.ts:180-217` (`webPreferences` and `setWindowOpenHandler`, with no `will-navigate` listener anywhere in the file), `apps/web/next.config.ts:7-12` (no `headers()`)
- **What the user sees:** Nothing normally. The exposure is that a link rendered inside the app that navigates the top-level frame (rather than opening a new window) replaces the app shell with an arbitrary remote page, still inside the Electron window and still holding the user's Supabase session cookies.
- **Root cause:** The shell handles `window.open` carefully and top-level navigation not at all:

```ts
// apps/desktop/src/main.ts:191-197
  mainWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    if (openUrl.startsWith('http://') || openUrl.startsWith('https://')) {
      shell.openExternal(openUrl)
      return { action: 'deny' }
    }
```

  `setWindowOpenHandler` only fires for `window.open` / `target="_blank"`. A same-frame navigation (`location.href = …`, a plain `<a href>`) is governed by `webContents.on('will-navigate', …)`, which is not registered. The baseline hardening is otherwise good — `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, and the same options are re-applied to child windows at `:208-214` — which makes the missing navigation guard the one gap. Separately, `next.config.ts` defines `transpilePackages`, `allowedDevOrigins`, `output` and `outputFileTracingRoot`, and no `headers()` function, so no `Content-Security-Policy` is emitted on any route.
- **Blast radius:** Desktop shell integrity, plus every web route (a CSP is the mitigation that would contain an injected script on the dashboard, which renders user-supplied merchant and note strings). Related: `apps/web/src/app/layout.tsx:14-17` loads a stylesheet from `fonts.googleapis.com`, so any CSP added later must allow that origin or the font load breaks (see F40).
- **Same defect elsewhere:** None found — one Electron main file, one Next config. Grepped: `will-navigate`, `setWindowOpenHandler`, `headers()`, `Content-Security-Policy`.
- **Fix:** Add `mainWindow.webContents.on('will-navigate', (e, navUrl) => { if (new URL(navUrl).origin !== embeddedOrigin) { e.preventDefault(); shell.openExternal(navUrl) } })`, and apply it to child windows via `app.on('web-contents-created')` so it cannot be forgotten for a new window. Add a `headers()` block to `next.config.ts` emitting a CSP with `default-src 'self'`, an explicit `style-src` for the Google Fonts origin (or, better, self-host the fonts per F40 and drop the exception), plus `frame-ancestors 'none'` and `X-Content-Type-Options: nosniff`.
- **Regression test to add:** Drive the packaged app to `location.href = 'https://example.com'` and assert the shell URL is unchanged.

### F34. `profileCurrency` defaults to `'USD'`, and the sign-out reset its own docstring promises does not exist
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/services/profileCurrency.ts:17-18` (the docstring claim), `:21` (the default), `:23-25` (the only setter), `apps/mobile/src/hooks/useProfile.ts:36` (the only call site), consumed at `apps/mobile/src/hooks/useTransactions.ts:89`, `apps/mobile/src/services/recurringCatchUp.ts:81`, `apps/mobile/src/services/fxBackfill.ts:32`
- **What the user sees:** After signing out of a EUR account and signing into a USD account on the same device — or vice versa — an expense saved before the new profile loads is FX-converted against the *previous* user's currency, so the amount that feeds every total is wrong by an exchange rate.
- **Root cause:** A module-level mutable cache with a hard default:

```ts
// apps/mobile/src/services/profileCurrency.ts:21-25
let cached: string = 'USD'

export function setCurrentProfileCurrency(code: string | null | undefined): void {
  if (code && typeof code === 'string') cached = code
}
```

  The setter is guarded so it can never be reset — passing `null` or `''` is a no-op by design. And the module's own docstring asserts a reset that does not exist:

```
 *   - Signing out resets to 'USD' via `useAuth`'s session listener
 *     (handled in app/_layout.tsx).
```

  Grepping the whole repo for `setCurrentProfileCurrency` returns exactly two hits: the declaration and `useProfile.ts:36`. There is no sign-out reset in `_layout.tsx`, in `useAuth.ts`, or anywhere else. The value therefore survives the entire process lifetime across account switches. `useProfile` also only calls the setter inside `if (data)` (`:31-36`), so a failed profile fetch leaves the stale value in place indefinitely.
- **Blast radius:** Three write paths read this cache to snapshot FX: interactive saves, recurring catch-up, and the FX backfill sweep — and the backfill is the worst, because it writes `amount_in_profile_currency` for up to 100 historical rows at once (`fxBackfill.ts:41,59-66`) using whatever the cache happens to hold. A stale value there silently rewrites a hundred rows' converted amounts.
- **Same defect elsewhere:** None found — this is the only module-level mutable user-scoped cache. Grepped: `let cached`, `getCurrentProfileCurrency`, `setCurrentProfileCurrency`.
- **Fix:** Delete the cache. The three consumers all run in contexts that can be given the currency explicitly: `createTransaction` already lives in a hook that can take it from `useProfile`, and `runRecurringCatchUp`/`runFxBackfill` are invoked from `_layout.tsx` where the profile is already loaded — pass it as a parameter. A process-global keyed to nothing is the wrong shape for a per-user value in an app that supports sign-out. If a cache is kept as an interim, key it by user id and return `null` (forcing the caller to wait) rather than a guessed default — a wrong FX snapshot is worse than a deferred save.
- **Regression test to add:** Sign in as a EUR user, sign out, sign in as a USD user, save immediately, and assert `fx_rate_to_profile` is 1.0.

### F35. Delete sync has no version guard — a stale delete clobbers a newer server edit
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/services/sync/SyncManager.ts:127-134` (the delete branch), versus `apps/mobile/src/services/sync/transactionStore.ts:77` (the local guard that does exist); the enqueue site is `apps/mobile/app/transaction/[id].tsx:155-161`
- **What the user sees:** They delete a transaction on the phone while offline, then edit that same transaction on the web dashboard, then bring the phone online. The phone's queued delete wins and the web edit is discarded — even though it was made later.
- **Root cause:** The delete is an unconditional `UPDATE` scoped only by identity:

```ts
// apps/mobile/src/services/sync/SyncManager.ts:128-133
              const { error } = await supabase
                .from('transactions')
                .update({ is_deleted: true, deleted_at: payload.deleted_at, version: payload.version })
                .eq('id', payload.id)
                .eq('user_id', payload.user_id)
```

  The payload carries a `version` (computed at `[id].tsx:153` as `(snapshot.version ?? 1) + 1`) and it is *written* but never *tested*. Compare the local store, which does implement the guard — `WHERE excluded.version >= transactions.version` at `transactionStore.ts:77`. So SQLite protects itself against stale writes and Postgres does not.
- **Blast radius:** Any multi-device or web+mobile user. It also applies in reverse to the create/update branch at `:106-108`, which upserts `onConflict: 'id'` with no version predicate — a queued update from an offline phone overwrites a newer web edit field-for-field.
- **Same defect elsewhere:** `apps/web/src/app/dashboard/transactions/page.tsx:360-368` performs the same unguarded soft-delete from the web side (`.update({ is_deleted, deleted_at, version })` scoped by `id` + `user_id` only), so the race is symmetric. Grepped: `is_deleted: true`, `.update(`, `version`.
- **Fix:** Add `.lte('version', payload.version)` (or better, `.eq('version', payload.version - 1)`) to both branches and to the web delete, and treat a zero-row result as a conflict rather than a success — surfacing it through the dead-letter mechanism F5 asks for, so the user is told "this was changed elsewhere" instead of silently losing one side. Last-write-wins with no version test is not a conflict policy; it is the absence of one.
- **Regression test to add:** Queue a delete at version 2, bump the server row to version 3 out of band, drain, and assert the row is not deleted and the entry is surfaced as a conflict.

### F36. Nine exported functions with zero callers, including the entire dead-letter recovery surface
- **Severity:** Low *(downgraded from Medium: dead code with no user-facing consequence; the one substantive item — the missing dead-letter UI — is already the subject of F5)*
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/services/sync/syncQueue.ts:53-59` (`getDeadLetterEntries`), `:61-64` (`clearDeadLetterEntry`); `packages/shared/src/utils/fx.ts:48-52` (`isFxPending`); `packages/shared/src/utils/currency.ts:44-49` (`formatAmount`); `packages/shared/src/utils/date.ts:1-3` (`startOfMonth`), `:5-7` (`endOfMonth`), `:9-11` (`toISOString`), `:13-23` (`formatRelativeDate`); `apps/web/src/lib/categories.ts:24-26` (`tintColors`)
- **What the user sees:** Nothing. The signal is what the dead code says about what was intended: a dead-letter recovery screen (F5), an FX-pending indicator (F8), and a shared date layer (F37) were all designed and half-built, then never wired.
- **Root cause:** Each was written against a consumer that was never implemented. Verified individually by grepping each identifier across `apps/`, `packages/` and `supabase/` and subtracting declaration sites: all nine return zero. Two need care when grepping — `toISOString` collides with `Date.prototype.toISOString` (58 apparent hits, all method calls) and `startOfMonth`/`endOfMonth` collide with `apps/web/src/app/dashboard/insights/page.tsx:26,29`, which declares its *own* local functions of those names rather than importing the shared ones (see F37).
- **Blast radius:** None at runtime. It inflates the bundle marginally and, more importantly, makes the codebase read as though these capabilities exist.
- **Same defect elsewhere:** The whole `packages/supabase` package is dead at the module level (F31), and `apps/mobile/src/hooks/useTransactions.ts:134-154` (`deleteTransaction`) is a dead function with a live duplicate (F32). Grepped each identifier individually; also `ts-prune`-style sweep across `packages/shared/src/index.ts`'s re-exports.
- **Fix:** Wire the three that represent real intent — `getDeadLetterEntries` + `clearDeadLetterEntry` into the sync-health banner F5 asks for, and `isFxPending` into the pending-conversion indicator F8 asks for. Delete the rest (`formatAmount`, `tintColors`) or, for the date helpers, adopt them per F37. Add a `knip`/`ts-prune` check to CI so unexported-and-unused does not accumulate again.
- **Regression test to add:** CI step failing the build on newly-added unused exports in `packages/shared`.

### F37. Month-boundary helpers exist in `shared` and are used by nobody; both apps re-implement them
- **Severity:** Low *(downgraded from Medium: the duplication is real but each copy is currently correct; the harm is that the date logic F2 and F14 need to fix lives in five places)*
- **Status:** Newly discovered
- **Where:** `packages/shared/src/utils/date.ts:1-11` (the unused helpers); the re-implementations at `apps/web/src/app/dashboard/insights/page.tsx:26-31`, `apps/web/src/app/dashboard/page.tsx:55-56`, `apps/web/src/app/dashboard/transactions/page.tsx:378-382`, `apps/mobile/src/hooks/useTransactions.ts:202`, `apps/mobile/app/(tabs)/index.tsx:62-63`, `apps/mobile/app/(tabs)/insights.tsx:178-186`, `apps/mobile/src/hooks/useRecurringRules.ts:8-38`; the re-implemented `formatTime` at `apps/mobile/src/components/TransactionRow.tsx:23`
- **What the user sees:** Nothing directly — but this is why F2's timezone bug had to be fixed in one place and could just as easily have been introduced in six.
- **Root cause:** `packages/shared/src/utils/date.ts` exports `startOfMonth`, `endOfMonth`, `toISOString` and `formatRelativeDate`, is re-exported from `packages/shared/src/index.ts:12`, and is imported by nothing. Meanwhile `apps/web/src/app/dashboard/insights/page.tsx:26-31` declares its own `startOfMonth(year, month)` and `endOfMonth(year, month)` with a *different signature* (integers rather than a `Date`), and five other files inline `new Date(y, m, 1)` / `new Date(y, m + 1, 0, 23, 59, 59, 999)` by hand. `TransactionRow.tsx:23` re-implements `formatTime` locally rather than importing the shared one.
- **Blast radius:** Seven month-boundary computations that must agree and are maintained separately. The shared versions are also the wrong shape for the fix F14 requires — they take no timezone — so adopting them as-is would not help; they need the IANA-zone parameter first.
- **Same defect elsewhere:** `computeNextOccurrence` (F22) is the same story with three copies and an actual bug in all three. Grepped: `startOfMonth`, `endOfMonth`, `formatRelativeDate`, `formatTime`, `new Date(.*, 1, 0, 0, 0, 0)`.
- **Fix:** Rewrite `packages/shared/src/utils/date.ts` to take an explicit IANA timezone (`monthBounds(monthIso, timeZone)` returning ISO strings, not `Date`s), make it the only month-boundary implementation, and delete all seven re-implementations. Returning ISO strings rather than `Date` objects also makes F2 structurally impossible, because there is no local-time instant to misread across a runtime boundary. Do the two together — adopting the current signature would just move the bug.
- **Regression test to add:** Assert `monthBounds('2026-08', 'America/Chicago')` returns `2026-08-01T05:00:00Z` / `2026-09-01T04:59:59.999Z`.

### F39. Support address points at an unregistered domain and is shipped on two platforms
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `packages/shared/src/brand.ts:13-17` (the constant and its own admission), `:20` (`SUPPORT_MAILTO`); shipped at `apps/mobile/app/more/help.tsx:25,28` and `apps/web/src/app/dashboard/settings/page.tsx:572,575`
- **What the user sees:** Help → "Contact support · support@murmur.app". Tapping it opens a mail composer addressed to a domain with no MX record, so the message bounces. The same address is shown and linked on the web Settings page.
- **Root cause:** The constant is a knowingly-shipped placeholder:

```ts
// packages/shared/src/brand.ts:13-17
/** Customer support inbox. Until `murmur.app` is registered + DNS is
 *  pointing at a real inbox, this is intentionally a placeholder; the
 *  important property is that nothing in the shipping app exposes a
 *  developer's personal email. Replace once the domain is live. */
export const SUPPORT_EMAIL = 'support@murmur.app'
```

  The reasoning is sound as far as it goes (it fixed a worse problem — a personal Gmail in the shipping app) but it stops one step short: there is no gate preventing the placeholder from reaching users, and both surfaces render it unconditionally.
- **Blast radius:** Every support request from every user silently fails. App Review also requires a working support contact, so this is a submission risk alongside F12's placeholder URL.
- **Same defect elsewhere:** `apps/mobile/app/more/settings.tsx:196` ships a placeholder iCloud URL with the same shape of problem (F12). Those two are the only placeholders that reach the UI. Grepped: `placeholder`, `SUPPORT_EMAIL`, `murmur.app`, `mailto`.
- **Fix:** Register the domain and point MX at a real inbox — this is a prerequisite for release, not a code change. Until then, make the constant nullable and have both Help surfaces hide the row when it is unset, so the app never offers a contact route it cannot honour.
- **Regression test to add:** Assert the support row is not rendered when `SUPPORT_EMAIL` is empty.

### F40. Desktop app loads fonts from Google over the network; offline launch degrades typography
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/layout.tsx:13-18`
- **What the user sees:** Launching the desktop app without a network connection renders every screen in the system fallback face instead of Plus Jakarta Sans / DM Mono. Amounts lose their tabular alignment and the brand typography is gone. On a slow connection the same happens for the first second, then reflows.
- **Root cause:** The root layout links the stylesheet from a third-party origin at request time:

```tsx
// apps/web/src/app/layout.tsx:13-18
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
```

  The desktop app serves the same Next build from an embedded local server (`apps/desktop/src/main.ts`), so the HTML is local but the fonts are not — the one remote dependency in an otherwise offline-capable shell. It also sends a request to Google on every cold start, which is a privacy leak for an app the Privacy screen describes as local-first.
- **Blast radius:** Desktop offline and first-paint on web. It also constrains F33's CSP, which would have to allow `fonts.googleapis.com` and `fonts.gstatic.com`.
- **Same defect elsewhere:** The merchant-logo fetch (`MerchantLogo.tsx:126`, `MerchantAvatar.tsx:140`) also hits `t0.gstatic.com`, but that one degrades gracefully to the initial tile by design. Note mobile has the mirror-image problem: 305 `fontFamily` rules reference Plus Jakarta Sans and the app loads no font files at all. Grepped: `fonts.googleapis.com`, `gstatic`, `<link`, `fontFamily`.
- **Fix:** Self-host. Use `next/font/google`, which downloads the files at build time and serves them from the app's own origin — no runtime request, no third-party origin in the CSP, correct rendering offline. This is a two-line change and it also fixes the layout shift.
- **Regression test to add:** Build with network access blocked at runtime and assert the computed font-family of a money element is Plus Jakarta Sans.

### F41. `/auth/callback` is unreachable dead code behind the middleware
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/auth/callback/route.ts:4-17`, `apps/web/middleware.ts:30-35` (the redirect), `:44-46` (the matcher)
- **What the user sees:** Nothing — Google OAuth works, because it completes through the Supabase client's implicit/PKCE handling on the login page rather than through this route. The finding is that a route which looks like the OAuth callback is never executed, which is a trap for whoever next touches auth.
- **Root cause:** The middleware matcher `'/((?!_next/static|_next/image|favicon.ico).*)'` matches `/auth/callback`, and the gate rejects it before the handler runs:

```ts
// apps/web/middleware.ts:30-35
  const isLoginPage = request.nextUrl.pathname.startsWith('/login')
  const isApiRoute = request.nextUrl.pathname.startsWith('/api')

  if (!user && !isLoginPage && !isApiRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
```

  At callback time there is by definition no session yet, and `/auth/callback` is neither `/login` nor `/api`, so the request is redirected to `/login` and `exchangeCodeForSession` (`route.ts:11`) never runs.

  **Explicitly not a redirect vulnerability.** The earlier draft's concern about `${origin}${next}` is refuted: `origin` is derived from the request URL and `next` is appended as a path, so `?next=//evil.com` produces `https://app.example.com//evil.com` — a path on the app's own origin. The response cannot leave the origin regardless of the `next` value.

```ts
// apps/web/src/app/auth/callback/route.ts:7,13
  const next = searchParams.get('next') ?? '/dashboard'
      return NextResponse.redirect(`${origin}${next}`)
```
- **Blast radius:** None at runtime. The risk is latent: the day someone switches the login page to the server-side PKCE flow that *needs* this route, it will fail with a redirect loop and the cause will be in a different file.
- **Same defect elsewhere:** None found — this is the only route shadowed by the middleware. Grepped: `middleware`, `matcher`, `exchangeCodeForSession`, `auth/callback`.
- **Fix:** Add `/auth` to the middleware's allow-list alongside `/login` and `/api` (`const isAuthRoute = pathname.startsWith('/auth')`), which makes the route work and costs nothing since it has no session to protect. If the server-side flow is genuinely not wanted, delete the route file instead — but do not leave a plausible-looking auth handler that cannot execute.
- **Regression test to add:** Request `/auth/callback?code=x` unauthenticated and assert the handler runs rather than redirecting to `/login`.

### F42. `.gitignore` tail is corrupted UTF-16, so its last two rules never match
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `.gitignore`, final two rules (byte offset ~0xAA to end)
- **What the user sees:** `tsconfig.tsbuildinfo` files are not ignored and show up as untracked noise in `git status` — `apps/web/tsconfig.tsbuildinfo` is present in the working tree right now.
- **Root cause:** An editor wrote the last section as UTF-16LE with CRLF while the rest of the file is UTF-8 with LF. A hex dump of the tail shows the transition mid-file:

```
000000a0: 636f 7665 7261 6765 2f0a 0d00 0a00 2300   coverage/.....#.
000000b0: 2000 5400 7900 7000 6500 5300 6300 7200    .T.y.p.e.S.c.r.
...
000000f0: 6300 6800 6500 0d00 0a00 2a00 2a00 2f00   c.h.e.....*.*./.
00000100: 7400 7300 6300 6f00 6e00 6600 6900 6700   t.s.c.o.n.f.i.g.
00000110: 2e00 7400 7300 6200 7500 6900 6c00 6400   .t.s.b.u.i.l.d.
00000120: 6900 6e00 6600 6f00 0d00 0a00             i.n.f.o.....
```

  Git reads `.gitignore` as bytes. The final pattern is literally `*\0*\0/\0t\0s\0c\0o\0n\0f\0i\0g\0.\0t\0s\0b\0u\0i\0l\0d\0i\0n\0f\0o\0`, which can never match a real path. The preceding comment line is corrupted the same way.
- **Blast radius:** Build artefacts pollute `git status`, which is how a genuinely important file gets committed by accident during a `git add .`. Everything above `coverage/` is intact.
- **Same defect elsewhere:** None found — checked every tracked text file for a UTF-16 BOM or interleaved nulls; `.gitignore` is the only one. Grepped: `file .gitignore`, byte scan for `\x00` across tracked files.
- **Fix:** Rewrite the last two lines in UTF-8 with LF endings and add `*.tsbuildinfo` while there. Add a `.gitattributes` with `* text=auto eol=lf` so an editor cannot reintroduce this.
- **Regression test to add:** CI check that no tracked text file contains a null byte.

### F43. The outbox has no retry scheduler — `retryTimer` is declared and cleared but never set
- **Severity:** High
- **Status:** Newly discovered *(added during verification)*
- **Where:** `apps/mobile/src/services/sync/SyncManager.ts:32` (the field), `:54-57` (the only other reference — clearing it), `:1-6` (the docstring that promises backoff), `:69-75` (the only automatic trigger)
- **What the user sees:** They save a transaction while the network is briefly flaky. The write fails. The app then reports "0 pending" and never tries again — not in five seconds, not in five minutes. The transaction sits in the outbox until the user force-quits and relaunches the app, or until the network physically disconnects and reconnects. On a stable connection with a transient server-side failure, that is *never*.
- **Root cause:** The class advertises exponential backoff:

```ts
// apps/mobile/src/services/sync/SyncManager.ts:1-6
/**
 * SyncManager — singleton that:
 * 1. Listens to network state changes
 * 2. Drains the sync queue when online (chronologically, with exponential backoff)
 * 3. Pulls remote changes from Supabase and merges them into SQLite
 */
```

  and declares a timer for it:

```ts
// apps/mobile/src/services/sync/SyncManager.ts:32
  private retryTimer: ReturnType<typeof setTimeout> | null = null
```

  Grepping the file for `retryTimer` returns exactly three hits: the declaration at `:32`, and the null-check/clear pair inside `stop()` at `:54-56`. **It is never assigned.** There is no `setTimeout` anywhere in the file. The only automatic re-trigger is an offline→online transition:

```ts
// apps/mobile/src/services/sync/SyncManager.ts:69-75
  private handleNetworkChange = (state: NetInfoState): void => {
    const wasOffline = !this.isOnline
    this.isOnline = Boolean(state.isConnected && state.isInternetReachable !== false)
    if (this.isOnline && wasOffline) {
      this.drainQueue()
    }
  }
```

  So the drain fires on: a network transition, a new write (`useTransactions.ts:129,150,190`; `transaction/[id].tsx:162,179`), and `start()` via the initial `NetInfo.fetch()`. Nothing else. The comment at `:140` — "Stop draining on error — will retry next time we go online" — describes a mechanism that only exists if the network actually flaps.
- **Blast radius:** This is what makes F5's `break`-on-first-error permanent rather than momentary. One transient 500 or one expired JWT parks the entire outbox — including every healthy entry queued behind the failing one — for the remainder of the app session, while `notify(false, 0)` reports it as healthy. Combined with F4 (the UI already said "saved") the user has no signal at any layer.
- **Same defect elsewhere:** None found — `SyncManager` is the only retry surface in the app. The web app has no outbox at all (it writes synchronously). Grepped: `retryTimer`, `setTimeout`, `backoff`, `retry`, `drainQueue`.
- **Fix:** Implement the scheduler the docstring already promises, as part of F5's outbox rebuild. After a drain that ends with entries still pending, schedule `drainQueue` on an exponential delay derived from the highest `retry_count` among pending entries (e.g. `min(30s * 2^n, 15min)`), storing the handle in `retryTimer` so `stop()`'s existing cleanup finally has something to clean. Also re-drain on `AppState` returning to `active`, which is the common real-world recovery moment and is currently not wired either. Do not simply drain in a fixed interval — a permanently-rejected entry must reach the dead state (F5 step 1) rather than being retried forever, which is the same mistake `resetDeadLetterEntries` makes at launch.
- **Regression test to add:** Fail one drain with a 503 while the device stays continuously online; assert a second drain is attempted automatically within the backoff window and that `retryTimer` is non-null in between.

### F44. `pullRemote` restores at most 200 rows and never paginates; its `since` argument is always `undefined`
- **Severity:** High *(becomes Critical for any user who crosses 200 transactions and then reinstalls or changes device — at that point every mobile total is wrong)*
- **Status:** Newly discovered *(added during verification)*
- **Where:** `apps/mobile/src/services/sync/SyncManager.ts:156-176` (the query and its `.limit(200)` at `:164`), `apps/mobile/src/hooks/useTransactions.ts:16` (the ref), `:26-36` (the only caller)
- **What the user sees:** A user with 400 logged transactions gets a new phone, or reinstalls the app. After signing in, the app shows only the 200 most-recently-updated transactions. Everything older is gone from Today's totals, from Insights, from the Budgets ring, from the History heatmap and from Export — with no message, no "load more", and no indication that anything is missing. The data is still on the server and visible on the web dashboard, so the two platforms disagree about how much money the user has spent.
- **Root cause:** The pull is a single capped page with no cursor and no follow-up:

```ts
// apps/mobile/src/services/sync/SyncManager.ts:159-175
    let query = supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(200)

    if (since) {
      query = query.gt('updated_at', since)
    }

    const { data, error } = await query
    if (error || !data) return

    for (const row of data) {
      await upsertTransaction(row as Transaction)
    }
```

  There is no `range()`, no loop, and no "did I get a full page, fetch the next one" check. The incremental path that would make the 200-row cap harmless does not work either: `since` comes from `lastSyncedAt.current`, a `useRef(undefined)` that is only assigned *after* the pull completes —

```ts
// apps/mobile/src/hooks/useTransactions.ts:26-35
    loadLocal().then(() => {
      syncManager.pullRemote(userId, lastSyncedAt.current).then(() => {
        lastSyncedAt.current = new Date().toISOString()
        loadLocal()
      })
    })
```

  — inside an effect whose deps are `[userId, loadLocal]`, so it runs exactly once per mount. `lastSyncedAt.current` is therefore **always `undefined`** at the moment it is read, the `gt('updated_at', since)` filter is never applied, and the ref is never persisted across launches. Every pull is a full top-200 pull, forever.
- **Blast radius:** Every mobile read surface, because they all read local SQLite via `getTransactions` (`transactionStore.ts:41-48`) rather than the server. The threshold is reachable in a few months of normal use for the app's own target user. It compounds with F4: rows that never synced are also absent from the server, so a reinstall loses those permanently *and* truncates the rest. Note the local dedup index and `hasRecurringOccurrence` (`recurringCatchUp.ts:58-62`) consult SQLite, so a truncated local history can also cause the catch-up generator to re-create occurrences it cannot see.
- **Same defect elsewhere:** `apps/web/src/lib/data.ts`'s `getTransactions` should be checked for the same cap — Supabase's PostgREST applies a default row limit (1000) when none is given, so the web dashboard has the same class of silent truncation at a higher threshold with no pagination either. `apps/mobile/src/services/fxBackfill.ts:41` caps at 100 but is explicitly designed to resume across launches, which is the correct pattern. Grepped: `.limit(`, `.range(`, `pullRemote`, `lastSyncedAt`.
- **Fix:** Two changes, both necessary. First, make `pullRemote` paginate: loop with `.range(offset, offset + 499)` until a short page returns, so a full restore is complete by construction. Second, persist the high-water mark — write the max `updated_at` seen to SQLite (not a React ref) and read it back on launch, so subsequent pulls are genuinely incremental and cheap. The ref-based `since` should be deleted rather than fixed; a per-hook-instance ref cannot be a sync cursor when eleven instances exist (F45).
- **Regression test to add:** Seed 450 server transactions, run a cold-start pull, and assert local SQLite holds all 450 and that a second pull transfers zero rows.

### F45. `useTransactions` is instantiated independently by eleven screens — no shared store
- **Severity:** Medium
- **Status:** Newly discovered *(added during verification)*
- **Where:** `apps/mobile/src/hooks/useTransactions.ts:12-74` (the hook: state, initial pull, event listener, realtime channel); call sites at `apps/mobile/app/(tabs)/_layout.tsx:47`, `app/(tabs)/index.tsx:126`, `app/(tabs)/record.tsx:51`, `app/(tabs)/budgets.tsx:61`, `app/(tabs)/insights.tsx:139`, `app/more/settings.tsx:68`, `app/more/transactions.tsx:67`, `app/more/ask-result.tsx:61`, `app/more/privacy.tsx:117`, `app/transaction/edit.tsx:41`, `app/(onboarding)/income.tsx:32`
- **What the user sees:** Sluggish tab switching and heavy battery/data use. Sitting on the Today tab already holds at least two live instances, because `(tabs)/_layout.tsx` mounts one for the tab-bar badge and `(tabs)/index.tsx` mounts another for the list; expo-router keeps tab screens mounted, so visiting all five tabs holds five, and the More screens add more on top.
- **Root cause:** The hook is a per-component data source with no shared cache. Each instance independently:
  1. holds its own `transactions` array and runs its own `getTransactions` SQLite query on mount and on every `DataEvents.onTransactions` emission (`:39-42`) — so a single save triggers N full SQLite reads and N React re-renders;
  2. issues its own `syncManager.pullRemote(...)` (`:31`), each a full top-200 network fetch (F44), each with its own useless `lastSyncedAt` ref;
  3. opens its own Supabase realtime channel with a randomised name (`:50-68`):

```ts
// apps/mobile/src/hooks/useTransactions.ts:50-52
    const channelName = `transactions:${userId}:${Math.random().toString(36).slice(2)}`
    const channel = supabase
      .channel(channelName)
```

  The random suffix is documented as a Strict-Mode workaround, but its effect is that de-duplication is impossible by construction — N mounts mean N websocket subscriptions to the same filter. (Those subscriptions currently deliver nothing at all, because the live `supabase_realtime` publication contains zero tables, so the app is paying for N dead channels.)
- **Blast radius:** Startup latency and steady-state cost on every screen. It also makes state correctness accidental: `deleteTransaction` reads `transactions.find(...)` from *its instance's* array (F32), and each instance's `lastSyncedAt` diverges from the others', so "when did we last sync" has eleven different answers.
- **Same defect elsewhere:** The same per-component-instance pattern applies to `useProfile` (mounted in `_layout.tsx`, `record.tsx`, `settings.tsx`, and more — each doing its own fetch with its own 5-second retry loop), `useCategories`, `useRecurringRules` and `useBudget`. `DataEvents` (`apps/mobile/src/events/dataEvents.ts`) exists precisely to keep these copies in agreement, which is a coordination mechanism standing in for a store. Grepped: `useTransactions(`, `useProfile(`, `useCategories(`, `useRecurringRules(`, `useBudget(`, `supabase.channel(`.
- **Fix:** Promote the transaction list to a single app-level store — a context provider mounted once in `_layout.tsx` that owns the SQLite cache, one `pullRemote`, one realtime channel and one persisted sync cursor, with `useTransactions()` becoming a thin selector over it. That also gives F44's high-water mark somewhere to live and removes the need for `DataEvents` fan-out entirely. Do not fix this by memoising the hook or deduping channels by name — those are patches around the absence of a store, and the store is what the offline-first architecture needs anyway.
- **Regression test to add:** Mount three screens that consume transactions and assert exactly one `pullRemote` call and one realtime channel subscription.

## Refuted during verification

- **F38 (Branding drift).** Not a finding. `docs/PLAN.md:3441` records "Coin & Wave" as the adopted **logo mark** on 2026-08-07, replacing "The Listening Drop" mark; no product rename ever occurred. `packages/shared/src/brand.ts:11` correctly holds `PRODUCT_NAME = 'Murmur'`, and the iOS `PRODUCT_NAME` build setting and `app.config.js:3` agree. The only residue is two stale *code comments* at `apps/mobile/app/(auth)/sign-in.tsx:125` and `:282` still naming the old mark — a trivial cleanup, not an inconsistency, and not worth a finding of its own.
- **F41's open-redirect claim** (the finding itself is retained at Low, retitled as unreachable dead code). `${origin}${next}` cannot produce an off-origin URL: `origin` comes from the request and `next` is appended as a path, so `?next=//evil.com` yields `https://app.example.com//evil.com`. No redirect vulnerability exists.
- **F21's `NODE_ENV` claim** (the finding itself is retained at Medium, rescoped). The `process.env.NODE_ENV !== 'production'` hatch at `plus.server.ts:30` cannot fire in either shipping path: Vercel builds with `NODE_ENV=production`, and `apps/desktop/src/main.ts:136-138` spreads the user's `.env` *before* hard-setting `NODE_ENV: 'production'`, so a file cannot override it. Only the `MURMUR_DEV_PLUS` hatch at `:29` is reachable.
- **F6's CHECK-constraint claim.** The earlier draft implied the web's fabricated "Recurring" source interacts with the `transactions.source` CHECK constraint. It does not — `classifySource` is a pure display function, nothing is written to the database, and the live CHECK (`voice|manual|scan|shortcut|notification_listener|recurring_generated`) is never exercised by this code path. The display inconsistency is real and is retained; the constraint angle is deleted.

---

**Verified:** every finding above was independently re-checked against the code on 2026-08-08.
