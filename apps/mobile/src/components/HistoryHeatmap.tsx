import { useMemo, useState } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Money } from './Money'
import { Colors, Typography, Hairline } from '../theme'
import { t, type Locale } from '@voice-expense/shared'
import type { Transaction } from '@voice-expense/shared'

function monthParam(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Collapse the transaction list into a { YYYY-MM → total debits } map.
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

// Daily debits for a specific month (0-indexed). dayOf[n] = total spent on
// day n (1..daysInMonth). Day 0 unused — keeps the index honest.
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

interface Props {
  transactions: Transaction[]
  locale: Locale
}

/**
 * Heatmap + months-list section, extracted from the old `/more/history`
 * screen so it can live as a subsection of Insights. Tapping a month
 * drills into the transaction list scoped to that month.
 *
 * Not a full-page — renders only the heatmap card and months list; the
 * host (currently Insights) is responsible for its own section heading
 * and overall page chrome.
 */
export function HistoryHeatmap({ transactions, locale }: Props) {
  const router = useRouter()

  const now = new Date()
  const [heatmapMonth, setHeatmapMonth] = useState<Date>(
    new Date(now.getFullYear(), now.getMonth(), 1),
  )
  const year = heatmapMonth.getFullYear()
  const month = heatmapMonth.getMonth()
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()

  const monthTotals = useMemo(() => totalsByMonth(transactions), [transactions])

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

  const canGoNext = !isCurrentMonth
  function goPrevMonth() {
    setHeatmapMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
  }
  function goNextMonth() {
    if (!canGoNext) return
    setHeatmapMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
  }

  const firstWeekday = new Date(year, month, 1).getDay()
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

  return (
    <View>
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
    </View>
  )
}

const styles = StyleSheet.create({
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
  heatmapNav: { flexDirection: 'row', alignItems: 'center', gap: 4 },
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
  weekdayRow: { flexDirection: 'row', marginBottom: 6, gap: 6 },
  weekdayCell: { flex: 1, alignItems: 'center' },
  weekdayText: {
    fontSize: 10,
    color: Colors.ink4 ?? Colors.textMuted,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: {
    width: '13.1%',
    aspectRatio: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellEmpty: { width: '13.1%', aspectRatio: 1 },
  cellToday: {
    borderWidth: 1.5,
    borderColor: Colors.ink ?? Colors.text,
  },
  cellText: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
  },

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
