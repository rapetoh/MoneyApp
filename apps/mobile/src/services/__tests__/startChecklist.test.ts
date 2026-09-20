/**
 * The onboarding goal has to change something downstream, or it is a toll
 * booth with no road behind it. It orders this card.
 */
import { describe, expect, it } from 'vitest'
import { orderStartItems } from '../startChecklist'
import type { StartItem } from '../../components/GettingStartedCard'

const item = (key: StartItem['key'], done = false): StartItem => ({ key, done, onPress: () => {} })

const base = [item('first_expense'), item('budget'), item('income'), item('ask'), item('applepay')]

describe('orderStartItems', () => {
  it('puts the budget first for someone who came to stick to one', () => {
    expect(orderStartItems(base, 'budget').map((i) => i.key)[0]).toBe('budget')
  })

  it('puts Apple Pay capture first for someone hunting subscriptions', () => {
    expect(orderStartItems(base, 'subscriptions').map((i) => i.key)[0]).toBe('applepay')
  })

  it('keeps the given order when no goal was chosen', () => {
    expect(orderStartItems(base, null).map((i) => i.key)).toEqual([
      'first_expense',
      'budget',
      'income',
      'ask',
      'applepay',
    ])
  })

  it('always opens on something still to do', () => {
    const withDone = [item('budget', true), item('first_expense'), item('ask')]
    expect(orderStartItems(withDone, 'budget').map((i) => i.key)).toEqual(['first_expense', 'ask', 'budget'])
  })
})
