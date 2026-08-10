import type { ParsedExpense, ParseFieldError } from '@voice-expense/shared'
import { assertParsedExpense, ParseValidationError } from './validateParsedExpense'

export type ScanType = 'receipt' | 'paycheck'

export interface ScanOptions {
  imageBase64: string
  scanType: ScanType
  currency: string
  apiBaseUrl: string
  authToken: string
}

/** Rejection gets its own state (fix-plan item 2.9c / audit 02-F3) instead
 *  of riding through as a `ParsedExpense` with `needs_clarification: true`.
 *  Unlike the voice pipeline — where `needs_clarification` means "the
 *  amount is ambiguous, ask inline and keep editing" — `getScanPrompt`'s
 *  contract for both scan types only ever sets `needs_clarification` when
 *  the image itself isn't usable ("too blurry or not a receipt/paycheck").
 *  There is no partial/editable case for a scan: a rejected image has no
 *  honest amount to prefill, so the caller must not open a savable editor
 *  at all — it should offer retake-or-enter-manually instead. */
export type ScanResult =
  | { ok: true; expense: ParsedExpense }
  | { ok: false; reason: string }

const DEFAULT_REJECTION_REASON: Record<ScanType, string> = {
  receipt: "That doesn't look like a receipt.",
  paycheck: "That doesn't look like a paycheck.",
}

export async function parseScan(opts: ScanOptions): Promise<ScanResult> {
  const response = await fetch(`${opts.apiBaseUrl}/api/ai/parse-scan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.authToken}`,
    },
    body: JSON.stringify({
      imageBase64: opts.imageBase64,
      scanType: opts.scanType,
      currency: opts.currency,
    }),
  })

  if (!response.ok) {
    if (response.status === 422) {
      // The route already ran this response through `validateParsedExpense`
      // and rejected it — carry the field errors through as a typed throw.
      // Distinct from the `ok: false` branch below: this is a boundary
      // violation (a malformed model response), not the model's own
      // considered "this isn't a valid receipt" judgment.
      let body: { errors?: ParseFieldError[] } = {}
      try {
        body = (await response.json()) as { errors?: ParseFieldError[] }
      } catch {
        // Malformed error body — fall through with an empty error list.
      }
      throw new ParseValidationError(body.errors ?? [])
    }
    throw new Error(`Scan parse failed: ${response.status}`)
  }

  const raw: unknown = await response.json()
  // Second boundary, same reasoning as parser.ts: never trust a model
  // response into a save path unchecked, even one the route already
  // approved.
  const expense = assertParsedExpense(raw)

  if (expense.needs_clarification) {
    return {
      ok: false,
      reason: expense.clarifying_question ?? DEFAULT_REJECTION_REASON[opts.scanType],
    }
  }

  return { ok: true, expense }
}
