# Technical Plan
## Murmur (formerly "Voice Expense Tracker" / "Money App")

**Version**: 1.5
**Date**: April 18, 2026
**Status**: In Progress — Phases 0–4 code complete; device testing in progress. **Murmur redesign** Phase A (brand + visual refresh) in progress April 18, 2026.

---

## Murmur redesign (active)

The product is undergoing a top-to-bottom redesign driven by
[DESIGN.md](./DESIGN.md). The implementation is split into phases A–J,
tracked in the user's personal plan file (`~/.claude/plans/breezy-painting-zephyr.md`):

| Phase | Scope | Status |
|---|---|---|
| A | Brand + visual refresh (rename → Murmur, sage palette, serif amounts, refreshed shadows, tab bar polish) | **Complete (Apr 18, 2026 — commit 845d8fb)** |
| B | IA reshuffle (Today / Insights / FAB / Budgets / More) | **Complete (Apr 18, 2026 — commits e79ccef + 6be5a86)** |
| C | Capture flow polish (amount-as-hero, adjust chips, rose [unclear] tag, undo snackbar) | **In progress (Apr 18, 2026)** |
| D | New screens (Day-1 guided, Budgets tab, Privacy Center, Paywall, History heatmap) | Not started |
| E | Ask Murmur (grounded Q&A replacing the chat-style AI Advisor from v1.0) | Not started |
| F | Lazy identity + auth reshuffle (no sign-in at launch) | Not started |
| G | Native surfaces v1 (iOS + Android home-screen widgets, Apple Pay lockscreen notification) | Not started |
| H | Retention mechanics (Day-2 dunning, Day-3 Insights unlock) | Not started |
| I | Desktop companion (Electron-wrap apps/web + QR pairing) | Not started |
| J | Docs update (ongoing, every phase) | Continuous |

**Locked decisions (April 18, 2026)**:
- **Monetization**: mobile free forever; Murmur Plus $3.99/mo or $29.99/yr unlocks Ask Murmur + auto recurring + export + desktop.
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

### Phase C — Capture flow polish (in progress April 18, 2026)

Design reference: [DESIGN.md](./DESIGN.md) §3 Motion + §5 Confirm + §5 Today.

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

**Native-dep deferrals — one rebuild decision:**

Three visuals currently ship as pure-React-Native approximations because a real implementation needs a native dep (and a rebuild). Grouped so they can be batched into one cycle:

1. **`react-native-svg`** — buys us:
   - **BudgetRing arc** ([src/components/BudgetRing.tsx](../apps/mobile/src/components/BudgetRing.tsx)): mockup draws a stroked progress arc (`<circle>` + `<path>` with stroke-dasharray). Today we render a filled disc + `accentSoft` halo + percent label. Reads fine, but the arc is the signature visual on the Budgets tab.
   - **Insights trend area** ([app/(tabs)/insights.tsx:135](../apps/mobile/app/(tabs)/insights.tsx)): mockup shows a smooth `<path>` with a sage gradient fill under the curve. Today we render 14 RN `<View>` bars. Readable, but the smooth curve is prettier and more "finance app" than a bar chart.
   - **Listening BigWaveform**: no work — the mockup itself draws this as a `<rect>` array, so the current RN `<View>` bars already match.

2. **`expo-blur`** — buys us:
   - **Tab bar backdrop blur** ([app/(tabs)/_layout.tsx:99-101](../apps/mobile/app/(tabs)/_layout.tsx)): currently a semi-transparent solid color. Real iOS-style frosted glass needs `BlurView`. Noticeable on Today when scrolling content under the bar.

3. **`expo-linear-gradient`** — already installed, not currently used. Would let us:
   - Replace the Paywall radial halo approximation with a real radial (though CSS radial gradients aren't in RN — would need a stack of concentric views or an image). Current approximation is acceptable.
   - Improve forecast card surface ramps on the Insights ink card.

**Recommendation:** ship Phase D as-is and **batch native deps with the next planned rebuild**. Likely next rebuild is triggered by either (a) adding IAP for Plus (requires `react-native-iap` or `react-native-purchases`), (b) the Expo SDK bump currently pending on `expo-speech-recognition@^3.1.2`, or (c) Phase E's Ask Murmur backend integration. When one of those lands, add `react-native-svg` + `expo-blur` in the same cycle, then:

- Replace `BudgetRing`'s disc with an SVG arc (15 min — stroke a circle with `strokeDasharray` at `2πr * pct`).
- Replace Insights' `trendRow` with an SVG `<Path>` + `<LinearGradient>` for the fill (30 min — compute points from `trend[]`, use a Catmull-Rom smoothing pass).
- Wrap the tab bar background in `BlurView` with `tint="light"` + `intensity={80}` (5 min).

All three changes are pure substitutions — no downstream code touches them.

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

*End of Plan*
