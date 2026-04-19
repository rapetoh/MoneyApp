# Murmur — Design Document

A companion to the mockups in `Murmur Mockups.html`. Written for a developer
(likely Claude Code) who needs to implement or align an existing codebase
against this design.

---

## 1. What Murmur is

Murmur is a **voice-first, privacy-first personal expense tracker**.

- **Mobile app** (iOS-first) is free forever and does the full job: logging,
  browsing, budgets, basic insights.
- **Desktop companion** (macOS) is the paid tier. It hosts deep analytics,
  forecasting, and the AI goal planner.
- **No bank linking.** Ever. That's a product principle, not a v1 shortcut.
- **No surveillance.** Voice is processed on-device by default. Data lives
  in the user's own iCloud. Our servers store nothing identifying.

### One-line pitch
> Log any expense, any way, in under 3 seconds — without handing your bank
> data to anyone.

### Why it exists
Mint-style auto-trackers dropped the ball (shutdown, surveillance fatigue,
wrong categorizations). Manual apps are too slow. Voice-only apps (like
MonAi) are uncomfortable in public. Murmur threads the needle:
**effortless logging through multiple paths**, with analytics that
actually answer a question.

---

## 2. The core product thesis — resolved tensions

A few tensions the design deliberately resolves:

| Tension | Resolution |
|---|---|
| "Voice-first" vs. "users won't speak in public" | **Voice is one of four equal paths.** The lockscreen widget exposes mic · keypad · repeat-last · Apple Pay auto-capture. Voice is the *best* path, not the *only* path. |
| "No bank linking" vs. "users forget to log" | Multiple low-friction paths + **Apple Pay Shortcut auto-capture** + gentle dunning notifications on day 2+ if the user goes quiet. |
| "Privacy differentiation" vs. "nobody reads privacy pages" | Privacy is surfaced as a first-class screen (Privacy Center) AND reinforced in microcopy across the app ("Processed on-device", "Your voice never leaves your phone"). |
| "AI advice" vs. "hallucinated financial advice" | **Ask Murmur is a grounded reasoner**, not a chat. It only answers questions about the user's own transactions. No general finance advice, no hallucinations, no external knowledge. |

---

## 3. Visual system

### Palette
```
bg           #FBFAF7   warm off-white (mobile canvas)
bgDesk       #F4F1EA   recessed desktop canvas
surface      #FFFFFF   cards
surface2     #F5F2EB   recessed surfaces, bar tracks
line         rgba(40,36,28,0.08)
ink          #1B1915   near-black, warm — primary text
ink2         #3A3630   body
ink3         #6C675E   secondary
ink4         #9C9589   tertiary / hints
accent       #3F5A3E   deep sage — NEVER a brand-y fintech blue
accentSoft   #E8EDE3   washes, highlights
```

Category tints are low-saturation, harmonious pastels — peach, sage,
lavender, butter, rose, olive. They carry meaning in the list but never
compete with the content.

### Type
- **Display / numbers**: `SF Pro Display` or `"New York"` (serif) for big
  money figures — intentional warmth, not fintech-stark.
- **Body**: SF Pro Text / system sans.
- **Mono**: SF Mono for small numeric chips.

Big amounts are set in **serif** (New York). This is the most intentional
visual decision in the app — it signals "money is personal, not a
spreadsheet."

### Shape language
- Rounded forms throughout. 28–34 for cards, 14–22 for rows, 999 for pills.
- Soft shadows, never sharp.
- No strong dividers — use hairline `rgba(0,0,0,0.08)` only.
- The device frame itself is a 48px radius — matches iPhone 15.

### Motion (not in mockups, but required)
- Everything non-destructive should have an **Undo** snackbar (4s).
- Voice capture: pulsing waveform, gentle breathing. No aggressive shake.
- Category changes: slight color crossfade, not a hard swap.
- Saving an expense: card scales down 0.94 → settles into the list.

---

## 4. Information architecture

### Tab bar (5 slots)
```
 Today   Insights   [Mic FAB]   Budgets   More
```
The center mic FAB is **raised above the bar** (transform: translateY(-10px))
and sits on top of the pill — like a permanent action button. "More"
contains Settings, Privacy Center, Ask Murmur entry, Recurring, History,
Help.

**Why these tabs?** Today is where you land. Insights is where you
understand. Budgets is where you plan. Mic is always-present capture.
More is the drawer for everything else.

### Top-level flows

