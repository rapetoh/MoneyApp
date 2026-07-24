# Desktop App Review — Punch List (Deep Pass)

**Date**: 2026-05-04
**Scope**:
- **Electron shell** at `apps/desktop/` (`main.ts`, `preload.ts`, build config, scripts)
- **Web app** at `apps/web/` — what the Electron BrowserWindow actually loads (Next.js standalone)
- The **shipped** state, not the in-progress Murmur redesign

**Method**: Read every page in `apps/web/src/app/`, every component, every lib, middleware, the entire desktop shell + build config, end-to-end. Cross-checked data writes against reads, every nav target.

> Items marked **"needs your eyes"** are runtime / packaged-build-only — verify before deciding.
> Severity legend: **CRITICAL** / **HIGH** / **MEDIUM** / **LOW**.

---

## 1. Electron shell issues

### 1.1 — `setWindowOpenHandler` denies *every* navigation `[CRITICAL]`
- **Where**: [apps/desktop/src/main.ts:133-139](apps/desktop/src/main.ts#L133-L139)
- **What**:
  ```ts
  mainWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    if (openUrl.startsWith('http://') || openUrl.startsWith('https://')) {
      shell.openExternal(openUrl)
      return { action: 'deny' }
    }
    return { action: 'deny' }
  })
  ```
  External http(s) URLs are correctly handed to the OS browser. But the function returns `{ action: 'deny' }` in **both** branches — so any `window.open()` call from the web app silently fails.
- **Concrete impact**: PDF export at [apps/web/src/app/dashboard/export/page.tsx:162-178](apps/web/src/app/dashboard/export/page.tsx#L162-L178) opens a new window with `window.open('', '_blank', 'width=900,height=1100')`. **In the packaged Electron app, `win` will be null, and the user will see "Pop-ups blocked. Allow pop-ups to export PDF." — which can never be true in Electron.** PDF export is broken on desktop.
- **Why it matters**: This is a hard regression for a paid feature (Export is Plus-gated). And the alert message tells users to fix something that has no fix.
- **Fix**: special-case "about:blank" / same-origin opens to allow the popup; or rewrite PDF export to use a real PDF generator instead of `window.print`.

### 1.2 — Native menu is bare `[MEDIUM]`
- **Where**: [apps/desktop/src/main.ts:183-235](apps/desktop/src/main.ts#L183-L235)
- **What**: Edit / View / Window only (Mac also gets the standard Murmur app submenu with about / hide / quit). No File menu, no app-specific items.
- **Missing**: Preferences (`Cmd+,`), New Transaction, Sign Out, Check for Updates, Open Logs, Open .env file. Mac users in particular live in the menu bar — a real shipped product is expected to expose its primary actions there.
- **Why it matters**: Not a bug; a polish gap for a paid product.

### 1.3 — Preload bridge is dead code `[LOW]`
- **Where**: [apps/desktop/src/preload.ts](apps/desktop/src/preload.ts) exposes `window.murmur.platform` + `window.murmur.versions`
- **What**: Grep'd `window.murmur` across `apps/web/` — **zero usages.** The bridge exists, builds, ships, and is never read.
- **Why it matters**: Not harmful, but if you ever want the web app to know "I'm running in Electron" (to enable native-only features, change auth callback redirect, hide browser-only paywall copy, swap "web companion" → "desktop"), you'll need this. Currently a stub waiting for a consumer.
- **Note**: PLAN mentions `apps/web/src/lib/electron-bridge.ts` as the "single point of Electron detection" — that file does not exist in the current codebase (confirmed by listing `apps/web/src/lib/`).

### 1.4 — Code signing + notarization disabled `[CRITICAL pre-launch]`
- **Where**: [apps/desktop/electron-builder.yml:32-41](apps/desktop/electron-builder.yml#L32-L41)
- **What**: `gatekeeperAssess: false` + `identity: null` + hardenedRuntime / entitlements commented out. Comment acknowledges this is "Unsigned v1 build — ad-hoc signature only" pending Developer ID Application cert.
- **Why it matters**: macOS Gatekeeper will block the unsigned `.dmg` for any user who isn't you. They'll see "cannot be opened because the developer cannot be verified" and have to right-click → Open. This is a ship-blocker before any public release.

### 1.5 — Windows + Linux targets missing entirely `[HIGH]`
- **Where**: [apps/desktop/electron-builder.yml](apps/desktop/electron-builder.yml) — only a `mac:` block (lines 24-41). No `win:` block, no `linux:` block.
- **What's promised**: PLAN.md says "Real installable Mac + Windows app, one web codebase" (line 51 in the tech stack table) and "Electron-builder.yml: .dmg (Mac) + .exe (Windows) build config" (line 90).
- **What actually ships**: macOS only.
- **Why it matters**: Either the PLAN promise is the truth and the config is missing, or the shipping plan changed and the PLAN is stale.

### 1.6 — Standalone server bundle path is fragile `[MEDIUM]`
- **Where**:
  - Resolved at [apps/desktop/src/main.ts:60-63](apps/desktop/src/main.ts#L60-L63): `web/apps/web/server.js`
  - Staged in [electron-builder.yml:18-22](apps/desktop/electron-builder.yml#L18-L22) — copies `dist/web/**/*` to `web/`.
  - The structure is implicit: `dist/web/apps/web/server.js` becomes `Resources/web/apps/web/server.js`.
- **What's missing**: no runtime sanity check beyond `existsSync` at line 67. If Next.js standalone output structure changes in an upgrade, the path will break with a confusing dialog ("Embedded Next server bundle missing").
- **Needs your eyes**: build a fresh `.dmg`, run it, watch console for `[next]` lifecycle output, confirm boot.

### 1.7 — `~/Library/Application Support/Murmur/.env` discovery is implicit `[HIGH]`
- **Where**: [plus.server.ts:5-7](apps/web/src/lib/plus.server.ts#L5-L7) comment refers to `~/Library/Application Support/Murmur/.env` "loaded by apps/desktop/src/main.ts before spawning the embedded server" — but I read `main.ts` and **the `.env` load is not visible in `main.ts`**. The Next subprocess at [main.ts:76-86](apps/desktop/src/main.ts#L76-L86) inherits `...process.env` — but Electron-launched-from-Finder has an empty `process.env` aside from what macOS provides.
- **What this means**: The `.env` load may happen via something else (perhaps `afterPack: build/afterPack.cjs` referenced in [electron-builder.yml:9](apps/desktop/electron-builder.yml#L9)) — but I can't confirm without reading that script. **Needs your eyes**: confirm the dotenv load path; if it's missing, AI features (parse-expense, parse-scan, ask-murmur) silently 500 because `OPENAI_API_KEY` is undefined in the spawned subprocess.
- **Recommendation**: load a known dotenv file early in `bootstrap()` and pass it through, AND fail loudly with a dialog if required keys are absent.

---

## 2. Icon ↔ label mismatches

### 2.1 — Apple Pay source chip uses `Icon.list` `[MEDIUM]`
- **Where**: [apps/web/src/app/dashboard/transactions/page.tsx:391](apps/web/src/app/dashboard/transactions/page.tsx#L391)
- **What**: In the source-chip helper at L379-L410:
  - Voice → `Icon.mic` ✅
  - **Apple Pay → `Icon.list` ❌** (a payment method should be a card/wallet)
  - Recurring → `Icon.sparkle` (acceptable, "magic"/auto)
  - Typed → `Icon.list` (acceptable for typed/manual entry — list of fields)
- Same kind of icon-vs-function mismatch as the search-icon-for-transactions pattern.

### 2.2 — Sidebar uses `Icon.sparkle` for two different things `[HIGH]`
- **Where**: [apps/web/src/components/Sidebar.tsx:36, 38](apps/web/src/components/Sidebar.tsx#L36-L38)
- **What**:
  - Budgets → `Icon.sparkle` (line 36)
  - Ask Murmur → `Icon.sparkle` (line 38)
- **Effect**: Two separate sidebar items use the same icon. Sparkle works for Ask (AI). For Budgets it's wrong — they're explicit user-set caps, not AI suggestions. Visual ambiguity in the primary nav.

### 2.3 — Sidebar uses `Icon.chart` for two different things too `[MEDIUM]`
- **Where**: [Sidebar.tsx:34, 39](apps/web/src/components/Sidebar.tsx#L34-L39)
- **What**:
  - Overview → `Icon.chart` (line 34)
  - Reports & forecast → `Icon.chart` (line 39)
- Two sidebar items, same icon.

### 2.4 — "Reports & forecast" label vs `/dashboard/insights` URL `[LOW]`
- **Where**: [Sidebar.tsx:39](apps/web/src/components/Sidebar.tsx#L39)
- **What**: Label is "Reports & forecast", URL is `/dashboard/insights`, page title (h1 in [insights/page.tsx:355-356](apps/web/src/app/dashboard/insights/page.tsx#L355-L356)) is "Forecast & patterns". Three different names for the same surface.
- **Why it matters**: power users reading the URL bar / browser history get confused. Pick one.

---

## 3. Orphan data

### 3.1 — `monthly_income` is loaded but **not editable** on web `[CRITICAL]`
- **Where**:
  - Loaded at [apps/web/src/app/dashboard/settings/page.tsx:43](apps/web/src/app/dashboard/settings/page.tsx#L43)
  - **`handleSaveAccount` at [L103-L110](apps/web/src/app/dashboard/settings/page.tsx#L103-L110) only writes `display_name`, `currency_code`, `locale` — `monthly_income` is omitted.**
  - There is **no input field** for monthly_income anywhere on the Settings page.
  - Used by Ask Murmur at [ask/page.tsx:236](apps/web/src/app/dashboard/ask/page.tsx#L236).
- **Why it matters**: A user who only ever pays + uses Murmur on desktop cannot set their income at all. Cross-device parity broken: mobile users have an editor in [Settings → Preferences → Monthly income](apps/mobile/app/more/settings.tsx#L258-L261), web users don't. **Ask Murmur on desktop will always send `null` for `monthly_income`, breaking income-dependent reasoning** (per PRD §5.12 these answers degrade silently).
- **This is the desktop equivalent of your onboarding-income example** — data the app clearly depends on, with no surface to set or change it.

### 3.2 — Privacy toggles "Anonymous analytics" / "Crash reporting" don't persist `[CRITICAL]`
- **Where**: [apps/web/src/app/dashboard/settings/page.tsx:55-58, 314-325](apps/web/src/app/dashboard/settings/page.tsx#L55-L325)
- **What**: Two toggles in local React state. Comment is explicit at L55-58: "UI only for now; they don't yet wire to a backing setting on web."
- **Why it matters**: User toggles "Crash reporting OFF", reloads, it's back ON. They believe they've changed a privacy setting; they haven't. **For privacy controls specifically, dead toggles are worse than no toggles** — the user thinks they've exercised a right they haven't.
- **Fix**: persist to a `profiles.privacy_*` column (or per-row), or hide the toggles until they're wired.

### 3.3 — User-card "Synced just now" sub never updates `[LOW]`
- **Where**:
  - Sidebar user card: [Sidebar.tsx:149](apps/web/src/components/Sidebar.tsx#L149) hardcoded "Synced just now"
  - Settings → Sync & devices: [settings/page.tsx:246](apps/web/src/app/dashboard/settings/page.tsx#L246) hardcoded "This device · Synced just now · web companion"
- **What**: Static decorative copy. There's no actual sync indicator, no "last synced X seconds ago" timestamp, no list of other devices.
- **Why it matters**: looks like a feature, isn't one. With PLAN's "QR pairing" + multi-device story, users will tap "This device" expecting management — there's nothing.

---

## 4. Broken or half-wired features

### 4.1 — `isPlus` resolution `[CRITICAL]`
- **Where**:
  - Server: [apps/web/src/lib/plus.server.ts:16-19](apps/web/src/lib/plus.server.ts#L16-L19)
  - Client: [apps/web/src/lib/plus.ts:14](apps/web/src/lib/plus.ts#L14)
- **What**:
  - Server has a `MURMUR_DEV_PLUS=1` env override + `NODE_ENV !== 'production'` fallback. Otherwise locked.
  - Client mirrors with just `NODE_ENV !== 'production'`.
- **Effect**: In production, **no user is ever Plus**, regardless of payment, until RevenueCat / IAP is wired and `profile.plus_status` reads happen here. Comments on both files acknowledge this. Combined with mobile's `__DEV__` check (also dev-only), Plus is currently unobtainable across the entire stack.
- **Why it matters**: every Plus-gated surface on web (Ask Murmur, Insights, Recurring detection, Export) is dead in a production build. Even if a user buys Plus on mobile (also impossible currently), the web app never reads `profile.plus_status` — cross-device entitlement is broken even if the mobile path is fixed.

### 4.2 — PaywallGate CTA isn't clickable `[CRITICAL]`
- **Where**: [apps/web/src/components/PaywallGate.tsx:30-33](apps/web/src/components/PaywallGate.tsx#L30-L33)
- **What**: The "Upgrade to Plus" affordance is a **`<div>`**, no `onClick`, no `<a href>`. Below it: "Plus is free in the dev build — production sees the upgrade flow here." That production upgrade flow does not exist anywhere.
- **Why it matters**: With 4.1, every Plus-gated entry shows a non-functional paywall. Free users can't upgrade. Plus users (only possible in dev) bypass the gate entirely so they don't see the broken CTA. Production users see it and it does nothing.

### 4.3 — Settings → Plan & billing has no upgrade button `[HIGH]`
- **Where**: [settings/page.tsx:265-307](apps/web/src/app/dashboard/settings/page.tsx#L265-L307)
- **What**: Free users see "Mobile app · Free forever · no trial, no upsells" + a description of what Plus unlocks. **No button, no link.** Plus users see "Manage" rendered as a `<span>` with `style={styles.linkBtn}` — not an `<a>` and no onClick. Dead.
- **Why it matters**: Settings is the natural place for users to manage their subscription. On web, both upgrade and manage are non-functional.

### 4.4 — Budgets page doesn't subscribe to realtime updates `[HIGH]`
- **Where**:
  - Budgets one-shot at [budgets/page.tsx:95-97](apps/web/src/app/dashboard/budgets/page.tsx#L95-L97)
  - Compare Transactions (correct example): [transactions/page.tsx:114-138](apps/web/src/app/dashboard/transactions/page.tsx#L114-L138) — subscribes to `postgres_changes`.
- **What**: User logs an expense from mobile → Transactions on desktop updates immediately → **Budgets on desktop shows stale numbers until refresh**. The whole point of a budget view is to react to new spending in real time.
- **Fix**: copy the realtime subscription pattern from Transactions.

### 4.5 — Budgets page "Overall" calculation is hardcoded to monthly `[HIGH]`
- **Where**: [budgets/page.tsx:144-156](apps/web/src/app/dashboard/budgets/page.tsx#L144-L156)
- **What**:
  - `overall = budgets.find(b => b.category_id === null && b.period === 'monthly') ?? budgets.find(b => b.category_id === null)` — picks any null-category budget if no monthly one exists.
  - But the spending math at L148-153 always uses `periodStart('monthly')`.
- **Effect**: a user who set their overall budget to weekly/biweekly/quarterly/yearly sees:
  - The ring renders the budget's amount...
  - ...divided into a single calendar month's spending.
  - Numbers are wrong. A $500 weekly budget compared against a month's worth of spend = always shows >100% used.
- **Per-category budgets ARE handled correctly** at [L164](apps/web/src/app/dashboard/budgets/page.tsx#L164) (`periodStart(b.period)`).

### 4.6 — Budgets page header text hardcodes "this month" `[MEDIUM]`
- **Where**: [budgets/page.tsx:233-244](apps/web/src/app/dashboard/budgets/page.tsx#L233-L244)
- **What**: "{monthName} budgets" + "You've used X of Y this month" — same period blindness as 4.5. Hardcoded English-language template too.

### 4.7 — PDF export uses `window.print()` (depends on broken popup) `[CRITICAL]`
- **Where**: [export/page.tsx:149-182](apps/web/src/app/dashboard/export/page.tsx#L149-L182)
- **What**: Doesn't generate a downloadable PDF. Opens a popup with formatted HTML and calls `win.print()`, which opens the system print dialog where the user must manually choose "Save as PDF."
- **Combined with 1.1**: in the Electron app, `window.open` returns null because of the deny-all handler. The export shows "Pop-ups blocked. Allow pop-ups to export PDF." — except popups can never be enabled in Electron.
- **Why it matters**:
  - On desktop (the primary surface for this feature): broken outright.
  - On web (browser): label says "Export as PDF", behavior is "open print dialog." Different mental model. File doesn't auto-download with a sensible filename.
- **Fix**: real PDF generator (`pdfkit`, `jsPDF`, or server-side via puppeteer/chromium).

### 4.8 — Auth callback error path is generic `[MEDIUM]`
- **Where**: `apps/web/src/app/auth/callback/route.ts` (read pending — referenced by [middleware.ts](apps/web/middleware.ts) flow); login page handles `?error=auth_failed` at [login/page.tsx:21](apps/web/src/app/login/page.tsx#L21).
- **What**: Failure path collapses to a single generic "Authentication failed. Please try again." Doesn't distinguish expired code from invalid code from server error.
- **Why it matters**: support requests with no specifics → impossible to diagnose.

### 4.9 — Login page has no Apple sign-in `[HIGH]`
- **Where**: [login/page.tsx:25-39, 89-102](apps/web/src/app/login/page.tsx#L25-L102)
- **What**: Web login offers Google + email/password only. Mobile offers Apple + Google + email (with Apple as iOS hero per Apple guideline 4.8). On the web, Apple sign-in exists in Supabase OAuth but isn't wired here.
- **Why it matters**: A user who set up their account on iOS via Apple and now tries to sign in on desktop **can't** — they have no email/password (Apple SIWA generates a `user_id@privaterelay.appleid.com` proxy email for Hide-My-Email users; even if they remember it, they don't have a password). They're locked out of desktop.

### 4.10 — Login has no "Forgot password" `[MEDIUM]`
- **Where**: [login/page.tsx:111-140](apps/web/src/app/login/page.tsx#L111-L140)
- **Same gap as mobile.** Email/password users who forget their password have no in-app recovery path.

### 4.11 — Recurring page "Add manually" disabled with a tooltip `[LOW]`
- **Where**: [recurring/page.tsx:301-305](apps/web/src/app/dashboard/recurring/page.tsx#L301-L305)
- **What**: Button has `disabled title="Coming soon"`. At least it's honestly disabled rather than fake-enabled. Worth noting because the only paths to create a recurring rule on desktop are (a) accept a detected pattern banner or (b) create on mobile and have it sync. Desktop-only users with no detected pattern can't create rules.

### 4.12 — Settings "Manage" link for Plus users is a `<span>` `[HIGH]`
- **Where**: [settings/page.tsx:285](apps/web/src/app/dashboard/settings/page.tsx#L285)
- **What**: For a Plus user (only possible in dev), the right-side action is `<span style={styles.linkBtn}>Manage</span>` — looks like a button, isn't one. No onClick, no Stripe portal, no anywhere-to-go.
- **Why it matters**: even the dev build doesn't have a manage path.

---

## 5. Privacy / data integrity

### 5.1 — "End-to-end encrypted via your account" is false `[HIGH]`
- **Where**: [settings/page.tsx:261](apps/web/src/app/dashboard/settings/page.tsx#L261)
- **What**: Sync & devices section claims: *"End-to-end encrypted via your account. Murmur servers never see your transactions in plaintext."*
- **The reality**:
  - Transactions are stored in Supabase Postgres. Encrypted at rest (Postgres TDE), authenticated via RLS, transported via TLS. **Not E2E.**
  - Anyone with Service Role access (you, an Anthropic-injection bug, a leak of `SUPABASE_SERVICE_ROLE_KEY`) can read transactions in plaintext.
- **Why it matters**: misleading privacy claim. Either implement actual E2E (would require client-side encryption, complicates Ask Murmur reasoning), or change the copy to something accurate ("Encrypted in transit and at rest").

### 5.2 — `raw_transcript` syncs to Supabase contradicting schema/Privacy comments `[CRITICAL — primary discussion in MOBILE_REVIEW.md §4.1]`
- Cross-ref. The privacy gap originates in the mobile sync path, but the data ends up in the same Supabase the web app reads. The web Privacy section ("ON-DEVICE" tag at [settings/page.tsx:312](apps/web/src/app/dashboard/settings/page.tsx#L312)) implicitly extends the same false promise.

### 5.3 — Voice & language section says "On-device" but Ask question text isn't `[MEDIUM]`
- **Where**: [settings/page.tsx:328-341](apps/web/src/app/dashboard/settings/page.tsx#L328-L341)
- **What**: Web Speech API (browser STT) IS on-device. But the **question text** is then sent to OpenAI for Ask Murmur reasoning. A privacy-minded user reading "Voice engine · On-device" right above an Ask Murmur tile that calls OpenAI may misread the whole flow as local.
- **Fix**: clarify, e.g. "Speech-to-text runs in your browser. Question text is processed in the cloud by Murmur."

### 5.4 — Ask Murmur conversation history persists, but PRD says session-only `[HIGH]`
- **Where**:
  - Persistence: [apps/web/src/lib/askMurmurStorage.ts](apps/web/src/lib/askMurmurStorage.ts) — query `ask_conversations` + `ask_messages` tables.
  - Used at [ask/page.tsx:152-176](apps/web/src/app/dashboard/ask/page.tsx#L152-L176) (`loadMostRecentConversation`, `listConversations`).
  - PRD §5.12 says "Conversation is session-based: nothing is stored after the session ends."
- **What**: code persists. PRD says it doesn't. Pick one.
- **Why it matters**: privacy promise vs. reality mismatch (similar to 4.1 mobile). For the EU, this is a GDPR concern — storing AI prompts that contain personal financial data needs to be in your privacy policy.

---

## 6. Copy / labelling

### 6.1 — Web app is mostly English-only despite mobile being 4-locale `[HIGH]`
- **Where examples**:
  - Sidebar nav labels at [Sidebar.tsx:34-42](apps/web/src/components/Sidebar.tsx#L34-L42) — "Overview", "Transactions", "Budgets", "Recurring", "Ask Murmur", etc. Hardcoded English.
  - Toolbar search placeholder at [Toolbar.tsx:83](apps/web/src/components/Toolbar.tsx#L83) — "Search expenses". Hardcoded.
  - Transactions page table headers at [transactions/page.tsx:285-290](apps/web/src/app/dashboard/transactions/page.tsx#L285-L290) — "Date / Merchant / Category / Source / Account / Amount". Hardcoded.
  - Source chips at [transactions/page.tsx:382-408](apps/web/src/app/dashboard/transactions/page.tsx#L382-L408) — "Voice / Apple Pay / Recurring / Typed". Hardcoded.
  - "All time" / "Last 30 days" / period filters — all English.
  - Insights "patterns" array at [insights/page.tsx:294-311](apps/web/src/app/dashboard/insights/page.tsx#L294-L311) — generates English sentences regardless of profile.locale.
  - Insights weekday labels at [insights/page.tsx:133](apps/web/src/app/dashboard/insights/page.tsx#L133) — `['M', 'T', 'W', 'T', 'F', 'S', 'S']`.
  - PaywallGate copy is English-only (no `locale` prop).
  - Recurring page weekday calendar at [recurring/page.tsx:527](apps/web/src/app/dashboard/recurring/page.tsx#L527) — `['M', 'T', 'W', 'T', 'F', 'S', 'S']`.
  - All Ask Murmur SUGGESTIONS at [ask/page.tsx:38-43](apps/web/src/app/dashboard/ask/page.tsx#L38-L43) — English.
  - All `freqLabel` returns at [recurring/page.tsx:30-41](apps/web/src/app/dashboard/recurring/page.tsx#L30-L41) — English ("Daily", "Weekly", "Bi-weekly", etc.).
- **Why it matters**: PLAN promises "4-locale i18n (en, fr, es, pt)" as a non-regression. Mobile honors it. Web mostly doesn't. A user with locale=fr/es/pt logs into the web app and sees an entirely English UI.
- **Fix**: large pass. Pull translations from `packages/shared/src/i18n/` (which mobile uses) and wire them everywhere.

### 6.2 — "Help & contact: hello@murmur.app" is a placeholder `[HIGH]`
- **Where**: [settings/page.tsx:373-383](apps/web/src/app/dashboard/settings/page.tsx#L373-L383)
- **What**: Mailto link to `hello@murmur.app`. That domain doesn't exist (and isn't owned, AFAICT). Email bounces.
- **Cross-app inconsistency**: mobile uses `rapetohsenyo@gmail.com` (your personal Gmail). Web uses placeholder. Both are wrong, in different ways.

### 6.3 — Build version always reads "dev" `[MEDIUM]`
- **Where**: [settings/page.tsx:368](apps/web/src/app/dashboard/settings/page.tsx#L368)
- **What**: `process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev'`. The env var is never set in any build script. So the displayed version is always "dev" — including in packaged Electron releases.
- **Why it matters**: support / debugging — users can't tell you what version they're on.
- **Fix**: inject `BUILD_ID` from `package.json` version + git SHA at build time (in `next.config.ts` or via `NEXT_PUBLIC_BUILD_ID` env in the build script).

### 6.4 — Transactions table "Account" column says "Murmur" for every row `[LOW]`
- **Where**: [transactions/page.tsx:355](apps/web/src/app/dashboard/transactions/page.tsx#L355)
- **What**: Every row's Account cell is `<div style={{ ... }}>Murmur</div>`. The app doesn't have multi-account support — there's no "account" concept in the schema. So the column is decorative and identical for every row.
- **Why it matters**: wastes a column in a 6-column table. Either remove the column, or replace with something that varies (e.g. `payment_method`).

### 6.5 — "Sync & devices" is decorative — no device list `[MEDIUM]`
- See 3.3.

---

## 7. Auth / middleware

### 7.1 — Middleware bypasses all `/api/*` `[MEDIUM]`
- **Where**: [middleware.ts:31-34](apps/web/middleware.ts#L31-L34)
- **What**: `/api/*` is excluded from the auth guard. Each API handler must auth-check itself. There's no inline annotation or convention enforcing this.
- **Audit**:
  - [api/ai/ask-murmur/route.ts](apps/web/src/app/api/ai/ask-murmur/route.ts) — should be auth-gated (uses user context). **Needs your eyes** to confirm.
  - [api/ai/parse-expense/route.ts](apps/web/src/app/api/ai/parse-expense/route.ts) — stateless parsing, may be open. Confirm.
  - [api/ai/parse-scan/route.ts](apps/web/src/app/api/ai/parse-scan/route.ts) — same.
- **Risk**: easy to add an authenticated API and forget to call `getUser()` inside it. No structural prevention.

### 7.2 — Auth callback error path generic
- See 4.8.

### 7.3 — No Apple sign-in
- See 4.9.

### 7.4 — No "Forgot password"
- See 4.10.

---

## 8. Settings vs. behaviour

- 8.1 = 3.2 (Privacy toggles UI-only)
- 8.2 = 4.3 (No upgrade button)
- 8.3 = 4.12 (Manage is a `<span>`)

---

## 9. Empty / loading / error state holes

### 9.1 — Ask Murmur error message is just a "Tap to try again" pill `[MEDIUM]`
- **Where**: [ask/page.tsx:307-314](apps/web/src/app/dashboard/ask/page.tsx#L307-L314), rendered at [L668-L674](apps/web/src/app/dashboard/ask/page.tsx#L668-L674)
- **What**: Any failure (network, OpenAI rate limit, server error, expired token) collapses to a "retry" pill labelled "Tap to try again." The actual error is `console.error`'d but not shown to the user. Same generic-error problem as mobile §10.2.

### 9.2 — Budgets empty state is decent but English-only `[LOW]`
- **Where**: [budgets/page.tsx:241-243, 366](apps/web/src/app/dashboard/budgets/page.tsx#L241-L366)
- **What**: "Set a monthly budget to start tracking." / "Tap 'New budget' to set an overall monthly cap." — useful empty-state copy, but only in English (see §6.1).

### 9.3 — Transactions initial-load failure `[MEDIUM]`
- **Where**: [transactions/page.tsx:88-111](apps/web/src/app/dashboard/transactions/page.tsx#L88-L111)
- **What**: `useEffect` fetch has no `.catch` branch. On a network error the component sits in `loading=true` indefinitely.
- **Fix**: surface a "Couldn't load transactions" banner with retry.

---

## 10. Export / AI / payments

### 10.1 — PDF — see 4.7.

### 10.2 — CSV / JSON exports are client-side only `[LOW]`
- **Where**: [export/page.tsx:96-147](apps/web/src/app/dashboard/export/page.tsx#L96-L147)
- **What**: Generates a Blob in-browser, uses `URL.createObjectURL` + `<a download>`. No progress for large datasets, no recovery on tab crash. Probably fine for now; flag for later if a user has 10k+ txns.

### 10.3 — CSV uses hardcoded `'en'` locale for time formatting `[LOW]`
- **Where**: [export/page.tsx:102](apps/web/src/app/dashboard/export/page.tsx#L102)
- **What**: `toLocaleTimeString('en', ...)` regardless of profile.locale. Other-locale users get English time format in their CSV. Minor.

### 10.4 — Plus/upgrade — see 4.1, 4.2, 4.3, 4.12.

### 10.5 — Ask Murmur conversation persistence — see 5.4.

---

## 11. Packaging / standalone bundle

### 11.1 — Standalone server path implicit — see 1.6.
### 11.2 — Public assets may not be bundled `[MEDIUM]`
- **Where**: [apps/desktop/scripts/bundle-web.mjs](apps/desktop/scripts/bundle-web.mjs) — referenced by the bundle step but not directly read in this pass. **Needs your eyes** to confirm `apps/web/public/` is copied to the standalone output.
- **Effect**: if `public/` isn't bundled, the Electron app 404s on every favicon/font/static request silently. Users see broken icons.

### 11.3 — `.env` discovery — see 1.7.

### 11.4 — No Windows/Linux build — see 1.5.

### 11.5 — No code signing — see 1.4.

---

## 12. Anything else

### 12.1 — Default dashboard lens is "mindmap" without explanation `[MEDIUM]`
- **Where**: [dashboard/page.tsx:41](apps/web/src/app/dashboard/page.tsx#L41)
- **What**: When the URL has no `?lens=`, defaults to `mindmap`. Lens chips show six options (mindmap / flow / calendar / treemap / cashflow / matrix) at [LensPills.tsx](apps/web/src/components/LensPills.tsx) — but no inline tooltip or help.
- **Why it matters**: A new user lands on "Mindmap" with no idea what they're looking at. Power-feature discoverability is bad.
- **Fix**: tooltips per lens, or land first-time users on `cashflow` (most familiar) and let them explore the others.

### 12.2 — Toolbar search jumps to Transactions, drops other params `[LOW]`
- **Where**: [Toolbar.tsx:59-66](apps/web/src/components/Toolbar.tsx#L59-L66)
- **What**: Submitting search navigates to `/dashboard/transactions?q=…`. Drops any current `?month=`, `?filter=` etc. If the user was filtered by month and searches, the month filter clears.
- **Fix**: preserve current params, merge `q` into them.

### 12.3 — Sign-out from Sidebar uses `router.push`, then `router.refresh` `[LOW]`
- **Where**: [Sidebar.tsx:63-67](apps/web/src/components/Sidebar.tsx#L63-L67)
- **What**: After `signOut()` resolves, navigates to `/login`. **Needs your eyes**: confirm there's no race where the user briefly sees `/dashboard` with a stale session before the redirect completes. If yes, switch to `window.location.href = '/login'` for a hard navigation.

### 12.4 — Settings sign-out duplicate in two places `[LOW]`
- **Where**:
  - Sidebar user card sign-out at [Sidebar.tsx:151-153](apps/web/src/components/Sidebar.tsx#L151-L153)
  - Settings page sub-nav sign-out at [settings/page.tsx:153-157](apps/web/src/app/dashboard/settings/page.tsx#L153-L157)
- **What**: Two sign-out paths. Both work; just noting that they exist.

### 12.5 — Recurring page detected-pattern logic uses localStorage for dismissals `[LOW]`
- **Where**: [recurring/page.tsx:74-94](apps/web/src/app/dashboard/recurring/page.tsx#L74-L94)
- **What**: Dismissed candidate keys persisted to `localStorage` only. So if the user dismisses a pattern on web, the same pattern still surfaces on mobile (mobile uses SecureStore). Cross-platform dismissal state is not synced.
- **Why it matters**: low-priority polish; either accept the inconsistency or move dismissals to a server-side `pattern_dismissals` table.

### 12.6 — Settings sub-nav highlights one section but doesn't drive scroll-spy `[LOW]`
- **Where**: [settings/page.tsx:89-93](apps/web/src/app/dashboard/settings/page.tsx#L89-L93)
- **What**: Clicking a sub-nav item scrolls the corresponding section into view — but if the user manually scrolls, the active highlight doesn't update to match.
- **Fix**: IntersectionObserver scroll-spy, or just remove the active-highlight when the user scrolls past it.

---

## Severity summary

**Critical (production blockers / privacy commitments not kept)**:
- 4.1 Plus determination via `NODE_ENV` (no production user is ever Plus)
- 4.2 PaywallGate CTA is a non-clickable `<div>`
- 4.7 + 1.1 PDF export uses popup that the BrowserWindow denies
- 1.1 BrowserWindow denies all `window.open` (PDF + any future popups)
- 3.1 No web UI to set `monthly_income`
- 3.2 Privacy toggles UI-only — mismatched with the privacy posture they claim to set
- 1.4 Code signing off (ship-blocker before public release)
- 5.2 (cross-ref MOBILE) raw_transcript synced to Supabase

**High**:
- 1.5 No Windows or Linux build despite PLAN promising "Mac + Windows"
- 1.7 `.env` discovery unclear — AI features may silently fail
- 2.2 Sidebar Budgets + Ask Murmur both use sparkle
- 4.3 Plan & billing has no upgrade button
- 4.4 Budgets page not realtime
- 4.5 + 4.6 Budgets "overall" period-blind, shows wrong numbers for non-monthly budgets
- 4.9 No Apple sign-in on web (mobile users locked out from desktop)
- 4.12 "Manage" link for Plus is a `<span>`
- 5.1 "End-to-end encrypted" claim is false
- 5.4 Ask Murmur persistence vs PRD claim of session-only
- 6.1 Web app is mostly English-only despite 4-locale promise
- 6.2 Help/contact email is a placeholder

**Medium**:
- 1.2 Native menu is bare
- 1.6 Standalone bundle path fragile
- 2.1 Apple Pay icon is `Icon.list`
- 2.3 Sidebar Overview + Reports both use chart icon
- 3.3 + 6.5 Sync & devices is decorative
- 4.8 + 7.2 Auth callback generic error
- 4.10 + 7.4 No "Forgot password"
- 5.3 "On-device" voice label could mislead
- 6.3 Build version always "dev"
- 6.4 Account column always "Murmur"
- 7.1 API auth convention undocumented
- 9.1 Ask error generic
- 9.3 Transactions network error silent
- 11.2 Public assets may not be bundled
- 12.1 Default lens "mindmap" is mysterious

**Low** — see individual entries.

---

## What needs your eyes (collected)

1. **1.6 + 1.7 + 11.2** — package the desktop app, run the binary fresh from Finder (no terminal), confirm: (a) embedded Next server boots, (b) static assets load (favicon, fonts), (c) AI features actually work (means the env reaches the spawned subprocess), (d) standalone path matches `process.resourcesPath/web/apps/web/server.js`.
2. **1.4** Try installing the unsigned `.dmg` on a non-developer Mac → confirm Gatekeeper warning friction.
3. **4.7 + 1.1** Try the PDF export from the packaged Electron app → confirm "Pop-ups blocked" alert fires (broken outright).
4. **4.4** Add a transaction on mobile while desktop Budgets is open → does Budgets update? (No — needs realtime fix.)
5. **4.5 + 4.6** Set a weekly budget overall → see whether the ring shows ridiculous percentages on web.
6. **4.9** Sign up on iOS via Apple → log out → try to sign in on desktop. (Won't work — no Apple SIWA on web login.)
7. **6.1** Switch profile.locale to fr / es / pt → walk every web page → expect ~95% English fragments.
8. **7.1** Audit each `apps/web/src/app/api/*/route.ts` to confirm it auth-gates correctly (since middleware doesn't).
9. **5.4** Decide privacy posture for Ask Murmur conversation history — keep persistence + update PRD, or strip persistence to match PRD.
10. **9.1 + 9.3** Network-killed Ask Murmur and network-killed Transactions load — both fail silently or with generic copy.
11. **12.3** Sign out → confirm there's no flash of authed UI before redirect.
12. **3.3** Tap "This device" / look at sidebar's "Synced just now" — confirm it never updates and there's no real device list.
