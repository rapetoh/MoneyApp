# Data layer: schema, sync engine, security, auth
**Audit date:** 2026-08-08 - **Scope:** migrations 001-012, both edge functions, the mobile offline sync engine, shared/supabase packages, web + mobile + desktop auth and session handling - **Files examined:** 47 - **Adversarially re-verified:** 2026-08-08

## Verdict
Not production-ready. The single worst problem is that **the offline sync engine is a one-way optimistic write log with no retry, no backoff, no conflict resolution, no failure surface, and no wipe on sign-out** — it looks like it works because SQLite always accepts the write locally, and the user is never told when the server never got it. Production proves it: `recurring_rules` has zero rows across every user despite five code paths that create rules, `sync_operations` (the conflict audit table the schema was designed around) has zero rows, `devices` has zero rows, the `supabase_realtime` publication contains **zero tables** so all six `postgres_changes` handlers in the codebase are dead, and `synced_at` is set on exactly one of eighteen rows by accident. The systemic cause is uniform: **every write path is fire-and-forget with the error discarded**, and **no Supabase client anywhere in the repo is typed against a generated `Database` schema**, so the compiler cannot see that the object being written does not match the table it is being written to. On top of that sit three genuine security holes, all re-confirmed against the live project: an RLS INSERT policy on `sync_operations` that reads `WITH CHECK (true)` for the `public` role with `anon` holding the `INSERT` grant (writes with the publishable key that ships in the app bundle), a desktop architecture that requires the **service-role key on the end user's machine**, and `NSAllowsArbitraryLoads: true` in the generated `apps/mobile/ios/Murmur/Info.plist` that EAS builds from.

Verification changed the picture in two places and only two: the local SQLite migration that drops the FX columns (F6) and the FK race that kills every recurring rule (F1) are the two defects that actually corrupt or lose money data today, and both are confirmed. Several findings that were filed as Critical or High turned out to be latent, dead-code, or hardening-only and have been downgraded; two were refuted outright.

## Findings summary
| # | Severity | Finding | Primary file |
|---|----------|---------|--------------|
| F1 | Critical | Marking a transaction recurring never creates a `recurring_rules` row — FK race, error swallowed | `apps/mobile/app/(tabs)/record.tsx:206` |
| F2 | Critical | Sign-out never clears SQLite or the sync queue — account-A data and poisoned queue survive into account B | `apps/mobile/src/hooks/useAuth.ts:36` |
| F3 | Critical | Desktop requires `SUPABASE_SERVICE_ROLE_KEY` in a plaintext file on the end user's machine | `apps/desktop/src/main.ts:102` |
| F4 | Critical | `sync_operations` INSERT policy is `WITH CHECK (true)` for role `public` — unauthenticated arbitrary writes | `supabase/migrations/001_initial_schema.sql:232` |
| F6 | Critical | Local SQLite migration drops the FX columns it just added — every write throws for a whole session, snapshots lost | `apps/mobile/src/services/sync/localDb.ts:85-145` |
| F7 | Critical | Web middleware redirects `/auth/callback` to `/login` before the code exchange — Google sign-in on web/desktop can never complete | `apps/web/middleware.ts:28-35` |
| F8 | Critical | Changing profile currency relabels every historical total without re-converting it | `apps/mobile/app/more/settings.tsx:440` |
| F5 | High | `supabase_realtime` publication is empty — all six `postgres_changes` handlers are permanently dead | `apps/mobile/src/hooks/useTransactions.ts:47-74` |
| F9 | High | Any `23505` is treated as a recurring-dedup conflict and silently soft-deletes the user's transaction (armed, not yet firing) | `apps/mobile/src/services/sync/SyncManager.ts:18-22` |
| F13 | High | One failing entry blocks the whole queue forever, with no user-visible failure surface | `apps/mobile/src/services/sync/SyncManager.ts:137-143` |
| F14 | High | Server-side conflict resolution is bare last-writer-wins; the audit log is never written | `apps/mobile/src/services/sync/SyncManager.ts:106-108` |
| F15 | High | `pullRemote` caps at 200 rows with no pagination — older history never reaches a new device | `apps/mobile/src/services/sync/SyncManager.ts:156-176` |
| F16 | High | Local upsert's conflict clause silently ignores 10 columns, including `is_recurring` and `recurring_rule_id` | `apps/mobile/src/services/sync/transactionStore.ts:60-77` |
| F17 | High | Categories, budgets and recurring rules are online-only in an "offline-first" app | `apps/mobile/src/hooks/useCategories.ts:9-58` |
| F18 | High | Web sign-up never seeds default categories — one production profile has zero | `apps/mobile/app/_layout.tsx:94-96` |
| F21 | High | `NSAllowsArbitraryLoads: true` is in the generated iOS Info.plist EAS builds from | `apps/mobile/app.config.js:20-28` |
| F22 | High | Recurring date arithmetic overflows month ends and advances one occurrence per cron run | `supabase/functions/generate-recurring/index.ts:40-58` |
| F10 | Medium | `transactions.synced_at` is never written to the server; the one non-null row is an accident | `apps/mobile/src/services/sync/SyncManager.ts:105-126` |
| F11 | Medium | `profiles.timezone` is never written by any code path — every profile is stuck on UTC | `apps/mobile/src/hooks/useProfile.ts:77-88` |
| F12 | Medium | No retry and no backoff exist; `retryTimer` is dead code | `apps/mobile/src/services/sync/SyncManager.ts:32` |
| F19 | Medium | Queue drains in `created_at` text order, not insertion order | `apps/mobile/src/services/sync/syncQueue.ts:34` |
| F23 | Medium | `handle_new_user` is `SECURITY DEFINER` with a mutable `search_path` and holds a redundant `anon` EXECUTE grant | `supabase/migrations/001_initial_schema.sql:40-50` |
| F24 | Medium | The Ask endpoint logs the user's question and a financial overview to server logs | `apps/web/src/app/api/ai/ask-murmur/route.ts:116-124` |
| F25 | Medium | Seeding, recurring catch-up and FX backfill re-fire on every navigation | `apps/mobile/app/_layout.tsx:94-106` |
| F26 | Medium | No Supabase client in the repo is typed — schema/TS drift is structurally undetectable | `apps/mobile/src/lib/supabase.ts:63` |
| F27 | Medium | The web SOURCE chip reports "Recurring" for manually-entered transactions | `apps/web/src/app/dashboard/transactions/page.tsx:64-72` |
| F28 | Medium | Migration 003's `client_id` idempotency key is not the conflict target the sync uses | `supabase/migrations/003_add_client_id_unique.sql:1-4` |
| F29 | Medium | `delete-user` has no rollback and misses `devices` / `sync_operations` explicitly | `supabase/functions/delete-user/index.ts:50-88` |
| F30 | Medium | `seedCategories` swallows every error and inserts all-or-nothing | `apps/mobile/src/services/seedCategories.ts:3-31` |
| F31 | Medium | `fxBackfill` repairs only server rows, never local SQLite | `apps/mobile/src/services/fxBackfill.ts:59-67` |
| F33 | Medium | Web env example omits the `NEXT_PUBLIC_*` vars the app cannot boot without | `apps/web/.env.local.example:1-3` |
| F34 | Medium | FX lookup failure stores `NULL` and `aggAmount()` turns that into `$0` in every total | `packages/shared/src/utils/fx.ts:36-40` |
| F32 | Low | `packages/supabase` is dead code that exports a service-role client factory | `packages/supabase/src/client.ts:19-33` |
| F35 | Low | `profiles` has no DELETE policy | `supabase/migrations/001_initial_schema.sql:26-37` |
| F36 | Low | `updateTransactionFields` interpolates caller-supplied keys into SQL | `apps/mobile/src/services/sync/transactionStore.ts:128-138` |
| F38 | Low | Google OAuth URL (with PKCE state) is written to the device log | `apps/mobile/src/services/googleAuth.ts:49` |
| F39 | Low | Mobile Privacy screen says analytics "Never"; web Settings offers an analytics opt-in toggle | `apps/mobile/app/more/privacy.tsx:258-259` |
| F40 | Low | Privacy screen contradicts itself on voice recordings — "stored on this device" vs "Not stored" | `apps/mobile/app/more/privacy.tsx:228-229` |
| F41 | Low | A stale duplicate Expo/EAS config at the repo root would build a Supabase-less, ATS-different binary | `app.json:1-15`, `eas.json:22-24` |

## Findings

### F1. Marking a transaction recurring never creates a recurring rule
- **Severity:** Critical
- **Status:** User-reported (web Recurring page shows "No recurring rules yet"); root cause newly discovered
- **Where:** `apps/mobile/app/(tabs)/record.tsx:186-217` (voice), `apps/mobile/app/(tabs)/record.tsx:283-306` (manual), `apps/mobile/app/(onboarding)/income.tsx:64-92` (onboarding income), `apps/mobile/app/transaction/edit.tsx:164-175` (edit), `apps/mobile/src/hooks/useRecurringRules.ts:112-143` (the insert), `apps/mobile/src/hooks/useTransactions.ts:123-131` (the write that has not landed yet), `supabase/migrations/001_initial_schema.sql:161-163` (the FK)
- **What the user sees:** You toggle "Recurring" when saving. The transaction saves, the row shows a recurring chip on mobile, and the web Transactions page shows a "Recurring" chip. But the web Recurring page says "No recurring rules yet", the Safe-to-Spend upcoming figure is always $0, and no future occurrence is ever generated. Verified in production: `recurring_rules` has **0 rows for every user**, while the Xtream row has `is_recurring=true, recurring_rule_id=NULL`.
- **Root cause:** `createTransaction` writes only to local SQLite and enqueues; the server write is fire-and-forget:

```ts
// useTransactions.ts:123-131
await upsertTransaction(txn)          // SQLite only
await loadLocal()
DataEvents.emitTransactions(userId)
await enqueue('create', txn.id, txn)  // queued
syncManager.drainQueue()              // NOT awaited
return { id: clientId, error: null }  // returns immediately
```

The caller then immediately inserts a rule that points at that transaction:

```ts
// record.tsx:206-216
await createRule({
  ...
  template_txn_id: txnId,   // this id exists ONLY in SQLite right now
})
```

`recurring_rules.template_txn_id` carries a real foreign key:

```sql
-- 001_initial_schema.sql:161-163
ALTER TABLE public.recurring_rules
  ADD CONSTRAINT fk_template_txn
  FOREIGN KEY (template_txn_id) REFERENCES public.transactions(id) ON DELETE SET NULL;
```

Postgres rejects the insert with `23503 foreign_key_violation` because the referenced transaction has not been upserted yet (and on a cold/slow network, may not be upserted for minutes). `createRule` swallows it:

```ts
// useRecurringRules.ts:133-140
if (error) {
  console.warn('[useRecurringRules] createRule failed:', error)
  return null
}
```

`console.warn` is invisible in a TestFlight build. All four callers ignore the `null` return. And because `createTransaction` already persisted the row with `recurring_rule_id: null` (`useTransactions.ts:111`) and nothing ever back-fills it, the transaction stays permanently orphaned even if a rule is created later.
- **Blast radius:** Every recurring feature is dead end-to-end: the `generate-recurring` cron has nothing to iterate (`is_active=true` returns zero rows), `runRecurringCatchUp` returns 0 immediately (`recurringCatchUp.ts:40`), `computeUpcomingRecurring` always returns 0 so Safe-to-Spend over-reports available money, the web Recurring page is permanently empty, Ask Murmur receives `recurring_rules: []` and reasons about a user with no fixed costs, and Insights' forecast has no recurring baseline. The onboarding income flow is hit too, so the very first thing a new user does silently half-fails.
- **Same defect elsewhere:** The same "write locally, then immediately reference the row on the server" pattern exists at `apps/mobile/app/(tabs)/record.tsx:294-306`, `apps/mobile/app/(onboarding)/income.tsx:81-91`, and `apps/mobile/app/transaction/edit.tsx:164-175` (this one usually succeeds because the transaction has had time to sync). **Added during verification:** there is a *fifth* rule-creation path the original write-up missed — `apps/web/src/app/dashboard/recurring/page.tsx:238-255` (`acceptCandidate`) inserts a `recurring_rules` row with `template_txn_id: c.templateTxnId` and destructures **nothing**, so its error is discarded entirely with not even a `console.warn`. That path does not have the FK race (the template transaction is already on the server), which makes it the one rule-creation site that could work — and production still shows zero rows, consistent with it simply never having been exercised. The broader "swallowed write error" class: `apps/mobile/src/hooks/useCategories.ts:38,47,56`, `apps/mobile/src/hooks/useBudget.ts:40-45`, `apps/mobile/src/hooks/useRecurringRules.ts:146,151,171`, `apps/mobile/src/services/seedCategories.ts:23`, `apps/mobile/src/services/recurringCatchUp.ts:65-68,127-130`, `apps/web/src/app/dashboard/recurring/page.tsx:238,266`, `apps/web/src/app/dashboard/budgets/page.tsx:175,200`. (grepped: `await supabase.from(`, `createRule(`, `template_txn_id`, `console.warn`, `from('recurring_rules')`)
- **Fix:** This needs the architecture, not a patch. Two changes, both required:
  1. **Make the rule the source of truth and drop the transaction→rule FK dependency at creation time.** `createRule` should not take `template_txn_id` at insert; create the rule first (it depends on nothing), then create the transaction with `recurring_rule_id` set to the new rule's id, then optionally `UPDATE recurring_rules SET template_txn_id = <txn id>` once the transaction has actually synced. `recurring_rule_id` on the transaction is the link every consumer already prefers (`edit.tsx:104-106` tries it first).
  2. **Route rule writes through the same sync queue as transactions.** `syncQueue` already declares `entity_type` and `SyncEntityType` already lists `'recurring_rule' | 'category' | 'budget'` (`packages/shared/src/types/sync.ts:2`) — the queue was designed for this and only transactions were ever wired up. Until rules are queued, any rule created offline is lost.
  Additionally, `createRule` must propagate its error to the caller and the caller must surface it; a money app may not fail silently.
- **Regression test to add:** Integration test: with the network stubbed to delay the transaction upsert by 2s, save a transaction with `is_recurring=true`, then assert that a `recurring_rules` row exists **and** that the saved transaction's `recurring_rule_id` is non-null.

---

