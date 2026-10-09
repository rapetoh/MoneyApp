/**
 * Merchant enrichment: turns a card descriptor that was saved raw into the
 * business's real name and logo domain, after the fact.
 *
 * Apple Pay and bank-notification captures save in under a second, so the
 * parser that names the business ("711594-Mcgrath Volkswa" -> "McGrath
 * Volkswagen", vw.com) sometimes answers too late, or the phone was
 * offline. Those rows keep the cleaned descriptor and no logo. This sweep
 * finds them on launch and on foreground, asks the same parser once per
 * row, and writes the answer through the normal edit path (SQLite, then
 * the sync outbox), so every surface and device sees the fix.
 *
 * Rules:
 *  - Only captured rows (Apple Pay `shortcut`, Android
 *    `notification_listener`). Voice, manual and scan rows were named by
 *    the person or by the parser already.
 *  - The name is replaced only while it still looks like a descriptor; a
 *    name the person typed is kept, and only the missing logo domain is
 *    filled.
 *  - Each row is tried once (ids remembered on device), a few per run, so
 *    an unknown merchant never costs a parse on every launch.
 */

import * as SecureStore from 'expo-secure-store'
import { parseExpense } from '@voice-expense/ai'
import {
  cleanMerchantDescriptor,
  normalizeMerchantCase,
  normalizeMerchantDomain,
  type Transaction,
} from '@voice-expense/shared'
import { supabase } from '../lib/supabase'
import { getApiUrl } from '../hooks/useApiUrl'
import { getTransactions, getTransactionById, updateTransactionFields } from './sync/transactionStore'
import { enqueue } from './sync/syncQueue'
import { syncManager } from './sync/SyncManager'
import { getDb } from './sync/localDb'
import { DataEvents } from '../events/dataEvents'

const ATTEMPTED_KEY = 'murmur.merchantEnrichment.attempted'
const BATCH = 5
const ATTEMPTED_CAP = 400
const PARSE_BUDGET_MS = 8000

let running = false

// ── Captures saved before the parser answered ────────────────────────────
//
// An Apple Pay or Siri capture waits 4 s for the parser, then saves with
// the cleaned descriptor ("BLUE Bottle Coffee 12") so the purchase is never
// lost. That name may not look raw enough for the heuristic sweep below to
// recognise, so the capture is queued here with the bank's original text,
// and the next run asks the parser again with it (Oct 9 2026).
type NamingEntry = { raw: string; saved: string | null; tries: number }
const NAMING_MAX_TRIES = 6
const namingKey = (userId: string) => `merchant_naming:${userId}`

async function readNaming(userId: string): Promise<Record<string, NamingEntry>> {
  try {
    const db = await getDb()
    const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', [namingKey(userId)])
    const parsed = row ? (JSON.parse(row.value) as unknown) : {}
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, NamingEntry>) : {}
  } catch {
    return {}
  }
}

async function writeNaming(userId: string, queue: Record<string, NamingEntry>): Promise<void> {
  try {
    const db = await getDb()
    await db.runAsync('INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)', [namingKey(userId), JSON.stringify(queue)])
  } catch {
    /* worst case the heuristic sweep still covers it */
  }
}

/** Remember a capture that was saved under its fallback name, and try to
 *  name it in a few seconds, without waiting for the next app open. */
export async function queueForNaming(userId: string, id: string, raw: string, saved: string | null): Promise<void> {
  const queue = await readNaming(userId)
  queue[id] = { raw, saved, tries: 0 }
  await writeNaming(userId, queue)
  setTimeout(() => void runMerchantEnrichment(userId).catch(() => {}), 8000)
}

/** True while the merchant still reads like a card descriptor rather
 *  than a business name: store numbers, processor prefixes, star tails,
 *  shouting caps, or anything the cleaner would still change. */
