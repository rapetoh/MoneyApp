import OpenAI from 'openai'
import { validateToken } from '../../../../lib/auth'
import {
  getMerchantBatchPrompt,
  validateMerchantBatch,
  MERCHANT_BATCH_JSON_SCHEMA,
  MERCHANT_BATCH_MAX,
  MERCHANT_DESCRIPTOR_MAX_LENGTH,
  type MerchantBatchResult,
} from '@voice-expense/ai'
import { merchantLogoSrc } from '@voice-expense/shared'
import type { NextRequest } from 'next/server'
import { createJsonCompletionWithRetry } from '../../../../lib/aiCompletion'
import { checkRateLimit } from '../../../../lib/rateLimit'
import { contentLengthExceeds } from '../../../../lib/parseGuards'
import { getOpenAIEnv } from '../../../../lib/env'

/**
 * POST /api/ai/identify-merchants — CSV import (docs/csv-import.md).
 * Body: { descriptors: string[] (distinct, at most MERCHANT_BATCH_MAX),
 * categories: string[] }. Answers { results: MerchantBatchResult[] }, one
 * per descriptor, same order. Same model and naming rules as the voice
 * parser (packages/ai/src/merchantBatch.ts).
 */
const openai = new OpenAI({ apiKey: getOpenAIEnv().OPENAI_API_KEY })
const MODEL = process.env.AI_PARSE_MODEL ?? 'gpt-4o-mini-2024-07-18'
const MAX_BODY_BYTES = 64 * 1024
// One import of a few thousand rows is around 50 batches; the window
// leaves room for a second file without letting a loop run up a bill.
const RATE_LIMIT_PER_HOUR = 120
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const MAX_CATEGORIES = 100
const LOGO_CHECK_TIMEOUT_MS = 2500

/** Results whose domain the logo service has nothing for (same URL the
 *  apps load, `merchantLogoSrc`). A check that times out counts as fine:
 *  a slow logo service is no reason to drop a domain. */
async function domainsWithoutLogo(results: MerchantBatchResult[]): Promise<MerchantBatchResult[]> {
  const checks = await Promise.all(
    results.map(async (r) => {
      if (!r.merchant_domain) return null
      try {
        const res = await fetch(merchantLogoSrc(r.merchant_domain), { signal: AbortSignal.timeout(LOGO_CHECK_TIMEOUT_MS) })
        return res.status === 404 ? r : null
      } catch {
        return null
      }
    }),
  )
  return checks.filter((r): r is MerchantBatchResult => r != null)
}

export async function POST(req: NextRequest) {
  const userId = await validateToken(req.headers.get('Authorization'))
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  if (contentLengthExceeds(req, MAX_BODY_BYTES)) {
    return Response.json({ error: 'Request body too large.' }, { status: 413 })
  }

  const rateLimit = checkRateLimit(`identify:${userId}`, RATE_LIMIT_PER_HOUR, RATE_LIMIT_WINDOW_MS)
  if (!rateLimit.allowed) {
    return Response.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
    )
  }

  let body: { descriptors?: unknown; categories?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { descriptors, categories = [] } = body
  if (
    !Array.isArray(descriptors) ||
    descriptors.length === 0 ||
    descriptors.length > MERCHANT_BATCH_MAX ||
    descriptors.some((d) => typeof d !== 'string' || !d.trim() || d.length > MERCHANT_DESCRIPTOR_MAX_LENGTH)
  ) {
    return Response.json(
      { error: `descriptors must be 1 to ${MERCHANT_BATCH_MAX} non-empty strings of at most ${MERCHANT_DESCRIPTOR_MAX_LENGTH} characters` },
      { status: 400 },
    )
  }
  if (
    !Array.isArray(categories) ||
    categories.length > MAX_CATEGORIES ||
    categories.some((c) => typeof c !== 'string' || c.length > 80)
  ) {
    return Response.json({ error: 'categories must be a string array' }, { status: 400 })
  }

  try {
    const completion = await createJsonCompletionWithRetry(openai, {
      model: MODEL,
      response_format: { type: 'json_schema', json_schema: MERCHANT_BATCH_JSON_SCHEMA },
      temperature: 0,
      seed: 42,
      // About 60 tokens per result, with headroom.
      max_tokens: 120 * descriptors.length + 200,
      messages: [
        { role: 'system', content: getMerchantBatchPrompt(categories as string[]) },
        { role: 'user', content: JSON.stringify(descriptors) },
      ],
    })
    const results = validateMerchantBatch(JSON.parse(completion.text), descriptors as string[], categories as string[])

    // Every domain must actually show a logo. The model sometimes picks a
    // plausible domain the business does not use (Oct 9 2026: Albert Heijn
    // as albertheijn.com, where its site is ah.nl). The ones that fail get
    // one more pass with that feedback; any still failing are dropped, so
    // the row shows its letter tile rather than a broken image.
    const failing = await domainsWithoutLogo(results)
    if (failing.length > 0) {
      const retry = await createJsonCompletionWithRetry(openai, {
        model: MODEL,
        response_format: { type: 'json_schema', json_schema: MERCHANT_BATCH_JSON_SCHEMA },
        temperature: 0,
        seed: 42,
        max_tokens: 120 * failing.length + 200,
        messages: [
          { role: 'system', content: getMerchantBatchPrompt(categories as string[]) },
          {
            role: 'user',
            content:
              `These domains have no website or logo: ${JSON.stringify(failing.map((r) => r.merchant_domain))}. ` +
              `For each line, give the domain the business really uses (often a short national domain), or null.\n` +
              JSON.stringify(failing.map((r) => r.descriptor)),
          },
        ],
      }).catch(() => null)
      const fixed = retry
        ? validateMerchantBatch(JSON.parse(retry.text), failing.map((r) => r.descriptor), categories as string[])
        : []
      const stillFailing = new Set((await domainsWithoutLogo(fixed)).map((r) => r.descriptor))
      for (const f of failing) {
        const better = fixed.find((x) => x.descriptor === f.descriptor)
        f.merchant_domain = better?.merchant_domain && !stillFailing.has(f.descriptor) ? better.merchant_domain : null
      }
    }

    console.log(
      `[identify-merchants] ok model=${MODEL} n=${descriptors.length} logo_retries=${failing.length} retried=${completion.retried}`,
    )
    return Response.json({ results })
  } catch (err) {
    // Message and status only: the SDK error embeds the request body.
    const e = err as { status?: number; message?: string }
    console.error(`[identify-merchants] OpenAI error (status=${e?.status ?? 'n/a'}): ${e?.message ?? String(err)}`)
    return Response.json({ error: 'AI identification failed' }, { status: 500 })
  }
}
