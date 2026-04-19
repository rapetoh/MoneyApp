import { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useAuth } from '../src/hooks/useAuth'
import { useProfile } from '../src/hooks/useProfile'
import { useRecurringRules, computeNextOccurrence } from '../src/hooks/useRecurringRules'
import { Colors, Typography, Spacing, Radius } from '../src/theme'
import { formatCurrency, t } from '@voice-expense/shared'
import type { Locale } from '@voice-expense/shared'
import type { RecurringRule, RecurringFrequency } from '@voice-expense/shared'

const FREQ_KEY: Record<RecurringFrequency, string> = {
  daily: 'recurring.daily',
  weekly: 'recurring.weekly',
  biweekly: 'recurring.biweekly',
  monthly: 'recurring.monthly',
  quarterly: 'recurring.quarterly',
  yearly: 'recurring.yearly',
}

function formatNextDue(rule: RecurringRule, locale: Locale): string {
  const next = computeNextOccurrence(rule)
  if (!next) return '—'
  return next.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}

export default function RecurringScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const { rules, loading, toggleRule, deleteRule } = useRecurringRules(user?.id)
  const router = useRouter()
  const [toggling, setToggling] = useState<string | null>(null)

  const locale = (profile?.locale ?? 'en') as Locale
  const currency = profile?.currency_code ?? 'USD'

  async function handleToggle(rule: RecurringRule) {
    setToggling(rule.id)
    await toggleRule(rule.id, !rule.is_active)
    setToggling(null)
  }

  function handleDelete(rule: RecurringRule) {
    Alert.alert(
      t('recurring.delete_confirm', locale),
      rule.name ?? formatCurrency(rule.amount, currency),
      [
        { text: t('common.cancel', locale), style: 'cancel' },
        {
          text: t('detail.delete', locale),
          style: 'destructive',
          onPress: () => deleteRule(rule.id),
        },
      ],
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing['3xl'] }} />
        ) : rules.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔄</Text>
            <Text style={styles.emptyTitle}>{t('recurring.empty', locale)}</Text>
            <Text style={styles.emptySub}>{t('recurring.empty_sub', locale)}</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {rules.map((rule, i) => (
              <View key={rule.id}>
                {i > 0 && <View style={styles.divider} />}
                <View style={[styles.ruleRow, !rule.is_active && styles.ruleRowInactive]}>
                  {/* Left: info */}
                  <View style={styles.ruleInfo}>
                    <Text style={styles.ruleName} numberOfLines={1}>
                      {rule.name ?? formatCurrency(rule.amount, currency)}
                    </Text>
                    <View style={styles.ruleMeta}>
                      <Text style={styles.ruleFreq}>
                        {t(FREQ_KEY[rule.frequency], locale)}
                      </Text>
                      <Text style={styles.ruleDot}>·</Text>
                      <Text style={styles.ruleAmount}>
                        {formatCurrency(rule.amount, rule.currency_code)}
                      </Text>
                      <Text style={styles.ruleDot}>·</Text>
                      <Text style={styles.ruleNext}>
                        {t('recurring.next_due', locale)}: {formatNextDue(rule, locale)}
                      </Text>
                    </View>
                  </View>

                  {/* Right: toggle + delete */}
                  <View style={styles.ruleActions}>
                    {toggling === rule.id ? (
                      <ActivityIndicator color={Colors.primary} size="small" />
                    ) : (
                      <Switch
                        value={rule.is_active}
                        onValueChange={() => handleToggle(rule)}
                        trackColor={{ false: Colors.border, true: Colors.primary }}
                        thumbColor={Colors.white}
                        ios_backgroundColor={Colors.border}
                      />
                    )}
                    <Pressable onPress={() => handleDelete(rule)} hitSlop={8}>
                      <Text style={styles.deleteIcon}>🗑</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.base, gap: Spacing.base, paddingBottom: Spacing['3xl'] },
  list: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  ruleRowInactive: { opacity: 0.5 },
  ruleInfo: { flex: 1, gap: 3 },
  ruleName: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.text,
  },
  ruleMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  ruleFreq: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.xs,
    color: Colors.primary,
  },
  ruleDot: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
  },
  ruleAmount: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: Typography.size.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  ruleNext: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
  },
  ruleActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  deleteIcon: { fontSize: 16 },
  divider: { height: 1, backgroundColor: Colors.border, marginLeft: Spacing.base },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing['3xl'],
    gap: Spacing.sm,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size.md,
    color: Colors.text,
    textAlign: 'center',
  },
  emptySub: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: Spacing.xl,
  },
})
