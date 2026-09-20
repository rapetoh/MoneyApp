import { describe, expect, it } from 'vitest'
import { describePlus, isPlusFromProfile, isTrialActive, trialDaysLeft } from '../plus'

const now = new Date('2026-09-20T12:00:00Z')
const inThreeDays = '2026-09-23T12:00:00Z'
const yesterday = '2026-09-19T12:00:00Z'

describe('the reverse trial', () => {
  it('unlocks Plus while it runs, and stops when it ends', () => {
    expect(isPlusFromProfile({ trial_ends_at: inThreeDays }, now)).toBe(true)
    expect(isPlusFromProfile({ trial_ends_at: yesterday }, now)).toBe(false)
    expect(isPlusFromProfile({ trial_ends_at: null }, now)).toBe(false)
  })

  it('a real subscription outlives the trial', () => {
    expect(isPlusFromProfile({ plus_status: 'active', trial_ends_at: yesterday }, now)).toBe(true)
  })

  it('counts the days the user has left', () => {
    expect(trialDaysLeft({ trial_ends_at: inThreeDays }, now)).toBe(3)
    expect(trialDaysLeft({ trial_ends_at: yesterday }, now)).toBe(0)
    expect(isTrialActive({ trial_ends_at: yesterday }, now)).toBe(false)
  })

  it('Settings calls it a trial, not a subscription', () => {
    const d = describePlus({ plus_status: null, trial_ends_at: '2099-01-01T00:00:00Z' })
    expect(d.kind).toBe('trial')
    if (d.kind === 'trial') expect(d.storeBacked).toBe(false)
  })

  it('a lapsed subscription with no trial is free', () => {
    expect(describePlus({ plus_status: 'lapsed', trial_ends_at: yesterday }).kind).toBe('lapsed')
  })
})
