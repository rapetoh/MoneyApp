import { useMemo, useState } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Money } from './Money'
import { Colors, Typography, Hairline } from '../theme'
import {
  t,
  weekdayLabels,
  aggAmount,
  localParts,
  monthIso,
  monthBounds,
  daysBetween,
  addMonthsClamped,
  civilDateTimeToInstant,
  type Locale,
} from '@voice-expense/shared'
import type { Transaction } from '@voice-expense/shared'

// Fix-plan 1.3/2.4 — this file used to carry a file-level
// `eslint-disable local/period-restrictions` because its whole month-grid
// layout (`monthParam`, `dailyTotals`, the `heatmapMonth` state and its
// prev/next stepping, `firstWeekday`/`daysInMonth`) built its civil-date
// math from device-local `Date` getters/setters with no zone concept at
// all. It's now `tz`-aware throughout, via `packages/shared/src/utils/
// period.ts`'s civil-day primitives, matching every other calendar grid
// in the app (2.4's own "one month window" contract) — the disable
// comment is gone with the code it was covering for.

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}
function pad4(n: number): string {
  return String(n).padStart(4, '0')
}
function monthKeyOf(y: number, m: number): string {
  return `${pad4(y)}-${pad2(m)}`
}
function splitMonthKey(key: string): { y: number; m: number } {
  const [y, m] = key.split('-').map(Number)
  return { y, m }
}

/** Display label for a civil month, resolved in `tz` regardless of the
 *  device's own runtime zone — `civilDateTimeToInstant` + an explicit
 *  `timeZone` option, never a `Date` getter (fix-plan 1.3). Day 15 is an
 *  arbitrary mid-month anchor so the resolved instant can never cross
 *  into an adjacent month across a DST transition. */
function monthLabel(y: number, m: number, tz: string, locale: string, opts: Intl.DateTimeFormatOptions): string {
  const instant = civilDateTimeToInstant(y, m, 15, 12, 0, 0, tz)
  return new Date(instant).toLocaleDateString(locale, { ...opts, timeZone: tz })
}

/** Collapse the transaction list into a `{ YYYY-MM → total debits }` map,
 *  in `tz`. Sums `amount_in_profile_currency` (via `aggAmount`), never
 *  raw `amount` — this total renders through a single `currencyCode`
 *  prop below, so summing figures that might be in different original
 *  currencies as if they were all one currency would be silently wrong
 *  (fix-plan 1.4). */
function totalsByMonth(txns: Transaction[], tz: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const tx of txns) {
    if (tx.is_deleted || tx.direction !== 'debit') continue
    const key = monthIso(tx.transacted_at, tz)
    out[key] = (out[key] ?? 0) + aggAmount(tx)
  }
  return out
}

/** Daily debits for the civil month `monthKey`, in `tz`. `dayOf[n]` =
 *  total spent on day `n` (1..daysInMonth); day 0 unused, keeping the
 *  index honest. */
function dailyTotals(txns: Transaction[], monthKey: string, tz: string, daysInMonth: number): number[] {
  const dayOf: number[] = new Array(daysInMonth + 1).fill(0)
  for (const tx of txns) {
    if (tx.is_deleted || tx.direction !== 'debit') continue
    if (monthIso(tx.transacted_at, tz) !== monthKey) continue
    const day = localParts(tx.transacted_at, tz).d
    dayOf[day] += aggAmount(tx)
  }
  return dayOf
}

/** Number of civil days in `monthKey`, in `tz` — the half-open
 *  `monthBounds` window's own length, so this can never disagree with
 *  the window `dailyTotals`/the grid actually iterate over. */
function daysInMonthOf(monthKey: string, tz: string): number {
  const bounds = monthBounds(monthKey, tz)
  const start = localParts(bounds.start, tz)
  const end = localParts(bounds.endExclusive, tz)
  return daysBetween(start.y, start.m, start.d, end.y, end.m, end.d)
}

