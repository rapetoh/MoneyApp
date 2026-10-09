// JS side of the widget bridge (see ios/MurmurWidgetModule.swift). iOS only;
// a safe no-op anywhere the native module is absent.
import { requireNativeModule } from 'expo-modules-core'
import { Platform } from 'react-native'

type MurmurWidgetNative = { setSnapshot: (json: string | null) => void }

let native: MurmurWidgetNative | null = null
if (Platform.OS === 'ios') {
  try {
    native = requireNativeModule<MurmurWidgetNative>('MurmurWidget')
  } catch {
    native = null
  }
}

/** Publish the widget snapshot; `null` clears it (signed out). */
export function setWidgetSnapshot(json: string | null): void {
  try {
    native?.setSnapshot(json)
  } catch {
    /* noop */
  }
}
