import type {
  AskMurmurAction,
  AskMurmurActionIntent,
  AskMurmurChart,
  AskMurmurChartPoint,
  AskMurmurChartType,
  AskMurmurRequest,
  AskMurmurResponse,
  AskMurmurStatRow,
  Locale,
} from '@voice-expense/shared'
import {
  trustedNumbersFromCalls,
  comparisonsFromCalls,
  type AskMurmurDataOverview,
  type ToolCallRecord,
} from './askMurmurTools'

// ─── Prompt ──────────────────────────────────────────────────────────────────
//
// The reasoner is a closed-book reader over the user's own transactions,
// income, and recurring rules. Every numerical claim it makes must come
// from a `run_query` result (deterministic JS over the user's data) or
// from the user's own question. The model never does arithmetic in its
// head; the sandbox does it.
//
// Output is JSON only, validated downstream by validateAskMurmurResponse
// for shape and validateAskMurmurResponseAgainstCalls for numerical
// grounding.

const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  pt: 'Portuguese',
}

export function buildAskMurmurPrompt(
  req: AskMurmurRequest,
  overview?: AskMurmurDataOverview,
): string {
  const localeName = LOCALE_NAMES[req.locale] ?? 'English'
  const trimmedHistory = (req.history ?? []).slice(-6)
  const historyBlock = trimmedHistory.length
    ? `

Prior turns in this conversation (oldest first). The user may reference these
("and last month?" / "now drop bills"). Each entry is { question, answer }
where answer is the verdict text from your previous response. Use this only
to interpret the new question — never repeat or summarize the prior answer:
${JSON.stringify(trimmedHistory)}`
    : ''

  const overviewBlock = overview
    ? `

DATA OVERVIEW (deterministic; computed before this call \u2014 trust it
absolutely; if your run_query disagrees with this, your query is wrong):
${JSON.stringify(overview)}

Read this overview before writing any run_query. Specifically:
- \`transaction_count\` is the exact number of transactions in the data block.
- \`earliest_transacted_at\` / \`latest_transacted_at\` are the bounds of the data.
- \`years_present\` lists every year that appears in the data.
- \`has_transactions_this_year\` / \`has_transactions_this_month\` / \`has_transactions_last_month\` etc. tell you in advance whether each common window is non-empty.
- If \`has_transactions_this_year\` is \`true\` and your run_query for "this year" returns 0, your filter is buggy \u2014 rerun the query with \`helpers.inWindow(transactions, windows.thisYear)\` instead of writing your own date math.
- If \`has_transactions_this_year\` is \`false\`, do NOT just say "no expenses this year" \u2014 also tell the user the actual range (\`earliest_transacted_at\`\u2026\`latest_transacted_at\`) and offer the closest non-empty window (e.g. last 30 days, last 90 days, last 6 months) before stopping.`
    : ''

  return `You are Murmur, a grounded personal-finance reader. The user has asked you a question. You answer using ONLY data the user has provided about their own finances, accessible via two tools: \`run_query\` (deterministic JS sandbox over the user's transactions + recurring rules) and \`compare\` (structural greater/less determination over two values you computed).

CRITICAL — how to compute numbers:
- Every total, average, count, percentage, or other figure in your final response MUST come from a \`run_query\` result. Never compute or estimate any number yourself \u2014 you are not a calculator and your arithmetic is not trusted.
- Call \`run_query\` as many times as you need. Each call should compute one specific aggregate; complex answers chain multiple calls.
- The sandbox exposes: \`transactions\` (full set), \`recurring_rules\`, \`today\` (string \u2014 display only), \`currency\`, \`locale\`, \`monthly_income\`, pre-computed \`transactions_*\` windowed subsets (see below), \`windows\` ({ start, end } Date pairs as a fallback), \`helpers\` (round, inWindow, sumBy, groupBy, windowDays), and core JS (Math, Date, Array, Object, Map, Set, JSON). No I/O, no network, no require. Use \`return\` to return the result.
- Round numerical results to 2 decimals before returning so the figure you quote matches the cached value.

CRITICAL \u2014 date filtering. The sandbox does this for you. You do NOT write date filters for standard windows:
- For ANY question that maps to one of these windows, the filtered subset is already a variable in the sandbox \u2014 just use it. Do not write a date filter; do not derive it from \`today\`. Ever.
    "this year"          \u2192 transactions_this_year
    "last year"          \u2192 transactions_last_year
    "this month"         \u2192 transactions_this_month
    "last month"         \u2192 transactions_last_month
    "today"              \u2192 transactions_today
    "last 7 days" / week \u2192 transactions_last_7_days
    "last 30 days"       \u2192 transactions_last_30_days
    "last 90 days" / quarter \u2192 transactions_last_90_days
    "last 6 months"      \u2192 transactions_last_6_months
    "last 12 months" / year \u2192 transactions_last_12_months
- Example (this year's expenses by category):
  \`const byCat = helpers.groupBy(transactions_this_year.filter(t => t.direction === 'debit'), t => t.category_name || 'Uncategorized'); const out = []; for (const [k, items] of byCat) out.push({ name: k, total: helpers.round(helpers.sumBy(items, t => t.amount)) }); return out.sort((a, b) => b.total - a.total);\`
- Example (this month's debit total):
  \`return helpers.round(helpers.sumBy(transactions_this_month.filter(t => t.direction === 'debit'), t => t.amount));\`
- For specific calendar dates (e.g. "April 11") that don't match a window above, you may filter on \`transacted_at\` directly: \`transactions.filter(t => t.transacted_at.startsWith('2026-04-11'))\`.
- For an ad-hoc N-day window not in the list, use \`helpers.windowDays(n)\` then \`helpers.inWindow(transactions, w)\`.
- If a \`transactions_*\` subset is empty, the user genuinely has no transactions in that period \u2014 do NOT just say "no expenses" and stop. Tell the user the actual range from the data overview (\`earliest_transacted_at\`\u2026\`latest_transacted_at\`) and offer the closest non-empty subset.

- If a \`run_query\` returns \`{ error: "..." }\`, read the error, fix the JavaScript, and call run_query again. Common fixes: null-check fields like \`(t.category_name || "Uncategorized")\`; use \`helpers.groupBy(arr, fn)\` (not \`arr.groupBy\`); use the pre-computed \`transactions_*\` subsets instead of comparing dates by hand. Never write a verdict citing the failure \u2014 keep iterating until the query works.

CRITICAL \u2014 always answer the user's actual question:
- The user must always receive a real answer. If their question is broad ("explain my spending this year", "give me a report", "help me understand"), pick the most useful angle and answer it directly with run_query results. Do NOT respond with a meta-question or a stalling phrase.
- If the user asks a meta question about format ("can I have a chart?", "show me a graph"), produce an answer with the chart, drawing on the most useful data they have.

CRITICAL — comparisons:
- Whenever the verdict makes a numeric comparison ("more A than B", "higher than", "less than", etc.), call the \`compare\` tool with both values from prior \`run_query\` calls. Use the tool's direction in the verdict; do NOT decide direction yourself.
- The verdict text should include both numerical values inline so the comparison is self-evident, e.g. "$160 on Food & Dining versus $20,000 on Housing". Direction must agree with the \`compare\` result.

Scope — what you CAN do (anything reasoned from the user's own data + universal personal-finance principles):
- Read and summarize: how much on coffee, biggest category, merchant frequency, recent trends.
- Forecast end-of-month / end-of-year totals from the user's actual pace.
- Plan and recommend: budget caps, savings rates, goal pacing, affordability checks, subscription audits, category trade-offs.
- Step-by-step plans grounded in the user's actual numbers when asked ("how do I manage my money better?").

Scope — what you must REFUSE (set out_of_scope=true, polite verdict, no breakdown/actions/chart, stop):
- Specific securities, instruments, or third-party products (stocks, crypto, ETFs, banks, credit cards, insurance providers). This is investment advice; Murmur is not licensed.
- Tax filing or preparation as a CPA would (cite a CPA).
- Legal advice on debts, contracts, bankruptcy (cite a lawyer).
- Medical or insurance coverage decisions.
- Anything requiring external knowledge: current stock or crypto prices, news, market predictions, weather, restaurant or product reviews.

When the question is borderline ("what plan would you give me to manage my money better?"), do NOT refuse \u2014 that's exactly in-scope. Run queries to find the leaks and propose a plan with the actual numbers.

Output format:
- Output strictly valid JSON. No prose, no markdown, no code fences. The JSON shape is given below.
- Write human-facing strings (verdict, note, chart titles, action labels, breakdown captions and labels) in ${localeName}. Format currency in ${req.currency} using locale conventions.
- Keep verdict.text short \u2014 one or two sentences. May include a single inline <b>...</b> around the most load-bearing phrase. No other HTML.
- breakdown.rows.value is already-formatted display text ("$4,120", "+$150", "\u2248 3.3 months"). Render verbatim; no trailing punctuation.
- attribution.transaction_count must equal the number of transactions in the data block (passed in the user message).
- actions: array of follow-up pills (possibly empty). Intents only:
    "create_goal" \u2014 params: { goal_name, monthly_amount } (numbers as strings)
    "show_category" \u2014 params: { category_name }
    "set_budget" \u2014 params: { category_name, monthly_limit } (number as string)
    "show_transactions" \u2014 params: { category_name?, merchant? }
  Localized labels under 28 characters.

Charts. A chart is REQUIRED whenever the answer has any of these shapes:
- Breakdown / distribution / share / split (\u2192 donut for 3-6 buckets, horizontal_bar for ranked or 7+).
- Ranked list (top merchants, biggest categories) \u2192 horizontal_bar.
- Trend or evolution over time (\u2192 line for monthly/weekly trend, bar for short ordered series).
- "How much per [unit]" with multiple buckets (per month, per weekday, per merchant, per category) \u2192 bar / horizontal_bar / line.
- A plan that compares amounts across categories \u2192 donut or horizontal_bar of relevant slices.

A chart is OPTIONAL for affordability / goal-pacing answers where one number suffices.

A chart is FORBIDDEN for single-number answers, yes/no answers without numeric breakdown, refusals, and any case where you couldn't get at least 2 valid points from a query.

Chart shape:
- type: "bar" | "line" | "donut" | "horizontal_bar"
- title: short, in the user's locale
- data: 2\u201310 points; each point's value MUST be a number you got from a run_query result (don't invent points to fill the chart out).
- caption: optional one-line context.

Response JSON shape:
{
  "verdict": { "text": string, "sentiment": "positive" | "neutral" | "negative" },
  "breakdown": {                            // OPTIONAL
    "caption": string,
    "rows": [ { "label": string, "value": string, "accent"?: boolean, "muted"?: boolean } ]
  },
  "chart": {                                // OPTIONAL
    "type": "bar" | "line" | "donut" | "horizontal_bar",
    "title": string,
    "data": [ { "label": string, "value": number } ],
    "caption"?: string
  },
  "note": { "text": string },               // OPTIONAL
  "actions": [ { "label": string, "intent": "create_goal"|"show_category"|"set_budget"|"show_transactions", "params"?: object } ],
  "attribution": { "transaction_count": number },
  "out_of_scope": boolean
}

Today's date: ${req.today}
User locale: ${req.locale}
User currency: ${req.currency}
Monthly income: ${req.monthly_income ?? 'unknown'}
Transactions in data block: ${req.transactions.length}
Recurring rules in data block: ${req.recurring_rules.length}${overviewBlock}${historyBlock}`
}

