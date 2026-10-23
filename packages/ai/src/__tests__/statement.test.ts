import { describe, expect, it } from 'vitest'
import { validateStatementRows } from '../statement'

const TODAY = '2026-10-23'

describe('validateStatementRows', () => {
  it('keeps well-formed rows and normalises them', () => {
    const r = validateStatementRows(
      {
        currency: 'usd',
        transactions: [
          {
            date: '2026-03-04',
            description: '  POS PURCHASE   WALMART #1234 ',
            amount: 42.129,
            direction: 'debit',
            is_transfer: false,
          },
          {
            date: '2026-03-05',
            description: 'PAYROLL',
            amount: -1500,
            direction: 'credit',
            is_transfer: false,
          },
          {
            date: '2026-03-06',
            description: 'ONLINE PAYMENT TO CARD',
            amount: 300,
            direction: 'debit',
            is_transfer: true,
          },
        ],
      },
      TODAY,
    )
    expect(r.currency).toBe('USD')
    expect(r.dropped).toBe(0)
    expect(r.rows).toEqual([
      {
        day: '2026-03-04',
        description: 'POS PURCHASE WALMART #1234',
        amount: 42.13,
        direction: 'debit',
        transfer: false,
      },
      {
        day: '2026-03-05',
        description: 'PAYROLL',
        amount: 1500,
        direction: 'credit',
        transfer: false,
      },
      {
        day: '2026-03-06',
        description: 'ONLINE PAYMENT TO CARD',
        amount: 300,
        direction: 'debit',
        transfer: true,
      },
    ])
  })

  it('drops impossible dates, future days, zero or huge amounts and unknown directions', () => {
    const bad = [
      { date: '2026-02-30', amount: 5, direction: 'debit' },
      { date: '03/04/2026', amount: 5, direction: 'debit' },
      { date: '2026-10-25', amount: 5, direction: 'debit' },
      { date: '1999-12-31', amount: 5, direction: 'debit' },
      { date: '2026-03-04', amount: 0.001, direction: 'debit' },
      { date: '2026-03-04', amount: 10_000_000, direction: 'debit' },
      { date: '2026-03-04', amount: '5', direction: 'debit' },
      { date: '2026-03-04', amount: 5, direction: 'out' },
      null,
    ]
    const r = validateStatementRows({ currency: 'dollars', transactions: bad }, TODAY)
    expect(r.rows).toEqual([])
    expect(r.dropped).toBe(bad.length)
    expect(r.currency).toBeNull()
  })

  it('returns nothing for a non-statement answer', () => {
    expect(validateStatementRows(null, TODAY)).toEqual({ currency: null, rows: [], dropped: 0 })
    expect(validateStatementRows({ transactions: 'x' }, TODAY).rows).toEqual([])
  })
})
