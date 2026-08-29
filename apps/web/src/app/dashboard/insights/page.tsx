import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase/server'
import { getProfile, getTransactions, getCategories, getActiveBudgets } from '../../../lib/data'
import { colors, font, radius } from '../../../lib/theme'
import { Toolbar } from '../../../components/Toolbar'
import { Card } from '../../../components/Card'
import { Money } from '../../../components/Money'
import { Icon } from '../../../components/Icons'
import { ForecastChart } from '../../../components/ForecastChart'
import { InsightsToolbarRight } from './InsightsToolbarRight'
import {
  addDays,
  addMonthsClamped,
  civilDateTimeToInstant,
  forecastMonthly,
  heatmap,
  localParts,
  monthBounds,
  patterns,
  topMerchants,
  isSpend,
  resolveCategoryKind,
  merchantColor,
  type CategoryKind,
  type ForecastRule,
  type ForecastTxn,
  type PatternTxn,
  type PatternWindow,
} from '@voice-expense/shared'

type Txn = {
  amount: number
  /** FX snapshot — null on historical foreign-currency rows pending
   *  backfill (migration 011). Every aggregate below routes through
   *  `packages/shared/src/domain/money.ts`/`forecast.ts`/`patterns.ts`,
   *  which skip a null snapshot rather than folding it in as `0`. */
  amount_in_profile_currency: number | null
  direction: 'debit' | 'credit'
  merchant: string | null
  category_id: string | null
  category_kind?: CategoryKind | null
  is_recurring?: boolean | null
  transacted_at: string
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}
function pad4(n: number): string {
  return String(n).padStart(4, '0')
}
function monthKey(y: number, m: number): string {
  return `${pad4(y)}-${pad2(m)}`
}

/** `civilDateTimeToInstant` for the 15th of a civil month at noon — an
 *  instant guaranteed to fall inside that month regardless of `tz`,
 *  used only to hand a real `Date` to `toLocaleDateString` for display
 *  labels. Never used for range math (fix-plan 1.3 — every boundary
 *  below is a `period.ts` instant, not a `Date` getter). */
function monthLabel(y: number, m: number, tz: string, locale: string, opts: Intl.DateTimeFormatOptions): string {
  const instant = civilDateTimeToInstant(y, m, 15, 12, 0, 0, tz)
  return new Date(instant).toLocaleDateString(locale, { ...opts, timeZone: tz })
}

/** Weekday × hour, all 24 hours (fix-plan 2.11 / 04-F16 — the old
 *  8am–8pm-only bucket set silently discarded 17:00–02:59 for a
 *  Central user). Hour columns are grouped in pairs so the grid stays
 *  legible at this width; every hour is still represented. */
