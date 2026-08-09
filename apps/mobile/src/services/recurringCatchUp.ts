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
 *
 * Duplicate prevention has two layers:
 *   1. Migration 008's partial unique index
 *      `(user_id, recurring_rule_id, transacted_at::date)` blocks any
 *      occurrence the server already wrote. SyncManager catches the
 *      23505 violation and drops the queue entry cleanly.
 *   2. `last_generated` is persisted to Supabase after EACH occurrence
 *      so an interrupted catch-up (app backgrounded, network drop) can
 *      resume from the right point on next launch instead of replaying
 *      from the previous synced value.
 */

import { supabase } from '../lib/supabase'
import { upsertTransaction, hasRecurringOccurrence } from './sync/transactionStore'
import { enqueue } from './sync/syncQueue'
import { computeNextOccurrence } from '../hooks/useRecurringRules'
import { getCurrentProfileCurrency } from './profileCurrency'
import type { RecurringRule, Transaction } from '@voice-expense/shared'
import { snapshotFx } from '@voice-expense/shared'
import * as Crypto from 'expo-crypto'

export async function runRecurringCatchUp(userId: string): Promise<number> {
  // Fetch all active rules for this user
  const { data: rules, error } = await supabase
    .from('recurring_rules')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (error || !rules?.length) return 0

  const now = new Date()
  let generated = 0

  for (const rule of rules as RecurringRule[]) {
    // Generate all missed occurrences (not just one — user may not
    // have opened the app for several cycles)
    let safetyLimit = 50 // prevent infinite loops
    let next = computeNextOccurrence(rule)

    while (next && next <= now && safetyLimit > 0) {
      safetyLimit--

      // Skip occurrences that already exist locally — typically because
      // `pullRemote` brought down the server cron's row before catch-up
      // ran. Without this guard the upsert would hit the partial unique
      // index `idx_txn_recurring_dedup` and fail.
      const alreadyExists = await hasRecurringOccurrence(
        userId,
        rule.id,
        next.toISOString(),
      )
      if (alreadyExists) {
        rule.last_generated = next.toISOString()
        await supabase
          .from('recurring_rules')
          .update({ last_generated: rule.last_generated })
          .eq('id', rule.id)
        next = computeNextOccurrence(rule)
        continue
      }

      const txnId = Crypto.randomUUID()
      const nowIso = now.toISOString()
      const transactedAt = next.toISOString()

      // FX snapshot for the generated occurrence (migration 011). The
      // rate is dated to the txn's transacted_at, not today — a
      // monthly bill generated today for last-month's date uses
      // last-month's rate so the historical totals stay coherent.
      const profileCurrency = getCurrentProfileCurrency()
      const fx = await snapshotFx(transactedAt, rule.currency_code, profileCurrency, rule.amount)

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
        transacted_at: transactedAt,
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

      // Advance last_generated on the rule so the next iteration
      // computes the following occurrence. Persist immediately so an
      // interruption between occurrences doesn't replay this one on
      // next launch (the unique index would catch it, but persisting
      // here also avoids spamming the sync queue with rows that we
      // know will lose the race).
      rule.last_generated = next.toISOString()
      await supabase
        .from('recurring_rules')
        .update({ last_generated: rule.last_generated })
        .eq('id', rule.id)

      generated++
      next = computeNextOccurrence(rule)
    }
  }

  return generated
}
