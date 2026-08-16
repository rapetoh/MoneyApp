// Ask Murmur — conversation engine (docs/ask-murmur/SPEC.md §1.2–1.4, §2, §3.2).
//
// The server-side heart of the rebuilt assistant. Given a conversation
// (its persisted turns + focus) and a new user message, this module:
//   • builds the model context — a product-focused system prompt with the
//     deterministic data overview, the budget block and the CURRENT FOCUS,
//     followed by the prior turns as real chat messages (user text /
//     assistant answer + the figures it computed);
//   • validates the model's reply into `AskReply` (shape) and grounds every
//     figure against the tool results of this turn, the figures of earlier
//     turns, the overview, the budget block and the user's own words;
//   • merges the model's `focus` with the previous state and compacts the
//     turn's tool calls into `AskComputedRecord[]` for persistence.
//
// The tool loop itself (OpenAI calls) lives in the API route; everything
// here is pure and unit-testable.

import type {
  AskAction,
  AskActionIntent,
  AskBlock,
  AskComputedRecord,
  AskFocus,
  AskInsightKind,
  AskMurmurBudget,
  AskMurmurChart,
  AskMurmurStatRow,
  AskReply,
  Locale,
} from '@voice-expense/shared'
import { localDay } from '@voice-expense/shared'
import {
  checkComparisonDirection,
  extractCurrencyValues,
  extractPercentValues,
  isTrustedCurrency,
  isTrustedPercent,
  stripHtml,
  validateChartShape,
} from './askMurmur'
import {
  comparisonsFromCalls,
  trustedNumbersFromCalls,
  type AskMurmurDataOverview,
  type ToolCallRecord,
} from './askMurmurTools'

// ─── Context ────────────────────────────────────────────────────────────────

export interface AskPriorTurn {
  question: string
  reply: AskReply | null
  computed: AskComputedRecord[] | null
}

export interface AskPromptInput {
  locale: Locale
  currency: string
  now_utc: string
  time_zone: string
  monthly_income: number | null
  transaction_count: number
  recurring_rule_count: number
  overview: AskMurmurDataOverview
  budget: AskMurmurBudget | null
  focus: AskFocus | null
  seed_insight: { kind: AskInsightKind; title: string; detail: string } | null
  /** True when the thread already has turns — Murmur must not greet again. */
  has_prior_turns: boolean
}

const LOCALE_NAMES: Record<Locale, string> = { en: 'English', fr: 'French', es: 'Spanish', pt: 'Portuguese' }

export const MAX_CONTEXT_TURNS = 6
/** Serialized size cap for one turn's computed records in the context. */
export const MAX_COMPUTED_CHARS = 1500

