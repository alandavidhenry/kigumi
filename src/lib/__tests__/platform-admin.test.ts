import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getPlatformAdminContext,
  isCurrentUserPlatformAdmin,
  isPlatformAdmin,
  platformAdminEmails
} from '@/lib/platform-admin'
import { getSession } from '@/lib/tenant-context'

vi.mock('@/lib/tenant-context', () => ({ getSession: vi.fn() }))
vi.mock('react', () => ({ cache: <T>(fn: T) => fn }))

const session = (email: string, emailVerified = true) =>
  ({
    user: { id: 'u1', name: 'Pat', email, emailVerified },
    session: {}
  }) as never

beforeEach(() => {
  vi.stubEnv('PLATFORM_ADMIN_EMAILS', ' Admin@Kigumi.test , second@kigumi.test')
})
afterEach(() => vi.unstubAllEnvs())

describe('platformAdminEmails', () => {
  it('parses a comma-separated list, trimmed and lower-cased', () => {
    expect(platformAdminEmails()).toEqual([
      'admin@kigumi.test',
      'second@kigumi.test'
    ])
  })

  it('is empty when unset, so nobody is an admin by default', () => {
    vi.stubEnv('PLATFORM_ADMIN_EMAILS', '')
    expect(platformAdminEmails()).toEqual([])
  })
})

describe('isPlatformAdmin', () => {
  it('matches case-insensitively', () => {
    expect(
      isPlatformAdmin({ email: 'ADMIN@kigumi.test', emailVerified: true })
    ).toBe(true)
  })

  it('never trusts an unverified address', () => {
    expect(
      isPlatformAdmin({ email: 'admin@kigumi.test', emailVerified: false })
    ).toBe(false)
  })

  it('rejects everyone else', () => {
    expect(
      isPlatformAdmin({ email: 'owner@kigumi.test', emailVerified: true })
    ).toBe(false)
  })
})

describe('getPlatformAdminContext', () => {
  it('401s when signed out', async () => {
    vi.mocked(getSession).mockResolvedValue(null)
    await expect(getPlatformAdminContext()).rejects.toMatchObject({
      code: 'UNAUTHORIZED'
    })
  })

  it('404s for non-admins so the surface is not discoverable', async () => {
    vi.mocked(getSession).mockResolvedValue(session('owner@kigumi.test'))
    await expect(getPlatformAdminContext()).rejects.toMatchObject({
      code: 'NOT_FOUND'
    })
  })

  it('returns the admin', async () => {
    vi.mocked(getSession).mockResolvedValue(session('admin@kigumi.test'))
    expect(await getPlatformAdminContext()).toEqual({
      userId: 'u1',
      userName: 'Pat',
      userEmail: 'admin@kigumi.test'
    })
  })

  it('reports admin status for the nav', async () => {
    vi.mocked(getSession).mockResolvedValue(session('admin@kigumi.test'))
    expect(await isCurrentUserPlatformAdmin()).toBe(true)
    vi.mocked(getSession).mockResolvedValue(null)
    expect(await isCurrentUserPlatformAdmin()).toBe(false)
  })
})
