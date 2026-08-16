'use client'
import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { colors, font } from '../../lib/theme'
import { MerchantLogo } from '../MerchantLogo'
import {
  type LensProps,
  type LensTxn,
  type LensRecurring,
  monthDebits,
  monthCredits,
  monthTxns,
  monthSummary,
  groupByCategory,
  buildCategoryColorByName,
} from './types'
import {
  isFxPending,
  isSpend,
  classifyFlow,
  monthlyEquivalent,
  type RecurringFrequency,
} from '@voice-expense/shared'

// XMind-style radial diagram of the user's whole financial month.
// Center node = the user; four branches = Income / Expenses / Saved &
// invested / Plan. Each branch carries category (or rule-group) cards,
// each card unfolds into one node per merchant / rule — every one of
// them with its logo, exactly as the transaction list shows them.
//
// The canvas is an infinite plane: drag anywhere to pan (a click on a
// node is still a click — a pan only begins once the pointer has moved
// past a small threshold), ⌘/ctrl + wheel or trackpad pinch zooms
// around the cursor, plain wheel pans. Same model as Figma / tldraw.
//
// LAYOUT (Aug 16 2026 rebuild): every branch's cards and leaves are laid
// out by a real tree layout — each card claims the vertical room its
// visible leaves need, cards stack with a fixed gap, the branch node
// centres on its stack, and the two branches on a side are pushed
// apart so their stacks never meet. Before this, cards sat on a fixed
// 64 px pitch and leaves on a fixed 26 px pitch regardless of how many
// were open, so unfolding two categories overlapped one on top of the
// other — the owner's Aug 16 report. Nothing is clipped: the plane
// simply grows past its nominal size and the user pans.
//
// ROOT CAUSE (fix-plan 1.4, audit finding 05-F2, production defect
// reported 2026-08-08): `buildBranches` computed `expenseTotal`/
// `expenseByCat` as `Σ aggAmount()` over every `debit`, with no concept
// of a transfer. The owner's $300 Charles Schwab debit
// (category "Savings & Investing") landed in `expenseTotal` exactly
// like the Starbucks $50 and Xtream $42 debits — turning the true $92
// month-to-date spend into $392 — while the adjacent "Saved & invested"
// branch computed `max(0, income - allDebits)`, a residual with **zero**
// connection to the Savings & Investing rows, so it showed $0 instead
// of the $300 that actually moved to savings. Fixed by classifying every
// transaction through `classifyFlow()`/`isSpend()` off `categories.kind`:
// a transfer-kind transaction is excluded from the Expenses grouping
// entirely and its total instead populates the Saved & invested branch.

/** One unfoldable node under a card: a merchant this month, or a
 *  recurring rule. Always carries what `MerchantLogo` needs. */
interface Leaf {
  key: string
  title: string
  amount: string
  logo: {
    name: string | null
    domain: string | null
    categoryName: string | null
    categoryColor: string | null
  }
}

interface Sub {
  key: string
  label: string
  leaves: Leaf[]
}

interface Branch {
  label: string
  side: 'left' | 'right'
  y: -1 | 1
  color: string
  total: string | null
  subs: Sub[]
}

// Nominal plane; content may extend past it and the user pans.
const CANVAS_W = 1600
const CANVAS_H = 760
const MIN_SCALE = 0.4
const MAX_SCALE = 2.5

// Tree geometry (plane px). Horizontal rungs are fixed; vertical room
// is computed from what is unfolded.
const BRANCH_DX = 340 // centre → branch node
const SUB_DX = 220 // branch node → card (inner edge)
const SUB_W = 250 // cards are a fixed width so the geometry is exact on both sides
const LEAF_DX = SUB_W + 26 // card inner edge → leaf inner edge: always clears the card
const BRANCH_MIN_DY = 220 // minimum centre → branch node vertical offset
const BRANCH_GAP = 40 // half-gap between the two stacks on one side
const SUB_MIN_H = 48 // a card with no open leaves
const SUB_GAP = 14 // vertical gap between cards
const LEAF_PITCH = 30 // vertical pitch of leaf chips (26 px chip + air)
const VISIBLE_LEAVES_DEFAULT = 5
const MAX_LEAVES = 25

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

