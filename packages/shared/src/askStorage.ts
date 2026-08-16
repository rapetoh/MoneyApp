// Persistence for Ask Murmur conversations (docs/ask-murmur/SPEC.md §1.2, §2).
//
// Two Supabase tables (migration 007, unchanged by the rebuild):
//   ask_conversations: one row per thread — title (from the first question),
//                      last_message_at, soft delete.
//   ask_messages:      one row per turn — role='user' (question) or
//                      role='assistant' (response = AskReply, which carries
//                      `focus` — what the thread is about after that turn —
//                      and `computed`, the compact tool records of the turn).
// The thread's state is therefore its last assistant reply; nothing is
// denormalized onto the conversation row.
//
// RLS is pinned to auth.uid()=user_id on both, so every client reads its own
// threads directly, and the conversation route (apps/web/src/app/api/ai/
// ask-murmur/turn) writes with the caller's own JWT — nothing needs a
// service role.
//
// Who does what:
//   server (turn route) — createConversation / appendUserMessage /
//                         appendAssistantMessage
//   clients (mobile + web) — listConversations / loadConversation /
//                         loadMostRecentConversation / softDeleteConversation
//                         and `resumeCandidate` (the 12-hour resume rule)
//
// Assistant rows written before the rebuild hold the legacy
// `AskMurmurResponse` shape; `replyFromStored` converts them so old threads
// still render.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AskAction, AskBlock, AskMurmurResponse, AskReply } from './types/ai'

export interface AskConversationRow {
  id: string
  user_id: string
  title: string | null
  started_at: string
  last_message_at: string
  is_deleted: boolean
  created_at: string
  updated_at: string
}

export interface AskMessageRow {
  id: string
  conversation_id: string
  user_id: string
  role: 'user' | 'assistant'
  question: string | null
  /** AskReply (rebuild) or the legacy AskMurmurResponse (pre-Aug 16 rows). */
  response: AskReply | AskMurmurResponse | null
  created_at: string
}

/** Re-open the last thread only if it is this recent; otherwise Ask opens
 *  fresh (insights first) and the thread stays reachable from History. */
export const ASK_RESUME_WINDOW_MS = 12 * 60 * 60 * 1000

/** Auto-derive a short conversation title from the first user question. */
export function deriveTitle(question: string, max = 60): string {
  const trimmed = question.trim().replace(/\s+/g, ' ')
  if (trimmed.length <= max) return trimmed.replace(/[.!?]+$/, '')
  return trimmed.slice(0, max - 1).replace(/\s+\S*$/, '').replace(/[.!?]+$/, '') + '…'
}

// ─── Legacy → v2 ────────────────────────────────────────────────────────────

function isReply(r: AskReply | AskMurmurResponse): r is AskReply {
  return typeof (r as AskReply).text === 'string' && Array.isArray((r as AskReply).blocks)
}

/** Converts a legacy `AskMurmurResponse` (verdict/breakdown/chart/note) to
 *  the v2 reply shape so pre-rebuild threads render in the new thread UI. */
export function legacyResponseToReply(r: AskMurmurResponse): AskReply {
  const blocks: AskBlock[] = []
  if (r.breakdown && r.breakdown.rows.length > 0) {
    blocks.push({ type: 'rows', caption: r.breakdown.caption, rows: r.breakdown.rows })
  }
  if (r.chart) blocks.push({ type: 'chart', chart: r.chart })
  const text = r.note?.text ? `${r.verdict.text} ${r.note.text}` : r.verdict.text
  const actions: AskAction[] = []
  for (const a of r.actions ?? []) {
    if (a.intent === 'show_transactions' || a.intent === 'show_category') {
      actions.push({
        label: a.label,
        intent: 'show_transactions',
        params: a.params?.category_name ? { category_name: a.params.category_name } : a.params?.merchant ? { merchant: a.params.merchant } : undefined,
      })
    } else if (a.intent === 'set_budget') {
      actions.push({ label: a.label, intent: 'set_budget', params: a.params })
    }
  }
  return {
    text,
    sentiment: r.verdict.sentiment,
    blocks,
    actions,
    focus: null,
    out_of_scope: r.out_of_scope,
    transaction_count: r.attribution?.transaction_count ?? 0,
  }
}

