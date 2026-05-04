'use client'

import { useEffect, useState } from 'react'

/**
 * Renders a draggable title-bar strip that occupies the top of the
 * window in the packaged Electron desktop app, leaving room for the
 * macOS traffic-light buttons (red/yellow/green at the top-left).
 *
 * On pure web, `window.murmur` is undefined and this component renders
 * nothing — the layout is identical to before.
 *
 * In the Electron build, the preload exposes `window.murmur.platform`;
 * we add a fixed-position 36px strip with `-webkit-app-region: drag`
 * so the whole strip works as a window-drag handle (matches Linear /
 * Notion / Slack on macOS), and we set a CSS variable so `<body>` can
 * pad its content down by the same amount.
 */
declare global {
  interface Window {
    murmur?: {
      platform: NodeJS.Platform
      versions: { electron: string; chrome: string; node: string }
    }
  }
}

const TITLE_BAR_HEIGHT = 36

export function DesktopChrome() {
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const inElectron = Boolean(window.murmur)
    setIsDesktop(inElectron)
    document.documentElement.style.setProperty(
      '--desktop-title-bar',
      inElectron ? `${TITLE_BAR_HEIGHT}px` : '0px'
    )
  }, [])

  if (!isDesktop) return null

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: TITLE_BAR_HEIGHT,
        zIndex: 1000,
        // Whole strip drags the window; child controls would need
        // `-webkit-app-region: no-drag` to remain clickable. The strip
        // is purely visual padding right now, so blanket drag is fine.
        WebkitAppRegion: 'drag',
        // Transparent so the cream desktop bg shows through.
        background: 'transparent',
      } as React.CSSProperties}
    />
  )
}
