import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase/server'
import { getProfile, getTransactions, getCategories, getActiveBudgets } from '../../lib/data'
import { SpendingChart } from '../../components/SpendingChart'
import { CategoryChart } from '../../components/CategoryChart'
import { colors, font, fontSize, spacing, radius } from '../../lib/theme'
import { formatCurrency } from '@voice-expense/shared'

function card(children: React.ReactNode, style?: React.CSSProperties) {
  return (
    <div style={{ background: colors.card, borderRadius: radius.lg, padding: spacing.xl, border: `1px solid ${colors.border}`, boxShadow: `0 2px 8px ${colors.shadow}`, ...style }}>
      {children}
    </div>
  )
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{ background: colors.card, borderRadius: radius.lg, padding: spacing.xl, border: `1px solid ${colors.border}`, boxShadow: `0 2px 8px ${colors.shadow}`, display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
      <span style={{ fontFamily: font.sans, fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: 500 }}>{label}</span>
      <span style={{ fontFamily: font.mono, fontSize: fontSize['3xl'], fontWeight: 700, color: accent ?? colors.text }}>{value}</span>
      {sub && <span style={{ fontFamily: font.sans, fontSize: fontSize.xs, color: colors.textMuted }}>{sub}</span>}
    </div>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profile, transactions, categories, budgets] = await Promise.all([
    getProfile(supabase, user.id),
    getTransactions(supabase, user.id),
    getCategories(supabase, user.id),
    getActiveBudgets(supabase, user.id),
  ])

  const currency = profile?.currency_code ?? 'USD'
  const categoryMap = Object.fromEntries(categories.map((c: any) => [c.id, c]))

  // Current month
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthTxns = transactions.filter((t: any) => t.transacted_at >= startOfMonth)

  const totalIncome = monthTxns.filter((t: any) => t.direction === 'credit').reduce((s: number, t: any) => s + t.amount, 0)
  const totalExpenses = monthTxns.filter((t: any) => t.direction === 'debit').reduce((s: number, t: any) => s + t.amount, 0)
  const netBalance = totalIncome - totalExpenses

  // Safe to Spend
  const overallBudget = budgets.find((b: any) => b.category_id === null)
  const safeToSpend = overallBudget ? Math.max(0, overallBudget.amount - totalExpenses) : null

  // Spending over last 30 days (grouped by day)
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(now.getDate() - 29)
  const recentTxns = transactions.filter((t: any) => new Date(t.transacted_at) >= thirtyDaysAgo)

  const dayMap: Record<string, { expenses: number; income: number }> = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    const key = d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
    dayMap[key] = { expenses: 0, income: 0 }
  }
  for (const t of recentTxns) {
    const key = new Date(t.transacted_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })
    if (dayMap[key]) {
      if (t.direction === 'debit') dayMap[key].expenses += t.amount
      else dayMap[key].income += t.amount
    }
  }
  // Only show every 5th label to avoid clutter
  const chartData = Object.entries(dayMap).map(([label, vals], i) => ({
    label: i % 5 === 0 ? label : '',
    expenses: vals.expenses,
    income: vals.income,
  }))

  // Top categories this month
  const catTotals: Record<string, number> = {}
  for (const t of monthTxns.filter((t: any) => t.direction === 'debit')) {
    const name = t.category_id ? (categoryMap[t.category_id]?.name ?? 'Other') : 'Uncategorized'
    catTotals[name] = (catTotals[name] ?? 0) + t.amount
  }
  const topCategories = Object.entries(catTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, amount]) => ({ name, amount }))

  // Recent 5 transactions
  const recent = transactions.slice(0, 5)

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Overview</h1>
      <p style={styles.subtitle}>{now.toLocaleDateString('en', { month: 'long', year: 'numeric' })}</p>

      {/* Stats */}
      <div style={styles.statsGrid}>
        <StatCard label="Income This Month" value={formatCurrency(totalIncome, currency)} accent={colors.income} />
        <StatCard label="Expenses This Month" value={formatCurrency(totalExpenses, currency)} />
        <StatCard label="Net Balance" value={formatCurrency(Math.abs(netBalance), currency)} accent={netBalance >= 0 ? colors.income : colors.destructive} sub={netBalance < 0 ? 'Over spent' : 'Surplus'} />
        <StatCard
          label="Safe to Spend"
          value={safeToSpend !== null ? formatCurrency(safeToSpend, currency) : '—'}
          sub={overallBudget ? `Budget: ${formatCurrency(overallBudget.amount, currency)}` : 'No budget set'}
          accent={safeToSpend !== null && safeToSpend === 0 ? colors.destructive : colors.primary}
        />
      </div>

      {/* Charts */}
      <div style={styles.chartsRow}>
        {card(
          <>
            <h2 style={styles.cardTitle}>Spending & Income — Last 30 Days</h2>
            <div style={{ marginTop: spacing.base }}>
              <SpendingChart data={chartData} currency={currency} />
            </div>
            <div style={styles.legend}>
              <span style={{ ...styles.legendDot, background: colors.primary }} />
              <span style={styles.legendLabel}>Expenses</span>
              <span style={{ ...styles.legendDot, background: colors.income }} />
              <span style={styles.legendLabel}>Income</span>
            </div>
          </>,
          { flex: 2 },
        )}
        {card(
          <>
            <h2 style={styles.cardTitle}>Top Categories This Month</h2>
            <div style={{ marginTop: spacing.base }}>
              <CategoryChart data={topCategories} currency={currency} />
            </div>
          </>,
          { flex: 1 },
        )}
      </div>

      {/* Recent transactions */}
      {card(
        <>
          <div style={styles.cardHeader}>
            <h2 style={styles.cardTitle}>Recent Transactions</h2>
            <a href="/dashboard/transactions" style={styles.viewAll}>View all</a>
          </div>
          {recent.length === 0 ? (
            <p style={styles.empty}>No transactions yet. Log your first expense on the mobile app.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  {['Date', 'Merchant', 'Category', 'Amount'].map((h) => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((t: any) => (
                  <tr key={t.id} style={styles.tr}>
                    <td style={styles.td}>{new Date(t.transacted_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</td>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{t.merchant ?? '—'}</td>
                    <td style={{ ...styles.td, color: colors.textSecondary }}>
                      {t.category_id ? (categoryMap[t.category_id]?.name ?? '—') : '—'}
                    </td>
                    <td style={{ ...styles.td, fontFamily: font.mono, color: t.direction === 'credit' ? colors.income : colors.text }}>
                      {t.direction === 'credit' ? '+' : '-'}{formatCurrency(t.amount, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>,
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: spacing['2xl'], display: 'flex', flexDirection: 'column', gap: spacing.xl, maxWidth: 1280 },
  title: { fontFamily: font.sans, fontWeight: 700, fontSize: fontSize['3xl'], color: colors.text },
  subtitle: { fontFamily: font.sans, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: -spacing.md },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: spacing.base },
  chartsRow: { display: 'flex', gap: spacing.base, alignItems: 'flex-start' },
  cardTitle: { fontFamily: font.sans, fontWeight: 700, fontSize: fontSize.md, color: colors.text },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.base },
  viewAll: { fontFamily: font.sans, fontWeight: 600, fontSize: fontSize.sm, color: colors.primary },
  legend: { display: 'flex', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, justifyContent: 'flex-end' },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontFamily: font.sans, fontSize: fontSize.xs, color: colors.textSecondary },
  table: { width: '100%', borderCollapse: 'collapse' as const },
  th: { fontFamily: font.sans, fontSize: fontSize.xs, fontWeight: 600, color: colors.textSecondary, textAlign: 'left' as const, padding: `${spacing.sm}px ${spacing.base}px`, borderBottom: `1px solid ${colors.border}`, textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  tr: { borderBottom: `1px solid ${colors.border}` },
  td: { fontFamily: font.sans, fontSize: fontSize.sm, color: colors.text, padding: `${spacing.md}px ${spacing.base}px` },
  empty: { fontFamily: font.sans, fontSize: fontSize.sm, color: colors.textMuted, padding: `${spacing.xl}px 0`, textAlign: 'center' as const },
}
