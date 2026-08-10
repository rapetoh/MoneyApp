import { useState, useMemo } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useTransactions } from '../../src/hooks/useTransactions'
import { useCategories } from '../../src/hooks/useCategories'
import { useRecurringRules } from '../../src/hooks/useRecurringRules'
import { useInsightsUnlock } from '../../src/hooks/useInsightsUnlock'
import { syncManager } from '../../src/services/sync/SyncManager'
import { Money } from '../../src/components/Money'
import { HistoryHeatmap } from '../../src/components/HistoryHeatmap'
import { BottomSheet } from '../../src/components/BottomSheet'
import { Colors, Typography, Hairline, useTabBarClearance } from '../../src/theme'
import {
  formatCurrency,
  t,
  addDays,
  addMonthsClamped,
  civilDateTimeToInstant,
  daysBetween,
  forecastMonthly,
  isSpend,
  localParts,
  monthBounds,
  monthIso,
  resolveCategoryKind,
  type CategoryKind,
  type ForecastRule,
  type ForecastTxn,
  type Locale,
} from '@voice-expense/shared'
import type { Transaction } from '@voice-expense/shared'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}
function pad4(n: number): string {
  return String(n).padStart(4, '0')
}
function monthKey(y: number, m: number): string {
  return `${pad4(y)}-${pad2(m)}`
}
function splitMonthKey(key: string): { y: number; m: number } {
  const [y, m] = key.split('-').map(Number)
  return { y, m }
}

/** Display label for a civil month, resolved in `tz` regardless of the
 *  device's own runtime zone — `civilDateTimeToInstant` + an explicit
 *  `timeZone` option, never a `Date` getter (fix-plan 1.3). */
function monthLabel(y: number, m: number, tz: string, locale: string, opts: Intl.DateTimeFormatOptions): string {
  const instant = civilDateTimeToInstant(y, m, 15, 12, 0, 0, tz)
  return new Date(instant).toLocaleDateString(locale, { ...opts, timeZone: tz })
}

/**
 * Tiny spend trend as a smooth SVG path with sage gradient fill.
 * Matches the shape in S_Insights's hero card, with explicit date
 * labels at the ends + a caption so the curve is actually informative
 * ("pretty line with no axis" was a valid user complaint).
 *
 * Catmull-Rom → cubic-bezier smoothing: each segment uses control points
 * derived from the previous and next data points, so the curve passes
 * through every sample without overshoot.
 */
