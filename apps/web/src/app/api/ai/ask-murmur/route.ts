import OpenAI from 'openai'
import { validateToken } from '../../../../lib/auth'
import {
  TOOLS,
  buildAskMurmurPrompt,
  buildDataOverview,
  buildSummarySnapshot,
  resolveToolCall,
  validateAskMurmurResponse,
  validateAskMurmurResponseAgainstCalls,
  type AskMurmurDataOverview,
  type ToolCallRecord,
  type ToolContext,
} from '@voice-expense/ai/server'
import type { AskMurmurRequest, AskMurmurResponse } from '@voice-expense/shared'
import type { NextRequest } from 'next/server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
const MODEL = process.env.AI_ASK_MODEL?.trim() || 'gpt-4o'

// Defensive caps. The mobile client already trims, but we don't trust it.
const MAX_TRANSACTIONS = 500
const MAX_RECURRING = 50
const MAX_QUESTION_LEN = 600
const MAX_HISTORY_TURNS = 6
const MAX_HISTORY_FIELD_LEN = 1000
// Tool-call loop ceiling per attempt. The model picks tools then writes a
// final answer; in practice 2\u20136 calls is typical. 12 is enough headroom
// for complex multi-bucket questions and prevents runaway loops.
const MAX_TOOL_ITERATIONS = 12

/**
 * POST /api/ai/ask-murmur
 *
 * Single-attempt tool-calling reasoner. The model invokes `run_query`
 * (sandboxed JS over the user's transactions + recurring rules) and
 * `compare` to compute every figure it cites. We trust the response
 * unless ONE specific structural bug fires — a comparison-direction
 * violation — in which case we retry once with that fact surfaced.
 *
 * If both attempts fail or anything else throws, we fall back to a
 * dead-simple second LLM call: "summarize this user's spending in 2-3
 * sentences with one chart." No tools, no validation, just a grounded
 * narrative paragraph. The user always gets a real answer.
 *
 * Soft validation issues (numbers we couldn't trace) are logged but
 * never block the response. The architecture guarantees correctness on
 * sandbox-computed numbers; chasing the validator's false positives
 * caused more user-visible failures than it prevented.
 */
