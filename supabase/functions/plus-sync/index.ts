// Edge Function: plus-sync
//
// App → Murmur. Called with the user's own JWT right after a purchase or
// a "Restore purchases" on iOS (apps/mobile/src/services/purchases.ts),
// and by the web/desktop "Refresh" control on the Plus gate / Settings.
// It performs the exact write revenuecat-webhook performs — read the
// subscriber from RevenueCat, resolve, write `profiles.plus_*` — so the
// user is unlocked the moment the store confirms, without waiting on
// webhook delivery. Returns the resolved entitlement so the caller can
// refresh its profile view.
//
// Deploy: supabase functions deploy plus-sync
//   (JWT verification ON — the caller must be a signed-in user, and the
//   only id ever synced is the caller's own.)
import { corsHeaders, json, supabaseAdmin, syncUserEntitlement } from '../_shared/revenuecat.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Missing Authorization' }, 401)
  const { data: userResult, error: userErr } = await supabaseAdmin.auth.getUser(token)
  if (userErr || !userResult?.user) return json({ error: 'Invalid token' }, 401)
  const userId = userResult.user.id

  try {
    const outcome = await syncUserEntitlement(userId)
    return json(outcome)
  } catch (e) {
    console.error(`plus-sync: ${userId} failed:`, e)
    return json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
})