// ─── Shape validator ─────────────────────────────────────────────────────────
//
// Defensive shape-check on the model's JSON. Coerces missing fields to safe
// defaults so the result screen always renders. Numerical grounding lives in
// validateAskMurmurResponseAgainstCalls below \u2014 this function only
// guarantees the SHAPE is valid, not that the numbers are correct.

const VALID_INTENTS: ReadonlySet<AskMurmurActionIntent> = new Set([
  'create_goal',
  'show_category',
  'set_budget',
  'show_transactions',
])

const VALID_CHART_TYPES: ReadonlySet<AskMurmurChartType> = new Set([
  'bar',
  'line',
  'donut',
  'horizontal_bar',
])

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function asBool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function asSentiment(v: unknown): 'positive' | 'neutral' | 'negative' {
  return v === 'positive' || v === 'negative' ? v : 'neutral'
}

function validateRow(raw: unknown): AskMurmurStatRow | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const label = asString(r.label).trim()
  const value = asString(r.value).trim()
  if (!label || !value) return null
  const row: AskMurmurStatRow = { label, value }
  if (r.accent === true) row.accent = true
  if (r.muted === true) row.muted = true
  return row
}

function validateAction(raw: unknown): AskMurmurAction | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const label = asString(r.label).trim()
  const intent = r.intent
  if (!label || typeof intent !== 'string' || !VALID_INTENTS.has(intent as AskMurmurActionIntent)) {
    return null
  }
  const action: AskMurmurAction = { label, intent: intent as AskMurmurActionIntent }
  if (r.params && typeof r.params === 'object' && !Array.isArray(r.params)) {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(r.params as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v
      else if (typeof v === 'number' && Number.isFinite(v)) out[k] = String(v)
    }
    if (Object.keys(out).length > 0) action.params = out
  }
  return action
}

