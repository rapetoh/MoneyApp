# Logic / Wiring Review — End-to-End Data Flow

**Date**: 2026-05-09
**Scope**: Trace specific user actions all the way through the system (UI → SQLite → sync queue → Supabase → realtime → other-device UI) and check whether every detail makes it intact, every transformation is correct, and every chain of logic produces the expected outcome.
**Method**: For each action, read every file the byte touches, verify the schema, follow the field lifecycle.

This is **not** a UI review and **not** a per-platform review. The other three docs cover those:
- [MOBILE_REVIEW.md](docs/MOBILE_REVIEW.md) — surface bugs in the mobile app
- [DESKTOP_REVIEW.md](docs/DESKTOP_REVIEW.md) — surface bugs in the desktop app
- [CROSS_PLATFORM_REVIEW.md](docs/CROSS_PLATFORM_REVIEW.md) — capability gaps + fidelity divergence between the two

This one asks: *when the user does something, does the system actually do the right thing?*

> Severity legend: **CRITICAL** / **HIGH** / **MEDIUM** / **LOW**

---

## PART 1 — Trace common user actions end-to-end

### 1.1 — User records a voice expense on mobile → does desktop show every detail?

**(Your headline example.)** Walking the bytes:

**Step 1**: User taps mic on Today / Record. STT (on-device) produces transcript.

