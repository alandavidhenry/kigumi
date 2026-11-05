// Cross-site request check for mutating API calls, run by src/proxy.ts.
//
// Session cookies are SameSite=Lax, which already stops another site posting
// with them. This is defence in depth for what Lax allows: a sibling subdomain
// (same "site") and older browsers. A browser always sends Origin, and modern
// ones Sec-Fetch-Site, on a POST/PUT/PATCH/DELETE; requests without either come
// from non-browser clients (the cron job, scripts, API tests), which cookies
// can't be tricked into, so they pass and get the usual auth checks.

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export interface OriginCheckInput {
  method: string
  origin: string | null
  secFetchSite: string | null
  // The Host the request was sent to, and the configured public app URL.
  host: string | null
  appUrl: string | undefined
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

export function isCrossSiteMutation(input: OriginCheckInput): boolean {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return false

  // Fetch metadata, when the browser sends it, is the clearest signal.
  // "none" is a user-initiated request (typed URL, bookmark).
  if (
    input.secFetchSite &&
    input.secFetchSite !== 'same-origin' &&
    input.secFetchSite !== 'none'
  ) {
    return true
  }

  if (!input.origin) return false
  if (input.origin === 'null') return true
  const originHost = hostOf(input.origin)
  if (!originHost) return true
  const allowed = [input.host, hostOf(input.appUrl)].filter(Boolean)
  return !allowed.includes(originHost)
}
