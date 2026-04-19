import { View, Text, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { Colors, Typography, Spacing, Text as TextStyles } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'

// Phase B stub. Real content (ring hero + per-category bars with
// Healthy/Tight/Over tags) lands in Phase D. See docs/DESIGN.md §5
// "Budgets tab" and docs/PLAN.md Murmur Redesign section.
export default function BudgetsScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('budgets.title', locale)}</Text>
      </View>
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>🥧</Text>
        <Text style={styles.emptyTitle}>{t('budgets.empty_title', locale)}</Text>
        <Text style={styles.emptyBody}>{t('budgets.empty_body', locale)}</Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { padding: Spacing.base, gap: Spacing.md },
  title: {
    ...TextStyles.displaySerif,
  },
  empty: {
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
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
})
