import { useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useTransactions } from '../../src/hooks/useTransactions'
import { useCategories } from '../../src/hooks/useCategories'
import { useRecurringRules } from '../../src/hooks/useRecurringRules'
import { getApiUrl } from '../../src/hooks/useApiUrl'
import { supabase } from '../../src/lib/supabase'
import { Colors, Typography, Hairline, Radius, Spacing } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'
import {
  buildAskMurmurRequest,
  postAskMurmur,
} from '../../src/services/askMurmurClient'
import type {
  AskMurmurResponse,
  AskMurmurAction,
  AskMurmurStatRow,
} from '@voice-expense/shared'

/**
 * Ask Murmur — result state.
 *
 * Traces S_AskResult in docs/money-app/project/mobile-screens-5.jsx. The user's
 * question + the grounded reasoner's answer render as a chat thread: user
 * bubble (right, ink), Murmur bubble (left, sparkle avatar) with verdict +
 * breakdown card + optional sage note + attribution + action pills.
 *
 * The screen owns its own back-pill chrome — the native Stack header is hidden
 * via `more/ask-result` options in app/_layout.tsx.
 *
 * Loading / error / refusal states all render inside the Murmur bubble so the
 * thread layout stays consistent.
 */
export default function AskResultScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale
  const currency = profile?.currency_code ?? 'USD'
  const router = useRouter()
  const params = useLocalSearchParams<{ q?: string }>()
  const question = (params.q ?? '').toString().trim()

  const { transactions } = useTransactions(user?.id)
  const { categories } = useCategories(user?.id)
  const { rules: recurringRules } = useRecurringRules(user?.id)

  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'ok'; response: AskMurmurResponse }
    | { kind: 'error' }
  >({ kind: 'idle' })

  // useTransactions/useCategories/useRecurringRules load asynchronously. We
  // wait for transactions to populate before firing the request — otherwise
  // the model would get an empty data block and refuse for the wrong reason.
  // Once we've fired once, the `firedRef` guard prevents re-fires from list
  // refreshes (e.g. SyncManager landing a row mid-conversation).
  const firedRef = useRef(false)

  useEffect(() => {
    if (!question || !user?.id || firedRef.current) return
    if (transactions.length === 0 && !categories.length) return
    firedRef.current = true
    void runAsk()
    // We deliberately don't include the loaders in the dep array — the guard
    // is the firedRef. Re-renders from data updates shouldn't re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, user?.id, transactions.length, categories.length])

  async function runAsk() {
    setState({ kind: 'loading' })
    try {
      const apiBaseUrl = await getApiUrl()
      const { data: sessionData } = await supabase.auth.getSession()
      const authToken = sessionData.session?.access_token
      if (!authToken) {
        setState({ kind: 'error' })
        return
      }

      const request = buildAskMurmurRequest({
        question,
        locale,
        currency,
        monthly_income: profile?.monthly_income ?? null,
        transactions,
        recurringRules,
        categories,
      })
      const response = await postAskMurmur({ apiBaseUrl, authToken, request })
      setState({ kind: 'ok', response })
    } catch (err) {
      console.warn('[ask-result] request failed:', err)
      setState({ kind: 'error' })
    }
  }

  function onRetry() {
    void runAsk()
  }

  function onActionPress(_action: AskMurmurAction) {
    // Action destinations (create_goal / set_budget / show_category /
    // show_transactions) ship in their own milestones. The pill renders the
    // model's localized label; press is intentionally inert until the target
    // surfaces exist.
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        {/* Header — back pill + sparkle title (centered) + spacer */}
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.iconPill, pressed && styles.pressed]}
            hitSlop={8}
            accessibilityLabel={t('common.back', locale)}
          >
            <Ionicons name="chevron-back" size={18} color={Colors.ink2} />
          </Pressable>
          <View style={styles.titleWrap}>
            <Ionicons name="sparkles" size={14} color={Colors.accent} />
            <Text style={styles.title}>{t('ask.header_title', locale)}</Text>
          </View>
          {/* Spacer balances the back pill so the title stays centered. */}
          <View style={styles.iconPillSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.threadContent}
          showsVerticalScrollIndicator={false}
        >
          <UserBubble text={question} />
          <MurmurBubble
            state={state}
            locale={locale}
            onRetry={onRetry}
            onActionPress={onActionPress}
          />
        </ScrollView>

        {/* Follow-up input bar — non-functional placeholder, mirrors S_AskResult.
            Wiring follow-ups would re-enter this screen with a new question; the
            scope-trim for Phase E is single-turn. */}
        <View style={styles.inputWrap}>
          <View style={styles.inputBar}>
            <Text style={styles.inputPlaceholder} numberOfLines={1}>
              {t('ask.followup_placeholder', locale)}
            </Text>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.micButton, pressed && styles.pressed]}
              hitSlop={6}
              accessibilityLabel={t('ask.mic_label', locale)}
            >
              <Ionicons name="mic" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Bubbles
