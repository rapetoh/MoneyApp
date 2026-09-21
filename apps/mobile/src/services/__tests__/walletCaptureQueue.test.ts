/**
 * The queue file is the contract between two native producers and one
 * JavaScript reader. Swift writes the lines (native/ios/WalletCapture.swift
 * for Apple Pay, native/ios/SiriLogExpense.swift for Siri), so these
 * fixtures are copies of exactly what each one appends: a line shape that
 * drifts here is a purchase that disappears.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'

let contents: string | null = null

vi.mock('expo-file-system', () => {
  class File {
    constructor(..._args: unknown[]) {}
    get exists() {
      return contents !== null
    }
    textSync() {
      if (contents === null) throw new Error('missing')
      return contents
    }
    delete() {
      contents = null
    }
    write(next: string) {
      contents = next
    }
  }
  return { File, Paths: { document: '/tmp' } }
})

import { takeQueuedCaptures } from '../walletCapture'

beforeEach(() => {
  contents = null
})

const APPLE_PAY_LINE = JSON.stringify({
  id: 'A1',
  amount: '$2.11',
  merchant: 'Three Square Market',
  currency: '',
  source: 'shortcut',
  captured_at: '2026-08-17T05:12:00Z',
})

const SIRI_LINE = JSON.stringify({
  id: 'S1',
  kind: 'phrase',
  phrase: 'five dollars at Walmart',
  amount: '',
  merchant: '',
  currency: '',
  source: 'shortcut',
  captured_at: '2026-09-20T17:04:00Z',
})

describe('takeQueuedCaptures', () => {
  it('reads a Siri sentence and an Apple Pay tap from the same file', () => {
    contents = `${APPLE_PAY_LINE}\n${SIRI_LINE}\n`
    const out = takeQueuedCaptures()
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ id: 'A1', kind: 'wallet', phrase: '', amount: '$2.11' })
    expect(out[1]).toMatchObject({
      id: 'S1',
      kind: 'phrase',
      phrase: 'five dollars at Walmart',
      amount: '',
    })
  })

  it('treats a line written by an older build as a Wallet capture', () => {
    // Builds before Sep 20 2026 wrote no `kind`. Those entries are all
    // Apple Pay taps and must keep saving as such after an update.
    contents = `${APPLE_PAY_LINE}\n`
    expect(takeQueuedCaptures()[0].kind).toBe('wallet')
  })

  it('drops a spoken line with nothing in it, and survives a corrupt one', () => {
    contents = [
      JSON.stringify({ id: 'S2', kind: 'phrase', phrase: '   ', source: 'shortcut' }),
      '{not json',
      SIRI_LINE,
    ].join('\n')
    const out = takeQueuedCaptures()
    expect(out.map((e) => e.id)).toEqual(['S2', 'S1'])
    // A blank-but-present phrase still queues (the drain answers "I did
    // not catch an amount"); only a missing one is dropped.
    contents = [JSON.stringify({ id: 'S3', kind: 'phrase', source: 'shortcut' }), SIRI_LINE].join('\n')
    expect(takeQueuedCaptures().map((e) => e.id)).toEqual(['S1'])
  })

  it('clears the file so one sentence is never filed twice', () => {
    contents = `${SIRI_LINE}\n`
    expect(takeQueuedCaptures()).toHaveLength(1)
    expect(takeQueuedCaptures()).toHaveLength(0)
  })
})
