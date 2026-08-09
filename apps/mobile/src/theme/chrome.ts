// Single source of truth for the floating tab bar's geometry.
//
// Before this module: the bar's own style (`app/(tabs)/_layout.tsx`) hard-
// coded a device-independent `bottom: 14`, and 14 separate screens each
// guessed a `paddingBottom` to clear it (`140`, `120`, `110`… all picked by
// eye against one specific phone). `UndoSnackbar` re-derived the same two
// constants a third time. `useSafeAreaInsets` was called zero times in the
// app. See docs/audit-2026-08-08/01-mobile-ui-and-layout.md F12/F13/F33.
//
// This module is the fix for the tab bar's *own* geometry (consumed here,
// in `app/(tabs)/_layout.tsx`) and the primitive every clearance site is
// meant to consume instead of a literal. Sweeping the 14 existing literal
// call sites onto `useTabBarClearance()` is Stage 2 adoption work — this
// module just has to exist and be correct first.
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/** Height of the pill itself. Unrelated to the safe area — this is the
 *  bar's fixed visual size, set once here instead of copy-pasted. */
export const TAB_BAR_HEIGHT = 68

/** Gap between the tab bar's bottom edge and the bottom safe-area inset.
 *  NOT the distance to the physical screen edge — that distance is
 *  `TAB_BAR_BOTTOM_OFFSET + insets.bottom`, which is exactly what a
 *  device with no home indicator (`insets.bottom === 0`) and a device
 *  with one (`insets.bottom === 34`) need to differ by. */
export const TAB_BAR_BOTTOM_OFFSET = 8

/**
 * Total vertical space a scroll container under the tab bar must clear:
 * the bar's height, its offset above the safe area, and the safe area
 * itself. Screens with no tab bar (Stack-only routes) don't call this —
 * per F13's fix they use `insets.bottom + 24` instead, since there is no
 * bar height or bar offset to add.
 */
export function useTabBarClearance(): number {
  const insets = useSafeAreaInsets()
  return TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_OFFSET + insets.bottom
}
