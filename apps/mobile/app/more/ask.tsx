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
import { Stack, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useTransactions } from '../../src/hooks/useTransactions'
import { useCategories } from '../../src/hooks/useCategories'
import { useRecurringRules } from '../../src/hooks/useRecurringRules'
import { usePlusStatus } from '../../src/hooks/usePlusStatus'
import { AskChart } from '../../src/components/AskChart'
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

interface Turn {
  id: number
  question: string
  state:
    | { kind: 'loading' }
    | { kind: 'ok'; response: AskMurmurResponse }
    | { kind: 'error' }
}

// Four starter prompts shown as tappable cards while the thread is empty.
// The emoji set is the same across locales; the text is localized.
const SUGGESTIONS: { icon: string; key: string }[] = [
  { icon: '🎮', key: 'ask.suggestion_afford' },
  { icon: '☕', key: 'ask.suggestion_coffee' },
  { icon: '📉', key: 'ask.suggestion_unusual' },
  { icon: '🎯', key: 'ask.suggestion_goal' },
]

/**
 * Ask Murmur — ONE screen, one conversation.
 *
 * Entry state (S_AskEntry: hero + starter prompts) and the thread
 * (S_AskResult: user bubble / Murmur bubble with verdict, breakdown, chart,
 * note) are the same screen — a question typed or tapped here is answered
 * right here, and every follow-up grows the same thread. Build 14 pushed a
 * second `ask-result` screen per question, which read as "a new chat every
 * time" (owner report, Aug 15); that route is gone.
 *
 * Multi-turn: every turn owns its loading / answer / error state, follow-ups
 * are sent with the completed turns as `history` (the web thread's contract),
 * and each turn is appended to the same persisted conversation.
 *
 * Plus gate: free users are routed to the paywall on submit — same as before.
 * Voice input inside Ask is not built; text-only.
 */
