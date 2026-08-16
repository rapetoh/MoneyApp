# Ask Murmur — verification (rebuild, Aug 16 2026)

Rule (owner, Aug 15–16): never say "done" on this feature without a live run and an honest
walkthrough of the transcript. Screenshots of defects are evidence of a higher-level problem — read
the tool-call trace before touching the prompt.

## Layers
1. **Unit** (`vitest`, run in `packages/shared`, `packages/ai`, `apps/web`):
   - `packages/shared/src/domain/__tests__/askInsights.test.ts` — insight engine: no-data, upcoming
     bill + what's left, category surge vs same day-span, subscriptions total, budget pace/over,
     large transaction, ranking/dedup/cap, locale formatting.
   - `packages/ai/src/__tests__/askMurmur.test.ts` — tools incl. `list_transactions`, `arith`,
     `can_afford`, `recurring_total.upcoming`, overview vocabulary, windows, currency mixing.
   - `packages/ai/src/__tests__/askConversation.test.ts` — reply validator (all block types, junk
     dropped, legacy key), grounding (accepts prior-turn / overview / arith figures, flags inventions,
     comparison direction), focus merge, computed compaction, context messages, prompt content.
2. **Harness** — `node apps/web/scripts/ask-murmur-e2e.mjs` (prod) or with
   `API_BASE=http://localhost:3111` against `AI_DEBUG_TRACE=1 npx next dev --port 3111` in `apps/web`.
   Creates a throwaway Plus user, seeds a 12-month account shaped like the owner's, then runs the
   owner's conversations as **threads** (conversation_id carried turn to turn):
   - invest this week → what were those exactly? → is it a good ratio out of how much I make? → what
     else can you help me with?  (asserts: transactions block, a percent, concrete "what else",
     8 messages persisted, focus + computed on the stored replies)
   - Hey → How am I doing overall? → and last month?  (greeting cites a figure; lastMonth resolved)
   - PS5 → Ok → $1,200 laptop  (numbers; the $1,200 carried)
   - coffee → Uber this month → spent so far this month  (subject filtering; $28.50)
   - insight-seeded "keep or cut" → Nvidia stock (named rules; refusal)
   - resume: continue the first thread later ("and how much was that last month?")
   - error paths: 401 / 400 / 404 / 402 free user / no-data honesty
   Every turn is checked for: empty text, re-greeting mid-thread, verbatim repeat, narration without
   numbers. Prints text, blocks, actions and focus for each turn. Exit code = number of failures.
3. **By hand** — the owner talks to it on TestFlight and desktop.

## Local runs, Aug 16 (trace on)
- Run 1: the "invest this week" turn was answered with **zero tool calls** ("no transactions
  categorized as investments") — an invented empty result the numeric validator cannot see. Fixes:
  overview now lists real category names + merchants; first model round is `tool_choice: 'required'`.
  Also: "$1,200 laptop" got the right numbers and the wrong verdict → `can_afford` tool.
- Run 2: all owner conversations correct ($450 · Schwab $300 + Ally $150 listed · 8.31 % · concrete
  "what else"; PS5 yes/$1,085 left; laptop yes/$384 left; Uber $28.50; refusal). Two turns took 40 s+
  (429 backoff on the 30k TPM tier); the no-data error-path call hit 503 busy for the same reason.
- Run 3 (prompt: kinds-of-spend across merchants, pronouns → focus.subject; harness paces before the
  error paths): same conversation quality; the coffee turn returned **503 busy** (TPM ceiling) —
  route now waits Retry-After/5 s/8 s before saying busy; tool schema trimmed ~700 tokens.
Known soft spots after run 3: "coffee" is answered from merchants containing "coffee" (Blue Bottle
$12.40) and may miss Starbucks-style names; "Ok" after PS5 moved to an income figure rather than the
PS5 subject. Both are prompt-quality, not grounding, issues — watch them in the prod run.

## Production run
Record the date, the CHECKS line and anything a human would flag below every time the harness is
run against production. See PLAN.md's dated entry for the latest.
