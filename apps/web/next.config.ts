import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  transpilePackages: ['@voice-expense/shared', '@voice-expense/ai'],
  allowedDevOrigins: ['192.168.1.5'],
  output: 'standalone',
  outputFileTracingRoot: join(here, '../..'),
}

export default nextConfig