function TrendSpark({
  points,
  max,
  startLabel,
  endLabel,
  captionLabel,
}: {
  points: number[]
  max: number
  startLabel: string
  endLabel: string
  captionLabel: string
}) {
  const VB_W = 300
  const VB_H = 60
  const PAD_Y = 4

  if (points.length < 2) {
    return <View style={{ height: VB_H + 36, marginTop: 14 }} />
  }

  const n = points.length
  const coords = points.map((v, i) => ({
    x: (i / (n - 1)) * VB_W,
    y: VB_H - PAD_Y - (v / Math.max(max, 1)) * (VB_H - PAD_Y * 2),
  }))

  // Catmull-Rom to cubic bezier. Each segment's control points are offset
  // from the endpoint by 1/6 of the vector between the two neighbors.
  let linePath = `M${coords[0].x.toFixed(2)},${coords[0].y.toFixed(2)}`
  for (let i = 0; i < n - 1; i++) {
    const p0 = coords[i - 1] ?? coords[i]
    const p1 = coords[i]
    const p2 = coords[i + 1]
    const p3 = coords[i + 2] ?? p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    linePath += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`
  }
  // Close the path down to the baseline for the gradient fill.
  const fillPath = `${linePath} L${VB_W},${VB_H} L0,${VB_H} Z`

  const accent = Colors.accent ?? Colors.primary

  return (
    <View style={{ marginTop: 14 }}>
      <Svg
        width="100%"
        height={VB_H}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={accent} stopOpacity={0.22} />
            <Stop offset="100%" stopColor={accent} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={fillPath} fill="url(#trendFill)" />
        <Path d={linePath} fill="none" stroke={accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
      <View style={trendAxisStyles.row}>
        <Text style={trendAxisStyles.tick}>{startLabel}</Text>
        <Text style={trendAxisStyles.caption}>{captionLabel}</Text>
        <Text style={trendAxisStyles.tick}>{endLabel}</Text>
      </View>
    </View>
  )
}

const trendAxisStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  tick: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 10,
    color: Colors.ink3 ?? Colors.textSecondary,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  caption: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 10,
    color: Colors.ink4 ?? Colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
})

/** Sum of non-transfer debit spend (fix-plan 1.4's `isSpend` — a
 *  Savings & Investing debit no longer inflates this the way a bare
 *  `direction === 'debit'` filter did) in the half-open instant window
 *  `[startInstant, endExclusiveInstant)`. */
function spendInWindow(
  txns: Transaction[],
  categoryKindById: Record<string, CategoryKind>,
  startInstant: string,
  endExclusiveInstant: string,
): number {
  let total = 0
  for (const tx of txns) {
    if (tx.is_deleted) continue
    if (tx.transacted_at < startInstant || tx.transacted_at >= endExclusiveInstant) continue
    if (tx.amount_in_profile_currency == null) continue
    const kind = tx.category_id ? categoryKindById[tx.category_id] ?? null : null
    if (!isSpend(tx, kind)) continue
    total += tx.amount_in_profile_currency
  }
  return total
}

export default function InsightsScreen() {
  // Clears the floating tab bar (audit 01-F13, fix-plan 1.8/2.14) — replaces
  // the hand-picked `paddingBottom: 120` literal.
  const tabBarClearance = useTabBarClearance()
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  // Read-error exposure (fix-plan 2.13 / audit 08-F21 family) — a failed
  // read used to render identically to "nothing to show" in the
  // categories card below (`transactions` stays `[]` either way).
  const { transactions, error: transactionsError } = useTransactions(user?.id)
  const { categoryMap } = useCategories(user?.id)
  const { rules } = useRecurringRules(user?.id)

  const locale = (profile?.locale ?? 'en') as Locale
  const currency = profile?.currency_code ?? 'USD'
  // profiles.timezone (fix-plan 1.3) — captured from the device via
  // expo-localization in useProfile; 'UTC' matches the column default
  // for the rare render before that capture lands.
  const tz = profile?.timezone || 'UTC'

  const categoryKindById = useMemo(() => {
    const out: Record<string, CategoryKind> = {}
    for (const [id, c] of Object.entries(categoryMap)) {
      // `categories.kind` carries a CHECK constraint the generated row
      // type can't see — narrowed the same way every other CHECK-
      // constrained column in this repo is.
      out[id] = (c as { kind?: string }).kind as CategoryKind
    }
    return out
  }, [categoryMap])

  const nowInstant = useMemo(() => new Date().toISOString(), [])
  const nowParts = useMemo(() => localParts(nowInstant, tz), [nowInstant, tz])
  const currentMonthKey = monthKey(nowParts.y, nowParts.m)

  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(currentMonthKey)
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)

  const isCurrentMonth = selectedMonthKey === currentMonthKey
  const { y: selY, m: selM } = splitMonthKey(selectedMonthKey)

  // Day-3 Insights unlock welcome card. Renders on the user's first visit
  // after they cross the 3-transaction threshold. Dismissal flips the
  // SecureStore flag so the badge dot on the tab icon also clears.
  const totalTxnCount = transactions.filter((tx) => !tx.is_deleted).length
  const { showWelcome, markSeen } = useInsightsUnlock(totalTxnCount)
  const [welcomeDismissed, setWelcomeDismissed] = useState(false)
  const showWelcomeCard = showWelcome && !welcomeDismissed
  function dismissWelcome() {
    setWelcomeDismissed(true)
    void markSeen()
  }

  // Last 12 months available for the picker, as "YYYY-MM" keys — no
  // `Date` identity involved, so there is nothing to hand-roll (fix-plan
  // 1.3's named gap for this file).
  const monthOptions = useMemo(() => {
    const opts: string[] = []
    for (let i = 0; i < 12; i++) {
      const target = addMonthsClamped(nowParts.y, nowParts.m, 1, -i)
      opts.push(monthKey(target.y, target.m))
    }
    return opts
  }, [nowParts.y, nowParts.m])

  const monthBoundsInstants = useMemo(() => monthBounds(selectedMonthKey, tz), [selectedMonthKey, tz])
  const daysInSelectedMonth = useMemo(() => {
    const next = addMonthsClamped(selY, selM, 1, 1)
    return daysBetween(selY, selM, 1, next.y, next.m, next.d)
  }, [selY, selM])

  // "Spent · Apr 1 – 18" on the hero — end day is today if viewing the
  // current month, otherwise the last day of the selected month.
  const rangeEndDay = isCurrentMonth ? nowParts.d : daysInSelectedMonth
  const rangeLabel = `${monthLabel(selY, selM, tz, locale, { month: 'short' })} 1 – ${rangeEndDay}`

  const monthSpent = useMemo(
    () => spendInWindow(transactions, categoryKindById, monthBoundsInstants.start, monthBoundsInstants.endExclusive),
    [transactions, categoryKindById, monthBoundsInstants],
  )

  // Prior month for the % delta pill.
  const prevMonthTarget = useMemo(() => addMonthsClamped(selY, selM, 1, -1), [selY, selM])
  const prevMonthBoundsInstants = useMemo(
    () => monthBounds(monthKey(prevMonthTarget.y, prevMonthTarget.m), tz),
    [prevMonthTarget, tz],
  )
  const prevMonthSpent = useMemo(
    () => spendInWindow(transactions, categoryKindById, prevMonthBoundsInstants.start, prevMonthBoundsInstants.endExclusive),
    [transactions, categoryKindById, prevMonthBoundsInstants],
  )
  const prevMonthLabel = monthLabel(prevMonthTarget.y, prevMonthTarget.m, tz, locale, { month: 'short' })

  // If current month in-progress, normalize the % to days-elapsed so a
  // mid-month comparison isn't misleadingly low.
  const daysElapsed = isCurrentMonth ? nowParts.d : daysInSelectedMonth
  const prevEquiv =
    isCurrentMonth && prevMonthSpent > 0
      ? (prevMonthSpent * daysElapsed) / daysInSelectedMonth
      : prevMonthSpent
  const deltaPct =
    prevEquiv > 0 ? Math.round(((monthSpent - prevEquiv) / prevEquiv) * 100) : null

  // Categories: sum non-transfer debits per category for the selected
  // month, sorted desc. The percentage denominator is the FULL total —
  // never the top-6 subtotal (05-F36/05-F37: six displayed rows always
  // summed to 100% regardless of how many categories actually existed)
  // — and a truncated "Other · N categories" row carries the remainder
  // so the visible rows + Other still add up to the real total.
  const categoryBreakdown = useMemo(() => {
    const byId: Record<string, { id: string; name: string; color: string; amount: number }> = {}
    for (const tx of transactions) {
      if (tx.is_deleted) continue
      if (tx.transacted_at < monthBoundsInstants.start || tx.transacted_at >= monthBoundsInstants.endExclusive) continue
      if (tx.amount_in_profile_currency == null) continue
      const kind = tx.category_id ? categoryKindById[tx.category_id] ?? null : null
      if (!isSpend(tx, kind)) continue
      const id = tx.category_id ?? '__uncategorized__'
      const catRow = tx.category_id ? categoryMap[tx.category_id] : null
      const name = catRow?.name ?? t('transactions.uncategorized', locale)
      const color = catRow?.color ?? Colors.ink4 ?? Colors.textMuted
      if (!byId[id]) byId[id] = { id, name, color, amount: 0 }
      byId[id].amount += tx.amount_in_profile_currency
    }
    const all = Object.values(byId).sort((a, b) => b.amount - a.amount)
    const total = all.reduce((s, r) => s + r.amount, 0)
    const TOP_N = 6
    const top = all.slice(0, TOP_N)
    const rest = all.slice(TOP_N)
    const rows = top.map((r) => ({ ...r, pct: total > 0 ? Math.round((r.amount / total) * 100) : 0 }))
    if (rest.length > 0) {
      const otherAmount = rest.reduce((s, r) => s + r.amount, 0)
      rows.push({
        id: '__other__',
        name: `${t('insights.other', locale)} · ${rest.length}`,
        color: Colors.ink4 ?? Colors.textMuted,
        amount: otherAmount,
        pct: total > 0 ? Math.round((otherAmount / total) * 100) : 0,
      })
    }
    return rows
  }, [transactions, categoryKindById, categoryMap, monthBoundsInstants, locale])
  const maxCatPct = categoryBreakdown[0]?.pct ?? 1

  // 14-point mini trend of daily spend across the selected month's window.
  // Used for the hero card's tiny spark line (RN Views, no SVG so we don't
  // pick up a react-native-svg dep mid-Phase-D).
  const trend = useMemo(() => {
    const points: number[] = []
    const rangeDays = Math.min(14, rangeEndDay)
    for (let i = rangeDays - 1; i >= 0; i--) {
      const dayNum = rangeEndDay - i
      const dayStart = civilDateTimeToInstant(selY, selM, dayNum, 0, 0, 0, tz)
      const nextDay = addDays(selY, selM, dayNum, 1)
      const dayEnd = civilDateTimeToInstant(nextDay.y, nextDay.m, nextDay.d, 0, 0, 0, tz)
      points.push(spendInWindow(transactions, categoryKindById, dayStart, dayEnd))
    }
    return points
  }, [transactions, categoryKindById, selY, selM, rangeEndDay, tz])
  const trendMax = Math.max(...trend, 1)
  const trendStartLabel = useMemo(() => {
    const startDayNum = rangeEndDay - (trend.length - 1)
    const start = civilDateTimeToInstant(selY, selM, Math.max(1, startDayNum), 12, 0, 0, tz)
    return new Date(start).toLocaleDateString(locale, { month: 'short', day: 'numeric', timeZone: tz })
  }, [selY, selM, rangeEndDay, trend.length, tz, locale])
  const trendEndLabel = useMemo(() => {
    const end = civilDateTimeToInstant(selY, selM, rangeEndDay, 12, 0, 0, tz)
    return new Date(end).toLocaleDateString(locale, { month: 'short', day: 'numeric', timeZone: tz })
  }, [selY, selM, rangeEndDay, tz, locale])

  // Forecast — the one shared entry point (fix-plan 2.11): both
  // platforms call `forecastMonthly` with the same shape and get
  // byte-identical gating, instead of mobile's own ad-hoc "avg of 3
  // prior months, filter out zeros" with no distinct-day requirement.
  const forecastTxns: ForecastTxn[] = useMemo(
    () =>
      transactions
        .filter((tx) => !tx.is_deleted)
        .map((tx) => ({
          amount_in_profile_currency: tx.amount_in_profile_currency,
          direction: tx.direction,
          transacted_at: tx.transacted_at,
          category_id: tx.category_id,
          category_name: tx.category_id ? categoryMap[tx.category_id]?.name ?? null : null,
          category_kind: tx.category_id ? categoryKindById[tx.category_id] ?? null : null,
          is_recurring: tx.is_recurring,
        })),
    [transactions, categoryMap, categoryKindById],
  )
  const forecastRules: ForecastRule[] = useMemo(
    () =>
      rules
        .filter((r) => r.is_active)
        .map((r) => ({
          frequency: r.frequency,
          interval: r.interval ?? 1,
          starts_at: r.starts_at,
          ends_at: r.ends_at,
          anchor_day: r.anchor_day,
          anchor_weekday: r.anchor_weekday,
          anchor_time: r.anchor_time,
          amount: r.amount,
          direction: r.direction,
        })),
    [rules],
  )
  const forecast = useMemo(
    () => forecastMonthly(forecastTxns, forecastRules, nowInstant, tz),
    [forecastTxns, forecastRules, nowInstant, tz],
  )
  const showForecast = isCurrentMonth && forecast.confident
  const forecastDiff = (forecast.projected ?? 0) - (forecast.usual ?? 0)

  // Single-line month label used inside the forecast serif sentence.
  const selectedMonthName = monthLabel(selY, selM, tz, locale, { month: 'long' })

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]} showsVerticalScrollIndicator={false}>
        {/* Title block — eyebrow + serif headline. Month picker is a subtle
            button in the eyebrow row so the overall page header stays calm. */}
        <View style={styles.header}>
          <View style={styles.eyebrowRow}>
            <Text style={styles.eyebrow}>
              {isCurrentMonth
                ? t('insights.eyebrow_this_month', locale)
                : monthLabel(selY, selM, tz, locale, { month: 'long', year: 'numeric' })}
            </Text>
            <Pressable
              onPress={() => setMonthPickerOpen(true)}
              style={({ pressed }) => [styles.monthChev, pressed && styles.monthChevPressed]}
              hitSlop={10}
            >
              <Ionicons name="chevron-down" size={14} color={Colors.ink3 ?? Colors.textSecondary} />
            </Pressable>
          </View>
          <Text style={styles.heading}>{t('insights.heading', locale)}</Text>
        </View>

        {/* Day-3 unlock welcome card — first reveal only. Dismissal clears
            both this card and the badge dot on the tab icon. */}
        {showWelcomeCard && (
          <View style={styles.welcomeWrap}>
            <View style={styles.welcomeCard}>
              <View style={styles.welcomeHeaderRow}>
                <View style={styles.welcomeBadge}>
                  <Ionicons name="sparkles" size={14} color={Colors.accent} />
                </View>
                <Text style={styles.welcomeEyebrow}>
                  {t('insights.unlock_eyebrow', locale)}
                </Text>
                <Pressable
                  onPress={dismissWelcome}
                  hitSlop={12}
                  style={({ pressed }) => [
                    styles.welcomeClose,
                    pressed && styles.welcomeClosePressed,
                  ]}
                  accessibilityLabel={t('common.dismiss', locale)}
                >
                  <Ionicons name="close" size={14} color={Colors.ink3} />
                </Pressable>
              </View>
              <Text style={styles.welcomeTitle}>
                {t('insights.unlock_title', locale)}
              </Text>
              <Text style={styles.welcomeBody}>
                {t('insights.unlock_body', locale)}
              </Text>
            </View>
          </View>
        )}

        {/* Hero: spent for the selected window + delta pill + mini trend. */}
        <View style={styles.heroWrap}>
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>
              {t('insights.spent', locale)} · {rangeLabel}
            </Text>
            <View style={styles.heroAmountRow}>
              <Money value={monthSpent} currencyCode={currency} locale={locale} size={52} />
              {deltaPct != null && (
                <View style={styles.deltaPill}>
                  <Text style={styles.deltaPillText}>
                    {deltaPct > 0 ? '+' : deltaPct < 0 ? '−' : ''}
                    {Math.abs(deltaPct)}% {t('insights.vs', locale)} {prevMonthLabel}
                  </Text>
                </View>
              )}
            </View>
            <TrendSpark
              points={trend}
              max={trendMax}
              startLabel={trendStartLabel}
              endLabel={trendEndLabel}
              captionLabel={`${t('insights.last_n_days_prefix', locale)} ${trend.length} ${t('insights.last_n_days_suffix', locale)}`}
            />
          </View>
        </View>

        {/* Categories */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionLabel}>{t('insights.categories', locale)}</Text>
          {transactionsError && categoryBreakdown.length === 0 ? (
            // Error+retry state (fix-plan 2.13) instead of "nothing to
            // show yet" — this section is the one place on this screen a
            // failed read and a genuinely empty month rendered
            // identically. `useTransactions` exposes no `refetch`, so the
            // best available retry is re-driving the same pull it already
            // runs on mount.
            <View style={styles.emptyCard}>
              <Ionicons name="alert-circle-outline" size={28} color={Colors.destructive ?? '#A94646'} style={{ marginBottom: 4 }} />
              <Text style={styles.emptyText}>{t('common.load_failed', locale)}</Text>
              <Pressable
                onPress={() => user?.id && syncManager.pullRemote(user.id)}
                style={({ pressed }) => [styles.errorRetryBtn, pressed && styles.errorRetryBtnPressed]}
              >
                <Ionicons name="refresh" size={14} color="#FFFFFF" />
                <Text style={styles.errorRetryText}>{t('common.retry', locale)}</Text>
              </Pressable>
            </View>
          ) : categoryBreakdown.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>{t('insights.empty', locale)}</Text>
            </View>
          ) : (
            <View style={styles.catCard}>
              {categoryBreakdown.map((row, i) => {
                const isLast = i === categoryBreakdown.length - 1
                const barWidthPct = Math.max(4, (row.pct / Math.max(maxCatPct, 1)) * 100)
                return (
                  <View
                    key={row.id}
                    style={[styles.catRow, !isLast && styles.catRowDivider]}
                  >
                    <View style={styles.catRowHeader}>
                      <View style={styles.catLeft}>
                        <View style={[styles.catDot, { backgroundColor: row.color }]} />
                        <Text style={styles.catName} numberOfLines={1}>
                          {row.name}
                        </Text>
                      </View>
                      <View style={styles.catRight}>
                        <Money value={row.amount} currencyCode={currency} locale={locale} size={15} serif={false} sansWeight="600" />
                        <Text style={styles.catPct}>{row.pct}%</Text>
                      </View>
                    </View>
                    <View style={styles.catBarTrack}>
                      <View
                        style={[
                          styles.catBarFill,
                          { width: `${barWidthPct}%`, backgroundColor: row.color },
                        ]}
                      />
                    </View>
                  </View>
                )
              })}
            </View>
          )}
        </View>

        {/* Forecast — dark ink card, only for the current month once
            `forecastMonthly` reports enough history to be confident
            (fix-plan 2.11 — this used to render from a single day-old
            account with no gate at all). */}
        {showForecast && (
          <View style={styles.forecastWrap}>
            <View style={styles.forecastCard}>
              <View style={styles.forecastEyebrowRow}>
                <Ionicons name="sparkles" size={13} color="#FFFFFF" style={{ opacity: 0.7 }} />
                <Text style={styles.forecastEyebrow}>{t('insights.forecast', locale)}</Text>
              </View>
              <Text style={styles.forecastLine}>
                {t('insights.forecast_line_prefix', locale)}{' '}
                <Text style={styles.forecastAmount}>
                  {formatCurrency(Math.round(forecast.projected ?? 0), currency, locale)}
                </Text>{' '}
                {t('insights.forecast_line_suffix', locale).replace('{month}', selectedMonthName)}
              </Text>
              <Text style={styles.forecastDelta}>
                {Math.abs(forecastDiff) < 10
                  ? t('insights.forecast_same', locale)
                  : forecastDiff < 0
                    ? `${formatCurrency(Math.round(Math.abs(forecastDiff)), currency, locale)} ${t('insights.forecast_below', locale)}`
                    : `${formatCurrency(Math.round(forecastDiff), currency, locale)} ${t('insights.forecast_above', locale)}`}
              </Text>
              {forecast.range && (
                <Text style={styles.forecastRange}>
                  {formatCurrency(Math.round(forecast.range.low), currency, locale)} –{' '}
                  {formatCurrency(Math.round(forecast.range.high), currency, locale)}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* History section — year-at-a-glance heatmap + months list. Moved
            here from the dedicated /more/history route so the whole data-
            visualization story lives on one surface. Tapping a month row
            drills into /more/transactions scoped to that month. */}
        <View style={styles.historyWrap}>
          <Text style={styles.historySectionLabel}>{t('insights.history', locale)}</Text>
          <HistoryHeatmap transactions={transactions} locale={locale} currencyCode={currency} tz={tz} />
        </View>
      </ScrollView>

      {/* Month picker — rendered through the shared `<BottomSheet>`
          (fix-plan 1.8/2.14) instead of a hand-rolled `<Modal>`. This is
          also the fix for 01-F18: the old sheet was a plain `<View>` with
          no `onPress` stop-propagation, so tapping anywhere in its own
          padding (not just the backdrop) bubbled up and dismissed it —
          `BottomSheet`'s body swallows its own touches by construction. */}
      <BottomSheet
        visible={monthPickerOpen}
        onClose={() => setMonthPickerOpen(false)}
        title={t('insights.select_month', locale)}
        cancelLabel={t('common.cancel', locale)}
        contentContainerStyle={styles.monthSheetContent}
        testID="insights-month-sheet"
      >
        {monthOptions.map((key) => {
          const active = key === selectedMonthKey
          const { y, m } = splitMonthKey(key)
          return (
            <Pressable
              key={key}
              style={[styles.monthOption, active && styles.monthOptionActive]}
              onPress={() => {
                setSelectedMonthKey(key)
                setMonthPickerOpen(false)
              }}
            >
              <Text style={[styles.monthOptionText, active && styles.monthOptionTextActive]}>
                {monthLabel(y, m, tz, locale, { month: 'long', year: 'numeric' })}
              </Text>
              {active && (
                <Ionicons name="checkmark" size={18} color={Colors.accent ?? Colors.primary} />
              )}
            </Pressable>
          )
        })}
      </BottomSheet>
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles — trace S_Insights in docs/money-app/project/mobile-screens-2.jsx
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  // `paddingBottom` set per-instance above from `useTabBarClearance()`
  // (audit 01-F13, fix-plan 1.8/2.14).
  content: {},

  header: { paddingHorizontal: 22, paddingTop: 14, paddingBottom: 4 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrow: {
    color: Colors.ink4 ?? Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  monthChev: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthChevPressed: { opacity: 0.5 },
  heading: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.8,
    color: Colors.ink ?? Colors.text,
    marginTop: 4,
  },

  // Hero
  // Day-3 Insights unlock welcome card. Sage-tinted accent card with a
  // sparkle badge + close pill + body copy. Renders only on the user's first
  // eligible visit, vanishes on dismiss.
  welcomeWrap: { paddingHorizontal: 20, paddingTop: 14 },
  welcomeCard: {
    backgroundColor: Colors.accentSoft ?? Colors.primaryLight,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 18,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  welcomeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  welcomeBadge: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeEyebrow: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Colors.accent ?? Colors.primary,
    fontFamily: Typography.fontFamily.sansBold,
  },
  welcomeClose: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeClosePressed: { opacity: 0.55 },
  welcomeTitle: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.4,
    color: Colors.ink ?? Colors.text,
    fontWeight: '500',
    marginTop: 12,
  },
  welcomeBody: {
    fontSize: 14,
    lineHeight: 21,
    color: Colors.ink2 ?? Colors.textSecondary,
    fontFamily: Typography.fontFamily.sans,
    marginTop: 6,
  },

  heroWrap: { paddingHorizontal: 20, paddingTop: 12 },
  heroCard: {
    backgroundColor: Colors.surface2 ?? Colors.card,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 24,
  },
  heroLabel: {
    color: Colors.ink3 ?? Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  deltaPill: {
    backgroundColor: Colors.accentSoft ?? Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  deltaPillText: {
    color: Colors.accent ?? Colors.primary,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
  },

  // Categories
  sectionWrap: { paddingHorizontal: 20, paddingTop: 20 },
  sectionLabel: {
    color: Colors.ink3 ?? Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: Typography.fontFamily.sansBold,
    marginBottom: 10,
  },
  catCard: {
    backgroundColor: Colors.surface2 ?? Colors.card,
    borderRadius: 22,
    paddingVertical: 4,
  },
  catRow: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  catRowDivider: {
    borderBottomWidth: Hairline.width,
    borderBottomColor: Hairline.color,
  },
  catRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  catLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  catDot: { width: 10, height: 10, borderRadius: 3 },
  catName: {
    fontSize: 15,
    color: Colors.ink ?? Colors.text,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
    flexShrink: 1,
  },
  catRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catPct: {
    fontSize: 12,
    color: Colors.ink3 ?? Colors.textSecondary,
    fontWeight: '600',
    minWidth: 28,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  catBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.surface ?? Colors.border,
    overflow: 'hidden',
  },
  catBarFill: {
    height: '100%',
    borderRadius: 3,
    opacity: 0.85,
  },

  // Forecast
  forecastWrap: { paddingHorizontal: 20, paddingTop: 18 },
  historyWrap: { paddingTop: 28 },
  historySectionLabel: {
    paddingHorizontal: 28,
    paddingBottom: 4,
    color: Colors.ink3 ?? Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: Typography.fontFamily.sansBold,
  },
  forecastCard: {
    backgroundColor: Colors.ink ?? '#1B1915',
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 20,
  },
  forecastEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  forecastEyebrow: {
    color: '#FFFFFF',
    opacity: 0.7,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: Typography.fontFamily.sansBold,
  },
  forecastLine: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '500',
    color: '#FFFFFF',
    marginTop: 10,
    letterSpacing: -0.2,
  },
  forecastAmount: {
    color: Colors.accentSoft ?? '#C9D6BE',
    fontWeight: '600',
  },
  forecastDelta: {
    color: '#FFFFFF',
    opacity: 0.7,
    fontSize: 14,
    fontFamily: Typography.fontFamily.sans,
    marginTop: 8,
  },
  forecastRange: {
    color: '#FFFFFF',
    opacity: 0.5,
    fontSize: 12,
    fontFamily: Typography.fontFamily.sans,
    marginTop: 4,
  },

  // Empty state (categories)
  emptyCard: {
    backgroundColor: Colors.surface2 ?? Colors.card,
    borderRadius: 22,
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 14,
    color: Colors.ink3 ?? Colors.textSecondary,
    textAlign: 'center',
  },
  errorRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Colors.ink ?? '#1B1915',
  },
  errorRetryBtnPressed: { opacity: 0.8 },
  errorRetryText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Month picker sheet — backdrop/header/chrome now owned by the shared
  // `<BottomSheet>`; only the option rows' own styles remain here.
  monthSheetContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  monthOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  monthOptionActive: { backgroundColor: Colors.accentSoft ?? Colors.primaryLight },
  monthOptionText: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 16,
    color: Colors.ink ?? Colors.text,
  },
  monthOptionTextActive: {
    fontFamily: Typography.fontFamily.sansBold,
    color: Colors.accent ?? Colors.primary,
  },
})
