import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import {
  TOOLS,
  buildDataOverview,
  resolveToolCall,
  buildAskSystemPrompt,
  buildContextMessages,
  validateAskReply,
  trustedFigures,
  groundAskReply,
  mergeFocus,
  compactComputed,
  MAX_CONTEXT_TURNS,
  type AskPriorTurn,
  type ToolCallRecord,
  type ToolContext,
} from '@voice-expense/ai/server'
import {
  appendAssistantMessage,
  appendUserMessage,
  createConversation,
  isPlusFromProfile,
  replyFromStored,
  type AskConversationRow,
  type AskMessageRow,
} from '@voice-expense/shared'
import type {
  AskFocus,
  AskInsightKind,
  AskMurmurBudget,
  AskMurmurRecurringRuleV2,
  AskMurmurTransaction,
  AskReply,
  AskTurnRequest,
  AskTurnResponse,
  Database,
  Locale,
} from '@voice-expense/shared'
import { validateToken } from '../../../../../lib/auth'
import { getOpenAIEnv, getSupabaseEnv } from '../../../../../lib/env'
import { checkRateLimit } from '../../../../../lib/rateLimit'
import { resolveNowUtc, resolveTimeZone } from '../timeZone'

/**
 * POST /api/ai/ask-murmur/turn — one turn of an Ask Murmur conversation
 * (docs/ask-murmur/SPEC.md §5.3, ARCHITECTURE.md).
 *
 * The server owns the conversation: it loads the thread (prior turns; the
 * focus is the last assistant reply's `focus`), builds the model context
 * from real prior messages and the figures they computed, runs the
 * closed-toolset loop, grounds every figure, then persists the user turn
 * and the assistant turn (reply + focus + compact tool records) — all with
 * the caller's own JWT, so RLS keeps every thread private to its owner.
 * Clients read threads directly from Supabase.
 */

const openai = new OpenAI({ apiKey: getOpenAIEnv().OPENAI_API_KEY })
const MODEL = process.env.AI_ASK_MODEL?.trim() || 'gpt-4o'
const DEBUG_TRACE = process.env.AI_DEBUG_TRACE === '1'

