// Response security headers, applied to every route by next.config.mjs and
// unit tested in src/lib/__tests__/security-headers.test.ts.
//
// The CSP is static (Next's "without nonces" pattern): a nonce would force
// every page to render dynamically. 'unsafe-inline' scripts are needed for
// Next's hydration payload and the anti-FOUC theme script. The policy still
// stops framing, plugins, <base> hijacking, off-site form posts and data being
// sent to other origins. Uploaded files (/api/attachments) set their own,
// stricter policy, so the page policy is not applied there.

/**
 * @param {{ isDev: boolean, appUrl: string | undefined }} options
 */
export function buildCsp({ isDev, appUrl }) {
  const https = (appUrl ?? '').startsWith('https://')
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    // Dev needs the HMR websocket.
    `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ['upgrade-insecure-requests'] : [])
  ]
  return directives.join('; ')
}

/**
 * @param {{ appUrl: string | undefined }} options
 * @returns {{ key: string, value: string }[]}
 */
export function securityHeaders({ appUrl }) {
  const https = (appUrl ?? '').startsWith('https://')
  return [
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    {
      key: 'Permissions-Policy',
      value:
        'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()'
    },
    // Only over HTTPS: HSTS on an http origin is ignored at best.
    ...(https
      ? [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains'
          }
        ]
      : [])
  ]
}

/**
 * The `headers()` entries for next.config.mjs.
 * @param {{ isDev: boolean, appUrl: string | undefined }} options
 */
export function headerRules(options) {
  return [
    { source: '/:path*', headers: securityHeaders(options) },
    {
      // Everything except uploaded files, which carry their own sandbox CSP.
      source: '/((?!api/attachments/).*)',
      headers: [{ key: 'Content-Security-Policy', value: buildCsp(options) }]
    }
  ]
}
