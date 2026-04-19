# External Services & Pricing
## Murmur (formerly "Voice Expense Tracker")

Everything we depend on outside our own code. Reviewed before Phase 0.

---

## 1. Supabase — Backend
**What we use it for**: Database (PostgreSQL), authentication, real-time sync, file storage, Edge Functions  
**URL**: supabase.com

| Tier | Price | Limits | When we need it |
|------|-------|--------|-----------------|
| Free | $0 | 500MB DB, 50K monthly active users, 2 projects | Development + early launch |
| Pro | $25/month per project | 8GB DB, 100K MAU, 100GB storage | When we go live commercially |

**Our usage estimate**: Free tier covers us through development and early users. Upgrade to Pro before public launch.

---

## 2. OpenAI API — AI (Parsing, Scanning, Advisor)
**What we use it for**: Voice transcript parsing, receipt/paycheck OCR, financial advisor responses  
**URL**: platform.openai.com  
**Status**: Active primary provider (switched from Google Gemini — April 2026)

| Model | Input (per 1M tokens) | Output (per 1M tokens) | Vision | Notes |
|-------|----------------------|------------------------|--------|-------|
| GPT-4o-mini | $0.15 | $0.60 | Yes | Primary model for parsing + scanning |
| GPT-4o | $2.50 | $10.00 | Yes | Reserved for advisor if quality upgrade needed |

**Why we switched from Gemini**: Google's `@google/generative-ai` SDK was deprecated in November 2025. New Gemini models are no longer available via that SDK. After repeated 404 and 429 errors in production, we switched to OpenAI permanently. All AI calls now go through `openai.chat.completions.create()` with `response_format: { type: 'json_object' }` which strictly enforces JSON output.

**Our cost estimate at scale**:
- Avg parse call: ~250 input + ~80 output tokens = ~$0.000085/call (GPT-4o-mini)
- 40% skipped by local parser → effective cost ~$0.000051/entry
- 1,000 active users × 100 entries/month = 100K entries → ~$5.10/month in parsing costs
- Very manageable. Scales linearly.

**API routes using OpenAI**:
- `apps/web/src/app/api/ai/parse-expense/route.ts` — voice transcript parsing
- `apps/web/src/app/api/ai/parse-scan/route.ts` — receipt + paycheck OCR (vision)

---

## 4. Google Favicon V2 — Merchant Logos
**What we use it for**: Fetching real merchant/brand logos (favicons) for transaction display  
**URL**: `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://{domain}&size=128`

| Tier | Price | Limits |
|------|-------|--------|
| Free | $0 | No documented rate limits |

**Why we switched from Clearbit**: Clearbit Logo API (`logo.clearbit.com`) is completely dead — DNS no longer resolves (ERR_NAME_NOT_RESOLVED as of April 2026). Google Favicon V2 is backed by Google CDN infrastructure (`gstatic.com`), requires no API key, and returns proper PNG images.

