# Ask Murmur — architecture (rebuild, Aug 16 2026)

How the product in [SPEC.md](./SPEC.md) is built. One design across mobile, web/desktop and server.

```
 mobile  apps/mobile/app/more/ask.tsx ─┐                     ┌─ packages/shared/src/domain/askInsights.ts
 web     apps/web/src/app/dashboard/ask/page.tsx ─┤   entry insights (device, deterministic)
                                                  │
                    POST /api/ai/ask-murmur/turn  ▼
 server  apps/web/src/app/api/ai/ask-murmur/turn/route.ts
           ├─ auth (JWT) · Plus gate (profiles.plus_status) · rate limit (120/h/user)
           ├─ load thread (ask_messages, caller's JWT → RLS) → prior turns + focus (last reply's)
           ├─ packages/ai/src/askConversation.ts   buildAskSystemPrompt · buildContextMessages
           ├─ model loop (gpt-4o, first round tool_choice=required, ≤10 rounds)
           │     └─ packages/ai/src/askMurmurTools.ts  total · sum_by_category · top_merchants ·
           │        series · list_transactions · recurring_total(+upcoming) · arith · can_afford · compare
           ├─ validateAskReply (shape) · trustedFigures + groundAskReply (grounding) · one retry
           ├─ mergeFocus · compactComputed
           └─ persist: ask_conversations (create if new) · ask_messages user + assistant
                       (assistant.response = AskReply incl. focus + computed)
 clients read threads back through packages/shared/src/askStorage.ts (resumeCandidate · listConversations
 · loadConversation · softDeleteConversation) and render replies with AskReplyBody (mobile + web).
```

## Contract (`packages/shared/src/types/ai.ts`, "v2" section)
- `AskTurnRequest` / `AskTurnResponse` — one turn. The client ships its data snapshot every turn
  (12 months / 2,000 rows, active rules **with recurrence fields**, the app-computed budget block);
  rows never reach the model — the tools aggregate them.
- `AskReply { text, sentiment, blocks[], actions[], focus, out_of_scope, transaction_count, computed? }`
  — blocks: `figure | rows | transactions | chart | steps`; actions: `show_transactions | set_budget |
  open_recurring | log_expense | create_rule`; `computed` is present only on stored rows.
- `AskFocus { subject, window, entities, figures }` — the thread's state; persisted inside the last
  reply; injected as CURRENT FOCUS next turn.
- `AskInsight` — a finding + one action, produced on the device by `computeAskInsights`.
- Legacy `AskMurmurRequest/Response` remain only for the deprecated one-shot route (build 17) and for
  rendering pre-rebuild rows (`replyFromStored` converts them).

## Storage
Migration 007 tables, unchanged. `ask_messages.response` holds the reply; the thread's focus and the
turn's compact tool records ride inside it. RLS `auth.uid() = user_id` on both tables — the server
writes with the caller's own JWT (`createClient(url, anon, { global: { headers: { Authorization } } })`),
so nothing needs a service role and a thread can only ever be read/written by its owner. Resume rule:
`resumeCandidate` returns the most recent thread if `last_message_at` is within 12 h.

## Model context per turn
`system` = identity/product rules · numbers rules · answer shapes · actions · scope · JSON shape · FACTS
(today/tz/locale/currency/income/counts) · DATA OVERVIEW (totals, windows present, **categories with
totals, frequent merchants**) · BUDGET block · CURRENT FOCUS · tapped insight (if any). Then the last 6
turns as `user` / `assistant("ANSWER: … / SHOWN: … / COMPUTED: [tool records ≤ 1.5 KB]")`, then the new
`user` message. First round `tool_choice: 'required'`.

## Grounding
Trusted set = this turn's tool results ∪ prior turns' `computed` and focus figures ∪ overview totals ∪
budget block ∪ tapped insight numbers ∪ numbers in the user's message ∪ monthly income. Every
currency/percent in text and blocks must be in it (±0.5 or 1 %); comparison words must agree with
`compare`. Failure → one retry with the specific reasons; if the retry is still flawed the better of
the two ships (never an empty answer). No stall/repeat/re-greet regex detectors — the conversation
design (real prior messages, required first tool call, focus) removes their cause.

## Capacity
The OpenAI org is on a 30k TPM gpt-4o tier. A turn is ~15–25k tokens (prompt + tools + context ×
2–3 rounds); two quick turns can trip it. The route waits Retry-After / 5 s / 8 s and retries, then
returns 503 `busy` (clients show "Murmur is busy — try again" with a retry). **Raise the tier before
launch** — see project memory.

## Deprecated
`apps/web/src/app/api/ai/ask-murmur/route.ts` (one-shot, `history` as text) serves TestFlight build 17
only. Delete it, `AskMurmurRequest.history`, and `AskMurmurResponse`'s prompt/validator in
`packages/ai/src/askMurmur.ts` once build 18 is installed (the shared number-extraction helpers in that
file are still used by `askConversation.ts` — move them first).
