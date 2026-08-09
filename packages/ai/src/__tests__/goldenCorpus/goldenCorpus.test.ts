// Runner for the golden corpus — audit 02-F27 / fix-plan item 1.1.
//
// Replays each corpus row through the REAL `parseExpense()` (packages/ai/
// src/parser.ts, unmodified) with `fetch` mocked to return the row's
// recorded/simulated raw model JSON. This exercises parser.ts's actual
// merge/defaulting logic — the only thing faked is the network call.
//
// Each test gets a fresh module instance (`vi.resetModules()` +
// dynamic import) so the parser's in-memory LRU cache can never leak a
// result from one row into another, even when two rows share an
// utterance (f1-schwab-direction / f7-schwab-note below, by design).

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GOLDEN_CORPUS, HEADLINE_ROWS, type GoldenCorpusRow } from './corpus'
import type { parseExpense as ParseExpenseFn } from '../../parser'

async function freshParseExpense(): Promise<typeof ParseExpenseFn> {
  vi.resetModules()
  const mod = await import('../../parser')
  return mod.parseExpense
}

function mockFetchReturning(rawResponse: Record<string, unknown>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify(rawResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )
}

async function runRow(row: GoldenCorpusRow) {
  const parseExpense = await freshParseExpense()
  mockFetchReturning(row.rawResponse)
  const result = await parseExpense({
    transcript: row.utterance,
    locale: row.lang,
    currency: (row.rawResponse.currency as string | undefined) ?? 'USD',
    categories: [],
    apiBaseUrl: 'https://example.test',
    authToken: 'test-token',
  })

  expect(result.direction, 'direction').toBe(row.expected.direction)
  expect(result.amount, 'amount').toBe(row.expected.amount)
  expect(result.is_recurring_suggestion, 'is_recurring_suggestion').toBe(
    row.expected.isRecurringSuggestion,
  )
  // Only pinned where a row names an explicit flowType (fix-plan item
  // 1.7) — see corpus.ts's file header for why the rest aren't.
  if (row.expected.flowType) {
    expect(result.flow_type, 'flow_type').toBe(row.expected.flowType)
  }
  if (row.expected.noteContains) {
    expect(result.note ?? '', 'note').toContain(row.expected.noteContains)
  }
  if (row.expected.needsClarification !== undefined) {
    expect(result.needs_clarification, 'needs_clarification').toBe(row.expected.needsClarification)
  }
}

describe('golden corpus', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  describe('headline rows (finding-tied)', () => {
    for (const row of HEADLINE_ROWS) {
      const label = `${row.id}${row.finding ? ` (${row.finding})` : ''}: "${row.utterance}"`
      if (row.knownFailing) {
        // Encodes a bug that is still open at HEAD. Passes today because
        // the assertions inside runRow are expected to fail; the moment
        // the underlying fix lands, this starts failing loudly — that's
        // the signal to flip `knownFailing: false` in corpus.ts.
        it.fails(`[KNOWN FAILING — ${row.knownFailingReason}] ${label}`, () => runRow(row))
      } else {
        it(label, () => runRow(row))
      }
    }
  })

  describe('direction / amount / recurring coverage (en, fr, es, pt)', () => {
    const genericRows = GOLDEN_CORPUS.filter((r) => !HEADLINE_ROWS.includes(r))
    for (const row of genericRows) {
      it(`[${row.lang}] ${row.id}: "${row.utterance}"`, () => runRow(row))
    }
  })
})

// ─── Mobile-layer bugs referenced by item 1.1's "first four rows" ─────────
//
// F3 (02-ai-parsing-and-scan "bug 3") and F9 ("bug 4") are the other two
// of the four user-reported parse bugs, but both live in mobile UI code
// that this package's corpus cannot exercise — see corpus.ts's header
// comment for why. Named here as `it.todo` so they stay visible in
// `turbo test` output until Stage 2 adopts them as real component tests.
describe('mobile-layer parse bugs (not exercisable from packages/ai)', () => {
  it.todo(
    'F3: apps/mobile/app/(tabs)/record.tsx handleScan must not open the confirm sheet when parseScan reports needs_clarification (audit 02-ai-parsing-and-scan.md#F3)',
  )
  it.todo(
    'F9: apps/mobile/src/components/VoiceConfirmModal.tsx hydration effect must reset categoryId/isRecurring/recurringFrequency/note on every new parsedExpense, not just set them (audit 02-ai-parsing-and-scan.md#F9)',
  )
})
