'use client'

import { useEffect, useState } from 'react'

/**
 * The hero's download buttons, aimed at the device in front of the
 * visitor.
 *
 * The owner tried the site on a Windows machine and could not find the
 * Windows build; it was there, in 11px grey text under the buttons. A
 * download a visitor cannot see is a download that does not exist. So the
 * second button now names their own platform, and every platform stays
 * one click away in the "Get Murmur" section below either way.
 *
 * iPhone always leads: Murmur is a say-it-and-it-is-filed tool and the
 * phone is where that happens. The desktop apps are part of Plus, which
 * every new account holds for its first fortnight, so the label says so
 * rather than letting someone download a build they cannot sign into.
 *
 * Rendered server-side as the Mac variant and corrected on mount, which
 * keeps hydration deterministic; the anchor works before the JS lands.
 */
type Target = 'mac' | 'windows' | 'ios' | 'other'

const SECOND: Record<Target, { label: string; href: string; external: boolean } | null> = {
  mac: { label: 'Mac app · Plus', href: '', external: true },
  windows: { label: 'Windows app · Plus', href: '', external: true },
  ios: null,
  other: null,
}

export function HeroDownloads({
  appStoreUrl,
  macUrl,
  winUrl,
  appHref,
}: {
  appStoreUrl: string
  macUrl: string
  winUrl: string
  appHref: string
}) {
  const [target, setTarget] = useState<Target>('mac')

  useEffect(() => {
    const ua = navigator.userAgent
    if (/iPhone|iPad|iPod/.test(ua)) setTarget('ios')
    else if (/Windows/.test(ua)) setTarget('windows')
    else if (/Mac OS X/.test(ua)) setTarget('mac')
    else setTarget('other')
  }, [])

  const second = SECOND[target]
  const secondHref = target === 'windows' ? winUrl : macUrl

  return (
    <>
      <div className="lp-hero-ctas">
        <a href={appStoreUrl} className="lp-btn-primary" rel="noreferrer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#FBFAF7" aria-hidden>
            <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
          </svg>
          Get Murmur for iPhone
        </a>
        {second ? (
          <a href={secondHref} className="lp-btn-secondary">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 3v12m0 0 5-5m-5 5-5-5M4 21h16"
                stroke="#1B1915"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {second.label}
          </a>
        ) : (
          <a href={appHref} className="lp-btn-secondary">
            Open the web app
          </a>
        )}
        <a href="#get" className="lp-btn-ghost">
          Mac, Windows &amp; web
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 4v15m0 0 6-6m-6 6-6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>
    </>
  )
}
