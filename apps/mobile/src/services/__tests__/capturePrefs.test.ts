/**
 * The currency a background capture uses when the app was not running.
 * Getting this wrong is silent and permanent: the row is written with the
 * wrong currency_code and nothing in the UI says so.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'

let store: string | null = null

vi.mock('expo-file-system', () => {
  class File {
    constructor(..._args: unknown[]) {}
    get exists() {
      return store !== null
    }
    textSync() {
      if (store === null) throw new Error('missing')
      return store
    }
    write(next: string) {
      store = next
    }
    delete() {
      store = null
    }
  }
  return { File, Paths: { document: '/tmp' } }
})

import { rememberCapturePrefs, readCapturePrefs, clearCapturePrefs } from '../capturePrefs'

const CATS = [
  { id: 'c1', name: 'Groceries' },
  { id: 'c2', name: 'Transport' },
] as unknown as Parameters<typeof rememberCapturePrefs>[0]['categories']

beforeEach(() => {
  store = null
})

describe('capturePrefs', () => {
  it('remembers what a later cold start will need', () => {
    rememberCapturePrefs({
      currency: 'XOF',
      locale: 'fr',
      timezone: 'Africa/Abidjan',
      categories: CATS,
    })
    expect(readCapturePrefs()).toEqual({
      currency: 'XOF',
      locale: 'fr',
      timezone: 'Africa/Abidjan',
      categories: CATS,
    })
  })

  it('answers null on a fresh install, so the caller keeps its own default', () => {
    expect(readCapturePrefs()).toBeNull()
  })

  it('survives a corrupt or half-written file', () => {
    store = '{ not json'
    expect(readCapturePrefs()).toBeNull()
    store = JSON.stringify({ locale: 'fr' })
    expect(readCapturePrefs()).toBeNull()
  })

  it('fills in a missing timezone rather than returning nothing', () => {
    store = JSON.stringify({ currency: 'EUR' })
    expect(readCapturePrefs()).toEqual({
      currency: 'EUR',
      locale: 'en',
      timezone: 'UTC',
      categories: [],
    })
  })

  it('refuses to store an empty currency', () => {
    rememberCapturePrefs({ currency: '', locale: 'en', timezone: 'UTC', categories: CATS })
    expect(readCapturePrefs()).toBeNull()
  })

  it('forgets on sign-out, so the next account starts clean', () => {
    rememberCapturePrefs({ currency: 'GBP', locale: 'en', timezone: 'Europe/London', categories: CATS })
    clearCapturePrefs()
    expect(readCapturePrefs()).toBeNull()
  })

  it('keeps the categories a cold capture needs to file under', () => {
    // Without these, every Siri entry made while the app was closed saved
    // uncategorised: categories are fetched, never stored locally.
    rememberCapturePrefs({ currency: 'USD', locale: 'en', timezone: 'UTC', categories: CATS })
    expect(readCapturePrefs()?.categories).toHaveLength(2)
    // A renamed category is worth a rewrite; the same list is not.
    const renamed = [{ id: 'c1', name: 'Food' }, { id: 'c2', name: 'Transport' }] as typeof CATS
    rememberCapturePrefs({ currency: 'USD', locale: 'en', timezone: 'UTC', categories: renamed })
    expect(readCapturePrefs()?.categories[0].name).toBe('Food')
  })

  it('drops junk entries in a hand-edited file', () => {
    store = JSON.stringify({ currency: 'USD', categories: [{ id: 'c1', name: 'Groceries' }, { id: 7 }, null] })
    expect(readCapturePrefs()?.categories).toEqual([{ id: 'c1', name: 'Groceries' }])
  })
})
