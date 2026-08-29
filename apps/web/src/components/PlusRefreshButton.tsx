'use client'
// "I subscribed on my iPhone — refresh" (payments, Aug 16 2026).
//
// Web/desktop do not sell Plus (v1 sells on iOS only); the account
// unlocks here because the server writes profiles.plus_status from the
// store record. Normally the RevenueCat webhook lands within seconds of
// the purchase, but a user who buys on the phone while looking at the
// desktop paywall shouldn't have to guess — this calls the same plus-sync
// Edge Function the phone calls after purchase (server re-reads
// RevenueCat, writes the row) and then re-renders the dashboard so the
// server-resolved gate (dashboard/layout.tsx) picks up the new value.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../lib/supabase/client'
import { colors, font, radius } from '../lib/theme'

export function PlusRefreshButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'busy' | 'none' | 'error'>('idle')

  async function refresh() {
    setState('busy')
    try {
      const supabase = createClient()
      const { data, error } = await supabase.functions.invoke('plus-sync', { method: 'POST' })
      if (error) throw error
      const d = data as { wrote?: boolean; entitlement?: { plus_status?: string } } | null
      if (d?.wrote && d.entitlement?.plus_status === 'active') {
        router.refresh()
        setState('idle')
      } else {
        setState('none')
      }
    } catch {
      setState('error')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
      <button
        type="button"
        onClick={refresh}
        disabled={state === 'busy'}
        style={{
          fontFamily: font.sans,
          fontSize: compact ? 12 : 13,
          fontWeight: 600,
          color: colors.accent,
          background: colors.accentSoft,
          border: 'none',
          borderRadius: radius.md,
          padding: compact ? '6px 10px' : '8px 14px',
          cursor: state === 'busy' ? 'default' : 'pointer',
          opacity: state === 'busy' ? 0.6 : 1,
        }}
      >
        {state === 'busy' ? 'Checking…' : 'Already subscribed? Refresh'}
      </button>
      {state === 'none' && (
        <span style={{ fontFamily: font.sans, fontSize: 12, color: colors.ink3 }}>
          No active subscription found for this account yet. If you just subscribed, give it a few
          seconds and try again.
        </span>
      )}
      {state === 'error' && (
        <span style={{ fontFamily: font.sans, fontSize: 12, color: colors.ink3 }}>
          Couldn&apos;t check right now, try again in a moment.
        </span>
      )}
    </div>
  )
}
