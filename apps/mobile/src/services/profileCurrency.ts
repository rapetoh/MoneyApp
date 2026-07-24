/**
 * In-memory cache of the current user's profile currency.
 *
 * `createTransaction` and the recurring catch-up service both need
 * `profile.currency_code` to compute the FX snapshot at save time
 * (migration 011). Threading it through every call site (voice flow,
 * manual flow, scan flow, onboarding, edit screen, catch-up) would
 * mean six prop drills and a wider hook surface; instead we cache it
 * here and let `useProfile` push updates whenever the row changes.
 *
 * Lifecycle:
 *   - `useProfile` calls `setCurrentProfileCurrency` on every load
 *     and on every update.
 *   - Write paths read via `getCurrentProfileCurrency`. The default
 *     is 'USD' (matches the profile column default), so an early
 *     write before the profile loads still gets a sensible value.
 *   - Signing out resets to 'USD' via `useAuth`'s session listener
 *     (handled in app/_layout.tsx).
 */

let cached: string = 'USD'

export function setCurrentProfileCurrency(code: string | null | undefined): void {
  if (code && typeof code === 'string') cached = code
}

export function getCurrentProfileCurrency(): string {
  return cached
}