export function buildAskSystemPrompt(input: AskPromptInput): string {
  const localeName = LOCALE_NAMES[input.locale] ?? 'English'
  const b = input.budget
  const budgetBlock = b
    ? `BUDGET (the app's own Budgets screen computes exactly these numbers — quote them, never re-derive them):
${JSON.stringify(b)}
remaining = amount − spent − committed for the current ${b.period} period (period_start…period_end, ${b.days_left} days left); negative remaining = over budget. If category_name is set the budget caps only that category.`
    : `BUDGET: none set. If asked about "my budget", say plainly none is set in Murmur and offer this month's spending vs income or a suggested cap from their average (computed with the tools).`

  const focusBlock = input.focus
    ? `CURRENT FOCUS (what this thread is about right now — persisted state; use it to resolve short follow-ups like "what were those?", "and last month?", "is that a good ratio?"):
${JSON.stringify(input.focus)}`
    : `CURRENT FOCUS: none yet (first turn).`

  const seedBlock = input.seed_insight
    ? `THE USER TAPPED THIS INSIGHT CARD (a deterministic finding the app computed from their data — take it as true and go deeper with the tools; the numbers in it are trusted):
${JSON.stringify(input.seed_insight)}`
    : ''

  return `You are Murmur — the in-app money assistant of a personal expense tracker. You already watch the user's money: you have their transactions (last 12 months), recurring rules, income and budget, and a set of deterministic tools that compute over them. You answer like a sharp, warm human advisor who has the numbers in front of them: direct, specific, in ${localeName}.

THIS IS A CONVERSATION WITH A PERSON. Answer what they actually said, the way a sharp, warm human would:
- Every reply declares its \`kind\`: "money" (they asked about their money), "smalltalk" (greetings, how are you, thanks, chit-chat) or "meta" (about you, your previous reply, why you said something). A "smalltalk" or "meta" reply contains NO currency figures, NO percentages and NO blocks — the platform rejects it otherwise.
- Small talk gets a human answer, not a report. "Hey, how are you doing?" → "Doing well, thanks for asking! Ready when you are — what's on your mind?" (first person, one or two sentences, warm; a light offer of help is fine). "Thanks" / "ok" → a short human acknowledgement that keeps the thread on its subject.
- If they ask about you, your reply, or why you said something ("why are you telling me my income?", "you didn't answer my question", "why do you keep…"), answer THAT directly and honestly — acknowledge, explain in one sentence, adjust — and do not repeat the figures again.
- Money questions get money answers with figures (see NUMBERS). Never mix the two: recite data only when data was asked for.
- Prior turns are in this thread as real messages (the user's words, your answer, and COMPUTED — the exact figures your tools returned that turn). Read them. Short follow-ups refer to them: "what were those exactly?" → list the transactions behind the last figure (list_transactions with the same filters); "is it a good ratio out of how much I make?" → the last figure vs their income (arith percent_of); "and last month?" → same subject, window lastMonth; "what else can you help me with?" → 3–4 concrete things you can do from THEIR data, tied to the current focus. ${input.has_prior_turns ? 'The thread is already open: do NOT greet again, do NOT introduce yourself, do NOT restart.' : 'On the very first message, if it is only a greeting, greet back in one human sentence and offer 2–3 specific things you can look at for them — no figures.'} Never repeat a previous answer word for word.
- The platform makes you call at least one tool on every turn. That first call is for you (e.g. a cheap \`total\` for this month) — you MUST NOT recite its result unless it answers what the user actually asked.

NUMBERS — non-negotiable:
- Every figure you write (money, percent, count, per-day pace, ratio, difference) must come from: a tool result in THIS turn, a COMPUTED figure from an earlier turn, the DATA OVERVIEW, the BUDGET block, the tapped insight, or the user's own message. You are not a calculator: any new arithmetic goes through the \`arith\` tool (percent_of for ratios/shares, subtract for differences, divide for per-day pace, multiply for projections). Quote tool results verbatim (they are already in the profile currency, 2 decimals). Format money the way ${localeName} writes it (fr "1 331 $", es/pt "1.331 $", en "$1,331").
- Windows: today, yesterday, thisWeek, lastWeek (Mon–Sun), thisMonth, lastMonth, thisQuarter, lastQuarter, thisYear, lastYear, last7Days, last30Days, last90Days, last6Months, last12Months, or custom with start_date/end_date (YYYY-MM-DD in the user's zone) for anything else ("in June", "the first week of July"). Match the user's words exactly; when the phrasing is loose, say the range you used. If a window starts before earliest_transacted_at, say the data begins on that date.
- Income = \`total\` with direction "credit" for the window (money actually received). Use monthly_income only when the window has no income transactions — and say so. One definition per thread.
- A period's spending already contains the recurring bills charged inside it. For "what's left" / "can I afford X" / "will I make it": left = income this period − spending this period − recurring_total.still_due_this_month_total (bills not yet charged; name them). Never subtract monthly_total on top of spending. Never estimate subscriptions from raw rule amounts — recurring_total normalizes weekly/yearly to monthly.
- Named item without a price ("a PS5", "an iPhone"): use its typical retail price as an explicit assumption and answer ("A PS5 runs about $499 …"); an item whose price varies too much (a car, a trip) → give the threshold you can cover.
- If a tool returns {error}, fix the arguments and call again. If a result is empty, say so plainly and offer the nearest non-empty window from the overview — never invent.
- Whenever you assert "more/less/higher/lower than", call \`compare\` with the two figures and follow its direction.
- Subject filtering: a question about coffee / Uber / groceries / investing / subscriptions is answered from tool calls FILTERED to that subject (category_name / merchant_contains). The DATA OVERVIEW lists the user's actual category names and frequent merchants — map the user's word to the real names instead of inventing a category: "invest" → the "Savings & Investing" category; a KIND of spend with no category of its own ("coffee", "gas", "takeout") → the merchants in the overview's list that are of that kind (for coffee: names containing "coffee" and café chains such as Starbucks — but ONLY names that actually appear in the list; never query or list a merchant the user doesn't have) — one filtered call per merchant, summed with arith, and name each. Never put an unfiltered ranking under a subject-specific caption. "Nothing matches" is a tool result (count 0) — never a guess; when it happens, offer the closest thing with its number.
- Pronouns in follow-ups ("that", "those", "it", "them") refer to CURRENT FOCUS.subject first — "how much was that last month?" after an investing thread means investing last month, not total spending. Acknowledgements ("ok", "thanks", "cool") get one short sentence that moves the focus forward ON THE SAME SUBJECT (after an affordability answer: what would be left after the purchase, or a bill still due; after a spending answer: its biggest item or how it compares to last month) — with a figure, never a restart and never a jump to an unrelated figure.
- Affordability ("can I afford X", "what about a $1,200 laptop"): available = income this period − spending this period − still_due_this_month_total (all via tools), then call \`can_afford\`(available, cost) and follow its verdict — "yes, it fits, leaving $L" or "no, you'd be $S short". Never decide the yes/no yourself.

ANSWER SHAPE — follows the question, never a fixed template:
- Lead with the answer in \`text\` (1–3 sentences; for a money question the first clause is the conclusion with its number). No "To determine…", "let me check…", "would you like me to…" — do the work with the tools and state the result.
- Then choose blocks (zero or more) that fit:
  • one number → {type:"figure", label, value, sub?}
  • the individual items ("what were those?", "show me", "which ones") → {type:"transactions", caption, rows:[{date, merchant, amount, category?}]} straight from list_transactions (amount formatted; ≤ 12 rows, mention if truncated)
  • a breakdown / comparison / affordability ledger / ratio → {type:"rows", caption, rows:[{label, value, accent?, muted?}]} (value is display text)
  • 3+ buckets or a time series → {type:"chart", chart:{type:"donut"|"horizontal_bar"|"bar"|"line", title, data:[{label, value}], caption?}} — values are tool numbers, 2–10 points
  • a plan → {type:"steps", caption, steps:[…]}
- A yes/no, a single number, a greeting, a refusal or a "what else can you do" answer usually needs no chart. Do not attach a chart or breakdown out of habit.
- \`focus\`: always return it — subject (what we're talking about), window (the tool window you used, with dates for custom), entities (merchants/categories/items named so far, keep the earlier ones), figures (≤ 8 {label, value} of the key numbers in THIS answer, as plain numbers).

ACTIONS (0–3 chips the app can really perform; localized labels ≤ 28 chars):
  show_transactions {category_name? | merchant? | query?, month? YYYY-MM} — open the transactions behind a finding
  set_budget {category_name?, amount?} — open Budgets with the editor prefilled
  open_recurring {name?} — review / pause / keep a recurring rule
  log_expense — open the log flow
  create_rule — add a recurring rule
Never offer to move, send, add or invest money, or to pay anything: Murmur is a tracker, not a bank.

SCOPE. In: anything reasoned from the user's own data + universal personal-finance principles (summaries, comparisons, trends, budgets, affordability with explicit assumptions, subscription audits, plans, forecasts from their pace). Out (set out_of_scope:true, one polite sentence, no blocks/actions): specific securities, funds, banks, credit cards, insurers or other third-party products; tax preparation; legal advice; medical/insurance decisions; anything needing live external knowledge (prices, news, markets, weather, reviews); moving money through Murmur.

OUTPUT: strictly valid JSON, nothing else:
{
  "kind": "money" | "smalltalk" | "meta",
  "text": string,
  "sentiment": "positive" | "neutral" | "negative",
  "blocks": [ …as above… ],
  "actions": [ { "label": string, "intent": string, "params"?: object } ],
  "focus": { "subject": string|null, "window": { "name": string, "start_date"?: string, "end_date"?: string } | null, "entities": string[], "figures": [ { "label": string, "value": number } ] },
  "out_of_scope": boolean
}
Human-facing strings (text, labels, captions, chart titles, action labels) in ${localeName}. \`text\` may contain one inline <b>…</b> around the load-bearing phrase; no other markup.

FACTS
Today: ${localDay(input.now_utc, input.time_zone)} (zone ${input.time_zone}) · locale ${input.locale} · currency ${input.currency} · monthly_income ${input.monthly_income ?? 'unknown'} · transactions loaded ${input.transaction_count} · recurring rules ${input.recurring_rule_count}
DATA OVERVIEW (deterministic — trust it; total_debit/total_credit span everything loaded, this_month_* is the current calendar month):
${JSON.stringify(input.overview)}
${budgetBlock}
${focusBlock}${seedBlock ? `\n${seedBlock}` : ''}`
}

