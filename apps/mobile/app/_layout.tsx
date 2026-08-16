import { useEffect, useRef, useState } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts } from 'expo-font'
import { useAuth } from '../src/hooks/useAuth'
import { useProfile } from '../src/hooks/useProfile'
import { useTransactions } from '../src/hooks/useTransactions'
import { useCategories } from '../src/hooks/useCategories'
import { useActiveBudget } from '../src/hooks/useBudget'
import { useRecurringRules } from '../src/hooks/useRecurringRules'
import { syncManager } from '../src/services/sync/SyncManager'
import { useShortcutHandler } from '../src/hooks/useShortcutHandler'
import { runRecurringCatchUp } from '../src/services/recurringCatchUp'
import { runFxBackfill } from '../src/services/fxBackfill'
import { registerDevice } from '../src/services/sync/deviceRegistry'
import { runOncePerSession } from '../src/services/launchOnce'
import { UndoProvider } from '../src/hooks/useUndo'
import { VoiceSessionProvider } from '../src/hooks/useVoiceSession'
import { SyncFailureBanner } from '../src/components/SyncFailureBanner'
import { t } from '@voice-expense/shared'
import type { Locale } from '@voice-expense/shared'

SplashScreen.preventAutoHideAsync()

/** Longest the splash waits on the network half of the data preload. */
const PRELOAD_NETWORK_BUDGET_MS = 2500

// Registers every face named by `Typography.fontFamily` (src/theme/typography.ts).
// Keys here ARE the `fontFamily` strings used app-wide — expo-font maps this
// key, not the font's internal PostScript name, to the loaded asset, so it
// stays decoupled from whatever name the .ttf embeds. Plus Jakarta Sans and
// DM Mono are both OFL-licensed (see apps/mobile/assets/fonts/OFL-*.txt).
//
// DM Mono ships no Bold face upstream (Regular/Medium/Light only) — Medium
// is registered under the `DMMonoBold` key as the closest available weight
// for the one consumer (Text.amountChip); it is not a true bold.
const FONT_MAP = {
  PlusJakartaSans: require('../assets/fonts/PlusJakartaSans-Regular.ttf'),
  'PlusJakartaSans-SemiBold': require('../assets/fonts/PlusJakartaSans-SemiBold.ttf'),
  'PlusJakartaSans-Bold': require('../assets/fonts/PlusJakartaSans-Bold.ttf'),
  DMMonoRegular: require('../assets/fonts/DMMono-Regular.ttf'),
  DMMonoBold: require('../assets/fonts/DMMono-Medium.ttf'),
}

