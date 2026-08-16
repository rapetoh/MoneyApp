import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Stack, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useTransactions } from '../../src/hooks/useTransactions'
import { useCategories } from '../../src/hooks/useCategories'
import { useRecurringRules } from '../../src/hooks/useRecurringRules'
import { useActiveBudget, budgetStatusFor } from '../../src/hooks/useBudget'
import { usePlusStatus } from '../../src/hooks/usePlusStatus'
import { MurmurMark } from '../../src/components/MurmurMark'
import { AskReplyBody } from '../../src/components/AskReplyBody'
import { BottomSheet } from '../../src/components/BottomSheet'
import { getApiUrl } from '../../src/hooks/useApiUrl'
import { supabase } from '../../src/lib/supabase'
import { Colors, Typography, Hairline, Spacing } from '../../src/theme'
import {
  t,
  computeAskInsights,
  askIntentChips,
  askActionLabel,
  resumeCandidate,
  listConversations,
  loadConversation,
  softDeleteConversation,
  replyFromStored,
  type AskConversationRow,
  type AskMessageRow,
  type Locale,
} from '@voice-expense/shared'
import type { AskAction, AskInsight, AskReply } from '@voice-expense/shared'
import { AskTurnError, buildAskData, buildAskTurnRequest, postAskTurn } from '../../src/services/askMurmurClient'

/**
 * Ask Murmur — the in-app money assistant (docs/ask-murmur/SPEC.md).
 *
 * ONE screen, three states inside it:
 *   entry  — Murmur speaks first: ranked insights computed on-device from
 *            the user's own data (upcoming bill, budget pace, category
 *            surge, subscriptions, …), intent chips, composer.
 *   thread — the conversation: user bubbles, Murmur turns (mark + text +
 *            blocks + action chips), the breathing mark while thinking.
 *   history — bottom sheet listing past conversations (open / delete).
 *
 * The server owns the conversation (POST /api/ai/ask-murmur/turn persists
 * every turn + focus with the user's own JWT); this screen reads threads
 * back through Supabase and re-opens the most recent one if it is less
 * than 12 hours old, so a back-swipe or relaunch never loses the thread.
 * Sending never navigates. Plus gate: free users → paywall on send.
 */

type LocalMessage =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; reply: AskReply }
  | { id: string; role: 'pending' }
  | { id: string; role: 'error'; text: string; seed: AskInsight | null; kind: 'busy' | 'failed' }

let localId = 0
const nextId = (prefix: string) => `${prefix}-${++localId}-${Date.now()}`

function messagesFromRows(rows: AskMessageRow[]): LocalMessage[] {
  const out: LocalMessage[] = []
  for (const m of rows) {
    if (m.role === 'user' && m.question) out.push({ id: m.id, role: 'user', text: m.question })
    else if (m.role === 'assistant') {
      const reply = replyFromStored(m.response)
      if (reply) out.push({ id: m.id, role: 'assistant', reply })
    }
  }
  return out
}