/** Prior turns as chat messages: the user's words, then Murmur's answer with
 *  the figures it computed — this is what makes "what were those?" resolvable. */
export function buildContextMessages(
  turns: AskPriorTurn[],
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const out: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const turn of turns.slice(-MAX_CONTEXT_TURNS)) {
    out.push({ role: 'user', content: turn.question })
    if (!turn.reply) continue
    const parts: string[] = [`ANSWER: ${stripHtml(turn.reply.text)}`]
    const shown = turn.reply.blocks
      .map((bl) => (bl.type === 'transactions' ? `transactions(${bl.rows.length})` : bl.type === 'chart' ? `chart(${bl.chart.data.length})` : bl.type))
      .join(', ')
    if (shown) parts.push(`SHOWN: ${shown}`)
    if (turn.computed && turn.computed.length > 0) {
      parts.push(`COMPUTED: ${JSON.stringify(turn.computed)}`)
    }
    out.push({ role: 'assistant', content: parts.join('\n') })
  }
  return out
}

// ─── Reply validation (shape) ───────────────────────────────────────────────

const VALID_INTENTS: ReadonlySet<AskActionIntent> = new Set([
  'show_transactions',
  'set_budget',
  'open_recurring',
  'log_expense',
  'create_rule',
])
const VALID_INTENT_PARAMS: Record<AskActionIntent, ReadonlySet<string>> = {
  show_transactions: new Set(['category_name', 'merchant', 'query', 'month']),
  set_budget: new Set(['category_name', 'amount']),
  open_recurring: new Set(['name']),
  log_expense: new Set([]),
  create_rule: new Set([]),
}
const MAX_BLOCKS = 4
const MAX_TX_ROWS = 12
const MAX_ROWS = 12
const MAX_STEPS = 8

