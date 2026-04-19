# Product Requirements Document
## Murmur (formerly "Voice Expense Tracker" / "Money App")

**Version**: 1.1
**Date**: April 18, 2026
**Status**: Approved — redesign in progress per [DESIGN.md](./DESIGN.md)

> **Murmur redesign — active since April 18, 2026.** The product thesis, visual
> language, information architecture, and monetization model have been refined
> via a Claude Design session. The authoritative design spec lives in
> [DESIGN.md](./DESIGN.md). The implementation plan lives in the user's personal
> plan file (`~/.claude/plans/breezy-painting-zephyr.md`). This PRD is being
> updated incrementally as each phase lands — sections marked **[Murmur]** have
> been reconciled with the new design.

---

## 1. Problem Statement

Tracking personal expenses manually is slow and gets abandoned. Apps that automate it through bank linking (Mint, Monarch Money, YNAB) require users to hand over bank credentials to third parties — which a significant segment of users refuses to do. Mint shut down in March 2024, displacing 3.6 million users with no strong privacy-first alternative to land on.

Existing voice expense apps (MonAi, TalkieMoney, Vocash) solve the speed problem but stop there. They are mobile-only, have limited or no analytics, and none of them give users a clear picture of what they can actually afford to spend.

**The gap**: A voice-first expense tracker that is fast to use, requires no bank credentials, and gives users genuinely useful financial intelligence — not just a log of what they spent.

---

## 2. Product Vision

A voice-first, privacy-first expense tracking app that lets users log expenses in seconds by speaking naturally, then helps them understand and improve their financial situation through intelligent analysis and a powerful desktop companion.

**Core thesis**: Voice solves the speed problem of manual entry. Intelligence solves the "so what?" problem of raw data.

---

## 3. Target Users

### Primary — The Privacy-Conscious Tracker
- Refuses to link bank accounts (distrust of Plaid, data breaches, broken sync)
- Currently uses a manual method (spreadsheet, notes app, or nothing)
- Wants to track expenses but abandons apps that are too slow or too complex
- Age: 25–45, tech-comfortable but not tech-obsessed
- International users locked out of Plaid-based apps

### Secondary — The Mint Refugee
- Was using Mint before its 2024 shutdown
- Doesn't want the complexity of YNAB or the bank-linking requirement of Monarch
- Wants something simple that just works

### Tertiary — The Financial Goal Setter
- Has a specific goal (buying a car, saving for a house, paying off debt)
- Wants to understand how their daily spending connects to their goal
- Will pay for a tool that gives them real answers, not generic tips

---

## 4. Platforms

| Platform | Type | Notes |
|----------|------|-------|
| iOS | Native mobile app | React Native + Expo |
| Android | Native mobile app | React Native + Expo |
| macOS | Desktop app | Electron wrapping Next.js |
| Windows | Desktop app | Electron wrapping Next.js |
| Web browser | Web app | Next.js (same codebase as desktop) |

---

## 5. Features

### 5.1 Voice Expense Logging *(Core — MVP)*
Users log expenses by speaking naturally. The app extracts the structured data.

**User story**: *As a user, I want to say "coffee at Starbucks, four fifty" and have the app create a categorized transaction in under 4 seconds, so that I can log expenses without breaking my stride.*

**Behavior**:
- Tap the mic button → speak → tap stop (or silence detection)
- Interim transcript displayed in real-time as user speaks
- AI extracts: amount, merchant, category, date, payment method
- Confirm modal shows extracted fields — all editable inline
- If AI is uncertain about a field, it highlights it for user review
- If input conflicts with existing data (e.g. duplicate, or matches a recurring rule), app asks one smart clarifying question before saving
- Audio never leaves the device — only the text transcript is sent to AI

**Supported languages**: English, French, Spanish, Portuguese (v1)

---

### 5.2 Receipt / Paycheck Scanning *(Core — MVP)*
Users photograph a receipt or paycheck. AI reads the image and pre-fills the transaction.

**User story**: *As a user holding a paper receipt, I want to photograph it and have the app extract the amount, merchant, and date automatically, so I don't have to type anything.*

