import OpenAI from 'openai'
import { validateToken } from '../../../../lib/auth'
import { getScanPrompt, validateParsedExpense, isParseRejection, PARSED_EXPENSE_JSON_SCHEMA } from '@voice-expense/ai'
import type { NextRequest } from 'next/server'
import { createJsonCompletionWithRetry } from '../../../../lib/aiCompletion'
import { checkRateLimit } from '../../../../lib/rateLimit'
import { contentLengthExceeds, isSupportedCurrency, isSupportedScanType } from '../../../../lib/parseGuards'
import { getOpenAIEnv } from '../../../../lib/env'

const openai = new OpenAI({ apiKey: getOpenAIEnv().OPENAI_API_KEY })
// A dated snapshot, not the floating `gpt-4o-mini` alias — same reasoning
// as parse-expense (fix-plan item 1.7 part 3).
const MODEL = process.env.AI_SCAN_MODEL ?? 'gpt-4o-mini-2024-07-18'

const MAX_IMAGE_BYTES = 4 * 1024 * 1024
// Request body is the base64 image plus a small amount of JSON around it —
// base64 inflates size by ~4/3, so this is the same MAX_IMAGE_BYTES bound
// expressed as a Content-Length ceiling, checked before the body is
// buffered (audit 02-F26).
const MAX_BODY_BYTES = Math.ceil(MAX_IMAGE_BYTES * 1.37) + 4 * 1024
const RATE_LIMIT_PER_HOUR = 20
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

export async function POST(req: NextRequest) {
  const userId = await validateToken(req.headers.get('Authorization'))
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (contentLengthExceeds(req, MAX_BODY_BYTES)) {
    return Response.json({ error: 'Image too large. Max 4MB.' }, { status: 413 })
  }

  const rateLimit = checkRateLimit(`scan:${userId}`, RATE_LIMIT_PER_HOUR, RATE_LIMIT_WINDOW_MS)
  if (!rateLimit.allowed) {
    return Response.json(
      { error: 'Too many scan requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
    )
  }

  let body: { imageBase64?: string; scanType?: string; currency?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { imageBase64, scanType = 'receipt', currency = 'USD' } = body

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return Response.json({ error: 'imageBase64 is required' }, { status: 400 })
  }

  if (imageBase64.length > MAX_IMAGE_BYTES * 1.37) {
    return Response.json({ error: 'Image too large. Max 4MB.' }, { status: 413 })
  }

  // Trust boundary on the input side (audit 02-F21): `scanType` was
  // declared as a union in the request body's type annotation but never
  // actually checked — any string silently selected the receipt prompt
  // (or, worse, an unexpected value could reach `getScanPrompt` and
  // silently fall through to the paycheck branch's hardcoded
  // credit/Income/recurring defaults for content that isn't a paycheck).
  if (!isSupportedScanType(scanType)) {
    return Response.json({ error: `unsupported scanType: ${JSON.stringify(scanType)}` }, { status: 400 })
  }
  if (!isSupportedCurrency(currency)) {
    return Response.json({ error: `unsupported currency: ${JSON.stringify(currency)}` }, { status: 400 })
  }

  const prompt = getScanPrompt(scanType, currency)

  try {
    const completion = await createJsonCompletionWithRetry(openai, {
      model: MODEL,
      response_format: { type: 'json_schema', json_schema: PARSED_EXPENSE_JSON_SCHEMA },
      // Deterministic classification — same reasoning as parse-expense.
      temperature: 0,
      seed: 42,
      max_tokens: 400,
      // System role for the instructions, user role for the image only
      // (audit 02-F22: "instructions and the untrusted image share one
      // user turn"). The prompt still fits the model's expectations of a
      // system message even though it also contains the exact JSON shape
      // to return — response_format already enforces that shape, so the
      // prose is a description for the model, not something it needs to
      // echo structurally.
      messages: [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }],
        },
      ],
    })

    const parsed = JSON.parse(completion.text)

    // Typed parse boundary (fix-plan item 1.7) — same contract as
    // parse-expense; a scan result is never handed to the client unchecked.
    const result = validateParsedExpense(parsed)
    if (isParseRejection(result)) {
      return Response.json({ error: 'invalid_parse', errors: result.errors }, { status: 422 })
    }
    // Fix-plan 1.7 part 3: "record the model id alongside ai_confidence" —
    // see parse-expense/route.ts's identical log line for why this is a
    // log trail rather than a DB column.
    console.log(`[parse-scan] ok model=${MODEL} confidence=${result.confidence} retried=${completion.retried}`)
    return Response.json(result)
  } catch (err) {
    // Message + status only — the raw OpenAI SDK error object embeds the
    // request body, i.e. the user's scanned image.
    const e = err as { status?: number; message?: string }
    console.error(
      `[parse-scan] OpenAI error (status=${e?.status ?? 'n/a'}): ${e?.message ?? String(err)}`,
    )
    return Response.json({ error: 'Scan parsing failed' }, { status: 500 })
  }
}
