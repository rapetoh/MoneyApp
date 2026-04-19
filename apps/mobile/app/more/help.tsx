import { View, Text, StyleSheet, ScrollView, Linking, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { Colors, Typography, Spacing, Radius, Text as TextStyles, Hairline } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'

// Phase B stub. Future iterations can expand to in-app FAQs, contact form,
// and tutorials. For now it's a thin screen so the More row has a
// destination.
export default function HelpScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.body}>{t('help.body', locale)}</Text>

        <View style={styles.card}>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
            onPress={() => Linking.openURL('mailto:rapetohsenyo@gmail.com?subject=Murmur%20feedback')}
          >
            <Text style={styles.rowLabel}>{t('help.contact', locale)}</Text>
            <Text style={styles.rowValue}>rapetohsenyo@gmail.com</Text>
          </Pressable>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('help.version', locale)}</Text>
            <Text style={styles.rowValue}>1.0.0</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.base, gap: Spacing.lg, paddingBottom: 120 },
  title: { ...TextStyles.displaySerif },
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
