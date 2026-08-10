import { describe, it, expect } from 'vitest'
import { resolveCategorySuggestion } from '../categoryResolver'
import type { Category } from '../../types/category'

/** Minimal fixture — every field the resolver structurally needs. */
function cat(name: string, overrides: Partial<Category> = {}): Category {
  return {
    id: `cat-${name.toLowerCase().replace(/\s+/g, '-')}`,
    user_id: 'u1',
    client_id: 'c1',
    name,
    name_normalized: name.trim().toLowerCase(),
    color: null,
    icon: null,
    is_archived: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Category
}

const CATEGORIES: Category[] = [
  cat('Groceries'),
  cat('Food & Dining'),
  cat('Entertainment'),
  cat('Housing'),
  cat('Utilities'),
  cat('Savings & Investing'),
  cat('Income'),
  cat('Transport'),
]

describe('resolveCategorySuggestion — the audit regression (02-F13)', () => {
  it('"Rent" resolves to Housing, not Entertainment (the .includes() bug)', () => {
    const r = resolveCategorySuggestion('Rent', CATEGORIES)
    expect(r?.category.name).toBe('Housing')
    expect(r?.strategy).toBe('synonym')
  })

  it('does NOT match Entertainment via substring ("entertainment".includes("rent"))', () => {
    const r = resolveCategorySuggestion('Rent', CATEGORIES)
    expect(r?.category.name).not.toBe('Entertainment')
  })
})

describe('resolveCategorySuggestion — stage 1: exact match', () => {
  it('matches an exact (case-insensitive) category name', () => {
    const r = resolveCategorySuggestion('food & dining', CATEGORIES)
    expect(r?.category.name).toBe('Food & Dining')
    expect(r?.strategy).toBe('exact')
  })
})

describe('resolveCategorySuggestion — stage 2: curated synonyms', () => {
  it('"mortgage" → Housing', () => {
    expect(resolveCategorySuggestion('mortgage', CATEGORIES)?.category.name).toBe('Housing')
  })
  it('"internet bill" → Utilities', () => {
    expect(resolveCategorySuggestion('internet bill', CATEGORIES)?.category.name).toBe('Utilities')
  })
  it('"401k contribution" → Savings & Investing', () => {
    expect(resolveCategorySuggestion('401k contribution', CATEGORIES)?.category.name).toBe(
      'Savings & Investing',
    )
  })
  it('"paycheck" → Income', () => {
    expect(resolveCategorySuggestion('paycheck', CATEGORIES)?.category.name).toBe('Income')
  })
  it('a synonym with no matching target category returns null, not a guess', () => {
    const withoutIncome = CATEGORIES.filter((c) => c.name !== 'Income')
    expect(resolveCategorySuggestion('salary', withoutIncome)).toBeNull()
  })
})

describe('resolveCategorySuggestion — stage 3: token overlap', () => {
  it('"Grocery shopping" → Groceries via whole-word overlap', () => {
    const r = resolveCategorySuggestion('Grocery shopping', [cat('Groceries'), cat('Shopping')])
    // "grocery" and "groceries" don't share a whole token, but "shopping"
    // does — the resolver should prefer whichever category actually
    // shares a token, not guess between them.
    expect(r?.category.name).toBe('Shopping')
    expect(r?.strategy).toBe('token_overlap')
  })

  it('below-threshold suggestions resolve to null, not a low-confidence guess', () => {
    const r = resolveCategorySuggestion('Miscellaneous stuff', [cat('Housing'), cat('Utilities')])
    expect(r).toBeNull()
  })
})

describe('resolveCategorySuggestion — edge cases', () => {
  it('null/empty suggestion returns null', () => {
    expect(resolveCategorySuggestion(null, CATEGORIES)).toBeNull()
    expect(resolveCategorySuggestion('', CATEGORIES)).toBeNull()
    expect(resolveCategorySuggestion('   ', CATEGORIES)).toBeNull()
  })
  it('empty category list returns null', () => {
    expect(resolveCategorySuggestion('Housing', [])).toBeNull()
  })
})
