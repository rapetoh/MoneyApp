'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '../../../lib/supabase/client'
import { colors, font, radius } from '../../../lib/theme'
import { Toolbar } from '../../../components/Toolbar'
import { MurmurMark } from '../../../components/MurmurMark'
import { Icon } from '../../../components/Icons'
import { PaywallGate } from '../../../components/PaywallGate'
import { ThinkingDots } from '../../../components/ThinkingDots'
import { AskChart } from '../../../components/AskChart'
import { usePlus } from '../../../lib/plus'
import {
  loadMostRecentConversation,
  loadConversation,
  listConversations,
  createConversation,
  appendUserMessage,
  appendAssistantMessage,
  softDeleteConversation,
  type AskConversationRow,
  type AskMessageRow,
} from '@voice-expense/shared'
import type {
  AskMurmurRequest,
  AskMurmurResponse,
  AskMurmurTransaction,
  AskMurmurRecurringRule,
  AskMurmurHistoryTurn,
  Locale,
  RecurringRule,
  Transaction,
  Category,
} from '@voice-expense/shared'

// "Try also" suggestions — surfaced in the right rail in summary mode and
// as quick-start chips on the empty state. Clicking one fires it as a new
// top-level question (replaces the current answer card).
const SUGGESTIONS = [
  'How much did I spend on coffee last quarter?',
  'If I cut shopping by 30%, when would I hit $10k?',
  'Show months I overspent on food.',
  "What's my biggest wasted subscription?",
]

// Single conversation turn. We render the latest assistant turn as a rich
// "answer card" in summary mode; deep mode renders the full thread with
// follow-up composer.
type ThreadTurn =
  | { id: string; role: 'user'; question: string }
  | { id: string; role: 'assistant'; response: AskMurmurResponse }
  | { id: string; role: 'pending' }
  | { id: string; role: 'retry'; question: string }

function messagesToThread(rows: AskMessageRow[]): ThreadTurn[] {
  const out: ThreadTurn[] = []
  for (const m of rows) {
    if (m.role === 'user' && m.question) {
      out.push({ id: m.id, role: 'user', question: m.question })
    } else if (m.role === 'assistant' && m.response) {
      out.push({ id: m.id, role: 'assistant', response: m.response })
    }
  }
  return out
}

// Minimal Web Speech API typing — lib.dom.d.ts doesn't ship these.
interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: ((e: unknown) => void) | null
  start: () => void
  stop: () => void
}
function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

// Allow only <b> tags from the model output.
function sanitize(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped.replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>')
}

