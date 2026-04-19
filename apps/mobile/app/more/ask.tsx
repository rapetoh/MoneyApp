import { View, Text, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { Colors, Typography, Spacing, Radius, Text as TextStyles } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'

// Phase B stub. Ask Murmur (grounded reasoner over the user's own transactions)
// is built in Phase E. See docs/DESIGN.md §5 "Ask Murmur" and §8 "AI behavior".
export default function AskMurmurScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.content}>
        <View style={styles.logoBlock}>
          <View style={styles.logoSquare}>
            <Text style={styles.logoGlyph}>✦</Text>
          </View>
          <Text style={styles.title}>{t('ask.title', locale)}</Text>
          <Text style={styles.tagline}>{t('ask.tagline', locale)}</Text>
        </View>

        <View style={styles.stubCard}>
          <Text style={styles.stubTitle}>{t('ask.coming_soon', locale)}</Text>
          <Text style={styles.stubBody}>{t('ask.coming_soon_body', locale)}</Text>
        </View>

        <Text style={styles.footnote}>🔒 {t('ask.privacy_note', locale)}</Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: {
    flex: 1,
    padding: Spacing.base,
    gap: Spacing['2xl'],
    justifyContent: 'center',
  },
  logoBlock: { alignItems: 'center', gap: Spacing.sm },
  logoSquare: {
    width: 64,
    height: 64,
    borderRadius: Radius.xl,
    backgroundColor: Colors.ink ?? '#1B1915',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  logoGlyph: {
    fontSize: 32,
    color: Colors.white,
  },
  title: {
    ...TextStyles.displaySerif,
    textAlign: 'center',
  },
  tagline: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: Spacing.lg,
  },
  stubCard: {
    backgroundColor: Colors.accentSoft ?? Colors.primaryLight,
    borderRadius: Radius.card,
    padding: Spacing.lg,
    gap: Spacing.xs,
    alignItems: 'center',
  },
  stubTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.md,
    color: Colors.primary,
  },
  stubBody: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.ink2 ?? Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  footnote: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.xs,
    color: Colors.ink4 ?? Colors.textMuted,
    textAlign: 'center',
  },
})
