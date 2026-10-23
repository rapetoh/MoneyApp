import OpenAI from 'openai'
import type { NextRequest } from 'next/server'
import {
  STATEMENT_JSON_SCHEMA,
  STATEMENT_PROMPT,
  validateStatementRows,
} from '@voice-expense/ai/server'
import { validateToken } from '../../../../lib/auth'
import { checkRateLimit } from '../../../../lib/rateLimit'
import { contentLengthExceeds } from '../../../../lib/parseGuards'
import { getOpenAIEnv } from '../../../../lib/env'
import { localDay } from '@voice-expense/shared'

/**
 * One bank or card statement (PDF) in, its transaction lines out
 * (docs/csv-import.md, "PDF statements"). The web import page sends a year
 * of statements one file at a time and feeds the rows to the same pipeline
 * as a CSV. The PDF is passed to the model and never stored or logged.
 */

// A long statement is a few thousand output tokens; give it room.
export const maxDuration = 300

const openai = new OpenAI({ apiKey: getOpenAIEnv().OPENAI_API_KEY })
// Reads text and scanned pages alike. Its own rate limit, separate from the
// gpt-4o-mini parse routes, so a year of statements never slows logging.
const MODEL = process.env.AI_STATEMENT_MODEL ?? 'gpt-4.1-mini-2025-04-14'

// Vercel caps request bodies at 4.5 MB; bank statements are far smaller.
const MAX_PDF_BYTES = 4 * 1024 * 1024
const MAX_BODY_BYTES = MAX_PDF_BYTES + 64 * 1024
const RATE_LIMIT_PER_HOUR = 60
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

export async function POST(req: NextRequest) {
  const userId = await validateToken(req.headers.get('Authorization'))
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  if (contentLengthExceeds(req, MAX_BODY_BYTES)) {
    return Response.json({ error: 'too_large' }, { status: 413 })
  }

  const rateLimit = checkRateLimit(`statement:${userId}`, RATE_LIMIT_PER_HOUR, RATE_LIMIT_WINDOW_MS)
  if (!rateLimit.allowed) {
    return Response.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
    )
  }

  let file: File | null = null
  try {
    const form = await req.formData()
    const f = form.get('file')
    file = f instanceof File ? f : null
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 })
  }
  if (!file) return Response.json({ error: 'bad_request' }, { status: 400 })
  if (file.size > MAX_PDF_BYTES) return Response.json({ error: 'too_large' }, { status: 413 })

  const bytes = Buffer.from(await file.arrayBuffer())
  // Every PDF starts with "%PDF"; anything else is refused before the model.
  if (bytes.subarray(0, 4).toString('latin1') !== '%PDF') {
    return Response.json({ error: 'not_pdf' }, { status: 415 })
  }

  const started = Date.now()
  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0,
      max_tokens: 32000,
      response_format: { type: 'json_schema', json_schema: STATEMENT_JSON_SCHEMA },
      // Instructions in the system turn; the untrusted document alone in the
      // user turn (same split as parse-scan, audit 02-F22).
      messages: [
        { role: 'system', content: STATEMENT_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: {
                filename: 'statement.pdf',
                file_data: `data:application/pdf;base64,${bytes.toString('base64')}`,
              },
            },
          ],
        },
      ],
    })
    const choice = completion.choices[0]
    if (choice.finish_reason === 'length') {
      console.error(`[parse-statement] truncated model=${MODEL} ms=${Date.now() - started}`)
      return Response.json({ error: 'too_long' }, { status: 422 })
    }
    // Today where the calendar is furthest ahead (UTC+14), so a statement
    // line dated "today" in any time zone passes.
    const latestDay = localDay(new Date().toISOString(), 'Pacific/Kiritimati')
    const reading = validateStatementRows(JSON.parse(choice.message.content ?? '{}'), latestDay)
    console.log(
      `[parse-statement] ok model=${MODEL} rows=${reading.rows.length} dropped=${reading.dropped} ms=${Date.now() - started}`,
    )
    return Response.json(reading)
  } catch (err) {
    // Status + message only: the SDK error embeds the request, i.e. the statement.
    const e = err as { status?: number; message?: string }
    console.error(
      `[parse-statement] OpenAI error (status=${e?.status ?? 'n/a'}): ${e?.message ?? String(err)}`,
    )
    if (e?.status === 429) {
      return Response.json({ error: 'busy' }, { status: 429, headers: { 'Retry-After': '20' } })
    }
    return Response.json({ error: 'failed' }, { status: 502 })
  }
}
