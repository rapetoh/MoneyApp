import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase/server'
import { getProfile, getTransactions, getCategories, getActiveBudgets } from '../../../lib/data'
import { resolvePlusStatus } from '../../../lib/plus.server'
import { colors, font, radius, cat, type CategoryTint } from '../../../lib/theme'
import { tintFor } from '../../../lib/categories'
import { Toolbar } from '../../../components/Toolbar'
import { Card } from '../../../components/Card'
import { Money } from '../../../components/Money'
import { Icon } from '../../../components/Icons'
import { PaywallGate } from '../../../components/PaywallGate'
import { InsightsToolbarRight } from './InsightsToolbarRight'
import { aggAmount } from '@voice-expense/shared'

type Txn = {
  amount: number
  /** FX snapshot — null on historical foreign-currency rows pending
   *  backfill (migration 011). Aggregations use `aggAmount(t)` so
   *  unconverted rows contribute 0 to the sum rather than mixing
   *  currencies. */
  amount_in_profile_currency: number | null
  direction: 'debit' | 'credit'
  merchant: string | null
  category_id: string | null
  transacted_at: string
}

function startOfMonth(year: number, month: number) {
  return new Date(year, month, 1)
}
function endOfMonth(year: number, month: number) {
  return new Date(year, month + 1, 0, 23, 59, 59)
}

function ForecastChart({
  history,
  forecast,
  budget,
  labels,
  currency,
  locale,
}: {
  history: number[]
  forecast: Array<number | null>
  budget: number | null
  labels: string[]
  currency: string
  locale: string
}) {
  const fmt = (v: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(v)
  const w = 1120
  const h = 260
  const pad = 36
  const all = [...history, ...forecast.filter((x): x is number => x != null), budget ?? 0]
  const max = Math.max(...all, 1) * 1.1
  const x = (i: number) => pad + (i / Math.max(labels.length - 1, 1)) * (w - pad * 2)
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2)

  const histPts = history.map((v, i) => [x(i), y(v)] as const)
  const histLine = histPts.length
    ? `M ${histPts[0][0]},${histPts[0][1]} ` +
      histPts.slice(1).map((p) => `L ${p[0]},${p[1]}`).join(' ')
    : ''
  const histArea = histPts.length
    ? `${histLine} L ${histPts[histPts.length - 1][0]},${h - pad} L ${histPts[0][0]},${h - pad} Z`
    : ''

  const forecastPts = forecast
    .map((v, i) => (v == null ? null : ([x(i), y(v)] as const)))
    .filter((p): p is readonly [number, number] => p != null)
  const forecastLine = forecastPts.length
    ? `M ${forecastPts[0][0]},${forecastPts[0][1]} ` +
      forecastPts.slice(1).map((p) => `L ${p[0]},${p[1]}`).join(' ')
    : ''

  return (
    <svg viewBox={`0 0 ${w} ${h + 24}`} style={{ width: '100%', height: 280 }}>
      <defs>
        <linearGradient id="gActual" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={colors.accent} stopOpacity="0.22" />
          <stop offset="100%" stopColor={colors.accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3, 4].map((i) => {
        const gy = pad + i * ((h - pad * 2) / 4)
        const val = max - (i * max) / 4
        return (
          <g key={i}>
            <line x1={pad} x2={w - pad} y1={gy} y2={gy} stroke={colors.line} strokeDasharray="2 3" />
            <text x={8} y={gy + 4} fontSize="10" fill={colors.ink4} fontWeight="600">
              {fmt(val)}
            </text>
          </g>
        )
      })}
      {budget != null && (
        <>
          <line
            x1={pad}
            x2={w - pad}
            y1={y(budget)}
            y2={y(budget)}
            stroke={colors.ink4}
            strokeWidth="1.5"
            strokeDasharray="6 4"
          />
          <text x={w - pad - 6} y={y(budget) - 6} fontSize="10" fill={colors.ink3} textAnchor="end" fontWeight="700">
            Budget {fmt(budget)}
          </text>
        </>
      )}
      {histArea && <path d={histArea} fill="url(#gActual)" />}
      {histLine && <path d={histLine} fill="none" stroke={colors.accent} strokeWidth="2.5" />}
      {forecastLine && (
        <path d={forecastLine} fill="none" stroke="#7A5A1C" strokeWidth="2.5" strokeDasharray="5 4" opacity="0.7" />
      )}
      {histPts.map(([px, py], i) => (
        <circle key={i} cx={px} cy={py} r="4" fill="#fff" stroke={colors.accent} strokeWidth="2" />
      ))}
      {labels.map((d, i) => (
        <text
          key={i}
          x={x(i)}
          y={h + 14}
          fontSize="10"
          fill={i < history.length ? colors.ink3 : colors.ink4}
          textAnchor="middle"
          fontWeight={i === history.length - 1 ? '700' : '600'}
        >
          {d}
        </text>
      ))}
    </svg>
  )
}

