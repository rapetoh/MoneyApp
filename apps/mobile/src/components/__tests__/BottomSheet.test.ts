/**
 * Regression test for fix-plan item 1.8 (docs/audit-2026-08-08/01-mobile-
 * ui-and-layout.md F14): "8 of 11 `<Modal>`s have no `onRequestClose` —
 * the Android back button is inert inside them." `BottomSheet` is the
 * shared primitive both `VoiceConfirmModal` and every other sheet in the
 * app are meant to render through, wiring the backdrop press, the header
 * Cancel and `<Modal onRequestClose>` to the same `onClose` (per its own
 * doc comment) — this is what "fire the hardware back button and assert
 * `visible` flips to false" (F14's own regression-test suggestion) is
 * actually asking to hold down, since RN's `Modal` routes the Android
 * back button through nothing else but `onRequestClose`.
 *
 * `vitest.config.mts` scopes this package's suite to `src/**\/*.test.ts`
 * and a `node` environment specifically because RN components can't be
 * imported unmocked outside Metro (see `typography.fonts.test.ts` and
 * every `vi.mock('react-native', ...)` in `services/sync/__tests__` for
 * the two ways this codebase already works around that). This file adds a
 * third: a minimal `react-native`/`react-native-safe-area-context` mock
 * (host-passthrough components, no native modules) plus `react-test-
 * renderer`, so `BottomSheet` itself — not just its surrounding source —
 * can be mounted and driven for the one behavior this class of bug is
 * about: does closing it actually close it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

// React only skips its "not configured to support act(...)" warning when
// this flag is set — normally done by a testing-library setup file, which
// this workspace doesn't have (see the class-doc comment above). Setting
// it here is the documented escape hatch for a bare `react-test-renderer`
// harness: https://react.dev/warnings/react-test-renderer.
declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('react-native', () => {
  // A component "passthrough" enough to be a valid host for `findByType`
  // (a stable function reference, one per name) while rendering nothing
  // but its own children — no native view, no native module, which is
  // the whole point: this test drives `BottomSheet`'s own close-wiring
  // logic, not RN's real Modal/Pressable rendering.
  function passthrough(name: string) {
    function Host(props: { children?: React.ReactNode }) {
      return props.children ?? null
    }
    Host.displayName = name
    return Host
  }

  return {
    Animated: {
      // BottomSheet's mount exercises `new Animated.Value`, `.setValue`,
      // `Animated.timing` / `Animated.parallel` (`.start`, `.stop`),
      // `Animated.add` and `Animated.multiply` — no keyboard event fires
      // in this test, so these never need to produce a real animated
      // value, only avoid throwing. `parallel(...).start(cb)` completes
      // synchronously with `finished: true`, which is what lets the exit
      // choreography (sheet slides down, dim fades, *then* the Modal
      // unmounts) collapse to "onClose ⇒ Modal.visible === false" here.
      Value: class MockAnimatedValue {
        constructor(public _value: number) {}
        setValue(v: number) {
          this._value = v
        }
      },
      timing: () => ({ start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }), stop: () => {} }),
      parallel: () => ({ start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }), stop: () => {} }),
      add: (a: unknown) => a,
      multiply: (a: unknown) => a,
      View: passthrough('Animated.View'),
    },
    Easing: {
      bezier: () => (t: number) => t,
      inOut: (f: (t: number) => number) => f,
      cubic: (t: number) => t,
    },
    Keyboard: {
      addListener: () => ({ remove: () => {} }),
    },
    Modal: passthrough('Modal'),
    Platform: { OS: 'ios', select: (obj: Record<string, unknown>) => obj.ios ?? obj.default },
    Pressable: passthrough('Pressable'),
    ScrollView: passthrough('ScrollView'),
    StyleSheet: { create: (styles: unknown) => styles },
    Text: passthrough('Text'),
    View: passthrough('View'),
    useWindowDimensions: () => ({ width: 375, height: 667 }),
  }
})

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}))

const { Modal } = (await import('react-native')) as unknown as { Modal: React.ComponentType<any> }
const { Pressable } = (await import('react-native')) as unknown as { Pressable: React.ComponentType<any> }
const { BottomSheet } = await import('../BottomSheet')

/** Mirrors how every real call site owns `visible` — BottomSheet itself
 *  is controlled, it never closes itself. */
function Harness({ initialVisible = true }: { initialVisible?: boolean }) {
  const [visible, setVisible] = React.useState(initialVisible)
  return React.createElement(BottomSheet, {
    visible,
    onClose: () => setVisible(false),
    title: 'Test sheet',
    testID: 'test-sheet',
    children: 'Body',
  })
}

let renderer: TestRenderer.ReactTestRenderer | null = null

afterEach(() => {
  act(() => {
    renderer?.unmount()
  })
  renderer = null
})

describe('BottomSheet — onClose wiring (F14 / F18)', () => {
  it('renders the Modal visible with onRequestClose wired to onClose', () => {
    act(() => {
      renderer = TestRenderer.create(React.createElement(Harness))
    })
    const modal = renderer!.root.findByType(Modal)
    expect(modal.props.visible).toBe(true)
    expect(typeof modal.props.onRequestClose).toBe('function')
  })

  it('firing Modal.onRequestClose (the Android hardware back button) closes the sheet', () => {
    act(() => {
      renderer = TestRenderer.create(React.createElement(Harness))
    })
    expect(renderer!.root.findByType(Modal).props.visible).toBe(true)

    act(() => {
      renderer!.root.findByType(Modal).props.onRequestClose()
    })

    expect(renderer!.root.findByType(Modal).props.visible).toBe(false)
  })

  it('pressing the backdrop closes the sheet', () => {
    act(() => {
      renderer = TestRenderer.create(React.createElement(Harness))
    })
    // The backdrop is the outermost Pressable (wraps the whole sheet and
    // stops nothing); the sheet body's own Pressable — the second one —
    // stops propagation instead, so it must not also close on press.
    const backdrop = renderer!.root.findAllByType(Pressable)[0]

    act(() => {
      backdrop.props.onPress()
    })

    expect(renderer!.root.findByType(Modal).props.visible).toBe(false)
  })

  it('pressing the header Cancel closes the sheet, same onClose as the other two routes', () => {
    act(() => {
      renderer = TestRenderer.create(React.createElement(Harness))
    })
    const cancel = renderer!.root.findByProps({ children: 'Cancel' })

    act(() => {
      cancel.parent!.props.onPress()
    })

    expect(renderer!.root.findByType(Modal).props.visible).toBe(false)
  })
})
