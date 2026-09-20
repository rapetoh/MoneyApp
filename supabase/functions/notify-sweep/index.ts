// Edge Function: notify-sweep
//
// The one place Murmur decides to say something unprompted.
//
// Why it exists. Until Sep 19 2026 every Murmur notification was a local
// one: the app asked iOS to show a fixed sentence at a fixed time, days in
// advance. That mechanism cannot carry a number, because the number is not
// known when the alarm is set, which is why the entire catalogue read
// "Anything to add from today?". Anything worth saying about money is only
// true at the moment of sending, and only the server is awake then.
//
// Scheduling lives in supabase/migrations/037_notify_sweep_cron.sql. Do not
// hand-create the cron job. The scheduled command reads the secret key from
// Supabase Vault (name 'notify_sweep_key'), exactly as migrations 015 and
// 023 established. NEVER paste a key literal into cron.job.command.
//
// Deploy: supabase functions deploy notify-sweep
//
// DEPLOY-ORDER DEPENDENCY: requires migration 036 (push_tokens,
// notification_prefs, notification_log, profiles.plus_billing_issue_at).
// Apply it first or every run fails on an unknown relation.
//
// All decision logic is in `@voice-expense/shared`'s notifications module,
// reached through ../_shared/generated/shared.ts, so the server and the two
// apps agree on every claim. This file is transport: read, decide, send,
// record. Anything resembling a threshold in here is a bug.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  planNotifications,
  govern,
  DEFAULT_NOTIFICATION_PREFS,
  localDay,
  localParts,
  type NotificationCandidate,
} from '../_shared/generated/shared.ts'
import type { Database } from '../_shared/database.types.ts'

