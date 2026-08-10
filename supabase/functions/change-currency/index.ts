// Edge Function: change-currency
//
// Fix-plan 2.7 ("Currency change as a migration, not a label swap" —
// audit 05-F13, 06-F8, 08-F5). `amount_in_profile_currency` is a
// write-time snapshot (migration 011). Before this function existed,
// changing `profiles.currency_code` was a bare column write —
// `apps/mobile/app/more/settings.tsx`'s currency picker called
// `updateProfile({ currency_code: c })` and nothing else — so every
// historical `amount_in_profile_currency` kept its old magnitude and
// silently acquired a new label. A $10,000 year became "€10,000" with
// one tap, permanently, and Ask Murmur was then told `currency: EUR`
// while the numbers underneath were still dollars.
//
// This function makes a currency change a real re-denomination instead:
// it recomputes `amount_in_profile_currency` / `fx_rate_to_profile` /
// `fx_rate_date` / `snapshot_currency` (migration 026) for every
// non-deleted transaction at the historical rate for that row's own
// `local_day`, converts `budgets.amount` and `profiles.monthly_income`,
// and only then flips `profiles.currency_code` — never before, and only
// once every other write below it has already succeeded.
//
// Batched + resumable, not one giant operation. Each invocation converts
// up to BATCH_SIZE transactions whose `snapshot_currency` doesn't yet
// match the target currency and returns `{ done: false, remaining }` if
// more are left. `profiles.currency_code` (and the budgets/income
// conversion) is only reached on the invocation that finds *zero*
// transactions still needing conversion. The caller
// (`apps/mobile/src/services/profileCurrency.ts`'s `changeCurrency`)
// loops on this endpoint until `done: true`, showing progress between
// calls. Because nothing about `profiles.currency_code` is touched
// until that final, all-succeeded call, an interruption at any point —
// a network drop, a failed rate lookup, the app being killed — leaves
// the profile on its old currency; the next call (or
// `fxBackfill.ts`/`fx-backfill`'s self-heal predicate, which also keys
// off `snapshot_currency`) picks up exactly where it left off, and
// nothing in the app ever reads a mismatched currency/amount pair as a
// result of a half-finished run.
//
// No service-role key anywhere in this function. Every row touched
// below is one the calling user already owns — `transactions`,
// `budgets` and `profiles` all carry a `USING (auth.uid() = user_id)` /
// `USING (auth.uid() = id)` RLS policy (migration 001) — so this runs
// entirely as the caller, via their own JWT, scoped by RLS rather than
// by application code remembering to filter on `user_id`. One fewer
// function on the service-role surface (the direction fix-plan 0.4
// already took the desktop shell and delete-user's data reads in).
//
// Deploy: supabase functions deploy change-currency
//
// Called by: apps/mobile/src/services/profileCurrency.ts's
// `changeCurrency()`, itself invoked from
// apps/mobile/app/more/settings.tsx's currency picker after an explicit
// "this will reconvert N transactions" confirmation and an online check
// — a half-converted account must never be reachable from an offline
// tap.
//
// The FX lookup below duplicates `packages/shared/src/utils/fx.ts`'s
// `fetchFxRate` rather than importing it, and `SUPPORTED_CURRENCIES`
// duplicates `apps/mobile/app/more/settings.tsx`'s `CURRENCIES` list —
// same reason `fx-backfill/index.ts` gives for its own duplication:
// Deno Edge Functions deploy only this function's own directory tree,
// with no workspace resolution and no import map configured for this
// project. If either list changes, port the change here too.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { Database } from '../_shared/database.types.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Must stay in sync with apps/mobile/app/more/settings.tsx's CURRENCIES —
// rejecting anything outside this list keeps a typo'd or unsupported
// code from ever reaching frankfurter.app or the CHECK constraints
// migration 021/026 put on `currency_code`/`snapshot_currency`.
const SUPPORTED_CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'CAD', 'CHF', 'JPY', 'AUD', 'XAF', 'NGN', 'GHS',
])

// Rows per invocation. Matches fx-backfill's own cap
// (supabase/functions/fx-backfill/index.ts) for the same reason: a large
// backlog, or a slow/unreachable FX provider, shouldn't turn one call
// into a multi-minute request the mobile client's own network stack
// gives up on — the client just calls again for the next batch.
const BATCH_SIZE = 200

