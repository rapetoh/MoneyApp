'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Web mirror of apps/mobile/src/hooks/usePlusStatus.ts.
 *
 * Same gating contract as mobile: in development, every user is treated
 * as Plus so the developer can exercise the gated surface (Insights,
 * Recurring detection, Ask Murmur, Export) without RC sandbox setup.
 * In production, `isPlus` flips off until IAP / RevenueCat receipts
 * populate `profile.plus_status` — except when the runtime override
 * `MURMUR_DEV_PLUS=1` (server-side) is set on the user's machine, which
 * is how the packaged dev build still gets to test Plus surfaces before
 * IAP wiring lands.
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
