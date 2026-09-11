import { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useTransactions } from '../../src/hooks/useTransactions'
import { useCategories } from '../../src/hooks/useCategories'
import { exportAndShare } from '../../src/services/exportData'
import { useDeleteAccount } from '../../src/hooks/useDeleteAccount'
import { Colors, Typography, Hairline } from '../../src/theme'
import { t, LEGAL_URLS, type Locale } from '@voice-expense/shared'

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components. Descended from SetGroup / SetRow in
// docs/money-app/project/mobile-screens-4.jsx, slimmed since.
// ─────────────────────────────────────────────────────────────────────────────

function SetGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.groupCard}>{children}</View>
    </View>
  )
}

function SetRow({
  label,
  detail,
  onPress,
  danger,
  last,
}: {
  label: string
  detail?: string
  onPress?: () => void
  danger?: boolean
  last?: boolean
}) {
  const labelColor = danger ? Colors.destructive ?? '#A94646' : Colors.ink ?? Colors.text
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && styles.rowPressed]}
    >
      <Text style={[styles.rowLabelSingle, { color: labelColor }]} numberOfLines={1}>
        {label}
      </Text>
      {detail ? <Text style={styles.rowDetailInline}>{detail}</Text> : null}
      <Ionicons
        name="chevron-forward"
        size={14}
        color={Colors.ink4 ?? Colors.textMuted}
        style={{ marginLeft: 4 }}
      />
    </Pressable>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen. Slimmed Sep 2 2026 (owner): statement + data controls + legal
// links only; the how-it-works detail lives in the privacy policy.
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

  // GDPR right to erasure / App Store 5.1.1(v). The same confirm-then-
  // delete flow Settings > Account offers (useDeleteAccount): server-side
  // `delete-user` Edge Function, local wipe, sign-out.
  const { deleting, requestDeleteAccount } = useDeleteAccount(user?.id, locale)

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

          {/* Your data (GDPR rights, free for every user). Export lands
              as a machine-readable JSON dump via the system share sheet;
              Delete tears down the entire account through the
              `delete-user` Edge Function and signs the user out.
              The old "What we guarantee" group (Selling your data:
              Never / Analytics: None) was cut Sep 2 2026 on the owner's
              review: real settings screens state facts and link the
              policy, they don't enumerate the bad things they don't do.
              The substance (no recorded audio, no analytics SDK, no
              data sales) lives in the lead copy and the privacy
              policy. */}
          <SetGroup label={t('privacy.group_rights', locale)}>
            <SetRow
              label={exporting ? t('privacy.export_all_busy', locale) : t('privacy.export_all', locale)}
              onPress={handleExportAll}
            />
            <SetRow
              label={deleting ? t('privacy.delete_all_busy', locale) : t('privacy.delete_all', locale)}
              onPress={requestDeleteAccount}
              danger
              last
            />
          </SetGroup>

          {/* Legal. The same documents Apple requires next to the
              subscription (paywall.tsx links them too), one tap from
              the screen where a user actually wonders about them. */}
          <SetGroup label={t('privacy.group_legal', locale)}>
            <SetRow
              label={t('privacy.policy_label', locale)}
              onPress={() => Linking.openURL(LEGAL_URLS.privacy)}
            />
            <SetRow
              label={t('privacy.terms_label', locale)}
              onPress={() => Linking.openURL(LEGAL_URLS.terms)}
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

  // Rows (match SetRow)
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

})