/** "$42/mo", "$60/wk", "$1,500/yr", "$100 every 2 wk" — how a rule is
 *  billed, in its own currency (never the monthly equivalent, which is
 *  what the card total already says). */
function cadenceLabel(
  amount: string,
  frequency: RecurringFrequency,
  interval: number,
): string {
  const unit: Record<RecurringFrequency, string> = {
    daily: 'day',
    weekly: 'wk',
    biweekly: '2 wk',
    monthly: 'mo',
    quarterly: 'qtr',
    yearly: 'yr',
  }
  const u = unit[frequency]
  if (interval > 1) return `${amount} every ${interval} ${u}`
  return `${amount}/${u}`
}

/** Category+merchant breakdown for a flow-classified slice of `txns` —
 *  shared shape for the Income, Expenses and Saved & invested branches
 *  so a transfer-kind category gets the exact same card + leaf structure
 *  an ordinary spend category gets, just under a different branch. */
function categorySubs(
  keyPrefix: string,
  txns: LensTxn[],
  fmt: (v: number) => string,
  n: number,
  categoryColorByName: Record<string, string | null>,
): Sub[] {
  const byCat = groupByCategory(txns)
  return topN(
    Object.entries(byCat).map(([name, amt]) => ({ name, amt })),
    (x) => x.amt,
    n,
  ).map((s) => {
    const merch: Record<string, { total: number; domain: string | null }> = {}
    for (const t of txns) {
      if ((t.category_name ?? 'Uncategorized') !== s.name) continue
      if (isFxPending(t)) continue
      const m = t.merchant ?? 'Other'
      const cur = merch[m] ?? { total: 0, domain: null }
      cur.total += t.amount_in_profile_currency as number
      // First domain hint wins — every row for one merchant carries the
      // same one when the parser resolved it.
      if (!cur.domain && t.merchant_domain) cur.domain = t.merchant_domain
      merch[m] = cur
    }
    // Up to MAX_LEAVES merchants per category — enough to see a real
    // distribution at "show all" without exploding the plane. The
    // visible cap is enforced at render time (default 5 shown, "+N
    // more" terminator reveals the rest).
    const leaves: Leaf[] = topN(
      Object.entries(merch).map(([m, v]) => ({ m, ...v })),
      (x) => x.total,
      MAX_LEAVES,
    ).map((m) => ({
      key: `${keyPrefix}::${s.name}::${m.m}`,
      title: m.m,
      amount: fmt(m.total),
      logo: {
        name: m.m === 'Other' ? null : m.m,
        domain: m.domain,
        categoryName: s.name,
        categoryColor: categoryColorByName[s.name] ?? null,
      },
    }))
    return { key: `${keyPrefix}::${s.name}`, label: `${s.name} · ${fmt(s.amt)}`, leaves }
  })
}

/** Recurring rules of one direction as a card: the card's number is the
 *  monthly-equivalent total of the rules it unfolds into — so what the
 *  total means is visible in the leaves themselves. Replaces the old
 *  bare "Committed · $X/mo" card the owner (rightly) couldn't decode. */
function ruleSub(
  key: string,
  label: string,
  rules: LensRecurring[],
  fmt: (v: number) => string,
): Sub | null {
  if (rules.length === 0) return null
  // FX-pending rules (no profile-currency snapshot yet) are listed but
  // never folded into the total as 0 — same contract as `isFxPending`.
  const monthly = rules.reduce(
    (s, r) =>
      r.amount_in_profile_currency == null
        ? s
        : s +
          monthlyEquivalent({
            frequency: r.frequency,
            interval: r.interval,
            amount: r.amount_in_profile_currency,
          }),
    0,
  )
  const leaves: Leaf[] = topN(
    rules,
    (r) =>
      r.amount_in_profile_currency == null
        ? 0
        : monthlyEquivalent({
            frequency: r.frequency,
            interval: r.interval,
            amount: r.amount_in_profile_currency,
          }),
    MAX_LEAVES,
  ).map((r, i) => {
    const own = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: r.currency_code,
      maximumFractionDigits: 0,
    }).format(r.amount)
    return {
      key: `${key}::${r.name ?? 'rule'}::${i}`,
      title: r.name ?? 'Unnamed',
      amount: cadenceLabel(own, r.frequency, r.interval),
      logo: { name: r.name, domain: null, categoryName: null, categoryColor: null },
    }
  })
  return { key, label: `${label} · ${fmt(monthly)}/mo`, leaves }
}

