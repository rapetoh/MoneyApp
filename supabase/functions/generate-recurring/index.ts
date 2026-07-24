// Edge Function: generate-recurring
// Triggered daily by pg_cron (or manually). Finds all active recurring rules
// whose next occurrence is today or in the past, generates a transaction for each,
// and advances last_generated on the rule.
//
// Deploy: supabase functions deploy generate-recurring
// Schedule (run once in Supabase SQL editor):
//   select cron.schedule('generate-recurring-daily', '0 6 * * *',
//     $$select net.http_post(
//       url := 'https://<project-ref>.supabase.co/functions/v1/generate-recurring',
//       headers := '{"Authorization": "Bearer <service-role-key>"}'::jsonb
//     )$$);

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

interface RecurringRule {
  id: string
  user_id: string
  name: string | null
  amount: number
  currency_code: string
  category_id: string | null
  direction: 'debit' | 'credit'
  payment_method: string | null
  note: string | null
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'
  interval: number
  starts_at: string
  ends_at: string | null
  last_generated: string | null
  is_active: boolean
  template_txn_id: string | null
}

function computeNext(rule: RecurringRule): Date | null {
  const base = rule.last_generated
    ? new Date(rule.last_generated)
    : new Date(rule.starts_at)

  const next = new Date(base)

  switch (rule.frequency) {
    case 'daily':     next.setDate(next.getDate() + rule.interval); break
    case 'weekly':    next.setDate(next.getDate() + 7 * rule.interval); break
    case 'biweekly':  next.setDate(next.getDate() + 14 * rule.interval); break
    case 'monthly':   next.setMonth(next.getMonth() + rule.interval); break
    case 'quarterly': next.setMonth(next.getMonth() + 3 * rule.interval); break
    case 'yearly':    next.setFullYear(next.getFullYear() + rule.interval); break
  }

  if (rule.ends_at && next > new Date(rule.ends_at)) return null
  return next
}

Deno.serve(async (req) => {
  // Only allow POST or scheduled invocations
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const now = new Date()
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

  // Cache profile.currency_code per user across the loop — the cron
  // typically generates many rows for the same user (multiple bills,
  // paycheck, etc.) and we don't need to re-read the profile each time.
  const profileCurrencyByUser = new Map<string, string>()

  async function getProfileCurrency(userId: string): Promise<string> {
    const cached = profileCurrencyByUser.get(userId)
    if (cached) return cached
    const { data } = await supabase
      .from('profiles')
      .select('currency_code')
      .eq('id', userId)
      .single()
    const code = (data as { currency_code?: string } | null)?.currency_code ?? 'USD'
    profileCurrencyByUser.set(userId, code)
    return code
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
    const next = computeNext(rule)
    if (!next) continue          // rule expired
    if (next > now) continue     // not due yet

    // Create the transaction
    const txnId = crypto.randomUUID()
    const nowIso = now.toISOString()
    const transactedAt = next.toISOString()
    const fxDate = transactedAt.slice(0, 10)

    // FX snapshot — migration 011. Same currency → rate 1, no
    // network. Different currency → frankfurter.app on the txn's
    // date. On lookup failure we still insert the row but leave the
    // snapshot null; the mobile-side backfill picks it up later.
    const profileCurrency = await getProfileCurrency(rule.user_id)
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
      continue
    }

    // Advance last_generated on the rule
    const { error: updateError } = await supabase
      .from('recurring_rules')
      .update({ last_generated: next.toISOString() })
      .eq('id', rule.id)

    if (updateError) {
      console.error(`Failed to update rule ${rule.id}:`, updateError.message)
      errors++
    } else {
      generated++
    }
  }

  return new Response(
    JSON.stringify({ generated, errors, checked: rules?.length ?? 0 }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
