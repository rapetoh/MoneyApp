import { useState, useMemo } from 'react'
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  SectionList,
  ScrollView,
  Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useAuth } from '../../src/hooks/useAuth'
import { useTransactions } from '../../src/hooks/useTransactions'
import { useCategories } from '../../src/hooks/useCategories'
import { useProfile } from '../../src/hooks/useProfile'
import { TransactionRow } from '../../src/components/TransactionRow'
import { Colors, Typography, Spacing, Radius } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'
import type { Transaction } from '@voice-expense/shared'

// "2026-04" → ISO bounds for month-scoped filtering. Returned `label` is the
// first of the month, used to print "April 2026" in the heading.
function parseMonthParam(raw: string | string[] | undefined):
  | { start: string; end: string; label: Date }
  | null {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (!v) return null
  const match = /^(\d{4})-(\d{1,2})$/.exec(v)
  if (!match) return null
  const y = parseInt(match[1], 10)
  const m = parseInt(match[2], 10) - 1
  if (m < 0 || m > 11) return null
  const start = new Date(y, m, 1)
  const end = new Date(y, m + 1, 1)
  return { start: start.toISOString(), end: end.toISOString(), label: start }
}

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

export default function TransactionsScreen() {
  const { user } = useAuth()
  const { transactions, loading } = useTransactions(user?.id)
  const { categories, categoryMap } = useCategories(user?.id)
  const { profile } = useProfile(user?.id)
  const [search, setSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [view, setView] = useState<'expenses' | 'income'>('expenses')
  const router = useRouter()
  const params = useLocalSearchParams<{ month?: string }>()

  const locale = (profile?.locale ?? 'en') as Locale
  const currency = profile?.currency_code ?? 'USD'

  // Optional ?month=YYYY-MM param from the History calendar: when set, the
  // list is scoped to that month and the page title reads "April 2026"
  // instead of the toggle-driven copy. Invalid values are ignored.
  const monthFilter = useMemo(() => parseMonthParam(params.month), [params.month])

  // Only show categories that have at least one transaction
  const usedCategories = useMemo(() => {
    const usedIds = new Set(
      transactions
        .filter((tx) => tx.direction === 'debit')
        .map((tx) => tx.category_id)
        .filter(Boolean),
    )
    return categories.filter((c) => usedIds.has(c.id))
  }, [transactions, categories])

  const filtered = useMemo(() => {
    let result = transactions.filter((tx) =>
      view === 'expenses' ? tx.direction === 'debit' : tx.direction === 'credit',
    )

    if (monthFilter) {
      result = result.filter(
        (txn) => txn.transacted_at >= monthFilter.start && txn.transacted_at < monthFilter.end,
      )
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (txn) =>
          (txn.merchant ?? '').toLowerCase().includes(q) ||
          (txn.note ?? '').toLowerCase().includes(q) ||
          (txn.category_id ? categoryMap[txn.category_id]?.name ?? '' : '').toLowerCase().includes(q),
      )
    }

    if (selectedCategoryId) {
      result = result.filter((txn) => txn.category_id === selectedCategoryId)
    }

    return result
  }, [transactions, search, selectedCategoryId, categoryMap, view, monthFilter])

  const sections = useMemo(() => groupByDate(filtered, locale), [filtered, locale])

  function toggleCategory(id: string) {
    setSelectedCategoryId((prev) => (prev === id ? null : id))
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <View style={styles.header}>
        {/* Expenses / Income toggle (styled like the Voice / Manual toggle) */}
        <View style={styles.segment}>
          <Pressable
            style={[styles.segmentTab, view === 'expenses' && styles.segmentTabActive]}
            onPress={() => { setView('expenses'); setSelectedCategoryId(null) }}
          >
            <Text style={[styles.segmentLabel, view === 'expenses' && styles.segmentLabelActive]}>
              {t('home.expenses', locale)}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segmentTab, view === 'income' && styles.segmentTabActive]}
            onPress={() => { setView('income'); setSelectedCategoryId(null) }}
          >
            <Text style={[styles.segmentLabel, view === 'income' && styles.segmentLabelActive]}>
              {t('home.income', locale)}
            </Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder={t('transactions.search', locale)}
          placeholderTextColor={Colors.textMuted}
          clearButtonMode="while-editing"
        />

        {/* Category filter pills — only relevant on expenses view */}
        {view === 'expenses' && usedCategories.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillRow}
          >
            <Pressable
              style={[
                styles.pill,
                !selectedCategoryId && styles.pillActive,
              ]}
              onPress={() => setSelectedCategoryId(null)}
            >
              <Text style={[styles.pillLabel, !selectedCategoryId && styles.pillLabelActive]}>
                All
              </Text>
            </Pressable>
            {usedCategories.map((cat) => {
              const active = selectedCategoryId === cat.id
              return (
                <Pressable
                  key={cat.id}
                  style={[
                    styles.pill,
                    active && styles.pillActive,
                  ]}
                  onPress={() => toggleCategory(cat.id)}
                >
                  <View style={[styles.pillDot, { backgroundColor: cat.color ?? Colors.primary }]} />
                  <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>
                    {cat.name}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing['2xl'] }} />
      ) : sections.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>{search || selectedCategoryId ? '🔍' : '💸'}</Text>
          <Text style={styles.emptyTitle}>
            {search || selectedCategoryId
              ? t('transactions.empty_search', locale)
              : t('transactions.empty', locale)}
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
          renderItem={({ item, index, section }) => {
            const isFirst = index === 0
            const isLast = index === section.data.length - 1
            return (
              <View
                style={[
                  styles.txnCard,
                  isFirst && styles.txnCardFirst,
                  isLast && styles.txnCardLast,
                  !isLast && styles.txnCardMiddle,
                ]}
              >
                {index > 0 && <View style={styles.divider} />}
                <TransactionRow
                  transaction={item}
                  categoryName={item.category_id ? categoryMap[item.category_id]?.name : null}
                  currency={currency}
                  locale={locale}
                  onPress={() => router.push(`/transaction/${item.id}`)}
                />
              </View>
            )
          }}
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
  segment: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: Radius.full ?? 999,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    alignSelf: 'flex-start',
  },
  segmentTab: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 8,
    borderRadius: Radius.full ?? 999,
  },
  segmentTabActive: {
    backgroundColor: Colors.primary,
  },
  segmentLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  segmentLabelActive: {
    color: Colors.white,
  },
  search: {
    backgroundColor: Colors.card,
    borderRadius: Radius.full ?? 999,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.base,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillRow: {
    gap: Spacing.sm,
    paddingBottom: 2,
  },
  pill: {
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
  pillActive: {
    backgroundColor: Colors.text,
    borderColor: Colors.text,
  },
  pillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pillLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  pillLabelActive: {
    color: Colors.white,
  },
  listContent: { paddingHorizontal: Spacing.base, paddingBottom: 120 },
  dateHeader: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
  },
  txnCard: {
    backgroundColor: Colors.card,
  },
  txnCardFirst: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
  },
  txnCardLast: {
    borderBottomLeftRadius: Radius.lg,
    borderBottomRightRadius: Radius.lg,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  txnCardMiddle: {},
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 44 + Spacing.md + Spacing.base,
  },
  sectionGap: { height: Spacing.md },
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
})