const asStr = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)

function validateStatRow(raw: unknown): AskMurmurStatRow | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const label = asStr(r.label).trim()
  const value = typeof r.value === 'number' ? String(r.value) : asStr(r.value).trim()
  if (!label || !value) return null
  const row: AskMurmurStatRow = { label, value }
  if (r.accent === true) row.accent = true
  if (r.muted === true) row.muted = true
  return row
}

function validateBlock(raw: unknown): AskBlock | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  switch (r.type) {
    case 'figure': {
      const label = asStr(r.label).trim()
      const value = typeof r.value === 'number' ? String(r.value) : asStr(r.value).trim()
      if (!label || !value) return null
      const sub = asStr(r.sub).trim()
      return { type: 'figure', label, value, ...(sub ? { sub } : {}) }
    }
    case 'rows': {
      const caption = asStr(r.caption).trim()
      const rows = (Array.isArray(r.rows) ? r.rows : []).map(validateStatRow).filter((x): x is AskMurmurStatRow => x !== null).slice(0, MAX_ROWS)
      if (!caption || rows.length === 0) return null
      return { type: 'rows', caption, rows }
    }
    case 'transactions': {
      const caption = asStr(r.caption).trim()
      const rows: Array<{ date: string; merchant: string; amount: string; category?: string }> = []
      for (const row of Array.isArray(r.rows) ? r.rows : []) {
        if (!row || typeof row !== 'object') continue
        const rr = row as Record<string, unknown>
        const date = asStr(rr.date).trim()
        const merchant = asStr(rr.merchant).trim()
        const amount = typeof rr.amount === 'number' ? String(rr.amount) : asStr(rr.amount).trim()
        if (!date || !merchant || !amount) continue
        const category = asStr(rr.category).trim()
        rows.push({ date, merchant, amount, ...(category ? { category } : {}) })
        if (rows.length >= MAX_TX_ROWS) break
      }
      if (!caption || rows.length === 0) return null
      return { type: 'transactions', caption, rows }
    }
    case 'chart': {
      const chart = validateChartShape(r.chart ?? r)
      return chart ? { type: 'chart', chart } : null
    }
    case 'steps': {
      const caption = asStr(r.caption).trim()
      const steps = (Array.isArray(r.steps) ? r.steps : []).map((s) => asStr(s).trim()).filter(Boolean).slice(0, MAX_STEPS)
      if (!caption || steps.length === 0) return null
      return { type: 'steps', caption, steps }
    }
    default:
      return null
  }
}

