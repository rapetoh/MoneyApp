# Ask Murmur — product spec (rebuild, Aug 16 2026)

Status: **authoritative** for the Ask Murmur rebuild. Written before code, per the owner's
directive (Aug 16): design the feature as one product, not a stack of fixes. Reference bar:
Cash App's in-app assistant — an agent that already *watches* your money, not a Q&A box.

Related: [PLAN.md](../PLAN.md) §NEXT, [ARCHITECTURE.md](./ARCHITECTURE.md) (how it is built),
[VERIFICATION.md](./VERIFICATION.md) (how it is proven).

---

## 1. What the user experiences

### 1.1 Entry — Murmur speaks first
Opening Ask (mobile `more/ask`, web `/dashboard/ask`) shows, **before the user types**, a ranked
list of *insights* computed from the user's own data on the device, instantly, with no model call:

| Kind | Example (en) | Suggested action |
|---|---|---|
| `upcoming_bill` | "Netflix $14 due Aug 22 · with $128 of bills still due, that leaves $1,043 this month" | Review recurring |
| `budget_pace` | "Budget: $412 left for 15 days · $27/day (your usual is $41/day)" | Adjust budget · See spending |
| `category_surge` | "Groceries $310 so far — 40% over your usual by this point in the month" | See groceries transactions |
| `subscriptions` | "Schwab + Xtream take $342 every month — keep or cut?" | Review recurring |
| `month_delta` | "Shopping is the biggest change vs last month: +$260" | See shopping transactions |
| `net_flow` | "Spent $1,329 of $2,500 income so far this month" | Ask "how am I doing?" |
| `large_transaction` | "Louis Vuitton $500 on Aug 16 — 6× your typical purchase" | See transaction |
| `no_data` | "Log a few expenses and Murmur starts watching your money" | Log an expense |

Rules: at most 4 insights, ranked by urgency/severity (see §3.3); each is a *finding + one decision*;
every number in an insight is computed deterministically (no LLM). Tapping an insight asks Murmur
about it (the insight becomes the first user turn, with the finding passed as context). The action
chip performs the real action (§4). Card treatment (owner review, Aug 16): a tonal icon tile + a
kind eyebrow ("Upcoming bill", "Running high", …) carry the tone — no coloured left stripes.