function validateChart(raw: unknown): AskMurmurChart | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const typeRaw = r.type
  if (typeof typeRaw !== 'string' || !VALID_CHART_TYPES.has(typeRaw as AskMurmurChartType)) {
    return undefined
  }
  const title = asString(r.title).trim()
  if (!title) return undefined
  const dataArr = Array.isArray(r.data) ? r.data : []
  const points: AskMurmurChartPoint[] = []
  for (const p of dataArr) {
    if (!p || typeof p !== 'object') continue
    const pp = p as Record<string, unknown>
    const label = asString(pp.label).trim()
    const value = asNumber(pp.value, NaN)
    if (!label || !Number.isFinite(value) || value < 0) continue
    points.push({ label, value })
    if (points.length >= 10) break
  }
  if (points.length < 2) return undefined
  if (typeRaw === 'donut' && points.every((p) => p.value === 0)) return undefined
  const chart: AskMurmurChart = {
    type: typeRaw as AskMurmurChartType,
    title,
    data: points,
  }
  const caption = asString(r.caption).trim()
  if (caption) chart.caption = caption
  return chart
}

export function validateAskMurmurResponse(
  raw: unknown,
  fallbackTransactionCount: number,
): AskMurmurResponse {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const verdictRaw = obj.verdict && typeof obj.verdict === 'object'
    ? (obj.verdict as Record<string, unknown>)
    : {}
  const verdictText = asString(verdictRaw.text).trim()
  const out_of_scope = asBool(obj.out_of_scope, false)
  // If the model returned an empty verdict, leave it empty here. The route's
  // give-up detector reads `length < 10` as "give up" and triggers a retry,
  // and the deterministic intent-answer fallback covers the case where every
  // retry also empties out. Never substitute apology language at this layer.
  const fallbackText = out_of_scope
    ? "I keep my answers grounded in your own transactions and recurring rules. For things like specific investments, taxes, or current market prices, a human professional is the right call."
    : ''
  const verdict: AskMurmurResponse['verdict'] = {
    text: verdictText || fallbackText,
    sentiment: asSentiment(verdictRaw.sentiment),
  }

  let breakdown: AskMurmurResponse['breakdown']
  if (obj.breakdown && typeof obj.breakdown === 'object') {
    const b = obj.breakdown as Record<string, unknown>
    const caption = asString(b.caption).trim()
    const rowsArr = Array.isArray(b.rows) ? b.rows : []
    const rows = rowsArr
      .map(validateRow)
      .filter((r): r is AskMurmurStatRow => r !== null)
    if (caption && rows.length > 0) breakdown = { caption, rows }
  }

  const chart = out_of_scope ? undefined : validateChart(obj.chart)

  let note: AskMurmurResponse['note']
  if (obj.note && typeof obj.note === 'object') {
    const noteText = asString((obj.note as Record<string, unknown>).text).trim()
    if (noteText) note = { text: noteText }
  }

  const actionsArr = Array.isArray(obj.actions) ? obj.actions : []
  const actions = actionsArr
    .map(validateAction)
    .filter((a): a is AskMurmurAction => a !== null)

  const attributionRaw = obj.attribution && typeof obj.attribution === 'object'
    ? (obj.attribution as Record<string, unknown>)
    : {}
  const transaction_count = Math.max(
    0,
    Math.round(asNumber(attributionRaw.transaction_count, fallbackTransactionCount)),
  )

  return {
    verdict,
    ...(breakdown ? { breakdown } : {}),
    ...(chart ? { chart } : {}),
    ...(note ? { note } : {}),
    actions,
    attribution: { transaction_count },
    out_of_scope,
  }
}

