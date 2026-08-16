import { useMemo } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { AskAction, AskBlock, AskReply, Locale } from '@voice-expense/shared'
import { askActionLabel } from '@voice-expense/shared'
import { AskChart } from './AskChart'
import { Colors, Typography, Hairline } from '../theme'

/**
 * One assistant turn's body — text, then the blocks whose shape the answer
 * called for (figure / rows / transactions / chart / steps), then the
 * action chips (docs/ask-murmur/SPEC.md §1.3–1.4). Shared by the thread
 * and by History previews; the web thread mirrors it in
 * apps/web/src/components/AskReplyBody.tsx.
 */
export function AskReplyBody({
  reply,
  locale,
  currency,
  onAction,
}: {
  reply: AskReply
  locale: Locale
  currency: string
  onAction?: (action: AskAction) => void
}) {
  const tokens = useMemo(() => splitInlineBold(reply.text), [reply.text])
  const accent =
    reply.sentiment === 'negative' ? Colors.unclear : reply.sentiment === 'positive' ? Colors.accent : Colors.ink
  return (
    <View style={styles.col}>
      <View style={styles.textCard}>
        <Text style={styles.text}>
          {tokens.map((tok, i) =>
            tok.bold ? (
              <Text key={i} style={[styles.textBold, { color: accent }]}>
                {tok.text}
              </Text>
            ) : (
              <Text key={i}>{tok.text}</Text>
            ),
          )}
        </Text>
      </View>
      {reply.blocks.map((block, i) => (
        <BlockView key={i} block={block} locale={locale} currency={currency} />
      ))}
      {reply.actions.length > 0 && onAction && (
        <View style={styles.actions}>
          {reply.actions.map((a, i) => (
            <Pressable
              key={i}
              onPress={() => onAction(a)}
              style={({ pressed }) => [styles.actionChip, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Ionicons name={iconFor(a)} size={13} color={Colors.accent} />
              <Text style={styles.actionText}>{askActionLabel(a, locale)}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}

function iconFor(a: AskAction): keyof typeof Ionicons.glyphMap {
  switch (a.intent) {
    case 'show_transactions':
      return 'list-outline'
    case 'set_budget':
      return 'pie-chart-outline'
    case 'open_recurring':
      return 'repeat-outline'
    case 'log_expense':
      return 'mic-outline'
    case 'create_rule':
      return 'add-circle-outline'
  }
}

function BlockView({ block, locale, currency }: { block: AskBlock; locale: Locale; currency: string }) {
  switch (block.type) {
    case 'figure':
      return (
        <View style={styles.card}>
          <Text style={styles.eyebrow}>{block.label}</Text>
          <Text style={styles.figure}>{block.value}</Text>
          {block.sub ? <Text style={styles.sub}>{block.sub}</Text> : null}
        </View>
      )
    case 'rows':
      return (
        <View style={styles.card}>
          <Text style={styles.eyebrow}>{block.caption}</Text>
          {block.rows.map((r, i) => (
            <View key={i} style={[styles.row, i < block.rows.length - 1 && styles.rowDivider]}>
              <Text style={[styles.rowLabel, r.muted && styles.muted]} numberOfLines={2}>
                {r.label}
              </Text>
              <Text style={[styles.rowValue, r.accent && styles.accent, r.muted && styles.muted]}>{r.value}</Text>
            </View>
          ))}
        </View>
      )
    case 'transactions':
      return (
        <View style={styles.card}>
          <Text style={styles.eyebrow}>{block.caption}</Text>
          {block.rows.map((r, i) => (
            <View key={i} style={[styles.txRow, i < block.rows.length - 1 && styles.rowDivider]}>
              <View style={styles.txMain}>
                <Text style={styles.txMerchant} numberOfLines={1}>
                  {r.merchant}
                </Text>
                <Text style={styles.txMeta} numberOfLines={1}>
                  {formatDay(r.date, locale)}
                  {r.category ? ` · ${r.category}` : ''}
                </Text>
              </View>
              <Text style={styles.txAmount}>{r.amount}</Text>
            </View>
          ))}
        </View>
      )
    case 'chart':
      return <AskChart chart={block.chart} currency={currency} locale={locale} />
    case 'steps':
      return (
        <View style={styles.card}>
          <Text style={styles.eyebrow}>{block.caption}</Text>
          {block.steps.map((s, i) => (
            <View key={i} style={styles.step}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{s}</Text>
            </View>
          ))}
        </View>
      )
    default:
      return null
  }
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

interface BoldToken {
  text: string
  bold: boolean
}
function splitInlineBold(input: string): BoldToken[] {
  const tokens: BoldToken[] = []
  const re = /<b>(.*?)<\/b>/gi
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(input)) !== null) {
    if (match.index > last) tokens.push({ text: input.slice(last, match.index), bold: false })
    tokens.push({ text: match[1], bold: true })
    last = match.index + match[0].length
  }
  if (last < input.length) tokens.push({ text: input.slice(last), bold: false })
  return tokens.length > 0 ? tokens : [{ text: input, bold: false }]
}

const styles = StyleSheet.create({
  col: { gap: 10 },
  textCard: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 20,
    borderTopLeftRadius: 6,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  text: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 17.5,
    color: Colors.ink,
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  textBold: { fontFamily: Typography.fontFamily.serif, fontWeight: '700' },
  card: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  eyebrow: {
    color: Colors.ink3,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    fontFamily: Typography.fontFamily.sansBold,
  },
  figure: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 32,
    letterSpacing: -0.8,
    color: Colors.ink,
    lineHeight: 38,
  },
  sub: { marginTop: 4, fontSize: 13, color: Colors.ink3, fontFamily: Typography.fontFamily.sans },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 7 },
  rowDivider: { borderBottomWidth: Hairline.width, borderBottomColor: Hairline.color },
  rowLabel: { flex: 1, marginRight: 12, fontSize: 13.5, color: Colors.ink2, fontFamily: Typography.fontFamily.sans },
  rowValue: { fontFamily: Typography.fontFamily.serif, fontSize: 15.5, fontWeight: '700', color: Colors.ink, letterSpacing: -0.3 },
  accent: { color: Colors.accent },
  muted: { color: Colors.ink4 },
  txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
  txMain: { flex: 1 },
  txMerchant: { fontSize: 14, color: Colors.ink, fontWeight: '600', fontFamily: Typography.fontFamily.sansSemiBold },
  txMeta: { fontSize: 12, color: Colors.ink4, marginTop: 2, fontFamily: Typography.fontFamily.sans },
  txAmount: { fontFamily: Typography.fontFamily.serif, fontSize: 15, fontWeight: '700', color: Colors.ink },
  step: { flexDirection: 'row', gap: 10, paddingVertical: 6, alignItems: 'flex-start' },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.accentSoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText: { fontSize: 12, fontWeight: '700', color: Colors.accent, fontFamily: Typography.fontFamily.sansBold },
  stepText: { flex: 1, fontSize: 14, lineHeight: 20, color: Colors.ink2, fontFamily: Typography.fontFamily.sans },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.accentSoft,
  },
  actionText: { fontSize: 13, fontWeight: '600', color: Colors.accent, fontFamily: Typography.fontFamily.sansSemiBold },
  pressed: { opacity: 0.6 },
})