// ─────────────────────────────────────────────────────────────────────────────

function UserBubble({ text }: { text: string }) {
  return (
    <View style={styles.userRow}>
      <View style={styles.userBubble}>
        <Text style={styles.userText}>{text}</Text>
      </View>
    </View>
  )
}

interface MurmurBubbleProps {
  state:
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'ok'; response: AskMurmurResponse }
    | { kind: 'error' }
  locale: Locale
  onRetry: () => void
  onActionPress: (action: AskMurmurAction) => void
}

function MurmurBubble({ state, locale, onRetry, onActionPress }: MurmurBubbleProps) {
  return (
    <View style={styles.murmurRow}>
      <View style={styles.avatarTile}>
        <Ionicons name="sparkles" size={14} color={Colors.accent} />
      </View>
      <View style={styles.murmurCol}>
        {state.kind === 'idle' || state.kind === 'loading' ? (
          <View style={styles.bubbleCard}>
            <View style={styles.thinkingRow}>
              <ActivityIndicator size="small" color={Colors.accent} />
              <Text style={styles.thinkingText}>{t('ask.thinking', locale)}</Text>
            </View>
          </View>
        ) : state.kind === 'error' ? (
          <View style={styles.bubbleCard}>
            <Text style={styles.errorText}>{t('ask.error', locale)}</Text>
            <Pressable
              onPress={onRetry}
              style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
            >
              <Ionicons name="refresh" size={14} color="#FFFFFF" />
              <Text style={styles.retryText}>{t('ask.retry', locale)}</Text>
            </Pressable>
          </View>
        ) : (
          <ResultBody
            response={state.response}
            locale={locale}
            onActionPress={onActionPress}
          />
        )}
      </View>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Result body
// ─────────────────────────────────────────────────────────────────────────────

function ResultBody({
  response,
  locale,
  onActionPress,
}: {
  response: AskMurmurResponse
  locale: Locale
  onActionPress: (a: AskMurmurAction) => void
}) {
  const verdictTokens = useMemo(() => splitInlineBold(response.verdict.text), [
    response.verdict.text,
  ])
  const verdictAccent =
    response.verdict.sentiment === 'negative'
      ? Colors.unclear
      : response.verdict.sentiment === 'positive'
      ? Colors.accent
      : Colors.ink

  return (
    <>
      <View style={styles.bubbleCard}>
        <Text style={styles.verdictText}>
          {verdictTokens.map((tok, i) =>
            tok.bold ? (
              <Text key={i} style={[styles.verdictBold, { color: verdictAccent }]}>
                {tok.text}
              </Text>
            ) : (
              <Text key={i}>{tok.text}</Text>
            ),
          )}
        </Text>
      </View>

      {response.breakdown && (
        <View style={styles.breakdownCard}>
          <Text style={styles.breakdownCaption}>{response.breakdown.caption}</Text>
          {response.breakdown.rows.map((r, i) => (
            <StatRow
              key={i}
              row={r}
              last={i === (response.breakdown?.rows.length ?? 0) - 1}
            />
          ))}
        </View>
      )}

      {response.note && (
        <View style={styles.noteCard}>
          <Text style={styles.noteText}>{response.note.text}</Text>
        </View>
      )}

      <View style={styles.attributionRow}>
        <Ionicons name="lock-closed" size={11} color={Colors.ink4} />
        <Text style={styles.attributionText}>
          {t('ask.attribution', locale).replace(
            '{count}',
            String(response.attribution.transaction_count),
          )}
        </Text>
      </View>

      {response.actions.length > 0 && (
        <View style={styles.actionsRow}>
          {response.actions.map((a, i) => (
            <Pressable
              key={i}
              onPress={() => onActionPress(a)}
              style={({ pressed }) => [
                i === 0 ? styles.actionPillPrimary : styles.actionPillSecondary,
                pressed && styles.pressed,
              ]}
            >
              {i === 0 && <Ionicons name="add" size={14} color="#FFFFFF" />}
              <Text
                style={i === 0 ? styles.actionPrimaryText : styles.actionSecondaryText}
                numberOfLines={1}
              >
                {a.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </>
  )
}

function StatRow({ row, last }: { row: AskMurmurStatRow; last: boolean }) {
  return (
    <View style={[styles.statRow, !last && styles.statRowDivider]}>
      <Text style={[styles.statLabel, row.muted && styles.statLabelMuted]}>
        {row.label}
      </Text>
      <Text
        style={[
          styles.statValue,
          row.accent && styles.statValueAccent,
        ]}
      >
        {row.value}
      </Text>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline-bold splitter — the model may emit a single <b>...</b> wrapping the
// most load-bearing phrase. We split on it so React Native can apply the bold
// style without parsing arbitrary HTML.
// ─────────────────────────────────────────────────────────────────────────────

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
    if (match.index > last) {
      tokens.push({ text: input.slice(last, match.index), bold: false })
    }
    tokens.push({ text: match[1], bold: true })
    last = match.index + match[0].length
  }
  if (last < input.length) tokens.push({ text: input.slice(last), bold: false })
  return tokens.length > 0 ? tokens : [{ text: input, bold: false }]
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles — trace S_AskResult
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  headerRow: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillSpacer: { width: 36, height: 36 },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ink,
    fontFamily: Typography.fontFamily.sansBold,
  },
  pressed: { opacity: 0.6 },

  threadContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },

  // User bubble — right-aligned ink
  userRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 14 },
  userBubble: {
    maxWidth: '78%',
    backgroundColor: Colors.ink,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomRightRadius: 6,
  },
  userText: {
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 21,
    letterSpacing: -0.1,
    fontFamily: Typography.fontFamily.sans,
  },

  // Murmur bubble — left, sparkle avatar + column
  murmurRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  avatarTile: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  murmurCol: { flex: 1 },

  bubbleCard: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 20,
    borderTopLeftRadius: 6,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  verdictText: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 18,
    color: Colors.ink,
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  verdictBold: {
    fontFamily: Typography.fontFamily.serif,
    fontWeight: '700',
  },

  thinkingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thinkingText: {
    fontSize: 14,
    color: Colors.ink3,
    fontFamily: Typography.fontFamily.sans,
  },

  errorText: {
    fontSize: 14.5,
    color: Colors.ink2,
    lineHeight: 21,
    fontFamily: Typography.fontFamily.sans,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
  },

  // Breakdown
  breakdownCard: {
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 20,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  breakdownCaption: {
    color: Colors.ink3,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
    fontFamily: Typography.fontFamily.sansBold,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 6,
  },
  statRowDivider: {
    borderBottomWidth: Hairline.width,
    borderBottomColor: Hairline.color,
  },
  statLabel: {
    fontSize: 13,
    color: Colors.ink2,
    fontWeight: '500',
    fontFamily: Typography.fontFamily.sans,
    flex: 1,
    marginRight: 12,
  },
  statLabelMuted: { color: Colors.ink3 },
  statValue: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: Colors.ink,
  },
  statValueAccent: { color: Colors.accent },

  // Note
  noteCard: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: Colors.accentSoft,
  },
  noteText: {
    fontSize: 13.5,
    color: Colors.ink2,
    lineHeight: 20,
    fontFamily: Typography.fontFamily.sans,
  },

  // Attribution
  attributionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    paddingHorizontal: 2,
  },
  attributionText: {
    fontSize: 11,
    color: Colors.ink4,
    lineHeight: 16,
    fontFamily: Typography.fontFamily.sans,
  },

  // Actions
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    flexWrap: 'wrap',
  },
  actionPillPrimary: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionPrimaryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
  },
  actionPillSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  actionSecondaryText: {
    color: Colors.ink2,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansBold,
  },

  // Follow-up bar (visual only — non-functional in Phase E)
  inputWrap: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm },
  inputBar: {
    backgroundColor: Colors.surface,
    borderRadius: 26,
    paddingLeft: 18,
    paddingRight: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  inputPlaceholder: {
    flex: 1,
    fontSize: 14.5,
    color: Colors.ink4,
    fontFamily: Typography.fontFamily.sans,
  },
  micButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
