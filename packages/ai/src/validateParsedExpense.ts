// The typed parse boundary — fix-plan item 1.7.
//
// `parser.ts` and `scanParser.ts` used to cast the model's raw JSON straight
// to `ParsedExpense` and spread `??` defaults over it, which only guards
// `null`/`undefined` — a `direction: "expense"` or `payment_method: "venmo"`
// sailed straight through and produced a row that saves locally and is
// rejected by the DB CHECK on every sync attempt forever, or a `currency`
// that isn't a real code and silently counts as $0 in every total.
//
// `validateParsedExpense` is the one place that decides whether a model
// response is safe to save. It never coerces an invalid value into a
// plausible-looking default — that's exactly the defaulted-save bug this
// module exists to close. Every field is independently checked; all
// failures are collected (not short-circuited) so a rejection is one useful
// report instead of a whack-a-mole of one-error-at-a-time round trips.
//
// Modelled on `validateAskMurmurResponse` (./askMurmur.ts) — same
// hand-rolled shape-check pattern, no external schema library, because nuts
// like `PaymentMethod`/`TransactionDirection` are already single-sourced as
// TypeScript unions and a validator library would just be a second
// description of the same enums.

import type {
  FlowType,
  ParsedExpense,
  ParseFieldError,
  ParseRejection,
  PaymentMethod,
  RecurringFrequency,
  TransactionDirection,
} from '@voice-expense/shared'

export interface ValidateParsedExpenseOptions {
  /** Overrides the default note-length cap (characters). Exposed for tests;
   *  production callers should use the default. */
  maxNoteLength?: number
}

/** `transactions.note` has no DB length limit today, but an unbounded model
 *  response is an unbounded save. 500 characters comfortably fits every
 *  legitimate case in the prompt's spec (a fund name, a short reason, a
 *  pay-period range) with headroom, while capping a runaway completion. */
export const DEFAULT_MAX_NOTE_LENGTH = 500

const PAYMENT_METHODS: ReadonlySet<PaymentMethod> = new Set<PaymentMethod>([
  'cash',
  'credit_card',
  'debit_card',
  'digital_wallet',
  'bank_transfer',
  'other',
])

const DIRECTIONS: ReadonlySet<TransactionDirection> = new Set<TransactionDirection>([
  'debit',
  'credit',
])

/** The six values the model may classify a transaction's intent as — see
 *  `FlowType`'s doc comment (packages/shared/src/types/ai.ts). */
const FLOW_TYPES: ReadonlySet<FlowType> = new Set<FlowType>([
  'expense',
  'income',
  'transfer_out',
  'transfer_in',
  'refund',
  'reimbursement',
])

/** The one place `flow_type` becomes `direction` (fix-plan item 1.7,
 *  part 1: "the model classifies intent; code decides the sign"). Every
 *  flow that moves money out of the user's spending power (a purchase,
 *  or shifting cash into savings/brokerage/retirement/crypto) is a
 *  debit; every flow that moves money into it (pay, proceeds from
 *  selling an investment, a refund, a reimbursement) is a credit. */
const FLOW_TYPE_TO_DIRECTION: Readonly<Record<FlowType, TransactionDirection>> = {
  expense: 'debit',
  transfer_out: 'debit',
  income: 'credit',
  transfer_in: 'credit',
  refund: 'credit',
  reimbursement: 'credit',
}

/** Exported so every non-AI producer of a `ParsedExpense` (the shortcut
 *  deep link, the Android notification listener, the local heuristic
 *  parser) derives `direction` the same single-sourced way `flow_type`
 *  itself demands, instead of hand-picking 'debit'/'credit' next to a
 *  hardcoded `flow_type` and risking the two drifting apart. */
export function deriveDirectionFromFlowType(flowType: FlowType): TransactionDirection {
  return FLOW_TYPE_TO_DIRECTION[flowType]
}

const RECURRING_FREQUENCIES: ReadonlySet<RecurringFrequency> = new Set<RecurringFrequency>([
  'daily',
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'yearly',
])

/** ISO 4217 alphabetic currency codes. An allow-list, not a format regex —
 *  `/^[A-Z]{3}$/` accepts "ABC", which is not a currency, and a bogus
 *  currency syncs cleanly and then counts as $0 in every total because the
 *  FX snapshot has nothing to convert against. */
