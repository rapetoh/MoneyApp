/**
 * Regression tests for fix-plan 3.4 / audit 07-F10, 08-F20, 02-F34: the
 * Android notification listener built a complete `ParsedExpense` and
 * handed it to `() => {}` — the only call site in the repo. Two things
 * are asserted here:
 *
 *   1. A synthetic native payment notification, once permission is
 *      granted, reaches `onPayment` as a validated `ParsedExpense` (the
 *      shape `voice.injectParsed` / the root layout's confirm sheet
 *      expects) — not discarded.
 *   2. Calling the hook with no `onPayment` (Settings' permission-only use)
 *      never attaches a native listener — exactly one subscription can
 *      ever be live at a time (see the hook's own doc comment).
 *
 * `react-native` and `expo-modules-core` are mocked; `Platform.OS` is set
 * before the hook module is imported, since the module computes its
 * Android-only native bindings once at import time.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
}))

type Listener = (payload: unknown) => void
let registeredListeners: Listener[] = []
let isPermissionGrantedMock = vi.fn(async () => true)
const openPermissionSettingsMock = vi.fn()

vi.mock('expo-modules-core', () => ({
  NativeModulesProxy: {
    NotificationListenerModule: {
      isPermissionGranted: () => isPermissionGrantedMock(),
      openPermissionSettings: () => openPermissionSettingsMock(),
    },
  },
  EventEmitter: class MockEventEmitter {
    addListener(_name: string, fn: Listener) {
      registeredListeners.push(fn)
      return { remove: () => {
        registeredListeners = registeredListeners.filter((l) => l !== fn)
      } }
    }
  },
}))

function fireNotification(payload: unknown) {
  for (const listener of registeredListeners) listener(payload)
}

const { useNotificationListener } = await import('../useNotificationListener')

function Harness({ onPayment }: { onPayment?: (parsed: unknown) => void }) {
  useNotificationListener(onPayment as any)
  return null
}

let renderer: TestRenderer.ReactTestRenderer | null = null

afterEach(() => {
  act(() => {
    renderer?.unmount()
  })
  renderer = null
  registeredListeners = []
  isPermissionGrantedMock = vi.fn(async () => true)
  openPermissionSettingsMock.mockClear()
})

describe('useNotificationListener — payload delivery', () => {
  it('delivers a synthetic payment notification to onPayment as a validated ParsedExpense', async () => {
    const onPayment = vi.fn()

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness, { onPayment }))
      // Let the permission-check effect's promise resolve.
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(registeredListeners.length).toBe(1)

    act(() => {
      fireNotification({
        packageName: 'com.chase.mobile',
        title: 'Payment sent',
        text: 'You paid Starbucks $4.50',
        amount: 4.5,
        currency: 'USD',
        merchant: 'Starbucks',
        timestamp: Date.UTC(2026, 0, 15, 12, 0, 0),
      })
    })

    expect(onPayment).toHaveBeenCalledTimes(1)
    const parsed = onPayment.mock.calls[0][0]
    expect(parsed).toMatchObject({
      amount: 4.5,
      currency: 'USD',
      merchant: 'Starbucks',
      direction: 'debit',
      flow_type: 'expense',
      needs_clarification: false,
    })
  })

  it('drops a zero/negative amount before it ever reaches validation', async () => {
    const onPayment = vi.fn()

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness, { onPayment }))
      await Promise.resolve()
      await Promise.resolve()
    })

    act(() => {
      fireNotification({
        packageName: 'com.example',
        title: '',
        text: '',
        amount: 0,
        currency: 'USD',
        merchant: '',
        timestamp: Date.now(),
      })
    })

    expect(onPayment).not.toHaveBeenCalled()
  })

  it('drops a payload with an invalid currency rather than forwarding a half-formed expense', async () => {
    const onPayment = vi.fn()

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness, { onPayment }))
      await Promise.resolve()
      await Promise.resolve()
    })

    act(() => {
      fireNotification({
        packageName: 'com.example',
        title: '',
        text: '',
        amount: 12,
        currency: 'NOT-A-CODE',
        merchant: 'Some Bank App',
        timestamp: Date.now(),
      })
    })

    expect(onPayment).not.toHaveBeenCalled()
  })

  it('marks a payload with no merchant as needing clarification', async () => {
    const onPayment = vi.fn()

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness, { onPayment }))
      await Promise.resolve()
      await Promise.resolve()
    })

    act(() => {
      fireNotification({
        packageName: 'com.example',
        title: '',
        text: '',
        amount: 20,
        currency: 'USD',
        merchant: '',
        timestamp: Date.now(),
      })
    })

    expect(onPayment).toHaveBeenCalledTimes(1)
    expect(onPayment.mock.calls[0][0]).toMatchObject({
      needs_clarification: true,
      merchant: null,
    })
  })
})

describe('useNotificationListener — no second listener for a permission-only caller', () => {
  it('attaches no native subscription when onPayment is omitted (Settings\' use)', async () => {
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness, {}))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(registeredListeners.length).toBe(0)
  })
})
