import { describe, it, expect } from 'vitest'
import { sumInProfileCurrency, isFxPending, aggAmount } from '../fx'

describe('sumInProfileCurrency — pending-aware flat sum (07-F8 / 06-F34 / 05-F12)', () => {
  it('sums non-null amounts and reports the pending count separately', () => {
    const result = sumInProfileCurrency([
      { amount_in_profile_currency: 50 },
      { amount_in_profile_currency: 42 },
      { amount_in_profile_currency: null },
    ])
    expect(result.total).toBe(92)
    expect(result.pendingCount).toBe(1)
  })

  it('never lets a pending row collapse into the total as 0', () => {
    const withPending = sumInProfileCurrency([
      { amount_in_profile_currency: 100 },
      { amount_in_profile_currency: null },
    ])
    const withoutPendingRow = sumInProfileCurrency([{ amount_in_profile_currency: 100 }])
    expect(withPending.total).toBe(withoutPendingRow.total)
  })

  it('accumulates in integer cents so a long series does not drift', () => {
    const rows = Array.from({ length: 1000 }, () => ({ amount_in_profile_currency: 0.1 }))
    expect(sumInProfileCurrency(rows).total).toBe(100)
  })
})

describe('isFxPending / aggAmount — unchanged accessors kept for un-migrated call sites', () => {
  it('isFxPending is true only for null', () => {
    expect(isFxPending({ amount_in_profile_currency: null })).toBe(true)
    expect(isFxPending({ amount_in_profile_currency: 0 })).toBe(false)
  })

  it('aggAmount still defaults a pending row to 0 (the defect summarize()/sumInProfileCurrency() fix)', () => {
    expect(aggAmount({ amount_in_profile_currency: null })).toBe(0)
    expect(aggAmount({ amount_in_profile_currency: 12.5 })).toBe(12.5)
  })
})
