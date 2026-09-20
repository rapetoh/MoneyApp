import type { StartItem, StartItemKey } from '../components/GettingStartedCard'

/**
 * What the user said they came for decides what the "Getting started"
 * card puts first (onboarding's goal step, migration 039).
 *
 * The research on onboarding questions is blunt: one that changes nothing
 * afterwards is decoration. So the answer moves the matching row to the
 * top, and the rest keep their order. Unfinished rows always come before
 * finished ones, so the card always opens on something to do.
 */
const FIRST_BY_GOAL: Record<string, StartItemKey[]> = {
  clarity: ['first_expense', 'ask'],
  budget: ['budget', 'first_expense'],
  subscriptions: ['applepay', 'ask'],
  simple: ['first_expense'],
}

export function orderStartItems(items: StartItem[], goal: string | null | undefined): StartItem[] {
  const priority = (goal && FIRST_BY_GOAL[goal]) || []
  const rank = (item: StartItem) => {
    const i = priority.indexOf(item.key)
    return i === -1 ? priority.length : i
  }
  return [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return rank(a) - rank(b)
  })
}
