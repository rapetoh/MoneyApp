#!/usr/bin/env node
// Focused live check for the small-talk / meta-question behaviour of Ask
// Murmur (owner screenshots Aug 16: "hello how are you doing" answered with
// spending figures four times). Same setup as ask-murmur-e2e.mjs, one
// conversation. Prints the transcript; exit code = failures.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const API = process.env.API_BASE || 'https://money-app-web-w6su.vercel.app'
const PACE_MS = Number(process.env.PACE_MS || 15000)
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })
const email = `ask-st-${Date.now()}@example.com`, password = `E2e!${Math.random().toString(36).slice(2)}Aa9`
const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
const userId = created.user.id
const failures = []
try {
  await new Promise((r) => setTimeout(r, 1500))
  await admin.from('profiles').update({ plus_status: 'active' }).eq('id', userId)
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } })
  const { data: signIn } = await anon.auth.signInWithPassword({ email, password })
  const token = signIn.session.access_token
  const now = new Date()
  const daysAgo = (n) => new Date(now.getTime() - n * 864e5).toISOString()
  const tx = (amount, merchant, category_name, at, direction = 'debit') => ({ amount, amount_in_profile_currency: amount, direction, merchant, category_name, transacted_at: at, is_recurring: false })
  const transactions = [tx(160, 'Best Buy', 'Shopping', daysAgo(1)), tx(38, 'Render', 'Entertainment', daysAgo(2)), tx(30, 'TikTok shop', 'Shopping', daysAgo(4)), tx(150, 'Ally', 'Savings & Investing', daysAgo(4)), tx(500, 'Louis Vuitton', 'Shopping', daysAgo(5)), tx(2500, 'The20', 'Business & Work', daysAgo(5), 'credit'), tx(300, 'Charles Schwab', 'Savings & Investing', daysAgo(8)), tx(42, 'Xtream', 'Utilities', daysAgo(8)), tx(50, 'Starbucks', 'Food & Dining', daysAgo(8))]
  const base = { locale: 'en', currency: 'USD', now_utc: now.toISOString(), time_zone: 'America/Chicago', monthly_income: null, transactions, recurring_rules: [] }
  let convId = null
  const turns = [
    ['hello how are you doing', (t) => /\b(doing (well|good|great)|i'?m (good|well|great|doing)|thanks for asking|good, thanks|great, thanks)\b/i.test(t) && !/\$\s?[\d,]+\.?\d*\s+(so far|this month|spent)/i.test(t), 'answers like a person, no spending report'],
    ["yeah I just wanted to know how you're doing first before we start talking", (t) => !/\$\s?\d/.test(t) || /\b(doing|well|good|great|thanks)\b/i.test(t), 'stays human, no income recital'],
    ['why are you telling me about my income? I only asked how you were', (t) => /\b(fair|sorry|you'?re right|apolog|my bad|got it|understood|jumped|didn'?t mean|i see)\b/i.test(t) || !/\$\s?\d/.test(t), 'meta question answered directly'],
    ['ok now: how much did I spend this month?', (t) => /1[,.]?270|1[,.]?329|\$\s?1[,.]?\d{3}/.test(t), 'money question gets the figure'],
  ]
  for (const [message, check, label] of turns) {
    const res = await fetch(`${API}/api/ai/ask-murmur/turn`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...base, conversation_id: convId, message }) })
    const json = await res.json().catch(() => null)
    const text = json?.message?.reply?.text ?? ''
    if (!convId) convId = json?.conversation_id ?? null
    console.log(`\n▶ ${message}   [${res.status}]\n  ${text}`)
    if (res.status !== 200 || !text) { failures.push(`${label}: HTTP ${res.status}`); console.log('  ✗ ' + label); continue }
    if (check(text)) console.log('  ✓ ' + label); else { failures.push(label); console.log('  ✗ ' + label) }
    await new Promise((r) => setTimeout(r, PACE_MS))
  }
} catch (e) { failures.push(String(e)); console.error(e) } finally {
  await admin.auth.admin.deleteUser(userId)
  console.log(`\nCHECKS: ${failures.length ? failures.length + ' failed: ' + failures.join(' | ') : 'all passed'}`)
  process.exit(failures.length ? 1 : 0)
}
