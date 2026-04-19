import { useMemo, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useTransactions } from '../../src/hooks/useTransactions'
import { useActiveBudget, usePeriodSpend } from '../../src/hooks/useBudget'
import { useRecurringRules, computeUpcomingRecurring } from '../../src/hooks/useRecurringRules'
import { Money } from '../../src/components/Money'
import { BudgetRing } from '../../src/components/BudgetRing'
import { BudgetEditorModal } from '../../src/components/BudgetEditorModal'
import { Colors, Typography } from '../../src/theme'
import { t } from '@voice-expense/shared'
import type { Locale } from '@voice-expense/shared'

/**
 * Budgets tab. Matches `S_Budgets` in
 * docs/money-app/project/mobile-screens-5.jsx at the layout level:
 *
 *   - Header: "APRIL · N days left" (uppercase tracked) + "Budgets" title
 *     (big sans-display) + "+" add-budget pill.
 *   - Hero card: BudgetRing + "MONTHLY BUDGET" label + serif "left" amount +
 *     "left of $X,XXX" line + "On pace" sage pill (or "Over budget" warning).
 *   - "By category" section: empty placeholder for now — the app has the DB
 *     columns for per-category budgets (budgets.category_id nullable) but no
 *     UI to manage them yet. That's its own feature, landing post-Phase D.
 *
 * The ring's progress arc is a follow-up once react-native-svg is installed
 * (see BudgetRing component notes).
 */
function daysLeftInPeriod(period: string | undefined): number {
  const now = new Date()
  if (period === 'weekly') {
    const day = now.getDay() // 0=Sun..6=Sat
    const daysUntilNextMon = day === 0 ? 1 : 8 - day
    return daysUntilNextMon
  }
  if (period === 'biweekly') {
    // Rough: align to the start of the biweekly window we're in.
    return 14 // conservative upper bound; tight enough for a header hint
  }
  // monthly (default) / quarterly / yearly: days-left in the current month.
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return Math.max(1, end.getDate() - now.getDate() + 1)
}

function periodLabel(period: string | undefined, locale: Locale): string {
  switch (period) {
    case 'weekly': return t('home.budget_weekly', locale)
    case 'biweekly': return t('home.budget_biweekly', locale)
    case 'quarterly': return t('home.budget_quarterly', locale)
    case 'yearly': return t('home.budget_yearly', locale)
    default: return t('home.budget_monthly', locale)
  }
}

