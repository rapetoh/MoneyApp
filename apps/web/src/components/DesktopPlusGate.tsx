'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { isPlusFromProfile } from '@voice-expense/shared'
import { createClient } from '../lib/supabase/client'
import { PlusPreviewProvider } from '../lib/plus'
import { APP_STORE_URL, plusDeepLink } from '../lib/links'
import { Icon } from './Icons'
import { MurmurMark } from './MurmurMark'
import { PlusQr } from './PlusQr'

/**
 * The website and the desktop app are part of Murmur Plus (pricing model,
 * Sep 20 2026). The phone stays free forever. Every new account holds Plus
 * for its first 14 days, so this screen only appears once a trial or a
 * subscription has ended.
 *
 * Rebuilt Oct 23 2026 after the owner hit the old card, a dead end with no
 * way forward. Reference: WhatsApp Web's "link a device" screen (numbered
 * steps beside a QR code, and the page moves on by itself). It now:
 *  - shows the person's own dashboard, blurred, behind the card;
 *  - hands off to the iPhone with a QR code (itsmurmur.com/plus opens the
 *    app on its Plus screen), or an "Open Murmur" button when the page is
 *    already on an iPhone;
 *  - names the account that will unlock, with a way to switch accounts;
 *  - unlocks by itself: it watches the profile row, re-reads the store on
 *    focus (plus-sync), then clears the blur and reloads the server gate.
 *
 * Settings stays reachable without Plus on purpose: an account must always
 * be manageable and deletable from any device (App Store 5.1.1(v)).
 */
const ALWAYS_OPEN = ['/dashboard/settings']

// Profile check cadence while the screen is visible: quick at first (the
// person is usually subscribing right now), then relaxed.
const FAST_POLL_MS = 4000
const SLOW_POLL_MS = 30000
const FAST_WINDOW_MS = 10 * 60 * 1000
// plus-sync re-reads RevenueCat; only on focus, and not more than this often.
const SYNC_MIN_GAP_MS = 15000
const REVEAL_MS = 650

type Provider = 'apple' | 'google' | 'email' | string | null | undefined

const PROVIDER_LABEL: Record<string, string> = {
  apple: 'Apple',
  google: 'Google',
  email: 'email',
}

export function DesktopPlusGate({
  isPlus,
  userId,
  email,
  provider,
  lapsed,
  children,
}: {
  isPlus: boolean
  userId: string
  email: string | null
  provider: Provider
  lapsed: boolean
  children: ReactNode
}) {
  const pathname = usePathname() ?? ''
  const open = isPlus || ALWAYS_OPEN.some((p) => pathname.startsWith(p))
  if (open) return <>{children}</>
  return (
    <LockedPlus userId={userId} email={email} provider={provider} lapsed={lapsed}>
      {children}
    </LockedPlus>
  )
}

