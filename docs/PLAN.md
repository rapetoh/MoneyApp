# Technical Plan
## Voice Expense Tracker

**Version**: 1.0  
**Date**: April 2026  
**Status**: Approved

---

## Tech Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Mobile | React Native + Expo | iOS + Android from one codebase |
| Desktop | Electron wrapping Next.js | Real installable Mac + Windows app, one web codebase |
| Web | Next.js | Powers both browser and Electron |
| Backend | Supabase | Auth, PostgreSQL, realtime, storage — all in one |
| Monorepo | Turborepo | Shared packages across mobile, web, desktop |
| AI (parsing + scanning) | Gemini 2.0 Flash | Cheapest option with built-in vision — ~8x cheaper than alternatives |
| AI (advisor) | Gemini 2.0 Flash → GPT-4o | Start cheap, escalate only if response quality is insufficient |
| AI fallback | GPT-4o-mini | If Gemini API is unavailable |
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
frequency       text  -- daily|weekly|biweekly|monthly|quarterly|yearly
interval        integer DEFAULT 1
starts_at       timestamptz
ends_at         timestamptz              -- null = forever
last_generated  timestamptz
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
  → Gemini 2.0 Flash
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
3. Anthropic prompt caching on static system prompt (~90% reduction on prompt tokens)
4. Top-20 most-used categories sent in prompt (not full list)
5. Rate limit: 200 voice parse calls + 50 advisor calls per user per day

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

## Open Decisions (resolve before Phase 9)

- [ ] **App name** — candidates: Aria (top pick), Voco, Spoke, Dime, Sotto, Noted
- [ ] **Monetization model** — recommended: feature-gated freemium
- [ ] **Free tier scope** — recommended: unlimited logging, 90-day history
- [ ] **Pricing** — recommended: $3.99/month or $29.99/year

---

*End of Plan*
