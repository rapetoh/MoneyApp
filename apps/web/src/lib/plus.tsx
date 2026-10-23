'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Web mirror of apps/mobile/src/hooks/usePlusStatus.ts.
 *
 * Same gating contract as mobile: exactly one source, `profile.plus_status
 * === 'active'` — resolved server-side by `resolvePlusStatus`
 * (`plus.server.ts`). No dev-mode or env-var hatch exists on either
 * platform (audit fix-plan 0.4 + 3.1 deleted both `MURMUR_DEV_PLUS` and
 * mobile's `__DEV__` override) — entitlement reads the same column for
 * every build.
 *
 * The server resolves the boolean once per request in
 * dashboard/layout.tsx and ships it through PlusProvider so the entire
 * dashboard subtree (server + client components) reads the same value.
 */

const PlusContext = createContext<{ isPlus: boolean }>({ isPlus: false })

export function PlusProvider({
  isPlus,
  children,
}: {
  isPlus: boolean
  children: ReactNode
}) {
  return <PlusContext.Provider value={{ isPlus }}>{children}</PlusContext.Provider>
}

export function usePlus(): { isPlus: boolean } {
  return useContext(PlusContext)
}

/**
 * True inside the blurred dashboard preview behind the Plus screen
 * (DesktopPlusGate). Per-feature gates (PaywallGate on Ask and Export)
 * step aside there, so the preview shows the page itself rather than a
 * second lock card behind the first.
 */
const PlusPreviewContext = createContext(false)

export function PlusPreviewProvider({ children }: { children: ReactNode }) {
  return <PlusPreviewContext.Provider value={true}>{children}</PlusPreviewContext.Provider>
}

export function usePlusPreview(): boolean {
  return useContext(PlusPreviewContext)
}
