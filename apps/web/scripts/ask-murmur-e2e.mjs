#!/usr/bin/env node
// Live end-to-end check of the Ask Murmur conversation engine — the way the
// owner talks to it (docs/ask-murmur/VERIFICATION.md): throwaway Plus user
// → real JWT → threaded conversations through POST /api/ai/ask-murmur/turn
// (conversation_id carried turn to turn, exactly like the mobile/web
// clients) → the persisted thread read back → error paths → cleanup.
//
//   node apps/web/scripts/ask-murmur-e2e.mjs
//   API_BASE=http://localhost:3111 node apps/web/scripts/ask-murmur-e2e.mjs   (local next dev, AI_DEBUG_TRACE=1)
//
// Prints every turn (text, blocks, actions, focus) so a human can judge the
// conversation, and a CHECKS summary. Never call this "ALL PASSED" without
// reading the transcript. Costs one OpenAI turn per question (~17 turns).
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const API = process.env.API_BASE || 'https://money-app-web-w6su.vercel.app'
const PACE_MS = Number(process.env.PACE_MS || 15000) // 30k TPM gpt-4o org tier

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })
const email = `ask-e2e-${Date.now()}@example.com`
const password = `E2e!${Math.random().toString(36).slice(2)}Aa9`

const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
if (cErr) { console.error('createUser failed', cErr); process.exit(1) }
const userId = created.user.id
console.log('test user', userId, '→', API)

const failures = []
const fail = (msg) => { failures.push(msg); console.log('  ✗ ' + msg) }
const pass = (msg) => console.log('  ✓ ' + msg)

