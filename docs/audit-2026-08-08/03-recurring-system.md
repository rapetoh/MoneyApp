# Recurring transactions system, end to end
**Audit date:** 2026-08-08 - **Scope:** Every code path that creates, stores, generates, detects, displays or totals a recurring rule across mobile, web, shared types, Postgres and the Edge Function - **Files examined:** 38

## Verdict

Not production-ready. The recurring subsystem is **non-functional end to end**, and I have the production Postgres log lines that prove exactly why: every attempt to create a `recurring_rules` row from mobile dies with `insert or update on table "recurring_rules" violates foreign key constraint "fk_template_txn"` — timestamped `2026-08-08T14:39:14.863Z` and `2026-08-08T14:54:11.348Z`, matching the Xtream and Charles Schwab transactions to the second. The rule insert races the offline-first sync queue and reaches Postgres before the transaction it points at does, the error is swallowed by a `console.warn`, and the user is shown a success screen with a recurring icon on a feature that never armed. That is the single worst problem.

The systemic cause is a **split-brain persistence model**: `transactions` are offline-first (SQLite → queue → Supabase, client-minted UUIDs), while `recurring_rules` are online-only, written straight to PostgREST with no local table, no queue, no version column and no error surface. Every recurring bug in this report traces back to that seam, or to its second-order consequence — because rules could never exist, none of the code that consumes them has ever executed against real data, so an entire layer of arithmetic (mixed-currency totals, income rules counted as spend, month-end date overflow, a calendar whose weekday header does not describe its own cells) has shipped unexercised. There are also three independent, divergent implementations of "next occurrence" and two of "detect a pattern"; the copies have already drifted in ways that produce different money on different screens.

Two defects here would post wrong money to the user's budget the day the headline bug is fixed (F2, F6), one blocks *every* transaction write for a full session on the first launch after upgrading from a pre-2026-07-23 build (F3), and one prints the wrong currency symbol on every amount the Recurring screen shows (F38). Fix F1 without fixing F2 and the app gets worse, not better.

## Findings summary

| # | Severity | Finding | Primary file |
|---|----------|---------|--------------|
| F1 | Critical | Rule creation always fails: `template_txn_id` FK violated because the transaction exists only in local SQLite (proven in prod logs) | `apps/mobile/src/hooks/useTransactions.ts` |
| F2 | Critical | `computeUpcomingRecurring` counts income (credit) rules as committed spend; onboarding creates exactly such a rule | `apps/mobile/src/hooks/useRecurringRules.ts` |
| F3 | Critical | `migrateSchema` table-swap drops the FX snapshot columns it just added; every transaction write in that session then throws | `apps/mobile/src/services/sync/localDb.ts` |
| F4 | High | Every rule mutation fails silently — `createRule` warns and returns null, callers ignore it | `apps/mobile/src/hooks/useRecurringRules.ts` |
| F5 | Medium | `recurring_rule_id` is never written back to the template transaction; the link is one-directional | `apps/mobile/app/(tabs)/record.tsx` |
| F6 | High | Recurring totals sum mixed currencies and mixed directions with no FX/direction normalization | `apps/web/src/app/dashboard/recurring/page.tsx` |
| F7 | High | Web Transactions SOURCE column is overwritten by `is_recurring`, destroying how the row was entered | `apps/web/src/app/dashboard/transactions/page.tsx` |
| F8 | High | Month-end overflow in next-occurrence math — Jan 31 monthly rule jumps to Mar 3. Triplicated | `apps/mobile/src/hooks/useRecurringRules.ts` |
| F9 | High | "Next 30 days" calendar header (M T W T F S S) does not describe its own cells — day 1 is always under Monday | `apps/web/src/app/dashboard/recurring/page.tsx` |
| F10 | High | Divergent duplicate: mobile accept sets `last_generated = now()`, web accept sets it to `lastSeenAt` | `apps/mobile/src/hooks/useRecurringRules.ts` |
| F11 | High | Web Recurring page is read-only and its empty-state promises a path that free users cannot reach | `apps/web/src/app/dashboard/recurring/page.tsx` |
| F12 | High | Accepting a pattern whose price changed back-generates duplicates of charges the user already logged | `apps/web/src/app/dashboard/recurring/page.tsx` |
| F13 | High | `runRecurringCatchUp` re-fires on every navigation, not on launch; concurrent runs race each other | `apps/mobile/app/_layout.tsx` |
| F14 | High | Supabase secret key (`sb_secret_*` format) stored in plaintext inside `cron.job.command` in the production database | `supabase/functions/generate-recurring/index.ts` |
| F15 | Medium | Edge Function generates at most one occurrence per rule per run; mobile generates all. Divergent recovery | `supabase/functions/generate-recurring/index.ts` |
| F16 | Medium | Migration 008's dedup index cannot see cross-timezone duplicates (server UTC vs device-local) | `supabase/migrations/008_recurring_dedup_constraint.sql` |
| F17 | Medium | Pattern detector requires exact-to-the-cent amounts; the doc comment claims a 1-cent tolerance it does not implement | `apps/mobile/src/services/recurringPatternDetector.ts` |
| F18 | Medium | Detector skips `is_recurring` rows, so a failed manual flag permanently suppresses auto-detection of that pattern | `apps/mobile/src/services/recurringPatternDetector.ts` |
| F19 | Medium | Detector has no cadence-consistency check; two charges 6 months apart become a "yearly subscription" | `apps/mobile/src/services/recurringPatternDetector.ts` |
| F20 | Medium | `getPeriodBounds('biweekly')` builds a window entirely in the past → upcoming recurring is always 0 | `apps/mobile/src/hooks/useRecurringRules.ts` |
| F21 | Medium | `getPeriodBounds('weekly')` corrupts the window when the week spans a month boundary | `apps/mobile/src/hooks/useRecurringRules.ts` |
| F22 | Medium | `computeUpcomingRecurring` counts only the next occurrence per rule — weekly rules undercount ~4× | `apps/mobile/src/hooks/useRecurringRules.ts` |
| F23 | Low | Monthly/annual roll-ups ignore `rule.interval` in all three implementations (latent — no writer ever sets `interval ≠ 1`) | `apps/web/src/app/dashboard/recurring/page.tsx` |
| F24 | Medium | Overdue rules render a next-charge date in the past, and sort as if imminent | `apps/web/src/app/dashboard/recurring/page.tsx` |
| F25 | Medium | `chargesIn30Days` safety cap of 60 makes long-overdue daily rules vanish from the calendar | `apps/web/src/app/dashboard/recurring/page.tsx` |
| F26 | Medium | MindMap's "Recurring outflow" counts only `frequency === 'monthly'` and includes credit rules | `apps/web/src/components/lenses/MindMap.tsx` |
| F27 | Medium | Rules are online-only in an offline-first app: no local table, no queue, no version, no soft delete | `apps/mobile/src/hooks/useRecurringRules.ts` |
| F28 | Medium | Mobile export omits recurring rules entirely; web export includes them | `apps/mobile/src/services/exportData.ts` |
| F29 | Medium | "Potential savings" headline counts all candidates but sums only monthly ones | `apps/web/src/app/dashboard/recurring/page.tsx` |
| F30 | Medium | Detector suppresses existing rules by exact `(name, amount)`; renaming re-suggests, unnamed rules suppress nothing, paused rules re-surface | `apps/mobile/src/services/recurringPatternDetector.ts` |
| F31 | Low | Web Recurring realtime channel is never unsubscribed — cleanup is returned from inside an async IIFE | `apps/web/src/app/dashboard/recurring/page.tsx` |
| F32 | Low | `starts_at` is never itself an occurrence — the first cycle is always skipped (latent — no writer ever leaves `last_generated` null) | `supabase/functions/generate-recurring/index.ts` |
| F33 | Low | Free users are told "No new patterns to review" when detection never ran | `apps/web/src/app/dashboard/recurring/page.tsx` |
| F34 | Low | Mobile Recurring screen lists paused rules under the "Active subscriptions" heading | `apps/mobile/app/recurring.tsx` |
| F35 | Low | `SafeToSpend.tsx` is dead code carrying a fourth copy of the committed-spend math | `apps/mobile/src/components/SafeToSpend.tsx` |
| F36 | Low | `RecurringToggle` frequency chips have no accessibility roles or labels | `apps/mobile/src/components/RecurringToggle.tsx` |
| F37 | Low | Duplicate `detail.recurring` key in **all four** locale files, not just `en.json` | `packages/shared/src/i18n/locales/*.json` |
| F38 | High | Mobile Recurring screen renders every amount with a hard-coded `$` glyph — a €12 rule reads "$12" | `apps/mobile/app/recurring.tsx` |

## Findings

### F1. Rule creation always fails: `template_txn_id` points at a transaction that only exists on the phone
- **Severity:** Critical
- **Status:** User-reported (root cause newly discovered and proven against production logs)
- **Where:**
  - `apps/mobile/src/hooks/useTransactions.ts:122-131` (the race)
  - `apps/mobile/src/hooks/useRecurringRules.ts:112-143` (`createRule`)
  - `apps/mobile/app/(tabs)/record.tsx:205-216` (voice save), `apps/mobile/app/(tabs)/record.tsx:294-305` (manual save)
  - `apps/mobile/app/(onboarding)/income.tsx:80-91`
  - `apps/mobile/app/(tabs)/index.tsx:142-154` (pattern-banner accept)
  - `apps/mobile/app/transaction/edit.tsx:164-175` (the one path that usually survives)
  - `supabase/migrations/001_initial_schema.sql:160-163` (`fk_template_txn`)
- **What the user sees:** They flip "Mark as recurring", pick a frequency, tap Save. The app returns to Today with no error. The transaction shows the repeat glyph. `More → Recurring` says "No recurring transactions". The web Recurring page says "No recurring rules yet". Nothing is ever generated next month. `public.recurring_rules` has zero rows for all six users.
- **Root cause:** `createTransaction` is offline-first. It mints a client UUID, writes it to SQLite, pushes a queue entry, kicks the drain **without awaiting it**, and returns that UUID as if it were a server row id:

  ```ts
  // apps/mobile/src/hooks/useTransactions.ts:122-131
  // Write to SQLite immediately (optimistic)
  await upsertTransaction(txn)
  await loadLocal()
  DataEvents.emitTransactions(userId)

  // Queue for Supabase sync
  await enqueue('create', txn.id, txn)
  syncManager.drainQueue()          // <-- not awaited

  return { id: clientId, error: null }
  ```

  The caller then immediately issues a *direct, online* insert into `recurring_rules` carrying that id:

  ```ts
  // apps/mobile/app/(tabs)/record.tsx:294-305
  if (!error && manualIsRecurring && txnId) {
    await createRule({ ..., template_txn_id: txnId })
  }
  ```

  Two independent HTTP requests are now in flight. The rule insert is issued first (the drain still has a SQLite read to do before it reaches its first network call — `SyncManager.drainQueue` → `getQueueEntries()` → `supabase.from('transactions').upsert(...)`), so PostgREST executes the rule insert against a database where the transaction row does not exist yet. `recurring_rules.template_txn_id` carries `FOREIGN KEY (template_txn_id) REFERENCES transactions(id) ON DELETE SET NULL` (`supabase/migrations/001_initial_schema.sql:160-163`, verified live on the production instance), so Postgres rejects it with SQLSTATE 23503.

  Production Postgres log, last 24h:

  ```
  ERROR  insert or update on table "recurring_rules" violates foreign key constraint "fk_template_txn"   2026-08-08T14:39:14.863Z
  ERROR  insert or update on table "recurring_rules" violates foreign key constraint "fk_template_txn"   2026-08-08T14:54:11.348Z
  ```

  `transactions.transacted_at` for the Xtream row is `2026-08-08 14:39:14+00` and for the Charles Schwab row `2026-08-08 14:54:10+00`. The two errors are those two saves. This is not a theory.
- **Blast radius:** The entire recurring feature. `recurring_rules` is empty → the Edge Function's daily run returns `{"generated":0,"errors":0,"checked":0}` (verified in `net._http_response`) → nothing is ever auto-generated → `computeUpcomingRecurring` returns 0 so Safe-to-Spend and the Budgets ring over-report available money → `apps/mobile/app/recurring.tsx` and `apps/web/src/app/dashboard/recurring/page.tsx` are permanently empty → Ask Murmur receives `recurring_rules: []` (`apps/web/src/app/dashboard/ask/page.tsx:223-230`, `apps/mobile/app/more/ask-result.tsx:102-110`) and will confidently answer "you have no subscriptions" → `packages/ai/src/advisor.ts:50-54` builds an empty `recurring_expenses` for the advisor → the web sidebar's Recurring badge (`apps/web/src/app/dashboard/layout.tsx:14-23`) never appears. The paid tier advertises "Recurring subscription detection" (`packages/shared/src/i18n/locales/en.json:423`) against a dead subsystem.
- **Same defect elsewhere:** Every call site that hands a freshly-created local transaction id to a *server-only* table has the same shape. Grepped `createRule(`, `template_txn_id`, `createTransaction(` — the complete set of `createRule` call sites in the repo is five:
  - `apps/mobile/app/(tabs)/record.tsx:206` and `:295` — both fail, always.
  - `apps/mobile/app/(onboarding)/income.tsx:81` — fails, always. Every user who typed an income during onboarding lost their income rule; the comment at `:75-79` claims this path was *fixed* to avoid orphans, and it introduced the FK race instead.
  - `apps/mobile/app/(tabs)/index.tsx:143` — the pattern-banner accept passes `c.templateTxnId`, an *older* transaction that is normally already synced, so this path usually survives — unless the anchor transaction is still queued (user was offline when it was logged).
  - `apps/mobile/app/transaction/edit.tsx:165` — same, usually survives.
  - `apps/web/src/app/dashboard/recurring/page.tsx:238-254` — web has no local-first layer, so its `template_txn_id` is always a real server row. Web is not affected by the race, only by everything downstream of it.
