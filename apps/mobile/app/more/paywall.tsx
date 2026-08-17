import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { Typography, Colors } from '../../src/theme'
import { t, LEGAL_URLS, describePlus, type Locale, type PlusPlan } from '@voice-expense/shared'
import {
  purchasesEnabled,
  configurePurchases,
  loadPlusOffers,
  purchasePlan,
  restorePlus,
  manageSubscription,
  type PlusOffers,
  type PlanOffer,
} from '../../src/services/purchases'

/**
 * Paywall — Murmur Plus (Aug 16, 2026 owner decision: iOS subscription
 * through RevenueCat, monthly / yearly, 7-day free trial on both).
 *
 * Everything a reviewer or a user needs to see next to a price is here
 * and real: plan cards priced by the store (never a baked string), the
 * trial length read from the product's introductory offer and only shown
 * when this Apple ID is still eligible, the auto-renewal statement,
 * Terms + Privacy links, Restore purchases (App Store 3.1.1), and a
 * manage-subscription route for someone who is already Plus. Nothing
 * renders a pressed state unless it does work.
 *
 * Entitlement stays `profiles.plus_status` (usePlusStatus): a purchase
 * calls plus-sync so the server writes it from the store record, then we
 * refetch the profile — the screen never grants Plus locally.
 *
 * When this build has no RevenueCat key (`purchasesEnabled` false — see
 * services/purchases.ts) the plan section is replaced by the honest
 * "purchases aren't available in this build" line audit fix-plan 3.1
 * introduced, so a keyless build can never show a CTA that cannot act.
 */
