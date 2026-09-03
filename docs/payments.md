# Payments — Murmur Plus (decided and built Aug 16, 2026)

**Status:** code complete, tested, pushed. **Not yet live** — waits on the
owner steps in the runbook below (App Store Connect products, RevenueCat
project, keys, one migration + two functions to deploy, then a TestFlight
build). Nothing in the product shows a price or a buy button until the
RevenueCat key is present in the build, so shipping this code early is
safe.

## Decisions (owner delegated; Claude decided, owner confirmed the trial)

| Question | Decision | Why |
|---|---|---|
| What is sold | **Murmur Plus** — Ask Murmur, auto-recurring detection, export, desktop/web dashboard | Unchanged bundle |
| Where | **iOS in-app subscription via RevenueCat**, v1. Web/desktop unlock from the same account, no Stripe | One billing system, one refund path (Apple), no double-subscription edge cases. Stripe later if desktop-first users ask |
| Plans / price | **$3.99 / month, $29.99 / year** (~37% off) | Low end of category (YNAB $109/yr, Copilot $95, Monarch $99, MonAi ~$5/mo) — right for a new brand without bank sync. Revisit with data |
| Free trial | **7 days, on both plans** | Plus value depends on the user's own data; the paywall only appears when a Plus feature is touched, so trials start with history behind them and a short demonstration suffices. Yearly-only trials (option B) push the largest surprise charge onto a brand nobody trusts yet → refunds + 1-stars at launch. 7 vs 14 is the first experiment once there is volume |
| No lifetime, no weekly | — | Lifetime + per-turn AI cost is a liability; weekly is a dark-pattern price point |
| Prices in code | **Never.** Paywall reads plans, prices and trial length from the store offering | Change trial/price in App Store Connect + RevenueCat, every installed app follows — no App Store review cycle |
| Roadmap after launch | Free taste of Ask Murmur (e.g. 3 questions/month) for free users; then experiments: 7 vs 14 days → yearly-only trial → price | Ask is the hero; a taste converts better than a wall. Experiments only at ≥ ~200 trial starts — below that it is noise |

## Architecture

```
iPhone (react-native-purchases, public key)      RevenueCat            Supabase
────────────────────────────────────────         ──────────            ────────
configure(appUserID = supabase uid)      ─────►  subscriber
paywall: getOfferings → prices/trial     ◄─────  offering "default"
purchasePackage / restorePurchases       ─────►  Apple receipt
   └─ then invoke plus-sync (JWT)        ─────────────────────────►  plus-sync ──GET /subscribers/{uid}──► RevenueCat
                                                                          └─ resolveEntitlement → UPDATE profiles.plus_*
                                                  webhook (secret) ───►  revenuecat-webhook ── same resolver, same write
web/desktop: read profiles.plus_status (server-resolved); "Refresh" = plus-sync
```

- **One source of truth:** `profiles.plus_status` (+ `plus_product_id`,
  `plus_period_type`, `plus_expires_at`, `plus_will_renew`, `plus_store`,
  `plus_is_sandbox`, `plus_synced_at`; migration 031). `'active'` includes
  the trial. Every surface gates on it exactly as before.
- **Only the server writes it.** Migration 031 adds a trigger that
  refuses any change to the `plus_*` columns from a JWT-bearing client
  role — until now `UPDATE profiles SET plus_status='active'` with the
  user's own token would have granted Plus for free.
- **Resolver, not event mapping.** `supabase/functions/_shared/entitlement.ts`
  turns a RevenueCat subscriber record into the columns. Both functions use
  it, so a webhook and a client-initiated sync can never disagree; CANCELLATION
  keeps Plus until expiry, billing-grace keeps it on with `will_renew=false`,
  EXPIRATION → `lapsed` with the last product + end date for Settings.
  Pure TS, unit-tested from `packages/shared` (15 cases).
- **"No record ≠ revoke."** If RevenueCat has never seen the user (404) the
  profile is left untouched — so a hand-granted early-access `active` is not
  wiped by an outage or a Refresh click. It *is* replaced the moment
  RevenueCat has a record for that user (first purchase/restore).
- **Anonymous ids never map.** App user id is always the Supabase uid; a
  `$RCAnonymousID` event is logged and ignored (`subscriberIdCandidates`).
  TRANSFER events sync both sides.
