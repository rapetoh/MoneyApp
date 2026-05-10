'use client'

import { useEffect, useState } from 'react'

/**
 * Renders a draggable title-bar strip that occupies the top of the
 * window in the packaged Electron desktop app, leaving room for the
 * macOS traffic-light buttons (red/yellow/green at the top-left).
 *
 * Only mounts on **macOS** (`platform === 'darwin'`). On Windows the
 * OS provides its own native title bar with min/max/close buttons
 * above the BrowserWindow content — there's no traffic-light strip
 * to clear, and the layout looks correct without any extra padding.
 * On pure web, `window.murmur` is undefined and this component
 * renders nothing.
 *
 * The preload exposes `window.murmur.platform`; we add a fixed-position
 * 36px strip with `-webkit-app-region: drag` so the whole strip works
 * as a window-drag handle (matches Linear / Notion / Slack on macOS),
 * and we set a CSS variable so `<body>` can pad its content down by
 * the same amount.
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
  const [isMac, setIsMac] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onMac = window.murmur?.platform === 'darwin'
    setIsMac(onMac)
    document.documentElement.style.setProperty(
      '--desktop-title-bar',
      onMac ? `${TITLE_BAR_HEIGHT}px` : '0px'
    )
  }, [])

  if (!isMac) return null

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
        // Opaque cream — must mask any content that scrolls underneath
        // (sidebar logo, page header, etc.) so the macOS traffic lights
        // never collide with app content. Same colour as bgDesk so the
        // strip is invisible to the user but visually load-bearing.
        background: '#F4F1EA',
      } as React.CSSProperties}
    />
  )
}
