/**
 * Client-side catch-up for recurring transactions.
 *
 * Runs on app launch. Checks all active recurring rules, computes which
 * ones are due (next occurrence <= now), and generates the missing
 * transactions locally. Each generated transaction is also enqueued for
 * sync to Supabase.
 *
 * This is the backup mechanism — the primary generator is a server-side
 * Supabase Edge Function (generate-recurring) running daily via pg_cron.
 * Both now walk the same bounded `occurrencesDue` from the shared engine
 * (`packages/shared/src/domain/recurrence.ts`, fix-plan 2.3(c)) instead
 * of each hand-rolling its own iteration cap.
 *
 * Duplicate prevention has three layers:
 *   1. Migration 020's `idx_txn_recurring_dedup` (keyed on the resolved
 *      `occurrence_date`, not a UTC-cast `transacted_at`) blocks any
 *      occurrence the server already wrote. SyncManager catches the
 *      23505 violation and drops the queue entry cleanly.
 *   2. `hasRecurringOccurrence` below — a fast local SQLite check for
 *      the same (rule, occurrence_date) pair, so a row `pullRemote`
 *      already brought down doesn't even reach the network layer.
 *   3. `findLiveManualMatch` (fix-plan 2.3(a)) — before generating,
 *      look for *any* live, non-generated transaction with a matching
 *      merchant within +/-3 days, not just one already carrying this
 *      rule's id. Layer 2 alone is what made the user's own
 *      manually-logged bill invisible to the guard: it has no
 *      `recurring_rule_id` yet, so `hasRecurringOccurrence` (and
 *      migration 008/013's dedup index before it) never saw it. A match
 *      here gets *linked* to the rule instead of shadowed by a second,
 *      generated row.
 *   4. `last_generated` is persisted to Supabase after EACH occurrence
 *      so an interrupted catch-up (app backgrounded, network drop) can
 *      resume from the right point on next launch instead of replaying
 *      from the previous synced value.
 */

import { getCalendars } from 'expo-localization'
import { supabase } from '../lib/supabase'
import { upsertTransaction, hasRecurringOccurrence } from './sync/transactionStore'
import { enqueue } from './sync/syncQueue'
import { getCurrentProfileCurrency } from './profileCurrency'
import type { RecurringRule, Transaction } from '@voice-expense/shared'
import { snapshotFx, localDay, occurrencesDue, type Occurrence } from '@voice-expense/shared'
import * as Crypto from 'expo-crypto'

const DAY_MS = 24 * 60 * 60 * 1000
/** Window (each side) `findLiveManualMatch` searches for a live,
 *  non-generated transaction around a due occurrence's date. */
const MANUAL_MATCH_WINDOW_DAYS = 3

/** Best-effort device zone — mirrors `useTransactions.ts`'s own
 *  `getDeviceTimeZone` (fix-plan 1.3 part 1). Used to resolve
 *  `local_day` for each generated occurrence below. */
