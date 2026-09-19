import * as Haptics from 'expo-haptics'

/**
 * The app's haptic vocabulary (first-run audit M5, Sep 19 2026). Three
 * feelings only, so they stay meaningful: a light tap when the mic starts
 * or stops, a success when something is saved, a warning when capture
 * can't proceed. Failures are ignored (no Taptic Engine, simulator).
 */
export const haptic = {
  tap: () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
  },
  success: () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
  },
  warning: () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
  },
}