/** The reply to render for a stored assistant row, whichever shape it holds. */
export function replyFromStored(response: AskReply | AskMurmurResponse | null | undefined): AskReply | null {
  if (!response || typeof response !== 'object') return null
  if (isReply(response)) return response
  if ((response as AskMurmurResponse).verdict) return legacyResponseToReply(response as AskMurmurResponse)
  return null
}

// ─── Reads (clients) ────────────────────────────────────────────────────────

export interface AskThread {
  conversation: AskConversationRow
  messages: AskMessageRow[]
}

async function loadMessages(supabase: SupabaseClient, conversationId: string): Promise<AskMessageRow[]> {
  const { data, error } = await supabase
    .from('ask_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`[ask-storage] loadMessages failed: ${error.message}`)
  return (data ?? []) as AskMessageRow[]
}

/** Most recent non-deleted conversation + all its messages, or null. Throws
 *  on a read failure so callers can tell "no history" from "couldn't load". */
export async function loadMostRecentConversation(
  supabase: SupabaseClient,
  userId: string,
): Promise<AskThread | null> {
  const { data, error } = await supabase
    .from('ask_conversations')
    .select('*')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .order('last_message_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(`[ask-storage] loadMostRecentConversation failed: ${error.message}`)
  if (!data || data.length === 0) return null
  const conversation = data[0] as AskConversationRow
  return { conversation, messages: await loadMessages(supabase, conversation.id) }
}

/** The thread to re-open on entry, or null when Ask should open fresh —
 *  §1.2: resume only if the last message is within `ASK_RESUME_WINDOW_MS`. */
export async function resumeCandidate(
  supabase: SupabaseClient,
  userId: string,
  nowMs: number = Date.now(),
): Promise<AskThread | null> {
  const recent = await loadMostRecentConversation(supabase, userId)
  if (!recent) return null
  const last = Date.parse(recent.conversation.last_message_at)
  if (!Number.isFinite(last) || nowMs - last > ASK_RESUME_WINDOW_MS) return null
  return recent
}

export async function loadConversation(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<AskThread | null> {
  const { data, error } = await supabase
    .from('ask_conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('is_deleted', false)
    .maybeSingle()
  if (error) throw new Error(`[ask-storage] loadConversation failed: ${error.message}`)
  if (!data) return null
  return { conversation: data as AskConversationRow, messages: await loadMessages(supabase, conversationId) }
}

export async function listConversations(
  supabase: SupabaseClient,
  userId: string,
  limit = 30,
): Promise<AskConversationRow[]> {
  const { data, error } = await supabase
    .from('ask_conversations')
    .select('*')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .order('last_message_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`[ask-storage] listConversations failed: ${error.message}`)
  return (data ?? []) as AskConversationRow[]
}

export async function softDeleteConversation(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<void> {
  const { error } = await supabase
    .from('ask_conversations')
    .update({ is_deleted: true })
    .eq('id', conversationId)
  if (error) throw new Error(`[ask-storage] softDeleteConversation failed: ${error.message}`)
}

// ─── Writes (server turn route; also the deprecated one-shot clients) ───────

export async function createConversation(
  supabase: SupabaseClient,
  userId: string,
  firstQuestion: string,
): Promise<AskConversationRow | null> {
  const title = deriveTitle(firstQuestion)
  const { data, error } = await supabase
    .from('ask_conversations')
    .insert({ user_id: userId, title })
    .select('*')
    .single()
  if (error || !data) {
    console.error('[ask-storage] createConversation failed:', error?.message)
    return null
  }
  return data as AskConversationRow
}

export async function appendUserMessage(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
  question: string,
): Promise<AskMessageRow | null> {
  const { data, error } = await supabase
    .from('ask_messages')
    .insert({ conversation_id: conversationId, user_id: userId, role: 'user', question })
    .select('*')
    .single()
  if (error || !data) {
    console.error('[ask-storage] appendUserMessage failed:', error?.message)
    return null
  }
  return data as AskMessageRow
}

export async function appendAssistantMessage(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
  response: AskReply | AskMurmurResponse,
): Promise<AskMessageRow | null> {
  const { data, error } = await supabase
    .from('ask_messages')
    .insert({ conversation_id: conversationId, user_id: userId, role: 'assistant', response })
    .select('*')
    .single()
  if (error || !data) {
    console.error('[ask-storage] appendAssistantMessage failed:', error?.message)
    return null
  }
  return data as AskMessageRow
}

