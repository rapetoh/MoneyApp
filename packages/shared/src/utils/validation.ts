/**
 * One shared amount validator for every capture surface (fix-plan item
 * 2.14, closing `01-F1`/`01-F34`'s "Save enabled and does nothing").
 *
 * Before this module, every amount field re-implemented its own check —
 * `record.tsx`'s manual tab and `transaction/edit.tsx` both did
 * `isNaN(parseFloat(...)) || parsed <= 0` inline, neither enforced an
 * upper bound or a decimal-place limit, and a value that slipped past the
 * loose check (e.g. `12.999`, or a value larger than the money columns'
 * `numeric(14,2)` can hold) either silently saved with the wrong
 * precision or failed further down the stack with no surfaced reason —
 * "Save" stayed enabled and tapping it did nothing the user could see.
 *
 * `validateAmount` is a pure function: it takes the raw text a user typed
 * and returns a typed result rather than throwing or returning `NaN`, so
 * every call site can render an explicit reason instead of guessing.
 */

/** Matches `numeric(14,2)`'s ceiling — the largest amount the money
 *  columns in `supabase/migrations/001_initial_schema.sql` can store. */
export const MAX_AMOUNT = 9_999_999_999.99

export type AmountValidation =
  | { ok: true; amount: number }
  | { ok: false; reason: 'empty' | 'not_a_number' | 'not_positive' | 'too_large' | 'too_many_decimals' }

/**
 * Validates a raw amount string typed into a decimal-pad field.
 *
 * Rules: must parse as a positive number, at most two decimal places,
 * and no larger than `MAX_AMOUNT`. Accepts both `.` and `,` as the
 * decimal separator — every existing call site normalized this inline;
 * centralizing it here is part of what this module replaces.
 *
 * `currency` is accepted (not yet used to vary the decimal-place rule)
 * so the signature already matches what a future per-currency precision
 * table (e.g. zero-decimal JPY) will need without changing every call
 * site a second time.
 */
export function validateAmount(raw: string, _currency?: string): AmountValidation {
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: false, reason: 'empty' }

  const normalized = trimmed.replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(normalized)) return { ok: false, reason: 'not_a_number' }

  const decimals = normalized.split('.')[1]
  if (decimals && decimals.length > 2) return { ok: false, reason: 'too_many_decimals' }

  const amount = parseFloat(normalized)
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'not_positive' }
  if (amount > MAX_AMOUNT) return { ok: false, reason: 'too_large' }

  return { ok: true, amount }
}
