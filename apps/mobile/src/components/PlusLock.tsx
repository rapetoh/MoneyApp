import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { Colors, Typography, Hairline } from '../theme'
import { t, type Locale } from '@voice-expense/shared'

/**
 * The one way Murmur shows a Plus-only surface to a free account.
 *
 * It is a preview, never a slammed door: the section keeps its place and
 * its shape, says in the user's own terms what would be there, and opens
 * the paywall. Written for the pricing model of Sep 20 2026, where the
 * free tier keeps capture and the current month, and Plus adds the
 * thinking: history, forecasts, Ask, exports, desktop.
 */
export function PlusLock({
  icon,
  title,
  body,
  locale,
  origin,
  compact,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  title: string
  body: string
  locale: Locale
  /** Where the paywall was opened from, for the funnel report. */
  origin: string
  compact?: boolean
}) {
  const router = useRouter()
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/more/paywall', params: { origin } })}
      style={({ pressed }) => [styles.card, compact && styles.compact, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${t('plus.unlock', locale)}`}
    >
      <View style={styles.iconTile}>
        <Ionicons name={icon} size={18} color={Colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        <View style={styles.ctaRow}>
          <Text style={styles.cta}>{t('plus.unlock', locale)}</Text>
          <Ionicons name="arrow-forward" size={13} color={Colors.accent} />
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  compact: { padding: 14, borderRadius: 16 },
  pressed: { opacity: 0.7 },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 15, color: Colors.ink, fontFamily: Typography.fontFamily.sansSemiBold, fontWeight: '600' },
  body: { marginTop: 3, fontSize: 13, lineHeight: 19, color: Colors.ink3, fontFamily: Typography.fontFamily.sans },
  ctaRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  cta: { fontSize: 13.5, color: Colors.accent, fontFamily: Typography.fontFamily.sansBold, fontWeight: '700' },
})
