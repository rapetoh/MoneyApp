// Edge Function: revenuecat-webhook
//
// RevenueCat → Murmur. RevenueCat POSTs one event per store change
// (INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, BILLING_ISSUE,
// TRANSFER, …). We do not interpret the event type: for every Supabase
// user id the event can refer to, we re-read the subscriber from
// RevenueCat and write what is true *now* to `profiles.plus_*`
// (_shared/entitlement.ts explains why). This is the only path — besides
// plus-sync, which is the same write initiated by the app — that ever
// sets `plus_status`; clients are refused by migration 031's trigger.
//
// Auth: RevenueCat sends the "Authorization header value" configured on
// the webhook verbatim. It must equal REVENUECAT_WEBHOOK_SECRET.
//
// Deploy: supabase functions deploy revenuecat-webhook --no-verify-jwt
//   (--no-verify-jwt: RevenueCat is not a Supabase user; auth is the
//   shared secret above.)
// Webhook URL to paste into RevenueCat:
//   https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook
//
// Always answer 200 once the request is authenticated and parseable —
// RevenueCat retries non-2xx for hours, and a permanent 5xx (e.g. an
// anonymous-only event we can never map) would just spam retries.
import { subscriberIdCandidates, safeEqual, type RcWebhookEvent } from '../_shared/entitlement.ts'
import { corsHeaders, json, requireSecret, syncUserEntitlement } from '../_shared/revenuecat.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const provided = req.headers.get('Authorization') ?? ''
  const expected = requireSecret('REVENUECAT_WEBHOOK_SECRET')
  // Accept both the raw value and "Bearer <value>" — RevenueCat sends
  // exactly what was typed into the dashboard field.
  const bare = provided.replace(/^Bearer\s+/i, '')
  if (!safeEqual(provided, expected) && !safeEqual(bare, expected)) {
    return json({ error: 'Unauthorized' }, 401)
  }

  let event: RcWebhookEvent
  try {
    const body = (await req.json()) as { event?: RcWebhookEvent }
    event = body.event ?? {}
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const userIds = subscriberIdCandidates(event)
  if (userIds.length === 0) {
    console.log(
      `revenuecat-webhook: ${event.type ?? 'event'} carried no Supabase user id — ignored`,
    )
    return json({ ok: true, synced: [] })
  }

  const results = []
  for (const userId of userIds) {
    try {
      const outcome = await syncUserEntitlement(userId)
      results.push(outcome)
      console.log(
        `revenuecat-webhook: ${event.type ?? 'event'} → ${userId} ` +
          (outcome.wrote ? `${outcome.entitlement.plus_status}` : `skipped (${outcome.reason})`),
      )
    } catch (e) {
      // Surface as 500 so RevenueCat retries — a transient RC/DB error
      // must not silently drop an entitlement change.
      console.error(`revenuecat-webhook: ${userId} failed:`, e)
      return json({ error: e instanceof Error ? e.message : String(e) }, 500)
    }
  }
  return json({ ok: true, synced: results })
})