export default function AskMurmurScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale
  const currency = profile?.currency_code ?? 'USD'
  const router = useRouter()
  const { isPlus } = usePlusStatus()

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
      console.warn('[ask] request failed:', err)
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
      .catch((err) => console.warn('[ask] persist failed:', err))
  }

  const anyLoading = turns.some((t) => t.state.kind === 'loading')
  const canSend = draft.trim().length > 0 && !anyLoading

  // Plus gate — the one place it applies. Free user → paywall; Plus user →
  // the question goes into the thread right here (no navigation).
  function submit(question: string) {
    const trimmed = question.trim()
    if (!trimmed || anyLoading) return
    if (!isPlus) {
      router.push('/more/paywall')
      return
    }
    setDraft('')
    void ask(trimmed)
  }

  function onSend() {
    // The keyboard's return key calls this too — same gate as the button.
    submit(draft)
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        {/* Header — close pill · sparkle title · Beta chip */}
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.iconPill, pressed && styles.pressed]}
            hitSlop={8}
            accessibilityLabel={t('common.cancel', locale)}
          >
            <Ionicons name="close" size={16} color={Colors.ink2} />
          </Pressable>
          <View style={styles.titleWrap}>
            <Ionicons name="sparkles" size={14} color={Colors.accent} />
            <Text style={styles.title}>{t('ask.header_title', locale)}</Text>
          </View>
          <View style={styles.betaChip}>
            <Ionicons name="sparkles" size={11} color={Colors.accent} />
            <Text style={styles.betaText}>{t('ask.beta', locale)}</Text>
          </View>
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
            {turns.length === 0 ? (
              <>
                {/* Entry state — hero + starter prompts (S_AskEntry). Tapping
                    a prompt sends it into THIS screen; the conversation grows
                    in place. */}
                <View style={styles.hero}>
                  <View style={styles.sparkleTile}>
                    <Ionicons name="sparkles" size={26} color="#FFFFFF" />
                  </View>
                  <Text style={styles.heroTitle}>{t('ask.title', locale)}</Text>
                  <Text style={styles.lead}>{t('ask.lead', locale)}</Text>
                </View>
                <View style={styles.suggestions}>
                  {SUGGESTIONS.map((sg, i) => (
                    <Pressable
                      key={i}
                      onPress={() => submit(t(sg.key, locale))}
                      style={({ pressed }) => [styles.suggestionRow, pressed && styles.suggestionRowPressed]}
                    >
                      <View style={styles.emojiTile}>
                        <Text style={styles.emoji}>{sg.icon}</Text>
                      </View>
                      <Text style={styles.suggestionText} numberOfLines={2}>{t(sg.key, locale)}</Text>
                      <Ionicons name="chevron-forward" size={16} color={Colors.ink4} />
                    </Pressable>
                  ))}
                </View>
              </>
            ) : (
              turns.map((turn) => (
                <View key={turn.id}>
                  <UserBubble text={turn.question} />
                  <MurmurBubble
                    state={turn.state}
                    locale={locale}
                    currency={currency}
                    onRetry={() => ask(turn.question, turn.id)}
                  />
                </View>
              ))
            )}
          </ScrollView>

          {/* One input bar for the whole conversation — first question and
              every follow-up (follow-ups carry the earlier turns as
              `history`). Always present; the thread grows above it. */}
          <View style={styles.inputWrap}>
            <View style={styles.inputBar}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={t(turns.length === 0 ? 'ask.input_placeholder' : 'ask.followup_placeholder', locale)}
                placeholderTextColor={Colors.ink4}
                style={styles.input}
                returnKeyType="send"
                onSubmitEditing={onSend}
                blurOnSubmit={false}
                multiline={false}
                maxLength={600}
                // Stays editable while an answer loads — toggling `editable`
                // on a focused field dismisses the keyboard on iOS. Send is
                // gated instead.
                accessibilityLabel={t('ask.input_placeholder', locale)}
              />
              <Pressable
                onPress={onSend}
                disabled={!canSend}
                style={({ pressed }) => [styles.sendBtn, !canSend && styles.sendBtnDisabled, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={t('ask.send_label', locale)}
              >
                <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
            {turns.length === 0 && (
              <View style={styles.footerRow}>
                <Ionicons name="lock-closed" size={11} color={Colors.ink4} />
                <Text style={styles.footerText}>{t('ask.privacy_note', locale)}</Text>
              </View>
            )}
            <View style={{ height: Math.max(insets.bottom, 10) }} />
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
  currency: string
  onRetry: () => void
}

function MurmurBubble({ state, locale, currency, onRetry }: MurmurBubbleProps) {
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
          <ResultBody response={state.response} locale={locale} currency={currency} />
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
  currency,
}: {
  response: AskMurmurResponse
  locale: Locale
  currency: string
}) {
  // "Based on N transactions" only under answers that actually used them —
  // under a greeting or a refusal it read as noise (owner report).
  const isDataAnswer =
    !response.out_of_scope && (/\d/.test(response.verdict.text) || !!response.breakdown || !!response.chart)
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

      {response.chart && <AskChart chart={response.chart} currency={currency} locale={locale} />}

      {response.note && (
        <View style={styles.noteCard}>
          <Text style={styles.noteText}>{response.note.text}</Text>
        </View>
      )}

      {isDataAnswer && (
        <View style={styles.attributionRow}>
          <Ionicons name="lock-closed" size={11} color={Colors.ink4} />
          <Text style={styles.attributionText}>
            {t('ask.attribution', locale).replace(
              '{count}',
              String(response.attribution.transaction_count),
            )}
          </Text>
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

  // Input bar (first question and every follow-up)
  inputWrap: {
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: Hairline.width,
    borderTopColor: Hairline.color,
    backgroundColor: Colors.background,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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

  topRow: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  closePill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
    alignItems: 'center',
    justifyContent: 'center',
  },

  pillPressed: { opacity: 0.6 },

  betaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: Colors.accentSoft ?? Colors.primaryLight,
    borderRadius: 999,
  },

  betaText: {
    color: Colors.accent ?? Colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontFamily: Typography.fontFamily.sansBold,
  },

  hero: { paddingHorizontal: 28, paddingTop: 40 },

  sparkleTile: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.ink ?? '#1B1915',
    alignItems: 'center',
    justifyContent: 'center',
    // Soft drop shadow — "boxShadow: 0 6px 18px rgba(0,0,0,0.18)" from the mockup.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 6,
  },

  heroTitle: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 36,
    fontWeight: '500',
    letterSpacing: -0.8,
    lineHeight: 42,
    color: Colors.ink ?? Colors.text,
    marginTop: 22,
  },

  lead: {
    color: Colors.ink3 ?? Colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    fontFamily: Typography.fontFamily.sans,
  },

  suggestions: {
    paddingHorizontal: 20,
    paddingTop: 28,
    flexDirection: 'column',
    gap: 10,
  },

  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderRadius: 16,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },

  suggestionRowPressed: { opacity: 0.7 },

  emojiTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.surface2 ?? Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emoji: { fontSize: 18 },

  suggestionText: {
    flex: 1,
    fontSize: 14.5,
    color: Colors.ink ?? Colors.text,
    fontWeight: '500',
    letterSpacing: -0.2,
    fontFamily: Typography.fontFamily.sans,
  },

  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },

  footerText: {
    fontSize: 11.5,
    color: Colors.ink4 ?? Colors.textMuted,
    fontWeight: '500',
    fontFamily: Typography.fontFamily.sans,
  },
})
