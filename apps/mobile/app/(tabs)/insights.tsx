import { useState, useMemo } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useTransactions } from '../../src/hooks/useTransactions'
import { useCategories } from '../../src/hooks/useCategories'
import { Money } from '../../src/components/Money'
import { HistoryHeatmap } from '../../src/components/HistoryHeatmap'
import { Colors, Typography, Hairline } from '../../src/theme'
import { formatCurrency, t, type Locale } from '@voice-expense/shared'
import type { Transaction } from '@voice-expense/shared'

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
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

// Sum debits for a date range from the full local transaction list.
function sumDebits(txns: Transaction[], start: Date, end: Date): number {
  const s = start.toISOString()
  const e = end.toISOString()
  return txns
    .filter((tx) => !tx.is_deleted && tx.direction === 'debit' && tx.transacted_at >= s && tx.transacted_at < e)
    .reduce((acc, tx) => acc + tx.amount, 0)
}

export default function InsightsScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const { transactions } = useTransactions(user?.id)
  const { categoryMap } = useCategories(user?.id)

  const locale = (profile?.locale ?? 'en') as Locale
  const currency = profile?.currency_code ?? 'USD'

  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState<Date>(
    new Date(now.getFullYear(), now.getMonth(), 1),
  )
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)

  const isCurrentMonth =
    selectedMonth.getFullYear() === now.getFullYear() && selectedMonth.getMonth() === now.getMonth()

  // Last 12 months available for the picker.
  const monthOptions = useMemo(() => {
    const opts: Date[] = []
    for (let i = 0; i < 12; i++) {
      opts.push(new Date(now.getFullYear(), now.getMonth() - i, 1))
    }
    return opts
    // now.getFullYear/getMonth are stable within a session, so a no-dep list
    // is fine and avoids re-creating the array on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const monthStart = useMemo(
    () => new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1),
    [selectedMonth],
  )
  const monthEnd = useMemo(
    () => new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1),
    [selectedMonth],
  )

  // "Spent · Apr 1 – 18" on the hero — end date is today if viewing the
  // current month, otherwise the last day of the selected month.
  const rangeEnd = isCurrentMonth ? now : new Date(monthEnd.getTime() - 1)
  const rangeLabel = [
    `${monthStart.toLocaleDateString(locale, { month: 'short' })} 1`,
    rangeEnd.getDate().toString(),
  ].join(' – ')

  const monthSpent = useMemo(
    () => sumDebits(transactions, monthStart, monthEnd),
    [transactions, monthStart, monthEnd],
  )

  // Prior month for the % delta pill.
  const prevMonthStart = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1)
  const prevMonthEnd = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1)
  const prevMonthSpent = useMemo(
    () => sumDebits(transactions, prevMonthStart, prevMonthEnd),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, selectedMonth],
  )
  const prevMonthLabel = prevMonthStart.toLocaleDateString(locale, { month: 'short' })

  // If current month in-progress, normalize the % to days-elapsed so a
  // mid-month comparison isn't misleadingly low.
  const daysInSelectedMonth = new Date(
    selectedMonth.getFullYear(),
    selectedMonth.getMonth() + 1,
    0,
  ).getDate()
  const daysElapsed = isCurrentMonth ? now.getDate() : daysInSelectedMonth
  const prevEquiv =
    isCurrentMonth && prevMonthSpent > 0
      ? (prevMonthSpent * daysElapsed) / daysInSelectedMonth
      : prevMonthSpent
  const deltaPct =
    prevEquiv > 0 ? Math.round(((monthSpent - prevEquiv) / prevEquiv) * 100) : null

  // Categories: sum debits per category for the selected month, sorted desc.
  const monthDebits = useMemo(() => {
    return transactions.filter(
      (tx) =>
        !tx.is_deleted &&
        tx.direction === 'debit' &&
        tx.transacted_at >= monthStart.toISOString() &&
        tx.transacted_at < monthEnd.toISOString(),
    )
  }, [transactions, monthStart, monthEnd])

  const categoryBreakdown = useMemo(() => {
    const byId: Record<string, { id: string; name: string; color: string; amount: number }> = {}
    for (const tx of monthDebits) {
      const id = tx.category_id ?? '__uncategorized__'
      const cat = tx.category_id ? categoryMap[tx.category_id] : null
      const name = cat?.name ?? t('transactions.uncategorized', locale)
      const color = cat?.color ?? Colors.ink4 ?? Colors.textMuted
      if (!byId[id]) byId[id] = { id, name, color, amount: 0 }
      byId[id].amount += tx.amount
    }
    const rows = Object.values(byId).sort((a, b) => b.amount - a.amount).slice(0, 6)
    const total = rows.reduce((s, r) => s + r.amount, 0)
    return rows.map((r) => ({
      ...r,
      pct: total > 0 ? Math.round((r.amount / total) * 100) : 0,
    }))
  }, [monthDebits, categoryMap, locale])
  const maxCatPct = categoryBreakdown[0]?.pct ?? 1

  // 14-point mini trend of daily spend across the selected month's window.
  // Used for the hero card's tiny spark line (RN Views, no SVG so we don't
  // pick up a react-native-svg dep mid-Phase-D).
  const trend = useMemo(() => {
    const points: number[] = []
    // Show up to the last 14 days of the range ending at rangeEnd.
    const rangeDays = Math.min(
      14,
      Math.max(1, Math.round((rangeEnd.getTime() - monthStart.getTime()) / 86400000) + 1),
    )
    for (let i = rangeDays - 1; i >= 0; i--) {
      const dStart = new Date(rangeEnd)
      dStart.setHours(0, 0, 0, 0)
      dStart.setDate(rangeEnd.getDate() - i)
      const dEnd = new Date(dStart)
      dEnd.setDate(dStart.getDate() + 1)
      points.push(sumDebits(transactions, dStart, dEnd))
    }
    return points
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, selectedMonth])
  const trendMax = Math.max(...trend, 1)

  // Forecast: only meaningful for the current month with some data behind us.
  // Usual = avg of the previous 3 full months; skip if we don't have that.
  const usualMonthly = useMemo(() => {
    const months: number[] = []
    for (let i = 1; i <= 3; i++) {
      const s = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const e = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      months.push(sumDebits(transactions, s, e))
    }
    const filled = months.filter((m) => m > 0)
    return filled.length > 0 ? filled.reduce((a, b) => a + b, 0) / filled.length : 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions])
  const projectedMonthly = useMemo(() => {
    if (!isCurrentMonth || daysElapsed < 1) return 0
    return (monthSpent / daysElapsed) * daysInSelectedMonth
  }, [isCurrentMonth, monthSpent, daysElapsed, daysInSelectedMonth])
  const forecastDiff = projectedMonthly - usualMonthly
  const showForecast = isCurrentMonth && usualMonthly > 0 && monthSpent > 0

  // Single-line month label used inside the forecast serif sentence.
  const selectedMonthName = selectedMonth.toLocaleDateString(locale, { month: 'long' })

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Title block — eyebrow + serif headline. Month picker is a subtle
            button in the eyebrow row so the overall page header stays calm. */}
        <View style={styles.header}>
          <View style={styles.eyebrowRow}>
            <Text style={styles.eyebrow}>
              {isCurrentMonth
                ? t('insights.eyebrow_this_month', locale)
                : selectedMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
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

        {/* Hero: spent for the selected window + delta pill + mini trend. */}
        <View style={styles.heroWrap}>
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>
              {t('insights.spent', locale)} · {rangeLabel}
            </Text>
            <View style={styles.heroAmountRow}>
              <Money value={monthSpent} size={52} />
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
              startLabel={
                // First point is `trend.length - 1` days before rangeEnd.
                new Date(rangeEnd.getTime() - (trend.length - 1) * 86400000)
                  .toLocaleDateString(locale, { month: 'short', day: 'numeric' })
              }
              endLabel={rangeEnd.toLocaleDateString(locale, { month: 'short', day: 'numeric' })}
              captionLabel={`${t('insights.last_n_days_prefix', locale)} ${trend.length} ${t('insights.last_n_days_suffix', locale)}`}
            />
          </View>
        </View>

        {/* Categories */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionLabel}>{t('insights.categories', locale)}</Text>
          {categoryBreakdown.length === 0 ? (
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
                        <Money value={row.amount} size={15} serif={false} sansWeight="600" />
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

        {/* Forecast — dark ink card, only for the current month with data. */}
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
                  {formatCurrency(Math.round(projectedMonthly), currency, locale)}
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
            </View>
          </View>
        )}

        {/* History section — year-at-a-glance heatmap + months list. Moved
            here from the dedicated /more/history route so the whole data-
            visualization story lives on one surface. Tapping a month row
            drills into /more/transactions scoped to that month. */}
        <View style={styles.historyWrap}>
          <Text style={styles.historySectionLabel}>{t('insights.history', locale)}</Text>
          <HistoryHeatmap transactions={transactions} locale={locale} />
        </View>
      </ScrollView>

      {/* Month picker sheet */}
      <Modal visible={monthPickerOpen} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setMonthPickerOpen(false)}>
          <View style={styles.monthSheet}>
            <Text style={styles.monthSheetTitle}>{t('insights.select_month', locale)}</Text>
            <ScrollView>
              {monthOptions.map((d) => {
                const active = monthKey(d) === monthKey(selectedMonth)
                return (
                  <Pressable
                    key={monthKey(d)}
                    style={[styles.monthOption, active && styles.monthOptionActive]}
                    onPress={() => {
                      setSelectedMonth(d)
                      setMonthPickerOpen(false)
                    }}
                  >
                    <Text style={[styles.monthOptionText, active && styles.monthOptionTextActive]}>
                      {d.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
                    </Text>
                    {active && (
                      <Ionicons name="checkmark" size={18} color={Colors.accent ?? Colors.primary} />
                    )}
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles — trace S_Insights in docs/money-app/project/mobile-screens-2.jsx
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: 120 },

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

  // Month picker sheet
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  monthSheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 16,
    maxHeight: '60%',
    gap: 8,
  },
  monthSheetTitle: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 16,
    color: Colors.ink ?? Colors.text,
    textAlign: 'center',
    paddingVertical: 8,
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
