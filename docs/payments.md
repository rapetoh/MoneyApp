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

1. **App Store Connect → Business (Agreements, Tax, and Banking)** — sign
   the *Paid Apps* agreement; add bank account + tax forms. Nothing sells
   until Apple marks it Active (can take a day).
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

## Verification of what shipped today

- `packages/shared`: 267/267 tests (18 files) incl. 15 new entitlement cases
- `npx turbo typecheck`: 5/5 packages clean (shared, mobile, web, ai, desktop)
- `apps/web`: 38/38 tests; `next build` succeeds; `/privacy` and `/terms`
  are static public routes
- Prettier-clean on every new file
