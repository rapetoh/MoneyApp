import { useState, useEffect } from 'react'
import * as SecureStore from 'expo-secure-store'

const STORAGE_KEY = 'api_base_url'

function resolveDefaultUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_BASE_URL
  if (url) return url
  // Local `expo start` sessions may target a local server; a release build
  // without the env var is a misbuilt binary and must fail loudly instead.
  if (__DEV__) return 'http://localhost:3000'
  throw new Error(
    'EXPO_PUBLIC_API_BASE_URL is not set - this build profile is missing its env (see apps/mobile/eas.json)',
  )
}

const DEFAULT_URL = resolveDefaultUrl()

// Compiled-in allow-list for stored overrides. The override is a development
// tool; in release builds anything non-HTTPS or outside this list is
// discarded on read, so a value already written to a device cannot redirect
// AI requests — which carry the Supabase access token — to a foreign host.
const ALLOWED_OVERRIDE_HOSTS = (() => {
  const hosts = new Set(['money-app-web-w6su.vercel.app'])
  try {
    hosts.add(new URL(DEFAULT_URL).hostname)
  } catch {}
  return hosts
})()

function sanitizeOverride(stored: string | null): string | null {
  if (!stored) return null
  if (__DEV__) return stored
  try {
    const { protocol, hostname } = new URL(stored)
    if (protocol === 'https:' && ALLOWED_OVERRIDE_HOSTS.has(hostname)) return stored
  } catch {}
  return null
}

export function useApiUrl() {
  const [apiUrl, setApiUrlState] = useState(DEFAULT_URL)

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY).then((stored) => {
      const valid = sanitizeOverride(stored)
      if (valid) setApiUrlState(valid)
    })
  }, [])

  async function setApiUrl(url: string) {
    const trimmed = url.trim().replace(/\/$/, '')
    await SecureStore.setItemAsync(STORAGE_KEY, trimmed)
    setApiUrlState(sanitizeOverride(trimmed) ?? DEFAULT_URL)
  }

  async function resetApiUrl() {
    await SecureStore.deleteItemAsync(STORAGE_KEY)
    setApiUrlState(DEFAULT_URL)
  }

  return { apiUrl, setApiUrl, resetApiUrl, defaultUrl: DEFAULT_URL }
}

/** One-shot read for use outside of React components */
export async function getApiUrl(): Promise<string> {
  const stored = await SecureStore.getItemAsync(STORAGE_KEY)
  return sanitizeOverride(stored) ?? DEFAULT_URL
}
