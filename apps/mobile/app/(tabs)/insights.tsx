import { useState, useMemo } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useTransactions } from '../../src/hooks/useTransactions'
import { useCategories } from '../../src/hooks/useCategories'
import { Colors, Typography, Spacing, Radius } from '../../src/theme'
import { formatCurrency, t, type Locale } from '@voice-expense/shared'

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
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

  // Last 12 months available for picking
  const monthOptions = useMemo(() => {
    const opts: Date[] = []
    for (let i = 0; i < 12; i++) {
      opts.push(new Date(now.getFullYear(), now.getMonth() - i, 1))
    }
    return opts
  }, [now.getFullYear(), now.getMonth()])

  const monthLabel = selectedMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' })

  // Filter transactions to selected month
  const monthTxns = useMemo(() => {
    const start = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1).toISOString()
    const end = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1).toISOString()
    return transactions.filter(
      (tx) => tx.transacted_at >= start && tx.transacted_at < end && !tx.is_deleted,
    )
  }, [transactions, selectedMonth])

  const totalIncome = monthTxns.filter((tx) => tx.direction === 'credit').reduce((s, tx) => s + tx.amount, 0)
  const totalExpenses = monthTxns.filter((tx) => tx.direction === 'debit').reduce((s, tx) => s + tx.amount, 0)
  const netBalance = totalIncome - totalExpenses

  // Top categories with color
  const byCategory: Record<string, { id: string; name: string; amount: number; color: string }> = {}
  for (const txn of monthTxns) {
    if (txn.direction === 'debit') {
      const catId = txn.category_id ?? '__uncategorized__'
      const cat = txn.category_id ? categoryMap[txn.category_id] : null
      const catName = cat?.name ?? t('transactions.uncategorized', locale)
      const color = cat?.color ?? Colors.textMuted
      if (!byCategory[catId]) byCategory[catId] = { id: catId, name: catName, amount: 0, color }
      byCategory[catId].amount += txn.amount
    }
  }
  const topCategories = Object.values(byCategory).sort((a, b) => b.amount - a.amount).slice(0, 5)
  const maxCatAmount = topCategories[0]?.amount ?? 1

  // Weekly trend = bars for each day of the selected month's last week, or 7-day window within month
  const weekly = useMemo(() => {
    const monthStart = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1)
    const monthEnd = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0)
    const anchor = selectedMonth.getMonth() === now.getMonth() && selectedMonth.getFullYear() === now.getFullYear()
      ? now
      : monthEnd
    const bars: { label: string; amount: number; isToday: boolean }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(anchor)
      d.setDate(anchor.getDate() - i)
      if (d < monthStart) { bars.push({ label: '', amount: 0, isToday: false }); continue }
      const dayKey = d.toDateString()
      const amount = transactions
        .filter((tx) => tx.direction === 'debit' && new Date(tx.transacted_at).toDateString() === dayKey)
        .reduce((s, tx) => s + tx.amount, 0)
      bars.push({
        label: d.toLocaleDateString(locale, { weekday: 'short' }),
        amount,
        isToday: d.toDateString() === now.toDateString(),
      })
    }
    return bars
  }, [transactions, selectedMonth, locale, now])
  const maxWeekly = Math.max(...weekly.map((w) => w.amount), 1)

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header with month dropdown */}
        <View style={styles.header}>
          <Text style={styles.title}>{t('tabs.insights', locale)}</Text>
          <Pressable style={styles.monthDropdown} onPress={() => setMonthPickerOpen(true)}>
            <Text style={styles.monthDropdownText}>{monthLabel}</Text>
            <Ionicons name="chevron-down" size={16} color={Colors.text} />
          </Pressable>
        </View>

        {/* Summary */}
        <View style={styles.card}>
          <View style={styles.metricRow}>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>{t('home.income', locale)}</Text>
              <Text style={[styles.metricValue, { color: Colors.income }]}>
                {formatCurrency(totalIncome, currency)}
              </Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>{t('home.expenses', locale)}</Text>
              <Text style={styles.metricValue}>{formatCurrency(totalExpenses, currency)}</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>{t('home.net', locale)}</Text>
              <Text
                style={[
                  styles.metricValue,
                  { color: netBalance >= 0 ? Colors.income : Colors.destructive },
                ]}
              >
                {netBalance >= 0 ? '+' : '-'}{formatCurrency(Math.abs(netBalance), currency)}
              </Text>
            </View>
          </View>
        </View>

        {/* Top categories */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Top Categories</Text>
          {topCategories.length === 0 ? (
            <Text style={styles.emptyText}>{t('transactions.empty', locale)}</Text>
          ) : (
            <View style={styles.categoryList}>
              {topCategories.map((cat) => (
                <View key={cat.id} style={styles.categoryRow}>
                  <View style={styles.categoryHeader}>
                    <View style={[styles.categoryDot, { backgroundColor: cat.color }]} />
                    <Text style={styles.categoryName} numberOfLines={1}>
                      {cat.name}
                    </Text>
                    <Text style={styles.categoryAmount}>
                      {formatCurrency(cat.amount, currency)}
                    </Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${(cat.amount / maxCatAmount) * 100}%` as any,
                          backgroundColor: cat.color,
                        },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Weekly trend */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Weekly Trend</Text>
          <View style={styles.chartRow}>
            {weekly.map((w, i) => (
              <View key={i} style={styles.chartCol}>
                <View style={styles.chartBarWrap}>
                  <View
                    style={[
                      styles.chartBar,
                      w.isToday ? styles.chartBarActive : styles.chartBarInactive,
                      { height: `${Math.max((w.amount / maxWeekly) * 100, 4)}%` as any },
                    ]}
                  />
                </View>
                <Text style={[styles.chartLabel, w.isToday && styles.chartLabelActive]}>
                  {w.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Month picker modal */}
      <Modal visible={monthPickerOpen} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setMonthPickerOpen(false)}>
          <View style={styles.monthSheet}>
            <Text style={styles.monthSheetTitle}>Select Month</Text>
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
                    {active && <Ionicons name="checkmark" size={18} color={Colors.primary} />}
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.base, gap: Spacing.base, paddingBottom: 120 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size['2xl'],
    color: Colors.text,
  },
  monthDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.full ?? 999,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  monthDropdownText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.text,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    gap: Spacing.md,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size.base,
    color: Colors.text,
  },
  metricRow: { flexDirection: 'row', alignItems: 'center' },
  metric: { flex: 1, alignItems: 'center', gap: Spacing.xs },
  metricLabel: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
  },
  metricValue: {
    fontFamily: Typography.fontFamily.monoBold,
    fontSize: Typography.size.lg,
    color: Colors.text,
  },
  metricDivider: { width: 1, height: 40, backgroundColor: Colors.border },
  categoryList: { gap: Spacing.md },
  categoryRow: { gap: Spacing.xs },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  categoryDot: { width: 10, height: 10, borderRadius: 5 },
  categoryName: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.text,
  },
  categoryAmount: {
    fontFamily: Typography.fontFamily.monoBold,
    fontSize: Typography.size.sm,
    color: Colors.text,
  },
  barTrack: {
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 140,
    gap: Spacing.xs,
  },
  chartCol: { flex: 1, alignItems: 'center', gap: Spacing.xs, height: '100%' },
  chartBarWrap: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  chartBar: {
    width: '70%',
    borderTopLeftRadius: Radius.sm,
    borderTopRightRadius: Radius.sm,
    minHeight: 2,
  },
  chartBarInactive: { backgroundColor: Colors.primaryLight },
  chartBarActive: { backgroundColor: Colors.primary },
  chartLabel: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
  },
  chartLabelActive: {
    fontFamily: Typography.fontFamily.sansBold,
    color: Colors.text,
  },
  emptyText: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: Spacing.base,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  monthSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.base,
    maxHeight: '60%',
    gap: Spacing.sm,
  },
  monthSheetTitle: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size.md,
    color: Colors.text,
    textAlign: 'center',
    paddingVertical: Spacing.sm,
  },
  monthOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    borderRadius: Radius.md,
  },
  monthOptionActive: { backgroundColor: Colors.primaryLight },
  monthOptionText: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.base,
    color: Colors.text,
  },
  monthOptionTextActive: {
    fontFamily: Typography.fontFamily.sansBold,
    color: Colors.primary,
  },
})