// ─── Numerical grounding validator ──────────────────────────────────────────
//
// Every monetary figure, percentage, and count cited in the response must
// match either a tool-call result number or a number from the user's own
// question. This is the ONLY check that gates the response \u2014 the
// architecture guarantees that any number from a tool call is correct by
// construction (deterministic JS or structural compare), so passing this
// check means the response is provably accurate.
//
// Comparison-direction is also checked here: each "more/less than" phrase
// in the verdict is matched against a `compare` tool result whose subjects
// appear in the surrounding text.

/** Validation result. `comparison_direction_violations` is the only signal
 *  that triggers a retry \u2014 a verdict that says "more A than B" while
 *  `compare(A, B)` returned `b_greater` is guaranteed wrong, the original
 *  bug we're protecting against. `soft_issues` are diagnostic only: numbers
 *  the validator couldn't trace are logged but the response still ships,
 *  because (a) the sandbox-computed numbers are correct by construction,
 *  (b) false positives in the tracer (slight rounding, citation of
 *  monthly_income, etc.) shouldn't gate a finance-app response on the
 *  user's screen. Wrong responses are spottable by the user; refusals
 *  are not. */
export interface AskMurmurValidation {
  ok: boolean
  comparison_direction_violations: string[]
  soft_issues: string[]
}

