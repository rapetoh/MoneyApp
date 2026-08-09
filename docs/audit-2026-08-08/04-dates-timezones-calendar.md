# Dates, timezones and the calendar
**Audit date:** 2026-08-08 - **Scope:** every date/time computation in the monorepo — storage, month windows, calendar grids, week starts, recurring next-charge math, DST, export stamps, AI date windows - **Files examined:** 68

## Verdict

Not production-ready. This app stores every money event as a `timestamptz` instant and then, in 40+ places, asks *whichever JavaScript engine happens to be running* what calendar day that instant falls on — and there are four different engines with four different answers: the Vercel Node runtime (UTC), the packaged Electron Next server (user's TZ), the browser (user's TZ), and the Expo device (user's TZ). Postgres has a fifth opinion baked into migration 008 and 011 (`AT TIME ZONE 'UTC'`). The single worst problem is F1: the Overview page builds `monthStart` on the server and hands the `Date` object across the RSC boundary into the `'use client'` Calendar lens, which then reads `.getMonth()`, `.getDay()` and `.getDate()` off it in the browser's timezone — one defect that produces all three of the user's reported bugs exactly (Jul 8 / Wednesday, "1" under FRI, "No spending logged this month yet"), verified by reproduction. The systemic cause is that `profiles.timezone` — the one column that could have settled "what is a day for this user" — is declared in the schema (`001_initial_schema.sql:18`), declared in the type (`packages/shared/src/types/profile.ts:10`), and then **never written and never read by a single line of application code**; with no canonical answer, each of the 9 hand-rolled month-window implementations picked its own. Secondary but equally serious: the recurring engine has three independent copies of the same next-occurrence function, all using `setMonth()` without day-of-month clamping, running in two different timezones, which both drops February for a rule anchored on the 31st and can produce two charges for one bill (F2, F3).

Note on branding: the prompt's premise is not a real discrepancy. `docs/PLAN.md:3441` records "Coin & Wave" as the adopted **logo mark** (direction 04, replacing "The Listening Drop" mark), not a product rename. `packages/shared/src/brand.ts:11` still reads `PRODUCT_NAME = 'Murmur'` and `docs/PLAN.md:800` still records "App name — Murmur". Code and docs agree.

## Findings summary

| # | Severity | Finding | Primary file |
|---|----------|---------|--------------|
| F1 | Critical | `monthStart` Date crosses the RSC boundary; Calendar lens reads its calendar fields in the browser TZ → wrong month, wrong weekday alignment, zero buckets | `apps/web/src/components/lenses/Calendar.tsx:18-34` |
| F2 | Critical | Recurring next-occurrence computed by two writers in two timezones → different UTC dates → duplicate charge past the dedup index | `supabase/functions/generate-recurring/index.ts:40-58` |
| F3 | Critical | `setMonth(+n)` with no day-of-month clamp: a rule on the 31st skips February and drifts to the 3rd forever | `apps/mobile/src/hooks/useRecurringRules.ts:53` |
| F4 | High | `profiles.timezone` is never populated and never read — the app has no notion of the user's day | `supabase/migrations/001_initial_schema.sql:18` |
| F5 | High | Overview month window is a UTC window; Transactions month window is a local window → same month, different transactions, different totals | `apps/web/src/app/dashboard/page.tsx:55-56` |
| F6 | High | "Current month" computed server-side (UTC) and client-side (local) → the picker's dropdown and the server disagree, and selecting the current month is a no-op that bounces the user back to next month | `apps/web/src/lib/monthIso.ts:6-9` |
| F7 | High | Mobile discards the parsed/observed `transacted_at`; every transaction is stamped at save time | `apps/mobile/src/hooks/useTransactions.ts:106` |
| F8 | High | CSV/JSON/PDF exports emit the **UTC** date; evening US transactions export under tomorrow's date | `apps/web/src/app/dashboard/export/page.tsx:72` |
| F9 | High | Mobile `usePeriodSpend` silently treats quarterly/yearly budgets as monthly; web does not → two different "spent" figures for one budget | `apps/mobile/src/hooks/useBudget.ts:98-101` |
| F10 | High | Week starts Monday in three places and Sunday in three others, for the same budget period and the same grid concept | `apps/mobile/src/hooks/useRecurringRules.ts:14-17` |
| F11 | Medium | `getPeriodBounds('weekly')` produces a 5-week window whenever the week crosses a month boundary (only reachable with a weekly budget **and** active recurring rules) | `apps/mobile/src/hooks/useRecurringRules.ts:13-17` |
| F12 | High | Budget spend windows have a start but no end — future-dated transactions count against the current period | `apps/web/src/app/dashboard/budgets/page.tsx:221` |
| F13 | High | Ask Murmur's `today` is a UTC date-only string, produced by `.toISOString()` on a local now and re-parsed with `new Date()` | `packages/ai/src/askMurmurTools.ts:66-70` |
| F14 | High | Insights forecast linearly extrapolates from a UTC day-of-month with no minimum-history guard ($1,519 from 8 days) | `apps/web/src/app/dashboard/insights/page.tsx:221-224` |
| F15 | Medium | Insights weekday × hour heatmap buckets by **UTC** weekday and **UTC** hour | `apps/web/src/app/dashboard/insights/page.tsx:328-329` |
| F16 | Medium | "Heaviest day" average divides by a hardcoded `12` regardless of how much history exists | `apps/web/src/app/dashboard/insights/page.tsx:274` |
| F17 | Medium | `packages/shared/src/utils/date.ts` is exported and imported by nothing; 9 divergent reimplementations exist instead | `packages/shared/src/utils/date.ts:1-30` |
| F18 | Medium | Day-after-spring-forward: yesterday's spend is attributed to today in the Today tab's weekly bars | `apps/mobile/app/(tabs)/index.tsx:53` |
| F19 | Medium | **Mobile** accepting a detected pattern discards the observed anchor day (web correctly keeps it) — the rule fires on the acceptance day forever | `apps/mobile/src/hooks/useRecurringRules.ts:125-126` |
| F20 | Medium | Server-side recurring generation drifts the wall-clock hour across DST; client-side does not | `supabase/functions/generate-recurring/index.ts:48-50` |
| F21 | Medium | The recurring de-dup invariant is "one per **UTC** day", not one per the user's day | `supabase/migrations/008_recurring_dedup_constraint.sql:57-64` |
| F22 | Medium | `pullRemote` stores PostgREST's `+00:00` timestamps verbatim; four call sites string-compare them against `toISOString()` output | `apps/mobile/src/services/sync/SyncManager.ts:173-175` |
| F23 | Medium | `transactions.synced_at` is written only to local SQLite, never to Supabase | `apps/mobile/src/services/sync/SyncManager.ts:105-126` |
| F24 | Medium | FX rate is dated to the transaction's **UTC** day, so evening purchases get the next day's rate | `packages/shared/src/utils/fx.ts:79` |
| F25 | Medium | Calendar lens keeps `sel` state across a month change; day 31 → renders a date in the following month | `apps/web/src/components/lenses/Calendar.tsx:53` |
| F26 | Medium | Client lenses call `new Date()` during SSR and again on hydration in a different TZ | `apps/web/src/components/lenses/Calendar.tsx:39-43` |
| F27 | Medium | Cashflow/Matrix compute the month in the server TZ while Calendar/MindMap compute it in the browser TZ — same page, different months | `apps/web/src/components/lenses/Cashflow.tsx:26-46` |
| F28 | Medium | `budgets.starts_at` (a `date` defaulted from UTC `CURRENT_DATE`) is written by Postgres and never read | `supabase/migrations/001_initial_schema.sql:175` |
| F29 | Low | `monthKey()` builds `YYYY-MM` from `getMonth()` with no `+1` — an off-by-one ISO month string | `apps/mobile/app/(tabs)/insights.tsx:18` |
| F30 | Low | Web `endOfMonth` stops at `23:59:59.000`, dropping the last 999 ms of the month | `apps/web/src/app/dashboard/insights/page.tsx:29-31` |
| F31 | Low | Export filename stamp is the local date on mobile and the UTC date on web | `apps/web/src/app/dashboard/settings/page.tsx:209` |
| F32 | Low | `formatRelativeDate` computes Today/Yesterday from elapsed milliseconds, not calendar days | `packages/shared/src/utils/date.ts:13-23` |
| F33 | Low | MindMap's year label is read off the shifted `monthStart` — wrong every January | `apps/web/src/components/lenses/MindMap.tsx:499` |
| F34 | Medium | The "N days to go" countdown beside the budget figure is always days-left-in-**month**, whatever the budget's period; the label is hardcoded "left this month" | `apps/mobile/app/(tabs)/index.tsx:61-64, 250-253` |

## Findings

### F1. The Overview builds `monthStart` on the server and the Calendar lens reads its calendar fields in the browser

- **Severity:** Critical
- **Status:** User-reported (all three reported calendar bugs are this one defect)
- **Where:**
  - `apps/web/src/app/dashboard/page.tsx:54-58` (construction, server component); `:80-82` (placed on `lensProps`); `:123` (passed to `<CalendarLens>`)
  - `apps/web/src/components/lenses/types.ts:40-43` (`monthStart` / `monthEnd` typed as `Date` on the props interface that crosses the boundary)
  - `apps/web/src/components/lenses/Calendar.tsx:1` (`'use client'`), `:18-22` (`getFullYear`/`getMonth`/`getDay`), `:29-30` (`getMonth`/`getFullYear`/`getDate` bucketing), `:70` (`new Date(year, monthIdx, sel)`)
- **What the user sees:**
  1. August 2026 selected; clicking day 8 opens a panel reading **"WEDNESDAY · JUL 8"**.
  2. The grid places **"1" under the FRI column** although Aug 1 2026 is a Saturday.
  3. The card reads **"No spending logged this month yet."** while two August transactions are plainly visible on the Transactions page.
- **Root cause:** `apps/web/src/app/dashboard/page.tsx` is a Server Component (`export default async function OverviewPage`, uses `createClient()` from `lib/supabase/server`). It builds the anchor with the **local-time** `Date` constructor:

```ts
// apps/web/src/app/dashboard/page.tsx:54-57
const { year: anchorY, month: anchorM } = parseMonthIso(sp.month)
const monthStart = new Date(anchorY, anchorM, 1, 0, 0, 0, 0)
const monthEnd = new Date(anchorY, anchorM + 1, 0, 23, 59, 59, 999)
const monthLabel = monthStart.toLocaleDateString(locale, { month: 'long' })
```

On Vercel the Node runtime's TZ is UTC, so this instant is `2026-08-01T00:00:00.000Z`, and `monthLabel` renders "August". `monthStart` is then placed on `lensProps` (`page.tsx:80`) and passed to `<CalendarLens>` (`page.tsx:123`). `Calendar.tsx:1` is `'use client'`, so the whole `LensProps` object is serialized over the React Flight wire; `Date` survives that trip as the *same instant*, re-materialised in the browser. In US Central (CDT, UTC−5) that instant is **Friday 31 July 2026, 19:00**. The lens then asks it calendar questions:

```ts
// apps/web/src/components/lenses/Calendar.tsx:18-34
const year = props.monthStart.getFullYear()
const monthIdx = props.monthStart.getMonth()
const daysInMonth = new Date(year, monthIdx + 1, 0).getDate()
// Mon-first offset: Sun=0..Sat=6 -> Mon=0..Sun=6
const firstDow = (props.monthStart.getDay() + 6) % 7
...
for (const t of debits) {
  const d = new Date(t.transacted_at)
  if (d.getMonth() !== monthIdx || d.getFullYear() !== year) continue   // <- drops every August row
  const day = d.getDate()
  dayTotal[day] += aggAmount(t)
  ...
}
```

Reproduced exactly under `TZ=America/Chicago`:

```
monthStart local  : Fri Jul 31 2026 19:00:00 GMT-0500
year 2026  monthIdx 6 (= July)
firstDow (Mon=0): 4  -> column Fri          <-- reported bug (2)
selDate for sel=8: Wednesday Jul 8          <-- reported bug (1)
tx(2026-08-08T14:39:14+00:00).getMonth() = 7, matches monthIdx? false   <-- reported bug (3)
```

- Bug (1): `selDate = new Date(year, monthIdx, sel)` = `new Date(2026, 6, 8)` = Wed 8 Jul 2026 — a *real* date one month back, which is why it looked like a plausible month index bug.
- Bug (2): the grid header is Mon-first and the offset formula `(getDay()+6)%7` is *correct for a Mon-first grid*. It is fed a Friday (Jul 31) instead of a Saturday (Aug 1). The week-start convention is not the bug; the input Date is.
- Bug (3): every August transaction fails the `getMonth() !== monthIdx` guard, so `dayTotal` stays all-zero, `heaviestVal` stays `-1`, and line 110 renders "No spending logged this month yet." The rows *do* pass the earlier `monthDebits()` filter (`types.ts:62-71`), which compares absolute instants against `monthStart`/`monthEnd` and is therefore timezone-independent — so inside `CalendarLens` the local `debits` array is non-empty while every bucket it feeds is zero, and the page's own KPI line (`page.tsx:86-95`, same instant comparison) reports "2 transactions" three inches above a grid that reports none.

Two further consequences of the same shift that have not been reported yet but are live: `daysInMonth` is computed from the shifted index, so **February renders 31 cells** (with February selected, `monthIdx` is 0 and `new Date(2026, 1, 0).getDate()` returns 31 — the length of January), and on 1 January `monthStart.getFullYear()` returns the *previous* year.

- **Blast radius:** Every reader of `lensProps.monthStart` in a client component. `MindMapLens` (`MindMap.tsx:1` is `'use client'`) reads `props.monthStart.getFullYear()` at line 499 for its footer year — wrong every January (F33). The server-rendered lenses (Cashflow, Matrix, Flow, Treemap have no `'use client'`) read the same `Date` in the *server's* TZ and therefore show a **different month than Calendar on the same screen** (F27). On the packaged Electron build the embedded Next server runs on the user's machine (`apps/desktop/src/main.ts:134-144` forks the standalone server with no TZ override), so server TZ == browser TZ and the symptom vanishes — meaning this bug is *invisible in desktop QA and only reproduces on the Vercel deployment*.
- **Same defect elsewhere** (a `Date` built in one timezone context and interrogated with local calendar getters in another):
  - `apps/web/src/components/lenses/Calendar.tsx:18,19,22,29,30,70` — this finding.
  - `apps/web/src/components/lenses/MindMap.tsx:499` — `props.monthStart.getFullYear()` in a client component (F33).
  - `apps/web/src/components/lenses/Cashflow.tsx:26,27,40,46` — same props, read on the server (F27).
  - `apps/web/src/components/lenses/Matrix.tsx:28-30` (inside `buildMonths`, called with `props.monthStart` at `:36`) — `getFullYear()/getMonth()` on the server (F27).
  - `apps/web/src/app/dashboard/page.tsx:57,108` — `monthLabel` and the heading year read on the server while the grid reads them on the client.
  - Grepped: `new Date(`, `getMonth`, `getDay(`, `getDate(`, `getFullYear`, `toLocaleDateString` across `apps/`, `packages/`, `supabase/`. `Calendar.tsx` and `MindMap.tsx` are the only two `'use client'` components that receive a server-constructed `Date`; every other cross-boundary date value in the repo travels as an ISO string.
- **Fix:** Architectural, not a patch. Stop passing `Date` objects across the server/client boundary and stop deriving calendar fields from instants at all. Change `LensProps` (`apps/web/src/components/lenses/types.ts:34-46`) to carry `monthIso: string` (`"YYYY-MM"`) plus a precomputed, timezone-resolved `days: Array<{ dayOfMonth: number; isoDate: string; weekdayIndex: number; total: number; txns: LensTxn[] }>`. Do the bucketing once, in `apps/web/src/app/dashboard/page.tsx`, using the user's IANA zone (F4) via `Intl.DateTimeFormat(undefined, { timeZone: profile.timezone }).formatToParts(instant)` — never `getMonth()` on a raw instant. Delete `monthStart`/`monthEnd` as `Date` props; if a lens needs bounds, give it the two ISO instants that delimit the user's month. `monthDebits`/`monthCredits` (`types.ts:62-82`) then filter on those instant strings, which is already timezone-safe.
- **Regression test to add:** Render `CalendarLens` with `TZ=UTC` for the server-built props and `TZ=America/Chicago` for the assertion environment, month `2026-08`, one transaction at `2026-08-08T14:39:14Z`; assert the "1" cell sits at grid index 5 (Sat column), that clicking day 8 yields weekday "Saturday", and that `dayTotal[8] === 42`.

---

### F2. Two writers compute the same recurring occurrence in two timezones and both insert

- **Severity:** Critical (latent — see the production note below)
- **Status:** Newly discovered
- **Where:**
  - `supabase/functions/generate-recurring/index.ts:40-58` (`computeNext`, runs under Deno, TZ=UTC)
  - `apps/mobile/src/hooks/useRecurringRules.ts:42-60` (`computeNextOccurrence`, runs on the device, TZ=user's)
  - `apps/mobile/src/services/recurringCatchUp.ts:49,69,133` (the client caller)
  - `supabase/migrations/008_recurring_dedup_constraint.sql:57-64` (the index that is supposed to stop this)
  - `apps/mobile/src/services/sync/localDb.ts:181-184` (the mirrored local index)
- **What the user sees:** Two identical rows for one monthly bill (or paycheck) a few days apart, in the same month, on both mobile and web. Budgets, Insights, and the Safe-to-Spend ring all count both. The user's remaining budget is short by exactly the bill amount.
- **Production note (verification):** `recurring_rules` has **0 rows ever** in the live database, so this has not yet fired against a real user. It is Critical by consequence, not by current incidence — the first user who sets up a bill in the evening trips it.
- **Root cause:** Both copies of the function do calendar arithmetic on an instant using **local** mutators:

```ts
// supabase/functions/generate-recurring/index.ts:45-53  (identical at useRecurringRules.ts:47-56)
const next = new Date(base)
switch (rule.frequency) {
  case 'monthly':   next.setMonth(next.getMonth() + rule.interval); break
  ...
}
```

`setMonth` reads and writes the **local** month and preserves the **local** day-of-month. When the two runtimes disagree about what local day `base` is, they produce different next occurrences. Measured, same rule, `last_generated = 2026-03-01T02:30:00.000Z`:

```
TZ=UTC              base local = Sun Mar 01 2026 02:30  => next = 2026-04-01T02:30:00.000Z  (UTC date 2026-04-01)
TZ=America/Chicago  base local = Sat Feb 28 2026 20:30  => next = 2026-03-29T01:30:00.000Z  (UTC date 2026-03-29)
```

Both lines above were re-run under `node` during verification and reproduce exactly. Migration 008's guard is `UNIQUE (user_id, recurring_rule_id, ((transacted_at AT TIME ZONE 'UTC')::date))`. `2026-04-01 ≠ 2026-03-29`, so the index does not fire, `isRecurringDedupConflict` (`SyncManager.ts:117-120`) never triggers, and both rows persist. The pre-insert guard `hasRecurringOccurrence` (`transactionStore.ts:191-207`) compares `substr(transacted_at, 1, 10)` — also the UTC date — so it misses for the same reason. The comment block at the top of `recurringCatchUp.ts:12-20` explicitly claims "Duplicate prevention has two layers"; both layers key on a value the two writers do not agree on.
- **Blast radius:** Every active recurring rule whose `last_generated` instant falls within the user's UTC offset of local midnight — for US Central that is any rule generated between 19:00 and 23:59 local, i.e. any rule created in the evening, which is when people log bills. Corrupts: mobile Today/Budgets/Insights, web Overview KPI line, web Budgets rings, web Insights forecast, Ask Murmur's transaction payload, and every export.
- **Same defect elsewhere:** Three copies of this arithmetic exist and all three are affected — `supabase/functions/generate-recurring/index.ts:40-58`, `apps/mobile/src/hooks/useRecurringRules.ts:42-60`, `apps/web/src/app/dashboard/recurring/page.tsx:43-72`. The web copy only *displays* a next-due date (`recurring/page.tsx:487`, and `chargesIn30Days` at `:120-140`), so it produces a third, different answer on screen from the one the cron will actually use; the mobile display copies are `apps/mobile/app/recurring.tsx:57-61` and `apps/mobile/app/transaction/[id].tsx:218-221`, which call the mobile `computeNextOccurrence` and so agree with the device but not with the cron. Grepped: `setMonth`, `setDate(`, `setFullYear`, `computeNext`.
- **Fix:** Architectural. Recurrence must be defined by a **calendar rule**, not by mutating an instant. Add `anchor_day smallint`, `anchor_weekday smallint` and `anchor_time time` to `recurring_rules`, plus the user's IANA zone (F4). Compute the next occurrence in one place — a new `packages/shared/src/recurrence.ts` exporting `nextOccurrence(rule, afterInstant, timeZone): string` that builds the target as a *zoned civil date* and converts to an instant exactly once. Delete all three existing copies and import the shared one from mobile, web, and the edge function (the edge function can import it via the existing esm.sh path or a vendored copy generated from the same source — do not re-type it). Then change the migration-008 index key from `(transacted_at AT TIME ZONE 'UTC')::date` to a stored `occurrence_date date` column that the generator writes explicitly, so the uniqueness invariant is on a value the writer controls rather than on a timezone reinterpretation.
- **Regression test to add:** Run `computeNext` for a monthly rule with `last_generated = 2026-03-01T02:30:00Z` under `TZ=UTC` and `TZ=America/Chicago`; assert both return the identical instant.

---

### F3. `setMonth(+n)` with no day clamp: a rule on the 31st skips February and drifts to the 3rd forever

- **Severity:** Critical (latent — `recurring_rules` has 0 rows in production today)
- **Status:** Newly discovered
- **Where:**
  - `apps/mobile/src/hooks/useRecurringRules.ts:53-54`
  - `supabase/functions/generate-recurring/index.ts:51-52`
  - `apps/web/src/app/dashboard/recurring/page.tsx:60-65`
- **What the user sees:** Rent set up on 31 January produces **no February charge at all**, then a charge on 3 March, then 3 April, then 3 May… The monthly bill silently migrates to a day the user never chose, and one month's worth of money is missing from the ledger.
- **Root cause:**

```ts
// apps/mobile/src/hooks/useRecurringRules.ts:53-54
case 'monthly':   next.setMonth(next.getMonth() + rule.interval); break
case 'quarterly': next.setMonth(next.getMonth() + 3 * rule.interval); break
```

`Date.prototype.setMonth` does not clamp the day. Setting the month to February while the day is 31 overflows into March. Measured (re-run during verification under both zones):

```
TZ=UTC
  base = 2026-01-31T14:00:00Z  ->  setMonth(+1)  =>  2026-03-03T14:00:00Z   (February skipped entirely)
                               ->  setMonth(+1)  =>  2026-04-03T14:00:00Z   (drift is now permanent)
TZ=America/Chicago
  base = 2026-01-31T14:00:00Z  ->  setMonth(+1)  =>  2026-03-03T14:00:00Z
                               ->  setMonth(+1)  =>  2026-04-03T13:00:00Z   (drift + the DST hour shift of F20)
```

Because `last_generated` is then overwritten with the drifted value (`generate-recurring/index.ts:193`, `recurringCatchUp.ts:126-130`), the error is cumulative and irreversible — there is no memory of the original anchor day. The same overflow hits `quarterly` (31 Aug → 1 Dec) and, on a leap-year boundary, `yearly` via `setFullYear` (29 Feb 2028 → 1 Mar 2029).
- **Blast radius:** Every rule anchored on the 29th, 30th or 31st — which for bills is the common case (rent, mortgage, month-end salary). Compounds with F2: the drift happens at a different rate on the device and the server, widening the window in which both writers insert.
- **Same defect elsewhere:** All three `setMonth`/`setFullYear` sites listed above. Also `apps/mobile/src/hooks/useRecurringRules.ts:23-24,27-28,32` — `getPeriodBounds` uses the safe two-argument form `setMonth(month, day)`, which does clamp correctly; that is the only correct usage in the repo and shows the fix is already known here. Grepped: `setMonth`, `setFullYear`.
- **Fix:** Part of the F2 rewrite. In the shared `nextOccurrence`, store the anchor day-of-month on the rule and clamp on emit: `day = Math.min(anchorDay, daysInMonth(targetYear, targetMonth))`. Never derive the next anchor from the previous *emitted* date. Add a backfill migration that recovers `anchor_day` from `starts_at` for existing rules.
- **Regression test to add:** `nextOccurrence({frequency:'monthly', anchorDay:31, last:'2026-01-31'})` returns 28 Feb 2026, then 31 Mar 2026, then 30 Apr 2026 — i.e. it clamps and *returns to* the 31st, never drifting.

---

### F4. `profiles.timezone` is declared everywhere and populated nowhere

- **Severity:** High *(downgraded from Critical during verification: this finding has no user-visible symptom of its own — every wrong number it enables is already counted, at its own severity, in F1, F5, F8, F13, F15, F21 and F24. Leaving it Critical double-counts F1. It stays High because it is the single blocker in front of fixing any of them.)*
- **Status:** Newly discovered (confirmed by production evidence: all 6 users have `timezone='UTC'`)
- **Where:**
  - `supabase/migrations/001_initial_schema.sql:18` — `timezone text NOT NULL DEFAULT 'UTC'`
  - `packages/shared/src/types/profile.ts:10` — `timezone: string`
  - Nowhere else. Re-run during verification: `grep -rn "timezone\|timeZone" apps packages supabase --include='*.ts' --include='*.tsx' --include='*.sql'` returns exactly three lines — those two, plus one prose comment at `packages/shared/src/types/ai.ts:74`. No `Intl.DateTimeFormat(...).resolvedOptions()` and no `getCalendars()` call exists anywhere in the repo.
- **What the user sees:** Nothing directly — this is the absence that causes F1, F5, F8, F13, F15, F21 and F24. Every screen that has to answer "which day did this happen on?" answers with whatever timezone the code happens to be executing in.
- **Root cause:** The schema reserved the right column and the type declared it, but no sign-up path, no onboarding step, and no settings screen ever writes it. `apps/mobile/app/(onboarding)/income.tsx:51` writes `onboarding_completed_at` but not `timezone`; `packages/supabase/src/queries/profiles.ts:11` will upsert whatever it is handed and is never handed a timezone; `apps/web/src/app/dashboard/settings/page.tsx` exposes display name, currency, locale and income — no timezone. The `on_auth_user_created` trigger inserts the profile row with the `'UTC'` default. `Intl.DateTimeFormat().resolvedOptions().timeZone` — the one API that would give the right answer on both platforms — appears nowhere in the repo. `expo-localization` is already a dependency (`apps/mobile/src/lib/i18n.ts:2` imports `getLocales`) and exposes `getCalendars()[0].timeZone`; it is not used.
- **Blast radius:** Total. Because there is no authoritative zone, no server-side computation can ever be correct: the Vercel Overview page, the `generate-recurring` cron, and any future scheduled digest all have to guess, and they all guess UTC. It also means the "correct" behaviour of the app depends on where the Next server runs — which differs between the Vercel deployment and the packaged desktop build (`apps/desktop/src/main.ts:134-144`).
- **Same defect elsewhere:** `budgets.starts_at date DEFAULT CURRENT_DATE` (`001_initial_schema.sql:175`) is the same shape of dead date column — written by Postgres in UTC, read by nothing (F28). `transactions.synced_at` is written locally and never on the server (F23).
- **Fix:** Architectural. (1) Capture the IANA zone at sign-in on every platform: `Intl.DateTimeFormat().resolvedOptions().timeZone` on web/desktop and `expo-localization`'s `getCalendars()[0].timeZone` on mobile; write it through `packages/supabase/src/queries/profiles.ts:upsertProfile` on every app launch (zones change when people travel). (2) Add a read-only "Time zone" row to both Settings screens so it is visible and overridable. (3) Make every server-side date computation take the zone as an explicit parameter — no function in `apps/web/src/app/dashboard/**` or `supabase/functions/**` may call the local-time `Date` constructor or a local getter without one.
- **Regression test to add:** Sign in with a client reporting `America/Chicago`, assert `profiles.timezone === 'America/Chicago'`; assert the Overview month window for `?month=2026-08` starts at `2026-08-01T05:00:00Z`.

---

### F5. The Overview's month is a UTC month; the Transactions page's month is a local month

- **Severity:** High
- **Status:** Newly discovered
- **Where:**
  - `apps/web/src/app/dashboard/page.tsx:55-56, 89-95` (server component → UTC bounds)
  - `apps/web/src/app/dashboard/transactions/page.tsx:1` (`'use client'`), `:378-382` (browser-local bounds), `:385-402` (filter)
  - `apps/web/src/components/lenses/types.ts:62-82` (`monthDebits`/`monthCredits` consume the server bounds)
- **What the user sees:** A transaction logged at 7:30 pm on 31 July appears in the Overview's **August** totals but in the Transactions page's **July** list. A transaction logged at 7:30 pm on 31 August is counted in the Transactions page's August but is **missing from the Overview's August** — the two pages give different "out" totals for the same month, and neither matches the mobile app.
- **Root cause:** Identical-looking code in two different execution contexts:

```ts
// apps/web/src/app/dashboard/page.tsx:55-56   — runs on Vercel, TZ=UTC
const monthStart = new Date(anchorY, anchorM, 1, 0, 0, 0, 0)      // 2026-08-01T00:00:00Z
const monthEnd   = new Date(anchorY, anchorM + 1, 0, 23, 59, 59, 999)

// apps/web/src/app/dashboard/transactions/page.tsx:378-382   — runs in the browser, TZ=America/Chicago
const monthStart = useMemo(() => new Date(monthY, monthM, 1, 0, 0, 0, 0), [monthY, monthM])   // 2026-08-01T05:00:00Z
const monthEnd   = useMemo(() => new Date(monthY, monthM + 1, 0, 23, 59, 59, 999), [monthY, monthM])
```

The two windows are offset by exactly the user's UTC offset — 5 hours for the tester. Everything in that 5-hour band at each end of the month is counted by one page and not the other. The KPI line at `page.tsx:89-95` (`if (d < monthStart || d > monthEnd) continue`) is the UTC window; the ground-truth "$92 out · 2 transactions" happens to match only because both August rows are mid-afternoon UTC.
- **Blast radius:** Web Overview KPI line, every lens (all consume `monthDebits`/`monthCredits`), the Transactions page subtitle counts (`transactions/page.tsx:407-430`), and — separately — mobile's own month window at `apps/mobile/app/(tabs)/insights.tsx:179-185` and `apps/mobile/app/more/transactions.tsx:36-38`, which are device-local and therefore agree with the *Transactions* page and disagree with the *Overview*. Three surfaces, two definitions of August.
- **Same defect elsewhere** (month bounds built with the local-time `Date` constructor, each in its own execution context):
  - `apps/web/src/app/dashboard/page.tsx:55-56` (server/UTC)
  - `apps/web/src/app/dashboard/insights/page.tsx:26-31, 200-202, 221` (server/UTC)
  - `apps/web/src/app/dashboard/transactions/page.tsx:378-382` (browser/local)
  - `apps/web/src/app/dashboard/budgets/page.tsx:54-60` (browser/local)
  - `apps/web/src/components/lenses/Matrix.tsx:28-30` (server/UTC)
  - `apps/web/src/components/lenses/Cashflow.tsx:26-28` (server/UTC)
  - `apps/web/src/components/MonthPicker.tsx:77, 82, 90` (browser/local — label + option construction)
  - `apps/mobile/app/(tabs)/insights.tsx:147, 170, 179, 183, 201-202, 212-216, 283-284` (device/local)
  - `apps/mobile/app/more/transactions.tsx:36-37` (device/local)
  - `apps/mobile/src/hooks/useTransactions.ts:201-202` (device/local)
  - `apps/mobile/src/components/HistoryHeatmap.tsx:29, 59, 76, 94, 98, 101-102` (device/local)
  - `apps/mobile/src/hooks/useRecurringRules.ts:8-38` (device/local)
  - `apps/mobile/src/hooks/useBudget.ts:85-101` (device/local)
  - **Added during verification** — `apps/mobile/app/(tabs)/index.tsx:44, 53, 62` (`weeklySpendBars`, `daysLeftInMonth`) and `apps/mobile/app/(tabs)/budgets.tsx:44` (`daysLeftInPeriod`'s end-of-month), both device/local and both missed by the original list.
  - `packages/ai/src/askMurmurTools.ts:78-94` (server/UTC)
  - `packages/ai/src/advisor.ts:26-27` (server/UTC)
  - `packages/shared/src/utils/date.ts:2, 6` (unused — F17)
  Grepped (re-run during verification): `new Date\([^)]*getFullYear\(\)`, `new Date([a-zA-Z0-9_.]*, `, `, 0, 23, 59`. Those two patterns together enumerate **30 call sites across 16 files**; the list above is now complete.
- **Fix:** One function, one definition. Add `packages/shared/src/utils/period.ts` exporting `monthBounds(monthIso: string, timeZone: string): { startUtc: string; endUtc: string }` that resolves the user's civil month to two ISO instants. Every one of the sites above imports it. Delete `packages/shared/src/utils/date.ts`'s `startOfMonth`/`endOfMonth` (already dead — F17) and replace them with this. Filtering then compares ISO instants, which is timezone-agnostic and works identically on server, browser and device.
- **Regression test to add:** With `profiles.timezone = 'America/Chicago'` and a transaction at `2026-09-01T01:00:00Z` (= 31 Aug 20:00 local), assert the Overview, the Transactions page and mobile Insights all place it in **August**.

---

### F6. "Current month" is computed twice — once on the server in UTC, once in the browser in local time

- **Severity:** High
- **Status:** Newly discovered
- **Where:**
  - `apps/web/src/lib/monthIso.ts:6-9` (`currentMonthIso`) and `:16-19` (`parseMonthIso` fallback)
  - `apps/web/src/app/dashboard/page.tsx:54, 58` (both called on the server)
  - `apps/web/src/components/MonthPicker.tsx:1` (`'use client'`), `:60` (`currentMonthIso()` called in the browser), `:87-96` (dropdown options built in the browser)
  - `apps/web/src/app/dashboard/transactions/page.tsx:87` (called in the browser)
- **What the user sees:** On 31 August after 7 pm Central, opening `/dashboard` shows the heading **"September 2026 overview"** with zero transactions. *Correction made during verification:* the picker's **label** does **not** disagree with the heading — `MonthPicker` renders its label from the `selected` prop (`MonthPicker.tsx:81-84`), which the server passes down as its own `currentMonthIso()`, so both read "September 2026". The disagreement is in the **dropdown list and the click handler**, and it is the more damaging half: the option list is built from the browser's `now` (`:87-96`) so its newest entry is "August 2026" and *nothing in the list is highlighted*; and clicking "August 2026" is a no-op — the picker sees `m === currentMonthIso()` (browser says August), strips `?month=` from the URL, and the server re-derives "current month" as September. The prev-month chevron (`:75-79`) routes through the same `pickMonth`, so it fails identically. The user cannot reach their own current month for the last five hours of the month. Only the Overview is affected: the Transactions page passes `clearable`, which skips the strip branch entirely.
- **Root cause:**

```ts
// apps/web/src/lib/monthIso.ts:6-9
export function currentMonthIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
```

The file header says it "Lives outside the client `MonthPicker` component so server components … can import the parser" — so it is *deliberately* called from both contexts, with no zone parameter. `new Date()` on Vercel is UTC; in the browser it is local. The month-strip logic in the picker makes the disagreement actionable rather than merely cosmetic:

```ts
// apps/web/src/components/MonthPicker.tsx:60
if (!clearable && m === currentMonthIso()) params.delete('month')
```

- **Blast radius:** `/dashboard` (heading, lens window, and the lockout) and `/dashboard/transactions` (default month only — no lockout there, because its picker is `clearable`). The dropdown contents are wrong on both: `MonthPicker.tsx:88-96` builds the 24-month list from the browser's `now`, so on the last evening of a month the list is one month shorter than the server's idea of "months up to now".
- **Same defect elsewhere** (a "what month/day is it now" derived from an unqualified `new Date()`):
  - `apps/web/src/lib/monthIso.ts:7, 17`
  - `apps/web/src/components/MonthPicker.tsx:88`
  - `apps/web/src/components/lenses/Calendar.tsx:39-40` (`isCurrentMonth`)
  - `apps/web/src/app/dashboard/insights/page.tsx:196, 221-222, 379`
  - `apps/web/src/app/dashboard/budgets/page.tsx:37, 546`
  - `apps/web/src/app/dashboard/recurring/page.tsx:121, 318, 620`
  - `apps/web/src/app/dashboard/export/page.tsx:38-40`
  - `apps/mobile/app/(tabs)/index.tsx:43, 76, 162-165, 169`
  - `apps/mobile/app/(tabs)/insights.tsx:145, 170, 283-284`
  - `apps/mobile/app/(tabs)/budgets.tsx:33, 44, 71`
  - `apps/mobile/src/components/HistoryHeatmap.tsx:57, 69`
  - `apps/mobile/src/hooks/useBudget.ts:85`, `useRecurringRules.ts:68`, `useTransactions.ts:201`
  - `packages/ai/src/advisor.ts:26`
  Grepped: `new Date()` with no arguments.
- **Fix:** Make `currentMonthIso` take the zone: `currentMonthIso(timeZone: string)`. Resolve the month in the Server Component once and pass the resulting `monthIso` string down to `MonthPicker` as a prop (it already receives `selected`; add `currentIso`). The client must never independently compute "now's month".
- **Regression test to add:** With server `TZ=UTC` and client `TZ=America/Chicago`, freeze time at `2026-09-01T01:00:00Z`, load `/dashboard` and assert the heading reads "August 2026", that "August 2026" is the highlighted dropdown option, and that clicking it leaves the page on August.

---

### F7. Mobile computes `transacted_at` from the utterance/notification and then throws it away

- **Severity:** High
- **Status:** Newly discovered
- **Where:**
  - `apps/mobile/src/hooks/useTransactions.ts:76-79` (the `createTransaction` signature omits `transacted_at`), `:82` and `:106` (`transacted_at: now`)
  - `apps/mobile/app/(tabs)/record.tsx:186-202` (voice/scan/shortcut save), `:283-292` (manual save) — neither passes a date
  - `apps/mobile/src/hooks/useNotificationListener.ts:95` — `transacted_at: new Date(payload.timestamp).toISOString()` is built from the real notification time and discarded. This is the only path where genuine information is lost.
  - `apps/mobile/app/(tabs)/record.tsx:123` — the iOS Shortcut path builds one too, and it is discarded. *Verification note:* that one is `new Date().toISOString()`, i.e. already "now", so nothing is actually lost here today — it becomes lossy only once the Shortcut passes a real timestamp.
  - `packages/ai/src/prompt.ts:24` — the model is explicitly instructed to produce one: *"transacted_at: ISO 8601 datetime. Use today ${ctx.today} if no date mentioned."*
  - `packages/ai/src/parser.ts:85` — the parsed value is defaulted and returned, then dropped by the caller
- **What the user sees:** Saying *"I spent forty dollars at Kroger yesterday"* files the expense under **today**. An Android payment notification that arrives while the phone is offline and is processed on the next launch files under the launch day. There is no date field anywhere in the mobile UI (`apps/mobile/app/transaction/edit.tsx` has no date control) so the user cannot correct it on the device — only on the web, which does have a `datetime-local` input (`apps/web/src/app/dashboard/transactions/page.tsx:47-52, 281`).
- **Root cause:** `createTransaction`'s parameter type is a `Pick<Transaction, …>` that simply does not include `transacted_at`, so the value is unpassable:

```ts
// apps/mobile/src/hooks/useTransactions.ts:76-82,106
async function createTransaction(
  fields: Pick<Transaction, 'amount' | 'direction' | 'currency_code' | 'merchant' | 'note' | 'category_id' | 'payment_method'> &
    Partial<Pick<Transaction, 'source' | 'raw_transcript' | 'ai_confidence' | 'is_recurring' | 'recurring_rule_id' | 'merchant_domain'>>,
) {
  const now = new Date().toISOString()
  ...
  transacted_at: now,
```

The whole date-resolution half of the AI prompt, the notification listener's timestamp plumbing, and the `ParsedExpense.transacted_at` field are dead weight. The FX snapshot is also dated to `now` rather than the real date (`useTransactions.ts:90` passes `now` into `snapshotFx`), so a backdated foreign-currency expense would get today's rate.
- **Blast radius:** Every mobile-originated row — which is the primary input path for this product. It corrupts day-bucketing on the Today tab, the heatmap, Insights trend, Budgets period spend, the recurring pattern detector's gap analysis (a backdated batch entered in one session looks like same-day duplicates rather than a monthly pattern), and every export.
- **Same defect elsewhere:** The web manual form is the only correct implementation (`transactions/page.tsx:281`: `const transactedAt = fDate ? new Date(fDate).toISOString() : new Date().toISOString()`). The `generate-recurring` edge function correctly uses the computed occurrence date (`generate-recurring/index.ts:148`), as does `recurringCatchUp.ts:75`. Grepped: `transacted_at:` across `apps/`.
- **Fix:** Add `transacted_at?: string` to `createTransaction`'s parameter type and default it to `now` only when absent. Pass `voice.parsedExpense?.transacted_at` from `record.tsx:186`, `parsed.transacted_at` from `useNotificationListener.ts`, and the shortcut value from `record.tsx:123`. Pass the same value into `snapshotFx` instead of `now`. Add a date/time control to `apps/mobile/app/transaction/edit.tsx` so the mobile app has parity with the web form. This must land together with F4 so "yesterday" resolves in the user's zone.
- **Regression test to add:** Feed the parser a transcript containing "yesterday", assert the saved row's `transacted_at` is on the previous calendar day in the profile's timezone.

---

### F8. Exports emit UTC dates, so evening transactions land in the wrong month of an accounting document

- **Severity:** High
- **Status:** Newly discovered
- **Where:**
  - `apps/web/src/app/dashboard/export/page.tsx:38-40` (default range), `:70-75` (range filter), `:104` (CSV date column), `:231` (PDF date column)
  - `apps/mobile/src/services/exportData.ts:86-87` (CSV date column — the comment is on 86, the `.split('T')[0]` on 87)
  - `apps/web/src/app/dashboard/settings/page.tsx:209` (JSON filename stamp)
- **What the user sees:** A dinner at 7:30 pm on 31 August exports with the date **2026-09-01**. Exporting "August" (the page's default range) omits it entirely at one end and pulls in a 31 July evening transaction at the other. The user hands this CSV to an accountant.
- **Root cause:** The filter and the emitted column both slice the UTC ISO string:

```ts
// apps/web/src/app/dashboard/export/page.tsx:70-74
const filtered = useMemo(() => {
  return transactions.filter((t) => {
    const d = t.transacted_at.slice(0, 10)     // UTC calendar day
    return d >= dateFrom && d <= dateTo
  })
}, [transactions, dateFrom, dateTo])
```

while the range defaults are built from *local* dates and then converted to UTC:

```ts
// apps/web/src/app/dashboard/export/page.tsx:38-40
const now = new Date()
const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
const defaultTo = now.toISOString().slice(0, 10)
```

`defaultTo` is `.toISOString().slice(0,10)` on a local `now` — after 7 pm Central it is **tomorrow's** date. `defaultFrom` is correct by accident for negative UTC offsets and wrong for positive ones: in Paris (UTC+2), `new Date(2026, 7, 1)` is `2026-07-31T22:00Z`, so the default "this month" range starts on **31 July**. Mobile emits the same UTC day: `exportData.ts:87` — `tx.transacted_at.split('T')[0]`, commented "ISO date trimmed to YYYY-MM-DD; Excel reads this cleanly."
- **Blast radius:** All three web formats (CSV, JSON, PDF) and both mobile formats. The JSON export carries the raw `transacted_at` so it is recoverable; the CSV and PDF are not — they contain only the wrong date.
- **Same defect elsewhere** (`.slice(0,10)` / `.split('T')[0]` on a UTC ISO string treated as a calendar day):
  - `apps/web/src/app/dashboard/export/page.tsx:39, 40, 72, 104, 231`
  - `apps/web/src/app/dashboard/settings/page.tsx:209`
  - `apps/mobile/src/services/exportData.ts:87`
  - `apps/web/src/app/dashboard/ask/page.tsx:235` and `apps/mobile/src/services/askMurmurClient.ts:66` (F13)
  - `apps/web/src/app/api/ai/ask-murmur/route.ts:95`, `apps/web/src/app/api/ai/parse-expense/route.ts:31` (F13)
  - `packages/shared/src/utils/fx.ts:79` (F24)
  - `supabase/functions/generate-recurring/index.ts:149` (F24)
  - `apps/mobile/src/services/sync/transactionStore.ts:197` and `localDb.ts:167,182` (F21)
  - `supabase/migrations/011_fx_snapshot.sql:40` and `008_recurring_dedup_constraint.sql:36,61` (`AT TIME ZONE 'UTC'`)
  The one correct implementation in the repo is `apps/mobile/src/services/exportData.ts:55-64` (`todayStamp`), which builds the local date from components and even documents why: *"Local-time `YYYY-MM-DD` for the filename. Avoids surprising the user with a UTC date that doesn't match their wall clock around midnight."* That function is used only for the filename, not for the data.
- **Fix:** Add `localDay(instantIso: string, timeZone: string): string` to `packages/shared/src/utils/period.ts` (one `Intl.DateTimeFormat` with `en-CA` to get `YYYY-MM-DD` directly) and use it for every emitted date column and every range comparison in both export paths. Build the default range from `monthBounds()` (F5). Promote `exportData.ts:55-64`'s local-date builder into the shared util and delete the local copy.
- **Regression test to add:** With `timeZone='America/Chicago'` and a transaction at `2026-09-01T01:00:00Z`, assert the CSV row's date column reads `2026-08-31` and that it is included in a 2026-08-01..2026-08-31 export.

---

### F9. Mobile silently treats quarterly and yearly budgets as monthly

- **Severity:** High
- **Status:** Newly discovered
- **Where:**
  - `apps/mobile/src/hooks/useBudget.ts:88-101` (`usePeriodSpend`)
  - `apps/web/src/app/dashboard/budgets/page.tsx:37-61` (`periodStart` — handles all five)
  - `supabase/migrations/001_initial_schema.sql:173` + `002_add_biweekly_budget_period.sql` (the period enum allows weekly/biweekly/monthly/quarterly/yearly)
- **What the user sees:** A user with a $6,000 **quarterly** budget sees "spent $1,900 of $6,000" on the web and "spent $640 of $6,000" on mobile, for the same budget, at the same moment. The mobile Safe-to-Spend ring and the "left this period" figure on the Today tab are both computed from the wrong number.
- **Root cause:** The mobile hook's branch list stops at biweekly and the doc comment admits it:

```ts
// apps/mobile/src/hooks/useBudget.ts:69-71, 98-101
/**
 * Returns the amount spent in the current period matching the budget's period.
 * Weekly: current Mon–Sun. Biweekly: last 14 days. Monthly: calendar month.
 */
  } else {
    // monthly (default) and others
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
  }
```

`"and others"` silently swallows `quarterly` and `yearly`. The web equivalent handles them (`budgets/page.tsx:53-59`). A third implementation, `getPeriodBounds` in `useRecurringRules.ts:8-38`, handles all five but with *different* boundaries again (F10, F11).
- **Blast radius:** `apps/mobile/app/(tabs)/index.tsx:130` (Today tab "left this period"), `apps/mobile/app/(tabs)/budgets.tsx`, `apps/mobile/src/components/SafeToSpend.tsx`. Because `computeUpcomingRecurring` (`useRecurringRules.ts:64-79`) uses the *third* implementation, mobile's own "left this period" mixes a monthly spend window with a quarterly upcoming-recurring window inside one subtraction (`index.tsx:178`).
- **Same defect elsewhere:** Three budget-period implementations exist: `apps/mobile/src/hooks/useBudget.ts:85-101`, `apps/web/src/app/dashboard/budgets/page.tsx:37-61`, `apps/mobile/src/hooks/useRecurringRules.ts:8-38`. No two agree. Grepped: `period ===`, `BudgetPeriod`, `'biweekly'`.
- **Fix:** One implementation in `packages/shared/src/utils/period.ts`: `periodBounds(period: BudgetPeriod, atInstant: string, timeZone: string, anchor: string): { startUtc, endUtc }`, returning both ends (F12). Delete all three local copies. The anchor should be `budgets.starts_at` (F28), not "now".
- **Regression test to add:** Table test over all five periods asserting mobile and web return byte-identical bounds for the same budget and instant.

---

### F10. The week starts on Monday in three places and on Sunday in three others

- **Severity:** High
- **Status:** Newly discovered
- **Where:**
  - **Monday-start:** `apps/mobile/src/hooks/useBudget.ts:89-90` (`const diff = (day === 0 ? 6 : day - 1)`), `apps/web/src/app/dashboard/budgets/page.tsx:39-40` (same), `apps/web/src/components/lenses/Calendar.tsx:22,137` (`(getDay()+6)%7`, header `['Mon'…'Sun']`), `apps/web/src/app/dashboard/insights/page.tsx:137,328` (`days = ['M','T','W','T','F','S','S']`, `(getDay()+6)%7`), `apps/mobile/app/(tabs)/index.tsx:36-39` (`mondayIndex`), `apps/mobile/src/components/MiniBars.tsx:25` (`['M','T','W','T','F','S','S']`), and — **added during verification** — `apps/mobile/app/(tabs)/budgets.tsx:34-37` (`daysUntilNextMon = day === 0 ? 1 : 8 - day`, a third hand-rolled Monday-start)
  - **Sunday-start:** `apps/mobile/src/hooks/useRecurringRules.ts:14-16` (`start.setDate(start.getDate() - day)`), `apps/mobile/src/components/HistoryHeatmap.tsx:101` (`new Date(year, month, 1).getDay()`), `packages/shared/src/i18n/locales/en.json:278` (`"history.weekday_labels": "S,M,T,W,T,F,S"` — and `fr`/`es`/`pt` are all Sunday-first too, which is itself wrong for those locales)
- **What the user sees:** On a Sunday, the mobile Budgets ring (Monday-start: the week began 6 days ago) and the mobile Safe-to-Spend upcoming-recurring figure (Sunday-start: the week began today) describe two different weeks. The mobile heatmap grid is Sunday-first; the desktop calendar grid for the same month is Monday-first — the same month renders with a different shape on the two devices. French and Spanish users get a Sunday-first heatmap, which is wrong for both locales.
- **Root cause:** No shared constant. Each author picked a convention. The two conventions collide inside one screen: `apps/mobile/app/(tabs)/index.tsx:130` calls `usePeriodSpend` (Monday-start) and `:175` calls `computeUpcomingRecurring` (Sunday-start), then subtracts one from the other at `:178`.
- **Blast radius:** Weekly budget spend (mobile + web), weekly upcoming-recurring, Safe-to-Spend, MiniBars column alignment, both calendar grids, the Insights weekday heatmap.
- **Same defect elsewhere:** The full list is above — grepped `getDay()`, `weekday`, `Mon`, `'S,M,T'`.
- **Fix:** One exported constant and one helper in `packages/shared/src/utils/period.ts`: `WEEK_START = 1 /* Monday, ISO-8601 */` and `weekStart(instant, timeZone)`. Every site above imports them. Drive the weekday header labels from `Intl.DateTimeFormat(locale, {weekday:'narrow'})` rotated by `WEEK_START` rather than from a hand-written i18n string, which removes the four hardcoded locale strings and fixes fr/es/pt at the same time. If the product wants a Sunday-first US default, make it a profile preference — but it must be *one* value read everywhere.
- **Regression test to add:** For a fixed instant on a Sunday, assert `usePeriodSpend`, `computeUpcomingRecurring`, the Calendar grid offset and the heatmap grid offset all resolve to the same week-start date.

---

### F11. `getPeriodBounds('weekly')` produces a 5-week window when the week crosses a month boundary

- **Severity:** Medium *(downgraded from High during verification: `getPeriodBounds` has exactly one consumer, `computeUpcomingRecurring`, which sums the amounts of rules whose next occurrence falls inside the window. The bug therefore only produces a wrong number when the user has **both** a weekly-period budget **and** at least one active recurring rule, and only during the days when the current week spans a month boundary. Production has 0 recurring rules, so it is currently inert. The arithmetic is unambiguously wrong and must be fixed — but per the rubric, "wrong only in an edge case" is Medium.)*
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/hooks/useRecurringRules.ts:13-17`, consumed by `:64-79` (`computeUpcomingRecurring`) and `apps/mobile/app/(tabs)/index.tsx:174-178`, `apps/mobile/app/(tabs)/budgets.tsx:75-78`
- **What the user sees:** With a weekly budget, in the first days of a month, the Today tab's and Budgets tab's "left this period" figure drops for no reason — it has subtracted five weeks of upcoming recurring charges instead of one.
- **Root cause:** `end` is a separate `Date` still sitting on today's date, and `setDate` is handed the *start's* day-of-month, which belongs to the previous month:

```ts
// apps/mobile/src/hooks/useRecurringRules.ts:9-17
const start = new Date(now)
const end = new Date(now)
...
case 'weekly':
  const day = start.getDay()
  start.setDate(start.getDate() - day)      // roll back to Sunday — may land in the previous month
  end.setDate(start.getDate() + 6)          // start.getDate() is now a day-of-month in the PREVIOUS month
  break
```

Worked example, re-run under `TZ=America/Chicago` during verification: `now = Wed 2 Sep 2026`. `day = 3`; `start.setDate(2 - 3)` → **Sun 30 Aug**. `start.getDate()` is now `30`. `end` is still 2 Sep, so `end.setDate(36)` → **Tue 6 Oct 23:59:59.999**. The window is 30 Aug → 6 Oct — 38 days sold as "this week". The same shape of bug does not occur in the `quarterly`/`yearly`/`monthly` branches because those use the safe two-argument `setMonth(month, day)` form.
- **Blast radius:** `computeUpcomingRecurring` is the only consumer, but it feeds `leftThisPeriod` on the Today tab (`index.tsx:178`) and the Budgets tab's `spent` (`budgets.tsx:80`), which feed the `SafeToSpend` card — the single most prominent number in the app. Gated on a weekly budget plus at least one active rule.
- **Same defect elsewhere:** `apps/mobile/src/hooks/useRecurringRules.ts:19-20` (`biweekly` sets `start` back 13 days but leaves `end` at `now`, so the window is 14 days *ending today* rather than a fortnight — defensible but different from the web's `periodStart('biweekly')` at `budgets/page.tsx:47-52` which also has no end). Grepped: `setDate(`, `.getDate() +`, `.getDate() -`.
- **Fix:** Folded into F9's shared `periodBounds`. Compute the end as `startOfWeek + 7 days - 1ms` from the *start*, never by mutating a second Date that is still anchored on `now`.
- **Regression test to add:** `getPeriodBounds('weekly', new Date(2026, 8, 2))` returns a window of exactly 7 days.

---

### F12. Budget spend windows have a start but no end

- **Severity:** High
- **Status:** Newly discovered
- **Where:**
  - `apps/web/src/app/dashboard/budgets/page.tsx:218-223` (overall) and `:234-242` (per-category)
  - `apps/mobile/src/hooks/useBudget.ts:103-110`
  - `apps/mobile/src/hooks/useRecurringRules.ts:19-20` *does* have the same open end for `biweekly` (see F11)
- **What the user sees:** A user who backdates or forward-dates a transaction on the web (the form allows any `datetime-local` value — `transactions/page.tsx:281`) sees it counted against *this* month's budget even when it is dated next month. Once F7 is fixed and mobile can backdate too, this becomes routine.
- **Root cause:** The filters are one-sided:

```ts
// apps/web/src/app/dashboard/budgets/page.tsx:219-222
    const start = periodStart(overall?.period ?? 'monthly')
    return transactions
      .filter((t) => t.direction === 'debit' && new Date(t.transacted_at) >= start)
      .reduce((s, t) => s + aggAmount(t), 0)
```

```ts
// apps/mobile/src/hooks/useBudget.ts:104-109
.filter((t) => !t.is_deleted && t.direction === 'debit' && new Date(t.transacted_at) >= periodStart)
```

For `weekly` this is worse than for `monthly`: a transaction dated next Tuesday counts against *this* week. For `biweekly` (start = now − 13 days, no end) the window is open-ended into the future.
- **Blast radius:** Both Budgets screens, the mobile Safe-to-Spend ring, the overall ring's over/under status (`budgets/page.tsx:249-259`), and the Insights forecast's budget reference line (`insights/page.tsx:243-244` reads the budget amount but the comparison spend comes from the same one-sided windows).
- **Same defect elsewhere:** `apps/web/src/app/dashboard/insights/page.tsx:252,269,293,326` — the 90-day panels filter only `< ninetyAgo`, with no upper bound, so future-dated rows are included in "last 90 days". `packages/ai/src/advisor.ts:29` — same shape. Grepped: `>= start`, `>= periodStart`, `< ninetyAgo`.
- **Fix:** `periodBounds` (F9) returns both ends; every filter becomes `t >= startUtc && t <= endUtc`. Separately, decide the product rule for future-dated transactions (exclude from "spent", surface as "scheduled") and apply it in one place.
- **Regression test to add:** A budget of $100 with one $50 transaction dated 40 days in the future reports `spent === 0`.

---

### F13. Ask Murmur's `today` is a UTC date-only string, produced from a local now and re-parsed as UTC midnight

- **Severity:** High
- **Status:** Newly discovered
- **Where:**
  - Producers: `apps/web/src/app/dashboard/ask/page.tsx:235`, `apps/mobile/src/services/askMurmurClient.ts:66`, fallback at `apps/web/src/app/api/ai/ask-murmur/route.ts:95`, and `apps/web/src/app/api/ai/parse-expense/route.ts:31`
  - Consumer: `packages/ai/src/askMurmurTools.ts:65-108` (`buildWindows`; the window construction is `:66-94`), used by `:129` (sandbox `buildSandboxContext`, `:128-167`), `:543` + `:554-558` (`has_transactions_this_month` etc.), `:581-582` (`buildSummarySnapshot`, `:580-612`)
  - The prompt that depends on it: `packages/ai/src/prompt.ts:24, 33`
- **What the user sees:** Asking "how much did I spend today?" at 8 pm Central returns **tomorrow's** (empty) total — "You haven't spent anything today." On 1 January on the packaged desktop build, "this month" and "this year" both resolve to the *previous* month and year, so a New Year's Day question reports December's numbers as January's.
- **Root cause:** Two errors stacked. First the producer collapses a local instant to a UTC day:

```ts
// apps/web/src/app/dashboard/ask/page.tsx:235  (identical at askMurmurClient.ts:66)
today: new Date().toISOString().split('T')[0],
```

At 20:00 CDT on 7 August this yields `"2026-08-08"`. Then the consumer re-inflates that date-only string with the bare `Date` constructor — which, per spec, parses `YYYY-MM-DD` as **UTC midnight** — and immediately reads it back with **local** getters:

```ts
// packages/ai/src/askMurmurTools.ts:65-70
function buildWindows(todayStr: string): Record<string, DateWindow> {
  const parsed = new Date(todayStr)
  const today = Number.isNaN(parsed.getTime()) ? new Date() : parsed
  const y = today.getFullYear()
  const m = today.getMonth()
  const d = today.getDate()
```

On Vercel (TZ=UTC) the *second* error cancels out — but the first does not, so at 20:00 CDT on 7 August the "today" window is `2026-08-08T00:00Z .. 2026-08-08T23:59Z` while the user's actual day is `2026-08-07T05:00Z .. 2026-08-08T04:59Z`. Everything the user spent that morning and afternoon falls outside it. On the packaged desktop build the Next server runs in the user's timezone (`apps/desktop/src/main.ts:134-144` forks the standalone server with no `TZ` in its `env`), so both errors are live: `new Date('2026-01-01').getMonth()` is `11` and `.getFullYear()` is the previous year. The file's own header comment (`askMurmurTools.ts:55-61`) says the whole point of `buildWindows` was to remove date math from the model because "the model used to write `new Date(today).getMonth()` while `today` was a string" — the exact bug was moved from the model into the helper rather than eliminated.
- **Blast radius:** Every Ask Murmur answer that mentions a period; `has_transactions_this_month` / `has_transactions_this_year` in the data-shape tool (`askMurmurTools.ts:554-558`), which the model uses to decide whether to say "no data"; `buildSummarySnapshot`'s 6-month window (`:582`); and the expense parser's relative-date resolution (`prompt.ts:24`), which is currently moot only because F7 discards the result.
- **Same defect elsewhere** (`new Date()` on a date-only string):
  - `packages/ai/src/askMurmurTools.ts:66` — this finding.
  - `packages/ai/src/askMurmurTools.ts:73` (`new Date(date)` inside `startOfDay`) is fed real Date objects, so it is safe; `:117` and `:530` parse full timestamps, also safe.
  - `apps/web/src/app/dashboard/export/page.tsx:70-75` compares date-only *strings* rather than parsing them — different anti-pattern, same UTC-day assumption (F8).
  - `apps/mobile/app/more/transactions.tsx:26-39` (`parseMonthParam`) parses a `YYYY-M` route param into **local** bounds via `new Date(y, m, 1)`, not via `new Date('YYYY-MM')` — that is the correct shape for a device-local screen and is not this defect.
  - No other `new Date('YYYY-MM-DD')` call sites exist. Grepped: `new Date(` followed by a bare string variable, `split('T')[0]`, `slice(0, 10)`.
- **Fix:** Change the wire contract from `today: string` to `now_utc: string` (a full ISO instant) plus `time_zone: string` (from F4). `buildWindows` then resolves civil dates in that zone via `Intl.DateTimeFormat.formatToParts` and converts to instants — no `new Date(dateOnlyString)` anywhere. Update `packages/shared/src/types/ai.ts:74`'s comment, both clients, and the two API routes' fallbacks.
- **Regression test to add:** `buildWindows` with `now_utc='2026-01-01T02:00:00Z'`, `time_zone='America/Chicago'` returns a `thisMonth` window of December 2025 *for the user*, and the same inputs under `TZ=UTC` and `TZ=America/Chicago` process env produce identical output.

---

### F14. The Insights forecast extrapolates linearly from a UTC day-of-month with no minimum-history guard

- **Severity:** High
- **Status:** User-reported (the "$1,519.00 projected for August" figure)
- **Where:** `apps/web/src/app/dashboard/insights/page.tsx:221-225, 236-241, 377-380`
- **What the user sees:** "MONTHLY TOTAL · FORECAST — $1,519.00 projected for August", derived from an 8-day-old account with three transactions totalling $392. The number is presented in 34px display type as the headline of the page.
- **Root cause:**

```ts
// apps/web/src/app/dashboard/insights/page.tsx:221-224
const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
const dayOfMonth = now.getDate()
const currentTotal = monthlyTotals[monthlyTotals.length - 1].total
const projectedCurrent = dayOfMonth > 0 ? (currentTotal / dayOfMonth) * dim : currentTotal
```

392 / 8 × 31 = 1519.0 exactly — matching the observed figure. Three date-domain problems: (1) `now.getDate()` is the **UTC** day of month (this is a Server Component), so for a user in UTC+13 on the 1st of their month `dayOfMonth` is the *last* day of the previous month and the projection collapses; conversely for a US user at 20:00 on the 31st, `dayOfMonth` becomes 1 and `dim` becomes the *next* month's length, giving a projection of `currentTotal × 30`. (2) There is no guard on `dayOfMonth` — dividing by 1 on the first of the month multiplies a single coffee by 31. (3) `dim` and `dayOfMonth` are computed from `now` while `currentTotal` comes from `monthlyTotals[5]`, whose bounds come from `startOfMonth/endOfMonth` (`:26-31`) — three independent notions of "the current month" in four lines.

Separately (outside this domain but load-bearing on the same number): the total counts the $300 `Savings & Investing` transfer as spend, which is why the patterns panel says "Savings & Investing is 77% of your spend".
- **Blast radius:** The Insights headline, the `projectedDelta` pill (`:225, 381-394`), and the forecast series drawn for the next three months (`:239-241`), which repeats `avg` — itself computed from `completeMonthlyTotals` that filters out zero months (`:217`), so a new user's "6-month average" is the average of however many non-empty months happen to exist, unlabelled.
- **Same defect elsewhere:** `apps/mobile/app/(tabs)/insights.tsx:291-294` — the same linear extrapolation, `(monthSpent / daysElapsed) * daysInSelectedMonth`, but correctly gated behind `showForecast = isCurrentMonth && usualMonthly > 0 && monthSpent > 0` (`:296`) where `usualMonthly` requires at least one of the prior three months to be non-empty (`:280-290`). Mobile got the guard right; web has none. Grepped: `* dim`, `daysInSelectedMonth`, `projected`.
- **Fix:** Compute `dayOfMonth` and `dim` from the user's zone via `monthBounds()` (F5), require a minimum of 7 elapsed days *and* at least one complete prior month before rendering a forecast at all (port mobile's `showForecast` gate), and label the basis on screen ("projected from 8 days of data"). Exclude `Savings & Investing`-tinted transfers from "spend" — that is a separate finding for the money-semantics audit, but the forecast is where it becomes a headline.
- **Regression test to add:** With a single $50 transaction on the 1st of the month, assert no forecast is rendered; with 10 days and 2 prior complete months, assert the projection uses the user's local day count.

---

### F15. The weekday × hour heatmap buckets by UTC weekday and UTC hour

- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/insights/page.tsx:321-338`, rendered by `:136-172`
- **What the user sees:** "Heatmap · weekday × hour" showing a US Central user's 8 am coffee in the **13:00** column and their Saturday 8 pm dinner in the **Sunday** row. The panel is titled by local wall-clock hours (8, 10, 12, 14, 16, 18, 20) so the mismatch is invisible — it just looks like the user shops at odd hours.
- **Root cause:** Insights is a Server Component (no `'use client'` in `apps/web/src/app/dashboard/insights/page.tsx`), so these run in the Vercel runtime's UTC:

```ts
// apps/web/src/app/dashboard/insights/page.tsx:327-329
const d = new Date(t.transacted_at)
const dayIdx = (d.getDay() + 6) % 7 // Mon=0
const hour = d.getHours()
```

For UTC−5 every transaction shifts five columns right and, for anything logged after 19:00 local, one row down. The hour-bucket loop (`:331-336`) only matches `hour >= b && hour < b+2` for `b ∈ {8,10,…,20}`, so UTC hours 0–7 and 22–23 fall into no bucket at all. *Corrected during verification:* mapped to US Central (UTC−5) that discard band is **17:00–02:59 local**, not 19:00–02:00 — the whole evening. Note this is two stacked problems: even with the timezone fixed, the bucket set covers only 08:00–21:59, so a tenth of the clock is silently dropped in every zone.
- **Blast radius:** The heatmap panel only, but it is one of three cards on the Insights page and it is presented as a behavioural finding about the user.
- **Same defect elsewhere:** `apps/web/src/app/dashboard/insights/page.tsx:270` — `new Date(t.transacted_at).getDay()` for the "heaviest weekday" pattern sentence, same UTC weekday. `apps/mobile/app/(tabs)/index.tsx:37` and `:52-56` use `getDay()`/local midnight on the *device*, which is correct. `apps/mobile/src/components/HistoryHeatmap.tsx:33-35` uses device-local getters, correct. Grepped: `getHours()`, `getDay()`.
- **Fix:** Resolve weekday and hour in the profile's zone (F4) — one `Intl.DateTimeFormat(locale, { timeZone, weekday:'short', hour:'numeric', hourCycle:'h23' }).formatToParts()` per transaction — and widen the bucket set to cover all 24 hours (or explicitly label the panel as covering 08:00–22:00 and count the excluded rows).
- **Regression test to add:** A transaction at `2026-08-09T01:00:00Z` with `timeZone='America/Chicago'` lands in the **Saturday**, 20:00 cell.

---

### F16. "Heaviest day" divides by a hardcoded 12

- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/insights/page.tsx:274-288`
- **What the user sees:** "Saturday is your heaviest day — avg $4." A user with three transactions in an 8-day-old account is told their *weekly average* for a day of the week.
- **Root cause:**

```ts
// apps/web/src/app/dashboard/insights/page.tsx:274
const weekdayAvg = weekdaySums.map((sum, i) => (weekdayCounts[i] > 0 ? sum / 12 : 0))
```

`12` is presumably "weeks in 90 days" (actually 12.857). But the numerator is summed over `t >= ninetyAgo` (`:269`) regardless of whether the account is 90 days old, so for a new account the divisor is ~12× too large and the "average" is meaningless. There is also no minimum-observations guard: a single Saturday transaction produces a "Saturday is your heaviest day" claim.
- **Blast radius:** The Patterns card sentence. The same 90-day window with no lower-bound-on-history check also drives the "N% of your spend in the last 90 days" sentence (`:293-302`) — which produced the observed "Savings & Investing is 77% of your spend" from three transactions.
- **Same defect elsewhere:** `packages/ai/src/advisor.ts:31` — `avgMonthlySpend = recentDebits.reduce(...) / 3`, hardcoded 3-month divisor over a `>= threeMonthsAgo` filter (`:27-30`) with no check that three months of history exist; and `:42` — `avg_monthly: total / 3` per category, the same divisor. (The original cited `advisor.ts:19`, which is a type declaration; corrected during verification.) Grepped: `/ 12`, `/ 3`, `avg`.
- **Fix:** Divide by the actual number of that weekday elapsed inside the window, clamped to the account's age: `weekdayOccurrences = countWeekdaysBetween(max(accountCreatedAt, ninetyAgo), now, i)`. Suppress the sentence entirely below a minimum (e.g. 4 observations of that weekday).
- **Regression test to add:** With 3 transactions across 8 days, assert the Patterns card renders the "not enough data" fallback (`:317-319`) rather than a weekday claim.

---

### F17. The shared date utility module is dead code and there are nine reimplementations

- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `packages/shared/src/utils/date.ts:1-30`, exported at `packages/shared/src/index.ts:12`
- **What the user sees:** Nothing directly — this is the mechanism that let F5, F9, F10 and F11 diverge.
- **Root cause:** The module exports `startOfMonth`, `endOfMonth`, `toISOString`, `formatRelativeDate` and `formatTime`. Re-run during verification: `grep -rn "startOfMonth\|endOfMonth\|formatRelativeDate\|formatTime" apps packages` returns **only** the definitions in `date.ts` plus local redefinitions — **zero** importers from `@voice-expense/shared`. Meanwhile:
  - `startOfMonth`/`endOfMonth` are reimplemented at `apps/web/src/app/dashboard/insights/page.tsx:26-31` (different signature, different end precision — F30), `apps/web/src/app/dashboard/page.tsx:55-56`, `apps/web/src/app/dashboard/transactions/page.tsx:378-381`, `apps/web/src/components/lenses/Matrix.tsx:29-30`, `apps/web/src/components/lenses/Cashflow.tsx:28`, `apps/mobile/app/(tabs)/insights.tsx:178-185`, `apps/mobile/app/more/transactions.tsx:36-37`, `apps/mobile/src/components/HistoryHeatmap.tsx:29,102`, `apps/mobile/src/hooks/useRecurringRules.ts:31-32`, `apps/mobile/src/hooks/useTransactions.ts:202`, `apps/mobile/app/(tabs)/index.tsx:62`.
  - `formatTime` *is* used, but via a local copy: `apps/mobile/src/components/TransactionRow.tsx:23-26` reimplements it verbatim (used at `:100`).
  - `formatRelativeDate` is reimplemented three times with different semantics: `apps/mobile/app/(tabs)/index.tsx:75-99` (`isSameDay` on local calendar fields — correct), `apps/mobile/app/more/transactions.tsx:41-63` (`toDateString()` comparison — also correct), and the unused shared one (elapsed-ms — incorrect, F32).
- **Blast radius:** Structural. Any fix applied to one month-window implementation leaves the other eight wrong, which is precisely the failure mode the owner has said is unacceptable.
- **Same defect elsewhere:** See the list above. Grepped: `startOfMonth`, `endOfMonth`, `formatRelativeDate`, `formatTime`, `utils/date`.
- **Fix:** Delete `packages/shared/src/utils/date.ts` and replace it with `packages/shared/src/utils/period.ts` whose every function takes an explicit `timeZone`. Then mechanically replace all nine reimplementations. Add an ESLint `no-restricted-syntax` rule banning the multi-argument `Date` constructor and the local getters `getMonth`/`getDate`/`getDay`/`getFullYear`/`getHours` outside that module — this is the only durable way to stop the pattern reappearing.
- **Regression test to add:** A lint rule, not a unit test: CI fails if `new Date(<number>, <number>` or `.getMonth()` appears outside `packages/shared/src/utils/period.ts`.

---

### F18. Day after spring-forward: yesterday's spend is attributed to today

- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/(tabs)/index.tsx:42-59` (`weeklySpendBars`), rendered by `:161` into `MiniBars`
- **What the user sees:** On the Monday after the March DST change, the Today tab's 7-bar chart shows Sunday's spending stacked onto Monday's bar, Sunday's bar empty, and the "Spent today" context misleading.
- **Root cause:** The day difference is computed as a millisecond ratio floored to an integer:

```ts
// apps/mobile/app/(tabs)/index.tsx:52-56
const d = new Date(txn.transacted_at)
const diff = Math.floor((startOfToday.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000)
if (diff < 0 || diff > todayDow) continue
const idx = todayDow - diff
```

Both endpoints are *local midnights*, so on a spring-forward boundary they are 23 hours apart, not 24. Measured under `TZ=America/Chicago` and re-run during verification (2026 DST start is Sunday 8 March):

```
Mon 9 Mar vs Sun 8 Mar:  23h  ->  Math.floor(0.958) = 0   (want 1)  <-- misattributed
Mon 2 Nov vs Sun 1 Nov:  25h  ->  Math.floor(1.042) = 1   (correct by luck)
```

`Math.floor` on a 23-hour gap collapses two days into one bucket. Fall-back is saved only because 25/24 still floors to 1.
- **Blast radius:** One day a year, on the app's home screen, in the chart the user checks daily. The same bar array is the only weekly visualisation on mobile.
- **Same defect elsewhere** (day counts from ms division rather than calendar subtraction):
  - `apps/web/src/app/dashboard/recurring/page.tsx:132` — `Math.round((nxt - today) / 86_400_000)`; `Math.round` absorbs the ±1h so this one is safe, but it is the same fragile idiom.
  - `apps/mobile/app/(tabs)/insights.tsx:263` — `Math.round((rangeEnd - monthStart) / 86400000) + 1`; safe for the same reason.
  - `apps/mobile/app/(tabs)/insights.tsx:380` — `new Date(rangeEnd.getTime() - (trend.length - 1) * 86400000)` for the trend's start label; on a DST week this label is off by one day from the first plotted point, because the points themselves are built with `setDate` (`:266-270`, calendar-correct) while the label is built with ms arithmetic.
  - `packages/ai/src/askMurmurTools.ts:90-92, 208` — ms arithmetic, but each result is passed through `startOfDay()` which re-normalises, so these are DST-safe. This is the correct pattern and should be the model for the others.
  - `apps/mobile/src/services/recurringPatternDetector.ts:129-136` and `apps/web/src/lib/recurringPatternDetector.ts:86-93` — gap sizes in fractional days; the `inferFrequency` thresholds (`:77-83` / `:37-43`) are wide enough that a ±1h error cannot change the classification.
  Grepped: `86400000`, `86_400_000`.
- **Fix:** Replace the ms division with a calendar-day difference computed from the two local `YYYY-MM-DD` strings (or use the shared `localDay()` from F8 and diff the resulting dates as UTC-noon values, which is DST-immune). Apply the same to `insights.tsx:380`.
- **Regression test to add:** Under `TZ=America/Chicago`, with `now = 2026-03-09T12:00` and a transaction on `2026-03-08`, assert `weeklySpendBars` places it at index `todayDow - 1`.

---

### F19. Accepting a detected recurring pattern discards the observed anchor day — on mobile only

- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/hooks/useRecurringRules.ts:125-126`, fed by `apps/mobile/app/(tabs)/index.tsx:142-155` (`acceptPattern`) and `apps/mobile/src/services/recurringPatternDetector.ts:139-153` (which *does* compute `lastSeenAt` and the median gap)
- **What the user sees:** Murmur detects that Netflix bills on the 3rd of each month. The user taps Accept **on the phone** on the 20th. From then on Murmur generates the Netflix charge on the **20th** of every month, and the Recurring screen's "next due" is wrong by 17 days forever. Accepting the *same* candidate on the web gives the correct 3rd — so the two platforms produce different rules from identical input, which is the sharper version of this bug.
- **Root cause:** The detector produces a rich candidate including `lastSeenAt: anchor.transacted_at` and an inferred `frequency` from the median gap (`recurringPatternDetector.ts:147-148`). The mobile `createRule` throws the date away:

```ts
// apps/mobile/src/hooks/useRecurringRules.ts:125-126
starts_at: new Date().toISOString(),
last_generated: new Date().toISOString(), // treat creation as first generation
```

`computeNextOccurrence` then derives everything from `last_generated`, so the rule's phase is the acceptance moment.
- **Blast radius:** Every mobile auto-detected rule (a Plus feature, `index.tsx:134-137`), the onboarding income rule (`apps/mobile/app/(onboarding)/income.tsx:81` calls the same `createRule`, so a monthly salary anchors on the onboarding day rather than payday), and `computeUpcomingRecurring`'s Safe-to-Spend deduction.
- **Same defect elsewhere:** **None — and the original entry here was wrong.** *Refuted during verification:* the audit claimed `apps/web/src/app/dashboard/recurring/page.tsx:237` was "the same discard" and that `RecurringPatternCandidate.lastSeenAt` "is computed and never consumed anywhere". Both are false. `recurring/page.tsx:251` writes `last_generated: c.lastSeenAt` — the web accept path already does exactly what this finding asks for. Line 237 only sets `starts_at`, which no occurrence math reads when `last_generated` is present (`recurring/page.tsx:45-48`, `useRecurringRules.ts:43-45`, `generate-recurring/index.ts:41-43` all prefer `last_generated`). Re-grepped `lastSeenAt` across `apps/` and `packages/`: 5 hits — the two type declarations, the two detector assignments, and the one web consumer.
- **Fix:** Pass `candidate.lastSeenAt` through the mobile `createRule` as `last_generated` — i.e. copy what `apps/web/src/app/dashboard/recurring/page.tsx:251` already does — and derive `anchor_day` from it per F3. For manually-created rules, let the user pick the anchor date; default it to the template transaction's `transacted_at` when `template_txn_id` is present.
- **Regression test to add:** Accept a candidate whose `lastSeenAt` is the 3rd of last month; assert the created rule's next occurrence is the 3rd of this month.

---

### F20. Server-side recurring generation drifts the wall-clock hour across DST; the client does not

- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `supabase/functions/generate-recurring/index.ts:48-50` vs `apps/mobile/src/hooks/useRecurringRules.ts:50-52`
- **What the user sees:** A weekly or daily rule set up at 9:00 am silently becomes 8:00 am (or 10:00 am) after each DST transition, and the two generators disagree about the hour, feeding F2.
- **Root cause:** `next.setDate(next.getDate() + 7 * interval)` preserves the **local** wall-clock time of the executing runtime. On the Deno edge function that runtime is UTC, which has no DST — so the *UTC* hour is preserved and the user's local hour shifts by one twice a year. On the device the *device's* local hour is preserved, so no shift. The two therefore produce instants an hour apart across a DST boundary, and combined with F2's day-level divergence this widens the window in which the dedup index misses.
- **Blast radius:** All `daily`/`weekly`/`biweekly` rules, twice a year, for every user not in a DST-free zone. Also affects the "next due" label shown at `apps/mobile/app/recurring.tsx:57-61`, `apps/mobile/app/transaction/[id].tsx:218-221`, and `apps/web/src/app/dashboard/recurring/page.tsx:487` — three surfaces showing an hour the generator will not honour.
- **Same defect elsewhere:** `apps/web/src/app/dashboard/recurring/page.tsx:51-59` (the third copy — `daily` at 52, `weekly` at 55, `biweekly` at 58). Grepped: `setDate(next.getDate()`.
- **Fix:** Part of the F2 rewrite — resolve occurrences as zoned civil datetimes (`anchor_time` in the user's zone) and convert to an instant once. Never advance an instant with a local mutator.
- **Regression test to add:** A weekly rule at 09:00 America/Chicago crossing 8 March 2026 produces occurrences whose local time is 09:00 on both sides of the transition.

---

### F21. The recurring de-dup invariant is "one per UTC day", not "one per the user's day"

- **Severity:** Medium
- **Status:** Newly discovered
- **Where:**
  - `supabase/migrations/008_recurring_dedup_constraint.sql:36` (the cleanup partition) and `:57-64` (the index)
  - `apps/mobile/src/services/sync/localDb.ts:167, 175-184` (the mirrored local index)
  - `apps/mobile/src/services/sync/transactionStore.ts:191-207` (`hasRecurringOccurrence`)
- **What the user sees:** For a user in UTC+X, two occurrences that land on the *same local day* but different UTC days both insert (a duplicate the guard was written to prevent); conversely two legitimately distinct occurrences that share a UTC day are blocked and one is silently soft-deleted by `SyncManager.ts:117-120`.
- **Root cause:** The index key is a timezone reinterpretation of the payload rather than an explicit business key:

```sql
-- supabase/migrations/008_recurring_dedup_constraint.sql:57-64
CREATE UNIQUE INDEX idx_txn_recurring_dedup
ON public.transactions (
  user_id,
  recurring_rule_id,
  ((transacted_at AT TIME ZONE 'UTC')::date)
)
WHERE recurring_rule_id IS NOT NULL
  AND is_deleted = false;
```

The mirrored SQLite index uses `substr(transacted_at, 1, 10)` (`localDb.ts:182`), and `hasRecurringOccurrence` uses `isoDate.slice(0, 10)` (`transactionStore.ts:197`) — all three are the UTC day. The comment at `transactionStore.ts:185-190` calls this "(user, rule, calendar-date)", which is exactly the ambiguity.
- **Blast radius:** Correctness of the duplicate guard for every non-UTC user. Note that the local SQLite index survives F22's mixed-format problem by luck: both `"…T14:39:14+00:00"` and `"…T14:39:14.000Z"` yield the same first 10 characters.
- **Same defect elsewhere:** `supabase/migrations/011_fx_snapshot.sql:40` uses the same `(t.transacted_at AT TIME ZONE 'UTC')::date` for `fx_rate_date` (F24). Grepped: `AT TIME ZONE`, `substr(transacted_at`, `slice(0, 10)`.
- **Fix:** Add an explicit `occurrence_date date` column to `transactions` (or, better, to a new `recurring_occurrences` table), written by the generator from the resolved civil date in the user's zone, and key the unique index on that. The invariant then means what it says and does not depend on any reader's timezone.
- **Regression test to add:** For `timeZone='Asia/Tokyo'`, two occurrences at `2026-03-31T16:00:00Z` and `2026-04-01T16:00:00Z` (local 1 Apr and 2 Apr) both insert; two at `2026-04-01T02:00Z` and `2026-04-01T16:00Z` (both local 1 Apr) do not.

---

### F22. `pullRemote` stores PostgREST timestamps verbatim; four call sites string-compare them against `toISOString()` output

- **Severity:** Medium
- **Status:** Newly discovered
- **Where:**
  - `apps/mobile/src/services/sync/SyncManager.ts:156-176` (`pullRemote`; `:173-175` — `await upsertTransaction(row as Transaction)`)
  - `apps/mobile/src/services/sync/localDb.ts:177-179` (the comment asserting the invariant that is violated)
  - String comparators that depend on it: `apps/mobile/app/(tabs)/insights.tsx:132`, `apps/mobile/app/more/transactions.tsx:102`, `apps/mobile/src/hooks/useTransactions.ts:205`, `apps/mobile/src/services/askMurmurClient.ts:38`
  - Ordering that depends on it: `apps/mobile/src/services/sync/transactionStore.ts:44` (`ORDER BY transacted_at DESC` on a TEXT column), `apps/mobile/src/services/exportData.ts:83, 110, 151` (`localeCompare` sorts), both `recurringPatternDetector` sort calls (`apps/mobile/…:124-126` / `apps/web/…:81-83`)
- **What the user sees:** Rare, hard-to-reproduce ordering flips between two transactions in the same second, and a transaction sitting exactly on a month boundary instant being excluded from that month.
- **Root cause:** The local DB comments guarantee a canonical serialization:

```ts
// apps/mobile/src/services/sync/localDb.ts:177-179
// substr(transacted_at, 1, 10)
// takes the YYYY-MM-DD slice (ISO strings stored as TEXT) — safe
// because all serializations go through Date.toISOString().
```

That is false for pulled rows. `pullRemote` writes the Supabase row unchanged, and PostgREST renders `timestamptz` as `2026-08-08T14:39:14+00:00` — offset form, variable fractional digits — not `2026-08-08T14:39:14.000Z`. Locally-created rows use `toISOString()`. The two formats sort differently at the character level: `'+'` (0x2B) < `'.'` (0x2E), so for the same instant the offset form sorts *before* the `Z` form. Every `>=` / `<` string comparison and the `ORDER BY` on the TEXT column therefore have a boundary case. The real-time subscription path (`useTransactions.ts:63`) also writes the server row verbatim. *Scope check done during verification:* the divergence only bites when the two strings share a byte-identical prefix through the seconds field — i.e. an exact tie on the window boundary or between two rows in the same second. Anything else compares correctly, which is why this is Medium rather than High.
- **Blast radius:** Every mobile screen that filters or sorts by `transacted_at` string. Note that F21's `substr(…, 1, 10)` is unaffected because both formats agree on the first 10 characters, so the de-dup index survives — but nothing else is guaranteed.
- **Same defect elsewhere:** The same raw-row write appears at `apps/mobile/src/hooks/useTransactions.ts:63` (`upsertTransaction(payload.new as Transaction)`). Grepped: `as Transaction)`, `transacted_at >=`, `transacted_at <`, `localeCompare`.
- **Fix:** Normalise on the way in. In `pullRemote` and the realtime handler, map every timestamp column through `new Date(v).toISOString()` before `upsertTransaction`, or — better — store instants as integer epoch-milliseconds in SQLite and keep the ISO string only for the wire. Either way the invariant that `localDb.ts:176-179` asserts must be enforced by code, not by comment.
- **Regression test to add:** Insert a row with `2026-08-01T05:00:00+00:00` and query the August window built from `toISOString()`; assert it is included.

---

### F23. `transactions.synced_at` is written to local SQLite and never to Supabase

- **Severity:** Medium
- **Status:** Newly discovered (matches the production evidence: `synced_at` NULL on 17 of 18 rows)
- **Where:** `apps/mobile/src/services/sync/SyncManager.ts:105-126`; column at `supabase/migrations/001_initial_schema.sql:143`
- **What the user sees:** Nothing today — but the column exists to answer "has this device's copy reached the server?", and any future server-side reconciliation, conflict UI, or "N unsynced" indicator built on it will read NULL for every row.
- **Root cause:** The queue payload is snapshotted at enqueue time with `synced_at: null` (`useTransactions.ts:117`). `drainQueue` strips `raw_transcript`, upserts *that* payload to Supabase, and only afterwards stamps the local copy:

```ts
// apps/mobile/src/services/sync/SyncManager.ts:105-126
const { raw_transcript: _stripped, ...serverPayload } = payload
const { error } = await supabase.from('transactions').upsert(serverPayload, { onConflict: 'id' })
...
// Mark as synced in local DB
await upsertTransaction({ ...payload, synced_at: new Date().toISOString() })
```

`serverPayload.synced_at` is `null` on every write. The web insert path (`transactions/page.tsx:325-339`) and the edge function (`generate-recurring/index.ts:159-182`) do not set it either.
- **Blast radius:** A permanently-NULL timestamp column that three writers pretend to maintain. Also note `pullRemote` will then overwrite the *local* `synced_at` back to NULL on the next pull (`transactionStore.ts:75` includes `synced_at = excluded.synced_at` in the ON CONFLICT set), so even the local value is transient.
- **Same defect elsewhere:** `budgets.starts_at` (F28) and `profiles.timezone` (F4) are the same class — schema columns with no writer. `recurring_rules.template_txn_id` has a writer but `RecurringPatternCandidate.lastSeenAt` does not (F19). Grepped: `synced_at`.
- **Fix:** Decide what the column means. If it means "server acknowledged", it belongs on the server and should be set by a `DEFAULT now()` / trigger on insert, not by the client. If it means "this device confirmed the round-trip", it is local-only state and should not be in the Supabase schema at all. Pick one and remove the other.
- **Regression test to add:** After a successful `drainQueue`, assert the Supabase row's `synced_at` is non-null (or that the column no longer exists server-side).

---

### F24. The FX rate is dated to the transaction's UTC day

- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `packages/shared/src/utils/fx.ts:74-100` (`:79` — `const date = isoDateOrTimestamp.slice(0, 10)`), callers at `apps/mobile/src/hooks/useTransactions.ts:90`, `apps/mobile/src/services/recurringCatchUp.ts:82`, `apps/web/src/app/dashboard/transactions/page.tsx:324`, `supabase/functions/generate-recurring/index.ts:149`, backfill at `supabase/migrations/011_fx_snapshot.sql:40`
- **What the user sees:** A foreign-currency purchase made on a Friday evening in the US is converted at **Saturday's** rate — and since Frankfurter/ECB publish no weekend rates, it silently falls back to the nearest prior business day, which may be a different rate than the one that applied. The converted amount is what every total in the app sums (`aggAmount`), so the discrepancy is money.
- **Root cause:** `.slice(0, 10)` on a UTC ISO instant is the UTC calendar day, not the user's. For UTC−5 every transaction after 19:00 local is dated to the next day. The doc comment at `fx.ts:63-65` says "Always trimmed off any time component the caller passed in", which is accurate but assumes the caller's string is already in the right calendar.
- **Blast radius:** Only multi-currency users, but for them it affects the stored `amount_in_profile_currency` — a persisted value that every aggregation reads and that is not recomputed. `fx_rate_date` is a `date` column (`011_fx_snapshot.sql:30`) so the wrong day is durable.
- **Same defect elsewhere:** `supabase/functions/generate-recurring/index.ts:149` (`transactedAt.slice(0, 10)`), `supabase/migrations/011_fx_snapshot.sql:40` (`(t.transacted_at AT TIME ZONE 'UTC')::date`). `apps/mobile/src/services/fxBackfill.ts` reuses `snapshotFx` so it inherits it. Grepped: `slice(0, 10)`, `fx_rate_date`.
- **Fix:** Pass the profile's timezone into `fetchFxRate` and resolve the rate date with `localDay(instant, timeZone)` (F8). Backfill `fx_rate_date` for existing rows once `profiles.timezone` is populated (F4).
- **Regression test to add:** With `timeZone='America/Chicago'`, `snapshotFx('2026-08-08T01:00:00Z', 'EUR', 'USD', 100)` requests the rate for `2026-08-07`.

---

### F25. The Calendar lens keeps its selected day across a month change

- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/web/src/components/lenses/Calendar.tsx:53` (`const [sel, setSel] = useState(defaultSel)`), consumed at `:70-74`
- **What the user sees:** Select 31 January, then click the month picker's "next" chevron to February. The grid re-renders for February but the detail panel still says day 31 — and `new Date(2026, 1, 31)` rolls over, so the panel header reads **"Tuesday · Mar 3"** while the user is looking at February. The amount shown is `dayTotal[31] ?? 0`, an index past the end of February's array.
- **Root cause:** `useState(defaultSel)` only uses `defaultSel` on first mount. Navigating months is a `router.push` to the same route (`MonthPicker.tsx:63`), so React reconciles `CalendarLens` in the same position with the same type and preserves its state. There is no `key` on the lens (`page.tsx:123`) and no effect resetting `sel` when `monthIdx` changes.
- **Blast radius:** The Calendar lens's detail panel. Independent of F1 — it will still be wrong after F1 is fixed.
- **Same defect elsewhere:** `apps/mobile/src/components/HistoryHeatmap.tsx:58` and `apps/mobile/app/(tabs)/insights.tsx:146` hold month state in `useState` too, but they are the *source* of the month rather than a consumer of a changing prop, so they are safe. Grepped: `useState(default`, `useState<Date>`.
- **Fix:** Derive the selection rather than storing it: `const [selIso, setSelIso] = useState<string | null>(null)` holding a full `YYYY-MM-DD`, and fall back to the computed default whenever `selIso` is not inside the current month. Or, minimally, add `key={monthIso}` to the lens in `page.tsx:123` so a month change remounts it — but the derived-state version is the correct architecture and also fixes the "clicking a padding cell" case.
- **Regression test to add:** Select day 31 in January, switch to February, assert the detail panel shows a February date.

---

### F26. Client lenses call `new Date()` during SSR and again on hydration, in a different timezone

- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/web/src/components/lenses/Calendar.tsx:39-43` and `:161`
- **What the user sees:** A React hydration mismatch (console error in dev, silent re-render in prod) and, around UTC midnight, the "today" outline drawn on the wrong cell — or the default-selected day jumping after hydration.
- **Root cause:** Client Components are still server-rendered for the initial HTML. `Calendar.tsx:39-43` computes `now`, `isCurrentMonth` and `defaultSel` from `new Date()` — UTC on the server, local in the browser — and `defaultSel` seeds `useState` at `:53`, so the server HTML and the client's first render disagree about which cell has the `2px solid` selection border and which has the accent "today" border (`:173-177`).
- **Blast radius:** The Calendar lens. `MindMap.tsx` is the other client lens but does not read `new Date()`.
- **Same defect elsewhere:** No other `'use client'` component in `apps/web/src/components/**` reads `new Date()` during render. `MonthPicker.tsx:88` reads `new Date()` in the render body but is only ever rendered inside the toolbar, where the same mismatch applies to the dropdown option list (a closed dropdown, so invisible). Grepped: `new Date()` in files whose first line is `'use client'`.
- **Fix:** Pass `todayIso` (resolved once on the server in the user's zone, per F4) down through `LensProps` and delete `new Date()` from every client lens.
- **Regression test to add:** Server-render `CalendarLens` with `TZ=UTC` and hydrate with `TZ=America/Chicago` at `2026-08-08T02:00:00Z`; assert no hydration warning and that the "today" cell is 7 August.

---

### F27. Cashflow and Matrix compute the month in the server timezone while Calendar and MindMap compute it in the browser's

- **Severity:** Medium
- **Status:** Newly discovered
- **Where:**
  - Server-rendered (no `'use client'`): `apps/web/src/components/lenses/Cashflow.tsx:26-28, 39-46`, `apps/web/src/components/lenses/Matrix.tsx:28-30, 44-49`, `Flow.tsx`, `Treemap.tsx`
  - Client-rendered: `apps/web/src/components/lenses/Calendar.tsx:1`, `MindMap.tsx:1`
- **What the user sees:** Switching between Overview lenses for the same selected month changes which transactions appear. The Cashflow lens's day columns and the Calendar lens's day cells are offset from each other by one month for the same data (until F1 is fixed) and, after F1, will still be offset by the UTC/local boundary.
- **Root cause:** The lenses are handed the same `Date` props but execute in different runtimes with different `TZ`. Cashflow's per-day bucketing:

```ts
// apps/web/src/components/lenses/Cashflow.tsx:39-42
const dd = new Date(t.transacted_at)
if (dd.getFullYear() === year && dd.getMonth() === monthIdx && dd.getDate() === d) {
  inAmt += aggAmount(t)
}
```

runs in UTC on Vercel, so a transaction at 20:00 local on the 7th is bucketed into day 8. The identical logic in `Calendar.tsx:28-33` runs in the browser and buckets it into day 7 (but against a July index — F1). Matrix's 6-month columns (`Matrix.tsx:28-30`) are UTC months; the Calendar's is a browser month.
- **Blast radius:** All six Overview lenses. The user has no way to know which one to believe.
- **Same defect elsewhere:** See F1's list. Grepped: `props.monthStart`, `'use client'` in `lenses/`.
- **Fix:** F1's fix removes this entirely: once the page precomputes zone-resolved day buckets and passes them as plain data, no lens does date math and the server/client distinction stops mattering.
- **Regression test to add:** With a transaction at `2026-08-08T01:00:00Z` and `timeZone='America/Chicago'`, assert Calendar, Cashflow and Matrix all attribute it to 7 August.

---

### F28. `budgets.starts_at` is written by Postgres in UTC and read by nothing

- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `supabase/migrations/001_initial_schema.sql:175` (`starts_at date NOT NULL DEFAULT CURRENT_DATE`); the only reader is an `ORDER BY` at `apps/mobile/src/hooks/useBudget.ts:19`
- **What the user sees:** A biweekly budget created today does not run from today — it runs from "13 days before whenever you happen to be looking" (`useBudget.ts:95-96`, `budgets/page.tsx:47-51`). The budget's own start date is recorded and ignored.
- **Root cause:** Two problems. (1) `CURRENT_DATE` is evaluated in the database session timezone, which is UTC, so a budget created at 8 pm Central on 7 August is stamped `2026-08-08`. (2) Nothing reads it for period math: all three period implementations anchor on `now` instead (`useBudget.ts:85`, `budgets/page.tsx:37`, `useRecurringRules.ts:8`). The column is used only as a sort key at `useBudget.ts:19`, where a UTC-shifted date can order two same-day budgets wrongly.
- **Blast radius:** Biweekly budgets are meaningless without an anchor — "the last 14 days" is a rolling window, not a period, so the "spent this period" figure never resets. Weekly budgets inherit the week-start disagreement instead (F10).
- **Same defect elsewhere:** `profiles.timezone` (F4), `transactions.synced_at` (F23). Grepped: `starts_at`, `CURRENT_DATE`.
- **Fix:** Make `periodBounds` (F9) take the budget's `starts_at` as the anchor and compute the current period as `startsAt + n × periodLength` where `n = floor((now - startsAt) / periodLength)`. Change the column default to be set explicitly by the client from the user's local date rather than `CURRENT_DATE`, or convert it to `timestamptz` and store the instant.
- **Regression test to add:** A biweekly budget with `starts_at = 2026-08-03` reports period 2026-08-17..2026-08-30 when queried on 2026-08-20, and its "spent" resets on 2026-08-17.

---

### F29. `monthKey()` builds a `YYYY-MM` string from `getMonth()` with no `+1`

- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/(tabs)/insights.tsx:17-19`, used at `:476, 479`
- **What the user sees:** Nothing today — the string is used only for React keys and an equality test between month options, and `${year}-${monthIndex}` is still unique within the 12-month picker window, so the comparison works.
- **Root cause:**

```ts
// apps/mobile/app/(tabs)/insights.tsx:17-19
function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
}
```

For August 2026 this produces `"2026-07"` — a string that *looks* like a valid ISO month and is off by one. It is a landmine: the sibling function `monthParam` in `apps/mobile/src/components/HistoryHeatmap.tsx:10-12` does the same job **correctly** (`getMonth() + 1`) and its output is routed into `/more/transactions?month=` (`HistoryHeatmap.tsx:111-113`), which parses it with `parseMonthParam` (`more/transactions.tsx:26-39`). The moment anyone wires `monthKey`'s output to a route or a query, users load the wrong month with no error.
- **Blast radius:** Latent only. Two functions with the same name-shape and purpose in the same screen tree, one right and one wrong.
- **Same defect elsewhere:** The correct form appears at `apps/web/src/lib/monthIso.ts:8`, `apps/web/src/components/MonthPicker.tsx:78, 91`, `apps/mobile/src/components/HistoryHeatmap.tsx:11`, `apps/mobile/src/services/exportData.ts:61`, `packages/ai/src/askMurmurTools.ts:600`. `insights.tsx:18` is the only site missing the `+1`. Grepped: `getMonth()` adjacent to a template literal, `padStart(2`.
- **Fix:** Delete `monthKey` and import a single `monthIso(date, timeZone)` from the shared period module (F17). Do not fix it in place — the duplication is the defect.
- **Regression test to add:** `monthIso(new Date(2026, 7, 1)) === '2026-08'`.

---

### F30. Web `endOfMonth` stops at `23:59:59.000`, dropping the last 999 ms of the month

- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/insights/page.tsx:29-31`
- **What the user sees:** A transaction whose `transacted_at` falls in the final second of a month is excluded from that month's Insights total but included in Overview's (which uses `…, 23, 59, 59, 999` at `page.tsx:56`).
- **Root cause:**

```ts
// apps/web/src/app/dashboard/insights/page.tsx:29-31
function endOfMonth(year: number, month: number) {
  return new Date(year, month + 1, 0, 23, 59, 59)     // milliseconds default to 0
}
```

used with an inclusive `d <= end` at `:206`. Every other implementation in the repo passes `999`.
- **Blast radius:** One transaction per month at most, and only if it lands in a 999 ms window — but it makes Insights' monthly series differ from Overview's for no visible reason, which is exactly the kind of unexplainable inconsistency that erodes trust in the numbers.
- **Same defect elsewhere:** The `999` form is used at `apps/web/src/app/dashboard/page.tsx:56`, `transactions/page.tsx:380`, `lenses/Matrix.tsx:30`, `packages/shared/src/utils/date.ts:6`, `askMurmurTools.ts:79-88`, `useRecurringRules.ts:36`. Grepped: `23, 59, 59`.
- **Fix:** Eliminated by F5's shared `monthBounds`, which should return a **half-open** interval `[startUtc, endUtcExclusive)` — the only formulation with no precision edge at all. Convert every inclusive `<= end` comparison to `< endExclusive`.
- **Regression test to add:** A transaction at the month's last millisecond is counted by Insights and Overview identically.

---

### F31. The export filename stamp is the local date on mobile and the UTC date on web

- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/services/exportData.ts:55-64` (`todayStamp`, correct) vs `apps/web/src/app/dashboard/settings/page.tsx:188, 209, 213` (UTC)
- **What the user sees:** Exporting from the phone at 8 pm Central produces `murmur-2026-08-07.json`; exporting from the desktop a minute later produces `murmur-2026-08-08.json`. Two files, same data, dates a day apart in the user's downloads folder.
- **Root cause:** Mobile builds the stamp from local components and documents why; web slices the UTC ISO:

```ts
// apps/web/src/app/dashboard/settings/page.tsx:188, 209
const exported_at = new Date().toISOString()
...
const stamp = exported_at.slice(0, 10)
```

- **Blast radius:** Cosmetic, but it is the user-facing artefact of the same UTC-vs-local split as F8.
- **Same defect elsewhere:** `apps/web/src/app/dashboard/export/page.tsx:85` (not `:82` as originally cited) builds `murmur-${dateFrom}-to-${dateTo}` from the range inputs, which are themselves UTC-derived (F8). Grepped: `fileBase`, `download =`, `stamp`.
- **Fix:** Use the shared `localDay(now, timeZone)` (F8) in both places.
- **Regression test to add:** Covered by F8's test.

---

### F32. `formatRelativeDate` computes Today/Yesterday from elapsed milliseconds

- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `packages/shared/src/utils/date.ts:13-23`
- **What the user sees:** Nothing — the function has no callers (F17). But it is exported from the package's public surface (`packages/shared/src/index.ts:12`) and will be wrong the moment someone uses it.
- **Root cause:**

```ts
// packages/shared/src/utils/date.ts:16-21
const diffMs = now.getTime() - date.getTime()
const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
if (diffDays === 0) return 'Today'
if (diffDays === 1) return 'Yesterday'
```

This is "within the last 24 hours", not "today". A transaction at 11 pm yesterday is labelled "Today" until 11 pm today. It is also DST-fragile in the same way as F18.
- **Blast radius:** None currently. The two live implementations are both correct: `apps/mobile/app/(tabs)/index.tsx:27-33, 86-92` compares local `getFullYear/getMonth/getDate`, and `apps/mobile/app/more/transactions.tsx:50-53` compares `toDateString()`.
- **Same defect elsewhere:** None. Grepped: `diffDays`, `'Today'`, `'Yesterday'`, `transactions.today`.
- **Fix:** Delete it as part of F17. If a shared relative formatter is wanted, implement it by comparing zone-resolved `YYYY-MM-DD` strings and localise the words through the i18n catalogue (the two live copies already use `t('transactions.today', locale)`; the shared one hardcodes English).
- **Regression test to add:** `formatRelativeDate` at 00:30 local for a transaction at 23:00 the previous evening returns "Yesterday".

---

### F33. MindMap's year label is read off the shifted `monthStart`

- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `apps/web/src/components/lenses/MindMap.tsx:1` (`'use client'`), `:499`
- **What the user sees:** In January, the MindMap lens's footer reads "January 2025" instead of "January 2026" for a user west of UTC.
- **Root cause:** Same mechanism as F1 — `props.monthStart` arrives in the browser as `2026-01-01T00:00:00Z`, which in US Central is 31 December 2025:

```tsx
// apps/web/src/components/lenses/MindMap.tsx:499
{props.monthLabel} {props.monthStart.getFullYear()}
```

`monthLabel` is computed on the server (correctly "January"), the year on the client (incorrectly 2025). MindMap is otherwise unaffected because its aggregations go through `monthDebits`/`monthCredits`, which compare instants.
- **Blast radius:** One label, one month a year. Listed separately because it survives any fix to `Calendar.tsx` alone — it is a second consumer of the same broken prop.
- **Same defect elsewhere:** `apps/web/src/app/dashboard/page.tsx:108` (`{monthLabel} {monthStart.getFullYear()} overview`) computes both on the server, so it is internally consistent but describes the UTC month (F5). Grepped: `monthStart.getFullYear`.
- **Fix:** Removed by F1's fix — pass `monthIso` and derive the label and year from it.
- **Regression test to add:** Covered by F1's test, extended to January.

---

### F34. The "days to go" countdown beside the budget figure is always days-left-in-**month**, whatever the budget's period

- **Severity:** Medium
- **Status:** Newly discovered during verification
- **Where:**
  - `apps/mobile/app/(tabs)/index.tsx:61-64` (`daysLeftInMonth`), called at `:163`, rendered at `:253` beside `leftThisPeriod` (`:178`, rendered at `:246-251`)
  - `apps/mobile/app/(tabs)/index.tsx:250` — the label is the hardcoded i18n key `home.left_this_month` ("left this month", `packages/shared/src/i18n/locales/en.json:33`)
  - `apps/mobile/app/(tabs)/budgets.tsx:32-46` (`daysLeftInPeriod`), called at `:74`, rendered at `:97` as `{monthLabel} · {daysLeft} days to go` where `monthLabel` (`:70-73`) is unconditionally the **current month's** name
- **What the user sees:** A user with a **weekly** $500 budget opens the Today tab on the 3rd and reads *"$310 left this month · 28 days to go"*. The $310 is the remaining **week** (it comes from `usePeriodSpend`, which is period-aware); the "this month" and the "28 days" are the calendar month. Two different periods in one sentence, on the app's home screen. With a **quarterly** or **yearly** budget the Budgets tab is worse: `daysLeftInPeriod` falls through to the month branch, and the header reads e.g. *"AUGUST · 24 days to go"* against a budget that runs to 31 December.
- **Root cause:** The countdown was never given the budget's period, and on the Budgets tab the period-aware version stops short — its own comment admits it:

```ts
// apps/mobile/app/(tabs)/budgets.tsx:32-46
function daysLeftInPeriod(period: string | undefined): number {
  const now = new Date()
  if (period === 'weekly') { … return daysUntilNextMon }
  if (period === 'biweekly') {
    // Rough: align to the start of the biweekly window we're in.
    return 14 // conservative upper bound; tight enough for a header hint
  }
  // monthly (default) / quarterly / yearly: days-left in the current month.
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return Math.max(1, end.getDate() - now.getDate() + 1)
}
```

The Today tab does not even have that much — `daysLeftInMonth(new Date())` takes no period at all. The `biweekly` branch returns a constant 14, which is not a countdown of anything; and because the biweekly *spend* window is a rolling "last 14 days" with no anchor (F28), there is genuinely no period end to count down to.
- **Blast radius:** The Today tab's budget one-liner and the Budgets tab header — the two places the user checks daily. The money figure itself is correct (it comes from `usePeriodSpend`); it is the period *framing* around it that is wrong, which makes the correct number read as wrong.
- **Same defect elsewhere:** `apps/mobile/src/components/SafeToSpend.tsx:16-34` gets this **right** — `spentKey`/`budgetKey` switch on `period` and select the matching i18n string, so the card above the one-liner says "spent this week" while the line below says "left this month". That is the same screen contradicting itself. Web has no countdown at all, so nothing to compare. Grepped: `days_to_go`, `left_this_month`, `daysLeft`, `daysLeftIn`.
- **Fix:** Folded into F9's shared `periodBounds(period, atInstant, timeZone, anchor)`: the countdown becomes `daysBetween(now, endUtc)` in the user's zone, so it is derived from the same bounds as the spend figure and cannot drift from it. Replace the hardcoded `home.left_this_month` with a period-keyed lookup exactly as `SafeToSpend.spentKey` already does, and delete both `daysLeftInMonth` and `daysLeftInPeriod`.
- **Regression test to add:** With a weekly budget on a Wednesday, assert the Today tab's countdown equals the days remaining in the current Mon–Sun week and the label resolves to the weekly string, not `home.left_this_month`.

---

## The one canonical convention this app must adopt

**Storage.** `transactions.transacted_at` stays `timestamptz` — an absolute instant, always rendered as UTC on the wire. That is already correct and must not change. Add one column: `transactions.local_day date NOT NULL`, the calendar day the event belongs to **in the user's zone at the time of the event**, written once by whichever client creates the row and never recomputed by a reader. Add the same to `recurring_rules` as `anchor_day smallint` + `anchor_time time` + the rule's zone, and to generated occurrences as `occurrence_date date`.

**What "a day" means for a user.** A day is a civil date in `profiles.timezone` (an IANA identifier such as `America/Chicago`), captured from the device on every launch and settable in Settings. A month is `[first instant of the 1st in that zone, first instant of the next month in that zone)` — a **half-open interval of instants**. There is exactly one definition and it lives in one function.

**Where conversion happens.** Exactly two places, and nowhere else:
1. **Write time** — the client that creates a transaction resolves `local_day` from the instant and the user's zone, and stores both.
2. **Read time** — `packages/shared/src/utils/period.ts` converts a civil period (`"2026-08"`, `"weekly"`, `"last 90 days"`) plus a zone into a pair of instants, and converts an instant plus a zone into a civil `YYYY-MM-DD`. Everything downstream compares instants (timezone-agnostic) or groups by the stored `local_day` (already resolved).

**Banned outright**, enforced by an ESLint `no-restricted-syntax` rule: the multi-argument `Date` constructor; `new Date(<date-only string>)`; `.getFullYear()/.getMonth()/.getDate()/.getDay()/.getHours()`; `.setMonth()/.setDate()/.setFullYear()`; `.toISOString().slice(0,10)`; and passing a `Date` object across the RSC boundary. All permitted only inside `packages/shared/src/utils/period.ts`.

**Files that must change to honour this** (every one of them contains date logic that violates the convention today):

*New / rewritten shared code*
- `packages/shared/src/utils/period.ts` **(new)** — `monthBounds`, `periodBounds`, `weekStart`, `localDay`, `monthIso`, `currentMonthIso(tz)`, `WEEK_START`
- `packages/shared/src/recurrence.ts` **(new)** — the single `nextOccurrence(rule, after, tz)`
- `packages/shared/src/utils/date.ts` — **delete** (dead code, F17)
- `packages/shared/src/index.ts` — export surface
- `packages/shared/src/types/profile.ts`, `packages/shared/src/types/transaction.ts`, `packages/shared/src/types/recurring.ts`, `packages/shared/src/types/ai.ts`
- `packages/shared/src/utils/fx.ts`
- `packages/shared/src/i18n/locales/{en,fr,es,pt}.json` — remove `history.weekday_labels`, derive from `Intl`

*Database*
- `supabase/migrations/013_*` **(new)** — `transactions.local_day`, `recurring_rules.anchor_*`, `occurrence_date`, re-keyed dedup index, `budgets.starts_at` semantics, backfills
- `supabase/migrations/008_recurring_dedup_constraint.sql` — superseded index
- `supabase/migrations/011_fx_snapshot.sql` — `fx_rate_date` backfill correction
- `supabase/functions/generate-recurring/index.ts`

*Web*
- `apps/web/src/lib/monthIso.ts`, `apps/web/src/lib/data.ts`
- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/src/app/dashboard/insights/page.tsx`
- `apps/web/src/app/dashboard/budgets/page.tsx`
- `apps/web/src/app/dashboard/transactions/page.tsx`
- `apps/web/src/app/dashboard/recurring/page.tsx`
- `apps/web/src/app/dashboard/export/page.tsx`
- `apps/web/src/app/dashboard/settings/page.tsx`
- `apps/web/src/app/dashboard/ask/page.tsx`
- `apps/web/src/app/api/ai/ask-murmur/route.ts`, `apps/web/src/app/api/ai/parse-expense/route.ts`
- `apps/web/src/components/MonthPicker.tsx`
- `apps/web/src/components/lenses/types.ts`, `Calendar.tsx`, `Cashflow.tsx`, `Matrix.tsx`, `MindMap.tsx`, `Flow.tsx`, `Treemap.tsx`
- `apps/web/src/lib/recurringPatternDetector.ts`

*Mobile*
- `apps/mobile/app/(tabs)/index.tsx`, `insights.tsx`, `budgets.tsx`, `record.tsx`
- `apps/mobile/app/more/transactions.tsx`, `apps/mobile/app/recurring.tsx`
- `apps/mobile/app/transaction/[id].tsx`, `apps/mobile/app/transaction/edit.tsx` (add a date control — F7)
- `apps/mobile/app/(onboarding)/income.tsx`
- `apps/mobile/src/components/HistoryHeatmap.tsx`, `TransactionRow.tsx`, `MiniBars.tsx`, `SafeToSpend.tsx`
- `apps/mobile/src/hooks/useBudget.ts`, `useRecurringRules.ts`, `useTransactions.ts`, `useNotificationListener.ts`, `useProfile.ts` (write the zone)
- `apps/mobile/src/services/recurringCatchUp.ts`, `recurringPatternDetector.ts`, `askMurmurClient.ts`, `exportData.ts`
- `apps/mobile/src/services/sync/SyncManager.ts`, `transactionStore.ts`, `localDb.ts`
- `apps/mobile/src/lib/i18n.ts` (capture `getCalendars()[0].timeZone`)

*AI*
- `packages/ai/src/askMurmurTools.ts`, `prompt.ts`, `parser.ts`, `advisor.ts`, `localParser.ts`

*Tooling*
- `.eslintrc` / `eslint.config.*` — the `no-restricted-syntax` ban listed above

---

## Unverified suspicions

- **F1's exact runtime timezone on Vercel.** I confirmed the mechanism and reproduced the arithmetic under `TZ=America/Chicago`, and the symptoms match the reported ones bit for bit. I did not find an explicit `TZ` setting anywhere in the repo (`next.config.ts`, `eas.json`, `turbo.json`, `package.json` contain none), so I am relying on the Vercel Node runtime defaulting to UTC. If the deployment sets a different zone, the *shift* changes but the class of bug does not.
- **RSC `Date` serialization.** I did not instrument the Flight payload. The reasoning is: `monthStart` is typed `Date` on `LensProps`, `Calendar.tsx` is `'use client'`, and the component calls `Date` methods on it without error in production — so it arrives as a `Date` carrying the same epoch value. If a future Next.js version were to serialize it as a string instead, the lens would throw rather than misrender, which is a different (and louder) failure.
- **Which surface the user was on when they saw the calendar bug.** The evidence names the web Transactions page and the Vercel host, so I assumed the Vercel deployment. On the packaged desktop build the embedded Next server runs in the user's timezone (`apps/desktop/src/main.ts:134-144`), which would mask F1 entirely — I did not launch the desktop build to confirm that it masks it rather than shifting it differently.
- **`weeklySpendBars` and `dailyTotals` sum `txn.amount` rather than `aggAmount(txn)`** (`apps/mobile/app/(tabs)/index.tsx:56`, `apps/mobile/src/components/HistoryHeatmap.tsx:21,35`), mixing currencies in a way the rest of the app carefully avoids. That is a money-semantics defect rather than a date defect, so it belongs to another audit file — flagging it here only because I read the code while tracing the day-bucketing.
- **`classifySource` returning `'recurring'` for `is_recurring` rows** (`apps/web/src/app/dashboard/transactions/page.tsx:64-71`) is what produced the "Recurring" source chip on a row whose `source` column is `'manual'`. It is a display-layer conflation of two independent columns, not a date bug; noted because it appeared in the same production evidence set.

---

## Refuted during verification

No finding was refuted in whole — every one of F1–F33 reproduces against the code as cited, and F1, F2, F3, F11 and F18 were re-executed numerically under `TZ=UTC` and `TZ=America/Chicago` and match their stated outputs exactly. The following **individual claims inside otherwise-valid findings** were false and have been corrected in place; they are recorded here so nobody re-derives them from an old copy.

- **F19 — "`apps/web/src/app/dashboard/recurring/page.tsx:237` is the same discard."** False. `:251` writes `last_generated: c.lastSeenAt`; the web accept path already anchors the rule on the observed occurrence. Only mobile discards it.
- **F19 — "`RecurringPatternCandidate.lastSeenAt` is computed and never consumed anywhere."** False. It is consumed at `apps/web/src/app/dashboard/recurring/page.tsx:251`. The finding is a mobile/web divergence, not a dead field.
- **F6 — "the month picker in the same toolbar reads 'August 2026' while the heading reads September."** False. `MonthPicker` renders its label from the server-supplied `selected` prop (`MonthPicker.tsx:81-84`), so the label and the heading agree. The real (and worse) symptom is that the dropdown list is browser-derived, nothing in it is highlighted, and clicking the current month is a no-op — corrected in the body.
- **F1 — "February renders 31 cells (`new Date(2026, 2, 0).getDate()`)."** The conclusion is right, the expression was wrong: with February selected the shifted `monthIdx` is `0`, so the code evaluates `new Date(2026, 1, 0).getDate()` → 31. Corrected.
- **F1 — "the header count and the grid disagree with each other inside one component."** Imprecise: `CalendarLens` renders no count. The disagreement is between the page's KPI line (`page.tsx:86-95`) and the lens grid; inside the lens the observable is a non-empty `debits` array feeding an all-zero `dayTotal`.
- **F16 — "`packages/ai/src/advisor.ts:19`."** Wrong line: the hardcoded `/ 3` divisors are at `:31` and `:42`. `:19` is a type declaration.
- **F15 — "discards every transaction logged between 19:00 and 02:00 local."** Understated: for UTC−5 the unbucketed band is 17:00–02:59 local, and the bucket set omits 22:00–07:59 in *every* zone.
- **F7 — "`record.tsx:123` … the iOS Shortcut path builds one too, and it is discarded."** Technically true but not lossy today: the value it builds is `new Date().toISOString()`, i.e. already "now". The notification-listener path (`useNotificationListener.ts:95`) is the only one that loses real information.
- **Line-number corrections applied throughout:** `008_recurring_dedup_constraint.sql` `:44 → :36` and `:56-63 → :57-64`; `localDb.ts` `:181 → :182`; `SyncManager.ts` `:113-118 → :117-120`, `:157-178 → :156-176`; `exportData.ts` `:86 → :87` and `:57-64 → :55-64`; `export/page.tsx` `:82 → :85`; `askMurmurClient.ts` `:36 → :38`; `budgets/page.tsx` `:40-41 → :39-40`; `transactionStore.ts` `:191-208 → :191-207`; `TransactionRow.tsx` `:24-25 → :23-26`.
- **Occurrences added to "Same defect elsewhere" lists:** F5 gained `apps/mobile/app/(tabs)/index.tsx:44, 53, 62`, `apps/mobile/app/(tabs)/budgets.tsx:44` and `apps/web/src/components/MonthPicker.tsx:77, 82, 90`; F10 gained the third hand-rolled Monday-start at `apps/mobile/app/(tabs)/budgets.tsx:34-37`; F17 gained `useTransactions.ts:202` and `index.tsx:62`; F22 gained `exportData.ts:151`; F2 gained the two mobile next-due display sites.
- **Severities adjusted:** F4 Critical → High (no user-visible symptom of its own; every consequence is separately enumerated). F11 High → Medium (double-gated on a weekly budget *and* an active recurring rule, and inert in production today). F2 and F3 stay Critical but are now labelled latent — `recurring_rules` has 0 rows ever in the live database.

**Verified:** every finding above was independently re-checked against the code on 2026-08-08.
