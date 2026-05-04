'use client'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { useState, useEffect } from 'react'
import { colors, font } from '../lib/theme'
import { Icon } from './Icons'

export function Toolbar({
  title,
  right,
  searchInitial,
}: {
  title: string
  right?: ReactNode
  /**
   * Optional initial value for the global search field. Pages that already
   * own a "?q=" param (Transactions) hydrate the toolbar field with it; other
   * pages start empty and routing the user to /dashboard/transactions on
   * submit.
   */
  searchInitial?: string
}) {
  return (
    <div style={styles.toolbar}>
      <div style={styles.toolbarTitle}>{title}</div>
      <div style={styles.toolbarRight}>
        {right}
        <ToolbarSearch initial={searchInitial} />
      </div>
    </div>
  )
}

function ToolbarSearch({ initial }: { initial?: string }) {
  const router = useRouter()
  const [value, setValue] = useState(initial ?? '')
  const [focused, setFocused] = useState(false)

  // Keep the field synced if the page changes its initial value (e.g.
  // navigating between transactions filter states).
  useEffect(() => {
    setValue(initial ?? '')
  }, [initial])

  // ⌘K / Ctrl-K focuses the search field from anywhere on the page.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
      if (!isCmdK) return
      e.preventDefault()
      const el = document.getElementById('toolbar-search-input') as HTMLInputElement | null
      el?.focus()
      el?.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    const target = trimmed
      ? `/dashboard/transactions?q=${encodeURIComponent(trimmed)}`
      : '/dashboard/transactions'
    router.push(target)
  }

  return (
    <form
      onSubmit={submit}
      style={{
        ...styles.search,
        borderColor: focused ? colors.ink4 : colors.line,
      }}
    >
      <Icon.search color={colors.ink3} size={13} />
      <input
        id="toolbar-search-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Search expenses"
        style={styles.searchInput}
      />
      <span style={styles.kbd}>{'⌘K'}</span>
    </form>
  )
}

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    height: 52,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    flexShrink: 0,
    fontFamily: font.sans,
  },
  toolbarTitle: {
    fontFamily: font.sans,
    fontSize: 15,
    fontWeight: 700,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  search: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    background: 'rgba(255,255,255,0.7)',
    borderRadius: 8,
    border: `0.5px solid ${colors.line}`,
    fontSize: 12,
    color: colors.ink3,
    fontFamily: font.sans,
    width: 220,
    transition: 'border-color 120ms',
  },
  searchInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontFamily: font.sans,
    fontSize: 12,
    color: colors.ink2,
    minWidth: 0,
    padding: 0,
  },
  kbd: {
    color: colors.ink4,
    fontFamily: font.mono,
    fontSize: 11,
    flexShrink: 0,
  },
}
