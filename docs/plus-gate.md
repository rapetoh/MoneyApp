# Plus screen (web + desktop)

What a person sees on itsmurmur.com or the desktop app once their 14 free days (or their subscription) are over. Rebuilt Oct 23 2026: the old card had no way forward.

## The flow

```
web / desktop: locked dashboard (own data, blurred)
   │
   ├─ computer ─► QR code ─► iPhone camera ─► itsmurmur.com/plus ─► "Open Murmur"
   │                                                                 │
   └─ iPhone browser ─► "Open Murmur" ───────────────────────────────┤
                                                                     ▼
                                  app opens on Plus (voiceexpense://more/paywall)
                                                                     │
                                       subscribe ─► RevenueCat ─► profiles.plus_status
                                                                     │
   web / desktop notices within ~4 s ─► blur clears ─► dashboard ◄───┘
```

## What the screen does

| Piece | Behaviour |
|---|---|
| Background | the page itself, blurred, `inert` (no clicks, no focus) |
| Hand-off | QR on computers, "Open Murmur" button on iPhone browsers |
| Account | email + sign-in provider, "Use another account" signs out |
| Unlock | checks `profiles` every 4 s (30 s after 10 min, only while visible); on focus also runs `plus-sync` (store re-read, max every 15 s) |
| Settings | always open (App Store 5.1.1(v)); phones get a Settings link since the screen is full-bleed there |
| Lapsed subscribers | "Your Plus subscription has ended", "Renew" wording |
| Per-feature gates | `PaywallGate` (Ask, Export) steps aside inside the blurred preview |

## /plus

| Visitor | Shows |
|---|---|
| iPhone | "Open Murmur" (deep link) + App Store link + Safari Smart App Banner |
| anything else | the QR again + App Store link |

No auto-redirect: Safari shows "address is invalid" for a custom scheme when the app is missing.

## Files

| | |
|---|---|
| Screen | `apps/web/src/components/DesktopPlusGate.tsx` |
| QR (static SVG, error correction H, mark in the centre) | `apps/web/src/components/PlusQr.tsx` |
| Landing | `apps/web/src/app/plus/page.tsx` |
| Links (App Store, deep link) | `apps/web/src/lib/links.ts` |
| Preview context | `apps/web/src/lib/plus.tsx` `PlusPreviewProvider` |

## Verified (Oct 23 2026, local site against production data, trial-ended test account)

- 1440, 900 and 390 px layouts; no page errors
- QR decodes to `https://itsmurmur.com/plus` from real screenshots (jsQR)
- Settings stays open; Ask shows one card, not two
- "Use another account" lands on /login
- plus_status flipped to active: page unlocked by itself in 4.0 s

## Later

- Universal link (itsmurmur.com/plus opening the app directly) needs `associatedDomains` + a native build.
- Selling Plus on the web (Stripe via RevenueCat Web Billing) is an owner decision.
- Desktop 1.0.3 (Oct 23 2026) carries the new screen to Mac and Windows; verified in the packaged app.
