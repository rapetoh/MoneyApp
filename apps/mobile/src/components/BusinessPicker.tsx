import { ScrollView, Pressable, Text, View, StyleSheet } from 'react-native'
import { t, type Business, type Locale } from '@voice-expense/shared'
import { Colors, Typography, Spacing } from '../theme'
import { BusinessMark } from './BusinessMark'

/**
 * Personal or one of the person's businesses (migration 044). Renders
 * nothing until a business exists, so people without one never see it.
 * Same chips as the payment-method row in the voice sheet. Each business
 * chip leads with its small tile (migration 045); Personal has none, it is
 * the plain default.
 */
export function BusinessPicker({
  businesses,
  selectedId,
  onSelect,
  locale,
  label,
}: {
  businesses: Business[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  locale: Locale
  /** Optional field label above the chips (edit form style). */
  label?: string
}) {
  if (businesses.length === 0) return null
  const known = businesses.some((b) => b.id === selectedId)
  const options: Array<Pick<Business, 'name' | 'logo' | 'icon'> & { id: string | null }> = [
    { id: null, name: t('business.personal', locale) },
    ...businesses,
  ]
  return (
    <View style={{ gap: 8 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {options.map((b) => {
          // A business deleted elsewhere reads as Personal.
          const selected = b.id === null ? !known : b.id === selectedId
          return (
            <Pressable
              key={b.id ?? 'personal'}
              onPress={() => onSelect(b.id)}
              style={[
                styles.chip,
                b.id !== null && styles.chipWithMark,
                selected && styles.chipActive,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${t('business.label', locale)}: ${b.name}`}
            >
              {b.id !== null && <BusinessMark business={b} size={18} />}
              <Text style={[styles.chipLabel, selected && styles.chipLabelActive]}>{b.name}</Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  label: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 12,
    color: Colors.ink3,
    letterSpacing: 0.3,
  },
  row: { gap: 8, paddingVertical: 2, paddingRight: Spacing.base },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  // The tile sits closer to the pill's rounded end than text would.
  chipWithMark: { paddingLeft: 7 },
  chipActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  chipLabel: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.text,
  },
  chipLabelActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
})