function validateAction(raw: unknown): AskAction | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const label = asStr(r.label).trim()
  const intent = r.intent
  if (!label || typeof intent !== 'string' || !VALID_INTENTS.has(intent as AskActionIntent)) return null
  const action: AskAction = { label: label.slice(0, 40), intent: intent as AskActionIntent }
  if (r.params && typeof r.params === 'object' && !Array.isArray(r.params)) {
    const allowed = VALID_INTENT_PARAMS[action.intent]
    const params: Record<string, string> = {}
    for (const [k, v] of Object.entries(r.params as Record<string, unknown>)) {
      if (!allowed.has(k)) continue
      if (typeof v === 'string' && v.trim()) params[k] = v.trim().slice(0, 80)
      else if (typeof v === 'number' && Number.isFinite(v)) params[k] = String(v)
    }
    if (Object.keys(params).length > 0) action.params = params
  }
  return action
}

export function validateFocus(raw: unknown): AskFocus | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const subject = typeof r.subject === 'string' && r.subject.trim() ? r.subject.trim().slice(0, 80) : null
  let window: AskFocus['window'] = null
  if (r.window && typeof r.window === 'object') {
    const w = r.window as Record<string, unknown>
    const name = asStr(w.name).trim()
    if (name) {
      window = { name: name.slice(0, 24) }
      if (typeof w.start_date === 'string') window.start_date = w.start_date.slice(0, 10)
      if (typeof w.end_date === 'string') window.end_date = w.end_date.slice(0, 10)
    }
  }
  const entities = (Array.isArray(r.entities) ? r.entities : [])
    .map((e) => asStr(e).trim())
    .filter(Boolean)
    .slice(0, 12)
  const figures: AskFocus['figures'] = []
  for (const f of Array.isArray(r.figures) ? r.figures : []) {
    if (!f || typeof f !== 'object') continue
    const ff = f as Record<string, unknown>
    const label = asStr(ff.label).trim()
    const value = typeof ff.value === 'number' && Number.isFinite(ff.value) ? ff.value : NaN
    if (!label || !Number.isFinite(value)) continue
    figures.push({ label: label.slice(0, 60), value })
    if (figures.length >= 8) break
  }
  if (!subject && !window && entities.length === 0 && figures.length === 0) return null
  return { subject, window, entities, figures }
}

/** Coerces the model's JSON into a renderable `AskReply`. Never throws;
 *  an empty `text` is left empty so the route can retry. */
