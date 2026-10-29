'use client'
import { useState } from 'react'
import { colors, font, radius } from '../lib/theme'
import { useBusinesses } from '../lib/businesses'

/**
 * Settings > Businesses (docs/businesses.md): the side businesses kept apart
 * from personal spending. Add, rename, delete. Deleting moves that
 * business's transactions back to Personal; nothing is lost.
 */
export function BusinessesCard() {
  const { businesses, loaded, create, rename, remove } = useBusinesses()
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(op: () => Promise<string | null>, after?: () => void) {
    setBusy(true)
    setError(null)
    const e = await op()
    setBusy(false)
    if (e) setError(e)
    else after?.()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={s.intro}>
        Keep a farm, a shop or a side gig apart from your personal spending. Tag any transaction
        with one, or just say it when you log (&ldquo;for the farm&rdquo;). Anything untagged is
        Personal.
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
                  <span style={s.dot} aria-hidden />
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
  dot: { width: 8, height: 8, borderRadius: 4, background: colors.accent, flex: 'none' },
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
}
