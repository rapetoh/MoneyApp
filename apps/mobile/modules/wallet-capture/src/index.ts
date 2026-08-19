// JS side of the Apple Pay capture bridge (see ios/WalletCaptureModule.swift).
// iOS only; every export is a safe no-op elsewhere or when the native
// module is absent (e.g. a build without the module).
import { requireNativeModule } from 'expo-modules-core'
import { Platform } from 'react-native'

type Subscription = { remove: () => void }
// Minimal shape of the native module we rely on (expo-modules-core's
// NativeModule extends EventEmitter, so addListener is provided).
type WalletCaptureNative = {
  reportDone: (id: string) => void
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

/** Tell the waiting App Intent that this capture is handled. */
export function reportCaptureDone(id: string): void {
  try {
    native?.reportDone(id)
  } catch {
    /* noop */
  }
}
