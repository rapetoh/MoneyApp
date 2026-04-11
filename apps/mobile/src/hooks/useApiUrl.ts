import { useState, useEffect } from 'react'
import * as SecureStore from 'expo-secure-store'

const STORAGE_KEY = 'api_base_url'
const DEFAULT_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000'

export function useApiUrl() {
  const [apiUrl, setApiUrlState] = useState(DEFAULT_URL)

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY).then((stored) => {
      if (stored) setApiUrlState(stored)
    })
  }, [])

  async function setApiUrl(url: string) {
    const trimmed = url.trim().replace(/\/$/, '')
    await SecureStore.setItemAsync(STORAGE_KEY, trimmed)
    setApiUrlState(trimmed)
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
  return stored ?? DEFAULT_URL
}