- **Fix:** Architectural, not a patch. Do **not** "await drainQueue first" — that reintroduces an online dependency into an offline-first flow and still fails on a plane. The correct architecture is to make `recurring_rules` a first-class offline-first entity, exactly like `transactions`:
  1. Add a `recurring_rules` table to `apps/mobile/src/services/sync/localDb.ts` with the same sync contract (`client_id`, `version`, `is_deleted`, `synced_at`) and add `updated_at`/`version`/`is_deleted` columns to the Postgres table (new migration 013).
  2. Extend `syncQueue`/`SyncManager` to handle `entity_type = 'recurring_rule'` (the `sync_operations` CHECK at `001_initial_schema.sql:217` already lists `'recurring_rule'` as a legal value — verified) and **drain in insertion order across entity types**, so the transaction upsert provably precedes the rule insert that references it.
  3. Rules become readable offline, which also fixes F27 and the always-0 Safe-to-Spend deduction.
  If the owner wants a smaller first step that is still not a workaround: create the rule *first*, without `template_txn_id`, then set `template_txn_id` and the transaction's `recurring_rule_id` from the sync manager once the transaction upsert succeeds. That preserves referential integrity in both directions and removes the race entirely — but it still leaves rules unavailable offline.
- **Regression test to add:** Integration test: with the network stubbed to a 300 ms delay, call `handleManualSave` with `manualIsRecurring = true`, then assert that after the queue drains, `recurring_rules` contains exactly one row whose `template_txn_id` equals the transaction id and whose `id` equals the transaction's `recurring_rule_id`.

---

### F2. Income rules are counted as committed spend against the budget
- **Severity:** Critical
- **Status:** Newly discovered
- **Where:**
  - `apps/mobile/src/hooks/useRecurringRules.ts:64-79` (`computeUpcomingRecurring`)
  - `apps/mobile/app/(tabs)/budgets.tsx:75-80` (`spent = periodSpend + upcomingRecurring` at `:80`)
  - `apps/mobile/app/(tabs)/index.tsx:174-178` (`leftThisPeriod` at `:178`)
  - `apps/mobile/app/(onboarding)/income.tsx:81-91` (creates the credit rule; `direction: 'credit'` at `:85`)
- **What the user sees:** A user with a $2,000 monthly budget who entered a $4,000 salary during onboarding opens Budgets and sees the ring pinned at "over budget" with roughly $4,000+ of spending they never did, and Today's "left this month" reads $0. Currently masked only because F1 prevents the salary rule from ever being created — the moment F1 is fixed, this fires for every user who completed onboarding with an income.
- **Root cause:** The reducer filters on `is_active` and nothing else. `direction` is not consulted:

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

  and the consumer treats the result as spend:

  ```ts
  // apps/mobile/app/(tabs)/budgets.tsx:80
  const spent = periodSpend + upcomingRecurring
  ```

  Onboarding deliberately creates a `direction: 'credit'` rule (`income.tsx:85`), so the sign is inverted for the single largest rule most users will ever have.
- **Blast radius:** Budgets ring (over/tight/remaining state, the `spent / limit > 0.92` warning), Today's "left this month" headline, and any future consumer of `computeUpcomingRecurring`. It also poisons the mental model: the number is labelled "upcoming recurring" but is really "sum of the next occurrence of every rule regardless of sign".
- **Same defect elsewhere:** Direction-blind recurring aggregation exists in five places. Grepped `is_active`, `monthlyEquivalent`, `TO_MONTHLY`, `r\.amount`, `rule\.amount` across every file that reads `recurring_rules`:
  - `apps/mobile/app/recurring.tsx:95-99` — `monthlyTotal`, and `:100` `yearlyProjection`, rendered under "Paid monthly" and "That's $X a year in subscriptions".
  - `apps/web/src/app/dashboard/recurring/page.tsx:273-274` — `monthlyTotal` / `annualTotal` under the "Monthly" and "Annual cost" stats.
  - `apps/web/src/app/dashboard/recurring/page.tsx:303` — `totalCharges` in the "$X in charges hit before …" calendar footer.
  - `apps/web/src/app/dashboard/recurring/page.tsx:308` — `heaviestEntry`'s per-day sum, which drives the "Heaviest day" footer.
  - `apps/web/src/components/lenses/MindMap.tsx:96-98` — `recurringMonthly`, labelled "Recurring outflow".
  Only the per-row renderers get the sign right (`recurring/page.tsx:475`, `:523`); mobile's per-row renderer (`recurring.tsx:233`) does not — it renders `rule.amount` unsigned regardless of direction, so a salary rule reads as a charge there too.
- **Fix:** `computeUpcomingRecurring` must filter `r.direction === 'debit'`. Better: move it into `packages/shared` as a single `recurringOutflowInWindow(rules, start, end, profileCurrency)` used by mobile Budgets, mobile Today, mobile Recurring, web Recurring and MindMap, so the direction and currency rules are decided once. The four copies above are the disease; deleting three of them is the fix.
- **Regression test to add:** `computeUpcomingRecurring([{direction:'credit', amount:4000, frequency:'monthly', is_active:true, ...}], 'monthly')` must return 0.

---

### F3. The local-DB migration drops the FX snapshot columns it just added, breaking every write for one session
- **Severity:** Critical
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/services/sync/localDb.ts:85-90` (adds the columns), `:100-145` (destroys them)
- **What the user sees:** On the first launch after upgrading from a build that predates commit `67b3858` (Jul 23 2026 — the one that loosened `payment_method`), *every* transaction write fails for the whole session. Tapping Save on Record spins forever and nothing is stored: `upsertTransaction` rejects before `enqueue` is reached, `createTransaction`'s promise rejects, and `handleManualSave` never reaches `setManualSaving(false)`. `pullRemote` also cannot write server rows into SQLite, so the Today list stays at whatever was already local. Killing and relaunching the app fixes it permanently — the columns are re-added and the swap does not run a second time.
- **Root cause:** `migrateSchema` reads `PRAGMA table_info` once at `:72`, adds the FX columns at `:85-90`, then rebuilds the table from a hard-coded column list that omits them:

  ```ts
  // apps/mobile/src/services/sync/localDb.ts:85-90
  for (const col of ['amount_in_profile_currency', 'fx_rate_to_profile', 'fx_rate_date']) { ... ADD COLUMN ... }

  // apps/mobile/src/services/sync/localDb.ts:105-139
  CREATE TABLE transactions_new (
    id TEXT PRIMARY KEY, ..., payment_method TEXT,
    transacted_at TEXT NOT NULL, ...          -- no fx columns
  );
  INSERT INTO transactions_new SELECT
    id, user_id, amount, direction, currency_code, category_id,
    merchant, merchant_domain, note, payment_method, transacted_at, ...
  FROM transactions;
  DROP TABLE transactions;
  ALTER TABLE transactions_new RENAME TO transactions;
  ```

  `upsertTransaction` (`transactionStore.ts:52-56`, the `INSERT INTO transactions (…)` column list) binds `amount_in_profile_currency`, `fx_rate_to_profile` and `fx_rate_date`, so for the remainder of that session every insert throws `table transactions has no column named amount_in_profile_currency`. `createTransaction`, `pullRemote` and `runRecurringCatchUp` all write through that function.

  The guard at `:100-101` (`pm.notnull === 1 || pm.dflt_value !== null`) reads the *stale* `tableInfo` snapshot, so the swap fires exactly once, only on a database created by a build whose `initSchema` declared `payment_method TEXT NOT NULL DEFAULT 'cash'` — confirmed present in `git show b2573aa:apps/mobile/src/services/sync/localDb.ts`. Fresh installs are unaffected; the second launch after the upgrade re-adds the columns and the swap condition is now false.
- **Blast radius:** All transaction writes for one session, including the recurring catch-up loop (`recurringCatchUp.ts:115`), which has no try/catch and is invoked fire-and-forget from `_layout.tsx:99` — so the rejection is unhandled and catch-up silently aborts partway through. The abort is at least ordered safely: `recurringCatchUp.ts:126-130` persists `last_generated` *after* the local insert, so a throw at `:115` leaves `last_generated` un-advanced and the occurrence is retried next launch. But every rule after the failing one in the loop is skipped entirely.
- **Correction to the original claim:** this does **not** destroy FX history. The FX `ADD COLUMN` loop and the table swap were introduced by the *same* commit (`67b3858`), so any database that satisfies the swap condition necessarily has all-NULL FX columns — there is no populated FX data to lose. `runFxBackfill` repopulates on the next launch. The finding remains Critical solely because the core "log an expense" flow silently cannot complete for a full session.
- **Same defect elsewhere:** None found — this is the only table-swap in the codebase (grepped `transactions_new`, `RENAME TO`, `DROP TABLE`). But the same class of bug (schema rebuild from a hard-coded column list) will recur on the next column addition unless the list is generated.
- **Fix:** Build `transactions_new` from the same canonical column definition used by `initSchema`, and copy with an explicit list derived from `PRAGMA table_info(transactions)` intersected with the new schema. Re-read `table_info` after each DDL step instead of reusing the stale snapshot taken at `:72`. Simplest correct form: move the payment_method loosening *before* the FX `ADD COLUMN` loop and include the FX columns in `transactions_new`.
- **Regression test to add:** Create a SQLite DB with the pre-`67b3858` schema (`payment_method TEXT NOT NULL DEFAULT 'cash'`, no FX columns), run `getDb()`, then assert `PRAGMA table_info(transactions)` contains all three FX columns and that a full `upsertTransaction` round-trip succeeds in the *same* session.

---

### F4. Every recurring-rule mutation fails silently
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/hooks/useRecurringRules.ts:133-140`, `:145-148`, `:150-153`, `:155-173`; call sites `record.tsx:206`, `record.tsx:295`, `income.tsx:81`, `edit.tsx:165`, `edit.tsx:177`, `edit.tsx:179`; `apps/web/src/app/dashboard/recurring/page.tsx:234-256`, `:265-268`
- **What the user sees:** Nothing. That is the bug. F1 has been failing for every user since the feature shipped and the app has never once said so.
- **Root cause:** `createRule` degrades a hard failure into a dev-console line and a null return:

  ```ts
  // apps/mobile/src/hooks/useRecurringRules.ts:133-140
  if (error) {
    console.warn('[useRecurringRules] createRule failed:', error)
    return null
  }
  ```

  Of the five callers, only `acceptPattern` (`index.tsx:154`) inspects the return value, and it uses it merely to decide whether to pin a dismissal. `record.tsx`, `income.tsx` and `edit.tsx` all `await createRule(...)` and discard the result, then navigate away showing success. `toggleRule` (`:146`), `deleteRule` (`:151`) and `updateRule` (`:171`) do not even capture `error`. On web, `acceptCandidate` (`:238`) and `toggleActive` (`:266`) discard the PostgREST error identically.
- **Blast radius:** Any rule mutation — pause, resume, delete, amount change, frequency change — can no-op while the UI re-renders optimistically from a refetch that returns the unchanged server state. Combined with F1, this converted a Critical data bug into an invisible one for months. The one surface that *does* check the return value fails silently too: `RecurringPatternBanner.handleAccept` (`apps/mobile/src/components/RecurringPatternBanner.tsx`) calls `onAccept(candidate)`, and when it resolves `false` it simply clears the spinner and leaves the banner on screen with no message — so on the Today screen "Set up" is a button that visibly does nothing, every time.
- **Same defect elsewhere:** Grepped for `await supabase.from(` with no `error` destructure inside the recurring surface: `useRecurringRules.ts:146`, `:151`, `:171`; `recurringCatchUp.ts:65-68`, `:127-130` (the `last_generated` writes — if these fail the next launch replays the same occurrence); `apps/web/src/app/dashboard/recurring/page.tsx:238`, `:266`.
- **Fix:** `createRule`/`updateRule`/`deleteRule`/`toggleRule` must return `{ data, error }` and every call site must surface the error to the user (`Alert.alert` on mobile, the existing `formError` pattern on web). The recurring toggle in the save flow must not be treated as best-effort decoration: if the rule cannot be created, the save is not complete and the user must be told.
- **Regression test to add:** Mock the `recurring_rules` insert to return a PostgREST error and assert `handleManualSave` shows an error alert and does not navigate away.

---

### F5. `recurring_rule_id` is never written back to the template transaction
- **Severity:** Medium *(downgraded from High during verification — every consumer has a working `template_txn_id` fallback, and the "duplicate on the template's own day" scenario turns out not to be reachable; see Blast radius)*
- **Status:** User-reported (the Xtream row has `is_recurring=true`, `recurring_rule_id=NULL`)
- **Where:** `apps/mobile/app/(tabs)/record.tsx:205-216`, `:294-305`; `apps/mobile/app/(onboarding)/income.tsx:80-91`; `apps/mobile/app/transaction/edit.tsx:164-175`; `apps/mobile/app/(tabs)/index.tsx:142-154`; `apps/web/src/app/dashboard/recurring/page.tsx:238-254`
- **What the user sees:** Even in the (currently impossible) success case, the transaction keeps `recurring_rule_id = NULL`. The detail screen has to guess which rule owns the row, and any code that joins transactions to rules by id finds nothing.
- **Root cause:** The link is created in one direction only. `createRule` writes `template_txn_id → transaction`, and no caller ever performs the reciprocal `UPDATE transactions SET recurring_rule_id = <rule.id>`. Grep confirms the only writers of `recurring_rule_id` are the generators:
  - `apps/mobile/src/services/recurringCatchUp.ts:103` (`recurring_rule_id: rule.id`)
  - `supabase/functions/generate-recurring/index.ts:175`
  Both set it on *generated occurrences*, never on the template.

  The consuming code has been patched around this instead of fixed. `transaction/[id].tsx:217` searches by `template_txn_id`:
  ```ts
  const linkedRule = txn.is_recurring ? rules.find((r) => r.template_txn_id === txn.id) ?? null : null
  ```
  and `transaction/edit.tsx:103-106` carries a two-branch fallback with a comment naming it "the LOGIC §3.3 bug". That fallback is the patch-stacking the owner has rejected; the correct fix is the missing write.
