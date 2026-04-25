import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import * as Print from 'expo-print'
import type { Transaction, Category, Locale } from '@voice-expense/shared'
import { t } from '@voice-expense/shared'

/**
 * Murmur Plus — Data export.
 *
 * Three formats:
 *   - CSV — for spreadsheet apps. Locale-aware decimal separator is
 *     intentionally NOT applied: most spreadsheet imports expect dot
 *     decimals + comma column separator regardless of UI locale, and a
 *     CSV that opens cleanly in Excel/Numbers/Sheets is more useful than
 *     one that mirrors the UI.
 *   - JSON — for power users + portability to other tools.
 *   - PDF — formatted, human-readable. Renders an HTML table to PDF via
 *     `expo-print`'s WebKit backend (iOS) / Android print framework
 *     (Android). Large tables are paginated by the rendering engine.
 *
 * Each format is written to the system cache directory then handed to the
 * native share sheet via `expo-sharing`. The user picks the destination
 * (Mail, Files, AirDrop, Messages, etc.) — Murmur never uploads any of it.
 *
 * Export is Plus-gated; that gate runs at the call site, not here. This
 * module is pure formatting + IO.
 */

interface ExportInput {
  transactions: Transaction[]
  categories: Category[]
  locale: Locale
  currency: string
}

function categoryNameById(categories: Category[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const c of categories) m.set(c.id, c.name)
  return m
}

