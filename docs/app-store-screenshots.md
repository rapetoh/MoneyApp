# App Store screenshots (v3, Nov 2026)

10 iPhone (1284×2778) + 5 iPad (2064×2752) + 1 Apple Watch (416×496). Replaces the Sep 2026 set.

**Apple Watch is required** since 1.0.2 ships the Watch app: App Review refused the first submit with
"App screenshot missing (APPLE_WATCH)". `APP_WATCH_SERIES_10/01-watch.png` is a real capture of the
watch app on an Apple Watch Series 11 (46mm) simulator (watchOS 27, paired with an iOS 27 iPhone sim),
flattened to an opaque PNG. Maestro cannot drive watchOS, so it shows the main screen, not a saved reply.

| | |
| --- | --- |
| Edit | `apps/mobile/store/apple/design/frames.jsx` (frames), `frames.css` (fonts), `photos/`, `logos/` |
| Pack | `node apps/mobile/store/apple/pack-screenshots.mjs` builds `docs/Murmur App Store Screenshots v3 (Standalone).html` (open it in a browser to see every frame; `#ip-03` shows one) |
| Render | `node apps/mobile/store/apple/render-screenshots.mjs` (Mac only, all 15 in about 80 s) |
| Output | `apps/mobile/store/apple/screenshot/en-US/APP_IPHONE_65`, `APP_IPAD_PRO_3GEN_129`, `APP_WATCH_SERIES_10` |
| Upload | `store.config.json` lists the files in order (EAS metadata), or drag them into App Store Connect |
| Editable | only while a version is in Prepare for Submission (or rejected) |

## Product page header (iOS 27, Nov 2026)

The wide image at the top of the App Store page. Optional, new in iOS 27,
reviewed on its own (Asset Library), and it can go live on an already
released version. Not uploaded yet: it goes up after 1.0.2 is approved.

| | |
| --- | --- |
| Size | 3840 x 1646 (21:9), no alpha. Apple's art safe area: 1646 x 661 at x 1097, y 493 |
| Idea | "Speak your *spending.*" (frame 1's line) on forest green, inside the safe area. Outside it: the "Listening" bubble, the filed Starbucks card, drifting merchant logos (cropped away on phones) |
| Rules (Apple) | one idea, short phrase, no prices/offers/URLs, no platform or marketplace logos, 4+ |
| Edit | `apps/mobile/store/apple/design/header.html` (1920 x 823 CSS px) |
| Render | `node apps/mobile/store/apple/render-header.mjs` (headless Chrome at 2x, sips flattens alpha, checks size) |
| Output | `apps/mobile/store/apple/header/en-US/header-3840x1646.png` |
| Upload | App Store Connect > the version > Product Page Information > Header and Search Results > Header. EAS metadata and apple-utils do not support this placement yet |
| Search results | No separate image on purpose: without one, the App Store shows frames 1 to 3, which were designed for search |

## The order, and why

Search results show only frames 1 to 3. They carry the whole pitch; the rest
answer the doubts of someone who kept scrolling.

| # | Frame | The question it answers |
| --- | --- | --- |
| 1 | Speak your *spending.* | What is this? One sentence and it is filed. Nobody else does this. |
| 2 | Tap to pay. *Logged already.* | Do I have to log every purchase? No, Apple Pay logs itself. |
| 3 | Ask anything *about your money.* | Will it actually help me? "Can I afford Lisbon?" "Yes, by June." |
| 4 | No bank linking. *Ever.* | Can I trust it? The difference from Monarch and Copilot. |
| 5 | Log it from *anywhere.* | Widgets, Apple Watch, Siri. |
| 6 | See where it *goes.* | Categories and the month-end forecast. |
| 7 | A budget that *doesn't nag.* | Budgets, rollover, savings goals. |
| 8 | Every subscription, *spotted.* | Recurring, with the weekly bill reminder. |
| 9 | Side business? *Kept apart.* | For people with a farm, a booth, a side gig. |
| 10 | Bring your history. *Cleaned up.* | For people switching from another app. |

iPad: frames 1 to 5.

## The system

| Piece | Rule |
| --- | --- |
| Headline | Fraunces 500, website's `lp-h1` (tight tracking), one italic sage phrase |
| People | Frames 1 to 3 show a real person in the moment: speaking to the phone, tapping to pay, planning a trip. Unsplash License, `design/photos/CREDITS.md` |
| Logos | The site icons the app itself shows (`merchantBrand.ts`), saved sharp in `design/logos`; vectors only where the icon is too small. Never a letter tile: the frame code logs `LETTER-FALLBACK` if one slips in |
| Colour | Merchants chosen to stand out from the sage brand: Blue Bottle (blue), Target, Lyft, Instacart. No green merchant as the hero |
| Ground | Light and dark alternate (cream, night, sage, forest, clay ...), paper grain |
| Device | iPhone at 1.2×, bleeding off the bottom; one proof piece lifted out and enlarged |
| In-device UI | Mirrors the shipped screens: Budgets uses the app's colour dots and "rolled over" line, not letter tiles |

## True in the build

| Frame | Source |
| --- | --- |
| Voice | voice overlay, parser, "Filed" result sheet |
| Apple Pay | `applepay.notif_captured` notification ("Captured from Apple Pay · $31.69", the amount on the terminal in the photo) |
| Ask | Ask Murmur (Plus, 14-day trial on every account) |
| Privacy | on-device speech (`requiresOnDeviceRecognition`), no analytics SDK, account delete |
| Anywhere | `targets/widget`, `targets/watch`, Siri intent |
| Budgets | `budgets.rolled_over`, `GoalsSection` |
| Recurring | `notif.bill_week_*` |
| Businesses | business logos and the filtered header card (migration 045, `docs/businesses.md`) |
| Import | `app/more/import.tsx`, merchant naming |

## Never

- A price, "free" or a trial in a frame (App Store 2.3.7).
- Another app's name (Mint, Monarch, YNAB) even though import supports them.
- A feature the iPhone build lacks: per-business export and PDF import are web only.
- A letter tile for a merchant or a business.
- Numbers that disagree across frames: Friday April 18, $45.15 spent today, $473 left.

## Fonts

Fraunces, Plus Jakarta Sans and DM Mono are OFL and live in the bundle. New York
and SF Rounded are Apple system fonts: the bundle asks for `sysfont/<file>` and
the render script serves them from `/System/Library/Fonts`; they are never
committed.

The Sep 2026 bundle (`Murmur App Store Screenshots (Standalone) (1).html`) stays:
it is the pack script's base (React, device frame, app screens) and holds the
Mac marketing shots used on the website.

## Render script notes (Chrome, Nov 2026)

- Chrome's `--screenshot` command-line mode now times out with no file, so the
  script drives one headless Chrome over the DevTools protocol (no packages).
- Chrome's PNG encoder stalls above about 4 million pixels (every iPad frame is
  5.7M), so each frame is captured in 300-row bands and joined into one PNG by
  the script's own small encoder.
