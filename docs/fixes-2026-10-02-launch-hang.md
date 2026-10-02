# The app "crashing" on launch was an infinite splash

Owner report, Oct 2 2026: "my app is crashing, I just tried to open it on my
phone and it's crashing." Suspected cause at the time: a Vercel billing
notice.

## It was not Vercel, and it was not a crash

Vercel was healthy (site 200, API 401 as expected, itsmurmur.com 200), and
so was production: schema matched the app's contract column for column, 89
transactions with no nulls, 12 valid recurring rules, trial running to Oct 4,
the 06:00 recurring generator still writing rows.

The app was not crashing. It was hanging on the launch screen, forever. To
anyone holding the phone that is indistinguishable from a crash: the mark
sits there, nothing happens, you force-quit.

Reproduced in the iOS simulator from HEAD. A Release build whose keychain
entitlements were missing sat on the launch mark indefinitely, logging:

```
Error Domain=NSOSStatusErrorDomain Code=-34018 "Client has neither
application-identifier nor keychain-access-groups entitlements"
(React) 'Auto refresh tick failed with error.'
  [Error: Calling the 'getValueWithKeyAsync' function has failed
```

## Cause

`app/_layout.tsx` gates the splash on one conjunction:

```ts
const ready = fontsReady && !loading && (!session || !profileLoading) && dataReady
```

Fonts had an escape hatch (`fontError` counts as resolved, with a comment
explaining that an infinite splash is the thing to avoid). The three network
preloads had a 2500 ms budget. Three waits had nothing:

| Wait | Source | Bound |
|---|---|---|
| `loading` | `useAuth`, session restore via SecureStore | **none** |
| `profileLoading` | `useProfile`, network read of `profiles` | **none** |
| `txLoading` | `useTransactions`, SQLite read | **none** |

And `useAuth` restored the session like this:

```ts
supabase.auth.getSession().then(({ data: { session } }) => {
  ...
  setLoading(false)
})
```

No `.catch`. `getSession()` reads the stored session through SecureStore, so
when that read rejects, `setLoading(false)` never runs, `loading` stays true
for the life of the process, `ready` never flips, and the splash never lifts.
No error, no retry, nothing to tap.

That also explains the shape of the report: fine for ten days, then broken on
every launch. A stored session that becomes unreadable stays unreadable, so a
transient failure presents as permanent.

## Fix

Three changes, at the source and then structurally.

1. **`useAuth` catches.** A session that cannot be read is a session we do
   not have: fall through to a null session, which routes to sign-in. That is
   recoverable, because signing in writes a fresh session over the unreadable
   one, and `onAuthStateChange` still heals a merely slow keychain.
2. **`useProfile` catches.** supabase-js reports most failures in the result
   rather than throwing, but a transport error throws, and that path has to
   end with the splash lifting too.
3. **A launch ceiling.** `LAUNCH_CEILING_MS = 8000` in `app/_layout.tsx`,
   started on mount and never reset, bounding the whole launch rather than
   any one wait. "Every future launch dependency remembers to resolve" is not
   a promise a codebase can keep; this makes it structural. Booting early is
   safe because the preload is an optimisation, not a precondition: every
   screen already renders its own loading and empty states. Eight seconds is
   far longer than a healthy cold start (about a second) and far shorter than
   the forever it replaces.

## Verification

Same simulator build that hung, rebuilt with the fix, now reaches the
sign-in screen instead of sitting on the mark. Before and after were the
identical build configuration; the only difference is this change.

`src/hooks/__tests__/useAuth.launch.test.ts` covers the restore step settling
on a clean read, no session, a rejected keychain read, and a rejection with
no error object, plus the ceiling's behaviour.

## Reaching the phone

This is app code, so it ships in a build. Until then, deleting and
reinstalling clears the unreadable keychain item and the app starts again;
no data is lost, because everything is on the server and re-downloads on
sign-in.