export async function POST(req: NextRequest) {
  const userId = await validateToken(req.headers.get('Authorization'))
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Partial<AskMurmurRequest>
  try {
    body = (await req.json()) as Partial<AskMurmurRequest>
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const question = (body.question ?? '').toString().trim()
  if (!question) return Response.json({ error: 'question is required' }, { status: 400 })
  if (question.length > MAX_QUESTION_LEN) {
    return Response.json({ error: 'question is too long' }, { status: 400 })
  }

  const transactions = Array.isArray(body.transactions)
    ? body.transactions.slice(-MAX_TRANSACTIONS)
    : []
  const recurring_rules = Array.isArray(body.recurring_rules)
    ? body.recurring_rules.slice(0, MAX_RECURRING)
    : []

  const history = Array.isArray(body.history)
    ? body.history
        .slice(-MAX_HISTORY_TURNS)
        .map((h) => {
          if (!h || typeof h !== 'object') return null
          const turn = h as { question?: unknown; answer?: unknown }
          const q = typeof turn.question === 'string' ? turn.question.slice(0, MAX_HISTORY_FIELD_LEN) : ''
          const a = typeof turn.answer === 'string' ? turn.answer.slice(0, MAX_HISTORY_FIELD_LEN) : ''
          if (!q || !a) return null
          return { question: q, answer: a }
        })
        .filter((h): h is { question: string; answer: string } => h !== null)
    : []

  const askReq: AskMurmurRequest = {
    question,
    locale: (body.locale ?? 'en') as AskMurmurRequest['locale'],
    currency: (body.currency ?? 'USD').toString(),
    today: (body.today ?? new Date().toISOString().split('T')[0]).toString(),
    monthly_income: typeof body.monthly_income === 'number' ? body.monthly_income : null,
    transactions,
    recurring_rules,
    ...(history.length > 0 ? { history } : {}),
  }

  const ctx: ToolContext = {
    today: askReq.today,
    currency: askReq.currency,
    monthly_income: askReq.monthly_income,
    locale: askReq.locale,
    transactions: askReq.transactions,
    recurring_rules: askReq.recurring_rules,
  }

  // Deterministic data snapshot. Goes into the system prompt as ground
  // truth and is the receipt the sanity-check retry uses to call the
  // model out when its verdict contradicts what the data actually
  // contains.
  const overview = buildDataOverview(ctx)
  console.log(
    '[ask-murmur] question=',
    JSON.stringify(askReq.question),
    'today=',
    askReq.today,
    'overview=',
    JSON.stringify(overview),
  )

  try {
    const result = await runConversation(askReq, ctx, undefined, overview)
    const validation = validateAskMurmurResponseAgainstCalls(
      result.response,
      result.calls,
      askReq.question,
      askReq.monthly_income,
    )
    if (validation.soft_issues.length > 0) {
      console.warn('[ask-murmur] soft issues:', validation.soft_issues.join(' | '))
    }

    const verdictTrimmed = result.response.verdict.text.trim()
    const verdictTooShort = !result.response.out_of_scope && verdictTrimmed.length < 8
    const dataMismatch = detectDataMismatch(result.response, overview, askReq.question)

    if (
      validation.comparison_direction_violations.length === 0 &&
      !verdictTooShort &&
      !dataMismatch
    ) {
      return Response.json(result.response)
    }

    // Narrow retry triggers: comparison-direction violation, empty
    // verdict, or the verdict contradicts the data overview (e.g. the
    // model says "no transactions this year" while the overview shows
    // transactions in the current year). All three are structural
    // failures; everything else ships.
    const reasons = validation.comparison_direction_violations.slice()
    if (verdictTooShort) {
      reasons.push('previous attempt returned an empty verdict; this is not allowed. Run run_query for the data the question needs and write the answer using those numbers.')
    }
    if (dataMismatch) {
      reasons.push(dataMismatch)
    }
    console.warn('[ask-murmur] retrying once:', reasons.join(' | '))
    const retry = await runConversation(askReq, ctx, reasons, overview)
    const retryVerdict = retry.response.verdict.text.trim()
    if (retryVerdict.length >= 8 || retry.response.out_of_scope) {
      return Response.json(retry.response)
    }

    // Retry also produced an empty/broken verdict. Fall through to
    // summarize-fallback.
    console.error('[ask-murmur] retry also empty; using summarize fallback')
    const summary = await runSummarizeFallback(askReq, ctx)
    return Response.json(summary)
  } catch (err) {
    console.error('[ask-murmur] primary attempt threw, using summarize fallback:', err)
    try {
      const summary = await runSummarizeFallback(askReq, ctx)
      return Response.json(summary)
    } catch (fallbackErr) {
      console.error('[ask-murmur] summarize fallback also threw:', fallbackErr)
      return Response.json({ error: 'AI request failed' }, { status: 500 })
    }
  }
}

interface ConversationResult {
  response: AskMurmurResponse
  calls: ToolCallRecord[]
}

// ─── Data-mismatch sanity check ──────────────────────────────────────────────
//
// Catches the model's most common failure mode: writing a buggy date
// filter (or hallucinating an empty result) for a windowed question and
// then confidently asserting "no transactions in [period]" while the
// deterministic data overview clearly shows transactions exist for that
// period. The retry-hint produced here goes into the next attempt's
// system prompt and points the model at the pre-computed subset variable
// it should be using, so it cannot retry the same buggy filter.
//
// Only fires when the question contains a time-window phrase. If the
// user asks something window-free ("biggest category"), we don't
// second-guess.

const NO_TX_RE = /\bno\s+(?:recorded\s+)?(?:transactions?|expenses?|spending|income)\b/i

interface WindowCheck {
  /** Phrases in the user's question that map to this window. */
  phrase: RegExp
  /** True when the data has at least one transaction in this window. */
  flag: boolean
  /** Human-readable name for the retry hint. */
  label: string
  /** Pre-computed sandbox variable the retry hint tells the model to use. */
  subsetVar: string
}

function detectDataMismatch(
  response: AskMurmurResponse,
  overview: AskMurmurDataOverview,
  question: string,
): string | null {
  if (response.out_of_scope) return null
  if (overview.transaction_count === 0) return null
  const verdict = response.verdict.text || ''
  if (!NO_TX_RE.test(verdict)) return null

  const q = question.toLowerCase()
  const checks: WindowCheck[] = [
    {
      phrase: /\bthis\s+year\b|\bthis-year\b|\bcurrent\s+year\b|\byear[-\s]?to[-\s]?date\b|\bytd\b/,
      flag: overview.has_transactions_this_year,
      label: 'this year',
      subsetVar: 'transactions_this_year',
    },
    {
      phrase: /\bthis\s+month\b|\bcurrent\s+month\b|\bmonth[-\s]?to[-\s]?date\b|\bmtd\b/,
      flag: overview.has_transactions_this_month,
      label: 'this month',
      subsetVar: 'transactions_this_month',
    },
    {
      phrase: /\blast\s+month\b|\bprevious\s+month\b/,
      flag: overview.has_transactions_last_month,
      label: 'last month',
      subsetVar: 'transactions_last_month',
    },
    {
      phrase: /\blast\s+30\s*days?\b|\bpast\s+30\s*days?\b|\bthe\s+last\s+month\b/,
      flag: overview.has_transactions_last_30_days,
      label: 'last 30 days',
      subsetVar: 'transactions_last_30_days',
    },
    {
      phrase: /\blast\s+90\s*days?\b|\bpast\s+90\s*days?\b|\bquarter\b|\blast\s+3\s*months?\b|\bpast\s+3\s*months?\b/,
      flag: overview.has_transactions_last_90_days,
      label: 'last 90 days',
      subsetVar: 'transactions_last_90_days',
    },
  ]

  for (const c of checks) {
    if (c.phrase.test(q) && c.flag) {
      return (
        `your previous verdict said "${verdict.slice(0, 120)}" but the data overview shows transactions DO exist in ${c.label}. ` +
        `Stop writing your own date filter. The sandbox already has \`${c.subsetVar}\` pre-computed for ${c.label}. ` +
        `Re-run a fresh run_query that uses \`${c.subsetVar}\` directly (not a filter you wrote on \`transactions\`), aggregate from there, and write a real answer with the actual numbers.`
      )
    }
  }
  return null
}

async function runConversation(
  askReq: AskMurmurRequest,
  ctx: ToolContext,
  priorIssues?: string[],
  overview?: AskMurmurDataOverview,
): Promise<ConversationResult> {
  let systemPrompt = buildAskMurmurPrompt(askReq, overview)
  if (priorIssues && priorIssues.length > 0) {
    systemPrompt += `\n\nIMPORTANT — your previous attempt had issues. Read each one and correct it:\n- ${priorIssues.join('\n- ')}\n\nRewrite the answer. Use run_query for every number you cite, compare for every directional comparison, and answer the user's question with real data.`
  }

  type Message =
    | { role: 'system'; content: string }
    | { role: 'user'; content: string }
    | {
        role: 'assistant'
        content: string | null
        tool_calls?: Array<{
          id: string
          type: 'function'
          function: { name: string; arguments: string }
        }>
      }
    | { role: 'tool'; tool_call_id: string; content: string }
  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: askReq.question },
  ]

  const calls: ToolCallRecord[] = []

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 1500,
      tools: TOOLS,
      tool_choice: 'auto',
      messages: messages as Parameters<typeof openai.chat.completions.create>[0]['messages'],
    })

    const choice = completion.choices[0]
    const msg = choice.message

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const fnCalls = msg.tool_calls.filter(
        (tc): tc is Extract<typeof tc, { type: 'function' }> => tc.type === 'function',
      )
      if (fnCalls.length === 0) break

      messages.push({
        role: 'assistant',
        content: msg.content ?? '',
        tool_calls: fnCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      })
      for (const tc of fnCalls) {
        const name = tc.function.name
        let args: unknown
        try {
          args = JSON.parse(tc.function.arguments || '{}')
        } catch {
          args = {}
        }
        const resolved = resolveToolCall(name, args, ctx)
        const record: ToolCallRecord = resolved.ok
          ? { name, args, ok: true, result: resolved.result }
          : { name, args, ok: false, result: null, error: resolved.error }
        calls.push(record)
        // Log every tool call so we can see what code the model wrote and
        // what came back. The result is truncated for readability —
        // the full result is in the runtime; this trace is just to spot
        // buggy filters fast.
        const argPreview =
          name === 'run_query' && args && typeof args === 'object'
            ? (args as { code?: string }).code?.slice(0, 240) ?? ''
            : JSON.stringify(args).slice(0, 240)
        const resultPreview = JSON.stringify(
          resolved.ok ? resolved.result : { error: resolved.error },
        ).slice(0, 240)
        console.log(
          `[ask-murmur] tool ${name} ok=${resolved.ok} args=${argPreview} result=${resultPreview}`,
        )
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(
            resolved.ok ? resolved.result : { error: resolved.error },
          ),
        })
      }
      continue
    }

    const text = msg.content ?? '{}'
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = {}
    }
    const response = validateAskMurmurResponse(parsed, askReq.transactions.length)
    return { response, calls }
  }

  // Hit the iteration ceiling without a final answer.
  return {
    response: {
      verdict: { text: '', sentiment: 'neutral' },
      actions: [],
      attribution: { transaction_count: askReq.transactions.length },
      out_of_scope: false,
    },
    calls,
  }
}

