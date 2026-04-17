import { View, Text, Pressable, Switch, StyleSheet, ScrollView } from 'react-native'
import { Colors, Typography, Spacing, Radius } from '../theme'
import { t } from '@voice-expense/shared'
import type { Locale } from '@voice-expense/shared'
import type { RecurringFrequency } from '@voice-expense/shared'

const FREQUENCIES: RecurringFrequency[] = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']

const FREQ_KEY: Record<RecurringFrequency, string> = {
  daily: 'recurring.daily',
  weekly: 'recurring.weekly',
  biweekly: 'recurring.biweekly',
  monthly: 'recurring.monthly',
  quarterly: 'recurring.quarterly',
  yearly: 'recurring.yearly',
}

interface Props {
  isRecurring: boolean
  frequency: RecurringFrequency
  aiDetected?: boolean
  onToggle: (value: boolean) => void
  onFrequencyChange: (freq: RecurringFrequency) => void
  locale?: Locale
}

export function RecurringToggle({
  isRecurring,
  frequency,
  aiDetected = false,
  onToggle,
  onFrequencyChange,
  locale = 'en',
}: Props) {
  return (
    <View style={styles.container}>
      {/* Toggle row */}
      <View style={styles.toggleRow}>
        <View style={styles.labelGroup}>
          <Text style={styles.label}>{t('recurring.toggle', locale)}</Text>
          {aiDetected && isRecurring && (
            <View style={styles.aiBadge}>
              <Text style={styles.aiBadgeText}>AI</Text>
              <Text style={styles.aiHint}>{t('recurring.ai_detected', locale)}</Text>
            </View>
          )}
        </View>
        <Switch
          value={isRecurring}
          onValueChange={onToggle}
          trackColor={{ false: Colors.border, true: Colors.primary }}
          thumbColor={Colors.white}
          ios_backgroundColor={Colors.border}
        />
      </View>

      {/* Frequency chips — only shown when recurring is on */}
      {isRecurring && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {FREQUENCIES.map((freq) => (
            <Pressable
              key={freq}
              style={[styles.chip, frequency === freq && styles.chipActive]}
              onPress={() => onFrequencyChange(freq)}
            >
              <Text style={[styles.chipLabel, frequency === freq && styles.chipLabelActive]}>
                {t(FREQ_KEY[freq], locale)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  labelGroup: { flex: 1, gap: 4 },
  label: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.text,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: 2,
  },
  aiBadgeText: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size.xs,
    color: Colors.white,
    backgroundColor: Colors.primary,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  aiHint: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.xs,
    color: Colors.primary,
    flexShrink: 1,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.md,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  chipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  chipLabel: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  chipLabelActive: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
})
