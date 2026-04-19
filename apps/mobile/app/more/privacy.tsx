import { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { Colors, Typography, Hairline } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components — match SetGroup / SetRow / PrivacyRow in
// docs/money-app/project/mobile-screens-4.jsx
// ─────────────────────────────────────────────────────────────────────────────

function SetGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.groupCard}>{children}</View>
    </View>
  )
}

function PrivacyRow({
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
      <View style={styles.rowInfo}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
    </View>
  )
}

function SetRow({
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
  /** Enable a switch-style toggle on the right instead of a chevron. */
  toggle?: boolean
  value?: boolean
  onToggle?: (next: boolean) => void
  onPress?: () => void
  danger?: boolean
  last?: boolean
  chevron?: boolean
}) {
  const labelColor = danger ? Colors.destructive ?? '#A94646' : Colors.ink ?? Colors.text
  const Inner = (
    <>
      <Text style={[styles.rowLabelSingle, { color: labelColor }]} numberOfLines={1}>
        {label}
      </Text>
      {detail ? <Text style={styles.rowDetailInline}>{detail}</Text> : null}
      {toggle ? (
        <Pressable
          onPress={() => onToggle?.(!value)}
          style={[styles.toggle, value ? styles.toggleOn : styles.toggleOff]}
        >
          <View style={[styles.toggleKnob, value ? styles.toggleKnobOn : styles.toggleKnobOff]} />
        </Pressable>
      ) : chevron ? (
        <Ionicons
          name="chevron-forward"
          size={14}
          color={Colors.ink4 ?? Colors.textMuted}
          style={{ marginLeft: 4 }}
        />
      ) : null}
    </>
  )
  return (
    <Pressable
      onPress={!toggle ? onPress : undefined}
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && !toggle && styles.rowPressed]}
    >
      {Inner}
    </Pressable>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen — matches S_Privacy in mobile-screens-4.jsx
// ─────────────────────────────────────────────────────────────────────────────

export default function PrivacyScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale
  const router = useRouter()

  // Local state for the toggle rows. These are visual-only for now — none of
  // them correspond to existing persisted settings. Wiring them to real
  // preferences is a separate task (see Phase D extension / Settings pass).
  const [voiceOnDevice, setVoiceOnDevice] = useState(true)
  const [shareAnalytics, setShareAnalytics] = useState(false)
  const [deleteVoice24h, setDeleteVoice24h] = useState(true)

  return (
    <>
      {/* Hide the native Stack header — the mockup has a chevron-pill + breadcrumb label */}
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Back pill + breadcrumb */}
          <View style={styles.topRow}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.backPill, pressed && styles.backPillPressed]}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={20} color={Colors.ink2 ?? Colors.textSecondary} />
            </Pressable>
            <Text style={styles.breadcrumb}>{t('more.settings', locale)}</Text>
          </View>

          {/* Intro — lock tile + serif headline + lead copy */}
          <View style={styles.intro}>
            <View style={styles.lockTile}>
              <Ionicons name="lock-closed" size={22} color={Colors.accent ?? Colors.primary} />
            </View>
            <Text style={styles.headline}>{t('privacy.title', locale)}</Text>
            <Text style={styles.lead}>{t('privacy.lead', locale)}</Text>
          </View>

          {/* What's stored where */}
          <SetGroup label={t('privacy.group_where', locale)}>
            <PrivacyRow
              icon="📱"
              label={t('privacy.on_device_label', locale)}
              detail={t('privacy.on_device_detail', locale)}
            />
            <PrivacyRow
              icon="☁️"
              label={t('privacy.icloud_label', locale)}
              detail={t('privacy.icloud_detail', locale)}
            />
            <PrivacyRow
              icon="🚫"
              label={t('privacy.servers_label', locale)}
              detail={t('privacy.servers_detail', locale)}
              last
            />
          </SetGroup>

          {/* Controls */}
          <SetGroup label={t('privacy.group_controls', locale)}>
            <SetRow
              label={t('privacy.ctrl_voice_on_device', locale)}
              toggle
              value={voiceOnDevice}
              onToggle={setVoiceOnDevice}
            />
            <SetRow
              label={t('privacy.ctrl_share_analytics', locale)}
              toggle
              value={shareAnalytics}
              onToggle={setShareAnalytics}
            />
            <SetRow
              label={t('privacy.ctrl_delete_voice_24h', locale)}
              toggle
              value={deleteVoice24h}
              onToggle={setDeleteVoice24h}
              last
            />
          </SetGroup>

          {/* Your rights */}
          <SetGroup label={t('privacy.group_rights', locale)}>
            <SetRow label={t('privacy.export_all', locale)} />
            <SetRow label={t('privacy.delete_all', locale)} danger last />
          </SetGroup>
        </ScrollView>
      </SafeAreaView>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles — traced from S_Privacy + SetGroup + SetRow in mobile-screens-4.jsx
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: 40 },

  topRow: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderWidth: 0.5,
    borderColor: Colors.line ?? 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backPillPressed: { opacity: 0.6 },
  breadcrumb: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.ink3 ?? Colors.textSecondary,
  },

  intro: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
  },
  lockTile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.accentSoft ?? Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 32,
    fontWeight: '500',
    letterSpacing: -0.6,
    lineHeight: 38,
    color: Colors.ink ?? Colors.text,
    marginTop: 14,
  },
  lead: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 14,
    lineHeight: 21,
    color: Colors.ink3 ?? Colors.textSecondary,
    marginTop: 10,
  },

  // Groups (match SetGroup)
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

  // Rows (match SetRow + PrivacyRow)
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

  // Privacy-specific row (icon tile + 2-line label/detail)
  privacyIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.accentSoft ?? Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  privacyIconGlyph: {
    fontSize: 17,
  },
  rowInfo: { flex: 1 },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
    color: Colors.ink ?? Colors.text,
  },
  rowDetail: {
    fontSize: 12,
    color: Colors.ink3 ?? Colors.textSecondary,
    fontFamily: Typography.fontFamily.sans,
    marginTop: 1,
  },

  // Settings-style row (single line label + optional detail + toggle/chevron)
  rowLabelSingle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    fontFamily: Typography.fontFamily.sans,
  },
  rowDetailInline: {
    fontSize: 13,
    color: Colors.ink3 ?? Colors.textSecondary,
    fontFamily: Typography.fontFamily.sans,
  },

  // Toggle (matches SetRow's pill toggle)
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
  toggleKnobOn: {},
  toggleKnobOff: {},
})
