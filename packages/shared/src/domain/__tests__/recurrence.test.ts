import { describe, it, expect } from 'vitest'
import {
  nextOccurrence,
  occurrencesDue,
  occurrencesInWindow,
  chargesInWindow,
  firstOccurrenceOnOrAfter,
  monthlyEquivalent,
  annualEquivalent,
  findRuleForTransaction,
  buildRuleAnchor,
  type RecurrenceInput,
} from '../recurrence'
import { localDay } from '../../utils/period'

function monthlyRule(overrides: Partial<RecurrenceInput> = {}): RecurrenceInput {
  return {
    frequency: 'monthly',
    interval: 1,
    starts_at: '2026-01-31T14:00:00.000Z',
    ends_at: null,
    ...overrides,
  }
}

describe('nextOccurrence — month-end clamping (03-F8 / 04-F3 / 06-F22 / 07-F22)', () => {
  it('Jan 31 monthly walks Feb 28 -> Mar 31 -> Apr 30, never Mar 3', () => {
    const rule = monthlyRule()
    const tz = 'UTC'

    const occ1 = nextOccurrence(rule, null, tz) // starts_at is the first occurrence (03-F32)
    expect(occ1?.occurrenceDate).toBe('2026-01-31')

    const occ2 = nextOccurrence(rule, occ1!.instant, tz)
    expect(occ2?.occurrenceDate).toBe('2026-02-28')

    const occ3 = nextOccurrence(rule, occ2!.instant, tz)
    // The defect this replaces: `new Date(2026,0,31).setMonth(1)` yields
    // 3 March, and the drift is permanent from there. The anchor day
    // (31, from starts_at) must be re-applied every cycle rather than
    // re-derived from the previous, already-clamped occurrence — this
    // is what lets the rule *return* to the 31st.
    expect(occ3?.occurrenceDate).toBe('2026-03-31')

    const occ4 = nextOccurrence(rule, occ3!.instant, tz)
    expect(occ4?.occurrenceDate).toBe('2026-04-30')
  })

  it('six-occurrence walk matches the audit 06-F22 regression test exactly', () => {
    const rule = monthlyRule()
    const tz = 'UTC'
    const expected = [
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
    ]
    let cursor: string | null = null
    const got: string[] = []
    for (let i = 0; i < expected.length; i++) {
      const occ = nextOccurrence(rule, cursor, tz)
      got.push(occ!.occurrenceDate)
      cursor = occ!.instant
    }
    expect(got).toEqual(expected)
  })

  it('quarterly (31 Aug anchor) skips no month and clamps the same way', () => {
    const rule: RecurrenceInput = {
      frequency: 'quarterly',
      interval: 1,
      starts_at: '2026-08-31T10:00:00.000Z',
      ends_at: null,
    }
    const occ1 = nextOccurrence(rule, rule.starts_at, 'UTC') // Nov 30 (30 days in Nov)
    expect(occ1?.occurrenceDate).toBe('2026-11-30')
  })

  it('yearly anchored on 29 Feb clamps to 28 Feb the following (non-leap) year', () => {
    const rule: RecurrenceInput = {
      frequency: 'yearly',
      interval: 1,
      starts_at: '2028-02-29T09:00:00.000Z',
      ends_at: null,
    }
    const occ = nextOccurrence(rule, rule.starts_at, 'UTC')
    expect(occ?.occurrenceDate).toBe('2029-02-28')
  })

  it('honours interval > 1 in the date math (interval: 3 = every third month)', () => {
    const rule = monthlyRule({ interval: 3, starts_at: '2026-01-31T14:00:00.000Z' })
    const occ = nextOccurrence(rule, rule.starts_at, 'UTC')
    expect(occ?.occurrenceDate).toBe('2026-04-30')
  })
})

describe('nextOccurrence — starts_at is the first occurrence (03-F32)', () => {
  it('a rule with last_generated null generates exactly one occurrence dated starts_at', () => {
    const rule: RecurrenceInput = {
      frequency: 'monthly',
      interval: 1,
      starts_at: '2026-08-08T12:00:00.000Z', // "yesterday" relative to the `now` below
      ends_at: null,
    }
    const now = '2026-08-09T12:00:00.000Z'
    const due = occurrencesDue({ ...rule, last_generated: null }, now, 'UTC')
    expect(due).toHaveLength(1)
    expect(due[0].occurrenceDate).toBe('2026-08-08')
  })
})