const MAX_TRANSACTIONS = 2000
const MAX_RECURRING = 60
const MAX_MESSAGE_LEN = 1000
const MAX_TOOL_ITERATIONS = 10
const RATE_LIMIT_PER_HOUR = 120
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | {
      role: 'assistant'
      content: string | null
      tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
    }
  | { role: 'tool'; tool_call_id: string; content: string }

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  const userId = await validateToken(authHeader)
  if (!userId || !authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const jwt = authHeader.slice(7)

  const rate = checkRateLimit(`ask:${userId}`, RATE_LIMIT_PER_HOUR, RATE_LIMIT_WINDOW_MS)
  if (!rate.allowed) {
    return Response.json(
      { error: 'busy', retry_after_seconds: rate.retryAfterSeconds },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    )
  }

  let body: Partial<AskTurnRequest>
  try {
    body = (await req.json()) as Partial<AskTurnRequest>
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const message = (body.message ?? '').toString().trim()
  if (!message) return Response.json({ error: 'message is required' }, { status: 400 })
  if (message.length > MAX_MESSAGE_LEN) return Response.json({ error: 'message is too long' }, { status: 400 })
  const conversationId =
    typeof body.conversation_id === 'string' && UUID_RE.test(body.conversation_id) ? body.conversation_id : null

  // The caller's own session — RLS scopes every read/write below to them.
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getSupabaseEnv()
  const supabase = createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Plus gate — server-side, one source of truth (profiles.plus_status).
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('plus_status')
    .eq('id', userId)
    .maybeSingle()
  if (profileErr) {
    console.error(`[ask-turn] profile read failed: ${profileErr.message}`)
    return Response.json({ error: 'profile unavailable' }, { status: 503 })
  }
  if (!isPlusFromProfile(profile as { plus_status?: 'active' | 'lapsed' | 'free' | null } | null)) {
    return Response.json({ error: 'plus_required' }, { status: 402 })
  }

  // Data payload (same trust boundary as before: normalized, capped).
  const transactions: AskMurmurTransaction[] = (Array.isArray(body.transactions) ? body.transactions : [])
    .slice(-MAX_TRANSACTIONS)
    .map((t) => ({
      amount: typeof t.amount === 'number' ? t.amount : 0,
      amount_in_profile_currency:
        typeof t.amount_in_profile_currency === 'number' && Number.isFinite(t.amount_in_profile_currency)
          ? t.amount_in_profile_currency
          : null,
      direction: (t.direction === 'credit' ? 'credit' : 'debit') as 'debit' | 'credit',
      merchant: typeof t.merchant === 'string' ? t.merchant : null,
      category_name: typeof t.category_name === 'string' ? t.category_name : null,
      transacted_at: typeof t.transacted_at === 'string' ? t.transacted_at : '',
      is_recurring: !!t.is_recurring,
    }))
    .filter((t) => t.transacted_at)
  const recurring_rules: AskMurmurRecurringRuleV2[] = (Array.isArray(body.recurring_rules) ? body.recurring_rules : [])
    .slice(0, MAX_RECURRING)
    .filter((r) => r && typeof r === 'object' && typeof r.amount === 'number')
    .map((r) => ({
      name: typeof r.name === 'string' ? r.name : null,
      amount: r.amount,
      direction: (r.direction === 'credit' ? 'credit' : 'debit') as 'debit' | 'credit',
      frequency: typeof r.frequency === 'string' ? r.frequency : 'monthly',
      ...(typeof r.id === 'string' ? { id: r.id } : {}),
      ...(typeof r.category_name === 'string' ? { category_name: r.category_name } : {}),
      ...(typeof r.interval === 'number' ? { interval: r.interval } : {}),
      ...(typeof r.starts_at === 'string' ? { starts_at: r.starts_at } : {}),
      ...(r.ends_at === null || typeof r.ends_at === 'string' ? { ends_at: r.ends_at ?? null } : {}),
      ...(typeof r.anchor_day === 'number' ? { anchor_day: r.anchor_day } : {}),
      ...(typeof r.anchor_weekday === 'number' ? { anchor_weekday: r.anchor_weekday } : {}),
      ...(typeof r.anchor_time === 'string' ? { anchor_time: r.anchor_time } : {}),
    }))
  const budget = parseBudget(body.budget)
  const seedInsight = parseSeedInsight(body.seed_insight)
  const locale = (['en', 'fr', 'es', 'pt'].includes(String(body.locale)) ? body.locale : 'en') as Locale
  const currency = (typeof body.currency === 'string' && body.currency ? body.currency : 'USD').slice(0, 3).toUpperCase()
  const now_utc = resolveNowUtc(body.now_utc)
  const time_zone = resolveTimeZone(body.time_zone)
  const monthly_income = typeof body.monthly_income === 'number' && Number.isFinite(body.monthly_income) ? body.monthly_income : null

  // Load the thread (RLS: only the owner's).
  let conversation: AskConversationRow | null = null
  let priorTurns: AskPriorTurn[] = []
  if (conversationId) {
    const { data: conv, error: convErr } = await supabase
      .from('ask_conversations')
      .select('*')
      .eq('id', conversationId)
      .eq('is_deleted', false)
      .maybeSingle()
    if (convErr) {
      console.error(`[ask-turn] conversation read failed: ${convErr.message}`)
      return Response.json({ error: 'conversation unavailable' }, { status: 503 })
    }
    if (!conv) return Response.json({ error: 'conversation not found' }, { status: 404 })
    conversation = conv as unknown as AskConversationRow
    const { data: msgs, error: msgErr } = await supabase
      .from('ask_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(MAX_CONTEXT_TURNS * 2 + 2)
    if (msgErr) {
      console.error(`[ask-turn] messages read failed: ${msgErr.message}`)
      return Response.json({ error: 'conversation unavailable' }, { status: 503 })
    }
    priorTurns = pairTurns(((msgs ?? []) as unknown as AskMessageRow[]).slice().reverse())
  }
  // The thread's focus = the last answered turn's focus.
  const prevFocus: AskFocus | null = [...priorTurns].reverse().find((tn) => tn.reply?.focus)?.reply?.focus ?? null

  const ctx: ToolContext = { now_utc, tz: time_zone, currency, monthly_income, locale, transactions, recurring_rules }
  const overview = buildDataOverview(ctx)
  const startedAt = Date.now()
  console.log(
    `[ask-turn] conv=${conversationId ? 'resume' : 'new'} prior_turns=${priorTurns.length} message_len=${message.length} transactions=${transactions.length} rules=${recurring_rules.length}`,
  )
  if (DEBUG_TRACE) console.log('[ask-turn] trace message=', JSON.stringify(message), 'focus=', JSON.stringify(prevFocus), 'overview=', JSON.stringify(overview))

  const systemPrompt = buildAskSystemPrompt({
    locale,
    currency,
    now_utc,
    time_zone,
    monthly_income,
    transaction_count: transactions.length,
    recurring_rule_count: recurring_rules.length,
    overview,
    budget,
    focus: prevFocus,
    seed_insight: seedInsight,
    has_prior_turns: priorTurns.length > 0,
  })
  const contextMessages = buildContextMessages(priorTurns)

  let outcome: { reply: AskReply; calls: ToolCallRecord[] }
  try {
    outcome = await answer(systemPrompt, contextMessages, message, ctx, {
      priorTurns,
      focus: prevFocus,
      overview,
      budget,
      monthlyIncome: monthly_income,
      seedInsight,
    })
  } catch (err) {
    const e = err as { status?: number; message?: string; headers?: Record<string, string> }
    if (e?.status !== 429) {
      console.error(`[ask-turn] model call threw (status=${e?.status ?? 'n/a'}): ${e?.message ?? String(err)}`)
      return Response.json({ error: 'AI request failed' }, { status: 502 })
    }
    // Capacity, not a bad answer: the OpenAI org tier is 30k tokens/min for
    // gpt-4o (owner to raise before launch). Wait out the window in bounded
    // steps and try again; only then say "busy" with a Retry-After.
    let recovered: typeof outcome | null = null
    const waits = [retryAfterMs(e), 5000, 8000]
    for (const waitMs of waits) {
      console.warn(`[ask-turn] rate limited (429); waiting ${waitMs}ms and retrying`)
      await new Promise((r) => setTimeout(r, waitMs))
      try {
        recovered = await answer(systemPrompt, contextMessages, message, ctx, {
          priorTurns,
          focus: prevFocus,
          overview,
          budget,
          monthlyIncome: monthly_income,
          seedInsight,
        })
        break
      } catch (err2) {
        const e2 = err2 as { status?: number; message?: string }
        if (e2?.status !== 429) {
          console.error(`[ask-turn] model call threw after 429 wait (status=${e2?.status ?? 'n/a'}): ${e2?.message ?? String(err2)}`)
          return Response.json({ error: 'AI request failed' }, { status: 502 })
        }
      }
    }
    if (!recovered) {
      console.error('[ask-turn] still rate limited after bounded waits')
      return Response.json({ error: 'busy', retry_after_seconds: 10 }, { status: 503, headers: { 'Retry-After': '10' } })
    }
    outcome = recovered
  }

  const { reply, calls } = outcome
  const focus = mergeFocus(prevFocus, reply.focus, calls)
  const finalReply: AskReply = { ...reply, focus }
  const computed = compactComputed(calls)
  // What is stored carries the tool records; what is returned does not.
  const storedReply: AskReply = computed.length > 0 ? { ...finalReply, computed } : finalReply

  // Persist — user turn, then assistant turn (reply + focus + computed).
  // Failures are logged; the answer still ships (the client keeps it on
  // screen) but a thread that couldn't be created returns no
  // conversation_id, and the client will start a new one next time.
  let convId = conversation?.id ?? null
  let userMessageId: string | null = null
  let assistantMessageId: string | null = null
  let createdAt = new Date().toISOString()
  try {
    if (!convId) {
      const created = await createConversation(supabase, userId, message)
      convId = created?.id ?? null
    }
    if (convId) {
      const u = await appendUserMessage(supabase, convId, userId, message)
      userMessageId = u?.id ?? null
      const a = await appendAssistantMessage(supabase, convId, userId, storedReply)
      assistantMessageId = a?.id ?? null
      createdAt = a?.created_at ?? createdAt
    }
  } catch (err) {
    console.error(`[ask-turn] persist failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  console.log(`[ask-turn] ok tool_calls=${calls.length} blocks=${finalReply.blocks.length} persisted=${convId ? 'yes' : 'no'} ms=${Date.now() - startedAt}`)
  const res: AskTurnResponse = {
    conversation_id: convId ?? '',
    user_message_id: userMessageId,
    message: { id: assistantMessageId, reply: finalReply, created_at: createdAt },
  }
  return Response.json(res)
}

// ─── Model loop ─────────────────────────────────────────────────────────────

interface GroundingInputs {
  priorTurns: AskPriorTurn[]
  focus: AskFocus | null
  overview: ReturnType<typeof buildDataOverview>
  budget: AskMurmurBudget | null
  monthlyIncome: number | null
  seedInsight: { kind: AskInsightKind; title: string; detail: string } | null
}

/** One attempt + at most one grounded retry. Throws on transport errors
 *  (the caller maps 429 → busy). */
async function answer(
  systemPrompt: string,
  contextMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
  message: string,
  ctx: ToolContext,
  g: GroundingInputs,
): Promise<{ reply: AskReply; calls: ToolCallRecord[] }> {
  const first = await runLoop(systemPrompt, contextMessages, message, ctx)
  const issues = issuesFor(first, ctx, message, g)
  if (issues.length === 0) return first

  console.warn(`[ask-turn] retrying once: ${issues.map((i) => i.split(':')[0]).join(', ')}`)
  if (DEBUG_TRACE) console.warn('[ask-turn] trace retry reasons:', issues.join(' | '))
  const retryPrompt =
    systemPrompt +
    `\n\nIMPORTANT — your previous attempt was rejected. Fix each point and answer again:\n- ${issues.join('\n- ')}\nEvery figure must come from a tool result of this turn (call the tools now — arith for any ratio/difference), a COMPUTED figure from an earlier turn, the overview, the budget block, or the user's own words.`
  const second = await runLoop(retryPrompt, contextMessages, message, ctx)
  const secondIssues = issuesFor(second, ctx, message, g)
  if (secondIssues.length === 0) return second
  // Both attempts flawed: ship the one with fewer issues rather than an
  // error, and say so in the log — but never an empty answer.
  console.warn(`[ask-turn] retry still flawed (${secondIssues.length} vs ${issues.length}); shipping the better one`)
  if (second.reply.text && (!first.reply.text || secondIssues.length <= issues.length)) return second
  return first
}

function issuesFor(
  r: { reply: AskReply; calls: ToolCallRecord[] },
  ctx: ToolContext,
  message: string,
  g: GroundingInputs,
): string[] {
  const issues: string[] = []
  if (!r.reply.out_of_scope && r.reply.text.trim().length < 6) {
    issues.push('empty answer: the "text" field was empty — write the answer, leading with the conclusion and its figure')
  }
  const trusted = trustedFigures({
    calls: r.calls,
    priorTurns: g.priorTurns,
    focus: g.focus,
    overview: g.overview,
    budget: g.budget,
    monthlyIncome: g.monthlyIncome,
    message,
    seedInsight: g.seedInsight,
  })
  const grounding = groundAskReply(r.reply, trusted, r.calls)
  if (grounding.untraced.length > 0) {
    issues.push(`ungrounded figures (${grounding.untraced.slice(0, 4).join('; ')}) — these numbers match no tool result; compute them with the tools (arith for ratios/differences) or drop them`)
  }
  if (grounding.direction_violation) issues.push(`comparison direction: ${grounding.direction_violation}`)
  return issues
}

async function runLoop(
  systemPrompt: string,
  contextMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
  message: string,
  ctx: ToolContext,
): Promise<{ reply: AskReply; calls: ToolCallRecord[] }> {
  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }, ...contextMessages, { role: 'user', content: message }]
  const calls: ToolCallRecord[] = []

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 1400,
      tools: TOOLS,
      // Every answer computes something: the first round must call a tool
      // (Aug 16 trace: "How much did I invest this week?" was answered
      // "no investments" with zero tool calls — an invented empty result the
      // numeric validator cannot see). Later rounds are free.
      tool_choice: iter === 0 ? 'required' : 'auto',
      messages: messages as Parameters<typeof openai.chat.completions.create>[0]['messages'],
    })
    const msg = completion.choices[0].message
    const fnCalls = (msg.tool_calls ?? []).filter(
      (tc): tc is Extract<NonNullable<typeof msg.tool_calls>[number], { type: 'function' }> => tc.type === 'function',
    )
    if (fnCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: msg.content ?? '',
        tool_calls: fnCalls.map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.function.name, arguments: tc.function.arguments } })),
      })
      for (const tc of fnCalls) {
        let args: unknown
        try {
          args = JSON.parse(tc.function.arguments || '{}')
        } catch {
          args = {}
        }
        const resolved = resolveToolCall(tc.function.name, args, ctx)
        calls.push(
          resolved.ok
            ? { name: tc.function.name, args, ok: true, result: resolved.result }
            : { name: tc.function.name, args, ok: false, result: null, error: resolved.error },
        )
        console.log(`[ask-turn] tool ${tc.function.name} ok=${resolved.ok}`)
        if (DEBUG_TRACE) {
          console.log(`[ask-turn] trace args=${JSON.stringify(args).slice(0, 240)} result=${JSON.stringify(resolved.ok ? resolved.result : { error: resolved.error }).slice(0, 300)}`)
        }
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(resolved.ok ? resolved.result : { error: resolved.error }) })
      }
      continue
    }
    let parsed: unknown = {}
    try {
      parsed = JSON.parse(msg.content ?? '{}')
    } catch {
      parsed = {}
    }
    if (DEBUG_TRACE) console.log('[ask-turn] trace reply=', (msg.content ?? '').slice(0, 600))
    return { reply: validateAskReply(parsed, ctx.transactions.length), calls }
  }
  return {
    reply: { text: '', sentiment: 'neutral', blocks: [], actions: [], focus: null, out_of_scope: false, transaction_count: ctx.transactions.length },
    calls,
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Stored rows → (question, reply, computed) turns, oldest first. */
function pairTurns(rows: AskMessageRow[]): AskPriorTurn[] {
  const turns: AskPriorTurn[] = []
  let pendingQuestion: string | null = null
  for (const m of rows) {
    if (m.role === 'user' && m.question) {
      if (pendingQuestion) turns.push({ question: pendingQuestion, reply: null, computed: null })
      pendingQuestion = m.question
    } else if (m.role === 'assistant' && pendingQuestion) {
      const reply = replyFromStored(m.response)
      turns.push({ question: pendingQuestion, reply, computed: reply?.computed ?? null })
      pendingQuestion = null
    }
  }
  if (pendingQuestion) turns.push({ question: pendingQuestion, reply: null, computed: null })
  return turns.slice(-MAX_CONTEXT_TURNS)
}

function retryAfterMs(e: { message?: string; headers?: Record<string, string> }): number {
  const header = Number(e.headers?.['retry-after'])
  if (Number.isFinite(header) && header > 0) return Math.min(Math.max(header * 1000, 1500), 6000)
  const m = /try again in (\d+(?:\.\d+)?)\s*(ms|s)\b/i.exec(e.message ?? '')
  if (m) {
    const ms = m[2].toLowerCase() === 's' ? Number(m[1]) * 1000 : Number(m[1])
    return Math.min(Math.max(ms + 400, 1500), 6000)
  }
  return 2500
}

function parseBudget(raw: unknown): AskMurmurBudget | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const amount = num(b.amount), spent = num(b.spent), committed = num(b.committed), remaining = num(b.remaining), days_left = num(b.days_left)
  const PERIODS = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'] as const
  if (amount === null || spent === null || committed === null || remaining === null || days_left === null) return null
  if (typeof b.period !== 'string' || !(PERIODS as readonly string[]).includes(b.period)) return null
  if (typeof b.period_start !== 'string' || typeof b.period_end !== 'string') return null
  return {
    amount, spent, committed, remaining,
    days_left: Math.max(0, Math.trunc(days_left)),
    period: b.period as AskMurmurBudget['period'],
    currency: typeof b.currency === 'string' && b.currency ? b.currency.slice(0, 3).toUpperCase() : 'USD',
    category_name: typeof b.category_name === 'string' && b.category_name ? b.category_name.slice(0, 80) : null,
    period_start: b.period_start.slice(0, 40),
    period_end: b.period_end.slice(0, 40),
  }
}

const INSIGHT_KINDS = new Set(['upcoming_bill', 'budget_pace', 'category_surge', 'subscriptions', 'month_delta', 'net_flow', 'large_transaction', 'no_data'])
function parseSeedInsight(raw: unknown): GroundingInputs['seedInsight'] {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.kind !== 'string' || !INSIGHT_KINDS.has(r.kind)) return null
  const title = typeof r.title === 'string' ? r.title.slice(0, 200) : ''
  const detail = typeof r.detail === 'string' ? r.detail.slice(0, 300) : ''
  if (!title) return null
  return { kind: r.kind as AskInsightKind, title, detail }
}
