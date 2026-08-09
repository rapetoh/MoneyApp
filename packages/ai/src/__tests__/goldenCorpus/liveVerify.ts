#!/usr/bin/env -S npx --yes tsx
//
// On-demand live-model check for the golden corpus — audit 02-F27 /
// fix-plan item 1.1: "runnable against a recorded fixture in CI and
// against the live model on demand."
//
// Calls the real OpenAI model with the same prompt the production route
// (apps/web/src/app/api/ai/parse-expense/route.ts) builds, for every row
// in corpus.ts, and prints a diff against each row's checked-in
// `rawResponse`. It does NOT rewrite corpus.ts or touch parser.ts — a
// human decides whether a diff means the prompt drifted or the fixture
// is stale. Not part of `turbo test` / CI; run manually:
//
//   OPENAI_API_KEY=sk-... npm run golden:verify-live -w @voice-expense/ai
//
// Exit code is non-zero if any row's live output diverges from the
// checked-in expectation (not the recorded rawResponse — the live model
// should match what the product actually wants).

import OpenAI from 'openai'
import type { FlowType } from '@voice-expense/shared'
import { getPrompt } from '../../prompt'
import { deriveDirectionFromFlowType, FLOW_TYPE_VALUES } from '../../validateParsedExpense'
import { GOLDEN_CORPUS } from './corpus'

const MODEL = process.env.AI_PARSE_MODEL ?? 'gpt-4o-mini'

async function main() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('OPENAI_API_KEY is not set — this script calls the live model, nothing else runs it.')
    process.exit(1)
  }
  const openai = new OpenAI({ apiKey })

  let mismatches = 0
  for (const row of GOLDEN_CORPUS) {
    const systemPrompt = getPrompt({
      locale: row.lang,
      currency: (row.rawResponse.currency as string | undefined) ?? 'USD',
      today: new Date().toISOString().split('T')[0],
      categories: [],
    })

    const completion = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      max_tokens: 320,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: row.utterance },
      ],
    })

    const text = completion.choices[0].message.content ?? '{}'
    let raw: Record<string, unknown>
    try {
      raw = JSON.parse(text)
    } catch {
      console.error(`[${row.id}] model returned non-JSON: ${text}`)
      mismatches += 1
      continue
    }

    const problems: string[] = []
    // The model returns `flow_type`, not `direction` (fix-plan item 1.7 —
    // "the model classifies intent; code decides the sign"); derive the
    // sign the same single-sourced way production does before comparing.
    const rawFlowType = FLOW_TYPE_VALUES.includes(raw.flow_type as FlowType)
      ? (raw.flow_type as FlowType)
      : null
    const derivedDirection = rawFlowType ? deriveDirectionFromFlowType(rawFlowType) : undefined
    if (derivedDirection !== row.expected.direction) {
      problems.push(
        `direction (derived from flow_type=${JSON.stringify(raw.flow_type)}): expected ${row.expected.direction}, got ${derivedDirection}`,
      )
    }
    if (row.expected.flowType && raw.flow_type !== row.expected.flowType) {
      problems.push(`flow_type: expected ${row.expected.flowType}, got ${JSON.stringify(raw.flow_type)}`)
    }
    if (Number(raw.amount) !== row.expected.amount) {
      problems.push(`amount: expected ${row.expected.amount}, got ${raw.amount}`)
    }
    if (Boolean(raw.is_recurring_suggestion) !== row.expected.isRecurringSuggestion) {
      problems.push(
        `is_recurring_suggestion: expected ${row.expected.isRecurringSuggestion}, got ${raw.is_recurring_suggestion}`,
      )
    }
    if (row.expected.noteContains && !String(raw.note ?? '').includes(row.expected.noteContains)) {
      problems.push(`note: expected to contain "${row.expected.noteContains}", got ${JSON.stringify(raw.note)}`)
    }

    const recordedDrift =
      JSON.stringify(raw) !== JSON.stringify({ ...row.rawResponse, currency: raw.currency })
        ? ' (live output differs from corpus.ts\'s rawResponse — consider refreshing it)'
        : ''

    if (problems.length === 0) {
      console.log(`ok   [${row.lang}] ${row.id}${row.knownFailing ? ' — was knownFailing, consider flipping it!' : ''}`)
    } else {
      mismatches += 1
      console.log(`FAIL [${row.lang}] ${row.id}${row.knownFailing ? ' (expected — still knownFailing)' : ''}${recordedDrift}`)
      for (const p of problems) console.log(`       ${p}`)
    }
  }

  console.log('')
  console.log(`${GOLDEN_CORPUS.length - mismatches}/${GOLDEN_CORPUS.length} rows match expected output against the live model.`)
  // Rows marked knownFailing are *expected* to mismatch; only a clean exit
  // when everything else is fine is actionable without manual reading.
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
