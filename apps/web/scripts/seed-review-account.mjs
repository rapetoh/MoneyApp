#!/usr/bin/env node
// Seed the App Review demo account with realistic sample data.
//
// App Store review (Sep 8 2026, guideline 2.1.0 App Completeness): the
// reviewer signs in with review@itsmurmur.com and must find a lived-in
// app, not an empty ledger. This script signs in AS the demo user (anon
// key + the review password from apps/mobile/store.config.json, so RLS
// applies exactly as it does for the app), removes whatever the account
// holds, and writes ~19 transactions over the last 12 days plus a
// monthly budget. Idempotent: run it before every submission.
//
//   node apps/web/scripts/seed-review-account.mjs
//   REVIEW_EMAIL=... REVIEW_PASSWORD=... node apps/web/scripts/seed-review-account.mjs
//
// Rows are shaped like the web dashboard's manual insert (apps/web/src/
// app/dashboard/transactions/page.tsx): same-currency FX snapshot at
// rate 1.0, local_day in the profile's zone, client_id = id, version 1.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !ANON) {
  console.error('apps/web/.env.local must define NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

const store = JSON.parse(readFileSync(new URL('../../mobile/store.config.json', import.meta.url), 'utf8'))
const email = process.env.REVIEW_EMAIL || store.apple.review.demoUsername
const password = process.env.REVIEW_PASSWORD || store.apple.review.demoPassword

const supabase = createClient(URL_, ANON, { auth: { persistSession: false } })

// Recreate the account when it is gone. Demonstrating account deletion for
// App Review (guideline 5.1.1(v) wants a screen recording of the real flow)
// destroys the very account the reviewer signs in with, so this script has
// to be able to put it back, not just refill it. Creating a confirmed user
// needs the service role key; without one, say so instead of failing on a
// confusing "invalid credentials".
async function signInOrCreate() {
  const first = await supabase.auth.signInWithPassword({ email, password })
  if (first.data?.user) return first.data.user.id

  if (!SERVICE) {
    console.error(`sign-in failed for ${email} (${first.error?.message}) and SUPABASE_SERVICE_ROLE_KEY`)
    console.error('is not in apps/web/.env.local, so the account cannot be recreated here.')
    process.exit(1)
  }
  console.log(`sign-in failed (${first.error?.message}); recreating the account`)
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })
  const { error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (createErr) {
    console.error('could not recreate the review account:', createErr.message)
    process.exit(1)
  }
  // The profile row and the default categories come from a database trigger.
  await new Promise((r) => setTimeout(r, 2500))
  const second = await supabase.auth.signInWithPassword({ email, password })
  if (!second.data?.user) {
    console.error('recreated the account but still cannot sign in:', second.error?.message)
    process.exit(1)
  }
  console.log('account recreated')
  return second.data.user.id
}

const userId = await signInOrCreate()
console.log('review account', email, userId)

const { data: profile, error: profileErr } = await supabase
  .from('profiles')
  .select('timezone, currency_code')
  .eq('id', userId)
  .single()
if (profileErr) {
  console.error('profile read failed', profileErr.message)
  process.exit(1)
}
const tz = profile.timezone || 'America/Chicago'
const currency = profile.currency_code || 'USD'
console.log('profile zone', tz, 'currency', currency)

const { data: categories, error: catErr } = await supabase
  .from('categories')
  .select('id, name')
  .eq('user_id', userId)
  .eq('is_deleted', false)
if (catErr) {
  console.error('categories read failed', catErr.message)
  process.exit(1)
}
const catId = (name) => {
  const hit = categories.find((c) => c.name === name)
  if (!hit) throw new Error(`category "${name}" missing on the review account`)
  return hit.id
}

// ── time helpers (civil time in the profile's zone) ──────────────────────
function tzOffsetMinutes(date, zone) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]))
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return (asUTC - date.getTime()) / 60000
}
function civilDate(date, zone) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  )
  return { y: +p.year, m: +p.month, d: +p.day, iso: `${p.year}-${p.month}-${p.day}` }
}
function atLocal(daysAgo, hh, mm, zone) {
  const base = new Date(Date.now() - daysAgo * 86400000)
  const { y, m, d } = civilDate(base, zone)
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm))
  return new Date(guess.getTime() - tzOffsetMinutes(guess, zone) * 60000)
}

