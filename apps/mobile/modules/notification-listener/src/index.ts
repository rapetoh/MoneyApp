import { NativeModulesProxy, EventEmitter, type Subscription } from 'expo-modules-core'
import { Platform } from 'react-native'

export interface NotificationPayload {
  /** Android package name of the source app (e.g. "com.chase.sig.android") */
  packageName: string
  /** Notification title */
  title: string
  /** Notification body text */
  text: string
  /** Parsed payment amount (0 if not a payment notification) */
  amount: number
  /** Currency code detected from symbol (default "USD") */
  currency: string
  /** Merchant name extracted from the text, or empty string */
  merchant: string
  /** Unix timestamp in milliseconds */
  timestamp: number
}

const NativeModule =
  Platform.OS === 'android' ? NativeModulesProxy.NotificationListenerModule : null

const emitter =
  NativeModule ? new EventEmitter(NativeModule as any) : null

/** Returns true if the notification listener permission is granted. Android only. */
export async function isPermissionGranted(): Promise<boolean> {
  if (!NativeModule) return false
  return NativeModule.isPermissionGranted()
}

/** Opens the system Notification Access settings page. Android only. */
export function openPermissionSettings(): void {
  NativeModule?.openPermissionSettings()
}

/**
 * Subscribes to payment notification events from the listener service.
 * The listener only emits events that contain a parseable payment amount.
 */
export function addPaymentNotificationListener(
  listener: (payload: NotificationPayload) => void,
): Subscription {
  if (!emitter) {
    // No-op on iOS — return a dummy subscription
    return { remove: () => {} } as Subscription
  }
  return emitter.addListener('onPaymentNotification', listener)
}
