import { Easing } from 'react-native'

/**
 * Motion language for every surface Murmur presents *itself* — the sheets
 * and overlays that aren't native navigator transitions (those come from
 * react-native-screens and already match the platform).
 *
 * One vocabulary, so a bottom sheet, the voice overlay and the result
 * sheet all move like parts of the same product:
 *
 *   • Enter: content decelerates in (a fast start, a soft landing — the
 *     curve UIKit's sheet presentation uses); the dim behind it *fades*
 *     in over a slightly shorter time. The dim never slides. A dim that
 *     travels with the sheet was the "dark layer being pulled up and
 *     down" the owner flagged on Aug 16 2026 (RN `<Modal
 *     animationType="slide">` animates the whole modal view — backdrop
 *     included).
 *   • Exit: content accelerates out, dim fades out, and the layer stays
 *     mounted until both finish — nothing is ever removed mid-frame.
 *
 * Every animation runs on the native driver (opacity / transform only).
 */
export const Motion = {
  /** Sheet / overlay entrance. */
  enterMs: 400,
  /** Backdrop fade-in — lands a beat before the content so the room is
   *  already dimmed when the sheet settles. */
  backdropInMs: 280,
  /** Sheet / overlay exit. Shorter than enter, as on iOS. */
  exitMs: 260,
  backdropOutMs: 240,
  /** Decelerating "settle" — cubic-bezier(0.22, 1, 0.36, 1). */
  easeOut: Easing.bezier(0.22, 1, 0.36, 1),
  /** Accelerating "leave" — cubic-bezier(0.4, 0, 1, 1). */
  easeIn: Easing.bezier(0.4, 0, 1, 1),
  /** Symmetric — for fades that both begin and end on screen. */
  easeInOut: Easing.inOut(Easing.cubic),
} as const
