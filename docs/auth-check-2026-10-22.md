# Sign-in check, web + Mac (Oct 22 2026)

Every way in, tested for real on itsmurmur.com and the Mac app, as four kinds of account (trial, trial ended, lapsed Plus, active Plus).

## Result board

| Path | Web | Mac app | Status |
|---|---|---|---|
| Email sign-in | ✅ | ✅ | works |
| Email sign-up | ❌ said "check your email" (no email is ever sent) | same | **fixed**: signs straight in (iPhone app had the same screen; fixed too) |
| Google | ✅ | ❌ 1.0.0 hung on "Redirecting…", unreleased 1.0.1 blocked by Google | **fixed**: browser + hand-back (desktop 1.0.2) |
| Apple | ✅ fixed Oct 23 (was `invalid_client`) | ✅ same secret | new key `USZ8G929WP`, secret installed, **expires 2027-04-21** |
| Password reset | email not delivered to customers | same | **needs an email service** (below) |
| Wrong password / expired link / signed-out dashboard | ✅ | ✅ | works |
| Stay signed in after quitting | - | ✅ | works |
| Sign out | ✅ | ✅ | works |

## By account type (web)

| Account | Sees |
|---|---|
| Trial (14 days) | full dashboard |
| Trial ended, never paid | Plus screen (Settings stays open) |
| Lapsed Plus | Plus screen |
| Active Plus | full dashboard |

## Also fixed

- Plus screen said "The desktop app is part of Murmur Plus" on the website; now names web or desktop correctly.
- Long names spilled out of the overview card.
- React hydration error #418 on Settings (time zone read during server render in UTC).
- Mac app opened on the marketing homepage; now opens on the dashboard (sign-in if signed out).
- Mac app: /auth/callback redirected to the embedded server's own port (localhost:<next>), off the cookie's origin. `lib/publicOrigin.ts` builds redirects from the trusted Host; the gateway forwards Host to Next.
- Mac app sign-in page no longer sticks on a spinner after handing off to the browser.

## Mac app sign-in, how it works now (1.0.2)

```
Continue with Google/Apple -> person's browser -> Supabase -> provider -> Supabase
-> browser: http://127.0.0.1:<gateway>/auth/callback?code=...
-> gateway: tab says "Go back to Murmur"; app window loads the same callback
-> code exchanged with the PKCE verifier the app holds -> dashboard
```

Google blocks embedded windows ("This browser or app may not be secure", verified). PKCE means a code from any flow the app did not start cannot be exchanged.

## Needs the owner

1. ~~Apple secret~~ **Done Oct 23.** Owner created Sign in with Apple key `USZ8G929WP` (old key `T8NPJNMWB2` file was lost; `D5NYC4452X` belongs to Okili). Secret = ES256 JWT, iss `47WU47J52M`, sub `com.voiceexpense.app.service`, 180 days, set via Management API `external_apple_secret`. Verified: Supabase now gets `invalid_grant` for a fake code instead of `invalid_client`. **Renew before 2027-04-21** with the same key file (keep it safe; Apple never re-downloads it).
2. **Email service** for password reset: Supabase's built-in sender only reaches project team addresses, 2 per hour. Connect Resend (or similar) as custom SMTP with `itsmurmur.com` verified.
3. **Google screen** says "continue to ohaqhwampmyoeaopdybd.supabase.co": fix with a Supabase custom domain (auth.itsmurmur.com, paid add-on) or Google OAuth brand verification.
4. Only 9 accounts, none new since Sep 20: the sign-up message above is the likely reason on web.
5. One real Google sign-in on Mac 1.0.2 (needs a real Google account; every step up to Google's own page was verified).

## Housekeeping

- The 6 `murmur.authtest.*@example.com` test accounts used for this check were deleted the same day.
- The iPhone sign-up fix is in iOS 1.0.2 (90), built and uploaded from the Mac with Xcode on Oct 23 (Expo's free plan had used its 15 iOS builds for October). Local route: `expo prebuild --clean` with the production env from eas.json, set build number, `xcodebuild archive -allowProvisioningUpdates`, `xcodebuild -exportArchive` with destination upload. The EAS remote build number is 116, so the next EAS build (117) stays above it.

## Notes

- `apps/web/middleware.ts` sits at the app root while the app lives in `src/`, so Next 15 never runs it. Routes protect themselves (dashboard layout redirects). Do not "fix" it by moving it: it would gate the public homepage.
