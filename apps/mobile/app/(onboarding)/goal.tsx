import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { StepDots } from '../../src/components/StepDots'
import { track } from '../../src/services/analytics'
import { Colors, Typography, Hairline } from '../../src/theme'
import { t, PRIMARY_GOALS, type Locale, type PrimaryGoal } from '@voice-expense/shared'

const ICONS: Record<PrimaryGoal, React.ComponentProps<typeof Ionicons>['name']> = {
  clarity: 'pie-chart-outline',
  budget: 'wallet-outline',
  subscriptions: 'repeat-outline',
  simple: 'mic-outline',
}

/**
 * Onboarding step 2: "What brings you here?"
 *
 * One tap, and it has to earn its place: research on onboarding questions
 * is blunt that a question which changes nothing downstream is noise. This
 * one orders the Today "Getting started" card and is quoted back on the
 * paywall, so the answer follows the user instead of being collected and
 * forgotten. Skippable, because a question nobody can skip is a toll.
 */
export default function GoalScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const { profile, updateProfile } = useProfile(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale
  const [saving, setSaving] = useState<PrimaryGoal | null>(null)

  async function choose(goal: PrimaryGoal | null) {
    setSaving(goal ?? 'simple')
    if (goal) await updateProfile({ primary_goal: goal })
    track('onboarding_goal', { goal: goal ?? 'skipped' })
    setSaving(null)
    router.push('/(onboarding)/first-log')
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <StepDots step={1} total={4} />
          <Pressable onPress={() => choose(null)} hitSlop={10} disabled={saving != null}>
            <Text style={styles.skip}>{t('common.skip', locale)}</Text>
          </Pressable>
        </View>

        <Text style={styles.headline}>{t('onboarding.goal.headline', locale)}</Text>
        <Text style={styles.lead}>{t('onboarding.goal.lead', locale)}</Text>

        <View style={styles.list}>
          {PRIMARY_GOALS.map((goal) => (
            <Pressable
              key={goal}
              onPress={() => choose(goal)}
              disabled={saving != null}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              accessibilityRole="button"
            >
              <View style={styles.iconTile}>
                <Ionicons name={ICONS[goal]} size={19} color={Colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{t(`onboarding.goal.${goal}`, locale)}</Text>
                <Text style={styles.rowSub}>{t(`onboarding.goal.${goal}_sub`, locale)}</Text>
              </View>
              {saving === goal ? (
                <ActivityIndicator color={Colors.ink4} />
              ) : (
                <Ionicons name="chevron-forward" size={16} color={Colors.ink4} />
              )}
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 28, paddingTop: 24, paddingBottom: 32 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skip: { fontSize: 15, color: Colors.ink3, fontFamily: Typography.fontFamily.sansSemiBold, fontWeight: '600' },
  headline: {
    marginTop: 28,
    fontFamily: Typography.fontFamily.serif,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.6,
    fontWeight: '500',
    color: Colors.ink,
  },
  lead: { marginTop: 10, fontSize: 15, lineHeight: 22, color: Colors.ink3, fontFamily: Typography.fontFamily.sans },
  list: { marginTop: 26, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  rowPressed: { opacity: 0.7 },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 15.5, color: Colors.ink, fontFamily: Typography.fontFamily.sansSemiBold, fontWeight: '600' },
  rowSub: { marginTop: 2, fontSize: 13, lineHeight: 18, color: Colors.ink3, fontFamily: Typography.fontFamily.sans },
})
