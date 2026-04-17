# Technical Plan
## Voice Expense Tracker

**Version**: 1.4  
**Date**: April 14, 2026  
**Status**: In Progress — Phases 0–4 code complete; device testing in progress

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
- **Important**: There are two `eas.json` files in the repo. The **only** one that matters is `apps/mobile/eas.json`. The root `eas.json` is ignored by EAS CLI.

### iOS App Transport Security — ATS Exception (April 2026)
iOS blocks all non-HTTPS requests from native app code by default. Required for local dev and any HTTP endpoint:
```javascript
// apps/mobile/app.config.js
ios: {
  infoPlist: {
    NSAppTransportSecurity: { NSAllowsArbitraryLoads: true }
  }
}
```

### Google Sign-In — Native OIDC Nonce Flow (April 2026)
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

**`supabase/functions/generate-recurring/index.ts`** — Edge Function. Fetches all active rules, generates a transaction for each rule whose next occurrence is ≤ now, advances `last_generated`. Deploy with `supabase functions deploy generate-recurring`. Schedule daily with pg_cron (SQL in file header comment).

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

## Open Decisions (resolve before Phase 9)

- [ ] **App name** — candidates: Aria (top pick), Voco, Spoke, Dime, Sotto, Noted
- [ ] **Monetization model** — recommended: feature-gated freemium
- [ ] **Free tier scope** — recommended: unlimited logging, 90-day history
- [ ] **Pricing** — recommended: $3.99/month or $29.99/year

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

*End of Plan*