export const ISO_4217_CODES: ReadonlySet<string> = new Set([
  'AED', 'AFN', 'ALL', 'AMD', 'ANG', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN',
  'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD',
  'CAD', 'CDF', 'CHF', 'CLP', 'CNY', 'COP', 'CRC', 'CUP', 'CVE', 'CZK',
  'DJF', 'DKK', 'DOP', 'DZD',
  'EGP', 'ERN', 'ETB', 'EUR',
  'FJD', 'FKP',
  'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD',
  'HKD', 'HNL', 'HTG', 'HUF',
  'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK',
  'JMD', 'JOD', 'JPY',
  'KES', 'KGS', 'KHR', 'KMF', 'KPW', 'KRW', 'KWD', 'KYD', 'KZT',
  'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD',
  'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MYR', 'MZN',
  'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD',
  'OMR',
  'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG',
  'QAR',
  'RON', 'RSD', 'RUB', 'RWF',
  'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SYP', 'SZL',
  'THB', 'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS',
  'UAH', 'UGX', 'USD', 'UYU', 'UZS',
  'VES', 'VND', 'VUV',
  'WST',
  'XAF', 'XCD', 'XOF', 'XPF',
  'YER',
  'ZAR', 'ZMW', 'ZWL',
])

/** Plain arrays, for building the `response_format: json_schema` enum lists
 *  (apps/web's two parse routes) from the exact same source these field
 *  checks validate against — a schema hand-typed a second time is exactly
 *  the kind of drift this item exists to close. */
export const PAYMENT_METHOD_VALUES: readonly PaymentMethod[] = [...PAYMENT_METHODS]
export const TRANSACTION_DIRECTION_VALUES: readonly TransactionDirection[] = [...DIRECTIONS]
export const RECURRING_FREQUENCY_VALUES: readonly RecurringFrequency[] = [...RECURRING_FREQUENCIES]
export const FLOW_TYPE_VALUES: readonly FlowType[] = [...FLOW_TYPES]

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function trimmedStringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

// ─── Field-level checks, shared between `validateParsedExpense` (the full
// model-response contract) and `validateTransactionWriteFields` (the third,
// narrower boundary — see below). Single-sourced so the two can never drift
// on what counts as a valid amount/currency/direction/payment method. ───────

function checkAmount(raw: unknown): { value: number; error: ParseFieldError | null } {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return { value: 0, error: { field: 'amount', message: `expected a finite number, got ${JSON.stringify(raw)}` } }
  }
  if (raw <= 0) {
    return { value: 0, error: { field: 'amount', message: `must be greater than 0, got ${raw}` } }
  }
  if (raw >= 1e9) {
    return { value: 0, error: { field: 'amount', message: `must be less than 1e9, got ${raw}` } }
  }
  if (Math.abs(raw * 100 - Math.round(raw * 100)) > 1e-6) {
    return { value: 0, error: { field: 'amount', message: `must have at most 2 decimal places, got ${raw}` } }
  }
  return { value: raw, error: null }
}

function checkCurrency(raw: unknown): { value: string; error: ParseFieldError | null } {
  const normalized = typeof raw === 'string' ? raw.trim().toUpperCase() : ''
  if (!normalized || !ISO_4217_CODES.has(normalized)) {
    return { value: '', error: { field: 'currency', message: `expected an ISO 4217 currency code, got ${JSON.stringify(raw)}` } }
  }
  return { value: normalized, error: null }
}

function checkDirection(raw: unknown): { value: TransactionDirection; error: ParseFieldError | null } {
  if (typeof raw !== 'string' || !DIRECTIONS.has(raw as TransactionDirection)) {
    return {
      value: 'debit',
      error: { field: 'direction', message: `expected one of ${[...DIRECTIONS].join(', ')}, got ${JSON.stringify(raw)}` },
    }
  }
  return { value: raw as TransactionDirection, error: null }
}

/** `flow_type` is the model-facing field `validateParsedExpense` checks —
 *  a raw `direction` the model might also return is never read; see
 *  `FlowType`'s doc comment for why. */
function checkFlowType(raw: unknown): { value: FlowType; error: ParseFieldError | null } {
  if (typeof raw !== 'string' || !FLOW_TYPES.has(raw as FlowType)) {
    return {
      value: 'expense',
      error: { field: 'flow_type', message: `expected one of ${[...FLOW_TYPES].join(', ')}, got ${JSON.stringify(raw)}` },
    }
  }
  return { value: raw as FlowType, error: null }
}

/** `payment_method` is nullable everywhere it's used — `raw == null` is
 *  always valid regardless of `required`. */
function checkPaymentMethod(raw: unknown): { value: PaymentMethod | null; error: ParseFieldError | null } {
  if (raw == null) return { value: null, error: null }
  if (typeof raw !== 'string' || !PAYMENT_METHODS.has(raw as PaymentMethod)) {
    return {
      value: null,
      error: {
        field: 'payment_method',
        message: `expected one of ${[...PAYMENT_METHODS].join(', ')} or null, got ${JSON.stringify(raw)}`,
      },
    }
  }
  return { value: raw as PaymentMethod, error: null }
}