export default function AskMurmurPage() {
  const supabase = createClient()
  const { isPlus } = usePlus()
  const [authed, setAuthed] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<
    { currency_code?: string; locale?: Locale; monthly_income?: number | null } | null
  >(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [rules, setRules] = useState<RecurringRule[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  // Conversation state
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<AskConversationRow[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [thread, setThread] = useState<ThreadTurn[]>([])
  const [pending, setPending] = useState(false)

  // UI mode: 'summary' = single rich answer card (default); 'deep' = full
  // thread + follow-up composer (the user opted in via "Dive deeper").
  const [mode, setMode] = useState<'summary' | 'deep'>('summary')
  const [question, setQuestion] = useState('')
  const threadEndRef = useRef<HTMLDivElement | null>(null)

  // Web Speech API state.
  const [micSupported, setMicSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    const SR = getSpeechRecognitionCtor()
    if (SR) {
      const r = new SR() as SpeechRecognitionLike
      r.continuous = false
      r.interimResults = true
      r.onresult = (event: SpeechRecognitionEventLike) => {
        let transcript = ''
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript
        }
        if (transcript.trim()) setQuestion(transcript)
      }
      r.onend = () => setListening(false)
      r.onerror = () => setListening(false)
      recognitionRef.current = r
      setMicSupported(true)
    }
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return
      setAuthed(true)
      setUserId(user.id)
      const [p, t, r, c, mostRecent, convs] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase
          .from('transactions')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_deleted', false)
          .order('transacted_at', { ascending: false }),
        supabase.from('recurring_rules').select('*').eq('user_id', user.id),
        supabase.from('categories').select('*').eq('user_id', user.id).eq('is_archived', false),
        loadMostRecentConversation(supabase, user.id),
        listConversations(supabase, user.id, 30),
      ])
      setProfile(p.data)
      setTransactions((t.data ?? []) as Transaction[])
      setRules((r.data ?? []) as RecurringRule[])
      setCategories((c.data ?? []) as Category[])
      setConversations(convs)
      if (mostRecent) {
        setActiveConversationId(mostRecent.conversation.id)
        setThread(messagesToThread(mostRecent.messages))
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (mode === 'deep') threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [thread, mode])

  useEffect(() => {
    const r = recognitionRef.current
    if (!r) return
    const localeMap: Record<string, string> = { en: 'en-US', fr: 'fr-FR', es: 'es-ES', pt: 'pt-BR' }
    r.lang = localeMap[(profile?.locale ?? 'en') as string] ?? 'en-US'
  }, [profile])

  function toggleMic() {
    const r = recognitionRef.current
    if (!r) return
    if (listening) {
      r.stop()
      return
    }
    setQuestion('')
    try {
      r.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }

  function buildRequest(q: string, history: AskMurmurHistoryTurn[]): AskMurmurRequest {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)
    const cutoffIso = cutoff.toISOString()
    const catById = new Map<string, string>()
    for (const c of categories) catById.set(c.id, c.name)
    const filtered = transactions
      .filter((t) => !t.is_deleted && t.transacted_at >= cutoffIso)
      .sort((a, b) => a.transacted_at.localeCompare(b.transacted_at))
      .slice(-500)
    const wireTxns: AskMurmurTransaction[] = filtered.map((t) => ({
      amount: t.amount,
      direction: t.direction,
      merchant: t.merchant ?? null,
      category_name: t.category_id ? catById.get(t.category_id) ?? null : null,
      transacted_at: t.transacted_at,
      is_recurring: !!t.is_recurring,
    }))
    const wireRules: AskMurmurRecurringRule[] = rules
      .filter((r) => r.is_active)
      .map((r) => ({
        name: r.name ?? null,
        amount: r.amount,
        direction: r.direction,
        frequency: r.frequency,
      }))
    return {
      question: q.trim(),
      locale: (profile?.locale ?? 'en') as Locale,
      currency: profile?.currency_code ?? 'USD',
      today: new Date().toISOString().split('T')[0],
      monthly_income: profile?.monthly_income ?? null,
      transactions: wireTxns,
      recurring_rules: wireRules,
      ...(history.length > 0 ? { history } : {}),
    }
  }

  async function send(q: string) {
    if (!authed || !userId || !q.trim() || pending) return
    const trimmed = q.trim()
    const userTurnId = `u-${Date.now()}`
    const pendingId = `p-${Date.now()}`

    // Build history for the model from completed user/assistant pairs only.
    // (Pending / retry placeholders never get sent.)
    const history: AskMurmurHistoryTurn[] = []
    let lastUserQ: string | null = null
    for (const t of thread) {
      if (t.role === 'user') lastUserQ = t.question
      else if (t.role === 'assistant' && lastUserQ) {
        history.push({ question: lastUserQ, answer: t.response.verdict.text })
        lastUserQ = null
      } else if (t.role !== 'pending') {
        lastUserQ = null
      }
    }

    setThread((prev) => [
      ...prev,
      { id: userTurnId, role: 'user', question: trimmed },
      { id: pendingId, role: 'pending' },
    ])
    setQuestion('')
    setPending(true)

    let convId: string | null = activeConversationId
    try {
      if (!convId) {
        const conv = await createConversation(supabase, userId, trimmed)
        if (!conv) throw new Error('Could not start a new conversation')
        convId = conv.id
        setActiveConversationId(convId)
        setConversations((prev) => [conv, ...prev])
      }
      const persistedUser = await appendUserMessage(supabase, convId, userId, trimmed)
      if (persistedUser) {
        setThread((prev) =>
          prev.map((t) =>
            t.id === userTurnId
              ? { id: persistedUser.id, role: 'user', question: trimmed }
              : t,
          ),
        )
      }
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) throw new Error('Not signed in')
      const res = await fetch('/api/ai/ask-murmur', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(buildRequest(trimmed, history)),
      })
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      const data = (await res.json()) as AskMurmurResponse
      const persistedAssistant = await appendAssistantMessage(supabase, convId, userId, data)
      const assistantId = persistedAssistant?.id ?? pendingId
      setThread((prev) =>
        prev.map((t) =>
          t.id === pendingId ? { id: assistantId, role: 'assistant', response: data } : t,
        ),
      )
    } catch (e) {
      console.error('[ask] failed:', e)
      setThread((prev) =>
        prev.map((t) => (t.id === pendingId ? { id: pendingId, role: 'retry', question: trimmed } : t)),
      )
    } finally {
      setPending(false)
    }
  }

  function startNewConversation() {
    setThread([])
    setQuestion('')
    setActiveConversationId(null)
    setHistoryOpen(false)
    setMode('summary')
  }

  async function switchConversation(conversationId: string) {
    if (conversationId === activeConversationId) {
      setHistoryOpen(false)
      return
    }
    const loaded = await loadConversation(supabase, conversationId)
    if (!loaded) return
    setActiveConversationId(loaded.conversation.id)
    setThread(messagesToThread(loaded.messages))
    setQuestion('')
    setHistoryOpen(false)
    setMode('summary')
  }

  async function deleteConversation(conversationId: string) {
    await softDeleteConversation(supabase, conversationId)
    setConversations((prev) => prev.filter((c) => c.id !== conversationId))
    if (conversationId === activeConversationId) {
      if (!userId) return
      const next = await loadMostRecentConversation(supabase, userId)
      if (next) {
        setActiveConversationId(next.conversation.id)
        setThread(messagesToThread(next.messages))
      } else {
        setActiveConversationId(null)
        setThread([])
      }
    }
  }

  // Latest user/assistant pair for the summary card.
  const latestPair = useMemo(() => {
    let lastUserQ: string | null = null
    let lastAssistant: AskMurmurResponse | null = null
    let lastPending = false
    let lastRetry: string | null = null
    for (const t of thread) {
      if (t.role === 'user') {
        lastUserQ = t.question
        lastAssistant = null
        lastPending = false
        lastRetry = null
      } else if (t.role === 'assistant') {
        lastAssistant = t.response
        lastPending = false
        lastRetry = null
      } else if (t.role === 'pending') {
        lastPending = true
      } else if (t.role === 'retry') {
        lastRetry = t.question
      }
    }
    return { question: lastUserQ, response: lastAssistant, pending: lastPending, retry: lastRetry }
  }, [thread])

  if (!isPlus) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Toolbar title="Ask Murmur" />
        <div style={{ padding: '0 24px 24px' }}>
          <PaywallGate
            feature="Ask Murmur"
            title="A grounded reasoner over your own money."
            body="Ask in plain language — Murmur answers from your transactions, recurring bills, and income."
          />
        </div>
      </div>
    )
  }

  const currency = profile?.currency_code ?? 'USD'
  const locale = (profile?.locale ?? 'en') as string

  // Sources Used panel data — reflects what the model has access to.
  const sources = (() => {
    const ninetyAgo = new Date()
    ninetyAgo.setDate(ninetyAgo.getDate() - 90)
    const ninetyAgoIso = ninetyAgo.toISOString()
    const recentTxns = transactions.filter((t) => !t.is_deleted && t.transacted_at >= ninetyAgoIso)
    const voiceCount = transactions.filter((t) => t.source === 'voice' && !t.is_deleted).length
    const incomeCount = recentTxns.filter((t) => t.direction === 'credit').length
    const activeRules = rules.filter((r) => r.is_active).length
    return [
      { label: `${voiceCount} voice ${voiceCount === 1 ? 'expense' : 'expenses'}`, sub: 'all time' },
      { label: `${incomeCount} income ${incomeCount === 1 ? 'deposit' : 'deposits'}`, sub: 'last 90d' },
      { label: `${activeRules} recurring ${activeRules === 1 ? 'bill' : 'bills'}`, sub: 'detected' },
    ]
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Toolbar
        title="Ask Murmur"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
            {conversations.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setHistoryOpen((o) => !o)}
                  style={styles.historyBtn}
                  aria-expanded={historyOpen}
                >
                  History ({conversations.length})
                </button>
                {historyOpen && (
                  <div style={styles.historyMenu} role="menu">
                    {conversations.map((c) => {
                      const isActive = c.id === activeConversationId
                      return (
                        <div
                          key={c.id}
                          style={{
                            ...styles.historyItem,
                            background: isActive ? colors.accentSoft : 'transparent',
                          }}
                        >
                          <button
                            onClick={() => switchConversation(c.id)}
                            style={styles.historyItemMain}
                            title={c.title ?? 'Untitled conversation'}
                          >
                            <div style={styles.historyTitle}>{c.title ?? 'Untitled conversation'}</div>
                            <div style={styles.historyMeta}>
                              {new Date(c.last_message_at).toLocaleDateString(locale, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </button>
                          <button
                            onClick={() => deleteConversation(c.id)}
                            style={styles.historyDelete}
                            title="Delete conversation"
                            aria-label="Delete conversation"
                          >
                            ×
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
            {(thread.length > 0 || activeConversationId) && (
              <button onClick={startNewConversation} style={styles.newConv}>
                New conversation
              </button>
            )}
          </div>
        }
      />

      <div style={styles.content}>
        {/* Title block */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={styles.brandTile}>
            <Icon.sparkle color="#fff" size={16} />
          </div>
          <div style={{ fontFamily: font.serif, fontSize: 28, fontWeight: 500, color: colors.ink, letterSpacing: -0.6 }}>
            Ask Murmur
          </div>
          <span style={styles.groundedPill}>GROUNDED IN YOUR DATA</span>
        </div>
        <div style={{ fontSize: 13, color: colors.ink3, marginLeft: 42 }}>
          Plans, projections, and what-ifs — based strictly on your transactions, income, and budgets. Never general advice.
        </div>

        {/* Search bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!question.trim()) return
            send(question)
          }}
          style={styles.searchBar}
        >
          <Icon.search color={colors.ink3} size={16} />
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={
              listening
                ? 'Listening… speak your question'
                : 'Can I afford a PS5 in July without dipping into savings?'
            }
            style={styles.searchInput}
            disabled={pending}
            autoFocus
          />
          {micSupported && (
            <button
              type="button"
              onClick={toggleMic}
              disabled={pending}
              style={{
                ...styles.micBtn,
                background: listening ? colors.accentSoft : 'transparent',
                borderColor: listening ? colors.accent : colors.line,
              }}
              title={listening ? 'Stop dictation' : 'Speak your question'}
              aria-pressed={listening}
            >
              <Icon.mic color={listening ? colors.accent : colors.ink3} size={16} />
            </button>
          )}
          <button
            type="submit"
            disabled={pending || !question.trim()}
            style={{
              ...styles.askBtn,
              opacity: pending || !question.trim() ? 0.55 : 1,
            }}
          >
            <Icon.sparkle color="#fff" size={12} />
            Ask
          </button>
        </form>

        {/* Body — summary or deep mode. */}
        {mode === 'summary' ? (
          <SummaryView
            pending={latestPair.pending}
            question={latestPair.question}
            response={latestPair.response}
            retry={latestPair.retry}
            onRetry={(q) => send(q)}
            onDiveDeeper={() => setMode('deep')}
            onTryAlso={(q) => send(q)}
            onAskNew={(q) => send(q)}
            sources={sources}
            currency={currency}
            locale={locale}
            hasAnyData={transactions.length > 0}
          />
        ) : (
          <DeepView
            thread={thread}
            currency={currency}
            locale={locale}
            onBackToSummary={() => setMode('summary')}
            onRetry={(q) => send(q)}
            threadEndRef={threadEndRef}
          />
        )}
      </div>
    </div>
  )
}

// \u2500\u2500\u2500 Summary view \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Default state. Renders a single rich answer card on the left and the
// Sources Used + Try Also rail on the right. The user can click "Dive
// deeper" on the answer to switch to thread mode for follow-ups.

function SummaryView({
  pending,
  question,
  response,
  retry,
  onRetry,
  onDiveDeeper,
  onTryAlso,
  onAskNew,
  sources,
  currency,
  locale,
  hasAnyData,
}: {
  pending: boolean
  question: string | null
  response: AskMurmurResponse | null
  retry: string | null
  onRetry: (q: string) => void
  onDiveDeeper: () => void
  onTryAlso: (q: string) => void
  onAskNew: (q: string) => void
  sources: Array<{ label: string; sub: string }>
  currency: string
  locale: string
  hasAnyData: boolean
}) {
  // Empty state: no question yet.
  if (!question && !pending && !response && !retry) {
    return (
      <div style={styles.emptyGrid}>
        <div style={styles.emptyCard}>
          <MurmurMark size={32} variant="sage" rounded />
          <div style={{ fontFamily: font.serif, fontSize: 22, color: colors.ink, fontWeight: 500, lineHeight: 1.4, letterSpacing: -0.3, marginTop: 12 }}>
            {hasAnyData
              ? 'Ask anything. The answer is grounded in your transactions — not general advice.'
              : 'Log a few transactions on mobile, then come back here — Murmur reads only your own data.'}
          </div>
          <div style={{ fontSize: 13, color: colors.ink3, marginTop: 12 }}>
            Try one of these to start:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => onAskNew(s)} style={styles.suggestionRow}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <SourcesPanel sources={sources} />
      </div>
    )
  }

  return (
    <div style={styles.answerGrid}>
      <div style={styles.answerCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: colors.accent }} />
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
            Murmur's read
          </div>
        </div>
        {question && (
          <div style={styles.questionLine}>
            {question}
          </div>
        )}
        {pending && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
            <ThinkingDots />
            <span style={{ fontFamily: font.sans, fontSize: 13, color: colors.ink3 }}>
              Thinking through your data…
            </span>
          </div>
        )}
        {retry && !pending && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <button onClick={() => onRetry(retry)} style={styles.retryPill}>
              Tap to try again
            </button>
          </div>
        )}
        {response && !pending && (
          <>
            <div
              style={{
                fontFamily: font.serif,
                fontSize: 22,
                lineHeight: 1.4,
                fontWeight: 500,
                letterSpacing: -0.3,
                color:
                  response.verdict.sentiment === 'positive'
                    ? colors.accent
                    : response.verdict.sentiment === 'negative'
                      ? '#A94646'
                      : colors.ink,
              }}
              dangerouslySetInnerHTML={{ __html: sanitize(response.verdict.text) }}
            />
            {response.chart && (
              <div style={{ marginTop: 18, padding: 14, background: colors.surface2, borderRadius: 10, border: `0.5px solid ${colors.line}` }}>
                <AskChart chart={response.chart} currency={currency} locale={locale} />
              </div>
            )}
            {response.breakdown && (
              <div style={{ marginTop: 18 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: colors.ink3,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    fontFamily: font.sans,
                    marginBottom: 10,
                  }}
                >
                  How I got there
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {response.breakdown.rows.map((r, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 0',
                        borderTop: r.accent ? `1px solid ${colors.line}` : 'none',
                      }}
                    >
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          background: r.accent ? colors.accent : colors.surface2,
                          color: r.accent ? '#fff' : colors.ink3,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 13,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {r.accent ? '=' : '·'}
                      </div>
                      <div style={{ flex: 1, fontSize: 13, color: colors.ink2, lineHeight: 1.45 }}>
                        {r.label}
                      </div>
                      <div
                        style={{
                          fontFamily: font.display,
                          fontSize: r.accent ? 16 : 14,
                          fontWeight: 700,
                          color: r.muted ? colors.ink4 : r.accent ? colors.ink : colors.ink2,
                          fontVariantNumeric: 'tabular-nums',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {r.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {response.note && (
              <div style={styles.noteCard}>
                <Icon.sparkle color={colors.accent} size={14} />
                <div>{response.note.text}</div>
              </div>
            )}
            <div style={{ fontSize: 11, color: colors.ink4, marginTop: 14, fontFamily: font.sans }}>
              Read from {response.attribution.transaction_count} transaction
              {response.attribution.transaction_count === 1 ? '' : 's'}.
            </div>
            <button onClick={onDiveDeeper} style={styles.diveDeeper}>
              <Icon.recurring color={colors.accent} size={12} />
              Dive deeper
            </button>
          </>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SourcesPanel sources={sources} />
        <TryAlsoPanel onPick={onTryAlso} />
      </div>
    </div>
  )
}

function SourcesPanel({ sources }: { sources: Array<{ label: string; sub: string }> }) {
  return (
    <div style={styles.sidePanel}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: colors.ink3,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          fontFamily: font.sans,
          marginBottom: 10,
        }}
      >
        Sources used
      </div>
      {sources.map((s, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 0',
            borderTop: i === 0 ? 'none' : `0.5px solid ${colors.line}`,
          }}
        >
          <span style={{ fontSize: 12, color: colors.ink2, fontWeight: 600, fontFamily: font.sans }}>
            {s.label}
          </span>
          <span style={{ fontSize: 11, color: colors.ink4, fontFamily: font.sans }}>{s.sub}</span>
        </div>
      ))}
    </div>
  )
}

function TryAlsoPanel({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div style={styles.darkPanel}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.6)',
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          fontFamily: font.sans,
          marginBottom: 10,
        }}
      >
        Try also
      </div>
      {SUGGESTIONS.map((q, i) => (
        <button
          key={i}
          onClick={() => onPick(q)}
          style={{
            ...styles.tryAlsoRow,
            borderTop: i === 0 ? 'none' : '0.5px solid rgba(255,255,255,0.12)',
          }}
        >
          {q}
        </button>
      ))}
    </div>
  )
}

// \u2500\u2500\u2500 Deep view \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Full conversation thread for follow-ups. The user opted in via "Dive
// deeper". Composer slides in at the bottom; "Back to summary" returns
// the user to the showcase view (showing the current latest answer).

function DeepView({
  thread,
  currency,
  locale,
  onBackToSummary,
  onRetry,
  threadEndRef,
}: {
  thread: ThreadTurn[]
  currency: string
  locale: string
  onBackToSummary: () => void
  onRetry: (q: string) => void
  threadEndRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <div style={styles.deepCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
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
          Conversation
        </div>
        <button onClick={onBackToSummary} style={styles.backToSummary}>
          ← Back to summary
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {thread.map((t) => {
          if (t.role === 'user') {
            return (
              <div key={t.id} style={styles.userBubble}>
                {t.question}
              </div>
            )
          }
          if (t.role === 'pending') {
            return (
              <div key={t.id} style={styles.assistantWrap}>
                <MurmurMark size={28} variant="sage" rounded animating />
                <div style={styles.pending}>
                  <ThinkingDots />
                  <span>{'Thinking through your data…'}</span>
                </div>
              </div>
            )
          }
          if (t.role === 'retry') {
            return (
              <div key={t.id} style={styles.assistantWrap}>
                <MurmurMark size={28} variant="sage" rounded />
                <button onClick={() => onRetry(t.question)} style={styles.retryPill}>
                  Tap to try again
                </button>
              </div>
            )
          }
          const r = t.response
          return (
            <div key={t.id} style={styles.assistantWrap}>
              <MurmurMark size={28} variant="sage" rounded />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: font.serif,
                    fontSize: 19,
                    fontWeight: 500,
                    lineHeight: 1.4,
                    color:
                      r.verdict.sentiment === 'positive'
                        ? colors.accent
                        : r.verdict.sentiment === 'negative'
                          ? '#A94646'
                          : colors.ink,
                  }}
                  dangerouslySetInnerHTML={{ __html: sanitize(r.verdict.text) }}
                />
                {r.breakdown && (
                  <div style={styles.breakdown}>
                    <div style={styles.eyebrow}>{r.breakdown.caption}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {r.breakdown.rows.map((row, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontFamily: font.sans,
                          }}
                        >
                          <span style={{ fontSize: 13, color: row.muted ? colors.ink4 : colors.ink2 }}>
                            {row.label}
                          </span>
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              fontVariantNumeric: 'tabular-nums',
                              color: row.accent ? colors.accent : row.muted ? colors.ink4 : colors.ink,
                            }}
                          >
                            {row.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {r.chart && <AskChart chart={r.chart} currency={currency} locale={locale} />}
                {r.note && (
                  <div style={styles.noteCard}>
                    <Icon.sparkle color={colors.accent} size={14} />
                    <div>{r.note.text}</div>
                  </div>
                )}
                <div style={{ fontSize: 11, color: colors.ink4, fontFamily: font.sans }}>
                  Read from {r.attribution.transaction_count} transaction
                  {r.attribution.transaction_count === 1 ? '' : 's'}.
                </div>
              </div>
            </div>
          )
        })}
        <div ref={threadEndRef} />
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  content: {
    padding: '0 20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    flex: 1,
  },
  brandTile: {
    width: 32,
    height: 32,
    borderRadius: 10,
    background: colors.accent,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groundedPill: {
    fontFamily: font.sans,
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 0.6,
    background: colors.accentSoft,
    color: colors.accent,
    padding: '3px 8px',
    borderRadius: 6,
    textTransform: 'uppercase' as const,
  },
  searchBar: {
    background: '#fff',
    borderRadius: 14,
    border: `0.5px solid ${colors.line}`,
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  },
  searchInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontFamily: font.sans,
    fontSize: 15,
    color: colors.ink,
    fontWeight: 500,
    minWidth: 0,
    padding: 0,
  },
  micBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: `0.5px solid ${colors.line}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },
  askBtn: {
    padding: '7px 14px',
    background: colors.accent,
    color: '#fff',
    borderRadius: 8,
    border: 'none',
    fontFamily: font.sans,
    fontSize: 12,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
    flexShrink: 0,
  },

  // \u2500\u2500\u2500 Summary view \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  answerGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 320px',
    gap: 14,
    minHeight: 470,
  },
  emptyGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 320px',
    gap: 14,
    minHeight: 360,
  },
  answerCard: {
    background: '#fff',
    borderRadius: 16,
    border: `0.5px solid ${colors.line}`,
    padding: 22,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: font.sans,
  },
  emptyCard: {
    background: '#fff',
    borderRadius: 16,
    border: `0.5px solid ${colors.line}`,
    padding: 22,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: font.sans,
  },
  questionLine: {
    fontSize: 13,
    color: colors.ink3,
    marginBottom: 12,
    fontStyle: 'italic',
    fontFamily: font.sans,
  },
  diveDeeper: {
    alignSelf: 'flex-start',
    marginTop: 18,
    padding: '8px 14px',
    background: colors.accentSoft,
    color: colors.accent,
    border: 'none',
    borderRadius: 999,
    fontFamily: font.sans,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  retryPill: {
    fontFamily: font.sans,
    fontSize: 13,
    fontWeight: 600,
    color: colors.accent,
    background: colors.accentSoft,
    border: 'none',
    padding: '8px 14px',
    borderRadius: 999,
    cursor: 'pointer',
  },
  noteCard: {
    background: colors.accentSoft,
    borderRadius: radius.lg,
    padding: '12px 14px',
    fontFamily: font.sans,
    fontSize: 13,
    color: colors.ink2,
    lineHeight: 1.5,
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
    marginTop: 12,
  },
  sidePanel: {
    background: '#fff',
    borderRadius: 14,
    border: `0.5px solid ${colors.line}`,
    padding: 16,
    fontFamily: font.sans,
  },
  darkPanel: {
    background: colors.ink,
    borderRadius: 14,
    padding: 16,
    color: '#fff',
    fontFamily: font.sans,
  },
  tryAlsoRow: {
    display: 'block',
    width: '100%',
    textAlign: 'left' as const,
    padding: '10px 0',
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: font.sans,
  },
  suggestionRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 14px',
    background: colors.surface2,
    border: `0.5px solid ${colors.line}`,
    borderRadius: 10,
    fontFamily: font.sans,
    fontSize: 13,
    color: colors.ink2,
    fontWeight: 500,
    cursor: 'pointer',
    textAlign: 'left' as const,
  },

  // \u2500\u2500\u2500 Deep view \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  deepCard: {
    background: '#fff',
    borderRadius: 16,
    border: `0.5px solid ${colors.line}`,
    padding: 22,
    fontFamily: font.sans,
  },
  backToSummary: {
    padding: '6px 12px',
    background: 'transparent',
    border: `0.5px solid ${colors.line}`,
    borderRadius: radius.md,
    fontFamily: font.sans,
    fontSize: 12,
    fontWeight: 600,
    color: colors.ink2,
    cursor: 'pointer',
  },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '75%',
    background: colors.accent,
    color: '#fff',
    padding: '10px 14px',
    borderRadius: 18,
    borderBottomRightRadius: 6,
    fontFamily: font.sans,
    fontSize: 14,
    lineHeight: 1.45,
    fontWeight: 500,
    whiteSpace: 'pre-wrap',
  },
  assistantWrap: {
    display: 'flex',
    gap: 12,
    alignItems: 'flex-start',
    maxWidth: '90%',
  },
  pending: {
    fontFamily: font.sans,
    fontSize: 13,
    color: colors.ink3,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
  },
  breakdown: {
    background: colors.card,
    border: `0.5px solid ${colors.line}`,
    borderRadius: radius.lg,
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
    color: colors.ink3,
    fontFamily: font.sans,
  },

  // \u2500\u2500\u2500 Toolbar.right (history + new) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  newConv: {
    padding: '6px 12px',
    background: 'transparent',
    border: `0.5px solid ${colors.line}`,
    borderRadius: radius.md,
    fontFamily: font.sans,
    fontSize: 12,
    fontWeight: 600,
    color: colors.ink2,
    cursor: 'pointer',
  },
  historyBtn: {
    padding: '6px 12px',
    background: 'transparent',
    border: `0.5px solid ${colors.line}`,
    borderRadius: radius.md,
    fontFamily: font.sans,
    fontSize: 12,
    fontWeight: 600,
    color: colors.ink2,
    cursor: 'pointer',
  },
  historyMenu: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    right: 0,
    width: 320,
    maxHeight: 420,
    overflowY: 'auto',
    background: colors.card,
    border: `0.5px solid ${colors.line}`,
    borderRadius: radius.lg,
    boxShadow: '0 12px 40px rgba(40,36,28,0.10)',
    padding: 4,
    zIndex: 10,
  },
  historyItem: {
    display: 'flex',
    alignItems: 'center',
    borderRadius: radius.md,
  },
  historyItemMain: {
    flex: 1,
    minWidth: 0,
    background: 'transparent',
    border: 'none',
    textAlign: 'left' as const,
    padding: '10px 12px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  historyTitle: {
    fontFamily: font.sans,
    fontSize: 13,
    fontWeight: 600,
    color: colors.ink,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  historyMeta: {
    fontFamily: font.sans,
    fontSize: 11,
    color: colors.ink3,
  },
  historyDelete: {
    width: 28,
    height: 28,
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    color: colors.ink4,
    fontSize: 18,
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
    marginRight: 4,
    lineHeight: 1,
  },
}
