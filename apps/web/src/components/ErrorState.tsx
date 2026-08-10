import { colors, font, radius, spacing } from '../lib/theme'
import { Icon } from './Icons'

/**
 * The missing third state (fix-plan item 2.13 / audit 08-F21, 08-F22,
 * 08-F23, 08-F30, 08-F31): every dashboard page's read path rendered
 * exactly two states — loading, then whatever the query returned — so a
 * Supabase outage and "you have no data yet" were visually identical.
 * `lib/data.ts`'s readers now throw a `DataFetchError` instead of
 * `return data ?? []` on a failed read, caught by
 * `apps/web/src/app/dashboard/error.tsx` (which renders this
 * component) for the RSC pages; the client pages below fetch directly
 * and destructure `{ data, error }` themselves, rendering this same
 * component inline on `error`. A page distinguishes the three states
 * itself (loading / `<ErrorState>` / the honest empty-state string) —
 * this component is only the shared shape for the middle one, so "we
 * couldn't load your data" reads the same everywhere instead of each
 * page inventing its own wording.
 *
 * Deliberately visually distinct from a plain empty-state string: a
 * warm-destructive icon + a Retry affordance, never just gray centered
 * text — a user scanning past should be able to tell "something failed"
 * from "there's nothing here yet" without reading the copy.
 */
export function ErrorState({
  message = "We couldn't load your data.",
  detail,
  onRetry,
  retryLabel = 'Retry',
  compact = false,
}: {
  message?: string
  /** Optional second line — e.g. the raw Postgrest/network error message.
   *  Safe to omit; most callers just want the honest headline. */
  detail?: string | null
  onRetry?: () => void
  retryLabel?: string
  /** Tighter padding for a card/row-scale slot instead of a full page
   *  section (e.g. Settings' account card vs. the Transactions table body). */
  compact?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: compact ? '20px 16px' : '48px 20px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: radius.full,
          background: colors.destructiveLight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <WarningGlyph color={colors.destructive} />
      </div>
      <div style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: colors.ink }}>
        {message}
      </div>
      {detail && (
        <div style={{ fontFamily: font.sans, fontSize: 12, color: colors.ink3, maxWidth: 380 }}>
          {detail}
        </div>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginTop: spacing.xs,
            padding: '7px 14px',
            borderRadius: radius.md,
            border: `0.5px solid ${colors.lineHard}`,
            background: colors.card,
            color: colors.ink,
            fontFamily: font.sans,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Icon.refresh color={colors.ink} size={13} />
          {retryLabel}
        </button>
      )}
    </div>
  )
}

function WarningGlyph({ color }: { color: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3l10 18H2L12 3z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 10v4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="17" r="0.9" fill={color} />
    </svg>
  )
}
