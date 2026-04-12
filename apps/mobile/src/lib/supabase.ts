import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import * as ExpoCrypto from 'expo-crypto'

// React Native does not have crypto.subtle. supabase-js needs it to generate
// S256 PKCE challenges. Without it, it falls back to 'plain' which the new
// Supabase auth system rejects. This polyfill uses expo-crypto (already
// installed) to implement the only method supabase-js actually calls.
if (typeof globalThis.crypto?.subtle?.digest !== 'function') {
  const subtle = {
    async digest(_algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> {
      const uint8 = ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : new Uint8Array(data as ArrayBuffer)
      let str = ''
      for (let i = 0; i < uint8.length; i++) {
        str += String.fromCharCode(uint8[i])
      }
      const hex = await ExpoCrypto.digestStringAsync(
        ExpoCrypto.CryptoDigestAlgorithm.SHA256,
        str,
        { encoding: ExpoCrypto.CryptoEncoding.HEX },
      )
      const result = new Uint8Array(hex.length / 2)
      for (let i = 0; i < hex.length; i += 2) {
        result[i / 2] = parseInt(hex.slice(i, i + 2), 16)
      }
      return result.buffer
    },
  }
  ;(globalThis.crypto as any).subtle = subtle
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce', // Required for OAuth in native apps
  },
})
