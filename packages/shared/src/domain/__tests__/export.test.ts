import { describe, it, expect } from 'vitest'
import { buildExport, exportSummaryJSON, type ExportableTransaction } from '../export'

const CHICAGO_PROFILE = { currency_code: 'USD', locale: 'en', timezone: 'America/Chicago' }

function txn(overrides: Partial<ExportableTransaction> = {}): ExportableTransaction {
  return {
    id: 'txn-1',
    amount: 50,
    amount_in_profile_currency: 50,
    currency_code: 'USD',
    direction: 'debit',
    merchant: 'Starbucks',
    note: null,
    category_id: 'cat-food',
    payment_method: null,
    source: 'manual',
    is_recurring: false,
    transacted_at: '2026-08-15T12:00:00Z',
    ...overrides,
  }
}

describe('buildExport — 2026-09-01T01:00:00Z reads as 2026-08-31 in America/Chicago (04-F8)', () => {
  const result = buildExport({
    profile: CHICAGO_PROFILE,
    transactions: [
      txn({ id: 'late-aug', transacted_at: '2026-09-01T01:00:00Z', amount: 40, amount_in_profile_currency: 40 }),
    ],
    categories: [{ id: 'cat-food', name: 'Food & Dining' }],
    dateFrom: '2026-08-01',
    dateTo: '2026-08-31',
  })

  it('the row prints the local day, not the UTC day', () => {
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].date).toBe('2026-08-31')
  })

  it('is included in a 1–31 August range', () => {
    expect(result.summary.transactionCount).toBe(1)
  })

  it('is excluded once the range no longer covers it (1–31 July)', () => {
    const july = buildExport({
      profile: CHICAGO_PROFILE,
      transactions: [txn({ transacted_at: '2026-09-01T01:00:00Z' })],
      categories: [],
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
    })
    expect(july.rows).toHaveLength(0)
  })
})

describe('buildExport — the row column reconciles with the header total (05-F22/05-F34)', () => {
  it('sum of amountInProfileCurrency equals summary.expense exactly, across currencies', () => {
    const result = buildExport({
      profile: CHICAGO_PROFILE,
      transactions: [
        txn({ id: 'a', amount: 50, amount_in_profile_currency: 50, currency_code: 'USD' }),
        // A EUR dinner — the row's own `amount` stays 45 (EUR), but the
        // converted column (and therefore the header total) uses the FX
        // snapshot, never the raw foreign-currency figure.
        txn({ id: 'b', amount: 45, amount_in_profile_currency: 48.6, currency_code: 'EUR' }),
      ],
      categories: [],
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
    })
    const rowSum = result.rows.reduce((s, r) => s + (r.amountInProfileCurrency ?? 0), 0)
    expect(rowSum).toBe(result.summary.expense)
    expect(result.summary.expense).toBe(98.6)
    // The row itself still shows the transaction's own currency — never
    // silently converted in the primary Amount column.
    expect(result.rows.find((r) => r.currency === 'EUR')?.amount).toBe(45)
  })

  it('a Savings & Investing transfer is excluded from the header total, same as every other totals surface (1.4)', () => {
    const result = buildExport({
      profile: CHICAGO_PROFILE,
      transactions: [
        txn({ id: 'spend', amount: 50, amount_in_profile_currency: 50, category_id: 'cat-food' }),
        txn({ id: 'transfer', amount: 300, amount_in_profile_currency: 300, category_id: 'cat-save' }),
      ],
      categories: [
        { id: 'cat-food', name: 'Food & Dining' },
        { id: 'cat-save', name: 'Savings & Investing' },
      ],
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
    })
    expect(result.summary.expense).toBe(50)
    expect(result.summary.transfers).toBe(300)
    // Both rows still print — the transfer isn't hidden from the export,
    // only from the "expense" total.
    expect(result.rows).toHaveLength(2)
  })

  it('an FX-pending row (no amount_in_profile_currency) is excluded from the total and counted as pending, not silently zero', () => {
    const result = buildExport({
      profile: CHICAGO_PROFILE,
      transactions: [
        txn({ id: 'ok', amount: 50, amount_in_profile_currency: 50 }),
        txn({ id: 'pending', amount: 20, amount_in_profile_currency: null }),
      ],
      categories: [],
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
    })
    expect(result.summary.expense).toBe(50)
    expect(result.summary.pendingCount).toBe(1)
  })
})

describe('exportSummaryJSON — the one shape both platforms produce (08-F32)', () => {
  it('has a fixed top-level key set regardless of what the caller supplied', () => {
    const bare = exportSummaryJSON(
      buildExport({
        profile: CHICAGO_PROFILE,
        transactions: [],
        categories: [],
        dateFrom: '2026-08-01',
        dateTo: '2026-08-31',
      }),
    )
    const withRules = exportSummaryJSON(
      buildExport({
        profile: CHICAGO_PROFILE,
        transactions: [txn()],
        categories: [{ id: 'cat-food', name: 'Food & Dining' }],
        recurringRules: [
          { id: 'r1', name: 'Netflix', amount: 15.49, direction: 'debit', frequency: 'monthly', is_active: true },
        ],
        dateFrom: '2026-08-01',
        dateTo: '2026-08-31',
      }),
    )
    const expectedKeys = [
      'app',
      'version',
      'exported_at',
      'currency',
      'locale',
      'date_range',
      'summary',
      'transactions',
      'categories',
      'recurring_rules',
    ].sort()
    expect(Object.keys(bare).sort()).toEqual(expectedKeys)
    expect(Object.keys(withRules).sort()).toEqual(expectedKeys)
    // A caller with nothing to report still gets the key, empty — never
    // a missing key (this is what let the mobile export omit recurring
    // rules entirely pre-2.15).
    expect((bare as { recurring_rules: unknown[] }).recurring_rules).toEqual([])
    expect((withRules as { recurring_rules: unknown[] }).recurring_rules).toHaveLength(1)
  })
})
