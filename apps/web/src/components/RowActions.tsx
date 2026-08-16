'use client'
import { Icon } from './Icons'

/**
 * The explicit Edit / Delete pair on a list row (transactions, recurring
 * rules). Rows themselves are inert — clicking a line never opens or
 * destroys anything (owner, Aug 16 2026). Styling lives in globals.css
 * (`.row-actions`, `.row-action-btn`): quiet at rest, forward on hover
 * or keyboard focus of the row.
 */
export function RowActions({
  onEdit,
  onDelete,
  editLabel = 'Edit',
  deleteLabel = 'Delete',
}: {
  onEdit: () => void
  onDelete?: () => void
  editLabel?: string
  deleteLabel?: string
}) {
  return (
    <div className="row-actions">
      <button
        type="button"
        className="row-action-btn"
        onClick={(e) => {
          e.stopPropagation()
          onEdit()
        }}
        title={editLabel}
        aria-label={editLabel}
      >
        <Icon.pencil size={15} />
      </button>
      {onDelete && (
        <button
          type="button"
          className="row-action-btn danger"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          title={deleteLabel}
          aria-label={deleteLabel}
        >
          <Icon.trash size={15} />
        </button>
      )}
    </div>
  )
}
