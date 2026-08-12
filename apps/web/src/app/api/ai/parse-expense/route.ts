import OpenAI from 'openai'
import { validateToken } from '../../../../lib/auth'
import { getPrompt, validateParsedExpense, isParseRejection, PARSED_EXPENSE_JSON_SCHEMA } from '@voice-expense/ai'
import type { Locale } from '@voice-expense/shared'
import type { NextRequest } from 'next/server'
import { createJsonCompletionWithRetry } from '../../../../lib/aiCompletion'
import { checkRateLimit } from '../../../../lib/rateLimit'
import { contentLengthExceeds, isSupportedCurrency, isSupportedLocale, MAX_TRANSCRIPT_LENGTH } from '../../../../lib/parseGuards'
import { getOpenAIEnv } from '../../../../lib/env'

const openai = new OpenAI({ apiKey: getOpenAIEnv().OPENAI_API_KEY })
// A dated snapshot, not the floating `gpt-4o-mini` alias — fix-plan item
// 1.7 part 3: "pin the model to an explicit version" so the same sentence
// can't start classifying differently the day OpenAI moves the alias.
// Still overridable per-environment via AI_PARSE_MODEL.
const MODEL = process.env.AI_PARSE_MODEL ?? 'gpt-4o-mini-2024-07-18'
const MAX_BODY_BYTES = 32 * 1024 // transcript + locale/currency/categories JSON, generous
const RATE_LIMIT_PER_HOUR = 60
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

export async function POST(req: NextRequest) {
  const userId = await validateToken(req.headers.get('Authorization'))
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Content-Length checked before the body is buffered into memory by
  // req.json() (audit 02-F26) — every other check below still runs on
  // whatever body does arrive; this is just the earliest, cheapest reject.
  if (contentLengthExceeds(req, MAX_BODY_BYTES)) {
    return Response.json({ error: 'Request body too large.' }, { status: 413 })
  }

  const rateLimit = checkRateLimit(`parse:${userId}`, RATE_LIMIT_PER_HOUR, RATE_LIMIT_WINDOW_MS)
  if (!rateLimit.allowed) {
    return Response.json(
      { error: 'Too many parse requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
    )
  }

  let body: { transcript?: string; locale?: string; currency?: string; categories?: string[]; todayCivilDate?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { transcript, locale = 'en', currency = 'USD', categories = [], todayCivilDate } = body
  if (!transcript || typeof transcript !== 'string') {
    return Response.json({ error: 'transcript is required' }, { status: 400 })
  }
  if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
    return Response.json({ error: `transcript exceeds ${MAX_TRANSCRIPT_LENGTH} characters` }, { status: 400 })
  }

  // Trust boundary on the input side (audit 02-F21): `locale`/`currency`
  // are client-controlled and used to be interpolated straight into the
  // system prompt with no check. An unrecognised value is rejected
  // outright rather than silently substituted — silently substituting
  // here would just move the same bug one line down.
  if (!isSupportedLocale(locale)) {
    return Response.json({ error: `unsupported locale: ${JSON.stringify(locale)}` }, { status: 400 })
  }
  if (!isSupportedCurrency(currency)) {
    return Response.json({ error: `unsupported currency: ${JSON.stringify(currency)}` }, { status: 400 })
  }
  if (!Array.isArray(categories) || categories.some((c) => typeof c !== 'string')) {
    return Response.json({ error: 'categories must be a string array' }, { status: 400 })
  }

  // "Today" for the prompt comes from the *user's* civil date when the
  // client supplies one — the server's UTC date is already tomorrow for
  // any user west of UTC after their local ~7 PM, which dated "I spent $6
  // today" to the wrong day (TestFlight build 8, 2026-08-11). The value
  // is client-controlled, so it must parse as a plausible calendar date
  // (same trust boundary as locale/currency above); anything else falls
  // back to the UTC clock rather than reaching the prompt.
  const civilDateOk =
    typeof todayCivilDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(todayCivilDate) &&
    !isNaN(Date.parse(todayCivilDate))
  const systemPrompt = getPrompt({
    locale: locale as Locale,
    currency,
    today: civilDateOk ? todayCivilDate : new Date().toISOString().split('T')[0],
    categories,
  })

  try {
    const completion = await createJsonCompletionWithRetry(openai, {
      model: MODEL,
      response_format: { type: 'json_schema', json_schema: PARSED_EXPENSE_JSON_SCHEMA },
      // Deterministic classification — the same sentence must parse the
      // same way on every try. temperature 0 plus a fixed seed is the
      // strongest determinism OpenAI's API offers; neither is a hard
      // guarantee on its own (audit 02-F12).
      temperature: 0,
      seed: 42,
      // Headroom for the note field + a clarifying question in the same
      // payload — 200/300 used to truncate the JSON on longer utterances
      // (02-F20); createJsonCompletionWithRetry also retries once with
      // more headroom if this still isn't enough.
      max_tokens: 500,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: transcript },
      ],
    })

    const parsed = JSON.parse(completion.text)

    // Typed parse boundary (fix-plan item 1.7): the model's raw JSON never
    // reaches the client unchecked. An invalid response — a bad enum, a
    // non-finite amount, an unparseable date — comes back as a structured
    // 422 the client can surface, never a value that saves and then either
    // fails the DB's CHECK constraints or silently counts as $0.
    const result = validateParsedExpense(parsed)
    if (isParseRejection(result)) {
      return Response.json({ error: 'invalid_parse', errors: result.errors }, { status: 422 })
    }
    // Fix-plan 1.7 part 3: "record the model id alongside ai_confidence" —
    // the pinned model version is logged next to the confidence it
    // produced so a classification drift can be traced to a model change
    // without needing a DB column (no consumer needs the model id at
    // query time; this is an observability trail, not app state).
    console.log(`[parse-expense] ok model=${MODEL} confidence=${result.confidence} retried=${completion.retried}`)
    return Response.json(result)
  } catch (err) {
    // Message + status only — the raw OpenAI SDK error object embeds the
    // request body, i.e. the user's transcript.
    const e = err as { status?: number; message?: string }
    console.error(
      `[parse-expense] OpenAI error (status=${e?.status ?? 'n/a'}): ${e?.message ?? String(err)}`,
    )
    return Response.json({ error: 'AI parsing failed' }, { status: 500 })
  }
}