interface PendingTxnRow {
  id: string
  amount: number
  currency_code: string
  local_day: string
}

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
    console.warn('[change-currency] rate fetch failed:', err)
    return null
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'Missing Authorization' }, 401)

  let newCurrency: string
  try {
    const body = await req.json()
    newCurrency = String((body as { newCurrency?: unknown })?.newCurrency ?? '').toUpperCase()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (!/^[A-Z]{3}$/.test(newCurrency) || !SUPPORTED_CURRENCIES.has(newCurrency)) {
    return json({ error: `Unsupported currency: ${newCurrency || '(empty)'}` }, 400)
  }

  // Every subsequent call rides this one client, carrying the caller's
  // own JWT — see the module doc comment on why there is no
  // service-role client in this function at all.
  const supabase = createClient<Database>(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  )

  const { data: userResult, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userResult?.user) return json({ error: 'Invalid token' }, 401)
  const userId = userResult.user.id

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('currency_code, monthly_income')
    .eq('id', userId)
    .single()
  if (profileErr || !profile) return json({ error: 'Profile not found' }, 404)

  if (profile.currency_code === newCurrency) {
    return json({ ok: true, done: true, alreadyCurrent: true, converted: 0, remaining: 0, total: 0 })
  }

  // "Still needs conversion for this change" = not yet snapshotted for
  // the target currency. Using `snapshot_currency` (rather than, say, a
  // separate progress counter) is what makes this idempotent and
  // resumable across calls with no other state to track: a row already
  // converted by an earlier invocation of this same change simply
  // doesn't match the predicate on the next one.
  const needsConversionFilter = `snapshot_currency.is.null,snapshot_currency.neq.${newCurrency}`

  const { count: totalCount } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .or(needsConversionFilter)

  const { data: pending, error: fetchErr } = await supabase
    .from('transactions')
    .select('id, amount, currency_code, local_day')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .or(needsConversionFilter)
    .order('transacted_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (fetchErr) return json({ error: fetchErr.message }, 500)

  const rows = (pending as PendingTxnRow[] | null) ?? []

  if (rows.length > 0) {
    let converted = 0
    for (const row of rows) {
      // Each row converts from *its own* currency_code to the target,
      // dated to *its own* local_day — not old-profile-currency →
      // new-currency, which would compound two roundings for any row
      // whose native currency never matched the old profile currency in
      // the first place. This mirrors exactly how the write-time
      // snapshot (migration 011, packages/shared/src/utils/fx.ts) is
      // computed for a brand new transaction.
      const rate = await fetchRate(row.local_day, row.currency_code, newCurrency)
      if (rate == null) {
        // Stop this batch here instead of skipping past a failing
        // lookup — the predicate above re-selects this exact row on the
        // next call, so there's no benefit to burning the rest of the
        // batch against a provider that's already failing, and no data
        // is lost either way.
        break
      }
      const amountInProfile = Math.round(row.amount * rate * 100) / 100
      const { error: updateErr } = await supabase
        .from('transactions')
        .update({
          amount_in_profile_currency: amountInProfile,
          fx_rate_to_profile: rate,
          fx_rate_date: row.local_day,
          snapshot_currency: newCurrency,
        })
        .eq('id', row.id)
      if (updateErr) {
        console.error('[change-currency] failed to update transaction', row.id, updateErr.message)
        break
      }
      converted++
    }
    const total = totalCount ?? rows.length
    return json({
      ok: true,
      done: false,
      converted,
      remaining: Math.max(total - converted, 0),
      total,
    })
  }

  // No transactions left to convert. Finalize: budgets, monthly_income,
  // and only then — last — profiles.currency_code itself. Dated to
  // today rather than a per-row historical date: unlike a transaction, a
  // budget limit and a monthly income figure are ongoing amounts, not
  // historically-dated events.
  const today = new Date().toISOString().slice(0, 10)
  const finalRate = await fetchRate(today, profile.currency_code, newCurrency)
  if (finalRate == null) {
    return json(
      {
        ok: false,
        done: false,
        error: 'FX lookup failed while converting budgets/income — profile currency left unchanged',
        converted: 0,
        remaining: 0,
        total: totalCount ?? 0,
      },
      502,
    )
  }

  const { data: budgets, error: budgetsErr } = await supabase
    .from('budgets')
    .select('id, amount')
    .eq('user_id', userId)
    .eq('is_deleted', false)
  if (budgetsErr) return json({ error: `Failed to read budgets: ${budgetsErr.message}` }, 500)

  for (const b of (budgets ?? []) as Array<{ id: string; amount: number }>) {
    // `budgets.amount` carries `CHECK (amount > 0)` — clamp the floor so
    // a very small budget in a low-value currency can't round to zero
    // and fail the write.
    const newAmount = Math.max(Math.round(b.amount * finalRate * 100) / 100, 0.01)
    const { error: bErr } = await supabase
      .from('budgets')
      .update({ amount: newAmount, currency_code: newCurrency })
      .eq('id', b.id)
    if (bErr) return json({ error: `Failed to convert budget ${b.id}: ${bErr.message}` }, 500)
  }

  const { error: profileUpdateErr } = await supabase
    .from('profiles')
    .update({
      monthly_income_currency: newCurrency,
      monthly_income:
        profile.monthly_income != null
          ? Math.round(profile.monthly_income * finalRate * 100) / 100
          : profile.monthly_income,
      // Last write in the whole operation. Every read surface in the app
      // decides what currency to render off this column — it only
      // changes once nothing above it could still be wrong.
      currency_code: newCurrency,
    })
    .eq('id', userId)
  if (profileUpdateErr) {
    return json({ error: `Failed to finalize currency change: ${profileUpdateErr.message}` }, 500)
  }

  return json({ ok: true, done: true, converted: 0, remaining: 0, total: totalCount ?? 0 })
})