**Behavior**:
- Tap "Scan" → camera opens
- Photograph a receipt → AI extracts: amount, merchant, date, category suggestion
- Photograph a paycheck → AI extracts: net amount, employer, pay period → logged as income
- Same confirm modal as voice — all fields editable before saving
- If image is too blurry or dark → error message + prompt to retake
- Image is sent to AI API for parsing then immediately discarded — never stored anywhere

---

### 5.3 Merchant Logos *(Core — MVP)*
Every transaction displays the merchant's real logo where available, falling back to a clean avatar.

**Behavior**:
- AI returns a `domain` field alongside each parsed merchant (e.g. `netflix.com`, `starbucks.com`)
- Logo fetched from Clearbit Logo API: `logo.clearbit.com/{domain}`
- Logo cached locally on device — fetched once, reused forever
- Unknown or local merchants → colored circle with merchant initial (color is deterministic from merchant name — same merchant always gets same color)
- Logos shown in: transaction list, confirm modal, spending summaries, desktop dashboard

**Privacy**: only well-known merchant domains are sent to the logo API. Ambiguous or local merchants use the avatar fallback — no third-party call made.

---

### 5.4 Manual Entry Fallback *(Core — MVP)*
Fast form-based entry for situations where voice is awkward (public places, meetings, noise).

**User story**: *As a user in a public place, I want to log an expense by typing quickly without going through a multi-step form, so that I never miss logging a purchase.*

**Behavior**:
- Accessible from home screen in one tap
- Minimal fields required: amount + category (everything else optional)
- Saves in under 3 taps

---

### 5.5 Safe to Spend *(Core — MVP)*
A single number on the home screen showing what the user can actually spend freely this month — after accounting for what's already spent and what's coming up.

**User story**: *As a user, I want to open the app and immediately see how much I can spend for the rest of the month without blowing my budget, so that I can make quick spending decisions with confidence.*

**Formula**:
```
Safe to Spend = Monthly Budget − Amount Spent This Month − Upcoming Recurring Expenses
```

**Behavior**:
- Displayed prominently on mobile home screen
- Updates in real-time as transactions are logged
- If over budget: shows $0 + "over budget by $X" warning (never shows negative)
- If no budget set: prompts user to set one; shows spending total in the meantime
- Desktop shows full breakdown: spent / committed upcoming / free

---

### 5.6 Apple Pay / Google Pay Automation *(Core — MVP)*
Automatically detects payment app transactions and pre-fills a draft expense for quick confirmation.

**User story**: *As a user who pays with Apple Pay, I want the app to detect my payment and pre-fill the expense details so I only need to tap confirm, not type anything.*

**Behavior**:
- iOS: via Shortcuts app integration (one-time 30-second setup, guided in-app)
- Android: via notification listener (user explicitly opts in)
- Detection opens a confirm modal pre-filled with amount and merchant
- Fully optional — app works completely without it
- No payment data stored server-side

---

### 5.7 Transaction Management *(Core — MVP)*
Full control over logged transactions.

**Behavior**:
- Real-time transaction list, sorted by date
- Edit any field on any transaction
- Soft delete with 30-day recovery window
- Filter by date range, category, payment method
- Search by merchant or note
- Payment method tracking: cash, credit card, debit card, digital wallet, bank transfer

---

### 5.6 Categories *(Core — MVP)*
Flexible, AI-inferred categories with no fixed list.

**Behavior**:
- AI suggests a category based on what the user said
- If the merchant has a history, AI silently applies the user's previous categorization
- User can rename, create, merge, or delete categories
- Categories can be nested (e.g. "Food → Dining Out", "Food → Groceries")
- No mandatory category list — the app adapts to how each user thinks about their money

---

### 5.7 Recurring Transactions *(Core — MVP)*
Log and track expenses that happen on a schedule.

**User story**: *As a user with a Netflix subscription, I want to set it as recurring so the app reminds me when it's due and counts it against my available budget before it hits.*

**Behavior**:
- Set any transaction as recurring: daily, weekly, biweekly, monthly, quarterly, yearly
- Recurring expenses are counted in Safe to Spend before they are logged
- App reminds user at end of month if a recurring expense hasn't been logged yet
- When voice input matches an existing recurring rule, app asks: "Is this your regular [Netflix], or a separate charge?"
- Skip option for one-off months (e.g. cancelled a subscription this month)

