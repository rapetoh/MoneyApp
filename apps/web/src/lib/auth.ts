import { createClient } from '@supabase/supabase-js'

// Anon key, not an elevated-privilege admin key: `auth.getUser(token)`
// validates the JWT's signature against Supabase Auth and needs no
// bypass-RLS credential. This is the only Supabase client on the
// web/desktop surface, and it never holds a secret beyond the public
// anon key. NEXT_PUBLIC_* so the value is build-inlined — the
// desktop-embedded server is forked with no runtime env (see
// apps/desktop/src/main.ts).
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

/**
 * Validates a Bearer token from the Authorization header.
 * Returns the user ID if valid, null if not.
 */
export async function validateToken(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const { data, error } = await supabaseAuth.auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}