1. **Onboarding** → Permissions → Income (optional) → Empty state → Day-1 guided log
2. **Capture loop**: Lockscreen widget → Listening → Confirm → Saved (with Undo)
3. **Alternate capture**: Keypad, Apple Pay auto-capture notification, manual edit
4. **Browse**: Today → Transaction detail → Search / History
5. **Understand**: Insights → Recurring → Ask Murmur (conversational)
6. **Plan**: Budgets (ring + per-category)
7. **Manage**: Settings → Privacy Center → Paywall (for desktop only)

---

## 5. Screen-by-screen rationale

### Onboarding
Privacy is the lead. No feature list marketing — one serif headline
("Speak it. Spend clearly."), three quiet promises (on-device voice, no
bank linking, desktop clarity), one CTA.

### Permissions
Step 2 of 3. Mic + Shortcuts granted; Face ID optional. Minimum
necessary. The copy on each permission is why-not-what.

### Income setup
Step 3 of 3. **Optional**. This is the quiet number that makes Ask
Murmur possible. Never verified, never synced to a bank. A quick-pick
row ($2.5k / $4k / $6k / $10k) because most users won't type the exact
amount.

### Empty state (Day 1)
A single mic glyph on a warm canvas. One suggestion sentence (*"Seven
fifty at the bakery"*). A "or type it manually" escape hatch. Nothing
else.

### Guided first log
Appears once, on the first time the user sees Today empty. An annotated
pointer at the mic FAB with three example phrasings. The mic button
itself gets a glow ring. This is the single most important retention
moment — we literally show the user how to get value.

### Lockscreen widget (3 actions)
`[ Speak | Type | Repeat-last $12.40 ]` — equal surface area, mic
slightly biased with white fill. "Repeat last" is the power-user
shortcut for people whose daily coffee is always the same price.

### Listening
Hero is the **detected amount**, set at 92px serif. The transcript
itself is small, italic, de-emphasized. The old mistake was making the
transcript the hero — users don't read while speaking. They want to
see the number land.

### Confirm
The amount card is **bordered in accent + soft glow** and labeled "Amount
· tap to edit" with `−$1 +$1 +$5 +$10` chips below. Wrong-amount is the
#1 voice error; this turns a dead-end read into a one-tap fix.

Merchant, category, date, payment are passive fields. Transcript sits
at the bottom in a soft accent-tint card — useful, not dominant.

### Low-confidence / error
Yellow "Not sure" chip. The missing token is highlighted in the
transcript with a rose tag `[unclear]`. Two CTAs: Re-record (light) or
Save anyway (dark). **Never fail silently.**

### Apple Pay auto-capture
A lockscreen notification, not a modal. Inline actions: "Add note" ·
"Groceries" · "Dismiss". Footer attributes it to the Shortcut so the
user understands the source. Required for bank-linking avoidance to
actually work.

### Manual keypad
A classic 3x4 keypad. The big amount up top is serif. A mic button in
the top-right lets the user switch modes mid-entry.

### Category picker (bottom sheet)
Two-column grid of category tiles. Selected state gets a border in the
category's dark tint + a check badge. Sheet pattern because it's a
mid-flow decision, not a standalone screen.

### Edit merchant (keyboard)
Inline text edit with the native iOS keyboard. Suggestion chips below
the field ("Blue Bottle Coffee", "Blue Bottle", "Bluestone Lane")
because 90% of edits are disambiguation, not creation.

### Today
- Serif "Today" headline.
- **Budget header line**: `$473 left this month · 12 days to go` — quiet,
  one line, sets context without owning real estate.
- Running total card with a 7-bar weekly bar chart.
- Grouped sections (Today · Friday, Yesterday · Thursday).
- Each row: merchant logo (real brand color when known, letter tile
  otherwise) · merchant · category chip · time · amount.
- Voice mic glyph next to voice-logged entries.
- Recurring glyph next to recurring entries.

### Today · Undo snackbar state
Same screen with a dark snackbar floating above the tab bar. "Saved ·
Blue Bottle $12.40" + Undo link + a 4-second progress indicator at the
bottom edge.

### Transaction detail
Centered merchant mark, serif amount, category chip, fields card, then
three actions (Split · Re-record · Delete). At the bottom: a
voice-note playback card (if the entry was voice-logged) with a play
button and the transcript.

### Search & filter
Top: search field. Below: horizontal filter chips (All, This month,
Coffee, Voice-logged, > $20). Result count + total below. Results use
the same row pattern as Today for consistency.

### History (months)
Calendar heatmap for the current month, using accent opacity as
intensity. Below: per-month rows with totals and an "In progress" badge
on the current month. Tap a month to drill in.

### Insights
Hero: serif total, trend delta badge, small area trend. Below:
category breakdown with per-row bars. Footer: a dark forecast card
with a serif "At this pace, you'll end April around $2,240" line. Deep
analytics are intentionally **not here** — they're on desktop.

### Recurring subscriptions
Hero: monthly total + yearly projection ("That's $3,348 a year").
**New pattern detected card** with a dashed border — shows Murmur
actively reasoning about the user's routines. Accept / reject CTAs.
Below: active subscriptions list with next-charge dates.

### Ask Murmur (entry)
Big black square sparkle logo. Headline "Ask Murmur." Tagline
emphasizes groundedness. Four suggestion tiles with domain emoji.
Input bar at the bottom with a mic FAB inside. Footer:
🔒 "Your data never trains a model."

### Ask Murmur (result — PS5 example)
Chat UI with the user's question as a dark right-aligned bubble, then:
1. A serif verdict bubble ("Short answer: not this month — but you can in 5 months").
2. A breakdown card with `Stat` rows (income, spend, left over, target
   price, time-to-goal scenarios).
3. A narrative accent-soft card ("You spent $89 on coffee this month.
   Halving that alone saves $540/year.").
4. Attribution line: "Based on 184 transactions in Murmur. No guesses,
   no external advice."
5. Two action pills: "Create PS5 goal" (primary) and "Show my coffee spend" (secondary).

**This is the most novel screen. Design it carefully in implementation.**

### Budgets tab
Hero: big budget ring (percentage used) + left-over money + "On pace"
chip. Below: per-category rows with bars, each tagged as Healthy,
Tight (>92%), or Over.

### Settings
Profile card at top with upgrade badge if on free plan. Grouped lists:
Voice & capture, Privacy, Sync, About. Standard iOS pattern.

### Privacy Center
Headline "Your money, yours." Three tiles explaining what's stored
where (device / iCloud / our servers). Controls with toggles. At the
bottom: Your rights — export and delete everything.

### Paywall
Dark, premium. **"Mobile stays free. Forever."** is the headline. Not
"start trial". No countdown. Monthly/Yearly plan cards with "Best"
badge on yearly. CTA: "Upgrade to Plus". Footer: "Cancel any time ·
Free mobile tier is never limited."

---

## 6. Sign-in & identity (NOT in current mockups — to add)

This is deliberate:

**The user creates no account to install and use Murmur.** Data lives
in iCloud by default. No sign-in wall. Most users never see an account
screen.

Sign-in only appears when the user asks for something that needs it:

1. **Pair a desktop.** The first time they launch the Mac app, they scan
   a QR shown on the phone, which triggers a **Sign in with Apple** prompt
   on both devices. Murmur silently creates the identity at that moment.
2. **Restore on a new phone.** If the user installs Murmur on a replacement
   phone and has iCloud disabled, an "I had Murmur before" button opens a
   Sign in with Apple sheet to restore from our sync server.
3. **Manage account.** A Settings → Account row appears *only after* the
   user has signed in. Shows their Apple ID, connected devices, Sign out.

No email/password by default. No social logins beyond Sign in with Apple.
No "create account" wall.

**Implementation note for Claude Code:** the existing Supabase-backed
sync should be keyed by the Apple user identifier token, not email.
Create the user record lazily on first pair — until then, no DB row
exists for that user.

---

## 7. Offline-first & sync

The user already has this partially implemented. The design assumes:

- **Every write is local-first.** A transaction is visible in the UI the
  instant it's saved, regardless of connectivity.
- **Sync happens in background.** A small spinner in the header (not
  designed yet — use iOS's own) can indicate active sync.
- **Conflict resolution: last-write-wins, per field, not per record.**
  If the user edits the merchant on phone while the same transaction's
  category is changed on desktop, both edits survive.
- **Voice recordings are never synced.** Only the transcript + extracted
  fields. Voice is deleted from-device after 24h by default (toggle in
  Privacy Center).

---

## 8. AI behavior — Ask Murmur

### Hard rules
1. **Only answer from the user's own transactions.** Never cite outside
   facts, prices, averages, benchmarks.
2. **Never give financial advice.** No "you should invest this in an
   ETF". Murmur is a reasoner over personal data, not a fiduciary.
3. **Always attribute.** Every answer ends with "Based on N transactions
   in Murmur." A user can tap this to see the underlying query.
4. **Ground every number.** If Murmur says "avg monthly spend $3,970",
   that must be computable from the DB. If it isn't, don't say it.
5. **Goal-oriented by default.** The suggestion tiles prime the user
   toward goals ("Can I afford...", "Help me save..."), not open chat.

### Capability map (v1)
- **Can I afford X by Y date?** — uses income, avg spend, current savings rate.
- **Where is my [category] going?** — top merchants, trend, vs last month.
- **Why did I spend more last week?** — delta-attribution by category.
- **Help me save $N by [date]** — calculates required monthly cut,
  suggests by category where discretionary slack exists.

### What it explicitly doesn't do (v1)
- No investment advice. No tax advice. No lifestyle judgment.
- No open-ended chat (force-close after one answer; a follow-up
  must be another grounded question).
- No comparison to "other users" — we don't know them.

### Technical note
Model call: use a small, fast model (Haiku-class). Inject the user's
transactions as structured JSON, not free text. The prompt should
include an explicit "only answer using the data provided" clause and
reject any question requiring outside knowledge with a polite
"I can't answer that from your data alone."

---

## 9. Retention mechanics (for engineering)

These were discussed but aren't all in the mockups yet. Budget time to
build them.

- **Undo snackbar** after every save (4s, tap to reverse).
- **Day-1 guided first log** (shown once, dismissed on first save).
- **Day-2 dunning notification** if the user has opened the app but
  logged nothing for 24h. Copy: "You usually log by now. Anything to
  capture?" Not "don't miss out" — gentle.
- **Day-3 insights unlock** — the Insights tab gets a small badge when
  the user has 3+ entries. First-time tap shows a 1-screen welcome.
- **Recurring detection** kicks in after 2–3 occurrences of a merchant
  + amount pattern. Shown as the "new pattern detected" card.

---

## 10. Paywall & monetization principles

- **Mobile is free, forever, not limited.** This is the pricing message.
  Every feature in the mobile app should work without Plus.
- **Plus unlocks the desktop app + Ask Murmur + recurring detection + export.**
- **No trial.** A trial with auto-renew is what MonAi does, and it's the
  #1 reason they get 1-star reviews. We're the opposite: no countdown,
  no auto-conversion.
- **Yearly is featured** (35% savings). Monthly exists for people who
  want to try the desktop app for one month.

---

## 11. Multi-currency (v1 decision)

- **Single primary currency per account.** Auto-detected from device
  locale. User can change it in Settings.
- No per-transaction currency in v1. Users who pay in a second currency
  see the converted amount (rough, not accurate) and can add a note.
- **v2**: per-transaction currency with live conversion. Adds ~3× the
  complexity on the numbers side, so deferred.

---

## 12. Out of scope for v1

- Shared / split expenses (Splitwise owns this).
- Apple Watch app.
- Widgets beyond the single lockscreen tile.
- Tablet layout.
- Household / family.
- Receipt OCR (nice-to-have; defer).
- AI chat beyond the goal-planner scope.
- Investment / net-worth tracking.

---

## 13. File map (for handoff)

```
Murmur Mockups.html          — entry; wires up all screens in a Figma-ish canvas
design-canvas.jsx            — pan/zoom canvas + section/artboard/postit primitives
ios-frame.jsx                — iPhone status bar + keyboard
macos-window.jsx             — macOS window chrome
tokens.jsx                   — T (palette/type), Icon, Chip, Money, MerchantLogo
mobile-screens-1.jsx         — BareDevice, TabBar, Lock, Listening, Confirm, Today (+Undo)
mobile-screens-2.jsx         — Edit (keyboard), Insights, Onboard
mobile-screens-3.jsx         — Detail, Keypad, Error, Apple Pay, Search, Category picker
mobile-screens-4.jsx         — Settings, Privacy, Empty, Paywall, Permissions, History
mobile-screens-5.jsx         — Budgets, Recurring, Ask Murmur (entry+result), Day-1, Income
desktop-screens-1.jsx        — Dashboard
desktop-screens-2.jsx        — Analytics, Budgets (desktop)
```

---

## 14. Open questions for the product owner

1. **Sign in with Apple as the only provider, or also email/password?**
2. **Multi-currency in v1 or v2?** (recommended: v2)
3. **Receipt OCR in v1?** (recommended: no)
4. **Shared / split expenses ever?** (recommended: never — Splitwise owns it)
5. **Should Ask Murmur be mobile + desktop, or desktop-only for Plus?**
   (recommended: Ask is Plus-only, but mobile gets it too if you're on Plus)
6. **Should the "new pattern detected" recurring card live on Today, or
   only inside the Recurring screen?** (recommended: also on Today, once,
   as a dismissible banner)

---

*End of design document.*
