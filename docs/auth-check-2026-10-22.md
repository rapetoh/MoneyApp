# Sign-in check, web + Mac (Oct 22 2026)

Every way in, tested for real on itsmurmur.com and the Mac app, as four kinds of account (trial, trial ended, lapsed Plus, active Plus).

## Result board

| Path | Web | Mac app | Status |
|---|---|---|---|
| Email sign-in | ✅ | ✅ | works |
| Email sign-up | ❌ said "check your email" (no email is ever sent) | same | **fixed**: signs straight in (iPhone app had the same screen; fixed too) |
| Google | ✅ | ❌ 1.0.0 hung on "Redirecting…", unreleased 1.0.1 blocked by Google | **fixed**: browser + hand-back (desktop 1.0.2) |
| Apple | ❌ `invalid_client` (Oct 18, from the logs) | ❌ same secret | **needs the Apple secret renewed** (below) |
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

1. **Apple secret** (Apple sign-in on web + Mac is down): Supabase dashboard > Authentication > Sign In / Providers > Apple > generate a new secret from the Sign in with Apple key (.p8), Services ID `com.voiceexpense.app.service`, Team `47WU47J52M`. Expires every 6 months: renew by April 2027.
2. **Email service** for password reset: Supabase's built-in sender only reaches project team addresses, 2 per hour. Connect Resend (or similar) as custom SMTP with `itsmurmur.com` verified.
3. **Google screen** says "continue to ohaqhwampmyoeaopdybd.supabase.co": fix with a Supabase custom domain (auth.itsmurmur.com, paid add-on) or Google OAuth brand verification.
4. Only 9 accounts, none new since Sep 20: the sign-up message above is the likely reason on web.
5. One real Google sign-in on Mac 1.0.2 (needs a real Google account; every step up to Google's own page was verified).

## Housekeeping

- The 6 `murmur.authtest.*@example.com` test accounts used for this check were deleted the same day.
- The iPhone sign-up fix ships in the next iOS build (1.0.2). Expo's build service was in maintenance on Oct 22; the build is queued as soon as it is back.

## Notes

- `apps/web/middleware.ts` sits at the app root while the app lives in `src/`, so Next 15 never runs it. Routes protect themselves (dashboard layout redirects). Do not "fix" it by moving it: it would gate the public homepage.