export default function AskMurmurScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale
  const currency = profile?.currency_code ?? 'USD'
  const router = useRouter()
  const { isPlus } = usePlusStatus()
  const insets = useSafeAreaInsets()

  const { transactions } = useTransactions(user?.id)
  const { categories } = useCategories(user?.id)
  const { rules: recurringRules } = useRecurringRules(user?.id)
  const { budget } = useActiveBudget(user?.id)
  const budgetStatus = useMemo(
    () => budgetStatusFor(budget, transactions, recurringRules, profile?.timezone || 'UTC'),
    [budget, transactions, recurringRules, profile?.timezone],
  )

  const dataArgs = useMemo(
    () => ({
      locale,
      currency,
      monthly_income: profile?.monthly_income ?? null,
      transactions,
      recurringRules,
      categories,
      timeZone: profile?.timezone || undefined,
      budget,
      budgetStatus,
    }),
    [locale, currency, profile?.monthly_income, profile?.timezone, transactions, recurringRules, categories, budget, budgetStatus],
  )
  const dataRef = useRef(dataArgs)
  dataRef.current = dataArgs

  // Entry insights — deterministic, instant, from the same snapshot the
  // server's tools will sum.
  const insights = useMemo<AskInsight[]>(() => {
    const snap = buildAskData(dataArgs)
    return computeAskInsights({
      transactions: snap.transactions,
      rules: snap.recurring_rules,
      budget: snap.budget,
      monthly_income: dataArgs.monthly_income,
      now_utc: snap.now_utc,
      time_zone: snap.time_zone,
      currency,
      locale,
    })
  }, [dataArgs, currency, locale])
  const intents = useMemo(() => askIntentChips(locale), [locale])

  // Conversation state.
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<LocalMessage[]>([])
  const [resumeChecked, setResumeChecked] = useState(false)
  const [draft, setDraft] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<AskConversationRow[] | null>(null)
  const scrollRef = useRef<ScrollView>(null)
  const conversationIdRef = useRef<string | null>(null)
  conversationIdRef.current = conversationId

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }))
  }, [])

  // Resume the most recent thread if it is fresh (§1.2).
  useEffect(() => {
    if (!user?.id || resumeChecked) return
    let cancelled = false
    ;(async () => {
      try {
        const thread = await resumeCandidate(supabase, user.id)
        if (cancelled || !thread) return
        setConversationId(thread.conversation.id)
        setMessages(messagesFromRows(thread.messages))
        scrollToEnd()
      } catch (err) {
        console.warn('[ask] resume failed:', err)
      } finally {
        if (!cancelled) setResumeChecked(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, resumeChecked, scrollToEnd])

  const anyPending = messages.some((m) => m.role === 'pending')

  async function send(text: string, seed: AskInsight | null = null) {
    const trimmed = text.trim()
    if (!trimmed || anyPending) return
    if (!isPlus) {
      router.push('/more/paywall')
      return
    }
    setDraft('')
    const userMsgId = nextId('u')
    const pendingId = nextId('p')
    setMessages((prev) => [
      ...prev.filter((m) => m.role !== 'error'),
      { id: userMsgId, role: 'user', text: trimmed },
      { id: pendingId, role: 'pending' },
    ])
    scrollToEnd()
    try {
      const apiBaseUrl = await getApiUrl()
      const { data: sessionData } = await supabase.auth.getSession()
      const authToken = sessionData.session?.access_token
      if (!authToken) throw new AskTurnError('unauthorized', 401)
      const request = buildAskTurnRequest({
        conversationId: conversationIdRef.current,
        message: trimmed,
        seedInsight: seed,
        data: dataRef.current,
      })
      const res = await postAskTurn({ apiBaseUrl, authToken, request })
      if (res.conversation_id) setConversationId(res.conversation_id)
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === userMsgId && res.user_message_id) return { ...m, id: res.user_message_id }
          if (m.id === pendingId) return { id: res.message.id ?? pendingId, role: 'assistant', reply: res.message.reply }
          return m
        }),
      )
      setHistory(null) // stale — refetch on next open
      scrollToEnd()
    } catch (err) {
      const e = err instanceof AskTurnError ? err : new AskTurnError('failed', 0)
      console.warn('[ask] turn failed:', e.kind, e.status)
      if (e.kind === 'plus_required') {
        setMessages((prev) => prev.filter((m) => m.id !== pendingId && m.id !== userMsgId))
        router.push('/more/paywall')
        return
      }
      if (e.kind === 'not_found') {
        // The thread was deleted elsewhere — start fresh next time.
        setConversationId(null)
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId
            ? { id: pendingId, role: 'error', text: trimmed, seed, kind: e.kind === 'busy' ? 'busy' : 'failed' }
            : m,
        ),
      )
      scrollToEnd()
    }
  }

  function startNew() {
    setConversationId(null)
    setMessages([])
    setDraft('')
    setHistoryOpen(false)
  }

  async function openHistory() {
    setHistoryOpen(true)
    if (history === null && user?.id) {
      try {
        setHistory(await listConversations(supabase, user.id, 30))
      } catch (err) {
        console.warn('[ask] history load failed:', err)
        setHistory([])
      }
    }
  }

  async function openConversation(id: string) {
    setHistoryOpen(false)
    if (id === conversationId) return
    try {
      const thread = await loadConversation(supabase, id)
      if (!thread) return
      setConversationId(thread.conversation.id)
      setMessages(messagesFromRows(thread.messages))
      scrollToEnd()
    } catch (err) {
      console.warn('[ask] open conversation failed:', err)
    }
  }

  async function deleteConversation(id: string) {
    try {
      await softDeleteConversation(supabase, id)
      setHistory((prev) => (prev ? prev.filter((c) => c.id !== id) : prev))
      if (id === conversationId) startNew()
    } catch (err) {
      console.warn('[ask] delete failed:', err)
    }
  }

  function performAction(action: AskAction) {
    const p = action.params ?? {}
    switch (action.intent) {
      case 'show_transactions': {
        const q = p.query ?? p.merchant ?? p.category_name ?? ''
        const params: Record<string, string> = {}
        if (q) params.q = q
        if (p.month && /^\d{4}-\d{2}$/.test(p.month)) params.month = p.month
        router.push({ pathname: '/more/transactions', params })
        return
      }
      case 'set_budget':
        router.push({ pathname: '/(tabs)/budgets', params: { edit: '1' } })
        return
      case 'open_recurring':
        router.push('/recurring')
        return
      case 'create_rule':
        router.push({ pathname: '/recurring', params: { new: '1' } })
        return
      case 'log_expense':
        router.push('/transaction/new')
        return
    }
  }

  const showEntry = messages.length === 0
  const canSend = draft.trim().length > 0 && !anyPending

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        {/* Header — close · mark + title · history · new */}
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
            <MurmurMark size={22} variant="sage" />
            <Text style={styles.title}>{t('ask.header_title', locale)}</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={openHistory}
              style={({ pressed }) => [styles.iconPill, pressed && styles.pressed]}
              hitSlop={8}
              accessibilityLabel={t('ask.history', locale)}
            >
              <Ionicons name="time-outline" size={17} color={Colors.ink2} />
            </Pressable>
            <Pressable
              onPress={startNew}
              disabled={showEntry}
              style={({ pressed }) => [styles.iconPill, showEntry && styles.iconPillDisabled, pressed && styles.pressed]}
              hitSlop={8}
              accessibilityLabel={t('ask.new_conversation', locale)}
            >
              <Ionicons name="create-outline" size={17} color={Colors.ink2} />
            </Pressable>
          </View>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.threadContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onContentSizeChange={() => {
              if (!showEntry) scrollRef.current?.scrollToEnd({ animated: true })
            }}
          >
            {showEntry ? (
              <EntryState
                locale={locale}
                insights={insights}
                intents={intents}
                onAskInsight={(ins) => send(ins.question, ins)}
                onInsightAction={performAction}
                onIntent={(q) => send(q)}
              />
            ) : (
              messages.map((m) => {
                if (m.role === 'user') return <UserBubble key={m.id} text={m.text} />
                if (m.role === 'pending') return <ThinkingTurn key={m.id} locale={locale} />
                if (m.role === 'error') {
                  return (
                    <ErrorTurn
                      key={m.id}
                      locale={locale}
                      kind={m.kind}
                      onRetry={() => {
                        setMessages((prev) => prev.filter((x) => x.id !== m.id))
                        // The user bubble is still in the thread; resend the same text.
                        void resend(m.text, m.seed)
                      }}
                    />
                  )
                }
                return (
                  <MurmurTurn key={m.id}>
                    <AskReplyBody reply={m.reply} locale={locale} currency={currency} onAction={performAction} />
                  </MurmurTurn>
                )
              })
            )}
          </ScrollView>

          {/* Composer — the one input for the whole conversation. */}
          <View style={styles.inputWrap}>
            <View style={styles.inputBar}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={t(showEntry ? 'ask.composer_placeholder' : 'ask.followup_placeholder', locale)}
                placeholderTextColor={Colors.ink4}
                style={styles.input}
                returnKeyType="send"
                onSubmitEditing={() => send(draft)}
                blurOnSubmit={false}
                multiline={false}
                maxLength={1000}
                accessibilityLabel={t('ask.composer_placeholder', locale)}
              />
              <Pressable
                onPress={() => send(draft)}
                disabled={!canSend}
                style={({ pressed }) => [styles.sendBtn, !canSend && styles.sendBtnDisabled, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={t('ask.send_label', locale)}
              >
                <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
            {showEntry && (
              <View style={styles.footerRow}>
                <Ionicons name="lock-closed" size={11} color={Colors.ink4} />
                <Text style={styles.footerText}>{t('ask.privacy_note', locale)}</Text>
              </View>
            )}
            <View style={{ height: Math.max(insets.bottom, 10) }} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <BottomSheet
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={t('ask.history', locale)}
        cancelLabel={t('common.cancel', locale)}
      >
        <View style={styles.historyList}>
          {history === null ? (
            <Text style={styles.historyEmpty}>{t('ask.thinking', locale)}</Text>
          ) : history.length === 0 ? (
            <Text style={styles.historyEmpty}>{t('ask.history_empty', locale)}</Text>
          ) : (
            history.map((c) => (
              <View key={c.id} style={[styles.historyRow, c.id === conversationId && styles.historyRowActive]}>
                <Pressable style={styles.historyMain} onPress={() => openConversation(c.id)}>
                  <Text style={styles.historyTitle} numberOfLines={1}>
                    {c.title ?? '…'}
                  </Text>
                  <Text style={styles.historyMeta}>{formatWhen(c.last_message_at, locale)}</Text>
                </Pressable>
                <Pressable
                  onPress={() => deleteConversation(c.id)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.historyDelete, pressed && styles.pressed]}
                  accessibilityLabel={t('ask.delete', locale)}
                >
                  <Ionicons name="trash-outline" size={16} color={Colors.ink4} />
                </Pressable>
              </View>
            ))
          )}
        </View>
      </BottomSheet>
    </>
  )

  // Retry of a failed turn: the user bubble is already there, so only the
  // request is repeated (no duplicate bubble).
  async function resend(text: string, seed: AskInsight | null) {
    const pendingId = nextId('p')
    setMessages((prev) => [...prev, { id: pendingId, role: 'pending' }])
    scrollToEnd()
    try {
      const apiBaseUrl = await getApiUrl()
      const { data: sessionData } = await supabase.auth.getSession()
      const authToken = sessionData.session?.access_token
      if (!authToken) throw new AskTurnError('unauthorized', 401)
      const request = buildAskTurnRequest({ conversationId: conversationIdRef.current, message: text, seedInsight: seed, data: dataRef.current })
      const res = await postAskTurn({ apiBaseUrl, authToken, request })
      if (res.conversation_id) setConversationId(res.conversation_id)
      setMessages((prev) => prev.map((m) => (m.id === pendingId ? { id: res.message.id ?? pendingId, role: 'assistant', reply: res.message.reply } : m)))
      setHistory(null)
      scrollToEnd()
    } catch (err) {
      const e = err instanceof AskTurnError ? err : new AskTurnError('failed', 0)
      if (e.kind === 'plus_required') {
        setMessages((prev) => prev.filter((m) => m.id !== pendingId))
        router.push('/more/paywall')
        return
      }
      setMessages((prev) => prev.map((m) => (m.id === pendingId ? { id: pendingId, role: 'error', text, seed, kind: e.kind === 'busy' ? 'busy' : 'failed' } : m)))
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry state — insights, intents
// ─────────────────────────────────────────────────────────────────────────────

function EntryState({
  locale,
  insights,
  intents,
  onAskInsight,
  onInsightAction,
  onIntent,
}: {
  locale: Locale
  insights: AskInsight[]
  intents: Array<{ id: string; label: string; question: string }>
  onAskInsight: (i: AskInsight) => void
  onInsightAction: (a: AskAction) => void
  onIntent: (q: string) => void
}) {
  return (
    <View>
      <View style={styles.entryHead}>
        <MurmurMark size={44} variant="cream" />
        <Text style={styles.entryLead}>{t('ask.entry_lead', locale)}</Text>
      </View>
      <Text style={styles.sectionEyebrow}>{t('ask.today_eyebrow', locale)}</Text>
      <View style={styles.insightList}>
        {insights.map((ins) => (
          <InsightCard key={ins.id} insight={ins} locale={locale} onAsk={() => onAskInsight(ins)} onAction={onInsightAction} />
        ))}
      </View>
      <Text style={[styles.sectionEyebrow, { marginTop: 22 }]}>{t('ask.intent_eyebrow', locale)}</Text>
      <View style={styles.intentRow}>
        {intents.map((it) => (
          <Pressable key={it.id} onPress={() => onIntent(it.question)} style={({ pressed }) => [styles.intentChip, pressed && styles.pressed]}>
            <Text style={styles.intentText}>{it.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

function InsightCard({
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
  const stripe =
    insight.tone === 'alert' ? Colors.unclear : insight.tone === 'watch' ? '#C89B3C' : insight.tone === 'good' ? Colors.accent : Colors.ink4
  return (
    <Pressable onPress={onAsk} style={({ pressed }) => [styles.insightCard, pressed && styles.insightPressed]} accessibilityRole="button">
      <View style={[styles.insightStripe, { backgroundColor: stripe }]} />
      <View style={styles.insightBody}>
        <Text style={styles.insightTitle}>{insight.title}</Text>
        <Text style={styles.insightDetail}>{insight.detail}</Text>
        <View style={styles.insightFooter}>
          <View style={styles.insightAskRow}>
            <Ionicons name="chatbubble-ellipses-outline" size={13} color={Colors.ink3} />
            <Text style={styles.insightAsk} numberOfLines={1}>
              {insight.question}
            </Text>
          </View>
          {insight.action && (
            <Pressable onPress={() => onAction(insight.action as AskAction)} hitSlop={6} style={({ pressed }) => [styles.insightActionChip, pressed && styles.pressed]}>
              <Text style={styles.insightActionText}>{askActionLabel(insight.action, locale)}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Thread pieces
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

function MurmurTurn({ children, animating = false }: { children: React.ReactNode; animating?: boolean }) {
  return (
    <View style={styles.murmurRow}>
      <BreathingMark animating={animating} />
      <View style={styles.murmurCol}>{children}</View>
    </View>
  )
}

/** The Murmur mark, breathing on a 2.6 s loop while the model thinks —
 *  the brand is the loading affordance, never a spinner (SPEC §1.2). */
function BreathingMark({ animating }: { animating: boolean }) {
  const scale = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (!animating) {
      scale.setValue(1)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.12, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [animating, scale])
  return (
    <Animated.View style={{ transform: [{ scale }], marginTop: 4 }}>
      <MurmurMark size={32} variant="sage" />
    </Animated.View>
  )
}

function ThinkingTurn({ locale }: { locale: Locale }) {
  return (
    <MurmurTurn animating>
      <View style={styles.thinkingCard}>
        <Text style={styles.thinkingText}>{t('ask.thinking', locale)}</Text>
      </View>
    </MurmurTurn>
  )
}

function ErrorTurn({ locale, kind, onRetry }: { locale: Locale; kind: 'busy' | 'failed'; onRetry: () => void }) {
  return (
    <MurmurTurn>
      <View style={styles.thinkingCard}>
        <Text style={styles.errorText}>{t(kind === 'busy' ? 'ask.busy' : 'ask.error', locale)}</Text>
        <Pressable onPress={onRetry} style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}>
          <Ionicons name="refresh" size={14} color="#FFFFFF" />
          <Text style={styles.retryText}>{t('ask.retry', locale)}</Text>
        </Pressable>
      </View>
    </MurmurTurn>
  )
}

function formatWhen(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  } catch {
    return iso.slice(0, 16)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
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
  iconPillDisabled: { opacity: 0.4 },
  headerActions: { flexDirection: 'row', gap: 8 },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.ink, fontFamily: Typography.fontFamily.sansBold },
  pressed: { opacity: 0.6 },

  threadContent: { flexGrow: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.xl },

  // Entry
  entryHead: { paddingTop: 18, paddingBottom: 18, alignItems: 'flex-start', gap: 12 },
  entryLead: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.4,
    color: Colors.ink,
  },
  sectionEyebrow: {
    color: Colors.ink3,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
    fontFamily: Typography.fontFamily.sansBold,
  },
  insightList: { gap: 10 },
  insightCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
    overflow: 'hidden',
  },
  insightPressed: { opacity: 0.8 },
  insightStripe: { width: 4 },
  insightBody: { flex: 1, paddingHorizontal: 14, paddingVertical: 13, gap: 4 },
  insightTitle: { fontFamily: Typography.fontFamily.serif, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, color: Colors.ink },
  insightDetail: { fontSize: 13.5, lineHeight: 19, color: Colors.ink3, fontFamily: Typography.fontFamily.sans },
  insightFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 6 },
  insightAskRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  insightAsk: { fontSize: 12.5, color: Colors.ink3, fontFamily: Typography.fontFamily.sans, flex: 1 },
  insightActionChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: Colors.accentSoft },
  insightActionText: { fontSize: 12, fontWeight: '700', color: Colors.accent, fontFamily: Typography.fontFamily.sansBold },
  intentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  intentChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: Hairline.width,
    borderColor: 'rgba(40,36,28,0.14)',
  },
  intentText: { fontSize: 13.5, color: Colors.ink, fontWeight: '500', fontFamily: Typography.fontFamily.sans },

  // Thread
  userRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 14 },
  userBubble: {
    maxWidth: '80%',
    backgroundColor: Colors.ink,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomRightRadius: 6,
  },
  userText: { fontSize: 15, color: '#FFFFFF', lineHeight: 21, letterSpacing: -0.1, fontFamily: Typography.fontFamily.sans },
  murmurRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  murmurCol: { flex: 1 },
  thinkingCard: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 20,
    borderTopLeftRadius: 6,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  thinkingText: { fontSize: 14, color: Colors.ink3, fontFamily: Typography.fontFamily.sans },
  errorText: { fontSize: 14.5, color: Colors.ink2, lineHeight: 21, fontFamily: Typography.fontFamily.sans },
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
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', fontFamily: Typography.fontFamily.sansBold },

  // Composer
  inputWrap: {
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: Hairline.width,
    borderTopColor: Hairline.color,
    backgroundColor: Colors.background,
  },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.35 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 },
  footerText: { fontSize: 11.5, color: Colors.ink4, fontWeight: '500', fontFamily: Typography.fontFamily.sans },

  // History sheet
  historyList: { paddingHorizontal: 4, paddingBottom: 12 },
  historyEmpty: { padding: 20, textAlign: 'center', color: Colors.ink3, fontFamily: Typography.fontFamily.sans, fontSize: 14 },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, gap: 10 },
  historyRowActive: { backgroundColor: Colors.accentSoft },
  historyMain: { flex: 1 },
  historyTitle: { fontSize: 15, color: Colors.ink, fontWeight: '600', fontFamily: Typography.fontFamily.sansSemiBold },
  historyMeta: { fontSize: 12, color: Colors.ink4, marginTop: 2, fontFamily: Typography.fontFamily.sans },
  historyDelete: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
})
