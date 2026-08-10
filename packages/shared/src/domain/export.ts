/**
 * The one export-assembly module — fix-plan 2.15 ("Exports that
 * reconcile"), resolving audit 04-F8, 04-F31, 05-F22, 05-F34, 08-F32,
 * 03-F28.
 *
 * Before this module, the web export page built its date range from
 * local `Date` components and compared it against a UTC slice of
 * `transacted_at` (so a 7:30pm 31 August dinner in `America/Chicago`
 * exported with the date `2026-09-01`), and its summary header summed
 * `amount_in_profile_currency` while its CSV/PDF rows printed the raw
 * `amount` column — so a spreadsheet sum of the exported rows never
 * equaled the total printed above them, in the same document. The
 * mobile export built its own transaction list from scratch and never
 * included recurring rules, profile, or categories at all.
 *
 * This module fixes both classes of bug structurally: every date
 * (range bounds and the per-row date column) resolves through
 * `packages/shared/src/utils/period.ts` (fix-plan 1.3) in the
 * profile's own zone, and the header total is computed from the exact
 * same `amount_in_profile_currency` column the rows print (via
 * `packages/shared/src/domain/money.ts`'s `summarize()`, fix-plan 1.4)
 * — so the two numbers cannot diverge. `buildExport()` is the one
 * assembly point both platforms call; `exportSummaryJSON()` is the one
 * canonical JSON shape both platforms' JSON export button produces, so
 * "the same top-level keys on both platforms" is true by construction
 * rather than by two hand-maintained shapes staying in sync.
 */

import { addDays, civilDateTimeToInstant, localDay, localParts } from '../utils/period'
import { summarize, type CategoryKind, type MoneySummary } from './money'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Parses a `YYYY-MM-DD` local-day string. Plain string parsing, not a
 *  calendar getter — the restricted-syntax rule (fix-plan 1.1) targets
 *  `Date` getters/setters and multi-arg `Date` construction, neither of
 *  which this does. */
function parseLocalDayStrict(dayIso: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayIso)
  if (!match) throw new Error(`export.ts: "${dayIso}" is not a "YYYY-MM-DD" day`)
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) }
}

/** The structural shape `buildExport()` needs from a transaction —
 *  matches the Supabase row shape (both platforms) plus the local
 *  SQLite mirror's shape, so neither caller needs an adapter. */
export interface ExportableTransaction {
  id: string
  amount: number
  amount_in_profile_currency: number | null
  currency_code: string | null
  direction: 'debit' | 'credit'
  merchant: string | null
  note: string | null
  category_id: string | null
  category_kind?: CategoryKind | null
  payment_method: string | null
  source: string | null
  is_recurring?: boolean | null
  transacted_at: string
  fx_rate_to_profile?: number | null
  fx_rate_date?: string | null
}

export interface ExportCategory {
  id: string
  name: string
}

export interface ExportRecurringRule {
  id: string
  name: string | null
  amount: number
  currency_code?: string | null
  direction: 'debit' | 'credit'
  frequency: string
  is_active: boolean
}

export interface ExportProfile {
  currency_code: string
  locale: string
  /** IANA zone (fix-plan 1.3). Every date below — the range bounds and
   *  each row's own date/time — resolves in this zone, never in the
   *  server's or the browser's own. */
  timezone: string
}

/** One row, already normalized for rendering — a caller formats these
 *  into CSV/JSON/PDF cells without touching a `Date` itself. `amount`/
 *  `currency` are the transaction's own (possibly foreign) currency —
 *  right for "what did I pay" — and `amountInProfileCurrency` is the
 *  converted figure the summary header sums; a renderer that emits
 *  both columns lets a reader's spreadsheet-sum of the converted column
 *  reconcile with the printed total (05-F22/05-F34's fix). */
export interface ExportRow {
  /** Local civil day (`YYYY-MM-DD`) in `profile.timezone`. */
  date: string
  /** Local time (`HH:MM`) in `profile.timezone`. */
  time: string
  merchant: string
  category: string
  direction: 'debit' | 'credit'
  amount: number
  currency: string
  amountInProfileCurrency: number | null
  fxRate: number | null
  fxDate: string | null
  paymentMethod: string
  source: string
  note: string
  isRecurring: boolean
}

export interface BuildExportInput {
  profile: ExportProfile
  transactions: ExportableTransaction[]
  categories: ExportCategory[]
  recurringRules?: ExportRecurringRule[]
  /** Inclusive local-day bounds (`YYYY-MM-DD`), in `profile.timezone` —
   *  exactly what a `<input type="date">` or a native date picker
   *  already hands the caller; this module does the zone-aware instant
   *  conversion, not the caller. */
  dateFrom: string
  dateTo: string
}

