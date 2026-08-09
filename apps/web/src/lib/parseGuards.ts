// Trust-boundary checks for the two parse routes — fix-plan item 1.7,
// part 4 (audit 02-F21: "Client-controlled currency, locale, categories,
// scanType are interpolated into the system prompt unvalidated"). Every
// function here rejects rather than silently substitutes a default —
// `?? 'en'`/`?? 'USD'` defaults on the route already cover "not sent";
// these cover "sent, but not a value the system actually supports".

import { ISO_4217_CODES } from '@voice-expense/ai'
import type { Locale } from '@voice-expense/shared'
import type { ScanType } from '@voice-expense/ai'

const SUPPORTED_LOCALES: ReadonlySet<string> = new Set(['en', 'fr', 'es', 'pt'])
const SCAN_TYPES: ReadonlySet<string> = new Set(['receipt', 'paycheck'])

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && SUPPORTED_LOCALES.has(value)
}

export function isSupportedCurrency(value: unknown): value is string {
  return typeof value === 'string' && ISO_4217_CODES.has(value.trim().toUpperCase())
}

export function isSupportedScanType(value: unknown): value is ScanType {
  return typeof value === 'string' && SCAN_TYPES.has(value)
}

/** Transcripts are voice-to-text, not free-form essays — this is generous
 *  headroom (a five-minute ramble at spoken-word pace) while still bounding
 *  the token cost and prompt-injection surface of a single request. */
export const MAX_TRANSCRIPT_LENGTH = 4000

/**
 * Rejects a request body before it is even parsed as JSON when the
 * `Content-Length` header already declares more than `maxBytes` — audit
 * 02-F26's "image size checked after full-body parse" applies to every
 * route, not just the scan one: without this, `req.json()` buffers the
 * entire body into memory first regardless of what the handler goes on to
 * reject.
 */
export function contentLengthExceeds(req: { headers: { get(name: string): string | null } }, maxBytes: number): boolean {
  const raw = req.headers.get('content-length')
  if (!raw) return false // absent/chunked — the per-field checks after JSON.parse still apply
  const bytes = Number(raw)
  return Number.isFinite(bytes) && bytes > maxBytes
}
