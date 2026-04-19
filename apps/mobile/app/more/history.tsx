import { useMemo, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useTransactions } from '../../src/hooks/useTransactions'
import { Money } from '../../src/components/Money'
import { Colors, Typography, Hairline } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'
import type { Transaction } from '@voice-expense/shared'

function monthParam(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Collapse the transaction list into a { YYYY-MM → total debits } map.
// Used for both the calendar heatmap (day-level) and the Months list.
function totalsByMonth(txns: Transaction[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const tx of txns) {
    if (tx.is_deleted || tx.direction !== 'debit') continue
    const d = new Date(tx.transacted_at)
    const key = monthParam(d)
    out[key] = (out[key] ?? 0) + tx.amount
  }
  return out
}

// Daily debits for a specific month (0-indexed month). `dayOf[n]` = total
// spent on day n (1..daysInMonth). Day 0 is unused; keeps the index honest.
function dailyTotals(txns: Transaction[], year: number, month: number): number[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const dayOf: number[] = new Array(daysInMonth + 1).fill(0)
  for (const tx of txns) {
    if (tx.is_deleted || tx.direction !== 'debit') continue
    const d = new Date(tx.transacted_at)
    if (d.getFullYear() !== year || d.getMonth() !== month) continue
    dayOf[d.getDate()] += tx.amount
  }
  return dayOf
}

/**
 * History — year-at-a-glance + month drill-down.
 *
 * Matches S_History in docs/money-app/project/mobile-screens-4.jsx. The
 * current-month calendar heatmap gives the user a quick read on their recent
 * pace; the Months list is a reverse-chronological ledger of monthly totals.
 * Tapping a month row navigates to the transaction list scoped to that
 * month (more/transactions?month=YYYY-MM), so search + category filter are
 * one tap away when the user wants to dig in.
 */
export default function HistoryScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const { transactions } = useTransactions(user?.id)
  const router = useRouter()

  const locale = (profile?.locale ?? 'en') as Locale

  const now = new Date()
  // Heatmap month is user-navigable via prev/next chevrons on the card.
  // Defaults to the current month. The H1 year at the top of the page tracks
  // this value so flipping back to, say, March 2024 also flips the big year
  // number — the whole page reads as "the year that contains the month
  // you're looking at" instead of a hard-coded current year.
  const [heatmapMonth, setHeatmapMonth] = useState<Date>(
    new Date(now.getFullYear(), now.getMonth(), 1),
  )
  const year = heatmapMonth.getFullYear()
  const month = heatmapMonth.getMonth()
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()

  const monthTotals = useMemo(() => totalsByMonth(transactions), [transactions])

  // Build the Months list: every month that has spend, most recent first.
  // Current month is always included so it can carry the "In progress" tag
  // even when zero has been logged yet.
  const months = useMemo(() => {
    const keys = new Set(Object.keys(monthTotals))
    const currentKey = monthParam(now)
    keys.add(currentKey)
    return Array.from(keys)
      .map((k) => {
        const [y, m] = k.split('-').map(Number)
        return {
          key: k,
          date: new Date(y, m - 1, 1),
          total: monthTotals[k] ?? 0,
          current: k === currentKey,
        }
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthTotals])

  const heatmapDaily = useMemo(
    () => dailyTotals(transactions, year, month),
    [transactions, year, month],
  )
  const heatmapTotal = monthTotals[monthParam(heatmapMonth)] ?? 0
  const maxDaily = Math.max(...heatmapDaily, 1)

  // Next month is disabled when the heatmap is already on the current month —
  // we never show a future month (there's nothing to heatmap).
  const canGoNext = !isCurrentMonth
  function goPrevMonth() {
    setHeatmapMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
  }
  function goNextMonth() {
    if (!canGoNext) return
    setHeatmapMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
  }

  // Grid cells for the heatmap: leading empty squares for the weekday the
  // month starts on, then day cells up through the last day of the month.
  const firstWeekday = new Date(year, month, 1).getDay() // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const gridCells: ({ day: number; amount: number } | null)[] = []
  for (let i = 0; i < firstWeekday; i++) gridCells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    gridCells.push({ day: d, amount: heatmapDaily[d] ?? 0 })
  }

  const weekdayLabels = t('history.weekday_labels', locale).split(',')

  function goToMonth(key: string) {
    router.push({ pathname: '/more/transactions', params: { month: key } })
  }

  function goToSearch() {
    router.push('/more/transactions')
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Back pill + search icon (browse all). The label next to the
              back pill was dropped — the H1 year below identifies the page,
              and "More" read awkwardly when the user came from Today. */}
          <View style={styles.topRow}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.backPill, pressed && styles.backPillPressed]}
              hitSlop={8}
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={Colors.ink2 ?? Colors.textSecondary}
              />
            </Pressable>
            <Pressable
              onPress={goToSearch}
              style={({ pressed }) => [styles.searchPill, pressed && styles.backPillPressed]}
              hitSlop={8}
              accessibilityLabel={t('history.browse_all', locale)}
            >
              <Ionicons
                name="search"
                size={18}
                color={Colors.ink2 ?? Colors.textSecondary}
              />
            </Pressable>
          </View>

          {/* Title block — the year tracks the selected heatmap month so the
              whole page reads coherently when flipping back. */}
          <View style={styles.intro}>
            <Text style={styles.eyebrow}>{t('history.heading_eyebrow', locale)}</Text>
            <Text style={styles.headline}>{year}</Text>
          </View>

          {/* Heatmap card — user-navigable month via prev/next chevrons. */}
          <View style={styles.heatmapWrap}>
            <View style={styles.heatmapCard}>
              <View style={styles.heatmapHeader}>
                <View style={styles.heatmapNav}>
                  <Pressable
                    onPress={goPrevMonth}
                    style={({ pressed }) => [styles.navBtn, pressed && styles.navBtnPressed]}
                    hitSlop={8}
                    accessibilityLabel={t('history.prev_month', locale)}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={18}
                      color={Colors.ink2 ?? Colors.textSecondary}
                    />
                  </Pressable>
                  <Text style={styles.heatmapMonth}>
                    {heatmapMonth.toLocaleDateString(locale, {
                      month: 'long',
                      year: heatmapMonth.getFullYear() === now.getFullYear() ? undefined : 'numeric',
                    })}
                  </Text>
                  <Pressable
                    onPress={goNextMonth}
                    disabled={!canGoNext}
                    style={({ pressed }) => [
                      styles.navBtn,
                      !canGoNext && styles.navBtnDisabled,
                      pressed && canGoNext && styles.navBtnPressed,
                    ]}
                    hitSlop={8}
                    accessibilityLabel={t('history.next_month', locale)}
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={
                        canGoNext
                          ? Colors.ink2 ?? Colors.textSecondary
                          : Colors.ink4 ?? Colors.textMuted
                      }
                    />
                  </Pressable>
                </View>
                <Money value={heatmapTotal} size={16} serif={false} sansWeight="700" />
              </View>

              <View style={styles.weekdayRow}>
                {weekdayLabels.map((label, i) => (
                  <View key={i} style={styles.weekdayCell}>
                    <Text style={styles.weekdayText}>{label}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.grid}>
                {gridCells.map((cell, i) => {
                  if (!cell) return <View key={`x${i}`} style={styles.cellEmpty} />
                  const isToday = isCurrentMonth && cell.day === now.getDate()
                  const intensity =
                    cell.amount > 0 ? 0.2 + Math.min(cell.amount / maxDaily, 1) * 0.7 : 0
                  const bg =
                    cell.amount > 0
                      ? `rgba(63,90,62,${intensity.toFixed(2)})`
                      : Colors.surface2 ?? '#F5F2EB'
                  const textLight = cell.amount > 0 && intensity > 0.5
                  return (
                    <View
                      key={`d${cell.day}`}
                      style={[
                        styles.cell,
                        { backgroundColor: bg },
                        isToday && styles.cellToday,
                      ]}
                    >
                      <Text
                        style={[
                          styles.cellText,
                          {
                            color: textLight
                              ? '#FFFFFF'
                              : Colors.ink3 ?? Colors.textSecondary,
                          },
                        ]}
                      >
                        {cell.day}
                      </Text>
                    </View>
                  )
                })}
              </View>
            </View>
          </View>

          {/* Months list */}
          <View style={styles.monthsWrap}>
            <Text style={styles.sectionLabel}>{t('history.months', locale)}</Text>
            {months.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>{t('history.empty', locale)}</Text>
              </View>
            ) : (
              <View style={styles.monthsCard}>
                {months.map((m, i) => {
                  const isLast = i === months.length - 1
                  return (
                    <Pressable
                      key={m.key}
                      onPress={() => goToMonth(m.key)}
                      style={({ pressed }) => [
                        styles.monthRow,
                        !isLast && styles.monthRowDivider,
                        pressed && styles.monthRowPressed,
                      ]}
                    >
                      <View style={styles.monthRowLeft}>
                        <Text style={styles.monthName}>
                          {m.date.toLocaleDateString(locale, {
                            month: 'long',
                            year: m.date.getFullYear() === year ? undefined : 'numeric',
                          })}
                        </Text>
                        {m.current && (
                          <Text style={styles.monthInProgress}>
                            {t('history.in_progress', locale)}
                          </Text>
                        )}
                      </View>
                      <View style={styles.monthRowRight}>
                        <Money value={m.total} size={14} serif={false} sansWeight="600" />
                        <Ionicons
                          name="chevron-forward"
                          size={16}
                          color={Colors.ink4 ?? Colors.textMuted}
                        />
                      </View>
                    </Pressable>
                  )
                })}
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles — trace S_History in docs/money-app/project/mobile-screens-4.jsx
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: 40 },

  topRow: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backPillPressed: { opacity: 0.6 },
  searchPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
    alignItems: 'center',
    justifyContent: 'center',
  },

  intro: { paddingHorizontal: 22, paddingTop: 14, paddingBottom: 8 },
  eyebrow: {
    color: Colors.ink4 ?? Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  headline: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.8,
    color: Colors.ink ?? Colors.text,
    marginTop: 4,
  },

  // Heatmap
  heatmapWrap: { paddingHorizontal: 20, paddingTop: 12 },
  heatmapCard: {
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  heatmapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  heatmapNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  navBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnPressed: { opacity: 0.5 },
  navBtnDisabled: { opacity: 0.35 },
  heatmapMonth: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ink ?? Colors.text,
    fontFamily: Typography.fontFamily.sansBold,
    marginHorizontal: 4,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 6,
    gap: 6,
  },
  weekdayCell: { flex: 1, alignItems: 'center' },
  weekdayText: {
    fontSize: 10,
    color: Colors.ink4 ?? Colors.textMuted,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  // Cells use a fixed percent width so 7 per row + 6px gaps line up. The
  // `(100 - 6 gaps × ~1.4%)/7` approximation resolves to ~13.1%; we use
  // `flex-basis` via width to keep the calculation local.
  cell: {
    width: '13.1%',
    aspectRatio: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellEmpty: {
    width: '13.1%',
    aspectRatio: 1,
  },
  cellToday: {
    borderWidth: 1.5,
    borderColor: Colors.ink ?? Colors.text,
  },
  cellText: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
  },

  // Months list
  monthsWrap: { paddingHorizontal: 16, paddingTop: 20 },
  sectionLabel: {
    paddingHorizontal: 8,
    paddingBottom: 8,
    color: Colors.ink3 ?? Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: Typography.fontFamily.sansBold,
  },
  monthsCard: {
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderRadius: 22,
    overflow: 'hidden',
  },
  monthRow: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthRowDivider: {
    borderBottomWidth: Hairline.width,
    borderBottomColor: Hairline.color,
  },
  monthRowPressed: { backgroundColor: 'rgba(40,36,28,0.04)' },
  monthRowLeft: { flexShrink: 1 },
  monthName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.ink ?? Colors.text,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  monthInProgress: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.accent ?? Colors.primary,
    marginTop: 1,
    letterSpacing: 0.3,
    fontFamily: Typography.fontFamily.sansBold,
  },
  monthRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  emptyCard: {
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.ink3 ?? Colors.textSecondary,
    textAlign: 'center',
    fontFamily: Typography.fontFamily.sans,
  },
})
