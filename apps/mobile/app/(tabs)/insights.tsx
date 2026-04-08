import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../src/hooks/useAuth'
import { useTransactions, useMonthSummary } from '../../src/hooks/useTransactions'
import { Colors, Typography, Spacing, Radius } from '../../src/theme'
import { formatCurrency } from '@voice-expense/shared'

export default function InsightsScreen() {
  const { user } = useAuth()
  const { transactions } = useTransactions(user?.id)
  const { totalIncome, totalExpenses, netBalance, monthTxns } = useMonthSummary(transactions)
  const currency = 'USD'

  // Top categories this month
  const byCategory: Record<string, number> = {}
  for (const t of monthTxns) {
    if (t.direction === 'debit') {
      const cat = t.category_id ?? 'Uncategorized'
      byCategory[cat] = (byCategory[cat] ?? 0) + t.amount
    }
  }
  const topCategories = Object.entries(byCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)

  const maxCatAmount = topCategories[0]?.[1] ?? 1

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Insights</Text>

        {/* Month totals */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>This Month</Text>
          <View style={styles.metricRow}>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Income</Text>
              <Text style={[styles.metricValue, { color: Colors.income }]}>
                {formatCurrency(totalIncome, currency)}
              </Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Expenses</Text>
              <Text style={styles.metricValue}>{formatCurrency(totalExpenses, currency)}</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Net</Text>
              <Text
                style={[
                  styles.metricValue,
                  { color: netBalance >= 0 ? Colors.income : Colors.destructive },
                ]}
              >
                {formatCurrency(Math.abs(netBalance), currency)}
              </Text>
            </View>
          </View>
        </View>

        {/* Top categories */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Top Categories</Text>
          {topCategories.length === 0 ? (
            <Text style={styles.emptyText}>No expenses this month</Text>
          ) : (
            <View style={styles.categoryList}>
              {topCategories.map(([cat, amount]) => (
                <View key={cat} style={styles.categoryRow}>
                  <Text style={styles.categoryName} numberOfLines={1}>
                    {cat}
                  </Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${(amount / maxCatAmount) * 100}%` as any },
                      ]}
                    />
                  </View>
                  <Text style={styles.categoryAmount}>{formatCurrency(amount, currency)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.comingSoon}>
          <Text style={styles.comingSoonText}>More charts coming in Phase 5 🚀</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.base,
    gap: Spacing.base,
    paddingBottom: Spacing['3xl'],
  },
  title: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size['2xl'],
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
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metric: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  metricLabel: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
  },
  metricValue: {
    fontFamily: Typography.fontFamily.monoBold,
    fontSize: Typography.size.base,
    color: Colors.text,
  },
  metricDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
  },
  categoryList: {
    gap: Spacing.md,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  categoryName: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.text,
    width: 90,
  },
  barTrack: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
  },
  categoryAmount: {
    fontFamily: Typography.fontFamily.mono,
    fontSize: Typography.size.sm,
    color: Colors.text,
    width: 72,
    textAlign: 'right',
  },
  emptyText: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: Spacing.base,
  },
  comingSoon: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  comingSoonText: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.textMuted,
  },
})
