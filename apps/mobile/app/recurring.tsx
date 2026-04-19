import { useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../src/hooks/useAuth'
import { useProfile } from '../src/hooks/useProfile'
import { useCategories } from '../src/hooks/useCategories'
import { useRecurringRules, computeNextOccurrence } from '../src/hooks/useRecurringRules'
import { MerchantAvatar } from '../src/components/MerchantAvatar'
import { Money } from '../src/components/Money'
import { Colors, Typography, Hairline } from '../src/theme'
import { formatCurrency, t } from '@voice-expense/shared'
import type { Locale } from '@voice-expense/shared'
import type { RecurringRule, RecurringFrequency } from '@voice-expense/shared'

// Multipliers to normalize any frequency to a monthly equivalent. Used by the
// hero to show a single "paid monthly" number across a mixed portfolio.
const TO_MONTHLY: Record<RecurringFrequency, number> = {
  daily: 30,
  weekly: 4.33,
  biweekly: 2.17,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
}

const FREQ_KEY: Record<RecurringFrequency, string> = {
  daily: 'recurring.daily',
  weekly: 'recurring.weekly',
  biweekly: 'recurring.biweekly',
  monthly: 'recurring.monthly',
  quarterly: 'recurring.quarterly',
  yearly: 'recurring.yearly',
}

// Compact "/mo" / "/wk" tag rendered beneath the amount on each row. Mockup
// shows "/MO" for the monthly-heavy preview — we keep the shape for every
// frequency so the visual rhythm holds.
const FREQ_SHORT: Record<RecurringFrequency, string> = {
  daily: '/day',
  weekly: '/wk',
  biweekly: '/2wk',
  monthly: '/mo',
  quarterly: '/qtr',
  yearly: '/yr',
}

function formatNextDue(rule: RecurringRule, locale: Locale): string {
  const next = computeNextOccurrence(rule)
  if (!next) return '—'
  return next.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}

export default function RecurringScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const { categories } = useCategories(user?.id)
  const { rules, loading, toggleRule, deleteRule } = useRecurringRules(user?.id)
  const router = useRouter()
  const [toggling, setToggling] = useState<string | null>(null)

  const locale = (profile?.locale ?? 'en') as Locale
  const currency = profile?.currency_code ?? 'USD'

  // Category lookup used to colour the fallback tile when a rule has no
  // merchant (e.g. manually-named "Rent").
  const categoryById = useMemo(() => {
    const m = new Map<string, { name: string; color: string | null }>()
    categories.forEach((c) => m.set(c.id, { name: c.name, color: c.color ?? null }))
    return m
  }, [categories])

  // Monthly-equivalent total across every active rule. Yearly projection is
  // the × 12 of that so the serif sentence reads honestly for any mix.
  const monthlyTotal = useMemo(() => {
    return rules
      .filter((r) => r.is_active)
      .reduce((sum, r) => sum + r.amount * TO_MONTHLY[r.frequency], 0)
  }, [rules])
  const yearlyProjection = Math.round(monthlyTotal * 12)

  function handleRowPress(rule: RecurringRule) {
    // Action sheet via Alert — preserves the shipped pause/resume + delete
    // affordances the mockup's row layout doesn't show. Destructive delete is
    // last, matching iOS convention.
    Alert.alert(
      rule.name ?? formatCurrency(rule.amount, rule.currency_code, locale),
      t(FREQ_KEY[rule.frequency], locale) + ' · ' + formatCurrency(rule.amount, rule.currency_code, locale),
      [
        {
          text: rule.is_active ? t('recurring.pause', locale) : t('recurring.resume', locale),
          onPress: async () => {
            setToggling(rule.id)
            await toggleRule(rule.id, !rule.is_active)
            setToggling(null)
          },
        },
        {
          text: t('detail.delete', locale),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('recurring.delete_confirm', locale),
              rule.name ?? formatCurrency(rule.amount, rule.currency_code, locale),
              [
                { text: t('common.cancel', locale), style: 'cancel' },
                {
                  text: t('detail.delete', locale),
                  style: 'destructive',
                  onPress: () => deleteRule(rule.id),
                },
              ],
            )
          },
        },
        { text: t('common.cancel', locale), style: 'cancel' },
      ],
    )
  }

  return (
    <>
      {/* Hide the native Stack header — the mockup renders its own chevron pill + breadcrumb. */}
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Back pill + breadcrumb (comes from the More drawer) */}
          <View style={styles.topRow}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.backPill, pressed && styles.backPillPressed]}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={20} color={Colors.ink2 ?? Colors.textSecondary} />
            </Pressable>
            <Text style={styles.breadcrumb}>{t('more.title', locale)}</Text>
          </View>

          {/* Title block */}
          <View style={styles.intro}>
            <Text style={styles.eyebrow}>{t('recurring.eyebrow_detected', locale)}</Text>
            <Text style={styles.headline}>{t('recurring.heading', locale)}</Text>
          </View>

          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 48 }} />
          ) : rules.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🔄</Text>
              <Text style={styles.emptyTitle}>{t('recurring.empty', locale)}</Text>
              <Text style={styles.emptySub}>{t('recurring.empty_sub', locale)}</Text>
            </View>
          ) : (
            <>
              {/* Hero: monthly total + yearly projection */}
              <View style={styles.heroWrap}>
                <View style={styles.heroCard}>
                  <Text style={styles.heroEyebrow}>{t('recurring.paid_monthly', locale)}</Text>
                  <View style={styles.heroAmountRow}>
                    <Money value={monthlyTotal} size={46} />
                    <Text style={styles.heroPer}>{t('recurring.per_month', locale)}</Text>
                  </View>
                  <Text style={styles.heroSummary}>
                    {t('recurring.yearly_prefix', locale)}{' '}
                    <Text style={styles.heroSummaryStrong}>
                      {formatCurrency(yearlyProjection, currency, locale)}
                    </Text>{' '}
                    {t('recurring.yearly_suffix', locale)}
                  </Text>
                </View>
              </View>

              {/* Active subscriptions */}
              <View style={styles.sectionWrap}>
                <Text style={styles.sectionLabel}>{t('recurring.active_subs', locale)}</Text>
                <View style={styles.listCard}>
                  {rules.map((rule, i) => {
                    const cat = rule.category_id ? categoryById.get(rule.category_id) : null
                    const isTogglingThis = toggling === rule.id
                    return (
                      <Pressable
                        key={rule.id}
                        onPress={() => handleRowPress(rule)}
                        style={({ pressed }) => [
                          styles.ruleRow,
                          i < rules.length - 1 && styles.ruleRowDivider,
                          !rule.is_active && styles.ruleRowInactive,
                          pressed && styles.ruleRowPressed,
                        ]}
                      >
                        <MerchantAvatar
                          merchant={rule.name}
                          size={36}
                          radius={10}
                          categoryName={cat?.name ?? null}
                          categoryColor={cat?.color ?? null}
                        />
                        <View style={styles.ruleInfo}>
                          <Text style={styles.ruleName} numberOfLines={1}>
                            {rule.name ?? formatCurrency(rule.amount, rule.currency_code, locale)}
                          </Text>
                          <Text style={styles.ruleNext} numberOfLines={1}>
                            {rule.is_active
                              ? `${t('recurring.next_due', locale)} · ${formatNextDue(rule, locale)}`
                              : t('recurring.paused', locale)}
                          </Text>
                        </View>
                        <View style={styles.ruleAmountCol}>
                          {isTogglingThis ? (
                            <ActivityIndicator size="small" color={Colors.primary} />
                          ) : (
                            <>
                              <Money value={rule.amount} size={14} serif={false} sansWeight="700" />
                              <Text style={styles.ruleFreqTag}>{FREQ_SHORT[rule.frequency]}</Text>
                            </>
                          )}
                        </View>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles — trace S_Recurring in docs/money-app/project/mobile-screens-5.jsx.
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: 40 },

  topRow: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backPillPressed: { opacity: 0.6 },
  breadcrumb: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.ink3 ?? Colors.textSecondary,
  },

  intro: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 4,
  },
  eyebrow: {
    color: Colors.ink4 ?? Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  headline: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.8,
    color: Colors.ink ?? Colors.text,
    marginTop: 4,
  },

  heroWrap: { paddingHorizontal: 20, paddingTop: 12 },
  heroCard: {
    backgroundColor: Colors.surface2 ?? Colors.card,
    borderRadius: 26,
    paddingHorizontal: 22,
    paddingVertical: 22,
  },
  heroEyebrow: {
    color: Colors.ink3 ?? Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: Typography.fontFamily.sansBold,
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 6,
  },
  heroPer: {
    color: Colors.ink3 ?? Colors.textSecondary,
    fontSize: 14,
    fontFamily: Typography.fontFamily.sans,
  },
  heroSummary: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 16,
    lineHeight: 22,
    color: Colors.ink2 ?? Colors.textSecondary,
    marginTop: 12,
  },
  heroSummaryStrong: {
    color: Colors.ink ?? Colors.text,
    fontWeight: '700',
  },

  sectionWrap: { paddingHorizontal: 16, paddingTop: 24 },
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
  listCard: {
    backgroundColor: Colors.surface2 ?? Colors.card,
    borderRadius: 22,
    overflow: 'hidden',
  },
  ruleRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ruleRowDivider: {
    borderBottomWidth: Hairline.width,
    borderBottomColor: Hairline.color,
  },
  ruleRowInactive: { opacity: 0.5 },
  ruleRowPressed: { backgroundColor: 'rgba(40,36,28,0.04)' },
  ruleInfo: { flex: 1, minWidth: 0 },
  ruleName: {
    fontSize: 14.5,
    fontWeight: '600',
    color: Colors.ink ?? Colors.text,
    letterSpacing: -0.2,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  ruleNext: {
    fontSize: 12,
    color: Colors.ink3 ?? Colors.textSecondary,
    marginTop: 1,
    fontFamily: Typography.fontFamily.sans,
  },
  ruleAmountCol: {
    alignItems: 'flex-end',
  },
  ruleFreqTag: {
    fontSize: 10.5,
    color: Colors.ink4 ?? Colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 1,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 17,
    color: Colors.ink ?? Colors.text,
    textAlign: 'center',
  },
  emptySub: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 14,
    color: Colors.ink3 ?? Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 4,
  },
})
