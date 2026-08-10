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
import {
  isLensKey,
  monthSummary,
  type LensDay,
  type LensKey,
  type LensProps,
  type LensRecurring,
  type LensTxn,
} from '../../components/lenses/types'
import {
  type CategoryKind,
  addDays,
  civilDateTimeToInstant,
  localDay,
  localParts,
  monthBounds,
} from '@voice-expense/shared'

type Cat = { id: string; name: string; kind: CategoryKind; color: string | null }

/**
 * One `LensDay` per civil day of `monthIso`, in `tz` — the "bucketing
 * happens once" primitive fix-plan 2.4 calls for. Iterates `d` from 1
 * upward and lets `civilDateTimeToInstant`'s underlying `Date.UTC`
 * overflow do the loop-termination work: `civilDateTimeToInstant(y, m,
 * 32, ...)` for a 31-day month silently normalizes to the 1st of the
 * next month, which is `>= endExclusive` and stops the loop — so this
 * never needs to compute "how many days are in this month" itself.
 *
 * Sums raw debit/credit (`amount_in_profile_currency`, FX-pending rows
 * silently excluded — same as the `aggAmount` both call sites used
 * before centralizing here), *not* the transfer-excluding `isSpend`
 * split money.ts's `summarize()` uses: `Cashflow.tsx`'s running balance
 * deliberately includes a Savings & Investing transfer (it really does
 * leave the checking balance), and `Calendar.tsx`'s per-day totals
 * always have. The month-level KPI header/MindMap/Treemap route through
 * `monthSummary()` (fix-plan 1.4) for the transfer-aware figures instead.
 */