/** Discriminates `validateParsedExpense`'s return union. `ParsedExpense`
 *  never carries a `rejected` key, so this is a safe, exhaustive check. */
export function isParseRejection(
  value: ParsedExpense | ParseRejection,
): value is ParseRejection {
  return (value as ParseRejection).rejected === true
}

/**
 * The one validator every model response bound for `ParsedExpense` must
 * pass through before reaching any save path (route response, client parse
 * result, or the local write itself). Never mutates an invalid value into a
 * plausible default — an invalid response is always a `ParseRejection`, in
 * full, with every field that failed.
 */
export function validateParsedExpense(
  raw: unknown,
  opts: ValidateParsedExpenseOptions = {},
): ParsedExpense | ParseRejection {
  const errors: ParseFieldError[] = []
  const r = isPlainObject(raw) ? raw : {}
  if (!isPlainObject(raw)) {
    errors.push({ field: 'root', message: `expected a JSON object, got ${JSON.stringify(raw)}` })
  }

  // ─── amount: finite, > 0, < 1e9, at most 2 decimal places ────────────────
  const amountCheck = checkAmount(r.amount)
  if (amountCheck.error) errors.push(amountCheck.error)
  const amount = amountCheck.value

  // ─── flow_type: the model classifies intent; direction is derived ────
  // in code from it (fix-plan item 1.7, part 1) — a raw `direction` the
  // model returns is never read, so a model that gets the intent right
  // but the sign wrong can't produce an internally-inconsistent row.
  const flowTypeCheck = checkFlowType(r.flow_type)
  if (flowTypeCheck.error) errors.push(flowTypeCheck.error)
  const flowType = flowTypeCheck.value
  const direction = deriveDirectionFromFlowType(flowType)

  // ─── currency: ISO 4217 allow-list ────────────────────────────────────
  const currencyCheck = checkCurrency(r.currency)
  if (currencyCheck.error) errors.push(currencyCheck.error)
  const currency = currencyCheck.value

  // ─── transacted_at: parseable ISO instant ─────────────────────────────
  let transactedAt = ''
  const rawTransactedAt = r.transacted_at
  if (typeof rawTransactedAt !== 'string' || Number.isNaN(Date.parse(rawTransactedAt))) {
    errors.push({
      field: 'transacted_at',
      message: `expected a parseable ISO 8601 datetime, got ${JSON.stringify(rawTransactedAt)}`,
    })
  } else {
    transactedAt = rawTransactedAt
  }

  // ─── payment_method: DB enum or null ──────────────────────────────────
  const paymentMethodCheck = checkPaymentMethod(r.payment_method)
  if (paymentMethodCheck.error) errors.push(paymentMethodCheck.error)
  const paymentMethod = paymentMethodCheck.value

  // ─── recurring_frequency_suggestion: DB enum or null ──────────────────
  let recurringFrequencySuggestion: RecurringFrequency | null = null
  if (r.recurring_frequency_suggestion != null) {
    if (
      typeof r.recurring_frequency_suggestion !== 'string' ||
      !RECURRING_FREQUENCIES.has(r.recurring_frequency_suggestion as RecurringFrequency)
    ) {
      errors.push({
        field: 'recurring_frequency_suggestion',
        message: `expected one of ${[...RECURRING_FREQUENCIES].join(', ')} or null, got ${JSON.stringify(r.recurring_frequency_suggestion)}`,
      })
    } else {
      recurringFrequencySuggestion = r.recurring_frequency_suggestion as RecurringFrequency
    }
  }

  // ─── confidence: clamped to [0, 1], never a rejection reason ─────────
  const rawConfidence = r.confidence
  const confidence =
    typeof rawConfidence === 'number' && Number.isFinite(rawConfidence)
      ? Math.min(1, Math.max(0, rawConfidence))
      : 0.5

  // ─── note: capped, never a rejection reason ───────────────────────────
  const maxNoteLength = opts.maxNoteLength ?? DEFAULT_MAX_NOTE_LENGTH
  const rawNote = trimmedStringOrNull(r.note)
  const note = rawNote ? rawNote.slice(0, maxNoteLength) : null

  const merchant = trimmedStringOrNull(r.merchant)
  const merchantDomain = trimmedStringOrNull(r.merchant_domain)
  const categorySuggestion = trimmedStringOrNull(r.category_suggestion)
  const needsClarification = r.needs_clarification === true
  const clarifyingQuestion = needsClarification ? trimmedStringOrNull(r.clarifying_question) : null
  const isRecurringSuggestion = r.is_recurring_suggestion === true

  if (errors.length > 0) {
    return { rejected: true, errors }
  }

  return {
    amount,
    currency,
    direction,
    flow_type: flowType,
    merchant,
    merchant_domain: merchantDomain,
    note,
    category_suggestion: categorySuggestion,
    payment_method: paymentMethod,
    transacted_at: transactedAt,
    confidence,
    needs_clarification: needsClarification,
    clarifying_question: clarifyingQuestion,
    is_recurring_suggestion: isRecurringSuggestion,
    // Only carry a frequency when the model actually suggested recurrence —
    // mirrors the prompt's own contract ("Null only when
    // is_recurring_suggestion is false") rather than trusting the model to
    // keep the two fields consistent.
    recurring_frequency_suggestion: isRecurringSuggestion ? recurringFrequencySuggestion : null,
  }
}

