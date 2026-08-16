#!/usr/bin/env node
// Live end-to-end check of the PRODUCTION Ask Murmur API, driven exactly the
// way the mobile thread screen (apps/mobile/app/more/ask-result.tsx) drives
// it: throwaway user → real JWT → a multi-turn conversation with `history`
// → the error paths → cleanup (the user is deleted; profile/categories
// cascade). Prints every verdict so a human can judge the reasoning.
//
//   node apps/web/scripts/ask-murmur-e2e.mjs
//
// Reads Supabase URL / anon key / service-role key from apps/web/.env.local.
// Costs one OpenAI call per turn. Added Aug 15, 2026 after the owner asked
// for proof the feature was exercised end to end, not just typechecked —
// run it before any release that touches Ask Murmur (packages/ai/src/
// askMurmur*.ts, the ask-murmur route, or the mobile/web thread screens).
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('/Users/roch/Desktop/money-app/apps/web/.env.local', 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)
const URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const API = 'https://money-app-web-w6su.vercel.app'

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
const email = `ask-e2e-${Date.now()}@example.com`
const password = `E2e!${Math.random().toString(36).slice(2)}Aa9`

const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
if (cErr) { console.error('createUser failed', cErr); process.exit(1) }
const userId = created.user.id
console.log('test user', userId)

try {
  const anon = createClient(URL, ANON, { auth: { persistSession: false } })
  const { data: signIn, error: sErr } = await anon.auth.signInWithPassword({ email, password })
  if (sErr) throw sErr
  const token = signIn.session.access_token

  // Realistic data shaped like the owner's own recent activity.
  const now = new Date()
  const daysAgo = (n, h = 12) => new Date(now.getTime() - n * 864e5 - (12 - h) * 36e5).toISOString()
  const tx = (amount, merchant, category_name, d, direction = 'debit', is_recurring = false) =>
    ({ amount, amount_in_profile_currency: amount, direction, merchant, category_name, transacted_at: daysAgo(d), is_recurring })
  const transactions = [
    tx(6, 'Snacks', 'Food & Dining', 0),
    tx(500, 'Louis Vuitton', 'Shopping', 0),
    tx(500, 'Kunkel & Associates', 'Business & Work', 1, 'credit'),
    tx(300, 'Charles Schwab', 'Savings & Investing', 3, 'debit', true),
    tx(42, 'Xtream', 'Utilities', 3, 'debit', true),
    tx(50, 'Starbucks', 'Food & Dining', 3),
    tx(12.4, 'Blue Bottle Coffee', 'Food & Dining', 5),
    tx(28.5, 'Uber', 'Transportation', 6),
    tx(62.3, "Trader Joe's", 'Groceries', 8),
    tx(14, 'Netflix', 'Subscriptions', 9, 'debit', true),
    tx(1000, '20 LLC', 'Business & Work', 10, 'credit', true),
    tx(1500, 'The20', 'Business & Work', 10, 'credit', true),
    tx(38.8, 'Rappi', 'Food & Dining', 12),
    tx(85, 'Shell', 'Transportation', 15),
    tx(120, 'Whole Foods', 'Groceries', 20),
    tx(1000, '20 LLC', 'Business & Work', 24, 'credit', true),
    tx(1500, 'The20', 'Business & Work', 24, 'credit', true),
    tx(300, 'Charles Schwab', 'Savings & Investing', 33, 'debit', true),
    tx(42, 'Xtream', 'Utilities', 33, 'debit', true),
    tx(210, 'Amazon', 'Shopping', 40),
    tx(9.5, 'Starbucks', 'Food & Dining', 41),
    tx(75, 'Chipotle', 'Food & Dining', 45),
  ]
  const recurring_rules = [
    { name: '20 LLC', amount: 1000, direction: 'credit', frequency: 'biweekly' },
    { name: 'The20', amount: 1500, direction: 'credit', frequency: 'biweekly' },
    { name: 'Xtream', amount: 42, direction: 'debit', frequency: 'monthly' },
    { name: 'Charles Schwab', amount: 300, direction: 'debit', frequency: 'monthly' },
  ]

  const base = {
    locale: 'en', currency: 'USD', now_utc: now.toISOString(), time_zone: 'America/Chicago',
    monthly_income: 5416.67, transactions, recurring_rules,
  }

  async function ask(question, history, headers = {}) {
    const t0 = Date.now()
    const res = await fetch(`${API}/api/ai/ask-murmur`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...headers },
      body: JSON.stringify({ ...base, question, ...(history.length ? { history } : {}) }),
    })
    const ms = Date.now() - t0
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch {}
    return { status: res.status, ms, json, text }
  }

  // ---- Conversation, exactly as the mobile thread sends it ----
  const history = []
  const turns = [
    'How much did I spend on food this month?',
    'And how does that compare to last month?',
    'Which merchant was the biggest part of it?',
    'Can I afford a $400 pair of shoes right now?',
  ]
  for (const q of turns) {
    const r = await ask(q, history)
    console.log(`\n=== Q: ${q}\n[${r.status} · ${r.ms}ms]`)
    if (r.status !== 200 || !r.json) { console.log('RAW:', r.text.slice(0, 600)); continue }
    console.log('VERDICT:', r.json.verdict?.text)
    if (r.json.breakdown) console.log('BREAKDOWN:', r.json.breakdown.caption, JSON.stringify(r.json.breakdown.rows))
    if (r.json.note) console.log('NOTE:', r.json.note.text)
    console.log('ATTRIB:', JSON.stringify(r.json.attribution))
    history.push({ question: q, answer: r.json.verdict.text })
  }

  // ---- Error paths the screen must handle ----
  const noAuth = await fetch(`${API}/api/ai/ask-murmur`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...base, question: 'hi' }) })
  console.log('\nno-auth →', noAuth.status)
  const empty = await ask('', [])
  console.log('empty question →', empty.status, empty.text.slice(0, 120))
  const noData = await fetch(`${API}/api/ai/ask-murmur`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...base, transactions: [], recurring_rules: [], question: 'How much did I spend on coffee?' }) })
  const nd = await noData.json().catch(() => null)
  console.log('no-data question →', noData.status, nd?.verdict?.text)
} finally {
  // Cleanup: the trigger-created profile/categories cascade from auth.users.
  const { error } = await admin.auth.admin.deleteUser(userId)
  console.log('\ncleanup', error ? `FAILED: ${error.message}` : 'ok')
}