function buildBranches(p: LensProps): Branch[] {
  const summary = monthSummary(p)
  const fmt = (v: number) => fmtMoney(v, p.currency, p.locale)
  const catColor = buildCategoryColorByName(p.categories)

  // Split by classified flow (fix-plan 1.4), not raw direction — a
  // transfer-kind category (Savings & Investing) is neither spend nor
  // income, so it must never appear in either of these two lists.
  const spendDebits = monthDebits(p).filter((t) => isSpend(t, t.category_kind))
  const incomeCredits = monthCredits(p).filter(
    (t) => classifyFlow(t, t.category_kind) === 'income',
  )
  const transferTxns = monthTxns(p).filter(
    (t) => classifyFlow(t, t.category_kind) === 'transfer',
  )

  const incomeSubs = categorySubs('income', incomeCredits, fmt, 3, catColor)
  const expenseSubs = categorySubs('expense', spendDebits, fmt, 4, catColor)
  const transferSubs = categorySubs('saved', transferTxns, fmt, 4, catColor)

  // Transfer-kind categories (the real money moved to savings/investing
  // this month) lead the branch; "Net saved" is the secondary, unfloored
  // income-minus-expense figure — a different number by definition
  // (money.ts's `saved` doesn't subtract transfers), kept as context with
  // its sign rendered explicitly rather than hidden by a `> 0` clamp.
  const savedSubs: Sub[] = [...transferSubs]
  if (summary.saved !== 0) {
    savedSubs.push({
      key: 'saved::net',
      label: `Net saved · ${
        summary.saved >= 0 ? fmt(summary.saved) : `−${fmt(Math.abs(summary.saved))}`
      }`,
      leaves: [],
    })
  }

  // PLAN = every recurring rule, grouped by direction, each group's
  // card headed by its monthly-equivalent total (fix-plan 2.1 rules:
  // debit-only for outflow, FX-aware, interval-aware via
  // `monthlyEquivalent`, profile-currency snapshots only). The old
  // "Committed · $X/mo" card was this same debit total shown as a bare
  // leaf with nothing under it — now it is the card, and the rules it
  // sums are its leaves.
  const planSubs: Sub[] = []
  const out = ruleSub(
    'plan::out',
    'Bills & transfers',
    p.recurring.filter((r) => r.direction === 'debit'),
    fmt,
  )
  const inn = ruleSub(
    'plan::in',
    'Expected income',
    p.recurring.filter((r) => r.direction === 'credit'),
    fmt,
  )
  if (out) planSubs.push(out)
  if (inn) planSubs.push(inn)

  return [
    {
      label: 'Income',
      side: 'left',
      y: -1,
      color: colors.accent,
      total: summary.income > 0 ? fmt(summary.income) : null,
      subs: incomeSubs,
    },
    {
      label: 'Expenses',
      side: 'right',
      y: -1,
      color: colors.expense,
      total: summary.expense > 0 ? fmt(summary.expense) : null,
      subs: expenseSubs,
    },
    {
      label: 'Saved & invested',
      side: 'right',
      y: 1,
      color: colors.accent,
      total:
        summary.transfers > 0
          ? fmt(summary.transfers)
          : summary.saved > 0
            ? fmt(summary.saved)
            : null,
      subs: savedSubs,
    },
    {
      label: 'Plan',
      side: 'left',
      y: 1,
      color: '#7A4A22',
      // No headline number: the two cards each carry their own — a single
      // figure on the node would raise the same "what is this?" the old
      // "Committed" leaf did.
      total: null,
      subs: planSubs,
    },
  ]
}

