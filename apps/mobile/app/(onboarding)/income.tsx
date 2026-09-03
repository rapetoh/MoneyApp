import { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useTransactions } from '../../src/hooks/useTransactions'
import { Colors, Typography, Hairline } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'

// Quick-pick presets — values expressed in whole thousands so the preset
// matches the mockup's $2.5k / $4k / $6k / $10k labels. The stored value
// is the expanded numeric equivalent.
const PRESETS = [
  { label: '$2.5k', value: 2500 },
  { label: '$4k', value: 4000 },
  { label: '$6k', value: 6000 },
  { label: '$10k', value: 10000 },
]

/**
 * Step 3 — Income. Matches S_Income in mobile-screens-5.jsx.
 * Optional monthly income + optional source name (employer). Skipping
 * still completes onboarding — the fields are nullable in the profile.
 */
export default function IncomeScreen() {
  const { user } = useAuth()
  const { profile, updateProfile } = useProfile(user?.id)
  const { createTransaction } = useTransactions(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale
  const currency = profile?.currency_code ?? 'USD'
  const router = useRouter()

  const [amount, setAmount] = useState('')
  const [source, setSource] = useState('')
  const [saving, setSaving] = useState(false)
  // Write-failure surface (fix-plan 2.13 / audit 08-F21 family): this
  // screen used to route to Today unconditionally, regardless of whether
  // `updateProfile` actually succeeded. A failed write left
  // `onboarding_completed_at` unset, so the layout gate immediately
  // bounced the user back to `/(onboarding)/permissions` with no
  // explanation — a silent loop on the app's very first screen.
  const [error, setError] = useState<string | null>(null)

  const amountNum = parseFloat(amount) || 0
  const canContinue = amountNum > 0

  async function finishOnboarding(withIncome: boolean) {
    setSaving(true)
    setError(null)
    const useIncome = withIncome && amountNum > 0

    // monthly_income / _source are no longer written here: migration 032
    // derives them server-side from the recurring credit rule the
    // transaction below creates, so the Settings figure always equals the
    // recurring-income total (owner mandate Sep 2 2026: one coherent story).
    const profileSaved = await updateProfile({
      onboarding_completed_at: new Date().toISOString(),
    })

    if (!profileSaved) {
      setSaving(false)
      setError(t('onboarding.income.save_failed', locale))
      return
    }

    // When the user provides an income, wire it into the app's transaction
    // graph so it behaves like real income everywhere (History's Income
    // tab, Insights totals, recurring catch-up):
    //   1. A recurring credit rule for future months.
    //   2. An immediate credit transaction for the current month so the
    //      user sees their income reflected right away.
    // Skipped entirely when useIncome is false (no row written).
    if (useIncome) {
      const sourceName = source.trim() || t('onboarding.income.default_name', locale)

      // The monthly income rule is created server-side by the transactions
      // trigger (migration 013) when this row syncs — atomic with the row
      // write, so onboarding can never again produce a "ghost recurring"
      // income with no rule behind it.
      const { error: txnError } = await createTransaction({
        amount: amountNum,
        direction: 'credit',
        currency_code: currency,
        merchant: sourceName,
        note: t('onboarding.income.txn_note', locale),
        category_id: null,
        payment_method: 'bank_transfer',
        is_recurring: true,
        recurring_frequency: 'monthly',
      })

      if (txnError) {
        setSaving(false)
        setError(txnError)
        return
      }
    }

    setSaving(false)
    router.replace('/(tabs)')
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => pressed && { opacity: 0.6 }}
          hitSlop={10}
        >
          <Text style={styles.navText}>{t('common.back', locale)}</Text>
        </Pressable>
        <Text style={styles.progress}>{t('onboarding.income.progress', locale)}</Text>
        <Pressable
          onPress={() => finishOnboarding(false)}
          style={({ pressed }) => pressed && { opacity: 0.6 }}
          hitSlop={10}
          disabled={saving}
        >
          <Text style={styles.navText}>{t('common.skip', locale)}</Text>
        </Pressable>
      </View>

      {/* Wrapped in a scroll container + a KAV mounted at the screen root
          (fix-plan 1.8/2.14, audit 01-F1/01-F37): the old fixed, non-
          scrolling flex column overflowed its own viewport on every iPhone
          except the Max sizes, pushing Continue off-screen with no way to
          reach it, and the un-dismissable decimal-pad keyboard made it
          worse. Shape copied from `(auth)/sign-in.tsx`, which F37 calls
          out as already correct - its `SafeAreaView` is the screen root,
          so the KAV's `onLayout` frame is exactly the top inset and RN's
          own parent-relative lift math is correct here (unlike the sheets
          F37 documents, which need the `measureInWindow` fix instead). */}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.iconTile}>
            <Ionicons
              name="trending-up"
              size={26}
              color={Colors.accent ?? Colors.primary}
            />
          </View>

          <Text style={styles.headline}>{t('onboarding.income.headline', locale)}</Text>
          <Text style={styles.lead}>{t('onboarding.income.lead', locale)}</Text>

          {/* Amount display — tapping anywhere on the card focuses the hidden
              TextInput so the native number pad slides up. Simpler than
              porting the full on-screen keypad here. */}
          <View style={styles.amountCard}>
            <View style={styles.amountRow}>
              <Text style={styles.currencyGlyph}>$</Text>
              <TextInput
                value={amount}
                onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ''))}
                placeholder="0"
                placeholderTextColor={Colors.ink4 ?? Colors.textMuted}
                keyboardType="decimal-pad"
                style={styles.amountInput}
                maxLength={9}
              />
            </View>
            <Text style={styles.amountHint}>
              {t('onboarding.income.per_month', locale)} · {currency}
            </Text>
          </View>

          {/* Source / employer — optional. MerchantAvatar will pick up the
              logo via domain guess ("Meta" → meta.com favicon). */}
          <Text style={styles.fieldLabel}>
            {t('onboarding.income.source_label', locale)}
          </Text>
          <TextInput
            value={source}
            onChangeText={setSource}
            placeholder={t('onboarding.income.source_placeholder', locale)}
            placeholderTextColor={Colors.ink4 ?? Colors.textMuted}
            style={styles.sourceInput}
            autoCapitalize="words"
          />

          {/* Quick-pick presets */}
          <Text style={styles.presetLabel}>{t('onboarding.income.quick_pick', locale)}</Text>
          <View style={styles.presetRow}>
            {PRESETS.map((p) => {
              const active = Math.abs(amountNum - p.value) < 1
              return (
                <Pressable
                  key={p.label}
                  onPress={() => setAmount(String(p.value))}
                  style={({ pressed }) => [
                    styles.presetBtn,
                    active && styles.presetBtnActive,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text style={[styles.presetLabelText, active && styles.presetLabelTextActive]}>
                    {p.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <View style={styles.privacyNote}>
            <Ionicons
              name="lock-closed"
              size={14}
              color={Colors.accent ?? Colors.primary}
              style={{ marginTop: 1 }}
            />
            <Text style={styles.privacyText}>
              {t('onboarding.income.privacy', locale)}
            </Text>
          </View>
        </ScrollView>

        {/* Pinned outside the ScrollView so it can never scroll off-screen
            or land under the keyboard — the exact failure F1 documents.
            Continue is gated on a positive amount; the Skip button in the
            top-right handles the "no income" intent explicitly, so
            Continue only makes sense when there's actually something to
            save. */}
        <View style={styles.footer}>
          {error && <Text style={styles.errorText}>{error}</Text>}
          <Pressable
            style={({ pressed }) => [
              styles.cta,
              (saving || !canContinue) && styles.ctaDisabled,
              pressed && canContinue && !saving && styles.ctaPressed,
            ]}
            onPress={() => finishOnboarding(true)}
            disabled={saving || !canContinue}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.ctaText}>{t('common.continue', locale)}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  topBar: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navText: {
    color: Colors.ink3 ?? Colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  progress: {
    color: Colors.ink4 ?? Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: Typography.fontFamily.sansBold,
  },

  flex: { flex: 1 },
  scrollContent: { paddingHorizontal: 28, paddingTop: 32, paddingBottom: 24 },
  // Fixed footer, outside the ScrollView (fix-plan 2.14, audit 01-F1) —
  // `SafeAreaView edges={['bottom', ...]}` on the screen root already
  // reserves the home-indicator inset, so this doesn't add its own.
  footer: { paddingHorizontal: 28, paddingTop: 12, paddingBottom: 4 },
  // Write-failure message (fix-plan 2.13) — sits directly above the CTA
  // it blocks, so the user sees why Continue didn't move them forward.
  errorText: {
    color: Colors.destructive ?? '#A94646',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
    textAlign: 'center',
    marginBottom: 10,
  },

  iconTile: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.accentSoft ?? Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 32,
    fontWeight: '500',
    letterSpacing: -0.6,
    lineHeight: 40,
    color: Colors.ink ?? Colors.text,
    marginTop: 18,
  },
  lead: {
    color: Colors.ink3 ?? Colors.textSecondary,
    fontSize: 14.5,
    lineHeight: 22,
    marginTop: 10,
    fontFamily: Typography.fontFamily.sans,
  },

  amountCard: {
    marginTop: 28,
    backgroundColor: Colors.surface ?? Colors.card,
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  currencyGlyph: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 32,
    color: Colors.ink3 ?? Colors.textSecondary,
    opacity: 0.55,
  },
  amountInput: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 56,
    fontWeight: '600',
    color: Colors.ink ?? Colors.text,
    minWidth: 60,
    textAlign: 'center',
    paddingVertical: 0,
  },
  amountHint: {
    fontSize: 13,
    color: Colors.ink3 ?? Colors.textSecondary,
    fontWeight: '600',
    marginTop: 4,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },

  fieldLabel: {
    marginTop: 20,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: Colors.ink3 ?? Colors.textSecondary,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  sourceInput: {
    backgroundColor: Colors.surface ?? Colors.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: Typography.fontFamily.sans,
    fontSize: 15,
    color: Colors.ink ?? Colors.text,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },

  presetLabel: {
    marginTop: 20,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Colors.ink3 ?? Colors.textSecondary,
    fontFamily: Typography.fontFamily.sansBold,
  },
  presetRow: { flexDirection: 'row', gap: 8 },
  presetBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface ?? Colors.card,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  presetBtnActive: {
    borderColor: Colors.ink ?? Colors.text,
    borderWidth: 1,
  },
  presetLabelText: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.ink ?? Colors.text,
  },
  presetLabelTextActive: { fontWeight: '700' },

  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Colors.accentSoft ?? Colors.primaryLight,
    borderRadius: 14,
  },
  privacyText: {
    flex: 1,
    fontSize: 13,
    color: Colors.ink2 ?? Colors.textSecondary,
    lineHeight: 19,
    fontFamily: Typography.fontFamily.sans,
  },

  cta: {
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.ink ?? '#1B1915',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPressed: { opacity: 0.85 },
  ctaDisabled: { opacity: 0.5 },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
})
