/**
 * The notification engine's tests.
 *
 * Two things are being protected here, and they fail in different ways:
 *
 *  - `planNotifications` producing a claim that is not true. A budget
 *    alert that fires at 60%, a "bill lands tomorrow" for a bill that
 *    already cleared. These cost the notification permission itself, and
 *    the permission does not come back.
 *  - `govern` letting more through than it promised. The ceiling is the
 *    only thing standing between 37 possible messages and an uninstall.
 */
import { describe, it, expect } from 'vitest'
import {
  planNotifications,
  govern,
  inQuietHours,
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationCandidate,
  type NotificationPlanInput,
  type NotificationPlusState,
  type GovernorState,
} from '../notifications'

const TZ = 'America/New_York'
const NOW = '2026-09-15T18:00:00.000Z' // Tuesday, 14:00 in New York

const NO_PLUS: NotificationPlusState = {
  plus_status: 'free',
  plus_period_type: null,
  plus_expires_at: null,
  plus_will_renew: null,
  plus_billing_issue_at: null,
  plus_grace_until: null,
}

function txn(over: Partial<NotificationPlanInput['transactions'][number]> = {}) {
  return {
    amount_in_profile_currency: 20,
    direction: 'debit' as const,
    transacted_at: '2026-09-10T15:00:00.000Z',
    category_name: 'Groceries',
    ...over,
  } as NotificationPlanInput['transactions'][number]
}

function input(over: Partial<NotificationPlanInput> = {}): NotificationPlanInput {
  return {
    nowUtc: NOW,
    timeZone: TZ,
    locale: 'en',
    currency: 'USD',
    monthlyIncome: 4000,
    transactions: [],
    rules: [],
    budgets: [],
    plus: NO_PLUS,
    lastLoggedAt: NOW,
    ...over,
  }
}

const kinds = (cs: NotificationCandidate[]) => cs.map((c) => c.kind).sort()

// ── money ────────────────────────────────────────────────────────────────

describe('money family', () => {
  it('raises a billing issue and quotes the grace deadline', () => {
    const out = planNotifications(
      input({
        plus: {
          ...NO_PLUS,
          plus_status: 'active',
          plus_period_type: 'normal',
          plus_billing_issue_at: '2026-09-14T00:00:00.000Z',
          plus_grace_until: '2026-09-21T00:00:00.000Z',
        },
      }),
    )
    const c = out.find((x) => x.kind === 'billing_issue')
    expect(c).toBeDefined()
    expect(c!.transactional).toBe(true)
    expect(c!.urgency).toBe('time-sensitive')
    // The whole point of storing the grace date separately: the message
    // can say how long they have.
    expect(c!.body).toMatch(/\d+ more days/)
  })

  it('keys the billing issue to the incident, so a card that stays broken does not nag', () => {
    const plus = {
      ...NO_PLUS,
      plus_status: 'active' as const,
      plus_billing_issue_at: '2026-09-14T00:00:00.000Z',
      plus_grace_until: '2026-09-21T00:00:00.000Z',
    }
    const a = planNotifications(input({ plus })).find((x) => x.kind === 'billing_issue')!
    const b = planNotifications(input({ plus, nowUtc: '2026-09-16T18:00:00.000Z' })).find(
      (x) => x.kind === 'billing_issue',
    )!
    expect(a.dedupeKey).toBe(b.dedupeKey)
  })

  it('warns two days before a trial converts', () => {
    const out = planNotifications(
      input({
        plus: {
          ...NO_PLUS,
          plus_status: 'active',
          plus_period_type: 'trial',
          plus_expires_at: '2026-09-17T00:00:00.000Z',
          plus_will_renew: true,
        },
      }),
    )
    expect(kinds(out)).toContain('trial_ending')
  })

  it('does not warn about a trial that is still a week out', () => {
    const out = planNotifications(
      input({
        plus: {
          ...NO_PLUS,
          plus_status: 'active',
          plus_period_type: 'trial',
          plus_expires_at: '2026-09-25T00:00:00.000Z',
          plus_will_renew: true,
        },
      }),
    )
    expect(kinds(out)).not.toContain('trial_ending')
  })

  it('tells someone who already turned auto renew off that nothing will be charged', () => {
    const out = planNotifications(
      input({
        plus: {
          ...NO_PLUS,
          plus_status: 'active',
          plus_period_type: 'trial',
          plus_expires_at: '2026-09-17T00:00:00.000Z',
          plus_will_renew: false,
        },
      }),
    )
    const c = out.find((x) => x.kind === 'trial_ending')!
    expect(c.body).toMatch(/nothing will be charged/i)
  })

  it('never blames a card when the user simply cancelled', () => {
    // plus_will_renew false with no billing issue recorded: a deliberate
    // cancellation. Saying "your payment did not go through" here is the
    // exact mistake storing the signal separately exists to prevent.
    const out = planNotifications(
      input({
        plus: {
          ...NO_PLUS,
          plus_status: 'lapsed',
          plus_expires_at: '2026-09-14T00:00:00.000Z',
          plus_will_renew: false,
          plus_billing_issue_at: null,
        },
      }),
    )
    expect(kinds(out)).toContain('plus_lapsed')
    expect(kinds(out)).not.toContain('billing_issue')
  })
})

