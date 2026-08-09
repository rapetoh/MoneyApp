# Your reported issues — verified status

**Audit date:** 2026-08-08 · **Source:** your 2026-08-08 test session (11 screenshots in `remarks found on 08-08/`)
**Verification method:** every claim below was checked against the live production database (Supabase project `ohaqhwampmyoeaopdybd`) and against the source code. Nothing here is inferred.

This file exists to answer one question for each thing you found: **were you right?**

The short answer: **you were right about all thirteen.** Not one of them was you misunderstanding the software. Two of them (the $92 ring and the "Recurring" source chip) are cases where the code is doing something deliberate, but the deliberate thing is wrong or unexplainable — which is still a defect, not a misunderstanding.

---

## Ground truth pulled from the production database

Your test account is `gadgetmaison021@gmail.com`. These are its three transactions, exactly as stored:

| Merchant | Amount | Direction | Category | Source | is_recurring | recurring_rule_id | Note | transacted_at (UTC) |
|---|---|---|---|---|---|---|---|---|
| Charles Schwab | 300.00 | `debit` | Savings & Investing | `voice` | `true` | **NULL** | **NULL** | 2026-08-08 14:54:10 |
| Xtream | 42.00 | `debit` | Utilities | `manual` | `true` | **NULL** | **NULL** | 2026-08-08 14:39:14 |
| Starbucks | 50.00 | `debit` | Food & Dining | `voice` | `false` | NULL | **NULL** | 2026-08-08 14:33:34 |

Three facts from that table drive most of what follows:

1. **`recurring_rules` contains zero rows.** Not just for you — for every user in the database, since the table was created. The recurring feature has never once produced a rule in production.
2. **`transactions.source` is a constrained column** whose only legal values are `voice`, `manual`, `scan`, `shortcut`, `notification_listener`, `recurring_generated`. `recurring` is not one of them. The Xtream row's real source is `manual`.
3. **Every profile in the database has `timezone = 'UTC'`.** All six of them. You are in US Central. The column exists, and nothing has ever written a real value into it.

---

## Issue by issue

### 1. Save button cut off at the bottom of the Parsed Transaction sheet
**Screenshots:** 09:40:50, 09:40:50 (2), 09:53:28 · **You said:** unbearable, unacceptable · **Verdict: confirmed, and worse than you saw.**

You hit it on the receipt-scan result and the paycheck-scan result. The 09:53 screenshot shows it on the voice-parse result too. It is the same sheet component in all three cases, so it is one bug with three faces — and it sits on the single most important button in the application. Full root cause in [01-mobile-ui-and-layout.md](01-mobile-ui-and-layout.md).

Your instinct that a disabled button must still be *visible* is correct and is standard practice: a disabled control that is off-screen is indistinguishable from a broken app.

### 2. Spinner appears on "Scan Receipt" when you tapped "Scan Paycheck"
**Screenshot:** 09:40:50 (1) · **Verdict: confirmed.**

Two buttons, one shared loading flag. You pressed one and the other one animated. See [01-mobile-ui-and-layout.md](01-mobile-ui-and-layout.md).

### 3. "PROCESSING" pill hidden behind the status bar / Dynamic Island
**Screenshot:** 09:53:48 · **Verdict: confirmed.**

The recording overlay renders without a top safe-area inset, so its status text slides under the system clock. See [01-mobile-ui-and-layout.md](01-mobile-ui-and-layout.md).

### 4. "Mark as recurring" buried behind "More options" in manual entry
**Screenshot:** 09:38 · **Verdict: confirmed as a design defect, and you are right on the merits.**

This is not merely a preference. Recurring is the property that decides whether a transaction becomes a *rule* that projects into the future — it changes forecasts, budgets and the recurring page. Hiding a forecast-altering control behind a secondary menu, while the merely descriptive category sits in the primary flow, inverts the actual importance of the two fields. Placement recommendation in [01-mobile-ui-and-layout.md](01-mobile-ui-and-layout.md).

### 5. Recurring page says "No recurring rules yet" after you marked a transaction recurring
**Screenshot:** 09:41:44 · **You said:** betrayal · **Verdict: confirmed. This is the most serious defect found in the entire audit.**

