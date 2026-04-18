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
 * If the server already created the transaction, the sync upsert's
 * version check prevents duplicates.
 */

import { supabase } from '../lib/supabase'
import { upsertTransaction } from './sync/transactionStore'
import { enqueue } from './sync/syncQueue'
import { computeNextOccurrence } from '../hooks/useRecurringRules'
import type { RecurringRule } from '@voice-expense/shared'
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

      const txnId = Crypto.randomUUID()
      const nowIso = now.toISOString()

      const txn = {
        id: txnId,
        user_id: userId,
        amount: rule.amount,
        direction: rule.direction,
        currency_code: rule.currency_code,
        category_id: rule.category_id ?? null,
        merchant: rule.name ?? null,
        merchant_domain: null,
        note: rule.note ?? null,
        payment_method: rule.payment_method as any ?? 'other',
        transacted_at: next.toISOString(),
        source: 'recurring_generated' as const,
        raw_transcript: null,
        ai_confidence: null,
        is_recurring: true,
        recurring_rule_id: rule.id,
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
      // computes the following occurrence
      rule.last_generated = next.toISOString()

      generated++
      next = computeNextOccurrence(rule)
    }

    // Persist the advanced last_generated back to Supabase
    if (generated > 0) {
      await supabase
        .from('recurring_rules')
        .update({ last_generated: rule.last_generated })
        .eq('id', rule.id)
    }
  }

  return generated
}