// ── Layout ─────────────────────────────────────────────────────────────

interface LeafPos {
  leaf: Leaf | null // null = the "+N more" terminator
  x: number
  y: number
}
interface SubPos {
  sub: Sub
  x: number
  y: number
  height: number
  limit: number
  hidden: number
  leaves: LeafPos[]
}
interface BranchPos {
  branch: Branch
  x: number
  y: number
  collapsed: boolean
  subs: SubPos[]
}

/**
 * Real tree layout. Per branch: each card's height is the room its open
 * leaves need (or SUB_MIN_H); cards stack with SUB_GAP; the branch node
 * centres on the stack. The two branches on a side are placed so their
 * stacks clear the centre node and each other: the top branch's stack
 * ends at least BRANCH_GAP above centre, the bottom's begins at least
 * BRANCH_GAP below — and never closer to centre than BRANCH_MIN_DY, so a
 * quiet month keeps the classic radial silhouette.
 */
function layoutBranches(
  branches: Branch[],
  cx: number,
  cy: number,
  collapsedBranches: Set<string>,
  subLeafLimits: Record<string, number>,
): BranchPos[] {
  return branches.map((b) => {
    const dirX = b.side === 'left' ? -1 : 1
    const bx = cx + dirX * BRANCH_DX
    const collapsed = collapsedBranches.has(b.label)

    // Card heights from what is unfolded.
    const subMeta = b.subs.map((s) => {
      const limit = Math.min(subLeafLimits[s.key] ?? 0, s.leaves.length)
      const hidden = Math.max(0, s.leaves.length - limit)
      const slots = limit + (hidden > 0 && limit > 0 ? 1 : 0)
      const height = Math.max(SUB_MIN_H, slots * LEAF_PITCH)
      return { s, limit, hidden, slots, height }
    })
    const stackH = collapsed
      ? 0
      : subMeta.reduce((h, m) => h + m.height, 0) + Math.max(0, subMeta.length - 1) * SUB_GAP

    // Branch node centre: pushed away from cy far enough for its stack.
    const need = BRANCH_GAP + stackH / 2
    const by = b.y === -1 ? cy - Math.max(BRANCH_MIN_DY, need) : cy + Math.max(BRANCH_MIN_DY, need)

    const subs: SubPos[] = []
    if (!collapsed) {
      let cursor = by - stackH / 2
      for (const m of subMeta) {
        const sy = cursor + m.height / 2
        const sx = bx + dirX * SUB_DX
        const leaves: LeafPos[] = []
        if (m.limit > 0) {
          const lx = sx + dirX * LEAF_DX
          for (let i = 0; i < m.slots; i++) {
            const ly = sy + (i - (m.slots - 1) / 2) * LEAF_PITCH
            leaves.push({ leaf: i < m.limit ? m.s.leaves[i] : null, x: lx, y: ly })
          }
        }
        subs.push({ sub: m.s, x: sx, y: sy, height: m.height, limit: m.limit, hidden: m.hidden, leaves })
        cursor += m.height + SUB_GAP
      }
    }
    return { branch: b, x: bx, y: by, collapsed, subs }
  })
}

function curve(x1: number, y1: number, x2: number, y2: number, dirX: number, pull: number): string {
  return `M ${x1},${y1} C ${x1 + dirX * pull},${y1} ${x2 - dirX * pull},${y2} ${x2},${y2}`
}

// ── Component ──────────────────────────────────────────────────────────

