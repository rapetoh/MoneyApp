# Money math: totals, budgets, savings, forecasts, insights
**Audit date:** 2026-08-08 - **Scope:** every calculation that turns transaction rows into a number shown to a user, on web + mobile + the AI layer, and whether those definitions agree - **Files examined:** 48

## Verdict

Not production-ready. There is no shared aggregation layer: every screen re-derives "spend", "income" and "saved" inline, and the definitions do not agree with each other — **three distinct formulas for "saved"** spread across five live surfaces (plus a sixth in dead code), and **three different date-window regimes** for what "this month" means (web-server/UTC, web-browser-local, mobile-device-local). The single worst problem is that the Overview **Calendar lens computes its entire grid from a `Date` built on the server and re-read in the browser's timezone**, which silently rewinds the calendar a full month for every user west of UTC; that is the exact mechanism behind the reported "1 in the FRI column" and "WEDNESDAY · JUL 8" symptoms, and it makes every cell in that lens read $0 while the header on the same page reads $92. Close behind it: the tester's $300 Charles Schwab investment is counted as consumption spending by *every* aggregate in the product, while every figure labelled "saved" reads $0 — the app tells the user they saved nothing in the same breath that it tells them 77% of their spending was savings.

The systemic cause is that `packages/shared` ships exactly one aggregation primitive — `aggAmount(t)`, a one-line field accessor — and nothing else. There is no `spend(txns, window)`, no `periodBounds(period, tz)`, no `savings(txns)`. So 25+ call sites each hand-rolled the filter, the window, the currency field and the rounding, and they drifted. The FX architecture (migration 011) is genuinely well-designed and then bypassed by roughly a third of its consumers. This needs a shared money/period module, not another round of patches.

## Findings summary

| # | Severity | Finding | Primary file |
|---|----------|---------|--------------|
| F1 | Critical | Calendar lens rewinds one month for every non-UTC user (server `Date` re-read client-side) | `apps/web/src/components/lenses/Calendar.tsx:18-22` |
| F2 | Critical | No savings/transfer concept; Savings & Investing counted as consumption everywhere, and three unrelated formulas all render as "saved" | `apps/web/src/app/dashboard/page.tsx:96` |
| F3 | Critical | Mobile budget spend adds future recurring rules of **both** directions, in raw currency; web adds none | `apps/mobile/src/hooks/useRecurringRules.ts:64-79` |
| F4 | High | Every mobile headline total is hard-coded to `$` and `en-US` grouping | `apps/mobile/src/components/Money.tsx:44,51` |
| F5 | Medium | Budgets ring shows month-to-date spend as an unlabelled hero number under "No overall budget" | `apps/web/src/app/dashboard/budgets/page.tsx:218-223,413` |
| F6 | High | Forecast is naive MTD linear extrapolation with no cold-start guard; "Actual" line ends on a projection | `apps/web/src/app/dashboard/insights/page.tsx:224,236-241` |
| F7 | High | "Heaviest day — avg $33" divides by a hard-coded 12 | `apps/web/src/app/dashboard/insights/page.tsx:274` |
| F8 | High | No minimum-sample threshold on any Insights pattern, heatmap or top-merchant claim | `apps/web/src/app/dashboard/insights/page.tsx:262-319` |
| F9 | High | "Based on N transactions across the last 6 months" — N is all transactions ever | `apps/web/src/app/dashboard/insights/page.tsx:350` |
| F10 | High | Ask Murmur's entire numeric layer sums raw `amount`, never the FX snapshot | `packages/ai/src/askMurmurTools.ts:533,589,601` |
| F11 | High | Ask Murmur gets 90 days of rows but year-scale windows + truthiness flags built from the truncated set | `apps/web/src/app/dashboard/ask/page.tsx:206-212` |
| F12 | High | FX-pending rows contribute 0 to every total with no user-visible signal; `isFxPending` is dead | `packages/shared/src/utils/fx.ts:36-52` |
| F13 | High | Changing profile currency orphans every FX snapshot; backfill only targets NULLs | `apps/mobile/src/services/fxBackfill.ts:34-41` |
| F14 | High | Mobile MiniBars + HistoryHeatmap sum raw `amount` while the same screens' heroes use `aggAmount` | `apps/mobile/app/(tabs)/index.tsx:56` |
| F16 | High | Web month windows use **server** local time (UTC on Vercel); mobile uses device time; `profiles.timezone` is dead | `apps/web/src/app/dashboard/page.tsx:55-56` |
| F17 | High | Mobile silently treats quarterly/yearly budgets as monthly; web does not | `apps/mobile/src/hooks/useBudget.ts:98-101` |
| F18 | High | Web budget creation omits `currency_code`, so every web-made budget is stamped USD | `apps/web/src/app/dashboard/budgets/page.tsx:181-187` |
| F19 | High | Recurring "paid monthly" / "monthly total" sums credit rules alongside debit rules | `apps/mobile/app/recurring.tsx:95-100` |
| F20 | High | Mobile aggregates only ever see the 200 most-recently-updated rows `pullRemote` fetched | `apps/mobile/src/services/sync/SyncManager.ts:156-176` |
| F21 | Medium | Calendar day-detail formats the raw `amount` with the profile currency symbol | `apps/web/src/components/lenses/Calendar.tsx:305` |
| F22 | Medium | Export file rows carry raw amounts; the summary header uses `aggAmount` — they don't add up | `apps/web/src/app/dashboard/export/page.tsx:77-82,109` |
| F23 | Medium | Biweekly budget window is a rolling last-14-days; `budgets.starts_at` is ignored on both platforms | `apps/web/src/app/dashboard/budgets/page.tsx:47-52` |
| F24 | Medium | "Source" chip and the "N recurring" count are derived from `is_recurring`, not `source` | `apps/web/src/app/dashboard/transactions/page.tsx:64-71,417-430` |
| F25 | Medium | Cashflow labels month-end net as "balance · day 31" mid-month and calls `net/income` a savings rate | `apps/web/src/components/lenses/Cashflow.tsx:71,111` |
| F26 | Low | `advisor.ts` divides a >3-month window by a hard-coded 3, on raw amounts — **dead code, zero call sites** | `packages/ai/src/advisor.ts:26-44` |
| F27 | Medium | Mobile's prev-month normalisation scales last month by *this* month's day count | `apps/mobile/app/(tabs)/insights.tsx:212-221` |
| F28 | Medium | Web six-month average silently drops zero-spend months | `apps/web/src/app/dashboard/insights/page.tsx:217-220` |
| F29 | Medium | Same money rendered with 0 decimals on web aggregates and 2 on mobile | `apps/web/src/app/dashboard/page.tsx:98-99` |
| F30 | Medium | Mobile "last 7 days" bars are actually week-to-date; Monday shows one bar | `apps/mobile/app/(tabs)/index.tsx:42-58` |
| F31 | Medium | Mobile Today hard-codes "left this month" and days-left-in-month for every budget period | `apps/mobile/app/(tabs)/index.tsx:61-64,250` |
| F32 | Low | Float accumulation of money with no cents-integer discipline anywhere | `apps/mobile/src/services/sync/localDb.ts:19` |
| F33 | Low | Five dead aggregate modules still compiled in, each with its own definition | `apps/mobile/src/components/SafeToSpend.tsx:49-52` |
| F34 | Low | Export default date range uses UTC "today" — off by one every evening in the US | `apps/web/src/app/dashboard/export/page.tsx:39-40` |
| F35 | Low | Treemap "Total flow" and its "Includes savings" caption are unreachable for the observed data shape | `apps/web/src/components/lenses/Treemap.tsx:89,106,135` |
| F36 | Medium | Mobile Insights category `%` is a share of the top-6 subtotal, not of month spend | `apps/mobile/app/(tabs)/insights.tsx:246-251` |
| F37 | High | Matrix lens row labelled **"Total"** sums only the top-8 categories | `apps/web/src/components/lenses/Matrix.tsx:60-67,224` |

---

## The central table: every aggregate in the codebase

