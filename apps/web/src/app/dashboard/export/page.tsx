'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '../../../lib/supabase/client'
import { colors, font, fontSize, spacing, radius } from '../../../lib/theme'
import { formatCurrency } from '@voice-expense/shared'

export default function ExportPage() {
  const supabase = createClient()
  const [transactions, setTransactions] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const defaultTo = now.toISOString().slice(0, 10)
  const [dateFrom, setDateFrom] = useState(defaultFrom)
  const [dateTo, setDateTo] = useState(defaultTo)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [t, c, p] = await Promise.all([
        supabase.from('transactions').select('*').eq('user_id', user.id).eq('is_deleted', false).order('transacted_at', { ascending: false }),
        supabase.from('categories').select('*').eq('user_id', user.id),
        supabase.from('profiles').select('*').eq('id', user.id).single(),
      ])
      setTransactions(t.data ?? [])
      setCategories(c.data ?? [])
      setProfile(p.data)
      setLoading(false)
    }
    load()
  }, [])

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]))
  const currency = profile?.currency_code ?? 'USD'

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      const d = t.transacted_at.slice(0, 10)
      return d >= dateFrom && d <= dateTo
    })
  }, [transactions, dateFrom, dateTo])

  function downloadCSV() {
    const headers = ['Date', 'Time', 'Merchant', 'Category', 'Direction', 'Amount', 'Currency', 'Payment Method', 'Source', 'Note']
    const rows = filtered.map((t) => [
      new Date(t.transacted_at).toLocaleDateString('en'),
      new Date(t.transacted_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }),
      t.merchant ?? '',
      t.category_id ? (categoryMap[t.category_id]?.name ?? '') : '',
      t.direction,
      t.amount.toFixed(2),
      currency,
      t.payment_method ?? '',
      t.source ?? '',
      t.note ?? '',
    ])

    const csvContent = '\uFEFF' + [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transactions_${dateFrom}_to_${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalExpenses = filtered.filter((t) => t.direction === 'debit').reduce((s, t) => s + t.amount, 0)
  const totalIncome = filtered.filter((t) => t.direction === 'credit').reduce((s, t) => s + t.amount, 0)

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Export</h1>
      <p style={styles.subtitle}>Download your transactions as CSV</p>

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Date Range</h2>
        <div style={styles.dateRow}>
          <div style={styles.field}>
            <label style={styles.label}>From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={styles.input} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={styles.input} />
          </div>
        </div>

        {/* Summary */}
        <div style={styles.summary}>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>Transactions</span>
            <span style={styles.summaryValue}>{filtered.length}</span>
          </div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>Total Expenses</span>
            <span style={{ ...styles.summaryValue, color: colors.text }}>{formatCurrency(totalExpenses, currency)}</span>
          </div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>Total Income</span>
            <span style={{ ...styles.summaryValue, color: colors.income }}>{formatCurrency(totalIncome, currency)}</span>
          </div>
        </div>

        <button onClick={downloadCSV} disabled={filtered.length === 0 || loading} style={styles.downloadBtn}>
          ↓ Download CSV ({filtered.length} rows)
        </button>
      </div>

      {/* Preview */}
      {filtered.length > 0 && (
        <div style={styles.tableCard}>
          <h3 style={styles.previewTitle}>Preview (first 10 rows)</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                {['Date', 'Merchant', 'Category', 'Amount'].map((h) => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 10).map((t) => (
                <tr key={t.id} style={styles.tr}>
                  <td style={styles.td}>{new Date(t.transacted_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                  <td style={{ ...styles.td, fontWeight: 600 }}>{t.merchant ?? '—'}</td>
                  <td style={{ ...styles.td, color: colors.textSecondary }}>{t.category_id ? (categoryMap[t.category_id]?.name ?? '—') : '—'}</td>
                  <td style={{ ...styles.td, fontFamily: font.mono, color: t.direction === 'credit' ? colors.income : colors.text }}>
                    {t.direction === 'credit' ? '+' : '-'}{formatCurrency(t.amount, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 10 && (
            <p style={styles.moreNote}>…and {filtered.length - 10} more rows in the downloaded file</p>
          )}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: spacing['2xl'], display: 'flex', flexDirection: 'column', gap: spacing.xl, maxWidth: 900 },
  title: { fontFamily: font.sans, fontWeight: 700, fontSize: fontSize['3xl'], color: colors.text },
  subtitle: { fontFamily: font.sans, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: -spacing.md },
  card: { background: colors.card, borderRadius: radius.lg, padding: spacing.xl, border: `1px solid ${colors.border}`, boxShadow: `0 2px 8px ${colors.shadow}`, display: 'flex', flexDirection: 'column', gap: spacing.base },
  cardTitle: { fontFamily: font.sans, fontWeight: 700, fontSize: fontSize.lg, color: colors.text },
  dateRow: { display: 'flex', gap: spacing.base },
  field: { flex: 1, display: 'flex', flexDirection: 'column', gap: spacing.xs },
  label: { fontFamily: font.sans, fontWeight: 600, fontSize: fontSize.sm, color: colors.text },
  input: { border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: `${spacing.sm}px ${spacing.md}px`, fontFamily: font.sans, fontSize: fontSize.sm, color: colors.text, background: colors.background, outline: 'none' },
  summary: { display: 'flex', gap: spacing['2xl'], padding: `${spacing.base}px`, background: colors.background, borderRadius: radius.md },
  summaryItem: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  summaryLabel: { fontFamily: font.sans, fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: 500 },
  summaryValue: { fontFamily: font.mono, fontSize: fontSize.lg, fontWeight: 700, color: colors.text },
  downloadBtn: { background: colors.primary, color: colors.white, border: 'none', borderRadius: radius.md, padding: `${spacing.md}px ${spacing.xl}px`, fontFamily: font.sans, fontWeight: 600, fontSize: fontSize.base, alignSelf: 'flex-start' as const },
  tableCard: { background: colors.card, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: `0 2px 8px ${colors.shadow}`, overflow: 'hidden' },
  previewTitle: { fontFamily: font.sans, fontWeight: 600, fontSize: fontSize.sm, color: colors.textSecondary, padding: `${spacing.md}px ${spacing.base}px`, borderBottom: `1px solid ${colors.border}`, textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  table: { width: '100%', borderCollapse: 'collapse' as const },
  th: { fontFamily: font.sans, fontSize: fontSize.xs, fontWeight: 600, color: colors.textSecondary, textAlign: 'left' as const, padding: `${spacing.sm}px ${spacing.base}px`, borderBottom: `1px solid ${colors.border}`, textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  tr: { borderBottom: `1px solid ${colors.border}` },
  td: { fontFamily: font.sans, fontSize: fontSize.sm, color: colors.text, padding: `${spacing.md}px ${spacing.base}px` },
  moreNote: { fontFamily: font.sans, fontSize: fontSize.xs, color: colors.textMuted, padding: `${spacing.sm}px ${spacing.base}px` },
}