- **Blast radius:** (a) Migration 008's dedup index is `WHERE recurring_rule_id IS NOT NULL`, so the template transaction is invisible to it. **Verified not currently exploitable:** both rule-creating paths anchor `last_generated` at or after the template's date (`useRecurringRules.ts:126` = `now()`; `recurring/page.tsx:251` = `c.lastSeenAt`), so the first generated occurrence is always a full cycle later than the template and can never collide with it. It becomes reachable the moment any path creates a rule with `last_generated` earlier than the template's `transacted_at`. (b) `ON DELETE SET NULL` on `fk_template_txn` means deleting the template transaction silently orphans the rule instead of cascading intent. (c) Deleting a rule leaves `is_recurring = true` on the transaction forever (a permanent "ghost recurring" row), which then suppresses pattern detection for that merchant (see F18); the reciprocal `ON DELETE SET NULL` on `transactions.recurring_rule_id` (`001_initial_schema.sql:136`) also strips every generated occurrence of its provenance and drops it out of the dedup index.
- **Same defect elsewhere:** Every rule-creating path listed under "Where". None of the five writes back.
- **Fix:** Make rule creation and the transaction link one atomic unit. Under the offline-first architecture from F1, the rule's `client_id` is known before either write, so `createTransaction` can set `recurring_rule_id` inline and the queue can push both rows in order. Server-side, add a `BEFORE INSERT` guard or a `create_recurring_rule(txn_id, ...)` RPC that performs both writes in one transaction. Then delete the `template_txn_id`-fallback branches in `[id].tsx:217` and `edit.tsx:103-106`.
- **Regression test to add:** After marking a transaction recurring, assert `transactions.recurring_rule_id = recurring_rules.id` AND `recurring_rules.template_txn_id = transactions.id` for the same pair.

---