describe('nextOccurrence — DST (04-F20)', () => {
  it('a weekly 09:00 America/Chicago rule keeps local 09:00 across the March 2026 spring-forward', () => {
    // 2026-03-04 09:00 CST (UTC-6) = 15:00Z. DST starts 2026-03-08.
    const rule: RecurrenceInput = {
      frequency: 'weekly',
      interval: 1,
      starts_at: '2026-03-04T15:00:00.000Z',
      ends_at: null,
    }
    const tz = 'America/Chicago'
    const before = nextOccurrence(rule, null, tz)!
    const after = nextOccurrence(rule, before.instant, tz)! // crosses the transition (Mar 11)

    expect(before.instant).toBe('2026-03-04T15:00:00.000Z') // 09:00 CST
    // 09:00 CDT (UTC-5) on the far side of the transition — the local
    // wall-clock hour is pinned; the UTC instant is the one that shifts.
    expect(after.instant).toBe('2026-03-11T14:00:00.000Z')
  })

  it('is independent of the host process\'s ambient TZ — only the `tz` argument matters (04-F2)', () => {
    const rule = monthlyRule()
    const compute = () => nextOccurrence(rule, rule.starts_at, 'America/Chicago')!.instant

    const original = process.env.TZ
    try {
      process.env.TZ = 'UTC'
      const underUtc = compute()
      process.env.TZ = 'America/Chicago'
      const underChicago = compute()
      expect(underUtc).toBe(underChicago)
    } finally {
      process.env.TZ = original
    }
  })
})

describe('nextOccurrence — weekly across a month boundary', () => {
  it('steps by exactly 7 days regardless of the month it lands in', () => {
    const rule: RecurrenceInput = {
      frequency: 'weekly',
      interval: 1,
      starts_at: '2026-01-28T12:00:00.000Z', // a Wednesday
      ends_at: null,
    }
    const occ1 = nextOccurrence(rule, null, 'UTC')!
    const occ2 = nextOccurrence(rule, occ1.instant, 'UTC')!
    expect(occ1.occurrenceDate).toBe('2026-01-28')
    expect(occ2.occurrenceDate).toBe('2026-02-04') // crosses into February
  })
})

describe('the dedup-window rule — local civil day, not UTC day (03-F16 / 04-F21 / 06-F22 / 07-F22)', () => {
  it('two instants sharing a UTC calendar date can fall on different local days (must not dedupe)', () => {
    const tz = 'Asia/Tokyo' // UTC+9, no DST — isolates the day-boundary effect
    const a = localDay('2026-04-01T02:00:00Z', tz) // 2026-04-01 11:00 local
    const b = localDay('2026-04-01T16:00:00Z', tz) // 2026-04-02 01:00 local
    expect(a).toBe('2026-04-01')
    expect(b).toBe('2026-04-02')
    expect(a).not.toBe(b)
  })

  it('two instants on different UTC calendar dates can share a local day (must dedupe)', () => {
    const tz = 'Asia/Tokyo'
    const a = localDay('2026-03-31T16:00:00Z', tz) // 2026-04-01 01:00 local
    const b = localDay('2026-04-01T02:00:00Z', tz) // 2026-04-01 11:00 local
    expect(a).toBe('2026-04-01')
    expect(b).toBe('2026-04-01')
    expect(a).toBe(b)
  })
})

describe('occurrencesDue (03-F15 — bounded catch-up in one run)', () => {
  it('a monthly rule six months behind yields six occurrences from a single call', () => {
    const rule = { ...monthlyRule({ starts_at: '2026-01-31T14:00:00.000Z' }), last_generated: null as string | null }
    const now = '2026-07-15T00:00:00.000Z'
    const due = occurrencesDue(rule, now, 'UTC')
    expect(due.map((o) => o.occurrenceDate)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
    ])
  })

  it('respects the limit rather than running away', () => {
    const rule = { ...monthlyRule({ starts_at: '2020-01-31T14:00:00.000Z' }), last_generated: null as string | null }
    const due = occurrencesDue(rule, '2026-08-09T00:00:00.000Z', 'UTC', 3)
    expect(due).toHaveLength(3)
  })
})

describe('firstOccurrenceOnOrAfter / occurrencesInWindow (03-F25 — no iteration-cap starvation)', () => {
  it('fast-forwards a long-overdue daily rule straight to the window', () => {
    const rule: RecurrenceInput = {
      frequency: 'daily',
      interval: 1,
      starts_at: '2025-01-01T08:00:00.000Z', // over a year before the window
      ends_at: null,
    }
    const start = '2026-08-01T00:00:00.000Z'
    const endExclusive = '2026-08-31T00:00:00.000Z'
    const occs = occurrencesInWindow(rule, start, endExclusive, 'UTC')
    expect(occs).toHaveLength(30) // Aug 1 .. Aug 30 inclusive at 08:00Z
    expect(occs[0].occurrenceDate).toBe('2026-08-01')
    expect(occs[occs.length - 1].occurrenceDate).toBe('2026-08-30')
  })

  it('firstOccurrenceOnOrAfter returns starts_at itself when it is already >= the target', () => {
    const rule = monthlyRule({ starts_at: '2026-09-01T00:00:00.000Z' })
    const occ = firstOccurrenceOnOrAfter(rule, '2026-08-01T00:00:00.000Z', 'UTC')
    expect(occ?.occurrenceDate).toBe('2026-09-01')
  })

  it('returns null once ends_at has passed', () => {
    const rule = monthlyRule({ ends_at: '2026-02-01T00:00:00.000Z' })
    const occ = firstOccurrenceOnOrAfter(rule, '2026-06-01T00:00:00.000Z', 'UTC')
    expect(occ).toBeNull()
  })
})

