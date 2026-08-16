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
      const amount = parseFloat(params.shortcut_amount ?? '')
      if (!isNaN(amount) && amount > 0) {
        // Shortcut params are URL input — exactly as untrusted as a model's
        // output. Same typed-boundary validation as before the redesign
        // (fix-plan 1.7): an unrecognised currency/payment method falls
        // back honestly instead of riding into ParsedExpense.
        const shortcutCurrency = params.shortcut_currency?.trim().toUpperCase()
        const currency = shortcutCurrency && ISO_4217_CODES.has(shortcutCurrency) ? shortcutCurrency : userCurrency
        const paymentMethod = PAYMENT_METHOD_VALUES.includes(params.shortcut_payment_method as PaymentMethod)
          ? (params.shortcut_payment_method as PaymentMethod)
          : 'digital_wallet'
        presentParsed(
          {
            amount,
            currency,
            // A Shortcut has no notion of intent beyond "log this" —
            // always a plain expense; direction derives from flow_type.
            direction: deriveDirectionFromFlowType('expense'),
            flow_type: 'expense',
            merchant: params.shortcut_merchant || null,
            merchant_domain: null,
            note: null,
            category_suggestion: null,
            payment_method: paymentMethod,
            transacted_at: new Date().toISOString(),
            confidence: 1.0,
            needs_clarification: false,
            clarifying_question: null,
            is_recurring_suggestion: false,
            recurring_frequency_suggestion: null,
          },
          'shortcut',
        )
        router.replace('/(tabs)')
        return
      }

      if (params.tab === 'manual') {
        router.replace('/transaction/new')
        return
      }

      router.replace('/(tabs)')
      openVoice()
       
    }, [params.shortcut_amount, params.tab, params._nonce, userCurrency]),
  )

  return <View style={{ flex: 1, backgroundColor: Colors.background }} />
}
