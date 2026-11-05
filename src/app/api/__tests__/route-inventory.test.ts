import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// Every API route must resolve who is calling before it does anything. Tenant
// routes call getTenantContext(); the few that don't are listed here with how
// they are protected instead. A new route that does neither fails this test,
// and the real-database suite (npm run test:db) fails until it has a
// cross-organisation case.

const PUBLIC_OR_OTHERWISE_PROTECTED: Record<string, string> = {
  'auth/[...all]':
    'Better Auth handler: sessions, rate limits, its own access control',
  health: 'liveness only, touches no data',
  'health/deep': 'bearer CRON_SECRET',
  'cron/reminders': 'bearer CRON_SECRET',
  'cron/housekeeping': 'bearer CRON_SECRET',
  'share/[token]/sheet': 'the share token is the authorisation (ADR 0016)',
  'admin/mics': 'platform admins only (ADR 0012)',
  'admin/mics/[micId]': 'platform admins only (ADR 0012)',
  'admin/mics/[micId]/status': 'platform admins only (ADR 0012)'
}

const GUARDS: Record<string, RegExp> = {
  'health/deep': /assertCronAuthorised\(/,
  'cron/reminders': /assertCronAuthorised\(/,
  'cron/housekeeping': /assertCronAuthorised\(/,
  'share/[token]/sheet': /getSharedSession\(/,
  'admin/mics': /getPlatformAdminContext\(/,
  'admin/mics/[micId]': /getPlatformAdminContext\(/,
  'admin/mics/[micId]/status': /getPlatformAdminContext\(/
}

function routeFiles(): { route: string; source: string }[] {
  const root = path.resolve('src/app/api')
  const found: { route: string; source: string }[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory() && !entry.name.startsWith('__')) walk(full)
      else if (entry.name === 'route.ts') {
        found.push({
          route: path.relative(root, dir).split(path.sep).join('/'),
          source: fs.readFileSync(full, 'utf8')
        })
      }
    }
  }
  walk(root)
  return found
}

describe('API route inventory', () => {
  const routes = routeFiles()

  it('finds the routes', () => {
    expect(routes.length).toBeGreaterThan(60)
  })

  it('every route resolves a tenant context or is a listed exception', () => {
    const unguarded = routes
      .filter(({ route }) => !(route in PUBLIC_OR_OTHERWISE_PROTECTED))
      .filter(({ source }) => !/getTenantContext\(\)/.test(source))
      .map(({ route }) => route)
    expect(unguarded).toEqual([])
  })

  it('each exception really uses its stated guard', () => {
    for (const [route, guard] of Object.entries(GUARDS)) {
      const file = routes.find((r) => r.route === route)
      expect(file, `${route} no longer exists`).toBeDefined()
      expect(file!.source, route).toMatch(guard)
    }
  })

  it('lists no exception that no longer exists', () => {
    const existing = new Set(routes.map((r) => r.route))
    expect(
      Object.keys(PUBLIC_OR_OTHERWISE_PROTECTED).filter((r) => !existing.has(r))
    ).toEqual([])
  })
})
