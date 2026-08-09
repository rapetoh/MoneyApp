// Shared "ask for JSON, don't silently lose it to truncation" wrapper for
// both parse routes — fix-plan item 1.7, part 3 (audit 02-F20: "max_tokens:
// 200/300 truncates the JSON → JSON.parse throws → 500 → the utterance is
// lost"). A `finish_reason: 'length'` response has truncated JSON by
// definition — retrying it through `JSON.parse` only produces a worse
// error message, so this checks `finish_reason` before parsing and retries
// once with more headroom instead.

import type OpenAI from 'openai'
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions'

export interface JsonCompletionResult {
  text: string
  /** True when the first attempt truncated and a retry with more
   *  `max_tokens` was needed to get a complete response. Non-fatal —
   *  callers don't need to branch on this, it's for the caller's log line. */
  retried: boolean
}

const RETRY_MAX_TOKENS_CAP = 1200

/**
 * Runs `params` through `openai.chat.completions.create`; if the response
 * truncated (`finish_reason === 'length'`), retries exactly once with
 * `max_tokens` raised (capped at `RETRY_MAX_TOKENS_CAP`) rather than
 * handing the caller a JSON string it already knows is incomplete.
 */
export async function createJsonCompletionWithRetry(
  openai: OpenAI,
  params: ChatCompletionCreateParamsNonStreaming,
): Promise<JsonCompletionResult> {
  const first = await openai.chat.completions.create(params)
  const firstChoice = first.choices[0]
  if (firstChoice.finish_reason !== 'length') {
    return { text: firstChoice.message.content ?? '{}', retried: false }
  }

  const retryMaxTokens = Math.min(
    RETRY_MAX_TOKENS_CAP,
    Math.round((params.max_tokens ?? 500) * 1.5),
  )
  const retry = await openai.chat.completions.create({ ...params, max_tokens: retryMaxTokens })
  return { text: retry.choices[0].message.content ?? '{}', retried: true }
}
