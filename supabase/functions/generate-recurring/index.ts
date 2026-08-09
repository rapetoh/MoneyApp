// Edge Function: generate-recurring
// Triggered daily by pg_cron (or manually). Finds all active recurring rules
// with at least one due occurrence, generates a transaction for each, and
// advances last_generated on the rule.
//
// Deploy: supabase functions deploy generate-recurring
//
// Scheduling lives in supabase/migrations/015_cron_schedule_vault.sql — do
// not hand-create the cron job. The scheduled command reads the secret key
// from Supabase Vault at call time (vault.decrypted_secrets, name
// 'generate_recurring_key'). NEVER paste a key literal into
// cron.job.command: it persists in a system catalog, every logical backup,
// and every support export. Provision or rotate the credential out of band
// with a single statement:
//   select vault.create_secret('<secret key>', 'generate_recurring_key');
// The job picks up the new value on its next run; no cron change needed.
//
// DEPLOY-ORDER DEPENDENCY (fix-plan 1.5): this function writes
// `transactions.occurrence_date`, added by migration
// `020_recurrence_anchors.sql`. Apply that migration before redeploying
// this function — an un-migrated `transactions` table will reject every
// insert with an "unknown column" error, which is a full outage of daily
// generation, not a degraded one. If migration 020 is not yet live and
// this function must ship anyway, drop the `occurrence_date` field from
// the insert below rather than deploying against a stale schema.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { occurrencesDue } from '../_shared/recurrence.ts'
import type { Database } from '../_shared/database.types.ts'

