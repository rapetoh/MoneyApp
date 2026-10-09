import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useCategories } from '../../src/hooks/useCategories'
import { DataEvents } from '../../src/events/dataEvents'
import {
  loadMerchantRules,
  forgetMerchantRule,
  type StoredMerchantRule,
} from '../../src/services/merchantRules'
import { haptic } from '../../src/services/haptics'
import { Colors, Typography, Spacing, Radius } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'

/**
 * Learned categories (migration 041, Oct 2026): every merchant Murmur has
 * been taught a category for, by someone moving one of its expenses. The
 * list is the control: a rule that turns out wrong is forgotten here, and
 * the next capture from that merchant goes back to the AI's guess.
 */
export default function LearnedCategoriesScreen() {
  const { user } = useAuth()
  const userId = user?.id
  const { profile } = useProfile(userId)
  const { categoryMap } = useCategories(userId)
  const locale = (profile?.locale ?? 'en') as Locale
  const [rules, setRules] = useState<StoredMerchantRule[] | null>(null)

  const reload = useCallback(async () => {
    if (!userId) return
    setRules(await loadMerchantRules(userId, true))
  }, [userId])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!userId) return
    return DataEvents.onMerchantRules(userId, () => void reload())
  }, [userId, reload])

  const sorted = useMemo(
    () => [...(rules ?? [])].sort((a, b) => a.merchant_name.localeCompare(b.merchant_name, locale)),
    [rules, locale],
  )

  async function forget(rule: StoredMerchantRule) {
    if (!userId) return
    haptic.tap()
    setRules((cur) => (cur ?? []).filter((r) => r.merchant_key !== rule.merchant_key))
    const ok = await forgetMerchantRule(userId, rule.merchant_key)
    if (!ok) void reload()
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="sparkles-outline" size={20} color={Colors.accent} />
          </View>
          <Text style={styles.title}>{t('rules.title', locale)}</Text>
          <Text style={styles.body}>{t('rules.subtitle', locale)}</Text>
        </View>

        {rules === null ? (
          <ActivityIndicator color={Colors.ink3} style={{ marginTop: 24 }} />
        ) : sorted.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t('rules.empty', locale)}</Text>
          </View>
        ) : (
          <View style={styles.card}>
            {sorted.map((rule, i) => {
              const category = categoryMap[rule.category_id]
              return (
                <View key={rule.merchant_key} style={[styles.row, i === sorted.length - 1 && styles.rowLast]}>
                  <View style={styles.rowText}>
                    <Text style={styles.merchant} numberOfLines={1}>{rule.merchant_name}</Text>
                    <View style={styles.categoryLine}>
                      <Ionicons name="arrow-forward" size={12} color={Colors.ink4} />
                      <Text style={styles.category} numberOfLines={1}>{category?.name ?? '-'}</Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => forget(rule)}
                    hitSlop={8}
                    style={({ pressed }) => [styles.forget, pressed && { opacity: 0.6 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('rules.forget', locale)} ${rule.merchant_name}`}
                  >
                    <Text style={styles.forgetText}>{t('rules.forget', locale)}</Text>
                  </Pressable>
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.base, gap: Spacing.lg, paddingBottom: 32 },
  hero: { gap: 8, paddingTop: 4 },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 26,
    fontWeight: '500',
    letterSpacing: -0.5,
    color: Colors.ink ?? Colors.text,
  },
  body: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  card: {
    backgroundColor: Colors.surface ?? Colors.card,
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.base,
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(40,36,28,0.10)',
  },
  rowLast: { borderBottomWidth: 0 },
  rowText: { flex: 1, gap: 3 },
  merchant: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 15, color: Colors.ink },
  categoryLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  category: { fontFamily: Typography.fontFamily.sans, fontSize: 13, color: Colors.ink3 },
  forget: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: Colors.surface2 },
  forgetText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 12.5, color: Colors.ink2 },
  emptyCard: { backgroundColor: Colors.surface ?? Colors.card, borderRadius: Radius.card, padding: Spacing.base },
  emptyText: { fontFamily: Typography.fontFamily.sans, fontSize: 14, lineHeight: 20, color: Colors.ink3 },
})
