import { describe, it, expect } from 'vitest'
import {
  buildAskSystemPrompt,
  buildContextMessages,
  compactComputed,
  groundAskReply,
  mergeFocus,
  trustedFigures,
  validateAskReply,
} from '../askConversation'
import { buildDataOverview, resolveToolCall, type ToolCallRecord, type ToolContext } from '../askMurmurTools'
import type { AskFocus, AskReply } from '@voice-expense/shared'

const ctx: ToolContext = {
  now_utc: '2026-08-16T15:00:00Z',
  tz: 'America/Chicago',
  currency: 'USD',
  monthly_income: 5416.67,
  locale: 'en',
  transactions: [
    { amount: 300, amount_in_profile_currency: 300, direction: 'debit', merchant: 'Charles Schwab', category_name: 'Savings & Investing', transacted_at: '2026-08-12T15:00:00Z', is_recurring: true },
    { amount: 150, amount_in_profile_currency: 150, direction: 'debit', merchant: 'Ally', category_name: 'Savings & Investing', transacted_at: '2026-08-13T15:00:00Z', is_recurring: false },
    { amount: 2500, amount_in_profile_currency: 2500, direction: 'credit', merchant: 'The20', category_name: 'Business & Work', transacted_at: '2026-08-04T15:00:00Z', is_recurring: true },
    { amount: 50, amount_in_profile_currency: 50, direction: 'debit', merchant: 'Starbucks', category_name: 'Food & Dining', transacted_at: '2026-08-10T15:00:00Z', is_recurring: false },
  ],
  recurring_rules: [],
}

function call(name: string, args: Record<string, unknown>): ToolCallRecord {
  const r = resolveToolCall(name, args, ctx)
  return r.ok ? { name, args, ok: true, result: r.result } : { name, args, ok: false, result: null, error: r.error }
}

describe('validateAskReply', () => {
  it('coerces a well-formed reply with every block type and drops junk', () => {
    const raw = {
      text: 'You invested <b>$450</b> this week.',
      sentiment: 'neutral',
      blocks: [
        { type: 'figure', label: 'Invested · this week', value: '$450' },
        { type: 'transactions', caption: 'The two transfers', rows: [{ date: '2026-08-13', merchant: 'Ally', amount: '$150' }, { date: '2026-08-12', merchant: 'Charles Schwab', amount: '$300', category: 'Savings & Investing' }] },
        { type: 'rows', caption: 'Share of income', rows: [{ label: 'Income', value: '$2,500' }, { label: 'Invested', value: '$450', accent: true }] },
        { type: 'steps', caption: 'Plan', steps: ['Keep the $300 transfer', 'Skip Ally next month'] },
        { type: 'bogus' },
        { type: 'chart', chart: { type: 'donut', title: 'x', data: [{ label: 'a', value: 1 }] } }, // < 2 points → dropped
      ],
      actions: [
        { label: 'See transfers', intent: 'show_transactions', params: { category_name: 'Savings & Investing', bogus: 'x' } },
        { label: 'Send money', intent: 'move_money' },
      ],
      focus: { subject: 'investing', window: { name: 'thisWeek' }, entities: ['Ally', 'Charles Schwab'], figures: [{ label: 'invested this week', value: 450 }] },
      out_of_scope: false,
    }
    const reply = validateAskReply(raw, 4)
    expect(reply.text).toContain('$450')
    expect(reply.blocks.map((b) => b.type)).toEqual(['figure', 'transactions', 'rows', 'steps'])
    expect(reply.actions).toEqual([{ label: 'See transfers', intent: 'show_transactions', params: { category_name: 'Savings & Investing' } }])
    expect(reply.focus?.subject).toBe('investing')
    expect(reply.focus?.figures).toEqual([{ label: 'invested this week', value: 450 }])
    expect(reply.transaction_count).toBe(4)
  })

  it('accepts the legacy verdict key and empties blocks/actions on a refusal', () => {
    const reply = validateAskReply({ verdict: { text: 'Not something I can do.', sentiment: 'neutral' }, out_of_scope: true, blocks: [{ type: 'figure', label: 'x', value: '1' }] }, 0)
    expect(reply.text).toBe('Not something I can do.')
    expect(reply.out_of_scope).toBe(true)
    expect(reply.blocks).toEqual([])
  })
})

