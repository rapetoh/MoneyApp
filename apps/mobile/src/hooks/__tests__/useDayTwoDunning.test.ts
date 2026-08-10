/**
 * Regression test for the "once per launch" half of the duplicate-
 * notification fix: `useDayTwoDunning`'s mount-time "ensure scheduled"
 * check must not re-fire every time the tabs layout remounts within one
 * app launch (sign-out/sign-in, Fast Refresh) — the same re-arm-on-
 * remount shape audit `07-F15` documents for `app/_layout.tsx`'s
 * launch-time services. See the module doc comment in
 * `../useDayTwoDunning.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import type { Transaction } from '@voice-expense/shared'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  ensureDayTwoPermissionAndSchedule: vi.fn(async () => 'granted' as const),
  rescheduleDayTwo: vi.fn(async () => undefined),
  cancelDayTwo: vi.fn(async () => undefined),
}))

vi.mock('../../services/dayTwoDunning', () => mocks)

const { useDayTwoDunning, __resetDayTwoDunningLaunchGuardForTests } = await import('../useDayTwoDunning')

function txn(id: string): Transaction {
  return { id, is_deleted: false } as Transaction
}

function Harness({ transactions }: { transactions: Transaction[] }) {
  useDayTwoDunning('en', transactions)
  return null
}

let renderer: TestRenderer.ReactTestRenderer | null = null

afterEach(() => {
  act(() => {
    renderer?.unmount()
  })
  renderer = null
  vi.clearAllMocks()
  __resetDayTwoDunningLaunchGuardForTests()
})

describe('useDayTwoDunning — mount-time ensure runs once per launch, not once per mount', () => {
  it('mounting with existing transactions reschedules once', () => {
    act(() => {
      renderer = TestRenderer.create(React.createElement(Harness, { transactions: [txn('a'), txn('b')] }))
    })

    expect(mocks.rescheduleDayTwo).toHaveBeenCalledTimes(1)
  })

  it('a second mount within the same launch (tabs layout remounting) does not reschedule again', () => {
    act(() => {
      renderer = TestRenderer.create(React.createElement(Harness, { transactions: [txn('a')] }))
    })
    expect(mocks.rescheduleDayTwo).toHaveBeenCalledTimes(1)

    act(() => {
      renderer!.unmount()
    })

    // Simulates the tabs layout remounting (sign-out/sign-in, Fast
    // Refresh) — a fresh component instance, fresh `seenLengthRef`, same
    // process lifetime.
    act(() => {
      renderer = TestRenderer.create(React.createElement(Harness, { transactions: [txn('a'), txn('b')] }))
    })

    expect(mocks.rescheduleDayTwo).toHaveBeenCalledTimes(1)
  })

  it('mounting with zero transactions does not reschedule at all', () => {
    act(() => {
      renderer = TestRenderer.create(React.createElement(Harness, { transactions: [] }))
    })

    expect(mocks.rescheduleDayTwo).not.toHaveBeenCalled()
  })

  it('a genuinely new transaction logged after mount still reschedules (not suppressed by the launch guard)', () => {
    act(() => {
      renderer = TestRenderer.create(React.createElement(Harness, { transactions: [] }))
    })
    expect(mocks.rescheduleDayTwo).not.toHaveBeenCalled()
    expect(mocks.ensureDayTwoPermissionAndSchedule).not.toHaveBeenCalled()

    act(() => {
      renderer!.update(React.createElement(Harness, { transactions: [txn('a')] }))
    })

    // First-ever transaction *within this mount* goes through the
    // permission-ensure path, not the launch-guarded mount check — the
    // launch guard only covers the best-effort re-arm on cold start.
    expect(mocks.ensureDayTwoPermissionAndSchedule).toHaveBeenCalledTimes(1)
  })
})
