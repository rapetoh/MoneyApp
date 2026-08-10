import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import * as Print from 'expo-print'
import type { Transaction, Category, CategoryKind, Locale, ExportableTransaction, ExportRecurringRule, ExportRow } from '@voice-expense/shared'
import { t, buildExport, exportSummaryJSON, localDay } from '@voice-expense/shared'

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
 * module is pure formatting + IO — it does not fetch its own data, so
 * `ExportInput` is where fix-plan 2.15's fields land: `timezone` (so a
 * row's printed date is the *local* day, not a UTC slice of the instant
 * — audit 04-F8) and `recurringRules` (the mobile export previously
 * omitted rules entirely, so a user who left via the phone lost their
 * subscription configuration on export). Both are optional/additive —
 * the callers (`apps/mobile/app/more/{settings,privacy}.tsx`) are
 * outside this pass's file ownership, so this ships as a shape those
 * callers can start passing without another change here; a caller that
 * doesn't yet still gets the correct device-zone dates (see
 * `resolveTimezone`) and a `recurring_rules: []` key rather than a
 * missing one (see `exportSummaryJSON`, `packages/shared/src/domain/
 * export.ts`).
 */

interface ExportInput {
  transactions: Transaction[]
  categories: Category[]
  locale: Locale
  currency: string
  /** IANA zone (fix-plan 1.3). Defaults to the device's own resolved
   *  zone when omitted — accurate here in a way it wouldn't be on web,
   *  because `profiles.timezone` is itself captured from this same
   *  device signal (`expo-localization`'s `getCalendars()`). */
  timezone?: string
  recurringRules?: ExportRecurringRule[]
  /** Inclusive local-day range (`YYYY-MM-DD`). Defaults to the full
   *  history — earliest transaction's local day through today — which
   *  preserves this module's existing "export everything" behaviour for
   *  a caller that doesn't pass a range. */
  dateFrom?: string
  dateTo?: string
}

