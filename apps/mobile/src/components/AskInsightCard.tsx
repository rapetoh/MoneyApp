// The Ask Murmur insight card, extracted from app/more/ask.tsx (Sep 2,
// 2026) so the same cards can render on the Insights tab (owner request:
// "those key insights should also show up in the insights page"). One
// implementation, two surfaces; the Ask screen remains the ranking's
// origin story (docs/ask-murmur/SPEC.md §1.1).
import { View, Text, Pressable } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { StyleSheet } from 'react-native'
import { MurmurMark } from './MurmurMark'
import { Colors, Typography, Hairline } from '../theme'
import { t, askActionLabel, type Locale } from '@voice-expense/shared'
import type { AskAction, AskInsight, AskInsightKind } from '@voice-expense/shared'

export const KIND_ICON: Record<AskInsightKind, keyof typeof Ionicons.glyphMap> = {
  upcoming_bill: 'calendar-outline',
  budget_pace: 'pie-chart-outline',
  category_surge: 'trending-up-outline',
  subscriptions: 'repeat-outline',
  month_delta: 'swap-vertical-outline',
  net_flow: 'wallet-outline',
  large_transaction: 'flash-outline',
  no_data: 'mic-outline',
}

/** Route an insight's action chip. Shared by Ask (which also handles
 *  model-emitted actions through the same switch) and Insights. */
export function performAskAction(
  router: { push: (href: never) => void },
  action: AskAction,
): void {
  const push = router.push as (href: unknown) => void
  const p = action.params ?? {}
  switch (action.intent) {
    case 'show_transactions': {
      const q = p.query ?? p.merchant ?? p.category_name ?? ''
      const params: Record<string, string> = {}
      if (q) params.q = q
      if (p.month && /^\d{4}-\d{2}$/.test(p.month)) params.month = p.month
      push({ pathname: '/more/transactions', params })
      return
    }
    case 'set_budget':
      push({ pathname: '/(tabs)/budgets', params: { edit: '1' } })
      return
    case 'open_recurring':
      push('/recurring')
      return
    case 'create_rule':
      push({ pathname: '/recurring', params: { new: '1' } })
      return
    case 'log_expense':
      push('/transaction/new')
      return
  }
}

/** An insight = a finding + one decision. Restrained card: an icon tile
 *  and a kind eyebrow carry the tone; no coloured stripes (owner review). */
export function AskInsightCard({
  insight,
  locale,
  onAsk,
  onAction,
}: {
  insight: AskInsight
  locale: Locale
  onAsk: () => void
  onAction: (a: AskAction) => void
}) {
  const tone =
    insight.tone === 'alert'
      ? { fg: Colors.unclear, bg: Colors.unclearSoft }
      : insight.tone === 'watch'
        ? { fg: '#9A6A15', bg: '#F5EBD6' }
        : insight.tone === 'good'
          ? { fg: Colors.accent, bg: Colors.accentSoft }
          : { fg: Colors.ink2, bg: Colors.surface2 }
  return (
    <Pressable onPress={onAsk} style={({ pressed }) => [styles.insightCard, pressed && styles.insightPressed]} accessibilityRole="button">
      <View style={styles.insightTop}>
        <View style={[styles.insightIcon, { backgroundColor: tone.bg }]}>
          <Ionicons name={KIND_ICON[insight.kind]} size={17} color={tone.fg} />
        </View>
        <View style={styles.insightBody}>
          <Text style={[styles.insightKind, { color: tone.fg }]}>{t(`ask.kind_${insight.kind}`, locale)}</Text>
          <Text style={styles.insightTitle}>{insight.title}</Text>
          <Text style={styles.insightDetail}>{insight.detail}</Text>
        </View>
      </View>
      <View style={styles.insightFooter}>
        <View style={styles.insightAskRow}>
          <MurmurMark size={14} variant="sage" />
          <Text style={styles.insightAsk} numberOfLines={1}>
            {insight.question}
          </Text>
        </View>
        {insight.action && (
          <Pressable onPress={() => onAction(insight.action as AskAction)} hitSlop={6} style={({ pressed }) => [styles.insightActionChip, pressed && styles.insightPressed]}>
            <Text style={styles.insightActionText}>{askActionLabel(insight.action, locale)}</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  insightCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 10,
  },
  insightPressed: { opacity: 0.85 },
  insightTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  insightIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  insightBody: { flex: 1, gap: 3 },
  insightKind: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    fontFamily: Typography.fontFamily.sansBold,
  },
  insightTitle: { fontFamily: Typography.fontFamily.serif, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, color: Colors.ink },
  insightDetail: { fontSize: 13.5, lineHeight: 19, color: Colors.ink3, fontFamily: Typography.fontFamily.sans },
  insightFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: Hairline.width,
    borderTopColor: Hairline.color,
  },
  insightAskRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
  insightAsk: { fontSize: 12.5, color: Colors.ink3, fontFamily: Typography.fontFamily.sans, flex: 1 },
  insightActionChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: Colors.accentSoft },
  insightActionText: { fontSize: 12, fontWeight: '700', color: Colors.accent, fontFamily: Typography.fontFamily.sansBold },
})