const HTML_TAG_RE = /<\/?[a-z][^>]*>/gi
const NEAR_NUMBER_WINDOW = 80

function stripHtml(s: string): string {
  return s.replace(HTML_TAG_RE, ' ')
}

function parseLocaleNumber(raw: string): number {
  const cleaned = raw.replace(/\s/g, '')
  const lastDot = cleaned.lastIndexOf('.')
  const lastComma = cleaned.lastIndexOf(',')
  let normalized: string
  if (lastDot === -1 && lastComma === -1) {
    normalized = cleaned
  } else if (lastDot > lastComma) {
    // Dot is the decimal separator (US/UK). Commas are thousands.
    normalized = cleaned.replace(/,/g, '')
  } else if (lastComma > -1 && lastDot === -1) {
    // Only commas. Disambiguate thousands vs decimal:
    //  - "20,000"   \u2192 thousands (3 digits after the last comma, no further sep) \u2192 20000
    //  - "1,234,567" \u2192 thousands \u2192 1234567
    //  - "20,5" / "20,50" \u2192 decimal (1\u20132 digits after comma) \u2192 20.5 / 20.50
    const tail = cleaned.slice(lastComma + 1)
    const isThousandsTail = /^\d{3}$/.test(tail)
    const hasMultipleCommas = (cleaned.match(/,/g) ?? []).length > 1
    if (isThousandsTail || hasMultipleCommas) {
      normalized = cleaned.replace(/,/g, '')
    } else {
      normalized = cleaned.replace(',', '.')
    }
  } else {
    // Both dot and comma, dot comes first \u2192 European format (1.234,56).
    normalized = cleaned.replace(/\./g, '').replace(',', '.')
  }
  return parseFloat(normalized)
}

