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

export async function parseScan(opts: ScanOptions): Promise<ParsedExpense> {
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
  return assertParsedExpense(raw)
}
