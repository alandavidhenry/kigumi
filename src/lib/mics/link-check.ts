// Spec-sheet link checker (ADR 0008, decision 3). The only automated fetch the
// catalogue makes: HEAD requests only, robots.txt and Crawl-delay respected,
// an identifying user agent, rate limited per host. Never runs on a request.

export const LINK_CHECK_USER_AGENT =
  'KigumiLinkChecker/1.0 (+spec-sheet link verification; contact via kigumi site)'

export interface RobotsRules {
  disallow: string[]
  allow: string[]
  crawlDelaySeconds: number | null
}

// Picks the group for our agent, else the `*` group. Enough of the format for
// Disallow / Allow / Crawl-delay.
export function parseRobots(text: string, agent = 'kigumilinkchecker') {
  const groups: Array<{ agents: string[]; rules: RobotsRules }> = []
  let current: (typeof groups)[number] | null = null
  let lastWasAgent = false

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim()
    if (!line) continue
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const key = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()

    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = {
          agents: [],
          rules: { disallow: [], allow: [], crawlDelaySeconds: null }
        }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
      continue
    }
    lastWasAgent = false
    if (!current) continue
    if (key === 'disallow' && value) current.rules.disallow.push(value)
    else if (key === 'allow' && value) current.rules.allow.push(value)
    else if (key === 'crawl-delay') {
      const seconds = Number(value)
      if (Number.isFinite(seconds) && seconds >= 0) {
        current.rules.crawlDelaySeconds = seconds
      }
    }
  }

  const specific = groups.find((group) =>
    group.agents.some((name) => name !== '*' && agent.includes(name))
  )
  const fallback = groups.find((group) => group.agents.includes('*'))
  return (
    specific?.rules ??
    fallback?.rules ?? { disallow: [], allow: [], crawlDelaySeconds: null }
  )
}

// Longest matching rule wins; Allow beats Disallow on a tie.
export function isPathAllowed(rules: RobotsRules, path: string): boolean {
  const match = (list: string[]) =>
    list
      .filter((rule) => path.startsWith(rule.replace(/\*$/, '')))
      .reduce((longest, rule) => Math.max(longest, rule.length), -1)
  const disallowed = match(rules.disallow)
  if (disallowed < 0) return true
  return match(rules.allow) >= disallowed
}

export type LinkStatus =
  | { url: string; state: 'ok'; httpStatus: number }
  | { url: string; state: 'broken'; httpStatus: number | null; detail: string }
  | { url: string; state: 'skipped'; detail: string }

export interface LinkCheckOptions {
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  minDelayMs?: number
  userAgent?: string
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function checkLinks(
  urls: readonly string[],
  {
    fetchImpl = fetch,
    sleep = defaultSleep,
    minDelayMs = 2000,
    userAgent = LINK_CHECK_USER_AGENT
  }: LinkCheckOptions = {}
): Promise<LinkStatus[]> {
  const robotsByHost = new Map<string, RobotsRules>()
  const lastRequestAt = new Map<string, number>()
  const results: LinkStatus[] = []

  const rulesFor = async (origin: string): Promise<RobotsRules> => {
    const cached = robotsByHost.get(origin)
    if (cached) return cached
    let rules: RobotsRules = {
      disallow: [],
      allow: [],
      crawlDelaySeconds: null
    }
    try {
      const response = await fetchImpl(`${origin}/robots.txt`, {
        headers: { 'user-agent': userAgent }
      })
      if (response.ok) rules = parseRobots(await response.text())
    } catch {
      // No readable robots.txt: treated as no restrictions, still rate limited.
    }
    robotsByHost.set(origin, rules)
    return rules
  }

  for (const url of [...new Set(urls)]) {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      results.push({
        url,
        state: 'broken',
        httpStatus: null,
        detail: 'Invalid URL'
      })
      continue
    }
    const rules = await rulesFor(parsed.origin)
    if (!isPathAllowed(rules, parsed.pathname)) {
      results.push({ url, state: 'skipped', detail: 'Blocked by robots.txt' })
      continue
    }

    const delay = Math.max(minDelayMs, (rules.crawlDelaySeconds ?? 0) * 1000)
    const wait = (lastRequestAt.get(parsed.host) ?? 0) + delay - Date.now()
    if (wait > 0) await sleep(wait)
    lastRequestAt.set(parsed.host, Date.now())

    try {
      const response = await fetchImpl(url, {
        method: 'HEAD',
        redirect: 'follow',
        headers: { 'user-agent': userAgent }
      })
      results.push(
        response.ok
          ? { url, state: 'ok', httpStatus: response.status }
          : {
              url,
              state: 'broken',
              httpStatus: response.status,
              detail: `HTTP ${response.status}`
            }
      )
    } catch (error) {
      results.push({
        url,
        state: 'broken',
        httpStatus: null,
        detail: error instanceof Error ? error.message : 'Request failed'
      })
    }
  }
  return results
}