export function looksLikeDescriptor(merchant: string): boolean {
  const m = merchant.trim()
  if (!m) return false
  if (/[*#]/.test(m) || /\d{3,}/.test(m)) return true
  if (m.length > 3 && m === m.toUpperCase() && /[A-Z]/.test(m)) return true
  return normalizeMerchantCase(cleanMerchantDescriptor(m)) !== m
}

export function needsEnrichment(t: Transaction): boolean {
  if (t.is_deleted || !t.merchant) return false
  if (t.source !== 'shortcut' && t.source !== 'notification_listener') return false
  return !t.merchant_domain || looksLikeDescriptor(t.merchant)
}

async function readAttempted(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(ATTEMPTED_KEY)
    const ids = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

async function writeAttempted(ids: string[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(ATTEMPTED_KEY, JSON.stringify(ids.slice(-ATTEMPTED_CAP)))
  } catch {
    /* worst case a row is tried again next launch */
  }
}

export async function runMerchantEnrichment(userId: string): Promise<number> {
  if (running) return 0
  running = true
  try {
    const attempted = await readAttempted()
    const tried = new Set(attempted)
    const naming = await readNaming(userId)
    const namingIds = Object.keys(naming).slice(0, BATCH)
    const candidates = (await getTransactions(userId))
      .filter((t) => !naming[t.id] && !tried.has(t.id) && needsEnrichment(t))
      .slice(0, BATCH)
    if (!candidates.length && !namingIds.length) return 0

    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    if (!token) return 0
    const apiBaseUrl = await getApiUrl()

    let fixed = 0

    // Queued captures first: ask with the bank's own text, and replace the
    // fallback name unless the person has renamed it since.
    for (const id of namingIds) {
      const entry = naming[id]
      const t = await getTransactionById(id)
      if (!t || t.is_deleted) {
        delete naming[id]
        continue
      }
      const parsed = await Promise.race([
        parseExpense({
          transcript: `${t.amount} ${t.currency_code} at ${entry.raw}`,
          locale: 'en' as never,
          currency: t.currency_code,
          categories: [],
          apiBaseUrl,
          authToken: token,
          userId,
        }).catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), PARSE_BUDGET_MS)),
      ])
      if (!parsed) {
        entry.tries += 1
        if (entry.tries >= NAMING_MAX_TRIES) delete naming[id]
        continue
      }
      delete naming[id]
      const fields: { merchant?: string; merchant_domain?: string } = {}
      const name = parsed.merchant?.trim()
      if (name && t.merchant === entry.saved && name !== t.merchant) fields.merchant = name
      const domain = normalizeMerchantDomain(parsed.merchant_domain)
      if (domain && domain !== t.merchant_domain) fields.merchant_domain = domain
      if (!Object.keys(fields).length) continue
      await updateTransactionFields(id, fields)
      const updated = await getTransactionById(id)
      if (updated) await enqueue('update', id, updated, 'transaction')
      fixed++
    }
    await writeNaming(userId, naming)

    for (const t of candidates) {
      const parsed = await Promise.race([
        parseExpense({
          transcript: `${t.amount} ${t.currency_code} at ${t.merchant}`,
          locale: 'en' as never,
          currency: t.currency_code,
          categories: [],
          apiBaseUrl,
          authToken: token,
          userId,
        }).catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), PARSE_BUDGET_MS)),
      ])
      // No answer (offline, slow): not marked, so the next run retries.
      if (!parsed) continue
      attempted.push(t.id)

      const fields: { merchant?: string; merchant_domain?: string } = {}
      const name = parsed.merchant?.trim()
      if (name && t.merchant && looksLikeDescriptor(t.merchant) && name !== t.merchant) {
        fields.merchant = name
      }
      const domain = normalizeMerchantDomain(parsed.merchant_domain)
      if (domain && domain !== t.merchant_domain) fields.merchant_domain = domain
      if (!Object.keys(fields).length) continue

      // Re-read: the person may have edited the row while the parse ran.
      const current = await getTransactionById(t.id)
      if (!current || current.is_deleted || current.merchant !== t.merchant) continue

      await updateTransactionFields(t.id, fields)
      const updated = await getTransactionById(t.id)
      if (updated) await enqueue('update', t.id, updated, 'transaction')
      fixed++
    }

    await writeAttempted(attempted)
    if (fixed) {
      DataEvents.emitTransactions(userId)
      // Push the fixes now; without this they waited for the next
      // unrelated write to drain the outbox (Oct 9 2026).
      void syncManager.drainQueue()
    }
    return fixed
  } finally {
    running = false
  }
}
