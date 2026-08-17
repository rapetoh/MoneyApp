// RevenueCat REST client + the one place the entitlement is written.
//
// Deno-only (fetch + the service-role client); the pure resolution lives
// in ./entitlement.ts so it can be unit-tested from the monorepo.
//
// Secrets (Supabase → Edge Functions → Secrets; set by the owner from
// the RevenueCat dashboard — see docs/payments.md "Owner runbook"):
//   REVENUECAT_SECRET_API_KEY   RevenueCat v1 *secret* API key (sk_…),
//                               server-side only, never shipped in an app.
//   REVENUECAT_WEBHOOK_SECRET   the Authorization header value configured
//                               on the RevenueCat webhook.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { Database } from './database.types.ts'
import {
  resolveEntitlement,
  type PlusEntitlementColumns,
  type RcSubscriber,
} from './entitlement.ts'

const RC_API = 'https://api.revenuecat.com/v1'

export const supabaseAdmin = createClient<Database>(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

export function requireSecret(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`${name} is not configured`)
  return v
}

/** `GET /subscribers/{id}`. Note RevenueCat v1 *creates* the subscriber
 *  on GET when it doesn't exist (returns an empty record, not 404), so
 *  "never seen" surfaces as a resolved `free` with no history — see
 *  `syncUserEntitlement`, which treats that as "no evidence" and writes
 *  nothing. The 404 branch is kept for completeness. */
export async function fetchSubscriber(appUserId: string): Promise<RcSubscriber | null> {
  const res = await fetch(`${RC_API}/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: {
      Authorization: `Bearer ${requireSecret('REVENUECAT_SECRET_API_KEY')}`,
      'Content-Type': 'application/json',
      // Cache-Control: no-cache is honoured by RC's REST edge — we want
      // the record as of *now*, especially right after a purchase.
      'Cache-Control': 'no-cache',
    },
  })
  if (res.status === 404) return null
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`RevenueCat ${res.status}: ${body.slice(0, 300)}`)
  }
  const json = (await res.json()) as { subscriber?: RcSubscriber }
  return json.subscriber ?? null
}

export type SyncOutcome =
  | { userId: string; wrote: true; entitlement: PlusEntitlementColumns }
  | { userId: string; wrote: false; reason: 'no_rc_record' | 'no_profile' }

/** Read the subscriber from RevenueCat, resolve, write `profiles.plus_*`.
 *  Idempotent — the same record always produces the same row.
 *
 *  "No evidence ≠ revoke": when RevenueCat has no subscription history
 *  for the user at all (resolver → `free`), nothing is written. NULL and
 *  `free` gate identically, so a real free user loses nothing, and an
 *  entitlement granted by hand (early access; the owner's test accounts)
 *  is not wiped by a Refresh/Restore before any store record exists. The
 *  moment RevenueCat holds a real record — trial, active, cancelled,
 *  expired — the store becomes the truth and the row is written. */
export async function syncUserEntitlement(userId: string, now = new Date()): Promise<SyncOutcome> {
  const subscriber = await fetchSubscriber(userId)
  if (!subscriber) return { userId, wrote: false, reason: 'no_rc_record' }
  const entitlement = resolveEntitlement(subscriber, now)
  if (entitlement.plus_status === 'free') return { userId, wrote: false, reason: 'no_rc_record' }
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ ...entitlement, plus_synced_at: now.toISOString() })
    .eq('id', userId)
    .select('id')
  if (error) throw new Error(`profiles update failed: ${error.message}`)
  if (!data || data.length === 0) return { userId, wrote: false, reason: 'no_profile' }
  return { userId, wrote: true, entitlement }
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
