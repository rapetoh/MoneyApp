# Technical Plan
## Murmur (formerly "Voice Expense Tracker" / "Money App")

**Version**: 1.6
**Date**: August 9, 2026
**Status**: NOT production-ready — the 2026-08-08 owner test + 360° audit ([audit-2026-08-08/](./audit-2026-08-08/)) found 314 verified defects. The eleven owner-reported issues are fixed ([fixes-2026-08-09.md](./fixes-2026-08-09.md), incl. migration 013: server-side recurring-rule ownership, applied to production). The remaining audit backlog ([audit-2026-08-08/10-FIX-PLAN.md](./audit-2026-08-08/10-FIX-PLAN.md)) is open and gates any production claim.

---

## Murmur redesign (active)

The product is undergoing a top-to-bottom redesign driven by
[DESIGN.md](./DESIGN.md). The implementation is split into phases A–J,
tracked in the user's personal plan file (`~/.claude/plans/breezy-painting-zephyr.md`):

| Phase | Scope | Status |
|---|---|---|
| A | Brand + visual refresh (rename → Murmur, sage palette, serif amounts, refreshed shadows, tab bar polish) | **Complete (Apr 18, 2026 — commit 845d8fb)** |
| B | IA reshuffle (Today / Insights / FAB / Budgets / More) | **Complete (Apr 18, 2026 — commits e79ccef + 6be5a86)** |
| C | Capture flow polish (amount-as-hero, adjust chips, rose [unclear] tag, undo snackbar) | **Complete (Aug 11, 2026 — superseded by the voice-capture in-place redesign, see dated entry below)** |
| D | New screens (Day-1 guided, Budgets tab, Privacy Center, Paywall, History heatmap) | Not started |
| E | Ask Murmur (grounded Q&A replacing the chat-style AI Advisor from v1.0) | Not started |
| F | Lazy identity + auth reshuffle (no sign-in at launch) | Not started |
| G | Native surfaces v1 (iOS + Android home-screen widgets, Apple Pay lockscreen notification) | Not started |
| H | Retention mechanics (Day-2 dunning, Day-3 Insights unlock) | Not started |
| I | Desktop companion (Electron-wrap apps/web + QR pairing) | Not started |
| J | Docs update (ongoing, every phase) | Continuous |

**Voice-capture in-place redesign (implemented Aug 11, 2026)** — source of
truth: `docs/voice redesign/` (screenshot + Claude Design HTML, artboards
11, 14, 14a–14c, 15). Full artboard→code mapping and every judgment call in
[voice redesign/IMPLEMENTATION.md](./voice%20redesign/IMPLEMENTATION.md). Summary:

- **Mic FAB no longer navigates.** A custom `tabBarButton` opens an
  in-place capture overlay (14a) over whatever screen is showing, owned by
  `VoiceSessionProvider` (`src/hooks/useVoiceSession.tsx`) mounted at the
  root. Stop → parse → result sheet (14b) rises in place; Edit expands the
  same sheet (14c); save → undo snackbar (15). Voice, scan, iOS Shortcut,
  and Android notification captures all funnel through this one sheet —
  the old double-mounted `VoiceConfirmModal` is gone.
- **Manual entry moved out of the mic flow** to a + pill on Today's header
  → Quick entry (`app/transaction/new.tsx`, artboard 11 — the old stub
  redirect is now the real screen). Receipt/paycheck scan lives there.
- **`/(tabs)/record` is a bridge route only** — it preserves every
  pre-redesign deep link (`voiceexpense://shortcut`, `?tab=manual`,
  bare) and forwards into the new surfaces. `useShortcutHandler` is
  unchanged, so existing installed Shortcuts keep working.
- **Tab bar restyled to the artboard-14 spec**: whiter blur pill, labels,
  ink active tint (no filled sage square), ink 58pt FAB.
- **Auto-save: implemented, then removed by owner decision** (Aug 11
  evening, after build 10 — a 2-3s countdown doesn't leave time to
  verify the parse; the result sheet now waits for an explicit
  Save/Edit/discard). Every save path still shows the Saved-with-Undo
  snackbar (undo = the existing soft delete). Do not resurrect the
  countdown.
- **Deliberately not built** (mockup implies capability the app doesn't
  have): live merchant/category chips while speaking (parse runs
  post-stop; the amount chip is live via the local regex), transcript
  "tap to replay" (no audio file ever exists), merchant suggestion chips
  (parser returns one merchant), date/time editing (row is read-only —
  no date picker exists anywhere yet; follow-up), and the mockup's
  "nothing uploaded" copy (transcript does go to the parse API; the
  existing honest "Processed securely" line stays).
- **Launch, brand-mark size and presentation motion → build 17** (Aug 16,
  owner review of the TestFlight build; full write-up in
  [fixes-2026-08-16-launch-brand-motion.md](./fixes-2026-08-16-launch-brand-motion.md)):
  the native launch screen had **no image and a white background** (the
  `expo-splash-screen` plugin entry carried only `backgroundColor`, which
  makes prebuild ignore the legacy `expo.splash` object) — fixed at the
  source and joined by a JS handoff veil (`src/components/LaunchScreen.tsx`)
  that breathes the mark and dissolves into the first screen (Brand Sheet
  §06, deferred since Aug 7). App icon coin raised from 51% to Apple's 75%
  keyline on every surface (iOS, Android, favicon, web, desktop
  `.icns/.ico`, in-app tiles). `BottomSheet` rebuilt so the dim fades while
  the sheet slides (RN `Modal animationType="slide"` was sliding the
  backdrop too). Voice overlay and result sheet now enter/exit through
  `<Presence>` instead of popping. Root groups cross-fade on
  `router.replace`. New `Motion` tokens (`src/theme/motion.ts`). Found and
  fixed while verifying: a **cold start via the iOS Shortcut deep link had
  always stranded the app on the launch screen** (unmatched URL → Expo
  Router's not-found screen beside the root layout → splash never hidden);
  now `app/shortcut.tsx` + `app/+not-found.tsx` routes, `useShortcutHandler`
  deleted, result sheet keyed per capture session. **Requires a new native
  build** — storyboard, icon and Android splash change at prebuild.
- **History screen + tab-bar clearance (owner review, Aug 16, 2026):** the
  History list has a month scope — a "All time / Aug 2026" chip in the
  header opens a sheet listing every month that has data (tz-correct
  `monthBounds`); the Expenses/Income toggle is a full-width segmented
  control; a summary line states the scope, count and total. Tab screens
  now clear the *measured* tab bar (`reportTabBarHeight` from the bar
  background's onLayout) plus the FAB overhang — the pill is ~80pt at
  default type, not the 68pt constant, which is why "See all 13
  transactions" sat behind the bar.
- **Refresh + first-tap flicker (owner review, Aug 16, 2026):** there was no
  pull-to-refresh anywhere on mobile (pulling did nothing; data relied on
  realtime + the foreground/network pull). Every list screen (Today,
  Insights, Budgets, History, Recurring) now has a real one
  (`useManualRefresh`: drain the outbox → pull from the server → every hook
  re-reads; the spinner resolves only when the data is current). Tabs mount
  eagerly at launch (`lazy: false`) so the first tap on a tab no longer
  pays a whole-screen mount — the ~100 ms flash on first visit is gone.
- **Today feed rule (owner decision, Aug 16, 2026):** the home screen shows
  the last 7 days of activity grouped by day (extended back only when those
  days hold fewer than 8 transactions), then an always-present "See all N
  transactions" row into the full ledger. Replaces the April 19 rule (Today
  + Yesterday + two older days, cut with no hint) which hid the biggest day
  of the owner's month. Home budget line now reads "over by" with the
  budget's own period and countdown, never a clamped "$0 left this month".
- **Ask Murmur rebuilt as a product (Aug 16, 2026)** — spec, architecture
  and verification in [docs/ask-murmur/](./ask-murmur/SPEC.md): on-device
  entry insights (upcoming bill / budget pace / category surge / subscriptions
  / month delta / net flow / large transaction), a server-owned stateful
  conversation (`POST /api/ai/ask-murmur/turn`, real prior messages + focus +
  computed figures, first model round must call a tool, `list_transactions`
  / `arith` / `can_afford` tools, category vocabulary in the overview),
  answer shape by question (figure / rows / transactions / chart / steps),
  real actions only (show transactions / set budget / open recurring / log /
  create rule), persisted + resumable threads with History on mobile and web,
  breathing Murmur mark while thinking, server-side Plus gate + rate limit.
  Legacy one-shot route kept only for TestFlight build 17. Harness rewritten
  around the owner's transcripts as threads — local runs and prod result in
  [VERIFICATION.md](./ask-murmur/VERIFICATION.md). Open: OpenAI org tier is
  30k TPM (two quick turns can hit "busy") — raise before launch.
- **(superseded by the entry above) NEXT (owner directive, Aug 16): Ask Murmur is to be rebuilt as a
  product, not patched further.** The Aug 15–16 work fixed reasoning and
  grounding defects one by one; the owner's screenshots show the real
  problem is architectural — a one-shot Q→A engine wearing a chat UI, no
  conversation state, a fixed card+chart answer template, no persisted /
  resumable thread on mobile, generic spinner. Target = Cash App's in-app
  assistant: ranked proactive insights on entry (upcoming charges vs what's
  left, spending anomalies, subscriptions to decide on), stateful
  conversation, answer shape by question type, real actions (budget /
  recurring / show transactions / log) and no fake money-moving. Full brief
  in project memory (`project_ask_murmur_rebuild_handoff.md`). Keep the
  deterministic tool layer; redesign the conversation/product layer.
- **Ask Murmur rebuilt end to end → build 16** (Aug 15 night, owner
  ultimatum; details in
  [voice redesign/IMPLEMENTATION.md](./voice%20redesign/IMPLEMENTATION.md)
  §"Ask Murmur — build 14 → build 16"): one conversation screen on mobile
  with charts; stall/repeat detectors + conversation rules in the reasoner;
  honest 429 handling (org is on a **30k TPM gpt-4o tier — raise it before
  public release**); one consistent month figure; production harness with
  the owner's exact conversations — ALL PASSED.
- **Build 12 review → build 13** (Aug 11 late evening; details in
  [voice redesign/IMPLEMENTATION.md](./voice%20redesign/IMPLEMENTATION.md)
  §"Build 12 → build 13"): smooth blurred edge glow (native
  FeGaussianBlur, no rings); shared BottomSheet shrinks under the keyboard
  and the recurring editor got a pinned Save footer; Recurring screen
  restructured (honest eyebrow, expenses/income hero + sections with
  subtotals, per-row monthly equivalents, exact 26/12 & 52/12 math);
  expo-image disk-cached logos with prefetch; app-wide query cache +
  splash preload eliminating the stale-then-current flash; Ask Murmur is
  now multi-turn on mobile.
- **Build 8 field defects → fixed same day for build 9** (owner's first
  TestFlight session, Aug 11 evening — full write-up in
  [voice redesign/IMPLEMENTATION.md](./voice%20redesign/IMPLEMENTATION.md)
  §"Build 8 field defects"): (1) every save dead-lettered —
  `sync_upsert_transaction`'s pinned search_path couldn't resolve
  `uuid_generate_v4()`; migration 030 (`gen_random_uuid()`) applied to
  production immediately, stuck items sync via Retry All; (2) "$6 today"
  dated to yesterday evening — parse "today" now comes from the client's
  civil date (new optional `todayCivilDate` on the parse API, backward
  compatible) and date-only parses are normalized via the new shared
  `normalizeParsedTransactedAt`; (3) duplicate rows after a rejected save
  — result sheet is one-shot and closes after every save attempt;
  (4) frozen listening animation — waveform no longer gated on volume
  metering (continuous mockup-style loop, mic level as amplitude boost),
  edge glow strengthened.
- **Monetization**: mobile free forever; Murmur Plus $3.99/mo or $29.99/yr unlocks Ask Murmur + auto recurring + export + desktop. **Superseded Aug 9, 2026 (fix-plan 3.1)**: no purchase flow exists yet on any platform, so the price and the "Upgrade" CTA are gone from the product until IAP/Stripe ships — see the dated entry below. The feature bundle (Ask Murmur + auto recurring + export + desktop) is unchanged; only "there is a working checkout for it today" was false.
- **Storage**: Supabase-first; no CloudKit rewrite. Privacy story via on-device voice + transcript-only sync + explicit controls.
- **Auth**: all 3 providers preserved (Apple + Google + email); lazy identity — no sign-in wall at launch.
- **Platforms**: iOS + Android, iOS-style design on both; lockscreen widget deferred to v1.1.
- **Desktop**: Electron-wrap `apps/web` rather than native SwiftUI.

**Non-regressions** (features the redesign must NOT remove):
- Merchant logos (full Google Favicon V2 pipeline + colored-initial fallback)
- Receipt + paycheck scan
- 4-locale i18n (en, fr, es, pt)
- Offline-first writes via SQLite + sync queue
- 30-day soft-delete recovery window
- On-device voice processing

---

## Tech Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Mobile | React Native + Expo | iOS + Android from one codebase |
| Desktop | Electron wrapping Next.js | Real installable Mac + Windows app, one web codebase |
| Web | Next.js | Powers both browser and Electron |
| Backend | Supabase | Auth, PostgreSQL, realtime, storage — all in one |
| Monorepo | Turborepo | Shared packages across mobile, web, desktop |
| AI (parsing + scanning) | OpenAI GPT-4o-mini | Primary provider — vision support, strict JSON mode, reliable uptime |
| AI (advisor) | GPT-4o-mini → GPT-4o | Start with mini, escalate only if response quality is insufficient |
| AI abstraction | `packages/ai/src/provider.ts` | One-line env var swap to change provider — no code changes |
| Voice STT | On-device only | Apple Speech Framework (iOS), Android SpeechRecognizer |

---

## Monorepo Structure

```
project-root/
├── apps/
│   ├── mobile/                   # React Native + Expo (iOS + Android)
│   │   └── src/
│   │       ├── app/              # Expo Router file-based routing
│   │       ├── components/       # voice/, transactions/, summary/
│   │       ├── hooks/            # useVoiceRecognition, useOfflineQueue, useRealtimeSync
│   │       ├── services/         # voice/, sync/, shortcuts/
│   │       └── widgets/          # Home screen widget
│   │
│   ├── web/                      # Next.js (browser + Electron shell)
│   │   └── src/
│   │       ├── app/              # Next.js App Router
│   │       │   ├── dashboard/    # analytics, budgets, transactions, export, settings, advisor
│   │       │   └── api/          # ai/parse-expense, ai/advisor, export/csv, export/pdf
│   │       ├── components/       # charts/, budgets/, transactions/
│   │       └── lib/
│   │           ├── supabase-browser.ts
│   │           └── electron-bridge.ts   # Single point of Electron detection
│   │
│   └── desktop/                  # Electron main process only
│       ├── main/
│       │   ├── main.ts           # BrowserWindow, loads web app
│       │   ├── preload.ts        # contextBridge IPC
│       │   └── menu.ts           # Native menu
│       └── electron-builder.yml  # .dmg (Mac) + .exe (Windows) build config
│
├── packages/
│   ├── shared/                   # Types, utils, i18n strings
│   │   └── src/
│   │       ├── types/            # transaction, budget, category, sync, ai
│   │       ├── utils/            # currency, date, validation
│   │       ├── constants/        # defaultCategories (suggestions only)
│   │       └── i18n/             # en, fr, es, pt locale files
│   │
│   ├── supabase/                 # Supabase client factory + all DB queries
│   │   └── src/
│   │       ├── client.ts
│   │       ├── queries/          # transactions, budgets, categories
│   │       └── realtime/         # subscriptions
│   │
│   └── ai/                       # All AI logic
│       └── src/
│           ├── parser.ts         # Orchestrates: local parse → cache → AI call
│           ├── localParser.ts    # Regex fallback (handles 4 locales)
│           ├── prompt.ts         # Prompt templates per language
│           ├── advisor.ts        # Builds context payload for financial advisor
│           └── cache.ts          # LRU response cache
│
├── supabase/                     # Supabase project (CLI managed)
│   ├── migrations/
│   ├── functions/                # Edge Functions (sync-transaction, generate-recurring, advisor-proxy)
│   └── seed.sql
│
├── docs/
│   ├── PRD.md                    # This project's PRD
│   └── PLAN.md                   # This file
│
├── turbo.json
└── package.json
```

---

## Database Schema

All tables: `uuid` PKs, `timestamptz` timestamps, soft deletes, Row Level Security enforced.

### `profiles` — extends auth.users
```sql
id              uuid PK → auth.users(id)
display_name    text
currency_code   text DEFAULT 'USD'
locale          text DEFAULT 'en'           -- en | fr | es | pt
voice_language  text DEFAULT 'en-US'        -- BCP-47 for STT
timezone        text DEFAULT 'UTC'
monthly_income  numeric(12,2)               -- optional, for Advisor
created_at      timestamptz
updated_at      timestamptz
```

### `categories`
```sql
id              uuid PK
user_id         uuid → auth.users
name            text
name_normalized text                        -- lowercase, for dedup
color           text                        -- hex
icon            text
parent_id       uuid → categories           -- supports nesting
is_archived     boolean DEFAULT false
UNIQUE(user_id, name_normalized)
```

### `transactions` *(core table)*
```sql
id                uuid PK
user_id           uuid → auth.users
amount            numeric(12,2)
direction         text  -- 'debit' | 'credit'
currency_code     text
category_id       uuid → categories
merchant          text
note              text
payment_method    text  -- cash|credit_card|debit_card|digital_wallet|bank_transfer|other
transacted_at     timestamptz
source            text  -- voice|manual|shortcut|notification_listener|recurring_generated
raw_transcript    text  -- stored locally only, never synced unless user opts in
ai_confidence     numeric(3,2)
is_recurring      boolean DEFAULT false
recurring_rule_id uuid → recurring_rules
-- Sync fields
client_id         uuid                      -- originating device UUID
client_created_at timestamptz
version           integer DEFAULT 1         -- incremented on each edit
is_deleted        boolean DEFAULT false
deleted_at        timestamptz
synced_at         timestamptz

INDEXES: (user_id, transacted_at DESC), (user_id, category_id), (user_id, is_deleted)
```

### `recurring_rules`
```sql
id              uuid PK
user_id         uuid → auth.users
template_txn_id uuid → transactions
name            text                     -- display label (merchant name or custom)
amount          numeric(12,2)
currency_code   text
category_id     uuid → categories
direction       text DEFAULT 'debit'     -- debit | credit (added migration 005)
payment_method  text                     -- same enum as transactions (added migration 005)
note            text                     -- (added migration 005)
frequency       text  -- daily|weekly|biweekly|monthly|quarterly|yearly
interval        integer DEFAULT 1
starts_at       timestamptz
ends_at         timestamptz              -- null = forever
last_generated  timestamptz             -- creation date; next fires 1 interval later
is_active       boolean DEFAULT true
```

### `budgets`
```sql
id              uuid PK
user_id         uuid → auth.users
category_id     uuid → categories
amount          numeric(12,2)
period          text  -- weekly|monthly|quarterly|yearly
currency_code   text
starts_at       date
is_active       boolean DEFAULT true
```

### `sync_operations` *(conflict audit log)*
```sql
id                  uuid PK
user_id             uuid → auth.users
client_id           uuid
operation           text  -- create|update|delete
entity_type         text  -- transaction|category|budget|recurring_rule
entity_id           uuid
payload             jsonb
client_timestamp    timestamptz
server_timestamp    timestamptz DEFAULT now()
is_conflict         boolean DEFAULT false
conflict_resolution text  -- last_write_wins|kept_server|kept_client|merged
```

### `devices`
```sql
id              uuid PK  (= client_id used in transactions)
user_id         uuid → auth.users
platform        text  -- ios|android|web|desktop_mac|desktop_win
device_name     text
last_seen_at    timestamptz
last_synced_at  timestamptz
```

### `ai_usage_log` *(internal cost monitoring)*
```sql
id              uuid PK
user_id_hashed  text                     -- hashed, not raw user_id
model           text
input_tokens    integer
output_tokens   integer
cost_usd_est    numeric(8,6)
cache_hit       boolean
call_type       text  -- parse | advisor
created_at      timestamptz
```

### Safe to Spend — Computed (no stored table)
```
safe_to_spend = monthly_budget
              − SUM(transactions WHERE month = current AND is_deleted = false)
              − SUM(recurring_rules WHERE next_due IS within current month AND not yet generated)
```
Computed client-side. Never negative in UI — shows $0 + "over budget by $X" when exceeded.

---

## Voice Pipeline

```
[User taps mic]
        ↓
[On-device STT]
  iOS  → Apple Speech Framework (BCP-47 from user.voice_language)
  Android → Android SpeechRecognizer
        ↓
[Interim transcript → shown in VoiceTranscript in real-time]
        ↓
[Final transcript string]
        ↓
[localParser.ts — synchronous regex pass, handles 4 locales]
  confidence ≥ 0.85 AND all fields found → skip AI → VoiceConfirmModal
  otherwise ↓
        ↓
[POST /api/ai/parse-expense]  ← Next.js route: validates JWT, rate limits, logs cost
  → OpenAI GPT-4o-mini (response_format: json_object)
  → Response: { amount, currency, direction, merchant, merchant_domain,
                category_suggestion, payment_method, transacted_at,
                confidence, needs_clarification }
        ↓
[Conflict detection — post-parse step in parser.ts]
  Checks result against: recurring rules, recent duplicates, income settings
  If conflict detected → sets clarifying_question field in response
        ↓
[VoiceConfirmModal]
  All fields editable inline
  Clarifying question shown at top if present (one question max)
        ↓
[User confirms]
        ↓
[Optimistic write to local SQLite → immediately visible in UI]
[SyncManager.enqueue → Supabase upsert if online | OfflineQueue if offline]
```

**Offline voice path**: localParser runs, `is_pending_ai_parse = true`, transaction saved locally. AI parse runs on reconnect and updates the fields.

**AI Cost Optimization**:
1. Local parser skip — ~40% of entries never call AI
2. LRU response cache — 500 entries, 30-min TTL (deduplicates repeated inputs)
3. Top-20 most-used categories sent in prompt (not full list)
4. Rate limit: 200 voice parse calls + 50 advisor calls per user per day (Phase 9)

---

## Sync Architecture

### Offline Queue (local SQLite on mobile, IndexedDB on web)
```
id              TEXT PK
operation       TEXT  -- create|update|delete
entity_type     TEXT
entity_id       TEXT
payload         TEXT  -- JSON
client_timestamp TEXT
retry_count     INTEGER DEFAULT 0
last_error      TEXT
is_pending_ai   INTEGER DEFAULT 0  -- needs AI re-parse when online
```

**SyncManager** (singleton):
- Listens to NetInfo (mobile) / `window.online` (web)
- On reconnect: drains queue chronologically
- Retries with exponential backoff, max 5 attempts
- Failed items → dead-letter queue surfaced in UI as "X items need attention"
- `stop()` bumps a drain epoch so an in-flight drain halts between entries — required by the sign-out teardown so no queue entry written by the old account fires after its session is gone

**Sign-out teardown** (`resetLocalState` in `apps/mobile/src/hooks/useAuth.ts`):
runs on the auth `SIGNED_OUT` event (module-level listener — fires for
sign-out from any screen *and* for an expired/unrefreshable session).
Stops the SyncManager mid-drain, wipes all local SQLite rows
(`transactions` + `sync_queue`, full wipe via `wipeLocalDatabase`), resets
the in-memory profile-currency cache to `USD`, cancels the pending day-2
notification, deletes the per-user SecureStore keys
(`insights_unlocked_seen`, `api_base_url`, `day_two_permission_asked`,
`day_two_user_opted_out`, `recurring_pattern_dismissed_v1`), then restarts
the SyncManager for the next sign-in. `signOut()` uses
`scope: 'local'` so signing out works offline and always emits
`SIGNED_OUT`. Result: nothing account A wrote is readable — or replayable
via the queue — in account B's session.

### Conflict Resolution (Edge Function: `sync-transaction`)
Client submits payload + the `version` it started from. Server applies rules atomically:

1. **Non-overlapping fields edited** → merge both changes
2. **Same field edited on two devices** → later `client_timestamp` wins
3. **Delete vs. edit** → delete wins (soft delete, 30-day recovery)

All conflicts logged to `sync_operations` with resolution strategy. Function is idempotent — retrying the same operation produces the same result.

---

## App Intelligence Principles

**Rule: The app never asks a question it can answer itself. It only asks when the answer changes what it does.**

| Trigger | Behavior |
|---------|----------|
| Voice logs income, income already set | Ask: "Replace $X/month or add as additional income?" |
| Voice input matches existing recurring rule | Ask: "Is this your regular [Netflix] or a separate charge?" |
| Same amount + merchant logged twice within 10 min | Ask: "Possible duplicate — add twice?" |
| Merchant has consistent historical category | Silently apply — no interruption |
| Budget exceeded | Notification: "You've passed your [Food] budget" |
| Spending spike 3x+ above category average | Insight surfaced in summary |
| Goal set, then large conflicting expense logged | Nudge: "This pushes your [goal] back ~2 months" |
| Recurring rule due, not logged by month end | Reminder notification |

Intelligence lives in `packages/ai/src/parser.ts` as a post-parse step.

---

## Development Phases

### Phase 0: Infrastructure Foundation
**Scope**: Turborepo monorepo scaffold, Supabase schema + migrations, RLS policies, TypeScript types, Supabase client factory, basic email auth, CI/CD pipeline (GitHub Actions: typecheck + lint)

**Exit criteria** — all must pass before Phase 1:
- [ ] User can sign up, sign in, sign out via email
- [ ] TypeScript compiles zero errors across all packages
- [ ] RLS verified: user A cannot read user B's transactions (two-account test script)
- [ ] All DB tables exist with correct columns (`supabase db diff` clean)
- [ ] CI pipeline green on a fresh branch

---

### Phase 1: Mobile Core — Manual Entry + Transaction List
**Scope**: Expo Router tab navigation, manual entry form, transaction list with realtime Supabase subscription, edit/delete (soft), category management (create/rename/merge/delete), basic spending summaries, Apple Sign-In + Google Sign-In, i18n (English + French), **Safe to Spend home screen view**, **merchant logos + avatar fallback**

**Exit criteria**:
- [ ] Create 10 transactions with varied categories — all persist after app restart
- [ ] Soft delete: disappears from list, `is_deleted = true` in DB
- [ ] Edit transaction amount: `version` increments in DB
- [ ] Add transaction on Device A → appears on Device B within 3 seconds (realtime)
- [ ] Summary screen totals match Supabase sum for day/week/month
- [ ] Switch locale to French → UI renders in French
- [ ] Apple Sign-In works on physical device (not simulator)
- [ ] Netflix transaction → Netflix logo displayed in list (fetched from Clearbit)
- [ ] Unknown local merchant → colored initial avatar shown (no API call made)
- [ ] Same merchant logged twice → logo loaded from local cache, no second network request
- [ ] Safe to Spend: $1000 budget + $400 spent + $50 recurring → shows $550 available
- [ ] Safe to Spend updates immediately when new transaction logged
- [ ] Safe to Spend shows $0 (not negative) when over budget

---

### Phase 2: Offline-First + Sync
**Scope**: Local SQLite store, OfflineQueue, SyncManager, conflict resolution Edge Function (`sync-transaction`), dead-letter UI in Settings

**Exit criteria**:
- [ ] Airplane mode: create 5 transactions → all visible immediately in UI
- [ ] Reconnect → all 5 in Supabase within 10 seconds
- [ ] Conflict (amount): Device A sets $10, Device B sets $20 (both offline) → DB = $20, conflict logged
- [ ] Conflict (merge): Device A changes category, Device B changes note → both changes preserved
- [ ] Kill app mid-sync → reopen → queue resumes, no duplicates, no data loss

---

### Phase 3: Voice Entry — Mobile
**Scope**: `@react-native-voice` integration, VoiceButton, VoiceTranscript, VoiceConfirmModal, `localParser.ts`, Next.js API route `/api/ai/parse-expense`, 4-language prompt templates, conflict detection post-parse step, offline voice queuing

**Exit criteria**:
- [ ] "coffee at Starbucks, four fifty" → `{amount: 4.50, merchant: "Starbucks"}` extracted correctly
- [ ] French: "café chez Starbucks, quatre euros cinquante" → correct extraction
- [ ] Amount only: "twenty dollars" → extracted, merchant = null, modal opens without crash
- [ ] Ambiguous input → `needs_clarification: true` → clarification shown in modal
- [ ] AI endpoint blocked → local parse shown, transaction saved, flagged for re-parse
- [ ] "50 dollars gas" → no AI call made (verified via server logs — local parser skip)
- [ ] Tap mic → transaction saved: ≤ 4 seconds on fast connection
- [ ] Voice input matching existing recurring rule → clarifying question shown in modal

---

### Phase 4: Apple Pay / Google Pay Automation
**Scope**: iOS Shortcuts integration (custom URL scheme deep link, in-app setup instructions), Android `NotificationListenerService` (custom Expo module, explicit opt-in flow)

**Exit criteria**:
- [ ] iOS: Install shortcut via in-app link → simulate Apple Pay → confirm modal pre-filled with amount + merchant
- [ ] iOS: Confirmed transaction saves with `source = 'shortcut'`
- [ ] Android: Grant notification permission → test bank notification → draft transaction appears
- [ ] Android: Permission denied → app works fully without listener
- [ ] No payment notification content stored server-side (audit `sync_operations` payloads)

---

### Phase 5: Desktop — Next.js Analytics Dashboard
**Scope**: All dashboard routes (analytics, budgets, transactions, export, settings), Recharts visualizations, budget CRUD with progress, CSV + PDF export, realtime sync from mobile, **Safe to Spend full breakdown panel**

**Exit criteria**:
- [ ] Add 3 transactions on mobile → dashboard updates within 3 seconds
- [ ] Create $200/month Food budget → add $150 food → progress bar at 75%
- [ ] Exceed budget → over-budget visual state
- [ ] CSV export: all transactions present, correct UTF-8 with BOM encoding
- [ ] PDF export: French/Spanish/Portuguese characters render correctly
- [ ] Analytics charts render at 1 week, 1 month, 6 months — no crashes
- [ ] New user (0 transactions): graceful empty state
- [ ] Safe to Spend panel: spent + upcoming + free sum correctly
- [ ] Each upcoming recurring item listed with name, amount, due date
- [ ] Over-budget: shows $0 + warning, never negative

---

### Phase 6: Forecasting + Recurring Transactions
**Scope**: Recurring rule CRUD on mobile + desktop, Edge Function for daily generation (pg_cron scheduled), EWMA forecast engine with 30-day minimum threshold, ForecastChart on desktop

**Exit criteria**:
- [ ] Create monthly recurring rule → simulate month elapsed → Edge Function generates transaction
- [ ] < 30 days data → shows "Not enough data yet" with day counter (e.g. "15/30 days")
- [ ] 60 days data → forecast renders, values within ±20% of recent monthly average
- [ ] Skip recurring for one month → no transaction generated, rule resumes next month

---

### Phase 7: AI Financial Advisor
**Scope**: Conversational AI chat on mobile (dedicated tab) and desktop (panel), context payload builder (`packages/ai/src/advisor.ts`), income logging via `direction='credit'` transactions, income setting in profile

**Context payload sent per question**:
```json
{
  "monthly_income": 5000,
  "avg_monthly_spend_last_3mo": 2800,
  "top_categories": [{"name": "Food", "avg_monthly": 420}, ...],
  "recurring_expenses": [{"name": "Netflix", "amount": 15, "frequency": "monthly"}, ...],
  "current_month_spent": 1240,
  "safe_to_spend_remaining": 580,
  "implied_monthly_savings": 2200,
  "user_question": "Can I afford a $6,000 car?"
}
```

Model: Claude Sonnet. Nothing stored server-side after the call.

**Exit criteria**:
- [ ] $3,000 income, $2,500 avg spend → "How much can I save?" → ~$500 figure in response
- [ ] "Can I afford a $6,000 car?" → months-to-save projection using actual savings rate
- [ ] Netflix + PlayStation in recurring → "What if I cancel subscriptions?" → both identified + impact quantified
- [ ] Investment projection question → S&P 500 7% historical average cited + disclaimer included
- [ ] No income set → advisor prompts to set income before answering goal questions
- [ ] All numbers in response traceable to context payload — no invented figures
- [ ] Response within 5 seconds on normal connection
- [ ] Session cleared on close — nothing persisted to DB

---

### Phase 8: Electron Wrapper + Home Screen Widgets
**Scope**: `apps/desktop/` Electron main process, `electron-builder` producing `.dmg` (Mac) + `.exe` NSIS installer (Windows), iOS WidgetKit widget, Android App Widget

**Exit criteria**:
- [ ] Mac: build `.dmg`, install, all dashboard features work, export uses native file dialog
- [ ] Windows: build `.exe`, install, feature-identical to Mac
- [ ] Electron and browser are feature-identical (Playwright E2E runs against both)
- [ ] iOS widget: correct today's total, tap opens voice entry directly
- [ ] Android widget: correct today's total, tap opens app
- [ ] Widget data updates within 5 minutes of a new transaction

---

### Phase 9: Production Hardening
**Scope**: Rate limiting (200 voice parse + 50 advisor calls/user/day), Sentry error tracking (mobile + web), AI cost monitoring dashboard, PostHog analytics, DB query optimization, full i18n audit (Spanish + Portuguese reviewed by native speakers), data deletion flow, App Store + Play Store submission prep

**Exit criteria**:
- [ ] 201st voice parse call in a day → HTTP 429
- [ ] 51st advisor call in a day → HTTP 429
- [ ] Force crash in mobile + web → appears in Sentry within 1 minute
- [ ] "Delete Account" → full cascade delete, user removed from auth.users
- [ ] WCAG 2.1 AA color contrast passes in light + dark mode
- [ ] Expo IPA < 50MB, Android APK < 40MB
- [ ] 100 concurrent realtime subscriptions → no dropped events

---

## Architectural Decisions & Fixes Applied (April 2026)

### AI Provider — Switched to OpenAI (April 11, 2026)
Google's `@google/generative-ai` SDK was deprecated in November 2025. After repeated 404 model-not-found and 429 quota errors in production using Gemini, all AI calls were switched to OpenAI permanently.
- `parse-expense/route.ts` and `parse-scan/route.ts` now use `openai.chat.completions.create()` with `response_format: { type: 'json_object' }`
- Env vars: `OPENAI_API_KEY`, `AI_PARSE_MODEL=gpt-4o-mini`, `AI_SCAN_MODEL=gpt-4o-mini`
- `turbo.json` build task `env` array updated to include OpenAI vars (required for Turborepo to pass env vars to Vercel build)

### Vercel Deployment (April 2026)
The Next.js web app is deployed to Vercel at `https://money-app-web-w6su.vercel.app`. All mobile builds use this URL via `EXPO_PUBLIC_API_BASE_URL` — no local dev server is required for testing voice/scan features. Env vars must be declared in `turbo.json` build task `env` array **and** set in Vercel project settings.

### Sync Fix — `onConflict` Constraint (April 2026)
`SyncManager.ts` was calling Supabase upsert with `onConflict: 'client_id'`. Postgres `ON CONFLICT` requires a UNIQUE constraint, not just an index. Fix applied:
- Changed to `onConflict: 'id'` (primary key — always has a UNIQUE constraint)
- Added migration `supabase/migrations/003_add_client_id_unique.sql` to add `UNIQUE (client_id)` on the transactions table

### Dead-Letter Queue Recovery (April 2026)
Sync entries that fail 5+ times are marked as dead-letter and never retried. On app start, `SyncManager.start()` now calls `resetDeadLetterEntries()` from `syncQueue.ts`, which resets `retry_count = 0` for stuck entries so they drain normally on next reconnect.

### Supabase Key Migration (April 2026)
Supabase migrated from legacy JWT-format API keys (`eyJ...`) to a new key format:
- Anon key: `sb_publishable_...` (previously `NEXT_PUBLIC_SUPABASE_ANON_KEY` with JWT value)
- Service role key: `sb_secret_...` (previously `SUPABASE_SERVICE_ROLE_KEY` with JWT value)
- Legacy keys were explicitly disabled in Supabase dashboard. All env files and `apps/mobile/eas.json` updated with new key format.
- **Important**: `apps/mobile/eas.json` is the only `eas.json` in the repo. (A stale duplicate config tree at the repo root — `eas.json`, `app.json`, prebuilt `ios/`/`android/` — was deleted in the Aug 2026 hardening pass; see "Environment separation" below.)

### iOS App Transport Security — ATS Exception (April 2026) — **REMOVED Aug 2026**
iOS blocks all non-HTTPS requests from native app code by default. An `NSAppTransportSecurity: { NSAllowsArbitraryLoads: true }` exception was added in April 2026 for local-dev HTTP endpoints — and shipped in every production build (audit finding 06-F21/07-F18). Removed from `apps/mobile/app.config.js` in the Aug 2026 hardening pass: every host the app talks to (Supabase, Vercel, frankfurter.app, gstatic) is HTTPS, so production needs no exception. Local `expo start` dev-clients are unaffected (Expo dev builds inject their own dev-server ATS handling). Do not re-add a blanket exception; if a specific HTTP host is ever genuinely needed in dev, scope it via `NSExceptionDomains` in a dev-only config branch.

### Google Sign-In — OAuth PKCE Redirect (April 18, 2026 — during Murmur Phase A)

**Why we rewrote it (again):** The prior fix (see "Native OIDC Nonce Flow" below) depended on passing a `nonce` parameter to `@react-native-google-signin/google-signin`'s `signIn()`. Confirmed by reading the library source (`node_modules/@react-native-google-signin/google-signin/src/signIn/GoogleSignin.ts` + `ios/RNGoogleSignin.mm`): **neither v14.0.2 (what we had) nor v16.1.2 (the current latest) supports a nonce parameter.** The native iOS bridge calls `GIDSignIn.signInWithPresentingViewController:hint:additionalScopes:completion:` — no nonce slot. GIDSignIn auto-generates a random nonce inside the id_token that the app has no API to read. Meanwhile, Supabase's `signInWithIdToken` requires the raw nonce to verify the hash. The two are architecturally incompatible — the "Nonces mismatch" / "Passed nonce and nonce in id_token should either both exist or not" errors are unavoidable with this library + method combination.

**New flow (Supabase's officially recommended React Native pattern):**

1. `signInWithOAuth({ provider: 'google', redirectTo, skipBrowserRedirect: true })` — returns an OAuth authorize URL on `<project>.supabase.co`.
2. `WebBrowser.openAuthSessionAsync(url, redirectTo)` — opens an ASWebAuthenticationSession sheet. User signs in with Google there. Google → Supabase → deep-link redirect back to our app.
3. `supabase.auth.exchangeCodeForSession(code)` — exchanges the authorization code for a session (PKCE flow, matches our Supabase client config `flowType: 'pkce'`).

**Files:**
- [apps/mobile/src/services/googleAuth.ts](../apps/mobile/src/services/googleAuth.ts) — entirely rewritten. No longer imports `@react-native-google-signin/google-signin`. Uses `expo-auth-session`, `expo-web-browser`, and `supabase.auth.signInWithOAuth`.

**Supabase dashboard requirements** (Authentication → URL Configuration):
- Redirect URLs list must contain `voiceexpense://auth/callback`. Our code produces that exact URI via `AuthSession.makeRedirectUri({ scheme: 'voiceexpense', path: 'auth/callback' })`.
- Site URL (currently `http://localhost:3000`) does **not** matter for this flow because we pass explicit `redirectTo`; should still eventually be updated to the Vercel URL so email-template flows don't leak local links.

**Native library status:** `@react-native-google-signin/google-signin` is still listed in `package.json` + `app.config.js` plugins. It's inert at runtime because the JS no longer imports or calls it, but the native Pod remains linked. Removing it is a safe follow-up cleanup; deferred out of Phase A scope (needs prebuild + fresh EAS build).

**Do not re-attempt** the native `@react-native-google-signin/google-signin` + `signInWithIdToken` approach on this library in the future. The nonce incompatibility is structural and has been re-proven across multiple fix attempts. Use the OAuth redirect flow.

---

### Google Sign-In — Native OIDC Nonce Flow (April 2026) — **SUPERSEDED on April 18, 2026** (see above)
After multiple failed attempts with crypto polyfills, Google Sign-In was rewritten to use `@react-native-google-signin/google-signin` natively. The PKCE polyfill approach was abandoned entirely.

**How it works (`apps/mobile/src/services/googleAuth.ts`)**:
1. Generate a random 16-character `rawNonce`
2. Pass `rawNonce` to `GoogleSignin.signIn({ nonce: rawNonce } as any)` — Google hashes it internally and embeds SHA256(rawNonce) in the JWT
3. Pass the same `rawNonce` to `supabase.auth.signInWithIdToken({ provider: 'google', token: idToken, nonce: rawNonce })` — Supabase hashes it and verifies it matches what's in the JWT
4. They match → sign-in succeeds

**Critical**: The `nonce` field is missing from `@react-native-google-signin/google-signin` v14 TypeScript types — requires `as any` cast. The underlying parameter is supported at runtime.

**Do not** pass the pre-hashed nonce to `signIn()` — that causes Google to hash it again, resulting in SHA256(SHA256(rawNonce)) in the JWT vs SHA256(rawNonce) from Supabase → mismatch → auth failure.

`apps/mobile/app.config.js` includes the `@react-native-google-signin/google-signin` plugin with `iosUrlScheme` matching the iOS OAuth client ID.

### Merchant Regex — Greedy Capture Fix (April 12, 2026)
`localParser.ts` merchant extraction regex was too permissive: the `0-9` and `\s` in the character class caused inputs like "at Starbucks for 450" to capture "Starbucks for 450" as the merchant name.

Fix: removed digits from the character class and rewrote to use a lookahead that stops at digits, the word "for", or a comma:
```
/(?:at|chez|en|no|@)\s+([A-Za-zÀ-ÿ'\-&.]+(?:\s+[A-Za-zÀ-ÿ'\-&.]+)*)(?=\s+(?:for\b|\d)|\s*,|\s*$)/i
```
"at Starbucks for 450" → merchant = "Starbucks" ✅

### Merchant Logos — Full Pipeline Fix (April 14, 2026)
The `merchant_domain` field existed in the Supabase schema and the `Transaction` type but was never wired through the mobile code. The AI returns it (e.g. `"netflix.com"` for Netflix), but it was being thrown away. The MerchantAvatar component had a `merchantDomain` prop but nobody passed it.

Fixes applied:
- **`localDb.ts`**: Added `merchant_domain TEXT` column to SQLite schema
- **`transactionStore.ts`**: Added `merchant_domain` to `rowToTransaction` mapper, `upsertTransaction` INSERT/UPDATE
- **`useTransactions.ts`**: `createTransaction` now accepts and saves `merchant_domain`
- **`record.tsx`**: Passes `voice.parsedExpense?.merchant_domain` when creating a transaction from voice/scan
- **`TransactionRow.tsx`**: Passes `transaction.merchant_domain` to `MerchantAvatar`
- **`transaction/[id].tsx`**: Passes `txn.merchant_domain` to `MerchantAvatar`

The `KNOWN_DOMAINS` lookup table in MerchantAvatar remains as a fallback for manual entries (where there's no AI to provide the domain).

### Merchant Logos — Clearbit Dead, Replaced with Google Favicon V2 (April 14, 2026)
Clearbit Logo API (`logo.clearbit.com`) is completely dead — DNS no longer resolves (ERR_NAME_NOT_RESOLVED). Replaced with Google Favicon V2:

```
https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://{domain}&size=128
```

- No API key required, served from `gstatic.com` CDN
- Returns proper PNG images (not .ico), which React Native handles natively
- `size=128` is the reliable sweet spot — `size=256` returns 404 for some domains (e.g. Chick-fil-A)
- Returns the largest favicon the website publishes up to 128px (does NOT upscale)
- Some merchants (e.g. Domino's) only publish 16x16 favicons — this is a website limitation, not the API's. The app falls back to a colored circle with the merchant's initial via `onError`.
- Logo background set to `transparent` to avoid design clashes with the app's warm cream background

### i18n — SafeToSpend + VoiceConfirmModal (April 12, 2026)
SafeToSpend and VoiceConfirmModal had all strings hardcoded in English, causing the French (and other locale) UI to show English text in key screens.

Fixes applied:
- `SafeToSpend.tsx` — now accepts a `locale` prop; all 7 visible strings use `t()`. Added `spentKey()` and `budgetKey()` helpers that map `BudgetPeriod` to the correct translation key.
- `VoiceConfirmModal.tsx` — now accepts a `locale` prop; all visible strings use `t()`. `record.tsx` passes `userLocale` to the modal.
- `index.tsx` (home screen) — date formatting uses `locale` variable (was hardcoded `'en'`), empty state strings use `t()`, `SafeToSpend` receives `locale` prop.
- Added 17 new translation keys to EN/FR/ES/PT locale files: `home.spent_*`, `home.budget_*`, `home.upcoming`, `home.first_expense`, `voice.confirm_title`, `voice.you_said`, `voice.low_confidence`, `voice.ai_suggests`.

### Default Categories — DB-Managed, No Rebuild Required (April 12, 2026)
Default categories are now stored in a `default_categories` table in Supabase (migration `004_default_categories.sql`). To add or change a default category, edit the table directly in the Supabase dashboard — no code change or App Store submission needed.

`seedCategories.ts` fetches from this table at sign-up time and copies the rows into the new user's `categories` table. RLS: authenticated users can read, only service role can write.

Initial defaults (20 categories, covering all common personal spending):
Groceries, Food & Dining, Transport, Shopping, Entertainment, Health & Medical, Housing, Utilities, Subscriptions, Travel, Personal Care, Education, Gifts & Donations, Pets, Insurance, Kids & Family, Business & Work, Savings & Investing, Fees & Charges, Other.

### Category Filtering in Expenses Screen (April 12, 2026)
The expenses screen now has a horizontal scrollable row of category pills below the search bar. Only categories that have at least one transaction are shown (no clutter for empty categories). Tapping a pill filters the list to that category; tapping again deselects. Text search also now matches category names in addition to merchant and note. The filter pills are hidden entirely when no categorized transactions exist.

### Recurring Transactions — Full Implementation (April 12, 2026)

The complete recurring transactions feature was implemented across mobile. Previously only the DB table existed; everything else was missing.

**What was built:**

**`packages/shared/src/types/recurring.ts`** — `RecurringRule` interface + `RecurringFrequency` union type. Exported from `packages/shared/src/index.ts`.

**`packages/shared/src/types/ai.ts`** — Added `is_recurring_suggestion: boolean` and `recurring_frequency_suggestion: RecurringFrequency | null` to `ParsedExpense`. The AI now returns these fields so the confirm modal can pre-fill the recurring toggle automatically.

**`packages/ai/src/prompt.ts`** — Updated system prompt: AI returns `is_recurring_suggestion: true` for rent, subscriptions, bills, and salary; returns the appropriate `recurring_frequency_suggestion` (monthly for most, biweekly for paychecks). Scan prompts updated: receipts = not recurring, paychecks = recurring biweekly.

**`packages/ai/src/localParser.ts`** — Added `is_recurring_suggestion: false` and `recurring_frequency_suggestion: null` defaults to local parse result so `ParsedExpense` interface is always satisfied.

**`supabase/migrations/005_recurring_rules_fields.sql`** — Adds `direction`, `payment_method`, `note` columns to `recurring_rules`. **Must be pushed to Supabase before the next EAS build is testable** (`supabase db push`).

**`apps/mobile/src/hooks/useRecurringRules.ts`** — Full CRUD hook:
- `useRecurringRules(userId)` — fetches all rules, exposes `createRule`, `toggleRule`, `deleteRule`, `updateRule`
- `computeNextOccurrence(rule)` — derives next due date from `last_generated + frequency × interval`
- `computeUpcomingRecurring(rules, period)` — sums amounts of rules due within the current budget period (used by Safe to Spend)
- `last_generated` is set to creation time on `createRule`; this means the first auto-generation fires exactly 1 interval later (intended behavior)

**`apps/mobile/src/components/RecurringToggle.tsx`** — UI component: a Switch + horizontal frequency chip row (daily/weekly/biweekly/monthly/quarterly/yearly). Shows an "AI" badge when the toggle was pre-filled by the AI. Used in both VoiceConfirmModal and the manual entry tab.

**`apps/mobile/src/components/VoiceConfirmModal.tsx`** — Added recurring toggle below the fields. Pre-fills `isRecurring` and `recurringFrequency` from `parsedExpense.is_recurring_suggestion` / `parsedExpense.recurring_frequency_suggestion`. `ConfirmedExpense` interface now includes `isRecurring: boolean` and `recurringFrequency: RecurringFrequency`.

**`apps/mobile/src/hooks/useTransactions.ts`** — `createTransaction` now returns `{ id: string | null; error: string | null }` (was `{ error: string | null }`). The `id` is needed to set `template_txn_id` on the recurring rule. Also accepts `is_recurring` and `recurring_rule_id` fields.

**`apps/mobile/app/(tabs)/record.tsx`** — Voice confirm path: if `expense.isRecurring`, calls `createRule()` after the transaction saves, passing `template_txn_id`. Manual entry path: `RecurringToggle` added to the form; same `createRule()` call on save.

**`apps/mobile/app/(tabs)/index.tsx`** — `upcomingRecurring` prop on `SafeToSpend` now uses `computeUpcomingRecurring(recurringRules, budget?.period)` instead of hardcoded `0`.

**`apps/mobile/app/recurring.tsx`** — Recurring rules management screen. Lists all rules with: name/amount/frequency/next due date. Toggle (active/paused) + delete button per rule. Empty state with instructional copy.

**`apps/mobile/app/_layout.tsx`** — Registers `recurring` as a Stack screen with header.

**`apps/mobile/app/(tabs)/settings.tsx`** — Added "Recurring Transactions" row in Preferences section → navigates to `/recurring`.

**`supabase/functions/generate-recurring/index.ts`** — Edge Function. Fetches all active rules, generates a transaction for each rule whose next occurrence is ≤ now, advances `last_generated`. Deploy with `supabase functions deploy generate-recurring`. Scheduled daily with pg_cron (SQL in migration `015_cron_schedule_vault.sql`).

**i18n** — 17 new keys added to EN/FR/ES/PT locale files: `recurring.*` (title, toggle, all 6 frequencies, active, paused, next_due, empty, empty_sub, ai_detected, delete_confirm) + `settings.recurring`.

**AI flow (end-to-end)**:
1. User says "I paid rent" → AI parses → `is_recurring_suggestion: true`, `recurring_frequency_suggestion: "monthly"`
2. `VoiceConfirmModal` opens with the recurring toggle pre-checked and "Monthly" frequency selected, with the "AI" badge visible
3. User confirms → transaction saved with `is_recurring: true` → recurring rule created in `recurring_rules` with `template_txn_id` pointing to that transaction
4. Next month: Edge Function runs at 06:00 UTC, finds the rule due, generates a new transaction with `source: 'recurring_generated'`, advances `last_generated`
5. `Safe to Spend` on the home screen deducts the upcoming amount in real-time via `computeUpcomingRecurring`

### Auto-Category Seeding + AI Suggestion Matching (April 12, 2026 — updated April 14, 2026)
New users had zero categories, and the AI's `category_suggestion` field was ignored entirely by the UI.

Fixes applied:
- **`apps/mobile/src/services/seedCategories.ts`**: Seeds 20 default categories from the `default_categories` table in Supabase. Now uses a smarter approach: fetches existing `name_normalized` values and only inserts missing defaults — so if a user manually created "Entertainment" before seeding ran, only the other 19 are added. Previous version used a simple `count !== 0` check which skipped seeding entirely if the user had even one category.
- **`apps/mobile/app/_layout.tsx`**: Calls `seedDefaultCategories(userId)` whenever a session starts. Runs silently in the background.
- **`VoiceConfirmModal.tsx`**: Matches `parsedExpense.category_suggestion` against the user's category list using 5-tier matching:
  1. Exact match (e.g. "Food & Dining" = "Food & Dining")
  2. Category name contains suggestion (e.g. "Housing" matches "Housing & Rent")
  3. Suggestion contains category name (e.g. "Food & Dining" matches "Food")
  4. Word overlap — split both into words, match if any shared word (e.g. "Transport" matches "Transport & Gas")
  5. Keyword mapping — common AI responses mapped to default categories (e.g. "Pizza"/"Restaurant" → "Food & Dining", "Uber"/"Gas" → "Transport", "Netflix"/"Gym" → "Subscriptions")
  
  Shows an "AI suggests: X" hint beneath the picker when no match is found. On confirm, if no category is selected but a suggestion exists, the category is auto-created and assigned to the transaction.

### Local Parser — Always Route to AI When Merchant is Present (April 14, 2026)
The local parser (`packages/ai/src/localParser.ts`) was intercepting inputs like "$50 at Domino's" with 0.87 confidence and returning `category_suggestion: null`, `merchant_domain: null`, `is_recurring_suggestion: false` — stripping out all AI intelligence. The category was always empty on the confirm modal for any voice input that included a merchant name.

Fix: when a merchant is detected, the local parser now steps aside entirely (returns confidence 0) so the AI handles it. The AI provides `category_suggestion`, `merchant_domain`, and `is_recurring_suggestion` that the local parser cannot. The local parser only handles bare amounts without merchants (e.g. "twenty dollars") where there's nothing for the AI to add.

### Voice Hook — Stale Closure Fix (April 14, 2026)
`useVoice.ts` captured `userCategories`, `userCurrency`, and `userLocale` in the `runParse` callback via React's `useCallback` dependency array. If categories hadn't loaded from Supabase yet when speech recognition fired, the AI received an empty category list and couldn't match existing categories.

Fix: all three values are now stored in `useRef` and synced via `useEffect`, so the speech-end callback always reads the latest values regardless of when it fires.

### SQLite Schema Migration — merchant_domain Column (April 14, 2026)
Adding `merchant_domain TEXT` to the SQLite `CREATE TABLE` only affects new databases. Existing devices that already had the transactions table got the error: `table transactions has no column named merchant_domain`.

Fix: `localDb.ts` now runs `migrateSchema()` after `initSchema()`. It checks `PRAGMA table_info(transactions)` for the `merchant_domain` column and runs `ALTER TABLE transactions ADD COLUMN merchant_domain TEXT` if missing.

### Supabase Publishable Key Migration (April 14, 2026)
Supabase disabled legacy JWT-format anon keys. The app's `.env` file had the old `eyJ...` key which caused `AuthApiError: Legacy API keys are disabled` at startup.

Fix: replaced with the new publishable key format (`sb_publishable_...`) in `apps/mobile/.env`. Also added `EXPO_PUBLIC_API_BASE_URL=https://money-app-web-w6su.vercel.app` to `.env` — this was previously only in `eas.json` build profiles, so dev-client sessions (which read from `.env`) were falling back to `localhost:3000` and failing with "Network request failed".

### AI Parse Response Normalization (April 12, 2026)
The AI API route returned raw JSON from OpenAI without ensuring all `ParsedExpense` fields were present. When the AI omitted `is_recurring_suggestion` or `recurring_frequency_suggestion`, they were `undefined` — causing the VoiceConfirmModal recurring toggle to never pre-fill.

Fix: `packages/ai/src/parser.ts` now normalizes the raw AI response, providing sensible defaults for all 13 ParsedExpense fields before returning.

### Complete i18n Audit (April 12, 2026)
Systematic audit found 87+ hardcoded English strings across 10+ files. All strings now use `t(key, locale)`.

Files fixed:
- **`_layout.tsx`**: All Stack.Screen headerTitle/headerBackTitle now use `t()` with profile locale
- **`settings.tsx`**: Budget period labels, sign-out confirmation, budget error messages — all localized
- **`record.tsx`**: Error alerts, currency symbol (now shows profile currency, not `$`), merchant placeholder
- **`VoiceConfirmModal.tsx`**: Merchant placeholder, currency symbol (now from parsedExpense), CategoryPicker locale prop
- **`edit.tsx`**: Error alert, merchant placeholder, CategoryPicker locale prop
- **`CategoryPicker.tsx`**: All 9 strings localized, accepts `locale` prop
- **All 4 locale files**: 10+ new keys added (nav headers, settings alerts, budget periods, merchant placeholder)

### UI Redesign Pass (April 14, 2026)
Full styling pass against the Pencil design file (`docs/Design for app - pencil`). Goal: move from utilitarian look to production-grade visual polish while keeping category emojis and the raised record button on the tab bar.

Changes:
- **Tab bar** (`app/(tabs)/_layout.tsx`): Replaced custom-drawn and emoji icons with Ionicons (`home`/`home-outline`, `list`/`list-outline`, `mic`, `stats-chart`/`stats-chart-outline`, `settings`/`settings-outline`). Active tab shows icon in a filled orange pill. Record button kept raised/floating with mic icon.
- **Safe to Spend card** (`SafeToSpend.tsx`): Flat orange → 3-stop orange gradient (`#F97316 → #FB923C → #FDBA74`) via `expo-linear-gradient`, plus warm shadow.
- **Home summary cards** (`index.tsx`): Income/Expenses cards gained circular tinted icon badges (Ionicons `arrow-up`/`arrow-down`) matching design.
- **Expenses** (`expenses.tsx`): Added "All" pill as default filter. Category pills now show a colored dot instead of icon, with dark (text-color) active state. Search input became fully rounded (pill). Transactions grouped into white cards per date section.
- **Insights** (`insights.tsx`): Added month label, per-category color on bar fills, new Weekly Trend bar chart showing last 7 days of spend.
- **Settings** (`settings.tsx`): Added profile card at top (avatar initial + name + email). Text chevrons replaced with Ionicons `chevron-forward`.
- **Record/Voice** (`record.tsx`): Larger title, quoted transcript, pill-shaped scan buttons, mic button tuned (72×72, warm orange shadow), always-visible "Tap to record" / "Tap to stop" label.

Dependencies: `expo-linear-gradient` (installed), `@expo/vector-icons` (already present).

---

## Critical Files (dependency order)

| # | File | Why critical |
|---|------|-------------|
| 1 | `supabase/migrations/001_initial_schema.sql` | Everything depends on this being correct |
| 2 | `supabase/functions/sync-transaction/index.ts` | Data integrity — must be idempotent |
| 3 | `packages/ai/src/parser.ts` | All platforms route voice input through here; bugs affect cost and accuracy |
| 4 | `apps/mobile/src/services/sync/SyncManager.ts` | Offline queue + conflict client |
| 5 | `apps/web/src/app/api/ai/parse-expense/route.ts` | Auth, rate limiting, AI proxy — security + cost live here |
| 6 | `apps/web/src/lib/electron-bridge.ts` | Single point of Electron detection — all platform-specific code goes through here |

---

## Key Risks

| Risk | Mitigation |
|------|-----------|
| Apple Pay Shortcuts can't be fully automated — requires manual user setup | One-tap "Get the Shortcut" deep link, annotated in-app screenshots per iOS version |
| Android NotificationListenerService may trigger Play Store rejection | Fully opt-in, not required for core functionality, detailed justification doc prepared pre-submission |
| AI cost runaway at scale | Local parser skip ~40%, prompt caching, LRU cache, hard rate limits, cost dashboard |
| Electron + Next.js diverge over time | Single `electron-bridge.ts`, Playwright E2E runs against both in CI |
| Forecast empty state disappoints new users | 30-day progress meter, budget tracking works from day one |
| STT quality varies by language + device | User-controlled BCP-47 tag, confirm modal always shows raw transcript for correction |

---

## Open Decisions — resolved April 18, 2026 (Murmur redesign)

- [x] **App name** — **Murmur**
- [x] **Monetization model** — **Mobile free forever; Murmur Plus gates Ask Murmur + auto-recurring + export + desktop**
- [x] **Free tier scope** — **Full mobile app, no feature limits, unlimited history**
- [x] **Pricing** — **$3.99/month or $29.99/year (~35% off yearly)**; no trial

See [DESIGN.md](./DESIGN.md) and this file's "Murmur redesign" section above.

---

---

## Phase Completion Status (as of April 14, 2026)

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0 — Infrastructure | ✅ Complete | Schema, RLS, auth, monorepo |
| Phase 1 — Mobile Core | ⏳ Device testing in progress | i18n 100%; merchant logos working (Google Favicon V2); category seeding + 5-tier fuzzy matching; SQLite migration for merchant_domain; Supabase publishable key migrated |
| Phase 2 — Offline-First + Sync | ⏳ Code complete, untested | SQLite, SyncManager, syncQueue — needs device test (airplane mode → reconnect) |
| Phase 3 — Voice + Scan | ⏳ Device testing in progress | AI switched to OpenAI; local parser now always routes to AI when merchant present; voice hook stale closure fixed; EXPO_PUBLIC_API_BASE_URL added to .env for dev-client sessions |
| Phase 4 — Apple Pay / Google Pay | ⏳ Code complete, untested | iOS Shortcut URL placeholder; needs EAS build + device test |
| Phase 5 — Desktop Dashboard | 🔲 Not started | Next.js app scaffold exists on Vercel; dashboard routes not yet built |
| Phase 6 — Forecasting + Recurring | ⏳ Partial | Mobile recurring CRUD + Edge Function `generate-recurring` complete (April 12). Migration 005 must be pushed to Supabase. EWMA forecast engine + desktop recurring management not yet built. |
| Phase 7–9 | 🔲 Not started | Planned |

## Murmur redesign phases (April 2026)

See the dedicated section at top of this file for phase A–J status.

### Phase A — Brand + visual refresh (in progress April 18, 2026)

Changes applied:
- **Rename** `Voice Expense Tracker` → `Murmur` in: `apps/mobile/app.config.js` (display name, permission strings, splash/adaptive-icon background), root `package.json` name field, all 4 locale `app.name` entries (`en/fr/es/pt`), and iOS/Android splash + adaptive-icon backgrounds now use design canvas `#FBFAF7`.
- **Palette swap** in [`apps/mobile/src/theme/colors.ts`](../apps/mobile/src/theme/colors.ts):
  - Primary/accent: orange `#F97316` → **sage `#3F5A3E`** (with accentSoft `#E8EDE3`).
  - Background: `#F5F0EB` → **`#FBFAF7`** (warm off-white from design §3).
  - New ink scale: `ink` `#1B1915`, `ink2` `#3A3630`, `ink3` `#6C675E`, `ink4` `#9C9589`.
  - New surface/surface2 (`#FFFFFF` / `#F5F2EB`), canonical hairline `rgba(40,36,28,0.08)`.
  - Income recolored to sage-tinted `#4A7C59`; destructive to warm rose `#B44A3F`.
  - Category pastel tints added (peach/sage/lavender/butter/rose/olive) per design §3.
  - Deterministic merchant-avatar fallback palette rebuilt as harmonious pastels (preserves the merchant-logo feature — see non-regressions).
  - New `unclear` / `unclearSoft` tokens reserved for the rose `[unclear]` tag coming in Phase C.
  - **Semantic aliases preserved**: `primary`, `background`, `text`, `textSecondary`, `textMuted`, `border`, `card` — existing components pick up the new palette with zero call-site changes.
- **Typography** in [`apps/mobile/src/theme/typography.ts`](../apps/mobile/src/theme/typography.ts):
  - New **serif** family: `New York` on iOS / `serif` on Android (system-provided — no font asset to load).
  - New `amountHero` (92px, letter-spacing -1.6) preset reserved for Phase C listening screen.
  - New `amountLarge` (48px, serif) and `displaySerif` (34px, serif) presets.
  - Display `amount` preset upgraded from mono → **serif 20px semibold** — all row-level amount renderings pick this up.
  - Mono family retained but narrowed to `amountChip` (13px) for small numeric chips only.
  - New size tokens: `4xl` (48), `hero` (92); tighter `lineHeight.tight` (1.05).
- **Card radii** in [`apps/mobile/src/theme/index.ts`](../apps/mobile/src/theme/index.ts):
  - Added `Radius.card` (28) and `Radius.cardLarge` (34) per design §3 shape language.
  - Existing `sm/md/lg/xl` retained for row-scale corners (`xl` bumped 20 → 22).
  - Added `Hairline` export (`{ width: 1, color: 'rgba(40,36,28,0.08)' }`) as canonical divider token.
- **Display amount upgrade to serif** across all shipped amount sites:
  - `SafeToSpend.tsx` (hero amount → serif 48px; breakdown → serif; shadow recolored from orange to neutral ink; card radius → 28).
  - `TransactionRow.tsx` (row amount → serif 17px semibold).
  - `VoiceConfirmModal.tsx` (amount input → serif `3xl` semibold; currency symbol → serif xl).
  - `record.tsx` manual tab (amount input → serif `4xl` semibold; currency symbol serif).
  - `transaction/[id].tsx` (detail hero → serif `4xl`).
  - `transaction/edit.tsx` (edit amount input → serif `4xl`).
  - `recurring.tsx` (rule amount → serif sm semibold).
  - `(tabs)/insights.tsx` (metric + category amounts → serif).
  - `(tabs)/settings.tsx` (budget input → serif `4xl`).
  - `(tabs)/index.tsx` (summary card amounts → serif xl).
- **Tab bar & FAB** in [`apps/mobile/app/(tabs)/_layout.tsx`](../apps/mobile/app/(tabs)/_layout.tsx):
  - Mic FAB: 52 → 56×56, `marginTop: -8` → `-10` (raised above the pill, matching design §4).
  - FAB shadow color: orange `#F97316` → sage (`Colors.primary`).
  - Tab bar pill geometry (radius 34, floating bottom:14, shadow) retained — already close to design.
- **Orange shadow cleanup**: removed all literal `#F97316` shadow colors across [`SafeToSpend.tsx`](../apps/mobile/src/components/SafeToSpend.tsx), [`_layout.tsx`](../apps/mobile/app/(tabs)/_layout.tsx), and [`record.tsx`](../apps/mobile/app/(tabs)/record.tsx). Red `#EF4444` mic-active shadow replaced with `Colors.destructive`.
- **Doc renamed**: `docs/Claude Code Design.md` → [`docs/DESIGN.md`](./DESIGN.md).
- **Web/desktop theme aligned**: [`apps/web/src/lib/theme.ts`](../apps/web/src/lib/theme.ts) palette swapped to sage + ink + accentSoft; [`apps/web/src/app/globals.css`](../apps/web/src/app/globals.css) body bg → `#F4F1EA` (bgDesk), text → `#1B1915`, scrollbar thumb → line token; [`apps/web/src/app/layout.tsx`](../apps/web/src/app/layout.tsx) `<title>` → "Murmur". Serif font token added (`'New York', 'Georgia'`) in web theme — ready for Phase I desktop amount upgrade.
- **Brand cleanup**: [`.env.example`](../.env.example) header → Murmur; [`docs/EXTERNAL_SERVICES.md`](./EXTERNAL_SERVICES.md) title → Murmur.
- **Typecheck hygiene** (pre-existing errors unrelated to Phase A, cleaned up so CI stays green):
  - [`modules/notification-listener/src/index.ts`](../apps/mobile/modules/notification-listener/src/index.ts) + [`useNotificationListener.ts`](../apps/mobile/src/hooks/useNotificationListener.ts): replaced stale `import { Subscription } from 'expo-modules-core'` with a local `type Subscription = { remove: () => void }`; typed the `addListener('onPaymentNotification', ...)` call through an explicit cast since the EventEmitter generic tightened in recent Expo SDKs. Added the missing `is_recurring_suggestion` + `recurring_frequency_suggestion` fields to the ParsedExpense literal.
  - [`transactionStore.ts`](../apps/mobile/src/services/sync/transactionStore.ts): replaced the undefined `SQLite.SQLiteBindValue[]` cast with a proper `import type { SQLiteBindValue } from 'expo-sqlite'`.

**Notes for review:**
- Internal package names (`@voice-expense/mobile`, `@voice-expense/shared`, etc.) and the app slug (`voice-expense-tracker`), scheme (`voiceexpense`), and bundle identifier (`com.voiceexpense.app`) were deliberately **not** renamed. They're not user-visible and renaming them would require EAS reconfiguration, Supabase OAuth client updates, and deep-link handler changes — unrelated to the Phase A visual refresh.
- `fontFamily.mono` retained and still loaded via expo-font; reserved for the `amountChip` preset.
- Shape language only applied to the SafeToSpend hero card (representative). Other cards will bump to `Radius.card` naturally as their screens are redesigned in Phase D.

### Phase B — IA reshuffle (in progress April 18, 2026)

Design reference: [DESIGN.md](./DESIGN.md) §4 "Information architecture".

**Tab bar** — restructured in [apps/mobile/app/(tabs)/_layout.tsx](../apps/mobile/app/(tabs)/_layout.tsx):

| Before (Phase A) | After (Phase B) |
|---|---|
| Home → Expenses → [Record FAB] → Insights → Settings | **Today → Insights → [Record FAB] → Budgets → More** |

- `Home` tab renamed to **Today** (file stays at `(tabs)/index.tsx`; the real "Today" redesign — serif headline, budget header line, weekly bar — lands in Phase D).
- `Expenses` tab **demoted** to `More → History` (file moved: `(tabs)/expenses.tsx` → `more/history.tsx`, git rename preserves history).
- `Settings` tab **demoted** to `More → Settings` (file moved: `(tabs)/settings.tsx` → `more/settings.tsx`).
- **Budgets** promoted to a top-level tab with a new stub screen at [`(tabs)/budgets.tsx`](../apps/mobile/app/(tabs)/budgets.tsx). Ring hero + per-category bars land in Phase D.
- **More** tab added at [`(tabs)/more.tsx`](../apps/mobile/app/(tabs)/more.tsx) — a sectioned list drawer: *Activity* (History, Recurring), *Intelligence* (Ask Murmur — Plus-gated pill visible), *Account* (Settings, Privacy Center, Help). Uses the new `Hairline` + `Radius.card` tokens.

**New Stack screens registered** in [apps/mobile/app/_layout.tsx](../apps/mobile/app/_layout.tsx):
- `more/history` (moved from tabs)
- `more/settings` (moved from tabs)
- `more/privacy` (new stub — full Privacy Center in Phase D)
- `more/ask` (new stub — Ask Murmur entry in Phase E)
- `more/help` (new stub — contact + version)

Each pushes as a card on top of the tab bar; the bar hides on push, matches the existing `recurring` / `transaction/[id]` pattern.

**i18n** — 34 new keys added across en/fr/es/pt for: new tab labels (today/budgets/more), More section (title + 3 section headers + 6 row labels), and the 3 new stub screens (budgets/privacy/ask/help). The old `tabs.home` / `tabs.expenses` / `tabs.settings` keys are retained (not removed) so any stray reference keeps working through the transition.

**Cross-references updated:**
- [apps/mobile/app/(tabs)/index.tsx](../apps/mobile/app/(tabs)/index.tsx) — "View all" link `/(tabs)/expenses` → `/more/history`.

**Not yet done in Phase B (by design):**
- Today screen redesign (serif headline, budget header line, weekly bar chart) — Phase D.
- Budgets tab full implementation — Phase D.
- Privacy Center full implementation — Phase D.
- Ask Murmur full implementation — Phase E.
- Settings screen visual refresh — picked up naturally when Settings is next touched.

### Phase C — Capture flow polish (completed Aug 11, 2026)

Design reference: [DESIGN.md](./DESIGN.md) §3 Motion + §5 Confirm + §5 Today.

> **Update Aug 11, 2026** — the voice-capture in-place redesign (see the
> dated entry in "Murmur redesign" above and
> [voice redesign/IMPLEMENTATION.md](./voice%20redesign/IMPLEMENTATION.md))
> closed out this phase and superseded several artifacts named below:
> `ListeningView`, `VoiceWaveform`, and `VoiceConfirmModal` were replaced by
> `VoiceCaptureOverlay`, `LiveWaveform`, and `VoiceResultSheet` (all owned
> by `VoiceSessionProvider`), and the "undo for save" deferral shipped —
> every create path now shows the Saved-with-Undo snackbar.

**New components:**
- [apps/mobile/src/components/AmountAdjustChips.tsx](../apps/mobile/src/components/AmountAdjustChips.tsx) — pill row of `−$1 +$1 +$5 +$10` buttons beneath the amount input. Tap applies the delta, rounds to 2 decimals, clamps at 0. Wrong amount is the #1 voice-parse error; a one-tap fix beats reopening the keyboard.
- [apps/mobile/src/components/UndoSnackbar.tsx](../apps/mobile/src/components/UndoSnackbar.tsx) — dark pill floating above the tab bar with a 4-second linear progress bar (per DESIGN.md §3 Motion). `onUndo` fires on tap, `onDismiss` fires after the countdown. The pill renders its own safe-area offset against the raised tab bar (bottom: 14 + 68 + spacing).
- [apps/mobile/src/hooks/useUndo.tsx](../apps/mobile/src/hooks/useUndo.tsx) — React context + `<UndoProvider>` + `useUndo()` hook. Only one snackbar can be shown at a time; a new `showUndo` replaces any currently-queued pending undo (matches iOS behavior — only one safety-net affordance at a time, the previous action commits silently).

**Wiring:**
- [apps/mobile/app/_layout.tsx](../apps/mobile/app/_layout.tsx) root return wrapped with `<UndoProvider>` so any screen can call `useUndo()`. Also fixed a stale `#F5F0EB` StatusBar background leftover from before Phase A's palette swap — now `#FBFAF7`.
- [apps/mobile/src/components/VoiceConfirmModal.tsx](../apps/mobile/src/components/VoiceConfirmModal.tsx) amount card upgraded: accent border (1.5px sage) + soft sage glow shadow + `Radius.card` (28) corners, per DESIGN.md §5 "Confirm — The amount card is bordered in accent + soft glow". Adjust chips row (`−$1 +$1 +$5 +$10`) added under the amount input inside the card.
- [apps/mobile/app/transaction/[id].tsx](../apps/mobile/app/transaction/[id].tsx) delete flow rewritten. The prior `Alert.alert("Delete transaction? This cannot be undone.")` is gone — the Undo snackbar IS the confirmation and the copy was actively lying (it CAN be undone now). On delete: snapshot the row, soft-delete, navigate back, show `Deleted · {merchant} {amount}` snackbar for 4s. On undo: re-upsert the snapshot with `is_deleted=false` + bumped `version` + enqueue the update, so it wins against the in-flight delete on the server. Existing 30-day soft-delete recovery window is preserved; undo is the faster-path surface.

**i18n — 8 new keys added** across en/fr/es/pt for `common.undo` and `detail.deleted`:
- en: Undo / Deleted
- fr: Annuler l'action / Supprimé
- es: Deshacer / Eliminado
- pt: Desfazer / Excluído

The existing `detail.delete_msg` ("This cannot be undone.") is now unused at the call site but left in locale files for historical reasons; safe to remove in a future cleanup.

**Explicitly deferred from Phase C (tracked as follow-ups):**
- **Listening screen amount-as-hero** (92px serif). ✅ Landed in Phase D — [apps/mobile/src/components/ListeningView.tsx](../apps/mobile/src/components/ListeningView.tsx) is a full-screen takeover rendered by [apps/mobile/app/(tabs)/record.tsx](../apps/mobile/app/(tabs)/record.tsx) while `useVoice().state` is `listening` or `processing`. Interim amount comes from a regex over the live transcript (digits + decimals); spoken-out numbers still wait for the server parse. 5 new `listening.*` i18n keys per locale. See DESIGN.md §5 Listening and [docs/money-app/project/mobile-screens-1.jsx](./money-app/project/mobile-screens-1.jsx) `S_Listening`.
- **Low-confidence rose `[unclear]` tag on the transcript.** Needs token-level confidence from the AI response (currently only overall `confidence` is returned). Requires a prompt + response-schema change in `packages/ai/src/prompt.ts` and `packages/ai/src/parser.ts`. Out of scope for a capture-polish phase; picked up alongside the listening hero work.
- **Bottom-sheet category picker.** The current inline horizontal chip scroller works fine; the bottom-sheet upgrade is pure polish and can ride with Phase D's broader capture redesign.
- **Undo for save (voice/manual create) and edit.** Harder than undo-for-delete because save-undo needs to also roll back the recurring rule that `record.tsx` creates in a separate transaction, and edit-undo needs to capture the pre-edit snapshot at the start of the edit flow. Infrastructure (`useUndo`) is in place; wiring these is a pure additive task for Phase D or later.

### Phase D — Claude Design visual match (closed April 19, 2026)

Design reference: [docs/money-app/project/](./money-app/project/) — the screen bundle from Claude Design. Twelve commits, screen-by-screen, each tracing one `S_*` component from the `mobile-screens-*.jsx` files.

**Shipped (all 4 locales — en/fr/es/pt):**

| Screen | Commit | Notes |
|---|---|---|
| Translucent tab bar + icon symbols | `39f0c0a` | Solid translucent color — real backdrop blur deferred (see native deps below) |
| `S_Today` | `536f332` | 34px serif "Today" + APRIL eyebrow + SafeToSpend + MiniBars + TxRow list |
| `S_Detail` | `68bfa3c` | 92px serif hero + merchant avatar + breakdown + soft-delete flow preserved |
| `S_Budgets` | `c9d2176` | Ring hero rendered as filled disc + halo (arc version pending `react-native-svg`) |
| `S_Privacy` | `588728f` | Back pill + serif headline + SetGroup / PrivacyRow |
| `S_Settings` + `S_Paywall` | `c0af54f` | Paywall radial glow is an RN View approximation |
| fixup 1 | `86db0bf` | Merchant logo, dots menu, + button, privacy toggles |
| fixup 2 | `a518768` | Budget quick-edit, ? fallback, play glyph |
| `S_Listening` (component) | `b58df3d` | Standalone, inert |
| `S_Listening` (wired) | `c8b3673` | Early-return in [apps/mobile/app/(tabs)/record.tsx](../apps/mobile/app/(tabs)/record.tsx) when `useVoice.state` is `listening` or `processing` |
| `S_Recurring` | `8df6ed8` | Subscriptions dashboard; tap a row → iOS action sheet (pause/resume + delete preserved) |
| `S_Insights` | `8872d3f` | Hero + delta pill + 14-bar trend + categories + dark forecast card |
| `S_AskEntry` | `e5a4e46` | Plus-gated entry UI; submit routes to `/more/paywall`. `S_AskResult` NOT built — depends on Phase E backend |
| `S_History` | `08ae365` | Year-at-a-glance; split into `more/history.tsx` (calendar + months) + `more/transactions.tsx` (search/filter list, moved via `git mv`) |
| fixup: Today icons + History picker + Transactions header | `46ff0a7` | User feedback pass — see commit body |
| `S_DayOne` (coach) | `45eafe0` | First-log guidance; renders when `transactions.length === 0`. Mic-FAB glow + "tap & hold" callout skipped (see below) |
| More drawer polish | `be310c0` | Title/eyebrow/Plus-pill aligned to Phase D rhythm |

**Explicitly not built (out of Phase D scope, tracked):**

- **`S_AskResult`** — the grounded-reasoner chat bubble screen. Needs the Phase E backend to produce real numbers from the user's transactions; a hard-coded demo would misrepresent the product. Entry screen (`S_AskEntry`) is wired to the paywall so Ask is still reachable and marketed.
- **`S_Income`** (step 3 of 3 onboarding) + the broader welcome/permissions onboarding. Phase D only shipped `S_DayOne` as a coach-on-Today. A proper onboarding flow is its own project.

**Native-dep batch — ✅ landed April 21, 2026** (commit pending below):

Three visuals that previously shipped as pure-React-Native approximations because they needed a native dep. All batched into one rebuild cycle. **Requires a native rebuild** (`npx expo prebuild --clean` or a fresh dev-client build) before these render correctly on-device.

1. **`react-native-svg@15.12.1`** — installed via `npx expo install` so the SDK 54 peer versions stay aligned.
   - **BudgetRing arc** ([src/components/BudgetRing.tsx](../apps/mobile/src/components/BudgetRing.tsx)): now renders a real stroked circle with a progress arc via `strokeDasharray = circumference × pct`. Arc starts at 12 o'clock (group rotated -90°) and uses round linecap. Color ramps sage → amber (>92%) → rose (over). The filled-disc approximation is gone.
   - **Insights trend area** ([app/(tabs)/insights.tsx](../apps/mobile/app/(tabs)/insights.tsx)): extracted to an inline `TrendSpark` component. 14 daily-spend points are smoothed through a Catmull-Rom → cubic-bezier conversion (control points offset 1/6 of the neighbor-to-neighbor vector) and rendered as two paths: a sage-gradient fill closed to the baseline, and a 2px stroke on top. Uses `viewBox="0 0 300 60"` + `preserveAspectRatio="none"` so the path stretches to the card width.
   - **Listening BigWaveform**: unchanged. The mockup draws it as a `<rect>` array; the current RN `<View>` bars already match.

2. **`expo-blur@~15.0.8`** — installed via `npx expo install`.
   - **Tab bar backdrop blur** ([app/(tabs)/_layout.tsx](../apps/mobile/app/(tabs)/_layout.tsx)): replaced the static `rgba(255,255,255,0.85)` fill with a real `BlurView` (`intensity={80}`, `tint="light"`) supplied via `tabBarBackground`. The bar's own `backgroundColor` is now `transparent`; a new `tabBarBlur` style pins the blur to the pill's rounded footprint via `absoluteFillObject` + matching `borderRadius: 34`. Real frosted-glass on iOS; falls back to a solid translucent layer on platforms without backdrop filters.

3. **`expo-linear-gradient`** — still installed, still unused. Available for the Paywall radial halo upgrade if we decide to push that further; the Insights gradient uses the SVG `LinearGradient` variant instead (cleaner since it lives inside the same SVG surface).

**Rebuild step (to actually see the above on-device):**

```sh
# from apps/mobile/
npx expo prebuild --clean         # or: eas build --profile development
npx expo run:ios                  # rebuild the iOS binary
```

Without the rebuild, the three new native dependencies aren't linked and the components will either throw on mount (SVG imports) or fall back to empty (BlurView renders nothing).

**Deliberately skipped (documented, not re-opened):**

- **DayOne mic-FAB glow + "Tap & hold to speak" callout** ([apps/mobile/src/components/DayOneFirstLog.tsx](../apps/mobile/src/components/DayOneFirstLog.tsx)): brittle absolute positioning relative to the tab bar + FAB that varies across device sizes. The coach's core job (headline + example phrasings + type-instead fallback) ships without them.

### Post-Phase-D additions (April 20–21, 2026)

Smaller packages of work landed after Phase D close-out, tracked here so nothing falls out of the record.

**Manual-entry rebuild → matches S_Keypad** (`5ae41e4` + `fe79d12` + `b646bce` + `8c65fcc` + `9a8316a`):
- Replaced the form-style Manual tab with an on-screen 3×4 keypad, 56px serif amount hero, and an amount card that hosts the Expense/Income toggle.
- "More options" moved to a bottom-sheet Modal so advanced fields (note, payment method, recurring) don't push the primary surface off screen.
- Fit-in-one-viewport pass: direction toggle inside amount card, `justifyContent: 'space-between'` on the container pins topCluster + bottomCluster to their edges, `paddingBottom: 120` clears the translucent tab bar + FAB overshoot.
- Fixed three real bugs caught during self-review: nested `<Text>` + `adjustsFontSizeToFit` rendering typed digits as a thin line (swapped for plain conditional, tabular-nums); stale closure on the `.` key (single `setAmount((prev) => …)` now covers all branches); Add CTA gated on `parseFloat(amount) > 0` (was `!== ''`, so "0" and "0." falsely enabled it).

**Today header** (`46ff0a7`):
- Swapped `search-outline` → `time-outline` for the History entry (icon no longer lies).
- Added `sparkles` sibling icon routing to `/more/ask` so the Plus-gated Ask feature isn't buried two taps deep under More.
- History screen: dropped the "More" breadcrumb text (H1 year now carries the page identity), added prev/next chevrons to the heatmap card so any month is navigable, H1 year syncs with the selected month.
- Transactions screen: custom back-pill header + dynamic title ("April 2026" when scoped, "Transactions" otherwise); native Stack header hidden to fix the flaky tap target.

**Onboarding flow → Welcome + Permissions + Income** (`5717ec7` + `c2c7878` + `89190fb` + `2613c29`):
- New route group at [apps/mobile/app/(onboarding)/](../apps/mobile/app/(onboarding)/). Three screens tracing `S_Onboard` / `S_Permissions` / `S_Income`. Header hidden, gesture-back disabled.
- Welcome: sage "M" logo tile, serif "Speak it. Spend clearly.", three value props (on-device voice / no bank linking / clarity on desktop), dark ink "Get started" CTA.
- Permissions: step 2/3 progress, mic permission card driven by `ExpoSpeechRecognitionModule.requestPermissionsAsync()` with idle/granted/denied states and a Try Again path. Shortcuts/Apple-Pay + Face ID cards from the mockup are omitted for now — neither is wired yet and showing them as Allow buttons that do nothing would lie.
- Income: step 3/3, amount input (native decimal-pad, 56px serif display), optional Source field (employer name; `MerchantAvatar` picks up the logo via domain guess), $2.5k/$4k/$6k/$10k quick-pick presets, sage privacy note, Continue/Skip + Back nav. Both Skip and Continue persist `onboarding_completed_at`; the difference is whether amount + source get written or left null.
- Schema: [supabase/migrations/006_onboarding_fields.sql](../supabase/migrations/006_onboarding_fields.sql) adds `profile.monthly_income_source` (text) + `profile.onboarding_completed_at` (timestamptz). Existing profiles backfill to `created_at` so they don't replay.
- Routing gate in [_layout.tsx](../apps/mobile/app/_layout.tsx): `ready` flag that gates splash hide on both auth *and* profile loading (prevents a flash of `/(tabs)` before `/(onboarding)/welcome` on fresh sign-up). `prevSegmentRef` suppresses the onboarding-bounce for one render cycle after the user exits `/(onboarding)` (prevents flicker back to welcome after finishing).
- Settings → new "Monthly Income" row with new [IncomeEditorModal](../apps/mobile/src/components/IncomeEditorModal.tsx) so the user can view/edit what they entered during onboarding. Also caught a long-standing mislabel: the i18n key `settings.income` was actually storing "Monthly Budget" in all 4 locales and was used by both the Budget row and the `BudgetEditorModal` title — renamed to `settings.budget`, freed `settings.monthly_income` / `settings.income_amount` / `settings.income_source_helper` for the real income feature.
- i18n: 22 new keys per locale (en/fr/es/pt) — full sentence translations, no shims.

**Day-1 coach "Or type instead" routing** (`2613c29`):
- First attempt (`89190fb`) passed `?tab=manual` and used `useState` to read it. That only ran on first mount — subsequent navigations stuck in whatever state the Record tab was last left in. Classic sticky-state bug on a persistent tab.
- Real fix: `useFocusEffect` from `expo-router` re-runs on every focus event (FAB tap, Type-instead, deep link). Reads `params.tab` and sets `activeTab` accordingly. `_nonce=Date.now()` appended to the Type-instead navigation so repeat taps are treated as distinct navigations (expo-router dedupes identical pathname+params).

**Tested vs. untested** (as of this doc update):

Verified live in simulator by the user:
- Welcome screen visuals
- Income screen visuals (amount + source)
- Day-1 coach screen
- Voice tab of Record
- Onboarding flow runs and reaches tabs

NOT yet verified (typecheck green, static analysis only):
- Fresh sign-up cold path — no splash flash, lands straight on Welcome
- Finish-onboarding bounce fix — `prevSegmentRef` guard against the race where the profile refetch loses to `router.replace('/(tabs)')`
- IncomeEditorModal in Settings — tap-to-edit, save, clear flows
- FAB vs. Type-instead tab-sync — `useFocusEffect` + nonce. Expected: FAB always lands on Voice, Type-instead always lands on Manual, no matter the order or repeat count.
- Manual tab keypad end-to-end — amount display, `.` key, backspace, save
- Permissions screen — mic Allow prompt actually fires on iOS (depends on `Info.plist` having `NSMicrophoneUsageDescription`)

**Deferred (logged, not worked on):**
- **Income frequency picker** (weekly / biweekly / monthly / yearly). Valid UX suggestion from user. Requires a new `monthly_income_frequency` column + UI picker + re-label of header/presets + monthly-equivalent normalizer in every downstream that reads `monthly_income` (Insights forecast, Ask Murmur). Tracked for a future phase.
- **Day-1 coach + Record mic redundancy**. Reviewed; kept as-is. The coach is a static teaching surface on Today for zero-transaction users; the mic on Record is the action. Removing either breaks the new-user flow.

### Post-native-dep fixes (April 23, 2026)

User feedback after the first on-device run of the native-dep rebuild surfaced seven real issues. Landed as a single batch (commit pending):

1. **Tab bar FAB was clipped + no visible pill edge + blur wasn't obviously working.** Root cause: I added `overflow: 'hidden'` on the `tabBar` style, which clipped the protruding record FAB and killed the drop shadow. The bar's own `backgroundColor: 'transparent'` also meant no visible edge when the blur was subtle (sim's flat green bg). Fix: `overflow: 'hidden'` lives only on the `tabBarBlur` layer now (so the blur is still clipped to the pill). Added `backgroundColor: 'rgba(255,255,255,0.55)'` + hairline border to the blur layer so the pill edge is always visible, blur shows through on top. Shadow restored, FAB renders as a full circle again.

2. **Insights trend had no X-axis context** — pretty line, no dates. Fix: `TrendSpark` now accepts `startLabel` / `endLabel` / `captionLabel` props. Labels flank the curve ("Apr 10" / "Apr 23" for a 14-day window) with a "LAST 14 DAYS" caption centered below. 3 new i18n keys per locale.

3. **Onboarding income was a dead profile field** — not reflected in History's Income tab, not fed into Insights. Fix: on `finishOnboarding(withIncome=true)`, the income screen now (a) creates an immediate `credit` transaction for the current month so the user sees their income right away, and (b) creates a `recurring_rule` with `direction=credit, frequency=monthly, name=source || "Salary"` so future months are generated by the existing recurring catch-up service. Both are skipped when `withIncome=false` (Skip path). 2 new i18n keys per locale (default name, txn note).

4. **Income screen's Continue button was enabled with nothing entered** — contradicted the Skip affordance. Fix: Continue is now gated on `parseFloat(amount) > 0`. User either types a positive value + Continues, or uses Skip. No silent "save nothing" path.

5. **Today's clock icon routed to the heatmap screen** — two-tap overhead to reach the transactions list (the more common intent). Fix: clock icon now routes directly to `/more/transactions`. The heatmap screen is still reachable via More → History for users who want the year-view.

6. **Flash of Today/coach before Welcome on fresh sign-up.** Root cause: the `handle_new_user` server trigger creates the profile row asynchronously from the client's perspective. The first `useProfile` fetch returned `null` immediately, `loading` flipped to `false`, and the routing gate couldn't distinguish "new user, row landing shortly" from "no profile, done loading." Fix: `useProfile` now retries the fetch every 250ms (up to 5s budget) while the row is absent. `loading` stays `true` across retries, so the `ready` gate in `_layout.tsx` keeps the splash up until a real profile arrives or we hit the budget.

7. **Mic click flickers, nothing records.** `AudioToolbox iOSSimulatorAudioDevice: Abandoning I/O cycle` in logs confirms the iOS simulator's mic pipeline is unstable — this is a **known simulator limitation**, not our bug. Info.plist has both `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription` (verified in the generated plist). **Requires real-device testing to validate the voice flow.** Not blocking for simulator screenshots.

**Still untested after this batch** (needs simulator + real-device pass):
- Tab bar visual on rebuild (FAB is a full circle, pill edge visible, blur shows content behind)
- Insights trend shows dates + caption
- Onboarding income actually creates a transaction + recurring rule visible in History > Income
- Continue button disabled state when amount empty
- Today's clock icon goes to transactions list (not heatmap)
- Fresh sign-up no longer shows Today flash before Welcome
- Mic flow on a real device (simulator can't validate)

### Post-rebuild follow-up, round 2 (April 23, 2026)

Two user-surfaced issues after the first round of fixes:

1. **"Where's the heatmap?"** — round 1 rerouted the Today clock icon away from `/more/history` but left the heatmap dangling on its own route. Moved the heatmap + months-list into Insights as a new "HISTORY" section below the Forecast card. Deleted `/more/history.tsx` entirely + the `more/history` Stack.Screen registration + the `more.history` entry in the More drawer (replaced with a "Transactions" row pointing to `/more/transactions`, icon swapped to `list-outline`). One surface for the data story, no split-brain.
2. **Mic flicker was silent.** `useVoice`'s `'end'` handler was flipping state to `'idle'` when no transcript arrived — the common simulator failure mode where `AudioToolbox` abandons the I/O cycle. Now both the `'end'`-with-no-transcript path and the `'no-speech'` error path set state to `'error'` with a `'no-transcript'` sentinel. Record screen translates it to a localized "We didn't catch anything — tap the mic to try again" message instead of a silent return to idle. Still can't fully validate on simulator, but the user now gets feedback instead of wondering what happened.

New component: `src/components/HistoryHeatmap.tsx` — reusable section containing the prev/next heatmap card + months list. No routing or page chrome of its own; the host screen owns those.

i18n: 2 new keys per locale (`insights.history`, `voice.no_transcript`).

### Post-rebuild follow-up, round 3 (April 23, 2026)

Two legitimate gaps flagged by the user after further testing:

1. **Recurring screen was empty despite transactions being flagged as recurring.** Two causes:
   - `useRecurringRules` fetches once on mount, but `/recurring` stays on the navigation stack between visits — a rule created elsewhere (onboarding's income, transaction edit, etc.) wouldn't show up until the app was reloaded. Fix: added a `refetch` return to the hook + wired a `useFocusEffect` in `recurring.tsx` so the rules list always refreshes on screen focus.
   - `createRule` silently returned `null` on error. Callers (onboarding income, record's manual save) didn't check the return value, so a failed insert produced a "ghost" transaction: flagged as recurring but with no corresponding rule. Fix: `console.warn` the error in `createRule` so dev sees it, and callers are free to surface it upstream if they want.

2. **Transaction edit didn't expose `is_recurring` or frequency.** Real gap — edit.tsx handled direction, amount, merchant, note, category, payment method, but not recurring. You couldn't toggle recurring on/off, couldn't change frequency, couldn't even see the current state. Fix: added a `RecurringToggle` to the edit screen, wired a full 4-case rule-CRUD path on save:
   - off → off: no-op.
   - on → on: update the existing rule (by `template_txn_id` match) with the new values.
   - off → on: create a new rule linked to the transaction.
   - on → off: delete the existing rule.
   
   Legacy transactions flagged recurring with no rule (the "ghost" case from issue 1) get a rule created on save, which backfills the Recurring screen automatically for that user.

Type widening to support the above:
- `editTransaction` + `updateTransactionFields` + `updateRule` signatures widened to accept the fields the edit flow needs (`is_recurring` on transactions; `category_id`, `direction`, `payment_method`, `note` on rules).
- `updateTransactionFields` also adds a boolean-to-0/1 coercion for SQLite binding, since JS booleans don't bind directly.

No new i18n keys.

### Post-rebuild follow-up, round 4 (April 25, 2026)

One user-flagged gap, three commits:

- **Detail screen had no recurring indicator.** Tapping a transaction showed amount, category, payment, source, note — but nothing about whether the transaction was flagged recurring. User had to enter Edit just to find out. Added a sage chip below the category chip on the detail screen that reads `Recurring · monthly · Next due May 24` when a linked rule exists, or just `Recurring` for ghost transactions (flagged but no rule). Uses the same `Ionicons "repeat"` glyph the transaction-list row already shows. New i18n key per locale: `detail.recurring`. (`5178d74`)
- **Today header clock icon was a clock pointing to the transaction list** — same "icon lies about destination" problem we'd fixed before. Swapped to `list-outline` so the icon matches the destination, consistent with the More drawer's Transactions row. (`1e08301`)

**Still untested live (cumulative across rounds 1–4):**

> User decision 2026-04-25: this list is the user's responsibility to validate on
> simulator/device. Claude does not stall waiting on it — items here stay pinned
> until the user confirms or files a defect. New roadmap work proceeds in
> parallel.

- Tab bar visual on rebuild (FAB is a full circle, pill edge visible, blur shows content behind)
- Insights trend shows dates + caption
- Insights HISTORY section (heatmap + months list inline below Forecast)
- Heatmap prev/next chevrons cycle months; tapping a month row drills into `/more/transactions?month=…`
- Onboarding income creates a real `credit` transaction + recurring rule (visible in Today list and `/recurring`)
- Continue button disabled state on Income when amount empty
- Today's list icon (formerly clock) goes to `/more/transactions`
- Fresh sign-up: no flash of Today before Welcome
- Mic flow on a real device (simulator can't validate)
- "We didn't catch anything" hint appears when mic fails silently
- Tab-sync: FAB always lands on Voice; Type-instead always on Manual; consecutive Type-instead taps both work
- `/recurring` screen now refreshes on focus; rule appears after onboarding income or transaction edit toggle
- Transaction edit shows recurring toggle + frequency picker; ghost-transaction self-heal works (toggle on → save creates rule)
- Detail screen shows the recurring chip with frequency + next-due

### Phase E — Ask Murmur grounded reasoner (started April 25, 2026)

Design reference: [DESIGN.md](./DESIGN.md) §Ask Murmur and `S_AskResult` in [docs/money-app/project/mobile-screens-5.jsx](./money-app/project/mobile-screens-5.jsx).

The Ask entry screen shipped in Phase D (`e5a4e46`) but its submit, suggestions, and mic all routed to `/more/paywall` — a hollow paywall pitch with no real result view. Phase E builds the backend + result screen so the Plus value proposition is real.

**Decisions:**
- **Grounded-only.** The reasoner is a closed-book reader over the user's own transactions + income + recurring rules. It MUST refuse questions whose answer requires external information (stock prices, current news, real-world predictions, generic financial advice).
- **Plus gating** rides on a `__DEV__`-only `EXPO_PUBLIC_FORCE_PLUS` env override for now. The proper `profile.plus_status` column is bundled with the IAP wiring (next phase) so we don't ship a half-built monetization surface; this phase delivers the feature, not the purchase flow.
- **Structured response.** The model returns a typed JSON shape (verdict + breakdown stat rows + optional accent note + optional action pills + attribution + out-of-scope flag) so the result screen renders the same regardless of locale or question shape. Keeps the chat-bubble UX honest — no free-form prose to leak unsupported claims.
- **Transaction window.** Send only the user's last 90 days, capped at 500 entries (oldest dropped). Keeps token cost predictable; that's also the window the verdict can credibly justify.

**New types:** `AskMurmurRequest`, `AskMurmurResponse`, `AskMurmurStatRow`, `AskMurmurAction` in [packages/shared/src/types/ai.ts](../packages/shared/src/types/ai.ts).

**Backend:**
- [packages/ai/src/askMurmur.ts](../packages/ai/src/askMurmur.ts) — `buildAskMurmurPrompt(ctx)` (system prompt enforcing grounded-only, locale-aware, JSON-only) + `validateAskMurmurResponse(raw)` (defensive shape check; coerces missing fields to safe defaults so a malformed AI reply still renders cleanly).
- [apps/web/src/app/api/ai/ask-murmur/route.ts](../apps/web/src/app/api/ai/ask-murmur/route.ts) — POST endpoint, mirrors the parse-expense route shape (validateToken → OpenAI → JSON). Uses `gpt-4o-mini` by default (`AI_ASK_MODEL` env override). 800 max tokens — enough for a verdict + 8 stat rows + a note paragraph.

**Mobile:**
- [apps/mobile/app/more/ask-result.tsx](../apps/mobile/app/more/ask-result.tsx) — new screen tracing `S_AskResult`. User bubble + sparkle-avatar Murmur bubble (verdict serif text + breakdown card + optional sage note + attribution + action pills). Loading state shows a typing-dots animation in the assistant bubble. Error state shows a polite "Couldn't reach Ask Murmur — try again in a moment" with a retry button. Out-of-scope refusal renders as a single bubble with no breakdown.
- [apps/mobile/src/services/askMurmurClient.ts](../apps/mobile/src/services/askMurmurClient.ts) — assembles the request from local stores (last 90d txns from `useTransactions` cache, recurring rules, profile income/currency/locale, known categories) and POSTs it.
- [apps/mobile/src/hooks/usePlusStatus.ts](../apps/mobile/src/hooks/usePlusStatus.ts) — single source of truth for Plus gating: returns `true` only if `__DEV__ && EXPO_PUBLIC_FORCE_PLUS === '1'`. When the IAP work lands, the hook becomes the obvious place to read the receipt-validated profile column.
- [apps/mobile/app/more/ask.tsx](../apps/mobile/app/more/ask.tsx) — input bar becomes a real `TextInput`. Submit (suggestions, mic, send) routes through `usePlusStatus()`: free → `/more/paywall`, plus → `/more/ask-result?q=...`. The mic still routes to paywall for now (voice-input parity with the existing `/(tabs)/record` flow is its own task).

**i18n** — new keys per locale (en/fr/es/pt):
- `ask.thinking`, `ask.error`, `ask.retry`, `ask.followup_placeholder`, `ask.attribution`, `ask.refusal_default`, `ask.action_create_goal`, `ask.action_show_category`, `ask.action_show_transactions`, `ask.action_set_budget`, `ask.breakdown_caption`.

**Out of scope (deliberately deferred, tracked):**
- Voice follow-ups in Ask (mic on the input bar still routes to paywall — would need to thread `useVoice` through ask-result + transcript→submit; not blocking the launch of Ask).
- "Create goal / Show category" action pill destinations — the backend returns the action intents already, but the actual goal-creation surface and category-drill destination are tracked under their own line items. The pills render with their copy and a TODO; tapping shows a brief snackbar saying "Coming soon".
- Caching (Ask results are not cached; each submission is a fresh model call).
- Plus-status profile column + IAP receipt validation (next phase).

**Untested live, Phase E:**
- Ask entry input accepts text + send button enables on non-empty
- Tapping a suggestion submits with that question
- Free user → paywall on submit (current behavior preserved)
- Plus user (`EXPO_PUBLIC_FORCE_PLUS=1`) → ask-result with the verdict + breakdown rendered
- Out-of-scope question (e.g. "what's the S&P 500 today") returns a polite refusal bubble
- Network failure shows the error bubble with retry
- Locale switch (en/fr/es/pt) drives both UI strings AND the model's response language

### Phase F — Frictionless sign-in (April 25, 2026)

**Decision (override of design doc).** The Murmur design spec calls for "lazy
identity / no sign-in wall" — the app would launch with no auth required and
prompt for an account only when the user explicitly triggered something that
needs identity. After pressure-testing both implementation paths (a local
`device_user_id` with reconciliation on first sign-in, and Supabase
`signInAnonymously()`), we overrode the design call:

- For a financial app, "no sign-in" means an unrecoverable data-loss path on
  reinstall / device wipe. Users invest weeks of capture work into expense
  trackers; the failure mode of "open the app on a new phone, all your data is
  gone" is severe enough that no design ergonomics justify it. The original
  plan's `device_user_id` approach has the same flaw — it's still a UUID
  nobody can sign back into.
- Every serious app in the category (YNAB, Copilot, MonAi, PocketGuard) keeps
  a sign-in step. The "no friction" intent is honored not by removing the
  wall but by making the wall one tap.
- Apple's App Store guideline 4.8 also requires **Sign In with Apple** to be
  offered when an iOS app provides any third-party login — even a soft "lazy"
  wall would still need SIWA in place, so the work isn't avoided.

**What shipped:**

The `(onboarding)/welcome.tsx` screen was retired and its content (sage M
tile, serif "Speak it. Spend clearly.", three value props for voice / no bank
linking / desktop) merged into [`apps/mobile/app/(auth)/sign-in.tsx`](../apps/mobile/app/(auth)/sign-in.tsx).
The combined screen is the user's first interaction:

- **Platform-aware CTA ordering.** On iOS, Sign In with Apple is the hero
  button (rendered via `expo-apple-authentication`'s native button) with
  Google as the outlined secondary. On Android, Google is the bold ink hero
  with Sign In with Apple as the secondary (handed off to a web OAuth flow —
  styled identically to the iOS version so users see the same option set on
  both platforms).
- **"More options" expandable** reveals the email + password form for users
  who explicitly want a managed account. Sign-up is reachable via a "Don't
  have an account? Create one" link inside this expandable.
- **Privacy note** at the foot of the screen: "Your data is yours. We never
  sell it. Your email is only used to keep you signed in." Localized in
  en/fr/es/pt.

[`apps/mobile/app/(auth)/sign-up.tsx`](../apps/mobile/app/(auth)/sign-up.tsx)
got the same visual refresh (sage M tile, serif headline, sage submit pill,
success-state ✓ tile + dark-ink "Back to Sign In" button) so users dropping
into it from the sign-in expandable see the same design language.

**Routing changes** in [`apps/mobile/app/_layout.tsx`](../apps/mobile/app/_layout.tsx):
post-auth users with `profile.onboarding_completed_at == null` now route
directly to `/(onboarding)/permissions` (was `/(onboarding)/welcome`). The
onboarding flow shrinks from 3 steps (Welcome → Permissions → Income) to 2
(Permissions → Income). Step labels updated across all four locales
(`onboarding.permissions.progress` → "Step 1 of 2", `onboarding.income.progress`
→ "Step 2 of 2").

**i18n** — 3 new keys per locale (en/fr/es/pt): `auth.more_options`,
`auth.hide_email_form`, `auth.privacy_note`.

**What did NOT change:**
- `useAuth.ts` is untouched. No anonymous-auth bootstrap, no
  `signInAnonymously()` call. Existing sessions still work; new users still
  go through a real provider.
- Apple, Google, and email/password flows are all preserved. Only the
  presentation changed.
- Sign-out, sign-up, all auth functions in `useAuth` keep their current
  signatures.
- The Supabase Auth dashboard does NOT need any toggle changes for this
  phase. (The earlier proposal to enable anonymous sign-ins was withdrawn
  with the override.)

**Phase F untested live:**
- Sign-in screen renders the M tile + serif headline + 3 value props above
  the auth CTAs.
- iOS: SIWA button is the hero; Google + email options are below.
- Android: Google is the hero; SIWA (web flow) is the secondary.
- "More options" reveals the email form; "Hide email options" collapses it.
- Sign up via "Create one" still routes to the create-account screen.
- Sign-out from Settings still works (returns the user to the redesigned
  sign-in screen on next launch).
- Onboarding flow is now permissions → income (no welcome step).
- Step progress text reads "Step 1 of 2" / "Step 2 of 2" across all four
  locales.

### Brand identity — The Listening Drop (April 25, 2026)

The Murmur brand sheet ([docs/money-app/project/Murmur Brand Sheet.html](./money-app/project/Murmur%20Brand%20Sheet.html)) and logo explorations ([Murmur Logos.html](./money-app/project/Murmur%20Logos.html)) landed alongside this commit. The approved mark is **The Listening Drop** — a speech-bubble droplet on a 160-unit grid, with an inner pulse (a single dot + two concentric arcs at radii 6 / 16 / 28). Visual decisions in the brand sheet that are now load-bearing across the app:

- **Color tokens.** Sage `#3F5A3E` is the only saturated accent; everything else is a warm neutral (Ink `#1B1915`, Cream `#FBFAF7`, Ink 2/3/4 grayscale). **Never blue** — the entire brand position is anti-fintech.
- **Category tints** (low-saturation pastels). Mobile theme synced to the brand sheet's exact hex values: peach `#F3E7DC`, butter `#F2E8D5`, lavender `#EEE6F0`, rose `#F4DDDD` ([apps/mobile/src/theme/colors.ts](../apps/mobile/src/theme/colors.ts)).
- **Type stack.** `New York` serif for display + money + headlines; `SF Pro Text` for sans body; `SF Mono` for codey numerics. Already in place via the existing `Typography` tokens — no changes.
- **Wordmark.** New York Medium, −2.5 letterspacing. Final "r" can pulse sage in motion contexts.
- **Splash.** 800ms hold on first paint, 320ms fade. Tagline ("Speak it. Spend clearly.") shows on cold start only, not on resume — current Expo splash plugin already handles the timing; the new icon delivers the visual. **Superseded Aug 16, 2026:** the plugin was in fact showing nothing (see [fixes-2026-08-16-launch-brand-motion.md](./fixes-2026-08-16-launch-brand-motion.md) §1); the launch is now native mark → JS veil with the 2.6s breath, 800ms minimum dwell, 360ms dissolve. Mark only — the tagline was deliberately not added (fonts are a loading gate; reference apps are mark-only).

**Shipped:**
- [apps/mobile/src/components/MurmurMark.tsx](../apps/mobile/src/components/MurmurMark.tsx) — reusable React Native SVG component implementing nine variants: `cream` (default), `sage` (brand), `ink` (dark mode), `tinted` (iOS 18 home-screen tinted), `cream-accent`, `stone`, `outline`, `mono-ink`, `mono-cream`. Variants compose a self-contained tile (background + 22% rounded corner + centered droplet) so callers don't need wrapper styles.
- **Auth screens use the real mark.** [apps/mobile/app/(auth)/sign-in.tsx](../apps/mobile/app/(auth)/sign-in.tsx) and [apps/mobile/app/(auth)/sign-up.tsx](../apps/mobile/app/(auth)/sign-up.tsx) replaced the placeholder `<Text>M</Text>` sage tile with `<MurmurMark size={64} variant="sage" />`. The brand mark is the user's first visual contact with Murmur.
- **App icon + adaptive icon + splash icon + favicon regenerated** from brand SVGs. New SVG sources live at [apps/mobile/assets/brand/](../apps/mobile/assets/brand/) (sizes updated Aug 16, 2026 — coin on the 75% keyline everywhere, see [fixes-2026-08-16-launch-brand-motion.md](./fixes-2026-08-16-launch-brand-motion.md) §2):
  - `murmur-mark-cream.svg` — 1024 cream-bg, coin on Apple's 768/1024 keyline → `assets/icon.png` (App Store / launcher) — also the source for the desktop `.icns/.ico` (`npm run icns -w @voice-expense/desktop`)
  - `murmur-mark-adaptive-foreground.svg` — 1024 transparent-bg, coin on Material's 52/108 keyline → `assets/adaptive-icon.png` (Android adaptive foreground)
  - `murmur-mark-splash.svg` — 1024 transparent-bg, coin cropped tight → `assets/splash-icon.png` (drawn at `SPLASH_IMAGE_WIDTH` from `assets/brand/launch.js` by both the native launch screen and `LaunchScreen.tsx`)
  - `murmur-mark-favicon.svg` — 192 coin + primary wave only (per brand sheet "≤24px drops the inner pulse"), 75% coin → `assets/favicon.png` and `apps/web/src/app/icon.png`
  - `launch.js` — the launch-screen constants shared by `app.config.js` and `LaunchScreen.tsx`
  - `generate-icons.mjs` — Node + sharp regeneration script. Re-run any time the SVGs change: `node apps/mobile/assets/brand/generate-icons.mjs`.

**Not shipped this commit (tracked for follow-up):**
- 2.6s breathing pulse animation. Brand sheet §06 specifies it for the splash and §01 mentions it for active listening + save events. The Listening view already has a strong identity (amount-as-hero + waveform), and a breathing splash needs a custom splash-to-app transition surface — both deserve their own focused pass. The static brand mark covers the mark-on-surfaces work. **Splash half shipped Aug 16, 2026** (`src/components/LaunchScreen.tsx`).
- Apple Sign In with the wordmark in dark contexts (e.g. paywall hero, dark splash variant).
- Profile-card avatar replacement on Settings (currently a peach tile with the user's initial — the brand sheet doesn't override this, but a sage MurmurMark with the user's initial overlaid would tighten the brand presence).

**Brand work untested live:**
- Sign-in + sign-up screens render the actual Listening Drop SVG in sage instead of the M placeholder.
- Reinstall: new app icon shows up on the home screen (cream tile, ink droplet, cream inner pulse).
- Splash screen shows the Listening Drop on cream bg before the app loads.
- Android adaptive icon: launcher mask (circle / squircle / rounded square depending on launcher) renders the droplet centered with safe-zone padding.
- Category tints across the app match the brand sheet swatches (peach / butter / lavender / rose).

### Phase H — Retention mechanics (started April 25, 2026)

Per `breezy-painting-zephyr.md` Phase H + DESIGN.md §"Retention mechanics".
Three pieces: Day-3 Insights unlock, recurring "new pattern detected" banner,
Day-2 dunning notification. The first two ship without new native deps; the
third requires `expo-notifications` + a prebuild and is committed separately.

**Shipped (part 1 — Day-3 unlock + new-pattern banner):**

- [apps/mobile/src/hooks/useInsightsUnlock.ts](../apps/mobile/src/hooks/useInsightsUnlock.ts) — single source of truth for the Day-3 Insights badge milestone. Returns `{ badge, showWelcome, markSeen }` driven by transaction count + a SecureStore flag (`insights_unlocked_seen`). The flag is per-account: the sign-out teardown (`resetLocalState` in `useAuth.ts`) deletes it along with every other per-user SecureStore key, so the next account gets its own Day-3 milestone. Eligibility threshold: 3 non-deleted transactions.
- Tab bar ([apps/mobile/app/(tabs)/_layout.tsx](../apps/mobile/app/(tabs)/_layout.tsx)) renders a small sage dot in the Insights tab icon's upper-right corner when `badge=true`. Vanishes the moment the user opens Insights for the first time.
- Insights screen ([apps/mobile/app/(tabs)/insights.tsx](../apps/mobile/app/(tabs)/insights.tsx)) shows a sage-tinted welcome card on the first eligible visit ("Three logs in. Patterns ahead."). Dismiss button calls `markSeen()` so the card and the badge clear together. Captured into local state on mount so the card persists across the dismissal-→-rerender cycle.
- [apps/mobile/src/services/recurringPatternDetector.ts](../apps/mobile/src/services/recurringPatternDetector.ts) — pure-logic detector. Scans transactions, groups by `(merchant lowercased, amount in cents)`, requires ≥2 occurrences over a ≥21-day spread, skips transactions already flagged `is_recurring` or covered by an existing active rule, skips credits, filters out user-dismissed keys. Frequency inferred from median inter-occurrence gap (≤9d weekly / ≤20 biweekly / ≤45 monthly / ≤95 quarterly / >95 yearly). Returns candidates sorted by `amount × occurrences` so the heaviest pattern surfaces first.
- [apps/mobile/src/components/RecurringPatternBanner.tsx](../apps/mobile/src/components/RecurringPatternBanner.tsx) — Today-screen banner that surfaces a single highest-priority candidate at a time. Two CTAs: **Set up** (parent runs `createRule`; banner self-dismisses on success), **Not now** (records the candidate's key in SecureStore — capped at 100 entries, FIFO-evicted, key `recurring_pattern_dismissed_v1` — so the same pattern never surfaces again).
- [apps/mobile/app/(tabs)/index.tsx](../apps/mobile/app/(tabs)/index.tsx) wires the banner above the spent-today card and supplies an `acceptPattern` handler that calls `useRecurringRules.createRule` with the candidate's full payload (including `template_txn_id` so the rule is linked to the transaction that anchored the detection).

**i18n** — 9 new keys per locale (en/fr/es/pt): `common.dismiss`, `home.pattern_eyebrow`, `home.pattern_title` (with `{merchant}/{amount}/{frequency}` placeholders), `home.pattern_body` (with `{count}`), `home.pattern_accept`, `home.pattern_dismiss`, `insights.unlock_eyebrow`, `insights.unlock_title`, `insights.unlock_body`.

**Shipped (part 2 — Day-2 dunning):**

- `expo-notifications@~0.32.16` installed via `npx expo install`. Plugin added to `app.config.js` with the sage accent + adaptive-icon foreground for the Android notification icon. **Requires `npx expo prebuild --clean` + a fresh dev-client build before notifications fire on-device.**
- [apps/mobile/src/services/dayTwoDunning.ts](../apps/mobile/src/services/dayTwoDunning.ts) — local-only schedule/cancel/permission API. `scheduleDayTwo()` cancels any prior pending notification, then schedules a TIME_INTERVAL trigger 24h out (intentionally not a calendar trigger — we don't want it pinned to a clock time). `cancelDayTwo()` clears the persisted id. `setUserOptedOut(true)` writes the SecureStore flag + cancels. `ensureDayTwoPermissionAndSchedule()` is the first-transaction prompt path: asks once, schedules on grant, no-ops on deny. `getPermissionStatus()` accepts iOS PROVISIONAL as granted (quiet delivery is fine for a gentle nudge). The notification handler is configured app-wide for foreground display: banner + sound + no badge.
- [apps/mobile/src/hooks/useDayTwoDunning.ts](../apps/mobile/src/hooks/useDayTwoDunning.ts) — lifecycle hook called once at the tabs layer. Watches transaction count across renders: list grew 0→N for the first time → prompt + schedule; list grew N→N+1 → silent reschedule; list shrank → no-op (delete intent already understood); list went to 0 → cancel pending. The first render seeds the ref without firing so existing-user cold starts don't re-prompt.
- [apps/mobile/app/(tabs)/_layout.tsx](../apps/mobile/app/(tabs)/_layout.tsx) calls `useDayTwoDunning(locale, transactions)` once so every save / delete / wipe routes through one lifecycle without each save call site having to remember to schedule.
- [apps/mobile/app/more/settings.tsx](../apps/mobile/app/more/settings.tsx) — new "Reminders" group with a "Daily check-in nudge" toggle. Off → calls `setUserOptedOut(true)` (cancels pending). On → flips the flag back, runs `ensureDayTwoPermissionAndSchedule` so a previously-denied user can re-prompt the OS by toggling.

**i18n** — 4 new keys per locale (en/fr/es/pt): `dunning.day2_title`, `dunning.day2_body`, `settings.reminders`, `settings.dunning_label`.

**Phase H untested live (part 2):**
- First transaction triggers the iOS / Android notification permission dialog.
- Subsequent transactions silently reschedule the 24h timer.
- 24h after the last transaction, a local notification fires with the dunning copy.
- Settings → Reminders → toggle off cancels the pending notification.
- Settings toggle on (after permission denied) re-prompts the OS dialog (or routes to system Settings on permanent deny — OS-handled).
- Wipe-to-empty cancels any pending notification.

**Phase H untested live (part 1):**
- Sage badge dot on Insights tab when txnCount ≥ 3 and the welcome hasn't been seen.
- Welcome card renders on the first Insights open after unlock; dismiss clears the card AND the badge.
- "New pattern detected" banner appears on Today when 2+ same-merchant-same-amount transactions span ≥21 days.
- Set up button creates a new rule visible in `/recurring`.
- Not now hides the pattern permanently (across app restarts).
- Banner only surfaces one candidate at a time.

### Data export — Plus tier (April 25, 2026)

The paywall has promised "data export" since Phase D; it is now real. Plus
users can export the full transaction history from Settings → Data → Export
your data, picking from three formats. Each export writes to the cache
directory and hands the file off to the system share sheet — Mail, Files,
AirDrop, Messages, etc. Murmur never uploads any of the export.

**Stack:**
- `expo-file-system@~19.0.21` — new v19 `Paths` + `File` API. Cache
  directory access (`Paths.cache`), file create/write/move via `File`
  instances. The legacy `FileSystem.writeAsStringAsync` API is not used
  anywhere in the export path.
- `expo-sharing@~14.0.8` — system share sheet for the file URI.
- `expo-print@~15.0.8` — PDF generation. Renders an HTML template through
  WebKit on iOS / the Android print framework on Android. No web fonts
  loaded — relies on system serif (`New York` / `Georgia`) so the PDF
  matches the Murmur brand sheet's type rules without bundle bloat.

All three of these are native modules and require **`npx expo prebuild
--clean` + a fresh dev-client build** (same step needed for the Phase H
expo-notifications add — one rebuild covers both).

**Implementation:**
- [apps/mobile/src/services/exportData.ts](../apps/mobile/src/services/exportData.ts) — pure formatters + the share-flow IO. `buildCSV`, `buildJSON`, `pdfHTML`, and `exportAndShare(format, input)`. CSV intentionally uses dot-decimal + comma-separator (the universal Excel/Numbers/Sheets contract) regardless of UI locale; JSON is structured with `app: 'Murmur'` + `version: 1` so future Murmur instances can re-import it cleanly. The PDF template uses serif money + sage credit highlighting + the brand-sheet color tokens. Files are named `murmur-YYYY-MM-DD.{csv,json,pdf}`.
- [apps/mobile/app/more/settings.tsx](../apps/mobile/app/more/settings.tsx) — new "Data" group with an "Export your data" row. Free users tapping the row hit the paywall; Plus users get a three-button format-picker modal (CSV / JSON / PDF) with a tooltip line on each option. Tapping a format runs the export and hands the file to the share sheet; failures surface as an Alert.

**i18n** — 22 new keys per locale (en/fr/es/pt) for the Settings entries,
modal copy, and PDF chrome.

**Untested live:**
- Settings → Data → Export shows the row with "CSV · JSON · PDF" detail when Plus, "Murmur Plus" detail when free.
- Free user tap routes to /more/paywall.
- Plus user tap opens the format picker.
- CSV exports cleanly — open in Excel/Numbers and rows align.
- JSON exports as structured `{ app, version, exported_at, transactions }`.
- PDF exports with the serif title, totals card, and table.
- Share sheet appears with platform-native destinations (Mail, Files, AirDrop on iOS).
- File name in destinations is `murmur-YYYY-MM-DD.{ext}`.

### Phase I part 1 — Desktop web UI (April 25, 2026)

Per `breezy-painting-zephyr.md` Phase I and the desktop mockups at
[docs/money-app/project/desktop-screens-1.jsx](./money-app/project/desktop-screens-1.jsx)
+ [desktop-screens-2.jsx](./money-app/project/desktop-screens-2.jsx). Up to
this commit `apps/web` was API-only — three Next.js routes (parse-expense,
parse-scan, ask-murmur) plus a placeholder dashboard with a dark sidebar
that didn't match the brand. This commit ports the mobile product surface
to the wider canvas: same Supabase-backed data, no schema changes, no new
API routes. The Electron wrap + signing/notarization is the next step;
this commit just makes the web UI real first.

**Design system:** [apps/web/src/lib/theme.ts](../apps/web/src/lib/theme.ts)
rewritten to mirror the mobile `colors.ts` and the project tokens
(`tokens.jsx`). Adds the full ink scale (1–4), category tints
(food/transit/shopping/bills/coffee/health/work/other), surface and
hairline tokens, and the type stack — New York / Iowan Old Style for
display + money, SF Pro Text for sans body, SF Mono for codey numerics.
Web fonts removed — system fonts only, matching the brand sheet.

**Brand mark** at [apps/web/src/components/MurmurMark.tsx](../apps/web/src/components/MurmurMark.tsx)
— SVG implementation of The Listening Drop with the same five variants as
the mobile component (cream / sage / ink / mono-ink / mono-cream). Used in
the sidebar, Ask Murmur header, and the login screen.

**Reusable primitives** that stay in lock-step with the mobile equivalents:

- [Money](../apps/web/src/components/Money.tsx) — serif money figures with
  the small-sign superscript treatment.
- [Card](../apps/web/src/components/Card.tsx) — light + dark variants with
  the eyebrow / right-slot / body slot the mockups use everywhere.
- [KPI](../apps/web/src/components/KPI.tsx) — the four-up tile with delta
  badges. `positiveIsGood={false}` flips the red/green polarity for spend.
- [Chip](../apps/web/src/components/Chip.tsx) — category pills tinted by
  category name via [lib/categories.ts](../apps/web/src/lib/categories.ts).
- [MerchantLogo](../apps/web/src/components/MerchantLogo.tsx) — known-brand
  table (Netflix / Uber / Trader Joe's / etc.) with category-tinted
  fallback for unknown merchants.
- [Icons](../apps/web/src/components/Icons.tsx) — the SF-symbols-ish stroke
  set (mic / search / plus / chart / sparkle / refresh / send / lock /
  download / settings / signOut).
- [Toolbar](../apps/web/src/components/Toolbar.tsx) — page header with
  ⌘K-styled search affordance.
- [PaywallGate](../apps/web/src/components/PaywallGate.tsx) — soft-wall
  with sage CTA for Plus-gated routes. Mirrors the mobile paywall tone.

**Sidebar** at [apps/web/src/components/Sidebar.tsx](../apps/web/src/components/Sidebar.tsx)
— rewritten from the dark-rail to the cream glassmorphic version that
matches the mockups. Three groups: Overview (Today, Transactions),
Analyze (Insights, Budgets, Recurring, Ask Murmur), Data (Export,
Settings). Plus-gated items show a small "Plus" pill when not active.
User card at the foot with sign-out hover button.

**Plus gating** at [apps/web/src/lib/plus.ts](../apps/web/src/lib/plus.ts)
— mirror of the mobile `usePlusStatus` contract: free in
`process.env.NODE_ENV !== 'production'`, false otherwise. Same dev-mode
bypass so the developer can exercise the Plus surface without IAP setup.
Production paths stay walled until RevenueCat lands.

**Routes shipped:**

- **[/dashboard](../apps/web/src/app/dashboard/page.tsx) — Today.** Server
  component. Greeting (good morning/afternoon/evening + display name +
  pace vs last month), KPI strip (spent this month, daily average over
  last 7 days, largest category, projected month-end — each with a delta
  badge vs the prior period), trend chart (cumulative-by-day this month
  vs same span last month, sage gradient + dashed prev), category rings
  (top 5), recent activity (last 5 with merchant logos, voice mic icon,
  category chip, signed money figure), weekly pulse (dark card with
  serif insight + Mon→Sun bar pulse derived from last 4 weeks).
- **[/dashboard/transactions](../apps/web/src/app/dashboard/transactions/page.tsx)
  — Transactions.** Client component with realtime subscription. Glass
  search input, segmented direction filter, two date inputs.
  Day-grouped list (Today / Yesterday / weekday + date) with merchant
  logo + meta (time · payment method · note) + chip + signed amount.
- **[/dashboard/insights](../apps/web/src/app/dashboard/insights/page.tsx)
  — Insights (Plus).** Server component. Forecast chart over 6 months
  history + 3 forecast months (running average), patterns card (heaviest
  weekday / largest category share / month-over-month trend), top
  merchants over 90 days with sage horizontal bars, weekday-by-hour
  heatmap. Walled behind PaywallGate when not Plus.
- **[/dashboard/budgets](../apps/web/src/app/dashboard/budgets/page.tsx)
  — Budgets.** Client component. Stat row (on track / near limit / over
  counts), overall ring with sage stroke + projected spend message,
  per-category list with progress bars colored by status. New-budget
  form supports overall and per-category scopes across the five periods.
- **[/dashboard/recurring](../apps/web/src/app/dashboard/recurring/page.tsx)
  — Recurring.** Client component. Auto-detected patterns surfaced via
  the same heuristic as the mobile banner — copied as
  [lib/recurringPatternDetector.ts](../apps/web/src/lib/recurringPatternDetector.ts)
  to keep the two surfaces in lock-step. "Set up" creates a real rule;
  "Not now" pins a dismissed key in localStorage (capped at 100, FIFO).
  Active rules list shows next occurrence + pause; paused rules can be
  resumed.
- **[/dashboard/ask](../apps/web/src/app/dashboard/ask/page.tsx) —
  Ask Murmur (Plus).** Client component. Builds the same wire request as
  the mobile `askMurmurClient` (last 90 days, max 500 transactions, only
  active recurring rules), POSTs to `/api/ai/ask-murmur` with the user's
  Supabase access token. Renders the structured response: serif verdict
  tinted by sentiment, breakdown card, sage note, attribution count.
  Suggestion chips for first-time users.
- **[/dashboard/export](../apps/web/src/app/dashboard/export/page.tsx) —
  Export (Plus).** Client component. Date range + transaction summary,
  three format cards: CSV (BOM + dot decimal so Excel / Numbers /
  Sheets all open clean), JSON (`{ app: 'Murmur', version: 1, ... }` so
  a future Murmur instance can re-import), PDF (opens a new window
  with brand-styled HTML and triggers `window.print()` so the user can
  Save as PDF from the system print dialog — no JS PDF library, no
  bundle bloat).

**Login** at [apps/web/src/app/login/page.tsx](../apps/web/src/app/login/page.tsx)
— refreshed with the real MurmurMark and the brand tagline ("Speak it.
Spend clearly." for sign-in, "Start tracking by speaking — no bank
linking." for sign-up). Google + email/password auth flows untouched.

**What's NOT shipped this commit (tracked for follow-up):**

- **Electron-wrap.** Phase I part 2. Wrap `apps/web` with electron-builder
  → bundle for macOS (.app + .dmg) → sign with the user's Apple Developer
  credentials → notarize via `notarytool`. Interactive — needs the user's
  Team ID + app-specific password. Plan to defer until the web UI gets
  some live testing first.
- **QR pairing.** Out of scope for the v1 desktop wrap; the user will
  sign in directly on desktop with the same Supabase account (the same
  cookie-based session works in Electron's WebContents). QR pairing
  remains a future enhancement if a no-credentials desktop hand-off ever
  becomes a stronger requirement.
- **Settings polish.** The settings page still uses the legacy theme
  styling — it works but doesn't carry the new toolbar / serif headlines.
  Untouched on this pass; a 5-minute follow-up.
- **Voice composer in Ask.** Mobile's Ask supports voice; desktop sends
  text-only for now. Web Speech API is a small add when there's appetite.

**Phase I untested live:**
- Sidebar renders the cream glass with Listening Drop sage tile and three
  groups (Overview / Analyze / Data); active route gets the sage pill.
- /dashboard greeting reads "Good morning, {name}." with the pace line
  reflecting actual data; KPIs show real deltas; trend chart, category
  rings, recent table all render against the user's transactions.
- /dashboard/transactions filters work (search + segmented direction +
  date range); realtime subscription updates on insert from mobile.
- /dashboard/insights renders the forecast chart, patterns, top
  merchants, heatmap when in dev (Plus); shows the paywall gate in prod.
- /dashboard/budgets new-budget form saves overall + per-category
  budgets; ring updates; remove (×) deactivates and disappears.
- /dashboard/recurring detects patterns when there are 2+ same-merchant
  + same-amount transactions ≥21 days apart; "Set up" creates a rule;
  "Not now" hides it across reloads (localStorage).
- /dashboard/ask streams the suggestion chips first-run; submitting a
  question hits /api/ai/ask-murmur and renders the structured response;
  attribution count matches transactions sent.
- /dashboard/export saves CSV (opens cleanly in Excel/Numbers), JSON
  (valid `{ app, version, ... }`), PDF (Save-as-PDF dialog from the new
  window).
- /login renders MurmurMark sage tile + serif headline; Google + email
  flows still complete to /dashboard.

### Phase I part 1 fixes — feedback round 1 (April 25, 2026)

After the first walkthrough of the desktop UI, the user flagged five issues
plus the navigation-fluidity question. All addressed in this commit:

- **Conversation flow on Ask Murmur.** The result-card pattern made sense on
  mobile (small screen, one thing at a time) but felt broken on desktop —
  no follow-ups, no thread to scroll. Upgraded the wire format to support
  optional conversation history (backward-compatible: mobile sends none and
  keeps its existing UX). Server caps history at the last 6 turns and
  clips each field at 1000 chars. The desktop Ask page is now a chat
  thread: user bubbles right-aligned in sage, assistant turns left with
  the brand mark + verdict + breakdown card + sage note, composer pinned
  at the foot. "New conversation" button in the toolbar resets the thread.
- **Removed the awkward "90 days / never the open web" line** that exposed
  implementation detail. Replaced with a quieter "Murmur reads only your
  transactions — ask follow-ups freely." that only shows on the empty
  state.
- **Removed the fake \u2318K search bar** from the Today toolbar. It looked
  interactive, but clicking it went nowhere and the input wasn't even
  focusable. Toolbar now only renders the title + optional right-slot
  actions; the real search lives on the Transactions page where it works.
- **Real merchant logos.** [MerchantLogo](../apps/web/src/components/MerchantLogo.tsx)
  rewritten to mirror the mobile [MerchantAvatar](../apps/mobile/src/components/MerchantAvatar.tsx):
  same Google favicon endpoint (`t0.gstatic.com/faviconV2`), same
  `KNOWN_DOMAINS` table for merchants whose domain can't be derived from
  the name, same fallback chain (merchant initial \u2192 category initial
  \u2192 question mark) with deterministic merchant-color hashing, same
  re-fetch-on-resync behavior. Plumbed `merchant_domain` from the
  transaction record through the Today + Transactions surfaces so AI's
  domain hint wins over the heuristic guess.
- **Recurring indicator on transactions.** New
  [Icon.recurring](../apps/web/src/components/Icons.tsx) glyph (refresh
  loop). Surfaces inline next to the merchant name on Today's recent
  activity and on the Transactions list; the Transactions list also gains
  a "Recurring" word in the meta line. The mic icon for voice-logged
  rows stays.
- **Hardcoded currency + locale fixed.** Money figures used to print `$`
  with `'en-US'` grouping conventions everywhere, ignoring profile
  preferences. The [Money](../apps/web/src/components/Money.tsx) component
  now takes required `currency` + optional `locale` props and uses
  `Intl.NumberFormat.formatToParts` to render the correct symbol +
  grouping for any currency (EUR / GBP / XAF / JPY / etc). Plumbed
  `profile.currency_code` + `profile.locale` through every page that
  renders money or dates: Dashboard (KPIs, trend, rings, recent, pulse,
  greeting subtitle), Transactions (rows + day-grouped headers),
  Insights (forecast chart y-axis + budget label + patterns), Budgets
  (overall ring center, per-category list, status pills), Recurring
  (totals, rule rows, candidate cards), Ask Murmur (locale piped to the
  AI request), Export (summary card + PDF chrome + footer date).
- **Sidebar navigation now SPA.** Replaced `<a href>` in
  [Sidebar.tsx](../apps/web/src/components/Sidebar.tsx) with `next/link`
  + `prefetch`. Same on the "View all" link inside Today's recent
  activity. Page transitions no longer trigger a full page reload, the
  sidebar doesn't re-mount on each click, and Next.js's hover-prefetch
  warms the new route's data block before the user clicks.

**Navigation fluidity audit (the user's question).** With the changes
above, here's the honest read:

- **Smooth:** /transactions, /budgets, /recurring, /ask, /export are all
  client components. Clicks route instantly via `next/link`; data is
  fetched in `useEffect` and the page hydrates with a brief skeleton-less
  shell, then fills in. Realtime subscriptions on /transactions pick up
  inserts from the mobile app live.
- **Mostly smooth:** /dashboard and /dashboard/insights are server
  components. Hover-prefetch warms them; on click they swap in. There's
  a perceptible pause on a cold connection because the page can't paint
  until Supabase returns. No `loading.tsx` skeleton today \u2014 if the
  user reports friction during walkthrough, that's the next add.
- **Active-state transition** is a 120ms background animation on the
  sidebar items so the sage pill doesn't snap.
- **Open follow-up:** /dashboard does a fresh transaction fetch on every
  visit. Once the dataset is large enough that this feels slow, the
  pragmatic fix is a server-side cache layer (Next 15 React Cache or a
  short-lived `unstable_cache`) keyed on user id. Not needed yet.

**Phase I part 1 fixes untested live:**
- Sidebar nav clicks no longer reload the page (header / scroll / state
  preserved across routes).
- Today + Transactions show real merchant favicons for known brands
  (Netflix, Uber, Trader Joe's, etc.) and tinted-letter fallbacks
  otherwise.
- Recurring indicator (refresh-loop glyph) appears on transactions where
  `is_recurring=true`.
- Money figures render in the user's currency + locale (set Currency
  to EUR in Settings \u2192 see `\u20ac1.234,56` instead of `$1,234.56`).
- Ask Murmur shows the chat thread on follow-up questions; "and what
  about coffee?" or "show me only weekends" works because prior turns
  go into the prompt; "New conversation" resets.
- /dashboard toolbar no longer shows a search bar.

### Phase I part 1 fixes — feedback round 2 (April 25, 2026)

Second walkthrough surfaced four more items. All addressed in this commit
plus a documented stance on Murmur's product scope.

**Scope rule \u2014 codified.** The previous prompt said "no generic financial
advice," which over-applied: Murmur was refusing legitimate planning
questions ("what plan would you give me to manage my money better?") with
"I can only provide insights based on your own data." That refusal kills
the product. The new boundary, written into [packages/ai/src/askMurmur.ts](../packages/ai/src/askMurmur.ts):

- **In scope** \u2014 anything reasoned from the user's own data + universal
  personal-finance principles: read/summarize, patterns + leaks +
  forecasts, budget caps, savings rates, goal pacing, affordability
  checks, subscription audits, **personalized step-by-step plans**.
  Recommending category trade-offs ("redirect $80/mo from Coffee gets
  you to your goal one month sooner") is in scope when grounded in the
  user's transactions.
- **Out of scope** (refuse politely, set `out_of_scope=true`):
  - Specific securities, instruments, third-party products (stocks,
    crypto, ETFs, banks, credit cards, insurance providers). This is
    investment advice \u2014 Murmur is not an RIA.
  - Tax filing or preparation as a CPA would (cite a CPA).
  - Legal advice on debts, contracts, bankruptcy (cite a lawyer).
  - Medical or insurance coverage decisions.
  - External knowledge the data block doesn't contain (current prices,
    today's news, restaurant reviews, weather).
- **Borderline rule, explicit:** "what plan would you give me?" is
  in-scope and must be answered with the user's actual numbers, not
  refused.

The mental model in plain English: Murmur is your **bookkeeper that
thinks with you**, not your **broker / CPA / lawyer**. The first is
unregulated and high-leverage; the rest are regulated for good reason.

**Charts in answers.** Extended `AskMurmurResponse` with optional
`chart: { type, title, data, caption? }` and four chart kinds:
- `bar` \u2014 short ordered series (last 7 days, weekday averages).
- `line` \u2014 trend over time (monthly spend, cumulative within month).
- `donut` \u2014 share-of-total when 3\u20136 buckets (top categories).
- `horizontal_bar` \u2014 ranked lists where labels are long (top merchants).

The model returns structured points only \u2014 never raw SVG \u2014 so
hallucinated visualizations are impossible by construction. The validator
in `validateAskMurmurResponse` drops the chart when the type is unknown,
the data has fewer than 2 points, all donut shares are zero, or values
aren't finite/non-negative. Charts attached to refusals are stripped.

Renderer at [apps/web/src/components/AskChart.tsx](../apps/web/src/components/AskChart.tsx)
\u2014 pure SVG (no recharts), category-aware colors via the same tint
mapping as the rest of the desktop UI. Currency + locale piped in so
EUR/JPY/etc render correctly.

**Thinking-state animation.** The static dot was static no more.
- The brand mark itself now breathes during the model's pending state \u2014
  2.6s ease-in-out loop on the inner dot + the two pulse arcs, matching
  the brand sheet \u00a706 specification. Driven by an `animating` prop on
  [MurmurMark](../apps/web/src/components/MurmurMark.tsx) and CSS
  keyframes in `globals.css`. Lands a parked brand follow-up ("brand
  2.6s breathing pulse") on the surface where it makes the most sense.
- A new [ThinkingDots](../apps/web/src/components/ThinkingDots.tsx) wave
  (three dots, 1.2s stagger) sits next to "Thinking through your data\u2026"
  for clarity \u2014 screen-readers + visual users both see motion.

**Voice input on web Ask.** Added a mic button in the composer when the
browser supports the Web Speech API (Chrome / Edge / Safari 15+). Firefox
doesn't ship it; the button is feature-detected so Firefox users get the
text-only composer they had before. Locale-aware (`en-US` / `fr-FR` /
`es-ES` / `pt-BR`), interim transcripts populate the input live, click
again or stop speaking to finalize. Implementation note: SpeechRecognition
isn't in the standard TS lib, so a minimal interface is declared inline
to keep `tsc --noEmit` clean without pulling lib.dom changes.

**Deferred:** the mobile Ask loading state still uses `ActivityIndicator`.
Replacing it with a matching three-dot wave is in the next mobile pass.

**Phase I part 1 fixes round 2 untested live:**
- Asking "give me a plan to manage my money better" returns a plan
  grounded in the user's transactions instead of "I can only provide
  insights based on your own data."
- Asking "should I buy NVDA?" still gets refused with a polite
  out-of-scope verdict.
- Murmur replies sometimes include a chart (donut for category
  questions, line for trend questions, horizontal bars for
  top-merchants).
- The brand mark breathes during the thinking state; three-dot wave
  appears next to "Thinking through your data\u2026".
- Mic button in the Ask composer pops a permission prompt on first
  click; speaking populates the input live; clicking again stops.
- Firefox: no mic button (feature-detect); composer is text-only.

### Hot-fixes after the alignment pass (May 4, 2026)

Two real bugs the user caught + one missing feature:

1. **JSX text was showing literal `\u00b7` / `\u2014` / `\u2192` etc.** \u2014
   I'd written escape sequences directly in JSX text content (e.g.
   `<div>Mind map \u00b7 May</div>`), which is HTML-text and doesn't
   interpret JS escapes. Replaced every JSX-text escape with the actual
   Unicode character across all touched files (lenses, dashboard pages,
   ask/recurring/settings, sidebar, KPI). Strings inside JS literals
   (`'Fran\u00e7ais'`) are untouched \u2014 those still parse.
2. **Stray `\u2190` in the "Back to summary" button** in the Ask Murmur
   deep view. Replaced with `\u2190` literal arrow.
3. **Overview had no month picker** \u2014 the page anchored to "current
   month" with no way to navigate. Added [MonthPicker.tsx](../apps/web/src/components/MonthPicker.tsx)
   with prev / next chevrons + a 24-month dropdown, wired into the
   Overview toolbar via `<Toolbar right={\u2026} />`. The page reads
   `?month=YYYY-MM` and anchors all six lenses to the chosen month so
   switching months updates the whole Overview at once.

Verified: `npx turbo typecheck --force` clean, `next build` clean
(17/17 routes).

### Desktop UI \u2014 Full Cloud Design alignment (May 4, 2026)

The user shared the latest Cloud Design bundle (which had expanded
significantly past the April 19 export). New canonical design files now
live under `docs/money-app/project/desktop-screens-{1,2,3,4,mindmap}.jsx`.
Implemented every desktop surface against the new design in a single PR;
no preserved functionality regressed.

**Sidebar IA migration** ([Sidebar.tsx](../apps/web/src/components/Sidebar.tsx))
\u2014 reorganized into Overview / Plan / Analyze / Settings groups; "Today"
renamed to "Overview"; added Recurring count badge (live count from
`recurring_rules` query in [layout.tsx](../apps/web/src/app/dashboard/layout.tsx))
and `AI` pill on Ask Murmur. `Reports & forecast` is the new label for
the Insights page. Export preserved (in Data group).

**Overview rebuild** ([dashboard/page.tsx](../apps/web/src/app/dashboard/page.tsx))
\u2014 replaces "Today" with the multi-lens Overview. Server component
loads transactions + categories + recurring once, computes the KPI summary
line ("$X in \u00b7 $Y out \u00b7 $Z saved \u00b7 N transactions"), and routes
the body through `?lens=` URL state to one of six visualizations:
- [MindMap.tsx](../apps/web/src/components/lenses/MindMap.tsx) \u2014 default;
  XMind-style radial with Income / Expenses / Saved / Plan branches and
  top-merchant leaves under each expense category.
- [Flow.tsx](../apps/web/src/components/lenses/Flow.tsx) \u2014 Sankey-style
  ribbons from income sources to expense categories to top merchants.
- [Calendar.tsx](../apps/web/src/components/lenses/Calendar.tsx) \u2014 daily
  heatmap grid + day-detail panel (click any cell to see that day's
  transactions).
- [Treemap.tsx](../apps/web/src/components/lenses/Treemap.tsx) \u2014
  categories sized by spend; Saved & invested gets its own bottom band.
- [Cashflow.tsx](../apps/web/src/components/lenses/Cashflow.tsx) \u2014
  daily balance line + per-day income/expense bars + summary panel.
- [Matrix.tsx](../apps/web/src/components/lenses/Matrix.tsx) \u2014
  6-month \u00d7 category grid with sparklines + month-over-month delta.
- [LensPills.tsx](../apps/web/src/components/LensPills.tsx) is the
  switcher (URL-state-driven so deep links land on the right lens).

**Transactions** ([transactions/page.tsx](../apps/web/src/app/dashboard/transactions/page.tsx))
\u2014 table redesigned with DATE / MERCHANT / CATEGORY / SOURCE / ACCOUNT /
AMOUNT columns; filter tabs at the top (`All / Voice / Apple Pay /
Recurring / Income`) keyed off the transaction's `source` and
`is_recurring` fields. Source chips: Voice (sage), Apple Pay (slate),
Recurring (brown), Typed (neutral). Header shows `184 transactions \u00b7
156 voice \u00b7 18 Apple Pay \u00b7 \u2026` breakdown. Toolbar has dark
"Export CSV" button linking to /dashboard/export. Merchant logos
(Google Favicon V2 + colored-letter fallback) and recurring icon next to
merchant names preserved per user's explicit ask.

**Ask Murmur** ([ask/page.tsx](../apps/web/src/app/dashboard/ask/page.tsx))
\u2014 dual-mode rebuild per user's "Dive deeper" idea:
- Default `summary` mode: a single rich answer card with `MURMUR'S READ`
  eyebrow, serif verdict, optional projection chart, "How I got there"
  math breakdown, optional sage note, attribution line. Right rail has
  `SOURCES USED` (live counts of voice expenses, recent income deposits,
  active recurring rules) and dark `TRY ALSO` panel with 4 suggestions.
- Click "Dive deeper" \u2192 morphs to thread mode: full conversation thread
  with smaller follow-up bubbles + Back to summary toggle.
- New top-level questions (search bar / Try Also click) replace the
  current answer card; conversation history dropdown + Supabase
  persistence + voice mic in composer + "New conversation" button all
  preserved.

**Recurring** ([recurring/page.tsx](../apps/web/src/app/dashboard/recurring/page.tsx))
\u2014 rebuilt as the design's Recurring & subscriptions table layout:
- Header stats: Monthly / Annual cost / To review (review count =
  detected candidates from the Plus pattern detector).
- New patterns banner (dashed accent border) preserved \u2014 `Set up` /
  `Not now` actions still wire to `acceptCandidate` / `dismissCandidate`.
- Table: SERVICE / AMOUNT / FREQUENCY / NEXT CHARGE / STATUS with
  ACTIVE pills (click to pause) or PAUSED rows (click to resume).
- Right rail: `NEXT 30 DAYS \u00b7 CHARGES` calendar (cells highlighted
  on charge days, count badges, "$X in charges hit before [date]"
  footer) + dark `POTENTIAL SAVINGS` card sized off the detected
  candidates.

**Settings** ([settings/page.tsx](../apps/web/src/app/dashboard/settings/page.tsx))
\u2014 rebuilt with sticky left sub-nav (Account / Sync & devices / Plan &
billing / Privacy / Voice & language / Export / About) + stacked
section cards on the right that scroll to match. Account section
preserves the existing display name / currency / locale form. Sign-out
sits below the sub-nav. Plan & billing reflects Plus status from the
existing `lib/plus.ts` helper.

**Verification:** `npx turbo typecheck --force` \u2014 5/5 clean across all
workspaces. `next build` of `apps/web` \u2014 17/17 routes generate
cleanly. PRESERVE list intact: merchant logos, recurring icon on rows,
Plus gating, Ask Murmur conversation thread + history dropdown +
Supabase persistence, voice mic in Ask composer, data export
(CSV/JSON/PDF), realtime sync, 4-locale i18n, Plus dev-mode bypass.

#### Earlier today \u2014 Cloud Design alignment pass (partial bundle, May 3, 2026)

Tightened apps/web against `docs/money-app/project/desktop-screens-{1,2}.jsx`. No
mobile changes. No regressions to shipped functionality (Plus gating, Ask Murmur
thread + history, recurring auto-detect, data export, settings, Web Speech mic,
realtime, paywall gate \u2014 all preserved).

**What changed:**
- **Sidebar** ([apps/web/src/components/Sidebar.tsx](../apps/web/src/components/Sidebar.tsx)): width 240\u2192230, padding 12\u21928, restructured to a floating glass panel (absolute `inset:8`, `borderRadius:18`, opacity `0.8`, with inner highlight + outer drop shadow) instead of a flat-edge column. Brand row now uses 24px MurmurMark + sans wordmark `14px / weight 700 / letter-spacing -0.3` (was serif 18). Group label padding `8px 18px 4px` and nav item margin `1px 10px` to match design indentation. User card meta updated to "Synced just now".
- **Toolbar** ([apps/web/src/components/Toolbar.tsx](../apps/web/src/components/Toolbar.tsx)): padding 24\u219220. Now includes a frosted "Search expenses \u2318K" field on the right of every dashboard screen. \u2318K / Ctrl-K focuses it from anywhere; submitting routes to `/dashboard/transactions?q=\u2026`. The transactions page reads `?q=` and prefills its own filter.
- **KPI** ([apps/web/src/components/KPI.tsx](../apps/web/src/components/KPI.tsx)): new `forecast` prop \u2014 paints `Icon.sparkle(ink4, 14)` in the top-right corner so projection KPIs read as projections at a glance.
- **Period selector** ([apps/web/src/components/PeriodPills.tsx](../apps/web/src/components/PeriodPills.tsx)): new component. Pill group `Week / Month / Quarter / Year` rendered in the Dashboard toolbar's right slot. Wired to `?period=` URL state. Dashboard ([apps/web/src/app/dashboard/page.tsx](../apps/web/src/app/dashboard/page.tsx)) now computes `periodWindow(period, now)` + `previousPeriodWindow(period, now)` and feeds every KPI / TrendChart / CatRings off the chosen window. KPI labels adapt: "Spent this {week|month|quarter|year}" / "Projected {period}-end". Forecast badge fires on the projection KPI.
- **Dashboard charts**: TrendChart inner padding 24\u219220 to match design's tighter chart bleed. CatRings inner total amount swapped from `font.serif` to `font.display` (per `T.fDisp` in the design \u2014 design's intentional sans choice for constrained ring spaces).
- **Insights toolbar** ([apps/web/src/app/dashboard/insights/page.tsx](../apps/web/src/app/dashboard/insights/page.tsx)): added a downward-chevron glyph on the "Last 6 months" filter chip + the dark "\u2728 Generate report" button (triggers `window.print()` so users get a printable view of the current Insights state). New `Icon.chev` glyph in [Icons.tsx](../apps/web/src/components/Icons.tsx).
- **Budgets ring** ([apps/web/src/app/dashboard/budgets/page.tsx](../apps/web/src/app/dashboard/budgets/page.tsx)): inner amount in the overall ring swapped from `font.serif` to `font.display` (matches design's `T.fDisp` for the same reason as CatRings).

**Already aligned with design (verified, no change needed):** Insights serif title + 3-col bottom layout + sparkle-tile pattern rows + weekday\u00d7hour heatmap + top-merchants bar list; Budgets serif title + summary stats row (On track / Near limit / Over) + per-category status pills + ring stroke params.

**Verification:** `npx turbo typecheck` clean across all 5 workspaces; `next build` of `apps/web` succeeds (17 routes generated, dashboard at 2.99 kB First Load JS).

#### Ask Murmur \u2014 structural date-filter fix + verification harness (May 3, 2026, evening)

After the morning fix shipped, the date-window bug recurred in user
testing: the model was still writing its own date math despite
\`windows.\*\` and \`helpers.inWindow\` being available. The new prompt
guidance was a recommendation, not a guarantee. This evening's change
removes the model's ability to fail on standard windows entirely.

**What's structural now:**
- The sandbox pre-computes ten windowed subsets and exposes them as
  named variables: \`transactions_today\`, \`transactions_this_month\`,
  \`transactions_last_month\`, \`transactions_this_year\`,
  \`transactions_last_year\`, \`transactions_last_7_days\`,
  \`transactions_last_30_days\`, \`transactions_last_90_days\`,
  \`transactions_last_6_months\`, \`transactions_last_12_months\`.
- The \`run_query\` tool description and the system prompt both list
  the subsets and tell the model: for any standard window, use the
  pre-computed variable; do NOT write a date filter. Only specific
  calendar dates and ad-hoc windows still go through manual filtering.
- The data-mismatch detector retries with an explicit hint pointing
  the model at the exact subset variable when its verdict contradicts
  the deterministic data overview ("you said no expenses this year,
  but \`transactions_this_year\` has 6 entries; use that subset").
- \`parseLocaleNumber\` no longer parses \`"$20,000"\` as \`20\` \u2014
  the heuristic now distinguishes thousands-comma (3-digit tail / multi-comma)
  from European decimal-comma (1\u20132 digit tail).

**Verification:**
- New script at `packages/ai/src/__tests__/askMurmur.verify.ts`. *(Aug 9
  2026 — ported into [packages/ai/src/__tests__/askMurmur.test.ts](../packages/ai/src/__tests__/askMurmur.test.ts)
  as part of fix-plan item 1.1's vitest harness; the standalone script no
  longer exists. Same assertions, now `npm test` instead of `npx tsx`.)*
- Drives the actual sandbox via \`resolveToolCall('run_query', \u2026)\`
  on a synthetic dataset shaped like the real user's data (April 2026
  expenses + older entries + 2024 entry for a year-range edge case).
- Asserts every windowed subset has the correct count, the data
  overview has the right shape and flags, the per-category breakdown
  for "this year" produces the expected categories with the expected
  totals, the sandbox security boundary holds (no \`require\`, no
  \`process\`, no \`new Function\`), the locale-number parser handles
  \`"$20,000"\` and \`"20,5"\` correctly, the prompt builder injects the
  data overview, and the summarize-fallback snapshot ranks Housing
  first.
- Run with \`npm --prefix packages/ai run verify\`. 27 / 27 checks
  pass; \`npx turbo typecheck\` clean across all 5 workspaces;
  production build of \`apps/web\` succeeds.

#### Earlier today \u2014 first attempt at the date-window fix

**Status:** the date-window patch and the mobile bundler crash that
were the open items at the previous handoff are both shipped in this
session. The architecture (two tools, one attempt, narrow retry,
summarize fallback) is unchanged.

**What was actually broken (root causes):**
1. **Mobile build was crashing** with "Unable to resolve module
   `node:vm` from packages/ai/src/askMurmurTools.ts." Cause: the
   `@voice-expense/ai` barrel re-exported `askMurmurTools.ts`, which
   imports `node:vm`. Mobile only consumes `parseExpense` /
   `parseScan`, but Metro pulls the whole barrel into the dependency
   graph and chokes on Node-only `vm`.
2. **Date-window bug** \u2014 the model wrote
   `new Date(today).getMonth()` while `today` is a string, the query
   returned an empty array, the model reported "no expenses this
   month" even when an April expense existed.
3. **Summarize-fallback was silently broken** \u2014 it called
   `resolveToolCall('top_categories', \u2026)` and `'monthly_series'`,
   but only `run_query` and `compare` are registered. Both calls
   returned `{ ok: false, error: 'Unknown tool' }` and the snapshot
   handed to the model was full of `null`s.

**Patches that landed:**
- **Split the `@voice-expense/ai` package into two entry points:**
  - `@voice-expense/ai` (client-safe, `index.ts`) \u2014 only
    `parseExpense`, `parseScan`, `parseExpenseLocally`,
    `buildAdvisorContext`, `getPrompt`, `getScanPrompt`. No `node:vm`.
    Mobile imports stay unchanged and now bundle clean.
  - `@voice-expense/ai/server` (`server.ts`) \u2014 the Ask Murmur
    sandbox + tool resolver + prompt builder + validators. Used only
    by the Next.js API routes.
  - `package.json` declares both subpaths via the `exports` field;
    `apps/web/tsconfig.json` declares the `@voice-expense/ai/server`
    path mapping so TS resolves it.
- **Date windows in the sandbox.** `buildSandboxContext` now exposes
  `windows.{today, thisMonth, lastMonth, thisYear, lastYear,
  last7Days, last30Days, last90Days, last6Months, last12Months}` as
  `{ start: Date, end: Date }` pairs computed from `ctx.today`. New
  `helpers.inWindow(items, window)` filters by `transacted_at`. The
  `run_query` tool description and the `buildAskMurmurPrompt` body
  both direct the model at `windows.*` and explicitly forbid
  `new Date(today)` math.
- **Summarize-fallback uses inline aggregation.** New
  `buildSummarySnapshot(ctx)` in `askMurmurTools.ts` computes top
  categories + monthly series for the last 6 months directly from
  `ctx.transactions`. The `runSummarizeFallback` route function
  imports it from `@voice-expense/ai/server` and never touches
  `resolveToolCall`. Removes the silent-null path.

**Files touched:**
- `packages/ai/src/index.ts` \u2014 trimmed to client-safe re-exports.
- `packages/ai/src/server.ts` \u2014 new server entry.
- `packages/ai/package.json` \u2014 multi-entry `exports` field.
- `packages/ai/src/askMurmurTools.ts` \u2014 `buildWindows`,
  `inWindow`, sandbox `windows` + `helpers.inWindow`, updated tool
  description, new `buildSummarySnapshot` export.
- `packages/ai/src/askMurmur.ts` \u2014 prompt now points at
  `windows.*` and forbids manual date math from `today`.
- `apps/web/src/app/api/ai/ask-murmur/route.ts` \u2014 imports moved
  to `@voice-expense/ai/server`; fallback uses
  `buildSummarySnapshot`.
- `apps/web/tsconfig.json` \u2014 added
  `@voice-expense/ai/server` path mapping.

**Verification done:** `npx turbo typecheck` clean across all 5
workspaces (shared, ai, supabase, web, mobile). Mobile no longer
imports anything that pulls `node:vm` into its bundle.

**Test the user should run on next launch:**
1. Restart the Expo dev server (Metro cache may still hold the old
   `node:vm` resolution failure). The "Unable to resolve module
   node:vm" error should be gone.
2. On desktop `/ask`, ask: "Was it this month?" and "no expenses in
   April?" with a known April transaction in the data. The model
   should call `helpers.inWindow(transactions, windows.thisMonth)`
   and answer correctly on the first try.
3. Force the summarize-fallback path by asking a deliberately broad
   question on a tiny dataset and watch the verdict cite real
   per-category totals (not blank / null).

#### Prior handoff context (kept for reference)

The previous chat's context filled. Ask Murmur went through several
architectural rebuilds in that chat (catalog tools \u2192
code-execution \u2192 trust-the-LLM rebuild). The latest version ships
and works for most questions, but a specific class of bug surfaced in
user testing right at the end and was fixed in this session:

**The bug, observed:** Asked "was it this month?" / "no expenses in
April?" \u2014 Murmur replied "You have not incurred any expenses
this month" multiple times, despite a $20,000 expense on April 11
that the same conversation had already established. When asked
differently ("when did it occur?", "so it did not occur this month?"),
the model gave the correct answer (April 11, this month). So the
contradiction is *within the same conversation*.

**Diagnosed cause:** the model is writing date-window filters in
JavaScript inside the run_query sandbox, and it gets the date math
wrong silently. Likely culprits: \`new Date(today).getMonth()\` while
\`today\` is a string, or a timezone-offset start-of-month, or
year-month string compare that excludes the right month. The query
doesn't throw; it returns an empty array; the model believes its own
buggy query.

**The proposed fix (NOT SHIPPED).** Stop letting the model do date
math at all. Pre-compute every common window in the sandbox and expose
them as ready-to-use Date pairs:

\`\`\`ts
windows = {
  today:        { start, end },
  thisMonth:    { start, end },
  lastMonth:    { start, end },
  thisYear:     { start, end },
  lastYear:     { start, end },
  last7Days:    { start, end },
  last30Days:   { start, end },
  last90Days:   { start, end },
  last6Months:  { start, end },
}
\`\`\`

Plus a \`helpers.inWindow(items, window)\` that filters transactions
to those whose \`transacted_at\` falls inside an inclusive
{ start, end } window. The prompt then directs the model to use these
instead of writing date code.

The exact patch was drafted but rejected mid-way through the previous
chat (user wanted explanation first, not immediate code). The patch
lives in [packages/ai/src/askMurmurTools.ts](../packages/ai/src/askMurmurTools.ts):
modify \`buildSandboxContext\` to add the windows object + the
\`inWindow\` helper, then update \`buildAskMurmurPrompt\` in
[packages/ai/src/askMurmur.ts](../packages/ai/src/askMurmur.ts) to
recommend \`windows.*\` over manual date math.

**State of the architecture (last shipped, working for most cases):**
- Two tools: \`run_query\` (sandboxed JS) + \`compare\` (structural
  direction guarantee).
- Single LLM attempt by default with the tool catalog.
- One narrow retry only on: comparison-direction violation OR empty
  verdict. Polite language is no longer flagged \u2014 the previous
  forbidden-phrase regex was producing more failures than it
  prevented.
- Summarize-fallback LLM call (no tools, simple "summarize this
  user's spending in 2-3 sentences with one chart") when even the
  retry returns empty.
- Conversation persistence on Supabase
  (\`ask_conversations\` + \`ask_messages\` tables, RLS-pinned).
  Migration at [supabase/migrations/007_ask_conversations.sql](../supabase/migrations/007_ask_conversations.sql)
  must be applied to the user's Supabase project for this to persist
  in production.
- Charts auto-generate per the prompt's REQUIRED / OPTIONAL /
  FORBIDDEN rules. Mic on web Ask via Web Speech API.

**Critical user-feedback principles** (codified in memory; new chat
must respect these):
- **No workarounds.** When patches start stacking, stop and rebuild
  the architecture. See \`feedback_no_workarounds.md\`.
- **Fix completely.** When fixing a bug, audit the whole class, not
  the specific instance. See \`feedback_fix_completely.md\`.
- **Owner responsibility.** Claude is the engineer of record on this
  project; perfection is the bar. See \`feedback_owner_responsibility.md\`.
- **Drive forward.** Don't stall on "what should I do?" \u2014 make
  calls and ship. See \`feedback_drive_forward.md\`.
- **Always update docs as part of every change.** See
  \`feedback_update_docs.md\`.
- **Ask before acting on opinion questions.** When user asks "what do
  you think?" reply with opinion first, don't build. See
  \`feedback_ask_before_acting.md\`.

**What the next chat should do, in order:** done in this session \u2014
fix shipped per the "Patches that landed" list at the top of this
section.

**Untested live (cumulative across the whole Ask Murmur work):**
- Date-window questions ("this month", "in April", "last 7 days")
  \u2014 windows fix shipped, awaiting user verification.
- Refusal-class questions (stocks, tax, legal, medical) \u2014 the
  prompt scope rules cover these.
- F&D vs Housing comparison-direction \u2014 still structurally
  protected by the compare tool + validator.
- Conversation persistence (history dropdown, switch between past
  conversations, soft-delete) \u2014 verified working but only after
  the user applies the 007 migration.
- Any question involving non-trivial date filters \u2014 likely to
  need the windows fix.

**What's still parked from earlier sessions:** mobile native-deps
prebuild (\`npx expo prebuild --clean\` for expo-notifications,
expo-sharing, expo-print). Phase I part 2 Electron wrap. IAP / RC
wiring. Phase G native widgets. Pre-launch infra (privacy policy,
ToS, store metadata, Sentry).

### Ask Murmur \u2014 trust-the-LLM rebuild (April 26, 2026, second pass)

**Why this section exists.** The previous architecture (forbidden-phrase
regex + 3-attempt loop + regex intent classifier with hardcoded
windows) had many bespoke moving parts. Each part was its own future
failure surface, and aggressive validation was *generating* false
failures from normal LLM output. A polite verdict containing the word
"sorry" or "having trouble" (in normal contexts) was being flagged as a
give-up, retried, exhausted, and shipped as a brittle hardcoded
fallback that frequently picked the wrong window.

The fix is fewer moving parts.

**Architecture, simplified:**

- **Trust the LLM by default.** Single attempt to gpt-4o with the tool
  catalog. If the response has a non-trivial verdict (>= 8 chars) and
  the comparison-direction validator passes, we ship it. No regex on
  polite language, no aggressive give-up detection.
- **One narrow retry.** Comparison-direction violation OR empty verdict
  triggers exactly one retry, with the specific issue surfaced. Both
  conditions are structural \u2014 the response either contradicts a
  compare call or said nothing at all.
- **Summarize-fallback LLM call** as the safety net when even the retry
  produced an empty verdict. A simple no-tools call: "summarize the
  user's spending in 2-3 sentences with a chart" given a precomputed
  snapshot of top categories + monthly series. Trust whatever the
  model returns; ship it. This replaces the regex intent classifier
  and per-intent deterministic builders entirely.

**Files removed:** \`packages/ai/src/askMurmurFallback.ts\` (the regex
classifier with its 7 hardcoded intents and per-intent builders).

**Why this isn't another workaround.** The failure surface shrank to
two structural signals (comparison flip, empty verdict). Everything
else \u2014 including questions the regex classifier couldn't classify,
windows that didn't match, polite phrasings the forbidden-list
mis-flagged \u2014 is no longer a failure case at all. The user's
response is whatever the LLM says, and the LLM is good at producing
grounded answers from a sandbox-computed dataset. When it isn't, the
summarize fallback gives a guaranteed real-data answer to any question
shape.

**Cost trade.** Same as before: 1 LLM call typical, 2 on the rare
retry, 3 in the worst case (primary + retry + summarize fallback). The
summarize fallback is no-tools, so it's fast and cheap.

**Untested live:**
- "I want a full and explanatory report of my spending this year" \u2192
  real grounded answer; if the LLM struggles, the summarize fallback
  ships a grounded summary with a chart.
- "Can I have a chart?" \u2192 the LLM produces a chart per the prompt
  rules; if it doesn't, the summarize fallback ships one.
- "What's my biggest category?" \u2192 real category + amount.
- F&D vs Housing comparison \u2192 still structurally guarded by the
  compare-direction validator.
- A question the previous regex classifier couldn't classify \u2192
  the LLM answers it; no regex pattern needed.

### Ask Murmur \u2014 zero-failure-language guarantee (April 26, 2026)

**The bar.** Per [DESIGN.md \u00a78](./money-app/project/DESIGN.md) and the
user's hard line: every in-scope question must return a real answer
about the user's own money, every refusal-class question gets a polite
refusal, and no failure language exists anywhere in the user's
experience. Not "couldn't compute," not "data processing error," not
"having trouble," not "try rephrasing." Ever.

**Architecture grounded in research.** Cross-checked against Shinhan's
production AI PB paper, OpenAI's code-interpreter guidance, and the
production reliability patterns from getmaxim / buildmvpfast: the right
shape is (1) sandboxed code execution as the deterministic computer,
(2) classified failure handling \u2014 transient vs tool error vs
semantic give-up each get different recovery paths, (3) safe-template
fallbacks that match the SHAPE of the user's question rather than
returning generic snapshots or error messages.

**What ships:**

- **Forbidden-language list in the prompt** at [packages/ai/src/askMurmur.ts](../packages/ai/src/askMurmur.ts).
  The system prompt now enumerates every variant the model is forbidden
  from writing in a verdict ("data processing error", "couldn't
  determine/compute/find/verify/access", "technical issue", "internal
  error", "something went wrong", "try rephrasing", "having trouble",
  "apologize", etc.). The model is also explicitly instructed: tool
  errors are not a valid reason to set out_of_scope=true \u2014 read
  the error, fix the code, call run_query again.
- **Server-side classified retry loop** in [route.ts](../apps/web/src/app/api/ai/ask-murmur/route.ts).
  Each question gets up to 3 LLM attempts. After every attempt we
  classify failure into three buckets and feed retry instructions for
  whichever fired:
  - Tool errors: surface the specific sandbox error to the model with
    "fix the code and call run_query again."
  - Semantic give-up: regex-detect any forbidden phrase or empty
    verdict, retry with "your previous verdict gave up; failure
    language is never acceptable."
  - Comparison-direction violation: same as before, retry with the
    contradicting subjects surfaced.
  - Soft issues (numbers we couldn't trace) are logged but never
    trigger retry or block the response.
- **Intent classifier + intent-aware fallback** at [askMurmurFallback.ts](../packages/ai/src/askMurmurFallback.ts).
  Regex over the question text classifies it as
  `category | merchant | affordability | trend | forecast | recurring | refusal | other`.
  Each class has a dedicated deterministic builder that produces a
  real, grounded response from the user's actual transactions:
  - category \u2192 top categories with donut chart + breakdown
  - merchant \u2192 top merchants with horizontal bars
  - affordability \u2192 last-30-day net cash flow with income/spend rows
  - trend \u2192 6-month series with line chart
  - forecast \u2192 90-day average net per month
  - recurring \u2192 active recurring with monthly + yearly totals
  - refusal \u2192 polite locale-aware refusal per DESIGN.md \u00a78
  - other \u2192 the broadest useful answer (top categories)
  This fallback fires only when all 3 LLM attempts fail validation \u2014
  rare in practice with gpt-4o + tool calling, but the safety net
  guarantees a real answer to the SHAPE of the question even in the
  worst case.
- **Client-side auto-retry on transport failure** in [ask/page.tsx](../apps/web/src/app/dashboard/ask/page.tsx).
  A network or 5xx error triggers one silent retry after 1.2s. If that
  also fails, the pending bubble is replaced with a neutral
  "Tap to try again" pill rather than an error message.
- **Stripped failure language from every user-facing code path.** The
  validateAskMurmurResponse fallback for empty verdicts no longer
  returns "I couldn't compute..." \u2014 it returns an empty string,
  which the give-up detector correctly classifies as a failed attempt
  and retries. The iteration-cap fallback inside runConversation now
  returns an empty verdict for the same reason. The client's transport
  error handler no longer shows "Something went wrong" \u2014 it shows
  a tappable retry pill. Validated by grep across the codebase.

**Deletes / replaces:**
- `validateAskMurmurResponse` no longer substitutes "I couldn't compute
  an answer from your transactions just now."
- `runConversation` no longer returns "I'm having trouble with that
  one right now. Give me another try in a moment." on iteration-cap.
- The client's `error` thread role still exists for legacy paths but
  the transport-error path now uses the new `retry` role with a
  neutral pill instead.

**Result the user observes:**
- "What's my biggest category?" \u2192 real category + amount, every
  time. If the LLM somehow flubs three times, the deterministic
  category builder still ships a real answer with a donut chart.
- "Can I afford a $400 trip next month?" \u2192 real cash-flow answer
  with income/spend/net rows.
- "Should I buy NVDA?" \u2192 polite refusal per DESIGN.md hard rules.
- Network glitch \u2192 silent retry; if still failing, "Tap to try
  again" pill, not an error message.
- Genuinely arbitrary question the LLM struggles with \u2192 falls
  through to a 90-day spending overview phrased as a real answer.

**The bar in one line:** no user-facing string in the codebase contains
any of the forbidden failure phrases. Every code path either returns a
real grounded answer, retries until it can, or in the absolute worst
case ships an intent-shaped deterministic answer \u2014 never an error.

### Ask Murmur \u2014 code-execution rebuild (April 25, 2026, second pass)

**Why this section exists.** The previous numerical-correctness pass (the
"Facts block + regex validator" architecture below) was a workaround. Two
problems with it:

1. The Facts blob was a fixed catalog of pre-computed aggregates. If the
   user asked something the catalog didn't anticipate ("biggest single
   transaction", "spend on Tuesdays before noon", "average gap between
   Uber rides"), the model had to fudge or refuse.
2. The regex validator threw false positives constantly \u2014 user's own
   numbers ("can I afford a $400 trip?"), window descriptors ("90 days"),
   and legitimate derived values that the Facts blob didn't precompute.
   Each false positive tempted a "loosen the tolerance" patch. Whack-a-mole.

The proper architecture is **code execution**, the same pattern OpenAI's
ChatGPT Advanced Data Analysis and Anthropic's Code Execution Tool use.

**What ships:**

- [packages/ai/src/askMurmurTools.ts](../packages/ai/src/askMurmurTools.ts)
  \u2014 two tools, OpenAI function-calling format:
  - **`run_query({ code, description })`** \u2014 sandboxed Node `vm`
    execution of arbitrary JavaScript over the user's data. Inside the
    sandbox: `transactions`, `recurring_rules`, `today`, `currency`,
    `locale`, `monthly_income`, plus core JS (Math/Date/Array/Object/Map/
    Set/JSON) and a small `helpers` object (round/windowDays/sumBy/groupBy).
    Hardened context: no `process`, no `require`, no `Function`
    constructor, no I/O, no network. 1-second timeout, 50KB result-size
    cap, 4000-char code limit. The sandbox is the deterministic computer.
  - **`compare({ a: { label, value }, b: { label, value } })`** \u2014
    structural comparison-direction guarantee. The model passes two
    values it computed via `run_query`; this tool returns
    `a_greater | b_greater | equal`. The validator checks every
    "more A than B" phrase in the verdict against a `compare` result.
    This is the structural fix for the original F&D-vs-Housing flip.
- [packages/ai/src/askMurmur.ts](../packages/ai/src/askMurmur.ts)
  \u2014 prompt rewritten with two CRITICAL sections at the top:
  - "Every total/average/count/percentage in your final response MUST
    come from a `run_query` result. Never compute or estimate any
    number yourself."
  - "Whenever the verdict makes a numerical comparison, call `compare`
    with both values and use the tool's direction. Quote both numbers
    inline."
  Plus the existing scope rules (no securities/regulated advice, planning
  from user data is in scope) and chart guidance (when required vs.
  forbidden).
- New validator
  `validateAskMurmurResponseAgainstCalls(response, calls, question)`
  in [askMurmur.ts](../packages/ai/src/askMurmur.ts):
  - Builds a trusted-numbers set: every number that appeared in any
    successful tool-call result (recursive walk of result JSON) plus
    every number parsed out of the user's own question.
  - Every monetary figure / percentage / count cited in the response
    must trace back to that set, with small rounding tolerance ($0.50
    or 1% relative; 1 percentage point).
  - Comparison-direction check: each "more/less/higher/lower than"
    phrase in the verdict is matched against a `compare` tool result
    whose subjects (labels) appear in the surrounding text. If the
    verdict's direction disagrees, the response is rejected.
- [apps/web/src/app/api/ai/ask-murmur/route.ts](../apps/web/src/app/api/ai/ask-murmur/route.ts)
  rewritten as a multi-turn tool loop. The model can call tools up to
  12 times before emitting the final structured JSON. On validation
  failure the prompt is rebuilt with the specific issues appended; the
  model gets one retry. If retry also fails, we ship a graceful
  verification fallback rather than a wrong number.
- Default model still **`gpt-4o`** (full, not -mini). gpt-4o handles
  function-calling natively and is materially better at multi-step
  reasoning. Override via `AI_ASK_MODEL` env var.

**Files removed:** `packages/ai/src/askMurmurFacts.ts` (the workaround).

**Why this isn't another workaround.** The set of answerable questions
equals the set of questions JavaScript can compute against the user's
data \u2014 i.e. every question that is deterministically answerable
from transactions + recurring rules. There is no question that fits the
data shape but can't be expressed as JS. No "expand the catalog," no
"loosen tolerances," no "add another bucket to Facts." If the user asks
"what's the biggest gap between two consecutive Uber rides?", the model
writes a JS query and gets the deterministic answer.

**Mobile + web both benefit.** The fix is server-side behind
`/api/ai/ask-murmur`. Once mobile rebuilds its dev client (the parked
prebuild), it gets the same correctness guarantees automatically.

**Cost trade.** Each request now potentially makes 2\u20136 model
round-trips (each tool call is a round-trip in the model's reasoning).
With gpt-4o + function-calling this is a few seconds end-to-end.
Acceptable for a money app where wrong numbers are unacceptable.

**Untested live:**
- Asking "F&D vs Housing" returns a verdict that quotes both numbers
  and gets the direction right.
- Asking "what's my biggest single transaction in 90 days?" \u2014 a
  question the old Facts blob didn't precompute \u2014 returns the
  correct answer because the model wrote a `run_query` for it.
- Asking "should I buy NVDA?" still gets refused with an out-of-scope
  verdict.
- Across two consecutive identical questions, cited totals don't drift
  (temperature 0 + deterministic sandbox).
- Questions that genuinely can't be answered from the data return the
  graceful "couldn't compute every figure" fallback rather than a
  hallucinated number.

### Ask Murmur \u2014 numerical-correctness rebuild (April 25, 2026)

**Problem.** The Ask reasoner was making arithmetic and comparison errors:
the verdict said "you spend more on Food & Dining than Housing" while the
breakdown showed F&D=$160 and Housing=$20,000. Same data, different totals
across consecutive turns ($210 vs $160). Lower temperature, prompt nudges,
or a stronger model all reduce these errors probabilistically \u2014 they
do not eliminate them. For a money app, that's not acceptable.

**Fix \u2014 architectural, not cosmetic.** Take arithmetic out of the
model's hands.

1. **Deterministic Facts block** at [packages/ai/src/askMurmurFacts.ts](../packages/ai/src/askMurmurFacts.ts).
   Pure TypeScript over the request's transactions + recurring rules;
   computes every aggregate the model could need:
   - Total spent / income for this-month / last-month / 30d / 90d.
   - Net cash flow 90d, daily averages 30d/90d.
   - `by_category_90d` with totals per window (90d, 30d, this month, last
     month) + transaction counts.
   - `by_merchant_90d` (top 25 by 90d spend) with same window totals.
   - `by_month_last_6` with locale-friendly labels + iso anchor.
   - `by_weekday_90d` with average per occurrence (so a Friday with three
     coffees still counts as one Friday).
   - Recurring monthly + yearly totals, recurring active count.
   - Transaction counts at every window.

2. **Prompt rewritten** at [packages/ai/src/askMurmur.ts](../packages/ai/src/askMurmur.ts).
   Two new "CRITICAL" sections at the top:
   - **Numerical accuracy:** every figure in the response must come from
     Facts. Do not perform arithmetic. Do not estimate. The transactions
     block is for context lookups (specific dates, raw notes) only.
   - **Comparison correctness:** any numerical comparison in the verdict
     must include both numbers inline ("$160 vs $20,000"), and the
     direction (more/less) must agree with those numbers.

3. **Post-hoc validator** at the bottom of the same file:
   `validateAskMurmurResponseAgainstFacts(response, facts)`. Extracts
   every currency figure, percentage, and count from the verdict + note +
   breakdown rows + chart data, and checks each against a `TrustedSet`
   built from Facts (currency tolerance: $1 absolute or 2% relative;
   percentage tolerance: 1.5pp; counts: exact). Also flags:
   - Comparison-direction failures (`more|less|higher|lower|above|below|
     exceeds` near two numbers \u2014 if the asserted direction
     contradicts the numbers, the response is rejected).
   - Sum-mismatch failures (when a "Total" row sits alongside line items
     and the items don't sum to the total within rounding).

4. **Retry-with-feedback loop** in [apps/web/src/app/api/ai/ask-murmur/route.ts](../apps/web/src/app/api/ai/ask-murmur/route.ts).
   On validation failure the prompt is rebuilt with the specific issues
   appended ("your previous answer failed verification: \u2026"); the
   model gets one second chance. If the retry also fails, the API
   returns a graceful fallback verdict ("I can answer this from your
   data, but I couldn't verify every figure on this run\u2026") \u2014
   never a wrong number.

5. **Temperature 0** on the model call. There's no creativity required
   when narrating a deterministic facts block; determinism cuts drift on
   retries.

The model is now a narrator over a fact set, not a calculator. Wrong
numbers are caught structurally before they reach the user; if the model
can't get it right twice, we say so honestly.

**Mobile + web both benefit.** All the work lives behind the
`/api/ai/ask-murmur` endpoint that both surfaces hit. No client changes
required \u2014 same wire format, same response shape.

**Cost note.** Each request now potentially costs 2 model calls instead of
1 (the retry on validation failure). In practice the first attempt
succeeds for most well-formed questions; the retry fires when the model
flubs arithmetic. Worth the cost vs. shipping bad numbers. If/when we
upgrade the model env var (`AI_ASK_MODEL`) to `gpt-4o`, the retry rate
drops further.

**Untested live:**
- Asking the F&D vs Housing comparison from the original screenshot
  returns a verdict that quotes both numbers and gets the direction
  right.
- A pathological question ("how much did I spend on phantom-category?")
  either returns out-of-scope or surfaces the verification fallback
  rather than a hallucinated number.
- Across two consecutive identical questions, the cited totals don't
  drift.

### Ask Murmur \u2014 conversation persistence (April 25, 2026)

**Problem.** Ask Murmur threads were component state only \u2014 navigating
to /transactions and back, refreshing, or closing the tab erased every
question and answer. The user can't build context, can't review past
plans, can't pick up where they left off. Same architecture failure as
asking an LLM to do arithmetic: a workaround (localStorage) would have
"solved" persistence on one browser, not actually solved it.

**Fix \u2014 Supabase tables + RLS, same pattern as the rest of the app.**

**Schema** at [supabase/migrations/007_ask_conversations.sql](../supabase/migrations/007_ask_conversations.sql):

- \`ask_conversations\` (one row per thread): id, user_id, title (auto-derived
  from the first question), started_at, last_message_at, is_deleted (soft
  delete so an undo is always possible), timestamps. Indexed by
  (user_id, last_message_at DESC) where not deleted.
- \`ask_messages\` (one row per turn): id, conversation_id, user_id,
  role ('user' | 'assistant'), question (user only), response JSONB
  (assistant only \u2014 stores the full validated AskMurmurResponse so
  re-rendering is a single deserialize). Constraint forces the right
  payload per role.
- RLS pinned to \`auth.uid() = user_id\` on both tables. Browser client
  reads/writes directly; no service role required.
- \`bump_ask_conversation_last_message\` trigger updates the parent
  conversation's last_message_at on every message insert so the history
  list stays sorted without a join.

**Data layer** at [apps/web/src/lib/askMurmurStorage.ts](../apps/web/src/lib/askMurmurStorage.ts)
\u2014 \`loadMostRecentConversation\`, \`loadConversation\`, \`listConversations\`,
\`createConversation\`, \`appendUserMessage\`, \`appendAssistantMessage\`,
\`softDeleteConversation\`. Pure thin wrappers over the Supabase client;
no business logic.

**Ask page integration** at [apps/web/src/app/dashboard/ask/page.tsx](../apps/web/src/app/dashboard/ask/page.tsx):

- On mount, load the user's most recent active conversation + messages
  and hydrate the thread. Walking back into /ask shows the prior
  conversation ready for follow-ups.
- The conversations list (top 30 most recent) loads in parallel for the
  toolbar history dropdown.
- On send: if no active conversation, create a row first (auto-titled
  from the first question, truncated to 60 chars). Persist the user
  message, await the model, persist the assistant response. The pending
  state's transient id is replaced by the database id so React keys are
  stable across reloads.
- "New conversation" button clears the in-memory thread and unsets the
  active conversation \u2014 a fresh row only gets created on the next
  send (so the table doesn't fill up with empty conversations from idle
  clicks).
- History dropdown in the toolbar shows past conversations with title +
  last-message timestamp. Clicking switches the thread. The trash button
  per row soft-deletes; if the user just deleted the conversation they
  were viewing, the page falls back to the next most-recent or empty.

**Mobile** still uses the one-shot result-card UX and doesn't persist
yet. When mobile wants persistence we'll move \`askMurmurStorage.ts\`
into \`packages/shared\` and call from the mobile client too \u2014 same
tables, same RLS.

**Migration to apply (one-time, on the user's Supabase project):**
The migration file is in the repo at \`supabase/migrations/007_ask_conversations.sql\`.
Apply via the Supabase CLI (\`supabase db push\`) or paste into the SQL
editor on the dashboard. Until the migration runs the Ask page will fail
silently on every persist attempt (errors are console.error'd, the
in-memory thread still works).

**Untested live:**
- Open /ask, ask a question, navigate to /transactions, come back \u2014
  the conversation is still there.
- Refresh the page \u2014 the conversation is still there.
- Click "New conversation" \u2014 thread clears, history dropdown still
  shows the previous one.
- Open the History dropdown, switch between conversations.
- Delete a conversation \u2014 it disappears from the list; if it was the
  active one, the page falls back to the next most-recent.
- Sign out \u2014 the conversations stay in Supabase (RLS hides them from
  any other user); on sign-in they're back.

### Handoff to next session — Phase I part 2 (April 25, 2026)

**This session shipped:** Phase E (Ask Murmur), Phase F (frictionless
sign-in), Brand identity (Listening Drop), Phase H (Day-3 Insights unlock
+ recurring pattern banner + Day-2 dunning notification), Plus dev-mode
bypass, Plus data export, **Phase I part 1 — desktop web UI**.

**Open the next session at:**
1. `git log --oneline 7018612..HEAD` — read the commits in order for full
   context.
2. `docs/PLAN.md` — read from the bottom up; the Phase I part 1 section
   above is the most recent context.
3. Memory file `project_murmur_redesign.md`.

**Native-dep batch still pending (mobile):** `npx expo prebuild --clean`
+ a fresh dev-client build in `apps/mobile/` for `expo-notifications`,
`expo-file-system@19`, `expo-sharing`, `expo-print`.

**Next thread is Phase I part 2 — Electron wrap + signing.** The web UI
is real now; the desktop companion is the same web UI shrink-wrapped:

- **Electron skeleton.** New `apps/desktop/` workspace. `electron` +
  `electron-builder` deps. Main process loads a single BrowserWindow
  pointing at the production-built `apps/web` (either packaged static
  output or hosted at the same domain). Preload script for any native
  bridge (file save dialogs, OS-native menu).
- **macOS first.** Universal binary (arm64 + x64). Sign with the user's
  Developer ID Application certificate. Notarize via `notarytool`
  (interactive — needs Team ID + app-specific password). DMG output.
- **Windows + Linux** can follow once macOS is shipping.
- **Open question — host vs bundle.** Cleaner but slower path is hosting
  the Next.js app and pointing Electron at the URL (so Murmur web stays
  one app). Faster ship is `next export` static output bundled inside
  the .app. Recommend bundle-first for v1 since it doesn't require new
  hosting infra; revisit if the bundle gets stale faster than the user
  can update.

**What's parked, NOT skipped:** IAP / RevenueCat wiring, Phase G native
widgets, Phase E loose ends (voice in Ask, action destinations, caching),
brand 2.6s breathing pulse on Listening + Splash, pre-launch infra (icon
already shipped; still need privacy policy + ToS + store metadata +
Sentry), settings polish, voice composer in desktop Ask.

**Untested-live list** at the bottom of each phase section in this
PLAN.md is the user's QA agenda. Pinned — Claude doesn't gate on it.

### Phase I part 2 — Electron wrap (May 4, 2026)

**Decision: bundle, don't host.** The web UI has dynamic API routes
(`/api/ai/ask-murmur`, `/api/ai/parse-expense`, `/api/ai/parse-scan`,
`/auth/callback`) that proxy OpenAI and complete Supabase OAuth. A
static `next export` would lose them. So the desktop app embeds a
**Next.js standalone server** as a child process and points a single
`BrowserWindow` at `http://127.0.0.1:<freePort>/`. All API routes work
unchanged, the OpenAI key stays in the main process env (no client
exposure), and Supabase keeps its existing browser-side auth flow.

**Workspace.** New [apps/desktop/](../apps/desktop/) — picked up by
the root `npm` workspaces glob (`apps/*`).

**Pieces:**

- [apps/web/next.config.ts](../apps/web/next.config.ts) gets
  `output: 'standalone'` + `outputFileTracingRoot: '../..'` so the
  monorepo workspace deps (`@voice-expense/shared`, `@voice-expense/ai`)
  are traced into the standalone bundle.
- [apps/desktop/src/main.ts](../apps/desktop/src/main.ts) is the
  Electron main process. On `app.whenReady()` it picks a free port,
  spawns `process.execPath` (Electron-as-Node via
  `ELECTRON_RUN_AS_NODE=1`) running the standalone `server.js`, polls
  the port until ready, and creates a `BrowserWindow` with
  `titleBarStyle: 'hiddenInset'`, `backgroundColor: '#F4F1EA'` (cream
  bgDesk), `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`. External `http(s)` links open via
  `shell.openExternal`. macOS gets the standard Edit / View / Window
  menu. On `before-quit` / `window-all-closed` the embedded server is
  SIGTERM'd.
- [apps/desktop/src/preload.ts](../apps/desktop/src/preload.ts) — minimal
  context bridge exposing `window.murmur.{ platform, versions }`.
  Native bridge stubs (file save dialog, etc.) land here when needed.
- [apps/desktop/scripts/bundle-web.mjs](../apps/desktop/scripts/bundle-web.mjs)
  stages the standalone bundle into `apps/desktop/dist/web/`: copies
  `.next/standalone/` plus `.next/static/` and `public/` (which
  `output: 'standalone'` does NOT include — they have to be
  alongside the server entry).
- [apps/desktop/scripts/generate-icns.mjs](../apps/desktop/scripts/generate-icns.mjs)
  rasterizes [murmur-mark-cream.svg](../apps/mobile/assets/brand/murmur-mark-cream.svg)
  through `sharp` at the 10 sizes Apple expects in an iconset, then
  runs `iconutil -c icns` to produce
  [apps/desktop/build/icon.icns](../apps/desktop/build/icon.icns).
- [apps/desktop/electron-builder.yml](../apps/desktop/electron-builder.yml)
  configures the package: `appId: com.murmur.app`, mac DMG target with
  both `arm64` and `x64`, finance category, the brand `.icns`,
  `extraResources` copies `dist/web` → `Contents/Resources/web/`.
- [apps/desktop/build/afterPack.cjs](../apps/desktop/build/afterPack.cjs)
  is an electron-builder hook that runs `codesign --force --deep
  --sign -` on the staged `.app` before DMG packaging — without this,
  macOS refuses to launch because the partial linker-ad-hoc signature
  produces *"code has no resources but signature indicates they must
  be present"*. After the hook runs, `codesign --verify --deep`
  reports *"valid on disk"* + *"satisfies its Designated
  Requirement"*.

**Build pipeline (one command):** `npm --prefix apps/desktop run dist`
chains: `next build` (standalone) → `bundle-web.mjs` (stage) → `tsc -p`
(compile main + preload) → `electron-builder` (mac arm64 + x64 DMGs
with afterPack ad-hoc sign).

**Output (verified May 4, 2026):**
- `apps/desktop/release/Murmur-0.1.0-arm64.dmg` — 109 MB, APFS,
  `hdiutil verify` checksum VALID.
- `apps/desktop/release/Murmur-0.1.0.dmg` — 116 MB (x64).
- The `.app` bundle is 305 MB unpacked (Electron framework +
  bundled Next standalone server with traced node_modules + workspace
  packages). Smoke-tested standalone server boot: 71 ms cold-start
  via `node server.js` directly, redirects unauthenticated `/` to
  `/login` as expected.

**v1 deliberately ships unsigned.** `identity: null` +
`hardenedRuntime` left disabled (it can't coexist with `null` identity).
The afterPack ad-hoc sign keeps the launch path intact on the user's
own machine. End users would still need to right-click → Open
because Gatekeeper rejects ad-hoc-signed apps from the internet.

**Code-signing handoff (interactive task — NOT done in this session):**
1. User installs his Developer ID Application certificate into the
   login keychain (or exports a `.p12` and points `CSC_LINK` /
   `CSC_KEY_PASSWORD` env vars at it).
2. Edit `electron-builder.yml`: drop `identity: null`, re-enable
   `hardenedRuntime: true`, `entitlements: build/entitlements.mac.plist`,
   `entitlementsInherit: build/entitlements.mac.plist`. The
   entitlements file is already written with the JIT + network +
   audio-input rights Electron needs.
3. Delete or short-circuit `afterPack.cjs` (real signing replaces the
   ad-hoc one).
4. Set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` env
   vars and add `notarize: { teamId: '<id>' }` (or set
   `mac.notarize: true`) to electron-builder.yml so notarytool runs
   automatically post-build.
5. `npm --prefix apps/desktop run dist` — produces a signed +
   notarized + stapled DMG.

**Untested-live (Phase I part 2):**
- Open the arm64 DMG, drag Murmur.app to Applications, launch it.
  The window should boot to `/login` with the cream desktop bg, sage
  accents, and the Murmur sidebar — same UI you walked through in the
  desktop web session.
- Sign in with Google / Apple / email.
- Confirm Ask Murmur, /transactions, /budgets, /insights, /recurring,
  /export all work end-to-end inside the wrapped app.
- Quit and reopen — the embedded server should restart cleanly.
- Test the x64 DMG on an Intel mac if one's available.

**What's still parked:** the full code-signing + notarization
interactive session above; Linux AppImage target; auto-updates via
electron-updater; native bridge (system save dialog for export, deep
links).

### Phase I part 2 follow-up — desktop QA arc + Windows build (May 4–10, 2026)

The packaged macOS DMG made it to the user's machine and revealed a
long string of regressions through walkthroughs. Whole arc landed in
commits `d43a36f` → `618467d`. Highlights:

**Launch chrome (commits `d43a36f` → `203516a`):**
- `child_process.spawn(process.execPath, [serverJs], {
  ELECTRON_RUN_AS_NODE: 1 })` was triggering a stray Terminal-shaped
  window on every launch — LaunchServices was registering the spawned
  Electron-as-Node child as a second app instance. Replaced with
  `utilityProcess.fork(serverJs, ...)`, Electron's purpose-built API
  for managed Node children. No second LaunchServices entry, no extra
  window.
- Finder-launched apps inherit a clean GUI env that doesn't see the
  user's shell — so `OPENAI_API_KEY` etc. weren't reaching the
  embedded server, Ask Murmur 500'd, Plus paywall stayed up. Added
  [apps/desktop/src/main.ts:loadEnvFile](../apps/desktop/src/main.ts)
  which reads `<userData>/.env` and merges into the spawned env.
- macOS traffic-lights overlapping the sidebar logo: added a 36-px
  draggable strip via [apps/web/src/components/DesktopChrome.tsx](../apps/web/src/components/DesktopChrome.tsx)
  and `body { padding-top: var(--desktop-title-bar) }` so content
  starts below the strip on macOS only.

**Plus gating split (commit `d43a36f`):**
- Replaced ad-hoc `process.env.NODE_ENV !== 'production'` checks
  scattered across pages with a proper resolver
  [apps/web/src/lib/plus.server.ts](../apps/web/src/lib/plus.server.ts)
  + React context [apps/web/src/lib/plus.tsx](../apps/web/src/lib/plus.tsx).
  `dashboard/layout.tsx` resolves once per request server-side and
  passes through `<PlusProvider isPlus={...}>`. Resolver honours a
  runtime `MURMUR_DEV_PLUS=1` env override so the user can toggle
  the gate from `<userData>/.env` without rebuilding.

**Mind-map rebuild (commit `0152a9e`):**
- Replaced the horizontal-scroll viewport with a real infinite
  canvas: drag-to-pan, wheel-pan, ⌘+scroll-to-zoom around the
  cursor, recenter button. Dotted background tracks `view.tx/ty` so
  dots flow under the cursor as the user pans (Stitch / Claude Design
  feel). Each merchant becomes its own positioned chip with a curved
  bezier connector to its sub-category card; the previous layout
  stacked chips inside the parent card and read as cluttered.
  Two-level fold: each branch can collapse its sub-nodes, each
  sub-card can collapse its merchants, and a `+N more` terminator
  reveals all merchants when there are more than the visible 5.

**Treemap full-canvas + lens fixed-heights (commits `885abeb`,
`6ac2cd3`):**
- The treemap had a "Quick read" sidebar that swallowed 22% of the
  canvas to repeat stats already in the page header. Dropped. Cells
  now use 100% width with a per-row minimum-width floor (14% top,
  18% tail) so a $20 category next to a $20 K one stays readable.
- All lenses (Treemap, Calendar, Cashflow, Matrix) switched from
  `height: '100%'` to `height: 600` after the percent-height was
  collapsing because the parent flex chain didn't propagate a
  determinate height. Mind map already used `height: 600`; the rest
  match now.

**Body-scroll lock (commits `c638b4a`, then reverted-and-redone
`8e5f8aa` / `430613a` / `c638b4a`):**
- Goal: dashboard occupies one screen, only `<main>` scrolls when
  needed, body never scrolls. Initial fix added `html, body {
  height: 100vh; overflow: hidden }` plus sidebar `height: 100%`,
  which **locked scroll correctly** but **triggered a Chromium
  compositing/paint bug** that left `dashboard/page.tsx`'s toolbar
  text + headerRow + lens pills *unpainted* on screen — DOM, color,
  visibility, opacity were all correct via `getBoundingClientRect`
  and `getComputedStyle`, but pixels never reached the screen.
- After diagnosing via DevTools console (`document.querySelectorAll('main > div > div > div')...`),
  rolled back the html/body overflow and committed the **minimal**
  fix in `c638b4a`: sidebar `height: '100%'` only. Layout chain
  alone (`body padding-top` + `layout div height: calc(100vh -
  title-bar)` + sidebar fits exactly) is enough to keep the body
  from overflowing — no `overflow: hidden` needed, no paint bug.

**Plus env-loader correctness (commits `1daa9bd`, `3eac9ee`):**
- Added [apps/web/src/app/api/plus-status/route.ts](../apps/web/src/app/api/plus-status/route.ts)
  diagnostic endpoint to expose what the server-side resolver
  actually sees. Diagnostic returned `MURMUR_DEV_PLUS: null`
  *despite* the env file existing — root cause: Electron's
  `app.getName()` defaulted to package.json `name`
  (`@voice-expense/desktop`), so `app.getPath('userData')` resolved
  to `~/Library/Application Support/@voice-expense/desktop/` not
  `Murmur/`. The user's env file was at the right name but the app
  was looking under the wrong one. Fix: added `"productName":
  "Murmur"` to [apps/desktop/package.json](../apps/desktop/package.json).
  Electron reads productName at app init, before
  `app.whenReady()`. After the fix the diagnostic returned
  `isPlus: true`, `MURMUR_DEV_PLUS: '1'`, `OPENAI_API_KEY_set:
  true` — Plus paywall gone, Ask Murmur AI calls work end-to-end
  in the packaged build.
- The `/api/plus-status` route is **still in the tree** as of this
  handoff. Remove it in a follow-up commit when convenient (1-line
  delete-the-folder).

**Windows build (commit `618467d`):**
- `electron-builder.yml` now has a `win:` section with NSIS target
  (`oneClick=true`, Start-menu + desktop shortcuts, custom installer
  icon, x64 only — Windows arm64 still rare in the wild).
- New script: `npm --prefix apps/desktop run dist:win` cross-compiles
  from macOS via electron-builder + Wine. Wine is Intel-only so
  Apple Silicon Macs need **Rosetta 2** installed once
  (`softwareupdate --install-rosetta --agree-to-license`).
- [apps/desktop/scripts/generate-icns.mjs](../apps/desktop/scripts/generate-icns.mjs)
  now also produces `build/icon.ico` packed with the seven standard
  ICO sizes (16/24/32/48/64/128/256) via `png-to-ico`.
- DesktopChrome now mounts only on macOS (`platform === 'darwin'`).
  On Windows the OS provides its own native title bar — no custom
  drag strip needed; the CSS var `--desktop-title-bar` falls back to
  `0px` and all the layout calc()s adapt automatically.
- Output: `apps/desktop/release/Murmur-Setup-0.1.0.exe` (92 MB).
  Unsigned — Windows SmartScreen warns on first launch and the user
  clicks *More info → Run anyway* once.

### Reviews triage — P0 batch (May 10, 2026)

Four cross-cutting QA docs landed under [docs/reviews/](reviews/) —
`CROSS_PLATFORM_REVIEW.md`, `DESKTOP_REVIEW.md`, `MOBILE_REVIEW.md`,
`LOGIC_REVIEW.md`. Triage produced a P0/P1/P2 list (notes in the chat
transcript and `memory/project_murmur_redesign.md`). P0 is the
data-integrity + honest-claims batch — everything that silently
corrupts a user's data or misleads them. P1 is capability gaps
(desktop CRUD, Apple SIWA on web, unified `isPlus`). P2 is polish
(i18n, mobile tab icons, currency display).

**P0 shipped this batch (LOGIC §1.3.1, §1.3.2, §1.4, §1.5.x):**

1. **Recurring catch-up de-duplication (LOGIC §1.5.1–§1.5.3).**
   The mobile catch-up and the `generate-recurring` Edge Function both
   generated occurrences for the same `(rule, date)` pair, each with a
   fresh UUID, and the existing `version` check did not catch them
   because that protects identical-id collisions, not different-id
   duplicates.
   - **Migration 008** at
     [supabase/migrations/008_recurring_dedup_constraint.sql](../supabase/migrations/008_recurring_dedup_constraint.sql).
     Soft-deletes any duplicates already on disk (keeps the earliest
     row per `(user, rule, transacted_at::date)` by `created_at`),
     then builds a partial unique index
     `idx_txn_recurring_dedup` on the same tuple with
     `WHERE recurring_rule_id IS NOT NULL AND is_deleted = false`.
     Manual / voice / scan rows (rule_id = NULL) are exempt.
   - **SyncManager** detects Postgres `23505` on that index, soft-
     deletes the loser locally so SQLite matches the server view, and
     drops the queue entry without ticking the retry counter
     ([apps/mobile/src/services/sync/SyncManager.ts](../apps/mobile/src/services/sync/SyncManager.ts)).
   - **Mobile catch-up** now writes `last_generated` to Supabase
     **after each occurrence**, not once at the end of the loop. An
     interrupted catch-up resumes from the right point on next
     launch. It also checks SQLite with the new
     `hasRecurringOccurrence(userId, ruleId, isoDate)` helper before
     generating — if `pullRemote` already pulled down the server-cron
     row, catch-up advances `last_generated` and skips, avoiding a
     guaranteed local index violation.
   - **Local SQLite mirror** at
     [apps/mobile/src/services/sync/localDb.ts](../apps/mobile/src/services/sync/localDb.ts).
     Same partial unique index, same dedup pass in `migrateSchema()`
     before the index is built so existing installs don't fail
     index creation on historical bad data.

2. **Receipt scan auto-defaulting to `payment_method='cash'` (LOGIC §1.3.1).**
   The receipt prompt at [packages/ai/src/prompt.ts](../packages/ai/src/prompt.ts)
   didn't ask for `payment_method` at all and the save path at
   `record.tsx` fell back to `'cash'` on null. Every credit-card
   receipt was being logged as a cash transaction.
   - Receipt prompt now requests `payment_method` and gives the model
     concrete on-receipt signals to read (VISA/MASTERCARD/AMEX with
     last-4 → `credit_card`, DEBIT/EFTPOS → `debit_card`, CASH
     TENDERED → `cash`, APPLE PAY / GOOGLE PAY → `digital_wallet`).
     Explicit instruction to return `null` when the receipt does not
     show a payment method — "do not guess cash".
   - `record.tsx`'s save path no longer falls back to `'cash'`. The
     same `?? null` change applies to voice transcripts where the AI
     can't determine a method.
   - The edit screen's state widens to `PaymentMethod | null`. When
     the user loads an existing transaction with no payment method,
     no chip is selected, and saving without picking preserves
     `null` instead of silently promoting the row to cash.
   - Local SQLite `payment_method` column loses its
     `NOT NULL DEFAULT 'cash'` constraint to match Supabase. New
     installs get the loose column on first table create; existing
     installs get the constraint dropped via a table-swap migration
     in `migrateSchema()` (SQLite has no DROP NOT NULL).

3. **Paycheck scan hardcoding `recurring_frequency_suggestion: "biweekly"` (LOGIC §1.3.2).**
   The paycheck prompt template literally pre-filled `"biweekly"` in
   the JSON the model was asked to return. Every monthly / weekly /
   semimonthly paychecked user had to manually correct the suggested
   cadence.
   - Prompt now asks the model to determine cadence from the
     pay-period dates on the stub. Returns `"weekly"` / `"biweekly"`
     / `"monthly"` from the existing `RecurringFrequency` enum, or
     `null` when only one pay period is visible or when the cadence
     is semimonthly (which the enum doesn't yet represent — flagged
     for a future enum extension if user feedback warrants it).
   - Paycheck prompt also now sets `payment_method: "bank_transfer"`
     since paychecks land via direct deposit. Matches the convention
     already used by income onboarding.

4. **Onboarding income → orphan rule (LOGIC §1.4, MOBILE §3.7).**
   The income step at [apps/mobile/app/(onboarding)/income.tsx](../apps/mobile/app/(onboarding)/income.tsx)
   called `createTransaction` and `createRule` separately and never
   linked them. Every user's first income transaction looked broken
   on the detail screen because the rule lookup
   (`rules.find(r => r.template_txn_id === txn.id)`) returned null.
   - Capture `txnId` from `createTransaction` and pass it as
     `template_txn_id` to `createRule`. Matches the pattern already
     used by the voice, manual entry, and edit-screen flows.

**Typecheck:** `npx turbo typecheck` passes across all 6 packages
after the batch. The `packages/ai` verification harness still passes
its 27 assertions (the prompt changes are to the scan prompts, not
the Ask Murmur prompts the harness exercises).

**Open P0 questions waiting on the user (no code changes blocked on
them yet — they shape the architecture of the next P0 round):**
- `raw_transcript` syncing despite the "not stored" privacy claim
  (MOBILE §4.1, DESKTOP §5.2): strip on sync, or keep storing + add
  opt-in + change copy?
- Dead privacy buttons (MOBILE §3.6, DESKTOP §3.2): wire them
  (Export-all via existing `exportData.ts`, build Delete-all flow,
  persist web toggles), or hide until wired?
- Multi-currency totals (LOGIC §2.1): FX at write-time (rate
  snapshot per txn) or FX at read-time (daily rate table)?
- Support email: do you own `murmur.app`? Where should support@
  forward?

**Verification the user owes a smoke run on:**
- Open a Supabase SQL editor and run
  `SELECT user_id, recurring_rule_id, (transacted_at AT TIME ZONE 'UTC')::date AS day,
   COUNT(*) FROM transactions WHERE recurring_rule_id IS NOT NULL
   AND is_deleted = false GROUP BY 1,2,3 HAVING COUNT(*) > 1;` to
  confirm migration 008's dedup actually cleaned existing dupes
  (should return zero rows after apply).
- Re-take a credit-card receipt → confirm `payment_method` lands as
  `credit_card`, not `cash`.
- Re-photograph a monthly paystub → confirm the suggested cadence is
  `monthly`, not biweekly. If the stub only shows one period, expect
  `null` and the modal staying on its default frequency.
- Walk a fresh onboarding (clean install) → open the auto-created
  income transaction's detail screen → confirm the recurring chip
  shows the frequency and the next-due date (not the bare
  "Recurring" ghost case).

### Reviews triage — P0 batch 2 (May 10, 2026)

The second P0 batch. Closes the privacy honesty + multi-currency + email
items the first batch flagged as decisions-needed. Ownership note: the
calls on FX strategy, privacy-toggle persistence, E2E-copy fix, and
support email were taken on the engineering side rather than punted
to the user — the user explicitly delegated those after the first batch.

**Privacy: `raw_transcript` stops syncing (MOBILE §4.1, DESKTOP §5.2,
LOGIC §6.5).**
- [SyncManager.ts](../apps/mobile/src/services/sync/SyncManager.ts)
  strips `raw_transcript` from the upsert payload before pushing to
  Supabase. The transcript lives only on the recording device. The
  ON CONFLICT clause in `upsertTransaction` never updates
  `raw_transcript`, so a later `pullRemote` bringing back the
  null-transcript server row does not overwrite the local copy.
- [Migration 009](../supabase/migrations/009_strip_raw_transcript.sql)
  NULLs out every historical row's `raw_transcript`. The column stays
  in the schema so a future opt-in surface can re-introduce
  transcripts without another schema change.

**Privacy controls: real wiring on both platforms (MOBILE §3.6,
DESKTOP §3.2).**
- [Migration 010](../supabase/migrations/010_privacy_preferences.sql)
  adds `profiles.analytics_opt_in` (default false) and
  `profiles.crash_reports_opt_in` (default true).
- Web [Settings → Privacy](../apps/web/src/app/dashboard/settings/page.tsx)
  loads + persists those columns via `persistPrivacyFlag(column,
  next)` with optimistic UI and rollback on write failure.
- Mobile [more/privacy.tsx](../apps/mobile/app/more/privacy.tsx) wires
  Export-all and Delete-all (both previously dead rows). Export-all
  reuses the existing `exportData.ts` service in JSON format —
  unconditionally free because GDPR data portability cannot be
  paywalled (the convenience format-picker in Settings → Data stays
  Plus). Delete-all triggers a destructive-style native Alert; on
  confirm it calls the new server-side
  [`delete-user` Edge Function](../supabase/functions/delete-user/index.ts),
  wipes local SQLite via `wipeAllUserData(userId)`, then signs out.
- Web Settings has the same two GDPR controls. Delete-all uses the
  same Edge Function and forces a hard navigation to `/login`.
- New i18n keys (`privacy.export_all_busy`, `privacy.delete_all_*`)
  in all four locales.

**Privacy copy: "End-to-end encrypted" replaced (DESKTOP §5.1).**
- The Sync & devices card on web Settings now reads "Encrypted in
  transit and at rest, protected by row-level security tied to your
  account. Murmur stores your transactions but never connects to
  your bank." Honest copy. Real E2E would be months of work and
  break Ask Murmur's grounded reasoning; the right call is the copy.

**Support email: single shared constant (MOBILE §6.1, DESKTOP §6.2).**
- New
  [packages/shared/src/brand.ts](../packages/shared/src/brand.ts)
  exposes `SUPPORT_EMAIL` and `SUPPORT_MAILTO`. Both surfaces now
  point at `support@murmur.app` (the placeholder web already used).
  The personal Gmail in `apps/mobile/app/more/help.tsx` is gone.
  Pre-launch follow-up: register `murmur.app` (if not already) and
  point `support@` at the real inbox.

**Multi-currency: write-time FX snapshot (LOGIC §2.1).**
- The honest fix, not a workaround. Aggregations sum the snapshot,
  not raw `amount`, so `$1000 + €50` stops appearing as `$1050`.
- [Migration 011](../supabase/migrations/011_fx_snapshot.sql) adds
  `amount_in_profile_currency`, `fx_rate_to_profile`, `fx_rate_date`
  to `transactions`. Backfills same-currency rows in place (rate
  1.0). Foreign-currency historical rows stay NULL pending
  client-side backfill (see below).
- FX provider:
  [packages/shared/src/utils/fx.ts](../packages/shared/src/utils/fx.ts)
  — `snapshotFx(transactedAt, fromCurrency, toCurrency, amount)`
  hits frankfurter.app (free, ECB-sourced, no API key). In-process
  cache by `(date, from, to)`. Same-currency short-circuits without
  a network call. On lookup failure returns null and the row saves
  unsnapshotted (backfill picks it up later).
- Write paths now snapshot at save time:
  - [useTransactions.createTransaction](../apps/mobile/src/hooks/useTransactions.ts) — voice / manual / scan / onboarding.
  - [recurringCatchUp.ts](../apps/mobile/src/services/recurringCatchUp.ts) — mobile catch-up. Rate dated to the occurrence's `transacted_at`, not today, so historical rebuilds use the right rate.
  - [generate-recurring Edge Function](../supabase/functions/generate-recurring/index.ts) — server cron. Per-user profile cache + per-pair rate cache so a batch run with many users on the same currency pair fetches once.
  - [editTransaction](../apps/mobile/src/hooks/useTransactions.ts) — when the user edits a txn's amount, the cached `fx_rate_to_profile` recomputes the snapshot in place. No network call (rate is dated to transacted_at, which doesn't change).
- Profile-currency cache:
  [profileCurrency.ts](../apps/mobile/src/services/profileCurrency.ts)
  holds the current value in a module-level singleton, populated by
  `useProfile` on every load. Write paths read it without prop-
  drilling.
- Aggregations: new `aggAmount(t)` helper in the shared FX module
  reads `amount_in_profile_currency` and returns 0 for unsnapshotted
  rows. Updated 13 call sites: mobile Today, Insights (sumDebits +
  category breakdown), Budgets (`usePeriodSpend`), useMonthSummary;
  web Dashboard KPIs, Insights (totals, weekday matrix, hour
  buckets), Budgets (overall + per-category), Export totals, plus
  every lens (Flow, Calendar, Cashflow, Treemap, Matrix, MindMap)
  and the lens helper `groupByCategory`. Single-row display uses
  `t.amount` (raw, original currency) and was deliberately left
  alone — that's the right field for showing "$50 dinner".
- Foreign-currency historical backfill:
  [fxBackfill.ts](../apps/mobile/src/services/fxBackfill.ts) runs on
  app launch (alongside `runRecurringCatchUp`). Self-throttles to
  100 rows per launch — a user with thousands of foreign txns gets
  converted across several opens rather than burning a single
  launch on rate fetches. Idempotent.
- Local SQLite mirrors the schema. New columns added in `localDb.ts`
  init + ALTER paths so existing installs migrate cleanly.

**Typecheck:** 6/6 packages pass. **AI verify:** 27/27.

**Still open from the reviews (next batch decisions still on me):**
- Unified `isPlus` resolver reading `profile.plus_status` once IAP
  wires the real entitlements.
- Desktop transaction CRUD (no add / edit / delete on web today).
- `monthly_income` not editable on web Settings.
- Apple SIWA on web login (iOS users locked out of desktop).
- Electron `setWindowOpenHandler` denies all + PDF export uses
  `window.print` — both broken in the packaged app.
- Budgets page not realtime + "Overall" hardcoded to monthly.
- Mobile Ask follow-up bar dead UI (remove until feature lands).
- Insights gating mismatch (mobile free / web Plus) — call: free on
  both (lower friction, matches PLAN's Plus locked-decision list).
- Ask Murmur persistence (web persists / mobile doesn't / PRD says
  session-only) — call: persist on both, PRD update follows code.

### Reviews triage — P1 batch 1 (May 11, 2026)

Small, surgical fixes that close three of the cross-platform gaps the
review docs flagged. Continued accountability mode — decisions taken on
the engineering side rather than punted.

**Unified `isPlus` resolver (CROSS §1.5, §4.1, DESKTOP §4.1, MOBILE §3.10).**
- New
  [packages/shared/src/plus.ts](../packages/shared/src/plus.ts) exposes
  `isPlusFromProfile(profile)` — the canonical "is this user Plus?"
  read. Returns true only when `profile.plus_status === 'active'`.
- New
  [migration 012](../supabase/migrations/012_plus_status.sql) adds the
  `plus_status` column (`'active' | 'lapsed' | 'free' | null`) with a
  CHECK constraint. NULL is the default — new profiles start free
  without an explicit write.
- Web server resolver
  [plus.server.ts](../apps/web/src/lib/plus.server.ts) now accepts an
  optional profile and resolves in order:
  `isPlusFromProfile(profile)` → `MURMUR_DEV_PLUS=1` env →
  `NODE_ENV !== 'production'` → false. Production reads the column
  exclusively; dev hatches still let local development unlock
  surfaces.
- Mobile [usePlusStatus](../apps/mobile/src/hooks/usePlusStatus.ts) now
  reads via `useAuth` + `useProfile`, returns
  `isPlusFromProfile(profile) || __DEV__`. The hook surface remains
  `{ isPlus, loading }` — callers don't change.
- Web [dashboard/layout.tsx](../apps/web/src/app/dashboard/layout.tsx)
  passes the loaded profile to `resolvePlusStatus(profile)` so the
  `PlusProvider` context value reflects `plus_status` once the column
  is populated. Insights page does the same after its parallel
  profile fetch.
- **Removed**: `/api/plus-status` diagnostic route. The env-loader bug
  it was instrumenting was closed by `3eac9ee` (productName fix); the
  endpoint had been on the cleanup list since.
- This is the wire-up that makes IAP / RevenueCat shippable as a
  pure backend change: when receipt validation lands and writes
  `plus_status = 'active'`, every surface flips at once with no
  client-side coordination required.

**`monthly_income` editable on web Settings (CROSS §1.4, DESKTOP §3.1).**
- [settings/page.tsx](../apps/web/src/app/dashboard/settings/page.tsx)
  Account form gained a Monthly income input. Stored as a string in
  React state so the field behaves like normal text — empty allowed,
  no spinner artifacts. Save parses (strips thousand separators +
  currency symbols), validates `n ≥ 0`, persists null on empty/invalid
  so the user can clear their income. Inline help text explains it
  powers Ask Murmur affordability reasoning.
- The schema field exists on `profiles.monthly_income`; only the UI
  was missing. Ask Murmur on desktop now picks up updates after the
  next request load.

**Removed dead Ask follow-up bar on mobile (MOBILE §3.2).**
- The bar at the bottom of
  [more/ask-result.tsx](../apps/mobile/app/more/ask-result.tsx) looked
  like a chat input — placeholder text + sage-coloured circular mic
  button — but the mic only called `router.back()`. Users tapped
  expecting "submit my follow-up" and got the opposite. Removed until
  multi-turn lands on mobile (web's `/dashboard/ask` already
  supports it via the conversation thread). Bar + styles + comment
  replaced with a single-line note explaining the removal so the next
  pass through the file knows the bar is intentionally not there.

**Typecheck:** 6/6 packages pass. **AI verify:** 27/27.

### Reviews triage — P1 batch 2 (May 17, 2026)

**Real PDF export on desktop + web (DESKTOP §1.1, §4.7).**
- The Electron `setWindowOpenHandler` deny-all branch was already
  closed in commit `d43a36f` (Phase I part 2 follow-up arc). The
  DESKTOP review was stale on that point.
- The remaining half — replacing the `window.print()`-through-a-popup
  approach with a real PDF generator — landed in
  [export/page.tsx](../apps/web/src/app/dashboard/export/page.tsx).
  Added `jspdf@^4.2` + `jspdf-autotable@^5` as dependencies of
  `@voice-expense/web`. The export now produces a downloadable
  `.pdf` Blob via the standard `<a download>` pattern — no popup,
  no print dialog, no "Pop-ups blocked" alert that could never be
  satisfied in Electron. Dynamic import so the ~120 KB library only
  loads when the user actually exports. autoTable handles
  pagination, header repetition, and column alignment; the layout
  matches the brand (eyebrow + serif title + totals strip + sage
  credit colour) within jsPDF's primitive draw API. The previous
  `pdfHTML` helper and `escape` utility were removed — they were
  exclusively used by the popup path.

**Budgets page realtime + period-aware Overall + scope-edit sheet (DESKTOP §4.4, §4.5, §4.6, LOGIC §3.3).**
- [budgets/page.tsx](../apps/web/src/app/dashboard/budgets/page.tsx)
  subscribes to `postgres_changes` on `transactions` AND `budgets`
  scoped to the current user (matches the mobile pattern in
  `useTransactions`). An expense logged on mobile reflects on the
  ring within the realtime debounce, no manual reload. Channel name
  is randomised per-mount to survive React Strict Mode's double-
  invoke.
- The "Overall" spend math now uses `periodStart(overall.period)`
  rather than hardcoded `'monthly'`. A user with a weekly $500
  budget no longer sees their week's cap compared against a
  full calendar month of spend.
- Header copy uses `periodTitle` / `periodSuffix` helpers so the
  page reads "Weekly budgets" / "this week" when the overall is
  weekly, etc. — no more hardcoded "this month".
- [transaction/edit.tsx](../apps/mobile/app/transaction/edit.tsx)
  gained the just-this-one / all-future scope prompt for editing a
  `recurring_generated` occurrence (LOGIC §3.3). Calendar-app
  standard — fixes the "I got a raise; please apply going forward"
  case. Look-up tries `txn.recurring_rule_id` first, then falls
  back to `template_txn_id` so both server-cron generated rows and
  legacy template rows route correctly.

**Typecheck:** 6/6 packages pass. **AI verify:** 27/27.

### Handoff to next session — reviews + tests (May 10, 2026)

**This session shipped:** Phase I part 2 follow-up arc above —
desktop QA closed, Plus dev unlock working end-to-end, Windows build
added. 18 commits ahead of `origin/main`, nothing pushed yet.

**Open the next session by:**
1. Reading the user's review notes — these are the **highest-
   priority input**:
   - [docs/CROSS_PLATFORM_REVIEW.md](CROSS_PLATFORM_REVIEW.md)
   - [docs/DESKTOP_REVIEW.md](DESKTOP_REVIEW.md)
   - [docs/MOBILE_REVIEW.md](MOBILE_REVIEW.md)
   - [docs/LOGIC_REVIEW.md](LOGIC_REVIEW.md)
   These are untracked QA notes the user has been keeping while
   walking through the app. Triage them into a prioritised fix list
   before touching code. *I (the previous chat) did not read these
   yet.*
2. Run `git log --oneline 7018612..HEAD` for the full Phase I part 2
   commit arc with detailed messages.
3. Read this PLAN.md from the bottom up — Phase I part 2 sections
   are the most recent context.
4. Memory file `project_murmur_redesign.md` for project-level state
   summary.

**Build artifacts on disk right now (May 10):**
- `apps/desktop/release/Murmur-Setup-0.1.0.exe` (92 MB Windows
  installer, x64) — fresh
- `/Applications/Murmur.app` — the user's installed macOS copy from
  the `c638b4a` build
- macOS DMGs **not** in `release/` (cleared before the Windows
  build); rerun `npm --prefix apps/desktop run dist` if needed

**Backlog, in priority order:**
1. **Reviews triage** — read the four `*_REVIEW.md` files, build a
   prioritised fix list, execute. Likely the bulk of the next
   session's work.
2. **Remove `/api/plus-status` debug route** — 1-line cleanup once
   reviews are in flight.
3. **macOS code-signing + notarization** — interactive. The user
   already has an Apple Developer account ($99/year, paid).
   electron-builder.yml has the steps documented in the previous
   Phase I part 2 section. Needs ~30 min: install Developer ID
   Application cert into login keychain, gather Team ID + Apple
   ID + app-specific password, edit electron-builder.yml to drop
   `identity: null` and re-enable hardenedRuntime + entitlements,
   short-circuit `afterPack.cjs`, set CSC + APPLE_ID env vars,
   rebuild.
4. **Windows code-signing** — separate cert (EV cert recommended
   for SmartScreen reputation). Defer until macOS signing lands.
5. **Real Plus subscriptions** (IAP / RevenueCat) — interactive.
6. **Visual smoke-test in build pipeline** — promised twice in this
   session, not built. Boots the packaged app, asserts toolbar text
   pixels exist, fails the build if regression. Stops "toolbar
   disappeared"-style bugs from reaching the user. Worth doing
   before more big changes.
7. Phase G widgets, brand pulse animation, voice in Ask, mobile
   native-dep prebuild + dev-client rebuild, pre-launch infra
   (privacy/ToS/Sentry/store metadata) — all parked.

### Session — backend deployed live + reviews arc closed out (July 23, 2026)

The project sat untouched from May 17 to July 23. This session's job
was "review everything, finish it up." What it found and shipped:

**Recovery + commit hygiene.**
- The entire May 10–17 reviews-triage arc (P0 batches 1–2, P1
  batches 1–2 — ~63 files, migrations 008–012, delete-user Edge
  Function) was sitting **uncommitted** in the working tree. Verified
  green (typecheck 6/6, AI harness), then committed as `67b3858`.
- Supabase project `voice-expense-tracker` had been **auto-paused**
  by the free tier during the idle months — the whole backend was
  down. Restored to ACTIVE_HEALTHY.

**Backend actually deployed (it never had been).**
- Migrations 008–012 applied to the live database (only 001–007 were
  ever applied; the P0 data-integrity fixes existed only in files).
- `generate-recurring` + `delete-user` Edge Functions deployed —
  the functions list was empty before this session, meaning server-
  side recurring generation had **never run in production**; only the
  mobile catch-up was generating occurrences.
- pg_cron + pg_net enabled; `generate-recurring-daily` scheduled at
  06:00 UTC. Smoke-tested live: 200 + `{generated:0,errors:0}` with
  the service key, 401 without.
- `generate-recurring` gained an explicit service-role-key check
  (deployed with platform verify_jwt off — that can't validate the
  new `sb_secret_*` key format — so the function enforces auth
  itself).

**Reviews triage — P1 batch 3 (`fdda4f7`).**
- Desktop transaction CRUD (CROSS §1.2 CRITICAL): web Transactions
  page gains Add / click-row-to-edit / soft-delete with the full
  sync-field contract (client_id, version bumps, FX snapshot).
  Inline "+ New category…" in the form covers CROSS §1.3.
- Insights free on web, matching mobile (CROSS §4.2).

**Ask Murmur persistence unified (`27557c2`).**
- askMurmurStorage → `packages/shared/src/askStorage.ts`; mobile
  one-shot asks now persist to the same `ask_conversations` /
  `ask_messages` tables and appear in the desktop history dropdown.
- PRD §7 updated to the honest storage contract (supersedes the
  v1.0 "never stored server-side" line).

**P2 polish (`7681c27`).**
- Tab icons: Today hamburger → home, Budgets clock → wallet.
- `currencySymbolFor` moved to shared; all six amount surfaces use
  it (IncomeEditorModal had a hardcoded `$`).
- Settings/Help version rows read `Constants.expoConfig.version`.

**Verified:** typecheck 6/6, AI harness green, web production build
passes.

### Live E2E verification pass (July 23, 2026 — same session)

Everything above was then verified by driving the real apps, not just
typechecking them. Playwright driver lives in the session scratchpad
(not the repo); disposable test users were created via the admin API
and destroyed through the `delete-user` function afterwards.

- **Web (local dev + production Vercel deploy, both):** full flow —
  login → Transactions → Add transaction (new-category inline path +
  credit_card) → row appears → click-row edit (amount change) →
  Insights renders with **no paywall** → soft delete. All steps green
  on `localhost` and on `money-app-web-w6su.vercel.app` (which also
  proves the Vercel git integration deployed today's push). Zero
  console errors in production.
- **Database truth checked after the UI run:** the row carried
  `amount_in_profile_currency` = amount, `fx_rate_to_profile` = 1.0,
  `payment_method = 'credit_card'`, `version = 3` after
  create→edit→delete, `is_deleted = true` + `deleted_at` set, and the
  inline-created category existed.
- **Ask persistence (the exact mobile code path):** the real
  `packages/shared/src/askStorage.ts` module was exercised against
  the live DB as the test user — createConversation, both message
  appends, round-trip load. RLS negative check: an unauthenticated
  client sees zero rows.
- **GDPR delete:** `delete-user` returned 200 and a follow-up SQL
  sweep found 0 rows across transactions / categories /
  ask_conversations / ask_messages / profiles / auth.users.
- **Desktop:** Electron dev entry (same main.ts as the packaged app)
  launched under Playwright `_electron`; embedded standalone Next
  server booted, userData `.env` loaded (8 keys), window screenshot
  verified fully painted (no Chromium paint-bug regression) with the
  corrected sidebar badges. Gotcha for future sessions: strip
  `ELECTRON_RUN_AS_NODE` from the environment when launching
  Electron from inside a VSCode-hosted shell, or the binary runs as
  plain Node and `app` is undefined.
- **Found + fixed during the pass:** stale PLUS badge on the sidebar
  "Reports & forecast" row and the Settings upsell copy still listing
  it as a Plus perk (`f5e6e2b`).
- **Port gotcha:** `localhost:3000` on this machine may be occupied
  by the user's other project (O'KILI); run Murmur web on another
  port for local testing.
- **Mobile (iOS simulator, driven with Maestro):** built the dev
  client (`npx expo run:ios`), installed on a dedicated simulator
  (iPhone 17 Pro Max — the booted 17 Pro belongs to the user's other
  project), and drove the real app: email sign-in against the live
  backend → onboarding (permissions → income skip) → tabs. Visually
  confirmed on-device: Today tab shows the **home** icon, Budgets
  shows the **wallet** icon, and the Record manual-entry hero shows
  the currency **symbol** ("$"), not the "USD" code. Test user
  destroyed via `delete-user` afterwards.
- **Sign-in fixes found by the mobile run:** the auth fields had
  autocorrect enabled (iOS mangled typed emails) and the email
  field's "next" return key did nothing. Both fixed — autoCorrect
  off on both fields, return key now hands focus email → password,
  and both fields carry testIDs/accessibility labels for future
  automation.
- **Maestro is the mobile driver of choice** (`~/.maestro/bin`,
  needs a JRE — a portable one works; point JAVA_HOME at it). idb is
  blocked on this machine (Homebrew demands newer Xcode CLT).

### Visual QA pass with seeded data (July 23, 2026 — same session)

A second, deeper pass: seeded a realistic 3-month dataset (30
transactions across 6 categories, income, 4 budgets, an active
Netflix rule, and one EUR row awaiting FX backfill) for a disposable
user and screenshotted **every** dashboard page and **all six
Overview lenses**, cross-checking the rendered numbers against the
seed by hand.

- **Verified correct:** Mind map, Flow, Calendar (including
  timezone-correct day bucketing), Treemap, Cashflow (52% savings
  rate), Matrix (month × category totals), Budgets (ring + per-cat
  bars), Recurring (Netflix active + rent auto-detected as a
  pattern), Insights forecast math (projection = month-pace × days;
  delta vs 6-mo avg), Export totals, Settings (income + privacy
  toggles). **Ask Murmur answered a real question with the exact
  right figure** ("You spent $299.27 on groceries this month" —
  matches the seed to the cent) and persisted to history.
- **Bug found + fixed: per-row amounts rendered in the profile
  currency.** The seeded €45 Café de Flore row displayed as −$45.00.
  Fixed at every row-level surface: web transactions table, CSV
  Currency column, JSON export (now includes per-row `currency`),
  PDF export rows, mobile TransactionRow, transaction detail hero +
  undo toast, and the edit screens (web form label + mobile symbol).
  Aggregations were already correct (they sum the FX snapshot).
  Verified live: the row now renders **−€45.00**.
- **Noted, not changed (product calls):** the Recurring page's
  "potential savings" card happily suggests cancelling rent
  ($16,800/yr); the Flow lens labels the income column by the income
  transaction's category. Both worth a look eventually.

### Handoff — current state + remaining backlog (July 23, 2026)

**Everything is committed and pushed.** The backend is live and
consistent with the code. The reviews arc is closed except the
items below.

**Remaining backlog, in priority order:**
1. **User smoke runs** (owed from the P0 batches, still unverified
   on-device): credit-card receipt → `payment_method='credit_card'`;
   monthly paystub → `monthly` cadence; fresh onboarding → income
   txn shows its recurring rule; dedup query in PLAN returns zero
   rows.
2. **macOS code-signing + notarization** — interactive, ~30 min,
   steps documented in the Phase I part 2 section. Then Windows
   signing.
3. **Real Plus subscriptions** (IAP / RevenueCat) — interactive.
   The `plus_status` column + unified resolver make this a pure
   backend wire-up now.
4. **Apple SIWA on web login** (CROSS §1.1 CRITICAL) — needs the
   web-callback OAuth client registered in the user's Apple
   Developer account, so it's blocked on an interactive step.
5. **Web i18n** (CROSS §6.4) — web UI is hardcoded English while
   mobile ships 4 locales. Large but mechanical; `t()` +
   locale files already exist in shared.
6. **Visual smoke-test in build pipeline** — promised in the May
   sessions, still not built.
7. Remaining MEDIUM/LOW review items: desktop recurring-rule manual
   CRUD (§1.8), voice_language picker (§2.1), forgot-password flow,
   comma decimal input, offline-first recurring rules, PWA push.
8. Pre-launch infra: register `murmur.app` + real `support@` inbox,
   privacy policy/ToS pages, Sentry, store metadata, Phase G
   widgets.

**Supabase free-tier pause warning:** the project pauses after ~1
week of inactivity. If the app "stops working" after a break, check
project status first — restore takes one click (or ask Claude to
restore it via MCP).

### Distribution decision — TestFlight is the channel (Aug 7, 2026)

The user set the bar explicitly: the app is past prototype stage and
must be testable on their physical iPhone **via TestFlight**, updated
like any production beta. Standing decisions:

- **Ad-hoc / internal-distribution builds are dead.** The May-July
  `preview` profile route is not to be used for user-facing testing
  again. (Its debugging wasn't wasted — the monorepo install fixes
  and the entitlement strip apply to production builds identically.)
- **Bundle ID stays `com.voiceexpense.app`** — decision taken on the
  engineering side after the user delegated: invisible to users, the
  store listing name is "Murmur" regardless, and changing it would
  force redoing Apple Sign-In config for zero user-facing benefit.
  Locked permanently the moment the ASC app record is created.
- **Release pipeline**: `eas build --platform ios --profile
  production --auto-submit` → TestFlight. First run is interactive
  (Apple ID + 2FA, cert/profile defaults, ASC app creation + API
  key) — after that, fully non-interactive and Claude-runnable.
- EAS build debugging trail (three failures, all fixed in git):
  Electron binary download (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`),
  sharp compiling against the worker's global libvips
  (`SHARP_IGNORE_GLOBAL_LIBVIPS=1`), and the unused remote-push
  entitlement vs. profile capability
  (`plugins/withoutRemotePush.js`, registered FIRST because plugin
  mods wrap middleware-style and the delete must run after
  expo-notifications' add). Fetch EAS logs non-interactively via
  GraphQL `builds.byId.logFiles` with the `expo-session` header from
  `~/.expo/state.json`; log files are **brotli-compressed**.

### Committed requirement — remote push notifications (Aug 7, 2026)

The user has stated push notifications are a required future feature.
Current truth: the app is local-notifications-only (Day-2 reminder);
nothing is server-sent. When this feature is built:

1. Delete `apps/mobile/plugins/withoutRemotePush.js` and its entry in
   app.config.js (it strips the aps-environment entitlement).
2. EAS already holds (or will hold, if the user answered Yes at the
   push prompt) the APNs key; the App ID needs the Push capability
   synced + provisioning profile regenerated — happens on the next
   credential-managed build.
3. Build the actual feature: expo-notifications token registration on
   sign-in, store tokens per device (new table), a Supabase Edge
   Function sender (candidates: recurring-generated receipts, budget
   threshold alerts), and a Settings toggle honoring
   profiles.analytics-style opt-in.

### Brand decision — Coin & Wave (Aug 7, 2026)

The user adopted logo direction 04 "Coin & Wave" from the Claude
Design explorations (docs/money-app/project/Murmur Logos.html),
replacing The Listening Drop. Applied everywhere in commit 944f631:
mobile app icon / adaptive icon / splash / favicon (SVG sources +
regenerated PNGs), both MurmurMark components (same APIs), a NEW web
favicon (the web app had none), and the desktop icns/ico + reinstalled
/Applications/Murmur.app. The rebranded TestFlight build ships via the
now fully non-interactive pipeline (ascAppId pinned in eas.json).

### Environment separation + endpoint-override hardening (Aug 2026 — audit items 0.3/0.9)

Config hardening from the 2026-08-08 audit. Standing decisions:

- **One config tree.** `apps/mobile/` is the Expo project: the only
  `eas.json`, the only app config (`app.config.js`). The stale
  repo-root duplicates (`app.json`, `eas.json`, prebuilt
  `ios/`/`android/` trees) were deleted — they shared the same
  `projectId` + bundle ID and would have shipped a credential-less,
  differently-configured binary if a build was ever run from the
  root. Never re-create an Expo config outside `apps/mobile/`.
- **Env per EAS profile — standard Expo pattern.** The `production`
  profile is the ONLY place in the repo carrying production values
  (Supabase URL/anon key, Vercel API base), inline in its `env`
  block. `development`, `development-simulator` and `preview` declare
  `"environment": "development" | "preview"` and resolve their env
  from EAS Environment Variables (expo.dev dashboard). Those are
  EMPTY until a staging Supabase project + Vercel preview target
  exist — fill them with staging values there (or inline), never
  production's. Until then a `preview` build fails loudly at boot
  (missing env throws) instead of silently writing into production
  data. Local `expo start` reads `apps/mobile/.env` (template:
  `apps/mobile/.env.example`).
- **ATS exception removed** (see the April 2026 ATS section above —
  marked REMOVED). Production Info.plist has no
  `NSAllowsArbitraryLoads` key.
- **Developer → AI server URL is dev-only.** The Settings row and its
  modal render only when `__DEV__`; and `getApiUrl()` itself
  validates any stored override on read (HTTPS + compiled-in host
  allow-list in `apps/mobile/src/hooks/useApiUrl.ts`), so an
  override already persisted on a TestFlight device is ignored, not
  honored. In release builds `useApiUrl` also throws at import if
  `EXPO_PUBLIC_API_BASE_URL` is missing rather than falling back to
  `http://localhost:3000`.

### Audit fix 0.4 — no server secret on end users' machines (Aug 9, 2026)

The desktop `<userData>/.env` mechanism is gone. The old design
(entries of May 4–10 above, now superseded) had exactly one working
configuration: `SUPABASE_SERVICE_ROLE_KEY` + `OPENAI_API_KEY` in a
plaintext file at `~/Library/Application Support/Murmur/.env`, which
also carried the `MURMUR_DEV_PLUS=1` Plus unlock. Audit finding
06-F3 (Critical): that key bypasses RLS for the whole project.

New architecture in [apps/desktop/src/main.ts](../apps/desktop/src/main.ts):

- `loadEnvFile()` / `parseEnvFile()` deleted; the embedded Next
  server is forked with the plain process env only (UI needs no
  secret — Supabase browser creds are `NEXT_PUBLIC_*`, inlined at
  build time).
- The renderer now loads a local **gateway** origin
  (`http://127.0.0.1:<port>`): UI traffic is piped to the embedded
  Next standalone server; `/api/ai/*` is forwarded to the hosted
  Vercel deployment (`https://money-app-web-w6su.vercel.app`) — the
  same origin mobile uses via `EXPO_PUBLIC_API_BASE_URL`. AI keys
  and Supabase secrets stay server-side; the client's Supabase
  access token still travels in the `Authorization` header, and the
  hosted routes validate it.
- [apps/desktop/electron-builder.yml](../apps/desktop/electron-builder.yml)
  `extraResources` now excludes `**/.env*` so no env file can ever
  ship inside Resources.

Web-half companion changes under the same audit item, now also done:
[apps/web/src/lib/auth.ts](../apps/web/src/lib/auth.ts)'s `validateToken`
uses an anon-key client (`NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY`) instead of a service-role admin
client — `auth.getUser(token)` needs no elevated privilege.
[apps/web/src/lib/plus.server.ts](../apps/web/src/lib/plus.server.ts)'s
two env hatches (`MURMUR_DEV_PLUS=1`, `NODE_ENV !== 'production'`) are
deleted; `resolvePlusStatus` has exactly one source,
`profile.plus_status === 'active'`. The dead `packages/supabase`
package (a second service-role factory reachable from the mobile
dependency graph) is removed, along with its references in
`apps/mobile/package.json`, `tsconfig.json`, and `babel.config.js`.
`turbo.json`'s build `env` list no longer carries the now-unused
unprefixed `SUPABASE_URL`. The admin/bypass-RLS Supabase credential no
longer appears anywhere outside `supabase/functions/**`.

### Audit fix 0.6 — versioned local SQLite migrations (Aug 9, 2026)

Resolves audit 03-F3 / 06-F6: on the first launch after upgrading from
any pre-`67b3858` build, the old `migrateSchema()` added the three FX
columns and then rebuilt `transactions` from a hard-coded column list
that omitted them — every write for the rest of that session failed.
The sniff-on-every-launch design is gone, replaced in
[apps/mobile/src/services/sync/localDb.ts](../apps/mobile/src/services/sync/localDb.ts)
by two standing structures:

- **Canonical column manifest.** `TRANSACTION_COLUMNS` is the single
  source of truth for the local `transactions` schema. `initSchema`'s
  CREATE TABLE, the migration table-rebuild (which copies the
  *intersection* of manifest and live columns, named on both sides —
  never positional, never a literal list), and `upsertTransaction`'s
  INSERT list + bind values (typed `Record<TransactionColumnName, …>`,
  so a manifest addition that the store doesn't supply fails
  compilation) are all generated from it. A column can no longer exist
  in one of those places and not the others.
- **Numbered migration runner on `PRAGMA user_version`.**
  `MIGRATIONS[v]` migrates version v → v+1; each step runs exactly
  once, inside a transaction that also bumps `user_version`, so a
  failed step rolls back wholesale and retries next launch.
  `SCHEMA_VERSION = MIGRATIONS.length`. Fresh databases are built from
  the manifest and stamped current — the chain never replays against
  them. Step 0 (`consolidateLegacySchemaV1`) is the one deliberately
  guarded step: it absorbs every pre-versioning field state (pre-FX,
  post-defective-rebuild, hotfixed) — adds missing manifest columns,
  sweeps recurring duplicates, drops `payment_method`'s legacy
  `NOT NULL DEFAULT 'cash'` via manifest-driven rebuild, and builds the
  narrowed dedup index. **Adding a column now means: append to the
  manifest + append a MIGRATIONS step with the ALTER TABLE.**

`getDb()` became a promise-based singleton: concurrent first callers
await the same migration pass, and a failed open resets the promise
instead of handing out a handle whose migrations never ran.

Regression test (real `localDb.ts`/`transactionStore.ts` code driven
through a node:sqlite shim; no test framework exists in the repo yet —
adopt into the future harness as-is):
`node apps/mobile/scripts/localdb-migration-test.mjs` — legacy fixture
upgrade with row/column preservation asserted against the manifest,
defective-rebuild recovery, fresh-install stamping, dedup-sweep and
unique-index enforcement, and a same-session `upsertTransaction`
round-trip carrying FX values and a null `payment_method`.

*(Aug 9 2026 — adopted, as promised above: ported into
[apps/mobile/src/services/sync/__tests__/localDb.migration.test.ts](../apps/mobile/src/services/sync/__tests__/localDb.migration.test.ts)
under the vitest harness fix-plan item 1.1 added. The standalone
`.mjs` script is deleted — same fixtures, same assertions, now
`npm test` / `turbo test`. See "Test harness + lint scaffolding" below.)*

### Test harness + lint scaffolding (fix-plan item 1.1, Aug 9 2026)

Resolves `02-F27` and stands up the precondition every later fix-plan
item's "Regression test" line depends on: before this, `grep vitest|jest`
across the workspace was empty and `turbo.json` declared no `test` task.

- **Runner:** vitest, one config per package/app that owns tests today
  (`packages/ai`, `packages/shared`, `apps/mobile`) plus a scaffold-only
  config for `apps/web` (`passWithNoTests`, since Stage 1.1 builds the
  harness — it doesn't do the broad adoption sweep that's Stage 2).
  `npm test` at the repo root runs `turbo test`, which fans out to each
  package's own `test` script; `turbo.json` gained a `test` task.
- **Ported:** `packages/ai/src/__tests__/askMurmur.verify.ts` →
  `askMurmur.test.ts` (same 29 assertions, `describe`/`it`/`expect`
  instead of a hand-rolled checker). `apps/mobile/scripts/
  localdb-migration-test.mjs` → `apps/mobile/src/services/sync/__tests__/
  localDb.migration.test.ts` (same fixtures; `describe.skipIf` guards the
  `node:sqlite` dependency so `npm test` stays green on any Node
  satisfying the repo's `>=20` floor, while the CI `test` job pins Node
  22 so the suite actually runs there).
- **Golden corpus:** `packages/ai/src/__tests__/goldenCorpus/` — 60
  utterances (en/fr/es/pt) with expected `direction`/`amount`/
  `is_recurring_suggestion`, replayed through the real `parseExpense()`
  with `fetch` mocked to a per-row recorded/simulated model response
  (`corpus.ts`'s `rawResponse`). Two headline rows pin fixes already at
  HEAD (`02-F1`'s direction worked-example, `02-F7`'s `note` field); two
  more (`02-F5`'s divide-by-100 heuristic, `02-F30`'s recurring
  lean-TRUE clause) are still open and encoded with vitest's
  `test.fails` — the suite is green today, and the moment either prompt
  bug is actually fixed, `test.fails` itself starts failing until the
  row is flipped to a normal assertion. `02-F3` and `02-F9` (the other
  two of the four user-reported parse bugs) live in mobile UI code the
  corpus can't exercise from `packages/ai`; they're `it.todo` markers
  in `goldenCorpus.test.ts` instead of corpus rows, with a comment
  explaining why. `liveVerify.ts` calls the real model
  (`OPENAI_API_KEY`-gated, not part of `turbo test`) and diffs against
  the checked-in fixtures — `npm run golden:verify-live -w
  @voice-expense/ai`.
- **Lint scaffolding:** new root `eslint.config.mjs` (flat config,
  ESLint had zero config anywhere before this). Every audit-tracking
  `no-restricted-syntax` rule (multi-arg `Date`, raw `getMonth`/etc.
  outside `period.ts`, `.toISOString().slice(0,10)`, a bare `.amount`
  inside a reduce/`+=` in `apps/**`, `Date` in a `'use client'` prop
  type, `paddingBottom >= 100`, a string literal as `<Text>` children)
  ships at severity `'off'` — validated by temporarily flipping each to
  `'warn'` and confirming real hits across the codebase (280 of them),
  then reverted. They turn on one at a time as the fix-plan item that
  owns the primitive lands (1.3, 1.4, 1.8, 2.4, Stage 4) — flipping one
  early means it fails on every call site that item hasn't replaced
  yet. `turbo lint` is wired for real now (`eslint .` added to
  `packages/ai`, `packages/shared`, `apps/mobile`, `apps/web`) and is
  clean today (0 errors — only pre-existing `eslint-disable` comments
  for plugins that are now registered but not enabled, which is
  expected).
- **Also added:** `knip.json` + `npm run knip`, wired into a new CI
  step as report-only (`continue-on-error: true` — ~60 pre-existing
  unreferenced-export/file/dependency findings are a separate cleanup,
  not this item's job). A hand-rolled duplicate-JSON-key parser
  (`packages/shared/src/i18n/localeIntegrity.ts`) checked against all
  four locale files — it caught a real, live bug while being built:
  `"detail.recurring"` was duplicated (same value both times, so
  behaviorally inert, but exactly the kind of key that goes stale
  silently) in `en.json`/`fr.json`/`es.json`/`pt.json`; the stray
  duplicate is removed in all four.
- **CI:** `.github/workflows/ci.yml` gained a `test` job (Node 22, `npx
  turbo test` + the knip report step) and an `eslint` job (Node 20, `npx
  turbo lint`) alongside the existing `typecheck` and `lint` (Prettier)
  jobs.

`turbo test` / `npm test` run green: 4 test files across 3 packages
(`apps/web` has the scaffold but no tests yet), 103 tests total — 99
passing, 2 `test.fails` intentionally-failing-until-fixed (F5, F30), 2
`it.todo` (F3, F9).

### One money and aggregation module (fix-plan item 1.4, Aug 9 2026)

Resolves `05-F2`, `05-F12`, `05-F29`, `05-F32`, `07-F8`, `07-F28`,
`07-F29`, `07-F30`, `06-F34`, `08-F13`, `02-F17` — the *foundation*
half only. This item builds and tests the module; wiring the ~25
inline call sites (Overview header, MindMap, Treemap, Cashflow,
Insights, Budgets, Export, Ask Murmur) onto it is the Stage 2 adoption
sweep and has not happened yet — those surfaces still compute their
own "spend"/"saved" inline today.

- **New `packages/shared/src/domain/money.ts`** — one `summarize(txns,
  window?)` returning `{ income, expense, transfers, saved, net,
  transactionCount, pendingCount, byCategory }`. `expense` excludes
  transfers; `saved` is unfloored with the sign rendered explicitly
  (the audit found six divergent "saved" formulas across five live
  surfaces plus dead code — `max(0, in−out)` in three places, raw
  `income−expense` in a fourth, a savings-rate variant in a fifth, a
  sixth in dead code; all six collapse to this one number). `net` is
  exported as the *same value* as `saved`, not a second formula —
  Overview called this figure "saved" and MindMap called it "net";
  rather than pick a winner and force every call site to rename during
  Stage 2 adoption, both keys carry the identical number. `byCategory`
  is the **full** per-category map, never truncated — truncating and
  then labelling a sum over the truncated set "Total" was `05-F36`
  (mobile Insights) and `05-F37` (web Matrix); truncation is now
  provably a rendering decision, since `Object.values(byCategory)`
  always has the complete set.
- **The transfer/Savings & Investing classification rule:**
  `classifyFlow(txn, categoryKind?)` — a `'transfer'` category kind
  overrides `direction`, so a Savings & Investing debit is neither
  income nor consumption. The FIX-PLAN's own migration for
  `categories.kind` (a real DB column + category-editor field) is
  Stage 2 work and out of this item's file ownership, so
  `resolveCategoryKind(categoryName, explicitKind?)` provides the
  bridge today: an explicit kind wins when a caller has one (forward
  compatible with the eventual column), otherwise falls back to
  `DEFAULT_TRANSFER_CATEGORY_NAMES` (currently just `'Savings &
  Investing'`, matching `default_categories` row 18). Once the
  migration lands, callers that join `category_kind` in get the real
  answer for free; callers that don't yet still get the one seeded
  transfer category classified correctly.
- **FX-pending is never silent:** `aggAmount`'s bare `?? 0` is why a
  transaction awaiting FX backfill vanished from every total with no
  signal (`07-F8`/`06-F34`/`05-F12` — `isFxPending` existed with zero
  callers). `summarize()` now excludes pending rows from every
  monetary field and returns `pendingCount` instead of folding them in
  as 0. `packages/shared/src/utils/fx.ts` gained
  `sumInProfileCurrency(txns) → { total, pendingCount }` as the
  pending-aware replacement for a hand-rolled `reduce(aggAmount)` at
  call sites that only need a flat total (no flow/category split).
  `aggAmount`/`isFxPending` themselves are unchanged (both are still
  imported at ~14 and 0 call sites respectively) but now carry
  `@deprecated` pointers to the new module.
- **One formatter, locale required:**
  `packages/shared/src/utils/currency.ts` gained `formatMoney(value,
  currencyCode, locale, {precision})` and `formatMoneyParts(value,
  currencyCode, locale)` (structural parts — sign/symbol/
  symbolFirst/integer/decimal/fraction — built on
  `Intl.NumberFormat(...).formatToParts()`, so symbol placement follows
  the locale rather than a hand-rolled table like `07-F29`'s
  second, shorter currency-symbol switch in
  `apps/mobile/app/(tabs)/index.tsx`). `locale` has no default —
  `formatCurrency`'s old `locale: string = 'en'` silently formatted
  eleven non-English call sites in English grouping (`07-F30`);
  `formatCurrency` itself is kept as a thin `@deprecated` wrapper
  delegating to `formatMoney(v, c, 'en')` so the six call sites Stage 2
  hasn't migrated yet keep compiling — it was **not** given a required
  `locale` parameter in this item, because doing so would be a breaking
  change at call sites outside this item's file ownership (screens are
  Stage 2's job). `formatAmount` (zero callers, confirmed by grep) is
  deleted outright. `roundCents(n)` rounds half-away-from-zero — not
  plain `Math.round`, which rounds negative halves toward +Infinity
  (`Math.round(-0.5) === -0`) rather than away from zero like
  `toFixed`/`Intl` do (`05-F32`).
- **Integer-cents internally:** `summarize()` accumulates every bucket
  (income/expense/transfers/per-category) in `Math.round(amount * 100)`
  integer cents and divides back once at the end, so a long series of
  2-decimal amounts cannot drift off a float rounding boundary; every
  returned figure is additionally passed through `roundCents()` as a
  boundary backstop.
- **Not touched at the time this section was written (Stage 2):** the
  `categories.kind` migration and category-editor field; the ~25
  consumer call sites listed in the fix-plan item text
  (`dashboard/page.tsx`, the six `lenses/*`,
  `useBudget`/`useTransactions`/`useRecurringRules`,
  `HistoryHeatmap.tsx`, `exportData.ts`, `askMurmurTools.ts`); the
  `Money.tsx` component rewrite on both platforms (`07-F28`). The
  `categories.kind` migration and the four item-named surfaces
  (Overview header, MindMap, Treemap, Cashflow) landed in the adoption
  pass below.

**Tests** (`packages/shared/src/domain/__tests__/money.test.ts`,
`packages/shared/src/utils/__tests__/{currency,fx}.test.ts`, 44 new
vitest cases, all green): the audit's pinned scenario — Starbucks −50 +
Xtream −42 + Schwab −300 (Savings & Investing) ⇒ `expense=92` (not
392), `transfers=300`; the FIX-PLAN's done-when fixture (credit 1000 +
debit 100 Food + debit 300 Savings & Investing ⇒
`expense=100, transfers=300, saved=900, net=900`); a null
`amount_in_profile_currency` row excluded from every total with
`pendingCount===1`; `byCategory` full-map + no-truncation + sums to
`expense` exactly; half-open window bounds
(`[start, endExclusive)`); a 1000-row integer-cents drift check;
`roundCents`'s negative-half-cent asymmetry fix (using `0.125`, which
is exactly representable in IEEE-754 double, rather than a "natural"
literal like `1.005`, which the audit itself flagged as not exactly
representable and therefore unreliable as a rounding-mode fixture).
Run with `npx vitest run` from `packages/shared`, or `turbo test
--filter=@voice-expense/shared`.

### One money and aggregation module — adoption at the item-named surfaces (fix-plan item 1.4, Aug 9 2026)

Closes the gap the section above left open: `summarize()`/`classifyFlow()`/
`isSpend()` existed but had zero callers at the four surfaces the item
names (Overview header, MindMap, Treemap, Cashflow), and
`categories.kind` was a forward-declared type with no column behind
it.

- **New migration `022_category_kind.sql`** — `categories.kind text
  NOT NULL DEFAULT 'spend' CHECK (kind IN ('spend','income','transfer'))`,
  same on `default_categories`, with `'Savings & Investing'` set to
  `'transfer'` on both tables (the literals match `CategoryKind` in
  `money.ts` exactly, by construction). `database.types.ts` and
  `packages/shared/src/types/category.ts` updated to carry the new
  column through. **Known gap, out of this item's file ownership:**
  `apps/mobile/src/services/seedCategories.ts` (the sign-up seeding
  path) selects `name, color, icon` from `default_categories` and does
  not copy `kind` — a newly-onboarded user's "Savings & Investing"
  category is created with the column default (`'spend'`) until that
  file is updated to select and insert it too. Not a regression (no
  code read `kind` before this item), but it means the DB fix alone
  does not reach new users without that follow-up.
- **Root cause of the production defect** (verified against
  `docs/audit-2026-08-08/05-money-math-and-forecasts.md` finding
  `05-F2`, the audit's own pinned scenario): `MindMap.tsx:56-58`
  computed `incomeTotal`/`expenseTotal` as `Σ aggAmount()` split purely
  by `direction`, with no concept of a transfer. The $300 Schwab debit
  (`category='Savings & Investing'`) landed in `expenseTotal` exactly
  like the Starbucks $50 and Xtream $42 debits — turning the true $92
  spend figure into $392 — while the adjacent "Saved & invested" branch
  computed `max(0, income − expense)` (`MindMap.tsx:58`), a residual
  with **zero connection** to the Savings & Investing rows, so it
  showed $0 instead of the $300 that actually moved to savings. Fixed
  by classifying every transaction through `classifyFlow()`/`isSpend()`
  off `categories.kind`: a transfer-kind transaction is now excluded
  from the Expenses grouping entirely, and its total
  (`summary.transfers`) populates the Saved & invested branch and its
  own category/merchant breakdown instead — so Expenses now totals $92
  (Starbucks + Xtream) and Saved & invested totals $300 (Schwab), on
  the same page load, matching the regression fixture already checked
  into `money.test.ts`.
- **`apps/web/src/components/lenses/types.ts`** — added `monthTxns(p)`
  (both directions, month-bounded), `toSummarizable(t)`, and
  `monthSummary(p) = summarize(monthTxns(p).map(toSummarizable))`: the
  one call every lens and the Overview header now make, so
  income/expense/transfers/saved can't diverge between surfaces.
  `groupByCategory` no longer folds an FX-pending row in as `(amt ?? 0)`
  (the `types.ts:103` silent-zero this item's file-ownership list
  named directly) — it skips pending rows via `isFxPending`, same rule
  `summarize()` uses internally. `LensTxn` gained `category_kind`,
  `LensCategory` gained `kind`, both threaded from the DB column in
  `dashboard/page.tsx` rather than relying solely on the name-fallback
  in `resolveCategoryKind`.
- **`dashboard/page.tsx`** — the KPI line's `monthIn`/`monthOut`/`saved`
  now come from `monthSummary(lensProps)` instead of a hand-rolled
  `aggAmount` loop; `saved` is rendered unfloored (`Intl` already
  prefixes the sign, so no separate clamp), and a "N transactions
  awaiting conversion" line appears under the KPI row when
  `pendingCount > 0`.
- **`MindMap.tsx`** — `buildBranches` now splits by `classifyFlow`
  instead of raw `direction`: `spendDebits` (Expenses),
  `incomeCredits` (Income) and `transferTxns` (Saved & invested) are
  three disjoint sets. The "Saved & invested" branch's total is
  `summary.transfers` (falling back to the unfloored `saved` only when
  there were no transfer-kind transactions this month) with its own
  category/merchant leaf breakdown (`categorySubs`, factored out of the
  old expense-only merchant loop so both branches share it); a
  secondary "Net saved" sub-node keeps the old income-minus-expense
  figure visible with its sign shown explicitly rather than hidden
  behind a `> 0` gate. The centre node's "net" is `monthSummary().saved`.
- **`Treemap.tsx`** — the top grid's cells and `expenseTotal` now come
  from `spendDebits` (transfer-kind excluded), and the bottom "Saved &
  invested" band is `summary.transfers` — a real, category-attributable
  figure — replacing the disconnected `max(0, income − expense)`
  residual. "Total flow" (`expenseTotal + saved`) is now `expense +
  transfers`, cash that actually left checking either as spend or as a
  transfer, rather than a hybrid of spend and an unrelated leftover
  number.
- **`Cashflow.tsx`** — the daily balance line still sums every credit
  and debit (transfers included — money physically leaves the checking
  balance either way, so the chart shape is deliberately unchanged);
  the Income/Expenses/Net *stats* panel now reads `monthSummary(props)`
  so its numbers match the other three surfaces, and a "Saved &
  invested" stat row appears when `transfersTotal > 0` so a transfer
  is never simply absent from the summary (fix-plan invariant: no
  screen prints "$0 saved" beside a real transfer).
- **`supabase/functions/fx-backfill/index.ts`** (new) + migration
  `023_fx_backfill_cron.sql` — the FX backfill sweep
  (`apps/mobile/src/services/fxBackfill.ts`) only ran on mobile app
  launch, so a web-only user's foreign-currency historical rows stayed
  NULL forever and were silently excluded from every total with no
  client ever running to fix it. The new function sweeps
  `idx_txn_needs_fx_backfill` (migration 011) server-side across all
  users, batched at 200 rows/tick, scheduled every 15 minutes via the
  same Vault-secret cron pattern migration 015 established
  (`fx_backfill_key`, provisioned out of band — never committed). Repo
  artifact only; the orchestrator deploys the function and provisions
  the secret.
- **Deliberately not touched (still Stage 2), confirmed by this item's
  file-ownership boundary:** `insights/page.tsx`, `budgets/page.tsx`,
  `export/page.tsx`; `Flow.tsx`, `Calendar.tsx`, `Matrix.tsx` (the
  other three lenses — `groupByCategory`'s fix benefits them for free,
  but their `aggAmount`/direction-only totals are untouched); the
  mobile hooks/screens and `askMurmurTools.ts` the fix-plan item text
  also lists; the category-editor UI field for `kind`.

### Mobile presentation primitives (fix-plan item 1.8, Aug 9 2026)

Resolves `01-F5`, `01-F12`, `01-F13`, `01-F14`, `01-F15`, `01-F16`,
`01-F18`, `01-F24`, `01-F26`, `01-F31`, `01-F33`, `01-F37` — the
*foundation* half only, per the fix-plan's own item text: build the
primitives, wire the two places already coupled to them
(`app/_layout.tsx`'s splash gate and `app/(tabs)/_layout.tsx`'s own
geometry), and fix the one regression the primitive change itself
would otherwise have caused (`UndoSnackbar`). Adopting the primitives
at the other ~25 remaining call sites (14 clearance sites, 8 Modals,
CategoryPicker, the settings pickers, VoiceConfirmModal, the record
More-options sheet, IncomeEditorModal, the Insights month picker) is
Stage 2 — tracked as item 2.14, which depends on this one.

- **Fonts are now real.** `apps/mobile/assets/fonts/` gained five OFL
  files — Plus Jakarta Sans Regular/SemiBold/Bold from
  `tokotype/PlusJakartaSans` (the font's actual source repo; the
  fix-plan text pointed at `googlefonts/PlusJakartaSans`, which
  doesn't exist) and DM Mono Regular/Medium from `google/fonts`'
  mirror. **DM Mono ships no Bold weight upstream** — Medium is
  registered under the `DMMonoBold` key as the closest available
  weight for the one consumer (`Text.amountChip`); it is not a true
  bold. `app/_layout.tsx` calls `useFonts()` with a key map matching
  `Typography.fontFamily`'s values exactly, and the splash-hide gate
  (`ready`) now additionally waits on `fontsLoaded || fontError` — a
  font load failure resolves to the system-font fallback rather than
  an infinite splash. Six styles that named a bold/semibold family
  with no `fontWeight` (the audit's named casualties: `typography.ts`
  `h1`/`navTitle`, `VoiceConfirmModal.tsx` `title` +
  `saveButtonText`, `CategoryPicker.tsx` `modalTitle`, `record.tsx`
  and `edit.tsx`'s `label`) now pair `fontWeight` alongside
  `fontFamily` so they survive any fallback. Verified by grep that
  all 307 `fontFamily:` rules in `apps/mobile` trace back to
  `Typography.fontFamily.*` — none is a stray literal. **Not
  verified:** whether `'New York'` actually resolves for serif money
  amounts on a physical iOS device — the fix-plan asked for an
  on-device check this environment can't perform; the `Platform.select`
  fallback to `'serif'` is correct either way. `app.config.js` was
  evaluated and deliberately left unchanged — `expo-font`'s config
  plugin does native static-linking under the font's *own* PostScript
  name, which for Plus Jakarta Sans's Regular weight is
  `PlusJakartaSans-Regular`, not the bare `PlusJakartaSans` key this
  codebase's `Typography.fontFamily.sans` already uses everywhere;
  adding the plugin would register a second, unreferenced face rather
  than fix anything, since `useFonts()`'s JS-side keys are already
  decoupled from the file's internal name.
- **New `src/theme/chrome.ts`** — `TAB_BAR_HEIGHT` (68),
  `TAB_BAR_BOTTOM_OFFSET` (8), and `useTabBarClearance()` = height +
  offset + `insets.bottom`, replacing what were three independent
  copies of the tab bar's geometry (`_layout.tsx`'s own style, and the
  14 clearance sites `01-F13` enumerates). Wired at the two sites this
  item owns: `app/(tabs)/_layout.tsx` now reads
  `useSafeAreaInsets()` and builds `tabBarStyle` as
  `[styles.tabBar, { bottom: insets.bottom + TAB_BAR_BOTTOM_OFFSET }]`
  instead of the constant `bottom: 14` (`01-F12`) — the bar's own
  `height: 68` also became `minHeight: 68` so its 10pt label doesn't
  clip at large Dynamic Type scales (`01-F24`, the one of the audit's
  eight fixed-height sites this item owns). **This is a load-bearing
  change for `UndoSnackbar`**, which independently hard-coded
  `bottom: 14 + 68 + Spacing.sm` (`01-F33`) — once the tab bar's real
  bottom offset became inset-aware, that hard-coded copy would have
  sat *behind* the tab bar on every Face-ID iPhone (bar's new top edge
  at `insets.bottom + 76pt` vs. the snackbar's stale `90pt`, i.e.
  overlapping by ~20pt on a 34pt-inset device). Fixed by switching
  `UndoSnackbar` to `useTabBarClearance() + Spacing.sm`, the direct
  analog of the old formula. The remaining 13 clearance sites and the
  "no tab bar present → `insets.bottom + 24`" fallback are Stage 2.
- **New `src/components/BottomSheet.tsx`** — the one bottom-sheet
  primitive: backdrop, handle, header (Cancel / title / right slot),
  `flexShrink: 1` scroll body, optional pinned footer,
  `useSafeAreaInsets().bottom` padding, and `onRequestClose` wired to
  the same `onClose` as the backdrop press and header Cancel so the
  three routes can't diverge (`01-F14`, `01-F18`). Keyboard handling
  measures the sheet's real on-screen frame via `measureInWindow()` on
  every `keyboardWillChangeFrame` (iOS) / `keyboardDidShow` (Android)
  and translates the sheet up by the overlap, rather than nesting a
  `KeyboardAvoidingView` inside the sheet — RN's KAV computes its lift
  from a *parent-relative* `onLayout` frame against a *screen-space*
  keyboard frame, so one mounted at sheet depth under-lifts by the
  sheet's own top offset (`01-F37`). Not yet adopted anywhere — the
  four existing sheets (`VoiceConfirmModal`, the record More-options
  sheet, `IncomeEditorModal`, the Insights month picker) and the eight
  bare `<Modal>`s (`01-F14`), `CategoryPicker` (`01-F15`) and the
  settings pickers (`01-F16`) still have their own implementations;
  moving them onto this component is item 2.14, which depends on this
  item finishing first.
- **New `src/components/NumericAccessory.tsx`** — a shared iOS
  `InputAccessoryView` Done bar keyed by `NUMERIC_ACCESSORY_ID`, for
  the "decimal pad has no dismiss key" class. Not yet referenced by
  any numeric `TextInput` — adoption is Stage 2.
- **New `src/components/ScaledText.tsx`** — `ScaledText` /
  `ScaledTextInput`, thin wrappers defaulting
  `maxFontSizeMultiplier={1.4}` (`01-F24`). **Not** implemented as
  `Text.defaultProps.maxFontSizeMultiplier` as the fix-plan text
  suggested: RN 0.81's `Text`/`TextInput` are React 19 function
  components declared with the new `component` type syntax and accept
  `ref` as a plain prop rather than being `forwardRef`-wrapped, and
  React 19 dropped `defaultProps` support for function components
  entirely — setting it compiles but is silently a no-op at render
  time in this stack (verified against the installed
  `react-native/Libraries/Text/Text.js`). Adopting the wrappers —
  swapping `import { Text } from 'react-native'` app-wide — is Stage 2.
- **`apps/mobile/src/theme/assets.d.ts`** (new) — ambient
  `declare module '*.ttf'`/`'*.otf'` so `tsc --noEmit` resolves the
  `require()` calls `useFonts()` needs; there was no precedent for a
  binary asset `require()` anywhere in this TS codebase before.
- **Not touched (Stage 2 — item 2.14, depends on this item):** the 13
  remaining tab-bar clearance sites and the tab-less-screen fallback;
  the 8 bare `<Modal>`s' `onRequestClose`; `CategoryPicker`'s keyboard
  coverage; the settings pickers' scroll containers; all four sheets'
  migration onto `<BottomSheet>`; `NumericAccessory`/`ScaledText`
  adoption at any call site; the touch-target fixes in
  `SettingsList`/`RecurringPatternBanner`/`record.tsx` (`01-F26`); the
  `SafeAreaView` `edges` convention across 20 screens (`01-F31`).
  `apps/mobile/src/components/Money.tsx` was deliberately left
  unchanged — its font references were already correct, and the
  `sign`→`currencyCode`/`locale` API break onto 1.4's
  `formatMoneyParts` is item 2.6's explicit ownership (`Depends on:
  1.4, 1.8`), not this one's.
- **Lint scaffold:** `eslint.config.mjs`'s `MOBILE_PRESENTATION_
  RESTRICTIONS` (added by item 1.1) stays `'off'` — its single
  severity switch covers both the `paddingBottom >= 100` selector
  (needs the Stage 2 sweep this item didn't do) and the Stage 4
  `<Text>`-literal selector, and flat-config merges `no-restricted-
  syntax` by rule key, not by selector, so the two can't be flipped
  independently without giving one its own rule name.

**Tests**
(`apps/mobile/src/theme/__tests__/typography.fonts.test.ts`, 14 new
vitest cases): walks `typography.ts`'s `fontFamily` map and
`_layout.tsx`'s `FONT_MAP` as source text (importing either directly
pulls in Flow syntax from `react-native` or a binary `.ttf` `require`,
neither of which survives a plain Node import — see
`vitest.config.mts`'s node-only scope) and asserts every declared face
is registered, every registered file exists on disk, and there are no
orphaned registrations; mutation-tested by temporarily renaming a
`FONT_MAP` key and confirming the suite fails. Run with `npx vitest
run` from `apps/mobile`, or `turbo test --filter=@voice-expense/mobile`.

### One recurrence engine (fix-plan item 1.5, Aug 9 2026)

Resolves `04-F2`, `04-F3`, `04-F20`, `04-F21`, `03-F8`, `03-F15`,
`03-F16`, `03-F23`, `03-F32`, `06-F22`, `07-F22`. "Next occurrence" was
implemented three times — the mobile hook, the web Recurring page, the
`generate-recurring` Edge Function — all mutating a `Date` with
`setMonth`/`setDate`/`setFullYear`, which overflows instead of
clamping at month ends (a rule anchored on the 31st permanently
drifted to the 3rd after the first February) and runs each writer's
arithmetic in whatever zone its runtime happens to be in, so the same
rule resolves to different UTC instants on mobile vs. the cron and both
insert past the UTC-day dedup index.

- **New `packages/shared/src/domain/recurrence.ts`** — the one
  implementation. `nextOccurrence(rule, afterInstant, tz)` builds the
  target as a zoned civil date (via `packages/shared/src/utils/
  period.ts`, gaining three small additive exports for this:
  `addDays`, `daysBetween`, `civilDateTimeToInstant`) and converts to
  an instant exactly once; the day-of-month clamp always uses the
  rule's resolved `anchor_day`, never a previously *emitted*
  occurrence's day, which is what lets a 31st-anchored rule clamp to
  the 28th in February and *return* to the 31st in March rather than
  drifting to the 3rd forever. `afterInstant === null` returns
  `starts_at` unchanged (`03-F32` — `starts_at` **is** the first
  occurrence) rather than `starts_at + one interval`. Also exports
  `firstOccurrenceOnOrAfter` (closed-form, not an iterate-from-`starts_at`
  scan — incidentally also fixes `03-F25`, not in this item's resolves
  list, for free), `occurrencesInWindow`, `occurrencesDue` (the bounded
  catch-up loop `03-F15` asked for — the Edge Function generated at
  most one occurrence per rule per run before this), `chargesInWindow`
  (rule+occurrence pairs across multiple rules, flattened/sorted), and
  `monthlyEquivalent`/`annualEquivalent` (`03-F23` — honours `interval`,
  which the date math always did and the three cost normalizers never
  did).
- **New `packages/shared/src/domain/recurringPatternDetector.ts`** —
  merges the mobile/web copy-paste pair (the web file's own header
  admitted the drift: *"If the mobile detector is updated, copy the
  change over here"*). **Cadence inference changed**, not just
  relocated: the old bucketing had an open-ended top band (`>95 days ⇒
  "likely yearly"`), so two charges six months apart (~182 days) were
  reported as yearly — a real cadence (semiannual) this app has no
  frequency for, misreported as a different one. Cadence bands are now
  tolerance windows around each canonical cadence (7/14/~30/~91/~365
  days); a gap that lands in a gap *between* bands (which a ~182-day
  gap does) returns `null` and the candidate is dropped rather than
  mislabeled. `apps/mobile/src/services/recurringPatternDetector.ts`
  and `apps/web/src/lib/recurringPatternDetector.ts` are now one-line
  re-exports.
- **Migration `020_recurrence_anchors.sql`** (numbered around item
  1.6's already-landed `018_sync_contract.sql`/
  `019_realtime_publication.sql` — not applied to production, repo-only
  per this stage's rule). Adds `recurring_rules.anchor_day` /
  `anchor_weekday` / `anchor_time` (nullable — no write path populates
  them yet; the engine derives them from `starts_at` when absent, so a
  `NOT NULL` constraint would only reject un-adopted inserts, not make
  them more precise) and `transactions.occurrence_date` (also nullable,
  same reasoning), then re-keys `idx_txn_recurring_dedup` off
  `occurrence_date` instead of `(transacted_at AT TIME ZONE
  'UTC')::date`.
- **Adopted at:** `apps/mobile/src/hooks/useRecurringRules.ts`
  (`computeNextOccurrence`/`computeUpcomingRecurring` now delegate to
  the engine; kept their exact existing signatures so the five
  unowned call sites — `recurringCatchUp.ts`, `app/recurring.tsx`,
  `app/transaction/[id].tsx`, `app/(tabs)/{index,budgets}.tsx` — keep
  compiling unmodified, falling back to the device zone via
  `expo-localization` when no `tz` is passed); `apps/web/src/app/
  dashboard/recurring/page.tsx` (`nextOccurrence`/`chargesIn30Days` now
  take an explicit `tz`, resolved from the browser's own
  `Intl.DateTimeFormat().resolvedOptions().timeZone` rather than
  `profile.timezone` — nothing writes that column from web yet, item
  1.3's device-zone capture landed mobile-only so far, so it would read
  the schema default `'UTC'` for nearly every user); `supabase/
  functions/generate-recurring/index.ts` (now loops `occurrencesDue`
  per rule instead of generating one occurrence per run, resolves each
  user's `profiles.timezone`, and writes `occurrence_date` on every
  inserted row — **deploy-order dependency documented in the function's
  own header**: redeploying it before migration 020 is applied is a
  full outage of daily generation, not a degraded one); `apps/mobile/
  src/services/sync/{localDb.ts,transactionStore.ts}` (new
  `occurrence_date` local column + migration step `addOccurrenceDateColumnV3`,
  `idx_txn_recurring_dedup` re-keyed to match the server index shape;
  `upsertTransaction` derives `occurrence_date` from
  `transacted_at.slice(0,10)` when the caller doesn't supply it — same
  value the old index used, so this is a schema-shape change, not a
  behaviour change, until `recurringCatchUp.ts` adopts the engine's real
  `occurrenceDate` in Stage 2).
- **Deliberately not adopted:** the `last_generated: new Date().toISOString()`
  write at `useRecurringRules.ts`'s `createRule` (the accept-detected-
  pattern path) is **not** removed even though the engine now correctly
  supports `last_generated: null`. That call site always carries a real
  `template_txn_id` — an already-logged transaction — so setting
  `last_generated: null` would make `starts_at` (= now) immediately due
  and the next catch-up run would generate a *second* transaction for
  today on top of the one the pattern was detected from (`03-F12`'s
  back-generated-duplicate hazard). `03-F12`'s guard is a different,
  not-yet-landed item; a comment at the call site explains the
  dependency. `apps/mobile/src/services/recurringCatchUp.ts`,
  `app/recurring.tsx`, `app/transaction/[id].tsx`, `app/(tabs)/
  {index,budgets}.tsx` are unmodified (not this item's listed adoption
  surfaces — Stage 2).
- **Deno vendoring:** no import map exists for `supabase/functions/`, so
  `supabase/functions/_shared/recurrence.ts` is a marked
  `REGENERATED-FROM` port of the subset `generate-recurring` needs
  (`nextOccurrence`, `occurrencesDue`, and the civil-date primitives
  they're built on) rather than a live import — per the fix-plan item's
  own text, which anticipates this.

**Known pre-existing failure, not from this item — RESOLVED by 1.6
(Aug 9 2026, same day, later pass):** this section originally reported
`npx turbo test` failing 3 mobile tests (`localDb.migration.test.ts`
x2, `localDb.syncContract.test.ts` x1) with `no such column: status`,
traced to `initSchema()` unconditionally re-running the `sync_queue`
`CREATE TABLE IF NOT EXISTS` + a `status`-referencing index against a
pre-existing database before that database's migration chain had added
the column. Item 1.6's own landed fix: `initSchema()`'s SQL no longer
builds `idx_queue_status_id` unconditionally — a fresh install gets it
from `initDatabase()` (right after `initSchema()`, on the `fresh`
branch), an upgrading install gets it from `addSyncContractV2()` (the
v1→v2 migration step, alongside the `status`/`next_attempt_at`
columns themselves), and `initSchema()`'s own copy is gone. All three
previously-failing tests, and the full mobile suite, are green as of
1.6 landing — see that item's own section below for the actual fix and
its regression coverage.

**Tests** (`packages/shared/src/domain/__tests__/{recurrence,
recurringPatternDetector}.test.ts`, 29 new vitest cases): the
audit-pinned Jan-31-monthly walk (Feb 28 → Mar 31 → Apr 30, never Mar
3) both as a 4-step and a 6-step sequence; quarterly and leap-year
yearly clamping; `interval > 1` honoured in the date math; `starts_at`
as first occurrence; a weekly DST-crossing rule keeping local 09:00 on
both sides of the March 2026 spring-forward while the UTC instant
shifts; a same-rule-different-`tz`-parameter determinism check *and* a
`process.env.TZ` independence check (the architecture no longer reads
the ambient runtime zone at all, so both had to be re-thought against
what F2's fix actually changed rather than reusing its literal "TZ=UTC
vs TZ=America/Chicago" framing, which described the old bug's
symptom, not the new contract); weekly stepping across a month
boundary; the local-vs-UTC-day dedup-window asymmetry from both
directions (`Asia/Tokyo`, no DST, isolates the day-boundary effect);
`occurrencesDue` bounded catch-up (six months behind ⇒ six
occurrences in one call, plus a `limit` respected); `firstOccurrenceOnOrAfter`/
`occurrencesInWindow` fast-forwarding a >1-year-overdue daily rule
straight to a 30-day window; `chargesInWindow` sort/flatten;
`monthlyEquivalent`/`annualEquivalent` honouring `interval`; and the
detector's cadence-consistency fix — a ~181-day gap yields zero
candidates (not "likely yearly"), while genuine monthly/quarterly/yearly
gaps still resolve correctly and a ~60-day ("bimonthly") gap also drops
rather than mislabels. Run with `npx vitest run` from `packages/shared`,
or `turbo test --filter=@voice-expense/shared`.

### An outbox that can report failure, and an entity-complete offline layer (fix-plan item 1.6, Aug 9 2026)

Resolves `07-F4`, `07-F5`, `07-F13`, `07-F32`, `07-F35`, `07-F36`,
`07-F43`, `07-F44`, `07-F45`, `06-F5`, `06-F9`, `06-F10`, `06-F12`,
`06-F13`, `06-F14`, `06-F15`, `06-F16`, `06-F17`, `06-F19`, `06-F28`,
`06-F31`, `05-F20`, `08-F24`, `08-F50`, `03-F27`, `04-F22`, `04-F23`.
`createTransaction`/`editTransaction`/`deleteTransaction` used to
return `{ error: null }` unconditionally — this item makes success and
silent failure distinguishable for the first time, which every later
fix-plan item that writes data depends on to be verifiable at all.

- **A truthful return contract.** `MutationResult { id, status:
  'synced' | 'queued' | 'rejected', error }` from all three mutations.
  `SyncManager.awaitOutcome(entityId, timeoutMs=5000)` kicks a drain
  immediately and polls the queue for up to 5s so the caller can tell
  "reached the server" from "queued, will sync once online" from "the
  server permanently rejected this" — the queue's own `last_error`
  (written, never read before this item) is now the source of the
  returned `error` string.
- **Error classification and isolation** (`retryPolicy.ts`, new,
  dependency-free/pure so it's trivially unit-tested). Postgres SQLSTATE
  class `23`/`42` → dead-letter immediately (`markDeadLetter`); a
  `23505` on `idx_txn_recurring_dedup` specifically → the local row
  soft-deletes and the queue entry drops without dead-lettering (another
  writer already produced the same recurring occurrence — a resolved
  conflict, not a failure); every other unique violation is a hard
  failure that dead-letters rather than silently deleting the user's
  row; anything else (network/5xx/401, no SQLSTATE) → transient, retried
  with backoff. `syncQueue.getReadyBatch(afterId, limit, dueBy)` orders
  by `id ASC` (autoincrement, monotonic) instead of `created_at` (a
  client clock, not monotonic — `06-F19`) and pages with an `id > cursor`
  predicate so a poisoned or currently-backed-off entry can never make
  the drain loop re-fetch the same head forever.
- **A real retry scheduler.** `computeBackoffMs(retryCount)` =
  `min(30s·2^n, 15min)` + up to 20% jitter. `SyncManager.retryTimer` —
  declared in the pre-1.6 code and never assigned — is now actually set
  from `getNextScheduledAttempt()` after every drain pass, cleared on
  the next successful drain, and also triggers on `AppState → active`.
  The unconditional `resetDeadLetterEntries()` call is deleted from
  `start()` (`06-F9` — it used to re-arm every poisoned entry on every
  launch); the function still exists, exported, for an explicit
  one-time repair path if one is ever needed.
- **A failure surface.** New `src/components/SyncFailureBanner.tsx`,
  mounted once in `app/_layout.tsx`: renders nothing while
  `getDeadCount() === 0`, otherwise a dismissible pill wired to
  `getDeadLetterEntries`/`retryDeadLetterEntry`/`clearDeadLetterEntry`
  (all three existed with zero callers before this item — `07-F36`)
  showing each entry's `last_error` with per-entry Retry/Discard and a
  Retry-all when more than one is dead. `SyncManager.notify()` now
  reports real `getPendingCount()`/`getDeadCount()` instead of the old
  `notify(false, 0)`. The fuller "sync health" row in Settings
  (`apps/mobile/app/more/settings.tsx`) is explicitly out of this
  item's file ownership and not built here.
- **Complete pull.** `pagination.ts`'s `paginateAscending` — ascending
  by `updated_at`, a `cursor` param and `.gt()` predicate, paging past
  `PULL_PAGE_SIZE` (500) until a short page ends the loop. Replaces the
  old `ORDER BY updated_at DESC LIMIT 200` with no cursor, which was
  lossy the moment a user had more than 200 rows (`05-F20`/`08-F24`).
  The high-water mark is persisted **in SQLite** (`localDb.ts`'s new
  `sync_meta` key/value table, `getSyncCursor`/`setSyncCursor`) rather
  than a React ref, which cannot be a cursor across eleven possible hook
  instances. `pullRemote` returns `{ ok }` and the cursor only advances
  past a page that both landed cleanly and was fully merged locally —
  a failed page can never be silently skipped on the next pull.
- **All four entities.** New `entityRegistry.ts` (`ENTITY_HANDLERS`,
  keyed by `SyncEntityType`) and `genericLocalStore.ts` (one CRUD
  factory for the three entities that share `transactions`' sync
  contract but have no per-column write behaviour of their own).
  `localDb.ts` gained local `categories`/`budgets`/`recurring_rules`
  tables (column manifests `CATEGORY_COLUMNS`/`BUDGET_COLUMNS`/
  `RECURRING_RULE_COLUMNS`, same pattern as `TRANSACTION_COLUMNS`) with
  the shared sync contract (`client_id`, `version`, `is_deleted`,
  `synced_at`). `drainQueue`/`processEntry` dispatch on `entry.entity_type`
  through the registry instead of hard-coding `.from('transactions')`,
  and drain in one pass across all four entity types, in `id` order —
  which is what makes item 2.2 (recurring rules end to end) possible.
  **Not adopted in this item:** `useCategories`/`useBudget`/
  `useRecurringRules` never call `enqueue()` yet, so categories/budgets/
  recurring_rules only ever arrive locally via `pullRemote`/realtime,
  never get pushed from a mobile-side write — wiring those three hooks
  to actually enqueue is Stage 2, explicitly out of this item's file
  ownership.
- **`upsertTransaction`'s `ON CONFLICT` SET list is now complete.**
  `currency_code`, `source`, `ai_confidence`, `is_recurring`,
  `recurring_rule_id` — all five columns `06-F16` found silently
  missing — are in the SET list now, generated against the same
  `TRANSACTION_COLUMNS` manifest 0.6 introduced, with a one-line comment
  on each deliberate exclusion (`id`, `user_id`, `client_id`/
  `client_created_at`/`created_at` as identity/provenance fields;
  `raw_transcript` because the Privacy screen's "voice not stored"
  promise means a synced-back server row's NULL must never overwrite
  the on-device transcript).
- **Version guards on the server** — new migrations `018_sync_contract.sql`
  and `019_realtime_publication.sql` (repo files only; **not** applied to
  production, per this stage's rules). 018: `sync_upsert_transaction(payload
  jsonb)` RPC doing `ON CONFLICT (user_id, client_id) DO UPDATE … WHERE
  EXCLUDED.version > transactions.version RETURNING *`, returning the
  winning row so a losing client can detect the loss and re-pull instead
  of believing a stale write landed; the same version-guard predicate on
  the delete branch (`versionGuardedDelete`, shared by all four
  entities' `pushDelete`). `transactions_client_id_unique` (global,
  `06-F28`) is dropped and replaced by `transactions_user_client_unique
  UNIQUE (user_id, client_id)` — the constraint the RPC's `ON CONFLICT`
  actually targets, so the documented idempotency key is finally the
  real one. `synced_at` becomes a server-stamped `DEFAULT now()` +
  `BEFORE INSERT OR UPDATE` trigger on all four tables (`06-F10`/
  `04-F23` — a device's own clock can never claim to know when the
  server accepted a write) and is stripped from every outbound payload
  in `SyncManager.processEntry`, the same way `raw_transcript` already
  was. `categories`/`budgets`/`recurring_rules` gain the same four sync-
  contract columns server-side; `recurring_rules` also gains the
  `updated_at` column every other `001_initial_schema.sql` table already
  had (nothing needed it until this item gave the table a client write
  path to guard with it). 019: `ALTER PUBLICATION supabase_realtime ADD
  TABLE public.transactions, public.categories, public.budgets,
  public.recurring_rules`, guarded by a `pg_publication_tables`
  existence check per table (idempotent pre-PG15, safe to apply to a
  project where a table was already added by hand) — every
  `postgres_changes` handler this codebase has ever registered
  (`06-F5`/`08-F50`) was listening to a publication containing zero
  tables until this migration is applied.
- **One store, one channel** (`07-F45`). `SyncManager.startRealtime(userId)`
  opens one realtime channel per signed-in user covering all four
  entities, idempotent per user (a second call with the same `userId`
  is a no-op) — replacing the old one-channel-per-`useTransactions()`-
  mount pattern with a random name suffix. `pullRemote(userId)` gained
  an in-flight-promise map (`pullInFlight`, keyed by `userId`) so
  concurrent calls for the same user — which is exactly what happens
  when several screens mount `useTransactions()` around the same
  render pass — share one pull pass instead of each independently
  walking the full entity list; the realtime dedup alone did not cover
  this half of "one pull" until this pass. `DataEvents`
  (`src/events/dataEvents.ts`) is **not** deleted, unlike the fix-plan
  text's literal "delete the DataEvents fan-out" — it is a distinct
  mechanism from realtime multiplexing (cross-screen *local* SQLite-
  write notification, with zero network involved) that the "one
  channel" fix doesn't obsolete; collapsing every `useTransactions()`
  call site onto one shared Context provider, which is what would
  actually make it redundant, is the literal Stage 2 shape of "one
  store" and is out of this item's file ownership (`useCategories`,
  `useBudget`, `useRecurringRules`, `useProfile`, and every screen
  beyond `_layout.tsx` are untouched).
- **`deleteTransaction` no longer drops the enqueue** (`07-F32`). The
  old inline version read the row to delete from the calling hook
  instance's `transactions` React state — this render's stale closure —
  and silently skipped the `enqueue()` call when the row wasn't in it
  (a different screen's instance, or a row that arrived after the last
  `loadLocal`): the row was soft-deleted in SQLite but the delete never
  reached the outbox. Extracted to a new plain (non-hook) exported
  function, `deleteTransactionAndEnqueue(userId, id)`, that always
  re-reads the row from SQLite — the single local source of truth —
  after the soft-delete, the same pattern `editTransaction` already
  used; `useTransactions()`'s `deleteTransaction` is now a thin wrapper
  that also does the React-specific `loadLocal`/`DataEvents` bits. This
  also removes a second, redundant `version` increment the old code
  computed from the stale closure on top of the one
  `softDeleteTransaction` already applies in SQLite. `transaction/
  [id].tsx`'s own separate delete implementation (which was already
  correct — it reads through `getTransactionById`, not list state) is
  unchanged; consolidating every delete call site onto the hook's fixed
  version is Stage 2, out of this item's file ownership.
- **Not touched, explicitly out of this item's file ownership per the
  fix-plan text's own surfaces list vs. this item's narrower scope
  grant:** `apps/mobile/app/transaction/[id].tsx`,
  `apps/mobile/src/services/fxBackfill.ts`,
  `apps/mobile/src/services/recurringCatchUp.ts`,
  `apps/mobile/app/more/settings.tsx`'s sync-health row,
  `apps/web/src/app/dashboard/transactions/page.tsx`. All three still
  call `syncQueue.enqueue(operation, entityId, payload)` using the old
  three-argument form — `entityType` is a trailing optional parameter
  defaulting to `'transaction'` specifically so these call sites keep
  compiling and behaving correctly unchanged (they only ever enqueue
  transactions) rather than being broken by this item's entity-generic
  rebuild.

**Tests** (7 new/expanded files, 65 mobile tests total —
`retryPolicy.test.ts`, `pagination.test.ts`, `syncQueue.test.ts`,
`SyncManager.test.ts`, `localDb.syncContract.test.ts`,
`realtimePublication.test.ts`, `hooks/__tests__/useTransactions.test.ts`;
`localDb.migration.test.ts` unchanged but now passing — see the
correction above): the fix-plan's own done-when scenario verbatim
(enqueue three entries where the middle one 23514s — entries 1 and 3
reach the mocked server, entry 2 dead-letters with `last_error`
populated, pending count accurate, a second drain does not resurrect
it); a transient failure continuing past instead of aborting the whole
drain; the recurring-dedup 23505 soft-delete carve-out vs. a real
unique violation on a different constraint dead-lettering instead;
strict `id`-order draining across a batch boundary larger than the page
size; `awaitOutcome` reporting `rejected`/`synced` correctly; a real
fake-timers backoff retry firing within its window on a continuously-
online device; the 450-row pagination done-when (seed 450, cold-start
pull, assert 450 local and zero transferred on a second pull); three
concurrently-mounted transaction-consuming screens issuing exactly one
`pullRemote` pass and one channel subscription; the `019` migration
publishing every table `REALTIME_TABLES` subscribes to (a text-level
assertion against the migration SQL — there is no local-Postgres
harness in this repo to literally query `pg_publication_tables`, see
`vitest.config.mts`'s "component tests need RN/jsdom mocking that
Stage 2 will set up separately", which the same gap falls under); and
`deleteTransactionAndEnqueue` enqueueing unconditionally for a row that
was never loaded into any component's state, a permanent rejection
reported truthfully, and a not-found id being a genuine no-op. Run with
`npx vitest run` from `apps/mobile`, or `turbo test --filter=@voice-expense/mobile`.

### A typed parse boundary (fix-plan item 1.7, Aug 9 2026)

Resolves `02-F2`, `02-F7` (the contract half), `02-F11`, `02-F12`,
`02-F19`, `02-F20`, `02-F21`, `02-F22`, `02-F24`, `02-F26`, `02-F35`,
`07-F24`. `validateParsedExpense`/`assertParsedExpense`
(`packages/ai/src/validateParsedExpense.ts`) already existed going into
this pass — wired at the route boundary and the `parser.ts`/
`scanParser.ts` client boundary — but the item's third boundary
(`createTransaction`) and the rest of the "Change" text (determinism,
trust boundaries on the input side, rate limiting, cache-key isolation)
were not yet built. This session closes those.

- **The third boundary.** New `validateTransactionWriteFields` in the
  same file, sharing `checkAmount`/`checkDirection`/`checkCurrency`/
  `checkPaymentMethod` with `validateParsedExpense` itself (extracted
  from what used to be four inline blocks) so the two boundaries can
  never describe two different definitions of "valid". Wired into
  `useTransactions.ts`'s `createTransaction`, before the FX snapshot and
  before anything touches SQLite — regardless of `source` (AI parse,
  manual entry, a shortcut deep link, the notification listener, or a
  future call site that skips the first two boundaries by construction).
  A rejection returns `{ status: 'rejected', error }` through the same
  `MutationResult` contract 1.6 built; nothing is written.
- **Two more model-adjacent inputs now go through the same validator.**
  The Android notification listener's heuristic extraction
  (`useNotificationListener.ts`) is exactly as untrusted as a model's
  JSON — a foreign banking app's currency string is now rejected instead
  of syncing as a permanent $0 row. The iOS Shortcuts deep link
  (`record.tsx`'s `shortcut_currency`/`shortcut_payment_method` URL
  params) used an unchecked cast to `PaymentMethod`; it now validates
  against `ISO_4217_CODES`/`PAYMENT_METHOD_VALUES` and falls back
  honestly instead of producing a value that only fails at save time.
- **`response_format: json_schema`.** New
  `packages/ai/src/parsedExpenseSchema.ts` builds the schema from the
  exact same `PAYMENT_METHOD_VALUES`/`TRANSACTION_DIRECTION_VALUES`/
  `RECURRING_FREQUENCY_VALUES` the validator checks against (now
  exported), so the schema and the validator can't describe two
  different enums. This narrows the model's *shape* mistakes at the API
  level; `validateParsedExpense` still runs after it and is still what
  catches an in-range-shape-but-wrong-value response (an out-of-bounds
  `confidence`, a >1e9 `amount`) — the schema is additive, not a
  replacement.
- **Determinism.** Both parse routes: `temperature: 0` (already present)
  plus `seed: 42`; the model pinned to a dated snapshot
  (`gpt-4o-mini-2024-07-18`) instead of the floating `gpt-4o-mini` alias,
  still overridable per-environment via `AI_PARSE_MODEL`/`AI_SCAN_MODEL`.
  New `apps/web/src/lib/aiCompletion.ts`'s `createJsonCompletionWithRetry`
  checks `finish_reason` before `JSON.parse`-ing anything — a
  `'length'` response is truncated JSON by definition, so retrying it
  through the parser only produces a worse error message. It retries
  once with `max_tokens` raised (capped at 1200) instead. `max_tokens`
  itself raised 320→500 (parse) and 300→400 (scan) as the primary
  mitigation; the retry is the backstop.
- **Trust boundary on the input side.** New
  `apps/web/src/lib/parseGuards.ts`: `isSupportedLocale`/
  `isSupportedCurrency`/`isSupportedScanType` reject a request outright
  (400) rather than silently substituting a default for a value that
  *was* sent but isn't one either route actually supports — a silent
  substitution here just moves the same bug one line down.
  `contentLengthExceeds` rejects an oversized body before `req.json()`
  buffers it into memory. `MAX_TRANSCRIPT_LENGTH` (4000 chars) bounds the
  token cost and prompt-injection surface of a single request.
  `prompt.ts`'s `sanitizeCategoryNames` caps each client-supplied
  category name to 40 characters, strips control characters *and* angle
  brackets (so a name can't spoof `</user_categories>` and break out of
  the block early — pinned by `prompt.test.ts`), and the sanitized list
  is now rendered as a fenced `<user_categories>` data block instead of
  woven into the rule prose. The scan route's `getScanPrompt` output
  moved to the `system` role, with the (now schema-validated) image
  alone in the `user` turn — audit 02-F22's "instructions and the
  untrusted image share one turn" is closed.
- **Rate limiting.** New `apps/web/src/lib/rateLimit.ts`: an in-memory,
  per-`(route, userId)` fixed-window counter — 60 parses/hr, 20 scans/hr
  — keyed only on the already-validated `userId`, never on an
  unauthenticated IP. Explicitly not billing-grade/multi-instance-exact;
  the goal stated in the fix-plan text is "a buggy or compromised client
  can't run up an unbounded OpenAI bill", which a single-process counter
  satisfies for this project's one long-lived Vercel Node function.
- **Cache-key isolation** (audit 02-F24). `parser.ts`'s `cacheKey` used
  to be `locale:currency:transcript` — omitting the user id, the
  category list, and the date. It now includes all three: `userId` (so
  a second user on the same device can never be served the first user's
  cached parse), the sorted category list (so a category added since the
  last parse isn't hidden by a stale hit), and an epoch-day bucket (so
  `transacted_at`'s "defaults to today" doesn't replay yesterday's date
  on a literal cache hit — deliberately *not* `.toISOString().slice(0,10)`
  or any local-calendar getter, since this is a staleness bucket, not a
  user-facing date, and doesn't need the caller's timezone the way
  anything in `period.ts` does). New `clearParseCache()`, called from
  `useAuth.ts`'s `resetLocalState` (0.7) as an explicit belt-and-suspenders
  alongside the key change. `useVoice.ts` now threads the session's
  `userId` through to `parseExpense`.
- **Migration `021_currency_code_check.sql`** (repo file only, not
  applied to production per this stage's rules): `CHECK (currency_code ~
  '^[A-Z]{3}$')` on `transactions`. Scoped to `transactions` only — the
  same column on `profiles`/`recurring_rules`/`budgets` is 2.7's currency-
  migration territory, not this item's.
- **Not touched, explicitly out of this item's file ownership:**
  `VoiceConfirmModal.tsx`'s confidence-based UI gating (the fix-plan
  text's 3-tier ≥0.85/0.6–0.85/<0.6 policy) — that file isn't in 1.7's
  surfaces list, and building it reaches into the confirm sheet's
  field-locking behavior, which is a bigger, separate change. Persisting
  a transcript locally the instant it's finalized so a failed parse is
  retryable (rather than lost) is also not built here — it's a mobile
  resilience/UX flow change (`useVoice.ts`'s error path, `record.tsx`'s
  retry affordance), not a boundary-enforcement one, and belongs with
  Stage 2's broader adoption sweep. Recording the model id alongside
  `ai_confidence` is not built here either — it would need a new
  `transactions` column and a write-path change beyond this item's
  surfaces; noted as a known gap for whoever picks up that thread.

**Tests** (7 new files across 3 packages): `validateParsedExpense.test.ts`
gained a `validateTransactionWriteFields` suite replaying the fix-plan's
own four worked rejection cases against the write boundary specifically
(direction/payment_method/currency/amount, individually and all at
once). New `prompt.test.ts` (category sanitization + the delimited-block
escape case). New `apps/web/src/lib/__tests__/{rateLimit,parseGuards,
aiCompletion}.test.ts` — the first tests to land in `apps/web`, so
`vitest.config.mts`'s `passWithNoTests: true` placeholder is removed
per its own comment. `aiCompletion.test.ts` pins the retry-once-on-
truncation behavior including the "still truncated after retry" case
(no infinite retry loop) and the `max_tokens` cap. Run with `npx vitest
run` from `packages/ai` / `apps/web`, or `turbo test` from the repo
root for all five packages.

### Mobile presentation primitives — adoption at the item-named surfaces (fix-plan item 1.8, Aug 9 2026)

Closes the gap the section above left open. `BottomSheet`/`NumericAccessory`
existed with zero callers; the fix-plan's own item text names
`VoiceConfirmModal` as `<BottomSheet>`'s flagship intended consumer
("have `VoiceConfirmModal`, the record More-options sheet,
`IncomeEditorModal` and the Insights month picker all render through
it" — `BottomSheet.tsx`'s own doc comment) and names both
`VoiceConfirmModal.tsx:195-196` and `edit.tsx:246-247` directly in
`01-F8`'s exhaustive decimal-pad inventory as the two "not
acceptable"/"poor" `NumericAccessory` sites outside `income.tsx`. This
pass wires those two — full item-2.14-style adoption across the other
~23 call sites the audit lists is still Stage 2, unchanged from the
section above.

- **`VoiceConfirmModal.tsx` now renders through `<BottomSheet>`.** The
  file's own hand-rolled `Modal`/backdrop-`Pressable`/`KeyboardAvoidingView`/
  `SafeAreaView` stack (the exact structure `01-F1`'s root-cause section
  diagrammed) is gone; `BottomSheet` owns backdrop, handle,
  `onRequestClose`, and the `measureInWindow`-based keyboard lift that
  fixes `01-F37`'s under-lift-by-the-sheet's-own-offset defect the old
  KAV had. The header keeps its original look (title centered, only an
  X button dismisses) rather than gaining `BottomSheet`'s default
  "Cancel" text: `cancelLabel=""` renders an empty, still-functional
  left slot so the three-way `onClose` wiring (backdrop / header / hardware
  back) stays intact without changing the design. The amount
  `TextInput` (`decimal-pad`) now carries `inputAccessoryViewID={NUMERIC_ACCESSORY_ID}`
  and a `<NumericAccessory>` is rendered in the sheet body — `01-F8`'s
  "Save button is below the keyboard in the footer... not acceptable"
  case is closed. Six now-dead style keys (`backdrop`, `sheet`, `shrink`,
  `handle`, `header`, `title`, `footer`) were removed rather than left
  orphaned.
- **`app/transaction/edit.tsx`** is a Stack screen with its own native
  header, not a modal sheet, so it does **not** render through
  `<BottomSheet>` — wrapping a full-screen route in the sheet primitive
  would misrepresent its navigation semantics. Instead: `01-F23`'s fix
  text applied literally — `autoFocus` dropped from the (already
  pre-filled) amount field, and the Save button moved out of the
  `ScrollView` into a pinned footer sibling ("the pattern
  `VoiceConfirmModal` intends," per that finding's own wording), so Save
  can no longer land below the fold once the keyboard is up. The footer
  does not add its own `insets.bottom` — the screen's existing
  `SafeAreaView edges={['bottom']}` already reserves it, and stacking a
  second one is exactly the double-count `01-F23`'s own "refuted
  sub-claim" paragraph warned against re-introducing. The amount field
  also gained `inputAccessoryViewID={NUMERIC_ACCESSORY_ID}` and a
  `<NumericAccessory>` — `01-F8`'s "recoverable via drag-dismiss, but
  poor" case is closed.
- **Not touched, still Stage 2 (item 2.14):** the other four sheets
  (`record.tsx`'s More-options sheet, `IncomeEditorModal`, the Insights
  month picker, `CategoryPicker`), the eight bare `<Modal>`s
  `01-F14` lists (five in `settings.tsx`, `insights.tsx`,
  `BudgetEditorModal.tsx`, `CategoryPicker.tsx`), the 13 remaining
  tab-bar clearance sites, and every other `decimal-pad`/`numeric`
  `TextInput` in the app besides these two.

**Tests** (`apps/mobile/src/components/__tests__/BottomSheet.test.ts`,
4 new vitest cases): the `01-F14` regression test the finding itself
specifies — "fire `BackHandler` … assert `visible` flips to false" —
against the shared primitive directly rather than against
`VoiceConfirmModal` (RN's `Modal` has no separate `BackHandler` hook of
its own on this path; `onRequestClose` **is** the mechanism, per
`01-F14`'s own root-cause paragraph, so driving that prop is the literal
test). Since `vitest.config.mts` is deliberately node-only and no
RN/jsdom component-test harness existed yet (`01-F8`'s own PLAN section
above notes this gap explicitly), this pass adds one: `react-test-renderer`
+ `@types/react-test-renderer` (pinned `19.1.0`, matching the workspace's
`react`) as new mobile devDependencies, plus a minimal hand-rolled
`react-native`/`react-native-safe-area-context` mock (host-passthrough
components, no native modules — the same shape as the existing
`vi.mock('react-native', …)` calls in `services/sync/__tests__`, just
enough surface for `BottomSheet` to mount without touching a real
native bridge). Cases: the `Modal` renders with `onRequestClose` wired;
firing it flips `visible` false; pressing the backdrop closes it;
pressing the header Cancel closes it via the same `onClose`. Run with
`npx vitest run` from `apps/mobile`, or `turbo test --filter=@voice-expense/mobile`.

### An outbox that can report failure — Settings sync-health row, plus item 1.3's Time Zone row (fix-plan item 1.6, Aug 9 2026)

Closes the one gap the section above named explicitly as deferred: "The
fuller 'sync health' row in Settings (`apps/mobile/app/more/settings.tsx`)
is explicitly out of this item's file ownership and not built here."
Also adds item 1.3's read-only "Time Zone" row to the mobile Settings
screen — `apps/mobile/app/more/settings.tsx` is this item's file, not
1.3's, and 1.3's device-zone *capture* (`useProfile.ts`'s
`getDeviceTimeZone`/`captureDeviceTimezone`) already landed separately.

- **New "Sync" `SetGroup`** (between Data/export and Reminders): a
  "Pending" row reading live `pendingCount` and a "Sync Issues" row
  reading live `deadCount`, both from `syncManager.addListener` — the
  same channel `SyncFailureBanner` already subscribes to, so the two
  surfaces can never disagree. Persistent by design (not gated on
  `deadCount > 0`) — the fix-plan text's "a persistent sync-health row"
  — so a user can confirm the outbox is clean, not only be told when it
  isn't.
- **New Sync Issues modal**, opened from the row: lists every
  dead-lettered entry (`operation · entity_type`, `last_error` or a
  localized "Unknown error" fallback) with per-entry Retry/Discard wired
  to `retryDeadLetterEntry`/`clearDeadLetterEntry` (zero callers before
  `SyncFailureBanner` and this row — `07-F36`) and a "Retry All" when
  more than one entry is dead; Retry additionally kicks
  `syncManager.drainQueue()` so a retried entry doesn't wait for the
  next network/foreground event. Matches this screen's own established
  modal chrome (`presentationStyle="pageSheet"`, `styles.modal`/
  `modalHeader`/`modalCancel`/`modalTitle`) rather than reusing
  `SyncFailureBanner`'s bespoke pill styling. Given `onRequestClose`
  from the start, since it's a new modal authored in this pass — the
  five pre-existing `settings.tsx` modals `01-F14` lists as missing it
  are untouched, out of this item's scope (that sweep is item 2.14).
- **New read-only "Time Zone" row** in the Account group, showing
  `Intl.DateTimeFormat().resolvedOptions().timeZone` directly — the
  device's current zone, computed independently of `profiles.timezone`
  (which reads the schema default until the device has relaunched at
  least once since 1.3's capture landed) so the row can never show a
  stale value the way the six 'UTC' production profiles did before that
  capture existed.
- **i18n.** Ten new keys (`settings.timezone`, `settings.sync*`) added
  to all four locale files (en/fr/es/pt) — verified no locale is missing
  a key `en.json` has (the drift 1.1's duplicate-key/missing-key check
  is meant to catch).
- **Not touched, still out of this item's file ownership:** the five
  pre-existing `settings.tsx` modals' `onRequestClose` (`01-F14`,
  item 2.14); `useCategories`/`useBudget`/`useRecurringRules` still
  don't call `enqueue()` (noted as a gap in the section above, unchanged
  here); `apps/web`'s Settings screen equivalent of the Time Zone row
  (item 1.3's own web surface, a different file).

### One recurrence engine — vendored-copy drift coverage (fix-plan item 1.5, Aug 9 2026)

Closes the one gap the section above left open: `supabase/functions/
_shared/recurrence.ts` (the Deno-vendored port of `nextOccurrence`/
`occurrencesDue`, kept because this project has no import map letting
Edge Functions resolve the `@voice-expense/shared` workspace package)
had zero test coverage of its own — nothing enforced that a future edit
to one copy without the other would be caught before it shipped, which
is exactly the "copy the change over here" defect class fix-plan 1.5
exists to close in the first place.

- **New `packages/shared/src/domain/__tests__/recurrence.vendored.test.ts`**
  (25 new vitest cases). Imports the vendored file directly via a
  relative path (`../../../../../supabase/functions/_shared/recurrence`)
  — it's plain TS with no Deno globals, so it needs no shimming. Two
  layers: (1) the vendored copy's two exports run through the same
  Jan-31-clamp/six-occurrence-walk/quarterly/leap-year/`interval`/DST/
  `starts_at`-is-first-occurrence/dedup-window/bounded-catch-up fixtures
  `recurrence.test.ts` asserts against the real module, same expected
  values, so a regression in the vendored copy alone fails even if
  nobody thought to update this file; (2) a cross-parity sweep that
  imports **both** modules side by side and diffs their outputs against
  *each other* over one shared table of cases — this is the layer that
  actually catches drift with no fixture value to keep in sync by hand,
  since it fails the moment the two copies disagree regardless of which
  one is "right." One case in that table (a mid-month, non-clamping
  anchor day) was added specifically because the Jan-31-style fixtures
  everywhere else in both suites clamp identically whether or not a
  day-of-month off-by-one is present — verified by hand-injecting a
  `Math.min(d, days)` → `Math.min(d + 1, days)` drift into the vendored
  copy: the original 24 mirrored-fixture cases all still passed (every
  one of them month-end-anchored), and only the new unclamped-anchor
  cross-parity case caught it. Reverted after confirming.
- **Not touched:** the vendored file's own logic (already correct, per
  the section above) and its `REGENERATED-FROM`/`DO NOT HAND-EDIT`
  header, which already documents the keep-in-sync obligation this test
  now enforces mechanically.

**Tests** — this section's own addition is the test file described
above. Run with `npx vitest run` from `packages/shared`, or
`turbo test --filter=@voice-expense/shared`.

### A typed Supabase client — Deno vendoring, edge functions, and env.ts (fix-plan item 1.2, Aug 9 2026)

Resolves `06-F26`, `06-F33`, `07-F31`. The web/mobile clients were
already parameterised with `<Database>` going into this pass (`apps/web/
src/lib/{auth.ts,supabase/{client,server}.ts}`, `apps/mobile/src/lib/
supabase.ts`) — what remained was the two Deno Edge Functions (typed
`any` end to end) and the `env.ts` per app the item's own "Change" text
calls for.

- **Vendored `Database` type for Deno.** New `supabase/functions/_shared/
  database.types.ts`, a `REGENERATED-FROM packages/shared/src/types/
  database.types.ts` copy (same pattern as `_shared/recurrence.ts` —
  Deno has no workspace resolution and no import map here). It is a
  **patched**, not byte-for-byte, copy: the upstream file's own header
  still claims parity with migrations 001-016, predating 017
  (`local_day`, `NOT NULL`) and 020 (`occurrence_date`,
  `anchor_day`/`anchor_weekday`/`anchor_time`) — both of which
  `generate-recurring/index.ts` already writes to or needs. Every added
  column is marked `// PATCHED` with the source migration, and the file
  header explains the reconciliation: once `packages/shared`'s copy is
  regenerated against the live schema (CI job `db-types`, currently
  report-only pending `SUPABASE_ACCESS_TOKEN`), a fresh copy over this
  file makes it a true byte-for-byte vendor again.
- **`generate-recurring/index.ts` and `delete-user/index.ts` now
  `createClient<Database>(...)`.** This caught a real, live bug the
  untyped client was masking: the insert into `transactions` never set
  `local_day` (migration 017, `NOT NULL`, no default) — every
  recurring-generated row would have failed with a `23502` the moment a
  real recurring rule existed (production has zero rules today, per the
  audit, which is the only reason this hasn't fired yet). Fixed by
  setting `local_day: occurrence.occurrenceDate` — the same civil day
  `occurrence_date` uses, per migration 020's own comment that the two
  mean the same thing. The local `RecurringRule` interface in
  `generate-recurring/index.ts` is now `Omit<Database[...]['recurring_
  rules']['Row'], 'direction' | 'frequency'> & {...narrowed enums...}`
  — an alias of the generated row, not a hand-retyped duplicate, so a
  column rename is a compile error here too (the same pattern
  `packages/shared`'s hand-written domain types already use). The
  profile-fetch's manual `as { currency_code?: string }` casts in
  `generate-recurring/index.ts` are gone, not just hidden — the typed
  `.select('currency_code, timezone').single()` already returns that
  shape. `delete-user/index.ts`'s per-table delete loop was split into a
  `user_id`-keyed loop plus a separate `profiles` (`id`-keyed) call
  rather than one loop over a `table` × `column` union — a strongly-typed
  `.eq()` checks its column argument against one specific table's row
  shape, and a shared loop body can only offer the union of all seven
  tables' columns at once, which doesn't type-check (verified with a
  scratch `tsc --strict` run against the real `@supabase/supabase-js`
  package before committing to the split; Deno itself has no local
  `deno check` step in this repo to gate on).
- **New `apps/web/src/lib/env.ts`.** Two getters, not one flat
  validator: `getSupabaseEnv()` (`NEXT_PUBLIC_SUPABASE_URL`/
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`) is safe to import from a `'use
  client'` module since Next.js inlines `NEXT_PUBLIC_*` into the browser
  bundle by design; `getOpenAIEnv()` (`OPENAI_API_KEY`) is server-only
  and must never be imported by client code, or Next.js would replace
  the reference with `undefined` in the browser bundle and the module
  would throw on every page load instead of the secret being (correctly)
  absent there. Each throws a named `MissingEnvError` listing every
  missing key, not just the first, and caches its validated result so
  the check only runs once per client-construction site. Wired into
  every bare `process.env.X!` in `apps/web/src/lib/**` and the AI API
  routes: `supabase/{client,server}.ts`, `auth.ts` (whose module-scope
  construction is what the fix-plan text calls out — a missing variable
  used to take down all three AI routes with an opaque 500, since they
  all import it for `validateToken`), and the three `apps/web/src/app/
  api/ai/*/route.ts` files' `new OpenAI({ apiKey: ... })`. Mobile's
  existing `requireEnv` (`apps/mobile/src/lib/supabase.ts:5-14`) already
  does the same job with named errors — left in place per the item's own
  "only if trivial, else leave" text; extracting it touches files outside
  this item's ownership for no functional gain.
- **Not touched:** `packages/shared/src/types/database.types.ts` itself
  (regenerating it needs a Management API token this session doesn't
  have, and the file is outside this item's file ownership) — the
  `local_day`/`occurrence_date`/anchor-column staleness is real and
  tracked by CI's `db-types` job; the Deno vendored copy's `// PATCHED`
  markers are the interim fix for the two Edge Functions specifically,
  not a substitute for regenerating the source.

**Tests**: no new test file — the Edge Functions have no Deno test
runner wired into this repo (`deno check`/`deno test` isn't part of any
CI job), so correctness here was verified by copying the final files
into a scratch `tsc --strict` check against the real
`@supabase/supabase-js` npm package (same v2 API surface the `esm.sh`
import resolves to) before applying the edits, then deleting the
scratch files. `apps/web`'s existing suites plus the new
`src/lib/__tests__/env.test.ts` (7 cases: both-set, missing-one,
missing-both naming every key, caching, and `getOpenAIEnv`/
`getSupabaseEnv` independence) run with `npx vitest run` from
`apps/web`, or `turbo test`/`turbo typecheck` from the repo root.

### A typed parse boundary — flow_type, and closing the remaining item 1.7 gaps (fix-plan item 1.7, Aug 9 2026)

Audited the prior session's item-1.7 pass (section above) against the
item's full text and closed what it explicitly left open or hadn't
started. Confirmed already correct and unchanged: the third boundary in
`createTransaction`, `response_format: json_schema`, the `finish_reason
=== 'length'` retry, the pinned-model-with-env-override pattern, 60/20
per-hour rate limiting on the parse/scan routes, migration
`021_currency_code_check.sql`, and `clearParseCache()` (exported from
`packages/ai`, wired into `useAuth.ts`'s `resetLocalState`).

- **`flow_type` — the one part-1 sub-item not yet started.** New
  `FlowType` union in `packages/shared/src/types/ai.ts`:
  `'expense' | 'income' | 'transfer_out' | 'transfer_in' | 'refund' |
  'reimbursement'`. `ParsedExpense.direction` is now **derived**, never
  read from the model — `validateParsedExpense` no longer checks a raw
  `direction` field at all; it checks `flow_type` against the six-value
  enum and calls the new exported `deriveDirectionFromFlowType` (one
  `Record<FlowType, TransactionDirection>` lookup:
  expense/transfer_out → debit, income/transfer_in/refund/reimbursement
  → credit). `parsedExpenseSchema.ts`'s `response_format` schema drops
  `direction` entirely and requires `flow_type` instead, built from the
  same `FLOW_TYPE_VALUES` the validator checks against — the model has
  no field left to get inconsistent with its own classification.
  `prompt.ts`'s direction rule became a `flow_type` rule (the Schwab
  investing worked example now reads "→ flow_type 'transfer_out'"); both
  scan-prompt JSON templates (receipt/paycheck) swapped their hardcoded
  `"direction"` line for `"flow_type": "expense"`/`"income"`.
  `localParser.ts` (the non-AI tier-1 path) and the two non-AI
  `ParsedExpense` producers outside this item's file ownership but
  directly broken by the type becoming required —
  `apps/mobile/app/(tabs)/record.tsx`'s Shortcuts deep-link injection and
  `apps/mobile/src/hooks/useNotificationListener.ts`'s notification
  candidate — now set `flow_type: 'expense'` and derive `direction` from
  it via the same exported function, rather than hand-picking `'debit'`
  next to a hardcoded `flow_type` and risking the two drifting apart.
  Both are minimal, mechanical additions (one field each); left
  unmodified otherwise since they're outside this item's ownership.
  Third boundary (`validateTransactionWriteFields`) is unchanged — it
  validates an already-resolved `direction` on a `Transaction` write, not
  a raw model response, so it has no `flow_type` concept and needs none.
- **Golden corpus wiring** (`packages/ai/src/__tests__/goldenCorpus/
  corpus.ts`, item 1.1's fixture, not this item's file ownership but
  directly affected): its own header previously said `flow_type` was
  "Stage 2 work, not 1.1's" and deliberately unasserted, written before
  this item added the field. `passingRow`'s generated `rawResponse` now
  sets `flow_type` (from a row's explicit `expected.flowType`, else
  defaulted from `direction`: credit→income, debit→expense);
  `goldenCorpus.test.ts`'s `runRow` asserts `result.flow_type` wherever
  a row names one explicitly (currently `f1-schwab-direction` and
  `f7-schwab-note`, both `transfer_out`). `liveVerify.ts` (the manual,
  not-CI on-demand live-model check) compared `raw.direction` against
  `expected.direction`, which would always fail once the prompt stopped
  asking for `direction` — it now derives direction from the live
  response's `flow_type` via the same `deriveDirectionFromFlowType`
  production uses, plus a direct `flow_type` comparison where a row
  names one.
- **`packages/ai/src/index.ts`** now also exports
  `deriveDirectionFromFlowType` and `FLOW_TYPE_VALUES` — needed by the
  two mobile call sites above and by `packages/ai/src/localParser.ts`.

**Tests**: `validateParsedExpense.test.ts` — the old `direction`-enum
regression cases were rewritten for the field they actually gate now
(`flow_type: 'expensive'` replaces `direction: 'expense'` as "the
plausible-looking-but-wrong enum value"; a new case confirms a raw
`direction` the model returns is read by nothing and produces no
`direction`-field error, only a missing-`flow_type` one). New
`deriveDirectionFromFlowType`/`flow_type → direction derivation`
describe blocks: all six flow types table-tested end to end through
`validateParsedExpense`, a rejected out-of-enum value, and the Schwab
transfer_out/"sold $300 of my S&P 500 index fund" transfer_in worked
examples. 154 passed | 1 expected fail (the still-open F30 row,
unrelated) | 2 todo, run with `npx vitest run` from `packages/ai`. Full
monorepo `turbo test` (4 packages, 5 with desktop's no-op) and `turbo
typecheck` (5 packages) both clean after these changes.

### Items 1.2 + 1.7 verification pass, and the one remaining gap (Aug 9 2026)

Re-audited both items' full text end to end against the two prior
sessions' entries above (Deno vendoring/env.ts for 1.2; flow_type for
1.7). Everything both entries claim was independently re-verified by
reading the actual files, not just the changelog: `_shared/
database.types.ts`'s `PATCHED` columns match what `generate-recurring/
index.ts`'s insert call actually writes; `generate-recurring` and
`delete-user` both construct `createClient<Database>(...)`;
`apps/web/src/lib/env.ts` is imported by every module-scope Supabase/
OpenAI client construction in `apps/web/src/lib/**` and the three AI
routes, with zero bare `process.env.X!` remaining in that surface;
`validateTransactionWriteFields` runs as the third boundary in
`useTransactions.ts`'s `createTransaction`; `response_format:
json_schema` and the `finish_reason === 'length'` retry
(`aiCompletion.ts`) are wired into both parse routes; both routes read
their model id from an env var with an explicit pinned-version default
(`AI_PARSE_MODEL`/`AI_SCAN_MODEL` ?? `gpt-4o-mini-2024-07-18`);
per-user rate limiting is live at 60/hr (parse) and 20/hr (scan), the
two routes item 1.7's own "Surfaces to update" list names (the item's
prose also mentions "30 asks/hr" for `ask-murmur`, but that route isn't
in 1.7's surfaces list or its own item's — 2.10 — either; left alone
as out of both items' scope rather than added speculatively);
`clearParseCache` is exported from `packages/ai`'s barrel and called
from `useAuth.ts`'s `resetLocalState` on sign-out; migration
`021_currency_code_check.sql` already exists (numbers 021-023 were
claimed by this and two other items — category `kind` and the
FX-backfill cron — landing in the same window, so "next free number"
by the time of this pass was already spoken for). `packages/ai`'s
`npx vitest run` is unaffected (154 passed | 1 expected fail | 2 todo,
same as the prior entry) and `flow_type` derivation already has
exhaustive table-driven coverage — no test gap to extend.

- **The one part of 1.7's text neither prior pass closed:** "pin the
  model to an explicit version... **and record the model id alongside
  ai_confidence**." Nothing logged the two together. Added one
  `console.log` on the success path of `parse-expense/route.ts` and
  `parse-scan/route.ts` each, right after `validateParsedExpense`
  passes: `model=${MODEL} confidence=${result.confidence}
  retried=${completion.retried}`. Log line only, no new DB column — no
  consumer reads a model id at query time, this is an observability
  trail for tracing a classification drift back to a model version
  change, and no migration in either item's file list makes room for a
  persisted column.

**Tests**: `apps/web`'s `npx tsc --noEmit` clean after the two log-line
edits. No behavioral change, so no new test.

### Items 1.8 + 1.6 + 1.5 verification pass — no gap survived (Aug 9 2026)

Re-audited all three items' full text against the prior sessions' entries
above ("Mobile presentation primitives — adoption...", "An outbox that
can report failure — Settings sync-health row...", "One recurrence
engine — vendored-copy drift coverage") by reading the actual files, not
the changelog, and running both suites.

- **1.8.** `VoiceConfirmModal.tsx` renders through `<BottomSheet>`
  (backdrop/handle/header/`onRequestClose` all owned by the primitive)
  and its amount field carries `inputAccessoryViewID={NUMERIC_ACCESSORY_ID}`
  with a `<NumericAccessory>` in the sheet body; `transaction/edit.tsx`'s
  amount field is wired the same way, footer pinned outside the
  `ScrollView` per `01-F23`. `components/__tests__/BottomSheet.test.ts`'s
  four cases (`Modal` renders with `onRequestClose` wired; firing it
  flips `visible` false; backdrop press closes; header Cancel closes) is
  `01-F14`'s own specified regression test, run against the primitive.
- **1.6.** `settings.tsx` has the "Sync" `SetGroup` (live `pendingCount`/
  `deadCount` off `syncManager.addListener`, matching `SyncManager.notify`'s
  actual `(syncing, pendingCount, deadCount)` callback shape) and the
  Sync Issues modal with per-entry retry/discard wired to
  `retryDeadLetterEntry`/`clearDeadLetterEntry`, plus the read-only
  "Time Zone" row reading `Intl.DateTimeFormat().resolvedOptions().timeZone`
  directly. All ten `settings.timezone`/`settings.sync*` i18n keys
  present in all four locale files.
- **1.5.** `packages/shared/src/domain/__tests__/recurrence.vendored.test.ts`
  imports `supabase/functions/_shared/recurrence.ts` by relative path and
  runs the Jan-31-clamp/six-occurrence-walk/quarterly/leap-year/interval/
  DST/dedup-window/bounded-catch-up fixtures against it, plus a
  cross-parity sweep diffing the vendored and real modules against each
  other over one shared case table.
- **Considered and deliberately left alone:** `settings.tsx`'s five
  pre-existing bare `<Modal>`s still lack `onRequestClose` (`01-F14`).
  Both prior entries above name this exact gap and defer it to item
  2.14 by design (`settings.tsx`, `insights.tsx`, `BudgetEditorModal.tsx`
  and `CategoryPicker.tsx` get the same treatment together, not
  `settings.tsx` alone out of turn) — patched it in this pass to
  double-check the "no workaround" call, then reverted rather than
  create a mixed state (this file done "the raw-prop way" while the
  other three files in the same finding wait for "the primitive way")
  ahead of 2.14's actual sweep.

**Tests**: `apps/mobile` — `npx vitest run` 69/69 passed (10 files),
`npx tsc --noEmit -p tsconfig.json` clean. `packages/shared` —
`npx vitest run` 133/133 passed (9 files, including the 25-case
vendored-copy suite). No code change from this pass — everything both
items' "Done when" and regression-test text asks for was already
landed and green.

### One definition of "a day", "a week" and "a month" — adoption at the item-named surfaces (fix-plan item 1.3, Aug 9 2026)

`period.ts` itself (Stage 1) was already solid; this pass verified and
closed the adoption gap at every surface this item names, file by file
against the plan's own "Change" and "Surfaces to update" text.

**Already correctly adopted (verified, not re-done):**
- **Web timezone capture** — `apps/web/src/components/TimezoneSync.tsx`,
  mounted from `dashboard/layout.tsx`, writes `Intl.DateTimeFormat().
  resolvedOptions().timeZone` to `profiles.timezone` via the same plain
  `supabase.from('profiles').update(...)` path every other web Settings
  save uses (there is no separate "profile update" abstraction on web to
  route through — this *is* that path) whenever it drifts from what's
  stored, fire-and-forget, on every authenticated dashboard load.
- **Web Settings "Time zone" row** — `dashboard/settings/page.tsx:418-426`,
  read-only, falls back to the browser's own resolved zone for the one
  render before `TimezoneSync`'s capture lands so it never shows a stale
  `'UTC'`.
- **`transactions.local_day` written at insert time by both client
  writers** — `apps/mobile/src/hooks/useTransactions.ts`'s
  `createTransaction` (`localDay(now, getDeviceTimeZone())`, carried on
  the sync-outbox payload since the local SQLite `Transaction` shape
  doesn't have the column yet — Stage 2 reads) and
  `apps/web/src/app/dashboard/transactions/page.tsx`'s manual-add insert
  (`localDay(transactedAt, tz)`, `tz = profile?.timezone || 'UTC'`).
- **`period.ts` adoption at the named web surfaces** —
  `apps/web/src/lib/monthIso.ts` is a thin, tz-required wrapper over
  `currentMonthIso`/parsing, no local `Date` math left; `dashboard/
  page.tsx` and `dashboard/transactions/page.tsx` both compute month
  windows via `monthBounds(monthIso, tz)` and derive `monthStart`/
  `monthEnd` from the half-open bounds — the `new Date(anchorY,
  anchorM+1, 0, 23,59,59,999)` pattern is gone (only survives in a
  comment explaining what it replaced).
- **`HistoryHeatmap.tsx` weekday labels** — `weekdayLabels(locale,
  'narrow')` replaces the hardcoded Sunday-first `history.weekday_labels`
  string; that key is gone from all four locale JSONs (`en`/`es`/`fr`/
  `pt`) and nothing else references it.

**Gaps actually closed this pass** (found by re-running `npx eslint`
across this item's ownership — the module was solid, but two of its own
named surfaces were left with real, unexempted rule violations, meaning
a plain lint run failed before this pass):
- **`fx.ts:79` tz threading (part 2 of the item, "thread tz from
  callers")** — `apps/mobile/src/hooks/useTransactions.ts`'s
  `createTransaction` called `snapshotFx(now, ..., fields.amount)` with
  no `tz`, so the FX rate date fell back to a bare UTC slice one line
  above the exact civil-day `local_day` value computed with
  `getDeviceTimeZone()`. Hoisted that zone lookup into one `const tz`
  reused by both calls, so the FX snapshot's rate date and the stored
  `local_day` can no longer disagree about which day a transaction
  belongs to.
- **`local/period-restrictions` severity is `'error'` for
  `apps/mobile/**` and `apps/web/**` (part of item 7), but two files this
  item owns still had live, un-exempted violations** —
  `apps/mobile/src/components/HistoryHeatmap.tsx`'s month-grid layout
  math (`monthParam`, `dailyTotals`, the `heatmapMonth` state and its
  prev/next stepping, `firstWeekday`/`daysInMonth` — genuine Stage 2
  debt: this component has no `tz` threaded into it, and the grid math
  is a bigger rewrite than this item's own scope) and
  `useTransactions.ts`'s `useMonthSummary` (dead export, zero callers
  anywhere in the app, still `new Date(now.getFullYear(), ...)`). Neither
  file had the exemption `eslint.config.mjs`'s own header promises for
  files this item owns ("own file: an inline eslint-disable at the top")
  — `HistoryHeatmap.tsx` even had a comment pointing at
  `eslint.config.mjs` for an exemption that was never actually added
  there or anywhere. Added a file-top `/* eslint-disable
  local/period-restrictions */` in `HistoryHeatmap.tsx` (the debt spans
  most of the file) and a scoped `eslint-disable-next-line` on the one
  `useMonthSummary` line in `useTransactions.ts` (kept scoped, not
  file-level, since the rest of that file — the `local_day` write — is
  genuinely migrated and should stay linted). Both marked "Stage 2
  (2.4/2.14) migration pending" per this item's own convention.
- Verified clean, no changes needed: `apps/web/src/components/
  MonthPicker.tsx` and every non-lens file under `apps/web/src/**` this
  item owns — `npx eslint apps/web/src apps/mobile/src apps/mobile/app
  packages` now reports **0 errors** (14 pre-existing warnings, all
  `react-hooks/exhaustive-deps`/`no-img-element`/`no-control-regex`
  directives unrelated to this item).

**Deliberately not touched, confirmed out of this item's file
ownership:** `apps/mobile/src/services/recurringCatchUp.ts` and
`apps/mobile/src/services/fxBackfill.ts`'s own `snapshotFx` calls (same
missing-`tz` shape as the one fixed here, but neither file is
`apps/web/src/**` or one of this item's two named mobile files); the
mobile Settings "Time zone" row (added under the "1.8 + 1.6 + 1.5
verification pass" entry above, by the agent that owns that file);
`apps/mobile/src/components/MiniBars.tsx` (named in the item's full
surfaces list but not in this item's file-ownership grant); the full
HistoryHeatmap.tsx grid rewrite and the web calendar/budgets/export/Ask
Murmur windows (2.3/2.4/2.5/2.10/2.11/2.14/2.15, per
`eslint.config.mjs`'s Stage-2 override block).

**Tests**: `apps/mobile`'s `npx vitest run src/hooks/__tests__/
useTransactions.test.ts` → 3 passed (unaffected by the `tz` hoist —
the test's only transaction is same-currency, which short-circuits
`snapshotFx` before the rate-date argument matters). `npx tsc --noEmit
-p apps/mobile/tsconfig.json` clean. No new test added: both fixes are
either a values-already-computed reuse (`tz`) or a lint-only exemption,
neither changes runtime behavior.

### Parse semantics + every failure has a surface (fix-plan items 2.9 + 2.13, Aug 9 2026)

**2.9 — parse semantics.** Stage 1's `flow_type` boundary (1.7) had
already landed the direction table, the Schwab worked example, and the
divide-by-100 heuristic's removal, so this pass's real gaps were
narrower than the item's full text:
- **`prompt.ts`'s flow_type table** — added explicit examples the table
  was missing: credit-card/loan payments and ATM withdrawals under
  `"expense"` (previously only reachable via the "default expense when
  unclear" fallback, not stated as a rule), cashback under `"refund"`,
  and a worked `"transfer_in"` example (stock-sale proceeds landing back
  in checking) — the inbound half of the Schwab example had no
  counterpart before. Added "NEVER pre-select income... read the
  direction the cash actually moves" as an explicit instruction.
- **Scan rejection gets its own state (audit 02-F3)** —
  `packages/ai/src/scanParser.ts`'s `parseScan` now returns
  `ScanResult = { ok: true, expense } | { ok: false, reason }` instead of
  a plain `ParsedExpense`; when the model sets `needs_clarification`
  (the scan prompts' *only* use of that field — "too blurry or not a
  receipt/paycheck", never a partial/editable case the way voice parse's
  ambiguous-amount clarification is), it now comes back as a rejection,
  not a saveable row with a placeholder amount. `apps/mobile/app/(tabs)/
  record.tsx`'s `handleScan` branches on `scanResult.ok`: `false` shows
  an `Alert` (title + the model's own reason, or a scan-type-specific
  default) with Retake / Enter manually / Cancel — no confirm sheet
  opens, so a rejected paycheck scan can no longer land pre-armed as
  recurring income. New locale keys (`voice.scan_rejected_title`,
  `voice.retake`, `voice.enter_manually`) added to all four `en/fr/es/
  pt` JSONs.
- **Clarifying question actually asks (item 2.9b)** —
  `VoiceConfirmModal.tsx`'s clarify card was a static advisory text box;
  added `extractClarificationAmounts()` (pulls the two numeric readings
  out of "Was that $4.50 or $450?"-shaped questions) and renders them as
  two tappable amount buttons beside the question, so resolving the
  ambiguity is one tap instead of manually retyping the amount below.
- **Golden corpus extended** — pinned `flowType` on `en-refund` →
  `refund`, `en-roommate` → `reimbursement`, `en-401k` → `transfer_out`,
  `en-atm`/`fr-distributeur`/`es-cajero`/`pt-caixa` → `expense`,
  `en-amex` → `expense`, `fr-remboursement`/`es-reembolso`/
  `pt-reembolso` → `refund`; added two new rows previously entirely
  unrepresented — `en-cashback` (`refund`, credit) and `en-stock-sale`
  (`transfer_in`, credit, the Schwab row's inbound counterpart). New
  `packages/ai/src/__tests__/scanParser.test.ts` (6 tests) pins the
  `ok:true`/`ok:false`/still-throws-on-a-real-boundary-violation
  contract directly. `goldenCorpus.test.ts`'s F3 `it.todo` comment
  updated to record that the fix landed at HEAD (record.tsx branches on
  `scanResult.ok`) even though it stays `it.todo` — mounting `record.tsx`
  itself isn't exercisable from `packages/ai`.
- **Not touched, out of this pass's file ownership**: `packages/shared/
  src/domain/categoryResolver.ts` (item 2.9d, the substring-cascade
  category matcher — `useCategories.ts`'s matching logic, not its read
  path), the confirm-sheet parse-session-id remount fix and
  `lastInterimRef` duplicate-recording guard (2.9e/f — `useVoice.ts`,
  not owned), the scan prompt's missing `locale`/user-category-list
  (2.9g — would require editing `apps/web/src/app/api/ai/parse-scan/
  route.ts`'s call site, not owned), and the single-`ScanButton`
  component consolidation (2.9h).

**2.13 — every failure has a surface**, scoped to read paths only
(write/mutation error surfacing — Settings' "Saved." bug, onboarding's
`updateProfile` check, permission-denial "Open Settings" routing — is a
separate write-path pass, not this one):
- **New `apps/web/src/components/ErrorState.tsx`** — the shared error/
  empty-state distinction component: warm-destructive icon + message +
  optional detail line + optional Retry button, `compact` variant for a
  card/row-scale slot. Adopted across all six client-rendered dashboard
  pages this item names — `transactions`, `budgets`, `recurring`,
  `export`, `ask`, `settings` — each page's `load()` now destructures
  `{ data, error }` from every read in its `Promise.all`, sets a
  `loadError` state (kept distinct from each page's own pre-existing
  save-form `error` state, where one exists) on the first failure, and
  keeps prior good data in place per-query instead of overwriting it
  with `[]`/`null`. `budgets`/`export`/`ask`/`settings` had no
  reusable `load()` to retry against — extracted their inline
  `useEffect` bodies into `useCallback`-based `load` functions so the
  new Retry button has something to call.
- **New `apps/web/src/app/dashboard/error.tsx`** — the missing
  server-component backstop the item asks for by name. Catches a thrown
  render-time exception anywhere in the `dashboard` segment (Overview
  and Insights are both `async function` Server Components reading
  straight from Supabase) instead of Next's generic unbranded default
  error screen.
- **Mobile hooks, read-error exposure only** — `useTransactions.ts`
  declared an `error` slot and never called `setError` (the item's own
  example of the bug); now wires it from `syncManager.pullRemote()`'s
  `{ ok }` result, only flagging a failure when the pull was attempted
  *while online* (`syncManager.online`) — being offline is the ordinary,
  already-handled case, not a failure. `useCategories.ts`, `useBudget.ts`
  (`useActiveBudget`) and `useRecurringRules.ts` had no `error` state at
  all — each `fetch`/`load` now destructures `{ data, error }`, exposes
  `error` from the hook, and leaves prior state in place on failure
  instead of overwriting it with `data ?? []`.
- **Deliberately not touched, confirmed out of this pass's file
  ownership**: `apps/web/src/lib/data.ts` — `getProfile`/
  `getTransactions`/`getCategories`/`getActiveBudgets` still end
  `return data ?? []`, discarding `error` entirely. This is the one real
  residual gap: `dashboard/page.tsx` (Overview) and `insights/page.tsx`
  both read exclusively through these helpers, so neither can
  distinguish a failed read from an empty account yet, and the new
  `error.tsx` backstop above has nothing to catch until `lib/data.ts`
  actually throws (or returns `{ error }`) instead of swallowing.
  `lib/data.ts` is not under this pass's file ownership (`apps/web/src/
  app/dashboard/**` and `apps/web/src/components/` only) — the plan's
  own "Surfaces to update" list for this item names it explicitly, so
  closing it is the next owner's job, not skipped by oversight. Also not
  touched: `useProfile.ts` (named in the item's surfaces list, not in
  this pass's ownership), and the settings/onboarding/permission
  write-path fixes named above.

**Tests**: `npm run test -w @voice-expense/ai` → 162 passed | 1 expected
fail | 2 todo (up from 154 passed at the start of this pass — 6 new
`scanParser.test.ts` cases + 2 new golden-corpus rows). `npm run test -w
@voice-expense/mobile` → all green. `npm run test -w @voice-expense/web`
→ 24 passed, unaffected (no component-test harness exists yet for
`apps/web`'s client pages). `tsc --noEmit` clean on every file this pass
touched in all three packages (unrelated pre-existing/concurrent errors
from other in-flight Stage 2 items — `dashboard/page.tsx`'s
`buildMonthDays`, `KPI.tsx`'s `Money` prop typing, `record.tsx`'s
`Modal` import — observed but not this pass's to fix). No test added for
`VoiceConfirmModal.tsx`'s new clarification buttons or `record.tsx`'s
scan-rejection branch: both are plain, low-complexity conditionals
verified by type-checking + code review; a real regression test needs an
`apps/mobile` component-mount harness (the `BottomSheet.test.ts`
pattern) that reaches record.tsx's full hook tree (auth/voice/camera),
which is a bigger lift than this pass's remaining budget — left as a
gap, not silently skipped.

### The capture flow fits on the screen + duplicate Day-2 notifications (fix-plan item 2.14 + carried-forward 1.8 gaps, Aug 9 2026)

**Duplicate notifications (owner-reported: four "Anything to capture?"
reminders in 21 minutes).** Root cause was a non-atomic cancel-then-
schedule sequence in `dayTwoDunning.ts`'s `scheduleDayTwo`: it already
cancelled the previous notification before scheduling a new one, but two
overlapping calls (a sync batch or a burst of quick captures each firing
`useDayTwoDunning`'s effect) could both read the same stored notification
id, both cancel it, and each schedule its own replacement — only the last
writer's id survives in SecureStore, orphaning every earlier "new"
notification with no way to ever be cancelled again. Fix: every read-
cancel-schedule-write sequence in `dayTwoDunning.ts` now funnels through
one module-level promise queue (`serialized()`); public `scheduleDayTwo`/
`cancelDayTwo` are queued, internal `*Unsafe` helpers are used for the
in-turn cancel-before-schedule to avoid self-deadlocking on the queue.
Reproduced the exact reported shape first (stashed the fix, watched 4
concurrent calls leave 4 orphaned notifications in the new test, restored
the fix, watched it drop to 1) before trusting the regression test.
`useDayTwoDunning.ts`'s mount-time "ensure scheduled" check additionally
gained a module-level once-per-launch flag — the tabs layout can remount
within one app launch (sign-out/sign-in, Fast Refresh), which used to
re-enter the cold-start branch every time; same re-arm-on-remount shape
as `07-F15`, so it got the same guard.

**`07-F15` — the launch-services re-arm.** `app/_layout.tsx`'s
`seedDefaultCategories`/`runRecurringCatchUp`/`runFxBackfill` lived
inside the routing effect, whose dependency array includes `segments`
(a new array on every navigation), so all three re-ran — and re-issued
their Supabase round-trips — on every tab switch and screen push. Moved
to their own effect keyed on `session?.user?.id` alone, and each call now
goes through new `src/services/launchOnce.ts`'s `runOncePerSession(key,
fn)` — a module-level in-flight/done cache keyed on `` `${name}:${userId}` ``
so it fires exactly once per signed-in session, re-arms correctly for a
different user, and one service's rejection (`.catch()`'d) can't wedge
the other two or throw an unhandled rejection.

**2.14 — paddingBottom sweep (audit 01-F13), all ten named sites plus a
full re-grep confirming no others exist in `apps/mobile`.** Five screens
with the floating tab bar visible (`(tabs)/{index,budgets,insights,more,
record}.tsx`, both the Voice and Manual tabs) plus `ListeningView.tsx`
(full-screen takeover of the Record tab, tab bar still floats over it)
and `DayOneFirstLog.tsx` (rendered inside the Today tab) now compute
`useTabBarClearance()` in the component body and apply it as an inline
style override, replacing the `110`/`120`/`140` literals `src/theme/
chrome.ts`'s own doc comment names as the exact numbers this sweep was
for. `more/transactions.tsx` and `more/help.tsx` are tab-less Stack
pushes with no floating bar — their `SafeAreaView edges={['bottom']}`
already reserves the home-indicator inset, so their literals dropped to
a plain `24`, not `useTabBarClearance()` (which would have double-counted
the safe area there).

**Modal → `onRequestClose` (audit 01-F14), all 8 named sites; `<BottomSheet>`
migration where 2.14's own text names it.** `settings.tsx`'s five broken
modals (export/currency/locale/API-URL/display-name) plus
`BudgetEditorModal.tsx` and `CategoryPicker.tsx` got `onRequestClose`
added directly — 2.14's change paragraph doesn't ask for a full
`<BottomSheet>` rewrite of these, so a minimal, spec-matching fix. The
four sheets the item names explicitly (`VoiceConfirmModal` — already done
by a concurrent pass, not owned here; `record.tsx`'s Manual-tab More-
options sheet; `IncomeEditorModal.tsx`; the Insights month picker) are
now all `<BottomSheet>`. The Insights migration also closes `01-F18` in
passing: the old month sheet was a bare `<View>` with no stop-propagation
`Pressable`, so a tap anywhere in its own padding (not just the backdrop)
dismissed it — `BottomSheet`'s body swallows its own touches by
construction.

**`01-F37` KAV coordinate-space bug, the `transaction/edit.tsx` site.**
New `src/hooks/useKeyboardLift.ts`: measures the target view's true
window position via `measureInWindow` on every keyboard frame change and
computes the overlap against the keyboard's own window-space `screenY`,
sidestepping RN's `KeyboardAvoidingView` entirely rather than guessing a
`keyboardVerticalOffset` (the patch-stacking F37 explicitly rejects).
`edit.tsx` no longer renders a `KeyboardAvoidingView`; a `marginBottom:
lift` `Animated.View` shrinks the ScrollView-plus-pinned-footer column by
the keyboard's real overlap, the same visual effect as KAV's `'padding'`
behavior. The overlap arithmetic itself (`computeKeyboardOverlap`) is
exported and unit-tested directly, plus a `react-test-renderer` mount
proving the hook drives off `measureInWindow`, not a cached layout frame.
`VoiceConfirmModal`'s and the shared `<BottomSheet>`'s instances of F37
were already fixed by earlier passes; `more/ask.tsx`'s KAV (F37's third
named site) is not owned by this pass.

**Onboarding income screen (audit 01-F1's other named overflow).**
`(onboarding)/income.tsx` was a fixed, non-scrolling flex column that
overflowed its own viewport on every iPhone except the Max sizes, pushing
Continue off-screen with no way to reach it. Wrapped in a `ScrollView` +
`KeyboardAvoidingView` shape copied from `(auth)/sign-in.tsx` (the one
F37 calls out as already correct, because its `SafeAreaView` is the
screen root) and pinned Continue as a fixed footer outside the scroll.

**`validateAmount` (audit 01-F1/01-F34) — new `packages/shared/src/
utils/validation.ts`.** One shared amount validator (`>0`, ≤2 decimals,
≤ the `numeric(14,2)` ceiling) replacing the bare `isNaN(parseFloat(...))
|| <= 0` checks in `record.tsx`'s manual save and `edit.tsx`'s save —
wired into both the Save-button `disabled` computation and the save
handler's own check, with two new locale keys
(`voice.amount_too_large`/`voice.amount_too_many_decimals`, all four
`en/fr/es/pt` JSONs) so a rejection renders an explicit message instead
of the button staying enabled and doing nothing. `record.tsx`'s on-screen
keypad already structurally blocked >2 decimals, so `edit.tsx`'s free-text
field is the one path that can actually reach the two new reasons.

**`router.navigate` over `router.push('/(tabs)')` — `record.tsx`'s four
close/save paths** (voice-confirm success, manual-save success, the
close button, `ListeningView`'s cancel): `record.tsx` *is*
`/(tabs)/record`, so `push` stacked a second instance of the tabs
navigator on top of itself on every single capture.

**`MOBILE_PRESENTATION` lint flip (item's own file-ownership note).**
Split `eslint.config.mjs`'s bundled `paddingBottom`/`<Text>` selectors
onto independent rule names (`local/mobile-clearance-restrictions` vs.
the `<Text>` i18n selector staying under the shared, still-`off`
`no-restricted-syntax` key) — flat config merges by rule key, not
selector, so they couldn't be flipped independently otherwise, same
reason `period-restrictions` got its own alias in 1.1. Flipped the
clearance rule to `'error'` after a repo-wide grep confirmed zero
remaining `paddingBottom >= 100` literals; verified the rule actually
fires against a scratch fixture before and after.

- **Not touched, out of this pass's file ownership**: `VoiceConfirmModal.tsx`
  (already on `<BottomSheet>` when this pass started — a different
  concurrent item), `more/ask.tsx` (F37's third KAV site), `transaction/
  [id].tsx`'s `Money` prop-shape errors (pre-existing/concurrent, item
  2.6's surface), `CategoryPicker.tsx`'s F15 keyboard-inset gap (only
  `onRequestClose` was in this item's scope for that file).

**Tests**: new `apps/mobile/src/services/__tests__/{dayTwoDunning,
launchOnce}.test.ts` (4 + 4 tests), `apps/mobile/src/hooks/__tests__/
{useDayTwoDunning,useKeyboardLift}.test.ts` (4 + 6 tests), `packages/
shared/src/utils/__tests__/validation.test.ts` (10 tests) — all new
tests confirmed to fail against the pre-fix code (stashed each fix in
turn) before confirming they pass against it. `npm run test -w
@voice-expense/mobile` → 87 passed (up from 83). `npm run test -w
@voice-expense/shared` → 193 passed, 1 pre-existing failure in
`recurringPatternDetector.test.ts` unrelated to this pass (a different
concurrent item's own in-flight test/implementation mismatch — not a
file this pass touched or owns). `tsc --noEmit` clean on every file this
pass touched; `eslint .` repo-wide → 0 errors (pre-existing warnings
only, all `Unused eslint-disable` for a `react-hooks/exhaustive-deps`
rule that isn't enabled in this config).

### Money on screen + currency change as a migration + the transaction's own date (fix-plan items 2.6 + 2.7 + 2.8, Aug 9 2026)

**2.6 — money on screen.** Made the omission of a currency/locale
compile-impossible instead of fixing call sites one at a time:
- **`Money.tsx` rewritten on both platforms.** Mobile: deleted `sign?:
  string` (defaulted to `'$'`) and the hard-coded `.toLocaleString(
  'en-US')`; both are now `currencyCode: string` / `locale: string`,
  required, consuming 1.4's `formatMoneyParts` for digits/grouping/
  symbol-placement instead of hand-rolling them. Web: `locale` dropped
  its `= 'en'` default (every existing call site already threaded a
  real locale — grepped, none relied on the default) and its own
  hand-rolled `formatToParts` call was replaced with the same shared
  `formatMoneyParts`, so both renderers are now one formatter, not two.
  This *does* break the 8 call sites elsewhere in the app that still
  omit `sign`/`currency` — `index.tsx`, `insights.tsx` (×2),
  `transaction/[id].tsx`, `HistoryHeatmap.tsx` (×2), `ListeningView.tsx`
  — deliberately: those files are outside this pass's file ownership
  (owned by the 2.4/2.5/2.9 passes per the parallel-agent split), and
  the compile break *is* the enforcement mechanism the audit asked for.
  Confirmed via `tsc --noEmit` mid-pass that most were picked up and
  fixed by their owning passes before this one finished (`recurring.tsx`
  and `TransactionRow.tsx`'s `sign` errors disappeared between two
  typecheck runs); `index.tsx`/`insights.tsx`/`transaction/[id].tsx`/
  `HistoryHeatmap.tsx`/`ListeningView.tsx` were still outstanding at
  handoff — not a miss, the owning passes' work.
- **`AmountAdjustChips.tsx`** — added required `currencyCode`/`locale`
  props, replaced the hard-coded `[-1, 1, 5, 10]` delta labels
  (`` `−$${d}` ``) with a per-currency magnitude table,
  `amountAdjustDeltasFor()` (new, additive export in
  `packages/shared/src/utils/currency.ts`) — JPY/XAF/NGN/GHS get
  proportionally larger static steps so a delta chip is a real
  correction, not smaller than the currency's own rounding noise.
  `VoiceConfirmModal.tsx`'s one call site updated to pass
  `parsedExpense?.currency`/`locale` through (already in scope there).
- **`apps/web/src/components/lenses/Calendar.tsx`'s day-detail row** —
  the one site this pass owned in that file (not the date-boundary
  rewrite, which is 2.4's). Landed mid-pass into a file the 2.4 pass was
  concurrently rewriting to the `LensDay`/`props.days` architecture —
  reapplied after their rewrite superseded the first attempt. Their
  rewrite had already added `currency_code` to `LensTxn` for exactly
  this purpose (matching doc comment), which unblocked the fuller fix
  the item's text actually asks for: each transaction row now renders
  in `t.currency_code` (was: raw `t.amount` under the profile's own
  symbol) with the profile-currency figure as a muted `≈` secondary
  when the two differ, instead of a number that silently didn't sum
  into the day total above it.
- **Not touched, out of this pass's file ownership**: the 11 call sites
  named above, `onboarding/income.tsx` (explicitly another agent's
  file), `RecurringPatternBanner.tsx`'s `"USD 42.00"` string,
  `SafeToSpend.tsx`, the twelve web `fmt` helpers / `MiniBars`/
  `HistoryHeatmap` raw-`amount` sums (05-F29/05-F14) beyond the one
  Calendar.tsx site named above.

**2.7 — currency change as a migration, not a label swap.** A currency
change was `await updateProfile({ currency_code: c })` and nothing
else — every historical `amount_in_profile_currency` kept its old
magnitude under a new symbol, permanently. Built as a real
re-denomination:
- **New migration `026_snapshot_currency.sql`** (numbered 026, not the
  item text's suggested 023 — 025 was already claimed by the concurrent
  2.1 pass's `025_recurring_rule_fx_and_anchors.sql` when this one
  landed; checked `ls supabase/migrations/` immediately before writing
  to avoid the collision). Adds `transactions.snapshot_currency`
  (which currency a filled snapshot targets — the missing half of the
  invariant that makes "already correct" distinguishable from "correct
  for a currency we no longer use") and `profiles.monthly_income_currency`
  (closes the same gap on the previously-bare `monthly_income` numeric),
  both with the same 3-uppercase-letter format `CHECK` migration 021
  established, both backfilled from each row's/profile's *current*
  currency (the only correct backfill value, since no prior code path
  could have produced a snapshot in any other currency).
- **New `supabase/functions/change-currency/index.ts`** — not in this
  pass's originally-named file list (which named the migration
  explicitly but not an edge-function directory), added because 2.7's
  own text offers "a new edge function *or* a SECURITY DEFINER SQL
  function" and the SQL-function route isn't practically viable here:
  the re-denomination needs a live FX rate per (transaction's own
  currency → new currency, that transaction's own historical date),
  which means outbound HTTP to frankfurter.app, and this project has
  no synchronous-HTTP Postgres extension (`pg_net` is async-only,
  already used elsewhere in this repo for fire-and-forget cron pings,
  not a fit for hundreds of sequential rate lookups inside one
  statement-timeout budget). Follows the existing `fx-backfill/index.ts`
  edge function's exact shape but deliberately carries **no
  service-role key** — `transactions`/`budgets`/`profiles` all already
  have `USING (auth.uid() = user_id)`-style RLS, so the function runs
  entirely as the caller via their own JWT (`createClient(url,
  ANON_KEY, { global: { headers: { Authorization }}})`), one fewer
  function on the service-role surface, in the direction 0.4 already
  took the desktop shell and `delete-user`. Batched (200 transactions/
  call, matching `fx-backfill`'s own cap) and resumable — each
  invocation converts transactions whose `snapshot_currency` doesn't
  yet match the target and returns `{ done: false, remaining }`;
  `budgets.amount`/`profiles.monthly_income`/`profiles.currency_code`
  are only touched on the invocation that finds *zero* transactions
  left, and `currency_code` is the very last write of all — so a
  failure anywhere (a bad rate lookup, a network drop, the app killed
  mid-run) provably leaves the profile on its old currency, satisfying
  the item's "Done when" interrupted-run bar without needing a
  dedicated resume-checkpoint column.
- **`apps/mobile/src/services/profileCurrency.ts`** — added
  `changeCurrency(newCurrency, onProgress)`, which loops the edge
  function to completion (bounded at 200 calls), refuses outright via
  `syncManager.online` when offline, and updates the in-memory
  profile-currency cache only once the server confirms `done: true`.
  `apps/mobile/app/more/settings.tsx`'s currency-change flow (the only
  part of that file this pass owned) now: refuses offline with an
  explanation, shows an explicit "this will convert N transactions…"
  `Alert.alert` confirmation before doing anything, blocks the picker
  (cancel disabled, mid-run) with a progress row while converting, and
  on completion calls `refetchProfile()` + `syncManager.pullRemote()`
  so the screen doesn't keep showing the pre-conversion snapshot. Eight
  new locale keys added to all four `en/fr/es/pt` JSONs for the new
  copy.
- **`apps/mobile/src/services/fxBackfill.ts`** — self-heals after an
  interrupted or pre-2.7 currency change: predicate widened from
  `amount_in_profile_currency IS NULL` to `... IS NULL OR
  snapshot_currency <> profileCurrency` (via `.or()`, since PostgREST
  `.neq` never matches a NULL column — the pre-2.7 backfill migration
  step makes every currently-filled row's `snapshot_currency` non-null,
  so this is safe), and every write now also stamps `snapshot_currency`.
- **Collateral, mechanical fixes required by the schema change** (not
  a scope decision, a compile requirement): `packages/shared/src/types/
  database.types.ts` and `supabase/functions/_shared/database.types.ts`
  hand-updated with the two new columns (both files carry a "hand-
  updated, not yet regenerated" note already, following the pattern the
  concurrent 2.1 pass established for its own migration 025 columns);
  `apps/mobile/src/services/sync/transactionStore.ts`'s `rowToTransaction`,
  `apps/mobile/src/services/recurringCatchUp.ts`'s generated-occurrence
  writer, and `apps/mobile/src/services/sync/__tests__/localDb.migration
  .test.ts`'s `fullTransaction()` fixture all construct a full
  `Transaction` object and needed the one new required field threaded
  through (`null` where no snapshot exists yet, `profileCurrency` where
  one was just taken) — none of these three files are in this pass's
  named ownership, but leaving them broken would have blocked
  `apps/mobile` from typechecking at all, for every pass, not just this
  one.
- **Not built**: `apps/web/src/app/dashboard/settings/page.tsx`'s web
  currency-change flow — named in the item's surfaces list, not in this
  pass's ownership (mobile `settings.tsx` only). Web can still only
  bare-swap `profiles.currency_code` until that page is wired to the
  same edge function.

**2.8 — the transaction's own date.** `createTransaction` accepted no
`transacted_at` field and unconditionally wrote `now`, so every parser
that already computed a real date (voice "yesterday", the scan prompt's
printed receipt date) had it silently discarded:
- **`useTransactions.ts`'s `createTransaction`** — field type extended
  with `transacted_at?: string` (defaults to `now` only when absent).
  The resolved date now also drives `snapshotFx`'s rate lookup and
  `local_day` — previously both were unconditionally `now`, which
  "agreed" with `transacted_at` by accident; fixing only one would have
  converted a backdated foreign-currency row at the wrong day's rate.
- **`VoiceConfirmModal.tsx`** — `ConfirmedExpense` gained `transactedAt:
  string | null`, threaded from `parsedExpense.transacted_at` (already
  present on the typed parse boundary since 1.7 — this pass only wired
  it to `onConfirm`, since `ParsedExpense.transacted_at` was already
  being computed and validated). Scoped to threading only, per this
  pass's file ownership — no date-editing UI added to the confirm sheet
  itself (the item's text also asks for that; it's a bigger surface
  change than "thread the field through" and wasn't part of this pass's
  carve-out of this file).
- **`useVoice.ts`** — audited, no change needed: it already stores the
  whole `ParsedExpense` (including `transacted_at`) rather than
  destructuring specific fields, so the date was already reachable;
  nothing in this hook discarded it.
- **Not built** (named in the item's surfaces list, not in this pass's
  ownership): `record.tsx` wiring `expense.transactedAt` into its
  `createTransaction()` call (the field now exists on both ends but the
  one file that connects them isn't owned here), `transaction/edit.tsx`'s
  date-editing control, `useNotificationListener.ts`'s date derivation,
  and `generate-recurring/index.ts`'s / migration `011`'s FX-date
  correction.

**Tests**: `npx vitest run` — `packages/shared` 194 passed (added 3
cases for `amountAdjustDeltasFor`); `apps/mobile` 87 passed; `apps/web`
24 passed — all unaffected by this pass's changes (confirmed by running
before and after; the `recurringPatternDetector.test.ts` failures seen
mid-pass were the concurrent 2.3 pass's own in-flight state, resolved
on their end before this pass finished, not touched here).
`tsc --noEmit` clean in `apps/web` and clean in `apps/mobile` for every
file this pass owns; the 7 remaining `apps/mobile` errors are the
`Money`/`sign` call sites named above, all outside this pass's
ownership. `packages/shared`'s `tsc --noEmit` has two pre-existing
failures in `src/types/__tests__/database.types.test.ts` (fixtures
missing `local_day`/`occurrence_date` — confirmed via `git stash` that
these predate this pass entirely) plus one more property
(`snapshot_currency`) this pass's own migration added to that same
already-broken list; not fixed here (file not owned by this pass).
No regression test added for `createTransaction`'s `transacted_at`
threading (2.8's own regression-test ask) — `createTransaction` is a
closure inside the `useTransactions()` hook, and this repo has no
hook-render test harness yet (`apps/mobile/vitest.config.mts` is
explicitly scoped to plain-TS logic, "component tests need RN/jsdom
mocking that Stage 2 will set up separately") — same documented gap the
2.9+2.13 entry above hit for `VoiceConfirmModal`'s new buttons, not a
new one.

### Recurring aggregation, rule creation, generation/dedup, and the source column (fix-plan items 2.1 + 2.2 + 2.3 + 2.12, Aug 9 2026)

Verified each item's full text against HEAD (Stage 1's shared engine —
`nextOccurrence`/`occurrencesInWindow`/`chargesInWindow`/
`monthlyEquivalent` — and migration 013/014's server-side trigger for
rule creation were already live) and closed the remaining Stage 2 gaps
within this pass's file ownership.

**2.2 — rule creation.** Confirmed already closed: `link_or_create_
recurring_rule()` (migrations 013/014) creates-or-links the rule
transactionally with the transaction write, so the FK-race this item
describes cannot occur for the primary path (any writer setting
`is_recurring = true`). `useRecurringRules.createRule` is not a second
transport for that path — its only remaining caller is the "accept a
detected pattern" flow, which templates an *already-logged* transaction
and so never races the FK. `RecurringRule`'s own doc comment already
recorded this architecture. No `findRuleForTransaction`/`edit.tsx`
two-direction-lookup work done — outside this pass's file ownership.

**2.1 — aggregation correctness.**
- `packages/shared/src/domain/recurrence.ts`: new `recurringOutflowInWindow`/
  `recurringInflowInWindow` — direction-filtered, FX-normalised (via the
  rule's own `amount_in_profile_currency` snapshot), every-occurrence-in-
  window sums.
- New migration `025_recurring_rule_fx_and_anchors.sql`: `recurring_rules`
  gets `amount_in_profile_currency`/`fx_rate_to_profile`/`fx_rate_date`
  (had none before — nothing to convert with) and the trigger now also
  populates `anchor_day`/`anchor_weekday`/`anchor_time` (020's columns,
  previously always null from this path) from the transaction's own date
  in the profile's timezone, copying the FX snapshot straight off `NEW`
  rather than a second lookup. Backfills both from each rule's template
  transaction.
- `useRecurringRules.ts`: deleted the hand-rolled `getPeriodBounds`
  (biweekly ended *today*; weekly could span 38 days across a month
  boundary) in favour of shared `periodBounds`; `computeUpcomingRecurring`
  now composes it with `recurringOutflowInWindow` — same exported
  signature, so its two existing callers (`(tabs)/index.tsx`,
  `(tabs)/budgets.tsx`, both outside this pass's ownership) needed no
  changes. `createRule`/`updateRule` snapshot/re-snapshot FX on create,
  merge and amount-edit.
- `recurring.tsx` (mobile) / `recurring/page.tsx` (web): deleted the
  hand-rolled `TO_MONTHLY` table; the hero/Stat totals now filter to
  `direction === 'debit'` and use the FX-adjusted amount (credit rules no
  longer inflate them) — mobile also gained a labelled "+ $X/mo from
  income" line so the credit total isn't just dropped, matching "two
  labelled figures, never one conflated number." Web's `acceptCandidate`
  now anchors `starts_at` (not just `last_generated`) to the candidate's
  own date — it was setting `last_generated: c.lastSeenAt` but
  `starts_at: now()`, which is its own latent bug: with no anchor columns
  set, `resolveAnchor` derives the day-of-month clamp from `starts_at`,
  so an accepted bill would have clamped to whatever day it happened to
  be accepted on, not the bill's real day.
- Overdue rules (03-F24): both platforms now render "Overdue — pending
  generation" instead of a stale past date when the rule's mechanically-
  next occurrence (from its own `last_generated`) already fell in the
  past, rather than sorting/displaying it as imminent.
- Web's "Potential savings" now sums `monthlyEquivalent` over every
  candidate instead of `c.frequency === 'monthly' ? c.amount : 0` — the
  old sum silently dropped every non-monthly candidate while `reviewCount`
  (the same list's length) still counted it.
- `apps/web/src/app/dashboard/recurring/page.tsx`'s `chargesIn30Days`
  now calls the shared `chargesInWindow` instead of a hand-rolled
  `while (nxt <= horizon && safety < 60)` loop; the file's
  `local/period-restrictions` file-level `eslint-disable` and the config-
  level exemption for `apps/mobile/src/hooks/useRecurringRules.ts`
  (`eslint.config.mjs`) are both removed — re-grepped both files for the
  restricted patterns first, confirmed clean.

**2.3 — generation, catch-up, dedup.** `apps/mobile/src/services/
recurringCatchUp.ts` rewritten: (a) duplicate guard broadened —
`findLiveManualMatch` looks for *any* live, non-generated transaction
with a merchant match within +/-3 days before generating, not just one
already carrying this rule's id, and links it (sets `recurring_rule_id`/
`occurrence_date`) instead of shadowing it with a duplicate; (b) the
hand-rolled `while (next && next <= now && safetyLimit > 0)` loop is
gone in favour of the shared `occurrencesDue` — "both writers now call
this one generator" now also true for mobile, not just the (unowned)
edge function; (c) a module-level in-flight promise guard on
`runRecurringCatchUp` itself, independent of whether `_layout.tsx`'s own
re-entrancy fix (outside this pass's ownership) lands, since two
concurrent runs racing the same rule's `last_generated` is a hazard on
its own; (d) `occurrence_date` is now set from the engine's own resolved
civil day rather than left `null` for `upsertTransaction` to derive. Pattern
detector (`packages/shared/src/domain/recurringPatternDetector.ts`,
shared by both platforms since Stage 1): bucketing is now merchant-only
with chronological amount-tolerance sub-clustering (20% relative to the
running mean) instead of exact-cents — a variable bill ($9.99 → $10.99)
is one 3-occurrence cluster, not a dropped 1-occurrence bucket plus a
2-occurrence one; suppression is now by `recurring_rule_id` identity
(handles rename/unnamed/pause correctly, replacing the `(name, amount)`
match against `existingRules`); the `is_recurring` skip is deleted per
2.2 ("a flagged transaction does not imply a rule exists"); cadences
slower than monthly require >= 3 occurrences; every inter-occurrence gap
must be within +/-25% of the cluster's median gap. **Not done**: the Edge
Function (`supabase/functions/generate-recurring/index.ts`) still has its
own one-occurrence-per-run loop and the mobile-side duplicate guard has
no server-side twin — both outside this pass's file ownership.
`_layout.tsx`'s re-entrancy fix for the launch-services effect is also
outside this pass's ownership (a concurrent pass's `launchOnce.ts`
appears to address the sibling services already).

**2.12 — source column.** New `packages/shared/src/domain/source.ts`:
`sourceLabel(source)`, a 1:1 map matching web's already-shipped (commit
`09f7a7a`) five-bucket vocabulary (Voice/Typed/Scanned/Apple Pay/Auto —
`shortcut` and `notification_listener` both read "Apple Pay") so a
future consumer on either platform can't drift from the other. **Not
wired up**: `apps/mobile/app/transaction/[id].tsx`'s own `humanSource()`
(Voice/Manual/Receipt scan/Apple Pay Shortcut/Payment notification/
Recurring · auto-generated — a different vocabulary from web's) is the
actual site of the "mobile doesn't match web's source vocabulary" gap
this item's task described, but that file is outside this pass's file
ownership; `apps/mobile/app/more/transactions.tsx` and `TransactionRow.tsx`
(both owned) were audited and already report source correctly via icon
glyphs (mic for voice, repeat for recurring — never conflating the two),
so nothing there needed to change for this item.

**Also fixed in passing** (blocking builds, within owned files): both
`TransactionRow.tsx` and `recurring.tsx`'s `<Money>` calls updated from
the retired `sign?` prop to the concurrent 2.6 pass's new required
`currencyCode`/`locale` props — the two call sites in this pass's owned
files that the 2.6 sweep hadn't reached yet when this pass ran.

**Residual gaps for whoever owns these files next**: `apps/mobile/src/
services/sync/transactionStore.ts`'s `upsertTransaction` still recomputes
`occurrence_date` from `transacted_at.slice(0, 10)` (a UTC-day slice)
instead of honouring the caller-supplied value — the DST-boundary
mismatch migration 020 exists to fix is only half-closed until that
line prefers the passed-in `occurrence_date`. `apps/mobile/app/
transaction/[id].tsx`'s `humanSource` (2.12, above). The edge function's
one-per-run generation loop and its own duplicate guard (2.3, above).

**Tests**: `packages/shared` 194 passed (added tolerance-clustering,
gap-variance, and identity-suppression cases to
`recurringPatternDetector.test.ts`, and rebuilt its `txn()`/`rule()`
fixtures to satisfy the current — now larger — `Transaction`/
`RecurringRule` shapes, a pre-existing gap unrelated to this pass that
was blocking `tsc --noEmit` for the file this pass owns); `apps/mobile`
87 passed; `apps/web` 24 passed. `tsc --noEmit` clean for
`apps/web`, `apps/mobile` (except the pre-existing, unowned `Money`
call-site sweep — `(tabs)/index.tsx`, `(tabs)/insights.tsx`,
`transaction/[id].tsx`, `HistoryHeatmap.tsx`, `ListeningView.tsx`, all
the concurrent 2.6 pass's remaining ground) and `packages/shared`
(except the pre-existing `database.types.test.ts` failures noted in the
2.8 entry above, unrelated to this pass — confirmed by the missing
fields being `local_day`/`occurrence_date`/`snapshot_currency`, none of
which this pass's migration touches). `eslint` clean (0 errors) on
every file this pass touched.

### One month window/calendar grid, and one budget window/budget status (fix-plan items 2.4 + 2.5, Aug 9 2026)

**2.4 — the RSC-boundary `Date` is gone.** `LensProps` no longer carries
`monthStart`/`monthEnd: Date` — replaced with `windowStart`/
`windowEndExclusive` (half-open ISO instants from `monthBounds`),
`monthIso`, `timezone`, `todayIso`, and a `days: LensDay[]` array
(`{dayOfMonth, isoDate, weekdayIndex, windowStart, windowEndExclusive,
spendTotal, incomeTotal, txns}`) bucketed **once**, in `dashboard/
page.tsx`'s new `buildMonthDays()`, through `period.ts`'s
`civilDateTimeToInstant`/`addDays`/`localParts` — the loop terminates by
letting `Date.UTC`'s own month-overflow normalize day 32+ past
`endExclusive` rather than computing "days in month" separately.
`monthDebits`/`monthCredits`/`monthTxns` (`lenses/types.ts`) now compare
ISO strings against those bounds instead of constructing `new
Date(t.transacted_at)` and comparing `Date` objects.
- **`Calendar.tsx`** rewritten to consume `props.days`/`props.todayIso`
  instead of `new Date(year, monthIdx±1, ...).getDate()/.getDay()` —
  those ran in the *browser's* local zone regardless of the profile's,
  which is the exact "Aug 1 2026 under the wrong weekday column"
  mechanism the item names. Selection state is now the day's `isoDate`
  string, not a bare day number, so switching months can't leave a
  stale selection pointing at a day that doesn't exist in the new month.
  The day-detail panel's per-row currency fix (each row in its own
  `currency_code`, the converted figure as a muted `≈` secondary) landed
  from a concurrent 2.6 pass mid-flight — verified it composes correctly
  with `LensDay.spendTotal` here rather than redone.
- **`Cashflow.tsx`**: the O(days × transactions) per-day scan (`new
  Date(t.transacted_at)` compared field-by-field against `year`/
  `monthIdx`/`d`) is deleted; the balance-line/bar-chart points are read
  straight off `props.days`. Kept `LensDay.spendTotal`/`incomeTotal` as
  **raw** debit/credit sums (not transfer-excluded) to preserve this
  file's own documented "transfers really do leave the checking balance"
  behavior — `money.ts`'s transfer-excluding `expense` stays reserved for
  `monthSummary()`'s KPI-header figures, which both Calendar's and
  Cashflow's original code already matched (neither used `isSpend`
  before this pass; this pass didn't introduce a classification change
  it wasn't asked for).
- **`Matrix.tsx`**: `buildMonths` no longer builds `new Date(anchorYear,
  anchorMonth - i, 1)` (browser-zone month stepping) — resolved via
  `addMonthsClamped`/`monthBounds` in `props.timezone`, and the
  category-into-month bucketing compares `t.transacted_at` against each
  month's half-open ISO bounds instead of `Date` range comparison.
- **`MonthPicker.tsx`**: `shift()` and the 24-month dropdown build no
  longer construct `new Date(y, m±n, 1)` — `shiftMonthIso`/
  `monthIsoLabel` route through `addMonthsClamped`/`monthBounds(…,
  tz)`, so "is this the current month" and the label text agree with
  the profile's zone rather than the browser's (the item's "last
  evening of the month" `done-when` case). The file-level `eslint-
  disable` is removed.
- **`recurring/page.tsx`** (2.4's own slice of this file — the "Next 30
  days" strip; the rest of the file is 2.3's, landed concurrently and
  already using `chargesInWindow`): the grid used to render
  `Array.from({length:30})` under a fixed `M T W T F S S` header, so
  day-offset 1 always started a fresh "Monday" row regardless of what
  weekday today actually is. Added `next30Days` (real dates via
  `addDays`/`civilDateTimeToInstant`/`localParts`) and leading blank
  cells sized to `next30Days[0].weekdayIndex`, so offset 1 lands under
  its real weekday column; cells now show `dayOfMonth`, not the raw
  offset. Also swapped this page's `tz` source from the browser's
  `Intl.DateTimeFormat().resolvedOptions().timeZone` to
  `profile.timezone` (the comment justifying the browser fallback —
  "nothing writes that column from web yet" — was stale; `TimezoneSync`
  in `dashboard/layout.tsx` has written it since Stage 1) and added
  `timezone` to the page's `profiles` select.
- Added `currency_code` to `LensTxn` (was already independently added by
  a concurrent 2.6 pass to the day-panel row fix above — confirmed one
  addition, not two).

**2.5 — one `budgetStatus()`, both platforms.** New `packages/shared/
src/domain/budget.ts`: `budgetStatus(budget, txns, rules, tz,
atInstantIso?)` → `{spent, committed, remaining, pct, window,
pendingCount}`, routing the window through `periodBounds()`
exhaustively over all five `BudgetPeriod` values, anchored on
`resolveBudgetAnchor(budget.starts_at, tz)` (converts the bare
`budgets.starts_at` Postgres `date` to a real instant via
`civilDateTimeToInstant`, never `Date`'s implicit-UTC parsing of a
date-only string). `committed` = posted transactions dated later than
`atInstantIso` but still inside the window (a pre-logged future bill),
plus active debit recurring-rule occurrences due in the window that
haven't posted yet (matched/deduped by `recurring_rule_id` count vs.
`occurrencesInWindow(rule, ...).length`, per rule — not a boolean flag,
so a partially-posted weekly rule inside a monthly window doesn't lose
its remaining occurrences). Rule amounts prefer the FX-snapshotted
`amount_in_profile_currency` (migration 025, landed concurrently by the
2.1 pass mid-flight) and fall back to raw `amount` only when
`currency_code` already matches the budget's; otherwise excluded from
`committed` rather than summed at face value. 14 new tests in
`domain/__tests__/budget.test.ts` (all five periods' bounds, the
biweekly `[2026-08-15, 2026-08-29)` anchor case on both the 20th and
21st, the 40-days-future-is-outside-the-window case, the
still-in-window-future-date-is-committed-not-spent case, transfer
exclusion, rule/txn dedup, currency-mismatch exclusion, per-category
scoping, FX-pending exclusion).
- **`useBudget.ts`**: `usePeriodSpend`'s branch list used to end at
  `biweekly` with an `else` comment reading "monthly (default) and
  others" — quarterly/yearly silently got the monthly window. Rewritten
  to call `periodBounds()` for all five periods with a real end bound
  (previously none — a future-dated transaction always counted against
  "now"); kept its 2-argument call sites (`app/(tabs)/index.tsx`, not
  owned by this pass) compiling by making `tz` an optional 3rd param
  defaulting to the device zone (matching `useRecurringRules.ts`'s own
  precedent for un-migrated callers), and its return type unchanged
  (`number`, spend only) so that file's own separate recurring-total
  logic is untouched. Added `budgetStatusFor(budget, txns, rules, tz)` —
  a thin wrapper returning the full shared `BudgetStatus` — for
  `budgets.tsx`, which now uses it instead of `usePeriodSpend` +
  `useRecurringRules`' `computeUpcomingRecurring` (the direction/
  currency-blind sum 2.1 replaces at its own call sites; this pass just
  stopped calling it from the one file it owns). `setBudget_` gained an
  optional `tz` param (device-zone default) and now writes
  `starts_at: localDay(now, tz)` instead of relying on the DB's
  `CURRENT_DATE` default (Postgres server date, not the user's civil
  day) — matches web's insert (below).
- **`budgets.tsx`** (mobile): header "days to go" now derives from
  `budgetStatus(...).window.endExclusive` via the new
  `daysLeftInWindow()`, replacing `daysLeftInPeriod()`'s own hand-rolled
  weekly/biweekly/monthly cases (biweekly returned a hardcoded `14`, a
  conservative-upper-bound placeholder, not a real countdown) — the
  figure and the countdown beside it can no longer disagree about which
  window they describe (the item's named defect). Renders a third
  labelled line ("N committed") when `status.committed > 0`, sourced
  from `t('budgets.committed', locale)` (added to all four locale
  JSONs). Three `<Money>` calls fixed to pass the now-required
  `currencyCode`/`locale` (a concurrent 2.6-pass gap in this pass's own
  file).
- **`BudgetEditorModal.tsx`**: `BUDGET_PERIODS` only listed weekly/
  biweekly/monthly — quarterly/yearly are now included, so mobile can
  *create* a quarterly/yearly budget (previously only settable from
  web). Added `settings.period_quarterly`/`settings.period_yearly` to
  all four locale JSONs.
- **`apps/web/.../budgets/page.tsx`**: deleted the hand-rolled
  `periodStart()` (no end bound on any of its five branches). Overall
  and per-category rows now both call the shared `budgetStatus()`,
  fed `recurring_rules` (newly fetched, active only) and each
  transaction's joined `category_kind` (for `isSpend`'s transfer
  exclusion). Save flow: the `.eq('category_id', (categoryId || null) as
  string)` deactivation — which PostgREST silently never matched against
  `IS NULL`, so every "Save" on the overall budget appended a new active
  row instead of retiring the old one — is now `.is('category_id',
  null)` when unset / `.eq(...)` when set, with the stale `.eq('period',
  period)` filter dropped (a same-scope, different-period budget must
  still retire the old one) and the deactivation's own error now
  destructured and surfaced. Insert now sets `currency_code:
  profile.currency_code` (was silently defaulting to `'USD'` for every
  profile) and `starts_at: localDay(now, tz)`. New migration
  `027_budget_invariants.sql`: two partial unique indexes (`(user_id)
  WHERE category_id IS NULL AND is_active AND NOT is_deleted`; `(user_id,
  category_id) WHERE category_id IS NOT NULL AND ...`) make "at most one
  active budget per scope" the database's job rather than the
  now-fixed-but-still-just-application-code query above; a pre-index
  `UPDATE` deactivates all but the most-recently-created row per scope
  first, so the index creation doesn't fail against whatever duplicates
  the pre-fix no-op already accumulated in production. Realtime
  subscription extended to the `recurring_rules` table (feeds
  `committed`). Ring SVG is now gated behind `overall` entirely — the
  `!overall` branch previously still rendered `fmtShort(overallSpent)`
  under the caption "spent this month"; the item's own `done-when`
  ("zero budgets renders no currency figure inside the ring") required
  removing that branch's number, not just relabeling it. Header line now
  reads "$X spent · $Y committed · $Z cap" (only shows the committed
  clause when non-zero) instead of "used $X of $Y".
- Per-category row committed breakdown is folded into the one `spent`
  number shown per row (`status.spent + status.committed`) rather than
  rendered as its own labelled sub-line — the row layout is fixed-width
  and compact; the three-way breakdown is rendered at the overall-ring
  level only. Flagging this as a deliberate scope boundary, not an
  oversight, in case a future pass wants the per-row breakdown too.

**Deliberately not touched, confirmed out of this item's file
ownership:** `apps/mobile/app/(tabs)/index.tsx` (uses `usePeriodSpend`
and its own `computeUpcomingRecurring` call — 2.1's ground, not
2.4/2.5's); `apps/web/src/app/dashboard/insights/page.tsx` (named in
2.5's full surfaces list, not in this pass's grant); `useRecurringRules.
ts`'s `computeUpcomingRecurring` itself (still exists, still buggy per
2.1's own description — this pass only stopped calling it from
`budgets.tsx`, the one file it owns, per the item's "2.1 must ship
first" ordering note); `SpendingChart.tsx`/`CategoryChart.tsx`/`KPI.tsx`
(named in this pass's file-ownership grant; audited — zero real callers
anywhere in the app beyond a stray comment match, no date-window logic,
nothing to migrate).

**Tests**: `packages/shared` 194 passed (14 new, `domain/budget.test.ts`,
above). `apps/mobile` 87 passed. `apps/web` 24 passed. `tsc --noEmit`
clean for `apps/web`, `apps/mobile` (this pass's own files — the wider
mobile tree has pre-existing, unowned `Transaction`/`Money` fallout from
concurrent 2.6/2.7 passes still in flight), and `packages/shared`.
`eslint apps/web/src apps/mobile/app apps/mobile/src packages/shared/src`
clean (0 errors; 16 pre-existing warnings, all unrelated unused-
disable-directive/`no-img-element` notices). Removed this pass's five
files (`lenses/{Calendar,Cashflow,Matrix}.tsx`, `(tabs)/budgets.tsx`,
`useBudget.ts`) from `eslint.config.mjs`'s Stage-2 override block and
the three inline file-level disables (`MonthPicker.tsx`, `.../budgets/
page.tsx`, `.../recurring/page.tsx`) — re-ran `npx eslint` against all
eight to confirm `local/period-restrictions` actually fires clean there
now, not just removed the marker.

### Ask Murmur window/aggregation, insights that only claim what the data supports, and exports that reconcile (fix-plan items 2.10 + 2.11 + 2.15, Aug 9 2026)

Three items, one file-ownership grant: `apps/web/src/app/dashboard/
{insights/**,export/page.tsx,ask/page.tsx}`, `apps/mobile/app/(tabs)/
insights.tsx`, `packages/ai/src/{askMurmurTools.ts,askMurmur.ts}`
(window math + aggregation only — the sandbox-replacement half of 2.10
is out of this grant), `apps/mobile/src/services/exportData.ts`. Two
new shared domain modules land as part of this pass —
`packages/shared/src/domain/{forecast.ts,patterns.ts}` (2.11) and
`packages/shared/src/domain/export.ts` (2.15) — because "both platforms
render the same answer" is only true when both platforms call the same
function; a per-platform reimplementation of the same threshold is
exactly the class of drift this fix-plan exists to end.

**2.11 — insights.** `forecastMonthly(txns, recurringRules, now, tz)` →
`{ monthToDate, projected, range, usual, sampleMonths, confident }` and
`patterns(txns, window, tz)` (plus the individual `heaviestWeekday`/
`categoryShare`/`topMerchants`/`heatmap` detectors) are the one gate
both platforms render through now. Confidence: `≥2` complete prior
months **and** `≥10` distinct spending days in the trailing 90, OR `≥1`
complete prior month **and** day-of-month `≥10` — below that,
`projected`/`range` are `null` and both pages render "Not enough
history yet" instead of a run-rate. `monthlyAverage()` bounds the
trailing-month series by the account's first transaction (excludes a
month the account didn't exist in) while keeping a genuine `$0` month
inside it (05-F36/05-F37's "filtered out every zero month regardless of
cause" bug) — regression test asserts `[100, 0, 200]` with history
starting in the middle month averages `100`, not `100/3`. The point
estimate is `monthToDate + recurringCommitted(remaining via
chargesInWindow) + medianDailyVariable × daysRemaining` over a trailing
90-day, transfer-excluded, (when `is_recurring` is known) recurring-
excluded daily distribution; `range` is the same distribution's p25–p75
band, rendered as a second line rather than folded into one falsely-
precise figure. Pattern claims: weekday needs `≥4` observed instances
of that weekday **and** `≥12` total spend transactions, and divides by
the *actual* count of that weekday in-window (never a literal `12`);
category share's denominator is the **full** spend total, never a
truncated top-N subtotal (regression: 9 categories totalling 1000 with
Groceries at 200 reports `20%`, not `25%`); merchants need `≥5`
distinct before a comparative bar renders; the heatmap covers all 24
hours (not the old `[8,10,…,20]` set that silently dropped
17:00–02:59 for a Central user) and needs `≥20` transactions. Three
transactions on one day render no forecast, no weekday claim, and no
category-share claim on both platforms — the plan's own "Done when"
scenario, now a shared-module unit test rather than a per-platform one.
Mobile's category card previously divided by its own top-6 subtotal (so
six rows always summed to 100% regardless of how many categories
existed) — it now divides by the full total and appends an explicit
"Other · N" row for the remainder (new `insights.other` i18n key, all 4
locales). Both pages' month/window math is rebuilt on `period.ts`
(`monthBounds`/`addMonthsClamped`/`addDays`/`civilDateTimeToInstant`/
`localParts`) — mobile's `selectedMonth: Date` state became a
`selectedMonthKey: "YYYY-MM"` string so there is no `Date` identity left
to hand-roll getters from, which was the item's own named gap for this
file. Both inline `eslint-disable local/period-restrictions` headers
(web) and the `apps/mobile/app/(tabs)/insights.tsx` config-level
override entry are removed — re-ran `eslint` against both to confirm
the rule fires clean, not just that the marker is gone.

**2.10 — Ask Murmur, window math + aggregation slice.**
`askMurmurTools.ts`'s `buildWindows` was hand-rolled `new Date(y, m, d,
…)` construction plus local getters — which, unlike production's UTC
runtime, ran in whatever zone the *dev/test* process itself resolved to
(this sandbox: `America/Chicago`), a latent inconsistency the existing
test suite happened not to pin down because no fixture transaction sat
near the shifted boundary. Every window (`today`/`thisMonth`/
`lastMonth`/`thisYear`/`lastYear`/`last{7,30,90}Days`/`last{6,12}Months`)
is now composed from `period.ts` primitives (`civilDateTimeToInstant`/
`addDays`/`addMonthsClamped`/`monthBounds`/`periodBounds('yearly', …)`)
behind the existing `{start, end}` Date-pair sandbox contract, so the
29 existing `askMurmur.test.ts` assertions needed no changes — same
numbers, now architecturally guaranteed rather than incidentally
correct. `ToolContext` gained an optional `tz` field (defaults `'UTC'`)
as the forward-compatible seam for when the wire contract eventually
carries the user's IANA zone — that rename (`today: string` →
`now_utc` + `time_zone`, touching `packages/shared/src/types/ai.ts`,
the API route, and the mobile client) is outside this grant's three
files. `buildDataOverview`'s `total_debit`/`total_credit` and
`buildSummarySnapshot`'s category/monthly totals now route through
`summarize()`/`isSpend()` (fix-plan 1.4) instead of summing raw
`t.amount` — a Savings & Investing transfer no longer inflates "total
spend" here either, using `resolveCategoryKind`'s name-match fallback
since `AskMurmurTransaction` doesn't carry `category_kind` on the wire.
A new `pending_conversion_count` field surfaces FX-pending rows instead
of silently folding them in as `0`. `AskMurmurTransaction` also doesn't
carry `amount_in_profile_currency` yet (same out-of-grant wire-contract
rename) — `askMurmurTools.ts` accepts it as an additive optional field
via a local `WithProfileAmount<T>` intersection type and falls back to
`amount` when absent, so the aggregation is *already* correct the
moment a caller sends it. `apps/web/src/app/dashboard/ask/page.tsx` is
that caller: it now sends the real `t.amount_in_profile_currency` per
transaction (a €50 dinner sums as its converted figure, not $50), fixed
`today` to `localDay(now, profile.timezone)` instead of a UTC slice of
the browser's clock (the "8pm Central 'today' returns tomorrow's empty
window" defect, for the one client this pass owns), and replaced two
hand-rolled 90-day cutoffs (`Date#setDate`/`getDate`) with a
`daysAgoInstant()` composed from the same `period.ts` primitives.
`askMurmur.ts` itself needed no changes — read in full; it has no
window or aggregation logic, only prompt assembly and response
validation. **Deliberately not touched, confirmed out of this grant:**
the `node:vm` → closed-tool-set sandbox replacement, `response_format:
json_schema`, the `packages/shared/src/types/ai.ts` wire-contract
rename, `apps/web/src/app/api/ai/ask-murmur/route.ts`, and
`apps/mobile/src/services/askMurmurClient.ts` — all named in 2.10's own
"Surfaces to update" but outside "window math + aggregation only".

**2.15 — exports.** `packages/shared/src/domain/export.ts`'s
`buildExport({profile, transactions, categories, recurringRules,
dateFrom, dateTo})` is the one assembly point: it filters to the
half-open instant window `[dateFrom 00:00, dateTo+1 00:00)` in
`profile.timezone` (not a UTC-vs-local-component mismatch — the
`2026-09-01T01:00:00Z` / `America/Chicago` regression exports with date
`2026-08-31` and lands inside a 1–31 August range), builds one
normalized `ExportRow` per transaction (`date`/`time` via `localDay`/
`localParts`, both the native-currency `amount` and the converted
`amountInProfileCurrency`, plus `fxRate`/`fxDate`), and computes
`summary` via `summarize()` over the *same* filtered set the rows come
from — so a spreadsheet sum of the converted column and the header
total are the same computation, not two hand-rolled ones (regression:
a USD 50 + EUR 45→48.60 fixture sums rows to exactly `summary.expense
= 98.60`; a Savings & Investing transfer prints in the rows but is
excluded from the total, same as every other totals surface).
`exportSummaryJSON(result)` is the one canonical JSON shape — both
`apps/web/src/app/dashboard/export/page.tsx`'s and `apps/mobile/src/
services/exportData.ts`'s JSON buttons call it over their own
`buildExport()` result, so the two platforms' exports carry the same
top-level keys (`app`/`version`/`exported_at`/`currency`/`locale`/
`date_range`/`summary`/`transactions`/`categories`/`recurring_rules`)
by construction — a caller with nothing to report for `recurring_rules`
still gets the key, empty, never a missing one (regression test asserts
both a bare and a rules-populated call produce the identical sorted key
set). Web: CSV/PDF now emit `Amount`, `Currency`, `Amount
({profileCurrency})`, `FX rate`, `FX date` (CSV) / native + converted
columns (PDF autoTable), plus a pending-conversion footer note in both
when `summary.pendingCount > 0`; the date-range picker's "this month"
default is resolved via the browser's own `Intl`-reported zone (this
page only ever renders client-side, so that *is* the user's zone) and
`profile.timezone` drives every actual export bound once loaded; new
`recurring_rules`/`categories.kind` queries feed the export so a
Savings & Investing transfer classifies correctly. Mobile:
`ExportInput` gained optional `timezone`/`recurringRules`/`dateFrom`/
`dateTo` fields (additive — the existing callers,
`apps/mobile/app/more/{settings,privacy}.tsx`, are outside this grant's
file ownership and still pass the original four fields; `timezone`
defaults to the device's own resolved zone, which — unlike web — *is*
accurate here even without a caller passing `profile.timezone`, because
`profiles.timezone` is itself captured from this same device signal).
CSV/PDF/JSON all route through one `assembleExport()` so the three
formats can't disagree; PDF gained a second "Amount (profile currency)"
column and the same pending-conversion footer note. Both files' inline/
config-level `local/period-restrictions` exemptions are removed.

**Tests**: `packages/shared` — 3 new suites (`domain/__tests__/
{export,forecast,patterns}.test.ts`, 25 tests) plus the full existing
suite, 194 passed total (0 regressions). `packages/ai` — existing
`askMurmur.test.ts` (29 tests) unchanged and green against the rebuilt
`buildWindows`. `apps/mobile` — 87 passed. `apps/web` — 24 passed.
`tsc --noEmit` clean for this pass's own files in all four packages
(unrelated, pre-existing `Money`-prop and `local_day`/`occurrence_date`
schema fallout from concurrent 2.6/2.7/2.3 passes still in flight
elsewhere in the tree, not touched by this pass). `eslint` clean (0
errors) on every file this pass wrote or migrated.

### Entitlement is honest, and account access actually works (fix-plan items 3.1 + 3.2, Aug 9 2026)

Two items, one file-ownership grant centered on the paywall/entitlement
surfaces plus `apps/mobile/app/(auth)/**` and `apps/web/src/app/{login,auth}/**`.
Both took the plan's own "defer" branch for 3.1 — IAP/Stripe isn't
ready, and the item's text says explicitly that removing the pricing UI
"clears four App Store blockers at once" — so nothing here wires a real
purchase; everything here stops the product from claiming it has one.

**3.1 — purchases and entitlement.** `usePlusStatus.ts` (mobile) drops
the `__DEV__` hatch; `packages/shared/src/plus.ts` and
`apps/web/src/lib/plus.server.ts` now share one honest doc comment:
entitlement is `profiles.plus_status === 'active'`, full stop, granted
today only by a manual Supabase update for early access, with no
per-build override anywhere. `apps/mobile/app/more/paywall.tsx` is
rewritten from a fake purchase screen (two `PlanCard`s reading
"$4.99"/"$39" — numbers that also contradicted the locked $3.99/$29.99
decision above — a `PlanCard` toggle, and an `onPress` whose entire body
was a comment explaining it does nothing) into an honest "Plus is
coming" preview: same hero/feature-list chrome, zero price strings,
zero CTAs. `apps/web/src/components/PaywallGate.tsx` loses the
`<div>Upgrade to Plus</div>` (not a button — no `onClick` ever existed)
and the inverted dev-build note ("Plus is free in the dev build —
production sees the upgrade flow here" was backwards: there was no
dev/prod branch and no upgrade flow in either). Both mobile Settings'
profile card (`"Free plan"` / `"Upgrade"` were unconditional strings
regardless of the account's real `plus_status`) and the web dashboard's
"Plan & billing" card (`"Murmur Plus · Yearly / Renews on your billing
date"` on an account that has never been billed, next to a `"Manage"`
span with no handler) now branch on `isPlus` and never assert a renewal
date, a "Manage" affordance, or an "Upgrade" CTA that doesn't exist.
Three more dead-pressed-states named directly in the item's text are
gone: the Ask entry screen's mic button, which no-op'd for any Plus user
with an empty draft (now the mic slot doesn't render for Plus users —
voice-in-Ask isn't built — and still routes free users to the honest
paywall, same as before); Ask Murmur's result-screen action pills, whose
`onActionPress` was a function whose entire body was a comment (deleted,
along with the now-unused `AskMurmurAction` plumbing and
`actionPill*`/`actionsRow` styles — reinstate once `create_goal` /
`set_budget` / etc. have a real destination); and the transaction
detail's transcript card, whose sage circle held a play-triangle glyph
implying tap-to-hear-the-recording on an app that stores no audio (now
a static mic glyph — "this came from a voice note," nothing about
playback). `packages/shared/src/i18n/locales/*.json`: `paywall.cta`,
`plan_monthly(_sub)`, `plan_yearly(_sub)` and `best` are deleted (no
longer rendered anywhere); `paywall.headline`/`body`/`disclaimer` and
`settings.upgrade` are rewritten to match, and a new `settings.plan_plus`
key backs the Plus-labeled profile-card state — all four locales kept in
key parity (verified by diff, not just by eye). `docs/PLAN.md:30`'s
locked monetization decision gets a superseded note pointing here rather
than being silently edited out from under its own record.

**3.2 — account access.** Password reset now runs end to end on both
platforms via Supabase's PKCE `resetPasswordForEmail` /
`exchangeCodeForSession` / `updateUser` sequence — no second, hand-rolled
token exchange. Mobile: `useAuth.ts` gains `requestPasswordReset`/
`updatePassword`; `(auth)/sign-in.tsx`'s email form grows a "Forgot
password?" link; new `(auth)/reset-password.tsx` consumes
`voiceexpense://reset-password?code=…` via Expo Router's own file-based
deep-link resolver — deliberately *not* a manual `Linking.parse` call
like `useShortcutHandler.ts`'s, because Router's resolver folds `host`
and `path` together internally and so isn't exposed to the
hostname-vs-path bug fix-plan 3.4 fixes there; confirmed by reading
`expo-router`'s `extractPathFromURL.ts` rather than assuming. The one
subtlety: `exchangeCodeForSession` establishes a real session before the
user has set a new password, and the root layout's `session && inAuthGroup`
redirect would otherwise fire on that same render and bounce the user
into `/(tabs)` before the form ever painted — `app/_layout.tsx`'s routing
effect now carries a narrow, explicitly-commented exemption for exactly
that one route, and nothing else. Web: `login/page.tsx` gets the same
"Forgot password?" flow (reusing the existing `/auth/callback?next=…`
route rather than a second code-exchange implementation) and a real Sign
in with Apple button — audit 08-F9's actual defect, since the page
previously offered Google only, so an Apple-created account
(`@privaterelay.appleid.com`, no password) could never reach web or
desktop. New `apps/web/src/app/auth/reset/page.tsx` renders the
new-password form once the callback route's cookie confirms a session
exists, and an honest "link invalid" state when it doesn't. Button
order mirrors mobile (Apple first on macOS/iOS user agents, detected
post-mount via `navigator.userAgent`, Google first elsewhere). The
generic `auth_failed` callback message is rewritten to say the link may
have expired rather than a bare "Authentication failed" with no next
step. Both flows require the Apple Services ID / return URL to be
registered in the Supabase Auth dashboard — a manual step outside the
repo, called out here so it isn't lost.

**Tests**: `apps/mobile` — 99 passed (0 regressions). `apps/web` — 31
passed (0 regressions). `packages/shared` — 211 passed (0 regressions).
`tsc --noEmit` clean in all three packages for this pass's own files
(pre-existing `database.types.test.ts` `local_day`/`occurrence_date`/
`snapshot_currency` fallout from a concurrent, unrelated pass is not
touched by this one). `eslint` clean (0 errors) on every file this pass
wrote.

### Automations wired-or-hidden, privacy copy matches the pipeline, and web/desktop parity (fix-plan items 3.4 + 3.5 + 3.6, Aug 9 2026)

Three items, each answering the plan's "wire it or delete it" rule with
a different verdict, decided by what was actually feasible to build here
versus what required an external action (publishing a Shortcut to
iCloud) this session cannot perform.

**3.4 — automations.** Android notification listener: **wired**, not
deleted. `useNotificationListener.ts:76-77` now takes an *optional*
`onPayment` — Settings (`more/settings.tsx:353`) calls it with none, for
permission state only; `app/_layout.tsx:64-104` is the one real
subscriber, mounted at the root because Settings has no way to navigate.
A detected payment opens the same `<VoiceConfirmModal>` the Record
screen uses (`_layout.tsx:313-334`), with its own `useCategories`/
`useTransactions` instance and `source: 'notification_listener'` on
save — the payload was always fully built and validated
(`validateParsedExpense`); only the confirm sheet was missing. iOS
Shortcut: the parser bug is fixed (`useShortcutHandler.ts:18-22` matches
`hostname ?? path`, not `path` alone — `expo-linking`'s `parse()` puts
`shortcut` in `hostname` for `voiceexpense://shortcut?...`, so the old
check rejected every real Shortcut URL), but the row itself stays
**hidden**: no Shortcut has actually been published to iCloud from this
session, so `SHORTCUT_INSTALL_URL` in `packages/shared/src/brand.ts:43`
is `''`, and `more/settings.tsx:477` renders the whole Automations group
only when Android's real toggle or a non-empty install URL exists —
never a dead `.../placeholder` link. Apple Pay chip (web Transactions,
`dashboard/transactions/page.tsx:65-93`): split into two honest buckets,
`shortcut` and `notification`, replacing a single "Apple Pay" label that
called an Android NotificationListenerService source "Apple Pay" and
was wrong even for genuine Shortcut rows (not every Shortcut is an Apple
Pay one).

**3.5 — the on-device claim and privacy copy.** Rewrote every "Processed
on-device" / "On-device" / "Nothing identifying" string to describe the
real pipeline — speech-to-text is genuinely local (`expo-speech-
recognition` never leaves the phone), but the transcript and any scanned
image go to our server and to OpenAI, named explicitly, to extract the
amount/merchant/category. Touched: `listening.processed_on_device`,
`settings.voice_engine_on_device`, `onboarding.welcome.prop_voice_*`,
`privacy.lead`, `privacy.servers_label`/`servers_detail`,
`privacy.ctrl_voice_on_device` (all four locales, kept in parity); web
`dashboard/settings/page.tsx` loses both "ON-DEVICE" tags and gets an
accurate "On-device speech-to-text · OpenAI for extraction" sub-line.
`privacy.on_device_detail` drops "Voice recordings" (no audio is ever
persisted, only the transcript) down to "Transcripts". New
`privacy.merchant_logos_label`/`_detail` row in `more/privacy.tsx`
discloses the direct device→Google favicon lookup (`MerchantAvatar.tsx`)
as its own line rather than folding it into "servers" — that request
never touches our servers at all, so describing it there would misstate
the flow; proxying it server-side (item 4.4) is out of scope here.
Analytics (audit 06-F39): mobile's Privacy Center said "Never" while web
Settings offered a live toggle writing `profiles.analytics_opt_in`/
`crash_reports_opt_in` — and nothing anywhere reads either column. Since
no analytics/crash-reporting SDK is wired into the product at all, "no
analytics collected" is the true statement on both platforms; web's two
`SettingToggle`s (dead code after removal, deleted) became static "Not
collected." rows, matching mobile exactly instead of the other way
around.

**3.6 — web/desktop parity.** Web i18n: `packages/shared/src/i18n` ships
four complete locales and zero web files import `t()` — translating
~200 web strings across every dashboard page is real, tracked work well
beyond this item's file ownership (one page + layout + settings). Per
the plan's own fallback, the picker in `dashboard/settings/page.tsx` is
now a read-only value with an explanatory note ("change your language
from the mobile app") instead of a `<select>` that silently did nothing
to the page around it; `profile.locale` still drives this page's own
`Intl` formatting and mobile's real translations. Category seeding:
`handle_new_user()` (new migration `029_default_category_seeding.sql`,
applied and smoke-tested live — a scratch `auth.users` insert produced
exactly 1 profile + 20 categories, then was deleted) now seeds all 20
`default_categories` rows atomically with the trigger that already
creates `profiles`, `ON CONFLICT (user_id, name_normalized) DO NOTHING`
per row so one collision can't discard the other nineteen the way the
old all-or-nothing batch insert did. This covers every signup surface —
mobile, web OAuth, web email/password — because it runs from the
`auth.users` trigger, not from app code. `apps/mobile/src/services/
seedCategories.ts` and its `_layout.tsx` call site are deleted, not
superseded. Support: `support@murmur.app` has no MX record — every
message to it silently bounced. `packages/shared/src/brand.ts:25`'s
`SUPPORT_EMAIL` is now `string | null = null`; `more/help.tsx` and
`dashboard/settings/page.tsx`'s "Help & contact" rows hide themselves
while it's unset (`help.body_no_contact`, all four locales, replaces the
"write us" copy on the same screen) rather than advertising a channel
that doesn't deliver.

**Tests**: new `useShortcutHandler.test.ts` (5 tests — the exact URL an
iOS Shortcut emits, plus the rejection cases) and
`useNotificationListener.test.ts` (5 tests — a synthetic native payload
reaching `onPayment` as a validated `ParsedExpense`, a zero-amount and an
invalid-currency payload both dropped before validation, and zero native
subscriptions when `onPayment` is omitted). `apps/mobile` — 104 passed
(0 regressions). `apps/web` — 31 passed (0 regressions). `packages/
shared` — 211 passed (0 regressions, all four locale files still parse
and carry no duplicate keys). `tsc --noEmit` clean in `apps/mobile`,
`apps/web`, `packages/shared` (the pre-existing `database.types.test.ts`
`local_day`/`occurrence_date`/`snapshot_currency`/`deleted_at` fallout
from concurrent, unrelated passes is untouched by this one). `eslint`
clean (0 errors) on every file this pass wrote or edited. Live-DB smoke
test for migration 029 documented above; no automated CI test exists for
it (no SQL-level test harness in this repo yet).

### Recurring rule CRUD, and a sync surface that reports reality (fix-plan items 3.3 + 3.7, Aug 9 2026)

Two items, file ownership centered on the Recurring screens/hook on both
platforms plus the device-registration half of mobile's sync layer and
the sync-facing rows in web Settings/Sidebar.

**3.3 — recurring rule CRUD.** New `findRuleForTransaction` in
`packages/shared/src/domain/recurrence.ts` (`recurring_rule_id` first,
`template_txn_id` fallback) replaces three independent, drifted inline
lookups: `transaction/[id].tsx:217` (the one the item names — checked
`template_txn_id` only, so a `recurring_generated` occurrence's chip
never showed frequency/next-due), `transaction/edit.tsx`'s initial-load
effect (same bug), and `edit.tsx`'s save-path lookup, which a prior pass
had already hand-fixed inline but left duplicated rather than shared —
exactly the "fixed once, left duplicated" shape the owner's standing
rule calls out. New `buildRuleAnchor(instant, tz)` in the same module
replaces the hand-rolled `localParts` + zero-padding triple that both
`useRecurringRules.createRule` and web's `acceptCandidate` each
carried separately.

Full lifecycle, both platforms, without touching a transaction: new
`RecurringRuleEditor.tsx` (mobile, via the shared `<BottomSheet>`) and
`RecurringRuleModal.tsx` (web) — name, amount, currency, category,
direction, frequency, interval, next date, `ends_at` as "Cancel from",
exactly the plan's field list. Mobile `recurring.tsx` gains an "Add
manually" pill (top row + empty state) and an "Edit" entry in the
existing pause/resume/delete action sheet; web's `recurring/page.tsx`
un-disables its permanently `disabled title="Coming soon"` button,
makes each row clickable to edit, and adds a "Cancel this rule" action
inside the edit modal (web had no delete path for a rule at all before
this). Both platforms split Active/Paused into two real sections —
mobile's list previously rendered every rule, paused included, under a
heading that read "Active subscriptions," told apart only by a dimmed
row style. Web's empty state no longer tells a free user to "accept a
detected pattern," a Plus-gated action the banner two lines above it
already hides from them.

`deleteRule` (mobile hook) and web's new delete action are real soft
deletes (`is_deleted = true`, `deleted_at`, `version + 1`) — the plan's
explicit "delete (soft)" requirement — replacing a hard `.delete()` that
bypassed the `is_deleted` contract migration 018 gave this table. Reads
on both platforms now filter `is_deleted = false`, which they never did
(a hard delete made this latent; a soft delete without the filter would
have resurrected every "deleted" rule on the next load). `createRule`
and `updateRule` grew `interval`, `currency_code`, `starts_at`
(re-anchoring `last_generated` to null on an edited "next charge," so
the new date is the literal next occurrence rather than one cadence
step past it — same treatment web's edit path gets), and `ends_at`;
`payment_method`/`note` became optional (the manual form has no use for
either). New migration `028_recurring_rules_soft_delete.sql` adds
`deleted_at` to `categories`, `budgets` *and* `recurring_rules` — the
soft-delete write above needed it on `recurring_rules`, and tracing the
column revealed `entityRegistry.ts`'s shared `versionGuardedDelete()`
(Stage 1) has always included `deleted_at` in its update for all three
generic-store tables despite only `transactions` ever having the
column, a latent 400 waiting for the first queued delete on any of
them. Fixed for all three in the same migration rather than
`recurring_rules` alone. `database.types.ts` hand-patched to match
(no live-linked project in this environment to regenerate from).

**3.7 — a sync surface that reports reality.** `devices` (migration 001,
written by nothing until now) gets a real writer: new
`apps/mobile/src/services/sync/deviceRegistry.ts`
(`getDeviceId`/`registerDevice`/`touchDeviceSynced`/
`getDeviceLastSynced`), a stable per-install UUID in SecureStore.
`registerDevice` runs from `_layout.tsx`'s existing launch-scoped
`runOncePerSession` effect (same pattern as `seedDefaultCategories`/
`runRecurringCatchUp`/`runFxBackfill`) — "register on sign-in."
`SyncManager.drainQueue()` calls `touchDeviceSynced` once a pass
completes online, using the same `realtimeUserId` `startRealtime`
already tracks — "`last_synced_at` on drain," true whether or not
anything was queued to push.

Web sidebar: `dashboard/layout.tsx` (server component) now queries the
most recent `devices.last_synced_at` for the signed-in user alongside
its existing profile/recurring-count fetch and passes it to
`<Sidebar>`, which renders it through new `lib/relativeTime.ts`
(`Intl.RelativeTimeFormat`) instead of a `"Synced just now"` string that
rendered unconditionally, including offline and on an account that had
never opened the mobile app. Web Settings' "Sync & devices" card: real
`devices` rows (platform + relative last-synced time) replace the one
hardcoded "This device · Synced just now · web companion" row; zero
devices renders an honest "no devices synced yet" state rather than a
fabricated one — web/desktop register no device of their own, having no
offline outbox to report sync state for. "Recognition language" row now
reads `profiles.voice_language` (the column mobile's speech recognizer
actually consumes) instead of the UI `locale` state, which can disagree
with it. The "Plan & billing" card's own fabricated rows (part of the
same `08-F41` finding, its billing half) were already made honest by
the concurrent 3.1 pass — verified, not duplicated, here.

Mobile Settings' sync-health section (built in 1.6: pending/dead-letter
counts, already real) gains the one signal it was still missing — a
"Last synced" row reading this device's own `devices.last_synced_at`,
refreshed on mount and after every drain pass.

**Tests**: new `findRuleForTransaction`/`buildRuleAnchor` cases in
`packages/shared`'s `recurrence.test.ts` (5 tests) and a new
`deviceRegistry.test.ts` (7 tests, SecureStore/Supabase mocked).
`apps/mobile` — 104 passed (0 regressions; `SyncManager.test.ts` and
`useTransactions.test.ts` gained `expo-secure-store`/`expo-crypto`/
`expo-constants` mocks now that `SyncManager.ts` transitively imports
`deviceRegistry.ts`). `apps/web` — 31 passed (0 regressions).
`packages/shared` — 211 passed (0 regressions, all four locale files
still parse and carry no duplicate keys — 18 new `recurring.*`/
`settings.sync_*` keys added in parity across en/fr/es/pt). `tsc
--noEmit` clean in `apps/mobile` and `apps/web`; `packages/shared`'s
only remaining errors are the pre-existing, untouched
`database.types.test.ts` `local_day`/`occurrence_date`/
`snapshot_currency` fallout two concurrent passes already recorded
above. `eslint` clean (0 errors) on every file this pass wrote or
edited; one pre-existing "unused eslint-disable directive" warning on
`recurring/page.tsx`'s realtime-subscription effect (confirmed present
on HEAD before this pass touched the file) is untouched.

### Dead code, merchant-colour consolidation, and desktop/web hardening (fix-plan items 4.3 + 4.4 + 4.5, Aug 10 2026)

Three items, verified against their full plan text (not just the cited
findings) at HEAD. Most of the substantive work — `packages/shared/src/
utils/color.ts`'s merchant/category-colour consolidation, the Electron
navigation guards, the CSP headers, the transaction-field allow-list,
and the `.gitignore` rewrite — was already present and correctly built
in the working tree from a prior pass over this same scope; this pass's
job was to verify each item's "done when" line against the actual code
(not the comments claiming it), close the two gaps that verification
found, and run the suites. No file outside this pass's ownership
(`apps/desktop/src/**`, `apps/web/next.config.ts` + `layout.tsx`,
`apps/mobile/src/services/sync/transactionStore.ts`, `packages/shared/
src/**`, `.gitignore`, `.gitattributes`, `knip.json`) was touched.

**4.3 — dead code.** Verified gone, by grep, not by trusting the prior
deletion: `SafeToSpend.tsx`, `useMonthSummary`, `KPI.tsx`,
`SpendingChart.tsx`, `CategoryChart.tsx`, `advisor.ts` + its barrel
export in `packages/ai/src/index.ts`, `packages/shared/src/utils/
date.ts`, `formatAmount`, `tintColors`, the dead (non-`AndEnqueue`)
`deleteTransaction`, and all eight orphaned style keys (`record.tsx`'s
`micIcon`/`scanLabelWrap`/`scanIcon`/`moreOptionsPanel`/`fields`,
`more/transactions.tsx`'s `title` — superseded by the now-used
`pageTitle` — `more/help.tsx`'s `title`, `ask.tsx`'s
`inputPlaceholder`). `getDeadLetterEntries`/`clearDeadLetterEntry` and
`isFxPending` confirmed wired (1.6, 1.4), not deleted. One gap this
pass found and fixed: `packages/shared/src/types/ai.ts:72-81`'s
`AdvisorContext` interface — `monthly_income`, `safe_to_spend_remaining`,
`implied_monthly_savings`, the exact divergent-formula shape this item
warns about — survived `advisor.ts`'s deletion because it lived in a
different file, re-exported through `index.ts`'s `export * from
'./types/ai'`, which is exactly the shape `knip`'s unused-export check
cannot see through (a barrel re-export always looks "used" to it).
Deleted; zero other references existed. `npx knip --workspace
packages/shared` — the hard CI gate `.github/workflows/ci.yml`'s `test`
job already runs — is clean (exit 0) before and after. The full-repo
`npx knip` run (report-only, `continue-on-error: true` in the same
workflow) still lists pre-existing `apps/mobile/src`/`apps/web` unused
exports outside this item's named scope, honestly scoped as such in the
workflow's own comment — not this item's job to clear.

**4.4 — merchant logos, category colour, contrast.** `packages/shared/
src/utils/color.ts` is the single copy of `KNOWN_DOMAINS` (63 entries)
and `guessDomain`, imported by both `apps/mobile/src/components/
MerchantAvatar.tsx` and `apps/web/src/components/MerchantLogo.tsx` — the
two previously-duplicated copies are gone (confirmed by grep: neither
file defines its own). `merchantColor`'s fallback-tile palette is now
the deep `AVATAR_COLORS` (8 entries, `color.ts:111-120`) — the old
lighter 12-entry palette that put 4 of its entries at 2.2–2.8:1
white-text contrast is gone; `color.test.ts`'s `it('every palette entry
clears 4.5:1 ...')` exercises all 8 via 200 hashed names and asserts
`contrastRatio(hex, '#FFFFFF') >= 4.5` for every one. `categories.color`
is the single source of truth: `categoryPalette(hex)` (`color.ts:241`)
derives a `{bg, fg}` pair with `fg` guaranteed ≥4.5:1 against both `bg`
and white by construction (lightness-walk loop, `color.test.ts` proves
it against all 20 seeded default colours plus a near-gray edge case and
an arbitrary user-picked hex) and is now the only source for chart
tints on both platforms (`apps/web/src/components/{Chip,AskChart,lenses/*}
.tsx`, `dashboard/budgets/page.tsx`, `apps/mobile/src/components/
MerchantAvatar.tsx`). The two hard-coded tint tables
(`apps/mobile/src/theme/colors.ts`'s `categoryTints`,
`apps/web/src/lib/theme.ts`'s `cat`) and the name-regex heuristic
(`apps/web/src/lib/categories.ts`'s `tintFor`, file deleted) are gone —
confirmed by grep, only historical comments naming them for context
remain. Row vs. chart colour parity verified by tracing the call sites,
not just asserting it: both platforms' transaction-row category
chip/dot and both platforms' chart bars read `categories.color` (or its
`categoryPalette` derivation) from the same field, never a second
lookup. Favicon question: per this session's explicit instruction to
read fix-plan item 3.5's disclosure decision and not fight it —
verified `docs/EXTERNAL_SERVICES.md`'s §4 disclosure note and
`privacy.merchant_logos_label`/`_detail` (mobile Privacy Center, added
by 3.5) already document the direct device→Google favicon request
honestly. This item does **not** proxy or drop remote logos — that
decision was 3.5's to make and it made it (disclose, don't proxy).
Flagged, not silently accepted: this leaves the item's own "done when"
line — "a `TransactionRow` render issues no request outside the app's
own hosts" — **not met**, by the same deliberate choice EXTERNAL_SERVICES.md
already recorded as "tracked as follow-up work, not done here." Anyone
picking up a future favicon-proxy item should read `EXTERNAL_SERVICES.md`
§4 and `color.ts:131-136`'s comment first.

**4.5 — desktop and web hardening.** All five sub-changes verified
present and working, not just present in comments: (1)
`apps/desktop/src/main.ts:66-74` `guardNavigation()` attaches a
`will-navigate` handler that denies any navigation off `appOrigin`,
handing real `http(s)` URLs to `shell.openExternal` instead; wired via
`app.on('web-contents-created', ...)` at module scope (`:353-355`,
before `whenReady()`) so it covers the main window and every child
window `setWindowOpenHandler` allows. (2) `apps/web/next.config.ts`'s
`headers()` (`:60-74`) emits `Content-Security-Policy` (`default-src
'self'`, `frame-ancestors 'none'`, `img-src` scoped to `'self' data:
https://t0.gstatic.com` — the one deliberate exception from 4.4 above),
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` on every
route. `apps/web/src/app/layout.tsx:19-31` self-hosts both fonts via
`next/font/google` (built ahead of the CSP, per the plan's own
ordering) — no Google Fonts exception anywhere in the policy; confirmed
by grep, no `fonts.googleapis`/`fonts.gstatic` reference remains outside
one historical comment. (3) `apps/mobile/src/services/sync/
transactionStore.ts:195-204` `UPDATABLE_TRANSACTION_FIELDS`, a `Set`
`updateTransactionFields` (`:227-230`) checks every incoming key against
before it reaches the SQL template literal, throwing on anything not in
the 8-column allow-list — closes the type-guarantee-erased-at-runtime
gap. (4) `.gitignore` — confirmed via `git show HEAD:.gitignore | file`
that the pre-existing committed copy was UTF-16 (binary to git, hence
the `Binary files differ` diff), the working-tree copy is now plain
UTF-8 with no null bytes (`grep -c $'\x00'` on the original vs. new).
New `.gitattributes` (`* text=auto eol=lf` plus a binary list for image/
font assets) — this file did not exist before this pass; created now to
close the actual gap; nothing else in 4.5 needed touching it. (5)
Code-signing: confirmed **not** faked — `apps/desktop/electron-builder.yml`'s
`mac.identity: null` / Windows section and `build/afterPack.cjs`'s
ad-hoc (`--sign -`) signature are both commented with the exact env vars
(`CSC_LINK`/`CSC_KEY_PASSWORD`, `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/
`APPLE_TEAM_ID`) to set once the owner provisions a Developer ID
Application certificate (macOS) and an EV cert (Windows, for SmartScreen
reputation) — real signing is out of this session's reach without those
credentials and is flagged here again rather than stubbed. **Owner
action required:** provision both certs; nothing in this repo can
substitute for them.

**Tests**: `npx turbo test` — 543 passed, 0 regressions (`packages/
shared` 238 incl. `color.test.ts`'s 27 new merchant/category-colour
cases; `apps/mobile` 104; `apps/web` 31; `packages/ai` 170 + 1 expected
fail + 2 todo, pre-existing). `npx turbo typecheck` clean in `ai`,
`desktop`, `mobile`, `web`; `packages/shared`'s only error is the
pre-existing, untouched `database.types.test.ts`
`local_day`/`occurrence_date`/`snapshot_currency` fallout already
recorded in this file's history above (unrelated to 4.3/4.4/4.5, not
this pass's file ownership). `npx turbo lint` — 0 errors everywhere;
remaining warnings are all pre-existing "unused eslint-disable
directive" notices on files this pass didn't touch. `npx knip
--workspace packages/shared` clean (exit 0).

### Accessibility, naming/i18n, and honest empty states (fix-plan items 4.1 + 4.2 + 4.6, Aug 10 2026)

Three items, verified against their full plan text (not just the cited
findings) at HEAD. As with the 4.3/4.4/4.5 pass immediately above, nearly
all of the substantive work — `<Tappable>`, `ScaledText`, the recurring
chips' radio semantics, the web transaction row's `<button>` conversion,
`aria-pressed` on the ACTIVE/Resume pills, the naming table in
`docs/DESIGN.md`, the six `01-F29` strings, the `08-F48` locale-drop
sweep, the duplicate `detail.recurring` key removal, the free-user "Plus
feature" copy, the four back pills, `apps/web/src/lib/useRealtime.ts`
wired into all three dashboard pages, the per-screen status-bar rule,
the budget-delete confirm, the Settings unsaved-changes guard, the
toolbar-search scoping, and the `sign-in.tsx`/`brand.ts` comment fixes —
was already present and correct in the working tree from a prior pass.
This pass's job was to verify each "Change" bullet and "Done when" line
against the actual code, not the comments claiming it, and close what
verification found open. File ownership respected:
`apps/mobile/src/components/**`, `apps/mobile/app/**`,
`apps/web/src/components/{Sidebar,Toolbar}.tsx` + dashboard pages,
`packages/shared/src/i18n/**`, `apps/web/src/lib/useRealtime.ts`,
`eslint.config.mjs` (the one config file all three items' CI gates live
in), `.github/workflows/ci.yml` (one stale comment line).

**4.1 — accessibility.** All three genuine sub-44pt targets, the
recurring chips' `radiogroup`/`radio` semantics, the web `<button>`
conversion and `aria-pressed` pills, and `<Tappable>` were verified
present and correct by reading the code, not the comments. One gap
`03-F36`'s own "same defect elsewhere" note flagged and the prior pass
missed: `app/recurring.tsx`'s `RuleRow` — the row that opens a
destructive (edit/delete) action sheet — carried no `accessibilityRole`
or `accessibilityLabel`, so VoiceOver read its child `<Text>`s
individually with no indication the row itself was interactive. Fixed:
`accessibilityRole="button"` plus a label combining the rule name and
its active/paused status. **Flagged, not silently skipped:** the item's
"done when" line calling for "an axe-core run on `/dashboard/
transactions` reports zero critical violations" has no automated check
in this pass — no axe-core/Playwright dependency or harness exists
anywhere in the repo (`grep -rn axe` across every `package.json` returns
nothing), and standing one up (browser install, a new CI job) is
infrastructure, not a code fix, so it's out of this pass's scope. The
code-level fixes it would verify (real `<button>`, keyboard handlers,
`aria-pressed`, roles) are in place and manually confirmed; nothing runs
axe against them yet.

**4.2 — naming, i18n leftovers, copy that argues with itself.** The
naming table, the six `01-F29` strings, the `08-F48` sweep
(`getLocales()` pre-auth seeding, `locale` always passed to
`formatCurrency`, `Intl.DateTimeFormat.formatRange` for the Insights
range label), the duplicate-key removal + `localeIntegrity.test.ts` gate,
and the free-user Plus-feature copy were all verified correct. The one
real gap: `eslint.config.mjs`'s own `MOBILE_I18N_RESTRICTIONS` selector
— the mechanism the item's "done when" line requires ("a lint rule flags
string literals passed as `<Text>` children") — existed but had never
been flipped on. Trying it surfaced why: the audit's original `/\S/`
value pattern also matches currency glyphs (`$`), checkmarks (`✓`),
emoji, stepper `+`/`−`, percent signs, digit placeholders and the
`·`/`/`/`–` separators used throughout the app to join two already-
translated `t()` calls — 33 of 37 hits on a first pass were exactly
that, not English words. Narrowed the selector to require a Latin
letter (`/[A-Za-zÀ-ÖØ-öø-ÿ]/`), which left exactly four genuine
untranslated strings, all outside `01-F29`'s original (now-stale)
"exhaustive" list because they were added by later stages:
`RecurringToggle`'s "AI" badge (new key `recurring.ai_badge`, which
translates to "IA" in es/fr/pt — matching the adjacent sentence's
existing translation of the same word) and `SyncFailureBanner`'s
"Retry"/"Discard"/"Retry all"/"Details"/"Hide"/"Unknown error"/"N item(s)
couldn't sync", which now reuses the `settings.sync_*` vocabulary
Settings' own "fuller" sync-health surface already carries (same words,
same keys, not a second translation of the same fact) via a new
`locale` prop threaded from `_layout.tsx`. `local/mobile-i18n-
restrictions` is now `['error', ...]` on its own alias, matching the
`period-restrictions`/`mobile-clearance-restrictions` pattern for the
same reason (an independent severity switch within one `no-restricted-
syntax` file-set key) — `npx turbo lint` is 0 errors with it on.

**4.6 — honest empty states and remaining copy.** All eight sub-changes
— the four back pills, the shared `useRealtime` hook, the status-bar
caveat comment, the budget-delete confirm, the Settings guard (verified
it covers *both* `beforeunload` and in-app client-side route changes via
a capturing click listener — the App Router doesn't fire `beforeunload`
for its own navigations), the toolbar-search scoping, the Treemap
caption, and the brand comments — were verified present and correct.
One item worth recording rather than silently accepting as already
done: the Treemap's "Includes savings" caption, which the plan text says
to drop "until 1.4's transfer classification makes the band reachable",
turned out to already be reachable — `TreemapLens` computes `saved` from
`monthSummary(props).transfers`, the real transfer-kind classification
1.4/2.1 landed, not the old `max(0, income − expense)` heuristic the
audit found broken — so the caption is accurate today and was correctly
left in place rather than removed. **Flagged, not silently skipped:**
the item's "done when" line about mounting/unmounting Recurring ten
times and asserting `supabase.getChannels()` is empty has no automated
test — `apps/web`'s `vitest.config.mts` runs `environment: 'node'` and
includes only `*.test.ts` (no jsdom, no React Testing Library, no
`.test.tsx` anywhere in the app), so a component-mount test for
`useRealtime` would mean standing up that harness from scratch, which is
infrastructure this pass's file ownership doesn't cover. The hook itself
(`apps/web/src/lib/useRealtime.ts`) is structurally correct — the
cleanup returns synchronously from the effect body, not from inside an
async IIFE, which was the exact defect `08-F36`/`08-F50` described — and
is verified by code reading, not by a runtimes test.

**Tests**: `npx turbo test` — 549 passed, 0 regressions (`packages/
shared` 238, `apps/mobile` 107, `packages/ai` 173 incl. 1 expected fail
+ 2 todo, `apps/web` 31). `npx turbo typecheck` clean in `mobile`, `web`,
`ai`, `desktop`; `packages/shared`'s only error is the pre-existing,
untouched `database.types.test.ts` `local_day`/`occurrence_date`/
`snapshot_currency` fallout already recorded earlier in this file
(unrelated to 4.1/4.2/4.6, not this pass's file ownership). `npx turbo
lint` — 0 errors repo-wide, including the newly-flipped `local/mobile-
i18n-restrictions` gate; remaining warnings are pre-existing "unused
eslint-disable directive" notices on files this pass didn't touch.

*End of Plan*