export function MindMapLens({ props, displayName }: { props: LensProps; displayName: string }) {
  const cx = CANVAS_W / 2
  const cy = CANVAS_H / 2
  const branches = useMemo(() => buildBranches(props), [props])

  // Branch fold (parent) and card leaf-limit (child). A card's leaves
  // only render when its branch is expanded AND its leaf-limit > 0.
  //   0    → collapsed (card with no leaves shown)
  //   5    → "show top 5" (default expanded state)
  //   >=N  → "show all" up to total leaf count
  // Click the card to toggle 0 ↔ 5; click "+N more" to jump 5 → all.
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

  const laid = layoutBranches(branches, cx, cy, collapsedBranches, subLeafLimits)

  // ── Pan / zoom ───────────────────────────────────────────────────────
  // Translation in viewport CSS px; scale multiplies the plane.
  const [view, setView] = useState({ tx: 0, ty: 0, scale: 1 })
  const [panning, setPanning] = useState(false)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    pointerId: number | null
    startX: number
    startY: number
    startTx: number
    startTy: number
    panning: boolean
    /** Set once a real pan happened; the click that follows pointerup
     *  is swallowed so a drag that ended over a node doesn't toggle it. */
    didPan: boolean
  }>({ pointerId: null, startX: 0, startY: 0, startTx: 0, startTy: 0, panning: false, didPan: false })
  const PAN_THRESHOLD_PX = 4

  // Fit the whole tree — as currently folded — into the viewport, like
  // Figma's "zoom to fit": bounds over every branch node, card and leaf
  // (each with the width it renders at), then the largest scale ≤ 1 that
  // shows it all with a margin, centred. Runs on mount and on viewport
  // resize, and is what the "%" button does; folding/unfolding never
  // moves the view under the user's pointer.
  const laidRef = useRef(laid)
  laidRef.current = laid
  const fitToContent = useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    let minX = cx - 120
    let maxX = cx + 120
    let minY = cy - 60
    let maxY = cy + 60
    const grow = (x: number, y: number, halfW: number, halfH: number) => {
      minX = Math.min(minX, x - halfW)
      maxX = Math.max(maxX, x + halfW)
      minY = Math.min(minY, y - halfH)
      maxY = Math.max(maxY, y + halfH)
    }
    for (const bp of laidRef.current) {
      const dirX = bp.branch.side === 'left' ? -1 : 1
      grow(bp.x, bp.y, 100, 40)
      for (const sp of bp.subs) {
        // Cards and leaves are anchored at their inner edge and extend
        // outward by up to their max width.
        grow(sp.x + dirX * (SUB_W / 2), sp.y, SUB_W / 2, 20)
        for (const lp of sp.leaves) grow(lp.x + dirX * 130, lp.y, 130, 15)
      }
    }
    // Fixed overlays the tree must clear: title block (top), legend
    // (bottom-left), zoom column (right).
    const PAD_L = 36
    const PAD_R = 92
    const PAD_T = 64
    const PAD_B = 52
    const w = maxX - minX
    const h = maxY - minY
    const availW = width - PAD_L - PAD_R
    const availH = height - PAD_T - PAD_B
    const scale = clamp(Math.min(availW / w, availH / h, 1), MIN_SCALE, MAX_SCALE)
    const tx = PAD_L + (availW - w * scale) / 2 - minX * scale
    const ty = PAD_T + (availH - h * scale) / 2 - minY * scale
    setView({ tx, ty, scale })
  }, [cx, cy])

  useEffect(() => {
    fitToContent()
    const el = viewportRef.current
    if (!el) return
    const ro = new ResizeObserver(fitToContent)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fitToContent])

  // Wheel = zoom around the cursor with ⌘/ctrl (trackpad pinch arrives
  // as a wheel event with ctrlKey on macOS), plain wheel = pan. Attached
  // natively with `passive: false` — React registers `onWheel` passively,
  // so `preventDefault()` there is ignored and ⌘+scroll would zoom the
  // whole browser page instead of the canvas.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.01)
        setView((v) => {
          const nextScale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE)
          const ratio = nextScale / v.scale
          return { scale: nextScale, tx: px - (px - v.tx) * ratio, ty: py - (py - v.ty) * ratio }
        })
      } else {
        setView((v) => ({ ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    // Never start a browser text-selection / image-drag from the canvas —
    // the whole surface is `user-select: none` too, this covers the
    // pointer's own default action.
    e.preventDefault()
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTx: view.tx,
      startTy: view.ty,
      panning: false,
      didPan: false,
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (d.pointerId !== e.pointerId) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.panning) {
      if (Math.hypot(dx, dy) < PAN_THRESHOLD_PX) return
      // Past the threshold: this is a pan, not a click. Only now take
      // pointer capture — capturing on pointerdown would retarget the
      // click that follows a plain tap on a node away from the node.
      d.panning = true
      d.didPan = true
      setPanning(true)
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // ignore
      }
    }
    setView((v) => ({ ...v, tx: d.startTx + dx, ty: d.startTy + dy }))
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (d.pointerId !== e.pointerId) return
    d.pointerId = null
    d.panning = false
    setPanning(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  // Swallow the click that lands after a pan so a drag released over a
  // branch or card doesn't fold it.
  function onClickCapture(e: React.MouseEvent<HTMLDivElement>) {
    if (dragRef.current.didPan) {
      dragRef.current.didPan = false
      e.stopPropagation()
      e.preventDefault()
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
      return { scale: nextScale, tx: px - (px - v.tx) * ratio, ty: py - (py - v.ty) * ratio }
    })
  }

  const net = monthSummary(props).saved
  const fmt = (v: number) => fmtMoney(v, props.currency, props.locale)

  // Dotted grid — on the viewport (pixel-stable) with its phase tracking
  // the pan so dots flow under the pointer; spacing scales with zoom.
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
        // Nothing on this surface is prose to be selected — dragging is
        // panning. (The Aug 16 report: dragging highlighted node text.)
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Header — fixed in viewport so it doesn't pan. */}
      <div
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
            Drag to pan · ⌘ + scroll to zoom · click a branch or card to fold.
          </div>
        </div>
      </div>

      {/* Pan / zoom viewport. */}
      <div
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
        style={{
          position: 'absolute',
          inset: 0,
          cursor: panning ? 'grabbing' : 'grab',
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
          }}
        >
          {/* All connectors in one layer; overflow visible so an unfolded
              stack that extends past the nominal plane keeps its curves. */}
          <svg
            width={CANVAS_W}
            height={CANVAS_H}
            viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
          >
            {laid.map((bp) => {
              const b = bp.branch
              const dirX = b.side === 'left' ? -1 : 1
              const sx = cx + dirX * 110
              const sy = cy + b.y * 18
              return (
                <g key={b.label}>
                  {/* centre → branch */}
                  <path
                    d={`M ${sx},${sy} C ${sx + dirX * 100},${sy} ${bp.x - dirX * 80},${bp.y} ${bp.x},${bp.y}`}
                    stroke={b.color}
                    strokeWidth={5}
                    fill="none"
                    strokeLinecap="round"
                    opacity="0.85"
                  />
                  {/* branch → cards */}
                  {bp.subs.map((sp) => (
                    <path
                      key={sp.sub.key}
                      d={curve(bp.x, bp.y, sp.x, sp.y, dirX, 70)}
                      stroke={b.color}
                      strokeWidth={2.2}
                      fill="none"
                      opacity="0.55"
                      strokeLinecap="round"
                    />
                  ))}
                  {/* card → leaves */}
                  {bp.subs.flatMap((sp) =>
                    sp.leaves.map((lp, i) => (
                      <path
                        key={`${sp.sub.key}::leaf::${i}`}
                        d={curve(sp.x, sp.y, lp.x, lp.y, dirX, 55)}
                        stroke={b.color}
                        strokeWidth={1.6}
                        fill="none"
                        opacity="0.45"
                        strokeLinecap="round"
                      />
                    )),
                  )}
                </g>
              )
            })}
          </svg>

          {/* Center node */}
          <div
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
              {props.monthLabel} {props.anchorYear}
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

          {laid.map((bp) => {
            const b = bp.branch
            const anchor = b.side === 'left' ? '-100%' : '0'
            return (
              <React.Fragment key={b.label}>
                {/* Branch node */}
                <button
                  type="button"
                  onClick={() => toggleBranch(b.label)}
                  title={bp.collapsed ? `Expand ${b.label}` : `Collapse ${b.label}`}
                  style={{
                    position: 'absolute',
                    left: bp.x,
                    top: bp.y,
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
                        {bp.collapsed ? `+${b.subs.length}` : '−'}
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
                      {b.total}
                    </div>
                  )}
                </button>

                {/* Cards */}
                {bp.subs.map((sp) => {
                  const s = sp.sub
                  const hasLeaves = s.leaves.length > 0
                  const expanded = sp.limit > 0
                  return (
                    <React.Fragment key={s.key}>
                      <button
                        type="button"
                        onClick={() => hasLeaves && toggleSubLeaves(s.key, s.leaves.length)}
                        style={{
                          position: 'absolute',
                          left: sp.x,
                          top: sp.y,
                          transform: `translate(${anchor}, -50%)`,
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
                          width: SUB_W,
                          justifyContent: 'space-between',
                          fontFamily: font.sans,
                        }}
                        title={
                          !hasLeaves ? s.label : expanded ? `Collapse ${s.label}` : `Expand ${s.label}`
                        }
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

                      {/* Leaves — one chip per merchant / rule, logo first. */}
                      {sp.leaves.map((lp) =>
                        lp.leaf ? (
                          <div
                            key={lp.leaf.key}
                            style={{
                              position: 'absolute',
                              left: lp.x,
                              top: lp.y,
                              transform: `translate(${anchor}, -50%)`,
                              zIndex: 3,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 7,
                              height: 26,
                              padding: '0 9px 0 4px',
                              borderRadius: 13,
                              background: '#fff',
                              border: `0.5px solid ${b.color}55`,
                              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                              fontFamily: font.sans,
                              fontSize: 11,
                              whiteSpace: 'nowrap',
                              maxWidth: 260,
                            }}
                            title={`${lp.leaf.title} · ${lp.leaf.amount}`}
                          >
                            <MerchantLogo
                              name={lp.leaf.logo.name}
                              merchantDomain={lp.leaf.logo.domain}
                              categoryName={lp.leaf.logo.categoryName}
                              categoryColor={lp.leaf.logo.categoryColor}
                              size={18}
                              radius={9}
                            />
                            <span
                              style={{
                                color: colors.ink,
                                fontWeight: 600,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: 150,
                              }}
                            >
                              {lp.leaf.title}
                            </span>
                            <span style={{ color: colors.ink3, fontWeight: 500 }}>{lp.leaf.amount}</span>
                          </div>
                        ) : (
                          // "+N more" terminator — same slot geometry as a
                          // leaf so the curves stay symmetrical.
                          <button
                            key={`${s.key}::more`}
                            type="button"
                            onClick={() => expandAllSubLeaves(s.key, s.leaves.length)}
                            style={{
                              position: 'absolute',
                              left: lp.x,
                              top: lp.y,
                              transform: `translate(${anchor}, -50%)`,
                              zIndex: 3,
                              fontSize: 11,
                              fontFamily: font.sans,
                              color: b.color,
                              fontWeight: 700,
                              height: 26,
                              padding: '0 10px',
                              borderRadius: 13,
                              background: '#fff',
                              border: `1px dashed ${b.color}`,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                            title={`Show all ${s.leaves.length}`}
                          >
                            +{sp.hidden} more
                          </button>
                        ),
                      )}
                    </React.Fragment>
                  )
                })}
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {/* Zoom controls — fixed in viewport. */}
      <div
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
        <ZoomButton onClick={fitToContent} label={`${Math.round(view.scale * 100)}%`} wide />
        <ZoomButton onClick={() => zoomTo(view.scale / 1.2)} label="−" />
      </div>

      {/* Footer legend — fixed in viewport. */}
      <div
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
          <span style={{ width: 10, height: 10, borderRadius: 5, background: colors.expense }} />
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
