import { ScrollView, View, Text, StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuth } from '../../src/hooks/useAuth'
import { useTransactions, useMonthSummary } from '../../src/hooks/useTransactions'
import { useCategories } from '../../src/hooks/useCategories'
import { useProfile } from '../../src/hooks/useProfile'
import { useActiveBudget, usePeriodSpend } from '../../src/hooks/useBudget'
import { useRecurringRules, computeUpcomingRecurring } from '../../src/hooks/useRecurringRules'
import { SafeToSpend } from '../../src/components/SafeToSpend'
import { TransactionRow } from '../../src/components/TransactionRow'
import { Colors, Typography, Spacing, Radius } from '../../src/theme'
import { formatCurrency, t } from '@voice-expense/shared'
import type { Locale } from '@voice-expense/shared'

function SummaryCard({
  label,
  amount,
  currency,
  color,
  icon,
  iconBg,
  iconColor,
}: {
  label: string
  amount: number
  currency: string
  color: string
  icon: React.ComponentProps<typeof Ionicons>['name']
  iconBg: string
  iconColor: string
}) {
  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryTop}>
        <View style={[styles.summaryIcon, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={16} color={iconColor} />
        </View>
        <Text style={styles.summaryLabel}>{label}</Text>
      </View>
      <Text style={[styles.summaryAmount, { color }]}>{formatCurrency(amount, currency)}</Text>
    </View>
  )
}

export default function HomeScreen() {
  const { user } = useAuth()
  const { transactions, loading } = useTransactions(user?.id)
  const { totalIncome, totalExpenses, netBalance, monthTxns } = useMonthSummary(transactions)
  const { categoryMap } = useCategories(user?.id)
  const { profile } = useProfile(user?.id)
  const { budget } = useActiveBudget(user?.id)
  const periodSpend = usePeriodSpend(budget, transactions)
  const { rules: recurringRules } = useRecurringRules(user?.id)
  const router = useRouter()

  const locale = (profile?.locale ?? 'en') as Locale
  const displayName = profile?.display_name ?? user?.email?.split('@')[0] ?? 'there'
  const currency = profile?.currency_code ?? 'USD'
  const recentTransactions = transactions.slice(0, 5)

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting */}
        <View style={styles.greeting}>
          <Text style={styles.greetingText}>{t('home.greeting', locale)} {displayName}</Text>
          <Text style={styles.greetingDate}>
            {new Date().toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
        </View>

        {/* Safe to Spend */}
        <SafeToSpend
          monthlyBudget={budget?.amount ?? null}
          totalSpent={periodSpend}
          upcomingRecurring={computeUpcomingRecurring(recurringRules, budget?.period)}
          currency={currency}
          period={budget?.period}
          locale={locale}
        />

        {/* Income / Expenses Summary */}
        <View style={styles.summaryRow}>
          <SummaryCard
            label={t('home.income', locale)}
            amount={totalIncome}
            currency={currency}
            color={Colors.income}
            icon="arrow-up"
            iconBg={Colors.incomeLight}
            iconColor={Colors.income}
          />
          <SummaryCard
            label={t('home.expenses', locale)}
            amount={totalExpenses}
            currency={currency}
            color={Colors.expense}
            icon="arrow-down"
            iconBg={Colors.expenseLight}
            iconColor={Colors.expense}
          />
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('home.recent_activity', locale)}</Text>
            <Text style={styles.viewAll} onPress={() => router.push('/more/history')}>
              {t('home.view_all', locale)}
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing.xl }} />
          ) : recentTransactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>💸</Text>
              <Text style={styles.emptyTitle}>{t('transactions.empty', locale)}</Text>
              <Text style={styles.emptySubtitle}>{t('home.first_expense', locale)}</Text>
            </View>
          ) : (
            <View style={styles.transactionList}>
              {recentTransactions.map((txn, i) => (
                <View key={txn.id}>
                  {i > 0 && <View style={styles.divider} />}
                  <TransactionRow
                    transaction={txn}
                    categoryName={txn.category_id ? categoryMap[txn.category_id]?.name : null}
                    currency={currency}
                    locale={locale}
                    onPress={() => router.push(`/transaction/${txn.id}`)}
                  />
                </View>
              ))}
            </View>
          )}
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
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.base,
    gap: Spacing.base,
    paddingBottom: 120,
  },
  greeting: {
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  greetingText: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size['2xl'],
    color: Colors.text,
  },
  greetingDate: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    gap: Spacing.sm,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  summaryIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  summaryAmount: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: Typography.size.xl,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  section: {
    gap: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size.md,
    color: Colors.text,
  },
  viewAll: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.primary,
  },
  transactionList: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 44 + Spacing.md + Spacing.base, // avatar width + gap + padding
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing['3xl'],
    gap: Spacing.sm,
  },
  emptyIcon: {
    fontSize: 40,
  },
  emptyTitle: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size.md,
    color: Colors.text,
  },
  emptySubtitle: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
})
