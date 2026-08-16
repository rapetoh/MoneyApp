'use client'
import { useState, useEffect, useRef, useCallback, useMemo, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase/client'
import { colors, font, radius } from '../../../lib/theme'
import { Toolbar } from '../../../components/Toolbar'
import { MurmurMark } from '../../../components/MurmurMark'
import { Icon } from '../../../components/Icons'
import { PaywallGate } from '../../../components/PaywallGate'
import { ErrorState } from '../../../components/ErrorState'
import { AskReplyBody } from '../../../components/AskReplyBody'
import { usePlus } from '../../../lib/plus'
import {
  addDays,
  civilDateTimeToInstant,
  localParts,
  daysBetween,
  budgetStatus,
  resolveCategoryKind,
  computeAskInsights,
  askIntentChips,
  askActionLabel,
  resumeCandidate,
  listConversations,
  loadConversation,
  softDeleteConversation,
  replyFromStored,
  t,
  type AskConversationRow,
  type AskMessageRow,
} from '@voice-expense/shared'
import type {
  AskAction,
  AskInsight,
  AskMurmurBudget,
  AskMurmurRecurringRuleV2,
  AskMurmurTransaction,
  AskReply,
  AskTurnRequest,
  AskTurnResponse,
  Budget,
  BudgetStatusTransaction,
  Category,
  CategoryKind,
  Locale,
  RecurringRule,
  Transaction,
} from '@voice-expense/shared'

/**
 * Ask Murmur — desktop/web (docs/ask-murmur/SPEC.md §5.2).
 *
 * One conversation view: a rail of past conversations on the left, the
 * thread on the right with the composer pinned at the bottom. A new thread
 * opens with Murmur speaking first — ranked insights computed here from the
 * user's own data — then intent chips. The server owns the conversation
 * (POST /api/ai/ask-murmur/turn); this page reads threads back through
 * Supabase and resumes the most recent one if it is < 12 h old. Mirrors
 * apps/mobile/app/more/ask.tsx.
 */

type LocalMessage =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; reply: AskReply }
  | { id: string; role: 'pending' }
  | { id: string; role: 'error'; text: string; seed: AskInsight | null; kind: 'busy' | 'failed' }

let localId = 0
const nextId = (p: string) => `${p}-${++localId}-${Date.now()}`

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

function daysAgoInstant(nowIso: string, tz: string, nDays: number): string {
  const { y, m, d } = localParts(nowIso, tz)
  const past = addDays(y, m, d, -nDays)
  return civilDateTimeToInstant(past.y, past.m, past.d, 0, 0, 0, tz)
}

