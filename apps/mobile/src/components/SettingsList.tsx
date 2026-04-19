import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors, Typography, Hairline } from '../theme'

// Reproductions of SetGroup / SetRow / PrivacyRow from
// docs/money-app/project/mobile-screens-4.jsx. Reused by the Settings and
// Privacy Center screens so both share identical visual primitives.

export function SetGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.groupCard}>{children}</View>
    </View>
  )
}

export function SetRow({
  label,
  detail,
  toggle,
  value,
  onToggle,
  onPress,
  danger,
  last,
  chevron = true,
}: {
  label: string
  detail?: string
  /** Renders a switch on the right side instead of a chevron. */
  toggle?: boolean
  value?: boolean
  onToggle?: (next: boolean) => void
  onPress?: () => void
  danger?: boolean
  last?: boolean
  chevron?: boolean
}) {
  const labelColor = danger ? (Colors.destructive ?? '#A94646') : (Colors.ink ?? Colors.text)
  const isInteractive = toggle != null || onPress != null
  return (
    <Pressable
      onPress={!toggle ? onPress : undefined}
      style={({ pressed }) => [
        styles.row,
        !last && styles.rowDivider,
        pressed && isInteractive && !toggle && styles.rowPressed,
      ]}
    >
      <Text style={[styles.rowLabel, { color: labelColor }]} numberOfLines={1}>
        {label}
      </Text>
      {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      {toggle ? (
        <Pressable
          onPress={() => onToggle?.(!value)}
          style={[styles.toggle, value ? styles.toggleOn : styles.toggleOff]}
        >
          <View style={styles.toggleKnob} />
        </Pressable>
      ) : chevron && onPress ? (
        <Ionicons
          name="chevron-forward"
          size={14}
          color={Colors.ink4 ?? Colors.textMuted}
          style={{ marginLeft: 4 }}
        />
      ) : null}
    </Pressable>
  )
}

export function PrivacyRow({
  icon,
  label,
  detail,
  last,
}: {
  icon: string
  label: string
  detail: string
  last?: boolean
}) {
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <View style={styles.privacyIcon}>
        <Text style={styles.privacyIconGlyph}>{icon}</Text>
      </View>
      <View style={styles.privacyInfo}>
        <Text style={styles.privacyLabel}>{label}</Text>
        <Text style={styles.privacyDetail}>{detail}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // Group wrapper
  group: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  groupLabel: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    color: Colors.ink3 ?? Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontFamily: Typography.fontFamily.sansBold,
  },
  groupCard: {
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderRadius: 22,
    overflow: 'hidden',
  },

  // Shared row chrome
  row: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowDivider: {
    borderBottomWidth: Hairline.width,
    borderBottomColor: Hairline.color,
  },
  rowPressed: { opacity: 0.6 },

  // Setting row
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    fontFamily: Typography.fontFamily.sans,
  },
  rowDetail: {
    fontSize: 13,
    color: Colors.ink3 ?? Colors.textSecondary,
    fontFamily: Typography.fontFamily.sans,
  },

  // Privacy row
  privacyIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.accentSoft ?? Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyIconGlyph: { fontSize: 17 },
  privacyInfo: { flex: 1 },
  privacyLabel: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
    color: Colors.ink ?? Colors.text,
  },
  privacyDetail: {
    fontSize: 12,
    color: Colors.ink3 ?? Colors.textSecondary,
    fontFamily: Typography.fontFamily.sans,
    marginTop: 1,
  },

  // Toggle pill (matches SetRow's switch in the mockup)
  toggle: {
    width: 42,
    height: 26,
    borderRadius: 13,
    padding: 2,
    justifyContent: 'center',
  },
  toggleOn: {
    backgroundColor: Colors.accent ?? Colors.primary,
    alignItems: 'flex-end',
  },
  toggleOff: {
    backgroundColor: '#E2DED3',
    alignItems: 'flex-start',
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
})
