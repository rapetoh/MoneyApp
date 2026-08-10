/**
 * Brand-level constants shared across mobile + web + desktop.
 *
 * Anything a user might see that names the product, the support
 * address, or the website lives here. One place so the help screens
 * and the settings screens can't drift the way they did before
 * (mobile shipping a personal Gmail, web shipping `hello@…`).
 */

/** Public name of the product. */
export const PRODUCT_NAME = 'Murmur'

/**
 * `PRODUCT_NAME` above names the *product* ("Murmur") — it is unrelated to
 * `<MurmurMark>`'s logo *mark* name, "Coin & Wave" (adopted Aug 7 2026,
 * replacing an earlier candidate, "The Listening Drop"). The two have
 * always been independent: the product was never renamed, only its icon
 * was. Noted here so a reader tracing one name doesn't mistake it for a
 * branding inconsistency in the other (fix-plan 4.6 / audit 08-F36).
 */

/**
 * Customer support inbox. `null` until `murmur.app` is registered and its
 * MX records point at a real inbox (fix-plan 3.6 / audit 08-F33) —
 * `support@murmur.app` looked like a working address but the domain has no
 * MX record, so every bug report, refund request and GDPR enquiry sent to
 * it silently bounced. `null` is the honest state: nothing in the shipping
 * app exposes a developer's personal email either. Every consumer
 * (`apps/mobile/app/more/help.tsx`, `apps/web/.../settings/page.tsx`) hides
 * its "contact us" row while this is `null` — an offered channel that
 * doesn't deliver is worse than no channel. Set this the moment the domain
 * resolves MX; no other code change needed.
 */
export const SUPPORT_EMAIL: string | null = null

/** Pre-formatted mailto: link with a sensible subject, or `null` when
 *  `SUPPORT_EMAIL` is unset — see its doc comment. */
export const SUPPORT_MAILTO: string | null = SUPPORT_EMAIL
  ? `mailto:${SUPPORT_EMAIL}?subject=Murmur%20feedback`
  : null

/**
 * The published iCloud Shortcut a user installs to log an Apple Pay
 * notification via the Automations row (fix-plan 3.4 / audit 07-F12,
 * 08-F19). Empty until a real shortcut is published to iCloud — the old
 * `'https://www.icloud.com/shortcuts/placeholder'` literal opened an
 * iCloud 404 for every user who tapped it. `apps/mobile/app/more/settings.tsx`
 * hides the entire iOS Automations row while this is empty; a row that
 * leads nowhere is worse than an absent row. Set this to the real iCloud
 * link the moment the shortcut is published — no other code change needed.
 */
export const SHORTCUT_INSTALL_URL = ''