export default function PaywallScreen() {
  const { user } = useAuth()
  const { profile, refetch } = useProfile(user?.id)
  // "Already subscribed" means a *store* subscription exists — a
  // hand-granted `active` (early access) still gets the plans, because
  // there is nothing on Apple's side to manage (describePlus.storeBacked).
  const plan = describePlus(profile)
  const isStoreSubscriber = (plan.kind === 'active' || plan.kind === 'trial') && plan.storeBacked
  const locale = (profile?.locale ?? 'en') as Locale
  const router = useRouter()

  const [offers, setOffers] = useState<PlusOffers | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [selected, setSelected] = useState<PlusPlan>('yearly')
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null)

  const load = useCallback(async () => {
    if (!purchasesEnabled || !user?.id) {
      setLoadState('ready')
      return
    }
    setLoadState('loading')
    try {
      await configurePurchases(user.id)
      const o = await loadPlusOffers()
      setOffers(o)
      setSelected(o.yearly ? 'yearly' : 'monthly')
      setLoadState('ready')
    } catch {
      setLoadState('error')
    }
  }, [user?.id])

  useEffect(() => {
    load()
  }, [load])

  const features = [
    t('paywall.feature_desktop', locale),
    t('paywall.feature_ask_murmur', locale),
    t('paywall.feature_auto_recurring', locale),
    t('paywall.feature_export', locale),
  ]

  const current: PlanOffer | null = offers
    ? selected === 'yearly'
      ? offers.yearly
      : offers.monthly
    : null

  // "Save 37%" — computed from the store's own numbers, so a price change
  // in App Store Connect updates it without a release.
  const savePct = useMemo(() => {
    if (!offers?.monthly || !offers.yearly) return null
    const m = offers.monthly.pkg.product.price
    const y = offers.yearly.pkg.product.price
    if (!(m > 0) || !(y > 0)) return null
    const pct = Math.round((1 - y / (m * 12)) * 100)
    return pct > 0 ? pct : null
  }, [offers])

  const fill = (s: string, vars: Record<string, string | number>) =>
    Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), s)

  const period = (plan: PlusPlan) =>
    t(plan === 'yearly' ? 'paywall.per_year' : 'paywall.per_month', locale)

  const onPurchase = async () => {
    if (!current || busy) return
    setBusy('purchase')
    const outcome = await purchasePlan(current)
    await refetch()
    setBusy(null)
    if (outcome.kind === 'purchased') {
      router.back()
    } else if (outcome.kind === 'pending') {
      Alert.alert(t('paywall.eyebrow', locale), t('paywall.pending', locale))
    } else if (outcome.kind === 'error') {
      Alert.alert(t('paywall.purchase_error', locale), outcome.message)
    }
    // cancelled → stay on the screen silently
  }

  const onRestore = async () => {
    if (busy) return
    setBusy('restore')
    const outcome = await restorePlus()
    await refetch()
    setBusy(null)
    if (outcome.kind === 'restored') {
      Alert.alert(t('paywall.eyebrow', locale), t('paywall.restore_done', locale), [
        { text: t('paywall.done', locale), onPress: () => router.back() },
      ])
    } else if (outcome.kind === 'nothing') {
      Alert.alert(t('paywall.restore', locale), t('paywall.restore_none', locale))
    } else {
      Alert.alert(t('paywall.restore', locale), outcome.message)
    }
  }

  const ctaLabel = current
    ? current.trialDays
      ? fill(t('paywall.cta_trial', locale), { days: current.trialDays })
      : fill(t('paywall.cta_subscribe', locale), { price: current.priceString })
    : ''
  const finePrint = current
    ? current.trialDays
      ? fill(t('paywall.fine_print_trial', locale), {
          days: current.trialDays,
          price: current.priceString,
          period: period(current.plan),
        })
      : fill(t('paywall.fine_print', locale), {
          price: current.priceString,
          period: period(current.plan),
        })
    : ''

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {/* The app's one full-screen dark canvas — per-screen StatusBar
          override (audit 01-F22). */}
      <StatusBar style="light" />
      <View style={styles.root}>
        <View pointerEvents="none" style={styles.halo} />

        <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
          <View style={styles.topRow}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={18} color={Colors.white} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.hero}>
              <View style={styles.topPill}>
                <Ionicons name="sparkles" size={12} color={Colors.white} />
                <Text style={styles.topPillText}>{t('paywall.eyebrow', locale)}</Text>
              </View>
              <Text style={styles.headline}>{t('paywall.headline', locale)}</Text>
              <Text style={styles.body}>{t('paywall.body', locale)}</Text>
            </View>

            <View style={styles.features}>
              {features.map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <View style={styles.checkCircle}>
                    <Ionicons name="checkmark" size={12} color={Colors.white} />
                  </View>
                  <Text style={styles.featureText}>{f}</Text>
                </View>
              ))}
            </View>

            {/* Plans */}
            {isStoreSubscriber ? (
              <View style={styles.plansWrap}>
                <View style={styles.alreadyCard}>
                  <Ionicons name="checkmark-circle" size={20} color="#9DBB9C" />
                  <Text style={styles.alreadyText}>{t('paywall.already_plus', locale)}</Text>
                </View>
              </View>
            ) : !purchasesEnabled ? null : loadState === 'loading' ? (
              <View style={styles.plansWrap}>
                <View style={styles.loadingRow}>
                  <ActivityIndicator color="rgba(255,255,255,0.7)" />
                  <Text style={styles.loadingText}>{t('paywall.loading', locale)}</Text>
                </View>
              </View>
            ) : loadState === 'error' || !offers || (!offers.yearly && !offers.monthly) ? (
              <View style={styles.plansWrap}>
                <Text style={styles.loadingText}>{t('paywall.load_error', locale)}</Text>
                <Pressable
                  onPress={load}
                  style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.retryText}>{t('paywall.retry', locale)}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.plansWrap}>
                {offers.yearly && (
                  <PlanCard
                    offer={offers.yearly}
                    title={t('paywall.plan_yearly', locale)}
                    periodLabel={t('paywall.per_year', locale)}
                    sub={
                      offers.yearly.pricePerMonthString
                        ? fill(t('paywall.equiv_per_month', locale), {
                            price: offers.yearly.pricePerMonthString,
                          })
                        : null
                    }
                    badge={
                      savePct
                        ? `${t('paywall.best_value', locale)} · ${fill(t('paywall.save_pct', locale), { pct: savePct })}`
                        : t('paywall.best_value', locale)
                    }
                    trialLabel={
                      offers.yearly.trialDays
                        ? fill(t('paywall.trial_badge', locale), { days: offers.yearly.trialDays })
                        : null
                    }
                    selected={selected === 'yearly'}
                    onPress={() => setSelected('yearly')}
                  />
                )}
                {offers.monthly && (
                  <PlanCard
                    offer={offers.monthly}
                    title={t('paywall.plan_monthly', locale)}
                    periodLabel={t('paywall.per_month', locale)}
                    sub={null}
                    badge={null}
                    trialLabel={
                      offers.monthly.trialDays
                        ? fill(t('paywall.trial_badge', locale), { days: offers.monthly.trialDays })
                        : null
                    }
                    selected={selected === 'monthly'}
                    onPress={() => setSelected('monthly')}
                  />
                )}
              </View>
            )}
          </ScrollView>

          {/* Footer: CTA + auto-renew statement + legal/restore links */}
          <View style={styles.bottom}>
            {isStoreSubscriber ? (
              <Pressable
                onPress={manageSubscription}
                style={({ pressed }) => [
                  styles.cta,
                  styles.ctaSecondary,
                  pressed && styles.ctaPressed,
                ]}
              >
                <Text style={styles.ctaText}>{t('paywall.manage', locale)}</Text>
              </Pressable>
            ) : !purchasesEnabled ? (
              <Text style={styles.disclaimer}>{t('paywall.disclaimer', locale)}</Text>
            ) : (
              <>
                {current && (
                  <>
                    <Pressable
                      onPress={onPurchase}
                      disabled={busy != null}
                      style={({ pressed }) => [
                        styles.cta,
                        (pressed || busy != null) && styles.ctaPressed,
                      ]}
                      accessibilityRole="button"
                    >
                      {busy === 'purchase' ? (
                        <ActivityIndicator color={Colors.white} />
                      ) : (
                        <Text style={styles.ctaText}>{ctaLabel}</Text>
                      )}
                    </Pressable>
                    <Text style={styles.finePrint}>{finePrint}</Text>
                  </>
                )}
                <View style={styles.linksRow}>
                  <Pressable onPress={() => Linking.openURL(LEGAL_URLS.terms)} hitSlop={8}>
                    <Text style={styles.link}>{t('paywall.terms', locale)}</Text>
                  </Pressable>
                  <Text style={styles.linkDot}>·</Text>
                  <Pressable onPress={() => Linking.openURL(LEGAL_URLS.privacy)} hitSlop={8}>
                    <Text style={styles.link}>{t('paywall.privacy', locale)}</Text>
                  </Pressable>
                  <Text style={styles.linkDot}>·</Text>
                  <Pressable onPress={onRestore} hitSlop={8} disabled={busy != null}>
                    <Text style={styles.link}>
                      {busy === 'restore'
                        ? t('paywall.processing', locale)
                        : t('paywall.restore', locale)}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </SafeAreaView>
      </View>
    </>
  )
}

