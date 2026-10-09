/**
 * Learned merchant categories on the phone (migration 041,
 * packages/shared/src/domain/merchantRules.ts).
 *
 * The rules live in Supabase so the web and every device share them; a
 * copy sits in the local key/value table (`sync_meta`) so a capture that
 * wakes the app in the background, or with no signal, still files by them.
 * `learn` is called when a person moves a saved transaction to another
 * category; `categoryFor` is asked before the AI's suggestion on every
 * automatic capture.
 */
import { supabase } from '../lib/supabase'
import { getDb } from './sync/localDb'
import { DataEvents } from '../events/dataEvents'
import { merchantKey, merchantRuleName, learnedCategoryFor, type MerchantRule } from '@voice-expense/shared'

export type StoredMerchantRule = MerchantRule & { id?: string; updated_at?: string }

const memory = new Map<string, StoredMerchantRule[]>()
const loading = new Map<string, Promise<StoredMerchantRule[]>>()
const metaKey = (userId: string) => `merchant_rules:${userId}`

async function readLocal(userId: string): Promise<StoredMerchantRule[] | null> {
  try {
    const db = await getDb()
    const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', [metaKey(userId)])
    if (!row) return null
    const parsed = JSON.parse(row.value) as unknown
    return Array.isArray(parsed) ? (parsed as StoredMerchantRule[]) : null
  } catch {
    return null
  }
}

async function writeLocal(userId: string, rules: StoredMerchantRule[]): Promise<void> {
  try {
    const db = await getDb()
    await db.runAsync('INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)', [metaKey(userId), JSON.stringify(rules)])
  } catch {
    /* the server copy is the source of truth; next load retries */
  }
}

/** Fetch the rules from the server, falling back to the device copy. */
export function loadMerchantRules(userId: string, force = false): Promise<StoredMerchantRule[]> {
  if (!force && memory.has(userId)) return Promise.resolve(memory.get(userId)!)
  const inflight = loading.get(userId)
  if (inflight) return inflight
  const p = (async () => {
    const { data, error } = await supabase
      .from('merchant_rules')
      .select('id, merchant_key, merchant_name, category_id, updated_at')
      .eq('user_id', userId)
      .order('merchant_name')
    if (!error && data) {
      const rules = data as StoredMerchantRule[]
      memory.set(userId, rules)
      await writeLocal(userId, rules)
      return rules
    }
    const local = (await readLocal(userId)) ?? memory.get(userId) ?? []
    memory.set(userId, local)
    return local
  })().finally(() => loading.delete(userId))
  loading.set(userId, p)
  return p
}

/** Already-loaded rules, for a render that cannot wait. */
export function cachedMerchantRules(userId: string | undefined): StoredMerchantRule[] {
  return userId ? (memory.get(userId) ?? []) : []
}

/**
 * The learned category for a merchant, waiting for the rules if this is
 * the first ask since launch (a background capture). A rule pointing at a
 * category not in `validCategoryIds` is ignored.
 */
export async function learnedCategoryId(
  userId: string,
  merchant: string | null | undefined,
  validCategoryIds?: ReadonlySet<string>,
): Promise<string | null> {
  if (!merchantKey(merchant)) return null
  const rules = await Promise.race([
    loadMerchantRules(userId),
    // Never hold a save hostage to the network: the device copy answers.
    new Promise<StoredMerchantRule[]>((resolve) =>
      setTimeout(async () => resolve(memory.get(userId) ?? (await readLocal(userId)) ?? []), 1500),
    ),
  ])
  return learnedCategoryFor(merchant, rules, validCategoryIds)
}

/**
 * Remember that `merchant` belongs in `categoryId`. Returns the merchant
 * name as it will be listed, or null when there was nothing to learn.
 */
export async function learnMerchantCategory(
  userId: string,
  merchant: string | null | undefined,
  categoryId: string,
): Promise<string | null> {
  const key = merchantKey(merchant)
  if (!key || !merchant) return null
  const name = merchantRuleName(merchant)
  const rules = (await loadMerchantRules(userId)).filter((r) => r.merchant_key !== key)
  const next = [...rules, { merchant_key: key, merchant_name: name, category_id: categoryId }]
  memory.set(userId, next)
  await writeLocal(userId, next)
  const { error } = await supabase
    .from('merchant_rules')
    .upsert({ user_id: userId, merchant_key: key, merchant_name: name, category_id: categoryId }, { onConflict: 'user_id,merchant_key' })
  if (!error) {
    void loadMerchantRules(userId, true)
    DataEvents.emitMerchantRules(userId)
  }
  return name
}

/** Forget one learned merchant (Settings, "Learned categories"). */
export async function forgetMerchantRule(userId: string, key: string): Promise<boolean> {
  const { error } = await supabase.from('merchant_rules').delete().eq('user_id', userId).eq('merchant_key', key)
  if (error) return false
  const next = (memory.get(userId) ?? []).filter((r) => r.merchant_key !== key)
  memory.set(userId, next)
  await writeLocal(userId, next)
  DataEvents.emitMerchantRules(userId)
  return true
}
