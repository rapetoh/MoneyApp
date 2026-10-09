/**
 * CSV import on the phone (docs/csv-import.md). Reading and deciding live
 * in packages/shared/src/domain/csvImport.ts; this file names the merchants
 * through the server, writes the rows, and keeps the device copy in step.
 *
 * Rows go to the server in chunks of 200 (one request each, not one per
 * row through the outbox, which would take minutes for a year of history)
 * and are written locally as already synced. A chunk the server refuses or
 * that cannot be sent (offline) is written locally and queued like any
 * other new transaction, so nothing is lost either way.
 */
import * as Crypto from 'expo-crypto'
import { supabase } from '../lib/supabase'
import { getApiUrl } from '../hooks/useApiUrl'
import { DataEvents } from '../events/dataEvents'
import { upsertTransaction } from './sync/transactionStore'
import { enqueue } from './sync/syncQueue'
import { syncManager } from './sync/SyncManager'
import { loadMerchantRules } from './merchantRules'
import { identifyMerchants } from '@voice-expense/ai'
import { importTransaction, descriptorsToIdentify, type Category, type ImportRow, type Transaction } from '@voice-expense/shared'

const CHUNK = 200

export type ImportPhase = 'naming' | 'saving'

export async function performImport(args: {
  userId: string
  rows: readonly ImportRow[]
  categories: readonly Category[]
  currency: string
  tz: string
  onProgress: (phase: ImportPhase, done: number, total: number) => void
}): Promise<{ saved: number; queued: number }> {
  const { userId, rows, categories, currency, tz, onProgress } = args

  // 1. Name the merchants (distinct descriptors only, most frequent first).
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token ?? ''
  const descriptors = descriptorsToIdentify(rows)
  onProgress('naming', 0, descriptors.length)
  const identities = token
    ? await identifyMerchants({
        apiBaseUrl: await getApiUrl(),
        authToken: token,
        descriptors,
        categories: categories.map((c) => c.name),
        onProgress: (done, total) => onProgress('naming', done, total),
      })
    : new Map()

  // 2. Build every transaction the same way the web does.
  const rules = await loadMerchantRules(userId).catch(() => [])
  const nowIso = new Date().toISOString()
  const txns = rows.map((r) =>
    importTransaction(r, identities.get(r.description.slice(0, 120).trim()), {
      userId,
      categories,
      rules,
      currency,
      tz,
      nowIso,
      newId: () => Crypto.randomUUID(),
    }),
  )

  // 3. Write: the server in chunks, the device copy alongside.
  let saved = 0
  let queued = 0
  onProgress('saving', 0, txns.length)
  for (let i = 0; i < txns.length; i += CHUNK) {
    const chunk = txns.slice(i, i + CHUNK)
    const { error } = await supabase.from('transactions').insert(chunk as never)
    const stamp = new Date().toISOString()
    for (const t of chunk) {
      const local = {
        ...t,
        occurrence_date: null,
        deleted_at: null,
        created_at: stamp,
        updated_at: stamp,
        synced_at: error ? null : stamp,
      } as unknown as Transaction
      await upsertTransaction(local)
      if (error) await enqueue('create', t.id, local, 'transaction')
    }
    if (error) queued += chunk.length
    else saved += chunk.length
    onProgress('saving', Math.min(txns.length, i + chunk.length), txns.length)
  }

  DataEvents.emitTransactions(userId)
  if (queued > 0) void syncManager.drainQueue()
  return { saved, queued }
}
