/**
 * Client side of /api/ai/identify-merchants (CSV import, docs/csv-import.md).
 * Sends distinct descriptors in batches and collects what comes back. Never
 * throws: a batch that fails just leaves its descriptors unnamed, and the
 * importer falls back to the cleaned descriptor and local guesses.
 */
import { MERCHANT_BATCH_MAX, MERCHANT_DESCRIPTOR_MAX_LENGTH, type MerchantBatchResult } from './merchantBatch'

/** Enough for a few thousand bank rows; the rest keep their cleaned names. */
export const IDENTIFY_MAX_DESCRIPTORS = 600

export async function identifyMerchants(args: {
  apiBaseUrl: string
  authToken: string
  descriptors: readonly string[]
  categories: readonly string[]
  onProgress?: (done: number, total: number) => void
  isCancelled?: () => boolean
}): Promise<Map<string, MerchantBatchResult>> {
  const out = new Map<string, MerchantBatchResult>()
  const list = args.descriptors
    .map((d) => d.slice(0, MERCHANT_DESCRIPTOR_MAX_LENGTH).trim())
    .filter(Boolean)
    .slice(0, IDENTIFY_MAX_DESCRIPTORS)
  const total = list.length
  for (let i = 0; i < list.length; i += MERCHANT_BATCH_MAX) {
    if (args.isCancelled?.()) break
    const batch = list.slice(i, i + MERCHANT_BATCH_MAX)
    let attempt = 0
    for (;;) {
      try {
        const res = await fetch(`${args.apiBaseUrl}/api/ai/identify-merchants`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${args.authToken}` },
          body: JSON.stringify({ descriptors: batch, categories: args.categories.slice(0, 100) }),
        })
        if (res.status === 429 && attempt === 0) {
          attempt++
          const wait = Math.min(30, Number(res.headers.get('Retry-After') ?? 10)) * 1000
          await new Promise((r) => setTimeout(r, wait))
          continue
        }
        if (res.ok) {
          const body = (await res.json()) as { results?: MerchantBatchResult[] }
          for (const r of body.results ?? []) out.set(r.descriptor, r)
        }
      } catch {
        /* offline or server error: this batch stays unnamed */
      }
      break
    }
    args.onProgress?.(Math.min(total, i + batch.length), total)
  }
  return out
}
