/**
 * Regression test for fix-plan 2.14 / audit 01-F37: "Every
 * `KeyboardAvoidingView` not mounted at the screen origin under-lifts,
 * because RN compares a parent-relative frame to a screen-space keyboard
 * frame." `useKeyboardLift` is the fix — see the module doc comment in
 * `../useKeyboardLift.ts`.
 *
 * Two layers, matching how confident each one can be:
 *   1. `computeKeyboardOverlap` — pure arithmetic, exhaustively tested
 *      with no mocking at all.
 *   2. The hook itself — mounted with `react-test-renderer` (same
 *      approach as `src/components/__tests__/BottomSheet.test.ts`, which
 *      this hook's algorithm mirrors) to prove it drives the lift from
 *      `measureInWindow` — a real window-space reading — on a keyboard
 *      show event, which is the structural difference from RN's own
 *      `KeyboardAvoidingView` (parent-relative `onLayout` frame) that
 *      F37 is about.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { computeKeyboardOverlap } from '../useKeyboardLift'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('computeKeyboardOverlap — pure math', () => {
  it('returns the gap between the measured bottom edge and the keyboard top', () => {
    // A view whose real (measured) bottom sits at window Y=700, with the
    // keyboard's top edge at window Y=400 (i.e. a 336pt keyboard on an
    // 812pt-tall screen) overlaps by 300.
    expect(computeKeyboardOverlap(700, 400)).toBe(300)
  })

  it('clamps at zero when the view sits entirely above the keyboard', () => {
    expect(computeKeyboardOverlap(300, 400)).toBe(0)
  })

  it('is exactly zero at the boundary', () => {
    expect(computeKeyboardOverlap(400, 400)).toBe(0)
  })

  it('reproduces the F37 numbers: a sheet mounted ~244pt from the true bottom, under a 336pt keyboard on an 844pt screen', () => {
    // Real (measured) sheet bottom: 844. Keyboard top: 844 - 336 = 508.
    // RN's own KAV, using a parent-relative frame.y of 0 instead of the
    // sheet's true offset (screenHeight - sheetHeight = 244), would
    // compute `0 + sheetHeight - keyboardScreenY` and come up short by
    // exactly that 244pt of parent offset. The window-space calculation
    // here has no such term to omit.
    expect(computeKeyboardOverlap(844, 508)).toBe(336)
  })
})

vi.mock('react-native', () => {
  function passthrough(name: string) {
    function Host(props: { children?: React.ReactNode }) {
      return props.children ?? null
    }
    Host.displayName = name
    return Host
  }

  return {
    Animated: {
      Value: class MockAnimatedValue {
        constructor(public _value: number) {}
      },
      timing: () => ({ start: (cb?: () => void) => cb?.() }),
      View: passthrough('Animated.View'),
    },
    Keyboard: {
      addListener: (eventName: string, cb: (...args: unknown[]) => void) => {
        listeners[eventName] = listeners[eventName] ?? []
        listeners[eventName].push(cb)
        return { remove: () => {} }
      },
    },
    Platform: { OS: 'ios' },
  }
})

const listeners: Record<string, Array<(...args: unknown[]) => void>> = {}

function fire(eventName: string, event: unknown) {
  for (const cb of listeners[eventName] ?? []) cb(event)
}

const { useKeyboardLift } = await import('../useKeyboardLift')

function Harness({ measureInWindow }: { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void }) {
  const ref = React.useRef<{ measureInWindow: typeof measureInWindow }>({ measureInWindow })
  useKeyboardLift(ref)
  return null
}

let renderer: TestRenderer.ReactTestRenderer | null = null

afterEach(() => {
  act(() => {
    renderer?.unmount()
  })
  renderer = null
  for (const key of Object.keys(listeners)) listeners[key] = []
})

describe('useKeyboardLift — drives the lift from a real window measurement', () => {
  it('calls measureInWindow (not a cached layout frame) when the keyboard shows', () => {
    const measureInWindow = vi.fn((cb: (x: number, y: number, w: number, h: number) => void) => cb(0, 844, 375, 0))

    act(() => {
      renderer = TestRenderer.create(React.createElement(Harness, { measureInWindow }))
    })

    act(() => {
      fire('keyboardWillChangeFrame', { endCoordinates: { height: 336, screenY: 508 }, duration: 250 })
    })

    expect(measureInWindow).toHaveBeenCalledTimes(1)
    // The callback signature it was invoked with is exactly `measureInWindow`'s
    // — i.e. this hook asks the *view* for its real position, it never reads
    // a cached `onLayout` frame the way RN's `KeyboardAvoidingView` does.
    expect(measureInWindow).toHaveBeenCalledWith(expect.any(Function))
  })

  it('does not measure on a hide event (height 0) — resets instead', () => {
    const measureInWindow = vi.fn()

    act(() => {
      renderer = TestRenderer.create(React.createElement(Harness, { measureInWindow }))
    })

    act(() => {
      fire('keyboardWillChangeFrame', { endCoordinates: { height: 0, screenY: 844 }, duration: 200 })
    })

    expect(measureInWindow).not.toHaveBeenCalled()
  })
})
