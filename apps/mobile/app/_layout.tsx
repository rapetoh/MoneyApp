import { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { useAuth } from '../src/hooks/useAuth'
import { useProfile } from '../src/hooks/useProfile'
import { syncManager } from '../src/services/sync/SyncManager'
import { useShortcutHandler } from '../src/hooks/useShortcutHandler'
import { seedDefaultCategories } from '../src/services/seedCategories'
import { runRecurringCatchUp } from '../src/services/recurringCatchUp'
import { UndoProvider } from '../src/hooks/useUndo'
import { t } from '@voice-expense/shared'
import type { Locale } from '@voice-expense/shared'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const { session, loading } = useAuth()
  const { profile } = useProfile(session?.user?.id)
  const segments = useSegments()
  const router = useRouter()
  const locale = (profile?.locale ?? 'en') as Locale

  // Handles voiceexpense://shortcut?amount=XX&merchant=... deep links from iOS Shortcuts
  useShortcutHandler()

  useEffect(() => {
    syncManager.start()
    return () => syncManager.stop()
  }, [])

  useEffect(() => {
    if (loading) return

    SplashScreen.hideAsync()

    const inAuthGroup = segments[0] === '(auth)'

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in')
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)')
    }

    if (session?.user?.id) {
      // Seed default categories for new users (no-op if categories already exist)
      seedDefaultCategories(session.user.id)

      // Generate any missed recurring transactions since last app open
      runRecurringCatchUp(session.user.id)
    }
  }, [session, loading, segments, router])

  if (loading) return null

  return (
    <UndoProvider>
      <StatusBar style="dark" backgroundColor="#FBFAF7" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
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
          name="more/history"
          options={{
            headerShown: true,
            headerTitle: t('more.history', locale),
            headerBackTitle: t('common.back', locale),
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
          name="more/help"
          options={{
            headerShown: true,
            headerTitle: t('more.help', locale),
            headerBackTitle: t('common.back', locale),
            presentation: 'card',
          }}
        />
      </Stack>
    </UndoProvider>
  )
}