- **Keys:** the RevenueCat *public* iOS SDK key ships in the app
  (`EXPO_PUBLIC_REVENUECAT_IOS_KEY`, eas.json production env); the *secret*
  API key and the webhook secret are Supabase function secrets only.
- **Keyless build = honest preview.** `purchasesEnabled` is false without
  the key: SDK never configured, paywall shows "Purchases aren't available
  in this build yet", no CTA. Nothing that renders a pressed state without
  doing work (fix-plan 3.1 rule).

## Files

| Area | File |
|---|---|
| Migration | `supabase/migrations/031_plus_entitlement.sql` |
| Resolver (pure) | `supabase/functions/_shared/entitlement.ts` |
| RC client + write | `supabase/functions/_shared/revenuecat.ts` |
| Webhook | `supabase/functions/revenuecat-webhook/index.ts` (deploy `--no-verify-jwt`; auth = shared secret) |
| Post-purchase / Refresh | `supabase/functions/plus-sync/index.ts` (JWT verified; syncs caller only) |
| Contract constants + Settings description | `packages/shared/src/plus.ts` (`PLUS_PRODUCTS`, `PLUS_ENTITLEMENT_ID`, `PLUS_OFFERING_ID`, `LEGAL_URLS`, `describePlus`) |
| Types | `packages/shared/src/types/profile.ts` (`ProfileUpdate` excludes `plus_*`), both `database.types.ts` |
| Mobile SDK service | `apps/mobile/src/services/purchases.ts` |
| Mobile paywall | `apps/mobile/app/more/paywall.tsx` — store-priced plan cards, "Save N%" from store numbers, trial from intro offer + eligibility, Restore, Terms/Privacy, manage for subscribers |
| Mobile Settings | `apps/mobile/app/more/settings.tsx` — Subscription group; "Free trial · ends …" / "Murmur Plus · Yearly · renews …" / "Plus ended …"; Apple manage sheet |
| Root layout | `apps/mobile/app/_layout.tsx` — `configurePurchases(userId)` follows the signed-in user |
| Web gate | `apps/web/src/components/PaywallGate.tsx` + `PlusRefreshButton.tsx` |
| Web Settings | `apps/web/src/app/dashboard/settings/page.tsx` — Plan & billing from `describePlus`, "Manage on Apple", Refresh |
| Legal | `apps/web/src/app/privacy/page.tsx`, `apps/web/src/app/terms/page.tsx`, `components/LegalPage.tsx` (public, no auth) |
| i18n | `paywall.*`, `settings.subscription`, `settings.plan_*` in en/fr/es/pt |
| Tests | `packages/shared/src/domain/__tests__/entitlement.test.ts` |

## Owner runbook — what only you can do, in order

Everything below needs *your* Apple / RevenueCat login or your bank details.
Send me the values marked ⟵ and I do the rest.

1. ~~**App Store Connect → Business** — Paid Apps agreement + banking + tax.~~
   **Already done (verified Aug 17, 2026):** Paid Apps Agreement *Active*
   Jan 23 – **Dec 20, 2026** (renew then), bank account GSCU (…7115)
   *Active*, W-9 *Active* — account-level, inherited from the owner's
   earlier app. Real charges will work as soon as the app is live.
