# Cross-Platform Review — Mobile ↔ Desktop Punch List

**Date**: 2026-05-04
**Scope**: The seams **between** the mobile app (`apps/mobile/`) and the desktop app (`apps/desktop/` Electron shell wrapping `apps/web/` Next.js). Same Supabase backend. Same user. Should feel like one product on two surfaces.
**Method**: Cross-referenced findings from `MOBILE_REVIEW.md` and `DESKTOP_REVIEW.md`, plus targeted greps to verify each gap.

> This doc is *not* a rehash. Every item here is something that only makes sense as a **cross-platform** problem — issues that look fine when you stare at one app in isolation but break the moment you remember they're the same product.

> Severity legend: **CRITICAL** / **HIGH** / **MEDIUM** / **LOW**

---

## 1. User flows that flat-out break across devices

The clearest test: walk a single user from one platform to the other and see where they hit a wall.

### 1.1 — Apple-signup user is locked out of desktop `[CRITICAL]`
- **Mobile flow**: User signs up on iOS via Sign In with Apple ([apps/mobile/app/(auth)/sign-in.tsx:71-83](apps/mobile/app/(auth)/sign-in.tsx#L71-L83)). Per Apple guideline 4.8, this is the iOS-hero option. Apple may issue a Hide-My-Email proxy — they don't have a "real" email address tied to the account, and they never set a password.
- **Desktop reality**: Web login at [apps/web/src/app/login/page.tsx:89-102](apps/web/src/app/login/page.tsx#L89-L102) only offers **Google** and **email/password**. There is no Apple SIWA button.
- **What happens**: User opens desktop, can't sign in. Their Apple proxy email won't work in the email/password form (they have no password). They're effectively locked out of the desktop product entirely.
- **Fix**: add Apple OAuth to web login. Supabase supports it; just needs the OAuth client to be registered in your Apple developer account with a web-callback URL.

### 1.2 — Desktop-only user cannot create transactions, period `[CRITICAL]`
- **Verified by grep**: `apps/web/src/` has no `createTransaction`, no `from('transactions').insert(...)`, no transaction-write code anywhere.
- **What this means**: The desktop app is **read-only** for transactions. You can view, filter, search, export, ask, manage budgets, accept detected recurring rules — but you cannot add a transaction. The only way to create one is via mobile (voice / manual / scan / Shortcut / notification listener — five entry points).
- **Why it matters**:
  - PLAN positions desktop as a "companion" — but it's not even a write-capable companion. It's a viewer.
  - A user who wants to do their finance review at a real keyboard can't catch up by adding a missing typed entry from their bank statement.
  - A user without their phone (battery dead, lost, in another room) has no way to log an expense.
  - It's a discoverability cliff: the user lands on a screen with empty data and zero CTA, no way to "Add transaction +" anywhere.
- **Fix**: at minimum, a "+ Add transaction" button on the Transactions page (or in the Toolbar) opening a manual-entry sheet with the same fields the mobile manual flow has.

### 1.3 — Desktop-only user cannot create custom categories `[HIGH]`
- **Verified by grep**: `apps/web/src/` has no `createCategory` / `from('categories').insert(...)`. Categories on web are strictly read.
- **Mobile**: Categories are created on the fly by the voice parser ("I bought boba" → suggests "Snacks"; if the user accepts an unknown category, it's created), the manual-entry CategoryPicker, and the voice confirm modal.
- **What this means**: A desktop-only user is stuck with whatever categories the seed gives them or whatever has been created via mobile.
- **Fix**: a category management surface on web (or at least an "+ Add" inside the Budgets page's category picker).

### 1.4 — User's `monthly_income` is unsettable from desktop `[CRITICAL]`
- **Mobile**: editable via Settings → Preferences → Monthly income ([apps/mobile/app/more/settings.tsx:258-261](apps/mobile/app/more/settings.tsx#L258-L261), modal at L371-382).
- **Web**: profile.monthly_income is **read** at [apps/web/src/app/dashboard/settings/page.tsx:43](apps/web/src/app/dashboard/settings/page.tsx#L43), passed to Ask Murmur at [ask/page.tsx:236](apps/web/src/app/dashboard/ask/page.tsx#L236), but `handleSaveAccount` ([settings/page.tsx:103-110](apps/web/src/app/dashboard/settings/page.tsx#L103-L110)) only writes display_name / currency_code / locale. **There is no input field for income on the web Settings page.**
- **What this means**: A user who pays for Plus and uses Murmur primarily on desktop has no way to update their income (e.g. they got a raise; they want to set it for the first time). Their Ask Murmur queries will keep using the stale or null value.
- **Fix**: add the input field on web. The schema field exists, the data flows through, just the UI is missing.

### 1.5 — Plus purchased on mobile is invisible on desktop `[CRITICAL]`
- **Mobile**: `usePlusStatus` returns `{ isPlus: __DEV__ }` at [usePlusStatus.ts:21-24](apps/mobile/src/hooks/usePlusStatus.ts#L21-L24). Eventually intended to read `profile.plus_status` from RevenueCat.
- **Web client**: `getPlusStatus` returns `{ isPlus: NODE_ENV !== 'production' }` at [apps/web/src/lib/plus.ts:14](apps/web/src/lib/plus.ts#L14).
- **Web server**: `resolvePlusStatus` adds an `MURMUR_DEV_PLUS=1` env override at [apps/web/src/lib/plus.server.ts:16-19](apps/web/src/lib/plus.server.ts#L16-L19).
- **What this means**: even after IAP/RevenueCat is wired (whenever that happens), if it's wired only on mobile (typical pattern — write to `profile.plus_status` from RC's iOS SDK), **the web app will never read that field.** It checks `NODE_ENV` and `MURMUR_DEV_PLUS`. So a paying user on iOS who comes to desktop sees Free.
- **Fix**: when RC is wired, replace all three resolvers with a single shared function that reads `profile.plus_status`. Three implementations of the same gate is the seed of this problem.

### 1.6 — Ask Murmur conversation history doesn't sync `[HIGH]`
- **Mobile (verified by grep)**: no references to `ask_conversations`, `loadConversation`, `appendUserMessage`, `appendAssistantMessage`. Mobile Ask is single-turn, no persistence.
- **Web**: persists every conversation to Supabase tables (`ask_conversations`, `ask_messages`) via [apps/web/src/lib/askMurmurStorage.ts](apps/web/src/lib/askMurmurStorage.ts). Loaded at [ask/page.tsx:152-176](apps/web/src/app/dashboard/ask/page.tsx#L152-L176).
- **What happens**: User asks "Can I afford a $500 dinner this weekend?" on mobile → answer shown, gone after navigate-away. User opens desktop → empty history, no record of the question. User asks "Same question again, with $400 instead?" on desktop → web saves it. User goes back to mobile → no trace of either question.
- **Why this matters**: Either the PRD's "session-based, nothing stored" promise is correct (and web is wrong), or the persistence is correct (and mobile is missing it). Either way, the cross-device experience makes no sense.
- **Cross-ref**: This also intersects with the PRD §5.12 vs reality conflict in [DESKTOP_REVIEW.md §5.4](docs/DESKTOP_REVIEW.md). Pick the policy first, then make both platforms match.

### 1.7 — Desktop-only user has no transaction edit / delete `[HIGH]`
- **Mobile**: `/transaction/edit` for edit, soft-delete with undo from `/transaction/[id]`.
- **Web**: no transaction edit UI, no transaction delete UI. The transactions list is view-only — clicking a row does nothing (no `onClick` to a detail page; transactions/page.tsx renders rows as `<div>` not `<Link>`).
- **What this means**: User makes a typo on mobile ("Strabucks $40,000"). Opens desktop to fix it because typing on a real keyboard is easier. Can't. Has to go back to mobile.
- **Fix**: at minimum, a row-tap that opens a side-panel or modal with edit/delete.

### 1.8 — Recurring rule creation has no manual path on desktop `[MEDIUM]`
- **Mobile**: rules are created via voice flow, manual entry's "recurring" toggle, the edit screen toggle, and the income onboarding step. Lots of paths.
- **Web**: the "+ Add manually" button on `/dashboard/recurring` is `disabled title="Coming soon"` ([recurring/page.tsx:301-305](apps/web/src/app/dashboard/recurring/page.tsx#L301-L305)). The only ways to create a rule on desktop are (a) accept a detected pattern, or (b) sync from a mobile-created rule.
- **What this means**: A desktop-only user with a perfectly visible bill that the detector hasn't flagged (because it has only 2 occurrences, or the amount varies slightly) cannot manually mark it recurring on web.

---

## 2. Same feature, very different fidelity

These look like the same product feature on each platform but they're not. The user thinks they're using "Murmur's Ask Murmur" — actually using two different sub-products.

### 2.1 — Ask Murmur is two different products `[HIGH]`
| Capability | Mobile | Web |
|---|---|---|
| Ask question | ✅ | ✅ |
| Voice input | ✅ (Expo Speech Recognition, on-device) | ✅ (Web Speech API, on-device) |
| Mic button works | ❌ — silent no-op for Plus users at [more/ask.tsx:75-79](apps/mobile/app/more/ask.tsx#L75-L79) | ✅ — fully wired at [ask/page.tsx:189-203](apps/web/src/app/dashboard/ask/page.tsx#L189-L203) |
| Suggestions | ✅ (4 suggestion cards, localized) | ✅ (4 SUGGESTIONS, English-only) |
| Multi-turn / follow-ups | ❌ — placeholder bar, dead button | ✅ — "Dive deeper" → DeepView with composer |
| Action pills (set_budget / show_transactions / etc.) | ❌ — `onActionPress` empty body | The web doesn't render them as inert pills (uses different "How I got there" + "Try also" rails) |
| Conversation history | ❌ — single-turn, nothing kept | ✅ — full History menu with multiple conversations |
| Persistence | ❌ — none | ✅ — `ask_conversations` table |
| Empty state | "Try one of these to start" + suggestions | Different empty state with "Try one of these to start" + dark Try-Also rail |
| Error state | Generic retry pill | Generic retry pill |

- **Why it matters**: A user who ramps up on mobile (the entry product, free) builds a mental model where "Ask Murmur is one question at a time." They upgrade to Plus, open desktop, suddenly there's history + multi-turn + working mic + Try-Also rail + Sources Used panel — features they didn't know existed.
- Worse: they go *back* to mobile expecting the same experience, find a degraded one, and assume their Plus subscription is broken.
- **Two ways to fix**: (a) bring mobile up to web's fidelity, or (b) remove the surfaces that suggest features mobile doesn't deliver (kill the placeholder follow-up bar, kill the action pills, fix the dead mic — covered in MOBILE_REVIEW §3).

### 2.2 — Insights is gated differently on each platform `[HIGH]`
- **Mobile**: Insights tab is **free for everyone**. There's a Day-3 unlock card ([insights.tsx:326-356](apps/mobile/app/(tabs)/insights.tsx#L326-L356)) that shows up after 3 transactions, but no Plus paywall. The full screen is rendered.
- **Web**: Insights is **Plus-gated**. Free users hit `<PaywallGate>` at [insights/page.tsx:184-197](apps/web/src/app/dashboard/insights/page.tsx#L184-L197).
- **What this means**: A free user on mobile sees their forecast + categories + heatmap. The same user on desktop sees a paywall. They've already seen the data on mobile — getting blocked on desktop tells them either (a) the paywall is broken (it is — see §1.5) or (b) the desktop has secret extra features they're missing (it does, just not what they think).
- **Decision needed**: per PLAN's locked decisions (line 30), Plus unlocks Ask + auto-recurring + export + **desktop**. So is "Insights on desktop" supposed to be Plus, while "Insights on mobile" is free? The current code says yes. The user experience says "this is confusing." Either way, **the gating mismatch should be intentional and documented, not an artifact**.

### 2.3 — Settings has a totally different shape on each platform `[MEDIUM]`
- **Mobile**: Account / Voice & capture / Preferences (budget + income + currency + recurring) / Automations (Apple Pay shortcut on iOS, Notification listener on Android) / Data (export) / Reminders (Day-2 dunning) / Privacy / Developer (API URL) / About.
- **Web**: Account / Sync & devices / Plan & billing / Privacy (toggles) / Voice & language / Export / About.
- **Differences**:
  - Mobile has a **Day-2 dunning toggle** — web has nothing about reminders.
  - Mobile has **Income editable**; web doesn't (cross-ref §1.4).
  - Mobile has a **Developer API URL** for testing — web doesn't.
  - Web has **Privacy toggles for analytics + crash reporting** (both UI-only, see [DESKTOP_REVIEW §3.2](docs/DESKTOP_REVIEW.md)) — mobile has neither.
  - Web has a **"Sync & devices"** decorative card that suggests device management — mobile has no such concept.
  - Web has a **"Plan & billing"** card showing Plus state — mobile has a small "Upgrade" pill on the profile card (no detail card).
- **Why it matters**: Same "Settings" surface, totally different controls. A user who configures their account on mobile and then opens web is going to wonder where half the things went, and what the new things are.
- **Fix**: define the canonical control list, then implement everywhere. The two should converge.

### 2.4 — "Today" / "Overview" are completely different home screens `[MEDIUM]`
- **Mobile Today** ([(tabs)/index.tsx](apps/mobile/app/(tabs)/index.tsx)): "APRIL · Today" hero + "left this month" budget line + "Spent today" card with weekly mini-bars + "New pattern detected" Plus banner + sectioned transaction list (Today / Yesterday / older).
- **Web Overview** ([dashboard/page.tsx](apps/web/src/app/dashboard/page.tsx)): "April 2026 overview" + KPI line ("$X in · $Y out · $Z saved · N transactions") + lens chips (mindmap / flow / calendar / treemap / cashflow / matrix) + the active lens visualization.
- **Why it matters**: The mobile user's home is *list-centric*; the desktop user's home is *visualization-centric*. Same data, different framing. The user's mental model of "the home screen" is platform-specific in a way that's likely intentional but never made explicit.
- **Lower-stakes than 2.1-2.3**, but worth being deliberate about.

### 2.5 — History/heatmap semantics differ `[LOW]`
- **Mobile** [HistoryHeatmap component](apps/mobile/src/components/HistoryHeatmap.tsx) (referenced in insights.tsx:466): **calendar grid** showing spending intensity per day across the year.
- **Web** [insights/page.tsx:132-168](apps/web/src/app/dashboard/insights/page.tsx#L132-L168): **weekday × hour matrix** showing when in the week you spend.
- **Why it matters**: Two different "heatmaps." If a user sees one on mobile and asks Murmur about it, they may confuse the two on desktop ("show me the matrix" — which one?). Different semantics, same name.

### 2.6 — Forecast logic differs `[LOW]`
- **Mobile** [insights.tsx:280-296](apps/mobile/app/(tabs)/insights.tsx#L280-L296): forecast = avg of last **3 full months** with data, normalized to days-elapsed in current month.
- **Web** [insights/page.tsx:226-234](apps/web/src/app/dashboard/insights/page.tsx#L226-L234): forecast = avg of last **6 months minus the current** (i.e. up to 5 prior full months), with day-of-month projection.
- **Why it matters**: Same user, same data — sees one projection on mobile ("$1,800 expected for April"), different on desktop ("$1,650 expected for April"). Confusing. Pick one.
- **Same applies to "delta vs prior month"** — mobile uses "prior month" prorated to days-elapsed; web uses "6-mo avg." Different baselines.

---

## 3. Capability gaps — desktop-only users will discover walls

This is the inverse of §2: features that exist on mobile but not on desktop *at all*.

| Capability | Mobile | Web | Severity |
|---|---|---|---|
| Add transaction (any path) | 5 paths (voice / manual / scan / Shortcut / notification) | **none** (verified by grep) | CRITICAL — see §1.2 |
| Edit a transaction | ✅ | none | HIGH — see §1.7 |
| Delete a transaction | ✅ (with undo) | none | HIGH — see §1.7 |
| Create a category | ✅ (multiple paths) | none | HIGH — see §1.3 |
| Create a recurring rule manually | ✅ | "Coming soon" disabled | MEDIUM — see §1.8 |
| Edit a recurring rule | ✅ (via edit screen) | only pause/resume toggle | MEDIUM |
| Receipt / paycheck scan | ✅ | none (no surface, no "scan from your phone" hint either) | MEDIUM |
| Set monthly income | ✅ | none | CRITICAL — see §1.4 |
| Set voice language | none (orphan field) | none (orphan field) | MEDIUM — both broken |
| Apple Sign-In | ✅ (iOS hero) | none | CRITICAL — see §1.1 |
| Forgot password | none | none | MEDIUM — both broken |
| Day-1 first-log onboarding | ✅ (DayOneFirstLog screen) | none — empty Overview, six mysterious lens chips | HIGH |
| Day-2 dunning notification | ✅ | none (no PWA push) | LOW (intentional?) |
| Day-3 Insights unlock | ✅ (badge + welcome card) | not relevant (Plus-gated) | LOW |

**Day-1 onboarding gap is worth highlighting**: a user who first encounters Murmur on the web (from PLAN's "desktop companion" framing — Phase I), with zero data, lands on `/dashboard` with the **mindmap lens** rendered with no data and no guidance. There's no "log your first expense from your phone" hint, no QR code to install mobile, no instructions whatsoever. They quit. Mobile, by contrast, has DayOneFirstLog with explicit examples and a "type instead" escape hatch.

---

## 4. Inconsistent gating — Plus / paywall logic disagrees with itself

### 4.1 — Three implementations of `isPlus` `[HIGH]`
- Mobile [usePlusStatus.ts:21-24](apps/mobile/src/hooks/usePlusStatus.ts#L21-L24): `__DEV__`.
- Web client [plus.ts:14](apps/web/src/lib/plus.ts#L14): `NODE_ENV !== 'production'`.
- Web server [plus.server.ts:16-19](apps/web/src/lib/plus.server.ts#L16-L19): `MURMUR_DEV_PLUS=1` OR `NODE_ENV !== 'production'`.
- **Why it matters**: Three different dev escape hatches that don't coordinate. A dev who sets `MURMUR_DEV_PLUS=1` in their packaged Electron `.env` gets Plus on web (server-side gate fires) but **not** on mobile (mobile checks `__DEV__` only). When real entitlement reads land, three places need to be updated in lockstep.
- **Fix**: extract one `isPlus(profile)` helper in `packages/shared` that reads `profile.plus_status`. All three callers read from there.

### 4.2 — Insights gating disagrees `[HIGH]`
- Cross-ref §2.2. Mobile = free; web = Plus. Pick a policy.

### 4.3 — Recurring detection gating: mobile is consistent, web is too — but for different reasons `[LOW]`
- Mobile: `RecurringPatternBanner` on Today is rendered only if `isPlus` ([(tabs)/index.tsx:261](apps/mobile/app/(tabs)/index.tsx#L261)).
- Web: detector is called with `if (!isPlus) return []` ([recurring/page.tsx:188-195](apps/web/src/app/dashboard/recurring/page.tsx#L188-L195)).
- Both gate. ✅ But on web, the **Recurring page itself** is not Plus-gated — only the *detection* part is. So a Free user opens `/dashboard/recurring`, sees their existing rules and the calendar, but no "patterns detected" banner. On mobile, a Free user sees the same: existing rules in `/recurring`, no banner on Today. So the user-visible behavior is consistent — but it's accidental, derived from the fact that both apps gate detection inside the same `if (!isPlus)`.
- **Worth noting** so a refactor doesn't accidentally diverge.

### 4.4 — Paywall prices vs PLAN vs reality `[MEDIUM]`
- Mobile paywall [paywall.tsx:93,100](apps/mobile/app/more/paywall.tsx#L93-L100): `$4.99/mo`, `$39/yr`.
- PLAN.md (line 30, locked decisions): `$3.99/mo`, `$29.99/yr`.
- Web has **no price displayed** on PaywallGate — just "Upgrade to Plus" CTA.
- **Why it matters**: PLAN is the source of truth. Mobile shows wrong prices. Web shows none. A user comparing pricing across surfaces gets inconsistent answers. (And once IAP is wired, App Store / RC dictates the price anyway — so the displayed strings need to come from somewhere they can be updated centrally.)

### 4.5 — Paywall destinations both go nowhere `[CRITICAL]`
- Mobile: paywall "Upgrade" button is a no-op ([paywall.tsx:108-116](apps/mobile/app/more/paywall.tsx#L108-L116)).
- Web: PaywallGate "Upgrade to Plus" is a `<div>` with no onClick ([PaywallGate.tsx:30](apps/web/src/components/PaywallGate.tsx#L30)).
- Both surfaces dead-end. **The product currently has no functional purchase flow on either platform.**

---

## 5. Privacy claims that diverge across platforms

The two apps each make privacy claims, and they don't quite agree.

### 5.1 — "Voice stored locally" claim is broken at the data layer (cross-ref) `[CRITICAL]`
- Mobile Privacy screen says voice is "Not stored" ([privacy.tsx:181-184](apps/mobile/app/more/privacy.tsx#L181-L184)). Schema comment says `raw_transcript` is "stored locally only, never synced unless user opts in."
- **Reality**: SyncManager pushes the full txn including `raw_transcript` to Supabase (see [MOBILE_REVIEW §4.1](docs/MOBILE_REVIEW.md)). So the data IS on Supabase.
- **The desktop angle**: desktop reads from the same Supabase. So a user with a hostile co-worker who has access to their desktop session can scroll the database via the dev tools or via a hypothetical detail view (currently unbuilt) and see every voice transcript ever recorded. The privacy promise made on mobile is broken by the existence of the desktop app that reads the same database.
- **Two ways to fix**: (a) actually strip `raw_transcript` from the sync payload, OR (b) wire the user-facing opt-in the schema comment promised.

### 5.2 — Web claims "End-to-end encrypted" — mobile does not `[HIGH]`
- Web Settings → Sync & devices: *"End-to-end encrypted via your account. Murmur servers never see your transactions in plaintext."* ([settings/page.tsx:261](apps/web/src/app/dashboard/settings/page.tsx#L261)).
- Mobile makes no such claim (its on-device emoji rows in Privacy are about voice, not transactions).
- **Reality**: there's no E2E. Supabase sees plaintext. Anyone with service-role access reads it.
- **Why this is worse than mobile's claim**: web tells users explicitly that their transactions are E2E. They aren't. Mobile is silent about it (or makes lesser claims).

### 5.3 — Privacy controls are dead, in different ways `[CRITICAL]`
- Mobile Privacy screen [privacy.tsx:188-192](apps/mobile/app/more/privacy.tsx#L188-L192): "Export all" + "Delete all my data" rows have **no `onPress`**. Dead.
- Web Settings Privacy section [settings/page.tsx:314-325](apps/web/src/app/dashboard/settings/page.tsx#L314-L325): "Anonymous usage analytics" + "Crash reporting" toggles. Local React state — don't persist.
- Both apps have privacy surfaces. Both have non-functional controls. Different non-functional controls. A user who explores both surfaces sees four privacy controls — none of them work, but in three different ways (dead button x2, dead toggle x2).

### 5.4 — Ask Murmur conversation persistence violates the PRD on web only `[MEDIUM]`
- Cross-ref §1.6. PRD §5.12 says "session-based, nothing stored." Web persists. Mobile doesn't. So the PRD-promise is honored on mobile, broken on web.

---

## 6. Branding / contact / version drift

Small individually, but they signal lack of cross-platform discipline.

### 6.1 — Support email is wrong AND inconsistent `[HIGH]`
- Mobile [help.tsx:24,27](apps/mobile/app/more/help.tsx#L24-L27): `rapetohsenyo@gmail.com` (your personal Gmail).
- Web [settings/page.tsx:374](apps/web/src/app/dashboard/settings/page.tsx#L374): `hello@murmur.app` (placeholder, domain doesn't exist).
- Same product. Two different wrong emails. A user who reports a bug from mobile and from desktop is sending to two different addresses, neither of which is monitored.

### 6.2 — Version display is broken differently `[MEDIUM]`
- Mobile [help.tsx:32](apps/mobile/app/more/help.tsx#L32) and [settings.tsx:348](apps/mobile/app/more/settings.tsx#L348): hardcoded `"1.0.0"`.
- Web [settings/page.tsx:368](apps/web/src/app/dashboard/settings/page.tsx#L368): `process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev'` — env never set, always "dev".
- Same problem (no real version), two different wrong values. Bug reports become useless.

### 6.3 — Currency rendering is inconsistent within mobile, then again across to web `[MEDIUM]`
- Mobile inconsistencies (see [MOBILE_REVIEW §1.6](docs/MOBILE_REVIEW.md)): TransactionRow uses proper symbols; Record / VoiceConfirm / BudgetEditor / amount edit show currency code.
- Web: uses `Intl.NumberFormat` consistently → proper symbols.
- **Cross-platform effect**: a user with currency=EUR sees `€` on mobile transaction rows but `EUR` in the manual entry screen, then `€` again on desktop. Hopping platforms makes the inconsistency more visible.

### 6.4 — i18n: mobile is 4-locale, web is ~95% English-only `[HIGH]`
- Mobile: all user-facing strings go through `t(key, locale)`. PLAN promises 4-locale (en/fr/es/pt) as a non-regression.
- Web: hardcoded English everywhere — sidebar nav, table headers, source chip labels, suggestion strings, paywall copy, weekday calendar letters, period labels, "Apple Pay" / "Voice" / "Recurring" / "Typed" chips, etc. Profile.locale is read but mostly only used for date/currency formatting via Intl.
- **Cross-platform effect**: a user with locale=fr sees a fully French mobile app, then opens desktop and sees an English UI. Same product, different language.
- **Worth treating as a single workstream**: pull translations from `packages/shared/src/i18n/` (which mobile already uses) into web.

---

## 7. Source-of-truth and sync subtleties

Things that are stored differently across platforms in ways that matter.

### 7.1 — Recurring rules are offline-first on neither platform `[MEDIUM]`
- Mobile: rules go straight to Supabase ([useRecurringRules.ts:111-143](apps/mobile/src/hooks/useRecurringRules.ts#L111-L143)). Transactions are offline-queued, rules are not.
- Web: same — direct to Supabase.
- **Cross-platform effect**: nothing inconsistent between the two, but the *transaction* data IS offline-first on mobile (and not at all on web — web is online-only). So:
  - Mobile user offline → marks txn as recurring → txn queued, rule fails silently
  - Desktop user offline → can't do anything (whole app needs the network)
  - Inconsistency is mostly intra-mobile (already in MOBILE_REVIEW §3.8), but the *desktop side* doesn't have an offline mode at all worth noting.

### 7.2 — Recurring pattern dismissals don't sync `[LOW]`
- Mobile: dismissed pattern keys in SecureStore ([RecurringPatternBanner.tsx:31, 90](apps/mobile/src/components/RecurringPatternBanner.tsx#L31-L90)).
- Web: dismissed keys in localStorage ([recurring/page.tsx:74-94](apps/web/src/app/dashboard/recurring/page.tsx#L74-L94)).
- **Cross-platform effect**: dismiss a pattern on mobile → it still shows on desktop (desktop uses different store). Dismiss on desktop → it still shows on mobile. The user has to dismiss the same pattern twice.
- **Fix**: a `pattern_dismissals` table on Supabase keyed off the pattern hash, read by both platforms.

### 7.3 — Day-1 / Day-3 onboarding milestones are mobile-only persistence `[LOW]`
- Mobile: Day-1 skip is in component state (resets per session), Day-3 unlock is in SecureStore.
- Web: not implemented (Day-1 absent, Day-3 not relevant since Insights is Plus-gated).
- **Cross-platform effect**: a user who hits 3 transactions on mobile is "unlocked" → web doesn't know or care. If web ever gets a Day-3 unlock UI, it'll need to read the same source.

### 7.4 — Categories are read-only on web (cross-ref §1.3) `[HIGH already covered]`

---

## 8. What this all adds up to — a quick gut-check

If you walk a single user across both platforms, this is the broken-flow shortlist:

| Scenario | Outcome |
|---|---|
| User signs up via Apple on iOS, then opens desktop | Locked out (§1.1) |
| User pays for Plus on iOS, then opens desktop | Sees paywall as if Free (§1.5) |
| User wants to set/update income from desktop | No input field (§1.4) |
| User wants to add a transaction from desktop | No UI exists (§1.2) |
| User wants to fix a typo from desktop | No edit UI (§1.7) |
| User wants to add a custom category from desktop | No UI (§1.3) |
| User asks Ask Murmur on mobile, then continues on desktop | History split — desktop sees nothing from mobile (§1.6) |
| Free user uses Insights on mobile, opens desktop | Hit by paywall (§2.2) |
| User dismisses a recurring pattern on one device | Sees it again on the other device (§7.2) |
| Locale=fr user lands on desktop | English UI everywhere (§6.4) |
| User reports a bug | Email goes to one of two wrong addresses depending on platform (§6.1) |

These aren't *bugs* in the per-platform sense (the code on each side is internally consistent). They're seam failures — the experience of being **one user on two surfaces of the same product** is broken.

---

## 9. Recommended priorities

If you want a single pass that materially closes most of the cross-platform gaps:

**Tier 1 — flow blockers (do these or you have a "two products glued together" feel)**:
1. Add Apple SIWA to web login (§1.1)
2. Add monthly_income input on web Settings (§1.4)
3. Add transaction CRUD on web (add / edit / delete) — minimum viable: a side-panel from Transactions row + an "+ Add" button (§1.2, §1.7)
4. Unify `isPlus` resolution to one shared helper that reads `profile.plus_status` (§1.5, §4.1)
5. Wire **a** purchase flow somewhere (§4.5) — even just Stripe Checkout for web Plus is enough to validate the loop

**Tier 2 — coherence**:
6. Decide on Insights gating policy — same answer on both platforms (§2.2)
7. Decide on Ask Murmur conversation persistence — same answer on both platforms (§1.6, §5.4)
8. Settle on Settings shape — converge mobile/web to one canonical control set (§2.3)
9. Unify the support email + actually monitor it (§6.1)
10. Pick one forecast formula (§2.6)

**Tier 3 — polish**:
11. Add web category creation UI (§1.3)
12. Add web manual recurring rule creation (§1.8)
13. Wire web i18n (§6.4)
14. Fix version display on both (§6.2)
15. Sync recurring pattern dismissals via Supabase (§7.2)

**Tier 4 — privacy**:
16. Decide whether you want real E2E or just "encrypted at rest in Supabase" — and make the copy match reality on both surfaces (§5.2, §5.1)
17. Wire (or remove) the dead privacy controls on both platforms (§5.3)

---

## What needs your eyes

1. **§1.1** — Try signing up on iOS via Apple → log out → try to sign in on desktop. Confirm you can't.
2. **§1.5** — In a non-dev build with `MURMUR_DEV_PLUS=0` (default), confirm Plus is unobtainable across both platforms.
3. **§2.6** — Compare the projected-monthly number on a mobile insights view vs the same period on web insights → confirm they don't match.
4. **§5.1** — In a Supabase SQL editor, run `SELECT id, raw_transcript FROM transactions WHERE raw_transcript IS NOT NULL LIMIT 10;` — confirm voice transcripts ARE on the server.
5. **§7.2** — Dismiss a "New pattern detected" candidate on mobile → open desktop's Recurring page → confirm it shows again.
6. **§6.4** — Set profile.locale to fr → walk web app → expect mostly English.