export default function RootLayout() {
  const { session, loading } = useAuth()
  const { profile, loading: profileLoading } = useProfile(session?.user?.id)
  const segments = useSegments()
  const router = useRouter()
  const locale = (profile?.locale ?? 'en') as Locale
  const [fontsLoaded, fontError] = useFonts(FONT_MAP)

  // Splash stays up until we have enough data to route AND the custom
  // faces are registered. Without the font gate, the first frame(s) render
  // with San Francisco/Roboto fallback before RN swaps to Plus Jakarta
  // Sans/DM Mono, which is visible as a layout "pop" on every cold start
  // (see docs/audit-2026-08-08/01-mobile-ui-and-layout.md F5). `fontError`
  // still counts as resolved — better a system-font fallback than an
  // infinite splash if font loading ever fails on a device.
  const fontsReady = fontsLoaded || !!fontError

  // Data preload (build 12 feedback: screens painted empty/default first,
  // then re-rendered as each fetch landed). These hooks share the app-wide
  // query cache (src/services/queryCache.ts), so mounting them here fills
  // it before the splash lifts — the first frame of Today already has the
  // transaction list, categories, budget and recurring rules. Transactions
  // come from SQLite (fast, offline-safe) and are always waited for; the
  // three network reads are waited for up to PRELOAD_NETWORK_BUDGET_MS so
  // an offline launch still boots (they keep loading in the background).
  const userId = session?.user?.id
  const { loading: txLoading } = useTransactions(userId)
  const { loading: catLoading } = useCategories(userId)
  const { loading: budgetLoading } = useActiveBudget(userId)
  const { loading: rulesLoading } = useRecurringRules(userId)
  const [preloadTimedOut, setPreloadTimedOut] = useState(false)
  useEffect(() => {
    if (!userId) return
    setPreloadTimedOut(false)
    const timer = setTimeout(() => setPreloadTimedOut(true), PRELOAD_NETWORK_BUDGET_MS)
    return () => clearTimeout(timer)
  }, [userId])
  const networkPreloaded = (!catLoading && !budgetLoading && !rulesLoading) || preloadTimedOut
  const dataReady = !session || (!txLoading && networkPreloaded)

  const ready = fontsReady && !loading && (!session || !profileLoading) && dataReady

  // Handles voiceexpense://shortcut?amount=XX&merchant=... deep links from iOS Shortcuts
  useShortcutHandler()

  // Android payment-notification capture (fix-plan 3.4) now lives inside
  // VoiceSessionProvider — the same root-level result sheet serves voice,
  // scan, Shortcut, and notification captures, so there is exactly one
  // confirm surface mounted instead of the two competing VoiceConfirmModal
  // mounts this file and the Record screen used to hold.

  useEffect(() => {
    syncManager.start()
    return () => syncManager.stop()
  }, [])

  // Track the previous segment group so we can skip the onboarding bounce
  // for one render cycle after the user finishes the flow. updateProfile +
  // DataEvents.emitProfile is synchronous at the emitter but each listener's
  // refetch is async and not awaited — so when income.tsx navigates to
  // /(tabs), this layout's `profile` state hasn't updated yet, and without
  // this guard the routing gate would re-push to /(onboarding)/permissions and
  // then only settle once the refetch resolves.
  const prevSegmentRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!ready) return

    SplashScreen.hideAsync()

    const segmentGroup = segments[0]
    const prevSegmentGroup = prevSegmentRef.current
    const inAuthGroup = segmentGroup === '(auth)'
    const inOnboardingGroup = segmentGroup === '(onboarding)'
    const justLeftOnboarding =
      prevSegmentGroup === '(onboarding)' && !inOnboardingGroup

    // Password recovery (fix-plan 3.2 / audit 08-F7) is the one (auth)
    // screen this gate must leave alone. `exchangeCodeForSession` there
    // establishes a real session before the user has set a new password —
    // without this exemption, the `session && inAuthGroup` branch below
    // would fire on that same render and replace the screen with
    // /(tabs)/(onboarding) before the reset form ever appears. The screen
    // owns its own post-success navigation (`router.replace('/(tabs)')`).
    const isPasswordReset = inAuthGroup && segments[1] === 'reset-password'

    if (isPasswordReset) {
      // no-op — let the screen drive navigation
    } else if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in')
    } else if (session && inAuthGroup) {
      // Authed user stuck in auth group — wait for profile to load before
      // deciding whether to route to onboarding or tabs. Without this
      // wait, a new sign-up briefly lands on /(tabs) before flipping to
      // onboarding once the profile fetch resolves.
      if (!profile) {
        // hold on /(auth) for a moment; the effect re-runs once profile arrives
      } else if (profile.onboarding_completed_at == null) {
        router.replace('/(onboarding)/permissions')
      } else {
        router.replace('/(tabs)')
      }
    } else if (
      session &&
      !inAuthGroup &&
      !inOnboardingGroup &&
      !justLeftOnboarding &&
      profile &&
      profile.onboarding_completed_at == null
    ) {
      // Authed user who hasn't finished onboarding — push into the flow.
      // Skipped when the user has just exited /(onboarding) to /(tabs) so
      // the stale profile doesn't bounce them back.
      router.replace('/(onboarding)/permissions')
    }

    prevSegmentRef.current = segmentGroup
  }, [session, loading, segments, router, profile, ready])

  // Launch-scoped services — deliberately a *separate* effect keyed on the
  // user id alone, not on `segments` (audit 07-F15). These used to live in
  // the routing effect above, whose dependency array includes `segments`
  // (a new array on every route change), so all three re-ran — and
  // re-issued their Supabase round-trips — on every tab switch and every
  // screen push; two overlapping `runRecurringCatchUp` invocations could
  // both pass the "does this occurrence already exist" check before
  // either had written, producing duplicate-generation churn. Each call
  // is wrapped in `runOncePerSession` (`src/services/launchOnce.ts`) so it
  // fires exactly once per signed-in session even if this effect somehow
  // re-runs.
  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) return

    // Default categories are seeded server-side, atomically with account
    // creation, by the `handle_new_user` trigger (fix-plan 3.6 / audit
    // 07-F17 family — migration 029) — surface-independent, so a web-only
    // sign-up gets the same 20 categories a mobile sign-up always did.
    // The client-side `seedDefaultCategories` batch insert this replaced
    // failed *all* twenty rows on a single collision and discarded the
    // error; it has been deleted, not just superseded.

    // Generate any missed recurring transactions since last app open
    runOncePerSession(`runRecurringCatchUp:${userId}`, () => runRecurringCatchUp(userId))

    // Convert any foreign-currency historical rows that pre-date the FX
    // snapshot migration. Self-throttles to FX_BACKFILL_BATCH per launch
    // and is a no-op once everything is filled in.
    runOncePerSession(`runFxBackfill:${userId}`, () => runFxBackfill(userId))

    // Register (or refresh) this device's `devices` row — fix-plan 3.7.
    // Never written before this; the web sidebar/Settings "Synced just
    // now" string was hardcoded because there was no real row to read.
    runOncePerSession(`registerDevice:${userId}`, () => registerDevice(userId))
  }, [session?.user?.id])

  if (!ready) return null

  return (
    <UndoProvider>
      <VoiceSessionProvider>
      <StatusBar style="dark" backgroundColor="#FBFAF7" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="transaction/[id]"
          options={{
            headerShown: true,
            headerTitle: t('nav.transaction', locale),
            headerBackTitle: t('common.back', locale),
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="transaction/new"
          options={{
            // Quick entry draws its own Cancel · title · mic header
            // (artboard 11, docs/voice redesign), so the native modal
            // header is suppressed.
            headerShown: false,
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="transaction/edit"
          options={{
            headerShown: true,
            headerTitle: t('nav.edit_transaction', locale),
            headerBackTitle: t('common.back', locale),
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="recurring"
          options={{
            headerShown: true,
            headerTitle: t('recurring.title', locale),
            headerBackTitle: t('common.back', locale),
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="more/transactions"
          options={{
            headerShown: false,
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="more/settings"
          options={{
            headerShown: true,
            headerTitle: t('settings.title', locale),
            headerBackTitle: t('common.back', locale),
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="more/privacy"
          options={{
            headerShown: true,
            headerTitle: t('more.privacy', locale),
            headerBackTitle: t('common.back', locale),
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="more/ask"
          options={{
            headerShown: true,
            headerTitle: t('more.ask', locale),
            headerBackTitle: t('common.back', locale),
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="more/ask-result"
          options={{
            // The screen renders its own header (back pill + sparkle title)
            // matching S_AskResult, so the native Stack header is hidden.
            headerShown: false,
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="more/help"
          options={{
            headerShown: true,
            headerTitle: t('more.help', locale),
            headerBackTitle: t('common.back', locale),
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="more/paywall"
          options={{
            // Paywall owns its own dark chrome (close button lives in the screen).
            headerShown: false,
            presentation: 'modal',
          }}
        />
      </Stack>
      {/* App-wide failure surface for the sync outbox (fix-plan 1.6 point
          4) — renders nothing unless something is dead-lettered. */}
      <SyncFailureBanner locale={locale} />
      </VoiceSessionProvider>
    </UndoProvider>
  )
}
