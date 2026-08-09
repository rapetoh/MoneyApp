# Executive summary — 360° audit

**Date:** 2026-08-08 · **Scope:** the entire application — mobile, web, desktop, shared packages, database, edge functions, AI pipeline, config and release setup
**Method:** eight independent domain audits, each then adversarially re-verified against the source by a second auditor whose job was to *refute* the first one's claims. Key facts checked directly against the live production database rather than inferred from code.
**Result:** **314 verified findings — 34 Critical, 99 High, 130 Medium, 51 Low**, across 8,000+ lines of documentation.

---

## The verdict

**This application is not ready for production.** All eight domains independently reached that conclusion, without conferring.

That needs to be said plainly, because it is the opposite of what you were told before. You were told the app was production-ready. It was not, and the gap is not marginal — it includes a headline feature that has never once worked, a parser instructed to divide amounts by a hundred, sign-in that cannot complete on two of your three platforms, and a save path that is structurally incapable of telling the user it failed.

The audit found no evidence that any of this was ever tested against reality. It was reasoned about, documented, and declared done.

---

## What you actually found on 2026-08-08

You reported thirteen problems in about thirty minutes. **All thirteen were real.** Not one was you misunderstanding the software. Details, with the database rows that prove each one, are in [00-YOUR-REPORTED-ISSUES.md](00-YOUR-REPORTED-ISSUES.md).

The thirteen were not thirteen mistakes. They were five underlying defects surfacing repeatedly — and the audit found each of those five defects has many more surfaces you had not reached yet.

---

## The five root causes

Almost every one of the 314 findings traces to one of these. They are listed in the order the fixes must happen, which is not the order of severity — see [10-FIX-PLAN.md](10-FIX-PLAN.md).

### 1. There is no shared domain layer, so every rule exists twice and the copies have drifted

This is the master cause. From [07-architecture-and-duplication.md](07-architecture-and-duplication.md):

> `packages/shared` holds types and three utilities, but every behavioural rule lives twice — once in `apps/mobile` and once in `apps/web` — and the two copies are kept in sync by comments that say "copy the change over here."

And `packages/supabase` — the shared query layer that exists precisely to prevent this — **is imported by zero source files.** It is referenced only by a babel alias, a tsconfig path, and a package.json dependency. It is scaffolding around an empty room.

So mobile and web each independently invented an answer to "what is this transaction's source?", "what colour is this category?", "what symbol is this currency?", "when does this rule fire next?", "what is this month's window?" — and their answers disagree. **Every inconsistency you photographed is one of those disagreements surfacing.** The money-math audit counted **six mutually incompatible definitions of "saved"** and four different regimes for what "this month" means. Recurrence scheduling is implemented three times, in three runtimes, all carrying the same month-end bug.

### 2. Write paths cannot report failure, so the app lies about success

`createTransaction` hard-codes `return { id, error: null }` — it is *incapable* of returning an error. The sync engine swallows exceptions into a retry counter that has no UI. The one place that does see a real error answers with `console.warn`. There is no retry scheduler at all: `retryTimer` is declared and cleared but never actually set, so a queue that fails while you are online stays parked until you relaunch the app.

This is why your recurring transactions "saved" successfully and produced nothing. It is also why you cannot trust any success message in the product today.

### 3. The app has no concept of what day it is for the user

`profiles.timezone` is declared in the schema, declared in the TypeScript types, given a default — and **never written and never read by a single line of application code.** All six production profiles say `UTC`. You are in US Central.

With no canonical answer available, nine separate month-window implementations each invented their own, and four runtimes now disagree about the current date: Vercel's Node (UTC), Electron's bundled server (your timezone), the browser (your timezone), the phone (your timezone) — plus a fifth opinion hard-coded into two migrations. Your calendar screenshot was one defect with three visible symptoms, and it mis-renders for **every user west of UTC**, which is every American user you will ever have.

### 4. The AI parse step was written as a prompt, not as a typed boundary

Whatever JSON the model emits is spread with `??` defaults and handed straight to the database — no enum check, no range check, no validation. There are zero automated tests for the parse pipeline, and `temperature` is unset, so the same sentence parses differently on two attempts.

The proportions inside the prompt tell the story better than any finding could. This is the **complete** specification for deciding whether money is coming in or going out:

> `- direction: "debit" (spending) or "credit" (income). Default "debit".`

Eleven words, no rule for investments, transfers, refunds, card payments or ATM withdrawals. Meanwhile `is_recurring_suggestion` gets roughly two hundred words and a dozen worked examples. Your Charles Schwab misclassification was never a model failure — the model was never told.

