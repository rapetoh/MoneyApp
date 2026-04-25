import type {
  AskMurmurAction,
  AskMurmurActionIntent,
  AskMurmurRequest,
  AskMurmurResponse,
  AskMurmurStatRow,
  Locale,
} from '@voice-expense/shared'

// ─── Prompt ──────────────────────────────────────────────────────────────────
//
// The reasoner is a closed-book reader over the user's own transactions, income,
// and recurring rules. Every assertion in the answer must trace back to the
// data block we provide. Anything else — stock prices, current events, generic
// advice — is refused with `out_of_scope: true`.
//
// Output is JSON only, validated downstream by validateAskMurmurResponse.

const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  pt: 'Portuguese',
}

export function buildAskMurmurPrompt(req: AskMurmurRequest): string {
  const localeName = LOCALE_NAMES[req.locale] ?? 'English'

  return `You are Murmur, a grounded personal-finance reader. The user has asked you a question. You answer using ONLY the JSON data block at the end of this prompt — the user's own transactions, income, and recurring rules. You do not have, and must not invent, any other information.

Hard rules:
- Output strictly valid JSON. No prose, no markdown, no code fences. The JSON shape is given below.
- Write the human-facing strings (verdict, note, action labels, caption, row labels) in ${localeName}. Format currency in ${req.currency} using the locale's conventions.
- If the question requires information NOT in the data block — current stock prices, today's news, market predictions, real-world events outside the user's transactions, generic financial advice — set out_of_scope to true, write a short polite refusal in the verdict text explaining you only answer from the user's own data, leave breakdown and actions empty, and stop.
- Never recommend specific investments, stocks, or any third-party financial product. You may suggest savings rates, budget caps, or category trade-offs derived purely from the user's spending pattern.
- Do not fabricate transactions or numbers. Every figure in the breakdown must be computable from the data block. If you can't compute it, omit the row.
- Keep verdict.text short — one or two sentences. May include a single inline <b>...</b> around the most load-bearing phrase the verdict hinges on. Do not use any other HTML.
- breakdown.rows.value is already-formatted display text (e.g. "$4,120", "+$150", "≈ 3.3 months"). The client renders it verbatim — do NOT include trailing punctuation.
- attribution.transaction_count must equal the number of transactions in the data block.
- actions is an array (possibly empty) of follow-up pills the user can tap. Use these intents only:
    "create_goal" — params: { goal_name, monthly_amount } (numbers as strings, no currency symbol)
    "show_category" — params: { category_name }
    "set_budget" — params: { category_name, monthly_limit } (number as string)
    "show_transactions" — params: { category_name? , merchant? }
  Action labels are localized. Keep them under 28 characters.

Response JSON shape (every key required unless marked optional):
{
  "verdict": { "text": string, "sentiment": "positive" | "neutral" | "negative" },
  "breakdown": {                          // OPTIONAL; omit when out_of_scope is true or no numeric story
    "caption": string,                    // eyebrow text, e.g. "From your last 3 months"
    "rows": [
      { "label": string, "value": string, "accent": boolean (optional), "muted": boolean (optional) }
    ]
  },
  "note": { "text": string },             // OPTIONAL; one-sentence accent paragraph
  "actions": [
    { "label": string, "intent": "create_goal"|"show_category"|"set_budget"|"show_transactions", "params": object (optional) }
  ],
  "attribution": { "transaction_count": number },
  "out_of_scope": boolean
}

Today's date: ${req.today}
User locale: ${req.locale}
User currency: ${req.currency}
Monthly income: ${req.monthly_income ?? 'unknown'}

Recurring rules (the user's known fixed obligations or income):
${JSON.stringify(req.recurring_rules)}

Transactions (most recent ${req.transactions.length}, last 90 days, oldest first; amount is positive, direction tells you spend vs. income):
${JSON.stringify(req.transactions)}

User question: ${req.question}`
}

// ─── Validator ───────────────────────────────────────────────────────────────
//
// Defensive shape-check. The model is asked to return strict JSON, but we never
// trust that outright — a malformed reply must still render cleanly so the
// result screen can show *something* rather than crash. Missing fields fall back
// to safe defaults; structurally broken rows / actions are dropped.

const VALID_INTENTS: ReadonlySet<AskMurmurActionIntent> = new Set([
  'create_goal',
  'show_category',
  'set_budget',
  'show_transactions',
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

/** Coerce a raw model reply into an AskMurmurResponse. Never throws — a
 *  totally broken reply degrades to a generic out-of-scope refusal so the
 *  result screen renders safely. */
export function validateAskMurmurResponse(
  raw: unknown,
  fallbackTransactionCount: number,
): AskMurmurResponse {
  const obj = (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {})

  const verdictRaw = (obj.verdict && typeof obj.verdict === 'object'
    ? (obj.verdict as Record<string, unknown>)
    : {})
  const verdictText = asString(verdictRaw.text).trim()

  const out_of_scope = asBool(obj.out_of_scope, false)
  const fallbackText = out_of_scope
    ? "I can only answer from your own transactions, and that's outside what I can see."
    : "I couldn't compute an answer from your transactions just now."

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
    if (caption && rows.length > 0) {
      breakdown = { caption, rows }
    }
  }

  let note: AskMurmurResponse['note']
  if (obj.note && typeof obj.note === 'object') {
    const noteText = asString((obj.note as Record<string, unknown>).text).trim()
    if (noteText) note = { text: noteText }
  }

  const actionsArr = Array.isArray(obj.actions) ? obj.actions : []
  const actions = actionsArr
    .map(validateAction)
    .filter((a): a is AskMurmurAction => a !== null)

  const attributionRaw = (obj.attribution && typeof obj.attribution === 'object'
    ? (obj.attribution as Record<string, unknown>)
    : {})
  const transaction_count = Math.max(
    0,
    Math.round(asNumber(attributionRaw.transaction_count, fallbackTransactionCount)),
  )

  return {
    verdict,
    ...(breakdown ? { breakdown } : {}),
    ...(note ? { note } : {}),
    actions,
    attribution: { transaction_count },
    out_of_scope,
  }
}