function resolveTimezone(input: ExportInput): string {
  return input.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

/** Resolves the assembled export once per call — every format (CSV,
 *  JSON, PDF) renders off this same result, so the header total and
 *  every row's date/amount columns can never disagree between formats
 *  (fix-plan 2.15). */
function assembleExport(input: ExportInput) {
  const tz = resolveTimezone(input)
  const active = activeTransactions(input.transactions)
  // `categories.kind` carries a CHECK constraint the generated row type
  // can't see (same narrowing every other CHECK-constrained column in
  // this repo needs — see packages/shared/src/types/category.ts).
  const catKindById = new Map(input.categories.map((c) => [c.id, c.kind as CategoryKind]))
  const todayLocal = localDay(new Date().toISOString(), tz)
  const earliestInstant = active.reduce<string | null>(
    (min, tx) => (min == null || tx.transacted_at < min ? tx.transacted_at : min),
    null,
  )
  const dateFrom = input.dateFrom ?? (earliestInstant ? localDay(earliestInstant, tz) : todayLocal)
  const dateTo = input.dateTo ?? todayLocal

  const exportableTxns: ExportableTransaction[] = active.map((tx) => ({
    id: tx.id,
    amount: tx.amount,
    amount_in_profile_currency: tx.amount_in_profile_currency,
    currency_code: tx.currency_code,
    direction: tx.direction,
    merchant: tx.merchant,
    note: tx.note,
    category_id: tx.category_id,
    category_kind: tx.category_id ? catKindById.get(tx.category_id) ?? null : null,
    payment_method: tx.payment_method,
    source: tx.source,
    is_recurring: tx.is_recurring,
    transacted_at: tx.transacted_at,
    fx_rate_to_profile: tx.fx_rate_to_profile,
    fx_rate_date: tx.fx_rate_date,
  }))

  return buildExport({
    profile: { currency_code: input.currency, locale: input.locale, timezone: tz },
    transactions: exportableTxns,
    categories: input.categories.map((c) => ({ id: c.id, name: c.name })),
    recurringRules: input.recurringRules,
    dateFrom,
    dateTo,
  })
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

function todayStamp(tz: string): string {
  // Local `YYYY-MM-DD` for the filename, in `tz` (fix-plan 1.3) — not a
  // UTC slice, and not a raw `Date#getFullYear`/`getDate` read (which
  // silently used whichever zone the runtime's own clock resolved to).
  return localDay(new Date().toISOString(), tz)
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

export function buildCSV(input: ExportInput): string {
  const result = assembleExport(input)
  const header = [
    'date',
    'time',
    'amount',
    'currency',
    `amount_${input.currency.toLowerCase()}`,
    'fx_rate',
    'fx_date',
    'direction',
    'category',
    'merchant',
    'note',
    'payment_method',
    'is_recurring',
    'source',
  ]
  const rows = result.rows.map((r) =>
    [
      r.date,
      r.time,
      r.amount.toFixed(2),
      r.currency,
      r.amountInProfileCurrency != null ? r.amountInProfileCurrency.toFixed(2) : '',
      r.fxRate ?? '',
      r.fxDate ?? '',
      r.direction,
      r.category,
      r.merchant,
      r.note,
      r.paymentMethod,
      r.isRecurring ? '1' : '0',
      r.source,
    ]
      .map(escapeCSV)
      .join(','),
  )
  const pending = result.summary.pendingCount
  const footer =
    pending > 0
      ? `\n${escapeCSV(`${pending} transaction${pending === 1 ? '' : 's'} awaiting currency conversion, excluded from ${input.currency} totals`)}`
      : ''
  return [header.join(','), ...rows].join('\n') + footer + '\n'
}

// ─── JSON ────────────────────────────────────────────────────────────────────

/** Same shape as the web export's JSON button
 *  (`apps/web/src/app/dashboard/export/page.tsx`'s `exportJSON`) —
 *  both call `exportSummaryJSON()` over their own `buildExport()`
 *  result, so the two platforms' exports carry the same top-level keys
 *  (fix-plan 2.15), including `recurring_rules`/`categories`, which
 *  this file omitted entirely before this item. */
export function buildJSON(input: ExportInput): string {
  const payload = exportSummaryJSON(assembleExport(input))
  return JSON.stringify(payload, null, 2)
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
  const result = assembleExport(input)
  const rows = [...result.rows]
    .reverse()
    .map((r: ExportRow) => {
      // `r.date` is already the correct local day (fix-plan 1.3) — build
      // a display string from it via `toLocaleDateString` (not a
      // restricted getter) rather than re-deriving the day from
      // `transacted_at` a second time in whatever zone this call
      // happens to run in.
      const date = new Date(`${r.date}T12:00:00Z`).toLocaleDateString(locale, {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
      })
      const native = `${r.direction === 'credit' ? '+' : ''}${r.currency} ${r.amount.toFixed(2)}`
      const converted =
        r.amountInProfileCurrency != null
          ? `${r.direction === 'credit' ? '+' : ''}${input.currency} ${r.amountInProfileCurrency.toFixed(2)}`
          : '—'
      return `
        <tr>
          <td>${escapeHTML(date)}</td>
          <td>${escapeHTML(r.merchant || '—')}</td>
          <td>${escapeHTML(r.category)}</td>
          <td class="num ${r.direction === 'credit' ? 'credit' : ''}">${escapeHTML(native)}</td>
          <td class="num ${r.direction === 'credit' ? 'credit' : ''}">${escapeHTML(converted)}</td>
        </tr>
      `
    })
    .join('')

  // Routed through summarize() (fix-plan 1.4) — excludes transfer-kind
  // categories and uses the FX-converted figure, so this total
  // reconciles with a reader manually adding the right-hand column
  // above, never the raw (possibly mixed-currency) left-hand one.
  const total = result.summary.expense

  const exported_at = new Date().toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const pending = result.summary.pendingCount
  const pendingNote =
    pending > 0
      ? `<div class="footer">${escapeHTML(`${pending} transaction${pending === 1 ? '' : 's'} awaiting currency conversion, excluded from the total above.`)}</div>`
      : ''

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
      <div class="val">${result.rows.length}</div>
    </div>
  </div>
  <table>
    <thead><tr>
      <th>${escapeHTML(t('export.col_date', locale))}</th>
      <th>${escapeHTML(t('export.col_merchant', locale))}</th>
      <th>${escapeHTML(t('export.col_category', locale))}</th>
      <th style="text-align:right">${escapeHTML(t('export.col_amount', locale))}</th>
      <th style="text-align:right">${escapeHTML(`${t('export.col_amount', locale)} (${input.currency})`)}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">${escapeHTML(t('export.pdf_footer', locale))}</div>
  ${pendingNote}
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
  const stamp = todayStamp(resolveTimezone(input))
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
