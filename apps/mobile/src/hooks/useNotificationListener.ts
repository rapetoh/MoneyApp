import { useEffect, useState, useCallback } from 'react'
import { Platform } from 'react-native'
import { NativeModulesProxy, EventEmitter, type Subscription } from 'expo-modules-core'
import type { ParsedExpense } from '@voice-expense/shared'

/**
 * Android-only native module bindings — null on iOS so Metro can bundle without error.
 * The actual module (Kotlin) is compiled in during EAS Android build via expo-modules autolinking.
 */
const NativeModule =
  Platform.OS === 'android'
    ? (NativeModulesProxy.NotificationListenerModule ?? null)
    : null

const emitter = NativeModule ? new EventEmitter(NativeModule as any) : null

interface NotificationPayload {
  packageName: string
  title: string
  text: string
  amount: number
  currency: string
  merchant: string
  timestamp: number
}

async function isPermissionGranted(): Promise<boolean> {
  if (!NativeModule) return false
  return NativeModule.isPermissionGranted()
}

function openPermissionSettings(): void {
  NativeModule?.openPermissionSettings()
}

function addPaymentNotificationListener(
  listener: (payload: NotificationPayload) => void,
): Subscription {
  if (!emitter) return { remove: () => {} } as Subscription
  return emitter.addListener('onPaymentNotification', listener)
}

export interface UseNotificationListenerReturn {
  /** Android only — whether notification access is currently granted */
  permissionGranted: boolean
  /** Re-check permission (call after user returns from system settings) */
  recheckPermission: () => Promise<void>
  /** Open system Notification Access settings so user can grant permission */
  requestPermission: () => void
}

/**
 * Wraps the Android NotificationListenerService.
 * On iOS, all values are no-ops (permissionGranted = false, functions do nothing).
 *
 * @param onPayment - Called whenever a payment notification is detected.
 *   Receives a pre-built ParsedExpense ready to pass to voice.injectParsed().
 */
export function useNotificationListener(
  onPayment: (parsed: ParsedExpense) => void,
): UseNotificationListenerReturn {
  const [permissionGranted, setPermissionGranted] = useState(false)

  const recheckPermission = useCallback(async () => {
    if (Platform.OS !== 'android') return
    const granted = await isPermissionGranted()
    setPermissionGranted(granted)
  }, [])

  useEffect(() => {
    recheckPermission()
  }, [recheckPermission])

  useEffect(() => {
    if (Platform.OS !== 'android' || !permissionGranted) return

    const sub = addPaymentNotificationListener((payload: NotificationPayload) => {
      if (payload.amount <= 0) return

      const parsed: ParsedExpense = {
        amount: payload.amount,
        currency: payload.currency,
        direction: 'debit',
        merchant: payload.merchant || null,
        merchant_domain: null,
        category_suggestion: null,
        payment_method: 'digital_wallet',
        transacted_at: new Date(payload.timestamp).toISOString(),
        confidence: 0.9,
        needs_clarification: !payload.merchant,
        clarifying_question: !payload.merchant ? 'What was this payment for?' : null,
      }

      onPayment(parsed)
    })

    return () => sub.remove()
  }, [permissionGranted, onPayment])

  const requestPermission = useCallback(() => {
    if (Platform.OS !== 'android') return
    openPermissionSettings()
  }, [])

  return { permissionGranted, recheckPermission, requestPermission }
}