/** Monday=0..Sunday=6 weekday of the 1st of `monthKey`, in `tz` — the
 *  grid's leading-blank count. Resolved from `monthBounds`' own start
 *  instant rather than a second independent calculation, so the grid
 *  padding and the header it sits under always agree on which column is
 *  "first" (audit 04-F10, the `WEEK_START` finding). */
function firstWeekdayOf(monthKey: string, tz: string): number {
  const bounds = monthBounds(monthKey, tz)
  return localParts(bounds.start, tz).weekdayIndex
}

interface Props {
  transactions: Transaction[]
  locale: Locale
  /** ISO 4217 code every total on this card renders in — `profile.
   *  currency_code`. Required (mirrors `Money`'s own required prop, fix-
   *  plan 2.6): there is no safe default for "which currency is this
   *  total in". */
  currencyCode: string
  /** IANA zone — `profile.timezone` (fix-plan 1.3). Every month/day
   *  boundary on this card resolves in this zone, never the device's
   *  own, so this card agrees with Today/Budgets/Insights about which
   *  month/day a transaction belongs to. */
  tz: string
}

const GRID_GAP = 6
const GRID_COLUMNS = 7

/**
 * Heatmap + months-list section, extracted from the old `/more/history`
 * screen so it can live as a subsection of Insights. Tapping a month
 * drills into the transaction list scoped to that month.
 *
 * Not a full-page — renders only the heatmap card and months list; the
 * host (currently Insights) is responsible for its own section heading
 * and overall page chrome.
 */