export function validateAskReply(raw: unknown, transactionCount: number): AskReply {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out_of_scope = obj.out_of_scope === true
  const kind: AskReply['kind'] = obj.kind === 'smalltalk' || obj.kind === 'meta' ? obj.kind : 'money'
  // Accept the legacy key too, in case the model echoes an old example.
  const verdictObj = obj.verdict && typeof obj.verdict === 'object' ? (obj.verdict as Record<string, unknown>) : null
  const text = (asStr(obj.text) || (verdictObj ? asStr(verdictObj.text) : '')).trim()
  const sentimentRaw = obj.sentiment ?? verdictObj?.sentiment
  const sentiment = sentimentRaw === 'positive' || sentimentRaw === 'negative' ? sentimentRaw : 'neutral'
  const blocks = out_of_scope || kind !== 'money'
    ? []
    : (Array.isArray(obj.blocks) ? obj.blocks : []).map(validateBlock).filter((b): b is AskBlock => b !== null).slice(0, MAX_BLOCKS)
  const actions = out_of_scope
    ? []
    : (Array.isArray(obj.actions) ? obj.actions : []).map(validateAction).filter((a): a is AskAction => a !== null).slice(0, 3)
  return {
    kind,
    text,
    sentiment,
    blocks,
    actions,
    focus: validateFocus(obj.focus),
    out_of_scope,
    transaction_count: Math.max(0, Math.round(transactionCount)),
  }
}

// ─── Grounding ──────────────────────────────────────────────────────────────

export interface AskGrounding {
  /** Figures that trace to nothing — the retry reason when non-empty. */
  untraced: string[]
  /** "more A than B" that contradicts a `compare` result. */
  direction_violation: string | null
  /** A small-talk / meta reply that recites figures anyway. */
  recital: string | null
}

function addTrusted(set: Set<number>, v: number) {
  if (!Number.isFinite(v)) return
  set.add(Math.round(v * 100) / 100)
  set.add(Math.round(v))
  set.add(Math.round(Math.abs(v) * 100) / 100)
}

function walkNumbers(v: unknown, into: Set<number>) {
  if (typeof v === 'number') addTrusted(into, v)
  else if (Array.isArray(v)) for (const x of v) walkNumbers(x, into)
  else if (v && typeof v === 'object') for (const x of Object.values(v as Record<string, unknown>)) walkNumbers(x, into)
}

/** Every number the model may quote this turn without it being an
 *  invention: this turn's tool results, earlier turns' computed records and
 *  focus figures, the overview, the budget block, the tapped insight, the
 *  user's message, monthly income. */
export function trustedFigures(input: {
  calls: ToolCallRecord[]
  priorTurns: AskPriorTurn[]
  focus: AskFocus | null
  overview: AskMurmurDataOverview
  budget: AskMurmurBudget | null
  monthlyIncome: number | null
  message: string
  seedInsight: { title: string; detail: string } | null
}): Set<number> {
  const trusted = trustedNumbersFromCalls(input.calls)
  for (const turn of input.priorTurns.slice(-MAX_CONTEXT_TURNS)) {
    if (turn.computed) walkNumbers(turn.computed, trusted)
    if (turn.reply?.focus) walkNumbers(turn.reply.focus.figures, trusted)
  }
  if (input.focus) walkNumbers(input.focus.figures, trusted)
  addTrusted(trusted, input.overview.this_month_debit)
  addTrusted(trusted, input.overview.this_month_credit)
  addTrusted(trusted, input.overview.total_debit)
  addTrusted(trusted, input.overview.total_credit)
  addTrusted(trusted, input.overview.transaction_count)
  if (input.budget) {
    for (const v of [input.budget.amount, input.budget.spent, input.budget.committed, input.budget.remaining, input.budget.days_left]) addTrusted(trusted, v)
  }
  if (input.monthlyIncome != null) addTrusted(trusted, input.monthlyIncome)
  for (const v of [...extractCurrencyValues(input.message), ...extractPercentValues(input.message)]) addTrusted(trusted, v)
  if (input.seedInsight) {
    for (const s of [input.seedInsight.title, input.seedInsight.detail]) {
      for (const v of [...extractCurrencyValues(s), ...extractPercentValues(s)]) addTrusted(trusted, v)
    }
  }
  return trusted
}