function Heatmap({ matrix }: { matrix: number[][] }) {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const hourPairs = Array.from({ length: 12 }, (_, i) => i * 2)
  const paired = matrix.map((row) => hourPairs.map((h) => row[h] + row[h + 1]))
  const max = Math.max(...paired.flat(), 1)
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: `16px repeat(${hourPairs.length}, 1fr)`, gap: 2 }}>
        <div />
        {hourPairs.map((h) => (
          <div key={h} style={{ fontSize: 8, color: colors.ink4, textAlign: 'center', fontWeight: 600 }}>
            {h}
          </div>
        ))}
        {days.map((d, di) => (
          <div key={di} style={{ display: 'contents' }}>
            <div style={{ fontSize: 9, color: colors.ink4, fontWeight: 600, display: 'flex', alignItems: 'center' }}>
              {d}
            </div>
            {hourPairs.map((_, hi) => {
              const v = paired[di][hi] / max
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

  const [profile, transactions, categories, budgets, recurringRows] = await Promise.all([
    getProfile(supabase, user.id),
    getTransactions(supabase, user.id),
    getCategories(supabase, user.id),
    getActiveBudgets(supabase, user.id),
    supabase
      .from('recurring_rules')
      .select('frequency, interval, starts_at, ends_at, anchor_day, anchor_weekday, anchor_time, amount, direction, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .then((r) => r.data ?? []),
  ])

  // Insights is free on every platform (CROSS §4.2). Mobile never
  // gated it; the web gate was the mismatch. Plus keeps Ask Murmur,
  // auto recurring, export formats, and desktop-companion perks.

  const txns = transactions as Txn[]
  const cats = categories as Array<{ id: string; name: string; kind: CategoryKind }>
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c]))
  const currency = profile?.currency_code ?? 'USD'
  const locale = profile?.locale ?? 'en'
  // profiles.timezone (fix-plan 1.3) — see TimezoneSync in
  // dashboard/layout.tsx. 'UTC' matches the column default for the rare
  // render before that capture lands.
  const tz = profile?.timezone || 'UTC'

  const nowInstant = new Date().toISOString()
  const now = localParts(nowInstant, tz)
  const thisMonthKey = monthKey(now.y, now.m)

  const forecastRules: ForecastRule[] = recurringRows.map((r: any) => ({
    frequency: r.frequency,
    interval: r.interval ?? 1,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    anchor_day: r.anchor_day,
    anchor_weekday: r.anchor_weekday,
    anchor_time: r.anchor_time,
    amount: r.amount,
    direction: r.direction,
  }))

  const toForecastTxn = (t: Txn): ForecastTxn => ({
    amount_in_profile_currency: t.amount_in_profile_currency,
    direction: t.direction,
    transacted_at: t.transacted_at,
    category_id: t.category_id,
    category_name: t.category_id ? catMap[t.category_id]?.name ?? null : null,
    category_kind: t.category_id ? catMap[t.category_id]?.kind ?? null : null,
    is_recurring: t.is_recurring,
  })

  // The one forecast entry point (fix-plan 2.11) — both platforms call
  // this with the same shape and get byte-identical gating. Below its
  // confidence threshold, `projected`/`range` are `null` and nothing
  // renders rather than a run-rate dressed up as a forecast.
  const forecast = forecastMonthly(txns.map(toForecastTxn), forecastRules, nowInstant, tz)

  // Six trailing calendar months (including the current, in-progress
  // one) for the chart's Actual line — each summed through `isSpend`
  // (transfers excluded) over a `period.ts` month window, never a
  // hand-rolled `new Date(y, m, 1)`.
  const monthlyTotals: Array<{ label: string; total: number; key: string }> = []
  for (let i = 5; i >= 0; i--) {
    const target = addMonthsClamped(now.y, now.m, 1, -i)
    const key = monthKey(target.y, target.m)
    const bounds = monthBounds(key, tz)
    let total = 0
    for (const t of txns) {
      if (t.transacted_at < bounds.start || t.transacted_at >= bounds.endExclusive) continue
      if (t.amount_in_profile_currency == null) continue
      const kind = resolveCategoryKind(t.category_id ? catMap[t.category_id]?.name : null, t.category_kind)
      if (!isSpend(t, kind)) continue
      total += t.amount_in_profile_currency
    }
    monthlyTotals.push({ label: monthLabel(target.y, target.m, tz, locale, { month: 'short' }), total, key })
  }
  // The subtitle claims a 6-month scope, so count only what's inside it
  // — every transaction from the first of those 6 months through now.
  const sixMonthStart = monthBounds(monthlyTotals[0].key, tz).start
  const sixMonthCount = txns.filter((t) => t.transacted_at >= sixMonthStart && t.transacted_at < nowInstant).length

  const currentTotal = monthlyTotals[monthlyTotals.length - 1].total
  const showPace = forecast.confident
  const projectedCurrent = forecast.projected ?? 0
  const projectedDelta =
    forecast.confident && forecast.usual != null && forecast.usual > 0
      ? Math.round(((projectedCurrent - forecast.usual) / forecast.usual) * 100)
      : null

  // Future months only draw once ≥2 complete prior months exist — a
  // stronger bar than the single-figure pace gate above, because three
  // months flat-lined at `usual` is a bigger claim than "at this pace".
  const canForecastFuture = forecast.sampleMonths >= 2 && (forecast.usual ?? 0) > 0
  const futureLabels: string[] = []
  for (let i = 1; i <= 3; i++) {
    const target = addMonthsClamped(now.y, now.m, 1, i)
    futureLabels.push(monthLabel(target.y, target.m, tz, locale, { month: 'short' }))
  }
  const labels = [...monthlyTotals.map((m) => m.label), ...futureLabels]
  const history = monthlyTotals.map((m) => m.total)
  const forecastLine: Array<number | null> = new Array(labels.length).fill(null)
  if (showPace) forecastLine[history.length - 1] = projectedCurrent
  if (canForecastFuture) {
    for (let k = 0; k < 3; k++) {
      forecastLine[history.length + k] = forecast.usual as number
    }
  }

  // "by <last day of month>" label for the pace annotation.
  const nextMonth = addMonthsClamped(now.y, now.m, 1, 1)
  const lastDay = addDays(nextMonth.y, nextMonth.m, 1, -1)
  const lastDayLabel = new Date(civilDateTimeToInstant(lastDay.y, lastDay.m, lastDay.d, 12, 0, 0, tz)).toLocaleDateString(
    locale,
    { month: 'short', day: 'numeric', timeZone: tz },
  )

  const overall = budgets.find((b: any) => b.category_id === null)
  const overallBudget = overall?.amount ?? null

  // Trailing 90-day window — every pattern claim below (weekday,
  // category share, merchants, heatmap) and the "Top merchants" panel
  // share this one instant window (fix-plan 2.11: "cite the window you
  // actually used").
  const ninetyDayWindow: PatternWindow = {
    start: (() => {
      const start = addDays(now.y, now.m, now.d, -89)
      return civilDateTimeToInstant(start.y, start.m, start.d, 0, 0, 0, tz)
    })(),
    endExclusive: nowInstant,
  }
  const patternTxns: PatternTxn[] = txns.map((t) => ({
    amount_in_profile_currency: t.amount_in_profile_currency,
    direction: t.direction,
    transacted_at: t.transacted_at,
    merchant: t.merchant,
    category_id: t.category_id,
    category_name: t.category_id ? catMap[t.category_id]?.name ?? null : null,
    category_kind: t.category_id ? catMap[t.category_id]?.kind ?? null : null,
  }))

  const detected = patterns(patternTxns, ninetyDayWindow, tz)
  const weekdayPattern = detected.find((p) => p.kind === 'heaviest_weekday')
  const categoryPattern = detected.find((p) => p.kind === 'category_share')
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(v)

  const patternClaims: string[] = []
  if (weekdayPattern?.confident && weekdayPattern.data) {
    const idx = weekdayPattern.data.weekdayIndex as number
    const avg = weekdayPattern.data.average as number
    patternClaims.push(`${dayNames[idx]} is your heaviest day - avg ${fmtCurrency(avg)} per ${dayNames[idx]}.`)
  }
  if (categoryPattern?.confident && categoryPattern.data) {
    const categoryId = categoryPattern.data.categoryId as string
    const share = categoryPattern.data.share as number
    const name = categoryId === '__uncategorized__' ? 'Uncategorized' : catMap[categoryId]?.name ?? 'Other'
    patternClaims.push(`${name} is ${Math.round(share * 100)}% of your spend in the last 90 days.`)
  }
  // Trend direction: last complete month vs. the prior complete months'
  // average — a secondary claim, gated the same way `usual` is (≥2
  // complete prior months).
  if (forecast.sampleMonths >= 2) {
    const complete = monthlyTotals.slice(0, -1)
    const last = complete[complete.length - 1].total
    const prior = complete.slice(0, -1)
    const priorAvg = prior.length ? prior.reduce((s, m) => s + m.total, 0) / prior.length : 0
    if (priorAvg > 0) {
      const pct = Math.round(((last - priorAvg) / priorAvg) * 100)
      if (Math.abs(pct) >= 8) {
        patternClaims.push(`Last month ran ${Math.abs(pct)}% ${pct > 0 ? 'higher' : 'lower'} than the prior average.`)
      }
    }
  }

  const merchants = topMerchants(patternTxns, ninetyDayWindow, 5)
  const merchantRows = (merchants.data?.merchants ?? []) as Array<{ merchant: string; amount: number }>
  const topMax = merchantRows[0]?.amount ?? 1

  const heat = heatmap(patternTxns, ninetyDayWindow, tz)
  const heatMatrix = (heat.data?.matrix as number[][] | undefined) ?? Array.from({ length: 7 }, () => new Array(24).fill(0))

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Toolbar title="Insights" right={<InsightsToolbarRight />} />

      <div style={styles.content}>
        <div>
          {/* Matches the sidebar label, the toolbar title above, and the
              mobile tab - was "Forecast & patterns", a third variant of
              this destination's name (audit 08-F44, fix-plan 4.2). */}
          <div style={{ fontFamily: font.serif, fontSize: 28, fontWeight: 500, color: colors.ink, letterSpacing: -0.6 }}>
            Insights
          </div>
          <div style={{ fontSize: 13, color: colors.ink3, marginTop: 2 }}>
            Based on {sixMonthCount} transaction{sixMonthCount === 1 ? '' : 's'} across the last 6
            months.
          </div>
        </div>

        <div
          style={{
            background: colors.card,
            borderRadius: radius.xl,
            padding: '18px 20px',
            border: `0.5px solid ${colors.line}`,
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
                <Money value={currentTotal} currency={currency} locale={locale} size={34} />
                <span style={{ fontSize: 13, color: colors.ink3 }}>
                  spent so far in {monthLabel(now.y, now.m, tz, locale, { month: 'long' })}
                </span>
                {showPace && (
                  <span style={{ fontSize: 13, color: colors.ink3 }}>
                    · at this pace:{' '}
                    <b style={{ color: colors.ink }}>{fmtCurrency(projectedCurrent)}</b> by {lastDayLabel}
                    {forecast.range && (
                      <> (likely {fmtCurrency(forecast.range.low)}–{fmtCurrency(forecast.range.high)})</>
                    )}
                  </span>
                )}
                {!showPace && (
                  <span style={{ fontSize: 13, color: colors.ink4 }}>Not enough history yet.</span>
                )}
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
                    {projectedDelta < 0 ? '↓' : '↑'} {Math.abs(projectedDelta)}% vs {forecast.sampleMonths}-mo avg
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
          <Card title="Patterns" right={<span style={styles.windowTag}>last 90 days</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {patternClaims.length === 0 ? (
                <div style={{ fontSize: 12, color: colors.ink3 }}>
                  Patterns will appear as your history grows. Log a few weeks to unlock insights.
                </div>
              ) : (
                patternClaims.map((p, i) => (
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
                ))
              )}
            </div>
          </Card>
          <Card title="Top merchants" right={<span style={styles.windowTag}>last 90 days</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!merchants.confident ? (
                <div style={{ fontSize: 12, color: colors.ink3 }}>Not enough data yet.</div>
              ) : (
                merchantRows.map((r, i) => {
                  // A merchant name, not a category — `merchantColor`
                  // (the same deterministic hash `MerchantLogo`'s
                  // fallback tile uses), not a category-name regex guess
                  // that could coincidentally match an unrelated
                  // category bucket (fix-plan 4.4).
                  const fg = merchantColor(r.merchant)
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
                        {r.merchant}
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
          <Card title="Heatmap · weekday × hour" right={<span style={styles.windowTag}>last 90 days</span>}>
            {!heat.confident ? (
              <div style={{ fontSize: 12, color: colors.ink3 }}>Not enough data yet.</div>
            ) : (
              <Heatmap matrix={heatMatrix} />
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  content: { padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 },
  windowTag: {
    fontSize: 10,
    fontWeight: 700,
    color: colors.ink4,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
}