export function HistoryHeatmap({ transactions, locale, currencyCode, tz }: Props) {
  const router = useRouter()

  // Frozen for the life of this mount, same rationale as every other
  // screen's own `nowInstant` (`insights.tsx`, `(tabs)/index.tsx`) — every
  // date-derived value below stays internally consistent within one
  // render pass instead of drifting mid-calculation.
  const nowIso = useMemo(() => new Date().toISOString(), [])
  const nowParts = useMemo(() => localParts(nowIso, tz), [nowIso, tz])
  const currentMonthKey = useMemo(() => monthIso(nowIso, tz), [nowIso, tz])

  const [heatmapMonthKey, setHeatmapMonthKey] = useState<string>(currentMonthKey)
  const isCurrentMonth = heatmapMonthKey === currentMonthKey
  const { y: heatmapY, m: heatmapM } = splitMonthKey(heatmapMonthKey)

  const monthTotals = useMemo(() => totalsByMonth(transactions, tz), [transactions, tz])

  const months = useMemo(() => {
    const keys = new Set(Object.keys(monthTotals))
    keys.add(currentMonthKey)
    return Array.from(keys)
      .map((k) => {
        const { y, m } = splitMonthKey(k)
        return {
          key: k,
          y,
          m,
          total: monthTotals[k] ?? 0,
          current: k === currentMonthKey,
        }
      })
      // Keys are `YYYY-MM` — lexicographic order is chronological order,
      // no `Date#getTime()` needed to sort them newest-first.
      .sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0))
  }, [monthTotals, currentMonthKey])

  const daysInMonth = useMemo(() => daysInMonthOf(heatmapMonthKey, tz), [heatmapMonthKey, tz])
  const heatmapDaily = useMemo(
    () => dailyTotals(transactions, heatmapMonthKey, tz, daysInMonth),
    [transactions, heatmapMonthKey, tz, daysInMonth],
  )
  const heatmapTotal = monthTotals[heatmapMonthKey] ?? 0
  const maxDaily = Math.max(...heatmapDaily, 1)

  const canGoNext = !isCurrentMonth
  function goPrevMonth() {
    const prev = addMonthsClamped(heatmapY, heatmapM, 1, -1)
    setHeatmapMonthKey(monthKeyOf(prev.y, prev.m))
  }
  function goNextMonth() {
    if (!canGoNext) return
    const next = addMonthsClamped(heatmapY, heatmapM, 1, 1)
    setHeatmapMonthKey(monthKeyOf(next.y, next.m))
  }

  // Monday=0..Sunday=6 (rotated from `Intl`/`Date#getDay()`'s Sunday=0),
  // matching `weekdayLabels()`'s `WEEK_START` convention below — the grid
  // padding and the header it sits under must agree on which column is
  // "first" or every day lands under the wrong weekday name (audit
  // 04-F10, the `WEEK_START` finding).
  const firstWeekday = useMemo(() => firstWeekdayOf(heatmapMonthKey, tz), [heatmapMonthKey, tz])
  const gridCells: ({ day: number; amount: number } | null)[] = []
  for (let i = 0; i < firstWeekday; i++) gridCells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    gridCells.push({ day: d, amount: heatmapDaily[d] ?? 0 })
  }

  // Shared `weekdayLabels()` (fix-plan 1.3 part 2) — Monday-first
  // (`WEEK_START`), locale-correct via `Intl.DateTimeFormat`, replacing
  // the hardcoded Sunday-first `history.weekday_labels` string that was
  // wrong for fr/es/pt (all Monday-first locales). That key is deleted
  // from every locale JSON.
  const weekdayLabelList = weekdayLabels(locale, 'narrow')

  // Measured cell size (fix-plan 2.4) — replaces the `width: '13.1%'` +
  // `gap: 6` combination, which wraps after six cells on every iPhone
  // (13.1% × 7 + 6 gaps of 6px routinely exceeds 100% of the card's
  // content width), so day 7 onward silently sat under the wrong weekday
  // column. `onLayout` on the wrapper shared by the header row and the
  // grid body measures the one true available width both render at; the
  // seven columns' worth of `GRID_GAP`-wide gutters are subtracted from
  // it once, here, instead of each row hoping the percentage math and the
  // gap add up to the same thing independently.
  const [gridWidth, setGridWidth] = useState(0)
  const cellSize = gridWidth > 0 ? (gridWidth - (GRID_COLUMNS - 1) * GRID_GAP) / GRID_COLUMNS : 0

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
                {monthLabel(heatmapY, heatmapM, tz, locale, {
                  month: 'long',
                  year: heatmapY === nowParts.y ? undefined : 'numeric',
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
            <Money value={heatmapTotal} size={16} serif={false} sansWeight="700" currencyCode={currencyCode} locale={locale} />
          </View>

          {/* Shared `onLayout` measurement (fix-plan 2.4) — the header row
              and the grid body below both render at exactly this width,
              which is what `cellSize` is derived from. */}
          <View onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
            <View style={styles.weekdayRow}>
              {weekdayLabelList.map((label, i) => (
                <View key={i} style={[styles.weekdayCell, { width: cellSize }]}>
                  <Text style={styles.weekdayText}>{label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.grid}>
              {gridCells.map((cell, i) => {
                if (!cell) {
                  return <View key={`x${i}`} style={[styles.cellEmpty, { width: cellSize, height: cellSize }]} />
                }
                const isToday = isCurrentMonth && cell.day === nowParts.d
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
                      { width: cellSize, height: cellSize, backgroundColor: bg },
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
                      {monthLabel(m.y, m.m, tz, locale, {
                        month: 'long',
                        year: m.y === heatmapY ? undefined : 'numeric',
                      })}
                    </Text>
                    {m.current && (
                      <Text style={styles.monthInProgress}>
                        {t('history.in_progress', locale)}
                      </Text>
                    )}
                  </View>
                  <View style={styles.monthRowRight}>
                    <Money value={m.total} size={14} serif={false} sansWeight="600" currencyCode={currencyCode} locale={locale} />
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
  weekdayRow: { flexDirection: 'row', marginBottom: 6, gap: GRID_GAP },
  weekdayCell: { alignItems: 'center' },
  weekdayText: {
    fontSize: 10,
    color: Colors.ink4 ?? Colors.textMuted,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  // `width`/`height` set per-instance above from the measured `cellSize`
  // (fix-plan 2.4) — no hand-tuned percentage literal here anymore.
  cell: {
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellEmpty: {},
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
