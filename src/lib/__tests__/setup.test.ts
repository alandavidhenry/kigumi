import { beforeEach, describe, expect, it, vi } from 'vitest'

import { recordAudit } from '@/lib/audit'
import { getSetupProgress } from '@/lib/setup'
import { tenantDb } from '@/lib/tenant-db'
import { makeContext, makeFakeDb, type FakeDb } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

vi.mock('@/lib/tenant-db', () => ({ tenantDb: vi.fn() }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  default: {
    organization: { findUnique: vi.fn(), updateMany: vi.fn() }
  }
}))
vi.mock('@/lib/tenant-context', async () => {
  const { forbidden } = await import('@/lib/errors')
  const { hasPermission } = await import('@/types/rbac')
  return {
    requirePermission: (ctx: { role: MemberRole }, permission: never) => {
      if (!hasPermission(ctx.role, permission)) throw forbidden()
    }
  }
})

let db: FakeDb

function counts(c: Partial<Record<string, number>>) {
  db.studio.count.mockResolvedValue(c.studio ?? 0)
  db.room.count.mockResolvedValue(c.room ?? 0)
  db.microphoneUnit.count.mockResolvedValue(c.mic ?? 0)
  db.console.count.mockResolvedValue(c.console ?? 0)
  db.recordingSession.count.mockResolvedValue(c.session ?? 0)
}

beforeEach(() => {
  vi.clearAllMocks()
  db = makeFakeDb()
  vi.mocked(tenantDb).mockReturnValue(db as never)
})

describe('getSetupProgress', () => {
  it('starts with nothing done', async () => {
    counts({})
    const progress = await getSetupProgress(makeContext())
    expect(progress.steps).toEqual({
      studio: false,
      rooms: false,
      mics: false,
      desk: false,
      session: false
    })
    expect(progress.complete).toBe(false)
  })

  it('ticks only the steps with data', async () => {
    counts({ studio: 1, room: 2, mic: 3 })
    const progress = await getSetupProgress(makeContext())
    expect(progress.steps).toMatchObject({
      studio: true,
      rooms: true,
      mics: true,
      desk: false,
      session: false
    })
    expect(progress).toMatchObject({ studios: 1, rooms: 2, micUnits: 3 })
    expect(progress.complete).toBe(false)
  })

  it('is complete when every step has data', async () => {
    counts({ studio: 1, room: 1, mic: 1, console: 1, session: 1 })
    expect((await getSetupProgress(makeContext())).complete).toBe(true)
  })

  it('is readable by a viewer', async () => {
    counts({})
    await expect(
      getSetupProgress(makeContext({ role: MemberRole.VIEWER }))
    ).resolves.toBeDefined()
  })
})

describe('first-run setup gate', () => {
  it('requires setup only for managers of an unresolved organisation', async () => {
    const { isSetupRequired } = await import('@/lib/setup')
    const prisma = (await import('@/lib/prisma')).default
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({
      setupResolvedAt: null
    } as never)
    expect(await isSetupRequired(makeContext({ role: MemberRole.OWNER }))).toBe(
      true
    )
    expect(
      await isSetupRequired(makeContext({ role: MemberRole.MANAGER }))
    ).toBe(true)
    expect(
      await isSetupRequired(makeContext({ role: MemberRole.ENGINEER }))
    ).toBe(false)
    expect(
      await isSetupRequired(makeContext({ role: MemberRole.VIEWER }))
    ).toBe(false)
  })

  it('is not required once resolved', async () => {
    const { isSetupRequired } = await import('@/lib/setup')
    const prisma = (await import('@/lib/prisma')).default
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({
      setupResolvedAt: new Date()
    } as never)
    expect(await isSetupRequired(makeContext())).toBe(false)
  })

  it('resolves once and audits only the first time', async () => {
    const { resolveSetup } = await import('@/lib/setup')
    const prisma = (await import('@/lib/prisma')).default
    vi.mocked(prisma.organization.updateMany).mockResolvedValueOnce({
      count: 1
    })
    await resolveSetup(makeContext(), 'skipped')
    expect(recordAudit).toHaveBeenCalledTimes(1)
    vi.mocked(prisma.organization.updateMany).mockResolvedValueOnce({
      count: 0
    })
    await resolveSetup(makeContext(), 'finished')
    expect(recordAudit).toHaveBeenCalledTimes(1)
  })

  it('refuses people who cannot manage studios', async () => {
    const { resolveSetup } = await import('@/lib/setup')
    await expect(
      resolveSetup(makeContext({ role: MemberRole.VIEWER }), 'skipped')
    ).rejects.toThrow()
  })
})
