// Persistence for Ask Murmur conversations.
//
// Two Supabase tables (see supabase/migrations/007_ask_conversations.sql):
//   ask_conversations: one row per thread, auto-titled from first question.
//   ask_messages:      one row per turn (role='user' question or
//                      role='assistant' response JSONB).
//
// Both tables have RLS pinned to auth.uid()=user_id so the browser client
// can read/write directly. No service role required from the web tier.
//
// The Ask page calls into this module; the data flow is:
//   on mount -> loadMostRecentConversation -> render thread
//   on send  -> ensureConversation (create if null), then appendUserMessage,
//               wait for model, then appendAssistantMessage
//   "New conversation" -> setActiveConversation(null), local thread cleared,
//                          next send creates a fresh row
//
// Lives in packages/shared so web (conversation thread on /dashboard/ask)
// and mobile (one-shot result card on more/ask-result) persist through the
// exact same layer. The caller passes its own SupabaseClient — the import
// below is type-only, so shared carries no runtime dependency on
// supabase-js.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AskMurmurResponse } from './types/ai'

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
  response: AskMurmurResponse | null
  created_at: string
}

/** Auto-derive a short conversation title from the first user question.
 *  Trim to a sensible length and strip terminal punctuation so titles read
 *  cleanly in a list. */
export function deriveTitle(question: string, max = 60): string {
  const trimmed = question.trim().replace(/\s+/g, ' ')
  if (trimmed.length <= max) return trimmed.replace(/[.!?]+$/, '')
  return trimmed.slice(0, max - 1).replace(/\s+\S*$/, '').replace(/[.!?]+$/, '') + '…'
}

/** Load the most recent active (non-deleted) conversation + all its messages.
 *  Returns null when the user has no conversations yet so the caller renders
 *  the empty-state composer. */
export async function loadMostRecentConversation(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ conversation: AskConversationRow; messages: AskMessageRow[] } | null> {
  const { data: convData, error: convErr } = await supabase
    .from('ask_conversations')
    .select('*')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .order('last_message_at', { ascending: false })
    .limit(1)
  if (convErr || !convData || convData.length === 0) return null

  const conversation = convData[0] as AskConversationRow
  const { data: msgs } = await supabase
    .from('ask_messages')
    .select('*')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: true })

  return {
    conversation,
    messages: ((msgs ?? []) as AskMessageRow[]),
  }
}

/** Load a specific conversation + messages. Used when the user picks one
 *  from the history dropdown. Returns null if not found / not theirs (RLS
 *  hides it either way). */
export async function loadConversation(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<{ conversation: AskConversationRow; messages: AskMessageRow[] } | null> {
  const { data, error } = await supabase
    .from('ask_conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('is_deleted', false)
    .maybeSingle()
  if (error || !data) return null

  const { data: msgs } = await supabase
    .from('ask_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  return {
    conversation: data as AskConversationRow,
    messages: ((msgs ?? []) as AskMessageRow[]),
  }
}

/** List the user's recent conversations for the history dropdown. */
export async function listConversations(
  supabase: SupabaseClient,
  userId: string,
  limit = 30,
): Promise<AskConversationRow[]> {
  const { data } = await supabase
    .from('ask_conversations')
    .select('*')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .order('last_message_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as AskConversationRow[]
}

/** Create a new conversation row. The first user message also lands in
 *  ask_messages — we don't have an empty-conversation state. Returns the
 *  freshly inserted conversation row. */
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
    console.error('[ask-storage] createConversation failed:', error)
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
    .insert({
      conversation_id: conversationId,
      user_id: userId,
      role: 'user',
      question,
    })
    .select('*')
    .single()
  if (error || !data) {
    console.error('[ask-storage] appendUserMessage failed:', error)
    return null
  }
  return data as AskMessageRow
}

export async function appendAssistantMessage(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
  response: AskMurmurResponse,
): Promise<AskMessageRow | null> {
  const { data, error } = await supabase
    .from('ask_messages')
    .insert({
      conversation_id: conversationId,
      user_id: userId,
      role: 'assistant',
      response,
    })
    .select('*')
    .single()
  if (error || !data) {
    console.error('[ask-storage] appendAssistantMessage failed:', error)
    return null
  }
  return data as AskMessageRow
}

/** Soft-delete a conversation. The row stays so we can offer "undo" later;
 *  for now it just disappears from the user's list. */
export async function softDeleteConversation(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<void> {
  await supabase
    .from('ask_conversations')
    .update({ is_deleted: true })
    .eq('id', conversationId)
}
