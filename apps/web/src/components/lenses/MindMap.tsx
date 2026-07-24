'use client'
import React, { useRef, useState, useCallback, useEffect } from 'react'
import { colors, font, cat as catTokens, type CategoryTint } from '../../lib/theme'
import { tintFor } from '../../lib/categories'
import {
  type LensProps,
  monthDebits,
  monthCredits,
  groupByCategory,
} from './types'
import { aggAmount } from '@voice-expense/shared'

// XMind-style radial diagram of the user's whole financial month.
// Center node = the user; four branches = Income / Expenses / Saved &
// invested / Recurring. Each branch carries its top sub-items as
// leaves.
//
// The canvas is treated as an infinite plane. The user pans by dragging
// any empty area of the dotted background and zooms with the trackpad
// or mouse wheel — same model as Figma / tldraw / Stitch / Claude
// Design. Clicking a node never starts a pan.

interface Branch {
  label: string
  side: 'left' | 'right'
  y: -1 | 1
  color: string
  total: number | null
  subs: Array<{ label: string; leaves: string[] }>
}

const CANVAS_W = 1600
const CANVAS_H = 760
const MIN_SCALE = 0.4
const MAX_SCALE = 2.5

function fmtMoney(value: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

function topN<T>(arr: T[], pick: (x: T) => number, n: number): T[] {
  return [...arr].sort((a, b) => pick(b) - pick(a)).slice(0, n)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function buildBranches(p: LensProps, displayName: string): Branch[] {
  const debits = monthDebits(p)
  const credits = monthCredits(p)
  const incomeTotal = credits.reduce((s, t) => s + aggAmount(t), 0)
  const expenseTotal = debits.reduce((s, t) => s + aggAmount(t), 0)
  const saved = Math.max(0, incomeTotal - expenseTotal)

  const fmt = (v: number) => fmtMoney(v, p.currency, p.locale)

  const incomeByCat = groupByCategory(credits)
  const incomeSubs = topN(
    Object.entries(incomeByCat).map(([name, amt]) => ({ name, amt })),
    (x) => x.amt,
    3,
  ).map((s) => ({
    label: `${s.name} · ${fmt(s.amt)}`,
    leaves: [],
  }))

  const expenseByCat = groupByCategory(debits)
  const expenseSubs = topN(
    Object.entries(expenseByCat).map(([name, amt]) => ({ name, amt })),
    (x) => x.amt,
    4,
  ).map((s) => {
    const merchTotals: Record<string, number> = {}
    for (const t of debits) {
      if ((t.category_name ?? 'Uncategorized') !== s.name) continue
      const m = t.merchant ?? 'Other'
      merchTotals[m] = (merchTotals[m] ?? 0) + aggAmount(t)
    }
    // Keep up to 25 merchants per category — enough to see a real
    // distribution at "show all" without exploding the canvas. The
    // visible cap is enforced separately at render time (default 5
    // shown, "+N more" terminator reveals the rest).
    const sorted = topN(
      Object.entries(merchTotals).map(([m, a]) => ({ m, a })),
      (x) => x.a,
      25,
    ).map((m) => `${m.m} · ${fmt(m.a)}`)
    return { label: `${s.name} · ${fmt(s.amt)}`, leaves: sorted }
  })

  const recurringMonthly = p.recurring
    .filter((r) => r.frequency === 'monthly')
    .reduce((s, r) => s + r.amount, 0)
  const savedSubs: Array<{ label: string; leaves: string[] }> = []
  if (saved > 0) savedSubs.push({ label: `Net saved · ${fmt(saved)}`, leaves: [] })
  if (recurringMonthly > 0) {
    savedSubs.push({
      label: `Recurring outflow · ${fmt(recurringMonthly)}/mo`,
      leaves: p.recurring.slice(0, 3).map((r) => r.name ?? 'Unnamed'),
    })
  }

  const planSubs = p.recurring.slice(0, 4).map((r) => ({
    label: `${r.name ?? 'Unnamed'} · ${fmt(r.amount)}`,
    leaves: [r.frequency],
  }))

  void displayName

  return [
    {
      label: 'Income',
      side: 'left',
      y: -1,
      color: colors.accent,
      total: incomeTotal > 0 ? incomeTotal : null,
      subs: incomeSubs,
    },
    {
      label: 'Expenses',
      side: 'right',
      y: -1,
      color: catTokens.bills.fg,
      total: expenseTotal > 0 ? expenseTotal : null,
      subs: expenseSubs,
    },
    {
      label: 'Saved & invested',
      side: 'right',
      y: 1,
      color: colors.accent,
      total: saved > 0 ? saved : null,
      subs: savedSubs,
    },
    {
      label: 'Plan',
      side: 'left',
      y: 1,
      color: '#7A4A22',
      total: null,
      subs: planSubs,
    },
  ]
}

export function MindMapLens({ props, displayName }: { props: LensProps; displayName: string }) {
  const cx = CANVAS_W / 2
  const cy = CANVAS_H / 2
  const branches = buildBranches(props, displayName)

  // Branch fold (parent) and sub-card leaf-limit (child). The sub
  // card's leaves only render when its branch is expanded AND the
  // sub's leaf-limit > 0 — that's how we keep collapsed parents from
  // leaking children into the viewport.
  //
  // Leaf-limit per sub:
  //   0    → collapsed (sub-card with no leaves shown)
  //   5    → "show top 5" (default expanded state)
  //   >=N  → "show all" up to total leaf count
  // Click the sub-card to toggle 0 ↔ 5; click the "+N more" terminator
  // to jump 5 → all. Re-clicking the sub-card snaps back to 0.
  const VISIBLE_LEAVES_DEFAULT = 5
  const [collapsedBranches, setCollapsedBranches] = useState<Set<string>>(new Set())
  const [subLeafLimits, setSubLeafLimits] = useState<Record<string, number>>({})

  function toggleBranch(label: string) {
    setCollapsedBranches((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }
  function toggleSubLeaves(key: string, totalLeaves: number) {
    setSubLeafLimits((prev) => {
      const cur = prev[key] ?? 0
      return { ...prev, [key]: cur === 0 ? Math.min(VISIBLE_LEAVES_DEFAULT, totalLeaves) : 0 }
    })
  }
  function expandAllSubLeaves(key: string, totalLeaves: number) {
    setSubLeafLimits((prev) => ({ ...prev, [key]: totalLeaves }))
  }

  // Pan / zoom state. Translation in viewport CSS pixels; scale is a
  // multiplier of the underlying CANVAS_W × CANVAS_H plane.
  const [view, setView] = useState({ tx: 0, ty: 0, scale: 1 })
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    active: boolean
    startX: number
    startY: number
    startTx: number
    startTy: number
  }>({ active: false, startX: 0, startY: 0, startTx: 0, startTy: 0 })

  // Reset the canvas to roughly center the design in the viewport on
  // first render and whenever the viewport's pixel size changes.
  const recenter = useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setView({
      tx: (width - CANVAS_W) / 2,
      ty: (height - CANVAS_H) / 2,
      scale: 1,
    })
  }, [])

  useEffect(() => {
    recenter()
    const el = viewportRef.current
    if (!el) return
    const ro = new ResizeObserver(recenter)
    ro.observe(el)
    return () => ro.disconnect()
  }, [recenter])

  // Wheel = zoom around the cursor (Figma-style). Trackpad pinch
  // arrives as a wheel event with ctrlKey on macOS, which we treat
  // identically to a regular zoom gesture. Without ctrlKey, the wheel
  // pans (matching the convention on every modern infinite canvas).
  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault()
    const el = viewportRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top

    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * 0.01)
      setView((v) => {
        const nextScale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE)
        const ratio = nextScale / v.scale
        return {
          scale: nextScale,
          tx: px - (px - v.tx) * ratio,
          ty: py - (py - v.ty) * ratio,
        }
      })
    } else {
      setView((v) => ({ ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY }))
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Don't grab when the user clicked on a node, button, or any
    // element that opted out of the pan gesture.
    const target = e.target as HTMLElement
    if (target.closest('[data-no-pan]')) return
    if (e.button !== 0) return
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startTx: view.tx,
      startTy: view.ty,
    }
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.active) return
    setView((v) => ({
      ...v,
      tx: dragRef.current.startTx + (e.clientX - dragRef.current.startX),
      ty: dragRef.current.startTy + (e.clientY - dragRef.current.startY),
    }))
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current.active = false
    try {
      ;(e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
    } catch {
      // ignore — pointer may already be released
    }
  }

  function zoomTo(scale: number) {
    const el = viewportRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = rect.width / 2
    const py = rect.height / 2
    setView((v) => {
      const nextScale = clamp(scale, MIN_SCALE, MAX_SCALE)
      const ratio = nextScale / v.scale
      return {
        scale: nextScale,
        tx: px - (px - v.tx) * ratio,
        ty: py - (py - v.ty) * ratio,
      }
    })
  }

  const incomeTotal = monthCredits(props).reduce((s, t) => s + aggAmount(t), 0)
  const expenseTotal = monthDebits(props).reduce((s, t) => s + aggAmount(t), 0)
  const net = incomeTotal - expenseTotal

  const branchEnd = (b: Branch): [number, number] => {
    const x = b.side === 'left' ? 460 : CANVAS_W - 460
    const y = b.y === -1 ? cy - 220 : cy + 220
    return [x, y]
  }

  const branchPath = (b: Branch): string => {
    const [x, y] = branchEnd(b)
    const dirX = b.side === 'left' ? -1 : 1
    const sx = cx + dirX * 110
    const sy = cy + b.y * 18
    const c1x = sx + dirX * 100
    const c1y = sy
    const c2x = x - dirX * 80
    const c2y = y
    return `M ${sx},${sy} C ${c1x},${c1y} ${c2x},${c2y} ${x},${y}`
  }

  const fmt = (v: number) =>
    new Intl.NumberFormat(props.locale, {
      style: 'currency',
      currency: props.currency,
      maximumFractionDigits: 0,
    }).format(v)

  // Dotted grid pattern — repeats with the canvas so dots flow under
  // the cursor as the user pans (the tldraw / Stitch / Claude Design
  // feel). `colors.line` is rgba 8% which is invisible against the
  // cream bg, so we use a stronger ink at 18% directly. 22px lattice;
  // background-size scales with zoom so the grid breathes with the
  // canvas instead of appearing pinned to the viewport.
  const dotsBg = `radial-gradient(rgba(28,24,17,0.18) 1.4px, transparent 1.8px)`

  return (
    <div
      style={{
        background: '#FAF7F0',
        borderRadius: 16,
        border: `0.5px solid ${colors.line}`,
        height: 600,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Header — fixed in viewport so it doesn't pan. */}
      <div
        data-no-pan
        style={{
          position: 'absolute',
          top: 16,
          left: 20,
          right: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          zIndex: 5,
          pointerEvents: 'none',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: colors.ink3,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              fontFamily: font.sans,
            }}
          >
            Mind map · {props.monthLabel}
          </div>
          <div style={{ fontSize: 13, color: colors.ink3, marginTop: 4, fontFamily: font.sans }}>
            Drag to pan · ⌘ + scroll to zoom · click a branch to fold.
          </div>
        </div>
      </div>

      {/* Pan / zoom viewport. Captures wheel + drag; the children
          live on a transformed plane that translates and scales as a
          unit. */}
      <div
        ref={viewportRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          position: 'absolute',
          inset: 0,
          cursor: dragRef.current.active ? 'grabbing' : 'grab',
          // Dots are on the viewport (pixel-stable on pan) so the user
          // never loses the grid context regardless of zoom level. The
          // dot phase tracks `view.tx`/`view.ty` so the pattern flows
          // under the pointer when the canvas pans.
          backgroundImage: dotsBg,
          backgroundSize: `${22 * view.scale}px ${22 * view.scale}px`,
          backgroundPosition: `${view.tx}px ${view.ty}px`,
          touchAction: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: CANVAS_W,
            height: CANVAS_H,
            transformOrigin: '0 0',
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
            // Don't intercept drags inside the plane unless the child
            // explicitly opts in — the viewport handles panning.
          }}
        >
          <svg
            width={CANVAS_W}
            height={CANVAS_H}
            viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          >
            {branches.map((b, i) => (
              <path
                key={i}
                d={branchPath(b)}
                stroke={b.color}
                strokeWidth={5}
                fill="none"
                strokeLinecap="round"
                opacity="0.85"
              />
            ))}

            {branches.map((b, bi) => {
              if (collapsedBranches.has(b.label)) return null
              const [bx, by] = branchEnd(b)
              const dirX = b.side === 'left' ? -1 : 1
              const subSpread = b.subs.length * 64
              return b.subs.map((_s, si) => {
                const sy = by - subSpread / 2 + si * 64 + 32
                const sx = bx + dirX * 220
                const c1x = bx + dirX * 80
                const c1y = by
                const c2x = sx - dirX * 60
                const c2y = sy
                return (
                  <path
                    key={`${bi}-${si}`}
                    d={`M ${bx},${by} C ${c1x},${c1y} ${c2x},${c2y} ${sx},${sy}`}
                    stroke={b.color}
                    strokeWidth={2.2}
                    fill="none"
                    opacity="0.55"
                    strokeLinecap="round"
                  />
                )
              })
            })}
          </svg>

          {/* Center node */}
          <div
            data-no-pan
            style={{
              position: 'absolute',
              left: cx,
              top: cy,
              transform: 'translate(-50%, -50%)',
              zIndex: 3,
              width: 220,
              minHeight: 96,
              padding: '14px 18px',
              borderRadius: 18,
              background: colors.ink,
              color: '#fff',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 12px 32px rgba(0,0,0,0.18), 0 0 0 6px rgba(255,255,255,0.9)',
              textAlign: 'center',
              fontFamily: font.sans,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'rgba(255,255,255,0.55)',
                letterSpacing: 0.6,
                textTransform: 'uppercase',
              }}
            >
              {props.monthLabel} {props.monthStart.getFullYear()}
            </div>
            <div
              style={{
                fontFamily: font.serif,
                fontSize: 24,
                fontWeight: 500,
                letterSpacing: -0.5,
                marginTop: 2,
              }}
            >
              {displayName}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
              net{' '}
              <span style={{ color: net >= 0 ? '#C9D6BE' : '#F4DDDD', fontWeight: 700 }}>
                {net >= 0 ? '+' : '−'}
                {fmt(Math.abs(net))}
              </span>
            </div>
          </div>

          {branches.map((b, bi) => {
            const [x, y] = branchEnd(b)
            const dirX = b.side === 'left' ? -1 : 1
            const isBranchCollapsed = collapsedBranches.has(b.label)
            return (
              <React.Fragment key={bi}>
                <button
                  data-no-pan
                  type="button"
                  onClick={() => toggleBranch(b.label)}
                  title={isBranchCollapsed ? `Expand ${b.label}` : `Collapse ${b.label}`}
                  style={{
                    position: 'absolute',
                    left: x,
                    top: y,
                    transform: 'translate(-50%, -50%)',
                    zIndex: 3,
                    padding: '10px 16px',
                    borderRadius: 14,
                    background: b.color,
                    color: '#fff',
                    border: 'none',
                    cursor: b.subs.length > 0 ? 'pointer' : 'default',
                    boxShadow: `0 6px 18px ${b.color}55, 0 0 0 4px rgba(255,255,255,0.92)`,
                    minWidth: 160,
                    textAlign: 'center',
                    fontFamily: font.sans,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 0,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'rgba(255,255,255,0.7)',
                      letterSpacing: 0.6,
                      textTransform: 'uppercase',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {b.label}
                    {b.subs.length > 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          background: 'rgba(255,255,255,0.22)',
                          borderRadius: 4,
                          padding: '1px 5px',
                          letterSpacing: 0,
                        }}
                      >
                        {isBranchCollapsed ? `+${b.subs.length}` : '−'}
                      </span>
                    )}
                  </div>
                  {b.total != null && (
                    <div
                      style={{
                        fontFamily: font.display,
                        fontSize: 22,
                        fontWeight: 700,
                        marginTop: 2,
                        letterSpacing: -0.4,
                      }}
                    >
                      {fmt(b.total)}
                    </div>
                  )}
                </button>

                {!isBranchCollapsed &&
                  b.subs.map((s, si) => {
                    const subSpread = b.subs.length * 64
                    const sy = y - subSpread / 2 + si * 64 + 32
                    const sx = x + dirX * 220
                    const subKey = `${b.label}::${si}`
                    const limit = subLeafLimits[subKey] ?? 0
                    const visibleLeaves = s.leaves.slice(0, limit)
                    const hiddenCount = Math.max(0, s.leaves.length - limit)
                    const expanded = limit > 0
                    const hasLeaves = s.leaves.length > 0
                    const slotCount = visibleLeaves.length + (hiddenCount > 0 ? 1 : 0)
                    return (
                      <React.Fragment key={subKey}>
                        <button
                          data-no-pan
                          type="button"
                          onClick={() => hasLeaves && toggleSubLeaves(subKey, s.leaves.length)}
                          style={{
                            position: 'absolute',
                            left: sx,
                            top: sy,
                            transform: `translate(${b.side === 'left' ? '-100%' : '0'}, -50%)`,
                            zIndex: 3,
                            padding: '7px 12px',
                            borderRadius: 10,
                            background: '#fff',
                            color: colors.ink,
                            border: `1.5px solid ${b.color}`,
                            boxShadow: '0 3px 10px rgba(0,0,0,0.06)',
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: hasLeaves ? 'pointer' : 'default',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            whiteSpace: 'nowrap',
                            maxWidth: 240,
                            fontFamily: font.sans,
                          }}
                          title={
                            !hasLeaves
                              ? s.label
                              : expanded
                              ? `Collapse ${s.label}`
                              : `Expand ${s.label}`
                          }
                        >
                          <span
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {s.label}
                          </span>
                          {hasLeaves && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                background: `${b.color}22`,
                                color: b.color,
                                borderRadius: 4,
                                padding: '1px 5px',
                              }}
                            >
                              {expanded ? '−' : `+${s.leaves.length}`}
                            </span>
                          )}
                        </button>

                        {/* Leaf connectors — drawn as a small SVG layer
                            anchored at the sub-card so the curves bend
                            from the sub-card edge to each leaf. */}
                        {expanded &&
                          slotCount > 0 &&
                          (() => {
                            const lx = sx + dirX * 200
                            const slots: number[] = []
                            for (let i = 0; i < slotCount; i++) {
                              slots.push(sy + (i - (slotCount - 1) / 2) * 26)
                            }
                            return (
                              <svg
                                style={{
                                  position: 'absolute',
                                  left: 0,
                                  top: 0,
                                  width: CANVAS_W,
                                  height: CANVAS_H,
                                  pointerEvents: 'none',
                                  zIndex: 1,
                                }}
                              >
                                {slots.map((ly, li) => {
                                  const c1x = sx + dirX * 60
                                  const c1y = sy
                                  const c2x = lx - dirX * 50
                                  const c2y = ly
                                  return (
                                    <path
                                      key={li}
                                      d={`M ${sx},${sy} C ${c1x},${c1y} ${c2x},${c2y} ${lx},${ly}`}
                                      stroke={b.color}
                                      strokeWidth={1.6}
                                      fill="none"
                                      opacity="0.45"
                                      strokeLinecap="round"
                                    />
                                  )
                                })}
                              </svg>
                            )
                          })()}

                        {/* Each visible leaf is its own positioned chip
                            so the layout reads as a real tree (one node
                            per merchant) rather than a list crammed
                            below the parent card. */}
                        {expanded &&
                          visibleLeaves.map((leaf, li) => {
                            const lx = sx + dirX * 200
                            const ly = sy + (li - (slotCount - 1) / 2) * 26
                            return (
                              <div
                                key={`${subKey}-leaf-${li}`}
                                data-no-pan
                                style={{
                                  position: 'absolute',
                                  left: lx,
                                  top: ly,
                                  transform: `translate(${
                                    b.side === 'left' ? '-100%' : '0'
                                  }, -50%)`,
                                  zIndex: 3,
                                  fontSize: 11,
                                  fontFamily: font.sans,
                                  color: colors.ink3,
                                  fontWeight: 500,
                                  padding: '3px 9px',
                                  borderRadius: 8,
                                  background: '#fff',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  maxWidth: 240,
                                  border: `0.5px solid ${b.color}55`,
                                  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                                }}
                              >
                                {leaf}
                              </div>
                            )
                          })}

                        {/* "+N more" terminator — clicking expands the
                            sub-card to show every merchant. Lives in
                            the same vertical slot as a leaf so the
                            curves stay symmetrical. */}
                        {expanded && hiddenCount > 0 && (() => {
                          const lx = sx + dirX * 200
                          const tIdx = visibleLeaves.length
                          const ly = sy + (tIdx - (slotCount - 1) / 2) * 26
                          return (
                            <button
                              data-no-pan
                              type="button"
                              onClick={() => expandAllSubLeaves(subKey, s.leaves.length)}
                              style={{
                                position: 'absolute',
                                left: lx,
                                top: ly,
                                transform: `translate(${
                                  b.side === 'left' ? '-100%' : '0'
                                }, -50%)`,
                                zIndex: 3,
                                fontSize: 11,
                                fontFamily: font.sans,
                                color: b.color,
                                fontWeight: 700,
                                padding: '3px 9px',
                                borderRadius: 8,
                                background: '#fff',
                                border: `1px dashed ${b.color}`,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                              title={`Show all ${s.leaves.length} merchants`}
                            >
                              +{hiddenCount} more
                            </button>
                          )
                        })()}
                      </React.Fragment>
                    )
                  })}
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {/* Zoom controls — fixed in viewport so they don't pan with
          the canvas. Trackpad pinch + ⌘+scroll still work; the
          buttons are for users without those gestures. */}
      <div
        data-no-pan
        style={{
          position: 'absolute',
          bottom: 14,
          right: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          zIndex: 5,
        }}
      >
        <ZoomButton onClick={() => zoomTo(view.scale * 1.2)} label="+" />
        <ZoomButton
          onClick={recenter}
          label={`${Math.round(view.scale * 100)}%`}
          wide
        />
        <ZoomButton onClick={() => zoomTo(view.scale / 1.2)} label="−" />
      </div>

      {/* Footer hint — fixed in viewport. */}
      <div
        data-no-pan
        style={{
          position: 'absolute',
          bottom: 14,
          left: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          fontSize: 11,
          color: colors.ink4,
          fontWeight: 600,
          zIndex: 5,
          fontFamily: font.sans,
          pointerEvents: 'none',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: colors.accent }} />
          Money in / saved
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span
            style={{ width: 10, height: 10, borderRadius: 5, background: catTokens.bills.fg }}
          />
          Money out
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: '#7A4A22' }} />
          Plan
        </span>
      </div>
    </div>
  )
}

function ZoomButton({
  onClick,
  label,
  wide = false,
}: {
  onClick: () => void
  label: string
  wide?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: wide ? 56 : 32,
        height: 32,
        borderRadius: 8,
        background: '#fff',
        border: `0.5px solid ${colors.line}`,
        color: colors.ink,
        fontFamily: font.sans,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
      }}
    >
      {label}
    </button>
  )
}

void tintFor
void (catTokens as Record<CategoryTint, unknown>)