function PlanCard({
  offer,
  title,
  periodLabel,
  sub,
  badge,
  trialLabel,
  selected,
  onPress,
}: {
  offer: PlanOffer
  title: string
  periodLabel: string
  sub: string | null
  badge: string | null
  trialLabel: string | null
  selected: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.plan,
        selected && styles.planSelected,
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={styles.planRadioWrap}>
        <View style={[styles.planRadio, selected && styles.planRadioOn]}>
          {selected && <View style={styles.planRadioDot} />}
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.planTitleRow}>
          <Text style={styles.planTitle}>{title}</Text>
          {badge && (
            <View style={styles.planBadge}>
              <Text style={styles.planBadgeText}>{badge}</Text>
            </View>
          )}
        </View>
        <Text style={styles.planPrice}>
          {offer.priceString} <Text style={styles.planPeriod}>{periodLabel}</Text>
        </Text>
        {(sub || trialLabel) && (
          <Text style={styles.planSub}>{[trialLabel, sub].filter(Boolean).join(' · ')}</Text>
        )}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0B0C' },
  halo: {
    position: 'absolute',
    top: -160,
    left: -80,
    right: -80,
    height: 520,
    borderRadius: 520,
    backgroundColor: '#2b3a2b',
    opacity: 0.5,
  },
  safe: { flex: 1 },
  topRow: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnPressed: { opacity: 0.7 },
  scrollContent: { paddingBottom: 12 },
  hero: { paddingHorizontal: 28, paddingTop: 12 },
  topPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.accent ?? Colors.primary,
  },
  topPillText: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 11,
    fontWeight: '700',
    color: Colors.white,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  headline: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 34,
    fontWeight: '500',
    letterSpacing: -0.8,
    lineHeight: 38,
    color: Colors.white,
    marginTop: 18,
  },
  body: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 10,
  },
  features: { paddingHorizontal: 28, paddingTop: 20, gap: 8 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.accent ?? Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 13.5,
    color: 'rgba(255,255,255,0.9)',
    flex: 1,
  },
  plansWrap: { paddingHorizontal: 20, paddingTop: 22, gap: 10 },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  planSelected: {
    borderColor: '#9DBB9C',
    backgroundColor: 'rgba(63,90,62,0.28)',
  },
  planRadioWrap: { width: 22, alignItems: 'center' },
  planRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planRadioOn: { borderColor: '#9DBB9C' },
  planRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#9DBB9C' },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  planTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 14,
    color: Colors.white,
  },
  planBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#9DBB9C',
  },
  planBadgeText: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 10,
    color: '#0B0B0C',
    letterSpacing: 0.3,
  },
  planPrice: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 22,
    color: Colors.white,
    marginTop: 4,
  },
  planPeriod: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  planSub: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
    paddingVertical: 18,
  },
  loadingText: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
  retryBtn: {
    alignSelf: 'center',
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  retryText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 13, color: Colors.white },
  alreadyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(63,90,62,0.28)',
    borderWidth: 1.5,
    borderColor: '#9DBB9C',
  },
  alreadyText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 14,
    color: Colors.white,
  },
  bottom: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 12, gap: 10 },
  cta: {
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.accent ?? Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaSecondary: { backgroundColor: 'rgba(255,255,255,0.14)' },
  ctaPressed: { opacity: 0.8 },
  ctaText: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 16,
    color: Colors.white,
  },
  finePrint: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 11,
    lineHeight: 15,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  linksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 2,
  },
  link: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
  },
  linkDot: { color: 'rgba(255,255,255,0.35)', fontSize: 12 },
  disclaimer: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '500',
    fontFamily: Typography.fontFamily.sans,
    lineHeight: 18,
  },
})
