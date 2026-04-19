import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { Colors, Typography, Spacing, Radius, Text as TextStyles, Hairline } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

interface Row {
  key: string
  label: string
  icon: IoniconName
  onPress: () => void
  /** Renders a subtle Plus pill on the right when this row is Plus-gated */
  plusGated?: boolean
}

// Phase B. Sections + rows match the design doc's IA for the "More" drawer
// (see docs/DESIGN.md §4). Privacy Center, Ask Murmur, and Help are stubs
// until Phase D/E land their real implementations.
export default function MoreScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale
  const router = useRouter()

  const sections: { title: string; rows: Row[] }[] = [
    {
      title: t('more.section_activity', locale),
      rows: [
        {
          key: 'history',
          label: t('more.history', locale),
          icon: 'time-outline',
          onPress: () => router.push('/more/history'),
        },
        {
          key: 'recurring',
          label: t('more.recurring', locale),
          icon: 'repeat',
          onPress: () => router.push('/recurring'),
        },
      ],
    },
    {
      title: t('more.section_intelligence', locale),
      rows: [
        {
          key: 'ask',
          label: t('more.ask', locale),
          icon: 'sparkles-outline',
          onPress: () => router.push('/more/ask'),
          plusGated: true,
        },
      ],
    },
    {
      title: t('more.section_account', locale),
      rows: [
        {
          key: 'settings',
          label: t('more.settings', locale),
          icon: 'settings-outline',
          onPress: () => router.push('/more/settings'),
        },
        {
          key: 'privacy',
          label: t('more.privacy', locale),
          icon: 'lock-closed-outline',
          onPress: () => router.push('/more/privacy'),
        },
        {
          key: 'help',
          label: t('more.help', locale),
          icon: 'help-circle-outline',
          onPress: () => router.push('/more/help'),
        },
      ],
    },
  ]

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{t('more.title', locale)}</Text>

        {sections.map((section) => (
          <View key={section.title} style={styles.sectionWrap}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionCard}>
              {section.rows.map((row, i) => (
                <View key={row.key}>
                  {i > 0 && <View style={styles.divider} />}
                  <Pressable
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                    onPress={row.onPress}
                  >
                    <Ionicons
                      name={row.icon}
                      size={20}
                      color={Colors.ink3 ?? Colors.textSecondary}
                      style={styles.rowIcon}
                    />
                    <Text style={styles.rowLabel}>{row.label}</Text>
                    {row.plusGated && (
                      <View style={styles.plusPill}>
                        <Text style={styles.plusPillText}>Plus</Text>
                      </View>
                    )}
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={Colors.ink4 ?? Colors.textMuted}
                    />
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: {
    padding: Spacing.base,
    gap: Spacing.lg,
    paddingBottom: 120,
  },
  title: {
    ...TextStyles.displaySerif,
    marginBottom: Spacing.xs,
  },
  sectionWrap: { gap: Spacing.sm },
  sectionTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.ink3 ?? Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginLeft: Spacing.sm,
  },
  sectionCard: {
    backgroundColor: Colors.surface ?? Colors.card,
    borderRadius: Radius.card,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.base,
  },
  rowPressed: { opacity: 0.6 },
  rowIcon: { width: 22, textAlign: 'center' },
  rowLabel: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.ink ?? Colors.text,
  },
  divider: {
    height: Hairline.width,
    backgroundColor: Hairline.color,
    marginLeft: Spacing.base + 22 + Spacing.md,
  },
  plusPill: {
    backgroundColor: Colors.accentSoft ?? Colors.primaryLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  plusPillText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.primary,
    letterSpacing: 0.3,
  },
})