### F2. Sign-out leaves the previous account's database and sync queue on the device
- **Severity:** Critical
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/hooks/useAuth.ts:36-38`, `apps/mobile/app/more/settings.tsx:163`, `apps/mobile/src/services/sync/transactionStore.ts:176-182` (the wipe that is never called on sign-out), `apps/mobile/src/services/sync/syncQueue.ts:17-29` (queue has no `user_id` column), `apps/mobile/src/services/sync/localDb.ts:52-62`
- **What the user sees:** Sign out of account A, sign in with account B on the same phone. Account B's transactions appear to save (they show in the list instantly) but never reach the server and never appear on web. Account A's full financial history also remains on disk in `voice_expense.db`, readable by anyone with the device or a filesystem backup.
- **Root cause:** Sign-out is one line:

```ts
// useAuth.ts:36-38
export async function signOut() {
  return supabase.auth.signOut()
}
```

`wipeAllUserData` exists and does the right thing, but it is only called from the account-deletion flow (`apps/mobile/app/more/privacy.tsx:181`) — never from sign-out. Two consequences:

1. **Queue poisoning.** The queue table has no user scoping — the code comments admit it: *"Sync queue is not user-scoped at the schema level (only one user is ever signed in at a time)"* (`transactionStore.ts:179-180`). Any of account A's entries still pending at sign-out carry `payload.user_id = A`. After account B signs in, `drainQueue` upserts them under B's JWT, RLS `WITH CHECK (auth.uid() = user_id)` rejects them, `incrementRetry` fires, and the drain loop does `hasMore = false; break` (`SyncManager.ts:140-142`). Because entries drain in `created_at ASC` order, A's entries sit at the head of the queue permanently — **every subsequent write by account B is blocked behind them**, forever, with no UI indication.
2. **Data at rest.** Account A's transactions, merchants, amounts and `raw_transcript` values stay in SQLite indefinitely. `getTransactions` filters by `user_id` so they are not *displayed* to B, but they are on disk.
- **Blast radius:** Every user who signs out and back in (including the owner's own two-Google-account test) ends with a mobile app that appears to work and silently stops syncing. Combined with F10 (no `synced_at` written) and F13 (no dead-letter surface) there is no way for a user or for support to detect it. RLS does prevent A's data being *written* under B's account, so this is a sync-death and data-at-rest problem rather than a cross-account read leak — but the queue-poisoning half is unrecoverable without reinstalling the app.
- **Same defect elsewhere:** Web sign-out at `apps/web/src/components/Sidebar.tsx:65` and `apps/web/src/app/dashboard/settings/page.tsx:261` has the same shape but no local store to clear, so it is benign there. `apps/mobile/src/services/profileCurrency.ts:21` keeps a module-level `cached` currency whose doc comment at `:17-18` claims *"Signing out resets to 'USD' via `useAuth`'s session listener (handled in app/_layout.tsx)"* — **there is no such reset in `_layout.tsx`** (re-verified: the file has no `onAuthStateChange` handler and no `setCurrentProfileCurrency` call at all); the previous account's currency leaks into the next account's FX snapshots. (grepped: `signOut`, `wipeAllUserData`, `AsyncStorage.clear`, `setCurrentProfileCurrency`, `onAuthStateChange`)
- **Fix:** Add a single `resetLocalState(userId)` teardown invoked from an `onAuthStateChange` handler on `SIGNED_OUT` (in `_layout.tsx`, so it runs regardless of which screen triggered sign-out). It must: `wipeAllUserData(previousUserId)`, `DELETE FROM sync_queue`, `setCurrentProfileCurrency('USD')`, and `syncManager.stop()`. Separately, add a `user_id` column to the local `sync_queue` table and filter `getPendingEntries` by the current session's user id — one-user-at-a-time is an assumption the schema should enforce, not a comment.
- **Regression test to add:** Sign in as A offline, create a transaction (queue depth 1), sign out, sign in as B, go online, create a transaction as B, and assert B's transaction reaches Supabase and the queue is empty.

---

### F3. The desktop app requires the Supabase service-role key on the end user's machine
- **Severity:** Critical
- **Status:** Newly discovered
- **Where:** `apps/desktop/src/main.ts:89-113` (loads `<userData>/.env`), `apps/desktop/src/main.ts:134-144` (injects it into the embedded Next server), `apps/web/src/lib/auth.ts:3-6` (the consumer), `apps/web/src/app/api/ai/ask-murmur/route.ts:52`, `apps/web/src/app/api/ai/parse-expense/route.ts:11`, `apps/web/src/app/api/ai/parse-scan/route.ts:12`, `apps/desktop/electron-builder.yml:18-22` (the embedded Next bundle is shipped as `extraResources`)
- **What the user sees:** Nothing — this is invisible until it is exploited. Functionally, Ask Murmur and receipt scanning on desktop either fail with a 500 or work because the user was handed a key file.
- **Root cause:** The desktop shell runs the entire Next.js server locally, including the `/api/ai/*` route handlers. Those handlers authenticate callers with a **service-role** client:

```ts
// apps/web/src/lib/auth.ts:3-6
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
```

and `main.ts` exists specifically to plant that variable on the user's machine:

```ts
// main.ts:102-113
function loadEnvFile(): NodeJS.ProcessEnv {
  const userDataEnv = join(app.getPath('userData'), '.env')
  if (!existsSync(userDataEnv)) return { ...process.env }
  const parsed = parseEnvFile(readFileSync(userDataEnv, 'utf8'))
  ...
}
```

The service-role key **bypasses RLS entirely for the whole project**. Anyone who has it can read, modify or delete every user's transactions, profiles, income figures and Ask conversations, and can call `auth.admin.*`. Shipping a paid desktop app whose only working configuration is "put the service-role key in `~/Library/Application Support/Murmur/.env`" means handing every purchaser full database admin. I confirmed the built bundles do **not** currently contain a literal key (`grep -roE "sb_secret_[A-Za-z0-9_-]{6}" apps/desktop/dist apps/desktop/release` → no hits; the routes reference `process.env` at runtime), so this is a design defect not yet an active breach — but the design has no other way to function.
- **Blast radius:** The entire database for all users. Also note the build ships **unsigned** on both platforms — `apps/desktop/electron-builder.yml:33-41` (`identity: null` with the Developer ID cert TODO) and `:61-64` (no Windows code-signing cert) — so the binary that reads that key file is itself unverifiable. Verified during re-check: `apps/desktop/dist/` and `apps/desktop/release/` exist and contain a built `Murmur-Setup-0.1.0.exe`; grepping both for `sb_secret_` still returns nothing, so no key is baked in today.
- **Same defect elsewhere:** `validateToken` is the only thing the service-role key is used for in the whole web app (grepped: `SERVICE_ROLE`, `createServerClient`, `supabaseAdmin`) — and it does not need admin rights. `packages/supabase/src/client.ts:19-33` exports a second, unused service-role factory (F32).
- **Fix:** Architectural. Two parts:
  1. Replace `validateToken` with an anon-key client: `createClient(url, ANON_KEY).auth.getUser(token)` validates a JWT perfectly well without service-role. That removes the only service-role dependency from the web/desktop surface, and the file `apps/web/src/lib/auth.ts` becomes safe to run anywhere.
  2. Do not run the AI routes locally on desktop at all. The desktop shell should call the hosted Vercel deployment for `/api/ai/*` (the mobile app already does exactly this via `EXPO_PUBLIC_API_BASE_URL`), so `OPENAI_API_KEY` never leaves the server either. `loadEnvFile()` and the whole `<userData>/.env` mechanism should then be deleted.
- **Regression test to add:** A CI check that greps the packaged desktop resources and the repo for `SERVICE_ROLE` outside `supabase/functions/**`, failing the build on any hit.

---

### F4. `sync_operations` accepts INSERTs from unauthenticated callers
- **Severity:** Critical
- **Status:** Newly discovered
- **Where:** `supabase/migrations/001_initial_schema.sql:226-236`
- **What the user sees:** Nothing directly — this is an open write endpoint on a production database that manages money.
- **Root cause:**

```sql
-- 001_initial_schema.sql:232-234
CREATE POLICY "Service role can insert sync operations"
  ON public.sync_operations FOR INSERT
  WITH CHECK (true);
```

There is no `TO service_role` clause, so the policy defaults to `TO PUBLIC` — which in Supabase includes both `anon` and `authenticated`. Re-verified against the live database during this pass: `pg_policies` shows `roles = {public}, cmd = INSERT, with_check = true`, and `information_schema.role_table_grants` returns `anon → sync_operations → INSERT` (along with SELECT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER). The publishable key `sb_publishable_HseSmiHYgNP-…` is committed in `apps/mobile/eas.json` in **all four** build profiles including `production`, and ships in every client bundle by design, so **anyone holding it can POST rows into `public.sync_operations`** with an arbitrary `jsonb` payload, arbitrary timestamps and unbounded volume, with no session.

  One correction to the original write-up: the `user_id` is *not* fully arbitrary. `sync_operations.user_id` is `uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` (`001:214`), so an inserted row must name a user id that actually exists. Since UUIDs are not guessable, the practical attack is "sign up once, then dump unbounded rows against your own id" (or against any id you have otherwise learned) rather than "write rows against any victim you choose". That narrows the impact from targeted audit-log forgery to volumetric abuse plus self-directed forgery — still an open write endpoint on a production money database, still Critical, but the mechanism should be stated accurately.

  The service-role key never needed a policy at all: service-role bypasses RLS.
- **Blast radius:** Unbounded storage growth and cost on the production project; poisoning of the table that is supposed to be the sync/conflict audit trail (i.e. the forensic record you would reach for after a money discrepancy). It does not expose other users' data — `SELECT` is correctly gated by `auth.uid() = user_id` — so this is a write/integrity hole, not a read leak.
- **Same defect elsewhere:** I read every policy in migrations 001-012 and re-verified the full list against `pg_policies` in production. This is the **only** `WITH CHECK (true)` on a user table. Coverage of the others: `transactions`, `categories`, `budgets`, `recurring_rules`, `devices`, `ask_conversations`, `ask_messages` all have `FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)` — correct. `profiles` has SELECT/INSERT/UPDATE keyed to `auth.uid() = id` but no DELETE (F35). `ai_usage_log` is `FOR ALL USING (false)`; because `WITH CHECK` is omitted on a `FOR ALL` policy Postgres reuses the `USING` expression, so writes are denied too — correct, though it also holds redundant `anon` grants. `default_categories` is SELECT-only `TO authenticated` (`004:16-19`) — correct. No table is missing RLS. Re-verified: `ai_usage_log` also carries full `anon`/`authenticated` table grants (INSERT/UPDATE/DELETE/TRUNCATE), which the `USING (false)` policy neutralises — so it is *currently* safe but only by one policy line, and it belongs in the same `REVOKE` as `sync_operations`.
- **Fix:** `DROP POLICY "Service role can insert sync operations" ON public.sync_operations;` in a new migration. Service-role clients bypass RLS and need no policy. If a client is ever meant to write its own audit rows, replace it with `FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)`. Also `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.sync_operations, public.ai_usage_log FROM anon, authenticated;` so the table grants match the intent.
- **Regression test to add:** A policy test that, using only the anon key, attempts `insert into sync_operations` and asserts a 401/42501 rather than a 201.

---

### F5. Every realtime subscription in the app is dead
- **Severity:** High *(downgraded from Critical during verification: nothing is stored wrong and nothing is lost — every surface still reaches the correct data on its next mount/reload/cold start. This is stale UI in a common path, which is High, not Critical.)*
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/hooks/useTransactions.ts:47-74`, `apps/web/src/app/dashboard/transactions/page.tsx:167-175`, `apps/web/src/app/dashboard/budgets/page.tsx:125-140` (two handlers on one channel), `apps/web/src/app/dashboard/recurring/page.tsx:199-210` (two handlers on one channel); no migration ever adds a table to the publication (grepped all of `supabase/migrations/*.sql` for `publication`). Re-verified count: **4 channels carrying 6 `postgres_changes` handlers** — `useTransactions.ts:54`, `transactions/page.tsx:169`, `budgets/page.tsx:127`, `budgets/page.tsx:137`, `recurring/page.tsx:201`, `recurring/page.tsx:206`.
- **What the user sees:** Save a transaction on the phone and the web dashboard does not update until you reload the page. Edit on web and the phone does not notice until the app is restarted. Two mobile devices never see each other's changes while both are open.
- **Root cause:** All six handlers subscribe to `postgres_changes`, e.g.

```ts
// useTransactions.ts:51-68
const channel = supabase
  .channel(channelName)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${userId}` }, ...)
  .subscribe()
```

Supabase only emits `postgres_changes` for tables that are members of the `supabase_realtime` publication. Verified in production:

```
select count(*) from pg_publication where pubname='supabase_realtime'        -> 1
select count(*) from pg_publication_tables where pubname='supabase_realtime' -> 0
```

The publication exists and contains **zero tables**. No migration adds any (`ALTER PUBLICATION` appears nowhere in the repo), so this is not a dashboard drift issue — a fresh environment built from these migrations would behave identically. `.subscribe()` returns `SUBSCRIBED` for an empty publication, so nothing errors; the callbacks simply never fire.
- **Blast radius:** Cross-device and cross-surface freshness is entirely fictional. `useTransactions` falls back to `pullRemote` on mount only (`useTransactions.ts:26-36`), which is why the mobile app looks "eventually consistent" — it is really "consistent at cold start, capped at 200 rows" (F15). The four dead subscriptions also silently mask F14: a device never learns that another device overwrote its edit.
- **Same defect elsewhere:** All six listed handlers across four channels; there are no others (grepped: `.channel(`, `postgres_changes`, `removeChannel` across `apps/**` and `packages/**`).
- **Fix:** Add a migration: `ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions, public.budgets, public.recurring_rules, public.categories;` and set `ALTER TABLE public.transactions REPLICA IDENTITY FULL` if DELETE events need the old row (the mobile handler at `useTransactions.ts:62` reads `payload.new` only, so soft-deletes arrive as UPDATEs and FULL is not strictly required). Then verify the callbacks actually fire — the subscription status callback is currently discarded, so add a `.subscribe((status) => …)` handler that logs a non-`SUBSCRIBED` status.
- **Regression test to add:** A migration test asserting `pg_publication_tables` contains `public.transactions` after all migrations run.

---

### F6. The local SQLite migration deletes the FX columns it just created
- **Severity:** Critical
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/services/sync/localDb.ts:80-90` (adds the columns), `apps/mobile/src/services/sync/localDb.ts:92-145` (rebuilds the table without them), `apps/mobile/src/services/sync/transactionStore.ts:53-59` (the INSERT that then fails), `packages/shared/src/utils/fx.ts:36-40`
- **What the user sees:** On the launch after updating the app, every save fails — the spinner hangs and the transaction never appears (or appears then vanishes). After a restart saves work again, but historical amounts have dropped out of the Overview / Insights / Budget totals, showing smaller numbers than the transaction list implies.
- **Root cause:** `migrateSchema` reads `PRAGMA table_info` once at line 72, then runs its steps in file order. Step "011" adds the FX columns:

```ts
// localDb.ts:85-90
for (const col of ['amount_in_profile_currency', 'fx_rate_to_profile', 'fx_rate_date']) {
  if (!tableInfo.some((c) => c.name === col)) {
    const colType = col === 'fx_rate_date' ? 'TEXT' : 'REAL'
    await db.execAsync(`ALTER TABLE transactions ADD COLUMN ${col} ${colType}`)
  }
}
```

Immediately afterwards, the `payment_method` NOT NULL fix rebuilds the table — and the replacement `CREATE TABLE transactions_new` (lines 105-130) **has no FX columns**, and the copy at lines 131-137 does not list them either:

```sql
CREATE TABLE transactions_new (
  ... merchant_domain TEXT, note TEXT, payment_method TEXT,
  transacted_at TEXT NOT NULL,        -- amount_in_profile_currency is gone
  ...
);
INSERT INTO transactions_new SELECT id, user_id, ..., payment_method, transacted_at, ... FROM transactions;
DROP TABLE transactions;
ALTER TABLE transactions_new RENAME TO transactions;
```

So on any install created before the `payment_method` change (i.e. every existing TestFlight tester), the three FX columns are created and then dropped in the same launch. **Confirmed during verification:** the legacy column really was `payment_method TEXT NOT NULL DEFAULT 'cash'` — `git log -p --follow apps/mobile/src/services/sync/localDb.ts` shows the exact line `- payment_method TEXT NOT NULL DEFAULT 'cash',` / `+ payment_method TEXT,`, so the `pm.notnull === 1 || pm.dflt_value !== null` guard at line 101 fires for every pre-existing database. New installs are unaffected (`CREATE TABLE IF NOT EXISTS` already produces the nullable, no-default column, so the guard is false and the rebuild is skipped) — the defect is scoped precisely to the upgrade path, which is every current tester.

`upsertTransaction` names all three in its INSERT (`transactionStore.ts:53-59`), so every write for the rest of that session throws `no such column: amount_in_profile_currency` — and `createTransaction` does not catch it, so the rejection propagates into the screen's save handler (`record.tsx:186`, which never reaches its `setConfirmSaving(false)`, so the spinner does hang exactly as described). The next launch re-adds the columns (the guard at line 86 sees them missing again) but as `NULL` for every existing row, and `aggAmount` is:

```ts
// fx.ts:36-40
export function aggAmount(t: { amount_in_profile_currency?: number | null }): number {
  return t.amount_in_profile_currency ?? 0
}
```

so every historical row contributes **$0** to every total until a `pullRemote` happens to bring the server's value back.
- **Blast radius:** Wrong money on the Home total, Insights, Budget ring, Safe-to-Spend, Export and the Ask Murmur context — all of which call `aggAmount`. Plus a full launch during which no transaction can be saved.
- **Same defect elsewhere:** This is the only table rebuild in the codebase (grepped: `transactions_new`, `DROP TABLE`, `ALTER TABLE transactions ADD COLUMN`). The same *class* of defect — a hand-rolled migration sequence with no version marker — is the underlying issue: `migrateSchema` has no `user_version` pragma, so it re-derives what to do from `PRAGMA table_info` on every launch and the steps are order-dependent with no way to assert ordering.
- **Fix:** Architectural, not a patch. Move `initSchema`/`migrateSchema` to a numbered migration runner keyed on `PRAGMA user_version`: each migration is a pure `(db) => Promise<void>` applied exactly once, in order, inside a transaction, with `user_version` bumped on success. As the immediate correctness fix, the `transactions_new` DDL and its `INSERT ... SELECT` must include `amount_in_profile_currency`, `fx_rate_to_profile`, `fx_rate_date`, and the rebuild must run *before* the ADD COLUMN loop, not after.
- **Regression test to add:** A test that builds a legacy SQLite file (with `payment_method TEXT NOT NULL DEFAULT 'cash'` and no FX columns), runs `getDb()`, and asserts that all three FX columns exist and that `upsertTransaction` succeeds afterwards.

---

### F7. The web OAuth callback is unreachable — middleware redirects it to /login
- **Severity:** Critical
- **Status:** Newly discovered
- **Where:** `apps/web/middleware.ts:28-46`, `apps/web/src/app/auth/callback/route.ts:4-17`, `apps/web/src/app/login/page.tsx:25-39`
- **What the user sees:** Click "Continue with Google" on the web dashboard (or in the desktop app), complete the Google consent screen, and land back on the login page with no error and no session. It never signs you in.
- **Root cause:** The middleware matcher covers everything except `_next/static`, `_next/image` and `favicon.ico`, so it runs on `/auth/callback`. At that moment the PKCE code has not been exchanged yet, so there is no session cookie and `getUser()` returns null:

```ts
// middleware.ts:28-35
const { data: { user } } = await supabase.auth.getUser()
const isLoginPage = request.nextUrl.pathname.startsWith('/login')
const isApiRoute = request.nextUrl.pathname.startsWith('/api')

if (!user && !isLoginPage && !isApiRoute) {
  return NextResponse.redirect(new URL('/login', request.url))
}
```

`/auth/callback` is neither a login page nor an API route, so the request is redirected to `/login` and `exchangeCodeForSession(code)` (`callback/route.ts:11`) never runs. The `?code=` is discarded. The user is not even shown `?error=auth_failed`, because that branch belongs to the route handler that never executed — which is exactly why this has gone unnoticed.
- **Blast radius:** Google sign-in is completely broken on web and on desktop (the desktop shell loads the same Next app). The production evidence is consistent with this: the tester's Google accounts were created on **mobile**, which uses an entirely different path (`apps/mobile/src/services/googleAuth.ts:51-67` drives its own browser session and calls `exchangeCodeForSession` in-process, never touching `/auth/callback`).
- **Same defect elsewhere:** The same allow-list omission would break any future unauthenticated route (password reset confirmation, email verification landing, magic-link callback). The `/api` exemption is correct today only because each AI route calls `validateToken` itself (`parse-expense/route.ts:11`, `ask-murmur/route.ts:52`, `parse-scan/route.ts`) — but the exemption is blanket, so a new API route added without `validateToken` would be publicly reachable by construction. (grepped: `middleware`, `matcher`, `exchangeCodeForSession`, `validateToken`)
- **Fix:** Add the auth routes to the public allow-list in `middleware.ts`, as a named constant rather than inline string checks:
  `const PUBLIC_PATHS = ['/login', '/auth/callback', '/auth/confirm']` and skip the redirect when `PUBLIC_PATHS.some(p => pathname.startsWith(p))`. Separately, replace the blanket `/api` exemption with an explicit list, so an unprotected API route fails closed instead of open.
- **Regression test to add:** An E2E test that GETs `/auth/callback?code=fake` with no session cookie and asserts the response is handled by the route (redirect to `/login?error=auth_failed`), not a bare redirect to `/login`.

---

### F8. Changing the profile currency relabels every past total without converting it
- **Severity:** Critical
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/more/settings.tsx:440`, `apps/web/src/app/dashboard/settings/page.tsx:246-255`, `packages/shared/src/utils/fx.ts:36-40`, `supabase/migrations/011_fx_snapshot.sql:27-44`, `apps/mobile/src/services/fxBackfill.ts:34-43`
- **What the user sees:** Switch your currency from USD to EUR in Settings. Every screen instantly shows the same numbers with a euro sign: a $2,000 month becomes "€2,000". Nothing was converted.
- **Root cause:** Migration 011's entire premise is that `amount_in_profile_currency` is denominated in the profile's currency, and every aggregation sums that column via `aggAmount`. But the currency switch is a bare column write:

```ts
// apps/mobile/app/more/settings.tsx:440
await updateProfile({ currency_code: c })
```

```ts
// apps/web/src/app/dashboard/settings/page.tsx:246-255
await supabase.from('profiles').update({ display_name: ..., currency_code: currency, locale, monthly_income: parsedIncome }).eq('id', user.id)
```

Neither re-snapshots the existing rows. The FX backfill cannot repair it either — it only targets rows where the snapshot is **null**:

```ts
// fxBackfill.ts:39
.is('amount_in_profile_currency', null)
```

so every already-filled row keeps its old-currency figure while the UI formats it with the new symbol.
- **Blast radius:** Wrong money on every aggregate surface on every platform simultaneously — Overview, Insights, Budgets, Safe-to-Spend, Export CSV/JSON, and the Ask Murmur data context (which is told `currency: <new>` while the numbers are `<old>`, so the model reasons and answers in the wrong currency). It also corrupts `monthly_income`, which is a bare number with no currency snapshot at all.
- **Same defect elsewhere:** Both settings screens above; the onboarding currency choice does not exist yet so there is no third site. Related: `apps/mobile/src/services/profileCurrency.ts:21` defaults the cache to `'USD'` and `createTransaction` reads it at `useTransactions.ts:89` before the profile may have loaded, so a non-USD user's first transaction after cold start can be snapshotted against the wrong target currency. (grepped: `currency_code`, `amount_in_profile_currency`, `getCurrentProfileCurrency`, `snapshotFx`)
- **Fix:** Currency change must be a re-denomination operation, not a column write. Add a `changeProfileCurrency(from, to)` service that, in one transaction: updates `profiles.currency_code`, then for every non-deleted transaction recomputes `amount_in_profile_currency = amount * rate(transacted_at, currency_code, newProfileCurrency)` and rewrites `fx_rate_to_profile` / `fx_rate_date`. It should be batched and resumable (the same batching `fxBackfill` already has) and must block the UI with an explicit "Converting your history…" state, because a half-converted account shows wrong money. `monthly_income` needs the same treatment or an explicit currency column.
- **Regression test to add:** Seed a USD profile with two transactions, switch the profile to EUR, and assert every `amount_in_profile_currency` changed and equals `amount * rate` for the transaction's own date.

---

### F9. Any unique-constraint violation silently deletes the user's transaction
- **Severity:** High *(downgraded from Critical during verification. I traced every path that can produce a `23505` on `public.transactions` today: the only two unique constraints besides the primary key are `transactions_client_id_unique` and `idx_txn_recurring_dedup`. Every writer in the repo sets `client_id = id` (`useTransactions.ts:93,112`, `recurringCatchUp.ts:84,104`, `generate-recurring/index.ts:160,176`, `transactions/page.tsx:325,335`) and the upsert conflicts on `id`, so a `client_id` collision cannot currently occur; the only reachable `23505` is the dedup index, where the destructive branch is the intended behaviour. No user's data is being deleted today. The defect is that the guard is a landmine, not that it is firing — that is High, not Critical.)*
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/services/sync/SyncManager.ts:13-22`, `apps/mobile/src/services/sync/SyncManager.ts:109-123`, `supabase/migrations/003_add_client_id_unique.sql:3`, `supabase/migrations/008_recurring_dedup_constraint.sql:57-64`
- **What the user sees:** A transaction you saved disappears from the list on its own, with no message, and never exists on the server.
- **Root cause:** The handler is documented as narrowly targeting migration 008's dedup index, but the predicate matches **every** `23505`:

```ts
// SyncManager.ts:18-22
function isRecurringDedupConflict(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '23505') return true                          // <- any unique violation
  return Boolean(error.message?.includes('idx_txn_recurring_dedup'))
}
```

and the consequence of a match is destructive:

```ts
// SyncManager.ts:117-121
if (isRecurringDedupConflict(error)) {
  await softDeleteTransaction(payload.id)   // wipes the user's row locally
  await removeEntry(entry.id)               // and gives up on syncing it
  continue
}
```

`public.transactions` carries two unique constraints besides the primary key: `transactions_client_id_unique` (migration 003) and `idx_txn_recurring_dedup` (migration 008). A violation of the former — or of any constraint added in future — is indistinguishable to this code from "the server already made this recurring occurrence", so the user's money record is soft-deleted on their device and dropped from the queue with no retry and no notice. The `.code === '23505'` branch was written first *because* the message check is unreliable; the effect is that the specific check is never reached.
- **Blast radius:** Silent, unrecoverable loss of an individual transaction *once it can fire*. Latent today, for the reasons traced in the severity note — but armed: the moment any new unique constraint lands, or any code path mints a fresh `id` for a retried operation while reusing `client_id` (which is exactly the refactor F28 recommends), the failure mode becomes "delete the user's data". F28 and F9 must therefore be fixed in that order: fixing the constraint predicate here is a prerequisite for making `client_id` the real idempotency key.
- **Same defect elsewhere:** This is the only destructive error branch in the sync path (grepped: `23505`, `softDeleteTransaction`, `removeEntry`). Note the related asymmetry — the recurring-dedup path is the **only** error the sync engine handles specifically; every other error falls through to `incrementRetry` + head-of-line block (F13).
- **Fix:** Match on the constraint name, not the SQLSTATE, and never delete on an unrecognised error:
  ```ts
  const isDedup = error.code === '23505' && /idx_txn_recurring_dedup/.test(error.message ?? '')
  ```
  For any other `23505`, treat it as a hard failure: move the entry to the dead-letter state and surface it (see F13's fix), because a unique violation the client did not anticipate means the client's model of the server is wrong and a human needs to see it.
- **Regression test to add:** Stub the upsert to return `{ code: '23505', message: 'duplicate key value violates constraint "transactions_client_id_unique"' }` and assert the local transaction is still present and the queue entry is *not* dropped.

---

### F10. `synced_at` is never written to the server; the one non-null row is an accident
- **Severity:** Medium *(downgraded from High during verification. The finding's own blast-radius analysis is right and I re-confirmed it by grep: no read anywhere in the repo gates behaviour on `synced_at` — the local `sync_queue` table is the sole pending-work signal. So nothing is wrong for the user and nothing is lost; a declared integrity column that is written by accident is "confusing/inconsistent but not wrong", which is Medium.)*
- **Status:** User-reported (17 of 18 production rows NULL)
- **Where:** `apps/mobile/src/hooks/useTransactions.ts:117`, `apps/mobile/src/services/sync/SyncManager.ts:105-126`, `apps/mobile/src/services/recurringCatchUp.ts:109`, `apps/web/src/app/dashboard/transactions/page.tsx:325-338`, `supabase/functions/generate-recurring/index.ts:159-182`, `supabase/migrations/001_initial_schema.sql:143`
- **What the user sees:** Nothing directly. But there is no way — for the user, for support, or for you — to answer "did this transaction actually reach the server?" from the data.
- **Root cause:** `createTransaction` builds the payload with `synced_at: null` (`useTransactions.ts:117`), that whole object is serialized into the queue entry (`useTransactions.ts:128`), and the queue entry is what gets upserted:

```ts
// SyncManager.ts:105-108
const { raw_transcript: _stripped, ...serverPayload } = payload
const { error } = await supabase.from('transactions').upsert(serverPayload, { onConflict: 'id' })
```

`serverPayload.synced_at` is `null`, so the column is explicitly written as NULL. Only *afterwards* is the timestamp applied — and only to SQLite:

```ts
// SyncManager.ts:126
await upsertTransaction({ ...payload, synced_at: new Date().toISOString() })
```

I confirmed the mechanism against production. The single row with a non-null `synced_at` is `Chick-fil-A`, `version = 4`, `synced_at = 2026-04-19`, `updated_at = 2026-07-24`. That is an **edited** row: `editTransaction` re-reads the row from SQLite *after* the local stamp and enqueues it (`useTransactions.ts:185-190`), so the locally-stamped value rides along to the server on an `update` operation. It is stale by three months and describes a sync event, not the sync of that version. `generate-recurring` and the web insert path never set the column at all.
- **Blast radius:** Answering item (1) directly: **nothing decides "needs upload" from `synced_at`** — the local `sync_queue` table is the only pending-work signal (grepped: `synced_at` returns only the write sites above plus type/DDL declarations; no read ever gates behaviour on it). So there is no data-loss consequence today, but the column is a lie: it is the field an auditor, a support tool, or a future reconciliation job would trust, and it would be wrong on 94% of rows and stale on the rest. On a money app, a nullable integrity column that is written by accident is worse than no column.
- **Same defect elsewhere:** The same "sync-state field that is never populated" class covers `devices.last_synced_at` and the whole `devices` table (0 rows in production, never written anywhere — grepped `from('devices')`: no hits) and `sync_operations` (0 rows, never written — grepped `sync_operations`: no hits outside the migration).
- **Fix:** Decide what the column means and enforce it server-side. The correct architecture is a database default the client cannot get wrong: `ALTER TABLE public.transactions ALTER COLUMN synced_at SET DEFAULT now()`, plus a `BEFORE INSERT OR UPDATE` trigger setting `NEW.synced_at = now()` — the server is the only party that knows when it received the row, and the client's clock is untrusted anyway (F19). Then strip `synced_at` from the outbound payload in `SyncManager` exactly the way `raw_transcript` is stripped, and keep the local column as a purely local "we believe this is uploaded" marker. If instead the column is not wanted, delete it from the schema and the `Transaction` type rather than leaving it half-written.
- **Regression test to add:** Create a transaction, drain the queue, re-fetch the row from Supabase, and assert `synced_at IS NOT NULL` and within a second of now.

---

### F11. `profiles.timezone` is never written by any code path
- **Severity:** Medium *(downgraded from High during verification. The dead column is exactly as described, but I checked each claimed downstream symptom and most of the client-side date math is in fact device-local and correct: `useMonthSummary` (`useTransactions.ts:201-205`) and `usePeriodSpend` (`useBudget.ts:85-108`) both build the boundary with `new Date(y, m, 1)` in device-local time and compare against `transacted_at`, so mobile month boundaries are right for a non-UTC user. What is genuinely wrong is narrower — see the corrected blast radius — and it is edge-case wrong, i.e. Medium.)*
- **Status:** User-reported (all 6 production profiles are `'UTC'`)
- **Where:** `supabase/migrations/001_initial_schema.sql:18` (the column), `supabase/migrations/001_initial_schema.sql:40-50` (`handle_new_user`, which does not set it), `apps/mobile/src/hooks/useProfile.ts:77-88` (`updateProfile`, the only writer), `packages/shared/src/types/profile.ts:10` (the type), and all four `updateProfile` call sites: `apps/mobile/app/more/settings.tsx:169,380,440,468`, `apps/mobile/app/(onboarding)/income.tsx:48-52`
- **What the user sees:** Nothing on the mobile month totals — those are computed device-local. What is wrong: the FX rate attached to an evening transaction is dated to the *UTC* day, and every server-side computation (the recurring cron, migration 008's dedup key) runs in UTC with no knowledge of where the user is. The column that was supposed to reconcile the two halves is dead.
- **Root cause:** There is no writer. Exhaustively, the string `timezone` appears exactly three times in the entire repo:

```
packages/shared/src/types/ai.ts:74    (a comment)
packages/shared/src/types/profile.ts:10  (the type field)
supabase/migrations/001_initial_schema.sql:18  (the column, DEFAULT 'UTC')
```

`handle_new_user` inserts only `(id, display_name)`, so every profile is created with the column default and nothing ever updates it. `ProfileUpdate` permits `timezone` (`profile.ts:33`) but no call site passes it. Confirming the corollary: `Intl.DateTimeFormat().resolvedOptions().timeZone` and `getTimezoneOffset` appear **nowhere** in the codebase (grepped: `resolvedOptions`, `getTimezoneOffset`, `timeZone`). Device-local date math is done with bare `Date` (`packages/shared/src/utils/date.ts:1-7`, `useTransactions.ts:201-202`, `useBudget.ts:85-101`) which uses whatever zone the device is in, while every server-side computation (`generate-recurring/index.ts:81`, migration 008's `AT TIME ZONE 'UTC'`, migration 011's `fx_rate_date`) uses UTC. The two are never reconciled, and the column that was supposed to reconcile them is dead.
- **Blast radius (corrected during verification):** Answering item (2), with the two sub-claims that survived checking and the one that did not.
  - **Survives:** `transacted_at` is stamped with device-local `new Date()` (correct, it is a `timestamptz`) but `fx_rate_date` is derived by `isoDateOrTimestamp.slice(0, 10)` in `fx.ts:79`, i.e. the **UTC** date, so a Central-time evening transaction snapshots the *next* day's FX rate. Harmless for the same-currency short-circuit (`fx.ts:80` returns rate 1 without a network call), real for foreign-currency rows.
  - **Survives:** migration 008's dedup index keys on `((transacted_at AT TIME ZONE 'UTC')::date)` (`008:57-64`) while the local mirror index keys on `substr(transacted_at, 1, 10)` of the ISO string (`localDb.ts:180-184`) — the same UTC slice, so the two agree with each other but both disagree with the user's calendar day. A recurring occurrence at 19:00 CDT and one at 20:00 CDT on the same local evening straddle the UTC date boundary and both are allowed.
  - **REFUTED sub-claim:** the original write-up asserted that the web date picker's `new Date(fDate).toISOString()` (`transactions/page.tsx:281`) "parses `YYYY-MM-DD` as UTC midnight, so a Central user picking Aug 8 stores Aug 7 19:00 local". That is wrong. `fDate` comes from `toLocalInputValue` (`transactions/page.tsx:47-51`), which emits the `datetime-local` form `YYYY-MM-DDTHH:mm`. Per ES2015+, a date-*time* form without a `Z`/offset is parsed as **local** time; only the bare date-only form is parsed as UTC. The web picker is correct and this sub-claim has been deleted.
- **Same defect elsewhere:** The identical "declared but never populated" class also covers `profiles.currency_code` (populated only by the DB default `'USD'`; `handle_new_user` does not read device locale) and `profiles.locale` (same). Note that unlike timezone, currency and locale at least have Settings writers.
- **Fix:** Populate the profile from the device on first authenticated load, then make the *server* the consumer. In `useProfile`, after a successful fetch, if `profile.timezone !== deviceTz` (from `Intl.DateTimeFormat().resolvedOptions().timeZone`) issue an `updateProfile({ timezone: deviceTz })`. Then the two places that actually need it: (1) `snapshotFx`/`fetchFxRate` must take the zone and derive `fx_rate_date` as the user's local calendar day rather than `isoDateOrTimestamp.slice(0, 10)`; (2) `generate-recurring` must read `profiles.timezone` and compute occurrence dates — and the dedup key — in the user's zone rather than `AT TIME ZONE 'UTC'`. Do **not** rewrite the client-side month/period boundaries: they are already device-local and correct, and converting them to profile-zone would be a behaviour change, not a fix. The invariant to write down and enforce is "calendar-day decisions use the profile timezone; instant comparisons use the raw `timestamptz`" — as long as one half of the codebase silently means UTC and the other silently means device-local, they will keep disagreeing by a day.
- **Regression test to add:** With `TZ=America/Chicago`, create a EUR transaction at 23:30 local on the last day of a month against a USD profile and assert its `fx_rate_date` equals the local calendar date, not the UTC one.

---

### F12. There is no retry and no backoff — the field exists but is never used
- **Severity:** Medium *(downgraded from High during verification. `retryTimer` really is dead — grepping `SyncManager.ts` for `setTimeout|setInterval|retryTimer =` returns only the declaration at :32 and the clear at :54-57, nothing assigns it. But the drain is triggered more often than the write-up implies: after every `createTransaction`/`editTransaction`/`deleteTransaction` (`useTransactions.ts:129,150,190` and `transaction/[id].tsx:162`), on every NetInfo transition to online, **and on every cold start** — `_layout.tsx:39` calls `syncManager.start()`, which calls `NetInfo.fetch().then(this.handleNetworkChange)` with `isOnline` still `false`, so `wasOffline` is true and a drain always runs at launch. A transient failure therefore self-heals on the next app open or the next write, not "indefinitely". The unbounded stranding case belongs to F13's permanently-failing entry, not to the missing backoff.)*
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/services/sync/SyncManager.ts:1-5` (the docstring), `:32` (the declaration), `:54-57` (the only other reference), `:69-75` (the only drain trigger)
- **What the user sees:** A transaction saved during a brief network hiccup stays unsynced until the phone changes network state or the app is restarted. On web it simply never appears.
- **Root cause:** The class docstring promises *"Drains the sync queue when online (chronologically, with exponential backoff)"* and declares the timer:

```ts
// SyncManager.ts:32
private retryTimer: ReturnType<typeof setTimeout> | null = null
```

but `retryTimer` is only ever **cleared**, in `stop()` (lines 54-57). No code ever assigns it. Grepping the file for `setTimeout`, `setInterval` or `retryTimer =` returns nothing but the declaration and the clear. The only path that starts a drain is a network transition:

```ts
// SyncManager.ts:69-75
private handleNetworkChange = (state: NetInfoState): void => {
  const wasOffline = !this.isOnline
  this.isOnline = Boolean(state.isConnected && state.isInternetReachable !== false)
  if (this.isOnline && wasOffline) { this.drainQueue() }
}
```

plus the explicit `syncManager.drainQueue()` calls after each write, plus the `NetInfo.fetch()` at `start()` (`:48`) which fires a drain on every cold start. So if a drain fails while the device stays online (a 500, a timeout, an expired token mid-request), nothing retries until the user writes again, changes network state, or restarts the app.
- **Blast radius:** Combined with F13 (one failure stops the whole drain) and F10 (no server-visible sync state), a transient error leaves the queue stalled for the rest of the session with zero signal. The user's transactions exist only on their phone until the next launch or the next write — a window of minutes-to-hours in normal use, and unbounded only when the head entry is permanently poisoned (F2, F9), which is F13's territory.
- **Same defect elsewhere:** No other component implements retry either — `pullRemote` returns silently on error (`SyncManager.ts:171`), `fxBackfill` skips failed rows and returns (`fxBackfill.ts:58,67`), `seedCategories` does not check its insert at all (`seedCategories.ts:23`). (grepped: `setTimeout`, `backoff`, `retry`)
- **Fix:** Implement the backoff the docstring already promises: on a failed drain, schedule `this.retryTimer = setTimeout(() => this.drainQueue(), delay)` with `delay = min(30_000, 1000 * 2 ** attempt) + jitter`, reset on success, cleared in `stop()`. Also drain on `AppState` returning to `active`, not only on NetInfo transitions — an app resumed after hours offline currently only drains if the network flag happens to flip.
- **Regression test to add:** Stub the upsert to fail twice then succeed; assert the transaction reaches the server without any network-state change and that the delay between attempts grows.

---

### F13. A single failing entry blocks the entire queue, with no surface to see it
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/services/sync/SyncManager.ts:137-143`, `apps/mobile/src/services/sync/syncQueue.ts:31-38`, `:53-64` (dead code), `:66-72`, `apps/mobile/src/services/sync/SyncManager.ts:41-49`
- **What the user sees:** Transactions stop syncing. The app shows no error; the list is complete locally, the web dashboard is missing rows, and there is nothing to tap to find out why.
- **Root cause:** Three compounding decisions:

```ts
// SyncManager.ts:137-143
} catch (err) {
  await incrementRetry(entry.id, message)
  // Stop draining on error — will retry next time we go online
  hasMore = false
  break
}
```

1. **Head-of-line blocking.** Entries are fetched oldest-first (`syncQueue.ts:34`) and the first failure aborts the whole loop, so every later entry — including ones that would succeed — is blocked behind a permanently-failing one.
2. **The dead-letter escape hatch is dead code.** `getDeadLetterEntries` and `clearDeadLetterEntry` (`syncQueue.ts:53-64`) are **never called from anywhere** (grepped repo-wide: only the definitions). There is no screen, no badge and no log that reveals a stuck queue.
3. **Poison entries are resurrected on every launch.** `start()` calls `resetDeadLetterEntries()` (`SyncManager.ts:45`), which sets `retry_count = 0` for every entry at or over the cap:
```sql
UPDATE sync_queue SET retry_count = 0, last_error = NULL WHERE retry_count >= 5
```
So an entry that can never succeed (F2's cross-account payload, a violated constraint, malformed data) is re-armed at every cold start and blocks the queue again forever. The `retry_count < 5` filter, which is the only thing that could route around a poison entry, is neutralised by design.
- **Blast radius:** This is the amplifier that turns any single sync bug into total sync failure, and it is why F2 is Critical rather than annoying. It also means the app cannot self-report: `notify(false, 0)` in the `finally` block (`SyncManager.ts:148`) reports zero pending regardless of the real queue depth, so any UI bound to the sync listener shows "all synced" while the queue is jammed.
- **Same defect elsewhere:** The `notify(false, 0)` misreport is a second instance of the same "report success unconditionally" habit; `getPendingEntries` is the only place `retry_count` is consulted. (grepped: `retry_count`, `getDeadLetterEntries`, `resetDeadLetterEntries`, `notify(`)
- **Fix:** Three changes. (a) On entry failure, isolate per entry instead of `break`ing the whole drain — **but a bare `continue` is not enough and would introduce a new bug**: `hasMore` stays `true`, the outer `while` re-runs `getPendingEntries(10)`, and the same still-pending head entries come back, so the loop re-processes them until `retry_count` reaches 5. The drain must track the entry ids it has already attempted in this run (or page with an `id > cursor` predicate instead of a bare `LIMIT`) and exit when a page yields no progress. (b) Delete `resetDeadLetterEntries()` from `start()`; a permanently-failing entry must stay dead-lettered. (c) Wire the existing `getDeadLetterEntries` into a real surface: a "N changes could not be synced" row in Settings that shows `last_error` and offers retry/discard. Also make `notify()` report the true pending count from `SELECT count(*) FROM sync_queue`.
- **Regression test to add:** Enqueue three entries where the first always fails; drain; assert entries 2 and 3 reached the server and entry 1 is dead-lettered and visible via `getDeadLetterEntries`.

---

### F14. Conflict resolution is bare last-writer-wins, and the audit table designed for it is empty
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/services/sync/SyncManager.ts:106-108`, `apps/mobile/src/services/sync/transactionStore.ts:60-77`, `apps/web/src/app/dashboard/transactions/page.tsx:301-311`, `supabase/migrations/001_initial_schema.sql:212-236`, `packages/shared/src/types/sync.ts:3`
- **What the user sees:** Edit the same transaction on your phone (offline) and on the web. Whichever one syncs *later in wall-clock arrival order* wins outright; the other edit vanishes with no prompt, no merge and no record that it happened.
- **Root cause:** The local store implements optimistic concurrency:

```sql
-- transactionStore.ts:77
WHERE excluded.version >= transactions.version
```

but the server write has no equivalent predicate:

```ts
// SyncManager.ts:106-108
const { error } = await supabase.from('transactions').upsert(serverPayload, { onConflict: 'id' })
```

There is no `.eq('version', expectedVersion)`, no `updated_at` precondition, and PostgREST's upsert overwrites unconditionally. The web app has the same shape — it computes `version: (row?.version ?? 1) + 1` from `transactions.find((t) => t.id === editingId)`, i.e. whatever it last loaded, and writes it without checking (`transactions/page.tsx:301-311`). So two devices both at `version 1` both write `version 2`; the second arrival silently overwrites the first, and both devices later pull `version 2` and believe they are consistent.

The schema anticipated this exactly: `sync_operations` has `is_conflict boolean` and `conflict_resolution text CHECK (... 'last_write_wins','kept_server','kept_client','merged')` (`001:222-223`), and `packages/shared/src/types/sync.ts:3` exports the matching `ConflictResolution` type. **No code ever writes a row to `sync_operations`** (grepped repo-wide: zero hits outside the migration) and production confirms `count(*) = 0`. The conflict-detection design was specified and never implemented.
- **Blast radius:** Silent loss of a money edit whenever two surfaces touch the same row — which is the app's headline feature (phone + web + desktop on one account). Because realtime is dead (F5), the losing device does not even refresh to show the winner until its next cold start, so the two devices display different amounts for the same transaction simultaneously.
- **Same defect elsewhere:** Same unconditional overwrite in the delete path (`SyncManager.ts:128-133` — `.update(...).eq('id').eq('user_id')` with no version predicate), in the web delete (`transactions/page.tsx:358-368`, corrected from the original write-up's `331-340`, which pointed at the *insert* block), in the mobile delete (`transaction/[id].tsx:154-162`, which likewise sends `version: snapshot.version + 1` with no precondition), in `fxBackfill` (`fxBackfill.ts:59-66`), in `recurringCatchUp`'s `last_generated` writes (`recurringCatchUp.ts:65-68,127-130`) and in every `useCategories` / `useBudget` / `useRecurringRules` update. (grepped: `.upsert(`, `.update(`, `version`)
- **Fix:** Enforce the version invariant on the server, where both clients meet. Add a `BEFORE UPDATE` trigger on `public.transactions` that rejects (or ignores) a write whose incoming `version` is not greater than the stored one, or move the sync write to an RPC `sync_upsert_transaction(payload jsonb)` that does `INSERT ... ON CONFLICT (id) DO UPDATE ... WHERE EXCLUDED.version > transactions.version RETURNING *`, returning the winning row so the client can detect that it lost and re-pull. Then actually write `sync_operations` rows from that RPC — the table, the enum and the type already exist. Field-level merge (amount from one device, category from another) is the eventual right answer, but detection first.
- **Regression test to add:** Two clients read `version 1`; both write `version 2` with different amounts; assert the second write is rejected, the client re-pulls, and a `sync_operations` row with `is_conflict = true` exists.

---

### F15. `pullRemote` caps at 200 rows with no pagination
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/services/sync/SyncManager.ts:156-176`, `apps/mobile/src/hooks/useTransactions.ts:26-36`
- **What the user sees:** On a new phone (or after a reinstall), only your most recently touched 200 transactions ever appear. Everything older is invisible on mobile forever — including in totals, Insights and Export, all of which read SQLite.
- **Root cause:**

```ts
// SyncManager.ts:159-168
let query = supabase.from('transactions').select('*').eq('user_id', userId)
  .order('updated_at', { ascending: false })
  .limit(200)
if (since) { query = query.gt('updated_at', since) }
```

There is no loop, no cursor, no `range()`. The 201st row is never fetched by any code path, and mobile screens read exclusively from SQLite via `getTransactions` (`transactionStore.ts:41-48`). The `since` parameter cannot help: `useTransactions` passes `lastSyncedAt.current`, which is `undefined` on the first run and is then set from the **client's** clock (`useTransactions.ts:32`) rather than from the max `updated_at` actually received — so any row updated between the query executing and the client stamping its clock is skipped on the next incremental pull.
- **Blast radius:** Permanent, silent history truncation on mobile for any account past 200 transactions — roughly 3-6 months of ordinary use. Every mobile aggregate is then computed over a truncated dataset and disagrees with web. **Correction to the original write-up:** web does *not* "paginate from the server" — `apps/web/src/lib/data.ts:8-23` takes an optional `limit` and applies `.limit()` only when one is passed, so most callers fetch unbounded and are capped only by PostgREST's `max-rows` setting. The two surfaces disagree because one truncates at 200 and the other does not truncate at all, not because one paginates properly. Also affects the Ask Murmur context built on mobile (`askMurmurClient.ts:50`), so the model is told the user has fewer transactions than they do.
- **Same defect elsewhere:** `packages/supabase/src/queries/transactions.ts:9` defaults to `limit = 50` and is the one place in the repo that uses `.range()` — and it is dead code (F32). Re-grepped `.limit(`/`.range(` across `apps/mobile/src` and `apps/web/src`: the only other hits are `useBudget.ts:20` (`.limit(1)`, correct — single active budget) and `fxBackfill.ts:41` (`.limit(FX_BACKFILL_BATCH)`, correct — deliberate per-launch throttle). `SyncManager.ts:164` is the only unbounded-data query with a silent cap. (grepped: `.limit(`, `.range(`, `pullRemote`)
- **Fix:** Make `pullRemote` a real cursor loop: page with `.order('updated_at', { ascending: true }).gt('updated_at', cursor).limit(500)` until a short page comes back, advancing `cursor` to the **last received row's `updated_at`** (server value, never the client clock), and persist that cursor in SQLite so incremental pulls survive restarts. Ascending order is required — descending + limit is what makes the current version lossy.
- **Regression test to add:** Seed 250 server rows, run `pullRemote` on an empty local DB, assert `getTransactions` returns 250.

---

### F16. The local upsert silently ignores ten columns on conflict
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/services/sync/transactionStore.ts:60-77`
- **What the user sees:** A change made on another device — flipping a transaction to recurring, correcting its category from web, a rule being linked to it — never appears on this phone, even after a full sync. Only some fields update.
- **Root cause:** The `ON CONFLICT(id) DO UPDATE SET` list is a subset of the inserted columns:

```sql
ON CONFLICT(id) DO UPDATE SET
  amount, direction, category_id, merchant, merchant_domain, note,
  payment_method, amount_in_profile_currency, fx_rate_to_profile,
  fx_rate_date, transacted_at, version, is_deleted, deleted_at,
  synced_at, updated_at
WHERE excluded.version >= transactions.version
```

Not updated: **`user_id`, `currency_code`, `source`, `raw_transcript`, `ai_confidence`, `is_recurring`, `recurring_rule_id`, `client_id`, `client_created_at`, `created_at`**. Some of those omissions are deliberate and correct (`raw_transcript` must not be clobbered by the null-transcript server row — the comment at `SyncManager.ts:99-104` explains this, and it is right). But `is_recurring`, `recurring_rule_id` and `currency_code` are ordinary mutable data. `pullRemote` funnels every server row through this function (`SyncManager.ts:173-175`), as does the realtime handler (`useTransactions.ts:63`), so remote changes to those three fields can never reach SQLite.
- **Blast radius:** Directly compounds F1: even once rules are created correctly, the server setting `recurring_rule_id` on an existing transaction would never propagate to the device that created it. Multi-currency users can never have a currency correction reach their phone. And a recurring toggle made on the web is invisible on mobile.
- **Same defect elsewhere:** The `transactions_new` copy in `localDb.ts:131-137` has the mirror-image version of this bug (F6). No other upsert in the codebase has a partial SET list (grepped: `ON CONFLICT`, `DO UPDATE`).
- **Fix:** Add `currency_code`, `source`, `ai_confidence`, `is_recurring` and `recurring_rule_id` to the SET list. Keep `raw_transcript`, `client_id`, `client_created_at`, `created_at` and `user_id` excluded, and put a one-line comment on each stating why, so the list is auditable rather than accidental. Better: generate the SET list from a single column manifest shared with the INSERT, so the two can never drift again.
- **Regression test to add:** Insert a local row with `is_recurring = 0`, upsert the same id with `is_recurring = 1` and a higher version, assert the local row reads `is_recurring = 1`.

---

### F17. Categories, budgets and recurring rules are online-only in an offline-first app
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/hooks/useCategories.ts:9-58`, `apps/mobile/src/hooks/useBudget.ts:11-61`, `apps/mobile/src/hooks/useRecurringRules.ts:87-173`, `apps/mobile/src/services/sync/localDb.ts:16-65` (only two local tables exist), `packages/shared/src/types/sync.ts:2`
- **What the user sees:** With no signal: the category list is empty so a voice transaction is saved uncategorised; creating a category does nothing; setting a budget appears to fail with no message; the Recurring screen is blank. On reconnect none of it is retried.
- **Root cause:** Only `transactions` and `sync_queue` exist in SQLite (`localDb.ts:16,52`). Every other entity reads and writes Supabase directly:

```ts
// useCategories.ts:27-39
const { data, error } = await supabase.from('categories').insert({...}).select().single()
if (!error) await fetch()
return error ? null : (data as Category)
```

There is no local mirror, no queue entry, and the error is converted to a `null` return that the call sites discard. `SyncEntityType` already enumerates `'category' | 'budget' | 'recurring_rule'` (`sync.ts:2`) and `sync_queue.entity_type` defaults to `'transaction'` (`localDb.ts:55`) — the design covered these entities and only one was built.
- **Blast radius:** The app's core promise ("works offline") holds for exactly one of four entity types. Because categories are fetched from the network, an offline voice save silently loses its category suggestion. Because budgets are network-only, `usePeriodSpend` gets `budget = null` offline and the budget ring reads as "no budget" rather than "unknown".
- **Same defect elsewhere:** All three hooks above, plus `seedCategories.ts` (network-only) and every web write path (acceptable there — the browser is assumed online). (grepped: `from('categories')`, `from('budgets')`, `from('recurring_rules')`, `enqueue(`)
- **Fix:** Extend the existing sync engine rather than adding parallel paths. Add `categories`, `budgets` and `recurring_rules` tables to `localDb`, route all reads through a store module per entity (mirroring `transactionStore`), and make every write `upsertLocal(...) + enqueue(op, entityType, id, payload)`. `SyncManager.drainQueue` must then switch on `entry.entity_type` instead of hardcoding `.from('transactions')` (`SyncManager.ts:106,128`). This is the architecture the schema already assumes; anything less keeps three of four entities broken offline.
- **Regression test to add:** With the network disabled, create a category and a budget, re-enable the network, and assert both exist on Supabase after a drain.

---

### F18. Signing up on web never seeds default categories
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/_layout.tsx:94-96` (the only caller), `apps/mobile/src/services/seedCategories.ts:3-31`, `supabase/migrations/004_default_categories.sql:1-44`, `supabase/migrations/001_initial_schema.sql:40-54` (`handle_new_user`, which does not seed)
- **What the user sees:** Create an account on the web dashboard and every category dropdown is empty; you cannot categorise anything until you install the mobile app and open it once.
- **Root cause:** Seeding lives entirely in the mobile root layout. `seedDefaultCategories` is referenced in exactly two files repo-wide (its definition and `_layout.tsx:96`), and `default_categories` is queried only from `seedCategories.ts:6`. The web app has no equivalent. The trigger that *does* run for every signup regardless of surface, `handle_new_user`, inserts only `(id, display_name)`.

Production confirms it. Per-user category counts:

```
30313923…  20 categories, 20 distinct
61e32362…  20 categories, 20 distinct
7751f664…  20 categories, 20 distinct
96e03331…   0 categories,  0 distinct   <-- never opened mobile
a31b57b8…  20 categories, 20 distinct
b12c7e7e…  20 categories, 20 distinct
```

- **Blast radius:** Answering item (7) directly: **20 per user is correct and there are zero duplicates** — the `UNIQUE(user_id, name_normalized)` constraint (`001:70`) holds the line even when the seeding routine races with itself (see F25), so the race is real but harmless. The actual defect is the opposite: one of six production profiles has **zero** categories because seeding is bound to a platform rather than to account creation.
- **Same defect elsewhere:** The same platform-bound-initialisation class covers `runRecurringCatchUp` and `runFxBackfill` (also mobile-only, `_layout.tsx:99,104`) — a web-only or desktop-only user never gets recurring catch-up or FX backfill at all.
- **Fix:** Move seeding server-side into `handle_new_user`, where it belongs: `INSERT INTO public.categories (user_id, name, name_normalized, color, icon) SELECT NEW.id, name, lower(name), color, icon FROM public.default_categories ON CONFLICT DO NOTHING;`. That makes seeding atomic with account creation, surface-independent, race-free and offline-irrelevant, and lets `seedCategories.ts` be deleted. (The function must also get `SET search_path = public` — see F23.)
- **Regression test to add:** Create a user via the auth admin API only (no client app) and assert 20 categories exist immediately.

---

### F19. The queue drains in timestamp-string order, not insertion order
- **Severity:** Medium *(downgraded from High during verification. The ordering really is by a client clock string and the autoincrement `id` really is ignored — that is a genuine soundness defect. But the trigger conditions are narrow: a tie needs two enqueues inside the same millisecond, which a create-then-delete pair by a human cannot produce, and SQLite resolves ties by rowid on a table scan anyway, so ties in practice still come back in insertion order. The realistic trigger is a backwards clock jump (NTP correction, manual clock change). "Wrong only in an edge case" is Medium.)*
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/services/sync/syncQueue.ts:24-28`, `:31-38`
- **What the user sees:** Rare but real: a transaction that was created and then quickly deleted can be resurrected on the server, or an edit can be applied before the create it depends on.
- **Root cause:** Entries are ordered by a client-generated ISO string:

```sql
-- syncQueue.ts:34
SELECT * FROM sync_queue WHERE retry_count < 5 ORDER BY created_at ASC LIMIT ?
```

`created_at` is `new Date().toISOString()` (`syncQueue.ts:23`), which has millisecond resolution, so two operations enqueued in the same millisecond tie and SQLite may return them in either order — while `id INTEGER PRIMARY KEY AUTOINCREMENT` (`localDb.ts:53`) is the true insertion order and is ignored. Worse, `created_at` is the **device clock**: if the user (or NTP) moves the clock backwards, later entries sort before earlier ones. Ordering the causal history of money records by an untrusted, non-monotonic, low-resolution clock is not sound.
- **Blast radius:** Out-of-order create/delete pairs produce a server row the user believes they deleted; out-of-order update/create pairs produce a wrong amount briefly. Rare because the upsert is idempotent, but on a money app "rare and silent" is the worst combination.
- **Same defect elsewhere:** `client_created_at` and `client_timestamp` are both client-supplied and stored without validation (`001:139,220`); `client_created_at` is written into `transactions` for every row and never checked against `now()`, so a device with a wrong clock permanently mis-stamps its records. Migration 008's dedup key derives from `transacted_at`, also device-supplied. (grepped: `client_created_at`, `client_timestamp`, `ORDER BY created_at`, `toISOString()`)
- **Fix:** `ORDER BY id ASC` in `getPendingEntries` — the autoincrement is monotonic by construction and immune to clock changes. Keep `created_at` as diagnostic metadata only. Separately, clamp `client_created_at` server-side (a `BEFORE INSERT` trigger setting it to `least(NEW.client_created_at, now())`) so a skewed device cannot write future-dated money records.
- **Regression test to add:** Enqueue `create` then `delete` for the same id with an identical mocked `Date.now()`, drain, and assert the server row is soft-deleted.

---

### F21. The production iOS build disables App Transport Security
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `apps/mobile/app.config.js:20-28` (the source), `apps/mobile/ios/Murmur/Info.plist:55-59` (the generated artifact — **this is the confirmation**), `apps/mobile/eas.json:44-53` (the `production` profile, which has no override)
- **What the user sees:** Nothing — but the app is permitted to make cleartext HTTP connections to any host.
- **Root cause:**

```js
// app.config.js:20-28
infoPlist: {
  NSAppTransportSecurity: {
    NSAllowsArbitraryLoads: true,
  },
  // Murmur implements no encryption of its own (OS TLS + data
  // protection only) — declaring exemption here means App Store
  // Connect never shows the "Missing Compliance" dialog again.
  ITSAppUsesNonExemptEncryption: false,
}
```

`NSAllowsArbitraryLoads: true` globally disables ATS for the whole app, in every build profile including `production` (there is no per-profile override in `apps/mobile/eas.json`). **Verified end-to-end during this pass rather than inferred from the config**: `apps/mobile/ios/` is gitignored, so EAS runs `expo prebuild` and generates the plist from `app.config.js`; Expo's `withIosBaseMods` `infoPlist` provider merges as `{...diskPlist, ...config.ios.infoPlist}`, so the config's `NSAppTransportSecurity` replaces the bare template's wholesale. The generated artifact on disk confirms it:

```xml
<!-- apps/mobile/ios/Murmur/Info.plist:55-59 -->
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key>
  <true/>
</dict>
```

(Do not be misled by the *other* `ios/` tree at the repo root — `ios/murmur/Info.plist:48-53` shows `NSAllowsArbitraryLoads: false` because it was prebuilt from the stale root `app.json`, which has no ATS block. That tree is not what ships; see F41.)

This is normally added to talk to a `http://192.168.x.x` dev server and then never removed — and here the app talks to `EXPO_PUBLIC_API_BASE_URL`, which is not only a build-time value but is overridable at runtime from SecureStore (`apps/mobile/src/hooks/useApiUrl.ts:16-20,31-34`), so a mis-set value sends transcripts and bearer tokens over plaintext with no OS-level guardrail. It is also an App Review flag: Apple asks for justification for blanket ATS exemptions.
- **Blast radius:** Every network call the app makes, including the Supabase session and the AI parse requests carrying the user's voice transcript.
- **Same defect elsewhere:** The Electron shell is the mirror image and gets it right — `webSecurity: true`, `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` (`apps/desktop/src/main.ts:182-185`, repeated for child windows at `:210-213`), and external URLs are handed to the OS browser (`:191-197`). The web app has no CSP or security headers configured in `next.config.ts` (verified: the config sets only `transpilePackages`, `allowedDevOrigins`, `output` and `outputFileTracingRoot`), which is a separate gap. (grepped: `NSAllowsArbitraryLoads`, `webSecurity`, `usesCleartextTraffic`, `headers()`)
- **Fix:** Delete `NSAppTransportSecurity` from `app.config.js`. If a local dev server over HTTP is needed, scope it with `NSExceptionDomains` for `localhost` only, and gate the whole block behind `process.env.EAS_BUILD_PROFILE !== 'production'` — `app.config.js` is a JS config precisely so it can branch.
- **Regression test to add:** A CI assertion that `expo prebuild --platform ios` under the `production` profile produces an `Info.plist` with no `NSAllowsArbitraryLoads` key.

---

### F22. Recurring date arithmetic overflows month ends and catches up one occurrence per day
- **Severity:** High
- **Status:** Newly discovered
- **Where:** `supabase/functions/generate-recurring/index.ts:40-58` (`computeNext`), `:140-202` (the once-per-run loop), `apps/mobile/src/hooks/useRecurringRules.ts:42-60` (`computeNextOccurrence`, the verbatim twin)
- **What the user sees:** (Once F1 is fixed and rules exist.) A rent payment set up on the 31st drifts: Jan 31 → Mar 3 → Apr 3 → May 3. A bill that was due while you were away is generated one occurrence per day rather than all at once, so your balance is wrong for days.
- **Root cause:** Two bugs in the same function, duplicated verbatim in client and server:

```ts
// generate-recurring/index.ts:51-53  (identical to useRecurringRules.ts:53-55)
case 'monthly':   next.setMonth(next.getMonth() + rule.interval); break
case 'quarterly': next.setMonth(next.getMonth() + 3 * rule.interval); break
case 'yearly':    next.setFullYear(next.getFullYear() + rule.interval); break
```

`Date.prototype.setMonth` overflows: taking Jan 31 2026 and calling `setMonth(1)` yields **March 3**, because February 31 does not exist (2026 is not a leap year, so Feb has 28 days). Every month-end rule walks forward a few days per cycle and never returns. `setFullYear` has the same problem for Feb 29.

Second, the server loop calls `computeNext(rule)` exactly once per rule per run and then either `continue`s or generates a single occurrence (`:140-143`), so a rule three months behind advances by one occurrence per daily cron run and takes three months to catch up. The mobile catch-up does loop (`recurringCatchUp.ts:51`, capped at 50), so the two writers disagree about how much history to generate — precisely the divergence migration 008 was written to paper over.
- **Blast radius:** Wrong dates and missing amounts on every recurring-derived figure: Safe-to-Spend, Insights forecast, budget consumption. Because `computeNextOccurrence` is also used to display "next occurrence" in the UI (`useRecurringRules.ts:64-79`), the user sees the drifted date as the promise.
- **Same defect elsewhere:** The two implementations at `generate-recurring/index.ts:40-58` and `useRecurringRules.ts:42-60` are a verbatim copy-paste pair. **Correction to the original write-up:** `apps/web/src/lib/recurringPatternDetector.ts` and `apps/mobile/src/services/recurringPatternDetector.ts` do *not* carry this bug — re-grepped, neither contains `setMonth` or `setFullYear`; they infer frequency from median day-gaps (`DAY_MS` arithmetic at `:69,129-148`). They are still a hand-maintained copy-paste pair (the web file's own header says *"If the mobile detector is updated, copy the change over here"*), which is the same *duplication* risk but not the same date-overflow defect, and they should be merged into `packages/shared` alongside the `computeNext` fix. Also note both `computeNext` implementations operate on the raw `timestamptz` while the user's zone is unknown (F11). (grepped: `setMonth`, `setFullYear`, `computeNextOccurrence`, `computeNext`)
- **Fix:** One implementation, in `packages/shared`, anchored on the rule's original day-of-month rather than on the previous occurrence: keep `starts_at`'s day-of-month, and when the target month is shorter, clamp to its last day (`min(anchorDay, daysInMonth(targetMonth))`) without mutating the anchor. Import it from both the edge function and the client so they cannot diverge. Change the cron loop to `while (next && next <= now)` with the same safety cap the client uses, so a rule catches up in one run.
- **Regression test to add:** A rule with `starts_at = 2026-01-31`, monthly: assert the next six occurrences are Jan 31, Feb 28, Mar 31, Apr 30, May 31, Jun 30.

---

### F23. `handle_new_user` is SECURITY DEFINER with a mutable search_path and holds a redundant anon EXECUTE grant
- **Severity:** Medium *(downgraded from High during verification. The advisor lints are real and I re-ran `get_advisors` against the live project to confirm them — see below — but the exploitability claimed in the original write-up does not hold up, so this is hardening, not an open door. Details in the root cause.)*
- **Status:** Newly discovered (re-confirmed against the live Supabase security advisor on 2026-08-08)
- **Where:** `supabase/migrations/001_initial_schema.sql:40-50` (`handle_new_user`), `:52-54` (the trigger), `:263-269` (`set_updated_at`), `supabase/migrations/007_ask_conversations.sql:71-84` (`bump_ask_conversation_last_message`)
- **What the user sees:** Nothing. This is a privilege-escalation surface.
- **Root cause:**

```sql
-- 001_initial_schema.sql:40-50
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name) VALUES (...);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

No `SET search_path`. A `SECURITY DEFINER` function runs as its owner (the superuser-equivalent `postgres` role in Supabase); with a caller-controlled `search_path`, an unqualified reference can be hijacked by an object in a schema the caller can write.

**Re-run of `get_advisors(security)` on 2026-08-08 — exactly what it does and does not say.** Every lint the original write-up cited is real and still present, all at level `WARN`:
  - `function_search_path_mutable` on `public.handle_new_user` and on `public.set_updated_at`;
  - `anon_security_definer_function_executable` and `authenticated_security_definer_function_executable` on both `public.handle_new_user()` **and** `public.bump_ask_conversation_last_message()`, each worded as "can be executed by the `anon` role … via `/rest/v1/rpc/handle_new_user`";
  - `extension_in_public` for `pg_net`;
  - `auth_leaked_password_protection` disabled.

**But the exploitability claim needs correcting.** The lint is a privilege check — "is this SECURITY DEFINER function in an exposed schema, and does `anon` hold EXECUTE?" — not a reachability test. Both `handle_new_user()` and `bump_ask_conversation_last_message()` are declared `RETURNS trigger`, and **PostgREST does not expose trigger-returning functions on `/rest/v1/rpc/` at all** — they are filtered out of the schema cache. Even if one could be reached, PostgreSQL refuses a direct call to a trigger function ("trigger functions can only be called as triggers"). So the advisor's suggested URL is not actually live, and the original write-up's conclusion — "a definer-rights function reachable unauthenticated over HTTP … the second unauthenticated write surface on the project" — is **not correct** and has been removed. The residual risk is the `EXECUTE` grant to `PUBLIC` that Postgres applies by default (which should still be revoked as hygiene) plus the mutable `search_path`, whose exploitation would additionally require CREATE rights on a schema in the path — which `anon`/`authenticated` do not hold on `public` under Postgres 15+.

Migration 007 shows the team already knows the right pattern: `bump_ask_conversation_last_message` has `SET search_path = public` (`007:75`), so this is drift, not ignorance.
- **Blast radius:** Hardening only. Unlike F4 there is no reachable write path here. The advisor also reports `pg_net` installed in the `public` schema and leaked-password protection disabled in Auth — the latter is a one-click dashboard fix worth doing before launch on a money app.
- **Same defect elsewhere:** `public.set_updated_at` (`001:263-269`) — same missing `SET search_path`; it is `SECURITY INVOKER` (no `SECURITY DEFINER` clause on the declaration, verified), so there is no escalation risk at all, but the advisor flags it. `bump_ask_conversation_last_message` has the search_path but carries the same redundant grants. (grepped: `SECURITY DEFINER`, `SET search_path`, plus a live `get_advisors` call against `ohaqhwampmyoeaopdybd`)
- **Fix:** In a new migration: `ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;` and the same for `set_updated_at`; then `REVOKE EXECUTE ON FUNCTION public.handle_new_user(), public.bump_ask_conversation_last_message() FROM anon, authenticated, public;` — trigger functions do not need to be callable over the API. Enable leaked-password protection in Auth settings, and move `pg_net` out of `public`.
- **Regression test to add:** A migration assertion that no function in `public` is `prosecdef = true` with a null `proconfig`.

---

### F24. The Ask endpoint writes the user's question and financial overview to server logs
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/web/src/app/api/ai/ask-murmur/route.ts:116-123`, `:357-359`
- **What the user sees:** Nothing. Their financial questions and derived figures accumulate in Vercel's log retention.
- **Root cause:**

```ts
// ask-murmur/route.ts:116-123
console.log(
  '[ask-murmur] question=',
  JSON.stringify(askReq.question),
  'today=',
  askReq.today,
  'overview=',
  JSON.stringify(overview),
)
```

and every tool call is logged with a 240-char preview of its arguments and results (`:353-359`), which for `run_query` is code operating over the user's transaction set and its numeric output. `buildDataOverview` is a deterministic summary of the user's spending. Nothing is redacted and no `analytics_opt_in` / `crash_reports_opt_in` preference is consulted, despite migration 010 existing precisely to record those choices.
- **Blast radius:** Financial PII in a third-party log system, retained by default, outside the user's privacy controls. It is not "sensitive" in the credential sense, but "what did I spend on therapy" is exactly the class of question a finance app must not leave in plaintext logs.
- **Same defect elsewhere:** `apps/mobile/src/services/googleAuth.ts:38,49,52` logs the OAuth URL including PKCE state (F38). The AI error paths (`parse-expense/route.ts:50`, `parse-scan/route.ts:56`) log the raw error object, which for an OpenAI SDK error includes the request body — i.e. the user's transcript. `packages/shared/src/askStorage.ts:144,167,190` logs Supabase errors only, which is fine. (grepped: `console.log`, `console.error`, `console.warn`)
- **Fix:** Replace the payload logs with non-identifying telemetry: question **length**, transaction count, tool-call count, latency, outcome. If a debugging trace is genuinely needed, gate it behind an env flag that is off in production, and never log `overview` or tool results. In the AI error handlers, log `err.message` and `err.status` only, never the error object.
- **Regression test to add:** A unit test that captures `console.log` during a `POST /api/ai/ask-murmur` and asserts the question text does not appear in any log line.

---

### F25. Seeding, recurring catch-up and FX backfill re-fire on every navigation
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/_layout.tsx:52-106` (note the dependency array on line 106)
- **What the user sees:** Sluggish navigation and needless network traffic; on a slow link, the first minute after launch is noticeably heavy.
- **Root cause:** The three one-shot startup routines live inside an effect whose dependency array includes `segments`:

```ts
// _layout.tsx:94-106
if (session?.user?.id) {
  seedDefaultCategories(session.user.id)
  runRecurringCatchUp(session.user.id)
  runFxBackfill(session.user.id)
}
}, [session, loading, segments, router, profile, ready])
```

`segments` changes on **every navigation**, so all three fire on every screen transition. Each is unawaited and none is guarded by an in-flight flag, so overlapping executions are routine: `seedDefaultCategories` re-reads `default_categories` and the user's categories each time; `runRecurringCatchUp` re-fetches all rules and can run concurrent copies of the same generate-and-advance loop; `runFxBackfill` re-queries up to 100 rows.
- **Blast radius:** Wasted requests on every tap, plus a genuine concurrency hazard in `runRecurringCatchUp`: two overlapping runs both read the same `last_generated`, both compute the same next occurrence, and both attempt to write it. The local unique index and migration 008's server index catch the duplicate, which then trips F9's over-broad `23505` handler and **soft-deletes one of them locally**. The seeding race is harmless only because of the `UNIQUE(user_id, name_normalized)` constraint (see F18's production evidence: 20/20 distinct for every seeded user).
- **Same defect elsewhere:** This is the only startup-effect of its kind. (grepped: `useEffect`, `seedDefaultCategories`, `runRecurringCatchUp`, `runFxBackfill`)
- **Fix:** Split the effect. Routing logic keeps `segments`; the startup routines move to a separate `useEffect` keyed on `[session?.user?.id]` only, with a `useRef` guard so a re-mount cannot double-run them, and each call `await`ed in sequence inside an async IIFE so their errors can be caught and surfaced rather than becoming unhandled rejections.
- **Regression test to add:** Render the layout, navigate three times, and assert `seedDefaultCategories` was called exactly once.

---

### F26. No Supabase client in the repo is typed — schema/TS drift cannot be detected
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/lib/supabase.ts:63`, `apps/web/src/lib/supabase/client.ts:5`, `apps/web/src/lib/supabase/server.ts:6`, `apps/web/src/lib/auth.ts:3`, `packages/supabase/src/client.ts:11,27`, `supabase/functions/*/index.ts`
- **What the user sees:** Indirectly, every drift bug in this report — because nothing in the toolchain can catch a mismatch between the object being written and the table it lands in.
- **Root cause:** Every client is constructed untyped:

```ts
// apps/mobile/src/lib/supabase.ts:63
export const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: {...} })
```

There is no `createClient<Database>` anywhere, and no generated types file exists (`find . -name "database.types.ts" -o -name "supabase.types.ts"` → nothing). Consequently `supabase.from('transactions').insert({...})` accepts any object and returns `any`, and the hand-written interfaces in `packages/shared/src/types/*.ts` are documentation rather than contracts — they are only applied via casts (`data as Profile`, `rows as QueueEntry[]`, `data as RecurringRule[]`).

**Schema vs TypeScript comparison (item 3).** I compared every column in migrations 001-012 against `packages/shared/src/types/*.ts`. The interfaces are actually accurate — `Transaction`, `Profile`, `Budget`, `Category`, `RecurringRule` all match their tables in name, nullability and enum membership, including the post-migration additions (`amount_in_profile_currency` / `fx_rate_to_profile` / `fx_rate_date` from 011, `analytics_opt_in` / `crash_reports_opt_in` from 010, `plus_status` from 012, `monthly_income_source` / `onboarding_completed_at` from 006). The drift is not in the type declarations; it is that **nothing enforces them at the call sites**:
  - `TransactionInsert = Omit<Transaction, 'created_at'|'updated_at'>` (`transaction.ts:61`) requires `is_recurring`, `raw_transcript`, `ai_confidence`, `recurring_rule_id`, `deleted_at`, `synced_at`. The web insert (`apps/web/src/app/dashboard/transactions/page.tsx:325-338`) supplies none of those six and compiles fine, because it is an untyped object literal passed to an untyped client. (Verified: it does supply `id`, `user_id`, the `shared` spread, `currency_code`, `merchant_domain`, `source`, the three FX columns, `client_id`, `client_created_at`, `version`, `is_deleted` — every omission happens to be nullable or defaulted server-side, so it works by luck rather than by contract.)
  - `RecurringRule` (`recurring.ts:3-21`) has no `updated_at` — correct, the table has none — but it also means `recurring_rules` is the one user table with no `updated_at` and no `set_updated_at` trigger, so a rule edited on one device carries no ordering signal at all.
  - `SyncQueueItem` (`sync.ts:5-15`) declares `id: string` and `is_pending_ai: boolean`; the real local table has `id INTEGER PRIMARY KEY AUTOINCREMENT` and no `is_pending_ai` column (`localDb.ts:52-62`), and the runtime interface `QueueEntry` (`syncQueue.ts:5-15`) is a *different* shape. The shared type is a fossil that describes nothing.
  - `transactions.source` (item 3, specifically): the DB CHECK allows `voice|manual|scan|shortcut|notification_listener|recurring_generated` (`001:129-132`) and `TransactionSource` (`transaction.ts:9-15`) matches it exactly. What the apps **write** is a strict subset: `'manual'` (default, `useTransactions.ts:107`), `'voice'` and `'scan'` (via `transactionSource` state, `record.tsx:108,199`), and `'recurring_generated'` (`recurringCatchUp.ts:99`, `generate-recurring/index.ts:173`). `'shortcut'` and `'notification_listener'` are **never written by anything** — `useShortcutHandler.ts` and `useNotificationListener.ts` contain no `createTransaction` call at all. And what the web app **reads** invents a seventh value that does not exist in the DB (F27).
- **Blast radius:** Structural. Every finding in this report that involves a field being written wrong, omitted, or invented would have been a compile error under a typed client.
- **Same defect elsewhere:** All six client construction sites listed above. (grepped: `createClient<`, `Database`, `as Transaction`, `as Profile`, `as RecurringRule`)
- **Fix:** Generate `packages/shared/src/types/database.types.ts` with `supabase gen types typescript --project-id ohaqhwampmyoeaopdybd`, commit it, add a CI step that regenerates and fails on diff, and parameterise every client: `createClient<Database>(...)`. Then delete the hand-written duplicates or redefine them as aliases of the generated row types (`type Transaction = Database['public']['Tables']['transactions']['Row']`). This is the single highest-leverage change in this report: it converts an entire class of silent runtime drift into compile errors.
- **Regression test to add:** CI job: `supabase gen types` + `git diff --exit-code` on the generated file.

---

### F27. The web SOURCE chip reports "Recurring" for manually-entered transactions
- **Severity:** Medium
- **Status:** User-reported (the Xtream row shows a "Recurring" source chip while `source='manual'`)
- **Where:** `apps/web/src/app/dashboard/transactions/page.tsx:64-72` (`classifySource`), `:677` and `:731` (where it is rendered as `<SourceChip>`), `:26` (`source: string | null`), `supabase/migrations/001_initial_schema.sql:129-132`, `packages/shared/src/types/transaction.ts:9-15`
- **What the user sees:** The Transactions list shows a SOURCE chip reading "Recurring" for a row whose stored source is `manual`. The column claims to describe *how the transaction was captured* but sometimes describes *what kind of transaction it is*.
- **Root cause:**

```ts
// transactions/page.tsx:64-72
function classifySource(t: Txn): 'voice' | 'apple-pay' | 'typed' | 'recurring' {
  // Recurring takes precedence — it's the most useful chip on a row
  // that's both recurring and (e.g.) voice-logged.
  if (t.is_recurring || t.source === 'recurring_generated') return 'recurring'
  if (t.source === 'voice') return 'voice'
  if (t.source === 'shortcut' || t.source === 'notification_listener') return 'apple-pay'
  return 'typed'
}
```

`is_recurring` (a property of the transaction) is folded into the same display slot as `source` (a property of its capture method), and the row's real source — a manual entry — is hidden.

**Correction to the original write-up.** It was titled "displays a transaction source the database forbids" and argued that `'recurring'` violates the DB CHECK constraint. It does not: `classifySource` is a pure *display/filter* classifier whose return value is never written anywhere — I traced all three consumers (`matchesFilter:76`, the filter-count `useMemo:423`, the chip render `:677`) and none of them persists it. Nothing in the web app can write an invalid `source`; the insert at `:331` hard-codes `source: 'manual'`. The real defect is the narrower one now in the title: a provenance column that sometimes reports something other than provenance. The widened local type `source: string | null` (`:26`) is still a genuine F26 symptom, but it is not "what allows the invented value to type-check" — the union return type of `classifySource` is declared explicitly.
- **Blast radius:** Any user auditing where a figure came from is misled; and because `is_recurring` is currently set on transactions that have no rule (F1), the chip advertises a recurring relationship that does not exist anywhere in the data.
- **Same defect elsewhere:** `apps/web/src/app/dashboard/export/page.tsx:23` also types `source: string | null`; mobile's `humanSource` (`apps/mobile/app/transaction/[id].tsx:93`) takes `string | null | undefined`. Both are symptoms of F26. Mobile does *not* overload the source slot — it renders the recurring state as a separate chip (`transaction/[id].tsx:285`), which is the correct treatment. Note the web page *also* already renders a standalone recurring icon next to the merchant (`transactions/page.tsx:719`), so the override in `classifySource` is redundant as well as misleading. (grepped: `source ===`, `classifySource`, `SourceChip`, `'recurring'`)
- **Fix:** Type the field as `TransactionSource` from `@voice-expense/shared` (a generated type after F26), remove the `'recurring'` branch from `classifySource`, and let the existing standalone recurring icon at `:719` carry that state — exactly as mobile does. The `'recurring'` **filter** chip should stay; it just needs its own predicate (`t.is_recurring || t.source === 'recurring_generated'`) in `matchesFilter` rather than borrowing the source classifier.
- **Regression test to add:** Render a row with `source='manual', is_recurring=true` and assert the source chip reads "Manual" and a separate recurring indicator is present.

---

### F28. Migration 003's idempotency key is not the one the sync engine uses
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `supabase/migrations/003_add_client_id_unique.sql:1-4`, `apps/mobile/src/services/sync/SyncManager.ts:106-108`
- **What the user sees:** Nothing today. It is a documented safety property that is not in force.
- **Root cause:** The migration states its purpose explicitly:

```sql
-- 003_add_client_id_unique.sql:1-4
-- Add unique constraint on client_id so ON CONFLICT (client_id) works correctly
-- in the sync upsert. client_id is the client-generated UUID used for deduplication.
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_client_id_unique UNIQUE (client_id);
```

but the upsert conflicts on `id`, not `client_id`:

```ts
// SyncManager.ts:107
const { error } = await supabase.from('transactions').upsert(serverPayload, { onConflict: 'id' })
```

It is benign only because every writer sets `client_id = id` — re-verified at all four sites: `useTransactions.ts:93,112`, `recurringCatchUp.ts:85,104`, `generate-recurring/index.ts:160,176`, `transactions/page.tsx:318,335`. The moment any writer mints a fresh `id` for a retried operation — which is exactly what `client_id` exists to make safe — the upsert will insert a *second* row that then violates `transactions_client_id_unique`, producing a `23505` that F9 turns into a silent local delete. Note also the constraint is global rather than `(user_id, client_id)`, so it constrains across users; and there is a matching non-unique index `idx_transactions_client` on `(user_id, client_id)` (`001:158`) that the constraint duplicates on the wrong key set.
- **Blast radius:** Latent. It is listed because item (4) asks specifically about idempotency via `client_id`, and the honest answer is: the constraint exists, the code does not use it, and the two are one refactor away from interacting destructively.
- **Same defect elsewhere:** None — this is the only upsert against `transactions`. (grepped: `onConflict`, `client_id`)
- **Fix:** Either change the upsert to `{ onConflict: 'client_id' }` so the documented idempotency key is the real one, or drop the constraint and delete the comment. Given retries are the whole point, prefer the former, and re-scope the constraint to `UNIQUE (user_id, client_id)`.
- **Regression test to add:** Upsert the same `client_id` twice with different `id` values and assert exactly one row exists.

---

### F29. `delete-user` has no rollback and can leave a half-deleted account
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `supabase/functions/delete-user/index.ts:50-88`
- **What the user sees:** If anything fails mid-way, they get an error toast, but their transactions are already gone while their account still exists — or their account is gone while some data remains.
- **Root cause:** The function deletes seven tables in a loop and then the auth user, with no transaction and no compensating action:

```ts
// delete-user/index.ts:57-76
const tables = ['ask_messages','ask_conversations','transactions','recurring_rules','budgets','categories','profiles'] as const
for (const table of tables) {
  const column = table === 'profiles' ? 'id' : 'user_id'
  const { error } = await supabaseAdmin.from(table).delete().eq(column, userId)
  if (error) { ...; return json({ error: ... }, 500) }
}
const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(userId)
```

A failure on the fifth table returns 500 with four tables already emptied. A failure on `auth.admin.deleteUser` leaves an auth user with zero data and no profile row — `handle_new_user` will not re-fire, so that account can sign in forever with a null profile (the retry loop in `useProfile.ts:53-57` gives up after 5s and routes them into a broken state).

**Coverage audit (item 6).** Explicitly deleted: `ask_messages`, `ask_conversations`, `transactions`, `recurring_rules`, `budgets`, `categories`, `profiles`, and the `auth.users` row. **Not** explicitly deleted: `devices` and `sync_operations`. Both are covered in practice — each declares `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` (`001:195` and `001:214` respectively; the original write-up cited `001:215`, which is `client_id`), so `auth.admin.deleteUser` cascades them — and both are empty in production (0 rows each) because no code ever writes them. No Storage buckets are used anywhere (re-grepped `.storage`, `storage.from(` across `apps/`, `packages/`, `supabase/` → zero hits), so there is nothing to clean there. `ai_usage_log` stores only `user_id_hashed` and is also never written. So App Store account-deletion compliance is **met in effect**, but by cascade rather than by intent — and the function's own comment claims the explicit list exists *because* "some tables historically lacked the CASCADE rule", which is precisely the situation where an omission would matter.
- **Blast radius:** Partial deletion is unrecoverable and would be a GDPR/App Store incident if it happened during review.
- **Same defect elsewhere:** The client half has the same shape: `privacy.tsx:181-183` calls `wipeAllUserData` then `signOut` with no verification that the server actually finished. (grepped: `delete().eq(`, `auth.admin.deleteUser`)
- **Fix:** Make deletion atomic and server-authoritative: a single `SECURITY DEFINER` SQL function `public.delete_account(uid uuid)` that performs all deletes in one transaction, called once from the edge function, followed by `auth.admin.deleteUser`. Add `devices` and `sync_operations` to the explicit list so the function does not silently depend on cascade behaviour it claims not to trust. On `auth.admin.deleteUser` failure, retry with backoff and return a distinct error so the client does not wipe local data for a still-existing account.
- **Regression test to add:** Stub the `categories` delete to fail and assert the account and all remaining data are intact (no partial deletion).

---

### F30. `seedCategories` discards every error and inserts all-or-nothing
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/services/seedCategories.ts:3-31`
- **What the user sees:** Occasionally a new account with no categories, or a subset, and no way to trigger a retry other than reinstalling.
- **Root cause:** Neither query is checked and the insert result is thrown away entirely:

```ts
// seedCategories.ts:5-31
const { data: defaults } = await supabase.from('default_categories').select(...)
if (!defaults || defaults.length === 0) return          // network failure looks like "no defaults"
const { data: existing } = await supabase.from('categories').select('name_normalized').eq('user_id', userId)
const existingNames = new Set((existing ?? []).map((c) => c.name_normalized))   // failure looks like "none exist"
const missing = defaults.filter((cat) => !existingNames.has(cat.name.toLowerCase()))
await supabase.from('categories').insert(missing.map(...))                     // result discarded
```

A failed `existing` fetch is indistinguishable from an empty result, so the function tries to insert all 20; the batch insert is atomic, so one `UNIQUE(user_id, name_normalized)` collision fails **all 20** — and the error is not read, so the caller (F25, firing on every navigation) believes it succeeded. `name.toLowerCase()` also does not match the normalisation used elsewhere (`name.trim().toLowerCase()` in `useCategories.ts:32`), so a default whose name has trailing whitespace would be seeded twice under different normalisations.
- **Blast radius:** Contributes to the zero-category profile in production (F18 is the primary cause; this is why it cannot self-heal).
- **Same defect elsewhere:** `apps/mobile/src/hooks/useCategories.ts:38,47,56`, `apps/mobile/src/hooks/useBudget.ts:40-45`, `apps/mobile/src/services/recurringCatchUp.ts:65-68,127-130`, `apps/web/src/app/dashboard/recurring/page.tsx:238,266`, `apps/web/src/app/dashboard/budgets/page.tsx:175,200` — all discard the write result. (grepped: `await supabase.from(` without destructuring `error`)
- **Fix:** Superseded by F18's server-side seeding, which removes this function. Until then: check `error` on both selects and bail (rather than proceeding on a wrong assumption), use `.upsert(..., { onConflict: 'user_id,name_normalized', ignoreDuplicates: true })` so a partial collision does not fail the batch, and share a single `normalizeCategoryName()` helper with `useCategories`.
- **Regression test to add:** With the `categories` select stubbed to fail, assert `seedDefaultCategories` does not insert and returns an error.

---

### F31. FX backfill repairs the server but never the local database
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/services/fxBackfill.ts:34-70`, `apps/mobile/src/services/sync/SyncManager.ts:156-176`
- **What the user sees:** Foreign-currency transactions keep counting as $0 in mobile totals for at least one extra app launch after the backfill "succeeded".
- **Root cause:** The backfill reads from Supabase and writes to Supabase:

```ts
// fxBackfill.ts:59-66
const { error: writeError } = await supabase.from('transactions')
  .update({ amount_in_profile_currency: ..., fx_rate_to_profile: ..., fx_rate_date: ... })
  .eq('id', row.id)
```

The mobile UI reads exclusively from SQLite (`transactionStore.getTransactions`). Nothing writes the repaired values locally; they only arrive on the next `pullRemote`, which runs on mount of `useTransactions` and is capped at 200 rows (F15). It also bypasses the sync queue entirely, so a device that is offline when the backfill runs loses the work silently, and it does not bump `version` — so when the local row eventually receives the update, the version guard `excluded.version >= transactions.version` is only satisfied because the versions happen to be equal.
- **Blast radius:** Understated totals on mobile for multi-currency users, resolving one launch later than the code implies. Since the tester is USD-only this is currently invisible in production.
- **Same defect elsewhere:** Same "writes the server directly, bypassing the local store and the queue" pattern in `recurringCatchUp.ts:65-68,127-130` (the `last_generated` advance) and in every categories/budgets/rules hook (F17). (grepped: `from('transactions').update(`, `enqueue(`)
- **Fix:** Route the repair through the store: after a successful server write, call `updateAmountSnapshot(...)` (which already exists, `transactionStore.ts:150-159`) — or better, invert it so the backfill writes locally and enqueues an `update` operation like every other write, letting `SyncManager` own the network.
- **Regression test to add:** Run `runFxBackfill` and assert the local SQLite row's `amount_in_profile_currency` is populated without a `pullRemote`.

---

### F32. `packages/supabase` is dead code that exports a service-role client factory
- **Severity:** Low *(downgraded from Medium during verification. The write-up's own analysis is right and I confirmed it: `grep -rn "voice-expense/supabase"` across `apps/` and `packages/` returns exactly three hits, all of them declarations — `apps/mobile/package.json:17`, `apps/mobile/tsconfig.json:9`, `packages/supabase/package.json:2` — and zero source imports. Nothing executes, nothing leaks, `process.env.SUPABASE_SERVICE_ROLE_KEY` is `undefined` under Metro. Unused code with a latent footgun is polish/cleanup, i.e. Low.)*
- **Status:** Newly discovered
- **Where:** `packages/supabase/src/client.ts:1-33`, `packages/supabase/src/index.ts:1-5`, `packages/supabase/src/queries/*.ts`
- **What the user sees:** Nothing. It is a trap for the next change.
- **Root cause:** Nothing imports this package. The only references anywhere are `apps/mobile/package.json:17` (a dependency declaration) and `apps/mobile/tsconfig.json:9` (a path alias) — no source file in `apps/` or `packages/` imports `@voice-expense/supabase` (grepped repo-wide). Meanwhile the package's barrel re-exports both a browser client and a service-role client from the same module:

```ts
// packages/supabase/src/index.ts:1
export { createBrowserClient, createServerClient } from './client'
```

```ts
// packages/supabase/src/client.ts:19-22
export function createServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
```

It is declared as a dependency of the **mobile** app, whose bundler (Metro) inlines `EXPO_PUBLIC_*` only — so `process.env.SUPABASE_SERVICE_ROLE_KEY` would resolve to `undefined` rather than leaking a value today. But the moment someone imports one helper from this barrel into a client bundle, they pull the service-role factory in with it. The four query modules also encode a *different* data-access convention (server-truth reads, `limit: 50` pagination, `updated_at` maintained client-side) than the app actually uses, so anyone who finds them will follow the wrong pattern.
- **Blast radius:** No runtime impact today; a latent secret-adjacent hazard and an actively misleading second data layer.
- **Same defect elsewhere:** None — this is the only unused package. (grepped: `@voice-expense/supabase`, `createServerClient`, `createBrowserClient`)
- **Fix:** Delete `packages/supabase` and remove it from `apps/mobile/package.json` and `tsconfig.json`. If any of it is worth keeping, keep only the query helpers and move the service-role factory into a separate `server-only` entry point that a client bundle cannot resolve.
- **Regression test to add:** A dependency-cruiser / lint rule forbidding imports of any module referencing `SERVICE_ROLE` from `apps/mobile` or from `'use client'` files.

---

### F33. The web env example omits the variables the app cannot boot without
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `apps/web/.env.local.example:1-3`, `.env.example:7-11`, `apps/web/src/lib/auth.ts:3-6`, `apps/web/middleware.ts:9-10`, `apps/web/src/lib/supabase/client.ts:6-7`, `apps/web/src/lib/supabase/server.ts:7-8`
- **What the user sees:** A fresh deployment where every page redirects to `/login` and every AI route 500s at import time.
- **Root cause:** Three different naming conventions for the same two values. `apps/web/.env.local.example` lists `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` and **no** `NEXT_PUBLIC_*` variables at all — yet `middleware.ts:9-10`, `supabase/client.ts:6-7` and `supabase/server.ts:7-8` all require `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, non-null-asserted. The root `.env.example` uses the `NEXT_PUBLIC_*` names but omits `SUPABASE_URL`, which `lib/auth.ts:4` needs. Worse, `lib/auth.ts` constructs its client at **module scope**, so a missing variable throws during import and takes down all three AI routes with an opaque 500 rather than a clear config error. (I verified the real `apps/web/.env.local` does define all of them; no secrets are tracked in git — only `.env.example` and `.env.local.example` are committed, and both contain placeholders.)
- **Blast radius:** Deployment fragility and a confusing failure mode; combined with F7 it makes "web auth is broken" hard to diagnose because there are two independent causes.
- **Same defect elsewhere:** `packages/supabase/src/client.ts:4-5` falls back from `NEXT_PUBLIC_*` to `EXPO_PUBLIC_*` — a third convention. (grepped: `process.env.`, `SUPABASE_URL`, `NEXT_PUBLIC_`)
- **Fix:** One `env.ts` module per app that reads and validates every variable at startup (zod or a hand-rolled check), throws a single actionable error naming the missing keys, and is the only place `process.env` is read. Standardise on `NEXT_PUBLIC_SUPABASE_URL` everywhere and update both example files to list the complete set.
- **Regression test to add:** A startup test that unsets each required variable in turn and asserts a named, actionable error.

---

### F34. A failed FX lookup silently turns a transaction into $0 in every total
- **Severity:** Medium
- **Status:** Newly discovered
- **Where:** `packages/shared/src/utils/fx.ts:36-40`, `:109-133`, `apps/mobile/src/hooks/useTransactions.ts:89-105`, `supabase/functions/generate-recurring/index.ts:155-171`
- **What the user sees:** A foreign-currency transaction saved while offline (or while frankfurter.app is down) appears in the transaction list but contributes nothing to the Overview, Insights, Budget or Export totals. The list and the totals disagree with no explanation.
- **Root cause:** `snapshotFx` returns `null` on any failure (`fx.ts:129-132`), the caller persists `amount_in_profile_currency: null` (`useTransactions.ts:103`), and the aggregation helper converts null to zero:

```ts
// fx.ts:36-40
export function aggAmount(t: { amount_in_profile_currency?: number | null }): number {
  return t.amount_in_profile_currency ?? 0
}
```

Migration 011's comment says *"the application excludes NULL rows from aggregations rather than silently lying with the unconverted amount"* (`011:17-18`) — but "excluding" a row from a sum by treating it as zero **is** silently lying, just in the other direction. `fx.ts:22-35`'s own docstring makes the same claim and even says *"UI surfaces that care can count `null` rows separately and prompt the user"*. `isFxPending` exists for exactly that (`fx.ts:48-52`) and **no caller does** — re-grepped repo-wide, the only hit is the definition itself, while `aggAmount` has 17 consumers across mobile, web, and all six web lens components.
- **Blast radius:** Understated totals for any multi-currency user, and for any user whose FX provider call fails. Same-currency writes short-circuit to rate 1 without a network call (`fx.ts:80`), so USD-only accounts — including the tester's — are unaffected today.
- **Same defect elsewhere:** `generate-recurring/index.ts:157` has the identical fallback (`rate != null ? ... : null`), so a cron-generated foreign-currency occurrence also lands at $0. (grepped: `aggAmount`, `snapshotFx`, `amount_in_profile_currency`)
- **Fix:** Make the pending state visible rather than silently zero. Every surface that sums via `aggAmount` should also count `isFxPending` rows and render "+ N transactions pending conversion" beside the total. `aggAmount` itself should not paper over the null — give it a signature that forces the caller to decide, e.g. return `{ total, pendingCount }` from a `sumInProfileCurrency(txns)` helper and delete the bare `?? 0`.
- **Regression test to add:** With the FX fetch stubbed to fail, save a EUR transaction on a USD profile and assert the Overview shows a pending-conversion indicator rather than an unchanged total.

---

### F35. `profiles` has no DELETE policy
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `supabase/migrations/001_initial_schema.sql:26-37`
- **What the user sees:** Nothing today.
- **Root cause:** `profiles` has SELECT, UPDATE and INSERT policies keyed to `auth.uid() = id`, but no DELETE policy — verified against `pg_policies` in production. With RLS enabled, that means no client can ever delete a profile row. Every other user table uses `FOR ALL`, so this is an inconsistency rather than a deliberate lock.
- **Blast radius:** None currently: account deletion goes through the service-role edge function, which bypasses RLS. It becomes a problem only if a client-side deletion path is ever added, where it would fail silently (PostgREST returns 204 for a delete that matched zero rows).
- **Same defect elsewhere:** None — `profiles` is the only table with per-command policies rather than `FOR ALL`. (grepped: `CREATE POLICY`, verified against `pg_policies`)
- **Fix:** Either add `CREATE POLICY "Users can delete own profile" ON public.profiles FOR DELETE USING (auth.uid() = id);` for consistency, or add a comment on the table stating that profile deletion is intentionally server-only. Consistency is worth more here than the capability.
- **Regression test to add:** A policy test asserting every user table has a policy covering all four commands, or an explicit documented exemption.

---

### F36. `updateTransactionFields` builds SQL from caller-supplied object keys
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/services/sync/transactionStore.ts:119-140`
- **What the user sees:** Nothing. This is defence-in-depth.
- **Root cause:** Values are parameterised correctly, but column names are interpolated:

```ts
// transactionStore.ts:128-138
for (const [key, val] of Object.entries(fields)) {
  sets.push(`${key} = ?`)
  ...
}
await db.runAsync(`UPDATE transactions SET ${sets.join(', ')} WHERE id = ?`, values)
```

The TypeScript signature restricts `fields` to a `Partial<Pick<Transaction, ...>>`, but that is erased at runtime. Both current call sites pass literals (`useTransactions.ts:162`, from `edit.tsx:133`), so nothing is exploitable today — but the function is exported and the guarantee is a compile-time one protecting a runtime SQL string.
- **Blast radius:** None today; a future call site that forwards a parsed payload (a deep link, an iOS Shortcut, an AI-returned patch object) would turn a type assumption into SQL injection against the local money database.
- **Same defect elsewhere:** This is the only dynamic SQL in the codebase; every other statement is a fixed string with `?` placeholders. (grepped: `` `UPDATE ``, `${`, `runAsync`)
- **Fix:** Add a runtime allow-list: `const ALLOWED = new Set(['amount','merchant','note','category_id','payment_method','direction','is_recurring'])` and throw on any key not in it. Three lines, and it makes the type guarantee real.
- **Regression test to add:** Call `updateTransactionFields(id, { 'amount = 0, merchant': 'x' } as any)` and assert it throws.

---

### F38. The OAuth URL, including PKCE state, is written to the device log
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `apps/mobile/src/services/googleAuth.ts:38,49,52`
- **What the user sees:** Nothing.
- **Root cause:**

```ts
// googleAuth.ts:49
console.log('[googleAuth] opening OAuth URL =', authUrl.url)
```

The Supabase authorize URL contains the `state` parameter and the PKCE challenge. On iOS these lines land in the device console and in any attached diagnostics. The authorization *code* is not logged, and the code verifier stays inside the SDK, so this is not directly exploitable — but logging auth-flow parameters in a shipped build is gratuitous.
- **Blast radius:** Low. Diagnostic noise with a small information-disclosure edge.
- **Same defect elsewhere:** F24 covers the server-side logging of financial data; those two are the only PII-adjacent log statements in shipping code paths (the rest are in `packages/ai/src/__tests__/`). (grepped: `console.log`)
- **Fix:** Delete all three lines, or gate them behind `__DEV__`.
- **Regression test to add:** A lint rule banning bare `console.log` in `apps/mobile/src/**` outside `__DEV__` guards.

---

### F39. Mobile says analytics are never collected; web offers an analytics opt-in
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `apps/mobile/app/more/privacy.tsx:258-259`, `apps/web/src/app/dashboard/settings/page.tsx:109-128`, `supabase/migrations/010_privacy_preferences.sql:17-19`, `packages/shared/src/i18n/locales/en.json:321,324`
- **What the user sees:** The mobile Privacy screen states, as a fixed guarantee, that analytics are shared "Never". The web Settings page presents a live toggle for "anonymous usage analytics" that writes `profiles.analytics_opt_in`. The same account is told two different things about the same behaviour.
- **Root cause:** Migration 010 added the columns (`010:17-19`, defaults `analytics_opt_in = false`, `crash_reports_opt_in = true`) and the web page wired read + write through `persistPrivacyFlag` (`settings/page.tsx:109-128`, which is correctly optimistic-with-rollback). The mobile screen was written on the assumption that the answer is permanently "no" and renders it as a static `SetRow` with `chevron={false}` (the comment at `privacy.tsx:243-250` says the toggles were deliberately made read-only). Neither claim is wrong about the *code* — nothing reads `analytics_opt_in` anywhere yet (re-grepped: the column's only consumers are the web toggle's read and write, plus the type declaration at `profile.ts:18`) — but the two surfaces describe different products.
- **Blast radius:** Trust and consistency, not correctness. It also means that when analytics do ship, mobile users will have been told they opted out of something they never controlled. Note the mismatch also runs the other way for `crash_reports_opt_in`, whose default is `true` — a mobile user has been told nothing about it at all while the column says they are opted in.
- **Same defect elsewhere:** `crash_reports_opt_in` has the same shape: a web toggle, no mobile surface, and no reader in any code path. F40 is the third instance of the same class on the same screen.
- **Fix:** Pick one product decision and mirror it. If the columns are the truth, mobile should render live toggles bound to the same two columns; if "never" is the truth, remove the web toggles and the columns. Whichever is chosen, the first consumer of `analytics_opt_in` must actually read it before any analytics call is made.
- **Regression test to add:** A test asserting the mobile and web privacy surfaces read from the same source of truth for each toggle.

---

### F40. The Privacy screen contradicts itself about voice recordings
- **Severity:** Low
- **Status:** Newly discovered *(this replaces the refuted F37 — see "Refuted during verification")*
- **Where:** `apps/mobile/app/more/privacy.tsx:228-229` (the "What's stored where" row), `apps/mobile/app/more/privacy.tsx:262-266` (the "What we guarantee" row), `packages/shared/src/i18n/locales/en.json:313,322,325`, `apps/mobile/src/hooks/useVoice.ts:1-60`
- **What the user sees:** Two rows on the same screen say opposite things about the same data. Under **What's stored where → On this device** the detail reads *"Voice recordings · Transcripts"*. Under **What we guarantee** the row *"Delete voice recordings after 24h"* reads *"Not stored"*.
- **Root cause:** The guarantee row is the accurate one, and the disclosure row overclaims. The app never persists audio at all: `useVoice` drives `expo-speech-recognition` and keeps only the streamed `transcript` string in React state / refs (`useVoice.ts:30-59`); there is no `Audio.Recording`, no `expo-av`, no file write, and no `.m4a` anywhere in `apps/mobile` (grepped). So "Voice recordings" are not on the device in any sense.

```json
// packages/shared/src/i18n/locales/en.json
"privacy.on_device_detail": "Voice recordings · Transcripts",   // :313 — overclaims
"privacy.status_not_stored": "Not stored",                      // :322
"privacy.ctrl_delete_voice_24h": "Delete voice recordings after 24h",  // :325
```

  Transcripts *are* stored indefinitely on-device (`localDb.ts:32`, written at `useTransactions.ts:108`, never purged) — but that is exactly what the disclosure row discloses, and `SyncManager.ts:105` correctly strips `raw_transcript` before every upload while migration 009 scrubbed the historical server rows. The privacy posture is honest; the copy is not internally consistent.
- **Blast radius:** Trust and App Store privacy-review consistency only. No data leaves the device, and the stricter of the two statements is the true one, so the app is safer than one of its own labels implies — which is the harmless direction, but it is still a screen that argues with itself.
- **Same defect elsewhere:** `apps/mobile/app/more/privacy.tsx:258-259` claims analytics are shared "Never" while the web Settings page offers a live opt-in (F39) — same class: a static guarantee row that is not derived from anything. (grepped: `privacy.ctrl_`, `privacy.status_`, `on_device_detail`, `raw_transcript`, `Audio.Recording`, `expo-av`)
- **Fix:** Change `privacy.on_device_detail` from `"Voice recordings · Transcripts"` to `"Transcripts"` in all four locale files, so the disclosure matches both the guarantee row and the code. Do **not** implement a 24-hour transcript purge on the strength of the current copy — nothing promises that, and deleting `raw_transcript` would remove the only local record of what the user actually said when a parse turns out wrong.
- **Regression test to add:** A snapshot test asserting `privacy.on_device_detail` does not mention recordings in any locale while `privacy.ctrl_delete_voice_24h` maps to `privacy.status_not_stored`.

---

### F41. A stale duplicate Expo/EAS config at the repo root would build a differently-configured binary
- **Severity:** Low
- **Status:** Newly discovered
- **Where:** `app.json:1-15` (repo root), `eas.json:22-24` (repo root, the `production` profile), and the generated `ios/murmur/` + `android/` trees at the repo root — versus the real config at `apps/mobile/app.config.js`, `apps/mobile/eas.json` and `apps/mobile/ios/Murmur/`
- **What the user sees:** Nothing today. It is a loaded gun pointed at the release pipeline.
- **Root cause:** There are two complete, divergent Expo configurations in the tree. The repo root holds:

```json
// app.json (repo root)
{ "expo": {
    "extra": { "eas": { "projectId": "79c8d5ab-…" } },
    "ios": { "bundleIdentifier": "com.voiceexpense.app",
             "infoPlist": { "ITSAppUsesNonExemptEncryption": false } } } }
```

and a root `eas.json` whose `production` profile is bare `{ "autoIncrement": true }` — **no `env` block at all**, where `apps/mobile/eas.json` supplies `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_API_BASE_URL` to all four profiles. `apps/mobile/src/lib/supabase.ts:4-5` reads those with a non-null assertion (`process.env.EXPO_PUBLIC_SUPABASE_URL!`), so a build produced from the root config yields a client constructed with `undefined` URL and key — an app that cannot authenticate or sync at all.

  The root config is not hypothetical: it has already been prebuilt. `ios/murmur/Info.plist` exists at the repo root with `NSAllowsArbitraryLoads: false` (the bare template's value, because the root `app.json` has no ATS block) while the real artifact `apps/mobile/ios/Murmur/Info.plist:55-59` has `true`. Two prebuild trees, two Xcode target names (`murmur` vs `Murmur`), two ATS postures, one gitignore rule hiding both.
- **Blast radius:** Any `eas build` run from the wrong working directory ships a binary with no Supabase credentials, a different ATS posture, and none of the plugins declared in `app.config.js` (`withoutRemotePush`, `expo-router`, `expo-secure-store`, `expo-sqlite`, `expo-notifications`). Because the root config carries the *same* `projectId` and `bundleIdentifier`, EAS would accept it as the same app rather than rejecting it.
- **Same defect elsewhere:** None — this is the only duplicated app config. (grepped: `app.json`, `eas.json`, `app.config.js` across the tree; `EXPO_PUBLIC_SUPABASE_URL` across both eas.json files)
- **Fix:** Delete the repo-root `app.json`, `eas.json`, `ios/` and `android/`. `apps/mobile` is the Expo project; there should be exactly one config for it. If the root `eas.json` is kept for some workspace reason, it must at minimum stop declaring a `build` section. Add `ios/` and `android/` to `.gitignore` **only** under `apps/mobile/` so a stray root prebuild is visible in `git status` instead of silent.
- **Regression test to add:** A CI check that fails if `app.json`, `eas.json` or `app.config.js` exists anywhere outside `apps/mobile/`.

---

## Unverified suspicions

1. **Google OAuth inside the Electron window may be blocked by Google regardless of F7.** `apps/web/src/app/login/page.tsx:31` uses `${window.location.origin}/auth/callback`, which on desktop is `http://127.0.0.1:<random-port>/auth/callback` (`main.ts:124` picks a free port at every launch). That URL cannot be registered in Supabase's redirect allow-list without a wildcard, and Google rejects OAuth in embedded user agents. `setWindowOpenHandler` only intercepts `window.open`, not the top-level navigation `signInWithOAuth` performs, so the consent screen would load inside the Electron window. I could not run the desktop build to confirm the actual failure mode, and F7 would mask it in any case.
2. **The `useTransactions` realtime effect has a stale-closure hazard.** The effect at `useTransactions.ts:47-74` depends on `[userId]` only, with a comment asserting `loadLocal` is stable — it is `useCallback([userId])`, so that holds today, but the lint suppression means a future change to `loadLocal`'s deps would silently capture a stale closure. Moot while F5 stands (the callback never fires).
3. **`resetDeadLetterEntries` may mask a historical bug that has already been fixed.** Its comment cites "a transient bug (e.g. missing unique constraint)". If migration 003/008 was the cause and it is resolved, the reset is pure liability (F13). I could not determine whether any device still holds affected entries.
4. **The single production row with `synced_at` set** is consistent with the edit-path mechanism described in F10 (`version = 4`, `synced_at` three months older than `updated_at`), but I inferred the path from code rather than observing the write. An alternative explanation — a manual dashboard edit — cannot be excluded from the data alone.

## Refuted during verification

- **F20 — "Deleting a transaction that is not in the hook's memory never syncs."** The buggy function is unreachable. `useTransactions.deleteTransaction` (`useTransactions.ts:134-154`) is **never called anywhere**: grepping every `useTransactions(` consumer shows nine call sites and not one destructures `deleteTransaction` (`edit.tsx:41` takes `editTransaction`; `record.tsx:51` and `income.tsx:32` take `createTransaction`; the other six take `transactions`/`loading` only). The delete the user actually performs lives at `apps/mobile/app/transaction/[id].tsx:147-165`, and it is correct — it reads the row from the store via `getTransactionById` (`:133`), guards with `if (!txn) return`, and enqueues **unconditionally** with the version taken from that freshly-read row. No user can reach the described symptom. The residual issue is only that a latently-broken exported function sits in the hook waiting for someone to wire it up; that is a Low-severity cleanup (delete it, or make it delegate to the `[id].tsx` logic), not a High-severity sync defect.
- **F37 — "`raw_transcript` is retained on-device forever while the Privacy screen says 'Not stored'."** The finding misquotes the UI copy and inverts the promise. The row is `privacy.ctrl_delete_voice_24h` = *"Delete voice recordings after 24h"* with status *"Not stored"* (`en.json:322,325`) — it is about **audio recordings**, not transcripts, and it is **true**: no audio is ever persisted (`useVoice.ts` streams `expo-speech-recognition` results into React state; there is no `Audio.Recording`, no `expo-av`, no audio file write anywhere in `apps/mobile`). Meanwhile the screen *explicitly discloses* on-device transcript storage two groups above, in `privacy.on_device_detail` = *"Voice recordings · Transcripts"* (`en.json:313`, rendered at `privacy.tsx:228-229`). So there is no unimplemented promise, and the proposed fix — a 24-hour `raw_transcript` purge — would have been the wrong action. What *is* real is a copy contradiction in the opposite direction (the disclosure row claims recordings are stored when they are not); that has been filed accurately as **F40, Low**.

## Note on product naming (outside this domain, flagged as requested)
The naming discrepancy in the brief is not real, and this note is retained because it records a *non*-finding. `packages/shared/src/brand.ts:11` sets `PRODUCT_NAME = 'Murmur'`, `docs/PLAN.md:3441` records "Coin & Wave" as the adopted **logo mark** (replacing "The Listening Drop") on Aug 7 2026, and `apps/mobile/app.config.js:3` ships `name: 'Murmur'`. "Coin & Wave" was never a product rename: `apps/web/src/components/MurmurMark.tsx:1` reads *"Coin & Wave — Murmur brand mark (adopted Aug 7, 2026, replacing The Listening Drop"*, and the commit message "Rebrand: Coin & Wave replaces The Listening Drop" refers to swapping one logo shape for another. The shipped UI saying "Murmur" is correct. A stale code comment mentioning "The Listening Drop" would be a Low-severity cleanup at most, not a branding inconsistency.

**Verified:** every finding above was independently re-checked against the code on 2026-08-08.
