import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { BottomSheet } from './BottomSheet'
import { Colors, Typography } from '../theme'
import { t, type Locale } from '@voice-expense/shared'

/**
 * "Want a nudge if you forget?": the explanation shown before the system
 * notification alert, for accounts that were never asked (first-run audit
 * C4/M4). Continue is the only button that leads to the alert, per Apple's
 * guidance for pre-permission screens.
 */
export function ReminderPrimeSheet({
  visible,
  locale,
  onContinue,
  onDecline,
}: {
  visible: boolean
  locale: Locale
  onContinue: () => void
  onDecline: () => void
}) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onDecline}
      cancelLabel={t('common.not_now', locale)}
      contentContainerStyle={styles.body}
      footer={
        <Pressable
          onPress={onContinue}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>{t('common.continue', locale)}</Text>
        </Pressable>
      }
      testID="reminder-prime-sheet"
    >
      <View style={styles.icon}>
        <Ionicons name="notifications" size={22} color={Colors.accent} />
      </View>
      <Text style={styles.title}>{t('reminders.prime_title', locale)}</Text>
      <Text style={styles.lead}>{t('reminders.prime_body', locale)}</Text>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 24, paddingBottom: 8, alignItems: 'flex-start' },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 14,
    fontFamily: Typography.fontFamily.serif,
    fontSize: 26,
    lineHeight: 32,
    color: Colors.ink,
    fontWeight: '500',
  },
  lead: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.ink3,
    fontFamily: Typography.fontFamily.sans,
  },
  cta: {
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
})