function LockedPlus({
  userId,
  email,
  provider,
  lapsed,
  children,
}: {
  userId: string
  email: string | null
  provider: Provider
  lapsed: boolean
  children: ReactNode
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<'waiting' | 'unlocking'>('waiting')
  // Decided after mount: `window.murmur` exists only in the desktop shell,
  // and the user agent only in the browser; reading either during render
  // would differ from the server's HTML.
  const [surface, setSurface] = useState<'web' | 'desktop' | 'iphone'>('web')
  const [signingOut, setSigningOut] = useState(false)
  const unlocked = useRef(false)

  useEffect(() => {
    if ((window as { murmur?: unknown }).murmur) setSurface('desktop')
    else if (/iPhone|iPod/.test(navigator.userAgent)) setSurface('iphone')
  }, [])

  useEffect(() => {
    const supabase = createClient()
    const startedAt = Date.now()
    let lastSync = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false

    async function check(withStoreSync: boolean) {
      if (stopped || unlocked.current) return
      if (withStoreSync && Date.now() - lastSync > SYNC_MIN_GAP_MS) {
        lastSync = Date.now()
        await supabase.functions.invoke('plus-sync', { method: 'POST' }).catch(() => undefined)
      }
      const { data } = await supabase
        .from('profiles')
        .select('plus_status, trial_ends_at')
        .eq('id', userId)
        .maybeSingle<{ plus_status: 'active' | 'lapsed' | 'free' | null; trial_ends_at: string | null }>()
      if (stopped || unlocked.current || !isPlusFromProfile(data)) return
      unlocked.current = true
      setPhase('unlocking')
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      setTimeout(() => router.refresh(), reduce ? 0 : REVEAL_MS)
    }

    function schedule() {
      const gap = Date.now() - startedAt < FAST_WINDOW_MS ? FAST_POLL_MS : SLOW_POLL_MS
      timer = setTimeout(async () => {
        if (document.visibilityState === 'visible') await check(false)
        if (!stopped && !unlocked.current) schedule()
      }, gap)
    }

    // Coming back from the phone: ask the store too, not only the row.
    const onReturn = () => {
      if (document.visibilityState === 'visible') void check(true)
    }

    schedule()
    window.addEventListener('focus', onReturn)
    document.addEventListener('visibilitychange', onReturn)
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      window.removeEventListener('focus', onReturn)
      document.removeEventListener('visibilitychange', onReturn)
    }
  }, [userId, router])

  async function switchAccount() {
    setSigningOut(true)
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const title = lapsed
    ? 'Your Plus subscription has ended'
    : surface === 'desktop'
      ? 'Unlock the Murmur desktop app'
      : 'Unlock Murmur on the web'
  const body = lapsed
    ? 'Renew Plus to bring back this screen, Ask Murmur, recurring detection and reports. Logging on your phone stays free, always.'
    : 'Plus adds this screen, Ask Murmur, recurring detection and reports. Logging on your phone stays free, always.'
  const steps =
    surface === 'iphone'
      ? [
          { title: 'Open Murmur on this iPhone', sub: 'It opens straight on Plus.' },
          { title: lapsed ? 'Renew Plus in the app' : 'Start Plus in the app', sub: 'Plans and free trial details are shown there.' },
          { title: 'Come back here', sub: 'This page unlocks on its own.' },
        ]
      : [
          { title: 'Scan the code with your iPhone camera', sub: 'Murmur opens straight on Plus.' },
          { title: lapsed ? 'Renew Plus in the app' : 'Start Plus in the app', sub: 'Plans and free trial details are shown there.' },
          { title: 'This page unlocks on its own', sub: 'Usually within a few seconds.' },
        ]
  const via = provider ? PROVIDER_LABEL[provider] ?? provider : null
  const initial = (email ?? '?').trim()[0]?.toUpperCase() ?? '?'

  return (
    <div className={`mpg-root${phase === 'unlocking' ? ' mpg-unlocking' : ''}`}>
      <style>{CSS}</style>
      <div className="mpg-preview" inert aria-hidden>
        <PlusPreviewProvider>{children}</PlusPreviewProvider>
      </div>
      <div className="mpg-scrim" aria-hidden />
      <div className="mpg-stage">
        <section className="mpg-card" aria-labelledby="mpg-title">
          <div className="mpg-grid">
            <div>
              <span className="mpg-eyebrow">
                <Icon.sparkle size={12} color="currentColor" />
                Murmur Plus
              </span>
              <h1 id="mpg-title" className="mpg-title">
                {title}
              </h1>
              <p className="mpg-body">{body}</p>
              <ol className="mpg-steps">
                {steps.map((s, i) => (
                  <li key={s.title} className="mpg-step">
                    <span className="mpg-num">{i + 1}</span>
                    <span>
                      <span className="mpg-step-title">{s.title}</span>
                      <span className="mpg-step-sub">{s.sub}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="mpg-side">
              {surface === 'iphone' ? (
                <div className="mpg-open">
                  <a className="mpg-open-btn" href={plusDeepLink('web_gate')}>
                    <MurmurMark size={22} variant="cream" />
                    Open Murmur
                  </a>
                  <a className="mpg-store" href={APP_STORE_URL} rel="noreferrer">
                    No app yet? Get it on the App Store
                  </a>
                </div>
              ) : (
                <div className="mpg-qr">
                  <div className="mpg-qr-tile">
                    <PlusQr size={176} />
                  </div>
                  <span className="mpg-qr-caption">Point your iPhone camera here</span>
                </div>
              )}
            </div>
          </div>

          <div className="mpg-foot">
            <div className="mpg-account">
              <span className="mpg-avatar" aria-hidden>
                {initial}
              </span>
              <span className="mpg-account-text">
                <span className="mpg-email" title={email ?? undefined}>
                  {email ?? 'This account'}
                </span>
                <span className="mpg-account-sub">
                  {via ? `Signed in with ${via}` : 'Signed in'}
                  <span aria-hidden> · </span>
                  <button type="button" className="mpg-switch" onClick={switchAccount} disabled={signingOut}>
                    {signingOut ? 'Signing out…' : 'Use another account'}
                  </button>
                  {/* Phones get this screen full-bleed (the sidebar does not
                      fit), so Settings, always open, gets a link here. */}
                  <span className="mpg-settings">
                    <span aria-hidden> · </span>
                    <a href="/dashboard/settings" className="mpg-settings-link">
                      Settings
                    </a>
                  </span>
                </span>
              </span>
            </div>
            <span className="mpg-status" role="status">
              {phase === 'unlocking' ? (
                <>
                  <span className="mpg-check" aria-hidden>
                    <svg width="10" height="10" viewBox="0 0 10 10">
                      <path d="M2 5.2 4.1 7.3 8 2.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  Plus is on
                </>
              ) : (
                <>
                  <span className="mpg-dot" aria-hidden />
                  Waiting for Plus
                </>
              )}
            </span>
          </div>
        </section>
      </div>
    </div>
  )
}

// Inline sheet: the screen needs container queries, hover states and
// keyframes, which inline styles cannot express. Values mirror lib/theme.
const CSS = `
.mpg-root{position:relative;height:100%;min-height:600px;overflow:hidden;container-type:inline-size;isolation:isolate}
.mpg-preview{position:absolute;inset:0;overflow:hidden;filter:blur(14px) saturate(.9);transform:scale(1.03);transform-origin:50% 0;opacity:.85;pointer-events:none;user-select:none;transition:filter .65s cubic-bezier(.2,.8,.2,1),transform .65s cubic-bezier(.2,.8,.2,1),opacity .65s ease}
.mpg-scrim{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 38%,rgba(244,241,234,.42),rgba(244,241,234,.88));transition:opacity .5s ease}
.mpg-stage{position:absolute;inset:0;overflow-y:auto;display:grid;grid-template-columns:minmax(0,1fr);place-items:center;padding:40px 24px}
.mpg-card{width:100%;max-width:820px;background:#FFFFFF;border:1px solid rgba(40,36,28,.08);border-radius:22px;padding:40px 44px 0;box-shadow:0 1px 2px rgba(40,36,28,.05),0 28px 80px -24px rgba(40,36,28,.28);animation:mpg-in .52s cubic-bezier(.2,.8,.2,1) backwards;transition:opacity .3s ease,transform .3s ease}
.mpg-grid{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:44px;align-items:center}
.mpg-eyebrow{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:#E8EDE3;color:#3F5A3E;font:600 11.5px/1 -apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase}
.mpg-title{margin:16px 0 0;font-family:"New York","Iowan Old Style",Georgia,"Times New Roman",serif;font-weight:500;font-size:34px;line-height:1.12;letter-spacing:-.02em;color:#1B1915;text-wrap:balance}
.mpg-body{margin:12px 0 0;max-width:44ch;font:400 15px/1.6 -apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif;color:#6C675E}
.mpg-steps{list-style:none;margin:26px 0 0;padding:0;display:grid;gap:15px}
.mpg-step{display:grid;grid-template-columns:26px 1fr;gap:12px;align-items:start}
.mpg-num{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:#F5F2EB;color:#3A3630;font:600 12.5px/1 -apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif;font-variant-numeric:tabular-nums}
.mpg-step-title{display:block;padding-top:3px;font:600 14.5px/1.35 -apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif;color:#1B1915}
.mpg-step-sub{display:block;margin-top:2px;font:400 13px/1.45 -apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif;color:#9C9589}
.mpg-qr{display:flex;flex-direction:column;align-items:center;gap:10px;padding:16px 16px 14px;border-radius:20px;background:#F5F2EB}
.mpg-qr-tile{padding:14px;border-radius:14px;background:#FFFFFF;border:1px solid rgba(40,36,28,.08);box-shadow:0 1px 2px rgba(40,36,28,.04)}
.mpg-qr-caption{font:500 12px/1.3 -apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif;color:#9C9589}
.mpg-open{display:flex;flex-direction:column;align-items:stretch;gap:12px;min-width:240px}
.mpg-open-btn{display:flex;align-items:center;justify-content:center;gap:10px;padding:14px 20px;border-radius:14px;background:#3F5A3E;color:#FBFAF7;text-decoration:none;font:600 15.5px/1 -apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif;box-shadow:0 1px 2px rgba(40,36,28,.12),0 8px 20px -8px rgba(63,90,62,.55);transition:transform .15s ease,background .15s ease}
.mpg-open-btn:hover{background:#36503A}
.mpg-open-btn:active{transform:scale(.98)}
.mpg-store{text-align:center;font:500 13px/1.3 -apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif;color:#6C675E;text-decoration:none}
.mpg-store:hover{color:#1B1915;text-decoration:underline;text-underline-offset:3px}
.mpg-foot{margin-top:34px;padding:18px 0 22px;border-top:1px solid rgba(40,36,28,.08);display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.mpg-account{display:flex;align-items:center;gap:12px;min-width:0;flex:1 1 280px}
.mpg-avatar{flex:none;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:#E8EDE3;color:#3F5A3E;font:600 13px/1 -apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif}
.mpg-account-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.mpg-email{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:600 13.5px/1.3 -apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif;color:#3A3630}
.mpg-account-sub{font:400 12.5px/1.3 -apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif;color:#9C9589}
.mpg-switch{appearance:none;border:0;background:none;padding:0;font:inherit;color:#6C675E;cursor:pointer;border-radius:4px}
.mpg-switch:hover{color:#1B1915;text-decoration:underline;text-underline-offset:3px}
.mpg-switch:focus-visible,.mpg-open-btn:focus-visible,.mpg-store:focus-visible{outline:2px solid #3F5A3E;outline-offset:3px}
.mpg-switch:disabled{cursor:default;opacity:.6;text-decoration:none}
.mpg-settings{display:none}
.mpg-settings-link{color:#6C675E;text-decoration:none}
.mpg-settings-link:hover{color:#1B1915;text-decoration:underline;text-underline-offset:3px}
.mpg-status{flex:none;display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;background:#F5F2EB;font:500 12.5px/1 -apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif;color:#6C675E}
.mpg-dot{width:7px;height:7px;border-radius:50%;background:#3F5A3E;animation:mpg-pulse 1.8s ease-out infinite}
.mpg-check{width:16px;height:16px;border-radius:50%;display:grid;place-items:center;background:#3F5A3E;color:#FBFAF7}
.mpg-unlocking .mpg-preview{filter:blur(0) saturate(1);transform:none;opacity:1}
.mpg-unlocking .mpg-scrim{opacity:0}
.mpg-unlocking .mpg-card{opacity:0;transform:translateY(-8px) scale(.98);transition-delay:.12s}
@keyframes mpg-in{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}
@keyframes mpg-pulse{0%{box-shadow:0 0 0 0 rgba(63,90,62,.45)}70%{box-shadow:0 0 0 7px rgba(63,90,62,0)}100%{box-shadow:0 0 0 0 rgba(63,90,62,0)}}
@container (max-width:760px){.mpg-grid{grid-template-columns:1fr;gap:28px}.mpg-side{justify-self:center}.mpg-card{padding:30px 26px 0}.mpg-title{font-size:30px}}
@container (max-width:460px){.mpg-stage{padding:20px 14px}.mpg-card{padding:24px 20px 0;border-radius:18px}.mpg-title{font-size:27px}.mpg-open{min-width:0;width:100%}.mpg-side{justify-self:stretch}}
@media (max-width:640px){.mpg-root{position:fixed;inset:0;z-index:50;height:auto;min-height:0;background:rgba(244,241,234,.55);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}.mpg-settings{display:inline}}
@media (prefers-reduced-motion:reduce){.mpg-card{animation:none}.mpg-dot{animation:none}.mpg-preview,.mpg-scrim,.mpg-card{transition-duration:.01s}}
`
