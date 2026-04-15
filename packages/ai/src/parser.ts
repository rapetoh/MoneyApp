import type { ParsedExpense, Locale } from '@voice-expense/shared'
import { parseExpenseLocally } from './localParser'

export interface ParseOptions {
  transcript: string
  locale: Locale
  currency: string
  categories: string[]
  apiBaseUrl: string
  authToken: string
}

// Simple in-memory LRU cache
const cache = new Map<string, { result: ParsedExpense; ts: number }>()
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes
const CACHE_MAX = 500

function cacheKey(transcript: string, locale: string, currency: string): string {
  return `${locale}:${currency}:${transcript.toLowerCase().trim()}`
}

function getCached(key: string): ParsedExpense | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return entry.result
}

function setCached(key: string, result: ParsedExpense): void {
  if (cache.size >= CACHE_MAX) {
    // Evict oldest
    const firstKey = cache.keys().next().value
    if (firstKey) cache.delete(firstKey)
  }
  cache.set(key, { result, ts: Date.now() })
}

export async function parseExpense(opts: ParseOptions): Promise<ParsedExpense> {
  // Tier 1: local parser (no AI call)
  const { result: localResult, confidence } = parseExpenseLocally(opts.transcript)
  if (localResult && confidence >= 0.85) {
    return { ...localResult, currency: opts.currency }
  }

  // Tier 2: cache check
  const key = cacheKey(opts.transcript, opts.locale, opts.currency)
  const cached = getCached(key)
  if (cached) return cached

  // Tier 3: AI call via Next.js API route
  const response = await fetch(`${opts.apiBaseUrl}/api/ai/parse-expense`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.authToken}`,
    },
    body: JSON.stringify({
      transcript: opts.transcript,
      locale: opts.locale,
      currency: opts.currency,
      categories: opts.categories,
    }),
  })

  if (!response.ok) {
    // Fallback: return local parse result even with low confidence
    if (localResult) return { ...localResult, currency: opts.currency }
    throw new Error(`AI parse failed: ${response.status}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (await response.json()) as any
  // Ensure all ParsedExpense fields have sensible defaults — AI may omit optional fields
  const result: ParsedExpense = {
    amount: raw.amount ?? 0,
    currency: raw.currency ?? opts.currency,
    direction: raw.direction ?? 'debit',
    merchant: raw.merchant ?? null,
    merchant_domain: raw.merchant_domain ?? null,
    category_suggestion: raw.category_suggestion ?? null,
    payment_method: raw.payment_method ?? null,
    transacted_at: raw.transacted_at ?? new Date().toISOString(),
    confidence: raw.confidence ?? 0.5,
    needs_clarification: raw.needs_clarification ?? false,
    clarifying_question: raw.clarifying_question ?? null,
    is_recurring_suggestion: raw.is_recurring_suggestion ?? false,
    recurring_frequency_suggestion: raw.recurring_frequency_suggestion ?? null,
  }
  setCached(key, result)
  return result
}
