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

/** Customer support inbox. Until `murmur.app` is registered + DNS is
 *  pointing at a real inbox, this is intentionally a placeholder; the
 *  important property is that nothing in the shipping app exposes a
 *  developer's personal email. Replace once the domain is live. */
export const SUPPORT_EMAIL = 'support@murmur.app'

/** Pre-formatted mailto: link with a sensible subject. */
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=Murmur%20feedback`