/** Typed error a caller can catch and surface to the UI — the "never a
 *  defaulted save" half of the contract. `errors` is the same
 *  `ParseFieldError[]` a `ParseRejection` carries, so a `catch` block and a
 *  direct `validateParsedExpense` call can render the same message. */
export class ParseValidationError extends Error {
  readonly errors: ParseFieldError[]

  constructor(errors: ParseFieldError[]) {
    super(
      errors.length > 0
        ? `parsed expense failed validation: ${errors.map((e) => `${e.field} — ${e.message}`).join('; ')}`
        : 'parsed expense failed validation',
    )
    this.name = 'ParseValidationError'
    this.errors = errors
  }
}

/** Throwing wrapper around `validateParsedExpense` for call sites that want
 *  an exception rather than a union to branch on (`parser.ts`/
 *  `scanParser.ts`, whose exported functions keep their existing
 *  `Promise<ParsedExpense>` signature — the failure mode changes from "a
 *  defaulted row" to "a typed throw", not from "resolves" to "returns a
 *  union"). */
export function assertParsedExpense(
  raw: unknown,
  opts?: ValidateParsedExpenseOptions,
): ParsedExpense {
  const result = validateParsedExpense(raw, opts)
  if (isParseRejection(result)) {
    throw new ParseValidationError(result.errors)
  }
  return result
}

/** The subset of a `Transaction` write that a bad model response (or, in
 *  principle, any other caller) could make unsyncable or wrong-valued —
 *  `amount`, `direction`, `currency_code`, and `payment_method` when
 *  present. Everything `validateParsedExpense` checks about these four
 *  fields is identical here; the two share `checkAmount`/`checkDirection`/
 *  `checkCurrency`/`checkPaymentMethod` so the two boundaries can never
 *  silently diverge on what "valid" means. */
export interface TransactionWriteFields {
  amount: number
  direction: TransactionDirection
  currency_code: string
  payment_method?: PaymentMethod | null
}

/**
 * The third boundary — fix-plan item 1.7, part 2: "Call it at three
 * boundaries: in the route before responding, in parser.ts/scanParser.ts
 * after responding, and in createTransaction before the local write —
 * createTransaction is the last line of defence and must refuse to write a
 * row that cannot sync." The first two boundaries only see AI output;
 * this one runs on every write regardless of `source` (manual entry, a
 * shortcut deep link, the Android notification listener, or a future call
 * site that skips the first two boundaries by construction) — a
 * `currency_code` or `payment_method` that would fail the DB's CHECK
 * constraint is caught here before a single row is written to SQLite,
 * instead of failing every sync attempt forever.
 *
 * Returns `null` when every field is valid; otherwise the field errors,
 * in the same `ParseFieldError[]` shape `validateParsedExpense` returns,
 * so a caller can render either with the same code path.
 */
export function validateTransactionWriteFields(
  fields: TransactionWriteFields,
): ParseFieldError[] | null {
  const errors: ParseFieldError[] = []
  const amountCheck = checkAmount(fields.amount)
  if (amountCheck.error) errors.push(amountCheck.error)
  const directionCheck = checkDirection(fields.direction)
  if (directionCheck.error) errors.push(directionCheck.error)
  const currencyCheck = checkCurrency(fields.currency_code)
  if (currencyCheck.error) errors.push(currencyCheck.error)
  const paymentMethodCheck = checkPaymentMethod(fields.payment_method)
  if (paymentMethodCheck.error) errors.push(paymentMethodCheck.error)
  return errors.length > 0 ? errors : null
}