### 5. Device and platform reality was treated as a constant instead of a measurement

`useSafeAreaInsets` is called **zero times** in the entire mobile app. Clearance for the floating tab bar and home indicator is hard-coded as magic numbers across fourteen files. Several screens are fixed-height, non-scrolling columns sized for one specific phone.

Also in this category, and found only because someone looked: **no font is ever loaded.** There are 305 `fontFamily` rules referencing Plus Jakarta Sans, `expo-font` is a declared dependency, and there are no font files in the repository and no `useFonts()` call anywhere. Your entire brand typography has always silently rendered as system San Francisco, and every bold rule that omits an explicit `fontWeight` renders at regular.

---

## The Critical findings, de-duplicated

The 34 Critical rows collapse to **23 distinct defects** once cross-file duplicates are merged — several auditors hit the same defect from different angles, which is itself corroboration.

| # | Defect | Where it was found |
|---|---|---|
| 1 | Recurring rules can never be created — the rule insert races the offline sync queue and violates `fk_template_txn`; error swallowed. Proven in production Postgres logs, timestamped to your two transactions | 02-F6, 03-F1, 06-F1, 07-F1, 08-F2 |
| 2 | Calendar/Overview renders the wrong month for every non-UTC user — a `Date` built on the server is re-read with browser getters across the RSC boundary | 04-F1, 05-F1, 07-F2, 08-F1 |
| 3 | Sign-out clears neither the local database nor the sync queue — account A's data and a poisoned queue entry survive into account B | 06-F2, 08-F8 |
| 4 | Google sign-in on web **and** desktop can never complete — middleware redirects `/auth/callback` to `/login` before the code exchange runs | 06-F7, 08-F51 |
| 5 | Changing profile currency relabels every historical amount without re-converting it | 06-F8, 08-F5 |
| 6 | The local SQLite migration drops the FX columns it just added — every write throws for that whole session and snapshots are lost | 03-F3, 06-F6 |
| 7 | The prompt instructs the model to divide amounts by 100 in "retail/food context" — a $450 grocery run stores as $4.50 | 02-F5 |
| 8 | Direction has an eleven-word spec — investments and transfers parse as income | 02-F1 |
| 9 | `createTransaction` is structurally incapable of returning an error | 07-F4 |
| 10 | Sync failures are invisible, unbounded and self-resurrecting; the dead-letter UI does not exist | 07-F5 |
| 11 | Desktop requires a **service-role key in a plaintext file on the end user's machine** | 06-F3 |
| 12 | `sync_operations` INSERT policy is `WITH CHECK (true)` for role `public` — arbitrary writes with the anon key that ships in your app bundle | 06-F4 |
| 13 | "Developer → AI server URL" ships to production and redirects the Supabase access token with it | 08-F28 |
| 14 | The Plus purchase flow does not exist — the upgrade button is an empty handler, so every gated surface dead-ends | 08-F6 |
| 15 | No password-reset flow on any platform | 08-F7 |
| 16 | Parsed-Transaction sheet overflows its own `maxHeight` — the Save button lands below the screen edge *(your bug #1)* | 01-F1 |
| 17 | Manual entry's "Add expense" CTA sits entirely behind the tab bar on 667pt devices (iPhone SE/8) — the documented fallback for voice failure is unusable | 01-F2 |
| 18 | Mobile `Money` hard-codes `$` and `en-US` grouping on every hero amount | 08-F4 |
| 19 | No savings/transfer concept — Savings & Investing counts as consumption everywhere, and three unrelated formulas all render as "saved" | 05-F2 |
| 20 | Mobile budget spend adds future recurring rules of **both** directions in raw currency; web adds none | 05-F3 |
| 21 | `computeUpcomingRecurring` counts income rules as committed spend — and onboarding creates exactly such a rule | 03-F2 |
| 22 | Recurring next-occurrence is computed by two writers in two timezones, producing different UTC dates — a duplicate charge slips past the dedup index | 04-F2 |
| 23 | `setMonth(+n)` with no day clamp — a rule on the 31st skips February and drifts to the 3rd forever | 04-F3 |

Two more that are not Critical only because nothing currently triggers them, and both would be Critical the moment you have real users: **mobile only ever pulls 200 transactions and never paginates** (every mobile total silently goes wrong past that point), and **the `supabase_realtime` publication contains zero tables**, so all six realtime subscriptions in the codebase have been dead since day one.

---

## Things that are wired to nothing

Features that exist as UI, copy and permission prompts, with no working implementation behind them:

- **Plus / subscriptions** — the upgrade button's `onPress` is empty
- **Android notification listener** — the toggle requests Notification Access and its handler is `() => {}`
- **Apple Pay Shortcut** — the install link is literally `.../shortcuts/placeholder`
- **Password reset** — absent on every platform
- **Realtime sync** — six subscriptions, zero published tables
- **On-device parsing** — `parseExpenseLocally` is unreachable dead code while the recording screen displays "Processed on-device" with a padlock
- **Web i18n** — a four-language picker over an English-only dashboard

---

## Two disclosure problems

These are not bugs; they are statements to users that do not match what the software does. On a finance app in the US, treat them as legal review items, not backlog items.

1. **"Processed on-device"** is displayed with a padlock icon while transcripts are POSTed to Vercel and on to OpenAI. The local parser that would justify the claim is unreachable dead code.
2. **OpenAI is an undisclosed subprocessor.** Your Privacy screen's claims about what leaves the device do not match the pipeline. Receipt photographs and voice transcripts — both of which can contain names, addresses and account numbers — are sent to a third party you do not name.

Separately, and needing action regardless of anything else in this document: **a Supabase secret key sits in plaintext in your production database**, inside `cron.job.command` for the `generate-recurring-daily` job. It should be rotated and moved to Vault.

---

## What verification changed

The second pass mattered, and it is worth knowing what it caught, because it tells you how much to trust the rest.

Every finding's *core* mechanism survived — no finding was deleted as wholly false except one in the architecture file. But **64 sub-claims inside those findings were wrong** and are now corrected in place, with each correction recorded in a "Refuted during verification" section rather than quietly dropped. Wrong line numbers, wrong grep counts, mechanisms that a guard clause actually prevented, and severities that were inflated.

Several "High" findings were downgraded once verification established they are **latent rather than currently firing** — for example, all six production profiles are USD/en/UTC, so the currency-formatting defects are real bugs that your current data does not yet expose. They are marked as such. That distinction is the difference between a document you can plan from and a document that just frightens you.

Verification also *found* things. The most useful: React Native's `KeyboardAvoidingView` compares a parent-relative frame against a screen-space keyboard coordinate, so every instance not mounted at the screen origin under-lifts. That single fact explains why three separate layout findings resist the obvious "just add a KeyboardAvoidingView" fix — which is exactly the kind of thing that would have caused a fix to be attempted, shipped, and found still broken.

---

## What I would say if you asked whether to ship

Do not ship this to TestFlight for real users yet.

Not because 314 findings is an unrecoverable number — most are Medium and Low, and a large share collapse into a handful of shared-module fixes. But because five of the Critical defects mean the app **silently produces wrong money or silently discards user data**, and a money app that quietly loses your record is worse than one that visibly crashes. A crash you retry; a silent loss you find out about months later when the numbers do not match your bank.

The good news, and it is real: the fixes concentrate. Build the five missing foundations — a canonical day/timezone convention, a shared money and period module, a typed Supabase client, a sync engine that can report failure, and a typed parse boundary — and a large fraction of the 314 resolve as a consequence rather than one at a time. That is the argument of [10-FIX-PLAN.md](10-FIX-PLAN.md), which is ordered by dependency rather than severity, because fixing these in severity order would mean fixing several of them twice.

---

## The files

| File | What it covers | Findings |
|---|---|---|
| [00-YOUR-REPORTED-ISSUES.md](00-YOUR-REPORTED-ISSUES.md) | Your thirteen, each verified against the database | 13/13 confirmed |
| [01-mobile-ui-and-layout.md](01-mobile-ui-and-layout.md) | Safe areas, sheets, keyboards, fonts, touch targets | 37 |
| [02-ai-parsing-and-scan.md](02-ai-parsing-and-scan.md) | Prompts, validation, scan rejection, Ask Murmur | 35 |
| [03-recurring-system.md](03-recurring-system.md) | The recurring subsystem end to end | 38 |
| [04-dates-timezones-calendar.md](04-dates-timezones-calendar.md) | Every date computation in the repo | 34 |
| [05-money-math-and-forecasts.md](05-money-math-and-forecasts.md) | Every aggregate, with a full formula table | 36 |
| [06-data-sync-and-security.md](06-data-sync-and-security.md) | Schema, sync engine, RLS, auth, secrets | 39 |
| [07-architecture-and-duplication.md](07-architecture-and-duplication.md) | Why all of this keeps happening | 44 |
| [08-product-sweep-every-screen.md](08-product-sweep-every-screen.md) | Screen-by-screen, states, copy, dead ends | 51 |
| [10-FIX-PLAN.md](10-FIX-PLAN.md) | Dependency-ordered work order | — |

Nothing in these files has been fixed. You asked to review the audit before any code changes, and no application code has been touched.
