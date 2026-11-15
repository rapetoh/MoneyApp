'use client'
import { useCallback, useEffect, useState } from 'react'
import {
  defaultBusinessIcon,
  isBusinessLogo,
  type Business,
  type BusinessIconKey,
} from '@voice-expense/shared'
import { createClient } from './supabase/client'

/**
 * The person's businesses (migration 044, docs/businesses.md). A transaction
 * whose `business_id` is null, or points at a business that no longer
 * exists, is Personal. Each has a logo or an icon (migration 045); draw it
 * with `BusinessMark`.
 */
export const PERSONAL = 'personal'

/** A filter value: 'all', 'personal', or a business id. */
export type BusinessFilter = 'all' | typeof PERSONAL | string

export function matchesBusiness(
  businessId: string | null | undefined,
  filter: BusinessFilter,
  known: ReadonlySet<string>,
): boolean {
  if (filter === 'all') return true
  const id = businessId && known.has(businessId) ? businessId : null
  return filter === PERSONAL ? id === null : id === filter
}

export function businessName(
  businessId: string | null | undefined,
  businesses: readonly Business[],
): string {
  return businesses.find((b) => b.id === businessId)?.name ?? 'Personal'
}

export function useBusinesses() {
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('businesses').select('*').order('name')
    setBusinesses((data ?? []) as Business[])
    setLoaded(true)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const create = useCallback(
    async (name: string): Promise<string | null> => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return 'Your session ended. Sign in again.'
      // A new business starts with the icon its name suggests (045).
      const { error } = await supabase
        .from('businesses')
        .insert({ user_id: user.id, name: name.trim(), icon: defaultBusinessIcon(name) })
      if (error)
        return error.code === '23505'
          ? 'You already have a business with that name.'
          : error.message
      await reload()
      return null
    },
    [reload],
  )

  const rename = useCallback(
    async (id: string, name: string): Promise<string | null> => {
      const { error } = await createClient()
        .from('businesses')
        .update({ name: name.trim() })
        .eq('id', id)
      if (error)
        return error.code === '23505'
          ? 'You already have a business with that name.'
          : error.message
      await reload()
      return null
    },
    [reload],
  )

  /** Sets the logo (a `data:image/jpeg;base64,...` URL), or removes it with null. */
  const setLogo = useCallback(
    async (id: string, logo: string | null): Promise<string | null> => {
      const { error } = await createClient().from('businesses').update({ logo }).eq('id', id)
      if (error)
        return error.code === '23514'
          ? 'That image is too large. Try a smaller one.'
          : error.message
      await reload()
      return null
    },
    [reload],
  )

  /** Picks one of the twelve icons. Clears the logo too: the logo always
   *  wins the tile, so an icon chosen under it would never show. */
  const setIcon = useCallback(
    async (id: string, icon: BusinessIconKey): Promise<string | null> => {
      const { error } = await createClient()
        .from('businesses')
        .update({ icon, logo: null })
        .eq('id', id)
      if (error) return error.message
      await reload()
      return null
    },
    [reload],
  )

  const remove = useCallback(
    async (id: string): Promise<string | null> => {
      const { error } = await createClient().rpc('delete_business', { p_business_id: id })
      if (error) return error.message
      await reload()
      return null
    },
    [reload],
  )

  /** Moves transactions to a business (null = Personal); returns the error, if any. */
  const assign = useCallback(async (ids: string[], businessId: string | null) => {
    const supabase = createClient()
    for (let i = 0; i < ids.length; i += 5000) {
      const { error } = await supabase.rpc('set_transactions_business', {
        p_ids: ids.slice(i, i + 5000),
        p_business_id: businessId,
      })
      if (error) return error.message
    }
    return null
  }, [])

  return { businesses, loaded, reload, create, rename, remove, setLogo, setIcon, assign }
}

/** Biggest file the logo upload reads (the result is always small). */
export const LOGO_MAX_FILE_BYTES = 10 * 1024 * 1024
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const LOGO_SIZE = 256

/**
 * A picked image file as a business logo (migration 045): center-cropped to
 * a square, scaled to 256 px on a white ground (a transparent PNG would
 * turn black as JPEG), exported as a JPEG data URL at 0.85, about 20 to
 * 40 KB. Same output as the phone. Returns the logo, or a message to show.
 */
export async function logoFromFile(file: File): Promise<{ logo: string } | { error: string }> {
  if (!LOGO_TYPES.includes(file.type)) return { error: 'Choose a PNG, JPEG or WebP image.' }
  if (file.size > LOGO_MAX_FILE_BYTES)
    return { error: 'That image is over 10 MB. Choose a smaller one.' }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = LOGO_SIZE
    canvas.height = LOGO_SIZE
    const ctx = canvas.getContext('2d')
    if (!side || !ctx) return { error: 'That image could not be read. Try another one.' }
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, LOGO_SIZE, LOGO_SIZE)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      LOGO_SIZE,
      LOGO_SIZE,
    )
    const logo = canvas.toDataURL('image/jpeg', 0.85)
    return isBusinessLogo(logo)
      ? { logo }
      : { error: 'That image could not be read. Try another one.' }
  } catch {
    return { error: 'That image could not be read. Try another one.' }
  } finally {
    URL.revokeObjectURL(url)
  }
}
