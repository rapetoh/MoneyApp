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
import { useSyncExternalStore } from 'react'
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
/** How far the record FAB rises above the pill's top edge (its
 *  `marginTop: -10` in the tabs layout) — content must clear that too. */
export const TAB_BAR_FAB_OVERHANG = 10
/** Breathing room between the last row and the bar / FAB. */
export const TAB_BAR_CLEARANCE_GAP = 12

// The pill uses `minHeight: TAB_BAR_HEIGHT` and grows with its icon +
// label + padding (≈ 80pt at default type, more at large Dynamic Type), so
// the constant under-reported it and the last row of every tab list sat
// behind the bar (owner screenshot Aug 16: "See all 13 transactions" half
// hidden). The tabs layout reports the bar's real measured height here
// (from the bar background's onLayout); screens subscribe to it.
let measuredTabBarHeight = 0
const listeners = new Set<() => void>()
export function reportTabBarHeight(h: number): void {
  if (!Number.isFinite(h) || h <= 0 || Math.abs(h - measuredTabBarHeight) < 0.5) return
  measuredTabBarHeight = h
  for (const l of listeners) l()
}
function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
const getSnapshot = () => measuredTabBarHeight

export function useTabBarClearance(): number {
  const insets = useSafeAreaInsets()
  const measured = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const barHeight = Math.max(TAB_BAR_HEIGHT, measured)
  return barHeight + TAB_BAR_BOTTOM_OFFSET + insets.bottom + TAB_BAR_FAB_OVERHANG + TAB_BAR_CLEARANCE_GAP
}