// ─── Summarize-fallback ─────────────────────────────────────────────────────
//
// One simple LLM call with no tools. The model gets the user's data and
// is asked to produce a 2-3 sentence summary plus a chart. No tool
// calling, no validation — we trust whatever it says and ship it.
// Used only when the primary attempt + retry both produced empty
// verdicts, which should be rare. The return is shape-validated but
// never grounded-validated; the model is free to write whatever it
// thinks is most useful.

async function runSummarizeFallback(
  askReq: AskMurmurRequest,
  ctx: ToolContext,
): Promise<AskMurmurResponse> {
  // Deterministic 6-month snapshot computed inline. We never call
  // `resolveToolCall` here because the only tools registered are
  // `run_query` and `compare`; the fallback used to ask for
  // `top_categories` / `monthly_series`, get `Unknown tool` errors back,
  // and hand the model a snapshot full of `null`s.
  const snapshot = buildSummarySnapshot(ctx)

  const systemPrompt = `You are Murmur, a personal-finance reader. Summarize the user's spending in 2-3 sentences in ${ctx.locale} using the snapshot below. The numbers in the snapshot are deterministic — quote them verbatim. Always include a chart if the snapshot has data: a "donut" of top categories (data: name + total) or a "line" of monthly_series (data: label + spent). If the snapshot has no data, say so plainly and offer one concrete next step.

Output STRICT JSON only:
{
  "verdict": { "text": string, "sentiment": "neutral" | "positive" | "negative" },
  "chart"?: { "type": "donut" | "horizontal_bar" | "line" | "bar", "title": string, "data": [{ "label": string, "value": number }] },
  "breakdown"?: { "caption": string, "rows": [{ "label": string, "value": string }] },
  "attribution": { "transaction_count": number },
  "out_of_scope": false,
  "actions": []
}

User locale: ${ctx.locale}
User currency: ${ctx.currency}
Today: ${ctx.today}

Snapshot:
${JSON.stringify(snapshot)}

User question: ${askReq.question}`

  const completion = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: 700,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: askReq.question },
    ],
  })

  const text = completion.choices[0].message.content ?? '{}'
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = {}
  }
  return validateAskMurmurResponse(parsed, ctx.transactions.length)
}
