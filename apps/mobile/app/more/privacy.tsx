import { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useTransactions } from '../../src/hooks/useTransactions'
import { useCategories } from '../../src/hooks/useCategories'
import { supabase } from '../../src/lib/supabase'
import { exportAndShare } from '../../src/services/exportData'
import { wipeAllUserData } from '../../src/services/sync/transactionStore'
import { Colors, Typography, Hairline } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'

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
  const { transactions } = useTransactions(user?.id)
  const { categories } = useCategories(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale
  const currency = profile?.currency_code ?? 'USD'
  const router = useRouter()

  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Privacy's Export-all is the GDPR right to data portability — free
  // for every user, not Plus-gated (the convenience exporter in Settings
  // still offers a format picker; this one ships a complete JSON dump,
  // the format mandated as "structured, commonly used, machine-readable").
  async function handleExportAll() {
    if (exporting) return
    setExporting(true)
    try {
      await exportAndShare('json', { transactions, categories, locale, currency })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      Alert.alert(t('privacy.export_all_failed', locale), message)
    } finally {
      setExporting(false)
    }
  }

  // GDPR right to erasure. Calls the server-side `delete-user` Edge
  // Function (the only path that can also remove the auth.users row —
  // SDK calls can't because they need the service-role key), then wipes
  // local SQLite, then signs out. The destructive-style Alert is the
  // confirmation gate; deletion happens only on the second tap.
  async function handleDeleteAll() {
    if (deleting || !user?.id) return
    Alert.alert(
      t('privacy.delete_all_title', locale),
      t('privacy.delete_all_body', locale),
      [
        { text: t('common.cancel', locale), style: 'cancel' },
        {
          text: t('privacy.delete_all_confirm', locale),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true)
            try {
              const { data: sessionData } = await supabase.auth.getSession()
              const token = sessionData?.session?.access_token
              if (!token) throw new Error('Not authenticated')

              const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
              const res = await fetch(`${supabaseUrl}/functions/v1/delete-user`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
              })
              if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as { error?: string }
                throw new Error(body.error ?? `HTTP ${res.status}`)
              }

              // Server confirms the account is gone — clear the local
              // mirror so a re-sign-up on the same device starts truly
              // empty, then sign out (invalidates the cached session).
              await wipeAllUserData(user.id)
              await supabase.auth.signOut()
              // The root layout's auth listener will route to /(auth)/sign-in
              // when the session clears; no manual router.replace needed.
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              Alert.alert(t('privacy.delete_all_failed', locale), message)
              setDeleting(false)
            }
          },
        },
      ],
    )
  }

  return (
    <>
      {/* Hide the native Stack header — the mockup has a chevron-pill + breadcrumb label */}
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        {/* Back pill + breadcrumb. Sibling of the ScrollView, not its
            first child — a child scrolls off screen on this long page
            (audit 01-F32); matches more/transactions.tsx's `topRow`. */}
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
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Intro — lock tile + serif headline + lead copy */}
          <View style={styles.intro}>
            <View style={styles.lockTile}>
              <Ionicons name="lock-closed" size={22} color={Colors.accent ?? Colors.primary} />
            </View>
            <Text style={styles.headline}>{t('privacy.title', locale)}</Text>
            <Text style={styles.lead}>{t('privacy.lead', locale)}</Text>
          </View>

          {/* What's stored where. Four rows, one per real data flow
              (fix-plan 3.5 / audit 02-F4, 02-F16, 01-F28; corrected
              Aug 29 2026): transcripts stay local, transactions sync
              through OUR servers (Supabase — the mockup's "Your iCloud"
              row described an architecture we never built and was a
              false claim), merchant-logo lookups are a direct
              device→Google request, and extraction sends transcript
              text + receipt photos to OpenAI. */}
          <SetGroup label={t('privacy.group_where', locale)}>
            <PrivacyRow
              icon="📱"
              label={t('privacy.on_device_label', locale)}
              detail={t('privacy.on_device_detail', locale)}
            />
            <PrivacyRow
              icon="☁️"
              label={t('privacy.cloud_label', locale)}
              detail={t('privacy.cloud_detail', locale)}
            />
            <PrivacyRow
              icon="🖼️"
              label={t('privacy.merchant_logos_label', locale)}
              detail={t('privacy.merchant_logos_detail', locale)}
            />
            <PrivacyRow
              icon="🌐"
              label={t('privacy.openai_label', locale)}
              detail={t('privacy.openai_detail', locale)}
              last
            />
          </SetGroup>

          {/* Guarantees (not user-controllable). The mockup shows three
              toggles here, but each is a permanent product decision in our
              build, so they render as read-only rows. Reworked Aug 29 2026
              to only state what the code actually enforces: audio is never
              recorded to a file at all (recognition streams it, nothing to
              delete "after 24h" — the old row promised a deletion schedule
              for recordings that don't exist), there is no analytics SDK
              in the app, and we never sell data. The old "stays on-device
              — Always" row overclaimed: recognition is forced on-device
              where supported but falls back to Apple's recognizer, which
              the lead copy now discloses instead. */}
          <SetGroup label={t('privacy.group_guarantees', locale)}>
            <SetRow
              label={t('privacy.guar_audio', locale)}
              detail={t('privacy.status_never_stored', locale)}
              chevron={false}
            />
            <SetRow
              label={t('privacy.guar_analytics', locale)}
              detail={t('common.none', locale)}
              chevron={false}
            />
            <SetRow
              label={t('privacy.guar_selling', locale)}
              detail={t('privacy.status_never', locale)}
              chevron={false}
              last
            />
          </SetGroup>

          {/* Your rights — GDPR-grade controls. Export lands as a
              machine-readable JSON dump via the system share sheet;
              Delete tears down the entire account through the
              `delete-user` Edge Function and signs the user out. Both
              are unconditionally available, including for free users. */}
          <SetGroup label={t('privacy.group_rights', locale)}>
            <SetRow
              label={exporting ? t('privacy.export_all_busy', locale) : t('privacy.export_all', locale)}
              onPress={handleExportAll}
            />
            <SetRow
              label={deleting ? t('privacy.delete_all_busy', locale) : t('privacy.delete_all', locale)}
              onPress={handleDeleteAll}
              danger
              last
            />
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