The database proves it. When you toggle "Mark as recurring", the app sets `is_recurring = true` on the transaction row and stops there. It never creates the `recurring_rules` row that the toggle implies, and it never links the transaction to one (`recurring_rule_id` is NULL on both of your recurring transactions).

So the recurring icon you see next to Xtream in the transaction list is telling you the truth about a flag — and lying about a feature. The web Recurring page is not broken; it is correctly reporting that no rules exist. **The feature was never wired up end to end.** `recurring_rules` has been empty in production for its entire existence.

The downstream consequences are worse than the empty page: nothing projects your subscriptions forward, the "NEXT 30 DAYS · CHARGES" calendar can never populate, the monthly/annual cost totals are permanently $0, and the forecast has no recurring commitments to reason about. Full trace in [03-recurring-system.md](03-recurring-system.md).

### 6. Budgets page shows "$92" with no budget set
**Screenshot:** 09:44:02 · **You asked:** what is the reasoning, am I stupid? · **Verdict: you are not stupid. The number is real; the presentation is indefensible.**

$92 is your month-to-date spending: Starbucks $50 + Xtream $42. It is a true number. But it is rendered inside a *budget* ring, under the caption "No overall budget", with no label saying what it is. A ring is a progress indicator — putting a number in the middle of one implies progress toward a limit. There is no limit, so the number means nothing in that context.

You looked at a budgets page with no budgets and saw a dollar figure. Asking "why is that there" was the correct response. Detail and the fix in [05-money-math-and-forecasts.md](05-money-math-and-forecasts.md).

### 7. Calendar: August 2026 selected, clicked Aug 8, panel showed "WEDNESDAY · JUL 8"
**Screenshot:** 09:47:46 · **Verdict: confirmed, and there are three separate bugs stacked in that one screenshot.**

- **The month is off by one.** You clicked day 8 of August and the panel computed July 8. July 8 2026 genuinely is a Wednesday, so this is not a random label — a real date exactly one month earlier was constructed.
- **The weekday grid is misaligned.** The grid puts "1" in the FRI column. August 1 2026 is a **Saturday**. Every date in that grid sits under the wrong weekday name.
- **Your transactions were invisible to the calendar.** It said "No spending logged this month yet" while the Transactions page listed two transactions from that same morning. The day-bucketing does not agree with the transaction list.

The third one has a systemic cause that reaches beyond the calendar: your profile timezone is stored as `UTC` while you live in US Central, and the app has no code path that ever writes your real timezone. Anything logged after 7pm Central lands on the *following* day in UTC, so late-evening spending will be filed under tomorrow across the whole product. Full analysis in [04-dates-timezones-calendar.md](04-dates-timezones-calendar.md).

### 8. "Recurring" shown in the SOURCE column on the Transactions page
**Screenshot:** 09:51:14 · **You asked:** is recurring a source? Can I not see the real source? · **Verdict: you are exactly right on both counts.**

No, recurring is not a source. The database agrees with you: that column is constrained to `voice`, `manual`, `scan`, `shortcut`, `notification_listener`, `recurring_generated`, and your Xtream row is stored as `manual`. The web page is overwriting a factual column with an unrelated boolean property at display time.

And yes — the consequence is precisely the one you identified: **you can no longer see how that transaction was actually entered.** The information is in the database and the UI is hiding it behind a property that is already shown by the icon next to the merchant name. You are being shown the same fact twice while a different fact is suppressed. See [03-recurring-system.md](03-recurring-system.md).

### 9. Voice: "investing $300 at Charles Schwab in the S&P 500" classified as **Income**
**Screenshots:** 09:53:28, 09:53:48 · **Verdict: confirmed misclassification. Your reasoning is correct.**

Money moving into an investment account is an outflow from your spendable balance. It is not income. Treating it as income would inflate your earnings, understate your outflows, and corrupt every downstream number — savings rate, forecast, cashflow.

The database shows the saved row as `debit`, which means you caught it and flipped it before saving. That is the system making *you* do quality control on its core function. On the parse before your correction, it proposed Income. See [02-ai-parsing-and-scan.md](02-ai-parsing-and-scan.md).

