// Edge Function: delete-user
//
// GDPR "right to erasure" implementation. The caller authenticates as
// themselves; we use the service-role client to verify the JWT and then
// delete every row they own across the schema plus their auth.users
// record. There is no way to perform `auth.admin.deleteUser` from a
// client SDK — it requires the service-role key — which is why this
// lives as an Edge Function instead of inline in the mobile app.
//
// Deploy: supabase functions deploy delete-user
//
// Called by: apps/mobile/app/more/privacy.tsx — the "Delete everything
// permanently" row in the Your Rights group. The mobile flow shows a
// destructive-style Alert.alert confirmation, calls this endpoint with
// the user's access token, clears local SQLite, then signs out.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  // Verify the caller's JWT. The user can only delete themselves.
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Missing Authorization' }, 401)

  const { data: userResult, error: userErr } = await supabaseAdmin.auth.getUser(token)
  if (userErr || !userResult?.user) {
    return json({ error: 'Invalid token' }, 401)
  }
  const userId = userResult.user.id

  // Application-level rows. Order matters where FKs would otherwise
  // block: ask_messages depends on ask_conversations (CASCADE handles
  // it), transactions reference recurring_rules (ON DELETE SET NULL —
  // safe in either order), budgets and categories are standalone.
  // We delete each one explicitly rather than relying on a single
  // CASCADE from auth.users because some tables historically lacked
  // the CASCADE rule and re-adding it would require a migration.
  const tables = [
    'ask_messages',
    'ask_conversations',
    'transactions',
    'recurring_rules',
    'budgets',
    'categories',
    'profiles',
  ] as const

  for (const table of tables) {
    // profiles uses `id` as the user-scoped key; everything else uses
    // `user_id`.
    const column = table === 'profiles' ? 'id' : 'user_id'
    const { error } = await supabaseAdmin.from(table).delete().eq(column, userId)
    if (error) {
      console.error(`[delete-user] Failed to clear ${table} for ${userId}:`, error.message)
      return json({ error: `Failed to clear ${table}: ${error.message}` }, 500)
    }
  }

  // Finally, the auth user. This invalidates every session token and
  // makes the email available for a fresh sign-up should the user
  // change their mind.
  const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (deleteErr) {
    console.error(`[delete-user] Failed to delete auth user ${userId}:`, deleteErr.message)
    return json({ error: `Failed to delete account: ${deleteErr.message}` }, 500)
  }

  return json({ deleted: true, user_id: userId })
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
