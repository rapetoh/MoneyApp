import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@voice-expense/shared', '@voice-expense/ai'],
  allowedDevOrigins: ['192.168.1.5'],
}

export default nextConfig
