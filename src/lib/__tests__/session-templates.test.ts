import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppError } from '@/lib/errors'
import { PlanTier } from '@/lib/plans'
import {
  createSessionTemplate,
  deleteSessionTemplate,
  getSessionTemplate,
  listSessionTemplates,
  renameSessionTemplate,
  saveSessionAsTemplate
} from '@/lib/sessions/templates'
import { tenantDb } from '@/lib/tenant-db'
import { makeContext, makeFakeDb, type FakeDb } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

vi.mock('@/lib/tenant-db', () => ({ tenantDb: vi.fn() }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/lib/tenant-context', async () => {
  const { featureNotInPlan, forbidden } = await import('@/lib/errors')
  const { hasFeature } = await import('@/lib/plans')
  const { hasPermission } = await import('@/types/rbac')
  return {
    requirePermission: (ctx: { role: MemberRole }, permission: never) => {
      if (!hasPermission(ctx.role, permission)) throw forbidden()
    },
    requireFeature: (ctx: { planTier: string }, feature: string) => {
      if (!hasFeature(ctx.planTier, feature as never)) {
        throw featureNotInPlan(String(feature), 'Pro')
      }
    }
  }
})
vi.mock('@/lib/layout/service', () => ({ saveTemplate: vi.fn() }))

const { recordAudit } = vi.mocked(await import('@/lib/audit'))
const { saveTemplate } = vi.mocked(await import('@/lib/layout/service'))

let db: FakeDb
const owner = makeContext()
const viewer = makeContext({ role: MemberRole.VIEWER })
const free = makeContext({ planTier: PlanTier.FREE })

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AppError)
  await expect(promise).rejects.toMatchObject({ code })
}

const input = {
  name: '  Rock   band ',
  sources: [{ id: 's1', label: 'Kick', kind: 'kick_in' }]
}

beforeEach(() => {
  vi.clearAllMocks()
  db = makeFakeDb()
  vi.mocked(tenantDb).mockReturnValue(db as never)
  db.sessionTemplate.create.mockResolvedValue({ id: 'st1' })
})

