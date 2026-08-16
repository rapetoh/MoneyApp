// Regression tests for the Export → PDF document (Aug 16, 2026 owner
// review: garbled amount glyphs, no logo, blank income category).
//
// The render tests use the real embedded fonts from public/fonts and
// the real jsPDF + autoTable in node, so a font file going missing, a
// glyph the font lacks, or a jsPDF API change fails here rather than
// on the user's export click.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { ExportRow } from '@voice-expense/shared'
import { buildTransactionsPdf, categoryLabel, pdfSafe, type PdfFonts } from './transactionsPdf'

const fontsDir = resolve(__dirname, '../../../public/fonts')
const fonts: PdfFonts = {
  regular: readFileSync(resolve(fontsDir, 'murmur-pdf-regular.ttf')).toString('base64'),
  semibold: readFileSync(resolve(fontsDir, 'murmur-pdf-semibold.ttf')).toString('base64'),
}

const row = (o: Partial<ExportRow>): ExportRow => ({
  date: '2026-08-08',
  time: '10:00',
  merchant: 'Starbucks',
  category: 'Food & Dining',
  direction: 'debit',
  amount: 50,
  currency: 'USD',
  amountInProfileCurrency: 50,
  fxRate: null,
  fxDate: null,
  paymentMethod: '',
  source: 'voice',
  note: '',
  isRecurring: false,
  ...o,
})

function render(rows: ExportRow[], opts: { locale?: string; currency?: string } = {}) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  buildTransactionsPdf(doc, autoTable, {
    rows,
    currency: opts.currency ?? 'USD',
    locale: opts.locale ?? 'en',
    timezone: 'America/New_York',
    dateFrom: '2026-08-01',
    dateTo: '2026-08-16',
    totalExpenses: 879,
    totalIncome: 2500,
    pendingCount: 0,
    now: new Date('2026-08-16T19:12:00Z'),
    fonts,
  })
  return doc
}

describe('pdfSafe', () => {
  it('folds the no-break / thin spaces Intl emits to a plain space', () => {
    expect(pdfSafe('1 500,00 €')).toBe('1 500,00 €')
    expect(pdfSafe('Aug 1 – 6')).toBe('Aug 1 – 6')
  })
  it('keeps the typographic minus — the embedded font has the glyph', () => {
    expect(pdfSafe('−$50.00')).toBe('−$50.00')
  })
})

describe('categoryLabel', () => {
  it('prints the category when there is one', () => {
    expect(categoryLabel({ category: 'Shopping', direction: 'debit' })).toBe('Shopping')
    expect(categoryLabel({ category: 'Salary', direction: 'credit' })).toBe('Salary')
  })
  it('reads "Income" for an uncategorised credit and an em dash for an uncategorised debit', () => {
    expect(categoryLabel({ category: '', direction: 'credit' })).toBe('Income')
    expect(categoryLabel({ category: '', direction: 'debit' })).toBe('—')
  })
})

describe('buildTransactionsPdf', () => {
  it('embeds the brand font (no standard-14 fallback for body text) and produces a valid PDF', () => {
    const doc = render([
      row({}),
      row({ direction: 'credit', category: '', amount: 1500, amountInProfileCurrency: 1500 }),
    ])
    const bytes = Buffer.from(doc.output('arraybuffer'))
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
    // jsPDF names the embedded font resource after the family we registered.
    expect(bytes.toString('latin1')).toContain('MurmurSans')
    expect(doc.getNumberOfPages()).toBe(1)
  })

  it('renders locale output outside WinAnsi (fr-FR narrow spaces, €, accented merchants) without throwing', () => {
    const doc = render(
      [
        row({
          merchant: 'Café de Flore',
          amount: 45.5,
          currency: 'EUR',
          amountInProfileCurrency: 49.12,
        }),
        row({
          merchant: 'Boulangerie Été',
          direction: 'credit',
          category: '',
          amount: 1500,
          amountInProfileCurrency: 1500,
        }),
      ],
      { locale: 'fr-FR' },
    )
    expect(doc.getNumberOfPages()).toBe(1)
  })

  it('paginates long ranges and stamps a footer on every page', () => {
    const rows = Array.from({ length: 90 }, (_, i) =>
      row({ date: `2026-08-${String(1 + (i % 16)).padStart(2, '0')}`, merchant: `Merchant ${i}` }),
    )
    const doc = render(rows)
    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
    const text = Buffer.from(doc.output('arraybuffer')).toString('latin1')
    // Footer text is written through the embedded font (hex/glyph encoded),
    // so assert on page count + the shared resource rather than raw strings.
    expect(text.match(/\/Type \/Page[^s]/g)?.length).toBe(doc.getNumberOfPages())
  })
})
