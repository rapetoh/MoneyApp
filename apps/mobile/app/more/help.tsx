import { View, Text, StyleSheet, ScrollView, Linking, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Constants from 'expo-constants'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { Colors, Typography, Spacing, Radius, Hairline } from '../../src/theme'
import { t, SUPPORT_EMAIL, SUPPORT_MAILTO, type Locale } from '@voice-expense/shared'

// Phase B stub. Future iterations can expand to in-app FAQs, contact form,
// and tutorials. For now it's a thin screen so the More row has a
// destination.
export default function HelpScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale

  // Fix-plan 3.6 / audit 08-F33: `support@murmur.app` has no MX record —
  // every message sent to it bounced. Hiding the contact row while
  // `SUPPORT_EMAIL` is unset (see its doc comment in packages/shared/src/
  // brand.ts) means this screen never offers a channel it can't honour.
  // Narrowed into a local pair (not a derived boolean) so TypeScript can
  // see both are non-null wherever `supportMailto` is used below.
  const supportMailto = SUPPORT_EMAIL && SUPPORT_MAILTO ? { email: SUPPORT_EMAIL, mailto: SUPPORT_MAILTO } : null

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.body}>
          {t(supportMailto ? 'help.body' : 'help.body_no_contact', locale)}
        </Text>

        <View style={styles.card}>
          {supportMailto && (
            <>
              <Pressable
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
                onPress={() => Linking.openURL(supportMailto.mailto)}
              >
                <Text style={styles.rowLabel}>{t('help.contact', locale)}</Text>
                <Text style={styles.rowValue}>{supportMailto.email}</Text>
              </Pressable>
              <View style={styles.divider} />
            </>
          )}
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('help.version', locale)}</Text>
            <Text style={styles.rowValue}>{Constants.expoConfig?.version ?? '-'}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  // No floating tab bar here (tab-less Stack push) and `SafeAreaView
  // edges={['bottom', ...]}` above already reserves the home-indicator
  // inset — a plain breathing-room constant, not a bar-clearance literal
  // (audit 01-F13).
  content: { padding: Spacing.base, gap: Spacing.lg, paddingBottom: 24 },
  body: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  card: {
    backgroundColor: Colors.surface ?? Colors.card,
    borderRadius: Radius.card,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.base,
  },
  rowLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.ink ?? Colors.text,
  },
  rowValue: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  divider: {
    height: Hairline.width,
    backgroundColor: Hairline.color,
    marginLeft: Spacing.base,
  },
})
