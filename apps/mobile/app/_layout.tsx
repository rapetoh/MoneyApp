import { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { useAuth } from '../src/hooks/useAuth'
import { useProfile } from '../src/hooks/useProfile'
import { syncManager } from '../src/services/sync/SyncManager'
import { useShortcutHandler } from '../src/hooks/useShortcutHandler'
import { seedDefaultCategories } from '../src/services/seedCategories'
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

    // Seed default categories for new users (no-op if categories already exist)
    if (session?.user?.id) {
      seedDefaultCategories(session.user.id)
    }
  }, [session, loading, segments, router])

  if (loading) return null

  return (
    <>
      <StatusBar style="dark" backgroundColor="#F5F0EB" />
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
      </Stack>
    </>
  )
}
