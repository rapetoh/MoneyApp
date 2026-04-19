import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { Colors, Typography, Spacing, Radius, Text as TextStyles } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'

// Phase B stub. The full Privacy Center (device/iCloud/servers tiles +
// toggles + export/delete-all) lands in Phase D. See docs/DESIGN.md §5
// "Privacy Center".
export default function PrivacyScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('privacy.title', locale)}</Text>
        <Text style={styles.tagline}>{t('privacy.tagline', locale)}</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('privacy.on_device_title', locale)}</Text>
          <Text style={styles.cardBody}>{t('privacy.on_device_body', locale)}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('privacy.servers_title', locale)}</Text>
          <Text style={styles.cardBody}>{t('privacy.servers_body', locale)}</Text>
        </View>

        <Text style={styles.footnote}>{t('privacy.stub_note', locale)}</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.base, gap: Spacing.lg, paddingBottom: 120 },
  title: { ...TextStyles.displaySerif },
  tagline: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  card: {
    backgroundColor: Colors.surface ?? Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  cardTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.md,
    color: Colors.ink ?? Colors.text,
  },
  cardBody: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  footnote: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.xs,
    color: Colors.ink4 ?? Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
})
