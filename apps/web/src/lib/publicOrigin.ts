/**
 * The origin the browser actually used for this request, for building
 * absolute redirects in route handlers (Oct 22 2026).
 *
 * `new URL(request.url).origin` is not it everywhere: the desktop app's
 * embedded Next server sits behind the app's local gateway, and Next
 * builds `request.url` from its own listening address (localhost:<next
 * port>), so /auth/callback redirected the window off the gateway's origin
 * and away from the sign-in cookie it had just set. The Host header (and
 * Vercel's x-forwarded-host) carries the real one.
 *
 * Only Murmur's own hosts are trusted, so a forged Host header can never
 * turn a redirect into one to somewhere else.
 */
const TRUSTED_HOST = [
  /^itsmurmur\.com$/,
  /^www\.itsmurmur\.com$/,
  /^money-app-web-[a-z0-9-]+\.vercel\.app$/,
  /^127\.0\.0\.1:\d{2,5}$/,
  /^localhost:\d{2,5}$/,
]

export function publicOrigin(request: Request): string {
  const url = new URL(request.url)
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const host = forwardedHost || request.headers.get('host')?.trim()
  if (!host || !TRUSTED_HOST.some((re) => re.test(host))) return url.origin
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const local = /^(127\.0\.0\.1|localhost):/.test(host)
  const proto =
    forwardedProto === 'https' || forwardedProto === 'http'
      ? forwardedProto
      : local
        ? 'http'
        : 'https'
  return `${proto}://${host}`
}
