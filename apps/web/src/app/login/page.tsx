'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '../../lib/supabase/client'
import { colors, font, fontSize, spacing, radius } from '../../lib/theme'
import { MurmurMark } from '../../components/MurmurMark'

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
  const [appleLoading, setAppleLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [error, setError] = useState<string | null>(
    // Supabase's own callback error doesn't say *why* the exchange failed
    // (expired code, provider not configured, network drop) — this is as
    // specific as an honest client-side message can be without guessing.
    authError === 'auth_failed'
      ? "We couldn't complete that sign-in. The link may have expired - try again."
      : null,
  )
  const [success, setSuccess] = useState<string | null>(null)

  // Fix-plan 3.2 / audit 08-F9: "mirror the button ordering rule from
  // mobile" — mobile leads with Sign in with Apple on iOS (Apple guideline
  // 4.8) and Google everywhere else. Web has no platform check until the
  // browser reports one, so this starts as the Google-first order and
  // flips after mount if the user agent looks like macOS/iOS — the
  // audience most likely to have an Apple-created account (and the one
  // this fix exists for, since desktop is Electron-on-macOS today).
  const [appleFirst, setAppleFirst] = useState(false)
  useEffect(() => {
    if (/Mac|iPhone|iPad|iPod/.test(window.navigator.userAgent)) setAppleFirst(true)
  }, [])

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

  // Fix-plan 3.2 / audit 08-F9: the web login page offered exactly one
  // OAuth provider, so an Apple-created account (`@privaterelay.appleid.com`,
  // no password) could never sign into web or desktop — the headline Plus
  // benefit being sold on the paired mobile screen. Same PKCE redirect
  // flow as Google above.
  async function handleAppleSignIn() {
    setAppleLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) {
      setError(error.message)
      setAppleLoading(false)
    }
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

  // Fix-plan 3.2 / audit 08-F7: there was no password-reset flow anywhere
  // in the product. `redirectTo` reuses the existing OAuth callback route
  // with `?next=/auth/reset` so the recovery code exchange (PKCE) happens
  // in one place instead of a second copy of `exchangeCodeForSession`.
  async function handleForgotPassword() {
    setError(null)
    setSuccess(null)
    if (!email) {
      setError('Enter your email above first.')
      return
    }
    setResetLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/auth/reset')}`,
    })
    setResetLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setSuccess(`We sent a password reset link to ${email}. Open it in this browser to set a new password.`)
    }
  }

  const appleBtn = (
    <button
      key="apple"
      onClick={handleAppleSignIn}
      disabled={appleLoading}
      style={styles.appleBtn}
      type="button"
    >
      <svg width="16" height="18" viewBox="0 0 16 18" style={{ flexShrink: 0 }} aria-hidden>
        <path
          fill="currentColor"
          d="M13.15 9.6c-.02-2.1 1.72-3.1 1.8-3.15-1-1.44-2.53-1.64-3.08-1.66-1.3-.13-2.55.77-3.2.77-.67 0-1.68-.75-2.77-.73C4.45 4.85 3.1 5.63 2.36 6.9c-1.52 2.62-.39 6.5 1.08 8.63.72 1.04 1.58 2.2 2.7 2.16 1.09-.04 1.5-.7 2.82-.7s1.68.7 2.83.68c1.17-.02 1.91-1.06 2.62-2.11.83-1.2 1.17-2.37 1.19-2.43-.03-.01-2.28-.87-2.3-3.45l-.15-.08zM11 3.15c.6-.72 1-1.72.89-2.72-.86.03-1.9.57-2.52 1.29-.55.63-1.04 1.66-.91 2.63.95.07 1.93-.48 2.54-1.2z"
        />
      </svg>
      {appleLoading ? 'Redirecting…' : 'Continue with Apple'}
    </button>
  )

  const googleBtn = (
    <button
      key="google"
      onClick={handleGoogleSignIn}
      disabled={googleLoading}
      style={styles.googleBtn}
      type="button"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }} aria-hidden>
        <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
        <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
        <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
        <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
      </svg>
      {googleLoading ? 'Redirecting…' : 'Continue with Google'}
    </button>
  )

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logo}>
          <MurmurMark size={48} variant="sage" rounded />
        </div>

        <h1 style={styles.heading}>
          {mode === 'signin' ? 'Welcome back' : 'Create account'}
        </h1>
        <p style={styles.subheading}>
          {mode === 'signin'
            ? 'Speak it. Spend clearly.'
            : 'Start tracking by speaking - no bank linking.'}
        </p>

        {error && <div style={styles.errorBox}>{error}</div>}
        {success && <div style={styles.successBox}>{success}</div>}

        {/* OAuth providers — order mirrors mobile: Apple first on
            macOS/iOS, Google first everywhere else (fix-plan 3.2 /
            audit 08-F9). */}
        <div style={styles.oauthStack}>
          {appleFirst ? [appleBtn, googleBtn] : [googleBtn, appleBtn]}
        </div>

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
          {mode === 'signin' && (
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={resetLoading}
              style={styles.forgotLink}
            >
              {resetLoading ? 'Sending…' : 'Forgot password?'}
            </button>
          )}
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
  oauthStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
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
  appleBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    border: 'none',
    borderRadius: radius.md,
    padding: `${spacing.sm}px ${spacing.md}px`,
    fontFamily: font.sans,
    fontWeight: 600,
    fontSize: fontSize.base,
    color: colors.white,
    background: '#000000',
    width: '100%',
    cursor: 'pointer',
  },
  forgotLink: {
    alignSelf: 'flex-end',
    background: 'none',
    border: 'none',
    color: colors.textSecondary,
    fontFamily: font.sans,
    fontSize: fontSize.sm,
    fontWeight: 600,
    padding: 0,
    marginTop: -spacing.xs,
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
