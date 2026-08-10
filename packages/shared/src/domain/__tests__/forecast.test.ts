import { describe, it, expect } from 'vitest'
import { forecastMonthly, monthlyAverage, type ForecastTxn, type ForecastRule } from '../forecast'

function txn(overrides: Partial<ForecastTxn> = {}): ForecastTxn {
  return {
    amount_in_profile_currency: 50,
    direction: 'debit',
    transacted_at: '2026-08-15T12:00:00Z',
    category_id: 'cat-food',
    category_name: 'Food & Dining',
    ...overrides,
  }
}

describe('monthlyAverage — bounded by first transaction, zero months kept (05-F36/05-F37)', () => {
  it('[100, 0, 200] with a first transaction in month 1 (the middle month) averages 100, not 100/3', () => {
    const { avg, monthsCovered } = monthlyAverage(
      [
        { monthIso: '2026-06', total: 100 },
        { monthIso: '2026-07', total: 0 },
        { monthIso: '2026-08', total: 200 },
      ],
      '2026-07',
    )
    expect(avg).toBe(100)
    expect(monthsCovered).toBe(2)
  })

  it('with no first-transaction bound, every month counts', () => {
    const { avg, monthsCovered } = monthlyAverage(
      [
        { monthIso: '2026-06', total: 100 },
        { monthIso: '2026-07', total: 0 },
        { monthIso: '2026-08', total: 200 },
      ],
      null,
    )
    expect(avg).toBe(100)
    expect(monthsCovered).toBe(3)
  })
})

describe('forecastMonthly — confidence gate (2.11 "Done when")', () => {
  it('three transactions on one day render no forecast (not confident)', () => {
    const txns: ForecastTxn[] = [
      txn({ transacted_at: '2026-08-15T09:00:00Z', amount_in_profile_currency: 10 }),
      txn({ transacted_at: '2026-08-15T12:00:00Z', amount_in_profile_currency: 20 }),
      txn({ transacted_at: '2026-08-15T18:00:00Z', amount_in_profile_currency: 5 }),
    ]
    const result = forecastMonthly(txns, [], '2026-08-15T20:00:00Z', 'UTC')
    expect(result.confident).toBe(false)
    expect(result.projected).toBeNull()
    expect(result.range).toBeNull()
    // Actual month-to-date is still reported — it's a fact, not a claim.
    expect(result.monthToDate).toBe(35)
  })

  it('≥1 complete prior month and dayOfMonth ≥ 10 is confident', () => {
    const txns: ForecastTxn[] = []
    // A complete prior month (July) with enough spend to register.
    for (let d = 1; d <= 20; d++) {
      txns.push(txn({ transacted_at: `2026-07-${String(d).padStart(2, '0')}T12:00:00Z`, amount_in_profile_currency: 10 }))
    }
    txns.push(txn({ transacted_at: '2026-08-05T12:00:00Z', amount_in_profile_currency: 20 }))
    const result = forecastMonthly(txns, [], '2026-08-12T12:00:00Z', 'UTC')
    expect(result.sampleMonths).toBeGreaterThanOrEqual(1)
    expect(result.confident).toBe(true)
    expect(result.projected).not.toBeNull()
    expect(result.range).not.toBeNull()
  })

  it('1 complete prior month but dayOfMonth < 10 and < 10 distinct spending days is not confident', () => {
    const txns: ForecastTxn[] = []
    for (let d = 1; d <= 20; d++) {
      txns.push(txn({ transacted_at: `2026-07-${String(d).padStart(2, '0')}T12:00:00Z`, amount_in_profile_currency: 10 }))
    }
    txns.push(txn({ transacted_at: '2026-08-03T12:00:00Z', amount_in_profile_currency: 20 }))
    const result = forecastMonthly(txns, [], '2026-08-05T12:00:00Z', 'UTC')
    expect(result.confident).toBe(false)
  })

  it('a Savings & Investing transfer is excluded from monthToDate, same as every other totals surface', () => {
    const txns: ForecastTxn[] = [
      txn({ transacted_at: '2026-08-05T12:00:00Z', amount_in_profile_currency: 40, category_id: 'cat-food' }),
      txn({
        transacted_at: '2026-08-06T12:00:00Z',
        amount_in_profile_currency: 300,
        category_id: 'cat-save',
        category_name: 'Savings & Investing',
      }),
    ]
    const result = forecastMonthly(txns, [], '2026-08-07T12:00:00Z', 'UTC')
    expect(result.monthToDate).toBe(40)
  })

  it('recurringCommitted(remaining) adds a not-yet-due monthly bill to the projection', () => {
    const rule: ForecastRule = {
      frequency: 'monthly',
      interval: 1,
      starts_at: '2026-01-28T00:00:00Z',
      ends_at: null,
      amount: 100,
      direction: 'debit',
    }
    const txns: ForecastTxn[] = []
    for (let m = 1; m <= 3; m++) {
      for (let d = 1; d <= 15; d++) {
        txns.push(
          txn({
            transacted_at: `2026-0${m}-${String(d).padStart(2, '0')}T12:00:00Z`,
            amount_in_profile_currency: 5,
          }),
        )
      }
    }
    const withoutRule = forecastMonthly(txns, [], '2026-04-15T12:00:00Z', 'UTC')
    const withRule = forecastMonthly(txns, [rule], '2026-04-15T12:00:00Z', 'UTC')
    expect(withRule.confident).toBe(true)
    // The rule's 28th-of-the-month occurrence hasn't happened yet as of
    // the 15th, so it must be priced into the projection on top of the
    // variable-spend baseline.
    expect(withRule.projected!).toBeGreaterThan(withoutRule.projected!)
  })
})
