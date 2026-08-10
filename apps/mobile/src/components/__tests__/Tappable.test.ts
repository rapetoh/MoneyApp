/**
 * Regression test for fix-plan item 4.1 (docs/audit-2026-08-08/01-mobile-
 * ui-and-layout.md F26): `<Tappable>` is the dev-only guard that stops a
 * new sub-44pt control from being added without anyone noticing — it
 * measures its own rendered box post-layout, adds whatever `hitSlop` was
 * supplied, and `console.assert`s the effective target is at least 44pt.
 * 4.1's own "Done when" is literally this: "a rendered-`Pressable` walk
 * asserts `height + hitSlop >= 44`." This drives `onLayout` the way RN
 * would after a real render and checks the assertion fires (or doesn't)
 * on the right side of that boundary.
 *
 * Same node-only `react-native` mock shape as `BottomSheet.test.ts` — see
 * that file's class-doc comment for why this package's tests can't import
 * RN unmocked.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
// `__DEV__` is declared by RN's own ambient types (hence no redeclaration
// here, unlike the flag above) but never set by a plain `vitest` run.
;(globalThis as { __DEV__?: boolean }).__DEV__ = true

vi.mock('react-native', () => {
  function Pressable(props: { children?: React.ReactNode }) {
    return props.children ?? null
  }
  return { Pressable }
})

const { Pressable } = (await import('react-native')) as unknown as { Pressable: React.ComponentType<any> }
const { Tappable } = await import('../Tappable')

function layoutEvent(height: number) {
  return { nativeEvent: { layout: { height, width: 100, x: 0, y: 0 } } }
}

let renderer: TestRenderer.ReactTestRenderer | null = null

afterEach(() => {
  act(() => {
    renderer?.unmount()
  })
  renderer = null
  vi.restoreAllMocks()
})

describe('Tappable — 44pt dev assertion (fix-plan 4.1 / audit 01-F26)', () => {
  it('warns when the effective target (height + hitSlop) is under 44pt', () => {
    const assertSpy = vi.spyOn(console, 'assert').mockImplementation(() => {})
    act(() => {
      renderer = TestRenderer.create(React.createElement(Tappable, { hitSlop: 8 }))
    })
    // SettingsList's real case: 26pt drawn height + hitSlop 10 = 36pt < 44.
    act(() => {
      renderer!.root.findByType(Pressable).props.onLayout(layoutEvent(26))
    })
    expect(assertSpy).toHaveBeenCalledWith(false, expect.stringContaining('below the 44pt minimum'))
  })

  it('does not warn once hitSlop closes the gap to >= 44pt', () => {
    const assertSpy = vi.spyOn(console, 'assert').mockImplementation(() => {})
    act(() => {
      renderer = TestRenderer.create(React.createElement(Tappable, { hitSlop: 10 }))
    })
    // 36pt height + hitSlop 10 (applied to both edges, per Tappable's own
    // vertical-hitSlop math) = 46pt >= 44.
    act(() => {
      renderer!.root.findByType(Pressable).props.onLayout(layoutEvent(36))
    })
    expect(assertSpy).toHaveBeenCalledWith(true, expect.any(String))
  })

  it('still forwards the layout event to a caller-supplied onLayout', () => {
    const onLayout = vi.fn()
    vi.spyOn(console, 'assert').mockImplementation(() => {})
    act(() => {
      renderer = TestRenderer.create(React.createElement(Tappable, { hitSlop: 8, onLayout }))
    })
    const event = layoutEvent(44)
    act(() => {
      renderer!.root.findByType(Pressable).props.onLayout(event)
    })
    expect(onLayout).toHaveBeenCalledWith(event)
  })
})
