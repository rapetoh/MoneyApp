import { useMemo } from 'react'
import { ScrollView, View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuth } from '../../src/hooks/useAuth'
import { useTransactions } from '../../src/hooks/useTransactions'
import { useCategories } from '../../src/hooks/useCategories'
import { useProfile } from '../../src/hooks/useProfile'
import { useActiveBudget, usePeriodSpend } from '../../src/hooks/useBudget'
import { useRecurringRules, computeUpcomingRecurring } from '../../src/hooks/useRecurringRules'
import { TransactionRow } from '../../src/components/TransactionRow'
import { Money, MoneyLabel } from '../../src/components/Money'
import { MiniBars } from '../../src/components/MiniBars'
import { Colors, Typography, Spacing, Radius } from '../../src/theme'
import { t } from '@voice-expense/shared'
import type { Locale, Transaction } from '@voice-expense/shared'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** JS getDay() returns 0=Sun..6=Sat; we want 0=Mon..6=Sun for MiniBars. */
function mondayIndex(date: Date): number {
  const d = date.getDay()
  return d === 0 ? 6 : d - 1
}

/** Last 7 days of spending indexed Mon..Sun. */
function weeklySpendBars(txns: Transaction[]): number[] {
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  // The oldest bar is 6 days ago from the start of week. We anchor the rightmost
  // bar to *today's day-of-week* so the chart always reads Mon → Sun with today
  // highlighted at the correct column.
  const todayDow = mondayIndex(today)
  const values = Array(7).fill(0) as number[]
  for (const txn of txns) {
    if (txn.is_deleted || txn.direction !== 'debit') continue
    const d = new Date(txn.transacted_at)
    const diff = Math.floor((startOfToday.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000)
    if (diff < 0 || diff > todayDow) continue
    const idx = todayDow - diff
    values[idx] += txn.amount
  }
  return values
}

function daysLeftInMonth(date: Date): number {
  const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  return Math.max(1, endOfMonth.getDate() - date.getDate() + 1)
}

/**
 * Groups today + yesterday + everything older. Mirrors the mockup's
 * "Today · Friday" / "Yesterday · Thursday" sectioning.
 */
interface Section {
  key: string
  label: string
  data: Transaction[]
}
function groupForToday(txns: Transaction[], locale: Locale): Section[] {
  const now = new Date()
  const yest = new Date(now)
  yest.setDate(yest.getDate() - 1)
  const buckets = new Map<string, { label: string; items: Transaction[] }>()

  for (const txn of txns) {
    if (txn.is_deleted) continue
    const d = new Date(txn.transacted_at)
    let key: string
    let label: string
    if (isSameDay(d, now)) {
      key = 'today'
      label = `${t('transactions.today', locale)} · ${d.toLocaleDateString(locale, { weekday: 'long' })}`
    } else if (isSameDay(d, yest)) {
      key = 'yesterday'
      label = `${t('transactions.yesterday', locale)} · ${d.toLocaleDateString(locale, { weekday: 'long' })}`
    } else {
      key = d.toDateString()
      label = d.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })
    }
    const bucket = buckets.get(key) ?? { label, items: [] }
    bucket.items.push(txn)
    buckets.set(key, bucket)
  }

  const order = ['today', 'yesterday']
  const sorted: Section[] = []
  for (const k of order) {
    const b = buckets.get(k)
    if (b) {
      sorted.push({ key: k, label: b.label, data: b.items })
      buckets.delete(k)
    }
  }
  // Older days — keep up to 2 more sections so Today stays scannable, with a
  // clear path to More → History for the full list.
  const older: Section[] = []
  for (const [k, v] of buckets) {
    older.push({ key: k, label: v.label, data: v.items })
  }
  older.sort((a, b) => new Date(b.data[0].transacted_at).getTime() - new Date(a.data[0].transacted_at).getTime())
  return [...sorted, ...older.slice(0, 2)]
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function TodayScreen() {
  const { user } = useAuth()
  const { transactions, loading } = useTransactions(user?.id)
  const { categoryMap } = useCategories(user?.id)
  const { profile } = useProfile(user?.id)
  const { budget } = useActiveBudget(user?.id)
  const periodSpend = usePeriodSpend(budget, transactions)
  const { rules: recurringRules } = useRecurringRules(user?.id)
  const router = useRouter()

  const locale = (profile?.locale ?? 'en') as Locale
  const currency = profile?.currency_code ?? 'USD'

  const sections = useMemo(() => groupForToday(transactions, locale), [transactions, locale])
  const weekly = useMemo(() => weeklySpendBars(transactions), [transactions])
  const todayDow = useMemo(() => mondayIndex(new Date()), [])
  const daysLeft = useMemo(() => daysLeftInMonth(new Date()), [])
  const monthLabel = useMemo(
    () => new Date().toLocaleDateString(locale, { month: 'long' }).toUpperCase(),
    [locale],
  )
  const spentToday = useMemo(() => {
    const now = new Date()
    return transactions
      .filter((t) => !t.is_deleted && t.direction === 'debit' && isSameDay(new Date(t.transacted_at), now))
      .reduce((sum, t) => sum + t.amount, 0)
  }, [transactions])
  const upcomingRecurring = useMemo(
    () => computeUpcomingRecurring(recurringRules, budget?.period),
    [recurringRules, budget?.period],
  )
  const leftThisPeriod = budget?.amount != null ? Math.max(0, budget.amount - periodSpend - upcomingRecurring) : null

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header — APRIL / Today + search button */}
        <View style={styles.header}>
          <View>
            <Text style={styles.monthTag}>{monthLabel}</Text>
            <Text style={styles.title}>{t('transactions.today', locale)}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.searchBtn, pressed && styles.searchBtnPressed]}
            onPress={() => router.push('/more/history')}
          >
            <Ionicons name="search-outline" size={18} color={Colors.ink2 ?? Colors.textSecondary} />
          </Pressable>
        </View>

        {/* Budget one-liner */}
        {leftThisPeriod != null && (
          <View style={styles.budgetLine}>
            <Text style={styles.budgetLeft}>
              <Text style={styles.budgetLeftAccent}>
                {formatBudgetShort(leftThisPeriod, currency)}
              </Text>
              <Text style={styles.budgetLeftRest}> {t('home.left_this_month', locale)}</Text>
            </Text>
            <Text style={styles.budgetRight}>
              {daysLeft} {t('home.days_to_go', locale)}
            </Text>
          </View>
        )}

        {/* Spent today + MiniBars */}
        <View style={styles.spentCard}>
          <View style={{ flex: 1 }}>
            <MoneyLabel>{t('home.spent_today', locale)}</MoneyLabel>
            <View style={{ marginTop: 4 }}>
              <Money value={spentToday} size={32} />
            </View>
          </View>
          <MiniBars values={weekly} todayIndex={todayDow} />
        </View>

        {/* List */}
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={styles.loading} />
        ) : sections.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💸</Text>
            <Text style={styles.emptyTitle}>{t('transactions.empty', locale)}</Text>
            <Text style={styles.emptySubtitle}>{t('home.first_expense', locale)}</Text>
          </View>
        ) : (
          <View style={styles.listWrap}>
            {sections.map((section) => (
              <View key={section.key}>
                <Text style={styles.sectionHead}>{section.label.toUpperCase()}</Text>
                <View style={styles.sectionCard}>
                  {section.data.map((txn, i) => (
                    <TransactionRow
                      key={txn.id}
                      transaction={txn}
                      categoryName={txn.category_id ? categoryMap[txn.category_id]?.name : null}
                      categoryColor={txn.category_id ? categoryMap[txn.category_id]?.color : null}
                      currency={currency}
                      locale={locale}
                      showDivider={i > 0}
                      onPress={() => router.push(`/transaction/${txn.id}`)}
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

/** Compact budget-header amount: "$473" (no decimals — this is a quick-glance surface). */
function formatBudgetShort(amount: number, currency: string): string {
  // If it's a clean integer display, drop the decimals. Otherwise show the
  // integer only (budgets rarely need cents in a header).
  const glyph =
    currency === 'USD' || currency === 'CAD' || currency === 'AUD' ? '$' :
    currency === 'EUR' ? '€' :
    currency === 'GBP' ? '£' :
    currency === 'JPY' ? '¥' : currency + ' '
  return `${glyph}${Math.round(amount).toLocaleString('en-US')}`
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingBottom: 140, // clear the floating tab bar
  },

  // APRIL / Today row
  header: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  monthTag: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
    color: Colors.ink4 ?? Colors.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  title: {
    // Big, bold, sans display — matches the mockup's T.fDisp size 34 weight 700.
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.8,
    color: Colors.ink ?? Colors.text,
    marginTop: 2,
  },
  searchBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface ?? '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: Colors.line ?? 'rgba(0,0,0,0.06)',
    marginTop: 4,
  },
  searchBtnPressed: { opacity: 0.6 },

  // Budget line
  budgetLine: {
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  budgetLeft: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.sans,
    color: Colors.ink3 ?? Colors.textSecondary,
  },
  budgetLeftAccent: {
    fontFamily: Typography.fontFamily.sansBold,
    fontWeight: '700',
    color: Colors.accent ?? Colors.primary,
  },
  budgetLeftRest: {
    fontFamily: Typography.fontFamily.sans,
    fontWeight: '500',
  },
  budgetRight: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.sans,
    color: Colors.ink4 ?? Colors.textMuted,
    fontWeight: '500',
  },

  // Spent today card
  spentCard: {
    marginHorizontal: 22,
    marginBottom: 16,
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  // List
  listWrap: { gap: 0 },
  sectionHead: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 8,
    fontSize: 12,
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: Colors.ink4 ?? Colors.textMuted,
  },
  sectionCard: {
    marginHorizontal: 16,
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderRadius: 22,
    overflow: 'hidden',
  },

  loading: {
    marginTop: Spacing['2xl'],
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: Spacing['3xl'],
    paddingHorizontal: Spacing['2xl'],
    gap: Spacing.sm,
  },
  emptyIcon: { fontSize: 40 },
  emptyTitle: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size.md,
    color: Colors.ink ?? Colors.text,
  },
  emptySubtitle: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.ink3 ?? Colors.textSecondary,
    textAlign: 'center',
  },
})