### 10. "S&P 500" dropped from the note
**Screenshot:** 09:53:28 · **Verdict: confirmed. `note` is NULL in the database.**

You said the words "in the S&P 500" out loud. The app captured the merchant and discarded the rest. Your expectation — that the distinguishing detail of the utterance should land in the note automatically — is the reasonable one, and it is what a voice-first product has to do to justify being voice-first. Otherwise speaking a rich sentence gets you the same result as typing two fields.

Worth noting: **`note` is NULL on all 18 transactions in the database, across every user, for the entire history of the app.** The note field has never once been populated by any entry path. See [02-ai-parsing-and-scan.md](02-ai-parsing-and-scan.md).

### 11. Scanning a non-receipt still opened the editor with $0.00 and a merchant
**Screenshots:** 09:40:50, 09:40:50 (2) · **Verdict: confirmed.**

The validator did its job and said the image was not a receipt. The app then opened the full editing sheet anyway, pre-filled with $0.00 and low confidence, one tap away from writing garbage into your ledger. A rejection that does not stop the flow is not a rejection.

Related and also confirmed: the paycheck attempt showed merchant **XTREAM** — carried over from your *previous* receipt scan. State is not being cleared between scan attempts, which means one scan can contaminate the next. See [02-ai-parsing-and-scan.md](02-ai-parsing-and-scan.md).

### 12. Forecast of $1,519 from three transactions totalling $392
**Screenshot:** 10:00:59 · **You asked:** explain how that happened · **Verdict: confirmed. Here is the arithmetic.**

$392 spent ÷ 8 days elapsed × 31 days in August = **$1,519.00**. Exactly the number on your screen.

It takes your spending so far this month, divides by how far into the month you are, and multiplies by the full month. On 8 August with three transactions from a single day, that is not a forecast — it is one day of activity multiplied by thirty-one and presented in a serif font with a confidence it has not earned.

Two further problems compound it: the $300 Schwab transfer is counted as *consumption*, so the projection treats moving money into savings as if it were burning it; and the chart's "Based on 3 transactions across the last 6 months" framing dresses up a cold-start with the language of history. The same $300 drives the "Savings & Investing is 77% of your spend" pattern claim ($300/$392 = 76.5%). See [05-money-math-and-forecasts.md](05-money-math-and-forecasts.md).

### 13. "Saturday is your heaviest day — avg $33" from one day of data
**Screenshot:** 10:00:59 · **Verdict: confirmed as a defect even though the day name is right.**

Aug 8 2026 is a Saturday, so that label is accurate. But it is derived from a single day of data and stated as an established habit. A product that tells a user their behavioural pattern on day one, from one day, is not analysing — it is guessing with a straight face. (Note the calendar grid disagrees and files Aug 8 under Friday, per issue 7 — so two surfaces of the same app currently disagree about what day your money moved.) Minimum-sample thresholds are covered in [05-money-math-and-forecasts.md](05-money-math-and-forecasts.md).

---

## What this list says as a whole

These are not thirteen unrelated slips. Grouped by cause:

- **Two of them are one architectural hole** (5, and the empty-rules consequence): a feature with a UI toggle, a database table, a detector, an edge function and a whole web page — with no code connecting the toggle to the table.
- **Three are one timezone decision never made** (7, and the day-bucketing beneath it): dates are stored as instants, displayed as days, and the user's actual timezone is never recorded.
- **Three are the parser being under-specified** (9, 10, 11): no rule for transfers, no rule for capturing detail, no rule for what a rejection means.
- **Three are layout done without device constraints** (1, 2, 3): no safe-area discipline, shared state driving distinct controls.
- **Three are numbers shown without their meaning** (6, 12, 13): true values placed in contexts that imply something they do not support.

The individual fixes are in the numbered files. The reason all five clusters exist at once is in [07-architecture-and-duplication.md](07-architecture-and-duplication.md), and the honest answer is that logic is implemented separately per platform rather than once in shared code, so every concept gets a chance to drift — and drift is exactly what you photographed.
