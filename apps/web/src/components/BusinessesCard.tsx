'use client'
import { useEffect, useRef, useState } from 'react'
import {
  BUSINESS_ICONS,
  businessIcon,
  isBusinessLogo,
  t,
  type Business,
  type BusinessIconKey,
} from '@voice-expense/shared'
import { colors, font, radius } from '../lib/theme'
import { useBusinesses, logoFromFile } from '../lib/businesses'
import { BusinessMark, BusinessGlyph } from './BusinessMark'

/** The tile's menu: anchored under (or over) the tile it opened from. */
type MenuState = {
  id: string
  mode: 'menu' | 'icons'
  left: number
  top?: number
  bottom?: number
}

/**
 * Settings > Businesses (docs/businesses.md): the side businesses kept apart
 * from personal spending. Add, rename, delete. Deleting moves that
 * business's transactions back to Personal; nothing is lost.
 *
 * Each business has a face (migration 045): click its tile to upload a
 * logo, choose one of twelve icons, or remove the logo.
 */
export function BusinessesCard() {
  const { businesses, loaded, create, rename, remove, setLogo, setIcon } = useBusinesses()
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const anchorRef = useRef<HTMLElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const uploadFor = useRef<string | null>(null)

  // The menu floats (position: fixed) so the list's rounded clip never
  // cuts it. Outside click, Escape, scroll or resize close it.
  useEffect(() => {
    if (!menu) return
    function onDown(e: MouseEvent) {
      const target = e.target instanceof Node ? e.target : null
      if (target && (menuRef.current?.contains(target) || anchorRef.current?.contains(target)))
        return
      setMenu(null)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenu(null)
    }
    function onMove() {
      setMenu(null)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [menu])

  async function run(op: () => Promise<string | null>, after?: () => void) {
    setBusy(true)
    setError(null)
    const e = await op()
    setBusy(false)
    if (e) setError(e)
    else after?.()
  }

  function toggleMenu(b: Business, el: HTMLElement) {
    if (menu?.id === b.id) {
      setMenu(null)
      return
    }
    anchorRef.current = el
    const r = el.getBoundingClientRect()
    // Room for the icon grid below the tile, or open upward.
    const above = r.bottom + 240 > window.innerHeight
    setMenu({
      id: b.id,
      mode: 'menu',
      left: r.left,
      ...(above ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
    })
  }

  async function saveIdentity(id: string, op: () => Promise<string | null>) {
    setMenu(null)
    setSavingId(id)
    setError(null)
    const e = await op()
    setSavingId(null)
    if (e) setError(e)
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const id = uploadFor.current
    e.target.value = ''
    if (!file || !id) return
    setSavingId(id)
    setError(null)
    const made = await logoFromFile(file)
    if ('error' in made) {
      setSavingId(null)
      setError(made.error)
      return
    }
    await saveIdentity(id, () => setLogo(id, made.logo))
  }

  const menuBusiness = menu ? businesses.find((b) => b.id === menu.id) : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={s.intro}>
        Keep a farm, a shop or a side gig apart from your personal spending. Tag any transaction
        with one, or just say it when you log (&ldquo;for the farm&rdquo;). Anything untagged is
        Personal. Click a business&rsquo;s tile to give it a logo or an icon.
      </div>

      {loaded && businesses.length > 0 && (
        <div style={s.list}>
          {businesses.map((b) => (
            <div key={b.id} style={s.row}>
              {editing?.id === b.id ? (
                <form
                  style={s.inline}
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (editing.name.trim())
                      void run(
                        () => rename(b.id, editing.name),
                        () => setEditing(null),
                      )
                  }}
                >
                  <BusinessMark business={b} size={MARK} />
                  <input
                    autoFocus
                    value={editing.name}
                    maxLength={60}
                    onChange={(e) => setEditing({ id: b.id, name: e.target.value })}
                    style={{ ...s.input, flex: 1 }}
                    aria-label="Business name"
                  />
                  <button type="submit" style={s.primary} disabled={busy || !editing.name.trim()}>
                    Save
                  </button>
                  <button type="button" style={s.ghost} onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </form>
              ) : confirmDelete === b.id ? (
                <div style={s.inline}>
                  <BusinessMark business={b} size={MARK} />
                  <span style={{ flex: 1, fontSize: 13, color: colors.ink2 }}>
                    Delete <b>{b.name}</b>? Its transactions go back to Personal.
                  </span>
                  <button
                    type="button"
                    style={s.danger}
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => remove(b.id),
                        () => setConfirmDelete(null),
                      )
                    }
                  >
                    Delete
                  </button>
                  <button type="button" style={s.ghost} onClick={() => setConfirmDelete(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={(e) => toggleMenu(b, e.currentTarget)}
                    disabled={savingId === b.id}
                    style={{ ...s.markBtn, opacity: savingId === b.id ? 0.5 : 1 }}
                    aria-haspopup="menu"
                    aria-expanded={menu?.id === b.id}
                    aria-label={`Logo for ${b.name}. Change it`}
                    title="Change logo or icon"
                  >
                    <BusinessMark business={b} size={MARK} />
                  </button>
                  <span style={s.name}>{b.name}</span>
                  <button
                    type="button"
                    style={s.ghost}
                    onClick={() => setEditing({ id: b.id, name: b.name })}
                  >
                    Rename
                  </button>
                  <button type="button" style={s.ghost} onClick={() => setConfirmDelete(b.id)}>
                    Delete
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {menu && menuBusiness && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`${menuBusiness.name} logo`}
          style={{
            ...s.menu,
            left: menu.left,
            top: menu.top,
            bottom: menu.bottom,
          }}
        >
          {menu.mode === 'menu' ? (
            <>
              <button
                type="button"
                role="menuitem"
                style={s.menuItem}
                className="row-hover"
                onClick={() => {
                  uploadFor.current = menuBusiness.id
                  setMenu(null)
                  fileRef.current?.click()
                }}
              >
                Upload logo
              </button>
              <button
                type="button"
                role="menuitem"
                style={s.menuItem}
                className="row-hover"
                onClick={() => setMenu({ ...menu, mode: 'icons' })}
              >
                Choose icon
              </button>
              {isBusinessLogo(menuBusiness.logo) && (
                <button
                  type="button"
                  role="menuitem"
                  style={{ ...s.menuItem, color: colors.destructive }}
                  className="row-hover"
                  onClick={() =>
                    void saveIdentity(menuBusiness.id, () => setLogo(menuBusiness.id, null))
                  }
                >
                  Remove logo
                </button>
              )}
            </>
          ) : (
            <div style={s.iconGrid}>
              {BUSINESS_ICONS.map((icon: BusinessIconKey) => {
                const current =
                  !isBusinessLogo(menuBusiness.logo) && businessIcon(menuBusiness) === icon
                const label = t(`business.icon.${icon}`)
                return (
                  <button
                    key={icon}
                    type="button"
                    role="menuitemradio"
                    aria-checked={current}
                    aria-label={label}
                    title={label}
                    onClick={() =>
                      void saveIdentity(menuBusiness.id, () => setIcon(menuBusiness.id, icon))
                    }
                    style={{
                      ...s.iconCell,
                      border: `2px solid ${current ? colors.primary : 'transparent'}`,
                    }}
                  >
                    <BusinessGlyph icon={icon} size={20} color={colors.primary} />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => void onFile(e)}
        style={{ display: 'none' }}
        aria-hidden="true"
        tabIndex={-1}
      />

      <form
        style={s.inline}
        onSubmit={(e) => {
          e.preventDefault()
          if (newName.trim())
            void run(
              () => create(newName),
              () => setNewName(''),
            )
        }}
      >
        <input
          value={newName}
          maxLength={60}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={businesses.length ? 'Add another business' : 'Name a business, e.g. Farm'}
          style={{ ...s.input, flex: 1 }}
          aria-label="New business name"
        />
        <button type="submit" style={s.primary} disabled={busy || !newName.trim()}>
          Add
        </button>
      </form>
      {error && <div style={s.error}>{error}</div>}
    </div>
  )
}

const MARK = 30

const s: Record<string, React.CSSProperties> = {
  intro: { fontSize: 12.5, lineHeight: 1.55, color: colors.ink3, fontFamily: font.sans },
  list: {
    display: 'flex',
    flexDirection: 'column',
    border: `0.5px solid ${colors.line}`,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    borderTop: `0.5px solid ${colors.line}`,
    marginTop: -0.5,
    fontFamily: font.sans,
  },
  markBtn: {
    padding: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    borderRadius: Math.round(MARK * 0.28),
    flex: 'none',
    display: 'flex',
  },
  name: { flex: 1, fontSize: 13.5, fontWeight: 600, color: colors.ink },
  inline: { display: 'flex', alignItems: 'center', gap: 8, flex: 1 },
  input: {
    padding: '8px 12px',
    border: `0.5px solid ${colors.line}`,
    borderRadius: radius.md,
    fontFamily: font.sans,
    fontSize: 13,
    color: colors.ink,
    outline: 'none',
    background: colors.surface2,
  },
  primary: {
    padding: '8px 14px',
    background: colors.accent,
    color: '#fff',
    border: 'none',
    borderRadius: radius.md,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: font.sans,
  },
  ghost: {
    padding: '6px 10px',
    background: 'transparent',
    color: colors.ink3,
    border: 'none',
    borderRadius: radius.md,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: font.sans,
  },
  danger: {
    padding: '8px 14px',
    background: colors.destructive,
    color: '#fff',
    border: 'none',
    borderRadius: radius.md,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: font.sans,
  },
  error: {
    padding: '8px 12px',
    background: colors.destructiveLight,
    color: colors.destructive,
    borderRadius: radius.md,
    fontSize: 12.5,
    fontFamily: font.sans,
  },
  // Same floating surface as the month picker's dropdown.
  menu: {
    position: 'fixed',
    minWidth: 170,
    background: '#fff',
    border: `0.5px solid ${colors.line}`,
    borderRadius: 10,
    boxShadow: '0 12px 40px rgba(40,36,28,0.10)',
    padding: 4,
    zIndex: 50,
    fontFamily: font.sans,
  },
  menuItem: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '8px 10px',
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontFamily: font.sans,
    fontSize: 13,
    fontWeight: 600,
    color: colors.ink2,
  },
  iconGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 40px)',
    gap: 6,
    padding: 4,
  },
  iconCell: {
    width: 40,
    height: 40,
    borderRadius: 11,
    background: colors.primaryLight,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
}
