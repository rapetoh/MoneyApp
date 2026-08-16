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
run against production.

**Aug 16 2026, 13:50 UTC — commit 1c4bbad — `CHECKS: all passed` (17 model turns).**
Transcript highlights, read by a human:
- invest: "$450 this week" → "Charles Schwab $300 and Ally $150" (transactions block) → "8.31 % of your
  monthly income" → concrete "what else" (budget not set / $1,416 of $3,000 / bills $356) with
  set_budget · open_recurring · show_transactions chips; resumed later, "how much was that last month?"
  → "$300" (pronoun → focus.subject works).
- Hey → cites $1,416; overall → income $3,000 / spent $1,416 / $1,584 available, bills all charged;
  "and last month?" → $7,500 / $770.50 / $6,729.50.
- PS5 → yes, $499, $1,085 left (ledger rows incl. still-due bills $0); "$1,200 laptop" → yes, $384 left.
- coffee → **$62.40 = Starbucks $50 + Blue Bottle $12.40** (fixed vs local run 3) — but it also listed
  "Dunkin' = $0.00", a merchant the user doesn't have (prompt example leaked in; prompt tightened after
  this run: only merchants present in the overview list).
- "Ok" after PS5 → moved to last month's spending instead of staying on the purchase (prompt tightened:
  acknowledgements stay on the subject).
- Latency: three turns took 24–60 s — 429 backoff on the 30k TPM org tier, not logic. Owner to raise.
- Error paths 401/400/404/402/no-data all correct; 8 messages persisted per 4-turn thread, focus and
  computed on the stored replies.

**Aug 16 2026, ~15:30 UTC — owner review round 2 (desktop screenshots).** "hello how are you doing"
was answered with spending figures four turns in a row — the model recited the mandatory first tool
call's result. Fix is structural: every reply declares `kind` (money / smalltalk / meta); a non-money
reply that carries any currency/percent figure is rejected by the validator and retried; non-money
replies never carry blocks. Live check `node apps/web/scripts/ask-murmur-smalltalk.mjs` against
production after commit 2652e36: "hello how are you doing" → "Doing well, thanks for asking! Ready when
you are — what's on your mind?"; the meta question is answered directly; the next money question gets
"$1,270" — `CHECKS: all passed`. Also verified against the owner's own data (Gadget Maison): August
spending $1,329 = the Ask figure; the home line "$0 left this month" was a $700 **weekly** budget $237
over, clamped to 0 and captioned "this month" — fixed on the home screen (build 22); the Recurring
screen's dates/totals are correct, its calendar footer had counted two paychecks as "charges" — fixed.

**Aug 16 2026, ~14:15 CDT — owner verification of a desktop thread (their real account).** Human check
against the database: $1,329 spent ✓, $2,500 earned ✓, "$1,250 monthly average over 12 months" ✗ (data
starts Aug 8), "≈$5,416.67 next month" ⚠ (that is the biweekly average; September has two paydays →
$5,000), "no transactions for 20 LLC" ✗ (the $1,000 "The20 MSP" deposit is linked to the 20 LLC rule).
Structural fixes (commit 8ff14d4): transactions carry `recurring_rule_id` on the wire; `rule_name`
filter with link-first matching on total/list_transactions and in recurring_total's charged-this-month;
every windowed result carries `coverage` and the prompt forbids averaging over uncovered periods;
`recurring_in_window` gives the calendar projection (`nextMonth`, `next30Days` windows).
Replay script `apps/web/scripts/ask-murmur-owner-replay.mjs` (the owner's exact turns on data shaped
like their account). Local run with the new code: $5,000 next month with Sep 8/22 dates ✓; 20 LLC ↔
The20 MSP by the link ✓; "monthly average salary" → "$5,416.67 on average, from your recurring income
rules" (truthful; not $1,250). Production run pending the deploy of 8ff14d4.
