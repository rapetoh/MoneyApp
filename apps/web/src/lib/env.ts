// Environment validation — fix-plan item 1.2 ("a typed Supabase client").
//
// Before this module, every required variable was read as a bare
// `process.env.X!` non-null assertion at the call site. A missing
// variable didn't fail loudly where the mistake was made; it turned into
// whatever supabase-js or the OpenAI SDK does with `undefined` — an
// opaque "Invalid URL" or a 401 several layers downstream, on every one
// of the routes that construct a client at module scope
// (`apps/web/src/lib/auth.ts` in particular takes all three AI routes
// down with it, since they all import it for `validateToken`).
//
// Two separate getters, not one flat "validate everything" call: the
// Supabase pair is `NEXT_PUBLIC_*` and safe to read from a `'use client'`
// module (Next.js inlines `NEXT_PUBLIC_*` into the browser bundle by
// design). `OPENAI_API_KEY` is a server-only secret and must never be
// imported by client code — Next.js would replace the reference with
// `undefined` in the browser bundle, and this module would throw on
// every page load instead of the secret merely being (correctly)
// unavailable there. Call `getOpenAIEnv()` only from server-only files
// (the `apps/web/src/app/api/**` route handlers) — never from
// `apps/web/src/lib/supabase/client.ts` or anything it imports.

export class MissingEnvError extends Error {
  constructor(missing: string[]) {
    super(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        `Set them in .env.local (or the deployment's environment) before starting the app.`,
    )
    this.name = 'MissingEnvError'
  }
}

// CAPTURED AS LITERALS, at module scope, on purpose: bundlers (Next for
// the browser bundle, Metro for Expo) replace only the exact token
// `process.env.NEXT_PUBLIC_X` at build time. A computed read
// (`process.env[key]`) is invisible to that replacement and evaluates to
// `undefined` in every browser bundle even when the deployment sets the
// variable — which took the deployed dashboard down with a client-side
// MissingEnvError on every page load (and, same class, crashed TestFlight
// build #6 on launch). Validation below operates on these captured
// values, never on dynamic keys.
const RAW_NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const RAW_NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

function readRequired<K extends string>(
  entries: readonly (readonly [K, string | undefined])[],
): Record<K, string> {
  const values = {} as Record<K, string>
  const missing: K[] = []
  for (const [key, value] of entries) {
    if (!value) {
      missing.push(key)
    } else {
      values[key] = value
    }
  }
  if (missing.length > 0) throw new MissingEnvError(missing)
  return values
}

export interface SupabaseEnv {
  NEXT_PUBLIC_SUPABASE_URL: string
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string
}

let cachedSupabaseEnv: SupabaseEnv | null = null

/** Validated once per module instance, then cached — every call site
 *  constructs its client at module scope, so this only ever runs once
 *  per server process (or once per browser tab) regardless of how many
 *  clients are created. */
export function getSupabaseEnv(): SupabaseEnv {
  if (!cachedSupabaseEnv) {
    cachedSupabaseEnv = readRequired([
      ['NEXT_PUBLIC_SUPABASE_URL', RAW_NEXT_PUBLIC_SUPABASE_URL],
      ['NEXT_PUBLIC_SUPABASE_ANON_KEY', RAW_NEXT_PUBLIC_SUPABASE_ANON_KEY],
    ] as const)
  }
  return cachedSupabaseEnv
}

export interface OpenAIEnv {
  OPENAI_API_KEY: string
}

let cachedOpenAIEnv: OpenAIEnv | null = null

/** Server-only — see file header. Every AI route calls this at module
 *  scope so a missing key fails that route's first request with a named
 *  error instead of an opaque OpenAI SDK crash on the first
 *  `chat.completions.create` call. (Server processes have a real
 *  `process.env`, but the literal-capture rule is applied here too so
 *  this module has exactly one access pattern.) */
export function getOpenAIEnv(): OpenAIEnv {
  if (!cachedOpenAIEnv) {
    cachedOpenAIEnv = readRequired([['OPENAI_API_KEY', process.env.OPENAI_API_KEY]] as const)
  }
  return cachedOpenAIEnv
}
