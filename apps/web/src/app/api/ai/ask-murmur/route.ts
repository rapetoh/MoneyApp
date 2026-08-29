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
import { localDay } from '@voice-expense/shared'
import type { AskMurmurRequest, AskMurmurResponse, AskMurmurTransaction, AskMurmurBudget } from '@voice-expense/shared'
import type { NextRequest } from 'next/server'
import { getOpenAIEnv } from '../../../../lib/env'
import { resolveNowUtc, resolveTimeZone } from './timeZone'

const openai = new OpenAI({ apiKey: getOpenAIEnv().OPENAI_API_KEY })
const MODEL = process.env.AI_ASK_MODEL?.trim() || 'gpt-4o'

// Payload-bearing traces (question text, data overview, tool args/results,
// validator detail) log only under this flag, which stays unset in
// production: Vercel retains logs, and this is the same class of data
// migration 009 scrubs from the database.
const DEBUG_TRACE = process.env.AI_DEBUG_TRACE === '1'

// Defensive caps. The mobile client already trims, but we don't trust it.
// 12 months of history at up to 2,000 rows (was 90 days / 500 — which made
// "this year" a 90-day number labelled as a year, owner report Aug 15).
// Rows never reach the model — the deterministic tools aggregate them —
// so a bigger dataset costs no tokens.
const MAX_TRANSACTIONS = 2000
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
 * Single-attempt tool-calling reasoner. The model calls a closed set of
 * deterministic aggregation tools (`total`, `sum_by_category`,
 * `top_merchants`, `series`, `recurring_total`, `compare` \u2014 see
 * `@voice-expense/ai/server`'s `askMurmurTools.ts`) to compute every
 * figure it cites. We trust the response unless ONE specific structural
 * bug fires \u2014 a comparison-direction violation \u2014 in which case we
 * retry once with that fact surfaced.
 *
 * If both attempts fail or anything else throws, we fall back to a
 * dead-simple second LLM call: "summarize this user's spending in 2-3
 * sentences with one chart." No tools, no validation, just a grounded
 * narrative paragraph. The user always gets a real answer.
 *
 * Soft validation issues (numbers we couldn't trace) are logged but
 * never block the response. The architecture guarantees correctness on
 * every tool-computed number; chasing the validator's false positives
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

  // `amount_in_profile_currency` is normalized to a real number-or-null
  // here rather than trusted as sent \u2014 an older client build (or any
  // caller that doesn't set it) would otherwise send `undefined`, which
  // is not the same contract as "awaiting FX backfill" (`null`) that
  // every tool in askMurmurTools.ts checks for (fix-plan 1.4/2.10).
  const transactions: AskMurmurTransaction[] = (
    Array.isArray(body.transactions) ? body.transactions : []
  )
    .slice(-MAX_TRANSACTIONS)
    .map((t) => ({
      ...t,
      amount_in_profile_currency:
        typeof t.amount_in_profile_currency === 'number' && Number.isFinite(t.amount_in_profile_currency)
          ? t.amount_in_profile_currency
          : null,
    }))
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

  const budget = parseBudget(body.budget)

  const askReq: AskMurmurRequest = {
    question,
    locale: (body.locale ?? 'en') as AskMurmurRequest['locale'],
    currency: (body.currency ?? 'USD').toString(),
    now_utc: resolveNowUtc(body.now_utc),
    time_zone: resolveTimeZone(body.time_zone),
    monthly_income: typeof body.monthly_income === 'number' ? body.monthly_income : null,
    transactions,
    recurring_rules,
    ...(budget ? { budget } : {}),
    ...(history.length > 0 ? { history } : {}),
  }

  const ctx: ToolContext = {
    now_utc: askReq.now_utc,
    tz: askReq.time_zone,
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
  const startedAt = Date.now()
  console.log(
    `[ask-murmur] request question_len=${askReq.question.length} transactions=${transactions.length} recurring=${recurring_rules.length} history_turns=${history.length}`,
  )
  if (DEBUG_TRACE) {
    console.log(
      '[ask-murmur] trace question=',
      JSON.stringify(askReq.question),
      'now_utc=',
      askReq.now_utc,
      'time_zone=',
      askReq.time_zone,
      'overview=',
      JSON.stringify(overview),
    )
  }

  try {
    const result = await runConversation(askReq, ctx, undefined, overview)
    const validation = validateAskMurmurResponseAgainstCalls(
      result.response,
      result.calls,
      askReq.question,
      askReq.monthly_income,
      trustedFigures(askReq, overview),
    )
    if (validation.soft_issues.length > 0) {
      // Soft-issue strings quote the untraced amounts themselves — count only.
      console.warn(`[ask-murmur] soft_issues=${validation.soft_issues.length}`)
      if (DEBUG_TRACE) {
        console.warn('[ask-murmur] trace soft issues:', validation.soft_issues.join(' | '))
      }
    }

    const verdictTrimmed = result.response.verdict.text.trim()
    const verdictTooShort = !result.response.out_of_scope && verdictTrimmed.length < 8
    const dataMismatch = detectDataMismatch(result.response, overview, askReq.question)
    const stall = detectStall(result.response)
    const repeat = detectRepeat(result.response, askReq)
    const ungrounded = detectUngrounded(result.response, result.calls, validation.soft_issues)
    const windowMismatch = detectWindowMismatch(askReq.question, result.response, result.calls)

    if (
      validation.comparison_direction_violations.length === 0 &&
      !verdictTooShort &&
      !dataMismatch &&
      !stall &&
      !repeat &&
      !ungrounded &&
      !windowMismatch
    ) {
      console.log(
        `[ask-murmur] ok outcome=primary tool_calls=${result.calls.length} ms=${Date.now() - startedAt}`,
      )
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
    if (stall) reasons.push(stall)
    if (repeat) reasons.push(repeat)
    if (ungrounded) reasons.push(ungrounded)
    if (windowMismatch) reasons.push(windowMismatch)
    // Retry reasons embed the verdict text and untraced amounts — log only
    // which triggers fired.
    console.warn(
      `[ask-murmur] retrying once: direction_violations=${validation.comparison_direction_violations.length} empty_verdict=${verdictTooShort} data_mismatch=${dataMismatch !== null} stall=${stall !== null} repeat=${repeat !== null} ungrounded=${ungrounded !== null} window_mismatch=${windowMismatch !== null}`,
    )
    if (DEBUG_TRACE) {
      console.warn('[ask-murmur] trace retry reasons:', reasons.join(' | '))
    }
    const retry = await runConversation(askReq, ctx, reasons, overview)
    const retryVerdict = retry.response.verdict.text.trim()
    const retryValidation = validateAskMurmurResponseAgainstCalls(
      retry.response,
      retry.calls,
      askReq.question,
      askReq.monthly_income,
      trustedFigures(askReq, overview),
    )
    const retryStalled =
      detectStall(retry.response) !== null ||
      detectRepeat(retry.response, askReq) !== null ||
      detectUngrounded(retry.response, retry.calls, retryValidation.soft_issues) !== null
    if ((retryVerdict.length >= 8 && !retryStalled) || retry.response.out_of_scope) {
      console.log(
        `[ask-murmur] ok outcome=retry tool_calls=${retry.calls.length} ms=${Date.now() - startedAt}`,
      )
      return Response.json(retry.response)
    }

    // Retry also produced an empty/stalled/repeated verdict. Fall through
    // to summarize-fallback — a real data summary beats a second stall.
    console.error('[ask-murmur] retry also empty/stalled; using summarize fallback')
    const summary = await runSummarizeFallback(askReq, ctx)
    console.log(`[ask-murmur] ok outcome=summarize_fallback ms=${Date.now() - startedAt}`)
    return Response.json(summary)
  } catch (err) {
    // Message + status only — the raw OpenAI SDK error object embeds the
    // request body, i.e. the user's question and transactions.
    const e = err as { status?: number; message?: string; headers?: Record<string, string> }

    // Capacity, not a bad answer (owner-facing on Aug 15: an org-level
    // 30k tokens/min gpt-4o limit tripped mid-conversation and the
    // question-blind summarize fallback answered "what about a laptop?"
    // with a 6-month category summary). The SDK already backed off twice
    // inside the minute window; wait the rest of it out once more, then
    // — if still limited — say so honestly with a Retry-After. An
    // off-topic answer is worse than a "busy, try again" the client can
    // retry with one tap.
    if (e?.status === 429) {
      const waitMs = retryAfterMs(e)
      console.warn(`[ask-murmur] rate limited (429); waiting ${waitMs}ms and retrying once`)
      await new Promise((r) => setTimeout(r, waitMs))
      try {
        const again = await runConversation(askReq, ctx, [], overview)
        console.log(`[ask-murmur] ok outcome=after_429 tool_calls=${again.calls.length} ms=${Date.now() - startedAt}`)
        return Response.json(again.response)
      } catch (err2) {
        const e2 = err2 as { status?: number; message?: string }
        console.error(`[ask-murmur] still failing after 429 wait (status=${e2?.status ?? 'n/a'}): ${e2?.message ?? String(err2)}`)
        return Response.json(
          { error: 'busy', retry_after_seconds: 5 },
          { status: 503, headers: { 'Retry-After': '5' } },
        )
      }
    }

    console.error(
      `[ask-murmur] primary attempt threw (status=${e?.status ?? 'n/a'}): ${e?.message ?? String(err)}; using summarize fallback`,
    )
    try {
      const summary = await runSummarizeFallback(askReq, ctx)
      console.log(`[ask-murmur] ok outcome=error_fallback ms=${Date.now() - startedAt}`)
      return Response.json(summary)
    } catch (fallbackErr) {
      const fe = fallbackErr as { status?: number; message?: string }
      console.error(
        `[ask-murmur] summarize fallback also threw (status=${fe?.status ?? 'n/a'}): ${fe?.message ?? String(fallbackErr)}`,
      )
      return Response.json({ error: 'AI request failed' }, { status: 500 })
    }
  }
}

interface ConversationResult {
  response: AskMurmurResponse
  calls: ToolCallRecord[]
}

/** How long to wait after a 429 before one more full attempt. Honors a
 *  Retry-After header or the SDK message's "try again in Nms" hint; clamps
 *  to 1.5–6s so a serverless invocation can't stall past its budget. */
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

/** Trust boundary for the client-supplied budget block: every numeric
 *  field must be a finite number and the period one of the app's own; a
 *  malformed block is dropped (the model then behaves as "no budget set")
 *  rather than reaching the prompt. */
function parseBudget(raw: unknown): AskMurmurBudget | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const amount = num(b.amount), spent = num(b.spent), committed = num(b.committed), remaining = num(b.remaining), days_left = num(b.days_left)
  const period = b.period
  const PERIODS = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'] as const
  if (amount === null || spent === null || committed === null || remaining === null || days_left === null) return null
  if (typeof period !== 'string' || !(PERIODS as readonly string[]).includes(period)) return null
  if (typeof b.period_start !== 'string' || typeof b.period_end !== 'string') return null
  return {
    amount, spent, committed, remaining,
    days_left: Math.max(0, Math.trunc(days_left)),
    period: period as AskMurmurBudget['period'],
    currency: typeof b.currency === 'string' && b.currency ? b.currency.slice(0, 3).toUpperCase() : 'USD',
    category_name: typeof b.category_name === 'string' && b.category_name ? b.category_name.slice(0, 80) : null,
    period_start: b.period_start.slice(0, 40),
    period_end: b.period_end.slice(0, 40),
  }
}

/** Figures the model may quote without a tool call: the BUDGET block (the
 *  app's own numbers) and the data overview's totals — a greeting citing
 *  `this_month_debit` is grounded, not hallucinated. */
function trustedFigures(req: AskMurmurRequest, overview: AskMurmurDataOverview): number[] {
  const out: number[] = [
    overview.this_month_debit,
    overview.this_month_credit,
    overview.total_debit,
    overview.total_credit,
  ]
  if (req.budget) out.push(req.budget.amount, req.budget.spent, req.budget.committed, req.budget.remaining)
  return out
}

// ─── Ungrounded-number / window-mismatch detectors ─────────────────────────
//
// Aug 15 trace: "and last month?" was answered with tool_calls=0 and an
// invented "$91" — the numeric validator flagged it, but only as a *soft*
// issue nothing acted on. Two structural triggers now:
//   1. A numeric answer produced without a single successful tool call
//      whose figures the validator couldn't trace → retry ("call the tools").
//   2. The question names a period ("last month", "yesterday", "this
//      week"…) and no tool call queried that window → retry.

const PERIOD_PHRASES: Array<{ re: RegExp; windows: string[]; label: string }> = [
  { re: /\blast\s+month\b|\bprevious\s+month\b|\bmois\s+dernier\b|\bmes\s+pasado\b|\bm[êe]s\s+passado\b/i, windows: ['lastMonth', 'custom'], label: 'last month' },
  { re: /\bthis\s+month\b|\bce\s+mois/i, windows: ['thisMonth', 'custom'], label: 'this month' },
  { re: /\byesterday\b|\bhier\b|\bayer\b|\bontem\b/i, windows: ['yesterday', 'custom'], label: 'yesterday' },
  { re: /\blast\s+week\b|\bsemaine\s+derni[eè]re\b|\bsemana\s+pasada\b|\bsemana\s+passada\b/i, windows: ['lastWeek', 'last7Days', 'custom'], label: 'last week' },
  { re: /\bthis\s+week\b|\bcette\s+semaine\b|\besta\s+semana\b/i, windows: ['thisWeek', 'last7Days', 'custom'], label: 'this week' },
  { re: /\blast\s+year\b|\bann[ée]e\s+derni[eè]re\b|\ba[ñn]o\s+pasado\b|\bano\s+passado\b/i, windows: ['lastYear', 'last12Months', 'custom'], label: 'last year' },
  { re: /\bthis\s+year\b|\bcette\s+ann[ée]e\b|\beste\s+a[ñn]o\b|\beste\s+ano\b/i, windows: ['thisYear', 'last12Months', 'custom'], label: 'this year' },
  { re: /\btoday\b|\baujourd/i, windows: ['today', 'custom'], label: 'today' },
]

function windowsQueried(calls: ToolCallRecord[]): Set<string> {
  const out = new Set<string>()
  for (const c of calls) {
    if (!c.ok || !c.args || typeof c.args !== 'object') continue
    const w = (c.args as { window?: unknown }).window
    if (typeof w === 'string') out.add(w)
  }
  return out
}

/** Non-null when the question names a period and no successful tool call
 *  queried a window that could answer for it. Skips greetings/refusals
 *  (no numbers) and answers that made no claim about that period. */
function detectWindowMismatch(question: string, response: AskMurmurResponse, calls: ToolCallRecord[]): string | null {
  if (response.out_of_scope) return null
  if (!/\d/.test(response.verdict.text) && !response.breakdown && !response.chart) return null
  const queried = windowsQueried(calls)
  for (const p of PERIOD_PHRASES) {
    if (!p.re.test(question)) continue
    if (p.windows.some((w) => queried.has(w))) return null
    return (
      `the user asked about ${p.label} but no tool call queried that period (windows queried: ${queried.size ? Array.from(queried).join(', ') : 'none'}). ` +
      `Call \`total\` (and any breakdown tool you need) with window "${p.windows[0]}" and answer from those results.`
    )
  }
  return null
}

/** Non-null when a numeric answer was produced with no successful tool call
 *  and the validator could not trace its figures. */
function detectUngrounded(response: AskMurmurResponse, calls: ToolCallRecord[], softIssues: string[]): string | null {
  if (response.out_of_scope) return null
  const okCalls = calls.filter((c) => c.ok).length
  const untraced = softIssues.filter((i) => /not traced to a tool call/.test(i))
  if (okCalls === 0 && untraced.length > 0) {
    return (
      `previous attempt quoted figures without calling any tool (${untraced.slice(0, 3).join('; ')}). ` +
      'Every number must come from a tool result, the data overview, the BUDGET block, or the user\'s own words - call the tools now.'
    )
  }
  return null
}

// ─── Non-answer / stall / repeat detectors ──────────────────────────────────
//
// Two structural failures the empty-verdict check cannot see (owner report,
// Aug 15 — "Can I afford a PS5 this month?" → "To determine if you can
// afford a PS5 this month, we need to compare your spending and income for
// August." three times in a row):
//   1. A *stall*: fluent prose that narrates the work or asks permission
//      instead of doing it — no numbers, no breakdown, no chart.
//   2. A *verbatim repeat* of the previous turn's answer in response to a
//      follow-up ("Ok", "Okay?????").
// Both are retry triggers with a pointed instruction; if the retry does it
// again, the deterministic summarize fallback answers instead.

const STALL_RE =
  /\b(to (?:determine|answer|assess|figure out|check|see|know|find out)|we need to|i need to|i(?:'|’)ll need|i (?:will|can|could|would) (?:check|look|analy[sz]e|calculate|compare|review|need)|let me|let(?:'|’)s (?:take a look|look|start|begin)|would you like me to|shall i|do you want me to|first,? (?:i|we)|i(?:'|’)d need|please (?:provide|share|tell)|could you (?:tell|clarify|specify|share)|can you (?:tell|clarify|specify|share))\b/i

function normalizeVerdict(text: string): string {
  return text.replace(/<\/?b>/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Non-null when the answer is a stall (narration/permission-seeking with
 *  no data) — the retry reason to feed back. */
function detectStall(response: AskMurmurResponse): string | null {
  if (response.out_of_scope) return null
  const verdict = response.verdict.text
  const hasNumbers = /\d/.test(verdict)
  const hasData = !!response.breakdown || !!response.chart
  if (hasNumbers || hasData) return null
  if (!STALL_RE.test(verdict)) return null
  return (
    `previous attempt described what it would do instead of doing it ("${verdict.slice(0, 140)}"). ` +
    'This is not allowed. Do not narrate, do not ask permission, do not ask the user for numbers you can compute - ' +
    'call the tools NOW and lead the verdict with the answer and the figures.'
  )
}

/** Non-null when the answer repeats the last history answer verbatim. */
function detectRepeat(response: AskMurmurResponse, req: AskMurmurRequest): string | null {
  const last = req.history?.[req.history.length - 1]
  if (!last) return null
  if (normalizeVerdict(response.verdict.text) !== normalizeVerdict(last.answer)) return null
  return (
    `previous attempt repeated the prior answer word for word. The user sent a follow-up ("${req.question.slice(0, 80)}") - respond to THAT. ` +
    'If the follow-up is an acknowledgement (ok, thanks, sure) and your prior reply promised an analysis, deliver that analysis now with real numbers; ' +
    'otherwise answer in one or two fresh sentences and offer the most useful next thing.'
  )
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
    systemPrompt += `\n\nIMPORTANT - your previous attempt had issues. Read each one and correct it:\n- ${priorIssues.join('\n- ')}\n\nRewrite the answer. Use run_query for every number you cite, compare for every directional comparison, and answer the user's question with real data.`
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
        // Args and results carry the user's amounts and merchants — the
        // payload preview that spots buggy model-written filters logs only
        // under the debug flag.
        console.log(`[ask-murmur] tool ${name} ok=${resolved.ok}`)
        if (DEBUG_TRACE) {
          const argPreview =
            name === 'run_query' && args && typeof args === 'object'
              ? (args as { code?: string }).code?.slice(0, 240) ?? ''
              : JSON.stringify(args).slice(0, 240)
          const resultPreview = JSON.stringify(
            resolved.ok ? resolved.result : { error: resolved.error },
          ).slice(0, 240)
          console.log(`[ask-murmur] trace args=${argPreview} result=${resultPreview}`)
        }
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
  // `resolveToolCall` here because the registered tool catalog doesn't
  // include a bare "give me top categories and a monthly series" call;
  // the fallback used to ask for `top_categories` / `monthly_series`
  // directly, get `Unknown tool` errors back, and hand the model a
  // snapshot full of `null`s.
  const snapshot = buildSummarySnapshot(ctx)

  const systemPrompt = `You are Murmur, a personal-finance reader. Answer the user's question below as directly as the snapshot allows, in 2-3 sentences in ${ctx.locale}; if the snapshot cannot answer it, say exactly what you can see instead - never change the subject silently. The numbers in the snapshot are deterministic - quote them verbatim. Always include a chart if the snapshot has data: a "donut" of top categories (data: name + total) or a "line" of monthly_series (data: label + spent). If the snapshot has no data, say so plainly and offer one concrete next step.

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
Today: ${localDay(ctx.now_utc, ctx.tz)}

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