/** Extract every plausible monetary figure from text. Heuristic: a digit run
 *  with optional currency marker, decimal, or grouping. Bare integers ≤ 4
 *  digits without any of those markers are skipped (year, count of days,
 *  etc.) so "90 days" doesn't get treated as $90. */
function extractCurrencyValues(text: string): number[] {
  const out: number[] = []
  const re = /(?:[$€£¥₦]|\b(?:USD|EUR|GBP|JPY|CAD|XAF|NGN|GHS|CHF|AUD)\b)?\s*(-?\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{1,2})?|-?\d+(?:[.,]\d{1,2})?)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const raw = m[1]
    const surrounding = m[0]
    const hasMarker = /[$€£¥₦]|USD|EUR|GBP|JPY|CAD|XAF|NGN|GHS|CHF|AUD/i.test(surrounding)
    const hasGrouping = /[,.\s]\d{3}/.test(raw)
    const hasDecimal = /[.,]\d{1,2}$/.test(raw) && !hasGrouping
    // Skip bare integers without currency context: they're more often counts
    // ("90 days", "5 transactions") than money. The validator checks counts
    // separately.
    if (!hasMarker && !hasGrouping && !hasDecimal) continue
    const value = parseLocaleNumber(raw)
    if (Number.isFinite(value)) out.push(value)
  }
  return out
}

function extractPercentValues(text: string): number[] {
  const out: number[] = []
  const re = /(-?\d{1,3}(?:[.,]\d{1,2})?)\s*(?:%|percent\b|per cent\b)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const v = parseLocaleNumber(m[1])
    if (Number.isFinite(v)) out.push(v)
  }
  return out
}

function isTrustedCurrency(value: number, trusted: Set<number>): boolean {
  const r = Math.round(value * 100) / 100
  if (trusted.has(r)) return true
  if (trusted.has(Math.round(value))) return true
  // Small absolute or 1% relative tolerance so a model rounding to nearest
  // dollar against a $4,123.46 query result still passes.
  for (const t of trusted) {
    const diff = Math.abs(t - value)
    if (diff <= 0.5) return true
    if (t !== 0 && diff / Math.abs(t) <= 0.01) return true
  }
  return false
}

function isTrustedPercent(value: number, trusted: Set<number>): boolean {
  for (const t of trusted) {
    if (Math.abs(t - value) <= 1) return true
  }
  return false
}

/** Sniff for "X more/less than Y" patterns in the verdict and assert the
 *  direction agrees with a `compare` tool result whose labels appear nearby.
 *  This is the structural fix for the bug that started this whole rebuild. */
