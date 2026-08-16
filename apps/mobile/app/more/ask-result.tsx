import { useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
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
import {
  t,
  createConversation,
  appendUserMessage,
  appendAssistantMessage,
  type Locale,
} from '@voice-expense/shared'
import {
  buildAskMurmurRequest,
  postAskMurmur,
} from '../../src/services/askMurmurClient'
import type { AskMurmurResponse, AskMurmurStatRow, AskMurmurHistoryTurn } from '@voice-expense/shared'

/**
 * Ask Murmur — result state.
 *
 * Traces S_AskResult in docs/money-app/project/mobile-screens-5.jsx. The user's
 * question + the grounded reasoner's answer render as a chat thread: user
 * bubble (right, ink), Murmur bubble (left, sparkle avatar) with verdict +
 * breakdown card + optional sage note + attribution.
 *
 * The screen owns its own back-pill chrome — the native Stack header is hidden
 * via `more/ask-result` options in app/_layout.tsx.
 *
 * Multi-turn: every turn owns its loading / answer / error state, follow-ups
 * are sent with the completed turns as `history` (the web thread's contract),
 * and each turn is appended to the same persisted conversation.
 *
 * `response.actions` (create_goal / set_budget / show_category /
 * show_transactions suggestions from the reasoner) is intentionally not
 * rendered — the pills that used to show them called an inert
 * `onActionPress` with no target surface to route to (fix-plan 3.1: a
 * pressed state that does nothing is worse than no pill). Reintroduce
 * once those destinations exist.
 */
interface Turn {
  id: number
  question: string
  state:
    | { kind: 'loading' }
    | { kind: 'ok'; response: AskMurmurResponse }
    | { kind: 'error' }
}

export default function AskResultScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale
  const currency = profile?.currency_code ?? 'USD'
  const router = useRouter()
  const params = useLocalSearchParams<{ q?: string }>()
  const initialQuestion = (params.q ?? '').toString().trim()

  const { transactions } = useTransactions(user?.id)
  const { categories } = useCategories(user?.id)
  const { rules: recurringRules } = useRecurringRules(user?.id)

  // The conversation. Every turn is a question + its own loading / answer /
  // error state, so a failed follow-up retries alone and never disturbs the
  // answers above it. Follow-ups carry the completed turns as `history`
  // — the same multi-turn contract the web thread already uses — so "and
  // last month?" is understood in context.
  const [turns, setTurns] = useState<Turn[]>([])
  // Mirror of `turns` for callbacks that need the current list without a
  // stale closure.
  const turnsRef = useRef<Turn[]>([])
  turnsRef.current = turns
  const [draft, setDraft] = useState('')
  const nextIdRef = useRef(1)
  const scrollRef = useRef<ScrollView>(null)
  const insets = useSafeAreaInsets()

  // Latest data snapshot for requests fired from callbacks.
  const dataRef = useRef({ transactions, categories, recurringRules, profile, locale, currency })
  dataRef.current = { transactions, categories, recurringRules, profile, locale, currency }

  // One persisted thread per screen visit (ask_conversations / ask_messages
  // — the same tables the desktop history dropdown reads).
  const conversationIdRef = useRef<string | null>(null)
  const persistChainRef = useRef<Promise<void>>(Promise.resolve())

  const firedRef = useRef(false)
  useEffect(() => {
    if (!initialQuestion || !user?.id || firedRef.current) return
    // Data hooks read the app-wide cache (src/services/queryCache.ts), so
    // in practice this is populated on the first render; the guard only
    // matters for a brand-new account with nothing loaded yet.
    if (transactions.length === 0 && categories.length === 0) return
    firedRef.current = true
    void ask(initialQuestion)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion, user?.id, transactions.length, categories.length])

  function historyFor(turnList: Turn[]): AskMurmurHistoryTurn[] {
    const history: AskMurmurHistoryTurn[] = []
    for (const turn of turnList) {
      if (turn.state.kind === 'ok') {
        history.push({ question: turn.question, answer: turn.state.response.verdict.text })
      }
    }
    return history
  }

  async function ask(question: string, retryId?: number) {
    const id = retryId ?? nextIdRef.current++
    setTurns((prev) => {
      const existing = prev.find((t) => t.id === id)
      if (existing) return prev.map((t) => (t.id === id ? { ...t, state: { kind: 'loading' } } : t))
      return [...prev, { id, question, state: { kind: 'loading' } }]
    })
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }))

    try {
      const apiBaseUrl = await getApiUrl()
      const { data: sessionData } = await supabase.auth.getSession()
      const authToken = sessionData.session?.access_token
      if (!authToken) throw new Error('no session')

      const d = dataRef.current
      // Context = every completed turn *before* this one.
      const priorTurns = turnsRef.current.filter((t) => t.id !== id)
      const request = {
        ...buildAskMurmurRequest({
          question,
          locale: d.locale,
          currency: d.currency,
          monthly_income: d.profile?.monthly_income ?? null,
          transactions: d.transactions,
          recurringRules: d.recurringRules,
          categories: d.categories,
          timeZone: d.profile?.timezone || undefined,
        }),
        history: historyFor(priorTurns),
      }
      const response = await postAskMurmur({ apiBaseUrl, authToken, request })
      setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, state: { kind: 'ok', response } } : t)))
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }))
      persist(question, response)
    } catch (err) {
      console.warn('[ask-result] request failed:', err)
      setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, state: { kind: 'error' } } : t)))
    }
  }

  function persist(question: string, response: AskMurmurResponse) {
    if (!user?.id) return
    const userId = user.id
    // Serialized so the conversation row exists before its first message
    // and turns land in order. Fire-and-forget — persistence never blocks
    // the rendered answer.
    persistChainRef.current = persistChainRef.current
      .then(async () => {
        if (!conversationIdRef.current) {
          const conversation = await createConversation(supabase, userId, question)
          if (!conversation) return
          conversationIdRef.current = conversation.id
        }
        await appendUserMessage(supabase, conversationIdRef.current, userId, question)
        await appendAssistantMessage(supabase, conversationIdRef.current, userId, response)
      })
      .catch((err) => console.warn('[ask-result] persist failed:', err))
  }

  function onSend() {
    const trimmed = draft.trim()
    if (!trimmed) return
    setDraft('')
    void ask(trimmed)
  }

  const anyLoading = turns.some((t) => t.state.kind === 'loading')
  const canSend = draft.trim().length > 0 && !anyLoading

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
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

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          // Screen-relative: this KAV is mounted at the window origin (no
          // native header, top safe area is padding on the SafeAreaView),
          // so its own frame math is correct here — the F37 offset problem
          // only bites a KAV nested under a header/modal.
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.threadContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {turns.map((turn) => (
              <View key={turn.id}>
                <UserBubble text={turn.question} />
                <MurmurBubble state={turn.state} locale={locale} onRetry={() => ask(turn.question, turn.id)} />
              </View>
            ))}
          </ScrollView>

          {/* Follow-up bar — a real one this time: submits a follow-up in
              context (the previous Q/A pairs travel as `history`). */}
          <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={t('ask.follow_up_placeholder', locale)}
              placeholderTextColor={Colors.ink4}
              style={styles.input}
              returnKeyType="send"
              onSubmitEditing={onSend}
              blurOnSubmit={false}
              multiline={false}
              editable={!anyLoading}
              accessibilityLabel={t('ask.follow_up_placeholder', locale)}
            />
            <Pressable
              onPress={onSend}
              disabled={!canSend}
              style={({ pressed }) => [styles.sendBtn, !canSend && styles.sendBtnDisabled, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={t('ask.send', locale)}
            >
              <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
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
  state: Turn['state']
  locale: Locale
  onRetry: () => void
}

function MurmurBubble({ state, locale, onRetry }: MurmurBubbleProps) {
  return (
    <View style={styles.murmurRow}>
      <View style={styles.avatarTile}>
        <Ionicons name="sparkles" size={14} color={Colors.accent} />
      </View>
      <View style={styles.murmurCol}>
        {state.kind === 'loading' ? (
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
          <ResultBody response={state.response} locale={locale} />
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
}: {
  response: AskMurmurResponse
  locale: Locale
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

  // Follow-up input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: Hairline.width,
    borderTopColor: Hairline.color,
    backgroundColor: Colors.background,
  },
  input: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 16,
    backgroundColor: Colors.surface,
    borderWidth: Hairline.width,
    borderColor: 'rgba(40,36,28,0.12)',
    fontFamily: Typography.fontFamily.sans,
    fontSize: 15,
    color: Colors.ink,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.35 },

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
})