// Typed client (fix-plan 1.2): `.from('transactions').insert({...})` below
// is now checked against the generated Row/Insert shape — an omitted
// required column or an invented column name is a deploy-time type error
// instead of a silent runtime `PGRST204`.
const supabase = createClient<Database>(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// Alias of the generated Row, narrowing the CHECK-constrained `string`
// columns codegen can't see to the app's literal unions (fix-plan 1.2 —
// same pattern packages/shared/src/types/*.ts uses for its hand-written
// domain types) rather than a hand-retyped duplicate. Renaming or
// dropping a column on `recurring_rules` is a compile error here too.
type RecurringRuleRow = Database['public']['Tables']['recurring_rules']['Row']
interface RecurringRule extends Omit<RecurringRuleRow, 'direction' | 'frequency'> {
  direction: 'debit' | 'credit'
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'
}

Deno.serve(async (req) => {
  // Only allow POST or scheduled invocations
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // The platform's verify_jwt can't validate the new sb_secret_* key
  // format, so the function is deployed with verify_jwt off and does
  // its own check: the caller must present the service-role key
  // (which the platform injects into our env). The pg_cron job sends
  // it in the Authorization header. Without this, anyone who found
  // the URL could trigger generation runs.
  const auth = req.headers.get('Authorization') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!serviceKey || auth !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const nowIso = new Date().toISOString()
  let generated = 0
  let errors = 0

  // Fetch all active rules
  const { data: rules, error: fetchError } = await supabase
    .from('recurring_rules')
    .select('*')
    .eq('is_active', true)

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Cache profile.currency_code / profile.timezone per user across the
  // loop — the cron typically generates many rows for the same user
  // (multiple bills, paycheck, etc.) and we don't need to re-read the
  // profile each time. `timezone` is what the recurrence engine resolves
  // civil dates against (fix-plan 1.5 / audit 04-F2, 04-F4, 04-F20,
  // 04-F21) — falling back to the schema default `'UTC'` for a profile
  // that hasn't captured its real zone yet, exactly as the column itself
  // does.
  const profileByUser = new Map<string, { currency_code: string; timezone: string }>()

  async function getProfile(userId: string): Promise<{ currency_code: string; timezone: string }> {
    const cached = profileByUser.get(userId)
    if (cached) return cached
    const { data } = await supabase
      .from('profiles')
      .select('currency_code, timezone')
      .eq('id', userId)
      .single()
    // Typed client (fix-plan 1.2): `data` is already `{ currency_code,
    // timezone } | null` — the manual `as` casts this used to need are
    // gone, not just hidden.
    const profile = {
      currency_code: data?.currency_code ?? 'USD',
      timezone: data?.timezone ?? 'UTC',
    }
    profileByUser.set(userId, profile)
    return profile
  }

  // FX rate cache per (date, from, to) so a single cron run hitting
  // many users on the same currency pair only fetches once.
  const fxCache = new Map<string, number>()
  async function fetchRate(date: string, from: string, to: string): Promise<number | null> {
    if (from === to) return 1
    const key = `${date}|${from}|${to}`
    const cached = fxCache.get(key)
    if (cached != null) return cached
    try {
      const res = await fetch(
        `https://api.frankfurter.app/${date}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      )
      if (!res.ok) return null
      const body = (await res.json()) as { rates?: Record<string, number> }
      const rate = body?.rates?.[to]
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return null
      fxCache.set(key, rate)
      return rate
    } catch (err) {
      console.warn('[generate-recurring] FX fetch failed:', err)
      return null
    }
  }

  for (const rule of (rules as RecurringRule[]) ?? []) {
    const { currency_code: profileCurrency, timezone } = await getProfile(rule.user_id)

    // Every due occurrence in one run (03-F15) — the old code called
    // `computeNext` once per rule per invocation, so a rule three months
    // behind took three months of daily cron runs to catch up; mobile's
    // own catch-up already looped and disagreed with the server about
    // how much history to backfill.
    const due = occurrencesDue(rule, nowIso, timezone)

    for (const occurrence of due) {
      const txnId = crypto.randomUUID()
      const transactedAt = occurrence.instant
      // Dated to the occurrence's resolved civil day in the user's zone,
      // not a UTC slice of the instant — the same day the dedup key
      // (`occurrence_date`, below) uses, so a bill generated near a
      // local midnight snapshots the FX rate for the day the user
      // actually experiences it on.
      const fxDate = occurrence.occurrenceDate

      // FX snapshot — migration 011. Same currency → rate 1, no
      // network. Different currency → frankfurter.app on the txn's
      // date. On lookup failure we still insert the row but leave the
      // snapshot null; the mobile-side backfill picks it up later.
      const rate = await fetchRate(fxDate, rule.currency_code, profileCurrency)
      const amountInProfile = rate != null ? Math.round(rule.amount * rate * 100) / 100 : null

      const { error: txnError } = await supabase.from('transactions').insert({
        id: txnId,
        user_id: rule.user_id,
        amount: rule.amount,
        direction: rule.direction,
        currency_code: rule.currency_code,
        category_id: rule.category_id,
        merchant: rule.name,
        note: rule.note,
        payment_method: rule.payment_method,
        amount_in_profile_currency: amountInProfile,
        fx_rate_to_profile: rate,
        fx_rate_date: rate != null ? fxDate : null,
        transacted_at: transactedAt,
        // `local_day` (migration 017) is `NOT NULL` with no default — every
        // writer must resolve it, not just this one. The untyped client
        // used to let this insert compile while omitting it, which would
        // have failed every recurring-generated row with a `23502` the
        // moment a real recurring rule existed (fix-plan 1.2 turns that
        // into the compile error it should always have been). Same civil
        // day as `occurrence_date` below — both mean "the resolved local
        // day in the owning profile's zone" (see migration 020's comment).
        local_day: occurrence.occurrenceDate,
        // The explicit civil-day dedup key (migration 020), superseding
        // migration 008's `(transacted_at AT TIME ZONE 'UTC')::date`
        // index — see this file's DEPLOY-ORDER DEPENDENCY header comment.
        occurrence_date: occurrence.occurrenceDate,
        source: 'recurring_generated',
        is_recurring: true,
        recurring_rule_id: rule.id,
        client_id: txnId,
        client_created_at: nowIso,
        version: 1,
        is_deleted: false,
        created_at: nowIso,
        updated_at: nowIso,
      })

      if (txnError) {
        console.error(`Failed to create transaction for rule ${rule.id}:`, txnError.message)
        errors++
        // Stop this rule's catch-up here rather than continuing to the
        // next occurrence — advancing past a failed insert would lose
        // the occurrence entirely (last_generated is what the next run
        // resumes from).
        break
      }

      // Advance last_generated after each occurrence (not once at the
      // end of the rule's loop) so an interruption between occurrences
      // resumes from the right point on the next run instead of
      // replaying from the value at the start of this invocation.
      const { error: updateError } = await supabase
        .from('recurring_rules')
        .update({ last_generated: transactedAt })
        .eq('id', rule.id)

      if (updateError) {
        console.error(`Failed to update rule ${rule.id}:`, updateError.message)
        errors++
        break
      }

      generated++
    }
  }

  return new Response(
    JSON.stringify({ generated, errors, checked: rules?.length ?? 0 }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