---

### 5.8 Budgets *(Core — MVP)*
Per-category spending limits that give users guardrails.

**Behavior**:
- Set a budget amount per category per period (weekly, monthly, quarterly, yearly)
- Visual progress bar per budget (green → yellow → red)
- Proactive notification when a budget is exceeded
- Budget utilization shown on both mobile summary and desktop dashboard

---

### 5.9 Spending Summaries — Mobile *(Core — MVP)*
At-a-glance financial overview on mobile.

**Behavior**:
- Daily, weekly, monthly totals
- Category breakdown as a ranked list
- Month-over-month comparison ("You've spent $120 more on food than last month")

---

### 5.10 Analytics Dashboard — Desktop *(Core — v1)*
Deep financial analysis on the desktop companion.

**User story**: *As a user, I want to sit down on Sunday evening and see exactly where my money went this month, how it compares to last month, and where I'm trending.*

**Behavior**:
- Spending trend charts: daily, weekly, monthly, quarterly, yearly
- Category analysis: breakdown by category with time comparisons
- Safe to Spend full breakdown panel (spent / committed / free)
- Budget tracking with progress visualization
- Full transaction table: sortable, filterable, searchable
- Data export: CSV and PDF reports
- Real-time sync — updates live as mobile transactions are logged

---

### 5.11 Forecasting *(v1)*
Spending projections based on historical patterns.

**Behavior**:
- Requires minimum 30 days of data (shown as a progress meter below threshold)
- Projects next 30 and 90 days per category using weighted average of recent history
- Displayed as a chart on desktop dashboard
- Designed to be honest: "based on your last 3 months" — not "guaranteed"

---

### 5.12 AI Financial Advisor *(v1)*
A conversational interface that answers questions about the user's specific financial situation.

**User story**: *As a user, I want to ask "can I afford a $6,000 car this year?" and get an answer based on my actual income and spending, not generic advice.*

**Behavior**:
- Chat interface on mobile (dedicated tab) and desktop (panel)
- User asks questions in natural language — typed or voiced
- AI responds using the user's real data: income, spending history, recurring expenses, savings rate
- Supports: goal planning, what-if scenarios, subscription analysis, investment projections (with historical disclaimers)
- Every response includes: "Based on your data and historical averages — not financial advice."
- Conversation is session-based: nothing is stored after the session ends
- Suggested starter questions shown to new users
- Requires income to be set in Settings for goal-related questions

---

### 5.13 Offline Support *(Core — MVP)*
The app works without internet. Data syncs when reconnected.

**Behavior**:
- All logging (voice and manual) works offline
- Offline transactions stored locally and synced to server on reconnect
- No data loss if app is killed mid-sync
- Clear indicator when items are pending sync
- Conflict resolution when the same transaction is edited on two devices while offline

---

### 5.14 Home Screen Widgets *(v1)*
Quick-access and at-a-glance information without opening the app.

**Behavior**:
- iOS: WidgetKit widget showing today's spend total + button to open voice entry directly
- Android: App Widget with same functionality
- Updates within 5 minutes of a new transaction being logged

---

### 5.15 Multi-Device Sync *(Core — MVP)*
Seamless experience across all the user's devices.

**Behavior**:
- Real-time sync across mobile and desktop
- Same account usable on iOS + Android + desktop simultaneously
- Changes appear on other devices within 3 seconds when online

---

## 6. Intelligence Behaviors

The app is contextually aware. It uses what it already knows to make smart decisions without interrupting the user — and asks exactly one clarifying question only when the answer genuinely changes what it does.

