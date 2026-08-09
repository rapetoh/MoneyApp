/**
 * Regression test for fix-plan item 1.5 ("One recurrence engine"). The
 * Edge Function `supabase/functions/generate-recurring/index.ts` cannot
 * resolve the monorepo's `@voice-expense/shared` workspace package (Deno
 * has no access to `node_modules` workspace resolution and this project
 * configures no import map — see that vendored file's own header), so
 * `supabase/functions/_shared/recurrence.ts` is a hand-kept byte-for-byte
 * port of the subset of `../recurrence.ts` the Edge Function calls. A port
 * with no test coverage of its own is exactly the "copy the change over
 * here" pattern fix-plan 1.5 exists to close (the same defect the three
 * pre-1.5 `nextOccurrence` implementations had) — nothing forced the two
 * copies to be edited together.
 *
 * This file is plain TS with no Deno globals (see its own header comment:
 * "vendored here rather than imported... a byte-for-byte port"), so it
 * imports directly via a relative path rather than needing any Deno
 * shimming.
 *
 * Two layers of protection:
 *  1. The vendored copy's exports (`nextOccurrence`, `occurrencesDue` —
 *     the only two `generate-recurring/index.ts` calls) are run through
 *     the exact Jan-31/DST/dedup fixtures `recurrence.test.ts` asserts
 *     against the real module, with the same expected values. A vendored
 *     copy that silently regressed (e.g. reverting to `setMonth` overflow)
 *     fails here even if nobody thought to update this file.
 *  2. A direct cross-parity sweep runs both modules over one shared table
 *     of cases and diffs their outputs against *each other* — this is
 *     what actually catches drift: the real module changing (a new edge
 *     case, a bug fix) without the port being updated to match, in either
 *     direction, with no fixture value to keep in sync by hand.
 */
import { describe, it, expect } from 'vitest'
import {
  nextOccurrence as sharedNextOccurrence,
  occurrencesDue as sharedOccurrencesDue,
  type RecurrenceInput,
} from '../recurrence'
import {
  nextOccurrence as vendoredNextOccurrence,
  occurrencesDue as vendoredOccurrencesDue,
  type RecurrenceInput as VendoredRecurrenceInput,
} from '../../../../../supabase/functions/_shared/recurrence'

function monthlyRule(overrides: Partial<RecurrenceInput> = {}): RecurrenceInput {
  return {
    frequency: 'monthly',
    interval: 1,
    starts_at: '2026-01-31T14:00:00.000Z',
    ends_at: null,
    ...overrides,
  }
}

describe('vendored copy — month-end clamping (03-F8 / 04-F3 / 06-F22 / 07-F22)', () => {
  it('Jan 31 monthly walks Feb 28 -> Mar 31 -> Apr 30, never Mar 3', () => {
    const rule = monthlyRule()
    const tz = 'UTC'

    const occ1 = vendoredNextOccurrence(rule, null, tz)
    expect(occ1?.occurrenceDate).toBe('2026-01-31')

    const occ2 = vendoredNextOccurrence(rule, occ1!.instant, tz)
    expect(occ2?.occurrenceDate).toBe('2026-02-28')

    const occ3 = vendoredNextOccurrence(rule, occ2!.instant, tz)
    expect(occ3?.occurrenceDate).toBe('2026-03-31')

    const occ4 = vendoredNextOccurrence(rule, occ3!.instant, tz)
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
      const occ = vendoredNextOccurrence(rule, cursor, tz)
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
    const occ1 = vendoredNextOccurrence(rule, rule.starts_at, 'UTC')
    expect(occ1?.occurrenceDate).toBe('2026-11-30')
  })

  it('yearly anchored on 29 Feb clamps to 28 Feb the following (non-leap) year', () => {
    const rule: RecurrenceInput = {
      frequency: 'yearly',
      interval: 1,
      starts_at: '2028-02-29T09:00:00.000Z',
      ends_at: null,
    }
    const occ = vendoredNextOccurrence(rule, rule.starts_at, 'UTC')
    expect(occ?.occurrenceDate).toBe('2029-02-28')
  })

  it('honours interval > 1 in the date math (interval: 3 = every third month)', () => {
    const rule = monthlyRule({ interval: 3, starts_at: '2026-01-31T14:00:00.000Z' })
    const occ = vendoredNextOccurrence(rule, rule.starts_at, 'UTC')
    expect(occ?.occurrenceDate).toBe('2026-04-30')
  })
})