Below the insights: an intent row ("I want to… check my budget · cut a subscription · see where my
money went · plan a purchase") and the composer ("Ask anything about your money").

### 1.2 Conversation — stateful, resumable, one thread
- One thread per conversation. The composer is always at the bottom; sending never navigates.
- **Stateful.** The server keeps the whole conversation (messages *and* the figures each turn
  computed *and* a "focus" object: subject, period, entities). "What were those exactly?", "is it a
  good ratio out of how much I make?", "and last month?", "what else can you help me with?" resolve
  against that state. Murmur never re-greets mid-thread and never repeats an answer verbatim.
- **Persisted + resumable — but entry-first.** Every turn is stored server-side
  (`ask_conversations` / `ask_messages`), so nothing is ever lost, and it is the same thread on
  phone and desktop. Ask always **opens on the entry** (Murmur speaks first); it never jumps into an
  old thread by itself (owner review, Aug 16). A thread from the last 12 hours is offered as a
  "Pick up where you left off" card at the top of the entry; every thread is one tap away in History
  (list, open, delete). "New" starts a fresh thread and shows fresh insights.
- **Thinking state** is the Murmur mark breathing ("Reading your transactions…"), never a generic
  spinner.

### 1.3 Answers — shape follows the question
The reply is `text` (1–3 sentences, leads with the answer) plus zero or more **blocks**, chosen by
question type — never a fixed verdict+breakdown+chart card:

| Question | Shape |
|---|---|
| "How much did I spend on coffee this month?" | text + `figure` |
| "What were those?" / "show me the transactions" | text + `transactions` (date · merchant · amount · category) |
| "Where does my money go?" / "top merchants" | text + `chart` (+ `rows` when useful) |
| "Is that a good ratio of what I make?" | text with the ratio (computed by the `arith` tool) + `rows` (income · amount · share) |
| "Can I afford X?" | yes/no text with the numbers + `rows` (income · spent · still-due bills · left) |
| "How do I save $500 by October?" | text + `steps` |
| "This vs last month" | text + `rows` or `chart` (comparison) |
| "hey" / "what else can you help with?" | text only, grounded in one real figure / the current focus |
| Out of scope (§4.3) | text only, `out_of_scope: true` |

Every figure in `text`/blocks traces to a tool result, the data overview, the budget block, a
figure from an earlier turn, or the user's own words. Money is formatted in the user's locale.

### 1.4 Actions — real ones only
Chips under an answer (and on insights). Each performs something the app can actually do:

| Intent | Does |
|---|---|
| `show_transactions {query?, category_name?, merchant?, month?}` | opens the transactions list filtered |
| `set_budget {category_name?, amount?}` | opens Budgets with the editor prefilled |
| `open_recurring {name?}` | opens Recurring (pause / keep / edit the rule) |
| `log_expense` | opens the voice/log flow |
| `create_rule` | opens Recurring → new rule |

**Never offered:** moving money, paying, adding funds, auto-reload — Murmur is a tracker, not a bank.

---

## 2. Conversation state model

```
AskConversation { id, title, started_at, last_message_at }             // migration 007, unchanged
AskMessage      { id, conversation_id, role: 'user'|'assistant', question?, response?: AskReply }
AskReply        { text, sentiment, blocks, actions, focus: AskFocus|null, out_of_scope,
                  transaction_count, computed?: AskComputedRecord[] }  // computed = tool results of that turn (stored only)
AskFocus        { subject: string|null,          // "Savings & Investing", "coffee", "budget"
                  window: { name, start_date?, end_date? } | null,
                  entities: string[],            // merchants/categories named so far
                  figures: { label, value }[] }  // last turn's key numbers, ≤ 8
```

The thread's state IS its last assistant reply: `focus` and `computed` are persisted inside the
stored reply, so no schema change and nothing to drift. The turn response strips `computed`.

Per turn the server rebuilds the model context from: system prompt (identity + tool contract +
answer-shape rules + deterministic data overview + budget block + **current focus** = the last
reply's focus), then the last 6 turns as real chat messages — user text, and assistant
`ANSWER / SHOWN / COMPUTED` (compact tool results ≤ 1.5 KB per turn) — then the new user message.
The model returns `AskReply` including an updated `focus`, merged with the previous one and
persisted with the message. This is why follow-ups resolve: the
figures and the subject are in context, not just the previous verdict text.

Fallback state (no `focus` from the model): server derives `figures` from the tool results and
keeps the previous `subject`/`window`.

---

## 3. Deterministic layers (no model involved)

### 3.1 Tools (server, `packages/ai/src/askMurmurTools.ts`)
Kept: `total`, `sum_by_category`, `top_merchants`, `series`, `recurring_total`, `compare`, windows
incl. `custom`, 12-month reach. Added:
- `list_transactions {window, direction?, category_name?, merchant_contains?, min_amount?, limit≤25}`
  → rows `{date, merchant, amount, category}` sorted newest first + `total`, `count`. Answers
  "what were those exactly?".
- `arith {op: add|subtract|multiply|divide|percent_of, a, b}` → `{result}` (2-dp; percent_of = a/b×100).
  The model may not do arithmetic; ratios/differences it wants to quote go through this.
- `can_afford {available, cost}` → `{fits, left_after, shortfall, verdict}` — the yes/no of an
  affordability question is decided here, never by the model (Aug 16 trace: right numbers, wrong
  verdict on the "$1,200 laptop").
- `recurring_total` additionally returns `upcoming` (next occurrence per rule within 30 days, from
  the recurrence engine) when rules carry recurrence fields.
- The data overview now carries the user's **vocabulary**: category names with totals (≤ 30) and
  frequent merchants (≤ 20), so "invest" maps to the real "Savings & Investing" instead of an
  invented empty category.
- **Every turn's first model round must call a tool** (`tool_choice: 'required'`): no answer is
  produced from nothing (Aug 16 trace: "no investments this week" with zero tool calls).

### 3.2 Grounding validator
Every currency/percent figure in `text` and blocks must be traceable to: tool results of this turn,
figures from previous turns (persisted `computed`), the data overview, the budget block, or the
user's message. Untraced → one retry with the reason. Empty text → retry. Comparison direction
must agree with `compare`. Nothing else is regex-policed; the conversation design makes the old
stall/repeat/re-greet detectors unnecessary and they are removed (logged if reintroduced).

### 3.3 Insight engine (`packages/shared/src/domain/askInsights.ts`, runs on the client)
Input: transactions (12 mo), active recurring rules, budget status, monthly income, `now`, tz,
currency. Output: `AskInsight[]` sorted by score. Rules (all in the user's zone):
- `upcoming_bill`: next debit occurrence ≤ 7 days (recurrence engine); includes still-due-this-month
  total and "left this month" = income-this-month (or monthly_income) − spent − still-due. Score 90.
- `budget_pace`: active overall budget; remaining/days_left vs usual daily pace (last 3 full months);
  over budget → score 95, behind pace → 70, on track → 58.
- `category_surge`: month-to-date per category vs average of the same day-span in the previous 3
  months; needs ≥ 2 prior months with data, ≥ +40 %, ≥ 25 (profile currency). Score 80 + surge%/5.
- `subscriptions`: recurring monthly total ≥ 2 rules or ≥ 50; names the top two. Score 55.
- `month_delta`: biggest category change month-to-date vs same span last month (abs ≥ 30). Score 50.
- `net_flow`: spent vs income (this month credits, else monthly_income). Score 45.
- `large_transaction`: a debit in the last 7 days ≥ 3× median debit (90 d) and ≥ 100. Score 60.
- `no_data`: fewer than 3 transactions. Score 100 (only insight shown).
Dedup: one insight per kind; ≤ 1 per category; top 4. Text is templated per locale via `t()`.

---

## 4. Scope

### 4.1 In scope
Read/summarize, compare periods, trends, affordability with explicit assumptions (typical retail
price of a named item), budget status/pace, subscriptions audit, plans grounded in the user's numbers,
"what else can you help with?" (answered from what the data supports, referencing the focus).

### 4.2 Money rules the model must respect
- One definition of income per conversation: `total(direction=credit)` for the window; fall back to
  `monthly_income` only when the window has no income, and say so.
- A period's spending already contains the recurring bills charged in it; only
  `still_due_this_month_total` may be subtracted on top for "what's left".
- Never estimate subscriptions from raw rule amounts (weekly ≠ monthly) — `recurring_total` does it.
- Named windows exactly as the user says; "in June" → custom range; loose phrasing → say the range.

### 4.3 Refusals (`out_of_scope: true`, one polite sentence, no blocks/actions)
Specific securities/products/banks; tax preparation; legal advice; medical/insurance decisions;
anything needing external live knowledge (prices, news, markets, weather, reviews); and any request
to move, send, add or invest money through Murmur.

---

## 5. Surfaces

### 5.1 Mobile (`apps/mobile/app/more/ask.tsx`)
Header: close · Murmur mark + "Ask Murmur" · History · New. Body: entry (continue card → insights →
intents → composer) or thread (user bubbles right; Murmur turns left with mark, text, blocks, action
chips). Entry-first rule §1.2. Charts: categorical marks (donut slices, ranked/bucket bars) use the
same hue-spread palette as desktop; a single measure over time stays one colour. History = bottom sheet listing conversations (title, relative time, delete).
Plus gate unchanged (free → paywall on send). Text input only (voice inside Ask is not built).

### 5.2 Web / desktop (`apps/web/src/app/dashboard/ask/page.tsx`)
Left rail: New conversation + conversation list (active highlighted, delete). Main: same entry /
thread as mobile, composer pinned at the bottom, mic dictation kept. The old summary/deep dual
mode is gone — one conversation view.

### 5.3 Server (`POST /api/ai/ask-murmur/turn`)
Request: `{ conversation_id?, message, seed_insight?, locale, currency, now_utc, time_zone,
monthly_income, transactions, recurring_rules, budget? }`. Response: `{ conversation_id,
user_message_id, message: { id, reply: AskReply, created_at } }`. Errors: 401, 400, 402 (not Plus —
checked server-side against `profiles.plus_status`), 404 (conversation not the caller's / deleted),
429 (per-user rate limit, 120/h), 502 (model failure), 503 `busy` with `retry_after_seconds`
(OpenAI capacity after bounded waits). The route persists with the caller's JWT (RLS), so a
conversation is only ever read or written by its owner. No schema change: the thread's state is
its last stored reply. The legacy one-shot `/api/ai/ask-murmur` stays until TestFlight build 18 is
installed, then is deleted.

---

## 6. Verification (see VERIFICATION.md)
Unit: insight engine, new tools, validator, focus merge. Harness `apps/web/scripts/ask-murmur-e2e.mjs`
drives the **owner's transcripts** through the real API as threaded conversations (invest this
week → what were those exactly? → is it a good ratio out of how much I make? → what else can you
help me with?; hey → how am I doing → and last month?; PS5 → ok → laptop; coffee → Uber → this
month), asserts: 200s, no re-greeting, no verbatim repeat, `transactions` block on "what were
those", a percent on the ratio turn, every figure grounded, conversation resumable (messages read
back). Then a live production run and an honest walkthrough — never "ALL PASSED" without the
transcript.
