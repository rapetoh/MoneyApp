'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../../lib/supabase/client'
import { colors, font, fontSize, spacing, radius } from '../../../lib/theme'
import { MurmurMark } from '../../../components/MurmurMark'

/**
 * Password reset, step 2 (web) — fix-plan 3.2 / audit 08-F7.
 *
 * Reached via `/auth/callback?next=/auth/reset`: the callback route
 * already exchanged the recovery `code` for a session and set it on the
 * response cookies (see `apps/web/src/app/auth/callback/route.ts`), so
 * this page only needs to confirm that session exists, collect a new
 * password, and call `updateUser`. If someone opens this URL directly
 * (no code was ever exchanged, or the link already expired), there is no
 * session — that state gets its own honest "link invalid" screen rather
 * than a password form that would fail on submit.
 */
export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()

  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid'>('checking')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setStatus(session ? 'ready' : 'invalid')
    })
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError("Those two passwords don't match.")
      return
    }
    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  if (status === 'checking') {
    return <div style={styles.page} />
  }

  if (status === 'invalid') {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.logo}>
            <MurmurMark size={48} variant="sage" rounded />
          </div>
          <h1 style={styles.heading}>Reset link invalid</h1>
          <p style={styles.subheading}>
            This reset link is invalid or has expired. Request a new one from the sign-in page.
          </p>
          <Link href="/login" style={styles.linkBtn}>
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <MurmurMark size={48} variant="sage" rounded />
        </div>
        <h1 style={styles.heading}>Set a new password</h1>
        <p style={styles.subheading}>Choose a new password for your account.</p>

        {error && <div style={styles.errorBox}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={styles.input}
              placeholder="At least 6 characters"
              autoComplete="new-password"
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Confirm password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              style={styles.input}
              placeholder="Confirm password"
              autoComplete="new-password"
            />
          </div>
          <button type="submit" disabled={submitting} style={styles.button}>
            {submitting ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: colors.background,
    padding: spacing.base,
  },
  card: {
    background: colors.card,
    borderRadius: radius.xl,
    padding: spacing['2xl'],
    width: '100%',
    maxWidth: 420,
    boxShadow: `0 4px 24px ${colors.shadow}`,
    border: `1px solid ${colors.border}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.base,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  heading: {
    fontFamily: font.serif,
    fontWeight: 500,
    fontSize: fontSize['3xl'],
    color: colors.text,
    letterSpacing: -0.6,
  },
  subheading: {
    fontFamily: font.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: -spacing.sm,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  label: {
    fontFamily: font.sans,
    fontWeight: 600,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  input: {
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    padding: `${spacing.sm}px ${spacing.md}px`,
    fontSize: fontSize.base,
    color: colors.text,
    background: colors.background,
    outline: 'none',
  },
  button: {
    background: colors.primary,
    color: colors.white,
    border: 'none',
    borderRadius: radius.md,
    padding: `${spacing.md}px`,
    fontSize: fontSize.base,
    fontWeight: 600,
    marginTop: spacing.xs,
  },
  errorBox: {
    background: colors.destructiveLight,
    border: `1px solid ${colors.destructive}`,
    borderRadius: radius.md,
    padding: `${spacing.sm}px ${spacing.md}px`,
    fontSize: fontSize.sm,
    color: colors.destructive,
  },
  linkBtn: {
    background: colors.primary,
    color: colors.white,
    border: 'none',
    borderRadius: radius.md,
    padding: `${spacing.md}px`,
    fontSize: fontSize.base,
    fontWeight: 600,
    textAlign: 'center',
    textDecoration: 'none',
  },
}
