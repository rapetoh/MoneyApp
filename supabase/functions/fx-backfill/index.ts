// Edge Function: fx-backfill
//
// Fix-plan 1.4 ("One money and aggregation module"), Change part 3.
// Historical foreign-currency transactions carry a NULL
// `amount_in_profile_currency` until something looks up the historical
// rate and writes it back (migration 011_fx_snapshot.sql). Until now
// that "something" only ran on the mobile client
// (`apps/mobile/src/services/fxBackfill.ts`, kicked off on app
// launch) — a web-only user's foreign-currency rows stayed NULL
// forever. Every aggregation excludes NULL rows rather than lying
// with an unconverted amount (`isFxPending`/`summarize()` in
// `packages/shared/src/domain/money.ts`), so those users' totals were
// silently short with no client ever running to fix it.
//
// This function is the same sweep, moved server-side and run on a
// cron schedule (supabase/migrations/023_fx_backfill_cron.sql) so it
// covers every user regardless of platform. It does not replace the
// mobile sweep — both are safe to run concurrently; the WHERE clause
// (`amount_in_profile_currency IS NULL`) makes every write idempotent
// and there's no ordering dependency between them.
//
// Deploy: supabase functions deploy fx-backfill
//
// Scheduling lives in supabase/migrations/023_fx_backfill_cron.sql —
// do not hand-create the cron job. Same vault-key pattern as migration
// 015 / generate-recurring: the scheduled command reads the secret key
// from Supabase Vault at call time (vault.decrypted_secrets, name
// 'fx_backfill_key') rather than embedding it in `cron.job.command`.
// Provision or rotate the credential out of band with a single
// statement:
//   select vault.create_secret('<secret key>', 'fx_backfill_key');
//
// Query shape mirrors the partial index built for exactly this sweep:
// `idx_txn_needs_fx_backfill` (migration 011) on
// `(user_id, transacted_at) WHERE amount_in_profile_currency IS NULL
// AND is_deleted = false`.
//
// The FX lookup below duplicates `packages/shared/src/utils/fx.ts`'s
// `fetchFxRate`, rather than importing it — same reason
// `generate-recurring/index.ts` keeps its own inline copy instead of
// importing the shared module: Deno Edge Functions deploy only this
// function's own directory tree, with no workspace resolution and no
// import map configured for this project. If `fx.ts`'s rate-lookup
// logic changes, port the change here too.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// Cap per invocation so a large backlog (or a slow/unreachable FX
// provider) can't turn one cron tick into a multi-minute request — the
// cron interval (023_fx_backfill_cron.sql) re-runs often enough to
// drain a large backlog over a handful of ticks instead.
const BATCH_SIZE = 200

interface PendingRow {
  id: string
  user_id: string
  amount: number
  currency_code: string
  transacted_at: string
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Same service-role bearer check as generate-recurring — the
  // platform's verify_jwt can't validate the new sb_secret_* key
  // format, so this function is deployed with verify_jwt off and does
  // its own check. Without this, anyone who found the URL could
  // trigger a sweep (and burn the FX provider's rate limit) on demand.
  const auth = req.headers.get('Authorization') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!serviceKey || auth !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data: rows, error: fetchError } = await supabase
    .from('transactions')
    .select('id, user_id, amount, currency_code, transacted_at')
    .eq('is_deleted', false)
    .is('amount_in_profile_currency', null)
    .order('transacted_at', { ascending: false })
    .limit(BATCH_SIZE)

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const pending = (rows as PendingRow[] | null) ?? []
  if (pending.length === 0) {
    return new Response(JSON.stringify({ filled: 0, skipped: 0, checked: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Cache profile currency per user — a backlog is typically dominated
  // by a handful of users with long foreign-currency histories, so
  // this keeps a 200-row batch from re-reading the same profile 200
  // times.
  const profileCurrencyCache = new Map<string, string>()
  async function getProfileCurrency(userId: string): Promise<string> {
    const cached = profileCurrencyCache.get(userId)
    if (cached) return cached
    const { data } = await supabase
      .from('profiles')
      .select('currency_code')
      .eq('id', userId)
      .single()
    const currency = (data as { currency_code?: string } | null)?.currency_code ?? 'USD'
    profileCurrencyCache.set(userId, currency)
    return currency
  }

  // Rate cache per (date, from, to) — many rows in one batch often
  // share a currency pair and date (e.g. a week of EUR dinners).
  const rateCache = new Map<string, number>()
  async function fetchRate(date: string, from: string, to: string): Promise<number | null> {
    if (from === to) return 1
    const key = `${date}|${from}|${to}`
    const cached = rateCache.get(key)
    if (cached != null) return cached
    try {
      const res = await fetch(
        `https://api.frankfurter.app/${date}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      )
      if (!res.ok) return null
      const body = (await res.json()) as { rates?: Record<string, number> }
      const rate = body?.rates?.[to]
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return null
      rateCache.set(key, rate)
      return rate
    } catch (err) {
      console.warn('[fx-backfill] rate fetch failed:', err)
      return null
    }
  }

  let filled = 0
  let skipped = 0

  for (const row of pending) {
    const profileCurrency = await getProfileCurrency(row.user_id)
    const date = row.transacted_at.slice(0, 10)
    const rate = await fetchRate(date, row.currency_code, profileCurrency)
    if (rate == null) {
      // Leave the row NULL — the next scheduled run (or the mobile
      // client's own sweep, if that user opens the app) retries it.
      // Never write a guessed value: the whole point of migration 011
      // is that a caller can tell "not yet converted" apart from "$0",
      // and writing a fabricated rate here would erase that signal.
      skipped++
      continue
    }
    const amountInProfile = Math.round(row.amount * rate * 100) / 100
    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        amount_in_profile_currency: amountInProfile,
        fx_rate_to_profile: rate,
        fx_rate_date: date,
      })
      .eq('id', row.id)
    if (updateError) {
      console.error(`[fx-backfill] failed to update ${row.id}:`, updateError.message)
      skipped++
      continue
    }
    filled++
  }

  return new Response(JSON.stringify({ filled, skipped, checked: pending.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
