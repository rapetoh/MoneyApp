import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase/server'
import { getProfile, getTransactions, getCategories } from '../../lib/data'
import { colors, font } from '../../lib/theme'
import { Toolbar } from '../../components/Toolbar'
import { LensPills } from '../../components/LensPills'
import { MonthPicker } from '../../components/MonthPicker'
import { currentMonthIso, parseMonthIso } from '../../lib/monthIso'
import { MindMapLens } from '../../components/lenses/MindMap'
import { FlowLens } from '../../components/lenses/Flow'
import { CalendarLens } from '../../components/lenses/Calendar'
import { TreemapLens } from '../../components/lenses/Treemap'
import { CashflowLens } from '../../components/lenses/Cashflow'
import { MatrixLens } from '../../components/lenses/Matrix'
import { isLensKey, type LensKey, type LensProps, type LensTxn } from '../../components/lenses/types'

type Cat = { id: string; name: string }

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ lens?: string; month?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profile, transactions, categories, recurring] = await Promise.all([
    getProfile(supabase, user.id),
    getTransactions(supabase, user.id),
    getCategories(supabase, user.id),
    supabase
      .from('recurring_rules')
      .select('name, amount, frequency')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .then((r) => (r.data ?? []) as Array<{ name: string | null; amount: number; frequency: string }>),
  ])

  const sp = await searchParams
  const lens: LensKey = isLensKey(sp.lens) ? sp.lens : 'mindmap'

  const displayName = profile?.display_name ?? user.email?.split('@')[0] ?? 'there'
  const currency = profile?.currency_code ?? 'USD'
  const locale = profile?.locale ?? 'en'

  const cats = categories as Cat[]
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c.name]))

  // Anchor on the URL-selected month, or the current month if none. Every
  // lens computes off this window so switching months updates the whole
  // Overview at once.
  const { year: anchorY, month: anchorM } = parseMonthIso(sp.month)
  const monthStart = new Date(anchorY, anchorM, 1, 0, 0, 0, 0)
  const monthEnd = new Date(anchorY, anchorM + 1, 0, 23, 59, 59, 999)
  const monthLabel = monthStart.toLocaleDateString(locale, { month: 'long' })
  const monthIso = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : currentMonthIso()

  // Shape transactions for lens consumption. We pass the *full* set so
  // history-aware lenses (Matrix) can look at trailing months too.
  const lensTxns: LensTxn[] = transactions.map((t: any) => ({
    amount: t.amount,
    direction: t.direction,
    category_id: t.category_id ?? null,
    category_name: t.category_id ? catMap[t.category_id] ?? null : null,
    merchant: t.merchant ?? null,
    merchant_domain: t.merchant_domain ?? null,
    transacted_at: t.transacted_at,
    is_recurring: !!t.is_recurring,
  }))

  const lensProps: LensProps = {
    transactions: lensTxns,
    categories: cats,
    recurring,
    currency,
    locale,
    monthStart,
    monthEnd,
    monthLabel,
  }

  // Month-scoped totals for the KPI summary line above the lens body.
  let monthIn = 0
  let monthOut = 0
  let monthCount = 0
  for (const t of lensTxns) {
    const d = new Date(t.transacted_at)
    if (d < monthStart || d > monthEnd) continue
    monthCount += 1
    if (t.direction === 'credit') monthIn += t.amount
    else monthOut += t.amount
  }
  const saved = Math.max(0, monthIn - monthOut)

  const fmtShort = (v: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(v)

  return (
    <div style={styles.page}>
      <Toolbar title="Overview" right={<MonthPicker selected={monthIso} locale={locale} />} />
      <div style={styles.content}>
        <div style={styles.headerRow}>
          <div>
            <div style={styles.serifTitle}>
              {monthLabel} {monthStart.getFullYear()} overview
            </div>
            <div style={styles.kpiLine}>
              <b style={{ color: colors.ink }}>{fmtShort(monthIn)}</b> in ·{' '}
              <b style={{ color: colors.ink }}>{fmtShort(monthOut)}</b> out ·{' '}
              <b style={{ color: colors.accent }}>{fmtShort(saved)} saved</b> · {monthCount}{' '}
              transaction{monthCount === 1 ? '' : 's'}
            </div>
          </div>
          <LensPills active={lens} />
        </div>

        <div style={styles.lensBody}>
          {lens === 'mindmap' && <MindMapLens props={lensProps} displayName={displayName} />}
          {lens === 'flow' && <FlowLens props={lensProps} />}
          {lens === 'calendar' && <CalendarLens props={lensProps} />}
          {lens === 'treemap' && <TreemapLens props={lensProps} />}
          {lens === 'cashflow' && <CashflowLens props={lensProps} />}
          {lens === 'matrix' && <MatrixLens props={lensProps} />}
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', minHeight: '100vh' },
  content: {
    padding: '0 20px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    flex: 1,
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 16,
    flexWrap: 'wrap',
  },
  serifTitle: {
    fontFamily: font.serif,
    fontSize: 30,
    fontWeight: 500,
    color: colors.ink,
    letterSpacing: -0.7,
  },
  kpiLine: {
    fontFamily: font.sans,
    fontSize: 13,
    color: colors.ink3,
    marginTop: 4,
  },
  lensBody: {
    flex: 1,
    minHeight: 600,
    display: 'flex',
    flexDirection: 'column',
  },
}