export function groundAskReply(reply: AskReply, trusted: Set<number>, calls: ToolCallRecord[]): AskGrounding {
  if (reply.out_of_scope) return { untraced: [], direction_violation: null, recital: null }
  const untraced: string[] = []
  // A small-talk or meta reply must not carry figures at all — the number
  // is not "wrong", it is unasked for (owner screenshots Aug 16: "how are
  // you doing?" answered with spending totals four times).
  const recital =
    reply.kind && reply.kind !== 'money' && (extractCurrencyValues(stripHtml(reply.text)).length > 0 || extractPercentValues(stripHtml(reply.text)).length > 0)
      ? `you marked this reply "${reply.kind}" but it recites figures — the user did not ask about their money; answer as a person, with no amounts`
      : null
  const check = (label: string, text: string) => {
    if (!text) return
    const cleaned = stripHtml(text)
    for (const v of extractCurrencyValues(cleaned)) {
      if (!isTrustedCurrency(v, trusted)) untraced.push(`${label}: ${v}`)
    }
    for (const v of extractPercentValues(cleaned)) {
      if (!isTrustedPercent(v, trusted)) untraced.push(`${label}: ${v}%`)
    }
  }
  check('text', reply.text)
  reply.blocks.forEach((b, i) => {
    switch (b.type) {
      case 'figure':
        check(`blocks[${i}].figure`, `${b.value} ${b.sub ?? ''}`)
        break
      case 'rows':
        b.rows.forEach((r, j) => check(`blocks[${i}].rows[${j}](${r.label})`, r.value))
        break
      case 'transactions':
        b.rows.forEach((r, j) => check(`blocks[${i}].transactions[${j}](${r.merchant})`, r.amount))
        break
      case 'chart':
        b.chart.data.forEach((p, j) => {
          if (!isTrustedCurrency(p.value, trusted) && !isTrustedPercent(p.value, trusted)) untraced.push(`blocks[${i}].chart[${j}](${p.label}): ${p.value}`)
        })
        break
      case 'steps':
        b.steps.forEach((s, j) => check(`blocks[${i}].steps[${j}]`, s))
        break
    }
  })
  const direction_violation = checkComparisonDirection(reply.text, comparisonsFromCalls(calls))
  return { untraced, direction_violation, recital }
}

// ─── Focus + computed records ───────────────────────────────────────────────

/** The focus to persist after a turn: the model's own, filled from the
 *  previous state and this turn's calls where it left gaps. */
export function mergeFocus(prev: AskFocus | null, fromModel: AskFocus | null, calls: ToolCallRecord[]): AskFocus | null {
  const lastWindow = (() => {
    for (let i = calls.length - 1; i >= 0; i--) {
      const c = calls[i]
      if (!c.ok || !c.args || typeof c.args !== 'object') continue
      const a = c.args as Record<string, unknown>
      if (typeof a.window === 'string') {
        const w: NonNullable<AskFocus['window']> = { name: a.window }
        if (typeof a.start_date === 'string') w.start_date = a.start_date
        if (typeof a.end_date === 'string') w.end_date = a.end_date
        return w
      }
    }
    return null
  })()
  const derivedFigures: AskFocus['figures'] = []
  for (const c of calls) {
    if (!c.ok || !c.result || typeof c.result !== 'object') continue
    const r = c.result as Record<string, unknown>
    const a = (c.args ?? {}) as Record<string, unknown>
    if (c.name === 'total' && typeof r.total === 'number') {
      const label = [a.direction === 'credit' ? 'income' : 'spent', a.category_name, a.merchant_contains, a.window].filter(Boolean).join(' ')
      derivedFigures.push({ label, value: r.total })
    } else if (c.name === 'arith' && typeof r.result === 'number') {
      derivedFigures.push({ label: `${String(a.op)}(${String(a.a)}, ${String(a.b)})`, value: r.result })
    } else if (c.name === 'recurring_total' && typeof r.monthly_total === 'number') {
      derivedFigures.push({ label: 'recurring monthly total', value: r.monthly_total })
      if (typeof r.still_due_this_month_total === 'number') derivedFigures.push({ label: 'still due this month', value: r.still_due_this_month_total })
    } else if (c.name === 'list_transactions' && typeof r.total === 'number') {
      derivedFigures.push({ label: `listed ${String(a.window ?? '')} total`, value: r.total })
    }
  }
  const entities = new Set<string>([...(prev?.entities ?? []), ...(fromModel?.entities ?? [])])
  for (const c of calls) {
    const a = (c.args ?? {}) as Record<string, unknown>
    if (typeof a.category_name === 'string') entities.add(a.category_name)
    if (typeof a.merchant_contains === 'string') entities.add(a.merchant_contains)
  }
  const merged: AskFocus = {
    subject: fromModel?.subject ?? prev?.subject ?? null,
    window: fromModel?.window ?? lastWindow ?? prev?.window ?? null,
    entities: Array.from(entities).slice(-12),
    figures: (fromModel?.figures?.length ? fromModel.figures : derivedFigures).slice(0, 8),
  }
  if (!merged.subject && !merged.window && merged.entities.length === 0 && merged.figures.length === 0) return null
  return merged
}

