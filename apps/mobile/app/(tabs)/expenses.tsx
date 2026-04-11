import { useState, useMemo } from 'react'
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  SectionList,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useAuth } from '../../src/hooks/useAuth'
import { useTransactions } from '../../src/hooks/useTransactions'
import { useCategories } from '../../src/hooks/useCategories'
import { useProfile } from '../../src/hooks/useProfile'
import { TransactionRow } from '../../src/components/TransactionRow'
import { Colors, Typography, Spacing, Radius } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'
import type { Transaction } from '@voice-expense/shared'

function groupByDate(transactions: Transaction[], locale: Locale) {
  const groups: Record<string, Transaction[]> = {}
  for (const txn of transactions) {
    const date = new Date(txn.transacted_at)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    let label: string
    if (date.toDateString() === today.toDateString()) {
      label = t('transactions.today', locale)
    } else if (date.toDateString() === yesterday.toDateString()) {
      label = t('transactions.yesterday', locale)
    } else {
      label = date.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })
    }

    if (!groups[label]) groups[label] = []
    groups[label].push(txn)
  }

  return Object.entries(groups).map(([title, data]) => ({ title, data }))
}

export default function ExpensesScreen() {
  const { user } = useAuth()
  const { transactions, loading } = useTransactions(user?.id)
  const { categoryMap } = useCategories(user?.id)
  const { profile } = useProfile(user?.id)
  const [search, setSearch] = useState('')
  const router = useRouter()

  const locale = (profile?.locale ?? 'en') as Locale
  const currency = profile?.currency_code ?? 'USD'

  const filtered = useMemo(() => {
    if (!search.trim()) return transactions
    const q = search.toLowerCase()
    return transactions.filter(
      (txn) =>
        (txn.merchant ?? '').toLowerCase().includes(q) ||
        (txn.note ?? '').toLowerCase().includes(q),
    )
  }, [transactions, search])

  const sections = useMemo(() => groupByDate(filtered, locale), [filtered, locale])

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('transactions.title', locale)}</Text>
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder={t('transactions.search', locale)}
          placeholderTextColor={Colors.textMuted}
          clearButtonMode="while-editing"
        />
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing['2xl'] }} />
      ) : sections.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>{search ? '🔍' : '💸'}</Text>
          <Text style={styles.emptyTitle}>
            {search ? t('common.error', locale) : t('transactions.empty', locale)}
          </Text>
          <Text style={styles.emptySubtitle}>
            {search
              ? t('common.retry', locale)
              : t('voice.subtitle', locale)}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section: { title } }) => (
            <Text style={styles.dateHeader}>{title}</Text>
          )}
          renderItem={({ item, index }) => (
            <View>
              {index > 0 && <View style={styles.divider} />}
              <TransactionRow
                transaction={item}
                categoryName={item.category_id ? categoryMap[item.category_id]?.name : null}
                currency={currency}
                onPress={() => router.push(`/transaction/${item.id}`)}
              />
            </View>
          )}
          renderSectionFooter={() => <View style={styles.sectionGap} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { padding: Spacing.base, gap: Spacing.md },
  title: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size['2xl'],
    color: Colors.text,
  },
  search: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.base,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  listContent: { paddingHorizontal: Spacing.base, paddingBottom: Spacing['3xl'] },
  dateHeader: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 44 + Spacing.md + Spacing.base,
  },
  sectionGap: { height: Spacing.sm },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing['2xl'],
  },
  emptyIcon: { fontSize: 40 },
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
