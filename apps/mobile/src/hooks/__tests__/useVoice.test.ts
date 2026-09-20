/**
 * Regression test for the owner report of Sep 19, 2026 (build 49): tapping
 * the mic on Today, saying nothing, and getting the result sheet filled
 * with the PREVIOUS capture, at the amount the user had already corrected
 * by hand. Saving it wrote a second, wrong transaction.
 *
 * Cause: `startListening` cleared `finalTranscriptRef` but not
 * `lastInterimRef`, and the 'end' handler falls back to the interim text
 * when a recording produced no final result. So a silent capture re-parsed
 * the previous utterance, which the parse cache answered instantly.
 *
 * This drives the real hook through the same sequence.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import type { ParsedExpense } from '@voice-expense/shared'

declare global {
   
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const listeners = vi.hoisted(() => new Map<string, (event: unknown) => void>())
const mocks = vi.hoisted(() => ({
  parseExpense: vi.fn(async () => ({ amount: 5, merchant: 'Lidl' }) as unknown as ParsedExpense),
  start: vi.fn(),
  stop: vi.fn(),
}))

vi.mock('react-native', () => ({
  Animated: {
    Value: class {
      setValue() {}
    },
  },
}))

vi.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    getPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
    requestPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
    start: mocks.start,
    stop: mocks.stop,
    abort: () => {},
  },
  useSpeechRecognitionEvent: (name: string, cb: (event: unknown) => void) => {
    listeners.set(name, cb)
  },
}))

vi.mock('@voice-expense/ai', () => ({ parseExpense: mocks.parseExpense }))
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}))
vi.mock('../useApiUrl', () => ({ getApiUrl: async () => 'https://example.test' }))
vi.mock('@voice-expense/shared', () => ({ localDay: () => '2026-09-19' }))
vi.mock('../../services/haptics', () => ({ haptic: { tap() {}, success() {}, warning() {} } }))
vi.mock('../../services/analytics', () => ({ track: () => {} }))

const { useVoice } = await import('../useVoice')

type Api = ReturnType<typeof useVoice>
let api: Api

function Harness() {
  api = useVoice('XOF', ['Groceries'], 'fr', 'Africa/Lome')
  return null
}

function emit(event: string, payload: unknown = {}) {
  listeners.get(event)?.(payload)
}

function interim(text: string) {
  emit('result', { results: [{ transcript: text, isFinal: false }] })
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  listeners.clear()
  act(() => {
    TestRenderer.create(React.createElement(Harness))
  })
})

describe('useVoice: a silent capture never replays the previous one', () => {
  it('parses what was said, then reports nothing heard on a silent retry', async () => {
    // First capture: the user speaks, iOS delivers interim text only.
    await act(async () => {
      await api.startListening('fr-FR')
    })
    act(() => interim('cinq mille à Lidl'))
    await act(async () => {
      emit('end')
    })
    await flush()
    expect(mocks.parseExpense).toHaveBeenCalledTimes(1)
    expect(api.state).toBe('done')

    // The sheet is dismissed after saving.
    act(() => api.reset())
    expect(api.parsedExpense).toBeNull()

    // Second capture: the user says nothing at all.
    await act(async () => {
      await api.startListening('fr-FR')
    })
    await act(async () => {
      emit('end')
    })
    await flush()

    // No second parse, no stale result, and a visible "nothing heard".
    expect(mocks.parseExpense).toHaveBeenCalledTimes(1)
    expect(api.parsedExpense).toBeNull()
    expect(api.state).toBe('error')
    expect(api.errorMessage).toBe('no-transcript')
  })

  it('an injected capture (scan, Shortcut, Wallet) drops any leftover speech', async () => {
    await act(async () => {
      await api.startListening('fr-FR')
    })
    act(() => interim('cinq mille à Lidl'))

    act(() => api.injectParsed({ amount: 12.5, merchant: 'Chipotle' } as unknown as ParsedExpense))
    expect(api.state).toBe('done')

    // Ending the aborted recognition must not parse the old words.
    await act(async () => {
      emit('end')
    })
    await flush()
    expect(mocks.parseExpense).not.toHaveBeenCalled()
    expect(api.parsedExpense).toMatchObject({ merchant: 'Chipotle' })
  })
})

describe('useVoice: the silence watchdog', () => {
  it('gives the user time to think, then stops on its own', async () => {
    vi.useFakeTimers()
    try {
      await act(async () => {
        await api.startListening('fr-FR')
      })
      // Still listening while they decide what to say.
      act(() => {
        vi.advanceTimersByTime(4000)
      })
      expect(mocks.stop).not.toHaveBeenCalled()
      // Long silence: capture closes itself rather than hanging open.
      act(() => {
        vi.advanceTimersByTime(6000)
      })
      expect(mocks.stop).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('once words are heard, a short pause ends the capture', async () => {
    vi.useFakeTimers()
    try {
      await act(async () => {
        await api.startListening('fr-FR')
      })
      act(() => interim('cinq mille à Lidl'))
      act(() => {
        vi.advanceTimersByTime(1500)
      })
      expect(mocks.stop).not.toHaveBeenCalled()
      act(() => {
        vi.advanceTimersByTime(1500)
      })
      expect(mocks.stop).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
