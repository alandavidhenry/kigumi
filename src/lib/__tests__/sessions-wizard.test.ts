import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppError } from '@/lib/errors'
import { PlanTier } from '@/lib/plans'
import { createRecallSheet } from '@/lib/recall/service'
import { runRules } from '@/lib/recommendations/rules'
import { prepareRules } from '@/lib/recommendations/service'
import { syncInputList } from '@/lib/sessions/sync'
import { saveSessionAsTemplate } from '@/lib/sessions/templates'
import { createSessionFromWizard } from '@/lib/sessions/wizard'
import { tenantDb } from '@/lib/tenant-db'
import { makeContext, makeFakeDb, type FakeDb } from '@/test/fixtures'
import {
  lockerUnit,
  requestOf,
  ruleMic,
  snapshotOf
} from '@/test/recommendations'
import { MemberRole } from '@/types/rbac'

vi.mock('@/lib/tenant-db', () => ({ tenantDb: vi.fn() }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('@/lib/recommendations/service', () => ({ prepareRules: vi.fn() }))
vi.mock('@/lib/recall/service', () => ({ createRecallSheet: vi.fn() }))
vi.mock('@/lib/sessions/sync', () => ({ syncInputList: vi.fn() }))
vi.mock('@/lib/sessions/templates', () => ({ saveSessionAsTemplate: vi.fn() }))
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

const { recordAudit } = vi.mocked(await import('@/lib/audit'))

const u87 = ruleMic('u87', { manufacturer: 'Neumann', model: 'U 87 Ai' })
const sm58 = ruleMic('sm58', { manufacturer: 'Shure', model: 'SM58' })
const snapshot = snapshotOf(
  [lockerUnit('ua', 'u87'), lockerUnit('ub', 'sm58')],
  [u87, sm58]
)

const sources = [
  { id: 'a', label: 'Lead vocal', kind: 'vocal_lead' as const },
  { id: 'b', label: 'Snare', kind: 'snare_top' as const }
]

function prepare(snap = snapshot, only = sources) {
  const request = requestOf(only.map((s) => ({ label: s.label, kind: s.kind })))
  const rules = runRules(request, snap)
  vi.mocked(prepareRules).mockResolvedValue({
    request,
    rules,
    room: null,
    unitNames: {},
    snapshot: snap,
    sessionId: null
  })
  return rules
}

const base = {
  details: { name: 'Tracking day', startsAt: '2026-07-01T10:00' },
  sources,
  picks: { mode: 'rules' as const },
  layout: { kind: 'auto' as const }
}

let db: FakeDb
const owner = makeContext()

beforeEach(() => {
  vi.clearAllMocks()
  db = makeFakeDb()
  vi.mocked(tenantDb).mockReturnValue(db as never)
  db.room.findFirst.mockResolvedValue(null)
  db.layout.create.mockResolvedValue({ id: 'layout-1' })
  db.console.findFirst.mockResolvedValue({ id: 'desk' })
  db.recommendationResult.findFirst.mockResolvedValue(null)
  prepare()
})

function createdItems(): Array<Record<string, unknown>> {
  return db.layoutItem.createMany.mock.calls[0][0].data
}

describe('createSessionFromWizard', () => {
  it('assigns the rules picks to the placed mic items', async () => {
    const result = await createSessionFromWizard(owner, base)
    expect(result).toMatchObject({ recall: 'skipped', template: 'skipped' })
    const mics = createdItems().filter((i) => i.type === 'mic')
    expect(mics.map((m) => m.label).sort()).toEqual(['Lead vocal', 'Snare'])
    expect(mics.every((m) => typeof m.micUnitId === 'string')).toBe(true)
    expect(syncInputList).toHaveBeenCalledTimes(1)
    expect(recordAudit).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({
        action: 'session.create',
        metadata: expect.objectContaining({ source: 'wizard' })
      })
    )
  })

  it('maps overrides from wizard source ids to the request ids', async () => {
    const rules = prepare()
    const alt = rules.sources[0].candidates.find(
      (c) => c.id !== rules.sources[0].planOptionId
    )!
    await createSessionFromWizard(owner, {
      ...base,
      picks: { mode: 'rules', overrides: { a: alt.id } }
    })
    const lead = createdItems().find((i) => i.label === 'Lead vocal')
    expect(lead?.micUnitId).toBe(alt.unitIds[0])
  })

  it('adds no picks when the mode is none', async () => {
    await createSessionFromWizard(owner, { ...base, picks: { mode: 'none' } })
    expect(prepareRules).not.toHaveBeenCalled()
    expect(createdItems().every((i) => !i.micUnitId)).toBe(true)
  })

  it('refuses another organisation recommendation result with a 404', async () => {
    await expect(
      createSessionFromWizard(owner, {
        ...base,
        picks: { mode: 'ai', resultId: 'theirs' }
      })
    ).rejects.toMatchObject({ status: 404 })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('rejects an AI result made for different sources', async () => {
    db.recommendationResult.findFirst.mockResolvedValue({
      final: { sources: [] },
      request: { input: { sources: [{ label: 'Other' }] } }
    })
    await expect(
      createSessionFromWizard(owner, {
        ...base,
        picks: { mode: 'ai', resultId: 'r1' }
      })
    ).rejects.toMatchObject({ status: 400 })
  })

  it('404s an unknown room or console before writing anything', async () => {
    await expect(
      createSessionFromWizard(owner, {
        ...base,
        details: { ...base.details, roomId: 'theirs' }
      })
    ).rejects.toBeInstanceOf(AppError)
    db.console.findFirst.mockResolvedValue(null)
    await expect(
      createSessionFromWizard(owner, { ...base, recall: { consoleId: 'x' } })
    ).rejects.toMatchObject({ status: 404 })
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(createRecallSheet).not.toHaveBeenCalled()
  })

  it('leaves nothing behind when the transaction fails', async () => {
    db.$transaction.mockRejectedValueOnce(new Error('boom'))
    await expect(createSessionFromWizard(owner, base)).rejects.toThrow('boom')
    expect(recordAudit).not.toHaveBeenCalled()
    expect(createRecallSheet).not.toHaveBeenCalled()
    expect(saveSessionAsTemplate).not.toHaveBeenCalled()
  })

  it('reports a recall failure instead of throwing', async () => {
    vi.mocked(createRecallSheet).mockRejectedValueOnce(new Error('nope'))
    const result = await createSessionFromWizard(owner, {
      ...base,
      recall: { consoleId: 'desk' }
    })
    expect(result.recall).toBe('failed')
    expect(result.id).toBeTruthy()
    expect(result.warnings.join(' ')).toMatch(/recall sheet/)
  })

  it('creates the recall sheet after the commit', async () => {
    const result = await createSessionFromWizard(owner, {
      ...base,
      recall: { consoleId: 'desk' }
    })
    expect(result.recall).toBe('created')
    expect(createRecallSheet).toHaveBeenCalledWith(owner, result.id, {
      consoleId: 'desk'
    })
  })

  it('needs Pro for a saved session template layout', async () => {
    const free = makeContext({ planTier: PlanTier.FREE })
    await expect(
      createSessionFromWizard(free, {
        ...base,
        layout: { kind: 'template', layoutId: 'l1' }
      })
    ).rejects.toMatchObject({ code: 'FEATURE_NOT_IN_PLAN' })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('needs Pro to save as a template, before creating anything', async () => {
    const free = makeContext({ planTier: PlanTier.FREE })
    await expect(
      createSessionFromWizard(free, {
        ...base,
        saveAsTemplate: { name: 'Mine' }
      })
    ).rejects.toMatchObject({ code: 'FEATURE_NOT_IN_PLAN' })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('reports a failed template save without failing the call', async () => {
    vi.mocked(saveSessionAsTemplate).mockRejectedValueOnce(new Error('x'))
    const result = await createSessionFromWizard(owner, {
      ...base,
      saveAsTemplate: { name: 'Mine' }
    })
    expect(result.template).toBe('failed')
  })

  it('warns about a source with no mic available', async () => {
    prepare(snapshotOf([], []), [sources[0]])
    const result = await createSessionFromWizard(owner, {
      ...base,
      sources: [sources[0]]
    })
    expect(result.warnings.join(' ')).toMatch(/Lead vocal/)
  })

  it('forbids viewers', async () => {
    await expect(
      createSessionFromWizard(makeContext({ role: MemberRole.VIEWER }), base)
    ).rejects.toMatchObject({ status: 403 })
  })
})
