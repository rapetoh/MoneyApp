import { useEffect, useRef } from 'react'
import { Animated, Keyboard, Platform, type KeyboardEvent } from 'react-native'

/**
 * Correct keyboard-avoidance for a view that is not mounted at the true
 * window origin — under a native header, inside a `presentation: 'modal'`
 * card, or any other ancestor that shifts it away from `(0, 0)`.
 *
 * React Native's own `KeyboardAvoidingView` computes its lift as
 * `frame.y + frame.height - keyboardScreenY`, where `frame` comes from
 * `onLayout` and is **parent-relative**, while `keyboardScreenY` is a true
 * window-space coordinate. The subtraction is only meaningful when the KAV
 * happens to be mounted at the screen origin — anywhere else it under-lifts
 * by exactly that ancestor's own offset. See
 * `docs/audit-2026-08-08/01-mobile-ui-and-layout.md` F37, whose named
 * example is `transaction/edit.tsx`: a `KeyboardAvoidingView` mounted below
 * a native header inside a `presentation: 'modal'` card, short by the
 * header + card offset.
 *
 * This hook sidesteps the mismatch instead of guessing an offset (the
 * `keyboardVerticalOffset` patch-stacking F37 explicitly rejects): on
 * every keyboard frame change it measures the target view's real on-screen
 * position via `measureInWindow` and computes the overlap against the
 * keyboard's own window-space `screenY`, so the lift is correct regardless
 * of how deep the view is nested. Mirrors the approach
 * `src/components/BottomSheet.tsx` already uses for the same reason.
 *
 * Returns an `Animated.Value` — 0 while the keyboard is hidden, the pixel
 * overlap while it's shown. Deliberately *not* native-driven (`useNativeDriver:
 * false`), so callers can apply it to whichever non-transform style
 * property fits their layout (a `marginBottom` spacer that shrinks a
 * ScrollView-plus-pinned-footer column, a `height` spacer, `translateY` for
 * a bottom-anchored sheet, ...) without the "mixed native/JS driver on one
 * Animated.Value" crash that comes from touching a native-driven value with
 * a JS-driven style.
 */
/**
 * The overlap math itself, isolated and exported for direct testing —
 * this one-line clamp is the entire fix over RN's own `frame.y +
 * frame.height - keyboardScreenY`. The difference is never in the
 * arithmetic; it's in where `measuredBottomY` comes from (a real
 * `measureInWindow` window-space reading here, a parent-relative
 * `onLayout` frame in RN's `KeyboardAvoidingView`).
 */
export function computeKeyboardOverlap(measuredBottomY: number, keyboardScreenY: number): number {
  return Math.max(measuredBottomY - keyboardScreenY, 0)
}

export function useKeyboardLift(targetRef: React.RefObject<{ measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null>, active = true): Animated.Value {
  const lift = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!active) return

    const liftToOverlap = (keyboardScreenY: number, duration: number) => {
      const node = targetRef.current
      if (!node) return
      node.measureInWindow((_x, y, _width, height) => {
        const overlap = computeKeyboardOverlap(y + height, keyboardScreenY)
        Animated.timing(lift, {
          toValue: overlap,
          duration: Math.max(duration, 1),
          useNativeDriver: false,
        }).start()
      })
    }

    const resetLift = (duration: number) => {
      Animated.timing(lift, {
        toValue: 0,
        duration: Math.max(duration, 1),
        useNativeDriver: false,
      }).start()
    }

    // iOS: `keyboardWillChangeFrame` fires for show, hide, and any frame
    // change (e.g. QuickType bar toggling) — the height tells show from
    // hide. Android has no "will" phase and no reliable frame event, so it
    // falls back to `keyboardDidShow`/`keyboardDidHide` (post-animation,
    // but Android's own keyboard transition has no comparable JS hook).
    const showEventName = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow'
    const hideEventName = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'

    const showSub = Keyboard.addListener(showEventName as 'keyboardDidShow', (e: KeyboardEvent) => {
      if (e.endCoordinates.height <= 0) {
        resetLift(e.duration ?? 200)
        return
      }
      liftToOverlap(e.endCoordinates.screenY, e.duration ?? 220)
    })
    const hideSub = Keyboard.addListener(hideEventName as 'keyboardDidHide', (e: KeyboardEvent) => {
      resetLift(e?.duration ?? 200)
    })

    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [active, lift, targetRef])

  return lift
}
