import { NextResponse } from 'next/server'
import { createClient } from '../../../lib/supabase/server'
import { publicOrigin } from '../../../lib/publicOrigin'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  // The address the browser used, not the server's own (desktop gateway,
  // see lib/publicOrigin.ts).
  const origin = publicOrigin(request)
  const code = searchParams.get('code')
  const nextParam = searchParams.get('next')
  // Only honour same-origin paths — `next` comes from the query string
  const next = nextParam?.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