// ── bills ────────────────────────────────────────────────────────────────

const rentRule = {
  id: 'rule-rent',
  name: 'Rent',
  amount: 1450,
  amount_in_profile_currency: 1450,
  currency_code: 'USD',
  direction: 'debit' as const,
  frequency: 'monthly' as const,
  interval: 1,
  starts_at: '2026-01-16T13:00:00.000Z',
  ends_at: null,
  anchor_day: 16,
  anchor_weekday: null,
  anchor_time: null,
  category_id: null,
  is_active: true,
}

describe('bill family', () => {
  it('warns the day before a bill lands, and says what is left after it', () => {
    const out = planNotifications(input({ rules: [rentRule], transactions: [txn()] }))
    const c = out.find((x) => x.kind === 'bill_tomorrow')
    expect(c).toBeDefined()
    expect(c!.title).toContain('Rent')
    expect(c!.title).toContain('$1,450')
    // Income 4000, spent 20, rent 1450 still due.
    expect(c!.body).toContain('$2,530')
    expect(c!.urgency).toBe('time-sensitive')
  })

  it('falls back to the amount due when there is no income to subtract from', () => {
    const out = planNotifications(
      input({ rules: [rentRule], transactions: [txn()], monthlyIncome: null }),
    )
    const c = out.find((x) => x.kind === 'bill_tomorrow')!
    expect(c.body).toContain('still due')
  })

  it('keys to the occurrence, so the same charge is never announced twice', () => {
    const a = planNotifications(input({ rules: [rentRule] })).find((x) => x.kind === 'bill_tomorrow')!
    const b = planNotifications(
      input({ rules: [rentRule], nowUtc: '2026-09-15T20:00:00.000Z' }),
    ).find((x) => x.kind === 'bill_tomorrow')!
    expect(a.dedupeKey).toBe(b.dedupeKey)
  })

  it('reports a heavy week only when no single bill is imminent', () => {
    const far = (id: string, day: number) => ({
      ...rentRule,
      id,
      name: id,
      amount: 60,
      amount_in_profile_currency: 60,
      anchor_day: day,
      starts_at: `2026-01-${String(day).padStart(2, '0')}T13:00:00.000Z`,
    })
    const out = planNotifications(input({ rules: [far('a', 19), far('b', 20), far('c', 21)] }))
    expect(kinds(out)).toContain('bill_week_heavy')
    expect(kinds(out)).not.toContain('bill_tomorrow')
  })

  it('flags a bill that was due and never arrived', () => {
    const out = planNotifications(
      input({ rules: [{ ...rentRule, anchor_day: 10, starts_at: '2026-01-10T13:00:00.000Z' }] }),
    )
    expect(kinds(out)).toContain('bill_missing')
  })

  it('stays quiet when a matching charge did land', () => {
    const out = planNotifications(
      input({
        rules: [{ ...rentRule, anchor_day: 10, starts_at: '2026-01-10T13:00:00.000Z' }],
        transactions: [txn({ amount_in_profile_currency: 1450, transacted_at: '2026-09-10T15:00:00.000Z' })],
      }),
    )
    expect(kinds(out)).not.toContain('bill_missing')
  })

  it('does not treat a bill due yesterday as missing (the charge may be in flight)', () => {
    const out = planNotifications(
      input({ rules: [{ ...rentRule, anchor_day: 14, starts_at: '2026-01-14T13:00:00.000Z' }] }),
    )
    expect(kinds(out)).not.toContain('bill_missing')
  })
})

// ── budget ───────────────────────────────────────────────────────────────

const budget = {
  id: 'b1',
  period: 'monthly' as const,
  starts_at: '2026-09-01',
  category_id: null,
  currency_code: 'USD',
  amount: 1000,
}

