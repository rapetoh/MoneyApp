'use client'
import React, { useState } from 'react'
import { colors, font, cat as catTokens, type CategoryTint } from '../../lib/theme'
import { tintFor } from '../../lib/categories'
import {
  type LensProps,
  monthDebits,
  monthCredits,
  groupByCategory,
} from './types'

// XMind-style radial diagram of the user's whole financial month. Center
// node = the user; four branches = Income / Expenses / Saved & invested /
// Recurring. Each branch carries its top sub-items as leaves.

interface Branch {
  label: string
  side: 'left' | 'right'
  y: -1 | 1
  color: string
  total: number | null
  subs: Array<{ label: string; leaves: string[] }>
}

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

function buildBranches(p: LensProps, displayName: string): Branch[] {
  const debits = monthDebits(p)
  const credits = monthCredits(p)
  const incomeTotal = credits.reduce((s, t) => s + t.amount, 0)
  const expenseTotal = debits.reduce((s, t) => s + t.amount, 0)
  const saved = Math.max(0, incomeTotal - expenseTotal)

  const fmt = (v: number) => fmtMoney(v, p.currency, p.locale)

  // Income sub-categories
  const incomeByCat = groupByCategory(credits)
  const incomeSubs = topN(
    Object.entries(incomeByCat).map(([name, amt]) => ({ name, amt })),
    (x) => x.amt,
    3,
  ).map((s) => ({
    label: `${s.name} · ${fmt(s.amt)}`,
    leaves: [],
  }))

  // Expense top categories
  const expenseByCat = groupByCategory(debits)
  const expenseSubs = topN(
    Object.entries(expenseByCat).map(([name, amt]) => ({ name, amt })),
    (x) => x.amt,
    4,
  ).map((s) => {
    // Top 2 merchants in this category (this month)
    const merchTotals: Record<string, number> = {}
    for (const t of debits) {
      if ((t.category_name ?? 'Uncategorized') !== s.name) continue
      const m = t.merchant ?? 'Other'
      merchTotals[m] = (merchTotals[m] ?? 0) + t.amount
    }
    const leaves = topN(
      Object.entries(merchTotals).map(([m, a]) => ({ m, a })),
      (x) => x.a,
      3,
    ).map((m) => `${m.m} · ${fmt(m.a)}`)
    return { label: `${s.name} · ${fmt(s.amt)}`, leaves }
  })

  // Saved branch — single sub showing the saved amount + recurring
  // pulls (if any) so it's not a lonely leaf.
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

  // Plan branch — surfaces top recurring rules (the visible "what's
  // committed" bucket). Empty if the user has no rules yet.
  const planSubs = p.recurring.slice(0, 4).map((r) => ({
    label: `${r.name ?? 'Unnamed'} · ${fmt(r.amount)}`,
    leaves: [r.frequency],
  }))

  void displayName // available if we want to show "Jordan" later

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
  const W = 1280
  const H = 600
  const cx = W / 2
  const cy = H / 2
  const branches = buildBranches(props, displayName)

  // Collapsed branches \u2014 user clicks a branch node to fold its sub-nodes.
  // Stored by branch label. Defaults all-expanded.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  function toggleBranch(label: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const incomeTotal = monthCredits(props).reduce((s, t) => s + t.amount, 0)
  const expenseTotal = monthDebits(props).reduce((s, t) => s + t.amount, 0)
  const net = incomeTotal - expenseTotal

  const branchEnd = (b: Branch): [number, number] => {
    const x = b.side === 'left' ? 360 : W - 360
    const y = b.y === -1 ? cy - 180 : cy + 180
    return [x, y]
  }

  const branchPath = (b: Branch): string => {
    const [x, y] = branchEnd(b)
    const dirX = b.side === 'left' ? -1 : 1
    const sx = cx + dirX * 95
    const sy = cy + b.y * 14
    const c1x = sx + dirX * 80
    const c1y = sy
    const c2x = x - dirX * 60
    const c2y = y
    return `M ${sx},${sy} C ${c1x},${c1y} ${c2x},${c2y} ${x},${y}`
  }

  const fmt = (v: number) =>
    new Intl.NumberFormat(props.locale, {
      style: 'currency',
      currency: props.currency,
      maximumFractionDigits: 0,
    }).format(v)

  return (
    // Outer wrapper is the scroll viewport. Inner container has a fixed
    // pixel width (slightly wider than the design's 1280px so right-side
    // sub-nodes never clip), which lets the viewport scroll horizontally
    // when the dashboard column is narrower than the canvas.
    <div
      style={{
        background: '#fff',
        borderRadius: 16,
        border: `0.5px solid ${colors.line}`,
        height: '100%',
        overflow: 'auto',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'relative',
          minWidth: 1400,
          height: 600,
          minHeight: 600,
        }}
      >
      {/* Subtle grid bg */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `radial-gradient(${colors.line} 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
          opacity: 0.5,
        }}
      />

      {/* Header */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 20,
          right: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          zIndex: 2,
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
            Your whole financial month, branching out from one place.
          </div>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: 600, position: 'relative', zIndex: 1, display: 'block' }}
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
          if (collapsed.has(b.label)) return null
          const [bx, by] = branchEnd(b)
          const dirX = b.side === 'left' ? -1 : 1
          const subSpread = b.subs.length * 56
          return b.subs.map((_s, si) => {
            const sy = by - subSpread / 2 + si * 56 + 28
            const sx = bx + dirX * 200
            const c1x = bx + dirX * 60
            const c1y = by
            const c2x = sx - dirX * 50
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
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 3,
          width: 200,
          minHeight: 90,
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

      {/* Branch nodes \u2014 click to fold/unfold the sub-tree. */}
      {branches.map((b, bi) => {
        const [x, y] = branchEnd(b)
        const dirX = b.side === 'left' ? -1 : 1
        const isCollapsed = collapsed.has(b.label)
        return (
          <React.Fragment key={bi}>
            <button
              type="button"
              onClick={() => toggleBranch(b.label)}
              title={isCollapsed ? `Expand ${b.label}` : `Collapse ${b.label}`}
              style={{
                position: 'absolute',
                left: `${(x / W) * 100}%`,
                top: `${(y / H) * 100}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: 3,
                padding: '10px 16px',
                borderRadius: 14,
                background: b.color,
                color: '#fff',
                border: 'none',
                cursor: b.subs.length > 0 ? 'pointer' : 'default',
                boxShadow: `0 6px 18px ${b.color}55, 0 0 0 4px rgba(255,255,255,0.92)`,
                minWidth: 150,
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
                    {isCollapsed ? `+${b.subs.length}` : '\u2212'}
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

            {!isCollapsed &&
              b.subs.map((s, si) => {
              const subSpread = b.subs.length * 56
              const sy = y - subSpread / 2 + si * 56 + 28
              const sx = x + dirX * 200
              const align = b.side === 'left' ? 'flex-end' : 'flex-start'
              return (
                <div
                  key={`${bi}-${si}`}
                  style={{
                    position: 'absolute',
                    left: `${(sx / W) * 100}%`,
                    top: `${(sy / H) * 100}%`,
                    transform: `translate(${b.side === 'left' ? '-100%' : '0'}, -50%)`,
                    zIndex: 3,
                    maxWidth: 240,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: align,
                    fontFamily: font.sans,
                  }}
                >
                  <div
                    style={{
                      padding: '7px 12px',
                      borderRadius: 10,
                      background: '#fff',
                      color: colors.ink,
                      border: `1.5px solid ${b.color}`,
                      boxShadow: '0 3px 10px rgba(0,0,0,0.06)',
                      fontSize: 13,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: 220,
                    }}
                  >
                    {s.label}
                  </div>
                  {s.leaves.length > 0 && (
                    <div
                      style={{
                        marginTop: 4,
                        paddingLeft: b.side === 'left' ? 0 : 10,
                        paddingRight: b.side === 'left' ? 10 : 0,
                        borderLeft: b.side === 'right' ? `1.5px dotted ${b.color}55` : 'none',
                        borderRight: b.side === 'left' ? `1.5px dotted ${b.color}55` : 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        alignItems: align,
                      }}
                    >
                      {s.leaves.map((leaf, li) => (
                        <div
                          key={li}
                          style={{
                            fontSize: 11,
                            color: colors.ink3,
                            fontWeight: 500,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: 'rgba(255,255,255,0.7)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: 220,
                          }}
                        >
                          {leaf}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </React.Fragment>
        )
      })}

      {/* Footer hint */}
      <div
        style={{
          position: 'absolute',
          bottom: 14,
          left: 20,
          right: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 11,
          color: colors.ink4,
          fontWeight: 600,
          zIndex: 2,
          fontFamily: font.sans,
        }}
      >
        <span>Tip: each branch summarizes the data for {props.monthLabel}.</span>
        <span style={{ display: 'flex', gap: 14 }}>
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
        </span>
      </div>
      </div>
    </div>
  )
}

// Suppress "unused" warning for the imported tint helpers when type-only.
void tintFor
void (catTokens as Record<CategoryTint, unknown>)
