import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { UndoSnackbar } from '../components/UndoSnackbar'

interface PendingUndo {
  id: number
  message: string
  undo: () => void | Promise<void>
  undoLabel?: string
  durationMs?: number
}

interface UndoContextValue {
  /**
   * Enqueue a snackbar. If another snackbar is already showing, it's replaced
   * (matches iOS / design-doc behavior — only one undo at a time; the older
   * action commits silently).
   */
  showUndo: (params: Omit<PendingUndo, 'id'>) => void
  /** Programmatically dismiss without firing the undo callback. */
  dismissUndo: () => void
}

const UndoContext = createContext<UndoContextValue | null>(null)

/**
 * App-level undo queue. Wrap the root layout with <UndoProvider> and call
 * useUndo() from any child to show a "Saved · Blue Bottle $12.40  Undo"
 * snackbar after a destructive or non-obvious action. See docs/DESIGN.md §3
 * Motion and §5 Today.
 */
export function UndoProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingUndo | null>(null)

  const showUndo = useCallback<UndoContextValue['showUndo']>((params) => {
    setPending({ id: Date.now(), ...params })
  }, [])

  const dismissUndo = useCallback(() => {
    setPending(null)
  }, [])

  const value = useMemo<UndoContextValue>(() => ({ showUndo, dismissUndo }), [showUndo, dismissUndo])

  return (
    <UndoContext.Provider value={value}>
      {children}
      {pending && (
        // `key` ensures a new snackbar fully remounts when the message changes,
        // resetting its progress animation.
        <UndoSnackbar
          key={pending.id}
          message={pending.message}
          undoLabel={pending.undoLabel}
          durationMs={pending.durationMs}
          onUndo={async () => {
            await pending.undo()
            setPending((cur) => (cur && cur.id === pending.id ? null : cur))
          }}
          onDismiss={() => {
            setPending((cur) => (cur && cur.id === pending.id ? null : cur))
          }}
        />
      )}
    </UndoContext.Provider>
  )
}

export function useUndo(): UndoContextValue {
  const ctx = useContext(UndoContext)
  if (!ctx) {
    throw new Error('useUndo must be called inside <UndoProvider>')
  }
  return ctx
}
