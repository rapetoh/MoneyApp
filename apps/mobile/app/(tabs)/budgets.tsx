import { useMemo, useState, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams } from 'expo-router'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useTransactions } from '../../src/hooks/useTransactions'
import { useActiveBudget, budgetStatusFor } from '../../src/hooks/useBudget'
import { useRecurringRules } from '../../src/hooks/useRecurringRules'
import { Money } from '../../src/components/Money'
import { BudgetRing } from '../../src/components/BudgetRing'
import { BudgetEditorModal } from '../../src/components/BudgetEditorModal'
import { Colors, Typography, useTabBarClearance } from '../../src/theme'
import { t, localParts, daysBetween } from '@voice-expense/shared'
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
/** Days remaining in `window`, counted from `nowIso`'s own civil day in
 *  `tz` to the window's (exclusive) end civil day — the exact same
 *  window `budgetStatusFor()` computed `spent`/`committed` from, so the
 *  countdown and the figure beside it can never again disagree (audit
 *  05-F17: "the number respects the period while the label says 'left
 *  this month' and the day count is days-left-in-month" — that was two
 *  different windows; this is one). Replaces the old `daysLeftInPeriod`,
 *  which had its own hand-rolled weekly/biweekly/monthly cases and
 *  silently reused the monthly case for quarterly and yearly.
 */
function daysLeftInWindow(windowEndExclusive: string, nowIso: string, tz: string): number {
  const now = localParts(nowIso, tz)
  const end = localParts(windowEndExclusive, tz)
  return Math.max(1, daysBetween(now.y, now.m, now.d, end.y, end.m, end.d))
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
  // Clears the floating tab bar (audit 01-F13, fix-plan 1.8/2.14) — replaces
  // the hand-picked `paddingBottom: 140` literal.
  const tabBarClearance = useTabBarClearance()
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const { transactions } = useTransactions(user?.id)
  // Read-error exposure (fix-plan 2.13 / audit 08-F21 family) — a failed
  // budget read used to look exactly like "no budget set" (`budget` stays
  // `null` either way), so the empty-state CTA below rendered for a
  // fetch failure as readily as for a genuinely unconfigured budget.
  const { budget, error: budgetError, setBudget, refetch: refetchBudget } = useActiveBudget(user?.id)
  const { rules: recurringRules } = useRecurringRules(user?.id)
  const [budgetModalVisible, setBudgetModalVisible] = useState(false)
  // `?edit=1` — Ask Murmur's "Adjust budget" / "Set budget" action lands
  // here with the editor already open (docs/ask-murmur/SPEC.md §1.4).
  const params = useLocalSearchParams<{ edit?: string }>()
  useEffect(() => {
    if (params.edit === '1') setBudgetModalVisible(true)
  }, [params.edit])

  const locale = (profile?.locale ?? 'en') as Locale
  const currency = profile?.currency_code ?? 'USD'
  // profiles.timezone (fix-plan 1.3 part 1) — every window this screen
  // renders comes from here, never the device's own zone, so the figure
  // and the countdown beside it always describe the same window as web.
  const tz = profile?.timezone || 'UTC'

  const monthLabel = useMemo(
    () => new Date().toLocaleDateString(locale, { month: 'long', timeZone: tz }).toUpperCase(),
    [locale, tz],
  )

  // The one budget-status computation (fix-plan 2.5) — replaces the
  // separate `usePeriodSpend` + `computeUpcomingRecurring` sum, which
  // added a correct "spent" figure to a recurring total that ignored
  // `direction` and currency and summed only the *next* occurrence per
  // rule regardless of the budget's own period.
  const status = useMemo(
    () => budgetStatusFor(budget, transactions, recurringRules, tz),
    [budget, transactions, recurringRules, tz],
  )
  const daysLeft = useMemo(
    () => (status ? daysLeftInWindow(status.window.endExclusive, new Date().toISOString(), tz) : 0),
    [status, tz],
  )

  const spent = (status?.spent ?? 0) + (status?.committed ?? 0)
  const limit = budget?.amount ?? 0
  const remaining = Math.max(0, limit - spent)
  const over = limit > 0 && spent > limit
  const tight = !over && limit > 0 && spent / limit > 0.92

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]} showsVerticalScrollIndicator={false}>
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

        {/* Hero ring card — only when a budget is set. A failed read (with
            no budget yet loaded) gets its own error+retry state (fix-plan
            2.13) instead of falling through to the "no budget set" CTA,
            which used to be reachable for both a real empty budget and a
            broken fetch alike. */}
        {budgetError && !budget ? (
          <View style={styles.emptyHero}>
            <Ionicons name="alert-circle-outline" size={32} color={Colors.destructive ?? '#A94646'} />
            <Text style={styles.emptyHeroTitle}>{t('common.load_failed', locale)}</Text>
            <Pressable
              style={({ pressed }) => [styles.ctaBtn, pressed && styles.ctaBtnPressed]}
              onPress={refetchBudget}
            >
              <Text style={styles.ctaBtnText}>{t('common.retry', locale)}</Text>
            </Pressable>
          </View>
        ) : limit > 0 ? (
          <View style={styles.heroCard}>
            <BudgetRing spent={spent} limit={limit} locale={locale} />
            <View style={styles.heroText}>
              <Text style={styles.heroLabel}>{periodLabel(budget?.period, locale)}</Text>
              <View style={styles.heroAmount}>
                {over ? (
                  <Money
                    value={spent - limit}
                    currencyCode={currency}
                    locale={locale}
                    size={28}
                    color={Colors.destructive ?? '#A94646'}
                  />
                ) : (
                  <Money value={remaining} currencyCode={currency} locale={locale} size={30} />
                )}
              </View>
              <View style={styles.heroOfLine}>
                <Text style={styles.heroOfText}>
                  {over ? t('budgets.over_by', locale) : t('budgets.left_of', locale)}{' '}
                </Text>
                <Money value={limit} currencyCode={currency} locale={locale} size={13} serif={false} sansWeight="600" muted />
              </View>
              {/* The three labelled numbers (fix-plan 2.5) — "spent" from
                  posted transactions and "committed" from due-but-unposted
                  recurring rules + pre-logged future transactions are kept
                  visibly separate rather than silently summed into one
                  "spent" figure that overclaims what has actually left the
                  account. */}
              {(status?.committed ?? 0) > 0 && (
                <View style={styles.heroOfLine}>
                  <Money
                    value={status!.committed}
                    currencyCode={currency}
                    locale={locale}
                    size={13}
                    serif={false}
                    sansWeight="600"
                    muted
                  />
                  <Text style={styles.heroOfText}> {t('budgets.committed', locale)}</Text>
                </View>
              )}
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
        onSave={async (amount, period) => setBudget(amount, period, currency, tz)}
        onClose={() => setBudgetModalVisible(false)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  // `paddingBottom` set per-instance above from `useTabBarClearance()`
  // (audit 01-F13, fix-plan 1.8/2.14).
  content: {},

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
