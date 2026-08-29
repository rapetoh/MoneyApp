'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '../../../lib/supabase/client'
import { colors, font, radius } from '../../../lib/theme'
import { Toolbar } from '../../../components/Toolbar'
import { Card } from '../../../components/Card'
import { Money } from '../../../components/Money'
import { Icon } from '../../../components/Icons'
import { PaywallGate } from '../../../components/PaywallGate'
import { ErrorState } from '../../../components/ErrorState'
import { usePlus } from '../../../lib/plus'
import { buildTransactionsPdf, loadPdfFonts } from '../../../lib/pdf/transactionsPdf'
import {
  buildExport,
  exportSummaryJSON,
  localDay,
  monthIso,
  type CategoryKind,
  type ExportableTransaction,
  type ExportRecurringRule,
} from '@voice-expense/shared'

type Txn = {
  id: string
  amount: number
  amount_in_profile_currency: number | null
  currency_code: string | null
  fx_rate_to_profile: number | null
  fx_rate_date: string | null
  direction: 'debit' | 'credit'
  merchant: string | null
  note: string | null
  category_id: string | null
  payment_method: string | null
  source: string | null
  is_recurring: boolean | null
  transacted_at: string
}

type Format = 'csv' | 'json' | 'pdf'

/** The viewer's own zone — this page only ever renders client-side
 *  ('use client'), so `Intl`'s resolved zone here *is* the user's zone,
 *  not a server/browser mismatch (fix-plan 1.3). Used for the date-
 *  range picker's initial "this month" default; `profile.timezone` (the
 *  captured, authoritative value) drives every actual export bound
 *  below once it loads. */
function browserTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

function defaultDateRange(): { from: string; to: string } {
  const tz = browserTz()
  const nowIso = new Date().toISOString()
  return { from: `${monthIso(nowIso, tz)}-01`, to: localDay(nowIso, tz) }
}

