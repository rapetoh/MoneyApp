import { useCallback } from 'react'
import { View } from 'react-native'
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useVoiceSession } from '../../src/hooks/useVoiceSession'
import { Colors } from '../../src/theme'
import { ISO_4217_CODES, PAYMENT_METHOD_VALUES, deriveDirectionFromFlowType } from '@voice-expense/ai'
import type { PaymentMethod } from '@voice-expense/shared'

/**
 * Bridge route — the Record screen itself is gone (voice redesign,
 * docs/voice redesign): the mic FAB opens the in-place capture overlay
 * (14a) via a custom tabBarButton, and manual entry is the Quick entry
 * modal at /transaction/new. This route stays registered only so every
 * pre-redesign link keeps working:
 *
 *   - voiceexpense://shortcut?... — resolved by Expo Router to
 *     app/shortcut.tsx, which redirects here with shortcut_* params
 *     (validated in src/services/shortcutLink.ts; the param contract is
 *     unchanged, so existing iOS Shortcuts keep working); the parsed
 *     expense goes to the shared result sheet.
 *   - /(tabs)/record?tab=manual — the old "type instead" target →
 *     Quick entry.
 *   - /(tabs)/record bare — old FAB semantics → voice overlay over Today.
 */
export default function RecordBridge() {
  const router = useRouter()
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const { openVoice, presentParsed } = useVoiceSession()

  const params = useLocalSearchParams<{
    shortcut_amount?: string
    shortcut_merchant?: string
    shortcut_currency?: string
    shortcut_payment_method?: string
    tab?: string
    _nonce?: string
  }>()

  const userCurrency = profile?.currency_code ?? 'USD'

  useFocusEffect(
    useCallback(() => {
      // Shortcut params no longer land here: app/shortcut.tsx enqueues the
      // capture for WalletCaptureDrain (silent save, Aug 17 2026).
      if (params.tab === 'manual') {
        router.replace('/transaction/new')
        return
      }

      router.replace('/(tabs)')
      openVoice()
       
    }, [params.tab, params._nonce]),
  )

  return <View style={{ flex: 1, backgroundColor: Colors.background }} />
}