function Heatmap({ matrix }: { matrix: number[][] }) {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const hourBuckets = [8, 10, 12, 14, 16, 18, 20]
  const max = Math.max(...matrix.flat(), 1)
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: `16px repeat(${hourBuckets.length}, 1fr)`, gap: 3 }}>
        <div />
        {hourBuckets.map((h) => (
          <div key={h} style={{ fontSize: 9, color: colors.ink4, textAlign: 'center', fontWeight: 600 }}>
            {h}
          </div>
        ))}
        {days.map((d, di) => (
          <div key={di} style={{ display: 'contents' }}>
            <div style={{ fontSize: 9, color: colors.ink4, fontWeight: 600, display: 'flex', alignItems: 'center' }}>
              {d}
            </div>
            {hourBuckets.map((_, hi) => {
              const v = matrix[di][hi] / max
              return (
                <div
                  key={hi}
                  style={{
                    aspectRatio: '1',
                    borderRadius: 3,
                    background: v < 0.05 ? colors.surface2 : `rgba(63,90,62,${0.18 + v * 0.72})`,
                  }}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export default async function InsightsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profile, transactions, categories, budgets] = await Promise.all([
    getProfile(supabase, user.id),
    getTransactions(supabase, user.id),
    getCategories(supabase, user.id),
    getActiveBudgets(supabase, user.id),
  ])

  // Resolve Plus from the now-loaded profile so `plus_status === 'active'`
  // flips the gate in production. Dev hatches still apply when the
  // column is null/free.
  const { isPlus } = resolvePlusStatus(profile)

  if (!isPlus) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Toolbar title="Insights" />
        <div style={{ padding: '0 24px 24px' }}>
          <PaywallGate
            feature="Insights"
            title="Six months of patterns and a forecast for next month."
            body="See your trend, top merchants, the days you spend the most, and a projection that adapts as you log."
          />
        </div>
      </div>
    )
  }

  const txns = transactions as Txn[]
  const cats = categories as Array<{ id: string; name: string }>
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c]))
  const currency = profile?.currency_code ?? 'USD'
  const locale = profile?.locale ?? 'en'

  const now = new Date()
  // Last 6 calendar months by total debit
  const monthlyTotals: Array<{ label: string; total: number; year: number; month: number }> = []
  for (let i = 5; i >= 0; i--) {
    const ref = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const start = startOfMonth(ref.getFullYear(), ref.getMonth())
    const end = endOfMonth(ref.getFullYear(), ref.getMonth())
    const total = txns
      .filter((t) => {
        const d = new Date(t.transacted_at)
        return t.direction === 'debit' && d >= start && d <= end
      })
      .reduce((s, t) => s + aggAmount(t), 0)
    monthlyTotals.push({
      label: ref.toLocaleDateString(locale, { month: 'short' }),
      total,
      year: ref.getFullYear(),
      month: ref.getMonth(),
    })
  }

  const completeMonthlyTotals = monthlyTotals.slice(0, -1).map((m) => m.total).filter((v) => v > 0)
  const avg = completeMonthlyTotals.length
    ? completeMonthlyTotals.reduce((s, v) => s + v, 0) / completeMonthlyTotals.length
    : 0
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dayOfMonth = now.getDate()
  const currentTotal = monthlyTotals[monthlyTotals.length - 1].total
  const projectedCurrent = dayOfMonth > 0 ? (currentTotal / dayOfMonth) * dim : currentTotal
  const projectedDelta = avg > 0 ? Math.round(((projectedCurrent - avg) / avg) * 100) : null

  // 3 forecast months from running average
  const futureLabels: string[] = []
  for (let i = 1; i <= 3; i++) {
    const ref = new Date(now.getFullYear(), now.getMonth() + i, 1)
    futureLabels.push(ref.toLocaleDateString(locale, { month: 'short' }))
  }
  const labels = [...monthlyTotals.map((m) => m.label), ...futureLabels]
  const history = monthlyTotals.map((m) => m.total)
  // Replace last "incomplete" with projected
  history[history.length - 1] = projectedCurrent
  const forecastLine: Array<number | null> = new Array(labels.length).fill(null)
  forecastLine[history.length - 1] = projectedCurrent
  for (let k = 0; k < 3; k++) {
    forecastLine[history.length + k] = avg > 0 ? avg : projectedCurrent
  }

  const overall = budgets.find((b: any) => b.category_id === null)
  const overallBudget = overall?.amount ?? null

  // Top merchants over last 90 days
  const ninetyAgo = new Date(now)
  ninetyAgo.setDate(now.getDate() - 89)
  const merchantTotals: Record<string, number> = {}
  for (const t of txns) {
    if (t.direction !== 'debit') continue
    if (new Date(t.transacted_at) < ninetyAgo) continue
    const m = t.merchant ?? 'Unnamed'
    merchantTotals[m] = (merchantTotals[m] ?? 0) + aggAmount(t)
  }
  const topMerchants = Object.entries(merchantTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([m, amount]) => ({ m, amount }))
  const topMax = topMerchants[0]?.amount ?? 1

  // Patterns
  const patterns: string[] = []
  // Heaviest weekday
  const weekdaySums = new Array(7).fill(0)
  const weekdayCounts = new Array(7).fill(0)
  for (const t of txns) {
    if (t.direction !== 'debit') continue
    if (new Date(t.transacted_at) < ninetyAgo) continue
    const idx = new Date(t.transacted_at).getDay()
    weekdaySums[idx] += aggAmount(t)
    weekdayCounts[idx] += 1
  }
  const weekdayAvg = weekdaySums.map((sum, i) => (weekdayCounts[i] > 0 ? sum / 12 : 0))
  let heaviestIdx = 0
  let heaviestVal = -1
  for (let i = 0; i < 7; i++) {
    if (weekdayAvg[i] > heaviestVal) {
      heaviestVal = weekdayAvg[i]
      heaviestIdx = i
    }
  }
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  if (heaviestVal > 0) {
    patterns.push(
      `${dayNames[heaviestIdx]} is your heaviest day — avg ${new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(heaviestVal)}.`,
    )
  }
  // Largest category share
  const catTotals: Record<string, number> = {}
  for (const t of txns) {
    if (t.direction !== 'debit') continue
    if (new Date(t.transacted_at) < ninetyAgo) continue
    const name = t.category_id ? catMap[t.category_id]?.name ?? 'Other' : 'Uncategorized'
    catTotals[name] = (catTotals[name] ?? 0) + aggAmount(t)
  }
  const ninetyTotal = Object.values(catTotals).reduce((s, v) => s + v, 0)
  const sortedCats = Object.entries(catTotals).sort(([, a], [, b]) => b - a)
  if (sortedCats[0] && ninetyTotal > 0) {
    const [name, amount] = sortedCats[0]
    patterns.push(`${name} is ${Math.round((amount / ninetyTotal) * 100)}% of your spend in the last 90 days.`)
  }
  // Trend direction
  if (completeMonthlyTotals.length >= 2) {
    const lastFinished = completeMonthlyTotals[completeMonthlyTotals.length - 1]
    const prior = completeMonthlyTotals.slice(0, -1)
    const priorAvg = prior.reduce((s, v) => s + v, 0) / Math.max(prior.length, 1)
    if (priorAvg > 0) {
      const pct = Math.round(((lastFinished - priorAvg) / priorAvg) * 100)
      if (Math.abs(pct) >= 8) {
        patterns.push(
          `Last month ran ${Math.abs(pct)}% ${pct > 0 ? 'higher' : 'lower'} than the prior 6-month average.`,
        )
      }
    }
  }
  if (patterns.length === 0) {
    patterns.push('Patterns will appear as your history grows. Log a few weeks to unlock insights.')
  }

  // Heatmap: weekday × hour over last 90 days, Mon..Sun rows, hour buckets
  const hourBuckets = [8, 10, 12, 14, 16, 18, 20]
  const matrix: number[][] = Array.from({ length: 7 }, () => new Array(hourBuckets.length).fill(0))
  for (const t of txns) {
    if (t.direction !== 'debit') continue
    if (new Date(t.transacted_at) < ninetyAgo) continue
    const d = new Date(t.transacted_at)
    const dayIdx = (d.getDay() + 6) % 7 // Mon=0
    const hour = d.getHours()
    let bucket = -1
    for (let i = 0; i < hourBuckets.length; i++) {
      if (hour >= hourBuckets[i] && hour < hourBuckets[i] + 2) {
        bucket = i
        break
      }
    }
    if (bucket >= 0) matrix[dayIdx][bucket] += aggAmount(t)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Toolbar title="Insights" right={<InsightsToolbarRight />} />

      <div style={styles.content}>
        <div>
          <div style={{ fontFamily: font.serif, fontSize: 28, fontWeight: 500, color: colors.ink, letterSpacing: -0.6 }}>
            Forecast & patterns
          </div>
          <div style={{ fontSize: 13, color: colors.ink3, marginTop: 2 }}>
            Based on {txns.length} transactions across the last 6 months.
          </div>
        </div>

        <div
          style={{
            background: colors.card,
            borderRadius: radius.xl,
            padding: '18px 20px',
            border: `0.5px solid ${colors.line}`,
            height: 360,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: colors.ink3,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                }}
              >
                Monthly total · forecast
              </div>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <Money value={projectedCurrent} currency={currency} locale={locale} size={34} />
                <span style={{ fontSize: 13, color: colors.ink3 }}>
                  projected for {now.toLocaleDateString(locale, { month: 'long' })}
                </span>
                {projectedDelta != null && (
                  <span
                    style={{
                      fontSize: 12,
                      color: projectedDelta < 0 ? colors.accent : '#A94646',
                      fontWeight: 700,
                      background: projectedDelta < 0 ? colors.accentSoft : '#F4DDDD',
                      padding: '2px 8px',
                      borderRadius: 6,
                    }}
                  >
                    {projectedDelta < 0 ? '↓' : '↑'} {Math.abs(projectedDelta)}% vs 6-mo avg
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, color: colors.ink3, fontWeight: 600 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: colors.accent }} /> Actual
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: '#7A5A1C', opacity: 0.5 }} />
                Forecast
              </span>
              {overallBudget != null && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 4, background: colors.ink4 }} /> Budget
                </span>
              )}
            </div>
          </div>
          <ForecastChart
            history={history}
            forecast={forecastLine}
            budget={overallBudget}
            labels={labels}
            currency={currency}
            locale={locale}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          <Card title="Patterns">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {patterns.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 5,
                      background: colors.accentSoft,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon.sparkle color={colors.accent} size={10} />
                  </div>
                  <div style={{ fontSize: 13, color: colors.ink2, lineHeight: 1.5 }}>{p}</div>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Top merchants · 90 days">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topMerchants.length === 0 ? (
                <div style={{ fontSize: 12, color: colors.ink3 }}>Not enough data yet.</div>
              ) : (
                topMerchants.map((r, i) => {
                  const tint = tintFor(r.m)
                  const fg = cat[tint as CategoryTint].fg
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                      <div
                        style={{
                          width: 90,
                          color: colors.ink2,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {r.m}
                      </div>
                      <div
                        style={{
                          flex: 1,
                          height: 8,
                          borderRadius: 4,
                          background: colors.surface2,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${(r.amount / topMax) * 100}%`,
                            height: '100%',
                            background: fg,
                            opacity: 0.85,
                            borderRadius: 4,
                          }}
                        />
                      </div>
                      <div style={{ width: 64, textAlign: 'right' }}>
                        <Money value={r.amount} currency={currency} locale={locale} size={12} serif={false} bold={600} />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </Card>
          <Card title="Heatmap · weekday × hour">
            <Heatmap matrix={matrix} />
          </Card>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  content: { padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 },
}