export default function ExportPage() {
  const supabase = createClient()
  const [transactions, setTransactions] = useState<Txn[]>([])
  const [categories, setCategories] = useState<Array<{ id: string; name: string; kind: CategoryKind }>>([])
  const [recurringRules, setRecurringRules] = useState<ExportRecurringRule[]>([])
  const [profile, setProfile] = useState<{ currency_code?: string; locale?: string; timezone?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  // Read-error state, distinct from "loaded, zero transactions in range"
  // (fix-plan 2.13 / audit 08-F21 family) — this page has no separate
  // list body, so an unsurfaced read failure used to render as an
  // honest-looking "0 transactions / $0 / $0" summary with the export
  // buttons quietly disabled, indistinguishable from an empty range.
  const [loadError, setLoadError] = useState<string | null>(null)
  const { isPlus } = usePlus()
  const [busy, setBusy] = useState<Format | null>(null)
  // A failed export (font fetch, jsPDF throw) used to vanish into the
  // console with the button silently going back to idle.
  const [exportError, setExportError] = useState<string | null>(null)

  const [dateFrom, setDateFrom] = useState(() => defaultDateRange().from)
  const [dateTo, setDateTo] = useState(() => defaultDateRange().to)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [t, c, r, p] = await Promise.all([
      supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .order('transacted_at', { ascending: false }),
      supabase.from('categories').select('id, name, kind').eq('user_id', user.id),
      supabase
        .from('recurring_rules')
        .select('id, name, amount, currency_code, direction, frequency, is_active')
        .eq('user_id', user.id),
      supabase.from('profiles').select('currency_code, locale, timezone').eq('id', user.id).single(),
    ])
    const failure = t.error ?? c.error ?? r.error ?? p.error
    setLoadError(failure ? failure.message : null)
    if (!t.error) setTransactions((t.data ?? []) as Txn[])
    if (!c.error) setCategories((c.data ?? []) as Array<{ id: string; name: string; kind: CategoryKind }>)
    if (!r.error) setRecurringRules((r.data ?? []) as ExportRecurringRule[])
    if (!p.error) setProfile(p.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const currency = profile?.currency_code ?? 'USD'
  const locale = profile?.locale ?? 'en'
  // profiles.timezone (fix-plan 1.3) — 'UTC' matches the column default
  // for the rare render before capture lands; see TimezoneSync in
  // dashboard/layout.tsx.
  const tz = profile?.timezone || 'UTC'

  const catKindById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.kind])),
    [categories],
  )

  // The one export-assembly call (fix-plan 2.15): every date below
  // (the range bounds and each row's own date/time) resolves through
  // packages/shared/src/utils/period.ts in the user's own zone, and the
  // summary total is computed from the exact same
  // `amount_in_profile_currency` column the rows print — so a
  // spreadsheet sum of the CSV's converted column always equals the
  // total printed above it.
  const exportResult = useMemo(() => {
    const exportableTxns: ExportableTransaction[] = transactions.map((t) => ({
      id: t.id,
      amount: t.amount,
      amount_in_profile_currency: t.amount_in_profile_currency,
      currency_code: t.currency_code,
      direction: t.direction,
      merchant: t.merchant,
      note: t.note,
      category_id: t.category_id,
      category_kind: t.category_id ? catKindById.get(t.category_id) ?? null : null,
      payment_method: t.payment_method,
      source: t.source,
      is_recurring: t.is_recurring,
      transacted_at: t.transacted_at,
      fx_rate_to_profile: t.fx_rate_to_profile,
      fx_rate_date: t.fx_rate_date,
    }))
    return buildExport({
      profile: { currency_code: currency, locale, timezone: tz },
      transactions: exportableTxns,
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      recurringRules,
      dateFrom,
      dateTo,
    })
  }, [transactions, categories, catKindById, recurringRules, currency, locale, tz, dateFrom, dateTo])

  const filtered = exportResult.rows
  const totalExpenses = exportResult.summary.expense
  const totalIncome = exportResult.summary.income
  const pendingCount = exportResult.summary.pendingCount

  function fileBase() {
    return `murmur-${dateFrom}-to-${dateTo}`
  }

  function downloadBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function exportCSV() {
    setBusy('csv')
    try {
      const headers = [
        'Date',
        'Time',
        'Merchant',
        'Category',
        'Direction',
        'Amount',
        'Currency',
        `Amount (${currency})`,
        'FX rate',
        'FX date',
        'Payment Method',
        'Source',
        'Note',
      ]
      const rows = filtered.map((r) => [
        r.date,
        r.time,
        r.merchant,
        r.category,
        r.direction,
        r.amount.toFixed(2),
        r.currency,
        r.amountInProfileCurrency != null ? r.amountInProfileCurrency.toFixed(2) : '',
        r.fxRate ?? '',
        r.fxDate ?? '',
        r.paymentMethod,
        r.source,
        r.note,
      ])
      let csv = '\uFEFF' + [headers, ...rows]
        .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
        .join('\r\n')
      // A row missing its FX snapshot prints an empty converted-amount
      // cell rather than a silent 0 — this trailing note is the receipt
      // for why the header total and a naive row-count-based check might
      // look short (fix-plan 1.4's "N transactions awaiting conversion").
      if (pendingCount > 0) {
        csv += `\r\n"${pendingCount} transaction${pendingCount === 1 ? '' : 's'} above ${pendingCount === 1 ? 'is' : 'are'} awaiting currency conversion and excluded from the totals."`
      }
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${fileBase()}.csv`)
    } finally {
      setBusy(null)
    }
  }

  async function exportJSON() {
    setBusy('json')
    try {
      // One canonical shape (fix-plan 2.15) — the mobile export's JSON
      // button calls the same `exportSummaryJSON` over its own
      // `buildExport()` result, so the two files carry the same
      // top-level keys.
      const payload = exportSummaryJSON(exportResult)
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      downloadBlob(blob, `${fileBase()}.json`)
    } finally {
      setBusy(null)
    }
  }

  async function exportPDF() {
    setBusy('pdf')
    setExportError(null)
    try {
      // Dynamic imports so jsPDF (~120KB) and the embedded font files
      // (~250KB) only load when the user actually exports — the initial
      // bundle keeps the same shape for users who never see this surface.
      // The document itself is rendered by lib/pdf/transactionsPdf.ts;
      // see that file for why (Aug 16, 2026 owner review).
      const [{ jsPDF }, autoTableModule, fonts] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
        loadPdfFonts(),
      ])
      const doc = new jsPDF({ unit: 'pt', format: 'letter' })
      buildTransactionsPdf(doc, autoTableModule.default, {
        rows: filtered,
        currency,
        locale,
        timezone: tz,
        dateFrom,
        dateTo,
        totalExpenses,
        totalIncome,
        pendingCount,
        fonts,
      })
      doc.save(`${fileBase()}.pdf`)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'The PDF could not be generated.')
    } finally {
      setBusy(null)
    }
  }

  if (!isPlus) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Toolbar title="Export" />
        <div style={{ padding: '0 24px 24px' }}>
          <PaywallGate
            feature="Data export"
            title="Take your data with you, in any shape."
            body="Export the full transaction history as CSV for spreadsheets, JSON for re-import, or a printable PDF for records and tax filings."
          />
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Toolbar title="Export" />

      <div style={styles.content}>
        <div>
          {/* "Export transactions", not "Export your data" — the latter
              read as a synonym for the Settings → Privacy card's separate,
              free "Export all my data" GDPR backup, which this isn't
              (audit 08-F44, fix-plan 4.2). */}
          <div style={{ fontFamily: font.serif, fontSize: 28, fontWeight: 500, color: colors.ink, letterSpacing: -0.6 }}>
            Export transactions
          </div>
          <div style={{ fontSize: 13, color: colors.ink3, marginTop: 2 }}>
            Choose a date range and a format. Files stay local. Murmur never uploads exports.
          </div>
        </div>

        <Card title="Date range">
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div style={styles.field}>
              <label style={styles.label}>From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={styles.input} />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={styles.input} />
            </div>
          </div>
          {loadError ? (
            <ErrorState
              compact
              message="We couldn't load your data to export."
              detail={loadError}
              onRetry={load}
            />
          ) : (
            <>
              <div style={styles.summary}>
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>Transactions</span>
                  <span style={{ fontFamily: font.display, fontSize: 18, fontWeight: 700, color: colors.ink }}>{filtered.length}</span>
                </div>
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>Total expenses</span>
                  <Money value={totalExpenses} currency={currency} locale={locale} size={18} serif={false} bold={700} />
                </div>
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>Total income</span>
                  <Money
                    value={totalIncome}
                    currency={currency}
                    locale={locale}
                    size={18}
                    serif={false}
                    bold={700}
                    showPositiveSign
                    color={colors.income}
                  />
                </div>
              </div>
              {pendingCount > 0 && (
                <div style={styles.pendingNote}>
                  {pendingCount} transaction{pendingCount === 1 ? '' : 's'} awaiting currency conversion -
                  excluded from the totals above until the exchange rate lands.
                </div>
              )}
            </>
          )}
        </Card>

        {exportError && (
          <ErrorState compact message="The export could not be generated." detail={exportError} />
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <FormatCard
            title="CSV"
            sub="Spreadsheets, accountants"
            disabled={busy != null || filtered.length === 0 || loading || !!loadError}
            busy={busy === 'csv'}
            onClick={exportCSV}
          />
          <FormatCard
            title="JSON"
            sub="Backup, re-import"
            disabled={busy != null || filtered.length === 0 || loading || !!loadError}
            busy={busy === 'json'}
            onClick={exportJSON}
          />
          <FormatCard
            title="PDF"
            sub="Records, tax filings"
            disabled={busy != null || filtered.length === 0 || loading || !!loadError}
            busy={busy === 'pdf'}
            onClick={exportPDF}
          />
        </div>
      </div>
    </div>
  )
}

function FormatCard({
  title,
  sub,
  disabled,
  busy,
  onClick,
}: {
  title: string
  sub: string
  disabled: boolean
  busy: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: colors.card,
        border: `0.5px solid ${colors.line}`,
        borderRadius: radius.xl,
        padding: '20px 22px',
        textAlign: 'left',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: font.serif, fontSize: 22, fontWeight: 500, color: colors.ink }}>{title}</div>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: colors.accentSoft,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon.download color={colors.accent} size={16} />
        </div>
      </div>
      <div style={{ fontFamily: font.sans, fontSize: 12, color: colors.ink3 }}>{sub}</div>
      <div style={{ fontFamily: font.sans, fontSize: 11, color: busy ? colors.accent : colors.ink4, marginTop: 4 }}>
        {busy ? 'Preparing…' : 'Click to download'}
      </div>
    </button>
  )
}

const styles: Record<string, React.CSSProperties> = {
  content: { padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: {
    fontFamily: font.sans,
    fontSize: 11,
    color: colors.ink3,
    fontWeight: 600,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  input: {
    padding: '8px 12px',
    background: colors.surface2,
    border: `0.5px solid ${colors.line}`,
    borderRadius: radius.md,
    fontFamily: font.sans,
    fontSize: 13,
    color: colors.ink,
    outline: 'none',
  },
  summary: {
    display: 'flex',
    gap: 32,
    padding: '14px 16px',
    background: colors.surface2,
    borderRadius: radius.md,
    marginTop: 12,
  },
  summaryItem: { display: 'flex', flexDirection: 'column', gap: 2 },
  summaryLabel: {
    fontFamily: font.sans,
    fontSize: 11,
    color: colors.ink3,
    fontWeight: 600,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  pendingNote: {
    marginTop: 10,
    fontFamily: font.sans,
    fontSize: 11,
    color: colors.ink4,
  },
}