describe('grounding', () => {
  const overview = buildDataOverview(ctx)

  it('accepts figures from this turn, an earlier turn, the overview and an arith result; flags an invention', () => {
    const calls = [call('total', { window: 'thisWeek', direction: 'debit', category_name: 'Savings & Investing' }), call('arith', { op: 'percent_of', a: 450, b: 2500 })]
    const trusted = trustedFigures({
      calls,
      priorTurns: [{ question: 'coffee?', reply: null, computed: [{ tool: 'total', args: { window: 'thisMonth', merchant_contains: 'starbucks' }, result: { total: 50, count: 1 } }] }],
      focus: null,
      overview,
      budget: null,
      monthlyIncome: 5416.67,
      message: 'is $450 a good ratio?',
      seedInsight: null,
    })
    const ok: AskReply = { text: '$450 is 18% of your $2,500 income — and Starbucks was $50.', sentiment: 'neutral', blocks: [], actions: [], focus: null, out_of_scope: false, transaction_count: 4 }
    expect(groundAskReply(ok, trusted, calls).untraced).toEqual([])
    const bad: AskReply = { ...ok, text: 'You spent $777 on nothing.', blocks: [{ type: 'rows', caption: 'x', rows: [{ label: 'a', value: '$91' }] }] }
    const g = groundAskReply(bad, trusted, calls)
    expect(g.untraced).toEqual(['text: 777', 'blocks[0].rows[0](a): 91'])
  })

  it('flags a comparison whose direction contradicts compare', () => {
    const calls = [call('compare', { a: { label: 'Food', value: 50 }, b: { label: 'Investing', value: 450 } })]
    const trusted = trustedFigures({ calls, priorTurns: [], focus: null, overview, budget: null, monthlyIncome: null, message: '', seedInsight: null })
    const reply: AskReply = { text: 'Food ($50) is higher than Investing ($450) this month.', sentiment: 'neutral', blocks: [], actions: [], focus: null, out_of_scope: false, transaction_count: 4 }
    expect(groundAskReply(reply, trusted, calls).direction_violation).toBeTruthy()
  })
})

describe('mergeFocus + compactComputed', () => {
  it('fills window/figures from the calls when the model leaves them out and keeps earlier entities', () => {
    const prev: AskFocus = { subject: 'investing', window: { name: 'thisWeek' }, entities: ['Ally'], figures: [{ label: 'invested this week', value: 450 }] }
    const calls = [call('total', { window: 'lastMonth', direction: 'debit', category_name: 'Savings & Investing' })]
    const merged = mergeFocus(prev, { subject: null, window: null, entities: [], figures: [] }, calls)
    expect(merged?.subject).toBe('investing')
    expect(merged?.window).toEqual({ name: 'lastMonth' })
    expect(merged?.entities).toContain('Ally')
    expect(merged?.entities).toContain('Savings & Investing')
    expect(merged?.figures[0]?.label).toBe('spent Savings & Investing lastMonth')
  })

  it('keeps computed records compact and drops failed calls', () => {
    const calls = [
      call('list_transactions', { window: 'thisWeek', category_name: 'Savings & Investing' }),
      call('total', { window: 'nope' }),
    ]
    const compact = compactComputed(calls)
    expect(compact).toHaveLength(1)
    expect(compact[0].tool).toBe('list_transactions')
    expect(JSON.stringify(compact).length).toBeLessThan(1500)
    const rows = (compact[0].result as { transactions: Array<{ merchant: string }> }).transactions.map((r) => r.merchant)
    expect(rows).toEqual(['Ally', 'Charles Schwab'])
  })
})

describe('context + prompt', () => {
  it('replays prior turns as real messages with COMPUTED figures', () => {
    const msgs = buildContextMessages([
      { question: 'how much did I invest this week?', reply: { text: 'You invested $450 this week.', sentiment: 'neutral', blocks: [{ type: 'figure', label: 'x', value: '$450' }], actions: [], focus: null, out_of_scope: false, transaction_count: 4 }, computed: [{ tool: 'total', args: { window: 'thisWeek' }, result: { total: 450 } }] },
    ])
    expect(msgs[0]).toEqual({ role: 'user', content: 'how much did I invest this week?' })
    expect(msgs[1].role).toBe('assistant')
    expect(msgs[1].content).toContain('ANSWER: You invested $450 this week.')
    expect(msgs[1].content).toContain('SHOWN: figure')
    expect(msgs[1].content).toContain('"total":450')
  })

  it('the prompt carries the overview, budget, focus and the no-greeting rule mid-thread', () => {
    const p = buildAskSystemPrompt({
      locale: 'en', currency: 'USD', now_utc: ctx.now_utc, time_zone: ctx.tz, monthly_income: 5416.67,
      transaction_count: 4, recurring_rule_count: 0, overview: buildDataOverview(ctx), budget: null,
      focus: { subject: 'investing', window: { name: 'thisWeek' }, entities: [], figures: [{ label: 'invested', value: 450 }] },
      seed_insight: { kind: 'category_surge', title: 'Groceries $303 so far this month', detail: '198% over your usual' },
      has_prior_turns: true,
    })
    expect(p).toContain('CURRENT FOCUS')
    expect(p).toContain('"subject":"investing"')
    expect(p).toContain('do NOT greet')
    expect(p).toContain('list_transactions')
    expect(p).toContain('arith')
    expect(p).toContain('TAPPED THIS INSIGHT')
    expect(p).toContain('2026-08-16')
    expect(p).toContain('BUDGET: none set')
  })
})