### F6. Recurring totals sum mixed currencies and mixed directions
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/recurring/page.tsx:97-117`, `:273-274`, `:303`; `apps/mobile/app/recurring.tsx:27-34`, `:95-100`; `apps/web/src/components/lenses/MindMap.tsx:96-98`
- **What the user sees:** A user with a €12/mo rule and a $15/mo rule sees "Monthly $27" — a number that is neither. Add the onboarding salary rule and the same figure reads "$4,027 · Annual cost $48,324" under a heading that says "in subscriptions".
- **Root cause:** The roll-ups reduce over `r.amount`, which is denominated in `r.currency_code`, and format the result in the *profile* currency:

  ```ts
  // apps/web/src/app/dashboard/recurring/page.tsx:273-274
  const monthlyTotal = active.reduce((sum, r) => sum + monthlyEquivalent(r), 0)
  const annualTotal = active.reduce((sum, r) => sum + annualEquivalent(r), 0)

  // apps/web/src/app/dashboard/recurring/page.tsx:277-280 — formatted in the PROFILE currency
  const currency = profile?.currency_code ?? 'USD'
  const locale = profile?.locale ?? 'en'
  const fmtShort = (v: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(v)
  ```

  `recurring_rules` has no FX snapshot columns at all (verified against the live schema: `id, user_id, template_txn_id, name, amount, currency_code, category_id, frequency, interval, starts_at, ends_at, last_generated, is_active, created_at, direction, payment_method, note`), so there is nothing to convert with. This directly contradicts the project's own stated rule in `apps/web/src/components/lenses/types.ts:5-9`: *"All aggregations should use `amount_in_profile_currency` … never for summing."* Transactions obey it; rules were never given the machinery to.
- **Blast radius:** Every headline number on both Recurring screens, the calendar footer, the MindMap "Recurring outflow" node, and (once F1 is fixed) the Safe-to-Spend deduction.
- **Same defect elsewhere:** Grepped `r\.amount`, `rule\.amount`, `c\.amount`, `monthlyEquivalent`, `annualEquivalent`, `TO_MONTHLY` across every file that reads `recurring_rules`: `recurring/page.tsx:273`, `:274`, `:303`, `:308`, `:328`; `recurring.tsx:98`; `MindMap.tsx:98`; `useRecurringRules.ts:76`. Eight sites, four files, three platforms — all summing raw `amount`. (Note `MindMap.tsx:97` is the `.filter(...)` line; the reduce is at `:98`.)
- **Fix:** Add `amount_in_profile_currency`, `fx_rate_to_profile`, `fx_rate_date` to `recurring_rules` (migration 013) and snapshot them on rule creation exactly as `snapshotFx` does for transactions (`packages/shared/src/utils/fx.ts`). Then export one `aggRuleAmount(rule)` helper from `packages/shared` alongside the existing `aggAmount`, and route all eight sites through it. Do not sum `r.amount` anywhere.
- **Regression test to add:** Two active rules — €10/mo and $10/mo with profile currency USD — must produce a monthly total that is not exactly 20.

---

### F7. Web Transactions destroys the SOURCE column by overwriting it with `is_recurring`
- **Severity:** High
- **Status:** User-reported
- **Where:** `apps/web/src/app/dashboard/transactions/page.tsx:64-70` (`classifySource`), `:74-77` (`matchesFilter`), `:417-429` (subtitle counts), `:677`, `:731` (`SourceChip` call sites), `:757-787` (`SourceChip` itself)
- **What the user sees:** The Xtream row's SOURCE column reads "Recurring" although `transactions.source = 'manual'` in the database — and `'recurring'` is not even a legal value of the column's CHECK constraint. The user has no way to tell whether a row was spoken, typed, scanned or generated.
- **Root cause:** The classifier short-circuits on a property that is not the source:

  ```ts
  // apps/web/src/app/dashboard/transactions/page.tsx:64-70
  function classifySource(t: Txn): 'voice' | 'apple-pay' | 'typed' | 'recurring' {
    // Recurring takes precedence — it's the most useful chip on a row
    // that's both recurring and (e.g.) voice-logged.
    if (t.is_recurring || t.source === 'recurring_generated') return 'recurring'
    if (t.source === 'voice') return 'voice'
    if (t.source === 'shortcut' || t.source === 'notification_listener') return 'apple-pay'
    return 'typed'
  }
  ```

  The comment states the intent explicitly and it is the wrong intent: a *column called Source* must report the source. The recurring fact is already displayed on the same row — `:719` renders `<Icon.recurring/>` next to the merchant name — so the chip is not adding information, it is deleting it.

  The same function also collapses `'scan'` and `'manual'` into the identical "Typed" chip (the fallback return at `:782-787`), so a photographed receipt is indistinguishable from a hand-typed row, and `'recurring_generated'` is folded into the same bucket as a manual row the user happened to flag.
- **Blast radius:** The Source column, the `Voice / Apple Pay / Recurring` filter chips (`matchesFilter` at `:74-77` routes every non-`all`, non-`income` filter through `classifySource`, so filtering by "Voice" hides every voice transaction the user marked recurring), and the subtitle counts computed at `:417-429` and rendered at `:501-502` (`counts.voice` under-reports, `counts.recurring` over-reports).
- **Same defect elsewhere:** **Mobile does not have this bug.** `apps/mobile/src/components/TransactionRow.tsx:51-52, 74-89` renders the mic glyph and the repeat glyph as two independent indicators, and `apps/mobile/app/transaction/[id].tsx:93-104` (`humanSource`) maps all six enum values faithfully, including `'scan'` and `'recurring_generated'`. Grepped `classifySource`, `source ===`, `SourceChip` across `apps/web` — the only occurrence is this file.
- **Fix:** Split the concerns. `classifySource` must map `source` 1:1 to a chip (Voice / Typed / Scanned / Apple Pay / Auto-generated) with no reference to `is_recurring`. Keep the recurring glyph at `:719` as the recurring indicator, and change the `recurring` *filter* predicate to test `t.is_recurring` directly rather than routing through the classifier. Mirror mobile's `humanSource` mapping so the two platforms name the same thing the same way — ideally by lifting `humanSource` into `packages/shared`.
- **Regression test to add:** A row with `source: 'manual', is_recurring: true` must render the SOURCE chip as "Typed" and still show the recurring glyph; a row with `source: 'scan'` must render "Scanned".

---

### F8. Month-end overflow in next-occurrence math, triplicated
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/hooks/useRecurringRules.ts:42-60`; `supabase/functions/generate-recurring/index.ts:40-58`; `apps/web/src/app/dashboard/recurring/page.tsx:43-72`
- **What the user sees:** Rent due on the 31st generates on Mar 3 instead of Feb 28, and every subsequent month thereafter lands on the 3rd. A rule created Jan 29-31 permanently loses its day-of-month after the first February.
- **Root cause:** All three copies use `Date.prototype.setMonth`, which overflows rather than clamping:

  ```ts
  // apps/mobile/src/hooks/useRecurringRules.ts:53
  case 'monthly':   next.setMonth(next.getMonth() + rule.interval); break
  ```

  Confirmed by execution: `const d = new Date('2026-01-31T12:00:00Z'); d.setMonth(d.getMonth() + 1)` → `2026-03-03T12:00:00.000Z`. `quarterly` (`+3 months`) and `yearly` (Feb 29 → Mar 1) have the same defect.
- **Blast radius:** Wrong generation dates server-side, wrong "Next due" on mobile, wrong "Next charge" and wrong calendar-cell placement on web. Because the rule then advances from the *drifted* `last_generated`, the error is permanent, not self-correcting.
- **Same defect elsewhere:** Exhaustively — `grep -rn "setMonth(\|setFullYear(" apps packages supabase` returns exactly 14 hits repo-wide, and the affected ones are:
  - `apps/mobile/src/hooks/useRecurringRules.ts:53-55` (`computeNextOccurrence`)
  - `supabase/functions/generate-recurring/index.ts:51-53` (`computeNext`)
  - `apps/web/src/app/dashboard/recurring/page.tsx:61-67` (`nextOccurrence`)

  **Not** affected, contrary to an earlier draft of this finding: `useRecurringRules.ts:23-24`, `:27-28`, `:32` (`getPeriodBounds`). Those all use the two-argument `setMonth(month, day)` form, which sets the day explicitly and therefore cannot overflow — `end.setMonth(end.getMonth() + 1, 0)` is the standard "last day of this month" idiom and is correct. `getPeriodBounds` has real bugs, but they are F20 and F21, not this one.

  Three byte-for-byte-equivalent copies of the same next-occurrence function is itself the finding: any fix applied to one will not reach the other two.
- **Fix:** Delete all three. Export one `computeNextOccurrence(rule, from?)` from `packages/shared/src/utils/recurrence.ts`, clamp the day-of-month (`Math.min(anchorDay, daysInTargetMonth)`), and have mobile, web and the Edge Function import it. The Edge Function can import from `packages/shared` via a relative path or a small vendored copy generated at deploy time — but there must be exactly one authoritative implementation, and the rule must carry its anchor day-of-month rather than re-deriving it from a drifting `last_generated`.
- **Regression test to add:** A monthly rule with `last_generated = 2026-01-31` must produce `2026-02-28`, then `2026-03-31`, then `2026-04-30` — never `2026-03-03`.

---

### F9. The "Next 30 days" calendar's weekday header does not describe its own cells
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/recurring/page.tsx:120-140` (`chargesIn30Days`), `:563-605` (the grid), `:293-300` (`chargesByDay`, keyed on the offset integer)
- **What the user sees:** A 7-column grid headed `M T W T F S S`, with cell "1" always in the Monday column no matter what day it actually is. On Saturday 2026-08-08, "today" is rendered under Monday and a charge shown in the "F" column is actually a Tuesday. The user plans around which day money leaves their account; the grid tells them the wrong weekday for every charge.
- **Root cause:** The cells are day-*offsets*, not dates, but they are laid out under weekday headings:

  ```tsx
  // apps/web/src/app/dashboard/recurring/page.tsx:563-579
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => ( ... ))}
    {Array.from({ length: 30 }).map((_, i) => {
      const day = i + 1
      const items = chargesByDay[day]
  ```

  and `chargesIn30Days` produces exactly that offset:

  ```ts
  // apps/web/src/app/dashboard/recurring/page.tsx:132-133
  const dayOffset = Math.round((nxt.getTime() - today.getTime()) / 86_400_000)
  out.push({ day: dayOffset + 1, rule: r })
  ```

  Nothing in the layout consults `today.getDay()` — `getDay` appears nowhere in the file. Cell `n` is "n-1 days from now" and lands in column `(n-1) % 7`, which coincides with the header only when today is a Monday. The cell label `{day}` (`:596`) is also the offset (1..30), so it does not even match a day-of-month — a user reading "8" will assume the 8th.
- **Blast radius:** The whole right-rail calendar and its footer ("Heaviest day: Aug 14" *is* computed correctly at `:316-323` — it converts the offset back to a real date via `d.setDate(d.getDate() + heaviestEntry.day - 1)` — which makes the mismatch with the grid worse: the two halves of the same card disagree about what "day 14" means).
- **Same defect elsewhere:** The Transactions/Overview calendar lens has a documented sibling of this bug (per the audit brief: "1" rendered in the FRI column for Sat Aug 1). Grepped `repeat(7, 1fr)` and `'M', 'T', 'W'` across `apps/web`:
  - `apps/web/src/app/dashboard/recurring/page.tsx:563-564` (this finding — the only occurrence inside the recurring surface)
  - `apps/web/src/components/lenses/` — the calendar lens builds its own grid; out of this audit's scope but it is the same class and should be fixed in the same pass.
- **Fix:** Render real dates. Build the 30 cells as `Date` objects from `today`, pad the leading cells so the first date falls under its true weekday column, label each cell with `getDate()`, and key `chargesByDay` on an ISO `YYYY-MM-DD` string instead of an offset integer. Either that, or drop the weekday header entirely and label the strip "next 30 days" — but a weekday header that lies is worse than none.
- **Regression test to add:** Render the calendar with a fixed clock of Saturday 2026-08-08 and assert the cell labelled `8` sits in the Saturday column and carries the date 2026-08-08.

---

### F10. Divergent duplicate: accepting the same detected pattern schedules different dates on mobile and web
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/hooks/useRecurringRules.ts:125-126` vs `apps/web/src/app/dashboard/recurring/page.tsx:237` and `:249-251`
- **What the user sees:** The same "Netflix looks recurring" suggestion, accepted on the phone versus accepted on the desktop, produces rules with different next-charge dates and different generation behaviour. On web, occurrences may be back-generated immediately; on mobile, the first occurrence is pushed a full cycle into the future.
- **Root cause:** Mobile hard-codes the anchor to *now*, ignoring the candidate's actual last-seen date, which the detector went to the trouble of computing (`recurringPatternDetector.ts:147`):

  ```ts
  // apps/mobile/src/hooks/useRecurringRules.ts:125-126
  starts_at: new Date().toISOString(),
  last_generated: new Date().toISOString(), // treat creation as first generation
  ```

  Web anchors to the real observation:

  ```ts
  // apps/web/src/app/dashboard/recurring/page.tsx:249-251
  starts_at: startsAt,
  ends_at: null,
  last_generated: c.lastSeenAt,
  ```

  `createRule`'s params type (`useRecurringRules.ts:100-110`) declares only `name`, `amount`, `currency_code`, `category_id`, `direction`, `payment_method`, `note`, `frequency`, `template_txn_id` — no `last_generated` and no `starts_at` — so the mobile pattern-banner path (`index.tsx:143-153`) physically cannot pass `c.lastSeenAt` through.
- **Blast radius:** Next-charge dates, the 30-day calendar, Safe-to-Spend deductions, and — because `last_generated` drives generation — *whether a transaction is created at all* in the current cycle. Two devices, same user, same tap, different money.
- **Same defect elsewhere:** The `last_generated` semantics diverge in a third place: `recurringCatchUp.ts:64-68` sets `last_generated` to a skipped occurrence's date, while `generate-recurring/index.ts:191-194` sets it to the generated occurrence's date. Those two agree; only the creation anchor diverges.
- **Fix:** Extend `createRule`'s params with `starts_at` and `last_generated` and have both accept-paths pass `candidate.lastSeenAt`. Then move rule creation itself into `packages/shared` (`buildRuleFromCandidate(candidate, userId)`) so there is one place that decides what a rule's anchor means. The web file's own header comment on the detector — *"If the mobile detector is updated, copy the change over here"* — is an admission that this class of drift is expected; that instruction should be replaced by a shared module, not honoured.
- **Regression test to add:** `buildRuleFromCandidate` fed the same candidate must produce byte-identical `starts_at`/`last_generated`/`frequency` regardless of platform.

---

### F11. The web Recurring page is read-only, and its empty state promises a path that is not reachable
- **Severity:** High
- **Status:** User-reported (empty-state copy)
- **Where:** `apps/web/src/app/dashboard/recurring/page.tsx:338-341` (disabled Add button), `:441-444` (empty copy), `:225-232` (Plus gate), `:265-268` (`toggleActive` — the only mutation available)
- **What the user sees:** "No recurring rules yet. Mark a transaction as recurring on mobile or accept a detected pattern." Marking on mobile does not work (F1). Accepting a detected pattern requires Plus *and* at least two same-merchant, same-cent debits at least 21 days apart. "Add manually" is rendered disabled with `title="Coming soon"`. There is no third option.
- **Root cause:**

  ```tsx
  // apps/web/src/app/dashboard/recurring/page.tsx:338-341
  <button style={styles.addBtn} type="button" disabled title="Coming soon">
    <Icon.plus color="#fff" size={12} />
    Add manually
  </button>
  ```

  ```ts
  // apps/web/src/app/dashboard/recurring/page.tsx:225-232
  const candidates = useMemo<RecurringPatternCandidate[]>(() => {
    if (!isPlus) return []
    return detectRecurringPatterns({ ... })
  }, [transactions, rules, dismissed, isPlus])
  ```

  Beyond `toggleActive` there is no edit affordance at all: amount, frequency, `ends_at`, category and name are immutable on web, and the web transaction form (`transactions/page.tsx:261-300` `handleFormSave`; the `shared` payload at `:282-290` carries amount / direction / merchant / note / category_id / payment_method / transacted_at and nothing else) does not expose `is_recurring` either. The page is a viewer for data no path can produce.
- **Blast radius:** Desktop is a paid tier (`en.json:423` "Recurring subscription detection", `settings/page.tsx:466` "Murmur Plus unlocks Ask Murmur, recurring detection, and full export") whose flagship "Recurring" section cannot be used to do anything.
- **Same defect elsewhere:** Mobile is better but not complete: `apps/mobile/app/recurring.tsx:102-139` offers pause / resume / delete via an `Alert` action sheet and no edit; editing a rule is only possible indirectly through `transaction/edit.tsx`, which requires finding the template transaction.
- **Fix:** Implement rule CRUD on web (create, edit amount/frequency/name/category/`ends_at`, set `ends_at` as "cancel from date X"). Until then the empty-state copy must describe the truth: if `!isPlus`, say detection is a Plus feature; if `isPlus` with no candidates, say what the detector needs. Never ship copy that names a control which is `disabled`.
- **Regression test to add:** Snapshot test asserting the empty-state string differs for `isPlus === false` and that no rendered instruction references a disabled control.

---

### F12. Accepting a re-priced pattern back-generates duplicates of charges the user already logged
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/recurring/page.tsx:238-254`; `apps/mobile/src/services/recurringPatternDetector.ts:71-75`, `:112`; `apps/mobile/src/services/recurringCatchUp.ts:45-134`
- **What the user sees:** Netflix at $9.99 for Feb–Jun, then $10.99 in July and August. The detector offers "$9.99 · 5 occurrences · likely monthly" — the stale bucket, because the priority sort is `amount × occurrences` (`recurringPatternDetector.ts:158`) and 9.99 × 5 beats 10.99 × 2. The user accepts. The rule anchors at `last_generated = 2026-06-01`, catch-up walks forward and generates July and August occurrences at $9.99 — on top of the $10.99 rows the user already logged. Their August spend jumps by $9.99 for a charge that never happened, and July's by the same.
- **Root cause:** The bucket key is exact-to-the-cent (`patternKey` = `merchant|Math.round(amount*100)`, `recurringPatternDetector.ts:71-75`), so a price change splits one subscription into two buckets. When the older, cheaper bucket has the larger `amount × occurrences` product it wins the sort, and its `lastSeenAt` is stale. Web then anchors the rule to that stale date:

  ```ts
  // apps/web/src/app/dashboard/recurring/page.tsx:251
  last_generated: c.lastSeenAt,
  ```

  and the generators walk forward from it, creating one transaction per missed cycle. `recurringCatchUp.ts:58-62` guards only against occurrences that already exist **for that rule id** (`hasRecurringOccurrence`); the user's real, manually-logged $10.99 rows have `recurring_rule_id = NULL` and are invisible to that check, and equally invisible to migration 008's index (`WHERE recurring_rule_id IS NOT NULL`).
- **Blast radius:** Every total on every screen for the affected months; budgets; insights; the forecast. This is fabricated money in the user's ledger.
- **Same defect elsewhere:** The same "generate into a period the user already has real data for" hole exists whenever a rule is created with a backdated `last_generated`. Grepped for backdated anchors: `recurring/page.tsx:251` is the only one today, but the fix for F10 (making mobile also use `lastSeenAt`) would introduce it on mobile too — fix F12 *before* F10.
- **Fix:** Before generating an occurrence, check for a *live, non-generated* transaction for the same merchant within a tolerance window of the target date, not just for the same `recurring_rule_id`. Concretely, `runRecurringCatchUp` and `generate-recurring` should skip a target date when a transaction exists with the same `user_id`, a matching normalized merchant, and `transacted_at` within ±3 days. Additionally, when a candidate is accepted, mark its contributing transactions with the new `recurring_rule_id` so they become visible to the dedup index (this is F5's write-back, which also fixes this).
- **Regression test to add:** Given transactions Netflix $9.99 on Jun 1 and $10.99 on Jul 1 and Aug 1, accepting the $9.99 candidate must not create any generated transaction for July or August.

---

### F13. `runRecurringCatchUp` runs on every navigation, not on launch, and races itself
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/_layout.tsx:52-106` (effect body and deps), `:99` (the call); `apps/mobile/src/services/recurringCatchUp.ts:32-138`
- **What the user sees:** Slow tab switches, redundant network traffic, and — once rules exist — duplicate generated transactions or a catch-up that aborts halfway leaving `last_generated` inconsistent.
- **Root cause:** The effect that calls catch-up lists `segments` in its dependency array, and `segments` changes on **every route change**:

  ```ts
  // apps/mobile/app/_layout.tsx:94-106 (comments elided)
  if (session?.user?.id) {
    seedDefaultCategories(session.user.id)      // :96
    // Generate any missed recurring transactions since last app open
    runRecurringCatchUp(session.user.id)        // :99
    runFxBackfill(session.user.id)              // :104
  }
  }, [session, loading, segments, router, profile, ready])   // :106
  ```

  The comment says "since last app open"; the code says "on every navigation". `runRecurringCatchUp` has no re-entrancy guard, no `.catch()`, and its duplicate guard (`hasRecurringOccurrence`, `transactionStore.ts:191-208`) is a read followed by a write with an `await` in between — two concurrent invocations both pass the check, both build a transaction, and the second `upsertTransaction` violates the local partial unique index `idx_txn_recurring_dedup` (`localDb.ts:180-184`), throwing inside a fire-and-forget promise. Every rule after the failing one in the loop is skipped.

  This is not speculative: the identical pattern in the same effect body produces observable production errors. Postgres log, 2026-08-08T14:33:01Z, twice within 3 ms: `duplicate key value violates unique constraint "categories_user_id_name_normalized_key"` — `seedDefaultCategories` racing itself from concurrent runs of this exact effect.
- **Blast radius:** Duplicate recurring transactions (the precise failure migration 008 was written to prevent), unhandled promise rejections, and repeated `recurring_rules` reads on every screen transition.
- **Same defect elsewhere:** The same effect fires `seedDefaultCategories` and `runFxBackfill` on every navigation. Grepped for fire-and-forget async in `_layout.tsx`: `:96`, `:99`, `:104` — all three, none with `.catch()`. `seedDefaultCategories` (`apps/mobile/src/services/seedCategories.ts:3-31`) is verified to be a read-then-write with no in-flight guard: it selects `categories.name_normalized`, diffs against `default_categories`, then inserts the difference — two concurrent invocations both compute the same `missing` set and both insert it, which is exactly the `categories_user_id_name_normalized_key` violation seen in the production log.
- **Fix:** Move launch-time work out of the routing effect entirely. Put `seedDefaultCategories` / `runRecurringCatchUp` / `runFxBackfill` in a dedicated `useEffect` keyed on `session?.user?.id` alone, guard each with a module-level in-flight promise (`let inFlight: Promise<number> | null`) so concurrent calls share one run, and attach `.catch()` to each. Wrap the catch-up loop body in try/catch so one failing rule does not abort the rest.
- **Regression test to add:** Invoke `runRecurringCatchUp` twice concurrently for the same user and assert exactly one transaction per due occurrence is written and no promise rejects.

---

### F14. The production Supabase secret key (`sb_secret_*`) is stored in plaintext inside the database
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `supabase/functions/generate-recurring/index.ts:6-12` (the documented scheduling recipe), `:66-79` (the function's own auth check that requires the key), and the live `cron.job` row id 1 `generate-recurring-daily` created from it
- **Terminology note (important):** the value stored in `cron.job.command` is a **`sb_secret_…` format Supabase secret key**, not a JWT `service_role` token. The Edge Function reads it from `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` and its own comment at `:66-68` explains that the platform's `verify_jwt` cannot validate the new key format, which is why the function is deployed with `verify_jwt: false` and compares the `Authorization` header to the key itself. The privilege level is the same (full RLS bypass); the format is not a JWT and any remediation must not assume it is.
- **What the user sees:** Nothing — until a database dump, a backup restore, a support export, or any collaborator with SQL access leaks full service-role access to every user's financial records.
- **Root cause:** The file ships the schedule as a literal SQL snippet with the key inlined:

  ```
  //   select cron.schedule('generate-recurring-daily', '0 6 * * *',
  //     $$select net.http_post(
  //       url := 'https://<project-ref>.supabase.co/functions/v1/generate-recurring',
  //       headers := '{"Authorization": "Bearer <service-role-key>"}'::jsonb
  //     )$$);
  ```

  and that is exactly how it was applied: the production `cron.job.command` for job 1 contains a literal `Bearer sb_secret_…` string. The secret key bypasses every RLS policy on the project. It is now persisted in a system catalog, included in logical backups, and visible to anyone who can run SQL against the instance.

  Mitigating (verified, not assumed): `has_schema_privilege('authenticated','cron','USAGE')` and the same for `anon` both return **false**, and `cron` is not a PostgREST-exposed schema — so an ordinary signed-in app user cannot read it. This is a secret-management failure, not a live remote exploit, which is why it is High and not Critical.
- **Blast radius:** Total — the key grants unrestricted read/write to `transactions`, `profiles`, `recurring_rules`, `ask_messages` for all users.
- **Same defect elsewhere:** Grepped the repo for hard-coded keys in `supabase/`, `.github/`, `docs/`: the file header above is the only committed instance of the pattern, and it is a placeholder (`<service-role-key>`), so the repo itself is clean. `docs/PLAN.md:3233` records the schedule as done without noting how the secret was passed.
- **Fix:** Rotate the `sb_secret_*` key immediately. Re-create the cron job reading the secret from Supabase Vault at call time (`select decrypted_secret from vault.decrypted_secrets where name = 'generate_recurring_key'`) rather than embedding it. Update the header comment in `generate-recurring/index.ts` so the documented recipe cannot be pasted with a literal key again. Longer term, prefer Supabase's scheduled-functions mechanism or a signed short-lived token over shipping the omnipotent key to the scheduler — note that rotating the key also silently breaks the cron job until the stored command is updated, which is itself an argument for indirection through Vault.
- **Regression test to add:** A CI check that fails if `select command from cron.job` matches `sb_secret_|service_role|eyJ` (JWT prefix).

---

### F15. The Edge Function generates at most one occurrence per rule per run; mobile generates all of them
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `supabase/functions/generate-recurring/index.ts:140-202` vs `apps/mobile/src/services/recurringCatchUp.ts:45-135`
- **What the user sees:** After a period where the cron did not run (or a rule was paused and resumed), a daily rule that owes 20 occurrences takes 20 calendar days to catch up on the server — but appears instantly and completely the moment the user opens the phone. Web and mobile disagree about how much money is owed until the server finishes crawling.
- **Root cause:** The server computes one `next`, inserts, advances, and moves to the next rule:

  ```ts
  // supabase/functions/generate-recurring/index.ts:140-143
  for (const rule of (rules as RecurringRule[]) ?? []) {
    const next = computeNext(rule)
    if (!next) continue          // rule expired
    if (next > now) continue     // not due yet
  ```

  Mobile loops until caught up:

  ```ts
  // apps/mobile/src/services/recurringCatchUp.ts:48-51
  let safetyLimit = 50 // prevent infinite loops
  let next = computeNextOccurrence(rule)
  while (next && next <= now && safetyLimit > 0) {
  ```

  The header comment in migration 008 (`008_recurring_dedup_constraint.sql:8`) asserts both writers "compute the same target `transacted_at`", which is true per-iteration and false in aggregate.
- **Blast radius:** Web-only users (no phone) never see missed occurrences materialize faster than one per day per rule. Budget and forecast numbers differ between platforms during catch-up.
- **Same defect elsewhere:** None — these are the only two generators (grepped `source: 'recurring_generated'`: `recurringCatchUp.ts:99`, `generate-recurring/index.ts:173`).
- **Fix:** Give the Edge Function the same bounded `while` loop as mobile, with the same safety limit, ideally by importing the shared `computeNextOccurrence` from F8's fix and a shared `occurrencesDue(rule, now, limit)` generator so the two writers are the same algorithm by construction.
- **Regression test to add:** A monthly rule with `last_generated` six months ago must yield six occurrences from a single `generate-recurring` invocation.

---

### F16. Migration 008's dedup index cannot see cross-timezone duplicates
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `supabase/migrations/008_recurring_dedup_constraint.sql:57-64`; `apps/mobile/src/services/sync/localDb.ts:180-184`; `apps/mobile/src/hooks/useRecurringRules.ts:42-60`; `supabase/functions/generate-recurring/index.ts:40-58`
- **What the user sees:** Twice a year — around the March and November DST transitions — a bill can appear twice.
- **Root cause:** The index keys on the UTC calendar date:

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

  but the two writers compute the occurrence *instant* in different timezones. `Date.prototype.setMonth/setDate` operate on local wall-clock: the Edge Function runs under Deno with `TZ=UTC`, the phone runs in the user's zone (all six production profiles have `timezone='UTC'` because the column is never populated from the device — so the app cannot even normalize deliberately). Adding one month to a wall-clock time yields the same instant in both zones **only while the UTC offset is unchanged**. Across a DST boundary the two results differ by one hour; when the occurrence sits within an hour of UTC midnight, the two writers land on different UTC dates and the index sees two distinct keys.

  Worked example, executed rather than reasoned about (`node` with `TZ=UTC` vs `TZ=America/Chicago`, `d.setMonth(d.getMonth() + 1)` on `last_generated = 2026-10-15T23:30:00Z`):

  ```
  TZ=UTC             2026-10-15T23:30:00Z -> 2026-11-15T23:30:00.000Z   UTC date Nov 15
  TZ=America/Chicago 2026-10-15T23:30:00Z -> 2026-11-16T00:30:00.000Z   UTC date Nov 16
  ```

  The phone's wall clock reads Oct 15 18:30 CDT; +1 month is Nov 15 18:30 **CST** (the offset moved from −05:00 to −06:00 on Nov 1), which is 00:30Z on Nov 16. Two distinct index keys, both rows survive. A February anchor, where no DST boundary is crossed, produces the identical instant in both zones — which is why this only bites twice a year.
- **Blast radius:** Duplicate money in the ledger, exactly the scenario migration 008 documents in its own header ("The user ends up with two paychecks for the month"). Also affects the local SQLite mirror index, which uses `substr(transacted_at, 1, 10)` — the same UTC-date assumption.
- **Same defect elsewhere:** `transactionStore.ts:191-208` (`hasRecurringOccurrence`) slices `isoDate.slice(0, 10)` — same assumption, same gap.
- **Fix:** Stop deriving the occurrence date from wall-clock arithmetic in two runtimes. Store an explicit `anchor_day` / `anchor_time` on the rule and compute occurrence dates as pure calendar dates in the *user's* timezone (which means actually populating `profiles.timezone` from the device — a prerequisite this feature shares with several others). Then key the dedup index on that calendar date rather than on a `timestamptz` cast.
- **Regression test to add:** With the device zone set to `America/Chicago` and a rule anchored at 23:30 UTC on Oct 31, assert the phone and the Edge Function compute the same `transacted_at::date`.

---

### F17. The pattern detector requires exact-to-the-cent amounts, contradicting its own documentation
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/services/recurringPatternDetector.ts:15-17` (the claim), `:71-75` (`patternKey`), `:112`; `apps/web/src/lib/recurringPatternDetector.ts:31-35`, `:69`
- **What the user sees:** Utility bills, phone bills and anything with a variable amount are never detected, no matter how many months of history exist. Only fixed-price subscriptions can ever be found — and only if the currency conversion produces identical cents.
- **Root cause:** The docblock promises tolerance:

  ```
   * apps/mobile/src/services/recurringPatternDetector.ts:15-17
   *  - Group transactions by (merchant lowercased, amount rounded to nearest
   *    cent). A 1-cent FX wobble between months would otherwise split a single
   *    pattern into two phantom patterns.
  ```

  The implementation provides none — rounding to the nearest cent is not a tolerance, it is a no-op on values already stored as `numeric(12,2)`:

  ```ts
  function patternKey(merchant: string | null, amount: number): string {
    const cents = Math.round(amount * 100)
    const m = (merchant ?? '').toLowerCase().trim()
    return `${m}|${cents}`
  }
  ```

  $9.99 and $10.00 produce different keys. The tester's own Xtream bill (a utility) is precisely the case this excludes.
- **Blast radius:** The Plus-tier "Recurring subscription detection" value proposition; the entire auto-detection path on both platforms; and the "Potential savings" card, which is derived from candidates.
- **Same defect elsewhere:** Both detector copies, identically (`recurringPatternDetector.ts:71-75` mobile, `:31-35` web). The merchant side has the mirror problem: exact lowercase-trim equality, so "Xtream" and "Xtream Internet" never group.
- **Fix:** Bucket on merchant only (normalized: lowercase, strip punctuation and trailing store numbers), then cluster within the bucket by amount using a relative tolerance (e.g. within 15% of the median) and by cadence regularity. Delete the misleading docblock. Do this once, in `packages/shared`, and delete the web copy — the web file's own instruction to "copy the change over here" is the anti-pattern.
- **Regression test to add:** Three Xtream charges of $42.00, $43.15 and $41.80 one month apart must produce one monthly candidate.

---

### F18. A failed "mark as recurring" permanently suppresses auto-detection of that pattern
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/services/recurringPatternDetector.ts:109`; `apps/web/src/lib/recurringPatternDetector.ts:66`
- **What the user sees:** After the user tries to mark Xtream recurring (which sets `is_recurring = true` but creates no rule — F1), the app will *never* offer to detect Xtream automatically, because the flagged transaction is excluded from detection. The two failure modes compound: the manual path is broken and it disables the automatic path.
- **Root cause:**

  ```ts
  // apps/mobile/src/services/recurringPatternDetector.ts:107-109
  for (const tx of transactions) {
    if (tx.is_deleted) continue
    if (tx.is_recurring) continue // already-flagged transactions opt out
  ```

  The intent — don't re-suggest what the user already handled — is right, but the signal is wrong: `is_recurring` on a transaction does not imply a rule exists. The correct signal is "a rule covers this pattern", which the code already computes separately via `existingKeys` (`:99-103`).
- **Blast radius:** Every transaction a user has ever flagged. Production currently has at least three such rows across the tester's account alone.
- **Same defect elsewhere:** Both detector copies (`recurringPatternDetector.ts:109` mobile, `apps/web/src/lib/recurringPatternDetector.ts:66` web). Also `transaction/[id].tsx:217` and `edit.tsx:79` treat `is_recurring` as authoritative for rule existence.
- **Fix:** Delete the `is_recurring` skip. `existingKeys` already suppresses patterns covered by an active rule, which is the real condition. Additionally, add a repair pass: any transaction with `is_recurring = true` and `recurring_rule_id = NULL` and no rule whose `template_txn_id` matches is a ghost — either offer to create the missing rule or clear the flag. Do not leave the database holding a state the UI cannot explain.
- **Regression test to add:** A transaction with `is_recurring: true` and no matching rule must still contribute to candidate detection.

---

### F19. The detector has no cadence-consistency check
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/services/recurringPatternDetector.ts:67-68`, `:77-83` (`inferFrequency`), `:121-154`; `apps/web/src/lib/recurringPatternDetector.ts:27-28`, `:37-43`, `:78-111`
- **What the user sees:** "Looks like Delta is recurring at USD 480.00 yearly" after two unrelated flights that happened to cost the same, 14 months apart.
- **Root cause:** The only gates are two occurrences and a 21-day spread:

  ```ts
  const MIN_OCCURRENCES = 2
  const MIN_DAYS_SPREAD = 21
  ```

  With exactly two occurrences there is exactly one gap, so `median(gaps)` equals that gap and `inferFrequency` maps any spacing whatsoever onto a frequency — `>95` days becomes "yearly" regardless of whether it was 96 days or 900. There is no variance check, no cap on the gap, and no confidence signal exposed to the UI, which nonetheless renders the word "likely" (`recurring/page.tsx:405`).
- **Blast radius:** False-positive suggestions on both platforms; the "Potential savings" card monetizes those false positives ("Cancelling the 3 flagged → $X/mo").
- **Same defect elsewhere:** Both copies.
- **Fix:** Require ≥3 occurrences for anything slower than monthly; require gap variance below a threshold (e.g. all gaps within ±25% of the median); cap the inferred `yearly` bucket at ~400 days and reject beyond it. Surface the occurrence count and gap regularity in the banner copy instead of the unqualified "likely".
- **Regression test to add:** Two identical charges 400 days apart must produce no candidate.

---

### F20. `getPeriodBounds('biweekly')` builds a window entirely in the past
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/hooks/useRecurringRules.ts:8-38`, specifically `:18-20`
- **What the user sees:** A user on a bi-weekly budget always sees $0 of upcoming recurring committed, so their "left this period" is overstated by the full value of their upcoming bills.
- **Root cause:** The `biweekly` case moves `start` back 13 days and never touches `end`, which was initialized to *now*:

  ```ts
  // apps/mobile/src/hooks/useRecurringRules.ts:9-20
  const start = new Date(now)
  const end = new Date(now)
  switch (period) {
    ...
    case 'biweekly':
      start.setDate(start.getDate() - 13)
      break
  ```

  So the window is `[13 days ago 00:00, today 23:59]`. Executed: `getPeriodBounds('biweekly', 2026-08-08T12:00)` returns `start = Sun Jul 26 2026`, `end = Sat Aug 08 2026`. `computeUpcomingRecurring` only counts occurrences with `next >= start && next <= end`, and `computeNextOccurrence` returns a *future* date for any healthy rule — which can never fall inside a window that ends today.
- **Blast radius:** Budgets ring and Today's "left this month" for every user whose budget period is `biweekly`. This is a reachable state, not a theoretical one: `biweekly` is a selectable option in `apps/mobile/src/components/BudgetEditorModal.tsx:18` and `apps/web/src/app/dashboard/budgets/page.tsx:15`.
- **Same defect elsewhere:** See F21 for the `weekly` case. The `quarterly`, `yearly` and default `monthly` branches set `end` correctly.
- **Fix:** `end.setDate(start.getDate() + 13)` is *not* the fix (see F21 — same `setDate` cross-month trap). Compute bounds from epoch-day arithmetic or a date library, and derive the biweekly window from the budget's `starts_at` anchor rather than from "13 days before now", which is not a stable period boundary at all.
- **Regression test to add:** `getPeriodBounds('biweekly', now)` must return an `end` strictly after `now`.

---

### F21. `getPeriodBounds('weekly')` corrupts the window across a month boundary
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/hooks/useRecurringRules.ts:13-17`
- **What the user sees:** During any week that straddles a month boundary, weekly-budget users see an upcoming-recurring figure computed over a window that can be a month wide or negative-length.
- **Root cause:** `end` is a copy of *now*, and the code sets its day-of-month from `start`'s day-of-month:

  ```ts
  // apps/mobile/src/hooks/useRecurringRules.ts:13-17
  case 'weekly':
    const day = start.getDay()
    start.setDate(start.getDate() - day)
    end.setDate(start.getDate() + 6)
    break
  ```

  On Tuesday 2026-09-01, `start` becomes Sunday 2026-08-30, so `start.getDate()` is 30 and `end.setDate(36)` is evaluated against *September*. Executed: `getPeriodBounds('weekly', new Date(2026, 8, 1, 12))` returns `start = Sun Aug 30 2026`, `end = Tue Oct 06 2026` — a five-week window. The `case` blocks also declare `const day` (`:14`) / `const q` (`:22`) without braces, so they share one block scope across the switch — a lint-level hazard that has not bitten yet only because the branches are mutually exclusive.
- **Blast radius:** Same as F20 — Budgets and Today for weekly-budget users, one week in four.
- **Same defect elsewhere:** Grepped `setDate(` across the recurring surface: `useRecurringRules.ts:15`, `:16`, `:19`, `:31`, `:50-52`; `recurring/page.tsx:52`, `:55`, `:58`, `:124`, `:320`, `:621`; `generate-recurring/index.ts:48-50`. Of those, **only `useRecurringRules.ts:16` is defective** — every other site reads and writes the same Date object, which is the safe form of the idiom. The bug here is specifically that `start` and `end` are different objects that can be in different months. Cross-checked and confirmed: no second instance of the cross-object form exists.
- **Fix:** `const end = new Date(start); end.setDate(start.getDate() + 6)` — derive `end` from `start`, not from `now`. Better, fold this into the same shared date module as F8 and add braces to every `case`.
- **Regression test to add:** `getPeriodBounds('weekly', new Date('2026-09-01'))` must return exactly 7 days spanning Aug 30 – Sep 5.

---

### F22. `computeUpcomingRecurring` counts only one occurrence per rule
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/hooks/useRecurringRules.ts:71-79`
- **What the user sees:** A weekly $60 grocery-delivery rule contributes $60 to the month's committed spend instead of roughly $260. Safe-to-Spend overstates available money by the difference.
- **Root cause:** The reducer takes `computeNextOccurrence(rule)` — a single date — and tests it for window membership. There is no loop over the occurrences that fall inside the period:

  ```ts
  const next = computeNextOccurrence(rule)
  if (!next) return sum
  if (next >= start && next <= end) return sum + rule.amount
  ```

  The web equivalent, `chargesIn30Days` (`recurring/page.tsx:126-138`), *does* loop. Two implementations, two answers.
- **Blast radius:** Budgets, Today. Understates committed spend for any rule more frequent than the budget period (daily and weekly rules against a monthly budget; daily against weekly).
- **Same defect elsewhere:** Only this function; web's version is correct, which makes it a divergent duplicate as well.
- **Fix:** Replace with a shared `occurrencesInWindow(rule, start, end)` generator (the same one F15 needs) and sum `amount × occurrences.length`, direction-filtered and FX-normalized per F2 and F6.
- **Regression test to add:** A weekly $60 debit rule against a monthly period must contribute between $240 and $300, not $60.

---

### F23. Monthly and annual roll-ups ignore `rule.interval`
- **Severity:** Low *(downgraded from Medium during verification — no code path in the repo can produce `interval ≠ 1`, so the defect is unreachable rather than edge-case)*
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/recurring/page.tsx:97-117`; `apps/mobile/app/recurring.tsx:27-34`, `:98`; `apps/mobile/src/hooks/useRecurringRules.ts:76`
- **What the user sees:** A rule set to "every 3 months" is totalled as if it billed monthly — a 3× overstatement of that line in the "Monthly" and "Annual cost" figures.
- **Root cause:** The next-occurrence functions all honour `interval` (`useRecurringRules.ts:50-55`, `generate-recurring/index.ts:48-53`, `recurring/page.tsx:52-68`), but the cost normalizers do not:

  ```ts
  // apps/web/src/app/dashboard/recurring/page.tsx:97-113
  function monthlyEquivalent(r: RecurringRule): number {
    switch (r.frequency) {
      case 'daily':    return r.amount * 30
      case 'weekly':   return r.amount * 4.33
      ...
  ```

  `interval` is `NOT NULL DEFAULT 1` (`001_initial_schema.sql:93`) and both writers in the repo hard-code `1` (`useRecurringRules.ts:124`, `recurring/page.tsx:248`) — verified: there are exactly two `recurring_rules` insert sites and no update path touches `interval`. The bug is therefore unreachable today, which is why it is Low. It becomes real the day any UI exposes the column, because the date math already honours it and the cost math does not.
- **Blast radius:** All monthly/annual cost figures on both Recurring screens, and MindMap's outflow node.
- **Same defect elsewhere:** All three normalizers listed above.
- **Fix:** One shared `monthlyEquivalent(rule)` in `packages/shared` that divides by `rule.interval`. Or — since no UI can set `interval` — remove it from the type and schema and stop pretending it is supported. Half-supporting a column is how this drift happens.
- **Regression test to add:** A `monthly` rule with `interval: 3` and amount 90 must have a monthly equivalent of 30.

---

### F24. Overdue rules render a next-charge date in the past
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/recurring/page.tsx:43-72`, `:283-289`, `:486-488`; `apps/mobile/app/recurring.tsx:57-61`, `:222-226`
- **What the user sees:** "Next charge: Feb 3" displayed in August, sorted to the top of the list as the most imminent charge.
- **Root cause:** `nextOccurrence(rule)` returns `last_generated + one interval` unconditionally; if generation has stalled (paused cron, rule resumed after a long pause, F15's one-per-day crawl), that date is in the past. Nothing clamps it forward:

  ```ts
  // apps/web/src/app/dashboard/recurring/page.tsx:486-488
  <div style={{ color: colors.ink2, fontSize: 12 }}>
    {next ? next.toLocaleDateString(locale, { month: 'short', day: 'numeric' }) : '—'}
  </div>
  ```

  and `sortedActive` (`:283-289`) orders by that same stale timestamp, so the most-overdue rule always sorts first under a header that reads "Sort: Next charge".
- **Blast radius:** Both Recurring screens; mobile's `formatNextDue` has the identical behaviour.
- **Same defect elsewhere:** `apps/mobile/app/transaction/[id].tsx:218-222` (`nextDue` / `nextDueLabel` on the detail chip, rendered at `:228-229`) — third copy. Grepped `computeNextOccurrence(` / `nextOccurrence(` across all three platforms: those are the only three display sites.
- **Fix:** Advance to the first occurrence strictly after `now` before displaying (the same `occurrencesDue` helper from F15 gives this for free), and render an explicit "Overdue — pending generation" state rather than a past date, so a stalled generator is visible instead of disguised.
- **Regression test to add:** A monthly rule with `last_generated` three months ago must display a next-charge date in the future.

---

### F25. `chargesIn30Days` gives up before reaching the visible window for long-overdue rules
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/recurring/page.tsx:120-140`
- **What the user sees:** A daily rule that has not generated for two months shows zero charges in the next 30 days — the calendar looks empty while the rule is listed as active above it.
- **Root cause:** The walk starts from `nextOccurrence(r)` (which may be far in the past, per F24) and is capped at 60 iterations:

  ```ts
  // apps/web/src/app/dashboard/recurring/page.tsx:128-137
  let nxt = nextOccurrence(r)
  let safety = 0
  while (nxt && nxt <= horizon && safety < 60) {
    if (nxt >= today) {
      const dayOffset = Math.round((nxt.getTime() - today.getTime()) / 86_400_000)
      out.push({ day: dayOffset + 1, rule: r })
    }
    nxt = nextOccurrence(r, nxt)
    safety += 1
  }
  ```

  For a daily rule 90 days behind, all 60 iterations are consumed catching up to today and none reach the horizon.
- **Blast radius:** The 30-day calendar, `totalCharges`, and the "Heaviest day" footer.
- **Same defect elsewhere:** `recurringCatchUp.ts:48` has the analogous `safetyLimit = 50`, which for a daily rule silently truncates catch-up at 50 days — but at least it advances `last_generated`, so the next launch resumes. Web's loop leaves no trace.
- **Fix:** Fast-forward to the first occurrence ≥ today with closed-form arithmetic instead of iterating, then iterate only within the 30-day window (at most 30 steps for a daily rule). The shared occurrence generator from F15 should expose `firstOccurrenceOnOrAfter(rule, date)`.
- **Regression test to add:** A daily rule with `last_generated` 90 days ago must produce 30 calendar entries.

---

### F26. MindMap's "Recurring outflow" counts only monthly rules, and counts income as outflow
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/web/src/components/lenses/MindMap.tsx:96-111`; `apps/web/src/app/dashboard/page.tsx:32-38`; `apps/web/src/components/lenses/types.ts:27-31`
- **What the user sees:** The Overview mind-map's "Recurring outflow · $X/mo" node omits every weekly, quarterly and yearly rule, and includes the monthly salary rule as an outflow.
- **Root cause:** The filter is frequency-exact rather than normalized, and `direction` is not available at all:

  ```ts
  // apps/web/src/components/lenses/MindMap.tsx:96-98
  const recurringMonthly = p.recurring
    .filter((r) => r.frequency === 'monthly')
    .reduce((s, r) => s + r.amount, 0)
  ```

  The page only selects three columns (`page.tsx:34`: `.select('name, amount, frequency')`) and `LensRecurring` (`types.ts:27-31`) has exactly `{ name, amount, frequency }` — no `direction`, no `currency_code`, no `interval` — so the lens *cannot* get the sign right even if it wanted to. Meanwhile `recurring/page.tsx` normalizes across all six frequencies — a third distinct answer to "what does this user pay monthly".
- **Blast radius:** The default Overview lens (`lens: 'mindmap'` is the default at `page.tsx:42`), i.e. the first screen a desktop user sees.
- **Same defect elsewhere:** `MindMap.tsx:108-111` (`planSubs`) also slices `p.recurring` unfiltered, so a salary rule appears in the plan list.
- **Fix:** Select `direction, currency_code, interval` in `page.tsx:32-38`, extend `LensRecurring`, and use the shared `monthlyEquivalent` from F23 with the direction filter from F2. There should be exactly one function in the codebase that answers "monthly cost of these rules".
- **Regression test to add:** A yearly $120 debit rule plus a monthly $4,000 credit rule must yield a recurring outflow of $10/mo.

---

### F27. Recurring rules are online-only inside an offline-first application
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/hooks/useRecurringRules.ts:83-176`; `apps/mobile/src/services/sync/localDb.ts:13-65` (only `transactions` and `sync_queue` are created — no rules table); `supabase/migrations/001_initial_schema.sql:84-99` (the `recurring_rules` DDL: no `updated_at`, no `version`, no `is_deleted`)
- **What the user sees:** In airplane mode, `More → Recurring` is empty even for a user with rules; Safe-to-Spend silently drops the recurring deduction to $0 and reports more money available than the user has; pausing or deleting a rule appears to succeed and is lost.
- **Root cause:** Every rule operation is a direct PostgREST call with no local mirror and no queue:

  ```ts
  // apps/mobile/src/hooks/useRecurringRules.ts:89-94 — note: `error` is not even destructured
  const { data } = await supabase
    .from('recurring_rules')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  setRules((data as RecurringRule[]) ?? [])
  ```

  On failure `data` is null, `rules` becomes `[]`, and every consumer treats "no data" as "no rules". The table also lacks the sync contract the rest of the app relies on: no `updated_at` (and no `set_recurring_rules_updated_at` trigger — verified against the live schema), no `version`, no soft delete. Last-write-wins between two devices is therefore impossible to adjudicate, and `deleteRule` is a hard `DELETE` that cannot be replicated or undone.
- **Blast radius:** Correctness of Safe-to-Spend and Budgets whenever the network is unavailable or slow; silent loss of user intent; no possible conflict resolution between phone and desktop.
- **Same defect elsewhere:** `categories` and `budgets` are also online-only (grepped `localDb.ts` for `CREATE TABLE`: only `transactions` and `sync_queue` exist). The recurring case is the most damaging because it feeds a money figure.
- **Fix:** This is the same architectural fix as F1: bring `recurring_rules` into the offline-first contract — local table, queue support for `entity_type = 'recurring_rule'`, `version`/`is_deleted`/`updated_at` columns and an `updated_at` trigger in a new migration. Until then, `useRecurringRules` must at minimum distinguish "loaded, zero rules" from "fetch failed" and every consumer of `computeUpcomingRecurring` must refuse to render a number rather than render zero.
- **Regression test to add:** With the network stubbed to fail, `useRecurringRules` must expose an error state and Budgets must not display a `spent` figure that omits recurring commitments.

---

### F28. Mobile export omits recurring rules; web export includes them
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/services/exportData.ts:68-125` vs `apps/web/src/app/dashboard/settings/page.tsx:180-201`
- **What the user sees:** Exporting from the phone produces a file with no recurring rules; exporting the same account from the desktop includes them. A user who leaves the product via mobile loses their subscription configuration.
- **Root cause:** Mobile's CSV header and JSON body enumerate transaction fields only:

  ```ts
  // apps/mobile/src/services/exportData.ts:70-80
  const header = ['date','amount','currency','direction','category','merchant','note','payment_method','is_recurring','source']
  ```

  There is no `recurring_rules` section and `recurring_rule_id` is not exported either (neither by `buildCSV` nor by `buildJSON` at `:104-125`), so even the link between a generated transaction and its rule is dropped. Web's export explicitly fetches and includes `recurring_rules: rules ?? []` (`settings/page.tsx:184`, `:200`).
- **Blast radius:** Data portability, which the Privacy screen presents as a user right; and the export is a paid feature (`en.json:424` "Export to CSV & PDF").
- **Same defect elsewhere:** Diffed the two exporters' top-level keys field by field. Web emits `{app, version, exported_at, profile, transactions, categories, budgets, recurring_rules}`; mobile emits `{app, version, exported_at, currency_default, …transaction items}` only. So mobile additionally omits `profile`, `categories` (it inlines category *names* onto rows but does not export the category entities) and `budgets`. **Correction:** neither exporter includes `ask_conversations` — the earlier claim that web includes it is wrong.
- **Fix:** Move export assembly into `packages/shared` with one `buildExport({profile, transactions, categories, budgets, rules})` used by both platforms, so adding an entity cannot reach only one surface.
- **Regression test to add:** Assert the mobile and web exports for the same fixture account contain the same top-level keys.

---

### F29. "Potential savings" counts all candidates but sums only the monthly ones
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/recurring/page.tsx:328-329`, `:657-660`
- **What the user sees:** "Cancelling the 3 flagged → $12/mo · $144/yr" when two of the three flagged items are yearly subscriptions worth $200 each. The headline number and the count describe different sets.
- **Root cause:**

  ```ts
  // apps/web/src/app/dashboard/recurring/page.tsx:328-329
  const potentialMonthly = candidates.reduce((s, c) => s + (c.frequency === 'monthly' ? c.amount : 0), 0)
  const potentialYearly = potentialMonthly * 12
  ```

  rendered at `:657-660` as `Cancelling the {candidates.length} flagged → {fmtShort(potentialMonthly)}/mo · {fmtShort(potentialYearly)}/yr`. Non-monthly candidates contribute 0 to the sum and 1 to the count. The same normalization the page already implements at `:97-113` is not applied here. The card is also gated on `potentialMonthly > 0` (`:635`), so a user whose only candidates are yearly subscriptions sees no card at all despite having flagged items.
- **Blast radius:** A money claim on a marketing-flavoured card in a financial product.
- **Same defect elsewhere:** F26 is the same "only `frequency === 'monthly'` counts" mistake in MindMap. Two occurrences of a normalizer that exists 40 lines away.
- **Fix:** Use `monthlyEquivalent` (post-F23, from `packages/shared`) over all candidates, and derive the count from the same filtered set that produced the sum.
- **Regression test to add:** Two candidates — $10 monthly and $240 yearly — must render "2 flagged" and $30/mo.

---

### F30. Existing-rule suppression matches on `(name, amount)`, and every unnamed rule collides
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/services/recurringPatternDetector.ts:99-103`; `apps/web/src/lib/recurringPatternDetector.ts:57-61`
- **What the user sees:** Renaming a rule ("Netflix" → "Netflix Family") makes the detector start suggesting the same subscription again. An *unnamed* rule suppresses nothing at all, so the pattern it covers keeps being re-suggested forever. And pausing a rule immediately re-triggers a "new pattern detected" banner for the thing the user just paused.
- **Root cause:**

  ```ts
  // apps/mobile/src/services/recurringPatternDetector.ts:99-103
  const existingKeys = new Set<string>()
  for (const r of existingRules) {
    if (!r.is_active) continue
    existingKeys.add(patternKey(r.name ?? '', r.amount))
  }
  ```

  Three distinct failures in five lines:
  1. The key is the rule's **name**, compared for exact lowercase-trim equality against the transaction's **merchant**. Any rename, or any rule whose name was typed differently from the merchant string, breaks suppression.
  2. `patternKey(null, 15)` yields `"|1500"`. **Correction to the original claim:** unnamed rules do not "suppress each other" — the bucket key on the transaction side is `patternKey(tx.merchant, tx.amount)` and `tx.merchant` is guaranteed non-null by the `if (!tx.merchant) continue` guard at `:111`, so `"|1500"` can never match any bucket. An unnamed rule therefore suppresses *nothing*; it is a dead entry in the set. `record.tsx:295` passes `name: merchant.trim() || null`, so any transaction saved without a merchant produces exactly such a rule.
  3. `if (!r.is_active) continue` drops paused rules from the suppression set entirely, so pausing a rule immediately re-surfaces its pattern as "new".
- **Blast radius:** Banner noise on both platforms; the "To review" count; the "Potential savings" figure.
- **Same defect elsewhere:** Both copies.
- **Fix:** Suppress by rule identity where possible — the rule's `template_txn_id` and, after F5, the `recurring_rule_id` on the contributing transactions. Fall back to normalized-merchant matching (not exact name) with the amount tolerance from F17. Treat paused rules as covering their pattern.
- **Regression test to add:** Pausing a rule must not cause its pattern to be re-suggested.

---

### F31. The web Recurring page never unsubscribes its realtime channel
- **Severity:** Low *(downgraded from Medium during verification — the `supabase_realtime` publication contains zero tables on production, so no `postgres_changes` event can fire and the stated "reloads once per stale channel per change" symptom cannot occur today. The channel leak itself is real and becomes user-visible the moment realtime is enabled.)*
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/recurring/page.tsx:191-221`
- **What the user sees:** Today, nothing — realtime is dead project-wide. Once tables are added to the publication: navigating in and out of Recurring accumulates live subscriptions; over a long desktop session the page reloads its full dataset once per stale channel per change, and eventually hits Supabase's per-client channel limit, at which point realtime stops working across the whole dashboard.
- **Root cause:** The cleanup function is returned from inside an async IIFE, where React never sees it. The effect's real cleanup only flips a boolean:

  ```ts
  // apps/web/src/app/dashboard/recurring/page.tsx:194-219
  void (async () => {
    ...
    const channel = supabase.channel(...).subscribe()
    return () => {                     // <-- returned to nobody
      active = false
      channel.unsubscribe()
      void supabase.removeChannel(channel)
    }
  })()
  return () => {
    active = false                     // <-- channel leaks
  }
  ```

  Note also that `channel` is declared with `const` *inside* the IIFE (`:198`), so even a correct outer cleanup could not reach it — the fix is structural, not a one-line move.
- **Blast radius:** Realtime reliability across the desktop app, once realtime is switched on.
- **Same defect elsewhere:** Grepped `supabase.channel(` in `apps/web`: `transactions/page.tsx:159-189` does it **correctly** — `let channel: ReturnType<typeof supabase.channel> | null = null` at `:161` is hoisted to the effect scope and the real cleanup at `:183-189` unsubscribes and removes it. Mobile's `useTransactions.ts:47-74` is also correct. Two implementations of the same effect on web, one right, one wrong: the same divergent-duplicate disease as the rest of this report.
- **Fix:** Copy the transactions-page shape: declare `let channel` in effect scope, assign inside the IIFE, unsubscribe in the effect's own cleanup. Better, extract a `useRealtimeTables(tables, onChange)` hook so this is written once.
- **Regression test to add:** Mount and unmount the Recurring page 5 times and assert `supabase.removeChannel` was called 5 times.

---

### F32. `starts_at` is never itself an occurrence — the first cycle is always skipped
- **Severity:** Low *(downgraded from Medium during verification — both rule-creating paths always write a non-null `last_generated` (`useRecurringRules.ts:126` = `now()`, `recurring/page.tsx:251` = `c.lastSeenAt`), so the `starts_at` branch is dead code today. It is a semantic hole waiting for the first writer that leaves `last_generated` null — which the F11 "Add manually" UI would be.)*
- **Status:** Newly discovered
- **Where:** `supabase/functions/generate-recurring/index.ts:41-43`; `apps/mobile/src/hooks/useRecurringRules.ts:43-45`; `apps/web/src/app/dashboard/recurring/page.tsx:44-48`
- **What the user sees:** Nothing today (no rule is ever created with a null `last_generated`). Were one to be, a rule created with `starts_at` = a date the user intends as the first charge would never generate on that date; the first generated occurrence would be one full cycle later.
- **Root cause:** All three implementations always add an interval to the base, whether the base is `last_generated` or `starts_at`:

  ```ts
  const base = rule.last_generated ? new Date(rule.last_generated) : new Date(rule.starts_at)
  const next = new Date(base)
  switch (rule.frequency) { case 'monthly': next.setMonth(next.getMonth() + rule.interval); break ... }
  ```

  There is no branch that treats `starts_at` as due when `last_generated` is null. Mobile masks this by writing `last_generated = now()` at creation (`useRecurringRules.ts:126`), which is a workaround for a semantic the code never defined.
- **Blast radius:** Any rule created with a future or backdated `starts_at`; and any rule created by a future "Add manually" UI on web, which will inherit the same skip.
- **Same defect elsewhere:** All three copies (a fourth instance of the triplication in F8).
- **Fix:** Define the semantics once: `starts_at` **is** the first occurrence. `nextOccurrence` should return `starts_at` when `last_generated` is null and `starts_at <= now`, and add an interval only from `last_generated`. Remove the `last_generated: new Date().toISOString()` workaround at `useRecurringRules.ts:126` once the semantics are correct.
- **Regression test to add:** A rule with `starts_at` yesterday and `last_generated` null must generate exactly one occurrence dated yesterday.

---

### F33. Free users are told there is nothing to review when detection never ran
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/dashboard/recurring/page.tsx:225-232`, `:350-357`
- **What the user sees:** "Auto-detected from your spend patterns. No new patterns to review." — an affirmative statement of fact produced by code that returned `[]` without looking at anything.
- **Root cause:** `candidates` short-circuits on `!isPlus`, and the subtitle renders the zero-count branch without distinguishing "detector ran and found nothing" from "detector did not run".
- **Blast radius:** Copy only, but it is a false statement about the user's money in a paid-upgrade context.
- **Same defect elsewhere:** `apps/mobile/app/(tabs)/index.tsx:261-268` gates the banner on `isPlus` but simply renders nothing, which is honest. Web is the only surface that asserts a negative.
- **Fix:** Branch the subtitle on `isPlus`: for free users, say detection is a Plus feature and link to the paywall.
- **Regression test to add:** Render with `isPlus: false` and assert the subtitle does not contain "No new patterns".

---

### F34. Paused rules are listed under the "Active subscriptions" heading on mobile
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/recurring.tsx:194-241`
- **What the user sees:** A paused rule sits in a section titled "Active subscriptions", dimmed, with the label "Paused" on its second line. The section header contradicts the row.
- **Root cause:** The heading is `t('recurring.active_subs')` but the list maps *all* rules:

  ```tsx
  // apps/mobile/app/recurring.tsx:195-197
  <Text style={styles.sectionLabel}>{t('recurring.active_subs', locale)}</Text>
  <View style={styles.listCard}>
    {rules.map((rule, i) => {
  ```

  The `monthlyTotal` hero above it does filter `is_active` (`:96-98`), so the header total and the list disagree about what "active" means. The row itself renders `t('recurring.paused', locale)` on its second line at `:225` and dims to `opacity: 0.5` via `ruleRowInactive` (`:207`, `:372`) — the component knows the rule is paused; only the section heading doesn't.
- **Blast radius:** Cosmetic, but it makes the pause action look ineffective.
- **Same defect elsewhere:** Web splits active and inactive correctly (`recurring/page.tsx:270-271`, `:447`, `:497`). Divergent duplicate again — mobile is the odd one out.
- **Fix:** Split the mobile list into "Active" and "Paused" sections, matching web.
- **Regression test to add:** With one active and one paused rule, the "Active subscriptions" section must contain exactly one row.

---

### F35. `SafeToSpend.tsx` is dead code carrying a fourth copy of the committed-spend math
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/components/SafeToSpend.tsx:36-75`
- **What the user sees:** Nothing — the component is never rendered. `grep -rn "SafeToSpend" apps packages --include='*.ts' --include='*.tsx'` returns exactly two hits: its own `export function` at `SafeToSpend.tsx:36`, and a stale comment at `apps/mobile/src/hooks/useBudget.ts:66` ("Backwards-compatible alias used by HomeScreen + SafeToSpend"). No JSX site imports or renders it; `apps/mobile/app/(tabs)/index.tsx:178` inlines the same calculation instead.
- **Root cause:** The component owns `const committed = totalSpent + upcomingRecurring` (`:49`) and a breakdown row for upcoming recurring (`:70-74`) that duplicates `index.tsx:178` and `budgets.tsx:80`. Three live copies plus one dead one of a money formula that is currently wrong in all of them (F2).
- **Blast radius:** None today; guaranteed drift tomorrow — whoever fixes F2 will fix the live copies and leave this one to be resurrected later with the bug intact.
- **Same defect elsewhere:** The three live copies at `index.tsx:178`, `budgets.tsx:80`, `SafeToSpend.tsx:49`.
- **Fix:** Delete the component, or wire it in and delete the two inline copies. Do not leave a fourth implementation in the tree.
- **Regression test to add:** A dead-code lint rule (`ts-prune` or equivalent) in CI.

---

### F36. The recurring frequency chips are inaccessible
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/components/RecurringToggle.tsx:58-76`, chips specifically at `:64-74`
- **What the user sees:** With VoiceOver, the six frequency chips announce only their label with no role and no selected state, and the horizontal `ScrollView` gives no indication that more options exist off-screen.
- **Root cause:** The `Pressable` chips carry no `accessibilityRole`, `accessibilityState` or `accessibilityLabel`; selection is conveyed purely by colour (`chipActive` at `:138-141` / `chipLabelActive` at `:147-150`), which also makes it a colour-only affordance. Verified: the string `accessibility` appears nowhere in the file except this finding's absence of it.
- **Blast radius:** Accessibility of a control that determines how often money is deducted.
- **Same defect elsewhere:** `apps/mobile/app/recurring.tsx:201-238` (rule rows are `Pressable` with no role/label — the row opens a destructive action sheet); `apps/web/src/app/dashboard/recurring/page.tsx:490-492`, `:536-538` (the ACTIVE/Resume pills are buttons whose only label is a colour-coded word, with `title="Pause"` on a button whose visible text reads "ACTIVE"). `RecurringPatternBanner.tsx` is the one recurring surface that gets it partly right — its dismiss control carries `accessibilityLabel={t('common.dismiss', locale)}`.
- **Fix:** Add `accessibilityRole="radio"` with `accessibilityState={{ selected }}` on the chips, wrap the row in `accessibilityRole="radiogroup"`, and give the web pills explicit `aria-pressed` plus text that matches the action.
- **Regression test to add:** An a11y snapshot asserting the selected frequency chip exposes `selected: true`.

---

### F37. Duplicate `detail.recurring` key in every locale file
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `packages/shared/src/i18n/locales/en.json:94` and `:106`; **and the same duplicate at the same two line numbers in `es.json`, `fr.json` and `pt.json`**
- **What the user sees:** Nothing — in all four files both occurrences carry the identical value (`"Recurring"` / `"Recurrente"` / `"Récurrent"` / `"Recorrente"`), so last-wins produces the right string by luck.
- **Root cause:** JSON object literals silently keep the last duplicate key. There is no lint gate on the locale files. The duplication was clearly propagated by copying `en.json`'s structure into the translations, which is why the line numbers match exactly.
- **Blast radius:** None today. If the two values ever diverge — and with four files to keep in sync, they will — the earlier one becomes silently dead and the change appears not to take effect.
- **Same defect elsewhere:** **Correction:** the original finding claimed `en.json` was the only affected file. It is not. `grep -o '"[a-z_]*\.[a-z_0-9]*"\s*:' <file> | sort | uniq -d` returns `"detail.recurring":` for all four locale files, and nothing else — so `detail.recurring` is the only duplicated key in the set, but it is duplicated four times over. Key *parity* is fine: each locale carries 29 `recurring.*` keys and 5 `home.pattern*` keys, so translation coverage for this subsystem is complete.
- **Fix:** Delete the duplicate at `:106` in **all four** files and add a CI check that fails on duplicate JSON keys in `packages/shared/src/i18n/locales/*.json`.
- **Regression test to add:** A locale-lint step that parses each file with a duplicate-key-detecting parser.

---

### F38. The mobile Recurring screen prints every amount with a hard-coded `$`
- **Severity:** High
- **Status:** Newly discovered (during verification of F6)
- **Where:**
  - `apps/mobile/app/recurring.tsx:180` (the hero total), `:233` (every rule row)
  - `apps/mobile/src/components/Money.tsx:44` (`sign = '$'` default; prop declared optional at `:16`)
  - `packages/shared/src/utils/currency.ts:19` (`currencySymbolFor`, the helper this screen fails to use)
- **What the user sees:** A user whose profile currency is EUR opens `More → Recurring` and reads **"$103"** under "PAID MONTHLY" — and directly beneath it, in the same card, **"That's 1 236 € a year in subscriptions"**. The two lines of one sentence disagree about the currency. Per-row it is worse: a €12/mo rule renders as "$12" in the list, which is the exact bug the repo already fixed for transaction rows.
- **Root cause:** `Money` defaults its glyph to `'$'`:

  ```tsx
  // apps/mobile/src/components/Money.tsx:38-47
  export function Money({ value, size = 28, serif = true, muted = false,
    sansWeight = '600', sign = '$', color, style }: Props) {   // sign default at :44
  ```

  and `recurring.tsx` never passes `sign`:

  ```tsx
  // apps/mobile/app/recurring.tsx:180
  <Money value={monthlyTotal} size={46} />
  // apps/mobile/app/recurring.tsx:233
  <Money value={rule.amount} size={14} serif={false} sansWeight="700" />
  ```

  The same screen *does* use the correct helper for its other amounts — `formatCurrency(rule.amount, rule.currency_code, locale)` at `:107`, `:108`, `:124`, `:220` and `formatCurrency(yearlyProjection, currency, locale)` at `:186` — so the inconsistency is internal to a single file, not a missing capability. `packages/shared` already exports `currencySymbolFor` for exactly this, and `TransactionRow.tsx:112` and `transaction/[id].tsx:270` both use it, with a comment at `TransactionRow.tsx:109-111` spelling out the rule: *"Row amounts keep their original currency — a €45 dinner must not render as $45."* Commit `c651009` ("Per-row amounts keep their original currency everywhere") applied that rule to the transaction surfaces and missed the recurring surface.
- **Blast radius:** Every amount on the mobile Recurring screen, for every non-USD user and for every foreign-currency rule regardless of profile. Compounds F6: F6 makes the *number* wrong for mixed-currency portfolios; this makes the *denomination label* wrong even when the number is right.
- **Same defect elsewhere:** `grep -rn "<Money" apps/mobile` returns 13 render sites. Exactly **two** pass `sign`: `apps/mobile/src/components/TransactionRow.tsx:103-113` (glyph at `:112`) and `apps/mobile/app/transaction/[id].tsx:266-271` (glyph at `:270`). The other eleven inherit `'$'`:
  - `apps/mobile/app/recurring.tsx:180`, `:233` — **this finding** (recurring surface)
  - `apps/mobile/app/(tabs)/index.tsx:275` (Spent today)
  - `apps/mobile/app/(tabs)/budgets.tsx:123`, `:125`, `:132`
  - `apps/mobile/app/(tabs)/insights.tsx:365`, `:414`
  - `apps/mobile/src/components/HistoryHeatmap.tsx:162`, `:247`
  - `apps/mobile/src/components/ListeningView.tsx:190`

  The five files below the recurring line are outside this audit's domain but are the identical defect and must be fixed in the same pass. On web the sibling is `apps/web/src/components/lenses/MindMap.tsx:109`, where `planSubs` formats each rule's raw `amount` through the lens-level `fmt` (profile currency) with no per-rule currency.
- **Fix:** Two changes, not one. (1) In `recurring.tsx`, pass `sign={currencySymbolFor(rule.currency_code || currency)}` on the row at `:233` and `sign={currencySymbolFor(currency)}` on the hero at `:180`. (2) Remove the `sign = '$'` default from `Money` and make the prop required — the default is what allowed nine call sites to be silently wrong, and leaving it in place guarantees the tenth. Note that `Money` also hard-codes `toLocaleString('en-US')` for thousands grouping (`Money.tsx:51`), so a `fr` user gets `1,236` rather than `1 236`; that belongs to the i18n domain but shares the root cause of "a display primitive with US defaults baked in".
- **Regression test to add:** Render the Recurring screen with `profile.currency_code = 'EUR'` and one EUR rule, and assert no rendered string contains `$`.

---

## Answers to the specific questions in the brief

- **Is `generate-recurring` deployed?** Yes. Live function list shows slug `generate-recurring`, status `ACTIVE`, `verify_jwt: false`, version 1.
- **Is anything scheduled to invoke it?** Yes. `cron.job` id 1, `generate-recurring-daily`, schedule `0 6 * * *`, `active: true`. `cron.job_run_details` shows 16 consecutive successful runs from 2026-07-24 to 2026-08-08. The most recent HTTP response in `net._http_response` is `200 {"generated":0,"errors":0,"checked":0}` — the cron is healthy and there is simply nothing to generate. **The recurring feature is not broken by the scheduler; it is broken by F1.** No cron configuration exists anywhere in the repo — the schedule lives only in the production database and in a comment at `generate-recurring/index.ts:6-12`, which is itself a finding (F14) and a reproducibility gap: a fresh environment cannot be stood up from the repo.
- **What happens if it never runs?** `runRecurringCatchUp` (`_layout.tsx:99`) covers mobile users on every navigation (F13), generating all missed occurrences (F15). Web-only users would get nothing at all — there is no web-side catch-up.
- **Does migration 008's dedup constraint actually prevent double generation?** Partially. It correctly blocks two writers producing the same `(user, rule, UTC date)` and `SyncManager.ts:117-121` handles the 23505 cleanly. It does **not** cover: (a) occurrences whose UTC date differs between the UTC-based server and the device-local phone across a DST boundary (F16); (b) duplicates against the user's own manually-logged transactions, which have `recurring_rule_id IS NULL` and fall outside the partial index (F12); (c) the template transaction itself, which also has `recurring_rule_id IS NULL` (F5).
- **Is "accept a detected pattern" reachable on web?** Only for Plus users with at least two same-merchant, exact-same-cent debits at least 21 days apart. For everyone else the empty-state instruction is unreachable, and "Add manually" is permanently `disabled` (F11).
- **Schema drift between `recurring_rules` and `packages/shared/src/types/recurring.ts`?** No column drift — re-verified against the DDL in this pass: `001_initial_schema.sql:84-99` (14 columns) plus `005_recurring_rules_fields.sql` (`direction`, `payment_method`, `note`) gives exactly the 17 fields declared on the `RecurringRule` interface, in the same nullability. The drift is in what is *missing from both*: no `updated_at`, no `version`, no `is_deleted`, no FX snapshot columns, and no `set_updated_at` trigger — unlike `profiles`, `categories`, `transactions` and `budgets`, which all have one (F6, F27).
- **Do the two pattern detectors diverge?** Behaviourally, no — I diffed them line by line and the thresholds (`MIN_OCCURRENCES = 2`, `MIN_DAYS_SPREAD = 21`), `patternKey`, `inferFrequency` boundaries (9/20/45/95), `median`, the five skip conditions, the anchor choice and the `amount × occurrences` sort are identical. The only textual difference is that mobile reuses the bucket key while web recomputes `patternKey(anchor.merchant, anchor.amount)` (`web:99`), which evaluates to the same string. **The divergence is not inside the detectors — it is in what each platform does with a candidate** (F10: mobile discards `lastSeenAt`, web uses it) and in the fact that two files must be edited in lock-step by hand, per the instruction at `apps/web/src/lib/recurringPatternDetector.ts:1-4`. That instruction is the defect; the files are one bug-fix away from silently diverging.

## Unverified suspicions

- `has_schema_privilege('authenticated', 'net', 'USAGE')` returns **true** on production. I did not establish whether `net.http_post` is callable by an app user (PostgREST only exposes `public` and `graphql_public` by default, and schema USAGE alone is not sufficient), but a signed-in user able to invoke `net.http_post` would be a server-side request forgery primitive. Worth a five-minute check by the security-domain audit; out of scope here.
- The production log also shows `duplicate key value violates unique constraint "categories_user_id_name_normalized_key"` twice within 3 ms at 2026-08-08T14:33:01Z. I cite it in F13 only as evidence that the `_layout.tsx` effect body runs concurrently; the category-seeding bug itself belongs to another domain.
- `SyncManager.start()` calls `resetDeadLetterEntries()` (`SyncManager.ts:45`, `syncQueue.ts:67-72`), which clears `retry_count` for every permanently-failing entry on every launch, while `drainQueue` stops the entire drain on the first error (`SyncManager.ts:140-142`). I believe this makes a single poison queue entry block all subsequent syncs indefinitely, which would affect recurring catch-up rows, but I could not confirm the failure mode without running the app and it belongs to the sync-domain audit.
- I could not determine whether `apps/web`'s calendar *lens* (Overview) shares F9's weekday-header bug; the brief reports the symptom ("1" in the FRI column for Sat Aug 1) but that grid is in a different component that I did not read in this pass.

## Refuted during verification

No finding was refuted in its entirety — all 37 original findings survive against the code, and one new finding (F38) was added. The following **sub-claims** were checked, found false, and have been corrected in place rather than carried forward:

- **F3 — "every foreign-currency row loses its converted amount permanently".** False. The FX `ADD COLUMN` loop and the destructive table swap were introduced by the *same* commit (`67b3858`, Jul 23 2026); `git show b2573aa:apps/mobile/src/services/sync/localDb.ts` confirms the prior schema had neither the FX columns nor a loosened `payment_method`. Any database that satisfies the swap condition therefore has all-NULL FX columns and nothing to lose. F3 stays Critical on the surviving mechanism (every transaction write fails for one session), not on data loss.
- **F8 — `getPeriodBounds` listed as a fourth site of the month-end overflow.** False. `useRecurringRules.ts:23-24`, `:27-28` and `:32` use the two-argument `setMonth(month, day)` form, which sets the day explicitly and cannot overflow; `end.setMonth(end.getMonth() + 1, 0)` is the correct "last day of this month" idiom. Removed from the list.
- **F16 — the worked DST example.** The arithmetic was wrong: `2026-10-31T23:30:00Z + 1 month` yields Dec 1 under UTC (November has 30 days, so the F8 overflow fires first), not Nov 30. The *conclusion* — the two runtimes land on different UTC dates — holds, and has been replaced with an executed example anchored at Oct 15 that isolates the DST effect from the overflow effect.
- **F21 — `setDate(` listed as an eight-site defect class.** Over-broad. Only `useRecurringRules.ts:16` is defective; every other `setDate(x + n)` site reads and writes the same `Date` object, which is the safe form. Narrowed.
- **F28 — "web includes `ask_conversations` that mobile omits".** False. Neither exporter touches `ask_conversations`. The real gap is `profile`, `categories`, `budgets` and `recurring_rules`, which the finding now enumerates correctly.
- **F30 — "two different unnamed rules of the same amount suppress each other's patterns".** Backwards. An unnamed rule produces the key `"|<cents>"`, and transactions with a null merchant are excluded at `recurringPatternDetector.ts:111`, so an unnamed rule can never match any bucket — it suppresses *nothing*. The defect is a missed suppression, not a false one.
- **F37 — "`en.json` is the only file with a duplicate key in this range".** False. `detail.recurring` is duplicated at lines 94 and 106 of `en.json`, `es.json`, `fr.json` **and** `pt.json`. The fix is four edits, not one.
- **F5 blast radius (a) — "the server can generate an occurrence on the same calendar day as the template".** Not reachable today. Both rule-creating paths anchor `last_generated` at or after the template's date, so the first generated occurrence is always a full cycle later. F5 downgraded High → Medium on this basis.
- **F31 — "over a long desktop session the page reloads its full dataset once per stale channel per change".** Cannot occur: the `supabase_realtime` publication contains zero tables on production, so no `postgres_changes` event ever fires. The channel leak is real; its stated symptom is not. Downgraded Medium → Low.
- **F23 and F32 — rated Medium.** Both are unreachable, not edge-case: no writer in the repo ever sets `interval ≠ 1`, and no writer ever leaves `last_generated` null. Both downgraded to Low.
- **F14 terminology.** The credential in `cron.job.command` is an `sb_secret_*` format Supabase secret key, not a JWT `service_role` token. The title, summary row and body now say so; remediation that assumes a JWT would be wrong.

**Verified:** every finding above was independently re-checked against the code on 2026-08-08.
