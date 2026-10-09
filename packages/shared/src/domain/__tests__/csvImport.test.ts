import { describe, it, expect } from 'vitest'
import {
  parseCsv,
  parseAmount,
  parseDate,
  detectDateOrder,
  detectDecimalMark,
  hasHeaderRow,
  detectColumns,
  detectSignConvention,
  buildImportRows,
  findDuplicates,
  importTransaction,
  descriptorsToIdentify,
} from '../csvImport'

describe('parseCsv', () => {
  it('quotes, doubled quotes, embedded commas and newlines, CRLF, BOM', () => {
    const rows = parseCsv('﻿Date,Description,Amount\r\n10/05/2026,"STARBUCKS, #12 ""DT""",-4.50\r\n10/06/2026,"Line\nbreak",12\r\n')
    expect(rows).toEqual([
      ['Date', 'Description', 'Amount'],
      ['10/05/2026', 'STARBUCKS, #12 "DT"', '-4.50'],
      ['10/06/2026', 'Line\nbreak', '12'],
    ])
  })

  it('semicolon and tab delimiters', () => {
    expect(parseCsv('a;b;c\n1;2;3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('skips blank lines', () => {
    expect(parseCsv('a,b\n\n1,2\n,\n')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('parseAmount', () => {
  it.each([
    ['-12.50', -12.5],
    ['$1,234.56', 1234.56],
    ['(45.00)', -45],
    ['12.50-', -12.5],
    ['-$8.00', -8],
    ['100.00 DR', -100],
    ['100.00 CR', 100],
    ['−12.00', -12],
  ])('%s', (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected)
  })

  it('comma decimals', () => {
    expect(parseAmount('1.234,56', ',')).toBe(1234.56)
    expect(parseAmount('-12,50 €', ',')).toBe(-12.5)
  })

  it('nothing numeric is null', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('n/a')).toBeNull()
  })
})

describe('detectDecimalMark', () => {
  it('reads the file', () => {
    expect(detectDecimalMark(['12,50', '1.234,00', '3,10'])).toBe(',')
    expect(detectDecimalMark(['12.50', '1,234.00'])).toBe('.')
  })
})

describe('dates', () => {
  it('order from the column', () => {
    expect(detectDateOrder(['13/02/2026', '01/03/2026'])).toBe('dmy')
    expect(detectDateOrder(['02/13/2026', '03/01/2026'])).toBe('mdy')
    expect(detectDateOrder(['2026-02-13'])).toBe('ymd')
    expect(detectDateOrder(['01/02/2026'], 'en')).toBe('mdy')
    expect(detectDateOrder(['01/02/2026'], 'fr')).toBe('dmy')
  })

  it.each([
    ['2026-10-05', 'ymd', '2026-10-05'],
    ['10/05/2026', 'mdy', '2026-10-05'],
    ['05/10/2026', 'dmy', '2026-10-05'],
    ['05.10.2026', 'dmy', '2026-10-05'],
    ['5/10/26', 'dmy', '2026-10-05'],
    ['Oct 5, 2026', 'mdy', '2026-10-05'],
    ['5 oct. 2026', 'dmy', '2026-10-05'],
    ['5 août 2026', 'dmy', '2026-08-05'],
    ['2026-10-05T14:22:00Z', 'ymd', '2026-10-05'],
  ] as const)('%s (%s)', (raw, order, expected) => {
    expect(parseDate(raw, order)).toBe(expected)
  })

  it('an impossible date is null', () => {
    expect(parseDate('02/30/2026', 'mdy')).toBeNull()
    expect(parseDate('hello', 'mdy')).toBeNull()
  })
})

describe('columns', () => {
  it('a header-named file (Chase style)', () => {
    const rows = parseCsv(
      'Details,Posting Date,Description,Amount,Type,Balance\nDEBIT,10/05/2026,STARBUCKS #04412,-4.50,DEBIT_CARD,1000\nCREDIT,10/06/2026,PAYROLL ACME,2000.00,ACH_CREDIT,3000',
    )
    expect(hasHeaderRow(rows)).toBe(true)
    const m = detectColumns(rows, true)
    expect(m.date).toBe(1)
    expect(m.amount).toBe(3)
    expect(m.description).toBe(2)
  })

  it('debit and credit columns', () => {
    const rows = parseCsv('Date,Description,Debit,Credit\n2026-10-05,Coffee,4.50,\n2026-10-06,Salary,,2000')
    const m = detectColumns(rows, true)
    expect([m.debit, m.credit, m.amount]).toEqual([2, 3, null])
    const { rows: out } = buildImportRows(rows, { header: true, mapping: m, dateOrder: 'ymd', decimalMark: '.', sign: 'negative_is_expense' })
    expect(out.map((r) => [r.direction, r.amount])).toEqual([['debit', 4.5], ['credit', 2000]])
  })

  it('no header: columns from the values', () => {
    const rows = parseCsv('10/05/2026,-4.50,STARBUCKS STORE 123\n10/06/2026,-60.10,SHELL OIL 5744')
    expect(hasHeaderRow(rows)).toBe(false)
    const m = detectColumns(rows, false)
    expect([m.date, m.amount, m.description]).toEqual([0, 1, 2])
  })

  it('a category column is picked up', () => {
    const rows = parseCsv('Date,Merchant,Category,Amount\n2026-10-05,Whole Foods,Groceries,-80')
    expect(detectColumns(rows, true).category).toBe(2)
  })
})

describe('buildImportRows', () => {
  const rows = parseCsv('Date,Description,Amount\n10/05/2026,Coffee,-4.50\n10/06/2026,Refund,12.00\nbad,Nope,-1\n10/07/2026,Zero,0.00\n10/08/2026,NoAmount,')
  const mapping = detectColumns(rows, true)

  it('signs, skips and lines', () => {
    const { rows: out, skipped } = buildImportRows(rows, { header: true, mapping, dateOrder: 'mdy', decimalMark: '.', sign: 'negative_is_expense' })
    expect(out).toEqual([
      { line: 2, day: '2026-10-05', amount: 4.5, direction: 'debit', description: 'Coffee', category: null },
      { line: 3, day: '2026-10-06', amount: 12, direction: 'credit', description: 'Refund', category: null },
    ])
    expect(skipped).toEqual([
      { line: 4, reason: 'no_date' },
      { line: 5, reason: 'zero' },
      { line: 6, reason: 'no_amount' },
    ])
  })

  it('all positive amounts read as expenses by default', () => {
    expect(detectSignConvention([4.5, 12])).toBe('all_expenses')
    expect(detectSignConvention([-4.5, 12])).toBe('negative_is_expense')
  })
})

describe('findDuplicates', () => {
  const row = (line: number, day: string, amount: number) => ({ line, day, amount, direction: 'debit' as const, description: '', category: null })

  it('a logged purchase posted two days later is the same money', () => {
    const dup = findDuplicates([row(2, '2026-10-07', 12.5)], [{ day: '2026-10-05', amount: 12.5, direction: 'debit' }])
    expect([...dup]).toEqual([2])
  })

  it('three days apart, a different amount or direction are not', () => {
    expect(findDuplicates([row(2, '2026-10-08', 12.5)], [{ day: '2026-10-05', amount: 12.5, direction: 'debit' }]).size).toBe(0)
    expect(findDuplicates([row(2, '2026-10-05', 12.51)], [{ day: '2026-10-05', amount: 12.5, direction: 'debit' }]).size).toBe(0)
    expect(findDuplicates([row(2, '2026-10-05', 12.5)], [{ day: '2026-10-05', amount: 12.5, direction: 'credit' }]).size).toBe(0)
  })

  it('each existing transaction answers for one row', () => {
    const dup = findDuplicates([row(2, '2026-10-05', 4.5), row(3, '2026-10-05', 4.5)], [{ day: '2026-10-05', amount: 4.5, direction: 'debit' }])
    expect(dup.size).toBe(1)
  })

  it('importing the same file twice holds back every row', () => {
    const first = [row(2, '2026-10-05', 4.5), row(3, '2026-10-06', 9)]
    const existing = first.map((r) => ({ day: r.day, amount: r.amount, direction: r.direction }))
    expect(findDuplicates(first, existing).size).toBe(2)
  })
})

describe('importTransaction', () => {
  const cat = (id: string, name: string) => ({ id, name, name_normalized: name.toLowerCase() }) as never
  const categories = [cat('g', 'Groceries'), cat('c', 'Coffee'), cat('t', 'Transport')]
  const ctx = {
    userId: 'u',
    categories,
    rules: [{ merchant_key: 'starbucks', merchant_name: 'Starbucks', category_id: 'g' }],
    currency: 'USD',
    tz: 'America/Chicago',
    nowIso: '2026-10-08T00:00:00Z',
    newId: () => 'id-1',
  }
  const row = { line: 2, day: '2026-10-05', amount: 4.5, direction: 'debit' as const, description: 'STARBUCKS #04412', category: null }

  it('names it, dates it at local noon, files it, marks it imported', () => {
    const t = importTransaction(row, { merchant: 'Starbucks', merchant_domain: 'starbucks.com', category: 'Coffee' }, ctx)
    expect(t.merchant).toBe('Starbucks')
    expect(t.merchant_domain).toBe('starbucks.com')
    expect(t.transacted_at).toBe('2026-10-05T17:00:00.000Z')
    expect(t.local_day).toBe('2026-10-05')
    expect(t.source).toBe('import')
    expect(t.amount_in_profile_currency).toBe(4.5)
  })

  it('a learned category beats the AI; the file\'s own category beats both', () => {
    expect(importTransaction(row, { merchant: 'Starbucks', merchant_domain: null, category: 'Coffee' }, ctx).category_id).toBe('g')
    expect(importTransaction({ ...row, category: 'Transport' }, undefined, ctx).category_id).toBe('t')
  })

  it('no AI answer: the cleaned descriptor and the local guess', () => {
    const t = importTransaction({ ...row, description: 'SHELL OIL 57444091309' }, undefined, { ...ctx, rules: [] })
    expect(t.merchant).toMatch(/^Shell/)
    expect(t.merchant).not.toMatch(/\d/)
  })
})

describe('descriptorsToIdentify', () => {
  it('distinct, most frequent first', () => {
    const r = (d: string) => ({ line: 1, day: '2026-01-01', amount: 1, direction: 'debit' as const, description: d, category: null })
    expect(descriptorsToIdentify([r('A'), r('B'), r('B'), r(''), r('A'), r('B')])).toEqual(['B', 'A'])
  })
})
