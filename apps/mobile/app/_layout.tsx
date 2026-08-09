import { useEffect, useRef } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts } from 'expo-font'
import { useAuth } from '../src/hooks/useAuth'
import { useProfile } from '../src/hooks/useProfile'
import { syncManager } from '../src/services/sync/SyncManager'
import { useShortcutHandler } from '../src/hooks/useShortcutHandler'
import { seedDefaultCategories } from '../src/services/seedCategories'
import { runRecurringCatchUp } from '../src/services/recurringCatchUp'
import { runFxBackfill } from '../src/services/fxBackfill'
import { UndoProvider } from '../src/hooks/useUndo'
import { SyncFailureBanner } from '../src/components/SyncFailureBanner'
import { t } from '@voice-expense/shared'
import type { Locale } from '@voice-expense/shared'

SplashScreen.preventAutoHideAsync()

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
  const ready = fontsReady && !loading && (!session || !profileLoading)

  // Handles voiceexpense://shortcut?amount=XX&merchant=... deep links from iOS Shortcuts
  useShortcutHandler()

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

    if (!session && !inAuthGroup) {
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

    if (session?.user?.id) {
      // Seed default categories for new users (no-op if categories already exist)
      seedDefaultCategories(session.user.id)

      // Generate any missed recurring transactions since last app open
      runRecurringCatchUp(session.user.id)

      // Convert any foreign-currency historical rows that pre-date the
      // FX snapshot migration. Self-throttles to FX_BACKFILL_BATCH per
      // launch and is a no-op once everything is filled in.
      runFxBackfill(session.user.id)
    }
  }, [session, loading, segments, router, profile, ready])

  if (!ready) return null

  return (
    <UndoProvider>
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
            headerShown: true,
            headerTitle: t('nav.add_expense', locale),
            headerBackTitle: t('common.back', locale),
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
      <SyncFailureBanner />
    </UndoProvider>
  )
}