2. **App Store Connect → Apps → Murmur → Subscriptions** — create
   subscription group **Murmur Plus**, then two auto-renewable subscriptions:
   - Product ID `murmur_plus_monthly` — 1 month — price tier $3.99
   - Product ID `murmur_plus_yearly` — 1 year — price tier $29.99
   For **each**: add a localized display name/description (e.g. "Murmur
   Plus Monthly" / "Ask Murmur, recurring detection, export and the desktop
   app"), and **Introductory Offer → Free trial → 7 days**, all countries.
   Also add a review screenshot later (App Review needs one per product;
   any screenshot of the paywall works).
3. **App Store Connect → Users and Access → Integrations → In-App Purchase**
   — Generate an *In-App Purchase key* (.p8). Download it once; note the
   **Key ID** and **Issuer ID**.
4. **revenuecat.com** — free account → project **Murmur** → add an **App
   Store** app, bundle ID `com.voiceexpense.app`; upload the .p8 from step
   3 (Key ID + Issuer ID). Then:
   - Products: import/add `murmur_plus_monthly` and `murmur_plus_yearly`
   - Entitlements: create **`plus`**, attach both products
   - Offerings: create **`default`** (set as current) with packages
     **Monthly** → monthly product, **Annual** → yearly product
   - Project settings → API keys: copy the **public iOS SDK key** (`appl_…`) ⟵
     and create a **secret API key (v1)** ⟵
   - Integrations → Webhooks: URL
     `https://ohaqhwampmyoeaopdybd.supabase.co/functions/v1/revenuecat-webhook`,
     Authorization header value = a long random string you generate ⟵ (I
     will store the same value as `REVENUECAT_WEBHOOK_SECRET`)
5. **Deploy the server pieces** (my MCP access is blocked from production
   writes, so one of these):
   - Easiest: run `npx supabase login` in a terminal in the repo (opens the
     browser, click Authorize) and tell me — I then run
     `supabase functions deploy revenuecat-webhook --no-verify-jwt`,
     `supabase functions deploy plus-sync`,
     `supabase secrets set REVENUECAT_SECRET_API_KEY=… REVENUECAT_WEBHOOK_SECRET=…`,
     and apply migration 031 with `supabase db push` (asks for the DB
     password — you type it).
   - Or: paste `supabase/migrations/031_plus_entitlement.sql` into the
     Supabase SQL editor yourself, and I'll give you the two functions to
     deploy from the dashboard.
6. **Support address** — `support@murmur.app` is advertised in places but
   the domain has no MX record (`SUPPORT_EMAIL` is `null` in
   `packages/shared/src/brand.ts` so nothing shows it today). Either make
   that mailbox real, or tell me the address to use; the legal pages'
   footer and Settings pick it up from that one constant. Also confirm the
   **legal entity / developer name** for the App Store listing — the legal
   pages currently say "the developer named on the App Store listing".
7. **Sandbox tester** — App Store Connect → Users and Access → Sandbox →
   add a tester Apple ID (any email you control). On the test iPhone:
   Settings → App Store → Sandbox Account → sign in with it.

Then I: put the `appl_…` key into `eas.json` production env, cut a
TestFlight build (native module → new build required), and we run the
end-to-end: trial start → `plus_status='active'/'trial'` on the profile →
web unlocks after Refresh → cancel in sandbox → `will_renew=false` →
sandbox expiry (minutes) → `lapsed`. After that, you re-lock the six test
profiles (`update public.profiles set plus_status = null;`) so real gating
is exercised, and prices go live with the store submission.

## Progress log

- **Aug 16, 2026 — App Store Connect done (owner + Claude-in-Chrome):**
  subscription group **Murmur Plus** (id 22313976), group localization
  en-US "Murmur Plus" / Use App Name. Products `murmur_plus_monthly`
  (level 1, 1 month, US $3.99) and `murmur_plus_yearly` (level 2, 1 year,
  US $29.99), auto-generated prices accepted for 175 countries, both with
  **Introductory Offer: Free, 1 Week** (ASC has no "7 days" option; 1 week
  = 7 days), no end date, status "Prepare for Submission". Descriptions
  are capped at 55 chars: monthly "Ask Murmur, recurring detection,
  export, desktop app.", yearly "Ask Murmur, recurring, export, desktop.
  Best value." Existing In-App Purchase key **F47D86V9PG** ("RevenueCat
  In-App Purchase Key", downloaded Jan 19 2026), Issuer ID
  `53b3b2a6-e851-4277-988a-ce6470fdebae` — the .p8 is not on the Mac
  (only `AuthKey_D5NYC4452X.p8`, a different key); if it isn't on the
  Windows machine either, generate a new IAP key in ASC (multiple allowed).
  Still open in ASC: **review screenshot per subscription** (required
  before "Add for Review"; any paywall screenshot works), and Apple's
  banner: **the first subscription group must be submitted together with
  a new app version** — the products go live with the 1.0 store
  submission, not independently. Banking/tax untouched.

- **Aug 16–17, 2026 — RevenueCat + server live:** RevenueCat project
  **Murmur** (id 6f7fbd01, separate from the owner's older "Expense
  Tracker"/"PocketChef" projects), App Store app `com.voiceexpense.app`
  with IAP key F47D86V9PG uploaded ("Valid credentials"), products
  `murmur_plus_monthly` / `murmur_plus_yearly`, entitlement `plus`,
  offering `default` (current) with `$rc_annual` + `$rc_monthly`, public
  iOS key in `eas.json` production env, secret v1 key + webhook secret set
  as Supabase function secrets, webhook `revenuecat-webhook` configured for
  Production+Sandbox / all events. Migration 031 applied by the owner in
  the SQL editor; verified in prod: 8 `plus_*` columns, `guard_plus_entitlement`
  refuses an `authenticated`-role write ("plus entitlement is managed by the
  server"). Both functions deployed via CLI (owner token in git-ignored
  root `.env`); webhook smoke-tested: 401 on wrong secret, 200 + `synced: []`
  for anonymous ids, 200 + `no_rc_record` for a UUID with no history.
  **Behavioural correction:** RevenueCat v1 `GET /subscribers/{id}`
  auto-creates the subscriber (never 404s), so "no history" is detected by
  the resolver returning `free` and the server writes nothing in that case
  — hand-granted early access survives Refresh/Restore until a real store
  record exists. Side effect of the smoke test: a junk customer
  `11111111-1111-4111-8111-111111111111` exists in the RevenueCat project
  (delete at will). EAS cloud iOS build quota for the free plan is
  exhausted until Sep 1 → the TestFlight build is produced with
  `eas build --local` on the owner's Mac and uploaded with `eas submit`.

- **Aug 16, 2026 (evening) — TestFlight build 30 submitted:** built with
  `eas build --platform ios --profile production --local` (Xcode 26.6 on
  the owner's Mac; cloud quota exhausted), IPA inspected before upload
  (Hermes bundle contains the RevenueCat public key; `RevenueCat.bundle`,
  `PurchasesHybridCommon.bundle` and `RNPurchases` symbols present; version
  1.0.0, build 30, `com.voiceexpense.app`), uploaded with `eas submit
  --path` (submission b9d34a86…). First build that can sell Plus. Next:
  owner installs it, signs a **sandbox tester** in (Settings → App Store →
  Sandbox Account), starts the trial from Settings → Subscription; Claude
  watches `profiles.plus_*` + function logs. Sandbox clocks: 1-week trial
  ≈ 3 min, monthly renewal ≈ 5 min, then EXPIRATION → `lapsed`.

- **Aug 16, 2026 (late) — build 30 defect → build 31:** on build 30 the
  owner's hand-unlocked account (`plus_status='active'` since Aug 15, no
  store record) was treated as a subscriber: Settings → Subscription and
  the paywall routed to Apple's sandbox "Subscriptions" sheet ("You do not
  have any subscriptions") + an Apple sign-in prompt, instead of the plans.
  Fix (commit "Plus: only a server-synced store record counts as
  'subscribed'"): `describePlus` now carries `storeBacked =
  !!plus_synced_at`; only store-backed active/trial shows "already
  subscribed"/Manage (mobile paywall + Settings, web Settings "Manage on
  Apple"); a hand-granted active still sees the plans, Settings routes to
  the paywall ("Get Murmur Plus"), web shows "Early access — subscribe in
  the Murmur app on your iPhone to keep Plus." So the six test profiles can
  stay unlocked while the purchase flow is tested. **Build 31** built
  locally, verified (build 31, RC key, `storeBacked` in bundle), submitted
  to TestFlight. Test on 31, not 30.

- **Aug 17, 2026 03:13 UTC — SANDBOX PURCHASE VERIFIED END TO END (build 31):**
  owner started the Monthly free trial from the paywall on TestFlight
  build 31 (Apple sheet: "1-week free trial · $3.99/month starting Aug 23 ·
  For testing purposes only"). Server wrote the row within 10 s:
  `plus_status=active, product=murmur_plus_monthly, period=trial,
  expires 2026-08-18 03:13Z, will_renew=true, store=app_store,
  is_sandbox=true, synced_at 03:13:35`. Function logs: `revenuecat-webhook:
  INITIAL_PURCHASE → <uid> active` (03:13:34) and `plus-sync 200`
  (03:13:35) — both paths live. Phone Settings: "Free trial · ends
  Aug 17, 2026"; Apple's manage sheet shows the sandbox subscription.
  Remaining: web Settings check, optional cancel → lapsed lifecycle
  check, review screenshot per product, support email, re-lock the other
  five test profiles. (Paid Apps agreement/banking/tax: already Active
  since Jan 2026 — verified Aug 17.)

## Verification of what shipped today

- `packages/shared`: 267/267 tests (18 files) incl. 15 new entitlement cases
- `npx turbo typecheck`: 5/5 packages clean (shared, mobile, web, ai, desktop)
- `apps/web`: 38/38 tests; `next build` succeeds; `/privacy` and `/terms`
  are static public routes
- Prettier-clean on every new file

## Side thread — Apple Pay capture (Aug 17, 2026, owner question)

Status: app side is built (deep link `voiceexpense://shortcut?amount=…&merchant=…&currency=…&payment_method=digital_wallet`, parser, confirm sheet, `shortcut` source, Settings row hidden while `SHORTCUT_INSTALL_URL` is empty). Findings tonight, verified on the owner's iPhone:

- The Shortcuts trigger is named **"Wallet — When I tap a Wallet Card or Pass"** on current iOS (Apple's docs call it the Transaction trigger; older name "Transaction"). It only appears with a card in Wallet; the automation sheet's search is unreliable — scroll to the group with NFC / App / Wallet.
- Inside the automation the input is typed ("Receive transaction as input"), so `Select Variable → Shortcut Input → Amount / Merchant` works for building the URL. Owner built: Text (`voiceexpense://shortcut?amount=<Amount>&merchant=<Merchant>&currency=USD&payment_method=digital_wallet`) → Open URLs. Card-tap test pending.
- **Personal automations cannot be shared** (Apple). Distribution = publish the *shortcut* ("Log In Murmur": Text + Open URLs) to iCloud once → one-tap install from a Murmur button → user creates the Wallet automation themselves (~6 taps) guided by an in-app screen. MonAi (market leader) ships exactly this: Shortcuts-based, guided setup with steps + video, "set it once and track forever", shortcut runs in background with fallback persistence.
- Next: owner card-tap test → Claude builds the Settings button + guided setup screen (4 locales) + queued fallback → owner publishes the shortcut (Share → Copy iCloud Link) → `SHORTCUT_INSTALL_URL` set → next build.
- **Aug 17, 2026 — Apple Pay tap test + build 32:** owner's real Apple Pay
  purchase ($2.11, Three Square Market Vending) fired the Wallet automation
  and opened Murmur — on Today, not the confirm sheet: Wallet's Amount is a
  formatted currency string (`$2.11`) and `shortcutRouteParams` did
  `parseFloat` → NaN → fallback. Fixed: `parseShortcutAmount` handles
  symbols/letters/spaces/thousands/comma decimals; currency inferred from
  the symbol when the Shortcut omits it; negative (refund) → ignored. 18
  tests. **Build 32** built locally, verified, submitted to TestFlight
  (submission e8e6c7ce, finished). Next: owner re-tests a tap on 32 →
  then Claude builds the customer-facing setup (Settings button + guided
  automation screen + queued fallback) → owner publishes the "Log In
  Murmur" shortcut → `SHORTCUT_INSTALL_URL`.

## Apple Pay capture — built end to end (Aug 17, 2026)

**Owner decisions:** no confirm sheet — the amount and merchant come from
the card network, so the purchase **saves itself**; and a **notification**
confirms each save "the premium way". Same model as MonAi.

**How it works**
- `apps/mobile/native/ios/WalletCapture.swift` — App Intent **"Log Expense
  in Murmur"** (`openAppWhenRun = false`, iOS 16+). A Shortcuts *Wallet*
  automation calls it with the transaction's Amount / Merchant. It appends
  one JSON line to `Documents/wallet-capture-queue.jsonl` and posts a
  Murmur-branded local notification (id `wallet-capture-<id>`: "Saved
  $2.11 · Merchant / Filing it in Murmur…") — no Shortcuts dialog, so
  exactly one banner. Compiled into the app target by
  `plugins/withWalletCapture.js` (App Intents must live in the app target).
- `src/services/walletCapture.ts` — queue read/clear, deep-link enqueue,
  poke, `normaliseCapture` (uses `parseShortcutAmount` /
  `inferShortcutCurrency`; refunds dropped).
- `src/components/WalletCaptureDrain.tsx` (root layout, inside
  UndoProvider) — drains on launch / foreground / poke; for each entry:
  best-effort category from the AI parser (2.5 s budget) → `createTransaction`
  (`source: shortcut`, `payment_method: digital_wallet`, offline-first,
  FX, sync) → undo toast → `notifySaved` **replaces** the native placeholder
  with the final notification (category line, **Undo** / **Edit** actions,
  tap opens the transaction). In the foreground: toast only.
- `app/shortcut.tsx` (legacy `voiceexpense://shortcut?…` link) now
  enqueues + pokes instead of showing the confirm sheet.
- `app/more/apple-pay-setup.tsx` — Settings → Automations → **Apple Pay
  capture**: notification-permission card, the six taps (Automation → + →
  Wallet → Any Card / Run Immediately / Notify off → New Blank Automation →
  Add Action "Log Expense in Murmur" → Amount ← Shortcut Input › Amount,
  Merchant ← Shortcut Input › Merchant → Done), "Open Shortcuts", optional
  ready-made shortcut link when `SHORTCUT_INSTALL_URL` is set. Personal
  automations cannot be shared (Apple) — every user does these taps once.
- Tests: `shortcutLink.test.ts` (18), `walletCapture.test.ts` (3).

**Build 33** carries all of it. Owner test: rebuild the automation on the
phone using the "Log Expense in Murmur" action (replacing the Text/Open URLs
version), pay → no app launch, notification "Saved $x · Merchant" →
replaced with category + Undo/Edit → row in Today.

**Aug 17, 2026 20:49 CDT — REAL PURCHASE VERIFIED on build 33:** owner paid
$1.85 at a vending machine ("Canteen Des Moines 2", Chase Freedom
Unlimited via Apple Pay). Murmur did not open; the App Intent ran in the
background, the JS drain booted and saved the row (−$1.85 · Digital
Wallet · Logged via Apple Pay Shortcut, correct time), notifications
fired. Two flaws seen: (1) the native placeholder and the final
notification both remained — iOS did not replace in place; (2) category
"Uncategorised" (AI guess missed the 2.5 s budget). **Build 34** fixes
both: `notifySaved` dismisses the placeholder before posting the final;
`guessCategoryFromMerchant` (packages/shared categoryResolver) gives an
instant local guess from card-network merchant strings (canteen / vending
/ café / Starbucks → Food & Dining, Shell / Uber → Transport, Walgreens →
Health & Medical, Hy-Vee → Groceries, Amazon / Target → Shopping, Netflix
→ Subscriptions, …; 23 tests) with the AI refining within 4 s; copy
matches the mockup ("Captured from Apple Pay · $1.85" / "Merchant ·
Category · Tap to edit"). Build 34 submitted to TestFlight. Vending
machines report their own name, never the product — that is the card
network, same for every app.

**Aug 18, 2026 — wake-up gap found and fixed (build 35):** owner's real
tap at 1:12 PM on build 34 produced only the "Saving…" placeholder; the
row was saved at 1:32 PM when the app was opened (toast + category Food &
Dining via the merchant guesser). Cause: the App Intent runs in the app's
process, and when Murmur was *suspended in memory* nothing woke its
JavaScript (the day before, iOS had launched the app for the intent, so
it worked by luck). Fix: local Expo module `modules/wallet-capture`
(`WalletCaptureModule.swift` + `src/index.ts`) bridges intent ⇄ JS via
NotificationCenter names only: the intent posts `…DidAppend` (JS drains
immediately) and **waits up to 20 s** for JS to `reportDone(id)` after the
save + final notification; only on timeout does it post the placeholder
(and skips it if a final notification with that id already exists). The
drain calls `reportCaptureDone` in a `finally` for every entry.
**Build 35 submitted to TestFlight (Aug 18, 2026)** — carries the
intent ⇄ JS wake-up bridge. Owner test: next real Apple Pay tap → within
seconds, one notification "Captured from Apple Pay · $x / Merchant ·
Category · Tap to edit", no app launch, row in Today.

**Aug 24, 2026 — owner field-test review (builds 35 ran Aug 19–22), three fixes → build 36:**
1. **Logos.** Chase shows Target's logo for "Target T-1768"; Murmur showed a
   letter tile — `guessDomain` built `targett1768.com` → 404. New shared
   `domain/merchantBrand.ts`: `cleanMerchantDescriptor` (strips `#05213`,
   `T-1768`, `*AB12`, trailing ", City, ST") + `brandDomainForMerchant`
   (~60-chain regex→domain table). Wired: capture drain persists the domain
   at save; mobile `merchantLogo.ts` and web `MerchantLogo.tsx` fall back
   stored → brand table → guess(cleaned) — existing rows get logos too.
   Unknown locals (Canteen, Peking Buffet) keep the letter tile — honest
   ceiling without a paid enrichment feed (same as Chase's fork icon).
2. **Gas pumps / "Automation failed".** Three Maverik purchases (2× Aug 22,
   1× weekend) never captured; Shortcuts said "There was a problem running
   the automation". Cause: pay-at-pump pre-auths reach the automation with
   NO amount, and the intent's *required* Amount parameter made iOS kill
   the run before anything was queued. Amount is now optional: missing →
   still queued → notification "Captured from Apple Pay / Merchant ·
   Couldn't read the amount · Tap to add it" → tap opens Quick entry with
   the merchant pre-filled (`/transaction/new?merchant=`). Native wait
   20 s → 8 s (automations have a tight execution budget; overrunning it
   also reads as "failed"). Keywords: Maverik → Transport, buffet/peking/
   wok/hibachi → Food & Dining (Peking Buffet had saved uncategorised).
3. **Quick entry sheet.** Owner: dead gap between scan row and keypad,
   everything sticking to borders. Cause: `space-between` body with a
   compact top cluster. Keypad stays bottom-anchored; the slack now goes
   to the amount hero (flexGrow chain); side padding 16→20, inputs 8→12pt
   vertical, keypad gaps 5→8. Short screens scroll as before.
Tests: 298 shared / 123 mobile / 38 web. **Build 36.** NOTE for owner: the
Shortcuts automation must be re-pointed once — the action's Amount field
shows as optional now; open the automation, confirm Amount ← Shortcut
Input › Amount is still set after updating to build 36.

**Aug 24, 2026 (cont.) — keep-until-resolved + local stations → build 38:**
owner asked "is this the best way?"; review exposed that the tap-to-add
notification was the *only* trace of an amount-less capture — swiping it
away lost the purchase again. Now: amount-less captures persist in
`wallet-capture-incomplete.jsonl`; the reminder re-posts on every
launch/foreground; the notification carries captureId + capturedAt; Quick
entry saving from a capture writes `digital_wallet` / `source: shortcut`
at the tap's own timestamp and clears the parked capture. Brand table +
gas keywords gained **Kwik Star** (kwiktrip.com) and **Murphy USA** — the
owner's local stations. Builds 36/37 superseded unshipped; **build 38**
(verified: optional amount, incomplete store, brand table, kwik) submitted
to TestFlight. Owner on install: 10-s check that the automation's Amount ←
Shortcut Input › Amount is still set.

**Aug 29, 2026 — Google login from itsmurmur.com fixed:** owner's Google
sign-in bounced to `localhost:3000` (ERR_CONNECTION_REFUSED). Cause: the
domain cutover never touched Supabase Auth; `site_url` was still
`http://localhost:3000` and the redirect allow-list lacked the new domain,
so Supabase ignored the app's `redirectTo` and fell back. Fixed via the
management API: `site_url = https://itsmurmur.com`, allow-list =
itsmurmur.com/**, www.itsmurmur.com/**, the vercel.app fallback,
localhost for dev, and the mobile deep links (unchanged). Email templates
now also stamp the real domain ({{ .SiteURL }}). Verified: the authorize
endpoint 302s to Google with the new redirect accepted. Lesson recorded:
a domain cutover must sweep auth config (site URL, allow-list), not just
DNS and metadata.

**Aug 29, 2026 — Desktop 1.0.0 shipped (Mac public, Windows built and
held):** the packaged Electron app is now downloadable from the landing
page. What was done, end to end:

- *Signing:* Developer ID Application certificate created for team
  47WU47J52M (CSR + private key generated locally; key material lives in
  `~/.murmur-signing/`, chmod 700, never committed). electron-builder
  release config gained `hardenedRuntime`, the original
  `entitlements.mac.plist` (JIT, mic, network), and `notarize: true`;
  `afterPack.cjs` now skips its ad-hoc re-sign whenever a real identity
  is in play so the Developer ID signature survives.
- *Notarization:* notarytool with the Apple ID + app-specific password
  (creds in `~/.murmur-signing/notary.env`, never committed). First-ever
  submission for this team took ~2.5 h in Apple's deep scan, verdict
  **Accepted**. Verified locally: `spctl` says "accepted, source =
  Notarized Developer ID" for both arches and `stapler validate` passes
  on the apps inside the DMGs, so first launch works even offline.
- *Distribution:* public artifacts repo **github.com/rapetoh/murmur-releases**
  (installers only, source stays private). Release **v1.0.0** carries
  Murmur-1.0.0-arm64.dmg, Murmur-1.0.0.dmg (Intel), both blockmaps and
  latest-mac.yml. All URLs verified 200 via
  `releases/latest/download/...`. The **Windows** installer
  (Murmur-Setup-1.0.0.exe + latest.yml, unsigned) was built and then
  deliberately **removed from the public release**: the owner wants to
  decide on Windows himself. It sits in `apps/desktop/release/`;
  publishing it is one `gh release upload` away.
- *Auto-update:* electron-updater wired in `main.ts` (packaged builds
  only): check on launch + every 4 h, auto-download, quiet failures,
  restart prompt when ready. Feed = the GitHub release's latest-mac.yml.
  Shipping an update = bump version, rebuild (signing + notarization run
  automatically), `gh release create vX.Y.Z` with the new artifacts, and
  update the two versioned download URLs in `apps/web/src/app/page.tsx`.
- *Landing page:* hero primary is now "Download for Mac" (arm64) with an
  "Intel Mac version" note line and a footer link; App Store stays
  "soon". Screenshot-verified at 1440 and 390 before push.

**Aug 29, 2026 (later) — Windows published:** the owner decided to
publish Windows (he will test it on his own Windows machine).
Murmur-Setup-1.0.0.exe, its blockmap and latest.yml were uploaded to the
same v1.0.0 release; the published exe was downloaded back and is
byte-identical to the local build (97,874,401 bytes). The landing hero
note line now reads "Apple Silicon · signed & notarized · Intel Mac ·
Windows" and the footer gained "Download for Windows". The installer is
UNSIGNED: first run shows the SmartScreen "Windows protected your PC"
dialog and the tester clicks "More info" then "Run anyway". Windows
auto-update via latest.yml works for future versions; a code-signing
certificate for Windows remains an open decision (cost vs SmartScreen
reputation).

**Sep 2, 2026 (night) — App Store submission prep:** owner uploading
screenshots and filling ASC for the 1.0 review. Shipped to support it:
TestFlight **build 41** (version 1.0.0) built locally and uploaded via
`eas submit` (submission 91261f63); carries the Privacy Center rewrite,
the slimmed privacy screen, Insights Highlights, and the income
coherence work (migration 032, applied to prod). App Review demo
account created and login-verified: review@itsmurmur.com (password with
the owner). Full paste-ready metadata (description, keywords, privacy
questionnaire answers, review notes) delivered in-session. Still open
before Submit: attach build 41, attach the Murmur Plus subscription
group to the version, Yearly review screenshot. Before public RELEASE:
re-lock the hand-granted plus_status test accounts.

**Sep 3, 2026 (overnight) — Invalid Binary (ITMS-90111) and the Xcode 27
fix, build 44:** the 12:15 AM review submission was auto-rejected in one
minute: version flagged "Invalid Binary" with NO reason anywhere in ASC
(TestFlight still said Validated). The reason arrived only by email to
the gmail (found in Outlook's "Other" tab): ITMS-90111, App Store
submissions must use the latest Xcode/SDK RC; our Xcode 26.6 (latest
GA, iOS 26.5 SDK) no longer qualifies. Fix: owner downloaded Xcode 27
beta 6 (no RC exists yet) from ADC; installed to
/Applications/Xcode-27-beta6.app (license accepted via admin prompt;
26.6 kept). First rebuild failed: Xcode 27 hard-errors pods declaring
deployment targets 9.0-13.0 (AppAuth, SDWebImage, GoogleSignIn, GTM*,
RevenueCat, RNSVG bundles). Editing apps/mobile/ios/Podfile did NOTHING
(workflow is MANAGED: EAS prebuilds into a temp dir every build) — the
durable fix is the config plugin plugins/withPodTargetFloor.js, which
injects a 15.1 deployment-target clamp into the generated Podfile.
Build 44 (1.0.0, iphoneos27.0, 27A5252f) built clean and was uploaded
via eas submit. Remaining: swap build 41 -> 44 on the version page and
"Update Review" (the subscriptions stayed Ready for Review). Builds:
DEVELOPER_DIR=/Applications/Xcode-27-beta6.app/Contents/Developer must
be exported for eas build --local until 27 goes GA and replaces
/Applications/Xcode.app. Risk noted: if Apple's gate refuses beta-built
binaries, resubmit unchanged the day the 27 RC ships.