"Savings?" = does a `Savings & Investing` debit (the tester's $300 Schwab row) get counted into this number.
"Recurring?" = does it include `source='recurring_generated'` rows, and does it additionally add un-generated future rule amounts.

### Web

| Aggregate | File:line | Exact formula | Income? | Savings? | Recurring? | Currency field |
|---|---|---|---|---|---|---|
| Overview "in" | `dashboard/page.tsx:93` | `Σ aggAmount(t)` where `direction==='credit'` and `monthStart ≤ t < monthEnd` | only | n/a | rows yes, rules no | `amount_in_profile_currency` |
| Overview "out" | `dashboard/page.tsx:94` | `Σ aggAmount(t)` where `direction!=='credit'`, same window | no | **yes** | rows yes, rules no | `amount_in_profile_currency` |
| Overview "saved" | `dashboard/page.tsx:96` | `max(0, in − out)` | yes | as spend | rows yes | `amount_in_profile_currency` |
| Overview count | `dashboard/page.tsx:91` | count of all directions in window | yes | yes | rows yes | — |
| Budgets ring number | `budgets/page.tsx:218-223` | `Σ aggAmount(t)` where `debit` and `t ≥ periodStart(overall?.period ?? 'monthly')` — **computed even with no budget** | no | **yes** | rows yes, rules no | `amount_in_profile_currency` |
| Budgets per-category | `budgets/page.tsx:236-243` | same, plus `category_id === b.category_id` | no | yes if budgeted | rows yes | `amount_in_profile_currency` |
| Budgets `pct` / "left" | `budgets/page.tsx:225-226,243` | `spent / b.amount`, `max(0, amount − spent)` | no | yes | rows yes | mixes budget `amount` (stamped USD by F18) with profile-currency sum |
| Insights monthly totals (6) | `insights/page.tsx:203-208` | `Σ aggAmount(t)` per calendar month, `debit` only, **server-local months** | no | **yes** | rows yes | `amount_in_profile_currency` |
| Insights 6-mo average | `insights/page.tsx:217-220` | mean of the 5 complete months **after dropping every zero month** | no | yes | rows yes | derived |
| Insights projection | `insights/page.tsx:224` | `(currentTotal / dayOfMonth) * daysInMonth` | no | **yes** | rows yes, rules **no** | derived |
| Insights forecast months 1-3 | `insights/page.tsx:239-241` | `avg > 0 ? avg : projectedCurrent` | no | yes | rows yes, rules no | derived |
| Insights top merchants 90d | `insights/page.tsx:249-255` | `Σ aggAmount(t)` grouped by `merchant ?? 'Unnamed'`, debits, last 90 days | no | yes | rows yes | `amount_in_profile_currency` |
| Insights "heaviest day" | `insights/page.tsx:265-274` | `weekdaySum[i] / 12` — literal 12, not a count | no | yes | rows yes | `amount_in_profile_currency` |
| Insights category share | `insights/page.tsx:290-301` | `catTotal / Σ catTotals`, debits, 90 days | no | **yes (this is the 77%)** | rows yes | `amount_in_profile_currency` |
| Insights heatmap cell | `insights/page.tsx:322-338` | `Σ aggAmount(t)` by (weekday, 2h bucket), debits, 90 days; buckets only cover 08:00–21:59 | no | yes | rows yes | `amount_in_profile_currency` |
| Insights "Based on N" | `insights/page.tsx:350` | `txns.length` — **no window at all** | yes | yes | rows yes | — |
| MindMap Income / Expenses | `lenses/MindMap.tsx:56-57,302-303` | `Σ aggAmount` by direction, month window | split | **yes, under Expenses** | rows yes | `amount_in_profile_currency` |
| MindMap "Saved & invested" | `lenses/MindMap.tsx:58,96-106` | `max(0, income − expense)`, plus a "Recurring outflow" sub-node = `Σ r.amount` for monthly rules (`:96-98`) | yes | as spend | rules raw | rule `amount` (raw) |
| MindMap centre "net" | `lenses/MindMap.tsx:304` | `income − expense` (can go negative, unlike "saved") | yes | as spend | rows yes | `amount_in_profile_currency` |
| Cashflow per-day in/out | `lenses/Cashflow.tsx:38-49` | `Σ aggAmount` by calendar day of month | split | as out | rows yes | `amount_in_profile_currency` |
| Cashflow "balance" | `lenses/Cashflow.tsx:50,108` | running `Σ(in − out)` — displayed as the **last day of the month** regardless of today | yes | as out | rows yes | `amount_in_profile_currency` |
| Cashflow "savings rate" | `lenses/Cashflow.tsx:71` | `round(net / totalIn * 100)`, only shown when `net ≥ 0` | yes | as out | rows yes | derived |
| Treemap category cells | `lenses/Treemap.tsx:91-96` + `types.ts:85-95` | `groupByCategory(monthDebits)` = `Σ (amount_in_profile_currency ?? 0)` | no | **yes, as a spend tile** | rows yes | `amount_in_profile_currency` |
| Treemap "Saved & invested" band | `lenses/Treemap.tsx:89,105` | `max(0, income − expense)` | yes | as spend | rows yes | derived |
| Treemap "Total flow" | `lenses/Treemap.tsx:106` | `expenseTotal + saved` | yes | double-labelled | rows yes | derived |
| Flow income/category/merchant | `lenses/Flow.tsx:80,84,95-107` | `Σ aggAmount` grouped by category / merchant | split | as expense | rows yes | `amount_in_profile_currency` |
| Matrix cell | `lenses/Matrix.tsx:42-56` | `Σ aggAmount(t)` by (category, trailing month), debits | no | yes | rows yes | `amount_in_profile_currency` |
| Matrix month totals | `lenses/Matrix.tsx:60-67`, rendered `:224-243` | `Σ` over the **top-8 categories only**, under a row literally labelled "Total" — a 9th category vanishes (**F37**) | no | yes | rows yes | derived |
| Matrix trend % | `lenses/Matrix.tsx:143` | `(last − prev) / prev` | no | yes | rows yes | derived |
| Calendar day total | `lenses/Calendar.tsx:31` | `Σ aggAmount(t)` by `d.getDate()`, debits, gated on `d.getMonth() === monthIdx` (**broken, F1**) | no | yes | rows yes | `amount_in_profile_currency` |
| Calendar row amount | `lenses/Calendar.tsx:305` | `t.amount` **raw**, formatted with profile currency | no | yes | rows yes | **`amount` (wrong)** |
| Transactions row amount | `transactions/page.tsx:736-737` | `±t.amount` formatted with `t.currency_code` | split | n/a | rows yes | `amount` + own currency (correct) |
| Transactions "N recurring" | `transactions/page.tsx:64-71,417-430` | count where `is_recurring \|\| source==='recurring_generated'` | yes | yes | rows yes | — |
| Export totals | `export/page.tsx:77-82` | `Σ aggAmount` by direction over `transacted_at.slice(0,10)` string range | split | as expense | rows yes | `amount_in_profile_currency` |
| Export CSV/JSON/PDF rows | `export/page.tsx:109,135,229-230` | `t.amount` raw (CSV does emit a separate `Currency` column at `:110`) | split | yes | rows yes | **`amount`** |
| Recurring monthly total | `recurring/page.tsx:97-113,273` | `Σ amount × {daily:30, weekly:4.33, biweekly:2.17, monthly:1, quarterly:1/3, yearly:1/12}` — **no direction filter** | **yes, added to cost** | n/a | rules only | rule `amount` raw |
| Recurring 30-day charges | `recurring/page.tsx:120-140,303` | `Σ c.rule.amount` over occurrences in the next 30 days | yes | n/a | rules only | rule `amount` raw |
| Recurring "potential savings" | `recurring/page.tsx:328-329` | `Σ candidate.amount` where `frequency==='monthly'`, `×12` | yes | n/a | candidates | raw |
| Ask chart totals | `components/AskChart.tsx:64` | `Σ point.value` — values come from the LLM sandbox (F10) | model's choice | model's choice | rows yes | raw `amount` |
| KPI / SpendingChart / CategoryChart | `components/{KPI,SpendingChart,CategoryChart}.tsx` | **dead code, zero imports**; format with `formatCurrency` (2 dp) unlike every live surface (0 dp) | — | — | — | — |

### Mobile

| Aggregate | File:line | Exact formula | Income? | Savings? | Recurring? | Currency field |
|---|---|---|---|---|---|---|
| Today "Spent today" | `app/(tabs)/index.tsx:168-173` | `Σ aggAmount(t)` where `debit` and `isSameDay(t, now)` (**local** date) | no | **yes** | rows yes | `amount_in_profile_currency` |
| Today MiniBars | `app/(tabs)/index.tsx:42-58` | `Σ t.amount` **raw**, Monday→today only (not 7 days) | no | yes | rows yes | **`amount`** |
| Today "left this month" | `app/(tabs)/index.tsx:178` | `max(0, budget.amount − periodSpend − upcomingRecurring)` | via rules | yes | rows **and** future rules | mixed |
| Today days-to-go | `app/(tabs)/index.tsx:61-64` | days left in **calendar month**, whatever the budget period | — | — | — | — |
| `usePeriodSpend` | `hooks/useBudget.ts:83-111` | `Σ aggAmount(t)` where `debit` and `t ≥ periodStart`; weekly = Mon-anchored, biweekly = rolling 14d, **quarterly/yearly fall through to monthly** | no | **yes** | rows yes | `amount_in_profile_currency` |
| `computeUpcomingRecurring` | `hooks/useRecurringRules.ts:64-79` | `Σ rule.amount` for active rules whose next occurrence falls in `getPeriodBounds(period)`; **no direction filter**, **no FX**, weekly bounds are **Sun-anchored** (disagrees with `usePeriodSpend`) | **yes, as spend** | yes | rules only | rule `amount` raw |
| Budgets "spent" | `app/(tabs)/budgets.tsx:80` | `periodSpend + upcomingRecurring` | via rules | yes | rows **and** rules | mixed |
| Budgets remaining / over / tight | `app/(tabs)/budgets.tsx:82-84` | `max(0, limit − spent)`, `spent > limit`, `spent/limit > 0.92` | — | — | — | budget `amount` vs profile-currency sum |
| BudgetRing pct | `components/BudgetRing.tsx:22` | `min(spent/limit, 1)`; `limit === 0 → 0` | — | — | — | — |
| Insights hero "Spent" | `app/(tabs)/insights.tsx:128-134,178-185,195` | `Σ aggAmount(tx)` where `debit` and `s ≤ transacted_at < e`; `s`/`e` are **local** month bounds serialised via `toISOString()`, so the window is device-local (correct) but compared lexicographically | no | **yes** | rows yes | `amount_in_profile_currency` |
| Insights delta pill | `app/(tabs)/insights.tsx:212-223` | `(monthSpent − prevMonthSpent × daysElapsed / daysInThisMonth) / …` | no | yes | rows yes | derived |
| Insights category rows | `app/(tabs)/insights.tsx:236-252` | `Σ aggAmount` by category, top 6; **`pct` is share of the top-6 subtotal, not of all spend** (**F36**) | no | **yes** | rows yes | `amount_in_profile_currency` |
| Insights trend spark | `app/(tabs)/insights.tsx:258-275` | 14 daily `sumDebits` points, local day boundaries | no | yes | rows yes | `amount_in_profile_currency` |
| Insights "usual monthly" | `app/(tabs)/insights.tsx:280-290` | mean of the prior 3 months **excluding zero months** | no | yes | rows yes | derived |
| Insights forecast | `app/(tabs)/insights.tsx:291-296` | `(monthSpent / daysElapsed) × daysInMonth`, **gated on `usualMonthly > 0 && monthSpent > 0`** | no | yes | rows yes, rules no | derived |
| HistoryHeatmap month total | `components/HistoryHeatmap.tsx:15-24` | `Σ tx.amount` **raw**, keyed by **local** `getMonth()` | no | yes | rows yes | **`amount`** |
| HistoryHeatmap day cell | `components/HistoryHeatmap.tsx:28-38` | `Σ tx.amount` **raw**, local date | no | yes | rows yes | **`amount`** |
| Recurring "paid monthly" | `app/recurring.tsx:95-100` | `Σ r.amount × TO_MONTHLY[freq]` over active rules, **no direction filter**, **no FX** | **yes, as cost** | n/a | rules only | rule `amount` raw |
| Recurring yearly projection | `app/recurring.tsx:101` | `round(monthlyTotal × 12)` | yes | n/a | rules only | raw |
| `useMonthSummary` | `hooks/useTransactions.ts:200-219` | `Σ aggAmount` by direction from month start; **dead code, zero call sites** | split | as expense | rows yes | `amount_in_profile_currency` |
| `SafeToSpend` | `components/SafeToSpend.tsx:49-52` | `max(0, budget − (spent + upcoming))`; **dead code**; drops `locale` in `formatCurrency` | via rules | yes | rows + rules | — |
| PDF export total | `services/exportData.ts:171-173` | `Σ tx.amount` **raw** over debits | no | yes | rows yes | **`amount`** |
| `buildAdvisorContext` avg | `packages/ai/src/advisor.ts:26-31` | `Σ t.amount / 3` over a window that spans **3 to 4 calendar months**; **dead code, zero call sites** | no | yes | rows yes | **`amount`** |
| `implied_monthly_savings` | `packages/ai/src/advisor.ts:44` | `max(0, monthly_income − avgMonthlySpend)` — **income from the profile field, not transactions**; **dead code** | yes | as spend | rows yes | mixed |
| Ask overview totals | `packages/ai/src/askMurmurTools.ts:522-553` | `Σ Number(t.amount)` by direction | split | as debit | rows yes | **`amount`** |
| Ask summary snapshot | `packages/ai/src/askMurmurTools.ts:585-601` | `Σ Number(t.amount)` by category / month over "last 6 months" of a **90-day payload** | no | yes | rows yes | **`amount`** |
| Ask sandbox `sumBy` | `packages/ai/src/askMurmurTools.ts:213-214` | whatever the model picks; only `amount` is exposed | model | model | rows yes | **`amount`** |

**The answer to the central question: no.** "Spend" is not defined identically anywhere. There are three currency-field policies (`aggAmount`, raw `amount`, raw rule `amount`), three window regimes (web-server-local/UTC, web-browser-local, mobile-device-local), two recurring policies (rows only vs rows + un-generated future rules), and two direction policies for recurring totals. Every divergence in that table is a place where two screens will show the user two different numbers for the same question.

*(Verification note: mobile's two apparent regimes — `toISOString()` string bounds in `insights.tsx` and bare `getMonth()` bucketing in `HistoryHeatmap.tsx` — are semantically the **same** device-local regime. See "Refuted during verification".)*

---

## Findings

### F1. Overview Calendar lens rewinds a full month for every user west of UTC
- **Severity:** Critical
- **Status:** User-reported
- **Where:** `apps/web/src/components/lenses/Calendar.tsx:1,18-22,28-31,40,70`; boundary produced at `apps/web/src/app/dashboard/page.tsx:55-56,80-81`; same class in `apps/web/src/components/lenses/MindMap.tsx:1,499`
- **What the user sees:** On the Overview → Calendar lens for August 2026, the grid puts "1" in the **FRI** column (Aug 1 2026 is a Saturday), every day cell shows no amount even though the header on the same page reads "$92 out", and clicking day 8 opens a detail panel headed **"WEDNESDAY · JUL 8"** with "0 transactions".
- **Root cause:** `dashboard/page.tsx` is an async **server** component. It builds the month boundary with the server's local timezone — UTC on Vercel:

```ts
// apps/web/src/app/dashboard/page.tsx:55-56
const monthStart = new Date(anchorY, anchorM, 1, 0, 0, 0, 0)
const monthEnd = new Date(anchorY, anchorM + 1, 0, 23, 59, 59, 999)
```

  That `Date` is serialised across the RSC boundary as an **absolute instant** (`2026-08-01T00:00:00Z`) and handed to `CalendarLens`, which is a `'use client'` component. In the browser it is re-read with the *browser's* accessors:

```ts
// apps/web/src/components/lenses/Calendar.tsx:18-22
const year = props.monthStart.getFullYear()
const monthIdx = props.monthStart.getMonth()
const daysInMonth = new Date(year, monthIdx + 1, 0).getDate()
// Mon-first offset: Sun=0..Sat=6 -> Mon=0..Sun=6
const firstDow = (props.monthStart.getDay() + 6) % 7
```

  In US Central (CDT, UTC−5), `2026-08-01T00:00:00Z` **is** `2026-07-31 19:00`. So `getMonth()` returns `6` (July), `getDate()` returns `31`, and `getDay()` returns `5` (Friday). `firstDow = (5+6)%7 = 4` → index 4 of `['Mon','Tue','Wed','Thu','Fri','Sat','Sun']` = **Fri**. That is the reported symptom, exactly.
  The knock-on is worse than cosmetic. The bucketing loop filters on the corrupted month index:

```ts
// apps/web/src/components/lenses/Calendar.tsx:28-31
const d = new Date(t.transacted_at)
if (d.getMonth() !== monthIdx || d.getFullYear() !== year) continue
const day = d.getDate()
dayTotal[day] += aggAmount(t)
```

  `monthIdx` is 6 (July) while every one of the tester's transactions is in August, so **every transaction is skipped** and the whole grid is $0. And `selDate = new Date(year, monthIdx, sel)` = `new Date(2026, 6, 8)` = Wed Jul 8 2026 — which is what the detail panel printed.
- **Blast radius:** Every user in the Americas, and every user in Asia-Pacific at the other end of the month (UTC+n pushes `monthStart` forward, so the grid can start on the wrong weekday the other way and swallow the 1st). The lens is the default-visible content of a paid product surface. `MindMap.tsx:499` reads `props.monthStart.getFullYear()` in the same client context — for January it prints the previous year for western users. The other four lenses (`Flow`, `Treemap`, `Cashflow`, `Matrix`) are server components and are internally consistent, which means **the same page shows a self-consistent August in five lenses and July in the sixth**.
- **Same defect elsewhere:** Grepped for `props.monthStart` / `getMonth()` / `getDay()` across `apps/web/src/components/lenses/*.tsx`. Client components consuming a server-built `Date` (verified `'use client'` on line 1 of each): `Calendar.tsx:18,19,20,22,29,30,37,40,67` and `MindMap.tsx:499`. Server-side consumers (correct-by-accident, still UTC-anchored — see F16), verified to have **no** `'use client'`: `Cashflow.tsx:26-28,40,46`, `Matrix.tsx:28-30`, `Treemap.tsx`, `Flow.tsx`. The `MonthPicker` client component builds its own `Date` from the ISO string (`MonthPicker.tsx:77,82,90`) and is therefore not affected.
- **Fix:** Stop shipping `Date` objects across the RSC boundary. `LensProps` must carry **plain integers** — `{ year: number, monthIndex: number }` — plus a precomputed `daysInMonth` and `firstWeekdayMonFirst`, all derived once from the user's real timezone. That means the boundary must also stop being implicit: add `profiles.timezone` to the payload (it exists in the schema and is never used — see F16) and derive month bounds with an explicit-zone helper in a new `packages/shared/src/utils/period.ts`. This is an architectural fix, not a patch: `LensProps.monthStart: Date` is the wrong type at the boundary and every consumer needs to move off it together.
- **Regression test to add:** Render `CalendarLens` with `TZ=America/Chicago` and `monthStart` = the RSC-serialised instant for 2026-08 built under `TZ=UTC`; assert the first cell lands in the Sat column and that a 2026-08-08T14:33Z transaction contributes to day 8.

### F2. No savings/transfer concept; the $300 investment is consumption everywhere, and three unrelated formulas all render as "saved"
- **Severity:** Critical
- **Status:** User-reported
- **Where:** `apps/web/src/app/dashboard/page.tsx:96`; `apps/web/src/components/lenses/Treemap.tsx:89,105-106,135,139-140`; `apps/web/src/components/lenses/MindMap.tsx:58,96-106,304,513-516`; `apps/web/src/components/lenses/Cashflow.tsx:70-71`; `packages/ai/src/advisor.ts:44` (dead code); `apps/web/src/app/dashboard/insights/page.tsx:290-301`
- **What the user sees:** The Overview header says **"$0 in · $92 out · $0 saved · 2 transactions"**. The user has never recorded income, so "$0 in" is literally true but reads as a data-loss bug. "$0 saved" appears on a screen where a **$300 Savings & Investing** transaction exists (added minutes later), and the Insights page on the same account simultaneously asserts *"Savings & Investing is 77% of your spend"*. So the product says the user saved nothing and that 77% of their spending was savings, at the same time.
- **Root cause:** "in", "out" and "saved" are computed in one loop on the Overview and never defined anywhere shared:

```ts
// apps/web/src/app/dashboard/page.tsx:89-96
for (const t of lensTxns) {
  const d = new Date(t.transacted_at)
  if (d < monthStart || d > monthEnd) continue
  monthCount += 1
  if (t.direction === 'credit') monthIn += aggAmount(t)
  else monthOut += aggAmount(t)
}
const saved = Math.max(0, monthIn - monthOut)
```

  So: **in = credits**, **out = everything that isn't a credit**, **saved = `max(0, in − out)`** — i.e. net cashflow floored at zero. It is *not* Savings-category spend and *not* budget leftover. With `in = 0` and `out = 92`, `max(0, −92) = 0`.
  The $300 Schwab row is `direction='debit'`, `category='Savings & Investing'`. Nothing anywhere special-cases a savings/transfer category, so it lands in `monthOut`, in `usePeriodSpend`, in the Insights 90-day category share (300/392 = 76.5% → "77%"), in the forecast base, in the Treemap as a *spend* tile, and in MindMap under the **Expenses** branch — while the branch literally named "Saved & invested" next to it computes `max(0, income − expense)` and shows nothing:

```ts
// apps/web/src/components/lenses/MindMap.tsx:56-58
const incomeTotal = credits.reduce((s, t) => s + aggAmount(t), 0)
const expenseTotal = debits.reduce((s, t) => s + aggAmount(t), 0)
const saved = Math.max(0, incomeTotal - expenseTotal)
```

  The surfaces that render something called "saved", and the formula each uses — **three distinct formulas across five live surfaces**, plus a sixth in dead code:
  1. Overview header — `max(0, credits − debits)`, floored (`page.tsx:96`).
  2. MindMap "Saved & invested" branch — **the same formula** as (1) (`MindMap.tsx:58`); it agrees with the header, which is why the divergence here is conceptual, not numeric.
  3. MindMap centre node "net" — `credits − debits`, **not** floored (`MindMap.tsx:304`), rendered at `MindMap.tsx:513-516`. This is the one that genuinely contradicts: it prints `−$92` while (1) prints `$0` on the same page load.
  4. Treemap "Saved & invested" band + "Total flow: expenses + saved" (`Treemap.tsx:89,106`, rendered `:139-140`) with the caption "Includes savings" (`Treemap.tsx:135`) — again the same floored formula as (1).
  5. Cashflow "savings rate" = `net / totalIn` as a percentage (`Cashflow.tsx:71`) — a rate, not an amount, gated on `net >= 0` (`Cashflow.tsx:113`) so it silently vanishes in a deficit month.
  6. `advisor.ts` `implied_monthly_savings` = `max(0, profiles.monthly_income − avgMonthlySpend)` (`advisor.ts:44`) — sourced from the **profile field**, not from transactions. **Verified dead:** `buildAdvisorContext` is exported from `packages/ai/src/index.ts:9` and has zero call sites in `apps/` (grepped `buildAdvisorContext`, `AdvisorContext`, `advisor` across the whole repo — only the definition, the type, and the barrel export). No user sees this number today; it is a trap for whoever wires it up.

  The load-bearing defect is not the count of formulas — it is that **none of them is a savings figure at all.** Every one is a net-cashflow derivative, and there is no data model concept that could make a savings figure possible.
- **Blast radius:** Every savings/investment/transfer the user records inflates their "spend" on both platforms: the budget ring burns down, the forecast projects it as recurring consumption, the Insights "heaviest category" claim is dominated by it, and Ask Murmur is handed the same conflated dataset. A user who invests $2,000/month will be told they are over budget every month and that investing is 80% of their spending. Also correctness-critical for the paid Insights surface, since the whole "patterns" panel becomes noise.
- **Same defect elsewhere:** Grepped `saved`, `savings`, `net`, `implied_monthly`, `Savings & Investing`, `transfer`, `is_transfer`, `flow_type` across `supabase/migrations/*.sql` and `packages/shared/src/types/*.ts`. There is **no** transfer/savings/investment concept anywhere: no column, no field on `Transaction`, no filter in any aggregate. The only hits for "transfer" are the `payment_method` enum value `bank_transfer` (`001_initial_schema.sql:126`, `005_recurring_rules_fields.sql:8`, `packages/shared/src/types/transaction.ts:6`), which is a payment rail, not a flow classification. The category name itself is seeded from the `default_categories` table by `supabase/migrations/004_default_categories.sql:42` — `('Savings & Investing', '#00897B', '💰', 18), -- savings transfers, investment contributions` — copied per-user by `apps/mobile/src/services/seedCategories.ts`. The migration comment states the intent; **nothing in the code keys any behaviour off it.**
- **Fix:** This is architectural. (a) Add a first-class classification to the data model — either `transactions.flow_type ∈ ('expense','income','transfer','investment')` or a `categories.kind` column — and set it for the seeded "Savings & Investing" category and the onboarding income path; migrate existing rows by category name once. (b) Create `packages/shared/src/utils/money.ts` exporting a single `summarize(txns, window)` returning `{ income, expense, saved, invested, net, transactionCount }` with one documented definition, where `expense` **excludes** transfers/investments and `saved = income − expense` (unfloored, with the sign rendered explicitly). (c) Delete all six inline definitions and route every surface — Overview header, MindMap, Treemap, Cashflow, budgets, insights, advisor — through it. (d) When income is zero, the header must not print "$0 saved"; it must print a state, e.g. "no income recorded — add income to see savings".
- **Regression test to add:** Given one `credit` 1000, one `debit` 100 (Food), one `debit` 300 (Savings & Investing), assert `summarize()` returns `expense=100`, `invested=300`, `saved=900`, and assert the Overview header, MindMap, Treemap and Cashflow all render those same four numbers.

### F3. Mobile budget spend adds un-generated recurring rules of both directions, at raw amounts; web adds none
- **Severity:** Critical
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/hooks/useRecurringRules.ts:8-38,64-79`; consumed at `apps/mobile/app/(tabs)/budgets.tsx:75-84` and `apps/mobile/app/(tabs)/index.tsx:174-178`; web equivalent (absent) at `apps/web/src/app/dashboard/budgets/page.tsx:218-226`
- **What the user sees:** The same budget shows two different "used" figures depending on which device the user opens. A user who entered a monthly income during onboarding sees their mobile budget ring jump by their **entire monthly salary** for the part of the month before the recurring catch-up generates that month's row — e.g. a $2,000 budget with $92 of real spend reads "$4,092 spent · Over budget" on mobile and "$92 of $2,000" on web.
- **Root cause:** Mobile adds a projection of future recurring charges into "spent"; web does not.

```ts
// apps/mobile/app/(tabs)/budgets.tsx:80
const spent = periodSpend + upcomingRecurring
```

  and `computeUpcomingRecurring` has three independent defects:

```ts
// apps/mobile/src/hooks/useRecurringRules.ts:71-79
return rules
  .filter((r) => r.is_active)
  .reduce((sum, rule) => {
    const next = computeNextOccurrence(rule)
    if (!next) return sum
    if (next >= start && next <= end) return sum + rule.amount
    return sum
  }, 0)
```

  1. **No `direction` filter.** `recurring_rules.direction` exists and is set to `'credit'` by the onboarding income flow (`apps/mobile/app/(onboarding)/income.tsx:81-91` creates a monthly credit rule). Income is therefore added to *spend*.
  2. **No FX conversion.** `rule.amount` is raw, in `rule.currency_code`; it is added directly to a sum of `amount_in_profile_currency` values.
  3. **Week bounds disagree with the spend window on the same screen.** `getPeriodBounds` anchors weekly to **Sunday** (`useRecurringRules.ts:13-17`: `start.setDate(start.getDate() - day)`) while `usePeriodSpend` anchors weekly to **Monday** (`useBudget.ts:88-93`). And the `biweekly` branch (`useRecurringRules.ts:18-20`) moves `start` back 13 days but never advances `end`, which stays at `now` clamped to `23:59:59.999` (`:36`) — so the "upcoming" window for a biweekly budget spans the **past 14 days plus the remainder of today**, and no charge beyond today is ever counted.
- **Blast radius:** Both mobile budget surfaces (Budgets tab hero + ring, Today's "left this month" line at `index.tsx:178`) and the dead `SafeToSpend` component. Any user with a foreign-currency subscription gets a raw-currency number added to a converted sum. *(Verification correction: this does **not** reach Ask Murmur. `buildAdvisorContext` does take `safeToSpendRemaining` (`packages/ai/src/advisor.ts:13`) but has zero call sites — see F26 — so no model ever sees the inflated figure today.)*
- **Currently latent in production:** the lead auditor confirmed `recurring_rules` has had **0 rows, ever**. Nobody is hitting this today. It fires the moment any user creates a rule — including via the shipped onboarding income step — because `createRule` sets `last_generated = now` (`useRecurringRules.ts:126`), so the first occurrence to land inside a period window arrives one interval after creation. The defect is real code on a shipped path, which is why the severity stands.
- **Same defect elsewhere:** Grepped `computeUpcomingRecurring` — call sites are `apps/mobile/app/(tabs)/index.tsx:174-177` and `apps/mobile/app/(tabs)/budgets.tsx:75-78`, both feeding budget math. The direction-blindness of recurring rule sums also appears at `apps/mobile/app/recurring.tsx:95-100` and `apps/web/src/app/dashboard/recurring/page.tsx:270-274,303,308` (see F19). No web budget surface adds upcoming recurring at all — grepped `recurring` in `apps/web/src/app/dashboard/budgets/page.tsx`: zero hits.
- **Fix:** Decide the definition once and put it in shared code. My recommendation: **"spent" means money that has actually moved.** Un-generated future charges belong in a separate, separately-labelled "committed" figure, never summed into the ring. Concretely: (a) move period-window derivation into one `periodBounds(period, now, tz)` in `packages/shared/src/utils/period.ts` used by both `usePeriodSpend` and `computeUpcomingRecurring` and by web's `periodStart` — that alone removes the Mon/Sun and biweekly bugs; (b) add `.filter(r => r.direction === 'debit')` and convert each rule through the FX snapshot path before summing; (c) render "committed" as a distinct line, and make web render it too so the two platforms match.
- **Regression test to add:** With one active `credit` monthly rule of 4000 whose next occurrence is inside the current month and one `debit` transaction of 92, assert mobile Budgets reports `spent === 92` and that a shared `committedRecurring()` helper returns 0 (credits excluded).

### F4. Every mobile headline total is hard-coded to "$" and en-US grouping
- **Severity:** High — *(downgraded from Critical during verification: the quantity rendered is correct in the user's own currency; only the glyph and the grouping separator are wrong. That is a serious labelling defect on every mobile total, but it is not a wrong number, and the product ships to a US-majority base where `$` is usually right.)*
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/components/Money.tsx:44,50-51`; unqualified call sites: `apps/mobile/app/(tabs)/index.tsx:275`, `apps/mobile/app/(tabs)/insights.tsx:365,414`, `apps/mobile/app/(tabs)/budgets.tsx:123,125,132`, `apps/mobile/src/components/HistoryHeatmap.tsx:162,247`, `apps/mobile/app/recurring.tsx:180,233`, `apps/mobile/src/components/ListeningView.tsx:190`
- **What the user sees:** A EUR, GBP, NGN or XAF user sees `$1.234,00`-style output — specifically a **dollar sign** and **US thousands grouping** — on "Spent today", the Insights hero, every category row, the budget remaining/over figures, the history heatmap totals and the recurring "paid monthly" hero. Individual transaction rows next to them show the correct `€`, because `TransactionRow` passes the symbol explicitly.
- **Root cause:** The component defaults the glyph and hard-codes the grouping locale:

```ts
// apps/mobile/src/components/Money.tsx:44 (default), :50-51 (grouping)
  sign = '$',
...
  const [intPart, decPart] = abs.toFixed(2).split('.')
  const intFmt = parseInt(intPart, 10).toLocaleString('en-US')
```

  `sign` has no required-prop discipline (declared `sign?: string` at `Money.tsx:16`), so any call site that forgets it silently renders dollars. `toLocaleString('en-US')` is unconditional, so a French or German user gets `1,234.56` where they expect `1 234,56` even on a USD account.
- **Blast radius:** Every aggregate on mobile. It also produces a *self-contradicting screen*: on Today, "Spent today" renders `$50.00` while the transaction row directly beneath it renders `€50.00` for the same transaction. On `app/recurring.tsx` the same screen is inconsistent with **itself** — the row uses `<Money value={rule.amount} />` (dollars) at line 233 while the action-sheet title and subtitle for the same rule use `formatCurrency(rule.amount, rule.currency_code, locale)` (lines 107-108) and show the right one.
- **Same defect elsewhere:** Grepped `<Money` across `apps/mobile` — **13 component call sites; 11 omit `sign`, 2 pass it.** *(Verification correction: the finding originally claimed `TransactionRow` was the only site passing `sign`. It is not — `apps/mobile/app/transaction/[id].tsx:266-271` also passes `sign={currencySymbolFor(txn.currency_code || currency)}`, alongside `apps/mobile/src/components/TransactionRow.tsx:103-113`. Both single-row surfaces are correct; every aggregate surface is wrong.)* Same class, different mechanism: `apps/mobile/src/components/SafeToSpend.tsx:43,58,62,68,73,78` calls `formatCurrency(x, currency)` **without the `locale` argument**, so it always formats in `en` (`packages/shared/src/utils/currency.ts:4` defaults `locale = 'en'`) — dead code, see F33. Two more hand-rolled `en-US` formatters missed by the original sweep: `apps/mobile/app/(tabs)/index.tsx:322-327` (`formatBudgetShort` re-implements the glyph table inline and calls `toLocaleString('en-US')` — see F31) and `apps/mobile/app/more/settings.tsx:148` (`profile.monthly_income.toLocaleString('en-US', { maximumFractionDigits: 0 })`). Web's `Money.tsx:10` requires `currency` as a non-optional prop and defaults only `locale`, so web is not affected.
- **Fix:** Make `Money`'s currency non-optional: change the prop from `sign?: string` to `currencyCode: string` (required), derive the glyph internally with `currencySymbolFor`, and take `locale` for grouping instead of hard-coding `'en-US'`. TypeScript will then fail the build at all 11 offending call sites, which is the point — the current optional default is precisely what let them drift. Plumb `profile.currency_code` / `profile.locale` (already in scope at every one of those call sites) through, and delete `formatBudgetShort` and the `settings.tsx:148` inline formatter in the same pass.
- **Regression test to add:** Render Today, Insights, Budgets and HistoryHeatmap with `profile.currency_code='EUR'`, `locale='fr'`; assert no rendered money string contains `$` and that grouping uses the French separator.

### F5. Budgets ring shows month-to-date spend as its hero number when no budget exists
- **Severity:** Medium — *(downgraded from Critical during verification. The finding's own root-cause section concedes "the number is arithmetically correct". Per the rubric, an unlabelled but correct figure is "confusing or inconsistent but not wrong", i.e. Medium. It is the most visible Medium in this document and worth fixing first among them, but calling it Critical alongside a wrong-money bug devalues the word.)*
- **Status:** User-reported
- **Where:** `apps/web/src/app/dashboard/budgets/page.tsx:206-226,386-438`
- **What the user sees:** With **zero** budgets configured, the Budgets page draws a large ring whose centre reads `No overall budget` on one line and **`$92`** in 26px bold display type directly beneath it. There is no "of $X", no arc, no unit and no explanation. It reads as a glitch: a big money number captioned "no budget".
- **Root cause:** Not a math bug — the number is arithmetically correct — but a presentation bug that fails the bar. `overallSpent` is computed unconditionally, with a fallback period, whether or not a budget exists:

```ts
// apps/web/src/app/dashboard/budgets/page.tsx:218-223
const overallSpent = useMemo(() => {
  const start = periodStart(overall?.period ?? 'monthly')
  return transactions
    .filter((t) => t.direction === 'debit' && new Date(t.transacted_at) >= start)
    .reduce((s, t) => s + aggAmount(t), 0)
}, [transactions, overall])
```

  and then rendered unconditionally, while every piece of context around it is gated on `overall`:

```tsx
// apps/web/src/app/dashboard/budgets/page.tsx:401-419
<text ...>{overall ? `${Math.round(overallPct * 100)}% used` : 'No overall budget'}</text>
<text x="110" y="128" ... fontSize="26" fontWeight="700">
  {fmtShort(overallSpent)}          {/* ← never gated */}
</text>
{overall && (<text ...>of {fmtShort(overall.amount)}</text>)}
```

  So the label, the arc (`{overall && <circle .../>}`, line 388) and the "of $X" sub-line all disappear, and the bare figure stays. $92 = the Starbucks $50 + Xtream $42 that existed at 14:47 UTC. Once the Schwab row landed it became $392 — a number that also silently includes a savings transfer (F2).
- **Blast radius:** Every new user's first visit to Budgets, i.e. the exact moment the product is trying to earn trust with money. It also makes the page's own copy self-contradictory: the subtitle above says *"Set a monthly budget to start tracking"* (line 312) while the ring is already tracking and displaying a number.
- **Same defect elsewhere:** Grepped for figures rendered outside their `overall`/`budget` guard. `apps/web/src/app/dashboard/budgets/page.tsx:303` computes `periodTitle(overall?.period ?? 'monthly')` and prints "August budgets" with no budgets. Mobile does **not** have this bug: `usePeriodSpend` returns `0` immediately when there is no budget (`apps/mobile/src/hooks/useBudget.ts:83`), the whole ring is gated on `{limit > 0 ? … : …}` (`app/(tabs)/budgets.tsx:116`), and the else branch renders a dedicated empty hero with a CTA (`:151-163`). That mobile/web divergence is itself the tell.
- **Fix:** The correct presentation when no overall budget exists is a **non-ring empty state**: hoist the whole ring `<svg>` behind `{overall ? … : <EmptyBudgetHero … />}` in `budgets/page.tsx` so an unlabelled figure can never render, and change `overallSpent` to return `null` when `overall` is undefined so the type system carries the "no budget" state rather than a fallback period. If the spend figure is kept in that empty state it must carry an explicit "Spent this month" eyebrow. *(Verification correction: mobile's empty hero shows icon + title + body + CTA and **no** money figure at all — `budgets.tsx:152-162` — so "what mobile already does" is a CTA-only state, not a labelled figure. Either shape is defensible; the unlabelled figure is not.)*
- **Regression test to add:** Render `BudgetsPage` with `budgets: []` and three debits; assert no `<text>` node contains a currency-formatted value inside the ring, and that the "Set a monthly budget" CTA is present.

### F6. Forecast is a naive month-to-date linear extrapolation with no cold-start guard, and the "Actual" line ends on the projection
- **Severity:** High
- **Status:** User-reported
- **Where:** `apps/web/src/app/dashboard/insights/page.tsx:196-241,376-380,412-419`; the mobile counterpart that gets it right: `apps/mobile/app/(tabs)/insights.tsx:280-296`
- **What the user sees:** *"MONTHLY TOTAL · FORECAST — $1,519.00 projected for August"*, derived from three transactions logged on a single day. The chart's solid "Actual" line rises to $1,519 with a filled circle marker on it, and a dashed forecast line continues flat at $1,519 for September, October and November.
- **Root cause:** Three separate problems in eight lines.

```ts
// apps/web/src/app/dashboard/insights/page.tsx:221-241
const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()   // 31
const dayOfMonth = now.getDate()                                            // 8
const currentTotal = monthlyTotals[monthlyTotals.length - 1].total          // 392
const projectedCurrent = dayOfMonth > 0 ? (currentTotal / dayOfMonth) * dim : currentTotal
const projectedDelta = avg > 0 ? Math.round(((projectedCurrent - avg) / avg) * 100) : null
...
history[history.length - 1] = projectedCurrent          // ← overwrites the ACTUAL value
const forecastLine: Array<number | null> = new Array(labels.length).fill(null)
forecastLine[history.length - 1] = projectedCurrent
for (let k = 0; k < 3; k++) {
  forecastLine[history.length + k] = avg > 0 ? avg : projectedCurrent      // ← flat-lines
}
```

  1. **`392 / 8 * 31 = 1519.0`** exactly. It is a pure ratio estimator with `n = 1` distinct spending day. It has no variance model, no shrinkage toward a prior, no confidence interval, and no floor on `dayOfMonth` — on the 1st of a month a single $300 purchase projects **$9,300**. The `dayOfMonth > 0` guard is vacuous (`getDate()` is never 0).
  2. **`history[last] = projectedCurrent`** replaces the real August total with the projection *in the "Actual" series*. The chart legend says "Actual" (line 399) and the renderer draws solid stroke + a filled data-point circle for every `history` element (`insights/page.tsx:112,116-118`). The user is shown a fabricated number styled as a settled fact.
  3. **`avg` is 0** for this user because `completeMonthlyTotals` is empty (see F28), so all three future months are filled with `projectedCurrent` — a flat $1,519/month line stretching a quarter into the future, from eight days of history.
  4. It **treats the $300 investment as consumption** (F2) and **ignores recurring rules entirely** — grep `recurring` in `insights/page.tsx`: zero hits. The one genuinely predictable component of next month's spend (a $42 monthly Xtream bill) contributes nothing to the forecast, while an unrepeatable one-off is extrapolated ×3.9.
- **Judgement on statistical validity:** invalid as displayed. A month-to-date ratio estimator is defensible *late* in a month with a stable daily-spend process; it is meaningless on day 8 with three observations on one day, and it is actively misleading with no interval. The mobile implementation shows the team already knows this: `showForecast = isCurrentMonth && usualMonthly > 0 && monthSpent > 0` (`apps/mobile/app/(tabs)/insights.tsx:296`) — it requires **at least one prior month with spend** and phrases the result as *"At this pace, around $X by the end of {month}"* (`packages/shared/src/i18n/locales/en.json:262`). For this exact account, mobile correctly shows **no forecast card at all** while web shows $1,519. Same data, same day, opposite behaviour.
- **Blast radius:** Insights is free on every platform (comment at `insights/page.tsx:186-188`), so this is the headline number on a surface every user sees. It also drives the `↓/↑ N% vs 6-mo avg` pill and the y-axis scale of the whole chart (`max` at line 54 includes the projection), compressing real history to make room for a fabricated peak.
- **Same defect elsewhere:** Same estimator, better-guarded, at `apps/mobile/app/(tabs)/insights.tsx:291-294`. `apps/mobile/app/(tabs)/insights.tsx:218-221` applies the same days-elapsed pro-rating to the previous month for the delta pill (see F27). No other forecast implementations found (grepped `project`, `forecast`, `extrapolat`).
- **Fix:** Move forecasting out of the page component into `packages/shared/src/utils/forecast.ts` with an explicit contract, and give it minimum-data requirements the UI honours:
  - **Do not display any forecast** unless there are ≥2 complete prior months **and** ≥10 distinct spending days in the current month, or ≥1 complete prior month **and** `dayOfMonth ≥ 10`. Below that, render the honest state: "Not enough history yet — we'll forecast once you've logged a full month."
  - The estimator should be `recurringCommitted(monthRemaining) + variableSpendToDate + medianDailyVariable × daysRemaining`, where `medianDailyVariable` is drawn from the trailing 90 days (not this month alone) and **excludes transfers/investments** (F2). Return a range (e.g. p25–p75 from the daily distribution), and render it as a band, never a single bold figure.
  - Never write a projection into the `history` array. Keep `actual: number[]` and `projected: (number|null)[]` disjoint, and stop drawing solid-stroke data-point circles on projected indices.
  - Yes, recurring rules must feed it — that is the highest-signal input available and it is currently unused.
- **Regression test to add:** With 3 transactions on a single day and no prior months, assert the Insights page renders the not-enough-history state and no `$` figure inside the forecast card; with 3 complete prior months, assert `actual[last]` equals the real MTD total and is not overwritten.

### F7. "Saturday is your heaviest day — avg $33" divides by a hard-coded 12
- **Severity:** High
- **Status:** User-reported
- **Where:** `apps/web/src/app/dashboard/insights/page.tsx:264-288`
- **What the user sees:** *"Saturday is your heaviest day — avg $33."* from **one** Saturday containing all three of the user's transactions ($392 total). $33 is not the average of anything the user did.
- **Root cause:**

```ts
// apps/web/src/app/dashboard/insights/page.tsx:265-274
const weekdaySums = new Array(7).fill(0)
const weekdayCounts = new Array(7).fill(0)
for (const t of txns) {
  if (t.direction !== 'debit') continue
  if (new Date(t.transacted_at) < ninetyAgo) continue
  const idx = new Date(t.transacted_at).getDay()
  weekdaySums[idx] += aggAmount(t)
  weekdayCounts[idx] += 1
}
const weekdayAvg = weekdaySums.map((sum, i) => (weekdayCounts[i] > 0 ? sum / 12 : 0))
```

  `weekdayCounts` is computed and then used **only as a non-zero guard** — the divisor is the literal `12` (an assumed ~12.86 Saturdays in 90 days). So `392 / 12 = 32.67 → "$33"`. Two errors compound: the divisor is a constant rather than the number of *observed* weekdays-of-that-kind in the user's actual history, and it is a count of *calendar occurrences* rather than a count of *transactions*, so the label "avg" is ambiguous even when the data is dense. For a user with 6 days of history the divisor is still 12; for a user with 3 years of history windowed to 90 days it is coincidentally about right.
- **Blast radius:** Every user's Insights "Patterns" panel, from their very first week. The claim is asserted whenever `heaviestVal > 0` (line 284) — i.e. after a single transaction.
- **Same defect elsewhere:** Grepped for hard-coded divisors in aggregates. Same class at `packages/ai/src/advisor.ts:31` (`/ 3` over a window spanning 3–4 months) and `packages/ai/src/advisor.ts:42` (`total / 3` for `avg_monthly` per category) — both **dead code**, see F26. `apps/web/src/app/dashboard/recurring/page.tsx:97-113` and `apps/mobile/app/recurring.tsx:27-34` use fixed 4.33/2.17/30 multipliers, which is defensible for frequency normalisation but should be documented as approximate. `insights/page.tsx:274` is therefore **the only live instance** of this defect class.
- **Fix:** Compute the real denominator: count the distinct calendar dates of that weekday present in the analysis window that also fall on or after the user's first transaction, and divide by that. Then gate the assertion behind a minimum (see F8): assert nothing unless that weekday has been observed on ≥4 distinct dates. Better still, move the whole patterns engine into `packages/shared/src/utils/patterns.ts` returning `{ claim, sampleSize, confident }` so the UI can never render an unqualified claim.
- **Regression test to add:** One $392 debit on a single Saturday → assert no weekday claim is emitted. Four Saturdays totalling $400 across 90 days → assert the claim reads "avg $100".

### F8. No minimum-sample threshold anywhere in Insights
- **Severity:** High
- **Status:** User-reported
- **Where:** `apps/web/src/app/dashboard/insights/page.tsx:262-338` (patterns, weekday, category share, trend, heatmap), `246-260` (top merchants), `136-172` (`Heatmap` component)
- **What the user sees:** From three transactions on one day, the product asserts as fact: *"Saturday is your heaviest day"*, *"Savings & Investing is 77% of your spend in the last 90 days"*, a top-merchants bar chart where Charles Schwab is a full-width bar, and a weekday×hour heatmap with exactly one lit cell that reads as a discovered routine.
- **Root cause:** Every assertion is gated only on "greater than zero":

```ts
// apps/web/src/app/dashboard/insights/page.tsx:284,299-302
if (heaviestVal > 0) { patterns.push(`${dayNames[heaviestIdx]} is your heaviest day — avg …`) }
...
if (sortedCats[0] && ninetyTotal > 0) {
  const [name, amount] = sortedCats[0]
  patterns.push(`${name} is ${Math.round((amount / ninetyTotal) * 100)}% of your spend in the last 90 days.`)
}
```

  `300 / 392 = 76.5% → 77%`. Both the numerator and the denominator are single-day figures; the "last 90 days" framing implies a distribution that does not exist. The only place in the whole codebase with a data threshold is `apps/mobile/src/hooks/useInsightsUnlock.ts:22` (`const UNLOCK_THRESHOLD = 3`), and it gates a **badge dot and a welcome card** (`apps/mobile/app/(tabs)/insights.tsx:157-160`), not any claim — the mobile Insights screen renders regardless, and web has no gate at all.
  The `patterns.length === 0` fallback at line 317-319 already contains the right copy — *"Patterns will appear as your history grows. Log a few weeks to unlock insights."* — but it is unreachable as soon as a single transaction exists.
- **Blast radius:** The entire free Insights surface, for every user, from day one — the period when a money app most needs to look trustworthy. It also poisons the "Top merchants · 90 days" panel, where `topMax = topMerchants[0]?.amount ?? 1` (line 260) makes the single largest merchant a 100%-width bar regardless of significance.
- **Same defect elsewhere:** Grepped for `length >=`, `>= 3`, `MIN_`, `threshold` across `apps/web/src` and `apps/mobile/src`. The only guards found: `completeMonthlyTotals.length >= 2` for the trend claim (`insights/page.tsx:304`) — the one claim that *is* guarded — and `apps/mobile/src/services/recurringPatternDetector.ts` / `apps/web/src/lib/recurringPatternDetector.ts`, which do have occurrence minimums for recurring detection. So the pattern of gating exists in the codebase; Insights just doesn't use it.
- **Fix:** Introduce an explicit evidence gate in the shared patterns module and apply it uniformly:
  - weekday claim: ≥4 observed instances of that weekday **and** ≥12 transactions in window;
  - category-share claim: ≥10 transactions **and** ≥2 distinct categories **and** ≥21 days of history in window;
  - trend claim: keep the existing ≥2 complete months;
  - top merchants: require ≥5 merchants before rendering bars, otherwise a plain list with amounts and no comparative bar;
  - heatmap: require ≥20 transactions, otherwise render the empty-state copy.
  Below the gate, render the existing fallback string. Also fix the heatmap's silent data loss while you are in there: `hourBuckets = [8,10,12,14,16,18,20]` with `hour >= b && hour < b+2` (lines 322,331-335) **drops every transaction before 08:00 or after 21:59**, so night spending is invisible with no indication.
- **Regression test to add:** With <12 transactions in the window, assert `patterns` contains exactly the "Patterns will appear as your history grows" string and no weekday/category claim.

### F9. "Based on N transactions across the last 6 months" counts every transaction ever
- **Severity:** High
- **Status:** User-reported
- **Where:** `apps/web/src/app/dashboard/insights/page.tsx:179-184,190,349-351`
- **What the user sees:** *"Based on 3 transactions across the last 6 months."* It happened to be true here because the account is 1 day old. For a two-year-old account with 40 transactions in the last 6 months and 900 in total, it reads *"Based on 900 transactions across the last 6 months"* — overstating the evidence behind every claim on the page by an order of magnitude.
- **Root cause:** `getTransactions(supabase, user.id)` (`apps/web/src/lib/data.ts:8-23`) applies **no date filter and no limit**; the subtitle then prints the raw array length against a hard-coded window string:

```tsx
// apps/web/src/app/dashboard/insights/page.tsx:349-351
<div style={{ fontSize: 13, color: colors.ink3, marginTop: 2 }}>
  Based on {txns.length} transactions across the last 6 months.
</div>
```

  Every number *below* that line uses a real window (90 days for patterns/merchants/heatmap, 6 calendar months for the chart), so the attribution line describes none of them accurately even in principle — the page mixes a 90-day window and a 6-month window and labels both "6 months".
- **Blast radius:** It is the only evidence-disclosure on the page, so it is exactly the sentence a cautious user checks before trusting the forecast. Combined with F8 it manufactures false confidence.
- **Same defect elsewhere:** Grepped for attribution strings. `apps/web/src/app/dashboard/transactions/page.tsx:499` prints `{sourceSet.length} transactions` — correctly scoped (it recomputes `sourceSet` for the active month filter at lines 407-416). `packages/ai/src/askMurmurTools.ts` returns `attribution: { transaction_count: askReq.transactions.length }` (route line 387) where the payload is a **90-day, 500-row-capped** slice but nothing labels it as such (see F11).
- **Fix:** Compute the counts you are actually going to cite and cite them separately: `const inWindow90 = txns.filter(…).length` and `const inWindow6mo = …`, then render "Patterns from N transactions in the last 90 days · forecast from M months of history". Better: have the shared patterns/forecast module return its own `sampleSize` and `windowLabel` and render those, so the copy cannot drift from the math again.
- **Regression test to add:** Seed 900 transactions, 40 of them within 6 months; assert the subtitle cites 40, not 900.

### F10. Ask Murmur's entire numeric layer sums raw `amount`, bypassing the FX snapshot
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `packages/ai/src/askMurmurTools.ts:213-214,320,533,589,601`; payload built at `apps/web/src/app/dashboard/ask/page.tsx:215-222` and `apps/mobile/src/services/askMurmurClient.ts:43-50`
- **What the user sees:** A user with any foreign-currency transaction gets answers from Ask Murmur that contradict every other screen. Ask says "you spent $1,050 on dining"; Insights says "$1,000"; the difference is a €50 dinner counted as $50.
- **Root cause:** The wire type never carries the FX snapshot. Both clients project only `amount`:

```ts
// apps/web/src/app/dashboard/ask/page.tsx:215-222
const wireTxns: AskMurmurTransaction[] = filtered.map((t) => ({
  amount: t.amount,
  direction: t.direction,
  merchant: t.merchant ?? null,
  category_name: …,
  transacted_at: t.transacted_at,
  is_recurring: !!t.is_recurring,
}))
```

  and the server-side tool contract documents `amount` as *the* money field to the model (`askMurmurTools.ts:320`), with the deterministic aggregations doing the same:

```ts
// packages/ai/src/askMurmurTools.ts:533,589,601
const amt = Number(t.amount) || 0
...
byCat.set(k, (byCat.get(k) ?? 0) + (Number(t.amount) || 0))
...
monthly.set(key, (monthly.get(key) ?? 0) + (Number(t.amount) || 0))
```

  The sandbox `sumBy` helper (line 213) can only pick from what is exposed, and `amount_in_profile_currency` is not in the sandbox at all. The `currency` field passed to the model is the single **profile** currency (`ask/page.tsx:234`), so the model formats a mixed-currency sum with one symbol — the exact `$2,000 + €50 = $2,050` failure that migration 011 was written to eliminate, still live in the AI path.
- **Blast radius:** Every Ask Murmur answer, every Ask chart (`AskChart.tsx:64` totals the model's numbers), and — because Ask is a **Plus** feature — the paid differentiator. It also means the retry/validation machinery at `apps/web/src/app/api/ai/ask-murmur/route.ts:194-266`, which cross-checks the model's verdict against `buildDataOverview`, is validating one wrong number against another wrong number computed the same way.
- **Same defect elsewhere:** Re-grepped `+ t.amount` / `+ tx.amount` / `+ txn.amount` / `+ r.amount` / `+ rule.amount` / `+= *.amount` / `Number(t.amount)` across `apps/web/src`, `apps/mobile/src`, `apps/mobile/app`, `packages/ai/src`, `packages/shared/src`. Corrected and completed list — **summations** outside the AI package: `apps/mobile/app/(tabs)/index.tsx:56`, `apps/mobile/src/components/HistoryHeatmap.tsx:21,35` *(was cited as `:36`)*, `apps/mobile/src/services/exportData.ts:173`, `apps/web/src/app/dashboard/export/page.tsx:109,135,229-230` *(JSON row was cited as `:136`)*, `apps/web/src/components/lenses/MindMap.tsx:98`, `apps/web/src/app/dashboard/recurring/page.tsx:273,274,303,308,328` *(`:273-274` sum via `monthlyEquivalent`/`annualEquivalent` at `:97-117`, previously unlisted)*, `apps/mobile/app/recurring.tsx:98`. Raw-`amount` **renders** against the profile currency (distinct mechanism, same root): `apps/web/src/components/lenses/Calendar.tsx:305` (F21), `apps/web/src/components/lenses/MindMap.tsx:109` *(the original list cited `MindMap.tsx:104`, which is the sub-node's leaf-label map and holds no amount — corrected)*. Inside the AI package: `packages/ai/src/advisor.ts:31,37`, `packages/ai/src/askMurmurTools.ts:533,589,601`, `packages/ai/src/__tests__/askMurmur.verify.ts:112`.
- **Fix:** Add `amount_in_profile_currency: number | null` to `AskMurmurTransaction` in `packages/shared/src/types/ai.ts`, have both clients populate it, and change every server-side aggregation and the sandbox contract to read it via `aggAmount`. Rename the exposed field in the sandbox to `amount` **meaning the converted figure** and expose `amount_original` + `currency_code` separately for display, so the model literally cannot sum the wrong one. Also surface the count of FX-pending rows in the payload so the model can caveat (see F12).
- **Regression test to add:** Payload with a USD 1000 debit (`amount_in_profile_currency: 1000`) and a EUR 50 debit (`amount_in_profile_currency: 54.20`); assert `buildDataOverview().total_debit === 1054.20`, not `1050`.

### F11. Ask Murmur is given 90 days of rows but year-scale windows and truthiness flags built from the truncated set
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/ask/page.tsx:206-214`; `apps/mobile/src/services/askMurmurClient.ts:13-14,30-42`; consumed at `packages/ai/src/askMurmurTools.ts:140-146,158-167,554-559`
- **What the user sees:** Ask "how much did I spend last year?" or "compare this year to last year" and get a confident *"you have no recorded transactions in 2025"* from an account with two years of history.
- **Root cause:** Both clients hard-truncate to 90 days before sending:

```ts
// apps/mobile/src/services/askMurmurClient.ts:13-14, 30-32, 37-42
const MAX_TRANSACTIONS = 500
const WINDOW_DAYS = 90
...
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - WINDOW_DAYS)
  const cutoffIso = cutoff.toISOString()
...
  const filtered = args.transactions
    .filter((t) => !t.is_deleted && t.transacted_at >= cutoffIso)
    .sort((a, b) => a.transacted_at.localeCompare(b.transacted_at))

  // Drop oldest first if over cap.
  const trimmed = filtered.slice(-MAX_TRANSACTIONS)
```

  but the server then builds and advertises windows the payload cannot possibly satisfy — `transactions_this_year`, `transactions_last_year`, `transactions_last_6_months`, `transactions_last_12_months` (computed `askMurmurTools.ts:140-146`, exposed in the sandbox `:158-167`, and documented to the model `:326-332`) — and computes the anti-hallucination flags from the **same truncated array**:

```ts
// packages/ai/src/askMurmurTools.ts:554-559
    has_transactions_this_year: inWindow(txns, w.thisYear).length > 0,
    has_transactions_this_month: inWindow(txns, w.thisMonth).length > 0,
    has_transactions_last_month: inWindow(txns, w.lastMonth).length > 0,
    has_transactions_last_30_days: inWindow(txns, w.last30Days).length > 0,
    has_transactions_last_90_days: inWindow(txns, w.last90Days).length > 0,
```

  So the guardrail that exists specifically to catch "the model said no transactions but there are transactions" (`detectDataMismatch`, route lines 217-270) **agrees with the model**, because both are looking at 90 days. Note the flag list contains no `has_transactions_last_year`, so the "compare this year to last year" case is not even nominally covered. The system confidently reports absence it cannot observe. On mobile it is worse still: the local store itself is capped (F20), so the 90-day slice is taken from an already-incomplete dataset.
- **Blast radius:** Every historical question in the Plus feature. Silent — there is no "answers are limited to the last 90 days" disclosure anywhere in the UI or in the response payload.
- **Same defect elsewhere:** Grepped `WINDOW_DAYS`, `cutoff`, `slice(-`. Web `ask/page.tsx:206-212` mirrors the mobile constants; `apps/web/src/app/api/ai/ask-murmur/route.ts:70-71` re-caps server-side with `slice(-MAX_TRANSACTIONS)`. `buildSummarySnapshot` (`askMurmurTools.ts:585-601`) explicitly filters to `windows.last6Months` over the 90-day payload and labels its output `top_categories_6m` / `monthly_series_6m`.
- **Fix:** Either send a pre-aggregated long history alongside the raw 90-day rows (monthly totals per category for 24 months — small, cheap, and enough for every comparison question), or drop the 90-day cut and rely on the 500-row cap with server-side pagination. Whichever: `buildDataOverview` must be computed **server-side from the database**, not from the truncated wire payload, or the guardrail is worthless. And the sandbox's window list must be trimmed to windows the payload actually covers, with an explicit `data_window: { from, to }` the model is instructed to disclose.
- **Regression test to add:** Account with transactions 200 days ago and none in the last 90; assert `has_transactions_this_year === true` and that the response either answers from aggregates or states the window limitation.

### F12. FX-pending rows contribute 0 to every total, with no user-visible signal; the signal function is dead code
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `packages/shared/src/utils/fx.ts:36-52`; write path `apps/mobile/src/hooks/useTransactions.ts:89-103`; sweep `apps/mobile/src/services/fxBackfill.ts:31-70`
- **What the user sees:** A transaction list showing three rows — €50, £30, $12 — above a "Spent today" figure of **$12.00**. No error, no asterisk, no "converting…" state. Money the user entered simply is not in the total.
- **Root cause:** The design decision is documented and defensible; the promised mitigation was never built.

```ts
// packages/shared/src/utils/fx.ts:36-40
export function aggAmount(t: { amount_in_profile_currency?: number | null }): number {
  return t.amount_in_profile_currency ?? 0
}
```

  The header comment says: *"UI surfaces that care can count `null` rows separately and prompt the user."* and ships the helper for it:

```ts
// packages/shared/src/utils/fx.ts:48-52
export function isFxPending(t: { amount_in_profile_currency?: number | null }): boolean {
  return t.amount_in_profile_currency == null
}
```

  Grepping `isFxPending` across the whole monorepo returns **exactly one hit: its own definition.** Zero consumers. Meanwhile the write path swallows the failure silently — `snapshotFx` catches, `console.warn`s and returns `null` (`fx.ts:129-132`), and `createTransaction` persists `amount_in_profile_currency: fx?.amount_in_profile_currency ?? null` (`useTransactions.ts:103`) with no user feedback. So an offline save, a frankfurter.app outage, or an unsupported currency pair produces a transaction that is visible in the list and invisible in every total, indefinitely on web (the backfill sweep exists **only on mobile**, `_layout.tsx:104`).
- **Blast radius:** Every aggregate in the table above that uses `aggAmount` — which is the majority of them — under-reports silently. It compounds with F14: the surfaces that use raw `amount` (MiniBars, HistoryHeatmap, export rows) **do** show the money, so the same screen shows a bar chart that includes the €50 and a hero total that doesn't.
- **Same defect elsewhere:** Grepped `amount_in_profile_currency`, `?? 0`, `fx_rate_to_profile`. The `?? 0` coalesce is duplicated inline (bypassing `aggAmount`) at `apps/web/src/components/lenses/types.ts:92`. `apps/web/src/app/dashboard/transactions/page.tsx:298-301` and `apps/mobile/src/hooks/useTransactions.ts:171-179` both leave the snapshot null on amount-edit when `fx_rate_to_profile` is null, which is correct but again unsignalled.
- **Fix:** Two things, both small and both required. (1) Wire `isFxPending`: every aggregate surface should compute `const pending = txns.filter(isFxPending).length` and render a persistent, tappable notice — "N transactions aren't in this total yet (awaiting exchange rates)" — next to the figure. Put this in the shared `summarize()` return value (F2) as `pendingCount` so no surface can forget it. (2) Move the backfill sweep server-side into a scheduled Edge Function so it runs for web-only users and does not depend on someone opening the iOS app; the partial index `idx_txn_needs_fx_backfill` created by migration 011 already exists for exactly this query.
- **Regression test to add:** Two debits, one with `amount_in_profile_currency: null`; assert the rendered total excludes it **and** that the pending-count notice is present with count 1.

### F13. Changing profile currency orphans every FX snapshot
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/more/settings.tsx:437-442`; `apps/web/src/app/dashboard/settings/page.tsx:246-254`; snapshot semantics `packages/shared/src/utils/fx.ts:60-66`; sweep scope `apps/mobile/src/services/fxBackfill.ts:34-41`
- **What the user sees:** A user switches their profile currency from USD to EUR in Settings. Every historical total keeps its old dollar magnitude but is now rendered with a `€`. A $10,000 year becomes "€10,000" — a ~15% overstatement presented as fact, permanently.
- **Root cause:** `amount_in_profile_currency` is, by design, *"amount × rate at write time, into the profile currency as it was then"* (`fx.ts:60-62`). Nothing invalidates it when the profile currency changes. Both settings screens write the new code with no side effects:

```ts
// apps/mobile/app/more/settings.tsx:439-442
                onPress={async () => {
                  await updateProfile({ currency_code: c })
                  setCurrencyModal(false)
                }}
```

  and the only repair mechanism explicitly excludes already-populated rows:

```ts
// apps/mobile/src/services/fxBackfill.ts:38-41
.eq('is_deleted', false)
.is('amount_in_profile_currency', null)
```

  So there is no path — client or server — that recomputes a non-null snapshot. Every existing row stays denominated in the abandoned currency while every display symbol flips.
- **Blast radius:** Total. Every aggregate in the master table above reads a now-meaningless column, and the app has no way to know it is wrong. It also breaks budgets: `budgets.currency_code` (`001_initial_schema.sql:174`) is likewise never migrated, so a budget cap set in the old currency is compared against sums in the notional new one (compounding F18).
- **Same defect elsewhere:** Grepped `currency_code` writes on `profiles`: `apps/mobile/app/more/settings.tsx:440`, `apps/web/src/app/dashboard/settings/page.tsx:250` (bundled into a single profile `update` alongside `display_name`/`locale`/`monthly_income`, so it is not even a distinguishable event). Neither triggers any recomputation. Grepped for any `fx_rate_date`/`fx_rate_to_profile` invalidation: none exists.
- **Fix:** Currency change must be a **migration, not a field write**. Add a server-side routine (Edge Function or SQL function) that, in one transaction: records the old code, recomputes `amount_in_profile_currency` and `fx_rate_to_profile` for every non-deleted row using the historical rate for `(transacted_at, currency_code → newProfileCurrency)`, converts every `budgets.amount` at today's rate, and only then updates `profiles.currency_code`. Both settings screens should call it and show progress/failure rather than fire-and-forget an `update`. If a full historical recompute is judged too expensive, the alternative correct architecture is to stop denormalising into "profile currency" at all and instead store `amount_in_base_currency` against a fixed base (e.g. EUR, frankfurter's native base), converting to the display currency at read time — but that trades the permanence property the migration doc explicitly chose, so the migration approach is the right one.
- **Regression test to add:** Seed 5 USD transactions with rate 1.0, switch profile to EUR, assert every row's `amount_in_profile_currency` changed and that `fx_rate_to_profile !== 1.0`.

### F14. Mobile MiniBars and HistoryHeatmap sum raw `amount` while their own screens' heroes use `aggAmount`
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/(tabs)/index.tsx:50-58` (vs `168-173` on the same screen); `apps/mobile/src/components/HistoryHeatmap.tsx:15-24,28-38` (vs `apps/mobile/app/(tabs)/insights.tsx:128-134,195` on the same screen)
- **What the user sees:** On Today, the "Spent today" number and the bar directly beside it for the same day disagree for anyone with a foreign-currency or FX-pending transaction. On Insights, the hero says "Spent · Aug 1–8: $92" while the History section's August row says "$142" — two numbers for the same month, 400px apart.
- **Root cause:** Two components were written before or outside the migration-011 convention and never converted.

```ts
// apps/mobile/app/(tabs)/index.tsx:56
values[idx] += txn.amount
```

```ts
// apps/mobile/src/components/HistoryHeatmap.tsx:21 and :35
    out[key] = (out[key] ?? 0) + tx.amount
...
    dayOf[d.getDate()] += tx.amount
```

  Both file headers describe the components as decorative ("a subtle embellishment, not a real chart" — `MiniBars.tsx:20`), but `HistoryHeatmap` renders explicit `<Money>` figures at lines 162 and 247 — a month total and a per-month list — which are not decorative at all, and `MiniBars` drives relative bar heights that a user reads as proportions.
- **Blast radius:** Today tab and Insights tab on mobile — the two most-visited screens. For FX-pending rows the divergence is guaranteed even in a single-currency account when the frankfurter call failed.
- **Same defect elsewhere:** Full raw-`amount`-summation list is in F10's "same defect elsewhere". Within mobile specifically: `apps/mobile/app/(tabs)/index.tsx:56`, `apps/mobile/src/components/HistoryHeatmap.tsx:21,35`, `apps/mobile/src/services/exportData.ts:173`, `apps/mobile/app/recurring.tsx:98`.
- **Fix:** Replace `tx.amount` with `aggAmount(tx)` in all four mobile sites and add an ESLint rule (`no-restricted-syntax` on member access `.amount` inside a `reduce`/`+=` in `apps/**`) so this cannot regress. Longer term this disappears when every surface calls the shared `summarize()` (F2) instead of writing its own loop.
- **Regression test to add:** One row with `amount: 50, amount_in_profile_currency: 54.20`; assert `weeklySpendBars` and `totalsByMonth` both return 54.20.

### F16. Web month windows are computed in server-local time; `profiles.timezone` is dead
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/page.tsx:54-58`; `apps/web/src/app/dashboard/insights/page.tsx:26-31,196-224`; `apps/web/src/components/lenses/Matrix.tsx:25-34`, `Cashflow.tsx:26-28`; schema `supabase/migrations/001_initial_schema.sql:18`
- **What the user sees:** A US Central user's spending from 7–11:59pm on the last day of a month is counted in the **following** month by the web dashboard, and in the correct month by mobile. Month totals, the Overview KPI line, the Insights 6-month chart and the Matrix all disagree with the phone by up to a day's spending at every month boundary.
- **Root cause:** Every web month boundary is `new Date(y, m, 1)` evaluated in the **rendering process's** timezone. `dashboard/page.tsx` and `insights/page.tsx` are server components, so on Vercel that is UTC:

```ts
// apps/web/src/app/dashboard/page.tsx:54-56
const { year: anchorY, month: anchorM } = parseMonthIso(sp.month)
const monthStart = new Date(anchorY, anchorM, 1, 0, 0, 0, 0)
const monthEnd = new Date(anchorY, anchorM + 1, 0, 23, 59, 59, 999)
```

```ts
// apps/web/src/app/dashboard/insights/page.tsx:26-31,221-222
function startOfMonth(year: number, month: number) { return new Date(year, month, 1) }
function endOfMonth(year: number, month: number) { return new Date(year, month + 1, 0, 23, 59, 59) }
...
const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
const dayOfMonth = now.getDate()
```

  `now` is also server time, so at 7pm CDT on Aug 31 the server believes it is Sep 1: `dayOfMonth = 1`, `dim = 30`, and the "current month" in the 6-month series is September. The forecast divides by 1. Meanwhile `profiles.timezone` — `text NOT NULL DEFAULT 'UTC'` since migration 001 — is **never written and never read**: grepping `timezone` across `apps/`, `packages/` and `supabase/` returns only the column definition, the `Profile` type field (`packages/shared/src/types/profile.ts:10`), and a doc comment in `types/ai.ts:74`. Production confirms it: all 6 users are `'UTC'` while the tester is in US Central.
- **Blast radius:** Every web money figure that is windowed by month or day — which is nearly all of them — plus the desktop Electron shell, which wraps the same web app. It is also the substrate under F1: the Calendar bug is this bug plus an RSC serialisation boundary.
- **Same defect elsewhere:** Grepped `new Date(` with `(year, month` shape and `getDate()`/`getMonth()` on `now`. Server-side: `dashboard/page.tsx:55-56`, `insights/page.tsx:27,30,196,200-202,221-222,230,247-248`, `lenses/Matrix.tsx:28-30`, `lenses/Cashflow.tsx:26-28`, `lenses/Treemap.tsx` (via `monthDebits`), `lenses/Flow.tsx` (same). Client-side (browser-local, a *third* regime): `budgets/page.tsx:37-61`, `transactions/page.tsx:378-382`, `export/page.tsx:38-40`, `recurring/page.tsx:121-124,318-320`, `lenses/Calendar.tsx`, `MonthPicker.tsx:88-96`. Mobile is device-local throughout. So the same account has month boundaries defined three different ways depending on which file rendered the number.
- **Fix:** (a) Populate `profiles.timezone` from the device: `Intl.DateTimeFormat().resolvedOptions().timeZone` at sign-in on mobile and web, with a Settings override. (b) Add `periodBounds(period, anchor, tz)` to `packages/shared/src/utils/period.ts` and use it everywhere — server components included — so the boundary depends on the *user*, not on where the code happened to run. (c) Push the actual filtering into SQL (`transacted_at AT TIME ZONE p.timezone`) for the server-rendered pages so the window is computed once, in one place, from one source of truth.
- **Regression test to add:** With server `TZ=UTC`, profile timezone `America/Chicago`, and a transaction at `2026-09-01T01:30:00Z`, assert the Overview for August includes it and the Overview for September does not.

### F17. Mobile silently treats quarterly and yearly budgets as monthly
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/hooks/useBudget.ts:88-101`; label path `apps/mobile/app/(tabs)/budgets.tsx:48-56,120`; days-left `apps/mobile/app/(tabs)/budgets.tsx:32-46`; web counterpart `apps/web/src/app/dashboard/budgets/page.tsx:37-61`
- **What the user sees:** A user creates a **$9,000 quarterly** budget on the web dashboard. Web shows "$2,400 of $9,000 · 27% used". The phone shows the same budget as "$800 of $9,000 · 9% used" with the header "QUARTERLY BUDGET" — because the phone summed only the current month while labelling it as the quarter.
- **Root cause:** `usePeriodSpend` handles three of the five periods and lets the rest fall through:

```ts
// apps/mobile/src/hooks/useBudget.ts:88-101
if (budget.period === 'weekly') { … }
else if (budget.period === 'biweekly') { … }
else {
  // monthly (default) and others
  periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
}
```

  The comment `// monthly (default) and others` is the bug, written down. Web's `periodStart` (`budgets/page.tsx:53-60`) implements `quarterly` and `yearly` correctly, and `computeUpcomingRecurring`'s `getPeriodBounds` (`useRecurringRules.ts:21-29`) *also* implements them correctly — so on a mobile quarterly budget, `spent = periodSpend + upcomingRecurring` mixes **one month of actuals** with **one quarter of upcoming charges** in a single sum. Meanwhile `daysLeftInPeriod` returns days-left-in-*month* for quarterly and yearly (`budgets.tsx:43-45`), and `periodLabel` correctly says "quarterly" — so all three of the numbers in the hero card describe different windows.
  Mobile also cannot *create* these budgets: `BudgetEditorModal`'s `BUDGET_PERIODS` offers only weekly/biweekly/monthly (`apps/mobile/src/components/BudgetEditorModal.tsx:16-20`). Web offers all five (`budgets/page.tsx:13-19`). So the only way to reach this state is exactly what a cross-platform user would do.
- **Blast radius:** Every quarterly or yearly budget, on the platform the product actually ships to users (TestFlight/iOS). Also affects the Today tab's "left this month" line, which reads the same `periodSpend`.
- **Same defect elsewhere:** Grepped `budget.period` / `period ===` switches. Three separate period-window implementations exist and none agree on all five values: `apps/mobile/src/hooks/useBudget.ts:88-101` (3 of 5), `apps/mobile/src/hooks/useRecurringRules.ts:8-38` (5 of 5, Sunday-anchored week), `apps/web/src/app/dashboard/budgets/page.tsx:37-61` (5 of 5, Monday-anchored week). Plus `daysLeftInPeriod` (`apps/mobile/app/(tabs)/budgets.tsx:32-46`) as a fourth partial one.
- **Fix:** Delete all four and replace with one exported `periodBounds(period: BudgetPeriod, now: Date, tz: string): { start: Date; end: Date }` in `packages/shared/src/utils/period.ts`, exhaustively switched over `BudgetPeriod` with a `never` default so adding a period is a compile error. Have `usePeriodSpend`, `computeUpcomingRecurring`, web's `overallSpent`/`perCat`, and both days-left helpers consume it. Then add quarterly/yearly to `BudgetEditorModal` so the platforms have parity.
- **Regression test to add:** Exhaustive table test over all five `BudgetPeriod` values asserting mobile and web produce identical `{start, end}` for a fixed `now` and timezone.

### F18. Web budget creation omits `currency_code`, stamping every web-made budget USD
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/budgets/page.tsx:181-187`; schema `supabase/migrations/001_initial_schema.sql:174`; mobile counterpart `apps/mobile/src/hooks/useBudget.ts:47-54`
- **What the user sees:** A EUR user sets a €2,000 budget on the web dashboard. It is stored as `2000 USD`. Both platforms then render it as "€2,000" (they format with the *profile* currency, not the budget's) and compare it against a sum of EUR-converted spend — so the cap is silently ~15% wrong and nothing on screen indicates it.
- **Root cause:** The insert omits the column entirely, and the schema silently supplies a default:

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

```sql
-- supabase/migrations/001_initial_schema.sql:174
currency_code   text NOT NULL DEFAULT 'USD',
```

  Mobile does it correctly — `useBudget.ts:47-54` passes `currency_code: currency` — so the same user gets different stored data depending on which client they used. And **no reader anywhere** consults `budgets.currency_code`: grepping it returns only the migration and the mobile write. Every display uses `profile.currency_code` (`budgets/page.tsx:261`, `app/(tabs)/budgets.tsx:68`), so even a correctly-stamped budget is mislabelled after a currency change (F13).
- **Blast radius:** Every budget created on web or desktop by a non-USD user. Because the ring, the "remaining", the "over by", the "near limit" colour thresholds and the per-category bars all divide by this number, the entire budgets surface is quietly wrong for those users.
- **Same defect elsewhere:** Grepped for inserts that omit a defaulted currency column. `apps/web/src/app/dashboard/transactions/page.tsx:325-339` correctly sets `currency_code: currency` on transactions. `apps/web/src/app/dashboard/recurring/page.tsx:238-254` sets `currency_code: c.currency_code` from the candidate. So budgets is the only omission — which is exactly why it went unnoticed.
- **Fix:** Add `currency_code: profile?.currency_code ?? 'USD'` to the web insert, and — more importantly — make every consumer read it: format the cap with the budget's own currency, and refuse to compare a budget to spend in a different currency without converting (or block creation until they match). Removing the `DEFAULT 'USD'` from the column would have turned this into a loud failure; consider doing that once existing rows are migrated.
- **Regression test to add:** Create a budget from the web page with `profile.currency_code='EUR'`; assert the inserted row has `currency_code='EUR'`.

### F19. Recurring "paid monthly" totals sum income rules as if they were costs
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/recurring.tsx:94-101,180-186`; `apps/web/src/app/dashboard/recurring/page.tsx:270-274,303,308,328-329`
- **What the user sees:** A user who entered a $4,000 monthly income during onboarding and subscribes to one $15 service opens Recurring and reads **"$4,015 per month"** under "PAID MONTHLY", with a yearly projection of **"$48,180"**. The web page shows the same conflated monthly total and counts the salary as a "charge" in the 30-day calendar.
- **Root cause:** `recurring_rules.direction` exists and is populated (`'credit'` for the onboarding income rule — `apps/mobile/app/(onboarding)/income.tsx:81-91`), but no total filters on it:

```ts
// apps/mobile/app/recurring.tsx:95-100
const monthlyTotal = useMemo(() => {
  return rules
    .filter((r) => r.is_active)
    .reduce((sum, r) => sum + r.amount * TO_MONTHLY[r.frequency], 0)
}, [rules])
```

```ts
// apps/web/src/app/dashboard/recurring/page.tsx:270-274
const active = rules.filter((r) => r.is_active)
const monthlyTotal = active.reduce((sum, r) => sum + monthlyEquivalent(r), 0)
const annualTotal = active.reduce((sum, r) => sum + annualEquivalent(r), 0)
```

  Same for `totalCharges` (line 303), the heaviest-day sum (line 308) and `potentialMonthly` (line 328). None of them convert currency either — `r.amount` is raw in `r.currency_code`, so a €12 subscription adds 12 to a dollar total.
- **Blast radius:** Both Recurring screens; the MindMap "Recurring outflow" sub-node uses the same shape (`lenses/MindMap.tsx:97-99`, filtered to `frequency === 'monthly'` but still direction-blind), and the web Overview passes `recurring` into every lens (`dashboard/page.tsx:33-38`) selecting only `name, amount, frequency` — **`direction` isn't even fetched**, so the lenses could not filter on it if they wanted to.
- **Same defect elsewhere:** Grepped `r.amount`, `rule.amount`, `monthlyEquivalent`, `TO_MONTHLY`. Direction-blind rule sums: `apps/mobile/app/recurring.tsx:98`, `apps/mobile/src/hooks/useRecurringRules.ts:76` (F3), `apps/web/src/app/dashboard/recurring/page.tsx:273,274,303,308,328`, `apps/web/src/components/lenses/MindMap.tsx:98`. Direction-blind rule *renders*: `apps/web/src/components/lenses/MindMap.tsx:109` (`planSubs` label), `apps/mobile/app/recurring.tsx:233`. FX-blind in all of the same places. *(The original list cited `MindMap.tsx:104`, which holds no amount — corrected to `:98` for the sum and `:109` for the render.)*
- **Fix:** Split the totals: `outflowMonthly` (debit rules) and `inflowMonthly` (credit rules), rendered as two distinct figures with distinct labels, and convert each rule through the FX snapshot path before summing. Add `direction` to the Overview's `recurring_rules` select. Put `monthlyEquivalent` in `packages/shared` once instead of maintaining `TO_MONTHLY` (mobile) and `monthlyEquivalent` (web) as duplicated constant tables that happen to agree today.
- **Regression test to add:** One active credit rule of 4000/monthly and one debit rule of 15/monthly; assert the Recurring hero renders 15, not 4015, on both platforms.

### F20. Mobile aggregates only ever see the 200 most-recently-updated rows
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/services/sync/SyncManager.ts:156-176`; consumed by every mobile aggregate via `apps/mobile/src/hooks/useTransactions.ts:18-36`
- **What the user sees:** A user who has been on the product for a year, or who reinstalls the app, opens Insights and sees months of history missing — the heatmap shows empty months, the "usual monthly" baseline collapses, and the forecast delta swings wildly — while the web dashboard on the same account shows everything.
- **Root cause:** The remote pull is hard-capped and there is no pagination or backfill loop:

```ts
// apps/mobile/src/services/sync/SyncManager.ts:159-168
let query = supabase
  .from('transactions')
  .select('*')
  .eq('user_id', userId)
  .order('updated_at', { ascending: false })
  .limit(200)
if (since) query = query.gt('updated_at', since)
```

  On a fresh install `since` is undefined, so the device receives the newest-updated 200 rows and nothing else, ever — subsequent pulls use `.gt('updated_at', since)` and therefore only bring *changes*, never the missing tail. Every mobile aggregate reads `getTransactions(userId)` from SQLite (`transactionStore.ts:41-48`, no limit) and so operates on that truncated set: the 6-month heatmap, the 3-month "usual monthly" baseline, the budget period sum, and the Ask Murmur payload (which then truncates again to 90 days, F11).
- **Blast radius:** Every mobile number, for any account with more than ~200 rows or after any reinstall. It is invisible: the UI shows a smaller number, not an error. Given the product ships to iOS via TestFlight as the primary surface, this is the platform where the totals are least trustworthy.
- **Same defect elsewhere:** Grepped `.limit(` across `apps/`. `apps/mobile/src/services/fxBackfill.ts:41` caps at 100 (`FX_BACKFILL_BATCH`) but is explicitly designed to run across launches (idempotent, re-queries NULLs) — that one is correct. `apps/web/src/lib/data.ts:11,20` takes an optional `limit` and is called without one at every call site, so web applies no client-side cap. *(Caveat added in verification: PostgREST still enforces the project's `db-max-rows` server-side — 1000 by default on Supabase — so a web account past ~1000 rows would silently truncate too. I could not read the project's PostgREST config from the repo, so this is flagged, not filed.)* `packages/ai` caps at 500 by design. `SyncManager.pullRemote` is the only unbounded-intent/bounded-implementation case.
- **Fix:** Paginate the initial pull to completion — loop on `updated_at` cursor until a page returns fewer than the page size — and persist a `full_sync_completed_at` marker so the loop is only paid once per install. Until the initial sync completes, aggregate surfaces must render a "syncing your history" state rather than a confidently wrong total. This is not a limit-bump: raising 200 to 5000 just moves the cliff.
- **Regression test to add:** Seed 450 remote rows, run `pullRemote` with no cursor, assert local SQLite ends with 450 rows.

### F21. Calendar day-detail renders the raw `amount` with the profile currency symbol
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/web/src/components/lenses/Calendar.tsx:305`
- **What the user sees:** In the Calendar lens day panel, a €45 dinner renders as **"−$45"** for a USD-profile user (and drops the cents, because the formatter is set to 0 decimals).
- **Root cause:**

```tsx
// apps/web/src/components/lenses/Calendar.tsx:8-13,305
function fmt(value: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
}
...
−{fmt(t.amount, props.currency, props.locale)}
```

  `t.amount` is the transaction's own-currency figure; `props.currency` is the profile currency. The day total two lines above uses `aggAmount` correctly, so the rows do not sum to the total shown at the top of the same panel. `LensTxn` (`lenses/types.ts:11-21`) does not carry `currency_code`, so the component has no way to render it correctly as written.
- **Blast radius:** The Calendar lens detail panel only — but this is the pattern the rest of the app got right (`TransactionRow.tsx:103-113`, `transactions/page.tsx:736-737`, `export/page.tsx:226-230` all explicitly note "a €45 dinner must not render as $45"), so it is a straggler.
- **Same defect elsewhere:** Grepped for `t.amount` rendered with `props.currency`/profile currency. `apps/web/src/components/lenses/Calendar.tsx:305` is the only one in the lenses. `apps/mobile/app/recurring.tsx:233` is the mobile analogue (`<Money value={rule.amount}/>` with the default `$`, see F4).
- **Fix:** Add `currency_code: string` to `LensTxn`, populate it in `dashboard/page.tsx:62-72`, and format the row with the transaction's own currency at 2 decimals. Show the converted figure as a muted secondary when it differs.
- **Regression test to add:** Render `CalendarLens` with a EUR transaction on a USD profile; assert the row shows `€` and the day total shows the converted figure.

### F22. Export file contents and export header totals use different money fields
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/export/page.tsx:70-82,102-114,133-144,218-232`; `apps/mobile/src/services/exportData.ts:158,171-173`
- **What the user sees:** The Export page says "Total expenses $1,000". The user downloads the CSV, sums the Amount column in a spreadsheet, and gets $1,050. The PDF is worse: its header prints `$1,000` and its own table rows sum to `$1,050`, in the same document.
- **Root cause:** The summary uses the FX snapshot; the rows use the raw amount.

```ts
// apps/web/src/app/dashboard/export/page.tsx:77-82
const totalExpenses = filtered.filter((t) => t.direction === 'debit').reduce((s, t) => s + aggAmount(t), 0)
const totalIncome  = filtered.filter((t) => t.direction === 'credit').reduce((s, t) => s + aggAmount(t), 0)
```

```ts
// apps/web/src/app/dashboard/export/page.tsx:109
t.amount.toFixed(2),
```

  Both choices are individually defensible — rows *should* keep their own currency (the comment at lines 224-225 says so explicitly) — but shipping them in one artefact with no reconciliation column makes the document internally inconsistent. FX-pending rows make it worse: they contribute their full raw value to the rows and **zero** to the header (F12). The mobile PDF has the same split: rows print `${tx.currency_code} ${tx.amount.toFixed(2)}` (`exportData.ts:158`) while the total is `Σ tx.amount` raw (line 173) — so mobile's total is *consistent with its rows* but inconsistent with every on-screen total in the app.
- **Blast radius:** Data export is a paid Plus feature explicitly positioned for "Spreadsheets, accountants" and "Records, tax filings" (`export/page.tsx:348,362`). A tax document whose header does not match its rows is the worst possible place for this.
- **Same defect elsewhere:** Grepped every export path: `apps/web/src/app/dashboard/export/page.tsx:109` (CSV), `:135` (JSON), `:229-230` (PDF), `apps/mobile/src/services/exportData.ts:158,173` (mobile PDF/HTML).
- **Fix:** The CSV already emits a `Currency` column (`export/page.tsx:102,110`), so the missing piece is the *converted* figure, not the currency label. Emit `Amount`, `Currency`, `Amount ({profileCurrency})`, `FX rate`, `FX date` in every format — JSON currently carries `amount` + `currency` but no snapshot fields (`:135-136`), and the PDF carries neither — and compute the header total from the converted column so it provably matches. Add a footer/notice row for FX-pending transactions rather than letting them silently differ.
- **Regression test to add:** Export a range containing one USD and one EUR transaction; assert the sum of the converted column equals the header total exactly.

### F23. Biweekly budgets use a rolling last-14-days window; `budgets.starts_at` is ignored everywhere
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/budgets/page.tsx:47-52`; `apps/mobile/src/hooks/useBudget.ts:94-97`; `apps/mobile/src/hooks/useRecurringRules.ts:18-20`; column defined at `supabase/migrations/001_initial_schema.sql:175`
- **What the user sees:** A biweekly budget never resets. "Spent this fortnight" changes meaning every single day — yesterday's window and today's window are different fortnights — so the figure can go *down* overnight with no spending, and a user can never see a completed period.
- **Root cause:** The window is defined relative to *now*, not to the budget's own anchor:

```ts
// apps/web/src/app/dashboard/budgets/page.tsx:47-52
if (period === 'biweekly') {
  const start = new Date(now)
  start.setDate(now.getDate() - 13)
  start.setHours(0, 0, 0, 0)
  return start
}
```

  Mobile is identical (`useBudget.ts:94-97`). Meanwhile `budgets.starts_at date NOT NULL DEFAULT CURRENT_DATE` exists precisely to anchor this and is read by **nothing**: grepping `starts_at` in `apps/` returns only `useBudget.ts:19` (an `ORDER BY` clause) and the recurring-rules table. The copy compounds it — the page prints "this fortnight" (`budgets/page.tsx:566`), which is a bounded calendar concept the math does not implement.
- **Blast radius:** Every biweekly budget on both platforms. It also makes the "Over by $X" and "Near limit" states unreliable, since crossing a threshold can un-cross itself the next morning.
- **Same defect elsewhere:** Grepped every `periodStart`/`getPeriodBounds` implementation. The `weekly`, `quarterly` and `yearly` branches are all calendar-anchored; only `biweekly` is rolling. `useRecurringRules.ts:18-20` has the rolling-biweekly bug *and* leaves `end = now` so no future charge is ever in-window (F3).
- **Fix:** Anchor biweekly to `budgets.starts_at`: `periodIndex = floor(daysBetween(starts_at, now) / 14)`, `start = starts_at + periodIndex × 14 days`, `end = start + 14 days`. Implement it once in the shared `periodBounds` helper (F17) so all three call sites get it. If anchoring is undesirable product-wise, then change the copy to "last 14 days" and stop calling it a budget period — but rolling windows and budget caps are not compatible concepts.
- **Regression test to add:** Budget with `starts_at = 2026-08-01`, `now = 2026-08-16`; assert the window is `[2026-08-15, 2026-08-29)`, and that the window is identical when `now = 2026-08-17`.

### F24. The "Source" column and the "N recurring" count are derived from `is_recurring`, not `source`
- **Severity:** Medium
- **Status:** User-reported
- **Where:** `apps/web/src/app/dashboard/transactions/page.tsx:64-71,417-430,501-502,730-732`; CHECK constraint in production allows only `voice|manual|scan|shortcut|notification_listener|recurring_generated`
- **What the user sees:** The Xtream row is `source='manual'` in the database but the column headed **"Source"** displays a chip reading **"Recurring"**. The page subtitle then reports "… 0 typed · 2 recurring", while the Recurring page on the same account says "No recurring rules yet" — three surfaces, three stories.
- **Root cause:** `classifySource` conflates a *flag* with a *provenance*, and does so first:

```ts
// apps/web/src/app/dashboard/transactions/page.tsx:64-71
function classifySource(t: Txn): 'voice' | 'apple-pay' | 'typed' | 'recurring' {
  // Recurring takes precedence — it's the most useful chip on a row
  // that's both recurring and (e.g.) voice-logged.
  if (t.is_recurring || t.source === 'recurring_generated') return 'recurring'
  if (t.source === 'voice') return 'voice'
  …
  return 'typed'
}
```

  `is_recurring` is a user-set flag meaning "this repeats"; `source` is how the row got created. Collapsing them means the Source column can never show the true provenance of a recurring-flagged row, and the derived counts (lines 417-430) are wrong for both buckets — the tester's manual Xtream row is counted as "recurring" and *not* as "typed", so "0 typed" is false. The comment shows this was a deliberate product call; the failure is that it was applied to the column literally labelled "Source" and to a count the user reads as a source breakdown.
- **Blast radius:** The Transactions page header numbers and the Source column; and it is one of the two symptoms that made the user distrust the Recurring feature (the other being the missing `recurring_rules` rows, which is outside this domain).
- **Same defect elsewhere:** Grepped `is_recurring` used as provenance. `apps/web/src/app/dashboard/transactions/page.tsx:67` is the only conflation; `:719` correctly renders `is_recurring` as a *separate* repeat glyph next to the merchant name — so the same row already carries the honest signal. Mobile does it correctly: `apps/mobile/src/components/TransactionRow.tsx:83-89` renders a repeat icon independently of source.
- **Fix:** Make the Source chip a pure function of `source` (`voice | typed | Apple Pay | scan | auto-generated`), keep the existing repeat glyph for `is_recurring`, and change the subtitle to two independent counts: "N voice · N typed · N Apple Pay" and, separately, "N marked recurring". The `recurring` filter pill should then filter on `is_recurring` and be relabelled "Repeats".
- **Regression test to add:** Row with `source='manual', is_recurring=true`; assert the Source chip reads "Typed", the repeat glyph is present, and the typed count includes it.

### F25. Cashflow labels month-end net as a mid-month "balance" and calls net/income a savings rate
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/web/src/components/lenses/Cashflow.tsx:35-54,70-71,108-111,275-279`
- **What the user sees:** On August 8, the Cashflow lens headline reads **"−$392 · balance · day 31"**. The user has 23 days of the month left; the lens presents an end-of-month figure as if it were settled. When income exists, a "N% savings rate" appears beneath the Net figure with no definition.
- **Root cause:** The loop runs over every day of the month regardless of today, so `bal` ends as the full-month net, and the label hard-codes `daysInMonth`:

```ts
// apps/web/src/components/lenses/Cashflow.tsx:35-54
for (let d = 1; d <= daysInMonth; d++) { … bal += inAmt - outAmt … }
```

```tsx
// apps/web/src/components/lenses/Cashflow.tsx:108-111
{fmt(bal, props.currency, props.locale)}
<span …>balance · day {daysInMonth}</span>
```

  Two further issues: it is called "balance" but is a **net delta from zero at month start**, not an account balance (the app has no balance concept); and `savingsRate = round(net / totalIn * 100)` (line 71) is the sixth "saved" definition (F2), gated on `net >= 0` so it silently disappears in a deficit month rather than showing a negative rate.
- **Blast radius:** The Cashflow lens. The trailing flat line it draws for future days also makes the chart read as "spending stopped", which is a second misreading of the same data.
- **Same defect elsewhere:** Grepped for loops over `daysInMonth` without a today-clamp: `lenses/Cashflow.tsx:35`, `lenses/Calendar.tsx:46,58,67` (the Calendar renders future days as legitimately empty cells, which is fine for a grid), `lenses/Treemap.tsx` n/a.
- **Fix:** Clamp the running-balance series at `min(today, daysInMonth)` for the current month, label the figure "net so far · day N" with the real N, and rename it away from "balance". Route the savings rate through the shared `summarize()` definition and render negatives rather than hiding them.
- **Regression test to add:** Render Cashflow for the current month on day 8; assert the label reads "day 8" and the series has 8 points.

### F26. `advisor.ts` divides a 3-to-4-month window by a hard-coded 3, on raw amounts — in dead code
- **Severity:** Low — *(downgraded from Medium during verification. The arithmetic defects are real, but `buildAdvisorContext` has **zero call sites**, so no user-visible symptom exists today. It belongs with F33's dead-code trap class, not with the live-math findings.)*
- **Status:** Newly discovered
- **Where:** `packages/ai/src/advisor.ts:26-44`; exported (and only exported) at `packages/ai/src/index.ts:9`
- **What the user sees:** **Nothing today.** *(Verification correction: the original finding claimed "Ask Murmur's advisory answers reason from a fabricated baseline" and that `avg_monthly_spend_last_3mo = 392 / 3 = $130.67` "is handed to the model as ground truth". It is not. Grepping `buildAdvisorContext`, `AdvisorContext` and `advisor` across `apps/`, `packages/` and `supabase/` returns only the type declaration, the function definition, the barrel export, and an unused `AI_ADVISOR_MODEL` env var in `apps/web/.env.local.example:11` / `.env.vercel:8`. Nothing calls it. The live Ask Murmur path is `askMurmurTools.ts`, covered by F10/F11.)* The risk is that this is a loaded gun: it is exported from the package's public surface, so the next person wiring an "advisor" feature gets all four defects for free.
- **Root cause:**

```ts
// packages/ai/src/advisor.ts:27-31, 42, 44
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1)
  const recentDebits = transactions.filter(
    (t) => t.direction === 'debit' && new Date(t.transacted_at) >= threeMonthsAgo,
  )
  const avgMonthlySpend = recentDebits.reduce((sum, t) => sum + t.amount, 0) / 3
...
    .map(([name, total]) => ({ name, avg_monthly: total / 3 }))
...
  const impliedMonthlySavings = monthlyIncome ? Math.max(0, monthlyIncome - avgMonthlySpend) : 0
```

  Four defects in one function: (a) the window starts at the **1st of the month three months back**, so on Aug 8 it spans May 1 → Aug 8 — **3.25 months** — and is then divided by 3; (b) it sums raw `t.amount`, bypassing the FX snapshot (F10); (c) no minimum-data guard, so a one-day-old account produces a confident monthly baseline; (d) `implied_monthly_savings` (line 44) takes income from `profiles.monthly_income` — a self-reported onboarding field — rather than from credit transactions, disagreeing with the Overview's "in" by construction.
- **Blast radius:** None at runtime. Meaningful only as a correctness trap on a package's public API.
- **Same defect elsewhere:** Grepped hard-coded divisors: `packages/ai/src/advisor.ts:31,42` *(the original cited `:39`, which is the `.sort()` line — corrected)*, `apps/web/src/app/dashboard/insights/page.tsx:274` (F7). Grepped `monthly_income` as an income source: `advisor.ts:44`, `apps/web/src/app/dashboard/ask/page.tsx:236`, `apps/mobile/src/services/askMurmurClient.ts:67` *(the original cited `:66`, which is the `today` field — corrected)*. The latter two **are** live: both Ask clients ship `monthly_income` into the sandbox (`askMurmurTools.ts:155,339`), where the model is free to treat a self-reported onboarding number as income while every other surface derives income from credit transactions. That live divergence is the part worth fixing.
- **Fix:** Delete `advisor.ts` and drop the export from `packages/ai/src/index.ts:9` — do not repair dead code. If an advisor context is wanted later, build it on the shared `summarize()` (F2): count the complete months actually covered and divide by that (or take a median of complete months); exclude the in-progress month; use `aggAmount`; return `sampleMonths` so the model can caveat. Separately, and this one is live: instruct the model that `monthly_income` is self-reported, and prefer transaction-derived income when credits exist.
- **Regression test to add:** A CI dead-export check (same one F33 asks for) that fails the build on any exported symbol in `packages/ai` with zero importers.

### F27. Mobile's month-over-month delta scales last month by *this* month's day count
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/(tabs)/insights.tsx:212-223`
- **What the user sees:** The "+N% vs Jul" pill on the Insights hero is biased by up to ~10% at month boundaries with different lengths — comparing March (31 days) to February (28) inflates the reported increase.
- **Root cause:**

```ts
// apps/mobile/app/(tabs)/insights.tsx:212-221
const daysInSelectedMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0).getDate()
const daysElapsed = isCurrentMonth ? now.getDate() : daysInSelectedMonth
const prevEquiv =
  isCurrentMonth && prevMonthSpent > 0
    ? (prevMonthSpent * daysElapsed) / daysInSelectedMonth
    : prevMonthSpent
```

  The pro-rating intent is right, but the denominator is the length of the **selected** (current) month, not of the **previous** month whose total is being scaled. `prevMonthSpent × 8/31` for a February baseline should be `prevMonthSpent × 8/28`. There is also no minimum-elapsed-days guard, so on the 1st the comparison is one day against 1/31 of a month.
- **Blast radius:** The Insights hero delta pill on mobile. Web's equivalent (`insights/page.tsx:225`) compares a full-month projection against a 6-month average, so the two platforms' "vs last period" pills are not comparable at all — different baselines, different normalisations.
- **Same defect elsewhere:** Grepped for day-count pro-rating: `apps/mobile/app/(tabs)/insights.tsx:220`, `apps/web/src/app/dashboard/insights/page.tsx:224`. No others.
- **Fix:** Use `daysInPrevMonth` for the previous-month denominator, and suppress the pill until `daysElapsed >= 7`. Put the comparison in the shared module so both platforms show the same pill with the same baseline.
- **Regression test to add:** March 8 with February data; assert `prevEquiv === prevMonthSpent * 8 / 28`.

### F28. The web six-month average silently drops zero-spend months
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/insights/page.tsx:217-220,225,239-241`
- **What the user sees:** The "vs 6-mo avg" comparison and the three forecast months are computed from "the average of months in which you spent something", not "your average month". A user who logged nothing in June sees a *higher* average than reality, so a normal month is reported as "↓ 22% vs 6-mo avg".
- **Root cause:**

```ts
// apps/web/src/app/dashboard/insights/page.tsx:217-220
const completeMonthlyTotals = monthlyTotals.slice(0, -1).map((m) => m.total).filter((v) => v > 0)
const avg = completeMonthlyTotals.length
  ? completeMonthlyTotals.reduce((s, v) => s + v, 0) / completeMonthlyTotals.length
  : 0
```

  The `filter(v => v > 0)` is presumably meant to skip months before the account existed, but it cannot distinguish "before you joined" from "a month you didn't log". It also silently drives the whole downstream chain: `avg === 0` ⇒ no delta pill, and the three forecast months collapse to `projectedCurrent` (F6).
- **Blast radius:** The delta pill and the three-month forecast tail on the Insights chart.
- **Same defect elsewhere:** Same shape at `apps/mobile/app/(tabs)/insights.tsx:287-288` (`months.filter((m) => m > 0)`), with the same consequence for `usualMonthly`.
- **Fix:** Bound the window by the user's **first transaction date** rather than by non-zero-ness, then include every month at or after it — including genuine zero months, which are real information. Return `monthsCovered` so the UI can say "vs your 4-month average" honestly instead of hard-coding "6-mo".
- **Regression test to add:** Months [100, 0, 200] with a first transaction in month 1; assert `avg === 100`, not 150.

### F29. The same money is rendered with 0 decimals on web aggregates and 2 on mobile
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/page.tsx:98-99`, `budgets/page.tsx:263-264`, `insights/page.tsx:48-49`, `recurring/page.tsx:279-280`, `lenses/{Calendar,Cashflow,Treemap,Matrix,MindMap}.tsx` `fmt` helpers; vs `apps/web/src/components/Money.tsx:35-40` (2 dp) and `packages/shared/src/utils/currency.ts:6-11` (2 dp)
- **What the user sees:** The Overview header says "$92 out"; the Transactions page says "−$50.00" and "−$42.00" for the rows that make it up. The Budgets ring says "$92" while the per-category row beneath it says "$92.00". The web Insights forecast card mixes both in one line: `<Money>` renders "$1,519.00" while the axis labels and budget line render "$1,519".
- **Root cause:** Two formatting conventions coexist with no policy. Every page-level `fmtShort`/`fmt` helper hard-codes `maximumFractionDigits: 0`; `Money.tsx` and `formatCurrency` hard-code `minimumFractionDigits: 2, maximumFractionDigits: 2`. `AskChart.tsx:40` introduces a third rule — `maximumFractionDigits: v < 100 ? 2 : 0` — so within a single chart, slices flip precision at $100.
  It is not only cosmetic: `maximumFractionDigits: 0` **rounds**, so a ring showing "$92" for a true 92.49 and "$93" for 92.50 gives the user no way to reconcile with the rows, and rounding the *displayed* total independently of the rounded components means the displayed parts need not sum to the displayed whole ("$33 + $33 + $33 = $100").
- **Blast radius:** Every web money surface; the mismatch is most visible on Budgets and Overview, where 0-dp and 2-dp figures sit within one card.
- **Same defect elsewhere:** Re-grepped `maximumFractionDigits` across `apps/web/src`, `apps/mobile/src`, `apps/mobile/app`, `packages/shared/src`, `packages/ai/src`. Complete list — 0-dp at `dashboard/page.tsx:99`, `budgets/page.tsx:264`, `insights/page.tsx:49,286`, `recurring/page.tsx:280`, `lenses/Calendar.tsx:12`, `lenses/Cashflow.tsx:12,325`, `lenses/Treemap.tsx:15`, `lenses/Matrix.tsx:15`, `lenses/MindMap.tsx:41,328`, `lenses/Flow.tsx:20`, `apps/mobile/app/more/settings.tsx:148`; 2-dp at `components/Money.tsx:38-39`, `packages/shared/src/utils/currency.ts:9-10,46-47`; conditional at `components/AskChart.tsx:42`. *(Verification corrections to the original list: `insights/page.tsx:301` has no formatter — it is the category-share `Math.round` percentage; `MindMap.tsx:38` → `:41`, and `MindMap.tsx:328` and `Flow.tsx:20` were missed entirely; `AskChart.tsx:40` → `:42`; `settings.tsx:148` was missed.)*
- **Fix:** One exported policy in `packages/shared/src/utils/currency.ts`: `formatMoney(v, currency, locale, { precision: 'exact' | 'compact' })`, where `compact` is permitted only for chart axes and never for a figure a user might reconcile. Delete all twelve local `fmt` helpers. Where a total and its components are shown together, both must use `exact`.
- **Regression test to add:** Snapshot the Budgets page with spend 92.49 and assert the ring figure and the sum of the row figures are string-consistent.

### F30. Mobile "last 7 days" bars are week-to-date
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/(tabs)/index.tsx:41-58`; component contract at `apps/mobile/src/components/MiniBars.tsx:5-6`
- **What the user sees:** On a Monday, the Today card's 7-bar chart has exactly one non-empty column and six flat ones — reading as "you spent nothing for six days", when in fact last week's data simply isn't plotted.
- **Root cause:** The docstring says "Last 7 days of spending indexed Mon..Sun" but the filter is anchored to the current week:

```ts
// apps/mobile/app/(tabs)/index.tsx:48-57
const todayDow = mondayIndex(today)
const values = Array(7).fill(0) as number[]
for (const txn of txns) {
  if (txn.is_deleted || txn.direction !== 'debit') continue
  const d = new Date(txn.transacted_at)
  const diff = Math.floor((startOfToday.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000)
  if (diff < 0 || diff > todayDow) continue
  const idx = todayDow - diff
  values[idx] += txn.amount
}
```

  `diff > todayDow` clamps the lookback to the start of the current Monday-week, so on Monday `todayDow = 0` and only today survives. Combined with the raw-`amount` bug (F14) and `MiniBars`'s `max = Math.max(...values, 1)` normalisation, a single transaction produces one full-height bar and six minimum-height nubs.
- **Blast radius:** The Today tab, every Monday and Tuesday, for every user.
- **Same defect elsewhere:** Grepped for rolling-vs-anchored window mismatches in chart data. `apps/mobile/app/(tabs)/insights.tsx:258-275` builds a genuinely rolling 14-point series (correct). No other instances.
- **Fix:** Either make it a true rolling 7 days (`diff >= 0 && diff < 7`, with day labels derived from the actual dates rather than a fixed `M T W T F S S`) — which matches the docstring and is more useful — or keep the week-to-date semantics and change the label and the empty columns to render as "not yet". Do not ship a chart whose empty columns mean two different things.
- **Regression test to add:** On a Monday with transactions on the preceding Thu/Fri/Sat, assert `weeklySpendBars` returns three non-zero entries.

### F31. Mobile Today hard-codes "left this month" and days-left-in-month for every budget period
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/(tabs)/index.tsx:61-64,163,178,244-256`; string at `packages/shared/src/i18n/locales/en.json:33`
- **What the user sees:** A user with a **weekly** $400 budget opens Today on Aug 8 and reads **"$310 left this month · 24 days to go"**. The $310 is the remainder of their *week*; the "24 days" is the remainder of the *month*. Both halves of one sentence describe different periods, and neither matches the budget.
- **Root cause:** The number respects the period; the copy and the day count do not.

```tsx
// apps/mobile/app/(tabs)/index.tsx:178,244-255
const leftThisPeriod = budget?.amount != null ? Math.max(0, budget.amount - periodSpend - upcomingRecurring) : null
…
<Text style={styles.budgetLeftAccent}>{formatBudgetShort(leftThisPeriod, currency)}</Text>
<Text style={styles.budgetLeftRest}> {t('home.left_this_month', locale)}</Text>
…
<Text style={styles.budgetRight}>{daysLeft} {t('home.days_to_go', locale)}</Text>
```

  with `daysLeft = daysLeftInMonth(new Date())` (lines 61-64,163) — unconditionally the calendar month. The variable is even named `leftThisPeriod`, so the author knew; only the string and the day count were missed. The Budgets tab already has the correct `periodLabel()` switch (`app/(tabs)/budgets.tsx:48-56`) and a `daysLeftInPeriod()` (lines 32-46, itself only partially correct — F17).
- **Blast radius:** The Today tab for every non-monthly budget. `formatBudgetShort` (lines 318-328) additionally re-implements the currency glyph inline for the fourth time (`:322-326`) and hard-codes `toLocaleString('en-US')` (`:327`) — see F4.
- **Same defect elsewhere:** Grepped `left_this_month`: only `apps/mobile/app/(tabs)/index.tsx:250`. Grepped period-aware label switches that exist but aren't used on Today: `apps/mobile/app/(tabs)/budgets.tsx:48-56`, `apps/mobile/src/components/SafeToSpend.tsx:16-34` (dead).
- **Fix:** Reuse the existing `periodLabel`/`spentKey` switches — lift them into `packages/shared` alongside the period helper (F17) — and take `daysLeft` from the shared `periodBounds().end`. Delete `formatBudgetShort` in favour of the fixed `Money` component (F4).
- **Regression test to add:** Weekly budget on a Wednesday; assert the Today line reads "left this week" and a days-to-go value of 5.

### F32. Money is accumulated in floating point end-to-end with no cents discipline
- **Severity:** Low — *(downgraded from Medium during verification. See the corrected symptom below: the specific cross-platform divergence the finding described is not reachable, and pure sums of 2-decimal values cannot land on a rounding boundary. This is a real architectural gap with a genuine but narrow failure mode, not a Medium-severity live defect.)*
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/services/sync/localDb.ts:19,27` (`amount REAL`, `amount_in_profile_currency REAL`); every `reduce((s, t) => s + …)` in the master table; `packages/shared/src/utils/fx.ts:125`
- **What the user sees:** In practice, nothing on a pure sum. *(Verification correction: `Intl.NumberFormat`'s default `roundingMode` is `"halfExpand"`, the same half-away-from-zero behaviour as `toFixed`, so the claimed "web rounds half-to-even, mobile rounds half-away" divergence does not exist. And because every stored amount is already 2-decimal, a sum of them cannot produce a value at a half-cent boundary, so `1234.5599999999999` renders as `"$1,234.56"` under both formatters.)* The reachable failure is on **derived** figures, not sums: an average, a percentage, or a rate that lands within ~1e-13 of a `.xx5` boundary flips a cent — e.g. `usualMonthly`, `prevEquiv`, `projectedCurrent`, `monthlyEquivalent(weekly) = amount × 4.33`.
- **Root cause:** Postgres stores `numeric(12,2)` / `numeric(14,2)` (correct), but the values become IEEE-754 doubles the moment PostgREST serialises them to JSON, and SQLite stores them as `REAL`. Every aggregate then does naive `+=` over dozens or hundreds of doubles with no compensation and no rounding until display. The only place rounding discipline is applied is the FX snapshot:

```ts
// packages/shared/src/utils/fx.ts:125
amount_in_profile_currency: Math.round(amount * rate * 100) / 100,
```

  which is exactly the right instinct, applied in exactly one place. Nothing rounds the *derived* values. `apps/mobile/src/components/Money.tsx:50` uses `abs.toFixed(2)` while web uses `Intl.NumberFormat`; both round half-away-from-zero, so they agree — but neither is fed a value that was ever normalised to cents, so both faithfully render whatever the float landed on.
- **Blast radius:** Rare and narrow, but it is precisely the class of defect that destroys trust in a money app because the user cannot reproduce it. The exposure is on averages and frequency-normalised figures (F26's `/3`, F27's pro-rating, the `4.33`/`2.17` multipliers at `apps/mobile/app/recurring.tsx:27-34` and `apps/web/src/app/dashboard/recurring/page.tsx:97-113`), not on the headline sums.
- **Same defect elsewhere:** Grepped `toFixed`, `Math.round(… * 100)`: rounding applied at `packages/shared/src/utils/fx.ts:125`, `apps/web/src/app/dashboard/transactions/page.tsx:300`, `apps/mobile/src/hooks/useTransactions.ts:177`, `packages/ai/src/askMurmurTools.ts` `round2` helper — all on single values, never on a derived aggregate.
- **Fix:** Add `roundCents(n)` to `packages/shared/src/utils/currency.ts` and apply it at the boundary of every aggregation *and every derived figure* (inside the shared `summarize()`/`forecast()` from F2/F6, once). For long series, sum in integer cents (`Math.round(v * 100)`) and divide at the end. Standardise on `Intl.NumberFormat` at the display layer on both platforms so a future `roundingMode` change cannot diverge them.
- **Regression test to add:** Assert `roundCents` is applied to every numeric field returned by the shared `summarize()`/`forecast()`, e.g. an average of `[0.07, 0.08]` renders `0.08` identically on both platforms.

### F33. Five dead aggregate modules still compiled in, each with its own definition
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/components/SafeToSpend.tsx` (0 imports), `apps/mobile/src/hooks/useTransactions.ts:200-219` (`useMonthSummary`, 0 call sites), `apps/web/src/components/KPI.tsx`, `apps/web/src/components/SpendingChart.tsx`, `apps/web/src/components/CategoryChart.tsx` (0 imports each)
- **What the user sees:** Nothing today — which is the risk. These are ready-to-hand components a future change will re-wire, and they encode *different* definitions than the live ones.
- **Root cause:** Verified by grep: `SafeToSpend` is referenced only in a stale comment (`apps/mobile/src/hooks/useBudget.ts:66`); `useMonthSummary` is exported and never called; `KPI`/`SpendingChart`/`CategoryChart` are imported by nothing (`KPI` imports `Money`, which is why it survives tree-shaking discussions). Each carries a divergent definition: `SafeToSpend.tsx:49-52` recomputes `committed = totalSpent + upcomingRecurring` and drops `locale` from `formatCurrency` (lines 43,58,62,68,73,78); `SpendingChart`/`CategoryChart` format with `formatCurrency` (2 dp) against the 0-dp convention of every live web surface (F29) and reference legacy theme aliases (`colors.primary`, `colors.textSecondary`) that `lib/theme.ts:19-21` marks "keep until the rest of the codebase migrates".
- **Blast radius:** None at runtime; meaningful as a correctness trap.
- **Same defect elsewhere:** Grepped for other zero-import modules under `src/components` and `src/hooks`: these five are the complete set.
- **Fix:** Delete all five — plus `packages/ai/src/advisor.ts` and its export at `packages/ai/src/index.ts:9`, which verification found is a sixth dead aggregate module (see F26). If `SafeToSpend`'s hero treatment is wanted later, rebuild it on the shared `summarize()`. Add a `knip`/`ts-prune` check to CI so dead money code cannot accumulate.
- **Regression test to add:** N/A — add a CI dead-export check instead.

### F34. Export default date range uses UTC "today"
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/export/page.tsx:38-42,70-75`
- **What the user sees:** After 7pm Central, the Export page's "To" date pre-fills with **tomorrow's** date.
- **Root cause:**

```ts
// apps/web/src/app/dashboard/export/page.tsx:39-40
const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
const defaultTo = now.toISOString().slice(0, 10)
```

  `toISOString()` is UTC; `new Date(y, m, 1)` is browser-local, so the two bounds are derived in different frames. The filter then compares against `t.transacted_at.slice(0, 10)` (line 72) — the **UTC** date of the transaction — so an evening transaction is filed under the next day in the export while it appears under today everywhere else in the app.
- **Blast radius:** Export ranges for users west of UTC; a transaction can fall outside a range that visually should contain it.
- **Same defect elsewhere:** Grepped `toISOString().slice(0, 10)` / `.split('T')[0]`: `apps/web/src/app/dashboard/export/page.tsx:39,40,72,104,231`, `apps/web/src/app/dashboard/ask/page.tsx:235`, `apps/mobile/src/services/askMurmurClient.ts:66`. The last two define "today" for the entire AI reasoning layer in UTC (F11/F16).
- **Fix:** Derive both bounds and the row key in the user's timezone via the shared period helper; format local dates with a `toLocalDateString(d, tz)` helper rather than `toISOString().slice()`.
- **Regression test to add:** With `TZ=America/Chicago` at 20:00 local, assert `defaultTo` equals today's local date.

### F35. Treemap's "Total flow" and "Includes savings" caption are unreachable for the shipped data shape
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `apps/web/src/components/lenses/Treemap.tsx:87-89,105-106,134-141`
- **What the user sees:** The Treemap caption reads *"Bigger box = more money. Includes savings."* and a "Total flow: $92" figure in the corner — but no savings band is ever drawn for a user with no income, and the $300 that *is* savings is drawn as an ordinary spend tile.
- **Root cause:**

```ts
// apps/web/src/components/lenses/Treemap.tsx:87-89,105-106
const incomeTotal = credits.reduce((s, t) => s + aggAmount(t), 0)
const expenseTotal = debits.reduce((s, t) => s + aggAmount(t), 0)
const saved = Math.max(0, incomeTotal - expenseTotal)
…
const showSavedBand = saved > 0
const totalFlow = expenseTotal + saved
```

  `saved` is the F2 net-cashflow definition, so `showSavedBand` is false for every user with no recorded income — which, per production, is all six of them. The caption asserts a feature the render can't deliver, and `totalFlow` degenerates to `expenseTotal`, making the label misleading rather than wrong.
- **Blast radius:** Cosmetic/copy on one lens; included because the caption is a factual claim about what the visualisation contains.
- **Same defect elsewhere:** Same `max(0, income − expense)` gate at `apps/web/src/components/lenses/MindMap.tsx:58,100` — `if (saved > 0) savedSubs.push(...)`, so the "Saved & invested" branch renders as an empty branch node rather than being hidden. *(The original cited `:103`, which is the "Recurring outflow" sub-node label — corrected.)*
- **Fix:** Falls out of F2: once investments/transfers are classified, the saved band should be `Σ investments + (income − expense)` and will be reachable. Until then the caption should not promise savings.
- **Regression test to add:** With income 0 and a Savings & Investing debit of 300, assert the Treemap renders a savings band of 300 and that "Total flow" equals expenses + 300 without double-counting.

### F36. Mobile Insights category percentages are a share of the top-6 subtotal, not of month spend
- **Severity:** Medium
- **Status:** Newly discovered during verification
- **Where:** `apps/mobile/app/(tabs)/insights.tsx:236-253`, rendered at `:398-428` (the `%` label at `:415`, the bar width at `:400`); web's correct counterpart at `apps/web/src/app/dashboard/insights/page.tsx:295-301`
- **What the user sees:** On the mobile Insights "Categories" card, the six percentages always sum to exactly 100% — even for a user whose month has spending in ten categories. A user who spent $1,000 across ten categories, $200 of it on Groceries, is told **"Groceries 25%"** (because the top six only total $800), while the web dashboard on the same account says **20%**.
- **Root cause:** The denominator is computed *after* the list is truncated to six rows:

```ts
// apps/mobile/app/(tabs)/insights.tsx:246-251
    const rows = Object.values(byId).sort((a, b) => b.amount - a.amount).slice(0, 6)
    const total = rows.reduce((s, r) => s + r.amount, 0)
    return rows.map((r) => ({
      ...r,
      pct: total > 0 ? Math.round((r.amount / total) * 100) : 0,
    }))
```

  `rows` is already `.slice(0, 6)` on line 246, so `total` on line 247 is the **top-6 subtotal**, not the month's debit total. Every `pct` is inflated by `monthSpent / top6Subtotal`. The error is zero when the user has ≤6 spending categories (which is why it survived: the tester has 2) and grows with category diversity. The seeded category set is 20 entries (`supabase/migrations/004_default_categories.sql`), so any established user is above the threshold. Web computes the same figure correctly — `ninetyTotal` at `insights/page.tsx:297` sums **all** category totals before the share is taken.
- **Blast radius:** The mobile Insights Categories card, which is the primary breakdown surface on the platform the product actually ships to users. It also drives the bar widths (`barWidthPct` at `:400` normalises against `maxCatPct`), so the visual proportions are consistent with the wrong denominator rather than the real one. Cross-platform, it is one more figure that reads differently on phone and web for the same account and month.
- **Same defect elsewhere:** Grepped every `slice(0, N)` followed by a percentage or a total in `apps/mobile` and `apps/web/src`. Same shape — truncate-then-total — at `apps/web/src/components/lenses/Matrix.tsx:60-67` (see F37). **Not** present at `apps/web/src/app/dashboard/insights/page.tsx:297` (totals before slicing) or `:256-260` (top merchants are ranked but the bar normalises against `topMerchants[0]`, which is a max, not a total — a different issue, covered by F8).
- **Fix:** Compute the denominator over the full `monthDebits` set before truncating, and render the remainder honestly: `const monthTotal = monthDebits.reduce((s, tx) => s + aggAmount(tx), 0)` used for `pct`, plus an explicit "Other · N categories · $X" seventh row so the visible rows and the hero total reconcile. This falls out of the shared `summarize()` from F2 if that function returns `byCategory` in full and the UI does its own truncation for display only — which is the correct split of responsibilities and stops the next surface making the same mistake.
- **Regression test to add:** Ten categories totalling 1000 with Groceries at 200; assert the mobile Insights row for Groceries reports `pct === 20`, not 25.

### F37. The Matrix lens row labelled "Total" sums only the top-8 categories
- **Severity:** High
- **Status:** Newly discovered during verification
- **Where:** `apps/web/src/components/lenses/Matrix.tsx:60-67` (computation), `:224` (the literal label "Total"), `:226-243` (render)
- **What the user sees:** On Overview → Matrix, the bottom row is labelled **"Total"** and shows a per-month figure that is *smaller* than the "out" figure in the page header directly above it, for the same month, on the same page load. A user with spending in twelve categories sees a "Total" that silently omits four of them.
- **Root cause:** The category list is truncated to eight for legibility, and the totals row is then derived from the truncated list rather than from the full matrix:

```ts
// apps/web/src/components/lenses/Matrix.tsx:60-67
  const cats = [...allCats]
    .map((k) => ({ k, latest: matrix[k][months.length - 1] }))
    .sort((a, b) => b.latest - a.latest)
    .slice(0, 8)

  const max = Math.max(...cats.flatMap((c) => matrix[c.k]), 1)

  const totals = months.map((_, mi) => cats.reduce((s, c) => s + matrix[c.k][mi], 0))
```

  `matrix` holds every category (built at `:40-57`); `cats` is `.slice(0, 8)` at line 63; `totals` at line 67 reduces over `cats`, not over `matrix`. The truncation is sorted by **latest-month** spend, so a category that was large five months ago but small this month is dropped from *every* column of the totals row — the historical columns can be understated far more than the current one. The row is rendered under a header cell reading exactly `Total` (`:224`) in bold 800-weight ink, with no qualifier.

  Two compounding details: `.sort((a,b) => b.latest - a.latest)` reads `matrix[k][months.length - 1]`, which for the current (incomplete) month means ranking is done on a partial month; and the seeded category set is 20 entries (`supabase/migrations/004_default_categories.sql`), so exceeding eight is the normal state for an established user, not an edge case.
- **Blast radius:** The Matrix lens is one of the six Overview lenses, i.e. a default-reachable paid-product surface, and this is the only place in the app that prints a figure labelled "Total" that is not a total. It disagrees with the Overview KPI line rendered ~600px above it (`dashboard/page.tsx:106-112`), with the Cashflow lens's `totalOut` (`Cashflow.tsx:52`), and with the Treemap's `expenseTotal` (`Treemap.tsx:88`) — all four are the same conceptual number computed four ways on one page.
- **Same defect elsewhere:** Grepped every `.slice(` in `apps/web/src/components/lenses` and `apps/web/src/app/dashboard`, then checked each for a displayed total derived from the truncated set. Two instances: `Matrix.tsx:63,67` and `apps/mobile/app/(tabs)/insights.tsx:246-247` (F36). Truncated lists that do **not** claim a total — checked and clean: `MindMap.tsx:46` (`topN` helper, used for income/expense sub-nodes), `MindMap.tsx:104,108,604`, `Treemap.tsx:43-44` (`topItems`/`tailItems` — the tail is *kept* and rendered, not dropped), `Flow.tsx:46,117,174`, `insights/page.tsx:256-259` (top merchants; its bar normalises against `topMerchants[0]`, a max rather than a total — a separate issue covered by F8). Notably `Treemap.tsx` gets exactly this right by keeping a tail bucket, which is the pattern Matrix should copy.
- **Fix:** Compute `totals` from the **full** `matrix`, not from `cats` — `months.map((_, mi) => Object.values(matrix).reduce((s, row) => s + row[mi], 0))` — and add an explicit "Other (N categories)" row so the eight visible rows plus Other equal the Total. Do not "fix" this by relabelling the row "Top 8 total": the user's question when reading that row is "what did I spend", and every other surface on the page answers it with the real figure. Structurally this is the same lesson as F36 — the aggregation must be computed over the full set and truncation must be a rendering decision, which is exactly what routing this through the shared `summarize()` (F2) enforces.
- **Regression test to add:** Twelve categories with spend in a month; assert the Matrix "Total" cell for that month equals the sum of all twelve and equals the Overview header's "out" figure.

---

## Unverified suspicions

- **`transacted_at` string-format drift.** Locally-created rows store `new Date().toISOString()` (`"…T14:33:34.123Z"`); rows pulled from Supabase store PostgREST's `"…T14:33:34.567+00:00"` (`SyncManager.pullRemote` → `upsertTransaction`, no normalisation observed). `apps/mobile/app/(tabs)/insights.tsx:132` compares these lexicographically. I reasoned through the ordering and believe the two forms compare correctly for all practical values because the offset is always `+00:00`, with a theoretical break only for an instant exactly equal to a boundary with differing sub-second precision. I could not run the app to confirm the actual stored strings, so I have not filed it as a finding — but the mixed formats are a latent hazard worth normalising regardless.
- **`Intl` currency support for `XAF`.** `currencySymbolFor` returns `'CFA '` (`packages/shared/src/utils/currency.ts:37-38`) while `Money.tsx` and every web `fmt` helper pass the raw code to `Intl.NumberFormat({ style: 'currency', currency })`. I did not verify which glyph Node/Hermes/Safari actually produce for XAF, or whether the two paths agree; if they don't, an XAF user sees two different symbols on one screen.
- **Realtime re-fetch storms on Budgets.** `apps/web/src/app/dashboard/budgets/page.tsx:126-145` calls the full `load()` (four queries) on every `postgres_changes` event. During a mobile catch-up that generates several recurring rows in a burst, this could produce a flurry of full reloads and visibly unstable numbers. I did not measure it.
- **`useProfile` currency cache races.** `getCurrentProfileCurrency()` defaults to `'USD'` (`apps/mobile/src/services/profileCurrency.ts:22`). If a transaction is created before `useProfile` has loaded — plausible on a cold start into a Siri shortcut or notification-listener write — the FX snapshot would be computed against USD for a non-USD user and stored as if correct, with no NULL to trigger the backfill. I could not confirm the actual ordering of the shortcut/notification write paths against profile load.

---

## Refuted during verification

- **F15 — "One mobile screen mixes UTC-string and local-`Date` month boundaries in two adjacent cards" (was High).** Not a bug: the two windows are semantically identical. `sumDebits` (`apps/mobile/app/(tabs)/insights.tsx:128-134`) is handed `monthStart`/`monthEnd` built as **local** `Date`s (`:178-185`) and only calls `.toISOString()` on them, so comparing `transacted_at >= s && < e` is an instant comparison against local month bounds — exactly what `HistoryHeatmap`'s `d.getMonth()` bucketing (`HistoryHeatmap.tsx:19-21`) computes. Worked example, `TZ=America/Chicago`, transaction at `2026-08-01T01:00:00+00:00`: the hero's August bound is `2026-08-01T05:00:00.000Z`, so `01:00Z < 05:00Z` excludes it from August and the July window `[2026-07-01T05:00Z, 2026-08-01T05:00Z)` includes it — **July**; the heatmap's `new Date(...)` in CDT is Jul 31 20:00, `getMonth() === 6` — **July**. They agree. The finding's own Root-cause paragraph concedes the hero side is "correct" and then asserts a divergence that its own worked example refutes. The two *real* problems on that screen are already filed elsewhere: the hero uses `aggAmount` while the heatmap sums raw `amount` (F14), and the lexicographic comparison of mixed `…Z` / `…+00:00` ISO forms is fragile at an exact boundary (already recorded, correctly, under "Unverified suspicions" above).

---

**Verified:** every finding above was independently re-checked against the code on 2026-08-08.