**Step 2**: Transcript → [parseExpense()](packages/ai/src/parser.ts#L41-L94). Three tiers:
- Tier 1: local regex parser → if confidence ≥ 0.85, return.
- Tier 2: 30-min in-memory cache (lost on app restart).
- Tier 3: AI parse via `/api/ai/parse-expense`.

The AI prompt at [prompt.ts:13-33](packages/ai/src/prompt.ts#L13-L33) requests these fields:
| Field | Populated by AI | Used downstream? |
|---|---|---|
| `amount` | ✅ | ✅ shown everywhere |
| `currency` | ✅ | ✅ stored, used for formatting |
| `direction` | ✅ | ✅ debit/credit chip + math |
| `merchant` | ✅ | ✅ shown on every transaction row |
| `merchant_domain` | ✅ | ✅ used by MerchantAvatar / MerchantLogo for favicon |
| `category_suggestion` | ✅ | ✅ pre-fills CategoryPicker, may auto-create |
| `payment_method` | ✅ | ⚠️ saved to DB, **never displayed on web** |
| `transacted_at` | ✅ | ✅ shown as date+time |
| `confidence` | ✅ | ⚠️ saved as `ai_confidence`, **only shown if < 0.75 in confirm modal**, never afterward |
| `needs_clarification` | ✅ | ⚠️ shown in confirm modal only, **not persisted to schema** |
| `clarifying_question` | ✅ | ⚠️ shown in confirm modal only, not persisted |
| `is_recurring_suggestion` | ✅ | ⚠️ pre-checks the recurring toggle, then discarded |
| `recurring_frequency_suggestion` | ✅ | ⚠️ pre-fills frequency, then discarded |

**Step 3**: User reviews + confirms in [VoiceConfirmModal](apps/mobile/src/components/VoiceConfirmModal.tsx). Modal can edit: amount, direction, merchant, category, note, recurring + frequency.

**Step 4**: Save → [handleConfirmVoice()](apps/mobile/app/(tabs)/record.tsx#L184-L225) → [createTransaction()](apps/mobile/src/hooks/useTransactions.ts#L74-L119) → [upsertTransaction() into SQLite](apps/mobile/src/services/sync/transactionStore.ts#L47-L98) → [enqueue('create', ...)](apps/mobile/src/services/sync/syncQueue.ts#L17-L29) → [SyncManager.drainQueue()](apps/mobile/src/services/sync/SyncManager.ts#L66-L116) → Supabase upsert.

**Step 5**: Desktop has [Realtime subscription](apps/web/src/app/dashboard/transactions/page.tsx#L113-L139) on `transactions` table → re-fetches → renders the new row.

**Step 6**: Desktop renders the row at [transactions/page.tsx:298-368](apps/web/src/app/dashboard/transactions/page.tsx#L298-L368).

**What the desktop row actually shows**:
- ✅ Date + time (in user's locale)
- ✅ Merchant name + favicon (uses `merchant_domain`)
- ✅ Category chip (if known)
- ✅ Source chip ("Voice" with mic icon — matched correctly via `t.source === 'voice'`)
- ✅ Amount + currency (with sign + color)
- ✅ Recurring icon if `is_recurring`
- 🟡 "Account: Murmur" (always literally this string — see [DESKTOP_REVIEW §6.4](docs/DESKTOP_REVIEW.md))
- ❌ **`payment_method` is not displayed.** A user who said "paid for groceries with my credit card" → AI sets `payment_method='credit_card'` → saved to DB → desktop has no UI for it. Mobile's transaction detail screen DOES show it ([humanPayment](apps/mobile/app/transaction/[id].tsx#L106-L116)). Desktop doesn't.
- ❌ **`note` is not displayed.** Mobile shows it on the detail screen; desktop doesn't render notes at all.
- ❌ **`ai_confidence` is not displayed.** Stored in DB. Read nowhere on desktop.
- ❌ **`raw_transcript` is not displayed** (acceptable for privacy, but see §6.5).
- ❌ **No transaction detail page on desktop** at all — clicking a row does nothing. So even fields that aren't in the table couldn't be revealed by drilling in.

**Verdict**: the desktop row shows about 70% of the saved data. The user's literal question — "is everything logged correctly?" — answer: yes, the data is **stored** correctly. But it is **not all displayed** on desktop. This is a wiring gap, not a data bug.

**Severity**: `[HIGH]` — `payment_method` is the most user-visible miss; users explicitly recall their payment method when they say it.

**Fix**: 
1. Add `payment_method` column to the desktop transactions table (or expose on row hover / detail panel).
2. Add a transaction detail panel on desktop (cross-ref [CROSS_PLATFORM §1.7](docs/CROSS_PLATFORM_REVIEW.md)) that shows the full record.
3. Either remove `ai_confidence` from the schema or surface it (e.g. a small "AI" badge for low-confidence rows that the user might want to review).

---

### 1.2 — User records a manual expense on mobile → desktop view

Manual entry skips the AI parse. The user types amount + merchant + selects category + chooses payment method (in More options) + optionally toggles recurring.

Saved fields ([handleManualSave](apps/mobile/app/(tabs)/record.tsx#L270-L319)):
- amount, direction, currency_code, merchant, note, category_id, payment_method
- `source: 'manual'`
- `raw_transcript: null`
- `ai_confidence: null`

**On desktop**:
- Source chip classification: [transactions/page.tsx:40-47](apps/web/src/app/dashboard/transactions/page.tsx#L40-L47):
  ```ts
  if (t.is_recurring || t.source === 'recurring_generated') return 'recurring'
  if (t.source === 'voice') return 'voice'
  if (t.source === 'shortcut' || t.source === 'notification_listener') return 'apple-pay'
  return 'typed'  // ← falls through here for source='manual'
  ```
- ✅ `manual` → 'typed' chip — correct mental model.
- ❌ `payment_method` still not displayed (same as 1.1).
- ❌ `note` still not displayed.

**Verdict**: same gaps as 1.1, with one extra observation:

### 1.2.1 — `'scan'` source falls through to "Typed" on desktop `[MEDIUM]`
- **Where**: [transactions/page.tsx:40-47](apps/web/src/app/dashboard/transactions/page.tsx#L40-L47) — the `classifySource` function has no case for `'scan'`. Mobile's transaction detail screen has a "Scan" label at [transaction/[id].tsx:98](apps/mobile/app/transaction/[id].tsx#L98) and the schema's `source` enum explicitly lists `'scan'`.
- **Effect**: a receipt-scanned expense (mobile-only feature) shows as "Typed" on desktop. The user can't tell which transactions came from photographing receipts vs typing them in.
- **Fix**: add `if (t.source === 'scan') return 'scan'` and a "Scan" chip with a camera icon.

---

### 1.3 — User scans a receipt on mobile → desktop view

Scan flow at [record.tsx:227-268](apps/mobile/app/(tabs)/record.tsx#L227-L268). Camera → base64 → `parseScan` → confirm modal → save.

**Critical issues with the parsed result:**

### 1.3.1 — Receipt scans always default to `payment_method: 'cash'` `[HIGH]`
- **Where**: receipt prompt at [prompt.ts:36-57](packages/ai/src/prompt.ts#L36-L57) **does not request `payment_method`**. Field is missing from the JSON schema entirely.
- **Then**: at [record.tsx:194](apps/mobile/app/(tabs)/record.tsx#L194) the save uses `payment_method: voice.parsedExpense?.payment_method ?? 'cash'`. Since the field is null, **every receipt scan saves as "Cash."**
- **Effect**: A user who pays for groceries with a credit card and snaps the receipt sees the transaction logged as Cash. Wrong information by default.
- **Fix**: either add `payment_method` to the receipt prompt (the AI can usually read "VISA …1234" off receipts), or don't default to cash — leave null and let the user choose.

### 1.3.2 — Paycheck scans always suggest `recurring_frequency_suggestion: 'biweekly'` `[HIGH]`
- **Where**: paycheck prompt at [prompt.ts:59-77](packages/ai/src/prompt.ts#L59-L77) hardcodes `"recurring_frequency_suggestion": "biweekly"` directly in the JSON template the AI is asked to fill out. The AI doesn't reason about the actual cadence — it returns what's in the schema.
- **Effect**: Every paycheck scan suggests biweekly recurring. A user who is paid monthly (most US salaried roles), weekly, or semi-monthly has to manually correct the frequency every time.
- **Fix**: change the prompt to actually ask the AI to determine the cadence ("Look at the pay period dates on the stub. If two weeks apart, biweekly. If first/fifteenth or end-of-month, semi-monthly. If once a month, monthly. Else null.").

### 1.3.3 — `merchant_domain` always null on paycheck scans
- Paycheck prompt explicitly sets `"merchant_domain": null`. Reasonable (employers usually don't have a public-facing favicon).
- Effect: paycheck row shows the colored-letter fallback tile, never a logo. Acceptable — but worth noting the fallback path exists.

---

### 1.4 — User completes income onboarding → 1st month + next month

Already partially covered in MOBILE_REVIEW. Pulling the chain together:

**On day of onboarding** ([(onboarding)/income.tsx:44-89](apps/mobile/app/(onboarding)/income.tsx#L44-L89)):
1. `updateProfile({ monthly_income: X, monthly_income_source: name, onboarding_completed_at: now })`
2. `createTransaction(...)` — credit, dated NOW, is_recurring=true
3. `createRule(...)` — frequency=monthly, **no `template_txn_id`**

**Mobile transaction detail screen** opens this generated income txn:
- Looks for linked rule via `rules.find(r => r.template_txn_id === txn.id)` at [transaction/[id].tsx:217](apps/mobile/app/transaction/[id].tsx#L217)
- **Returns null** because the rule has no template_txn_id
- Detail screen shows just "Recurring" with no frequency or next-due ("ghost case" — see [transaction/[id].tsx:215](apps/mobile/app/transaction/[id].tsx#L215))

**Next month** when [runRecurringCatchUp](apps/mobile/src/services/recurringCatchUp.ts) runs:
- Fetches the rule. last_generated = onboarding date (set by [createRule line 126](apps/mobile/src/hooks/useRecurringRules.ts#L126))
- Computes next = onboarding date + 1 month
- If today > next → generates a new income txn with `source='recurring_generated'` and `recurring_rule_id=rule.id`
- The new txn does correctly link `recurring_rule_id` → so on the detail screen this one IS detectable as recurring.

**Inconsistency**: the FIRST income txn (created during onboarding) has `is_recurring=true` but neither `recurring_rule_id` set on the txn nor `template_txn_id` set on the rule. The SECOND, THIRD, ... income txns (catch-up generated) have `recurring_rule_id` set. So the user's first income transaction looks weird in the detail UI, every subsequent month looks normal.

**Severity**: `[HIGH]` — already covered in [MOBILE_REVIEW §3.7](docs/MOBILE_REVIEW.md). Fix is to capture the txn id from createTransaction and pass it as `template_txn_id` to createRule, and also set `recurring_rule_id` on the txn after rule creation.

---

### 1.5 — User flags a transaction as recurring → next-month auto-generation

Two paths to flag recurring on mobile:
- (a) Voice flow: AI suggested → toggle in confirm modal stays on → save creates txn + rule with `template_txn_id=txn.id`. Correct.
- (b) Edit screen toggle: existing txn is edited → reconcile logic at [edit.tsx:105-142](apps/mobile/app/transaction/edit.tsx#L105-L142) handles 4 cases (off→off, on→on, off→on, on→off). Correct.

**Then `runRecurringCatchUp` runs on next app open**:

### 1.5.1 — Catch-up can double-generate transactions when racing the server cron `[CRITICAL]`
- **Where**: [recurringCatchUp.ts:11-13](apps/mobile/src/services/recurringCatchUp.ts#L11-L13)
- **Comment claim**: *"This is the backup mechanism — the primary generator is a server-side Supabase Edge Function (generate-recurring) running daily via pg_cron. If the server already created the transaction, the sync upsert's version check prevents duplicates."*
- **Reality**:
  - Mobile catch-up generates a fresh `Crypto.randomUUID()` for the new txn ([line 44](apps/mobile/src/services/recurringCatchUp.ts#L44)).
  - Server-side Edge Function (assumed) generates a different fresh UUID for the same `recurring_rule_id` + `transacted_at`.
  - Supabase has no unique constraint on `(recurring_rule_id, transacted_at)`. Both inserts succeed.
  - The "version check" at [transactionStore.ts:70](apps/mobile/src/services/sync/transactionStore.ts#L70) is `WHERE excluded.version >= transactions.version`. This prevents an OLD update from overwriting a NEWER row by ID. It does **nothing** for two new rows with different IDs.
- **Effect**: User sees TWO income transactions for the same month, same amount, same date. Or two Netflix charges for the same Tuesday. Their budget math is wrong by exactly the rule amount.
- **Concrete repro**:
  1. User has a "monthly income" rule with `last_generated = 2026-04-01`.
  2. Server cron runs at midnight on 2026-05-01 → inserts txn UUID-A with `transacted_at=2026-05-01`, updates rule.last_generated=2026-05-01.
  3. User opens mobile at 2026-05-01 09:00 → mobile fetches the rule. **Issue**: if step 2's update hasn't propagated to mobile's read replica (or mobile fetched before step 2), mobile sees `last_generated=2026-04-01` → computes next=2026-05-01 → inserts UUID-B with `transacted_at=2026-05-01`.
  4. Two income txns. Same data. Different UUIDs.
- **Fix**: add a Postgres unique constraint on `(recurring_rule_id, transacted_at)` at the DB layer. The first insert wins; the second fails with a constraint violation; the catch-up just silently skips it. This is the architecturally correct deduplication key.

### 1.5.2 — Two concurrent mobile sessions also race `[HIGH]`
- Same issue without the server cron. If the user has two devices both running mobile (e.g. their phone and an iPad), both could open the app simultaneously, both fetch the same `last_generated`, both generate a new txn with different UUIDs, both push to Supabase. Both succeed.
- **Fix**: same as 1.5.1.

### 1.5.3 — Catch-up's `last_generated` update is per-rule but writes to Supabase only after the loop `[MEDIUM]`
- **Where**: [recurringCatchUp.ts:82, 89-94](apps/mobile/src/services/recurringCatchUp.ts#L82-L94)
- **What**: Inside the per-occurrence loop, `rule.last_generated` is mutated **in-memory only**. The Supabase write happens once per rule, after all occurrences are generated, at line 89-94.
- **Effect**: If catch-up is interrupted (app backgrounded mid-loop, network lost) after generating txn-1 but before generating txn-2 + the Supabase update — the rule on Supabase still says `last_generated=old_value`. Next launch: catch-up regenerates txn-1 (under a new UUID, since the local one was queued but not synced) → another duplicate.
- **Fix**: write `last_generated` to Supabase after each occurrence, not just at the end. Or use the unique constraint from 1.5.1.

### 1.5.4 — Mobile and web initialize `last_generated` differently when accepting a detected pattern `[MEDIUM]`
- **Mobile** [useRecurringRules.ts:126](apps/mobile/src/hooks/useRecurringRules.ts#L126): `last_generated: new Date().toISOString()` — treats creation as the first generation, so the first auto-generated occurrence is one frequency-period from creation.
- **Web** [recurring/page.tsx:214](apps/web/src/app/dashboard/recurring/page.tsx#L214): `last_generated: c.lastSeenAt` — uses the date of the last detected occurrence; the first auto-generated occurrence is one frequency-period from the last historical occurrence.
- **Concrete divergence**: User has Netflix charges on the 15th of each month. Detector flags it.
  - User accepts on **mobile** at 2026-05-09 → rule.last_generated=2026-05-09 → next=2026-06-09. **Wrong** — Netflix charges on the 15th, not the 9th.
  - User accepts on **web** at 2026-05-09 → rule.last_generated=c.lastSeenAt (e.g. 2026-04-15) → next=2026-05-15. **Right.**
- **Fix**: align on the web's behavior. Mobile should set `last_generated = c.lastSeenAt` when accepting from the pattern banner, and `last_generated = now` only for "I'm starting a new subscription right now" creations (which currently can't happen on mobile anyway).

---

## PART 2 — Math correctness

### 2.1 — Multi-currency totals are wrong everywhere `[HIGH]`
**The schema**: every transaction has its own `currency_code`. Profile has its own `currency_code` (used as default for new transactions and for display).

**The problem**: every aggregation in the codebase sums `amount` blindly without converting between currencies.

**Evidence**:
- Mobile Today's `spentToday` at [(tabs)/index.tsx:168-173](apps/mobile/app/(tabs)/index.tsx#L168-L173): `.reduce((sum, t) => sum + t.amount, 0)`.
- Mobile Insights' `sumDebits` at [(tabs)/insights.tsx:128-134](apps/mobile/app/(tabs)/insights.tsx#L128-L134): same.
- Mobile Budgets' `usePeriodSpend` (read in [(tabs)/budgets.tsx:64](apps/mobile/app/(tabs)/budgets.tsx#L64)): same.
- Mobile Recurring's monthly total at [recurring.tsx:95-98](apps/mobile/app/recurring.tsx#L95-L98): same.
- Mobile useMonthSummary at [useTransactions.ts:168-186](apps/mobile/src/hooks/useTransactions.ts#L168-L186): same.
- Web Overview at [dashboard/page.tsx:84-94](apps/web/src/app/dashboard/page.tsx#L84-L94): same.
- Web Insights at [insights/page.tsx:212-217](apps/web/src/app/dashboard/insights/page.tsx#L212-L217): same.
- Web Budgets at [budgets/page.tsx:148-176](apps/web/src/app/dashboard/budgets/page.tsx#L148-L176): same.
- Web Export totals at [export/page.tsx:74-79](apps/web/src/app/dashboard/export/page.tsx#L74-L79): same.

**Effect**: A user who has both USD transactions (default) and a EUR transaction (because they bought something in Europe and the AI parsed the currency correctly) sees their April total as `$2,000 + €50 = $2,050` — except those numbers represent different units. The "saved this month" KPI on the Overview is meaningless. The Budget ring lights up at "$1,950" out of $2,000 even if half of that is euros.

**Why this matters**: PLAN supports 10 currencies, including EUR/GBP/JPY/CHF and four African currencies. A traveler is the most likely to mix. A user who emigrates between countries has a long-tail problem: their old transactions stay in the old currency.

**Two ways to handle it**:
- (a) Filter all aggregations to `t.currency_code === profile.currency_code` and warn/exclude others.
- (b) Run an FX rate lookup at display time and convert (with caching). Adds a dependency on a rate provider.

**For now**, the bare minimum is (a) — at least make the totals coherent for a single currency. (b) can come later.

### 2.2 — Period-aware budget math
Cross-ref [MOBILE_REVIEW §1.4–1.5](docs/MOBILE_REVIEW.md) and [DESKTOP_REVIEW §4.5–4.6](docs/DESKTOP_REVIEW.md). Already documented.

### 2.3 — Forecast formulas diverge between mobile and web
Cross-ref [CROSS_PLATFORM §2.6](docs/CROSS_PLATFORM_REVIEW.md). Same data, different "expected" numbers depending on platform.

### 2.4 — "N expenses" counter on mobile profile card includes incomes
Cross-ref [MOBILE_REVIEW §6.3](docs/MOBILE_REVIEW.md).

### 2.5 — Day-of-month projection is divides-by-zero-friendly `[LOW]`
- **Where**: [(tabs)/insights.tsx:291-294](apps/mobile/app/(tabs)/insights.tsx#L291-L294): `projectedMonthly = (monthSpent / daysElapsed) * daysInSelectedMonth` if `daysElapsed >= 1`.
- **Effect**: Small `daysElapsed` (e.g. user opens Insights on the 1st of the month) and any spending creates a wildly inflated projection. If you've spent $100 on May 1 and the month has 31 days, the projection is $3,100. Probably not what the user wants to see.
- **Fix**: only show the projection once you've got, say, ≥5 days of data — otherwise show "Too early to project."

---

## PART 3 — State machine / lifecycle correctness

### 3.1 — Recurring catch-up duplicates → see §1.5.1, §1.5.2, §1.5.3.

### 3.2 — `last_generated` initialization mismatch → see §1.5.4.

### 3.3 — Edit reconciliation doesn't address `recurring_generated` transactions `[MEDIUM]`
- **Where**: [transaction/edit.tsx:114-142](apps/mobile/app/transaction/edit.tsx#L114-L142)
- **What**: When the user edits a transaction, the reconcile logic finds the linked rule via `rules.find(r => r.template_txn_id === txn.id)`. But for a transaction with `source='recurring_generated'`, the rule's `template_txn_id` points to the **original** template txn, not this generated one.
- **Effect**: User opens next month's auto-generated income, edits the amount up by $200 (raise!), saves. The transaction is updated locally and pushed. The rule's `amount` is **not updated** because the lookup fails. Next month, the auto-generated amount is still the old number.
- **Is this intentional?** Probably yes — editing a single occurrence shouldn't change the rule. But there's no UI that says "Change just this one" vs "Change all going forward" (calendar-app style). And the user's mental model when they edit this month's paycheck is usually "I got a raise; please apply going forward."
- **Fix**: at minimum, add a hint in the edit screen for `recurring_generated` transactions: "This was auto-generated from a recurring rule. Editing this transaction won't update the rule." Or add a "Update the rule too" toggle.

### 3.4 — Soft-delete + undo + sync queue ordering `[ok]`
- Verified by reading [transaction/[id].tsx:147-183](apps/mobile/app/transaction/[id].tsx#L147-L183).
- Delete: increments version, soft-marks deleted, enqueues 'delete'. `syncManager.drainQueue()` fires.
- Undo: bumps version again, marks `is_deleted: false`, upserts locally, enqueues 'update'.
- Sync queue is FIFO (`ORDER BY created_at ASC` at [syncQueue.ts:34](apps/mobile/src/services/sync/syncQueue.ts#L34)) — delete fires first, then update. Server sees: row deleted → row restored. Idempotent.
- **No issue here.** Mentioned only because it's a non-obvious correctness point.

### 3.5 — Two concurrent edits of the same transaction `[LOW]`
- Mobile + desktop both edit the same txn at the same time.
- Whoever pushes second wins (LWW via `WHERE excluded.version >= transactions.version` at [transactionStore.ts:70](apps/mobile/src/services/sync/transactionStore.ts#L70)).
- Web's edit (which doesn't exist yet — see [CROSS_PLATFORM §1.7](docs/CROSS_PLATFORM_REVIEW.md)) would simply overwrite with no merge.
- **Mention**: when web edit lands, decide whether you want LWW or merge. LWW is fine for a personal-finance app — collaborative editing isn't a thing here.

---

## PART 4 — Sync / realtime correctness

### 4.1 — Realtime subscriptions are inconsistent `[MEDIUM]`
What each side subscribes to via Supabase Realtime:

| Table | Mobile | Web |
|---|---|---|
| transactions | ✅ ([useTransactions.ts:45-72](apps/mobile/src/hooks/useTransactions.ts#L45-L72)) | ✅ ([transactions/page.tsx:113-139](apps/web/src/app/dashboard/transactions/page.tsx#L113-L139)) — only on Transactions page |
| recurring_rules | ❌ | ❌ |
| categories | ❌ | ❌ |
| budgets | ❌ | ❌ |
| profiles | ✅ via `DataEvents.onProfile` (cross-screen) but not Supabase Realtime — only same-device | ❌ |
| ask_conversations | ❌ | ❌ (only loaded once at mount) |

**Effect**:
- User changes locale on mobile → desktop shows old locale until they reload the page.
- User accepts a recurring pattern on mobile → desktop's Recurring page doesn't update.
- User creates a new category on mobile → desktop's Budgets/Transactions filter pills don't update until reload.
- User creates a new budget on mobile (budget editor exists) → desktop's Budgets page doesn't reflect it.

**Compare**: Transactions page on web DOES subscribe ([CROSS_PLATFORM §4.4](docs/CROSS_PLATFORM_REVIEW.md) noted Budgets specifically). The Transactions subscription is the only realtime hookup on web; everything else is one-shot fetch.

**Fix**: standardize. Either (a) Realtime everywhere — easy, since Supabase channels are cheap — or (b) explicit "Refresh" buttons on the surfaces that don't subscribe. Don't have it ad-hoc.

### 4.2 — Web's transactions Realtime channel is unscoped to user `[LOW]`
- **Where**: [transactions/page.tsx:115-119](apps/web/src/app/dashboard/transactions/page.tsx#L115-L119)
- **What**: `supabase.channel('web:transactions').on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => { ... })` — no `filter: user_id=eq.${userId}`.
- **Effect**: Every change to ANY user's transaction pings every user's channel. The handler then fetches the current user's transactions (which is correct) — so functionally fine, but: (a) bandwidth waste on Supabase's side, (b) at scale this becomes a real cost.
- **Fix**: add `filter: 'user_id=eq.' + user.id` like mobile does at [useTransactions.ts:57](apps/mobile/src/hooks/useTransactions.ts#L57).

### 4.3 — The mobile Realtime channel name is randomized `[LOW]`
- **Where**: [useTransactions.ts:48](apps/mobile/src/hooks/useTransactions.ts#L48): `transactions:${userId}:${Math.random().toString(36).slice(2)}`.
- **What**: Comment says it's to avoid React Strict Mode double-invoke conflicts. Fine. But each effect run creates a new channel — small leak risk if the cleanup doesn't always fire on Strict Mode unmount.
- **Mention only**: the fix is `useEffect` with stable dep + correct cleanup, which it does have. Worth a sanity check at runtime.

---

## PART 5 — AI parse → DB → display fidelity

### 5.1 — `payment_method` saved but not displayed on web → see §1.1.

### 5.2 — `note` saved but not displayed on web `[MEDIUM]`
- Saved everywhere. Read on mobile [transaction/[id].tsx:302](apps/mobile/app/transaction/[id].tsx#L302). Read in CSV export. **Not rendered anywhere on the desktop UI.**

### 5.3 — `ai_confidence` saved but only used in confirm modal → see [MOBILE_REVIEW §2.3](docs/MOBILE_REVIEW.md).

### 5.4 — `needs_clarification` + `clarifying_question` not persisted `[LOW]`
- AI populates them in the parse response.
- Confirm modal shows the `clarifying_question` if `needs_clarification` is true ([VoiceConfirmModal.tsx:157-161](apps/mobile/src/components/VoiceConfirmModal.tsx#L157-L161)).
- After save, the schema has no column for either. Lost.
- **Severity**: low. The clarifying question is intended to be in-the-moment. But if you ever want a "review unclear transactions later" surface, you'll have to re-parse.

### 5.5 — `is_recurring_suggestion` + `recurring_frequency_suggestion` discarded after pre-fill
- Modal pre-checks the toggle at [VoiceConfirmModal.tsx:76-82](apps/mobile/src/components/VoiceConfirmModal.tsx#L76-L82). Then they're just gone.
- If user toggles OFF, the rule isn't created. If user keeps ON, a rule is created using `recurring_frequency_suggestion` as the frequency.
- **Mention only**: this is the right shape. Just noting that the AI's recurring guess only matters in this one moment.

---

## PART 6 — Edge cases / boundary conditions

### 6.1 — Currency change after data exists `[MEDIUM]`
- **What**: User changes profile.currency_code from USD → EUR.
- **Then**:
  - All existing transactions stay with their original `currency_code` (per-row).
  - New transactions get the new currency.
  - Profile-currency-derived display (Today's "left this month", Insights header, Budget targets) all switch to EUR.
  - Existing transaction rows show their original symbol.
- **Effect**: A user who switches sees "€500 left this month" but the transactions on the same screen are all dated with `$` glyphs. Math at totals is broken (see §2.1).
- **Fix**: prompt the user when they change currency: "Convert your existing transactions to EUR using today's rate?" with options. Or at least surface the inconsistency.

### 6.2 — Timezone change while traveling `[LOW]`
- `transacted_at` is an ISO string with a timezone offset.
- Mobile `groupForToday` at [(tabs)/index.tsx:75-118](apps/mobile/app/(tabs)/index.tsx#L75-L118) uses `new Date(txn.transacted_at)` then `isSameDay(d, now)` — both based on local timezone.
- A txn dated 23:50 UTC (logged at 18:50 EST, before going to bed) → user flies to Tokyo → opens app at 9 AM JST (UTC 00:00) → "today" is now JST today → that 23:50 UTC txn is on UTC's "today" (depending on date) → may not appear in Today.
- **Severity**: low — niche use case. Most users don't time-zone-hop. But worth knowing the math is local-tz-relative.

### 6.3 — Future-dated transactions `[LOW]`
- AI prompt allows `transacted_at` to be future-dated (the prompt says "Use today if no date mentioned" but the AI can return any valid ISO).
- Mobile `groupForToday` includes it under the actual day — so a "tomorrow" txn shows up in tomorrow's section. Fine.
- Insights' month-windowed sums include only `transacted_at < monthEnd` — also fine for current month, but a future-dated December txn entered today would show up in December's totals when that month becomes current.
- **Mention only**: the system handles future dates correctly mathematically. UX-wise, no surface that says "Upcoming." A user who logs "I'll pay rent on the 1st" doesn't see anything until the 1st arrives.

### 6.4 — Editing a `recurring_generated` transaction → see §3.3.

### 6.5 — `raw_transcript` is stored on Supabase but not displayed on desktop `[MEDIUM]`
- Verified earlier: it IS pushed to Supabase ([MOBILE_REVIEW §4.1](docs/MOBILE_REVIEW.md)).
- Verified now: web's transactions/page.tsx does not render it. Web's transaction detail screen does not exist. So:
  - Privacy promise: "voice not stored" — broken (data IS on Supabase).
  - But the desktop UI never reveals it — so a user using only desktop won't see their voice transcripts, and won't realize they're stored.
  - A motivated user opening Supabase studio would. So would a leaked service-role key.
- **Why mentioning it here**: even if you decide to keep storing it, the inconsistency between "stored but never displayed" is an artifact, not a design choice. Decide one way: either make raw_transcript visible (with a privacy switch), or strip it on sync.

### 6.6 — User changes their UI locale → date strings re-render but copy doesn't `[LOW]`
- Mobile: locale change re-renders most strings via `t(key, locale)`.
- Web: locale change re-renders date/currency formatting (via Intl.NumberFormat / toLocaleDateString) but most copy is hardcoded English (see [DESKTOP_REVIEW §6.1](docs/DESKTOP_REVIEW.md)).
- **Effect**: a user who picks `fr` on mobile sees their dates as "vendredi 9 mai" on both surfaces, but every label and column header on web is still in English. Half-translated experience.

---

## PART 7 — Data flow gaps summary table

| Field | Saved to DB | Mobile shows | Web shows |
|---|---|---|---|
| `amount` | ✅ | ✅ | ✅ |
| `direction` | ✅ | ✅ | ✅ |
| `currency_code` | ✅ | ✅ inconsistent (some screens "USD", some "$") | ✅ proper symbols |
| `merchant` | ✅ | ✅ | ✅ |
| `merchant_domain` | ✅ | ✅ favicon | ✅ favicon |
| `category_id` (→ name/color) | ✅ | ✅ | ✅ |
| `note` | ✅ | ✅ on detail screen | ❌ never rendered |
| `payment_method` | ✅ | ✅ on detail screen | ❌ never rendered |
| `transacted_at` | ✅ | ✅ | ✅ |
| `source` | ✅ | ✅ on detail screen | ⚠️ partial — `'scan'` falls through to "Typed" |
| `raw_transcript` | ✅ | ✅ on detail screen | ❌ never rendered |
| `ai_confidence` | ✅ | ⚠️ only in confirm modal pre-save | ❌ never rendered |
| `is_recurring` | ✅ | ✅ icon + chip | ✅ icon |
| `recurring_rule_id` | ✅ | ✅ implicit (powers detail's recurring chip) | ❌ never used |
| `client_id`, `version`, `synced_at` | ✅ | system-internal | system-internal |

**Five fields are saved but underutilized** on web: note, payment_method, source-when-scan, raw_transcript, ai_confidence. Of these, the first three are user-facing details the user **expects** to see (they typed/spoke/photographed them). The last two are diagnostic.

---

## Severity summary

**Critical**:
- §1.5.1 Recurring catch-up can double-generate transactions (no DB-level dedup key)
- §1.3.1 Receipt scans always default to `payment_method: 'cash'` — wrong for most users

**High**:
- §1.1 `payment_method` saved but never displayed on desktop
- §1.2.1 `'scan'` source falls through to "Typed" on desktop
- §1.3.2 Paycheck scans always suggest biweekly regardless of actual cadence
- §1.4 Onboarding income produces an orphan rule (cross-ref MOBILE_REVIEW §3.7)
- §1.5.2 Two concurrent mobile sessions race on catch-up
- §2.1 Multi-currency totals are wrong everywhere

**Medium**:
- §1.5.3 last_generated update happens after the loop (interruption → duplicate)
- §1.5.4 Mobile/web initialize last_generated differently when accepting patterns
- §3.3 Edit reconciliation doesn't address `recurring_generated` transactions
- §4.1 Realtime subscriptions are inconsistent (only transactions are live)
- §5.2 `note` saved but not rendered on web
- §6.1 Currency change after data exists silently produces inconsistent display
- §6.5 `raw_transcript` stored on Supabase but invisible on desktop

**Low**:
- §2.5 Day-of-month projection inflates early in the month
- §3.5 Concurrent edit conflict resolution is LWW (note for the future)
- §4.2 Web realtime channel isn't user-scoped
- §4.3 Mobile realtime channel name is randomized (mention only)
- §5.4 needs_clarification not persisted (acceptable)
- §6.2, §6.3, §6.6 minor edge cases

---

## What needs your eyes (collected)

1. **§1.5.1** Confirm there is a `generate-recurring` Supabase Edge Function. If yes, run it twice in a row and check `SELECT recurring_rule_id, transacted_at, COUNT(*) FROM transactions GROUP BY 1,2 HAVING COUNT(*) > 1;` — if you get rows back, you have already-existing duplicates from the race I described.
2. **§1.5.4** Accept the same pattern on mobile and on web (if they're not already mutually-dismissing) → compare the resulting rules' `last_generated` and `next occurrence` predictions.
3. **§2.1** Have a user with a single EUR transaction in an otherwise-USD history → look at the Today total, Budget remaining, Insights' projected, Export totals → confirm they're showing nonsense.
4. **§3.3** Edit next month's auto-generated paycheck amount → next-next month, confirm the auto-generated paycheck is still the original amount (not the edited one).
5. **§4.1** Add a budget on mobile while desktop's Budgets page is open → confirm it doesn't appear until refresh.
6. **§6.5** `SELECT id, raw_transcript FROM transactions WHERE raw_transcript IS NOT NULL LIMIT 5;` in Supabase — confirm voice transcripts are visible to anyone with service-role access.