**Quality notes**:
- Returns the largest favicon the website publishes, up to the requested `size` (128px). Does not upscale.
- Most major merchants return 64-128px logos (sufficient for 44-72px avatars on retina screens).
- Some merchants (e.g. Domino's) only publish 16x16 favicons — this is a limitation of the website, not the API. The app falls back to a colored circle with the merchant's initial when the image fails.
- `size=128` is the reliable sweet spot. `size=256` causes 404s for some domains.

**Our usage**: Logos are cached by React Native's Image component. No rate limit concerns at our scale.

---

## 5. Apple Developer Program — iOS App Store
**What we use it for**: Distributing the app on the App Store + TestFlight (beta testing)  
**URL**: developer.apple.com

| Cost | Notes |
|------|-------|
| $99/year | Required to publish on App Store. Also required for TestFlight. |

**Must be purchased before**: Phase 8 (Electron + Widgets) — needed for WidgetKit and device testing. Ideally buy early for TestFlight beta during Phase 3.

---

## 6. Google Play Console — Android App Store
**What we use it for**: Distributing the app on Google Play Store  
**URL**: play.google.com/console

| Cost | Notes |
|------|-------|
| $25 one-time | Registration fee. Pay once, publish forever. |

**Must be purchased before**: Phase 9 (Production Hardening / submission).

---

## 7. Vercel — Next.js Hosting (Web + API Routes)
**What we use it for**: Hosting the Next.js web app (browser dashboard) and all API routes (AI proxy, export, etc.)  
**URL**: vercel.com  
**Status**: Deployed and live — `https://money-app-web-w6su.vercel.app`

| Tier | Price | Limits | When we need it |
|------|-------|--------|-----------------|
| Hobby | $0 | Personal use only — NOT for commercial apps | Development only |
| Pro | $20/month | Commercial use, better performance, team features | Before public launch |

**Important**: Vercel's free tier prohibits commercial use. We must upgrade to Pro before we charge users.

**Current deployment**: The Next.js app is deployed on Vercel. The mobile app (`EXPO_PUBLIC_API_BASE_URL`) points to this Vercel URL — no local dev server needed for mobile development or testing. Env vars declared in `turbo.json` build task `env` array (required for Turborepo to pass them through to the build).

---

## 8. Expo EAS Build — Mobile App Builds
**What we use it for**: Building and submitting iOS (.ipa) and Android (.apk/.aab) binaries. Without this, we'd need to set up Xcode + Android Studio build pipelines manually.  
**URL**: expo.dev

| Tier | Price | Builds/month | When we need it |
|------|-------|--------------|-----------------|
| Free | $0 | 30 builds | Development |
| Production | $99/month | Unlimited | Active development + releases |

**Note**: 30 free builds/month is enough during early phases. Upgrade when we're shipping updates regularly.

---

## 9. Sentry — Error Tracking
**What we use it for**: Catching crashes and errors in production (mobile + web)  
**URL**: sentry.io

| Tier | Price | Limits |
|------|-------|--------|
| Free (Developer) | $0 | 5K errors/month, 1 user |
| Team | $26/month | 50K errors/month, 20 users |

**When we need it**: Phase 9 (Production Hardening). Free tier is fine to start.

---

## 10. PostHog — Product Analytics
**What we use it for**: Understanding how users use the app (feature usage, funnels, retention) — privacy-respecting, no selling of data  
**URL**: posthog.com

| Tier | Price | Limits |
|------|-------|--------|
| Free | $0 | 1M events/month |
| Paid | ~$0.000225/event | After 1M |

**Our usage**: 1,000 users × ~200 events/month = 200K events → well within free tier for a long time.

---

## 11. GitHub — Code Repository + CI/CD
**What we use it for**: Version control, pull requests, GitHub Actions (automated typecheck + lint on every commit)  
**URL**: github.com

| Tier | Price | Notes |
|------|-------|-------|
| Free | $0 | Unlimited private repos, 2,000 CI minutes/month |
| Team | $4/user/month | More CI minutes if needed |

**Our usage**: Free tier covers us. 2,000 minutes/month is plenty for our CI pipeline.

---

## 12. Domain Name — Web App
**What we use it for**: URL for the web/desktop companion (e.g. `getaria.app` or whatever the app name becomes)  
**Where to buy**: Namecheap, Google Domains, Cloudflare Registrar

| Cost | Notes |
|------|-------|
| ~$10–15/year | Depends on TLD (.app, .com, .io) |

**When we need it**: Before Phase 5 (Desktop dashboard launch).

---

## Summary — Monthly Cost at Launch

| Service | Monthly Cost |
|---------|-------------|
| Supabase Pro | $25 |
| Vercel Pro | $20 |
| OpenAI API / GPT-4o-mini (est. 1K users) | ~$5 |
| Sentry Free | $0 |
| PostHog Free | $0 |
| GitHub Free | $0 |
| Expo EAS Production | $99 |
| **Total (active development)** | **~$149/month** |
| **Total (post-launch, EAS downgraded)** | **~$50/month** |

**One-time costs**:
- Apple Developer Program: $99/year
- Google Play Console: $25 (once)
- Domain name: ~$12/year

**Break-even**: At $3.99/month per paying user, we break even on infrastructure at ~14 paying users. At $29.99/year, ~22 paying users.

---

## What Is Free Forever (Open Source Tools)
- React Native + Expo framework
- Next.js framework
- Electron
- Turborepo
- Supabase JS client library
- Recharts (charts)
- All other npm packages we use

---

*Last updated: April 14, 2026 — replaced dead Clearbit Logo API with Google Favicon V2; updated Supabase key format (legacy JWT → publishable key)*