describe('budget family', () => {
  it('says nothing at half spent', () => {
    const txns = Array.from({ length: 5 }, () => txn({ amount_in_profile_currency: 100 }))
    const out = planNotifications(input({ budgets: [budget], transactions: txns }))
    expect(kinds(out).filter((k) => k.startsWith('budget'))).toEqual([])
  })

  it('warns at 80 percent with a per-day figure, not just a percentage', () => {
    const txns = Array.from({ length: 17 }, () => txn({ amount_in_profile_currency: 50 }))
    const out = planNotifications(input({ budgets: [budget], transactions: txns }))
    const c = out.find((x) => x.kind === 'budget_80')
    expect(c).toBeDefined()
    expect(c!.body).toMatch(/a day keeps you inside/)
  })

  it('reports going over, with the amount', () => {
    const txns = Array.from({ length: 12 }, () => txn({ amount_in_profile_currency: 100 }))
    const out = planNotifications(input({ budgets: [budget], transactions: txns }))
    const c = out.find((x) => x.kind === 'budget_over')
    expect(c).toBeDefined()
    expect(c!.title).toContain('$200')
  })

  it('keys to the budget period, so one crossing is announced once', () => {
    const txns = Array.from({ length: 12 }, () => txn({ amount_in_profile_currency: 100 }))
    const a = planNotifications(input({ budgets: [budget], transactions: txns })).find(
      (x) => x.kind === 'budget_over',
    )!
    const b = planNotifications(
      input({ budgets: [budget], transactions: txns, nowUtc: '2026-09-20T18:00:00.000Z' }),
    ).find((x) => x.kind === 'budget_over')!
    expect(a.dedupeKey).toBe(b.dedupeKey)
  })

  it('names the category when a category budget goes over', () => {
    const catBudget = { ...budget, id: 'b2', category_id: 'cat-1', amount: 100, category_name: 'Groceries' }
    const txns = Array.from({ length: 8 }, () =>
      txn({ amount_in_profile_currency: 20, category_id: 'cat-1' } as never),
    )
    const out = planNotifications(input({ budgets: [catBudget], transactions: txns }))
    const c = out.find((x) => x.kind === 'budget_category_over')
    expect(c).toBeDefined()
    expect(c!.title).toContain('Groceries')
  })
})

// ── insight and habit ────────────────────────────────────────────────────

describe('insight family', () => {
  it('sends a weekly recap on Sunday for someone with a real week behind them', () => {
    const txns = Array.from({ length: 6 }, (_, i) =>
      txn({ amount_in_profile_currency: 30, transacted_at: `2026-09-1${4 + i}T15:00:00.000Z` }),
    )
    const out = planNotifications(input({ nowUtc: '2026-09-20T22:00:00.000Z', transactions: txns }))
    const c = out.find((x) => x.kind === 'weekly_recap')
    expect(c).toBeDefined()
    expect(c!.urgency).toBe('passive')
  })

  it('does not recap a week with almost nothing in it', () => {
    const out = planNotifications(
      input({ nowUtc: '2026-09-20T22:00:00.000Z', transactions: [txn(), txn()] }),
    )
    expect(kinds(out)).not.toContain('weekly_recap')
  })

  it('uses the reader\'s weekday, not UTC\'s', () => {
    // 22:00 UTC Sunday is 18:00 Sunday in New York but 10:00 MONDAY in
    // Auckland. A UTC weekday check sent every zone east of UTC their
    // "last week" recap on a Monday.
    const txns = Array.from({ length: 6 }, (_, i) =>
      txn({ amount_in_profile_currency: 30, transacted_at: `2026-09-1${4 + i}T15:00:00.000Z` }),
    )
    const nowUtc = '2026-09-20T22:00:00.000Z'
    expect(kinds(planNotifications(input({ nowUtc, transactions: txns, timeZone: 'America/New_York' })))).toContain(
      'weekly_recap',
    )
    expect(
      kinds(planNotifications(input({ nowUtc, transactions: txns, timeZone: 'Pacific/Auckland' }))),
    ).not.toContain('weekly_recap')
  })

  it('does not recap on a Tuesday', () => {
    const txns = Array.from({ length: 6 }, () => txn())
    expect(kinds(planNotifications(input({ transactions: txns })))).not.toContain('weekly_recap')
  })
})