export interface ExportResult {
  profile: ExportProfile
  dateRange: { from: string; to: string }
  rows: ExportRow[]
  /** Computed via `summarize()` over the *same* filtered set the rows
   *  come from (fix-plan 1.4) — this is what makes the header total and
   *  a spreadsheet sum of `rows[].amountInProfileCurrency` provably
   *  equal, rather than two independently-hand-rolled sums. */
  summary: MoneySummary
  categories: ExportCategory[]
  recurringRules: ExportRecurringRule[]
  generatedAt: string
}

/**
 * The one export-assembly entry point. Filters `transactions` to the
 * half-open instant window `[dateFrom 00:00, dateTo+1 00:00)` in
 * `profile.timezone`, builds one normalized `ExportRow` per
 * transaction, and computes the summary `summarize()` over the exact
 * same filtered set — so the header and the rows can never disagree.
 */
export function buildExport(input: BuildExportInput): ExportResult {
  const tz = input.profile.timezone || 'UTC'
  const catNameById = new Map(input.categories.map((c) => [c.id, c.name]))

  const from = parseLocalDayStrict(input.dateFrom)
  const to = parseLocalDayStrict(input.dateTo)
  const startInstant = civilDateTimeToInstant(from.y, from.m, from.d, 0, 0, 0, tz)
  const dayAfterTo = addDays(to.y, to.m, to.d, 1)
  const endExclusiveInstant = civilDateTimeToInstant(dayAfterTo.y, dayAfterTo.m, dayAfterTo.d, 0, 0, 0, tz)

  const inRange = input.transactions.filter(
    (t) => t.transacted_at >= startInstant && t.transacted_at < endExclusiveInstant,
  )

  const rows: ExportRow[] = inRange
    .slice()
    .sort((a, b) => a.transacted_at.localeCompare(b.transacted_at))
    .map((t) => {
      const parts = localParts(t.transacted_at, tz)
      return {
        date: localDay(t.transacted_at, tz),
        time: `${pad2(parts.hour)}:${pad2(parts.minute)}`,
        merchant: t.merchant ?? '',
        category: t.category_id ? catNameById.get(t.category_id) ?? '' : '',
        direction: t.direction,
        amount: t.amount,
        currency: t.currency_code || input.profile.currency_code,
        amountInProfileCurrency: t.amount_in_profile_currency,
        fxRate: t.fx_rate_to_profile ?? null,
        fxDate: t.fx_rate_date ?? null,
        paymentMethod: t.payment_method ?? '',
        source: t.source ?? '',
        note: t.note ?? '',
        isRecurring: !!t.is_recurring,
      }
    })

  const summary = summarize(
    inRange.map((t) => ({
      amount_in_profile_currency: t.amount_in_profile_currency,
      direction: t.direction,
      transacted_at: t.transacted_at,
      category_id: t.category_id,
      category_name: t.category_id ? catNameById.get(t.category_id) ?? null : null,
      category_kind: t.category_kind ?? null,
    })),
  )

  return {
    profile: input.profile,
    dateRange: { from: input.dateFrom, to: input.dateTo },
    rows,
    summary,
    categories: input.categories,
    recurringRules: input.recurringRules ?? [],
    generatedAt: new Date().toISOString(),
  }
}

/** The one canonical JSON export shape. Both platforms' JSON export
 *  button calls this on their own `buildExport()` result, so the two
 *  files are guaranteed to carry the same top-level keys — including
 *  `recurring_rules`/`categories`, which the mobile export omitted
 *  entirely before this item (a caller with nothing to report there
 *  still gets the key, with an empty array, rather than a missing
 *  key). */
export function exportSummaryJSON(result: ExportResult): Record<string, unknown> {
  return {
    app: 'Murmur',
    version: 1,
    exported_at: result.generatedAt,
    currency: result.profile.currency_code,
    locale: result.profile.locale,
    date_range: result.dateRange,
    summary: {
      income: result.summary.income,
      expense: result.summary.expense,
      transfers: result.summary.transfers,
      saved: result.summary.saved,
      transaction_count: result.summary.transactionCount,
      pending_conversion_count: result.summary.pendingCount,
    },
    transactions: result.rows.map((r) => ({
      date: r.date,
      time: r.time,
      amount: r.amount,
      currency: r.currency,
      amount_in_profile_currency: r.amountInProfileCurrency,
      fx_rate: r.fxRate,
      fx_date: r.fxDate,
      direction: r.direction,
      category: r.category || null,
      merchant: r.merchant || null,
      payment_method: r.paymentMethod || null,
      source: r.source || null,
      note: r.note || null,
      is_recurring: r.isRecurring,
    })),
    categories: result.categories.map((c) => ({ id: c.id, name: c.name })),
    recurring_rules: result.recurringRules,
  }
}