function buildMonthDays(monthIso: string, tz: string, endExclusive: string, txns: LensTxn[]): LensDay[] {
  const [yStr, mStr] = monthIso.split('-')
  const y = Number(yStr)
  const m = Number(mStr)

  const days: LensDay[] = []
  for (let d = 1; ; d++) {
    const windowStart = civilDateTimeToInstant(y, m, d, 0, 0, 0, tz)
    if (windowStart >= endExclusive) break
    const next = addDays(y, m, d, 1)
    const windowEndExclusive = civilDateTimeToInstant(next.y, next.m, next.d, 0, 0, 0, tz)
    const local = localParts(windowStart, tz)
    days.push({
      dayOfMonth: local.d,
      isoDate: localDay(windowStart, tz),
      weekdayIndex: local.weekdayIndex,
      windowStart,
      windowEndExclusive,
      spendTotal: 0,
      incomeTotal: 0,
      txns: [],
    })
  }

  for (const t of txns) {
    if (t.transacted_at < days[0]?.windowStart || t.transacted_at >= endExclusive) continue
    const day = days.find((d) => t.transacted_at >= d.windowStart && t.transacted_at < d.windowEndExclusive)
    if (!day) continue
    day.txns.push(t)
    if (t.amount_in_profile_currency == null) continue // FX-pending — excluded, not folded in as 0
    if (t.direction === 'debit') day.spendTotal += t.amount_in_profile_currency
    else day.incomeTotal += t.amount_in_profile_currency
  }

  return days
}

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
      // fix-plan 2.1: direction/currency_code/interval/
      // amount_in_profile_currency added — LensRecurring (and MindMap's
      // "Recurring outflow") cannot get the sign, FX conversion or
      // cadence right without them. See types.ts's LensRecurring doc.
      .select('name, amount, amount_in_profile_currency, currency_code, direction, frequency, interval')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .then((r) => (r.data ?? []) as LensRecurring[]),
  ])

  const sp = await searchParams
  const lens: LensKey = isLensKey(sp.lens) ? sp.lens : 'mindmap'

  const displayName = profile?.display_name ?? user.email?.split('@')[0] ?? 'there'
  const currency = profile?.currency_code ?? 'USD'
  const locale = profile?.locale ?? 'en'
  // profiles.timezone (fix-plan 1.3 part 1) — see TimezoneSync in
  // dashboard/layout.tsx. 'UTC' matches the column default for the rare
  // render before that capture lands.
  const tz = profile?.timezone || 'UTC'

  const cats = categories as Cat[]
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c.name]))
  const catKindMap = Object.fromEntries(cats.map((c) => [c.id, c.kind]))

  // Anchor on the URL-selected month, or the current month if none. Every
  // lens computes off this window so switching months updates the whole
  // Overview at once.
  const { year: anchorY, month: anchorM } = parseMonthIso(sp.month, tz)
  const monthIso = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : currentMonthIso(tz)
  // Half-open UTC bounds from period.ts (fix-plan 1.3) — never crossed
  // to a lens as a `Date`. Passing `new Date(bounds.start)` across the
  // RSC boundary and re-reading it with the *browser's* local getters
  // is exactly the "August shows July 8" production bug (audit
  // 04-F4/04-F5/04-F6/05-F1/07-F2/08-F1) — lenses get the ISO strings
  // themselves (`LensProps.windowStart`/`windowEndExclusive`) and a
  // precomputed `days` array (below) instead.
  const bounds = monthBounds(monthIso, tz)
  const monthLabel = new Date(bounds.start).toLocaleDateString(locale, { month: 'long', timeZone: tz })
  const todayIso = localDay(new Date().toISOString(), tz)

  // Shape transactions for lens consumption. We pass the *full* set so
  // history-aware lenses (Matrix) can look at trailing months too.
  const lensTxns: LensTxn[] = transactions.map((t: any) => ({
    amount: t.amount,
    currency_code: t.currency_code,
    amount_in_profile_currency: t.amount_in_profile_currency ?? null,
    direction: t.direction,
    category_id: t.category_id ?? null,
    category_name: t.category_id ? catMap[t.category_id] ?? null : null,
    category_kind: t.category_id ? catKindMap[t.category_id] ?? null : null,
    merchant: t.merchant ?? null,
    merchant_domain: t.merchant_domain ?? null,
    transacted_at: t.transacted_at,
    is_recurring: !!t.is_recurring,
  }))

  // Bucket every civil day of the anchor month once — see `buildMonthDays`
  // below — so Calendar/Cashflow (and any future day-grid lens) render off
  // `LensProps.days` instead of each re-deriving `daysInMonth`/`firstDow`
  // from a `Date` built in whatever zone happens to be running the client.
  const days = buildMonthDays(monthIso, tz, bounds.endExclusive, lensTxns)

  const lensProps: LensProps = {
    transactions: lensTxns,
    categories: cats,
    recurring,
    currency,
    locale,
    timezone: tz,
    anchorYear: anchorY,
    anchorMonth: anchorM,
    monthIso,
    windowStart: bounds.start,
    windowEndExclusive: bounds.endExclusive,
    days,
    todayIso,
    monthLabel,
  }

  // Month-scoped totals for the KPI summary line above the lens body.
  // Routed through the one aggregation module (fix-plan 1.4) so this
  // header, MindMap, Treemap and Cashflow can never disagree: `monthOut`
  // excludes transfer-kind categories (Savings & Investing) rather than
  // counting them as spend, and `saved` is income minus expense,
  // unfloored, with the sign rendered explicitly below instead of
  // clamped to zero.
  const summary = monthSummary(lensProps)
  const monthIn = summary.income
  const monthOut = summary.expense
  const saved = summary.saved
  const monthCount = summary.transactionCount
  const pendingCount = summary.pendingCount

  const fmtShort = (v: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(v)

  return (
    <div style={styles.page}>
      <Toolbar title="Overview" right={<MonthPicker selected={monthIso} locale={locale} tz={tz} />} />
      <div style={styles.content}>
        <div style={styles.headerRow}>
          <div>
            <div style={styles.serifTitle}>
              {monthLabel} {anchorY} overview
            </div>
            <div style={styles.kpiLine}>
              <b style={{ color: colors.ink }}>{fmtShort(monthIn)}</b> in ·{' '}
              <b style={{ color: colors.ink }}>{fmtShort(monthOut)}</b> out ·{' '}
              {/* `saved` is unfloored (income - expense) with the sign
                  rendered explicitly — Intl already prefixes a negative
                  amount, so no separate clamp/sign branch is needed
                  (fix-plan 1.4). */}
              <b style={{ color: colors.accent }}>{fmtShort(saved)} saved</b> · {monthCount}{' '}
              transaction{monthCount === 1 ? '' : 's'}
            </div>
            {pendingCount > 0 && (
              <div style={styles.pendingLine}>
                {pendingCount} transaction{pendingCount === 1 ? '' : 's'} awaiting conversion
              </div>
            )}
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
  // Fill the parent <main>, which is sized to the available viewport
  // height by dashboard/layout.tsx. No `minHeight: 100vh` here — that
  // forces the page taller than the visible area when the macOS title
  // strip is eating 36 px, which produced the body-level scroll the
  // user complained about.
  page: { display: 'flex', flexDirection: 'column', height: '100%' },
  content: {
    padding: '0 20px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    flex: 1,
    minHeight: 0,
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
  // Fix-plan 1.4: never let a total render as if it were complete when
  // some rows are still awaiting an FX snapshot — the "N transactions
  // awaiting conversion" hint every total-rendering surface shows when
  // `pendingCount > 0`.
  pendingLine: {
    fontFamily: font.sans,
    fontSize: 11,
    color: colors.ink4,
    marginTop: 2,
  },
  lensBody: {
    flex: 1,
    minHeight: 600,
    display: 'flex',
    flexDirection: 'column',
  },
}