const supabase = createClient<Database>(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

/** Ceiling on users examined per run. A sweep that runs long is a sweep
 *  that overlaps the next one; better to process a bounded slice and say
 *  so in the response than to time out halfway with no record of where it
 *  stopped. Revisit when the eligible set regularly hits this. */
const MAX_USERS_PER_RUN = 500

/** How much history the engines need: `computeAskInsights` compares this
 *  month to the two before it, so 120 days covers every window with room. */
const HISTORY_DAYS = 120

interface PushToken {
  id: string
  token: string
  platform: string
}

/** Expo's per-message shape. `interruptionLevel` is what makes a bill
 *  warning break through Focus while a recap waits politely in the
 *  scheduled summary. */
interface ExpoMessage {
  to: string
  title: string
  body: string
  sound: string | null
  data: Record<string, string>
  interruptionLevel?: 'passive' | 'active' | 'time-sensitive' | 'critical'
  channelId?: string
  _contentAvailable?: boolean
}

function toExpoMessage(token: string, c: NotificationCandidate): ExpoMessage {
  return {
    to: token,
    title: c.title,
    body: c.body,
    // Passive messages arrive without a sound: a weekly recap does not
    // need to interrupt a room.
    sound: c.urgency === 'passive' ? null : 'default',
    data: { ...c.data, kind: c.kind, family: c.family },
    interruptionLevel: c.urgency,
    // Android channels, one per family, so muting recaps in system
    // settings cannot also mute a failed payment.
    channelId: c.family,
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  // Same self-check as generate-recurring: the platform's verify_jwt
  // cannot validate the sb_secret_* key format, so the function is
  // deployed with verify_jwt off and checks the service-role key itself.
  const auth = req.headers.get('Authorization') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!serviceKey || auth !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const nowIso = new Date().toISOString()
  const nowMs = Date.parse(nowIso)
  let considered = 0
  let sent = 0
  let failed = 0
  const reasons: Record<string, number> = {}

  // Only users with somewhere to send. A user with no live token cannot
  // be notified and must not cost a round of engine work.
  const { data: tokenRows, error: tokenErr } = await supabase
    .from('push_tokens')
    .select('id, user_id, token, platform')
    .is('disabled_at', null)
    .limit(MAX_USERS_PER_RUN * 4)

  if (tokenErr) {
    return new Response(JSON.stringify({ error: tokenErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const tokensByUser = new Map<string, PushToken[]>()
  for (const r of tokenRows ?? []) {
    const list = tokensByUser.get(r.user_id) ?? []
    list.push({ id: r.id, token: r.token, platform: r.platform })
    tokensByUser.set(r.user_id, list)
  }

  const userIds = [...tokensByUser.keys()].slice(0, MAX_USERS_PER_RUN)

  for (const userId of userIds) {
    considered++
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select(
          'timezone, locale, currency_code, monthly_income, plus_status, plus_period_type, plus_expires_at, plus_will_renew, plus_billing_issue_at, plus_grace_until',
        )
        .eq('id', userId)
        .single()
      if (!profile) continue

      const tz = profile.timezone || 'UTC'
      const localHour = localParts(nowIso, tz).hour

      // Preferences, with the conservative defaults for anyone who has
      // never opened the settings screen.
      const { data: prefRow } = await supabase
        .from('notification_prefs')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      const prefs = prefRow
        ? {
            receipts: prefRow.receipts,
            bills: prefRow.bills,
            budget: prefRow.budget,
            insights: prefRow.insights,
            habit: prefRow.habit,
            quiet_start: prefRow.quiet_start,
            quiet_end: prefRow.quiet_end,
            max_per_week: prefRow.max_per_week,
          }
        : DEFAULT_NOTIFICATION_PREFS

      // Cheap early exit, before any engine work: inside quiet hours
      // nothing can go out, and the sweep runs again in an hour.
      const quiet =
        prefs.quiet_start === prefs.quiet_end
          ? false
          : prefs.quiet_start < prefs.quiet_end
            ? localHour >= prefs.quiet_start && localHour < prefs.quiet_end
            : localHour >= prefs.quiet_start || localHour < prefs.quiet_end
      if (quiet) {
        reasons.quiet_hours = (reasons.quiet_hours ?? 0) + 1
        continue
      }

      // What has already been said. `dedupe_key` is the claim's identity;
      // the counts are the governor's ceilings.
      const sinceIso = new Date(nowMs - 7 * 86_400_000).toISOString()
      const { data: logRows } = await supabase
        .from('notification_log')
        .select('dedupe_key, family, sent_at')
        .eq('user_id', userId)
        .gte('sent_at', sinceIso)
      const alreadySent = new Set((logRows ?? []).map((r) => r.dedupe_key))
      const today = localDay(nowIso, tz)
      // Transactional messages do not consume the ceilings, so they are
      // excluded from both counts here, matching `govern`'s contract.
      const nonTransactional = (logRows ?? []).filter((r) => r.family !== 'money')
      const sentToday = nonTransactional.filter((r) => localDay(r.sent_at, tz) === today).length
      const sentLast7Days = nonTransactional.length

      // Dedupe keys older than the 7-day log window still matter for
      // long-lived claims (a monthly budget crossing, a trial end). Pull
      // those by prefix rather than widening the window for everything.
      const { data: olderRows } = await supabase
        .from('notification_log')
        .select('dedupe_key')
        .eq('user_id', userId)
        .lt('sent_at', sinceIso)
        .gte('sent_at', new Date(nowMs - 90 * 86_400_000).toISOString())
      for (const r of olderRows ?? []) alreadySent.add(r.dedupe_key)

      const historyFrom = new Date(nowMs - HISTORY_DAYS * 86_400_000).toISOString()
      const [{ data: txns }, { data: rules }, { data: budgets }] = await Promise.all([
        supabase
          .from('transactions')
          .select(
            'amount, amount_in_profile_currency, direction, transacted_at, category_id, recurring_rule_id, source, client_created_at, created_at, categories(name)',
          )
          .eq('user_id', userId)
          .eq('is_deleted', false)
          .gte('transacted_at', historyFrom),
        supabase.from('recurring_rules').select('*').eq('user_id', userId).eq('is_active', true),
        supabase.from('budgets').select('*, categories(name)').eq('user_id', userId).eq('is_active', true),
      ])

      const transactions = (txns ?? []).map((t: Record<string, unknown>) => ({
        amount: t.amount,
        amount_in_profile_currency: t.amount_in_profile_currency,
        direction: t.direction,
        transacted_at: t.transacted_at,
        category_id: t.category_id,
        category_name: (t.categories as { name?: string } | null)?.name ?? null,
        recurring_rule_id: t.recurring_rule_id,
      }))

      // "Last logged" means the user's own entry. A bill the server
      // generated at 06:00 is not a sign of life and must never cancel a
      // win-back.
      let lastLoggedAt: string | null = null
      for (const t of txns ?? []) {
        const row = t as Record<string, unknown>
        if (row.source === 'recurring_generated') continue
        const stamp = (row.client_created_at as string) ?? (row.created_at as string)
        if (stamp && (!lastLoggedAt || stamp > lastLoggedAt)) lastLoggedAt = stamp
      }

      const candidates = planNotifications({
        nowUtc: nowIso,
        timeZone: tz,
        locale: (profile.locale ?? 'en') as 'en' | 'fr' | 'es' | 'pt',
        currency: profile.currency_code ?? 'USD',
        monthlyIncome: profile.monthly_income ?? null,
        transactions: transactions as never,
        rules: (rules ?? []) as never,
        budgets: ((budgets ?? []) as Record<string, unknown>[]).map((b) => ({
          id: b.id as string,
          period: b.period as never,
          starts_at: b.starts_at as string,
          category_id: (b.category_id as string) ?? null,
          currency_code: b.currency_code as string,
          amount: Number(b.amount),
          category_name: (b.categories as { name?: string } | null)?.name ?? null,
        })),
        plus: {
          plus_status: profile.plus_status as never,
          plus_period_type: profile.plus_period_type as never,
          plus_expires_at: profile.plus_expires_at,
          plus_will_renew: profile.plus_will_renew,
          plus_billing_issue_at: profile.plus_billing_issue_at,
          plus_grace_until: profile.plus_grace_until,
        },
        lastLoggedAt,
      })

      const chosen = govern(candidates, {
        prefs,
        localHour,
        alreadySent,
        sentLast7Days,
        sentToday,
      })
      if (!chosen) {
        reasons.nothing_to_say = (reasons.nothing_to_say ?? 0) + 1
        continue
      }

      // Claim the message BEFORE sending. The unique index on
      // (user_id, dedupe_key) is what makes two overlapping sweeps
      // incapable of sending the same claim twice: the loser's insert
      // fails and it moves on. Sending first and recording after would
      // leave exactly that race open.
      const { data: claimed, error: claimErr } = await supabase
        .from('notification_log')
        .insert({
          user_id: userId,
          family: chosen.family,
          kind: chosen.kind,
          dedupe_key: chosen.dedupeKey,
          title: chosen.title,
          body: chosen.body,
          data: chosen.data,
        })
        .select('id')
        .single()

      if (claimErr) {
        // 23505 is the other sweep winning the race, which is the system
        // working. Anything else is a real failure.
        if (claimErr.code !== '23505') {
          console.error(`notify-sweep: claim failed for ${userId}:`, claimErr.message)
          failed++
        }
        continue
      }

      const messages = (tokensByUser.get(userId) ?? []).map((t) => toExpoMessage(t.token, chosen))
      if (!messages.length) continue

      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      })

      if (!res.ok) {
        // The claim is a promise that the user was told. If the send did
        // not happen, the promise is false and must be withdrawn, or the
        // claim is never retried and the user never hears it.
        await supabase.from('notification_log').delete().eq('id', claimed.id)
        console.error(`notify-sweep: push failed for ${userId}: ${res.status}`)
        failed++
        continue
      }

      // Expo answers per message. A DeviceNotRegistered ticket means the
      // app is gone or the token rotated: retire the row so later sweeps
      // stop paying for it.
      const payload = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] }
      const tickets = payload.data ?? []
      const tokens = tokensByUser.get(userId) ?? []
      let anyDelivered = false
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i]
        if (ticket.status === 'ok') {
          anyDelivered = true
          continue
        }
        if (ticket.details?.error === 'DeviceNotRegistered' && tokens[i]) {
          await supabase
            .from('push_tokens')
            .update({ disabled_at: nowIso, disabled_reason: 'DeviceNotRegistered' })
            .eq('id', tokens[i].id)
        }
      }

      if (!anyDelivered) {
        await supabase.from('notification_log').delete().eq('id', claimed.id)
        failed++
        continue
      }
      sent++
    } catch (err) {
      // One user's bad data must never stop the sweep for everyone else.
      console.error(`notify-sweep: ${userId} threw:`, err instanceof Error ? err.message : String(err))
      failed++
    }
  }

  return new Response(
    JSON.stringify({
      considered,
      sent,
      failed,
      reasons,
      capped: tokensByUser.size > MAX_USERS_PER_RUN,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
