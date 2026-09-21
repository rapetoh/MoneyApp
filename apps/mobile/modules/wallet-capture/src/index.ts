// JS side of the Apple Pay capture bridge (see ios/WalletCaptureModule.swift).
// iOS only; every export is a safe no-op elsewhere or when the native
// module is absent (e.g. a build without the module).
import { requireNativeModule } from 'expo-modules-core'
import { Platform } from 'react-native'

type Subscription = { remove: () => void }
// Minimal shape of the native module we rely on (expo-modules-core's
// NativeModule extends EventEmitter, so addListener is provided).
type WalletCaptureNative = {
  reportDone: (id: string, dialog: string | null) => void
  addListener: (name: 'onCaptureAppended', fn: (e: { id: string }) => void) => Subscription
}

let native: WalletCaptureNative | null = null
if (Platform.OS === 'ios') {
  try {
    native = requireNativeModule<WalletCaptureNative>('WalletCapture')
  } catch {
    native = null
  }
}

/** True when the native bridge is present (iOS build with the module). */
export const walletCaptureBridgeAvailable = native != null

/** Fires when the App Intent has queued a capture — drain now. */
export function addCaptureAppendedListener(listener: (e: { id: string }) => void): Subscription {
  if (!native) return { remove: () => {} }
  return native.addListener('onCaptureAppended', listener)
}

/**
 * Tell the waiting App Intent that this capture is handled.
 *
 * `dialog` is what Siri says out loud (Sep 20, 2026). A Wallet capture
 * passes nothing: it confirms with a notification, not a voice. A Siri
 * entry passes the saved amount and merchant, already localised by the
 * app's own i18n, so the spoken sentence matches the row on Today.
 */
export function reportCaptureDone(id: string, dialog?: string | null): void {
  try {
    native?.reportDone(id, dialog ?? null)
  } catch {
    /* noop */
  }
}
