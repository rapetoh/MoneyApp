'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '../../lib/supabase/client'
import { colors, font, fontSize, spacing, radius } from '../../lib/theme'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const authError = searchParams.get('error')
  const supabase = createClient()

  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(
    authError === 'auth_failed' ? 'Authentication failed. Please try again.' : null,
  )
  const [success, setSuccess] = useState<string | null>(null)

  async function handleGoogleSignIn() {
    setGoogleLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) {
      setError(error.message)
      setGoogleLoading(false)
    }
    // On success, browser redirects — no further action needed
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
        setLoading(false)
      } else {
        router.push('/dashboard')
        router.refresh()
      }
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
        setLoading(false)
      } else {
        setSuccess('Check your email to confirm your account, then sign in.')
        setLoading(false)
        setMode('signin')
      }
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logo}>
          <div style={styles.logoMark} />
          <span style={styles.logoText}>Voice Expense</span>
        </div>

        <h1 style={styles.heading}>
          {mode === 'signin' ? 'Welcome back' : 'Create account'}
        </h1>
        <p style={styles.subheading}>
          {mode === 'signin' ? 'Sign in to your dashboard' : 'Start tracking your expenses'}
        </p>

        {error && <div style={styles.errorBox}>{error}</div>}
        {success && <div style={styles.successBox}>{success}</div>}

        {/* Google sign-in */}
        <button
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
          style={styles.googleBtn}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
          </svg>
          {googleLoading ? 'Redirecting…' : 'Continue with Google'}
        </button>

        {/* Divider */}
        <div style={styles.divider}>
          <div style={styles.dividerLine} />
          <span style={styles.dividerText}>or</span>
          <div style={styles.dividerLine} />
        </div>

        {/* Email / password */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={styles.input}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={styles.input}
              placeholder="••••••••"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </div>
          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p style={styles.switchText}>
          {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null) }}
            style={styles.switchLink}
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
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
  logoMark: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    background: colors.primary,
  },
  logoText: {
    fontFamily: font.sans,
    fontWeight: 700,
    fontSize: fontSize.md,
    color: colors.text,
  },
  heading: {
    fontFamily: font.sans,
    fontWeight: 700,
    fontSize: fontSize['2xl'],
    color: colors.text,
  },
  subheading: {
    fontFamily: font.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: -spacing.sm,
  },
  googleBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    padding: `${spacing.sm}px ${spacing.md}px`,
    fontFamily: font.sans,
    fontWeight: 600,
    fontSize: fontSize.base,
    color: colors.text,
    background: colors.card,
    width: '100%',
    cursor: 'pointer',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: colors.border,
  },
  dividerText: {
    fontFamily: font.sans,
    fontSize: fontSize.sm,
    color: colors.textMuted,
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
  switchText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  switchLink: {
    background: 'none',
    border: 'none',
    color: colors.primary,
    fontWeight: 600,
    fontSize: fontSize.sm,
    padding: 0,
    cursor: 'pointer',
  },
  errorBox: {
    background: colors.destructiveLight,
    border: `1px solid ${colors.destructive}`,
    borderRadius: radius.md,
    padding: `${spacing.sm}px ${spacing.md}px`,
    fontSize: fontSize.sm,
    color: colors.destructive,
  },
  successBox: {
    background: colors.incomeLight,
    border: `1px solid ${colors.income}`,
    borderRadius: radius.md,
    padding: `${spacing.sm}px ${spacing.md}px`,
    fontSize: fontSize.sm,
    color: colors.income,
  },
}