describe('session templates', () => {
  it('lists with the console name and tolerates bad json', async () => {
    db.sessionTemplate.findMany.mockResolvedValue([
      { id: 'a', sources: [{ id: 's1' }], console: { name: 'Desk' } },
      { id: 'b', sources: null, console: null }
    ])
    const rows = await listSessionTemplates(owner)
    expect(rows[0]).toMatchObject({ consoleName: 'Desk' })
    expect(rows[1]).toMatchObject({ sources: [], consoleName: null })
  })

  it('gets one or 404s', async () => {
    db.sessionTemplate.findFirst.mockResolvedValue(null)
    await expectCode(getSessionTemplate(owner, 'x'), 'NOT_FOUND')
    db.sessionTemplate.findFirst.mockResolvedValue({
      id: 'a',
      sources: [],
      console: null
    })
    expect(await getSessionTemplate(owner, 'a')).toMatchObject({ id: 'a' })
  })

  it('creates with normalised name and audits', async () => {
    const result = await createSessionTemplate(owner, input)
    expect(result).toEqual({ id: 'st1' })
    expect(db.sessionTemplate.create.mock.calls[0][0].data).toMatchObject({
      organisationId: 'org_1',
      name: 'Rock band',
      phantomMode: 'per_channel',
      layoutId: null,
      consoleId: null
    })
    expect(recordAudit).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ action: 'session_template.create' })
    )
  })

  it('404s for a layout that is not an own template, or a foreign console', async () => {
    db.layout.findFirst.mockResolvedValue(null)
    await expectCode(
      createSessionTemplate(owner, { ...input, layoutId: 'l9' }),
      'NOT_FOUND'
    )
    expect(db.layout.findFirst.mock.calls[0][0].where).toEqual({
      id: 'l9',
      isTemplate: true
    })
    db.console.findFirst.mockResolvedValue(null)
    await expectCode(
      createSessionTemplate(owner, { ...input, consoleId: 'c9' }),
      'NOT_FOUND'
    )
    expect(db.sessionTemplate.create).not.toHaveBeenCalled()
  })

  it('rejects invalid sources', async () => {
    await expect(
      createSessionTemplate(owner, { ...input, sources: [] })
    ).rejects.toThrow()
    await expect(
      createSessionTemplate(owner, {
        ...input,
        sources: [{ id: 's1', label: 'x', kind: 'nope' }]
      })
    ).rejects.toThrow()
  })

  it('renames and 404s when nothing matched', async () => {
    db.sessionTemplate.updateMany.mockResolvedValue({ count: 0 })
    await expectCode(
      renameSessionTemplate(owner, 'x', { name: 'N' }),
      'NOT_FOUND'
    )
    db.sessionTemplate.updateMany.mockResolvedValue({ count: 1 })
    await renameSessionTemplate(owner, 'x', { name: 'N', description: 'D' })
    expect(db.sessionTemplate.updateMany.mock.calls[1][0].data).toEqual({
      name: 'N',
      description: 'D'
    })
  })

  it('deletes the template and its linked layout together', async () => {
    db.sessionTemplate.findFirst.mockResolvedValue({
      name: 'T',
      layoutId: 'l1'
    })
    await deleteSessionTemplate(owner, 'st1')
    expect(db.$transaction).toHaveBeenCalled()
    expect(db.sessionTemplate.deleteMany).toHaveBeenCalled()
    expect(db.layout.deleteMany.mock.calls[0][0].where).toEqual({
      id: 'l1',
      isTemplate: true
    })
  })

  it('delete 404s for a missing template', async () => {
    db.sessionTemplate.findFirst.mockResolvedValue(null)
    await expectCode(deleteSessionTemplate(owner, 'x'), 'NOT_FOUND')
  })

  it('saves a session as a template: layout copy, then the row', async () => {
    saveTemplate.mockResolvedValue({ id: 'tl1' } as never)
    db.layout.findFirst.mockResolvedValue({ id: 'tl1' })
    const result = await saveSessionAsTemplate(owner, 's1', input)
    expect(result).toEqual({ id: 'st1', layoutId: 'tl1' })
    expect(saveTemplate).toHaveBeenCalledWith(owner, {
      name: 'Rock band',
      fromSessionId: 's1'
    })
    expect(db.sessionTemplate.create.mock.calls[0][0].data.layoutId).toBe('tl1')
  })

  it('removes the copied layout if the row cannot be created', async () => {
    saveTemplate.mockResolvedValue({ id: 'tl1' } as never)
    db.layout.findFirst.mockResolvedValue({ id: 'tl1' })
    db.sessionTemplate.create.mockRejectedValue(new Error('boom'))
    await expect(saveSessionAsTemplate(owner, 's1', input)).rejects.toThrow(
      'boom'
    )
    expect(db.layout.deleteMany).toHaveBeenCalled()
  })

  it('refuses viewers on writes', async () => {
    await expectCode(createSessionTemplate(viewer, input), 'FORBIDDEN')
    await expectCode(deleteSessionTemplate(viewer, 'x'), 'FORBIDDEN')
  })

  it('plan gate: Free gets FEATURE_NOT_IN_PLAN on every call', async () => {
    await expectCode(listSessionTemplates(free), 'FEATURE_NOT_IN_PLAN')
    await expectCode(getSessionTemplate(free, 'x'), 'FEATURE_NOT_IN_PLAN')
    await expectCode(createSessionTemplate(free, input), 'FEATURE_NOT_IN_PLAN')
    await expectCode(
      saveSessionAsTemplate(free, 's1', input),
      'FEATURE_NOT_IN_PLAN'
    )
    await expectCode(
      renameSessionTemplate(free, 'x', { name: 'N' }),
      'FEATURE_NOT_IN_PLAN'
    )
    await expectCode(deleteSessionTemplate(free, 'x'), 'FEATURE_NOT_IN_PLAN')
    expect(saveTemplate).not.toHaveBeenCalled()
  })

  it('plan gate: Pro passes', async () => {
    db.sessionTemplate.findMany.mockResolvedValue([])
    const pro = makeContext({ planTier: PlanTier.PRO })
    expect(await listSessionTemplates(pro)).toEqual([])
    await expect(createSessionTemplate(pro, input)).resolves.toBeDefined()
  })
})