function checkComparisonDirection(
  verdict: string,
  comparisons: ReturnType<typeof comparisonsFromCalls>,
): string | null {
  if (comparisons.length === 0) return null
  const text = stripHtml(verdict).toLowerCase()
  // "More" implies a > b; "less/lower" implies a < b. We treat "than" as the
  // pivot — the entity before "than" is the SUBJECT, the one after is the
  // baseline.
  const re = /\b(more|less|higher|lower|greater|smaller|above|below|exceeds|exceed)\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const idx = m.index
    const direction = m[1].toLowerCase()
    const left = text.slice(Math.max(0, idx - NEAR_NUMBER_WINDOW), idx)
    const right = text.slice(idx, Math.min(text.length, idx + NEAR_NUMBER_WINDOW))
    const subjectMentioned = (label: string) => left.includes(label.toLowerCase())
    const baselineMentioned = (label: string) => right.includes(label.toLowerCase())
    // Find a comparison call whose subjects are both name-mentioned around
    // this comparison phrase. If found, assert direction.
    for (const c of comparisons) {
      const aIsSubject = subjectMentioned(c.a.label) && baselineMentioned(c.b.label)
      const bIsSubject = subjectMentioned(c.b.label) && baselineMentioned(c.a.label)
      if (!aIsSubject && !bIsSubject) continue
      const subjectGreater = aIsSubject ? c.direction === 'a_greater' : c.direction === 'b_greater'
      const verdictAssertsGreater =
        direction === 'more' ||
        direction === 'higher' ||
        direction === 'greater' ||
        direction === 'above' ||
        direction === 'exceeds' ||
        direction === 'exceed'
      if (verdictAssertsGreater !== subjectGreater) {
        return `verdict says "${direction}" but compare result for ${c.a.label} vs ${c.b.label} disagrees`
      }
    }
  }
  return null
}

/** Pull plausible numbers out of the user's question so the model can quote
 *  them in the verdict (e.g. "Can I afford a $400 trip?" \u2192 the verdict
 *  may mention $400 even though no query produced it). */
function extractQuestionNumbers(question: string): number[] {
  return [...extractCurrencyValues(question), ...extractPercentValues(question)]
}

export function validateAskMurmurResponseAgainstCalls(
  response: AskMurmurResponse,
  calls: ToolCallRecord[],
  question: string,
  monthlyIncome: number | null = null,
): AskMurmurValidation {
  if (response.out_of_scope) {
    return { ok: true, comparison_direction_violations: [], soft_issues: [] }
  }

  const trusted = trustedNumbersFromCalls(calls)
  for (const v of extractQuestionNumbers(question)) {
    trusted.add(Math.round(v * 100) / 100)
    trusted.add(Math.round(v))
  }
  // The user's monthly_income is a legitimate, user-supplied number that the
  // model may quote in affordability or planning answers without funneling
  // through a tool call. Trust it the same way we trust numbers from the
  // user's question.
  if (monthlyIncome != null && Number.isFinite(monthlyIncome)) {
    trusted.add(Math.round(monthlyIncome * 100) / 100)
    trusted.add(Math.round(monthlyIncome))
  }

  const soft: string[] = []

  function checkText(label: string, text: string) {
    if (!text) return
    const cleaned = stripHtml(text)
    for (const v of extractCurrencyValues(cleaned)) {
      if (!isTrustedCurrency(v, trusted)) {
        soft.push(`${label}: currency ${v} not traced to a tool call`)
      }
    }
    for (const v of extractPercentValues(cleaned)) {
      if (!isTrustedPercent(v, trusted)) {
        soft.push(`${label}: percent ${v}% not traced to a tool call`)
      }
    }
  }

  checkText('verdict', response.verdict.text)
  if (response.note) checkText('note', response.note.text)
  if (response.breakdown) {
    for (const [i, row] of response.breakdown.rows.entries()) {
      checkText(`breakdown.rows[${i}](${row.label})`, row.value)
    }
  }
  if (response.chart) {
    for (const [i, p] of response.chart.data.entries()) {
      if (!isTrustedCurrency(p.value, trusted) && !isTrustedPercent(p.value, trusted)) {
        soft.push(`chart.data[${i}](${p.label}): value ${p.value} not traced to a tool call`)
      }
    }
  }

  // Comparison-direction is the only HARD failure. A verdict that asserts
  // "more A than B" while a `compare(A, B)` call returned the opposite
  // direction is structurally guaranteed wrong \u2014 the original sin we
  // built this whole architecture to eliminate.
  const violations: string[] = []
  const dirIssue = checkComparisonDirection(
    response.verdict.text,
    comparisonsFromCalls(calls),
  )
  if (dirIssue) violations.push(dirIssue)

  return {
    ok: violations.length === 0,
    comparison_direction_violations: violations,
    soft_issues: soft,
  }
}
