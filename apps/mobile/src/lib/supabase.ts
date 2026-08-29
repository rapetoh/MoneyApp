import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import type { Database } from '@voice-expense/shared'

// EXPO_PUBLIC_* vars are BUILD-TIME LITERALS: Expo's babel transform only
// inlines `process.env.EXPO_PUBLIC_X` when written exactly like that. A
// computed access (`process.env[name]`) is NOT inlined and reads undefined
// in every release binary even when the build profile sets the var — which
// shipped TestFlight build #6 as a crash-on-launch. Never read these
// dynamically; the eslint no-computed-env rule enforces this file-wide.
const rawSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const rawSupabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

// A misbuilt binary shipping without Supabase credentials must still fail
// loudly at boot instead of the bare `!` assertion turning into an opaque
// "Invalid URL" thrown from deep inside supabase-js.
function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is not set - this build profile is missing its env (see apps/mobile/eas.json)`)
  }
  return value
}

const supabaseUrl = requireEnv('EXPO_PUBLIC_SUPABASE_URL', rawSupabaseUrl)
const supabaseAnonKey = requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', rawSupabaseAnonKey)

// SecureStore on iOS has a 2048-byte limit per key.
// The Supabase session object (tokens + user metadata) regularly exceeds this.
// We chunk large values across multiple keys and reassemble on read.
const CHUNK_SIZE = 1800
const CHUNK_COUNT_SUFFIX = '__chunks'

const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    const countStr = await SecureStore.getItemAsync(key + CHUNK_COUNT_SUFFIX)
    if (countStr === null) {
      // Not chunked — stored as a single value (small sessions, other keys)
      return SecureStore.getItemAsync(key)
    }
    const count = parseInt(countStr, 10)
    const chunks: string[] = []
    for (let i = 0; i < count; i++) {
      const chunk = await SecureStore.getItemAsync(`${key}_${i}`)
      if (chunk === null) return null
      chunks.push(chunk)
    }
    return chunks.join('')
  },

  setItem: async (key: string, value: string): Promise<void> => {
    if (value.length <= CHUNK_SIZE) {
      // Small enough to store directly — delete any old chunks first
      await SecureStore.deleteItemAsync(key + CHUNK_COUNT_SUFFIX)
      await SecureStore.setItemAsync(key, value)
      return
    }
    // Split into chunks
    const chunks: string[] = []
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE))
    }
    // Delete the un-chunked key so getItem knows to read chunks
    await SecureStore.deleteItemAsync(key)
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(`${key}_${i}`, chunks[i])
    }
    await SecureStore.setItemAsync(key + CHUNK_COUNT_SUFFIX, String(chunks.length))
  },

  removeItem: async (key: string): Promise<void> => {
    const countStr = await SecureStore.getItemAsync(key + CHUNK_COUNT_SUFFIX)
    if (countStr !== null) {
      const count = parseInt(countStr, 10)
      for (let i = 0; i < count; i++) {
        await SecureStore.deleteItemAsync(`${key}_${i}`)
      }
      await SecureStore.deleteItemAsync(key + CHUNK_COUNT_SUFFIX)
    }
    await SecureStore.deleteItemAsync(key)
  },
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
})

// auth-js's default persistence key: `sb-<project ref>-auth-token`. Derived
// from the URL rather than hardcoded so an environment switch can't strand a
// session under a stale key.
const AUTH_STORAGE_KEY = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`

/**
 * Deletes the persisted auth session directly at the storage layer. Needed
 * because `supabase.auth.signOut({ scope: 'local' })` POSTs to `/logout`
 * before clearing local state, and on a network failure it returns without
 * removing the stored session — leaving the account signed in on next
 * launch. Storage-level removal is the only sign-out that cannot fail
 * offline.
 */
export function removePersistedAuthSession(): Promise<void> {
  return ExpoSecureStoreAdapter.removeItem(AUTH_STORAGE_KEY)
}
