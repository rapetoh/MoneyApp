import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getLocales } from 'expo-localization'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useTransactions } from '../../src/hooks/useTransactions'
import { BottomSheet } from '../../src/components/BottomSheet'
import { StepDots } from '../../src/components/StepDots'
import { changeCurrency, setCurrentProfileCurrency } from '../../src/services/profileCurrency'
import { track } from '../../src/services/analytics'
import { Colors, Typography, Hairline } from '../../src/theme'
import {
  t,
  resolveLocale,
  resolveCurrency,
  voiceLanguageFor,
  currencySymbolFor,
  SUPPORTED_CURRENCIES,
  LOCALE_LABELS,
  type Locale,
} from '@voice-expense/shared'

/**
 * Onboarding step 1: "Here's how Murmur is set up" (first-run audit C1).
 *
 * Every profile is created by the server as English + USD with an en-US
 * recognizer. This screen replaces that guess with what the phone says:
 * app language from the device's preferred languages, currency from its
 * region, speech recognizer from both. One tap confirms; each row can be
 * changed. Currency matters most here: changing it later reconverts every
 * transaction, so it is settled before the first log.
 *
 * Anonymous usage and crash data (audit H1) is on by default and stated
 * in one line here; the switches to turn it off live in the Privacy
 * Center, which is where people look for them.
 */
export default function SetupScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const { updateProfile } = useProfile(user?.id)
  const { transactions } = useTransactions(user?.id)
  const device = getLocales()[0]
  const deviceLocale = resolveLocale(getLocales().map((l) => l.languageCode))
  const deviceCurrency = resolveCurrency(device?.currencyCode)

  const [locale, setLocale] = useState<Locale>(deviceLocale)
  const [currency, setCurrency] = useState<string>(deviceCurrency)
  const [picker, setPicker] = useState<'language' | 'currency' | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const voice = voiceLanguageFor(locale, device?.regionCode)
  const voiceRegion = voice.split('-')[1]

  async function confirm() {
    setSaving(true)
    setError(null)
    // An account that already holds transactions (rare: a sign-up that
    // stopped mid-onboarding on an older build) must go through the real
    // currency conversion, never a relabel.
    const hasHistory = transactions.some((x) => !x.is_deleted)
    let currencyToWrite: string | undefined = currency
    if (hasHistory) {
      currencyToWrite = undefined
      const result = await changeCurrency(currency, () => {})
      if (!result.ok) {
        setSaving(false)
        setError(result.error)
        return
      }
    }
    const ok = await updateProfile({
      locale,
      voice_language: voice,
      ...(currencyToWrite ? { currency_code: currencyToWrite } : {}),
    })
    if (!ok) {
      setSaving(false)
      setError(t('common.save_failed', locale))
      return
    }
    setCurrentProfileCurrency(currency)
    track('onboarding_setup_done', {
      locale,
      currency,
      changed_language: locale !== deviceLocale,
      changed_currency: currency !== deviceCurrency,
    })
    setSaving(false)
    router.push('/(onboarding)/first-log')
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <StepDots step={0} total={3} />
        <Text style={styles.headline}>{t('onboarding.setup.headline', locale)}</Text>
        <Text style={styles.lead}>{t('onboarding.setup.lead', locale)}</Text>

        <View style={styles.card}>
          <Row
            icon="language"
            label={t('settings.language', locale)}
            value={LOCALE_LABELS[locale]}
            onPress={() => setPicker('language')}
          />
          <Row
            icon="cash-outline"
            label={t('settings.currency', locale)}
            value={`${currencySymbolFor(currency)}  ${currency}`}
            hint={t('onboarding.setup.currency_hint', locale)}
            onPress={() => setPicker('currency')}
          />
          <Row
            icon="mic-outline"
            label={t('onboarding.setup.voice', locale)}
            value={`${LOCALE_LABELS[locale]} (${voiceRegion})`}
            hint={t('onboarding.setup.voice_hint', locale)}
            last
          />
        </View>

        <View style={styles.note}>
          <Ionicons name="lock-closed" size={13} color={Colors.ink4} style={{ marginTop: 1 }} />
          <Text style={styles.noteText}>{t('onboarding.setup.privacy_note', locale)}</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable
          onPress={confirm}
          disabled={saving}
          style={({ pressed }) => [styles.cta, (pressed || saving) && styles.ctaPressed]}
          accessibilityRole="button"
        >
          {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.ctaText}>{t('onboarding.setup.cta', locale)}</Text>}
        </Pressable>
      </View>

      <BottomSheet
        visible={picker === 'language'}
        onClose={() => setPicker(null)}
        title={t('settings.language', locale)}
        cancelLabel={t('common.cancel', locale)}
      >
        {(Object.keys(LOCALE_LABELS) as Locale[]).map((l) => (
          <PickRow
            key={l}
            label={LOCALE_LABELS[l]}
            selected={l === locale}
            onPress={() => {
              setLocale(l)
              setPicker(null)
            }}
          />
        ))}
      </BottomSheet>

      <BottomSheet
        visible={picker === 'currency'}
        onClose={() => setPicker(null)}
        title={t('settings.currency', locale)}
        cancelLabel={t('common.cancel', locale)}
      >
        {SUPPORTED_CURRENCIES.map((c) => (
          <PickRow
            key={c}
            label={`${currencySymbolFor(c)}  ${c}`}
            selected={c === currency}
            onPress={() => {
              setCurrency(c)
              setPicker(null)
            }}
          />
        ))}
      </BottomSheet>
    </SafeAreaView>
  )
}

