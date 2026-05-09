import { NextResponse } from 'next/server'
import { resolvePlusStatus } from '../../../lib/plus.server'

// Diagnostic endpoint — returns exactly what the server's Plus resolver
// sees at request time. Used to verify whether `MURMUR_DEV_PLUS=1` from
// the user's env file is reaching the spawned Next server.
//
// Visit /api/plus-status while logged in — should report:
//   { isPlus: true, env: { MURMUR_DEV_PLUS: '1', NODE_ENV: 'production' } }
//
// If env shows MURMUR_DEV_PLUS as missing or not '1', the env loader in
// apps/desktop/src/main.ts isn't passing it through.
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    isPlus: resolvePlusStatus().isPlus,
    env: {
      MURMUR_DEV_PLUS: process.env.MURMUR_DEV_PLUS ?? null,
      NODE_ENV: process.env.NODE_ENV ?? null,
      OPENAI_API_KEY_set: Boolean(process.env.OPENAI_API_KEY),
      NEXT_PUBLIC_SUPABASE_URL_set: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    },
  })
}