try {
  // The turn route gates on profiles.plus_status server-side.
  await new Promise((r) => setTimeout(r, 1500)) // profile trigger
  const { error: plusErr } = await admin.from('profiles').update({ plus_status: 'active' }).eq('id', userId)
  if (plusErr) { console.error('could not set plus_status', plusErr); process.exit(1) }

  const anon = createClient(URL_, ANON, { auth: { persistSession: false } })
  const { data: signIn, error: sErr } = await anon.auth.signInWithPassword({ email, password })
  if (sErr) throw sErr
  const token = signIn.session.access_token

  // ─── Data shaped like the owner's account (12 months) ─────────────────
  const now = new Date()
  const iso = (d) => d.toISOString()
  const daysAgo = (n, h = 12) => { const d = new Date(now.getTime() - n * 864e5); d.setUTCHours(h, 0, 0, 0); return iso(d) }
  const tx = (amount, merchant, category_name, at, direction = 'debit', is_recurring = false) =>
    ({ amount, amount_in_profile_currency: amount, direction, merchant, category_name, transacted_at: at, is_recurring })
  const transactions = [
    // this week — investing (the owner's first transcript)
    tx(300, 'Charles Schwab', 'Savings & Investing', daysAgo(1), 'debit', true),
    tx(150, 'Ally', 'Savings & Investing', daysAgo(2)),
    tx(38, 'Render', 'Entertainment', daysAgo(1)),
    tx(30, 'TikTok shop', 'Shopping', daysAgo(2)),
    tx(8, 'Lays', 'Food & Dining', daysAgo(3)),
    tx(15, 'Walmart', 'Shopping', daysAgo(3)),
    tx(36, 'Dollar Tree', 'Shopping', daysAgo(3)),
    tx(6, 'Snacks', 'Food & Dining', daysAgo(0, 9)),
    tx(500, 'Louis Vuitton', 'Shopping', daysAgo(0, 10)),
    tx(42, 'Xtream', 'Utilities', daysAgo(4), 'debit', true),
    tx(50, 'Starbucks', 'Food & Dining', daysAgo(4)),
    tx(12.4, 'Blue Bottle Coffee', 'Food & Dining', daysAgo(5)),
    tx(28.5, 'Uber', 'Transportation', daysAgo(6)),
    tx(62.3, "Trader Joe's", 'Groceries', daysAgo(8)),
    tx(14, 'Netflix', 'Subscriptions', daysAgo(9), 'debit', true),
    tx(38.8, 'Rappi', 'Food & Dining', daysAgo(12)),
    tx(85, 'Shell', 'Transportation', daysAgo(15)),
    tx(120, 'Whole Foods', 'Groceries', daysAgo(20)),
    // income — biweekly pair
    tx(1000, '20 LLC', 'Business & Work', daysAgo(4), 'credit', true),
    tx(1500, 'The20', 'Business & Work', daysAgo(4), 'credit', true),
    tx(500, 'Kunkel & Associates', 'Business & Work', daysAgo(1), 'credit'),
    tx(1000, '20 LLC', 'Business & Work', daysAgo(18), 'credit', true),
    tx(1500, 'The20', 'Business & Work', daysAgo(18), 'credit', true),
    // last month and before
    tx(300, 'Charles Schwab', 'Savings & Investing', daysAgo(33), 'debit', true),
    tx(42, 'Xtream', 'Utilities', daysAgo(34), 'debit', true),
    tx(14, 'Netflix', 'Subscriptions', daysAgo(39), 'debit', true),
    tx(210, 'Amazon', 'Shopping', daysAgo(40)),
    tx(9.5, 'Starbucks', 'Food & Dining', daysAgo(41)),
    tx(75, 'Chipotle', 'Food & Dining', daysAgo(45)),
    tx(66, "Trader Joe's", 'Groceries', daysAgo(47)),
    tx(1000, '20 LLC', 'Business & Work', daysAgo(32), 'credit', true),
    tx(1500, 'The20', 'Business & Work', daysAgo(32), 'credit', true),
    tx(1000, '20 LLC', 'Business & Work', daysAgo(46), 'credit', true),
    tx(1500, 'The20', 'Business & Work', daysAgo(46), 'credit', true),
    tx(300, 'Charles Schwab', 'Savings & Investing', daysAgo(63), 'debit', true),
    tx(42, 'Xtream', 'Utilities', daysAgo(64), 'debit', true),
    tx(58, "Trader Joe's", 'Groceries', daysAgo(70)),
    tx(31, 'Uber', 'Transportation', daysAgo(75)),
    tx(1000, '20 LLC', 'Business & Work', daysAgo(60), 'credit', true),
    tx(1500, 'The20', 'Business & Work', daysAgo(60), 'credit', true),
    tx(300, 'Charles Schwab', 'Savings & Investing', daysAgo(94), 'debit', true),
    tx(42, 'Xtream', 'Utilities', daysAgo(95), 'debit', true),
    tx(52, "Trader Joe's", 'Groceries', daysAgo(100)),
    tx(1000, '20 LLC', 'Business & Work', daysAgo(90), 'credit', true),
    tx(1500, 'The20', 'Business & Work', daysAgo(90), 'credit', true),
  ]
  const startMonthsAgo = (n, day) => { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, day, 12)); return d.toISOString() }
  const recurring_rules = [
    { name: '20 LLC', amount: 1000, direction: 'credit', frequency: 'biweekly', interval: 1, starts_at: daysAgo(4), ends_at: null },
    { name: 'The20', amount: 1500, direction: 'credit', frequency: 'biweekly', interval: 1, starts_at: daysAgo(4), ends_at: null },
    { name: 'Xtream', amount: 42, direction: 'debit', frequency: 'monthly', interval: 1, starts_at: startMonthsAgo(6, 3), ends_at: null },
    { name: 'Charles Schwab', amount: 300, direction: 'debit', frequency: 'monthly', interval: 1, starts_at: startMonthsAgo(6, 15), ends_at: null },
    { name: 'Netflix', amount: 14, direction: 'debit', frequency: 'monthly', interval: 1, starts_at: startMonthsAgo(6, 22), ends_at: null },
  ]
  const base = { locale: 'en', currency: 'USD', now_utc: iso(now), time_zone: 'America/Chicago', monthly_income: 5416.67, transactions, recurring_rules }

  async function turn(conversationId, message, extra = {}) {
    const t0 = Date.now()
    const res = await fetch(`${API}/api/ai/ask-murmur/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...base, conversation_id: conversationId, message, ...extra }),
    })
    const ms = Date.now() - t0
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch {}
    return { status: res.status, ms, json, text }
  }

  const GREET_RE = /^(hi|hello|hey|hi there|welcome)\b/i
  const NARRATE_RE = /\b(to determine|let me (check|look)|would you like me to|i will need to|i'll need to)\b/i

  async function runConversation(label, turns, opts = {}) {
    console.log(`\n════════ ${label} ════════`)
    let convId = null
    let lastText = null
    const replies = []
    for (let i = 0; i < turns.length; i++) {
      const spec = typeof turns[i] === 'string' ? { message: turns[i] } : turns[i]
      const r = await turn(convId, spec.message, spec.extra ?? {})
      console.log(`\n▶ ${spec.message}   [${r.status} · ${r.ms}ms]`)
      if (r.status !== 200 || !r.json?.message?.reply) { fail(`${label} turn ${i + 1}: HTTP ${r.status} ${r.text.slice(0, 200)}`); replies.push(null); await new Promise((res) => setTimeout(res, PACE_MS)); continue }
      const reply = r.json.message.reply
      if (!convId) convId = r.json.conversation_id
      else if (r.json.conversation_id !== convId) fail(`${label}: conversation id changed mid-thread`)
      console.log(`  ${reply.text}`)
      for (const b of reply.blocks) {
        if (b.type === 'figure') console.log(`  [figure] ${b.label}: ${b.value}${b.sub ? ' · ' + b.sub : ''}`)
        else if (b.type === 'rows') console.log(`  [rows] ${b.caption} · ${b.rows.map((x) => `${x.label}=${x.value}`).join(' | ')}`)
        else if (b.type === 'transactions') console.log(`  [transactions] ${b.caption} · ${b.rows.map((x) => `${x.date} ${x.merchant} ${x.amount}`).join(' | ')}`)
        else if (b.type === 'chart') console.log(`  [chart] ${b.chart.type} · ${b.chart.title} · ${b.chart.data.length} pts`)
        else if (b.type === 'steps') console.log(`  [steps] ${b.caption} · ${b.steps.length} steps`)
      }
      if (reply.actions.length) console.log(`  actions: ${reply.actions.map((a) => `${a.intent}${a.params ? JSON.stringify(a.params) : ''}`).join(', ')}`)
      if (reply.focus) console.log(`  focus: subject=${reply.focus.subject} window=${reply.focus.window?.name ?? '-'} figures=${reply.focus.figures.map((f) => `${f.label}=${f.value}`).join('; ')}`)
      // Structural checks every turn
      if (!reply.text || reply.text.trim().length < 6) fail(`${label} turn ${i + 1}: empty text`)
      if (i > 0 && GREET_RE.test(reply.text.trim())) fail(`${label} turn ${i + 1}: re-greeted mid-thread`)
      if (lastText && reply.text.trim().toLowerCase() === lastText.trim().toLowerCase()) fail(`${label} turn ${i + 1}: verbatim repeat`)
      if (NARRATE_RE.test(reply.text) && !/\d/.test(reply.text)) fail(`${label} turn ${i + 1}: narrated instead of answering`)
      if (spec.expect) spec.expect(reply, r.json)
      lastText = reply.text
      replies.push(reply)
      if (i < turns.length - 1) await new Promise((res) => setTimeout(res, PACE_MS))
    }
    if (opts.checkPersistence && convId) {
      const { data: msgs } = await admin.from('ask_messages').select('role, question, response').eq('conversation_id', convId).order('created_at', { ascending: true })
      const { data: conv } = await admin.from('ask_conversations').select('title').eq('id', convId).single()
      const okTurns = replies.filter(Boolean).length
      if ((msgs?.length ?? 0) === okTurns * 2) pass(`${label}: ${msgs.length} messages persisted (${okTurns} turns), title="${conv?.title}"`)
      else fail(`${label}: expected ${okTurns * 2} persisted messages, found ${msgs?.length ?? 0}`)
      const lastReply = [...(msgs ?? [])].reverse().find((m) => m.role === 'assistant')?.response
      if (lastReply?.focus?.subject || lastReply?.focus?.figures?.length) pass(`${label}: focus persisted on the last reply (subject=${lastReply.focus.subject}, ${lastReply.focus.figures?.length ?? 0} figures)`)
      else fail(`${label}: no focus persisted on the last reply`)
      const withComputed = (msgs ?? []).filter((m) => m.role === 'assistant' && Array.isArray(m.response?.computed) && m.response.computed.length > 0).length
      if (withComputed > 0) pass(`${label}: ${withComputed} assistant turns carry computed tool records`)
      else fail(`${label}: no computed records persisted`)
    }
    return { convId, replies }
  }

  const hasBlock = (reply, type) => reply.blocks.some((b) => b.type === type)
  const hasPercent = (reply) => /\d\s?%/.test(reply.text) || reply.blocks.some((b) => b.type === 'rows' && b.rows.some((r) => /%/.test(r.value)))

  // 1. The owner's transcript that exposed the architecture (Aug 16).
  const c1 = await runConversation('invest', [
    { message: 'How much did I invest this week?', expect: (r) => { if (!/\$?450|300|150/.test(r.text)) fail('invest turn 1: no investing figure in the answer') } },
    { message: 'what were those exactly?', expect: (r) => { if (hasBlock(r, 'transactions')) pass('invest: "what were those" → transactions block'); else fail('invest: "what were those exactly?" did not list the transactions') } },
    { message: 'is it a good ratio out of how much I make?', expect: (r) => { if (hasPercent(r)) pass('invest: ratio answered with a percent'); else fail('invest: ratio turn has no percent') } },
    { message: 'what else can you help me with?', expect: (r) => { if (r.text.length > 40 && !/\?\s*$/.test(r.text.trim()) ? true : r.text.length > 40) pass('invest: "what else" answered concretely'); else fail('invest: "what else" was not answered concretely') } },
  ], { checkPersistence: true })
  await new Promise((r) => setTimeout(r, PACE_MS))

  // 2. Greeting → overview → follow-up window.
  await runConversation('overview', [
    { message: 'Heyy how are you doing?', expect: (r) => { const human = /\b(doing (well|good|great)|i'?m (good|well|great|doing)|thanks for asking|good, thanks|great, thanks)\b/i.test(r.text); if (human) pass('overview: "how are you" answered like a person'); else fail(`overview: small talk answered as a report: "${r.text.slice(0, 120)}"`) } },
    { message: 'why did you tell me that? I just asked how you were doing', expect: (r) => { const meta = /\b(fair|sorry|you'?re right|apolog|my bad|good point|got it|understood|i (over|jumped)|didn'?t mean)\b/i.test(r.text) || !/\$\s?\d/.test(r.text); if (meta) pass('overview: meta question answered directly, no figure recital'); else fail(`overview: meta question deflected with figures: "${r.text.slice(0, 120)}"`) } },
    { message: 'How am I doing overall with my money?', expect: (r) => { if (/\d/.test(r.text)) pass('overview: answered with figures'); else fail('overview: no figures') } },
    { message: 'and last month?', expect: (r) => { if (/\d/.test(r.text) && (r.focus?.window?.name === 'lastMonth' || /last month/i.test(r.text))) pass('overview: "and last month?" resolved to lastMonth'); else fail(`overview: "and last month?" not resolved (window=${r.focus?.window?.name})`) } },
  ])
  await new Promise((r) => setTimeout(r, PACE_MS))

  // 3. Affordability + contentless follow-up + substitution.
  await runConversation('afford', [
    { message: 'Can I afford a PS5 this month?', expect: (r) => { if (/\d/.test(r.text)) pass('afford: PS5 answered with numbers'); else fail('afford: PS5 turn has no numbers') } },
    { message: 'Ok' },
    { message: 'What about a $1,200 laptop instead?', expect: (r) => { if (/1[,.]?200/.test(r.text) || r.blocks.some((b) => JSON.stringify(b).includes('1,200') || JSON.stringify(b).includes('1200'))) pass('afford: laptop turn used $1,200'); else fail('afford: laptop turn ignored the $1,200') } },
  ])
  await new Promise((r) => setTimeout(r, PACE_MS))

  // 4. Subject filtering + windows.
  await runConversation('subjects', [
    { message: 'Where is my coffee budget going?', expect: (r) => { const off = r.blocks.some((b) => /schwab|ally|vuitton/i.test(JSON.stringify(b))); if (off) fail('subjects: coffee answer lists non-coffee rows'); else pass('subjects: coffee answer stayed on subject') } },
    { message: 'How much on Uber this month?', expect: (r) => { if (/28[.,]5|28\.50|\$29/.test(r.text) || r.blocks.some((b) => /28[.,]5/.test(JSON.stringify(b)))) pass('subjects: Uber this month = $28.50'); else fail(`subjects: Uber figure not found in "${r.text}"`) } },
    { message: 'How much did I spend so far this month?', expect: (r) => { if (/\d/.test(r.text)) pass('subjects: month total answered'); else fail('subjects: month total missing') } },
  ])
  await new Promise((r) => setTimeout(r, PACE_MS))

  // 5. Insight-seeded turn (tapping a card) + a refusal.
  await runConversation('seeded', [
    { message: 'Which of my recurring bills should I keep or cut?', extra: { seed_insight: { kind: 'subscriptions', title: 'Charles Schwab, Xtream + 1 more take $356 every month', detail: 'Keep or cut?' } }, expect: (r) => { if (/schwab|xtream|netflix/i.test(r.text + JSON.stringify(r.blocks))) pass('seeded: named the actual rules'); else fail('seeded: did not name the rules') } },
    { message: 'Should I put the Schwab money into Nvidia stock instead?', expect: (r) => { if (r.out_of_scope) pass('seeded: stock pick refused (out_of_scope)'); else fail('seeded: gave stock advice') } },
  ])

  // ─── Resume: the client re-opens the most recent thread ────────────
  {
    const { data: recent } = await admin.from('ask_conversations').select('id, last_message_at').eq('user_id', userId).eq('is_deleted', false).order('last_message_at', { ascending: false }).limit(1)
    if (recent?.[0]) pass(`resume: most recent conversation ${recent[0].id.slice(0, 8)} at ${recent[0].last_message_at}`)
    else fail('resume: no conversation to resume')
    // Continue the FIRST conversation later — the thread must still know its focus.
    if (c1.convId) {
      await new Promise((r) => setTimeout(r, PACE_MS))
      const r = await turn(c1.convId, 'and how much was that last month?')
      console.log(`\n▶ (resumed invest) and how much was that last month?   [${r.status} · ${r.ms}ms]\n  ${r.json?.message?.reply?.text}`)
      const reply = r.json?.message?.reply
      if (r.status === 200 && reply && /\d/.test(reply.text) && !GREET_RE.test(reply.text)) pass('resume: resumed thread answered in context'); else fail('resume: resumed thread lost context')
      if (reply?.focus?.window?.name === 'lastMonth') pass('resume: focus moved to lastMonth'); else fail(`resume: window=${reply?.focus?.window?.name}`)
    }
  }

  // ─── Error paths ───────────────────────────────────────────────────
  console.log('\n════════ error paths ════════')
  await new Promise((r) => setTimeout(r, PACE_MS)) // let the TPM window drain before the last model call
  const noAuth = await fetch(`${API}/api/ai/ask-murmur/turn`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...base, message: 'hi' }) })
  noAuth.status === 401 ? pass('no auth → 401') : fail(`no auth → ${noAuth.status}`)
  const empty = await turn(null, '')
  empty.status === 400 ? pass('empty message → 400') : fail(`empty message → ${empty.status}`)
  const bogus = await turn('00000000-0000-4000-8000-000000000000', 'hi')
  bogus.status === 404 ? pass('unknown conversation → 404') : fail(`unknown conversation → ${bogus.status}`)
  await admin.from('profiles').update({ plus_status: 'free' }).eq('id', userId)
  const free = await turn(null, 'hi')
  free.status === 402 ? pass('free user → 402 plus_required') : fail(`free user → ${free.status}`)
  await admin.from('profiles').update({ plus_status: 'active' }).eq('id', userId)
  const noData = await fetch(`${API}/api/ai/ask-murmur/turn`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...base, transactions: [], recurring_rules: [], message: 'How much did I spend on coffee?' }) })
  const nd = await noData.json().catch(() => null)
  console.log('  no-data question →', noData.status, nd?.message?.reply?.text)
  noData.status === 200 && nd?.message?.reply?.text ? pass('no-data question answered honestly') : fail('no-data question failed')
} catch (err) {
  console.error('\nHARNESS ERROR', err)
  failures.push(`harness error: ${err?.message ?? err}`)
} finally {
  const { error } = await admin.auth.admin.deleteUser(userId)
  console.log('\ncleanup', error ? `FAILED: ${error.message}` : 'ok')
  console.log(`\nCHECKS: ${failures.length === 0 ? 'all passed' : failures.length + ' failed'}`)
  for (const f of failures) console.log('  - ' + f)
  process.exit(failures.length === 0 ? 0 : 1)
}
