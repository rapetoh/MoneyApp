'use client'
import { useState, useMemo } from 'react'
import { useEffect } from 'react'
import { createClient } from '../../../lib/supabase/client'
import { colors, font, fontSize, spacing, radius } from '../../../lib/theme'
import { formatCurrency } from '@voice-expense/shared'

export default function TransactionsPage() {
  const supabase = createClient()
  const [transactions, setTransactions] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [direction, setDirection] = useState<'all' | 'debit' | 'credit'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [txns, cats, prof] = await Promise.all([
        supabase.from('transactions').select('*').eq('user_id', user.id).eq('is_deleted', false).order('transacted_at', { ascending: false }),
        supabase.from('categories').select('*').eq('user_id', user.id).eq('is_archived', false),
        supabase.from('profiles').select('*').eq('id', user.id).single(),
      ])
      setTransactions(txns.data ?? [])
      setCategories(cats.data ?? [])
      setProfile(prof.data)
      setLoading(false)
    }
    load()
  }, [])

  // Realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('web:transactions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (!user) return
          supabase.from('transactions').select('*').eq('user_id', user.id).eq('is_deleted', false).order('transacted_at', { ascending: false })
            .then(({ data }) => { if (data) setTransactions(data) })
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]))
  const currency = profile?.currency_code ?? 'USD'

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (direction !== 'all' && t.direction !== direction) return false
      if (search) {
        const q = search.toLowerCase()
        if (!(t.merchant ?? '').toLowerCase().includes(q) && !(t.note ?? '').toLowerCase().includes(q)) return false
      }
      if (dateFrom && t.transacted_at < dateFrom) return false
      if (dateTo && t.transacted_at > dateTo + 'T23:59:59') return false
      return true
    })
  }, [transactions, search, direction, dateFrom, dateTo])

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Transactions</h1>
      <p style={styles.subtitle}>{filtered.length} of {transactions.length} transactions</p>

      {/* Filters */}
      <div style={styles.filters}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search merchant or note…"
          style={styles.searchInput}
        />
        <select value={direction} onChange={(e) => setDirection(e.target.value as any)} style={styles.select}>
          <option value="all">All</option>
          <option value="debit">Expenses</option>
          <option value="credit">Income</option>
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={styles.select} />
        <span style={{ color: colors.textMuted, fontFamily: font.sans, fontSize: fontSize.sm }}>to</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={styles.select} />
        {(search || direction !== 'all' || dateFrom || dateTo) && (
          <button onClick={() => { setSearch(''); setDirection('all'); setDateFrom(''); setDateTo('') }} style={styles.clearBtn}>
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div style={styles.tableCard}>
        {loading ? (
          <div style={styles.empty}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={styles.empty}>No transactions match your filters.</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                {['Date & Time', 'Merchant', 'Category', 'Payment', 'Source', 'Amount'].map((h) => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} style={styles.tr}>
                  <td style={styles.td}>
                    <span style={{ fontFamily: font.mono, fontSize: fontSize.xs }}>
                      {new Date(t.transacted_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <br />
                    <span style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                      {new Date(t.transacted_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                  <td style={{ ...styles.td, fontWeight: 600 }}>{t.merchant ?? '—'}</td>
                  <td style={{ ...styles.td, color: colors.textSecondary }}>
                    {t.category_id ? (categoryMap[t.category_id]?.name ?? '—') : '—'}
                  </td>
                  <td style={{ ...styles.td, color: colors.textSecondary, textTransform: 'capitalize' }}>
                    {t.payment_method?.replace(/_/g, ' ') ?? '—'}
                  </td>
                  <td style={{ ...styles.td, color: colors.textSecondary }}>{t.source ?? '—'}</td>
                  <td style={{ ...styles.td, fontFamily: font.mono, fontWeight: 600, color: t.direction === 'credit' ? colors.income : colors.text }}>
                    {t.direction === 'credit' ? '+' : '-'}{formatCurrency(t.amount, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: spacing['2xl'], display: 'flex', flexDirection: 'column', gap: spacing.xl, maxWidth: 1280 },
  title: { fontFamily: font.sans, fontWeight: 700, fontSize: fontSize['3xl'], color: colors.text },
  subtitle: { fontFamily: font.sans, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: -spacing.md },
  filters: { display: 'flex', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' as const },
  searchInput: { flex: 1, minWidth: 200, border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: `${spacing.sm}px ${spacing.md}px`, fontFamily: font.sans, fontSize: fontSize.sm, color: colors.text, background: colors.card, outline: 'none' },
  select: { border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: `${spacing.sm}px ${spacing.md}px`, fontFamily: font.sans, fontSize: fontSize.sm, color: colors.text, background: colors.card, outline: 'none' },
  clearBtn: { border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: `${spacing.sm}px ${spacing.md}px`, fontFamily: font.sans, fontSize: fontSize.sm, color: colors.textSecondary, background: colors.card },
  tableCard: { background: colors.card, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: `0 2px 8px ${colors.shadow}`, overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' as const },
  th: { fontFamily: font.sans, fontSize: fontSize.xs, fontWeight: 600, color: colors.textSecondary, textAlign: 'left' as const, padding: `${spacing.sm}px ${spacing.base}px`, borderBottom: `1px solid ${colors.border}`, textTransform: 'uppercase' as const, letterSpacing: '0.05em', background: colors.background },
  tr: { borderBottom: `1px solid ${colors.border}` },
  td: { fontFamily: font.sans, fontSize: fontSize.sm, color: colors.text, padding: `${spacing.md}px ${spacing.base}px`, verticalAlign: 'top' as const },
  empty: { padding: spacing['3xl'], textAlign: 'center' as const, fontFamily: font.sans, fontSize: fontSize.sm, color: colors.textMuted },
}