function Row({
  icon,
  label,
  value,
  hint,
  onPress,
  last,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  label: string
  value: string
  hint?: string
  onPress?: () => void
  last?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && onPress && { opacity: 0.6 }]}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={17} color={Colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <Text style={styles.rowValue}>{value}</Text>
      {onPress ? <Ionicons name="chevron-forward" size={15} color={Colors.ink4} /> : null}
    </Pressable>
  )
}

function PickRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.pickRow, pressed && { opacity: 0.6 }]}>
      <Text style={styles.pickLabel}>{label}</Text>
      {selected && <Ionicons name="checkmark" size={18} color={Colors.accent} />}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 28, paddingTop: 24, paddingBottom: 24 },
  headline: {
    marginTop: 28,
    fontFamily: Typography.fontFamily.serif,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.6,
    fontWeight: '500',
    color: Colors.ink,
  },
  lead: { marginTop: 10, fontSize: 15, lineHeight: 22, color: Colors.ink3, fontFamily: Typography.fontFamily.sans },
  card: {
    marginTop: 28,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
    paddingHorizontal: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowDivider: { borderBottomWidth: Hairline.width, borderBottomColor: Hairline.color },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { fontSize: 15, color: Colors.ink, fontFamily: Typography.fontFamily.sansSemiBold, fontWeight: '600' },
  rowHint: { marginTop: 2, fontSize: 12.5, color: Colors.ink4, fontFamily: Typography.fontFamily.sans },
  rowValue: { fontSize: 15, color: Colors.ink2, fontFamily: Typography.fontFamily.sans },
  note: { marginTop: 18, flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 2 },
  noteText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: Colors.ink4, fontFamily: Typography.fontFamily.sans },
  footer: { paddingHorizontal: 28, paddingTop: 10, paddingBottom: 8 },
  error: {
    color: Colors.destructive,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 10,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  cta: { height: 56, borderRadius: 28, backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center' },
  ctaPressed: { opacity: 0.85 },
  ctaText: { color: Colors.white, fontSize: 17, fontWeight: '600', fontFamily: Typography.fontFamily.sansSemiBold },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: Hairline.width,
    borderBottomColor: Hairline.color,
  },
  pickLabel: { fontSize: 16, color: Colors.ink, fontFamily: Typography.fontFamily.sans },
})
