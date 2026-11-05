import { headerRules } from './security-headers.mjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  generateEtags: false,
  images: {
    unoptimized: true
  },
  // Loaded at runtime by src/instrumentation.ts; OpenTelemetry patches Node
  // modules and must not be bundled.
  serverExternalPackages: ['@azure/monitor-opentelemetry'],
  async headers() {
    return headerRules({
      isDev: process.env.NODE_ENV === 'development',
      appUrl: process.env.BETTER_AUTH_URL
    })
  }
}

export default nextConfig