// ── sample ledger: [daysAgo, hh, mm, merchant, domain, amount, category, payment, source, transcript] ──
const SAMPLE = [
  [0, 9, 41, 'Starbucks', 'starbucks.com', 6.35, 'Food & Dining', 'credit_card', 'voice', 'six thirty five at Starbucks'],
  [0, 8, 12, 'Uber', 'uber.com', 28.5, 'Transport', 'digital_wallet', 'shortcut', null],
  [0, 7, 50, 'Amazon', 'amazon.com', 32.9, 'Shopping', 'credit_card', 'manual', null],
  [1, 18, 5, "Domino's", 'dominos.com', 18.4, 'Food & Dining', 'digital_wallet', 'shortcut', null],
  [1, 12, 30, 'Target', 'target.com', 62.3, 'Shopping', 'debit_card', 'voice', 'sixty two thirty at Target'],
  [1, 6, 0, 'Netflix', 'netflix.com', 15.49, 'Subscriptions', 'credit_card', 'manual', null],
  [2, 17, 45, 'Whole Foods', 'wholefoodsmarket.com', 84.12, 'Groceries', 'credit_card', 'voice', 'eighty four twelve at Whole Foods'],
  [2, 8, 20, 'Shell', 'shell.com', 45, 'Transport', 'credit_card', 'voice', 'forty five dollars gas at Shell'],
  [3, 12, 40, 'Chipotle', 'chipotle.com', 12.5, 'Food & Dining', 'digital_wallet', 'shortcut', null],
  [3, 16, 10, 'CVS', 'cvs.com', 23.7, 'Health & Medical', 'credit_card', 'voice', 'twenty three seventy at CVS'],
  [5, 7, 0, 'Spotify', 'spotify.com', 10.99, 'Subscriptions', 'credit_card', 'manual', null],
  [5, 18, 30, "Trader Joe's", 'traderjoes.com', 57.44, 'Groceries', 'credit_card', 'voice', "fifty seven forty four at Trader Joe's"],
  [6, 21, 15, 'Lyft', 'lyft.com', 14.2, 'Transport', 'digital_wallet', 'shortcut', null],
  [6, 19, 0, 'AMC Theatres', 'amctheatres.com', 32, 'Entertainment', 'credit_card', 'voice', 'thirty two dollars at AMC'],
  [8, 11, 20, 'Costco', 'costco.com', 143.88, 'Groceries', 'debit_card', 'voice', 'one forty three eighty eight at Costco'],
  [8, 9, 0, 'Xfinity', 'xfinity.com', 79.99, 'Utilities', 'bank_transfer', 'manual', null],
  [10, 8, 0, 'Rent', null, 1450, 'Housing', 'bank_transfer', 'manual', null],
  [10, 17, 30, 'Planet Fitness', 'planetfitness.com', 24.99, 'Personal Care', 'credit_card', 'manual', null],
]
const INCOME = [12, 9, 0, 'Acme Design Co', null, 2400, null, 'bank_transfer', 'manual', null]

const now = new Date().toISOString()
function row([daysAgo, hh, mm, merchant, domain, amount, category, payment, source, transcript], direction) {
  const id = randomUUID()
  const at = atLocal(daysAgo, hh, mm, tz)
  const day = civilDate(at, tz).iso
  return {
    id,
    user_id: userId,
    amount,
    direction,
    merchant,
    merchant_domain: domain,
    note: direction === 'credit' ? 'Paycheck' : null,
    category_id: category ? catId(category) : null,
    payment_method: payment,
    source,
    raw_transcript: transcript,
    currency_code: currency,
    amount_in_profile_currency: amount,
    fx_rate_to_profile: 1,
    fx_rate_date: day,
    transacted_at: at.toISOString(),
    local_day: day,
    client_id: id,
    client_created_at: now,
    version: 1,
    is_deleted: false,
  }
}

// ── reset ────────────────────────────────────────────────────────────────
async function clear(table) {
  const del = await supabase.from(table).delete().eq('user_id', userId)
  if (!del.error) return `${table}: cleared`
  // RLS without DELETE grants: fall back to the app's own soft delete.
  const soft = await supabase
    .from(table)
    .update({ is_deleted: true, deleted_at: now, updated_at: now })
    .eq('user_id', userId)
    .eq('is_deleted', false)
  if (soft.error) throw new Error(`${table}: could not clear (${del.error.message}; ${soft.error.message})`)
  return `${table}: soft-deleted existing rows`
}
console.log(await clear('transactions'))
console.log(await clear('budgets'))

// ── write ────────────────────────────────────────────────────────────────
const rows = [...SAMPLE.map((s) => row(s, 'debit')), row(INCOME, 'credit')]
const ins = await supabase.from('transactions').insert(rows)
if (ins.error) {
  console.error('transactions insert failed', ins.error.message)
  process.exit(1)
}
const monthStart = civilDate(new Date(), tz)
const budgetId = randomUUID()
const bud = await supabase.from('budgets').insert({
  id: budgetId,
  user_id: userId,
  amount: 1800,
  period: 'monthly',
  currency_code: currency,
  starts_at: `${monthStart.y}-${String(monthStart.m).padStart(2, '0')}-01`,
  is_active: true,
  is_deleted: false,
  client_id: budgetId,
  version: 1,
})
if (bud.error) {
  console.error('budget insert failed', bud.error.message)
  process.exit(1)
}

const { count } = await supabase
  .from('transactions')
  .select('id', { count: 'exact', head: true })
  .eq('user_id', userId)
  .eq('is_deleted', false)
const spent = rows.filter((r) => r.direction === 'debit').reduce((a, r) => a + r.amount, 0)
console.log(`done: ${count} live transactions (${rows.length} written, ${spent.toFixed(2)} ${currency} spent, one paycheck), monthly budget 1800 ${currency}`)
await supabase.auth.signOut()