| Trigger | App Behavior |
|---------|-------------|
| Voice logs income when income is already set in profile | Asks: "Replace your current $X/month, or add as additional income?" |
| Voice input matches an existing recurring rule | Asks: "Is this your regular [Netflix], or a separate charge?" |
| Same amount + merchant logged twice within 10 minutes | Asks: "Possible duplicate — did you mean to add this twice?" |
| Merchant has consistent historical category, AI suggests different | Silently applies historical preference — no interruption |
| Budget exceeded | Sends notification: "You've passed your [Food] budget for this month" |
| Spending spike: 3x+ above category average | Surfaces as insight in summary |
| Goal set in Advisor, then conflicting large expense logged | Nudge: "This $800 purchase pushes your [car goal] back by ~2 months" |
| Recurring rule due but not logged by end of month | Reminder: "Your [Gym - $50/month] hasn't been logged yet" |

---

## 7. Privacy Requirements

Privacy is a core selling point, not a checkbox.

- Audio never leaves the device — only the extracted text transcript is sent to AI for parsing
- AI API calls are proxied through our own server — no AI provider keys in the app
- `raw_transcript` stored locally only; never synced to server unless user explicitly opts in
- All data encrypted at rest in Supabase
- Users can delete all their data at any time (Settings → Delete Account triggers full cascade delete)
- Privacy policy is specific and human-readable — no vague "we may share with partners" language
- No advertising, no selling of user data, ever
- Advisor conversations are never stored server-side

---

## 8. Auth **[Murmur — lazy identity, April 18, 2026]**

- **No sign-in wall at first launch.** The app works fully offline against a
  local `device_user_id`. Users can log expenses, see insights, set budgets,
  and use every free mobile feature without creating an account.
- **Sign-in is triggered on-demand** when the user takes an action that needs
  server-backed identity:
  1. Pair a Mac desktop (Plus only)
  2. Restore on a new phone (after device loss / reinstall)
  3. Explicit "create account" in Settings
- **Providers supported** (all preserved from v1.0):
  - Sign in with Apple (iOS + macOS)
  - Sign in with Google (iOS + Android + Web)
  - Email + password
- On first sign-in, all local-only transactions reconcile from the anonymous
  `device_user_id` to the new Supabase `auth.users.id`.
- Supabase Auth handles all sessions and tokens (unchanged from v1.0).

**What changed from v1.0**: added the lazy-identity model and the
"no sign-in at launch" principle. Provider list is unchanged — Apple, Google,
and email/password all remain supported.

---

## 9. Out of Scope (v1)

These are explicitly not in v1:

- Bank account linking / Plaid integration
- Shared accounts or family budgeting
- Investment portfolio tracking
- Tax reporting
- In-app bank transfers or payments
- Social features

---

## 10. Success Metrics

| Metric | Target |
|--------|--------|
| Day-7 retention | > 40% |
| Day-30 retention | > 20% |
| Voice entry adoption | > 60% of transactions logged by voice |
| Avg transactions per active user per month | > 20 |
| App Store / Play Store rating | ≥ 4.5 stars within 3 months |
| Free → paid conversion rate | > 8% |
| Avg revenue per paying user | > $25/year |

---

## 11. Monetization **[Murmur — finalized April 18, 2026]**

**Model**: Mobile-free-forever + paid Plus tier.

| Tier | Price | Features |
|------|-------|---------|
| Free (mobile) | $0 | Everything the mobile app does: voice/manual/scan logging, full history, budgets, basic insights, recurring (manual), multi-device sync, merchant logos, home-screen widgets. No feature locked behind a paywall on mobile. |
| Murmur Plus | $3.99/month or $29.99/year (~35% off yearly) | **Ask Murmur** (grounded AI Q&A), **automatic recurring detection** (free tier adds recurring manually), **data export** (CSV, PDF, JSON), **macOS desktop companion app** |

**No trial. No auto-renew-after-trial trap.** See [DESIGN.md](./DESIGN.md) §10
for the rationale — we are deliberately positioning against MonAi's auto-trial
pattern. Yearly plan is featured; monthly exists for users who want to sample
the desktop app for one billing cycle.

**What changed from v1.0 of this PRD**: previously the Pro tier gated desktop
analytics, AI Advisor, forecasting, budgets, export, widgets, full history, and
multi-device sync. The Murmur redesign moves budgets, widgets, full history,
and multi-device sync into the free mobile tier — the paid gate is now a tight
bundle of **AI + automation + desktop**, the three genuinely premium surfaces.

---

*End of PRD*