describe('vendored copy — starts_at is the first occurrence (03-F32)', () => {
  it('a rule with last_generated null generates exactly one occurrence dated starts_at', () => {
    const rule: RecurrenceInput = {
      frequency: 'monthly',
      interval: 1,
      starts_at: '2026-08-08T12:00:00.000Z',
      ends_at: null,
    }
    const now = '2026-08-09T12:00:00.000Z'
    const due = vendoredOccurrencesDue({ ...rule, last_generated: null }, now, 'UTC')
    expect(due).toHaveLength(1)
    expect(due[0].occurrenceDate).toBe('2026-08-08')
  })
})

describe('vendored copy — DST (04-F20)', () => {
  it('a weekly 09:00 America/Chicago rule keeps local 09:00 across the March 2026 spring-forward', () => {
    // 2026-03-04 09:00 CST (UTC-6) = 15:00Z. DST starts 2026-03-08.
    const rule: RecurrenceInput = {
      frequency: 'weekly',
      interval: 1,
      starts_at: '2026-03-04T15:00:00.000Z',
      ends_at: null,
    }
    const tz = 'America/Chicago'
    const before = vendoredNextOccurrence(rule, null, tz)!
    const after = vendoredNextOccurrence(rule, before.instant, tz)! // crosses the transition (Mar 11)

    expect(before.instant).toBe('2026-03-04T15:00:00.000Z') // 09:00 CST
    expect(after.instant).toBe('2026-03-11T14:00:00.000Z') // 09:00 CDT
  })

  it("is independent of the host process's ambient TZ — only the `tz` argument matters (04-F2)", () => {
    const rule = monthlyRule()
    const compute = () => vendoredNextOccurrence(rule, rule.starts_at, 'America/Chicago')!.instant

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

describe('vendored copy — the dedup-window rule — local civil day, not UTC day (03-F16 / 04-F21 / 06-F22 / 07-F22)', () => {
  // `localDay` itself isn't exported from the vendored copy (only
  // `nextOccurrence`/`occurrencesDue` are — see its header), so the same
  // civil-day boundary is exercised indirectly through `occurrenceDate`,
  // which `buildOccurrence` derives from exactly that function internally.
  it('two starts_at instants sharing a UTC calendar date can fall on different local days (must not dedupe)', () => {
    const tz = 'Asia/Tokyo' // UTC+9, no DST — isolates the day-boundary effect
    const a = vendoredNextOccurrence(monthlyRule({ starts_at: '2026-04-01T02:00:00.000Z' }), null, tz)! // 2026-04-01 11:00 local
    const b = vendoredNextOccurrence(monthlyRule({ starts_at: '2026-04-01T16:00:00.000Z' }), null, tz)! // 2026-04-02 01:00 local
    expect(a.occurrenceDate).toBe('2026-04-01')
    expect(b.occurrenceDate).toBe('2026-04-02')
    expect(a.occurrenceDate).not.toBe(b.occurrenceDate)
  })

  it('two starts_at instants on different UTC calendar dates can share a local day (must dedupe)', () => {
    const tz = 'Asia/Tokyo'
    const a = vendoredNextOccurrence(monthlyRule({ starts_at: '2026-03-31T16:00:00.000Z' }), null, tz)! // 2026-04-01 01:00 local
    const b = vendoredNextOccurrence(monthlyRule({ starts_at: '2026-04-01T02:00:00.000Z' }), null, tz)! // 2026-04-01 11:00 local
    expect(a.occurrenceDate).toBe('2026-04-01')
    expect(b.occurrenceDate).toBe('2026-04-01')
    expect(a.occurrenceDate).toBe(b.occurrenceDate)
  })
})

describe('vendored copy — occurrencesDue (03-F15 — bounded catch-up in one run)', () => {
  it('a monthly rule six months behind yields six occurrences from a single call', () => {
    const rule = { ...monthlyRule({ starts_at: '2026-01-31T14:00:00.000Z' }), last_generated: null as string | null }
    const now = '2026-07-15T00:00:00.000Z'
    const due = vendoredOccurrencesDue(rule, now, 'UTC')
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
    const due = vendoredOccurrencesDue(rule, '2026-08-09T00:00:00.000Z', 'UTC', 3)
    expect(due).toHaveLength(3)
  })
})

describe('cross-parity — shared and vendored modules agree on every case (the actual drift guard)', () => {
  const cases: Array<{ name: string; rule: RecurrenceInput; after: string | null; tz: string }> = [
    { name: 'Jan 31 monthly, first occurrence', rule: monthlyRule(), after: null, tz: 'UTC' },
    { name: 'Jan 31 monthly, one step (Feb clamp)', rule: monthlyRule(), after: '2026-01-31T14:00:00.000Z', tz: 'UTC' },
    { name: 'Jan 31 monthly, two steps (returns to 31st)', rule: monthlyRule(), after: '2026-02-28T14:00:00.000Z', tz: 'UTC' },
    {
      name: 'quarterly 31 Aug anchor',
      rule: { frequency: 'quarterly', interval: 1, starts_at: '2026-08-31T10:00:00.000Z', ends_at: null },
      after: '2026-08-31T10:00:00.000Z',
      tz: 'UTC',
    },
    {
      name: 'yearly 29 Feb leap anchor',
      rule: { frequency: 'yearly', interval: 1, starts_at: '2028-02-29T09:00:00.000Z', ends_at: null },
      after: '2028-02-29T09:00:00.000Z',
      tz: 'UTC',
    },
    {
      name: 'monthly interval 3',
      rule: monthlyRule({ interval: 3 }),
      after: '2026-01-31T14:00:00.000Z',
      tz: 'UTC',
    },
    {
      // Deliberately *not* a month-end anchor — every other monthly case in
      // this table clamps in both the +0 and +1 day-of-month arithmetic, so
      // an off-by-one in `addMonthsClamped`'s unclamped branch would pass
      // every other case here undetected. Day 15 in a 28-day February has
      // headroom on both sides.
      name: 'monthly, mid-month anchor (day 15, no clamping involved)',
      rule: { frequency: 'monthly', interval: 1, starts_at: '2026-01-15T09:00:00.000Z', ends_at: null },
      after: '2026-01-15T09:00:00.000Z',
      tz: 'UTC',
    },
    {
      name: 'weekly across a DST spring-forward, America/Chicago',
      rule: { frequency: 'weekly', interval: 1, starts_at: '2026-03-04T15:00:00.000Z', ends_at: null },
      after: '2026-03-04T15:00:00.000Z',
      tz: 'America/Chicago',
    },
    {
      name: 'weekly across a month boundary',
      rule: { frequency: 'weekly', interval: 1, starts_at: '2026-01-28T12:00:00.000Z', ends_at: null },
      after: null,
      tz: 'UTC',
    },
    {
      name: 'daily anchor near an Asia/Tokyo civil-day boundary',
      rule: { frequency: 'daily', interval: 1, starts_at: '2026-04-01T16:00:00.000Z', ends_at: null },
      after: null,
      tz: 'Asia/Tokyo',
    },
    {
      name: 'ends_at exhausted returns null on both',
      rule: monthlyRule({ ends_at: '2026-02-01T00:00:00.000Z' }),
      after: '2026-01-31T14:00:00.000Z',
      tz: 'UTC',
    },
  ]

  it.each(cases)('nextOccurrence agrees for: $name', ({ rule, after, tz }) => {
    const fromShared = sharedNextOccurrence(rule, after, tz)
    const fromVendored = vendoredNextOccurrence(rule as VendoredRecurrenceInput, after, tz)
    expect(fromVendored).toEqual(fromShared)
  })

  it('occurrencesDue agrees across a six-months-overdue monthly rule', () => {
    const rule = { ...monthlyRule({ starts_at: '2026-01-31T14:00:00.000Z' }), last_generated: null as string | null }
    const now = '2026-07-15T00:00:00.000Z'
    expect(vendoredOccurrencesDue(rule, now, 'UTC')).toEqual(sharedOccurrencesDue(rule, now, 'UTC'))
  })

  it('occurrencesDue agrees when the limit truncates the run', () => {
    const rule = { ...monthlyRule({ starts_at: '2020-01-31T14:00:00.000Z' }), last_generated: null as string | null }
    expect(vendoredOccurrencesDue(rule, '2026-08-09T00:00:00.000Z', 'UTC', 3)).toEqual(
      sharedOccurrencesDue(rule, '2026-08-09T00:00:00.000Z', 'UTC', 3),
    )
  })
})