describe('habit family', () => {
  it('stays quiet while the user is active', () => {
    const out = planNotifications(input({ lastLoggedAt: '2026-09-14T18:00:00.000Z' }))
    expect(kinds(out).filter((k) => k.startsWith('winback'))).toEqual([])
  })

  it('reaches out at 14, 30 and 60 days, one step at a time', () => {
    const at = (iso: string) => kinds(planNotifications(input({ lastLoggedAt: iso })))
    expect(at('2026-09-01T18:00:00.000Z')).toContain('winback_14')
    expect(at('2026-08-10T18:00:00.000Z')).toContain('winback_30')
    expect(at('2026-07-01T18:00:00.000Z')).toContain('winback_60')
    // Never two at once.
    expect(at('2026-07-01T18:00:00.000Z').filter((k) => k.startsWith('winback'))).toHaveLength(1)
  })

  it('leads a lapsed user with their bills rather than a complaint', () => {
    const out = planNotifications(input({ lastLoggedAt: '2026-09-01T18:00:00.000Z', rules: [rentRule] }))
    const c = out.find((x) => x.kind === 'winback_14')!
    expect(c.title).toMatch(/bills/i)
    expect(c.data.screen).toBe('recurring')
  })
})

// ── the governor ─────────────────────────────────────────────────────────

function candidate(over: Partial<NotificationCandidate> = {}): NotificationCandidate {
  return {
    family: 'insight',
    kind: 'weekly_recap',
    dedupeKey: 'weekly_recap:2026-09-20',
    priority: 40,
    title: 't',
    body: 'b',
    data: {},
    urgency: 'passive',
    ...over,
  }
}

function state(over: Partial<GovernorState> = {}): GovernorState {
  return {
    prefs: DEFAULT_NOTIFICATION_PREFS,
    localHour: 19,
    alreadySent: new Set<string>(),
    sentLast7Days: 0,
    sentToday: 0,
    ...over,
  }
}

describe('governor', () => {
  it('picks the highest priority candidate', () => {
    const chosen = govern(
      [candidate(), candidate({ kind: 'bill_tomorrow', family: 'bill', priority: 85, dedupeKey: 'b' })],
      state(),
    )
    expect(chosen!.kind).toBe('bill_tomorrow')
  })

  it('never repeats a claim already sent', () => {
    expect(govern([candidate()], state({ alreadySent: new Set(['weekly_recap:2026-09-20']) }))).toBeNull()
  })

  it('sends at most one a day', () => {
    expect(govern([candidate()], state({ sentToday: 1 }))).toBeNull()
  })

  it('honours the weekly ceiling', () => {
    expect(govern([candidate()], state({ sentLast7Days: 3 }))).toBeNull()
    expect(govern([candidate()], state({ sentLast7Days: 2 }))).not.toBeNull()
  })

  it('respects a muted family', () => {
    const prefs = { ...DEFAULT_NOTIFICATION_PREFS, insights: false }
    expect(govern([candidate()], state({ prefs }))).toBeNull()
  })

  it('lets transactional messages through a muted family and a full week', () => {
    const prefs = { ...DEFAULT_NOTIFICATION_PREFS, insights: false, bills: false }
    const billing = candidate({
      family: 'money',
      kind: 'billing_issue',
      priority: 100,
      dedupeKey: 'bi',
      transactional: true,
    })
    expect(govern([billing], state({ prefs, sentToday: 1, sentLast7Days: 9 }))!.kind).toBe('billing_issue')
  })

  it('stays silent during quiet hours, even for a failed payment', () => {
    const billing = candidate({ family: 'money', priority: 100, dedupeKey: 'bi', transactional: true })
    // 03:00 local. The sweep runs hourly and will offer it again at 08:00.
    expect(govern([billing], state({ localHour: 3 }))).toBeNull()
  })

  it('returns null rather than reaching for something lesser to fill a slot', () => {
    expect(govern([], state())).toBeNull()
  })

  it('treats max_per_week 0 as transactional only', () => {
    const prefs = { ...DEFAULT_NOTIFICATION_PREFS, max_per_week: 0 }
    expect(govern([candidate()], state({ prefs }))).toBeNull()
    const billing = candidate({ family: 'money', priority: 100, dedupeKey: 'bi', transactional: true })
    expect(govern([billing], state({ prefs }))).not.toBeNull()
  })
})

describe('quiet hours', () => {
  it('handles a window that wraps midnight', () => {
    expect(inQuietHours(23, 22, 8)).toBe(true)
    expect(inQuietHours(3, 22, 8)).toBe(true)
    expect(inQuietHours(8, 22, 8)).toBe(false)
    expect(inQuietHours(12, 22, 8)).toBe(false)
  })

  it('handles a same-day window', () => {
    expect(inQuietHours(10, 9, 17)).toBe(true)
    expect(inQuietHours(20, 9, 17)).toBe(false)
  })

  it('treats an empty window as never quiet', () => {
    expect(inQuietHours(5, 0, 0)).toBe(false)
  })
})