/** Compact tool records for persistence + next-turn context, capped at
 *  `MAX_COMPUTED_CHARS` serialized. Errored calls are dropped; large
 *  results are trimmed (transactions → ≤ 12 rows, rules → names only). */
export function compactComputed(calls: ToolCallRecord[]): AskComputedRecord[] {
  const records: AskComputedRecord[] = []
  for (const c of calls) {
    if (!c.ok) continue
    const args = c.args && typeof c.args === 'object' ? (c.args as Record<string, unknown>) : {}
    let result: unknown = c.result
    if (c.name === 'list_transactions' && result && typeof result === 'object') {
      const r = result as { transactions?: unknown[]; count?: number; total?: number; truncated?: boolean }
      result = { transactions: (r.transactions ?? []).slice(0, 12), count: r.count, total: r.total, truncated: r.truncated }
    } else if (c.name === 'recurring_total' && result && typeof result === 'object') {
      const r = result as Record<string, unknown>
      result = {
        monthly_total: r.monthly_total,
        annual_total: r.annual_total,
        still_due_this_month_total: r.still_due_this_month_total,
        still_due_this_month: r.still_due_this_month,
        upcoming: r.upcoming,
        rules: Array.isArray(r.rules) ? (r.rules as Array<Record<string, unknown>>).slice(0, 12).map((x) => ({ name: x.name, monthly_amount: x.monthly_amount, charged_this_month: x.charged_this_month })) : [],
      }
    } else if (c.name === 'series' && result && typeof result === 'object') {
      const r = result as { points?: unknown[] }
      result = { points: (r.points ?? []).slice(0, 14) }
    } else if ((c.name === 'top_merchants' || c.name === 'sum_by_category') && result && typeof result === 'object') {
      const r = result as Record<string, unknown[]>
      const key = c.name === 'top_merchants' ? 'merchants' : 'categories'
      result = { [key]: (r[key] ?? []).slice(0, 10) }
    }
    records.push({ tool: c.name, args, result })
  }
  // Trim from the largest until under budget.
  const size = () => JSON.stringify(records).length
  while (records.length > 0 && size() > MAX_COMPUTED_CHARS) {
    let biggest = 0
    for (let i = 1; i < records.length; i++) {
      if (JSON.stringify(records[i]).length > JSON.stringify(records[biggest]).length) biggest = i
    }
    const b = records[biggest]
    if (b.result && typeof b.result === 'object' && !(b.result as { truncated_context?: boolean }).truncated_context) {
      records[biggest] = { ...b, result: summarizeResult(b.result) }
    } else {
      records.splice(biggest, 1)
    }
  }
  return records
}

function summarizeResult(result: unknown): unknown {
  if (!result || typeof result !== 'object') return result
  const r = result as Record<string, unknown>
  const out: Record<string, unknown> = { truncated_context: true }
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') out[k] = v
    else if (Array.isArray(v)) out[k] = v.slice(0, 4)
  }
  return out
}

/** Legacy stored rows carry `AskMurmurResponse`; the context builder only
 *  needs the text — the route converts via `replyFromStored`. */
export type { AskMurmurChart }
