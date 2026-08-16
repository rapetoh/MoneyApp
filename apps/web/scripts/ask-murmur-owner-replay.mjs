#!/usr/bin/env node
// Replays the owner's Aug 16 desktop conversation (screenshots) against the
// live API on data shaped exactly like the owner's account (Gadget Maison:
// history starts Aug 8, one payday, "The20 MSP" deposit LINKED to the
// "20 LLC" rule) and checks the answers a human verified against the DB.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const API = process.env.API_BASE || 'https://money-app-web-w6su.vercel.app'
const PACE_MS = Number(process.env.PACE_MS || 15000)
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })
const email = `ask-owner-${Date.now()}@example.com`, password = `E2e!${Math.random().toString(36).slice(2)}Aa9`
const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
const userId = created.user.id
const failures = []
const pass = (m) => console.log('  ✓ ' + m), fail = (m) => { failures.push(m); console.log('  ✗ ' + m) }
try {
  await new Promise((r) => setTimeout(r, 1500))
  await admin.from('profiles').update({ plus_status: 'active' }).eq('id', userId)
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } })
  const { data: signIn } = await anon.auth.signInWithPassword({ email, password })
  const token = signIn.session.access_token

  // Owner's August as of Aug 16 (Chicago). Dates in UTC.
  const tx = (amount, merchant, category_name, at, direction = 'debit', extra = {}) => ({ amount, amount_in_profile_currency: amount, direction, merchant, category_name, transacted_at: at, is_recurring: false, recurring_rule_id: null, ...extra })
  const transactions = [
    tx(160, 'Best Buy', 'Shopping', '2026-08-16T01:04:14Z'),
    tx(38, 'Render', 'Entertainment', '2026-08-14T18:54:41Z'),
    tx(30, 'TikTok shop', 'Shopping', '2026-08-12T18:44:47Z'),
    tx(150, 'Ally', 'Savings & Investing', '2026-08-12T11:24:24Z'),
    tx(8, 'Lays', 'Food & Dining', '2026-08-12T03:18:30Z'),
    tx(15, 'Walmart', 'Shopping', '2026-08-12T01:28:40Z'),
    tx(36, 'Dollar Tree', 'Shopping', '2026-08-12T01:26:29Z'),
    tx(1000, 'The20 MSP', 'Business & Work', '2026-08-12T01:15:00Z', 'credit', { is_recurring: true, recurring_rule_id: 'rule-20llc' }),
    tx(1500, 'The20', 'Business & Work', '2026-08-12T01:07:24Z', 'credit', { is_recurring: true, recurring_rule_id: 'rule-the20' }),
    tx(500, 'Louis Vuitton', 'Shopping', '2026-08-12T00:41:46Z'),
    tx(300, 'Charles Schwab', 'Savings & Investing', '2026-08-08T14:54:10Z', 'debit', { is_recurring: true, recurring_rule_id: 'rule-schwab' }),
    tx(42, 'Xtream', 'Utilities', '2026-08-08T14:39:14Z', 'debit', { is_recurring: true, recurring_rule_id: 'rule-xtream' }),
    tx(50, 'Starbucks', 'Food & Dining', '2026-08-08T14:33:34Z'),
  ]
  const recurring_rules = [
    { id: 'rule-20llc', name: '20 LLC', amount: 1000, direction: 'credit', frequency: 'biweekly', interval: 1, starts_at: '2026-08-12T01:15:32Z', ends_at: null },
    { id: 'rule-schwab', name: 'Charles Schwab', amount: 300, direction: 'debit', frequency: 'monthly', interval: 1, starts_at: '2026-08-08T14:54:10Z', ends_at: null },
    { id: 'rule-the20', name: 'The20', amount: 1500, direction: 'credit', frequency: 'biweekly', interval: 1, starts_at: '2026-08-12T01:07:24Z', ends_at: null },
    { id: 'rule-xtream', name: 'Xtream', amount: 42, direction: 'debit', frequency: 'monthly', interval: 1, starts_at: '2026-08-08T14:39:14Z', ends_at: null },
  ]
  const base = { locale: 'en', currency: 'USD', now_utc: '2026-08-16T18:51:00Z', time_zone: 'America/Chicago', monthly_income: null, transactions, recurring_rules }
  let convId = null
  const turns = [
    ['Hi how are you doing', (t) => /\b(doing (well|good|great)|thanks for asking|good, thanks|great, thanks)\b/i.test(t) && !/\$\s?\d/.test(t), 'small talk answered as a person, no figures'],
    ['How much did I spend this month ?', (t) => /1[,.]?329/.test(t), 'spent this month = $1,329'],
    ['How much did I earn this month ?', (t) => /2[,.]?500/.test(t), 'earned this month = $2,500'],
    ['How much is my monthly average salary ?', (t) => !/1[,.]?250/.test(t) && (/5[,.]?416/.test(t) && /average|recurring/i.test(t) || (/aug(ust)?\s*8|starts|only (august|one month)|since|not enough|no .*average|first month/i.test(t) && /2[,.]?500/.test(t))), 'no fake "$1,250 over 12 months" — either the recurring-rule average ($5,416.67, said as an average) or "data starts Aug 8, only $2,500 so far"'],
    ['How much I am gonna earn next month ?', (t) => /5[,.]?000/.test(t) && !/^[^$]*5[,.]?416/.test(t.split(/average/i)[0]), 'next month = $5,000 (Sep 8 + Sep 22), not the $5,416.67 average'],
    ['Can you breakdown each of those lines for me ?', (t) => /20 LLC/i.test(t) && /the20 msp|1[,.]?000/i.test(t) && !/no transactions (recorded )?for '?20 LLC/i.test(t), '20 LLC ↔ The20 MSP $1,000 attributed by the stored link'],
  ]
  for (const [message, check, label] of turns) {
    const res = await fetch(`${API}/api/ai/ask-murmur/turn`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...base, conversation_id: convId, message }) })
    const json = await res.json().catch(() => null)
    const reply = json?.message?.reply
    const text = reply?.text ?? ''
    if (!convId) convId = json?.conversation_id ?? null
    console.log(`\n▶ ${message}   [${res.status}]\n  ${text}`)
    for (const b of reply?.blocks ?? []) {
      if (b.type === 'rows') console.log(`  [rows] ${b.caption} · ${b.rows.map((x) => `${x.label}=${x.value}`).join(' | ')}`)
      if (b.type === 'transactions') console.log(`  [transactions] ${b.caption} · ${b.rows.map((x) => `${x.date} ${x.merchant} ${x.amount}`).join(' | ')}`)
      if (b.type === 'figure') console.log(`  [figure] ${b.label}: ${b.value}`)
    }
    if (res.status !== 200 || !text) { fail(`${label}: HTTP ${res.status} ${JSON.stringify(json).slice(0, 120)}`); continue }
    const blocksText = JSON.stringify(reply.blocks ?? [])
    if (check(text + ' ' + blocksText)) pass(label); else fail(label)
    await new Promise((r) => setTimeout(r, PACE_MS))
  }
} catch (e) { failures.push(String(e)); console.error(e) } finally {
  await admin.auth.admin.deleteUser(userId)
  console.log(`\nCHECKS: ${failures.length ? failures.length + ' failed: ' + failures.join(' | ') : 'all passed'}`)
  process.exit(failures.length ? 1 : 0)
}
