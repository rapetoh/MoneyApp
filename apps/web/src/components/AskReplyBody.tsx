'use client'
import type { CSSProperties } from 'react'
import type { AskAction, AskBlock, AskReply, Locale } from '@voice-expense/shared'
import { askActionLabel } from '@voice-expense/shared'
import { AskChart } from './AskChart'
import { Icon } from './Icons'
import { colors, font, radius } from '../lib/theme'

/**
 * One assistant turn's body — text, then the blocks the answer's shape
 * called for (figure / rows / transactions / chart / steps), then action
 * chips (docs/ask-murmur/SPEC.md §1.3–1.4). Mirrors the mobile
 * AskReplyBody so both surfaces read the same answer the same way.
 */

// Allow only <b> from the model output.
function sanitize(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escaped.replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>')
}

function formatDay(isoDay: string, locale: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDay)
  if (!m) return isoDay
  try {
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
      new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))),
    )
  } catch {
    return isoDay
  }
}

export function AskReplyBody({
  reply,
  locale,
  currency,
  onAction,
}: {
  reply: AskReply
  locale: Locale
  currency: string
  onAction?: (a: AskAction) => void
}) {
  const accent = reply.sentiment === 'positive' ? colors.accent : reply.sentiment === 'negative' ? '#A94646' : colors.ink
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div
        style={{ ...styles.text, ['--ask-accent' as string]: accent } as CSSProperties}
        className="ask-reply-text"
        dangerouslySetInnerHTML={{ __html: sanitize(reply.text) }}
      />
      {reply.blocks.map((b, i) => (
        <Block key={i} block={b} locale={locale} currency={currency} />
      ))}
      {reply.actions.length > 0 && onAction && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {reply.actions.map((a, i) => (
            <button key={i} type="button" onClick={() => onAction(a)} style={styles.actionChip}>
              {a.intent === 'show_transactions' ? <Icon.list color={colors.accent} size={13} /> : a.intent === 'open_recurring' || a.intent === 'create_rule' ? <Icon.recurring color={colors.accent} size={12} /> : a.intent === 'set_budget' ? <Icon.chart color={colors.accent} size={13} /> : <Icon.mic color={colors.accent} size={13} />}
              {askActionLabel(a, locale)}
            </button>
          ))}
        </div>
      )}
      <style>{`.ask-reply-text b { color: var(--ask-accent); font-weight: 700; }`}</style>
    </div>
  )
}

function Block({ block, locale, currency }: { block: AskBlock; locale: Locale; currency: string }) {
  switch (block.type) {
    case 'figure':
      return (
        <div style={styles.card}>
          <div style={styles.eyebrow}>{block.label}</div>
          <div style={styles.figure}>{block.value}</div>
          {block.sub && <div style={styles.sub}>{block.sub}</div>}
        </div>
      )
    case 'rows':
      return (
        <div style={styles.card}>
          <div style={styles.eyebrow}>{block.caption}</div>
          {block.rows.map((r, i) => (
            <div key={i} style={{ ...styles.row, borderTop: i === 0 ? 'none' : `0.5px solid ${colors.line}` }}>
              <span style={{ fontSize: 13.5, color: r.muted ? colors.ink4 : colors.ink2 }}>{r.label}</span>
              <span style={{ ...styles.rowValue, color: r.accent ? colors.accent : r.muted ? colors.ink4 : colors.ink }}>{r.value}</span>
            </div>
          ))}
        </div>
      )
    case 'transactions':
      return (
        <div style={styles.card}>
          <div style={styles.eyebrow}>{block.caption}</div>
          {block.rows.map((r, i) => (
            <div key={i} style={{ ...styles.txRow, borderTop: i === 0 ? 'none' : `0.5px solid ${colors.line}` }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: colors.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.merchant}</div>
                <div style={{ fontSize: 12, color: colors.ink4, marginTop: 2 }}>
                  {formatDay(r.date, locale)}
                  {r.category ? ` · ${r.category}` : ''}
                </div>
              </div>
              <div style={styles.rowValue}>{r.amount}</div>
            </div>
          ))}
        </div>
      )
    case 'chart':
      return (
        <div style={{ ...styles.card, background: colors.surface2 }}>
          <AskChart chart={block.chart} currency={currency} locale={locale} />
        </div>
      )
    case 'steps':
      return (
        <div style={styles.card}>
          <div style={styles.eyebrow}>{block.caption}</div>
          {block.steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 0', alignItems: 'flex-start' }}>
              <div style={styles.stepNum}>{i + 1}</div>
              <div style={{ fontSize: 14, lineHeight: 1.45, color: colors.ink2 }}>{s}</div>
            </div>
          ))}
        </div>
      )
    default:
      return null
  }
}

const styles: Record<string, CSSProperties> = {
  text: { fontFamily: font.serif, fontSize: 19, lineHeight: 1.4, fontWeight: 500, letterSpacing: -0.3, color: colors.ink },
  card: { background: colors.card, border: `0.5px solid ${colors.line}`, borderRadius: radius.xl, padding: '12px 14px' },
  eyebrow: { fontSize: 11, fontWeight: 700, color: colors.ink3, letterSpacing: 0.6, textTransform: 'uppercase', fontFamily: font.sans, marginBottom: 8 },
  figure: { fontFamily: font.serif, fontSize: 30, letterSpacing: -0.8, color: colors.ink, lineHeight: 1.1 },
  sub: { fontSize: 13, color: colors.ink3, marginTop: 4 },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '7px 0', fontFamily: font.sans },
  rowValue: { fontFamily: font.display, fontSize: 14.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: colors.ink },
  txRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', fontFamily: font.sans },
  stepNum: { width: 22, height: 22, borderRadius: 11, background: colors.accentSoft, color: colors.accent, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  actionChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 12px',
    borderRadius: 999,
    border: 'none',
    background: colors.accentSoft,
    color: colors.accent,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: font.sans,
    cursor: 'pointer',
  },
}