// Minimal Web Speech API typing.
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
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export default function AskMurmurPage() {
  const supabase = createClient()
  const router = useRouter()
  const { isPlus } = usePlus()
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<{ currency_code?: string; locale?: Locale; monthly_income?: number | null; timezone?: string } | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [rules, setRules] = useState<RecurringRule[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<AskConversationRow[]>([])
  const [messages, setMessages] = useState<LocalMessage[]>([])
  const [draft, setDraft] = useState('')
  const threadEndRef = useRef<HTMLDivElement | null>(null)
  const conversationIdRef = useRef<string | null>(null)
  conversationIdRef.current = conversationId

  const [micSupported, setMicSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  const locale = (profile?.locale ?? 'en') as Locale
  const currency = profile?.currency_code ?? 'USD'
  const tz = profile?.timezone || 'UTC'

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return
    setUserId(user.id)
    const [p, tx, r, c, b] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('transactions').select('*').eq('user_id', user.id).eq('is_deleted', false).order('transacted_at', { ascending: false }),
      supabase.from('recurring_rules').select('*').eq('user_id', user.id),
      supabase.from('categories').select('*').eq('user_id', user.id).eq('is_archived', false),
      supabase.from('budgets').select('*').eq('user_id', user.id).eq('is_active', true),
    ])
    setProfile(p.data ? { currency_code: p.data.currency_code, locale: p.data.locale as Locale, monthly_income: p.data.monthly_income, timezone: p.data.timezone } : null)
    const failure = p.error ?? tx.error ?? r.error ?? c.error
    setLoadError(failure ? failure.message : null)
    if (!tx.error) setTransactions((tx.data ?? []) as Transaction[])
    if (!r.error) setRules((r.data ?? []) as RecurringRule[])
    if (!c.error) setCategories((c.data ?? []) as Category[])
    if (!b.error) setBudgets((b.data ?? []) as Budget[])
    try {
      const [convs, resume] = await Promise.all([listConversations(supabase, user.id, 30), resumeCandidate(supabase, user.id)])
      setConversations(convs)
      if (resume) {
        setConversationId(resume.conversation.id)
        setMessages(messagesFromRows(resume.messages))
      }
    } catch (err) {
      console.warn('[ask] history load failed:', err)
    }
  }, [])

  useEffect(() => {
    const SR = getSpeechRecognitionCtor()
    if (SR) {
      const rec = new SR() as SpeechRecognitionLike
      rec.continuous = false
      rec.interimResults = true
      rec.onresult = (event) => {
        let transcript = ''
        for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript
        if (transcript.trim()) setDraft(transcript)
      }
      rec.onend = () => setListening(false)
      rec.onerror = () => setListening(false)
      recognitionRef.current = rec
      setMicSupported(true)
    }
    load()
  }, [])

  useEffect(() => {
    const rec = recognitionRef.current
    if (!rec) return
    const map: Record<string, string> = { en: 'en-US', fr: 'fr-FR', es: 'es-ES', pt: 'pt-BR' }
    rec.lang = map[locale] ?? 'en-US'
  }, [locale])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  function toggleMic() {
    const rec = recognitionRef.current
    if (!rec) return
    if (listening) {
      rec.stop()
      return
    }
    setDraft('')
    try {
      rec.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }

  // ─── Data snapshot (wire shape) — the same rows the server's tools sum
  //     and the input of the insight engine.
  const snapshot = useMemo(() => {
    const nowIso = new Date().toISOString()
    const cutoffIso = daysAgoInstant(nowIso, tz, 366)
    const catById = new Map<string, string>()
    for (const c of categories) catById.set(c.id, c.name)
    const wireTxns: AskMurmurTransaction[] = transactions
      .filter((x) => !x.is_deleted && x.transacted_at >= cutoffIso)
      .sort((a, b) => a.transacted_at.localeCompare(b.transacted_at))
      .slice(-2000)
      .map((x) => ({
        amount: x.amount,
        amount_in_profile_currency: x.amount_in_profile_currency ?? null,
        direction: x.direction,
        merchant: x.merchant ?? null,
        category_name: x.category_id ? (catById.get(x.category_id) ?? null) : null,
        transacted_at: x.transacted_at,
        is_recurring: !!x.is_recurring,
      }))
    const wireRules: Array<AskMurmurRecurringRuleV2 & { amount_in_profile_currency?: number | null; is_active?: boolean }> = rules
      .filter((r) => r.is_active && !r.is_deleted)
      .map((r) => ({
        id: r.id,
        name: r.name ?? null,
        amount: r.amount,
        amount_in_profile_currency: r.amount_in_profile_currency ?? null,
        direction: r.direction,
        frequency: r.frequency,
        category_name: r.category_id ? (catById.get(r.category_id) ?? null) : null,
        interval: r.interval,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        anchor_day: r.anchor_day,
        anchor_weekday: r.anchor_weekday,
        anchor_time: r.anchor_time,
        is_active: r.is_active,
      }))
    // Overall budget as the Budgets page computes it.
    let budget: AskMurmurBudget | null = null
    const overall = budgets.find((x) => x.category_id === null && x.period === 'monthly') ?? budgets.find((x) => x.category_id === null)
    if (overall) {
      const catKind = new Map(categories.map((c) => [c.id, resolveCategoryKind(c.name, c.kind as CategoryKind | null)]))
      const txnsForStatus: BudgetStatusTransaction[] = transactions.map((x) => ({
        amount_in_profile_currency: x.amount_in_profile_currency,
        direction: x.direction,
        transacted_at: x.transacted_at,
        category_id: x.category_id,
        category_kind: x.category_id ? (catKind.get(x.category_id) ?? null) : null,
        recurring_rule_id: x.recurring_rule_id,
      }))
      const status = budgetStatus(
        { period: overall.period, starts_at: overall.starts_at, category_id: null, currency_code: overall.currency_code, amount: overall.amount },
        txnsForStatus,
        rules,
        tz,
      )
      if (status) {
        const now = localParts(nowIso, tz)
        const end = localParts(status.window.endExclusive, tz)
        budget = {
          amount: overall.amount,
          currency: overall.currency_code,
          period: overall.period,
          category_name: null,
          period_start: status.window.start,
          period_end: status.window.endExclusive,
          spent: status.spent,
          committed: status.committed,
          remaining: status.remaining,
          days_left: Math.max(1, daysBetween(now.y, now.m, now.d, end.y, end.m, end.d)),
        }
      }
    }
    return { nowIso, wireTxns, wireRules, budget }
  }, [transactions, rules, categories, budgets, tz])

  const insights = useMemo<AskInsight[]>(
    () =>
      computeAskInsights({
        transactions: snapshot.wireTxns,
        rules: snapshot.wireRules,
        budget: snapshot.budget,
        monthly_income: profile?.monthly_income ?? null,
        now_utc: snapshot.nowIso,
        time_zone: tz,
        currency,
        locale,
      }),
    [snapshot, profile?.monthly_income, tz, currency, locale],
  )
  const intents = useMemo(() => askIntentChips(locale), [locale])

  function buildRequest(message: string, seed: AskInsight | null): AskTurnRequest {
    return {
      conversation_id: conversationIdRef.current,
      message,
      seed_insight: seed ? { kind: seed.kind, title: seed.title, detail: seed.detail } : null,
      locale,
      currency,
      now_utc: new Date().toISOString(),
      time_zone: tz,
      monthly_income: profile?.monthly_income ?? null,
      transactions: snapshot.wireTxns,
      recurring_rules: snapshot.wireRules.map(({ amount_in_profile_currency: _a, is_active: _b, ...rest }) => rest),
      ...(snapshot.budget ? { budget: snapshot.budget } : {}),
    }
  }

  const anyPending = messages.some((m) => m.role === 'pending')

  async function send(text: string, seed: AskInsight | null = null, reuseUserBubble = false) {
    const trimmed = text.trim()
    if (!userId || !trimmed || anyPending) return
    setDraft('')
    const userMsgId = nextId('u')
    const pendingId = nextId('p')
    setMessages((prev) => [
      ...prev.filter((m) => m.role !== 'error'),
      ...(reuseUserBubble ? [] : [{ id: userMsgId, role: 'user', text: trimmed } as LocalMessage]),
      { id: pendingId, role: 'pending' },
    ])
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) throw new Error('Not signed in')
      const res = await fetch('/api/ai/ask-murmur/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(buildRequest(trimmed, seed)),
      })
      if (!res.ok) {
        const kind: 'busy' | 'failed' = res.status === 429 || res.status === 503 ? 'busy' : 'failed'
        if (res.status === 404) setConversationId(null)
        setMessages((prev) => prev.map((m) => (m.id === pendingId ? { id: pendingId, role: 'error', text: trimmed, seed, kind } : m)))
        return
      }
      const data = (await res.json()) as AskTurnResponse
      const isNew = !conversationIdRef.current
      if (data.conversation_id) setConversationId(data.conversation_id)
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === userMsgId && data.user_message_id) return { ...m, id: data.user_message_id }
          if (m.id === pendingId) return { id: data.message.id ?? pendingId, role: 'assistant', reply: data.message.reply }
          return m
        }),
      )
      if (isNew && data.conversation_id) {
        setConversations((prev) => [
          { id: data.conversation_id, user_id: userId, title: trimmed.slice(0, 60), started_at: data.message.created_at, last_message_at: data.message.created_at, is_deleted: false, created_at: data.message.created_at, updated_at: data.message.created_at },
          ...prev,
        ])
      } else if (data.conversation_id) {
        setConversations((prev) => prev.map((c) => (c.id === data.conversation_id ? { ...c, last_message_at: data.message.created_at } : c)))
      }
    } catch (e) {
      console.error('[ask] turn failed:', e)
      setMessages((prev) => prev.map((m) => (m.id === pendingId ? { id: pendingId, role: 'error', text: trimmed, seed, kind: 'failed' } : m)))
    }
  }

  function startNew() {
    setConversationId(null)
    setMessages([])
    setDraft('')
  }

  async function openConversation(id: string) {
    if (id === conversationId) return
    try {
      const thread = await loadConversation(supabase, id)
      if (!thread) return
      setConversationId(thread.conversation.id)
      setMessages(messagesFromRows(thread.messages))
    } catch (err) {
      console.warn('[ask] open failed:', err)
    }
  }

  async function deleteConversation(id: string) {
    try {
      await softDeleteConversation(supabase, id)
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (id === conversationId) startNew()
    } catch (err) {
      console.warn('[ask] delete failed:', err)
    }
  }

  function performAction(action: AskAction) {
    const p = action.params ?? {}
    switch (action.intent) {
      case 'show_transactions': {
        const qs = new URLSearchParams()
        const q = p.query ?? p.merchant ?? p.category_name ?? ''
        if (q) qs.set('q', q)
        if (p.month && /^\d{4}-\d{2}$/.test(p.month)) qs.set('month', p.month)
        router.push(`/dashboard/transactions${qs.toString() ? `?${qs}` : ''}`)
        return
      }
      case 'set_budget': {
        const qs = new URLSearchParams({ edit: '1' })
        if (p.amount) qs.set('amount', p.amount)
        router.push(`/dashboard/budgets?${qs}`)
        return
      }
      case 'open_recurring':
        router.push('/dashboard/recurring')
        return
      case 'create_rule':
        router.push('/dashboard/recurring?new=1')
        return
      case 'log_expense':
        router.push('/dashboard/transactions?new=1')
        return
    }
  }

  if (!isPlus) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Toolbar title="Ask Murmur" />
        <div style={{ padding: '0 24px 24px' }}>
          <PaywallGate feature="Ask Murmur" title="An assistant that already watches your money." body="Insights before you ask, and answers grounded in your own transactions, bills and budget." />
        </div>
      </div>
    )
  }

  const showEntry = messages.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Toolbar
        title="Ask Murmur"
        right={
          !showEntry ? (
            <button type="button" onClick={startNew} style={styles.newBtn}>
              <Icon.plus color={colors.ink2} size={13} />
              {t('ask.new_conversation', locale)}
            </button>
          ) : undefined
        }
      />
      <div style={styles.body}>
        {/* Left rail — conversations */}
        <aside style={styles.rail}>
          <button type="button" onClick={startNew} style={{ ...styles.railNew, opacity: showEntry ? 0.6 : 1 }} disabled={showEntry}>
            <Icon.plus color="#fff" size={13} />
            {t('ask.new_conversation', locale)}
          </button>
          <div style={styles.railEyebrow}>{t('ask.history', locale)}</div>
          {conversations.length === 0 ? (
            <div style={styles.railEmpty}>{t('ask.history_empty', locale)}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', minHeight: 0 }}>
              {conversations.map((c) => {
                const active = c.id === conversationId
                return (
                  <div key={c.id} style={{ ...styles.railItem, background: active ? colors.accentSoft : 'transparent' }}>
                    <button type="button" onClick={() => openConversation(c.id)} style={styles.railItemMain} title={c.title ?? ''}>
                      <div style={{ ...styles.railTitle, color: active ? colors.accent : colors.ink }}>{c.title ?? '…'}</div>
                      <div style={styles.railMeta}>{formatWhen(c.last_message_at, locale)}</div>
                    </button>
                    <button type="button" onClick={() => deleteConversation(c.id)} style={styles.railDelete} title={t('ask.delete', locale)} aria-label={t('ask.delete', locale)}>
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </aside>

        {/* Main — thread + composer */}
        <section style={styles.main}>
          {loadError && (
            <ErrorState compact message="We couldn't load your data. Ask Murmur may be missing context." detail={loadError} onRetry={load} />
          )}
          <div style={styles.thread}>
            {showEntry ? (
              <EntryState locale={locale} insights={insights} intents={intents} onAskInsight={(i) => send(i.question, i)} onInsightAction={performAction} onIntent={(q) => send(q)} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 760 }}>
                {messages.map((m) => {
                  if (m.role === 'user') {
                    return (
                      <div key={m.id} style={styles.userBubble}>
                        {m.text}
                      </div>
                    )
                  }
                  if (m.role === 'pending') {
                    return (
                      <div key={m.id} style={styles.assistantWrap}>
                        <MurmurMark size={28} variant="sage" rounded animating />
                        <div style={styles.thinking}>{t('ask.thinking', locale)}</div>
                      </div>
                    )
                  }
                  if (m.role === 'error') {
                    return (
                      <div key={m.id} style={styles.assistantWrap}>
                        <MurmurMark size={28} variant="sage" rounded />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ fontSize: 14, color: colors.ink2 }}>{t(m.kind === 'busy' ? 'ask.busy' : 'ask.error', locale)}</div>
                          <button
                            type="button"
                            onClick={() => {
                              setMessages((prev) => prev.filter((x) => x.id !== m.id))
                              void send(m.text, m.seed, true)
                            }}
                            style={styles.retryPill}
                          >
                            {t('ask.retry', locale)}
                          </button>
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div key={m.id} style={styles.assistantWrap}>
                      <MurmurMark size={28} variant="sage" rounded />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <AskReplyBody reply={m.reply} locale={locale} currency={currency} onAction={performAction} />
                      </div>
                    </div>
                  )
                })}
                <div ref={threadEndRef} />
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void send(draft)
            }}
            style={styles.composer}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={listening ? 'Listening…' : t(showEntry ? 'ask.composer_placeholder' : 'ask.followup_placeholder', locale)}
              style={styles.composerInput}
              disabled={anyPending}
              maxLength={1000}
              autoFocus
            />
            {micSupported && (
              <button type="button" onClick={toggleMic} disabled={anyPending} style={{ ...styles.micBtn, background: listening ? colors.accentSoft : 'transparent', borderColor: listening ? colors.accent : colors.line }} title={listening ? 'Stop dictation' : 'Speak your question'} aria-pressed={listening}>
                <Icon.mic color={listening ? colors.accent : colors.ink3} size={16} />
              </button>
            )}
            <button type="submit" disabled={anyPending || !draft.trim()} style={{ ...styles.sendBtn, opacity: anyPending || !draft.trim() ? 0.5 : 1 }} aria-label={t('ask.send_label', locale)}>
              <Icon.send color="#fff" size={14} />
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}

// ─── Entry state ────────────────────────────────────────────────────────────

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
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <MurmurMark size={40} variant="cream" rounded />
        <div style={{ fontFamily: font.serif, fontSize: 22, color: colors.ink, fontWeight: 500, letterSpacing: -0.4, lineHeight: 1.3 }}>{t('ask.entry_lead', locale)}</div>
      </div>
      <div style={styles.eyebrow}>{t('ask.today_eyebrow', locale)}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {insights.map((ins) => (
          <InsightCard key={ins.id} insight={ins} locale={locale} onAsk={() => onAskInsight(ins)} onAction={onInsightAction} />
        ))}
      </div>
      <div style={{ ...styles.eyebrow, marginTop: 22 }}>{t('ask.intent_eyebrow', locale)}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {intents.map((it) => (
          <button key={it.id} type="button" onClick={() => onIntent(it.question)} style={styles.intentChip}>
            {it.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function InsightCard({ insight, locale, onAsk, onAction }: { insight: AskInsight; locale: Locale; onAsk: () => void; onAction: (a: AskAction) => void }) {
  const stripe = insight.tone === 'alert' ? '#C8685E' : insight.tone === 'watch' ? '#C89B3C' : insight.tone === 'good' ? colors.accent : colors.ink4
  return (
    <div style={styles.insightCard}>
      <div style={{ width: 4, background: stripe, flexShrink: 0 }} />
      <button type="button" onClick={onAsk} style={styles.insightMain}>
        <div style={{ fontFamily: font.serif, fontSize: 17, color: colors.ink, letterSpacing: -0.2, lineHeight: 1.3 }}>{insight.title}</div>
        <div style={{ fontSize: 13.5, color: colors.ink3, marginTop: 4, lineHeight: 1.4 }}>{insight.detail}</div>
        <div style={{ fontSize: 12.5, color: colors.ink3, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon.sparkle color={colors.ink4} size={11} />
          {insight.question}
        </div>
      </button>
      {insight.action && (
        <div style={{ display: 'flex', alignItems: 'center', paddingRight: 14 }}>
          <button type="button" onClick={() => onAction(insight.action as AskAction)} style={styles.insightAction}>
            {askActionLabel(insight.action, locale)}
          </button>
        </div>
      )}
    </div>
  )
}

function formatWhen(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  } catch {
    return iso.slice(0, 16)
  }
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles: Record<string, CSSProperties> = {
  body: { display: 'grid', gridTemplateColumns: '240px minmax(0, 1fr)', flex: 1, minHeight: 0, gap: 0 },
  rail: { borderRight: `0.5px solid ${colors.line}`, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, background: colors.bg },
  railNew: { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: radius.lg, border: 'none', background: colors.ink, color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: font.sans, cursor: 'pointer' },
  railEyebrow: { fontSize: 11, fontWeight: 700, color: colors.ink3, letterSpacing: 0.6, textTransform: 'uppercase', fontFamily: font.sans, marginTop: 8, padding: '0 4px' },
  railEmpty: { fontSize: 13, color: colors.ink4, padding: '4px' },
  railItem: { display: 'flex', alignItems: 'center', borderRadius: radius.md },
  railItemMain: { flex: 1, minWidth: 0, textAlign: 'left', padding: '8px 10px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: font.sans },
  railTitle: { fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  railMeta: { fontSize: 11, color: colors.ink4, marginTop: 2 },
  railDelete: { border: 'none', background: 'transparent', color: colors.ink4, fontSize: 16, cursor: 'pointer', padding: '4px 8px' },
  main: { display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 },
  thread: { flex: 1, overflowY: 'auto', padding: '20px 24px' },
  eyebrow: { fontSize: 11, fontWeight: 700, color: colors.ink3, letterSpacing: 0.6, textTransform: 'uppercase', fontFamily: font.sans, marginBottom: 10 },
  insightCard: { display: 'flex', background: colors.card, border: `0.5px solid ${colors.line}`, borderRadius: radius.xl, overflow: 'hidden' },
  insightMain: { flex: 1, minWidth: 0, textAlign: 'left', padding: '12px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: font.sans },
  insightAction: { padding: '6px 10px', borderRadius: 999, border: 'none', background: colors.accentSoft, color: colors.accent, fontSize: 12, fontWeight: 700, fontFamily: font.sans, cursor: 'pointer', whiteSpace: 'nowrap' },
  intentChip: { padding: '9px 14px', borderRadius: 999, border: `0.5px solid rgba(40,36,28,0.16)`, background: colors.card, color: colors.ink, fontSize: 13.5, fontFamily: font.sans, cursor: 'pointer' },
  userBubble: { alignSelf: 'flex-end', maxWidth: '78%', background: colors.ink, color: '#fff', padding: '10px 14px', borderRadius: 18, borderBottomRightRadius: 6, fontSize: 14.5, lineHeight: 1.45, fontFamily: font.sans },
  assistantWrap: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  thinking: { fontFamily: font.sans, fontSize: 13, color: colors.ink3, padding: '6px 0' },
  retryPill: { alignSelf: 'flex-start', padding: '7px 12px', borderRadius: 999, border: 'none', background: colors.ink, color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: font.sans, cursor: 'pointer' },
  composer: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px 16px', borderTop: `0.5px solid ${colors.line}`, background: colors.bg },
  composerInput: { flex: 1, height: 44, borderRadius: 22, padding: '0 16px', border: `0.5px solid rgba(40,36,28,0.16)`, background: colors.card, fontSize: 14.5, fontFamily: font.sans, color: colors.ink, outline: 'none' },
  micBtn: { width: 40, height: 40, borderRadius: 20, border: `0.5px solid ${colors.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  sendBtn: { width: 44, height: 44, borderRadius: 22, border: 'none', background: colors.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  newBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, border: `0.5px solid ${colors.line}`, background: colors.card, color: colors.ink2, fontSize: 12.5, fontWeight: 600, fontFamily: font.sans, cursor: 'pointer' },
}