export default function BudgetsScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const { transactions } = useTransactions(user?.id)
  const { budget, setBudget } = useActiveBudget(user?.id)
  const { rules: recurringRules } = useRecurringRules(user?.id)
  const periodSpend = usePeriodSpend(budget, transactions)
  const [budgetModalVisible, setBudgetModalVisible] = useState(false)

  const locale = (profile?.locale ?? 'en') as Locale
  const currency = profile?.currency_code ?? 'USD'

  const monthLabel = useMemo(
    () => new Date().toLocaleDateString(locale, { month: 'long' }).toUpperCase(),
    [locale],
  )
  const daysLeft = useMemo(() => daysLeftInPeriod(budget?.period), [budget?.period])
  const upcomingRecurring = useMemo(
    () => computeUpcomingRecurring(recurringRules, budget?.period),
    [recurringRules, budget?.period],
  )

  const spent = periodSpend + upcomingRecurring
  const limit = budget?.amount ?? 0
  const remaining = Math.max(0, limit - spent)
  const over = limit > 0 && spent > limit
  const tight = !over && limit > 0 && spent / limit > 0.92

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header row. The "+" pill opens the shared BudgetEditorModal so the
            user can set or modify the global monthly budget from this tab
            directly (user feedback — previously it jumped to Settings, which
            was confusing). When per-category budgets land this button will
            become "Add category budget" instead. */}
        <View style={styles.header}>
          <View>
            <Text style={styles.monthTag}>
              {monthLabel} · {daysLeft} {t('home.days_to_go', locale)}
            </Text>
            <Text style={styles.title}>{t('budgets.title', locale)}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
            onPress={() => setBudgetModalVisible(true)}
            hitSlop={8}
            accessibilityLabel={t('budgets.edit_budget', locale)}
          >
            <Ionicons
              name={budget ? 'create-outline' : 'add'}
              size={18}
              color={Colors.ink2 ?? Colors.textSecondary}
            />
          </Pressable>
        </View>

        {/* Hero ring card — only when a budget is set */}
        {limit > 0 ? (
          <View style={styles.heroCard}>
            <BudgetRing spent={spent} limit={limit} />
            <View style={styles.heroText}>
              <Text style={styles.heroLabel}>{periodLabel(budget?.period, locale)}</Text>
              <View style={styles.heroAmount}>
                {over ? (
                  <Money value={spent - limit} size={28} color={Colors.destructive ?? '#A94646'} />
                ) : (
                  <Money value={remaining} size={30} />
                )}
              </View>
              <View style={styles.heroOfLine}>
                <Text style={styles.heroOfText}>
                  {over ? t('budgets.over_by', locale) : t('budgets.left_of', locale)}{' '}
                </Text>
                <Money value={limit} size={13} serif={false} sansWeight="600" muted />
              </View>
              <View style={[styles.pacePill, (over || tight) && styles.pacePillWarn]}>
                <Text
                  style={[
                    styles.pacePillLabel,
                    (over || tight) && styles.pacePillLabelWarn,
                  ]}
                  numberOfLines={1}
                >
                  {over
                    ? t('budgets.status_over', locale)
                    : tight
                    ? t('budgets.status_tight', locale)
                    : t('budgets.status_on_pace', locale)}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.emptyHero}>
            <Text style={styles.emptyHeroIcon}>🥧</Text>
            <Text style={styles.emptyHeroTitle}>{t('budgets.no_budget_title', locale)}</Text>
            <Text style={styles.emptyHeroBody}>{t('budgets.no_budget_body', locale)}</Text>
            <Pressable
              style={({ pressed }) => [styles.ctaBtn, pressed && styles.ctaBtnPressed]}
              onPress={() => setBudgetModalVisible(true)}
            >
              <Text style={styles.ctaBtnText}>{t('budgets.set_budget_cta', locale)}</Text>
            </Pressable>
          </View>
        )}

        {/* By category */}
        <Text style={styles.sectionHead}>{t('budgets.by_category', locale)}</Text>
        <View style={styles.emptyCategoryCard}>
          <Text style={styles.emptyCategoryBody}>
            {t('budgets.by_category_coming_soon', locale)}
          </Text>
        </View>
      </ScrollView>

      <BudgetEditorModal
        visible={budgetModalVisible}
        initialAmount={budget?.amount ?? null}
        initialPeriod={budget?.period ?? null}
        currency={currency}
        locale={locale}
        onSave={async (amount, period) => setBudget(amount, period, currency)}
        onClose={() => setBudgetModalVisible(false)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: 140 },

  header: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.8,
    color: Colors.ink ?? Colors.text,
    marginTop: 2,
  },
  // Header edit button
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface ?? '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: Colors.line ?? 'rgba(0,0,0,0.06)',
    marginTop: 20,
  },
  headerBtnPressed: { opacity: 0.6 },

  // Hero card
  heroCard: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderRadius: 28,
    padding: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  heroText: { flex: 1 },
  heroLabel: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 12,
    fontWeight: '700',
    color: Colors.ink3 ?? Colors.textSecondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  heroAmount: { marginTop: 4 },
  heroOfLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    marginTop: 2,
  },
  heroOfText: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 13,
    color: Colors.ink3 ?? Colors.textSecondary,
  },
  pacePill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Colors.accentSoft ?? Colors.primaryLight,
  },
  pacePillWarn: {
    backgroundColor: '#F4DDDD',
  },
  pacePillLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
    color: Colors.accent ?? Colors.primary,
    letterSpacing: 0.3,
  },
  pacePillLabelWarn: {
    color: '#843C3C',
  },

  // Empty hero
  emptyHero: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderRadius: 28,
    padding: 22,
    alignItems: 'center',
    gap: 8,
  },
  emptyHeroIcon: { fontSize: 36 },
  emptyHeroTitle: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 17,
    color: Colors.ink ?? Colors.text,
    textAlign: 'center',
    marginTop: 4,
  },
  emptyHeroBody: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 13,
    color: Colors.ink3 ?? Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 4,
  },
  ctaBtn: {
    marginTop: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: Colors.ink ?? '#1B1915',
    borderRadius: 999,
  },
  ctaBtnPressed: { opacity: 0.7 },
  ctaBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white,
  },

  sectionHead: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 8,
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
    color: Colors.ink3 ?? Colors.textSecondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  emptyCategoryCard: {
    marginHorizontal: 16,
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderRadius: 22,
    padding: 20,
  },
  emptyCategoryBody: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 13,
    color: Colors.ink3 ?? Colors.textSecondary,
    lineHeight: 19,
    textAlign: 'center',
  },
})
