import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppError } from '@/lib/errors'
import { getSessionProgress } from '@/lib/sessions/progress'
import { tenantDb } from '@/lib/tenant-db'
import { makeContext, makeFakeDb, type FakeDb } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

vi.mock('@/lib/tenant-db', () => ({ tenantDb: vi.fn() }))
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
const ctx = makeContext()

beforeEach(() => {
  db = makeFakeDb()
  vi.mocked(tenantDb).mockReturnValue(db as never)
  db.recordingSession.findFirst.mockResolvedValue({ id: 's1' })
  db.layoutItem.count.mockResolvedValue(0)
  db.inputChannel.findMany.mockResolvedValue([])
  db.recallSheet.findFirst.mockResolvedValue(null)
})

describe('getSessionProgress', () => {
  it('reports nothing done for an empty session', async () => {
    expect(await getSessionProgress(ctx, 's1')).toEqual({
      layout: false,
      inputs: false,
      recall: false,
      counts: { items: 0, micChannels: 0, unassignedMics: 0, channels: 0 }
    })
  })

  it('ticks layout, inputs and recall when complete', async () => {
    db.layoutItem.count.mockResolvedValue(3)
    db.inputChannel.findMany.mockResolvedValue([
      { kind: 'mic', micUnitId: 'u1' },
      { kind: 'line', micUnitId: null }
    ])
    db.recallSheet.findFirst.mockResolvedValue({ id: 'r1' })
    const progress = await getSessionProgress(ctx, 's1')
    expect(progress).toMatchObject({ layout: true, inputs: true, recall: true })
    expect(progress.counts).toEqual({
      items: 3,
      micChannels: 1,
      unassignedMics: 0,
      channels: 2
    })
  })

  it('leaves inputs open while a mic channel has no unit', async () => {
    db.inputChannel.findMany.mockResolvedValue([
      { kind: 'mic', micUnitId: 'u1' },
      { kind: 'mic', micUnitId: null }
    ])
    const progress = await getSessionProgress(ctx, 's1')
    expect(progress.inputs).toBe(false)
    expect(progress.counts.unassignedMics).toBe(1)
  })

  it('is not found for another organisation or unknown id', async () => {
    db.recordingSession.findFirst.mockResolvedValue(null)
    await expect(getSessionProgress(ctx, 'x')).rejects.toMatchObject({
      status: 404
    })
    await expect(getSessionProgress(ctx, 'x')).rejects.toBeInstanceOf(AppError)
  })
})