function escapeCSV(field: string | number | null): string {
  if (field == null) return ''
  const s = String(field)
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function activeTransactions(t: Transaction[]): Transaction[] {
  return t.filter((tx) => !tx.is_deleted)
}

function todayStamp(): string {
  // Local-time `YYYY-MM-DD` for the filename. Avoids surprising the user
  // with a UTC date that doesn't match their wall clock around midnight.
  const d = new Date()
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

export function buildCSV(input: ExportInput): string {
  const cats = categoryNameById(input.categories)
  const header = [
    'date',
    'amount',
    'currency',
    'direction',
    'category',
    'merchant',
    'note',
    'payment_method',
    'is_recurring',
    'source',
  ]
  const rows = activeTransactions(input.transactions)
    .sort((a, b) => a.transacted_at.localeCompare(b.transacted_at))
    .map((tx) =>
      [
        // ISO date trimmed to YYYY-MM-DD; Excel reads this cleanly.
        tx.transacted_at.split('T')[0],
        tx.amount.toFixed(2),
        tx.currency_code,
        tx.direction,
        tx.category_id ? cats.get(tx.category_id) ?? '' : '',
        tx.merchant ?? '',
        tx.note ?? '',
        tx.payment_method ?? '',
        tx.is_recurring ? '1' : '0',
        tx.source,
      ]
        .map(escapeCSV)
        .join(','),
    )
  return [header.join(','), ...rows].join('\n') + '\n'
}

// ─── JSON ────────────────────────────────────────────────────────────────────

export function buildJSON(input: ExportInput): string {
  const cats = categoryNameById(input.categories)
  const exported_at = new Date().toISOString()
  const items = activeTransactions(input.transactions)
    .sort((a, b) => a.transacted_at.localeCompare(b.transacted_at))
    .map((tx) => ({
      id: tx.id,
      transacted_at: tx.transacted_at,
      amount: tx.amount,
      currency: tx.currency_code,
      direction: tx.direction,
      category: tx.category_id ? cats.get(tx.category_id) ?? null : null,
      merchant: tx.merchant,
      merchant_domain: tx.merchant_domain,
      note: tx.note,
      payment_method: tx.payment_method,
      is_recurring: tx.is_recurring,
      source: tx.source,
    }))
  return JSON.stringify(
    {
      app: 'Murmur',
      version: 1,
      exported_at,
      currency_default: input.currency,
      transactions: items,
    },
    null,
    2,
  )
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

function escapeHTML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function pdfHTML(input: ExportInput, locale: Locale): string {
  const cats = categoryNameById(input.categories)
  const rows = activeTransactions(input.transactions)
    .sort((a, b) => b.transacted_at.localeCompare(a.transacted_at))
    .map((tx) => {
      const date = new Date(tx.transacted_at).toLocaleDateString(locale, {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
      })
      const amount = `${tx.direction === 'credit' ? '+' : ''}${tx.currency_code} ${tx.amount.toFixed(2)}`
      const cat = tx.category_id ? cats.get(tx.category_id) ?? '' : ''
      return `
        <tr>
          <td>${escapeHTML(date)}</td>
          <td>${escapeHTML(tx.merchant ?? '—')}</td>
          <td>${escapeHTML(cat)}</td>
          <td class="num ${tx.direction === 'credit' ? 'credit' : ''}">${escapeHTML(amount)}</td>
        </tr>
      `
    })
    .join('')

  const total = activeTransactions(input.transactions)
    .filter((tx) => tx.direction === 'debit')
    .reduce((s, tx) => s + tx.amount, 0)

  const exported_at = new Date().toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return `<!doctype html>
<html><head><meta charset="utf-8"/>
<style>
  @page { margin: 56pt 48pt; }
  html, body { font-family: -apple-system, "SF Pro Text", system-ui, sans-serif;
    color: #1B1915; -webkit-text-size-adjust: 100%; }
  body { margin: 0; }
  .page { padding: 0; }
  .eyebrow { font-size: 10pt; font-weight: 700; letter-spacing: 1.4pt;
    text-transform: uppercase; color: #6C675E; }
  h1 { font-family: "New York", "Iowan Old Style", Georgia, serif;
    font-weight: 500; font-size: 32pt; letter-spacing: -0.8pt; margin: 6pt 0 4pt;
    line-height: 1.05; }
  .meta { font-size: 10pt; color: #6C675E; }
  .totals { margin-top: 18pt; padding: 12pt 14pt; border-radius: 10pt;
    background: #F5F2EB; display: flex; justify-content: space-between;
    border: 0.5pt solid rgba(40,36,28,0.08); }
  .totals .label { font-size: 9pt; font-weight: 700; letter-spacing: 0.6pt;
    text-transform: uppercase; color: #6C675E; }
  .totals .val { font-family: "New York", Georgia, serif; font-size: 16pt;
    font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 18pt;
    font-size: 9.5pt; }
  th { text-align: left; font-size: 8.5pt; font-weight: 700;
    letter-spacing: 0.5pt; text-transform: uppercase; color: #6C675E;
    padding: 6pt 4pt; border-bottom: 0.5pt solid rgba(40,36,28,0.16); }
  td { padding: 6pt 4pt; border-bottom: 0.5pt solid rgba(40,36,28,0.06);
    color: #1B1915; }
  td.num { font-family: "New York", Georgia, serif; font-feature-settings: "tnum" 1;
    font-weight: 500; text-align: right; }
  td.num.credit { color: #3F5A3E; }
  .footer { margin-top: 18pt; font-size: 9pt; color: #9C9589; }
</style>
</head>
<body><div class="page">
  <div class="eyebrow">${escapeHTML(t('export.pdf_eyebrow', locale))}</div>
  <h1>${escapeHTML(t('export.pdf_title', locale))}</h1>
  <div class="meta">${escapeHTML(exported_at)}</div>
  <div class="totals">
    <div>
      <div class="label">${escapeHTML(t('export.pdf_total_label', locale))}</div>
      <div class="val">${escapeHTML(`${input.currency} ${total.toFixed(2)}`)}</div>
    </div>
    <div>
      <div class="label">${escapeHTML(t('export.pdf_count_label', locale))}</div>
      <div class="val">${activeTransactions(input.transactions).length}</div>
    </div>
  </div>
  <table>
    <thead><tr>
      <th>${escapeHTML(t('export.col_date', locale))}</th>
      <th>${escapeHTML(t('export.col_merchant', locale))}</th>
      <th>${escapeHTML(t('export.col_category', locale))}</th>
      <th style="text-align:right">${escapeHTML(t('export.col_amount', locale))}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">${escapeHTML(t('export.pdf_footer', locale))}</div>
</div></body></html>`
}

// ─── Share-sheet entry ───────────────────────────────────────────────────────

export type ExportFormat = 'csv' | 'json' | 'pdf'

/** Build the chosen format, write it to the cache directory, and hand the
 *  file to the system share sheet. Throws if the share sheet isn't
 *  available on the current platform (e.g. Expo Go without sharing
 *  configured). */
export async function exportAndShare(
  format: ExportFormat,
  input: ExportInput,
): Promise<void> {
  const stamp = todayStamp()
  const filename = `murmur-${stamp}.${format}`

  let uri: string
  let mimeType: string

  if (format === 'pdf') {
    // expo-print writes the PDF to a temporary file and returns its URI.
    const html = pdfHTML(input, input.locale)
    const result = await Print.printToFileAsync({ html })
    // Wrap the printed file as a File handle, then move it into the cache
    // directory under our chosen filename so "Save to Files" in the share
    // sheet shows "murmur-YYYY-MM-DD.pdf" instead of the engine's default
    // ("print.pdf") in the destination's chooser.
    const printed = new File(result.uri)
    const dest = new File(Paths.cache, filename)
    if (dest.exists) dest.delete()
    printed.move(dest)
    uri = dest.uri
    mimeType = 'application/pdf'
  } else {
    const body = format === 'csv' ? buildCSV(input) : buildJSON(input)
    const dest = new File(Paths.cache, filename)
    if (dest.exists) dest.delete()
    dest.create()
    dest.write(body)
    uri = dest.uri
    mimeType = format === 'csv' ? 'text/csv' : 'application/json'
  }

  const available = await Sharing.isAvailableAsync()
  if (!available) {
    throw new Error('Sharing is not available on this device')
  }
  await Sharing.shareAsync(uri, {
    mimeType,
    dialogTitle: t('export.share_dialog_title', input.locale),
    UTI: format === 'pdf' ? 'com.adobe.pdf' : format === 'csv' ? 'public.comma-separated-values-text' : 'public.json',
  })
}