describe('chargesInWindow', () => {
  it('flattens and sorts occurrences across multiple rules by instant', () => {
    const rentRule = { id: 'rent', amount: 1500, ...monthlyRule({ starts_at: '2026-08-01T13:00:00.000Z' }) }
    const netflixRule = {
      id: 'netflix',
      amount: 9.99,
      frequency: 'monthly' as const,
      interval: 1,
      starts_at: '2026-08-15T13:00:00.000Z',
      ends_at: null,
    }
    const out = chargesInWindow(
      [rentRule, netflixRule],
      '2026-08-01T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z',
      'UTC',
    )
    expect(out.map((o) => o.rule.id)).toEqual(['rent', 'netflix'])
    expect(out[0].occurrence.occurrenceDate).toBe('2026-08-01')
    expect(out[1].occurrence.occurrenceDate).toBe('2026-08-15')
  })
})

describe('monthlyEquivalent / annualEquivalent (03-F23 — honour interval)', () => {
  it('a monthly rule with interval 3 and amount 90 has a monthly equivalent of 30', () => {
    expect(monthlyEquivalent({ frequency: 'monthly', interval: 3, amount: 90 })).toBe(30)
  })

  it('a yearly $120 rule equals a $10/mo equivalent', () => {
    expect(monthlyEquivalent({ frequency: 'yearly', interval: 1, amount: 120 })).toBe(10)
  })

  it('annualEquivalent is twelve times the monthly figure', () => {
    const rule = { frequency: 'quarterly' as const, interval: 1, amount: 300 }
    expect(annualEquivalent(rule)).toBeCloseTo(monthlyEquivalent(rule) * 12, 10)
  })
})

describe('findRuleForTransaction (fix-plan 2.2/3.3 — the "looked up by name/template only" bug)', () => {
  it('finds a generated occurrence via recurring_rule_id even though template_txn_id points elsewhere', () => {
    const rules = [{ id: 'rule-1', template_txn_id: 'original-txn' }]
    const generatedOccurrence = { id: 'occurrence-2', recurring_rule_id: 'rule-1' }
    expect(findRuleForTransaction(generatedOccurrence, rules)).toEqual(rules[0])
  })

  it('falls back to template_txn_id for a legacy row with no recurring_rule_id', () => {
    const rules = [{ id: 'rule-1', template_txn_id: 'original-txn' }]
    const legacyTemplate = { id: 'original-txn', recurring_rule_id: null }
    expect(findRuleForTransaction(legacyTemplate, rules)).toEqual(rules[0])
  })

  it('prefers recurring_rule_id over a template_txn_id match on a different rule', () => {
    const rules = [
      { id: 'rule-1', template_txn_id: 'txn-a' },
      { id: 'rule-2', template_txn_id: 'txn-b' },
    ]
    // txn-a's own id happens to equal another rule's template_txn_id — the
    // explicit recurring_rule_id link must win over the name/template
    // coincidence.
    const txn = { id: 'txn-a', recurring_rule_id: 'rule-2' }
    expect(findRuleForTransaction(txn, rules)?.id).toBe('rule-2')
  })

  it('returns null when neither lookup matches', () => {
    const rules = [{ id: 'rule-1', template_txn_id: 'txn-a' }]
    expect(findRuleForTransaction({ id: 'txn-z', recurring_rule_id: null }, rules)).toBeNull()
  })
})

describe('buildRuleAnchor', () => {
  it('derives anchor_day/anchor_weekday/anchor_time from the civil date in tz', () => {
    // 2026-08-08 is a Saturday.
    const anchor = buildRuleAnchor('2026-08-08T14:30:05.000Z', 'UTC')
    expect(anchor.starts_at).toBe('2026-08-08T14:30:05.000Z')
    expect(anchor.anchor_day).toBe(8)
    expect(anchor.anchor_weekday).toBe(6) // ISO Saturday = 6
    expect(anchor.anchor_time).toBe('14:30:05')
  })
})