function getDeviceTimeZone(): string {
  try {
    return getCalendars()[0]?.timeZone ?? 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * A live (not soft-deleted), non-engine-generated transaction with a
 * normalised-merchant match (case-insensitive) within +/-3 days of
 * `occurrence`'s civil date — fix-plan 2.3(a)'s broadened duplicate
 * guard. Returns its id so the caller can link rather than duplicate.
 */
async function findLiveManualMatch(
  userId: string,
  merchant: string,
  occurrence: Occurrence,
): Promise<string | null> {
  const targetMs = new Date(occurrence.instant).getTime()
  const from = new Date(targetMs - MANUAL_MATCH_WINDOW_DAYS * DAY_MS).toISOString()
  const to = new Date(targetMs + MANUAL_MATCH_WINDOW_DAYS * DAY_MS).toISOString()
  const { data } = await supabase
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .neq('source', 'recurring_generated')
    .ilike('merchant', merchant)
    .gte('transacted_at', from)
    .lte('transacted_at', to)
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

async function runRecurringCatchUpInner(userId: string): Promise<number> {
  // Fetch all active rules for this user
  const { data: rules, error } = await supabase
    .from('recurring_rules')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (error || !rules?.length) return 0

  const now = new Date()
  const nowIsoOuter = now.toISOString()
  const tz = getDeviceTimeZone()
  let generated = 0

  for (const rule of rules as RecurringRule[]) {
    try {
      // Every occurrence due as of "now", resolved once up front by the
      // shared engine's own bounded walk (fix-plan 2.3(c)) rather than
      // this file hand-rolling a `while (next && next <= now)` loop —
      // the Edge Function now does the same via the same function.
      const due = occurrencesDue(rule, nowIsoOuter, tz, 50)

      for (const occurrence of due) {
        // Layer 2: already exists locally (server cron beat us to it).
        const alreadyExists = await hasRecurringOccurrence(
          userId,
          rule.id,
          occurrence.occurrenceDate,
        )
        if (alreadyExists) {
          rule.last_generated = occurrence.instant
          await supabase
            .from('recurring_rules')
            .update({ last_generated: rule.last_generated })
            .eq('id', rule.id)
          continue
        }

        // Layer 3: a live transaction the user logged manually already
        // covers this cycle — link it to the rule instead of shadowing
        // it with a duplicate generated row.
        if (rule.name) {
          const manualMatchId = await findLiveManualMatch(userId, rule.name, occurrence)
          if (manualMatchId) {
            await supabase
              .from('transactions')
              .update({ recurring_rule_id: rule.id, occurrence_date: occurrence.occurrenceDate })
              .eq('id', manualMatchId)
            rule.last_generated = occurrence.instant
            await supabase
              .from('recurring_rules')
              .update({ last_generated: rule.last_generated })
              .eq('id', rule.id)
            continue
          }
        }

        const txnId = Crypto.randomUUID()
        const nowIso = now.toISOString()
        const transactedAt = occurrence.instant

        // FX snapshot for the generated occurrence (migration 011). The
        // rate is dated to the txn's transacted_at, not today — a
        // monthly bill generated today for last-month's date uses
        // last-month's rate so the historical totals stay coherent.
        const profileCurrency = getCurrentProfileCurrency()
        const fx = await snapshotFx(transactedAt, rule.currency_code, profileCurrency, rule.amount, tz)

        const txn: Transaction = {
          id: txnId,
          user_id: userId,
          amount: rule.amount,
          direction: rule.direction,
          currency_code: rule.currency_code,
          category_id: rule.category_id ?? null,
          merchant: rule.name ?? null,
          merchant_domain: null,
          note: rule.note ?? null,
          payment_method: rule.payment_method as Transaction['payment_method'],
          amount_in_profile_currency: fx?.amount_in_profile_currency ?? null,
          fx_rate_to_profile: fx?.fx_rate_to_profile ?? null,
          fx_rate_date: fx?.fx_rate_date ?? null,
          // Which currency the snapshot above targets (migration 026,
          // fix-plan 2.7) — `profileCurrency` when the snapshot actually
          // filled (matches what `createTransaction`/`fxBackfill.ts`
          // record), `null` alongside a null snapshot so this row still
          // reads as "needs a snapshot" rather than "already correct for
          // no currency in particular" to the backfill sweep's predicate.
          snapshot_currency: fx ? profileCurrency : null,
          transacted_at: transactedAt,
          // transactions.local_day (migration 017, NOT NULL) — resolved
          // once here at generation time, same as `useTransactions.ts`'s
          // `createTransaction`.
          local_day: localDay(transactedAt, tz),
          // The engine's own resolved civil day (migration 020) — the
          // dedup key `idx_txn_recurring_dedup` now uses. `upsertTransaction`
          // (apps/mobile/src/services/sync/transactionStore.ts, outside
          // this item's file ownership) still recomputes this from
          // `transacted_at`'s UTC slice on write rather than honouring
          // this value — same civil day for every zone at least
          // MANUAL_MATCH_WINDOW_DAYS away from a UTC offset boundary,
          // divergent only in the DST-edge case migration 020 exists to
          // fix. Threading the honoured value through that write path is
          // that file's own Stage 2 adoption.
          occurrence_date: occurrence.occurrenceDate,
          source: 'recurring_generated',
          raw_transcript: null,
          ai_confidence: null,
          is_recurring: true,
          recurring_rule_id: rule.id,
          // Generated FROM a rule — the cadence lives on the rule itself.
          recurring_frequency: null,
          client_id: txnId,
          client_created_at: nowIso,
          version: 1,
          is_deleted: false,
          deleted_at: null,
          synced_at: null,
          created_at: nowIso,
          updated_at: nowIso,
        }

        // Write to local SQLite
        await upsertTransaction(txn)

        // Enqueue for sync to Supabase
        await enqueue('create', txnId, txn)

        // Advance last_generated on the rule so an interruption between
        // occurrences resumes from the right point on next launch.
        // Persisted immediately rather than batched at the end of the
        // rule's loop.
        rule.last_generated = occurrence.instant
        await supabase
          .from('recurring_rules')
          .update({ last_generated: rule.last_generated })
          .eq('id', rule.id)

        generated++
      }
    } catch (err) {
      // This runs fire-and-forget from _layout.tsx — nothing awaits
      // runRecurringCatchUp's promise, so a throw here would surface as
      // an unhandled rejection instead of a screen the user could act
      // on. Catch per rule (not around the whole function) so one rule
      // failing — a bad FX lookup, a rejected write — doesn't also skip
      // every other rule queued behind it in this loop.
      console.warn(`[recurringCatchUp] rule ${rule.id} failed:`, err)
    }
  }

  return generated
}

/**
 * In-flight guard (fix-plan 2.3(d)'s "each guarded by a module-level
 * in-flight promise"). `_layout.tsx`'s routing effect (outside this
 * item's file ownership) fires on every navigation with no
 * re-entrancy guard today — this is the defense that belongs to this
 * function regardless of whether that call site is fixed, since two
 * concurrent runs racing the same rule's `last_generated` read is a
 * real hazard (both compute the same due occurrence, both attempt to
 * insert it) independent of *why* they overlapped. A second call while
 * one is already running gets the same in-flight promise rather than
 * starting a second pass.
 */
let inFlight: Promise<number> | null = null

export function runRecurringCatchUp(userId: string): Promise<number> {
  if (inFlight) return inFlight
  const run = runRecurringCatchUpInner(userId).finally(() => {
    if (inFlight === run) inFlight = null
  })
  inFlight = run
  return run
}
