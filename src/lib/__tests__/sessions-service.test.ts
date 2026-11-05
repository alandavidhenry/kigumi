import { beforeEach, describe, expect, it, vi } from 'vitest'

import { deleteAttachmentsFor } from '@/lib/attachments'
import { AppError } from '@/lib/errors'
import { PlanTier } from '@/lib/plans'
import prisma from '@/lib/prisma'
import { hashToken, openToken, sealToken } from '@/lib/secret-box'
import { applyRecommendation } from '@/lib/sessions/apply'
import {
  createChannel,
  createSession,
  deleteChannel,
  deleteSession,
  duplicateSession,
  getSession,
  listSessions,
  orderChannels,
  updateChannel,
  updateSession
} from '@/lib/sessions/service'
import {
  SHARE_TOKEN_PURPOSE,
  createShareLink,
  getSharedSession,
  revokeShareLink
} from '@/lib/sessions/share'
import { tenantDb } from '@/lib/tenant-db'
import { makeContext, makeFakeDb, type FakeDb } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

vi.mock('@/lib/tenant-db', () => ({ tenantDb: vi.fn() }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/lib/attachments', () => ({ deleteAttachmentsFor: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  default: {
    sessionShareLink: { findUnique: vi.fn(), update: vi.fn() },
    organization: { findFirst: vi.fn() }
  }
}))
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
const raw = vi.mocked(prisma, true)

let db: FakeDb
const owner = makeContext()
const engineer = makeContext({ role: MemberRole.ENGINEER })
const viewer = makeContext({ role: MemberRole.VIEWER })
const free = makeContext({ planTier: PlanTier.FREE })

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AppError)
  await expect(promise).rejects.toMatchObject({ code })
}

const room = {
  id: 'r1',
  name: 'Live room',
  widthMm: 6000,
  lengthMm: 5000,
  heightMm: 3000,
  studio: { timezone: 'Europe/London' }
}

const input = (extra: Record<string, unknown> = {}) => ({
  name: 'Drum day',
  roomId: 'r1',
  startsAt: '2026-07-01T10:00',
  endsAt: '2026-07-01T18:00',
  ...extra
})

beforeEach(() => {
  vi.clearAllMocks()
  db = makeFakeDb()
  vi.mocked(tenantDb).mockReturnValue(db as never)
  db.room.findFirst.mockResolvedValue(room)
  db.layout.create.mockResolvedValue({ id: 'l1' })
  db.layoutItem.findMany.mockResolvedValue([])
  db.inputChannel.findMany.mockResolvedValue([])
  db.microphoneUnit.findMany.mockResolvedValue([])
  db.microphoneUnit.count.mockResolvedValue(1)
})

describe('createSession', () => {
  it('needs permission to manage sessions', async () => {
    await expectCode(createSession(viewer, input()), 'FORBIDDEN')
  })

  it('creates the session and its blank layout from the room, in UTC', async () => {
    const { id } = await createSession(engineer, input())
    const data = db.recordingSession.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      id,
      organisationId: 'org_1',
      roomId: 'r1',
      name: 'Drum day',
      createdById: 'user_1'
    })
    // 10:00 London in July is 09:00 UTC.
    expect((data.startsAt as Date).toISOString()).toBe(
      '2026-07-01T09:00:00.000Z'
    )
    expect(db.layout.create.mock.calls[0][0].data).toMatchObject({
      sessionId: id,
      isTemplate: false,
      widthMm: 6000,
      lengthMm: 5000
    })
    expect(db.layoutItem.createMany).not.toHaveBeenCalled()
    expect(recordAudit).toHaveBeenCalledWith(
      engineer,
      expect.objectContaining({ action: 'session.create', entityId: id })
    )
  })

  it('starts from a built-in template on any plan, with channels for its mics', async () => {
    db.layoutItem.findMany.mockResolvedValue([
      { id: 'm1', type: 'mic', label: 'Vocal', micUnitId: null }
    ])
    await createSession(
      free,
      input({ startFrom: { kind: 'builtin', templateId: 'vocal-booth' } })
    )
    const items = db.layoutItem.createMany.mock.calls[0][0].data
    expect(items.length).toBeGreaterThan(0)
    expect(items[0]).toMatchObject({
      organisationId: 'org_1',
      layoutId: 'l1'
    })
    expect(items.every((i: { micUnitId?: unknown }) => !i.micUnitId)).toBe(true)
    expect(db.inputChannel.createMany).toHaveBeenCalled()
  })

  it('404s for an unknown built-in template', async () => {
    await expectCode(
      createSession(
        owner,
        input({ startFrom: { kind: 'builtin', templateId: 'nope' } })
      ),
      'NOT_FOUND'
    )
  })

  it('needs Pro to start from your own template', async () => {
    await expectCode(
      createSession(
        free,
        input({ startFrom: { kind: 'template', layoutId: 't1' } })
      ),
      'FEATURE_NOT_IN_PLAN'
    )
    expect(db.recordingSession.create).not.toHaveBeenCalled()
  })

  it('scales a template to the room and strips units from it', async () => {
    db.layout.findFirst.mockResolvedValue({
      widthMm: 3000,
      lengthMm: 2500,
      items: [
        {
          id: 'i',
          type: 'mic',
          xMm: 1500,
          yMm: 500,
          micUnitId: 'u1',
          equipmentItemId: 'e1',
          recommendationRef: 'x',
          label: 'V'
        }
      ]
    })
    await createSession(
      owner,
      input({ startFrom: { kind: 'template', layoutId: 't1' } })
    )
    expect(db.layout.findFirst.mock.calls[0][0].where).toEqual({
      id: 't1',
      isTemplate: true
    })
    const [copied] = db.layoutItem.createMany.mock.calls[0][0].data
    expect(copied).toMatchObject({
      xMm: 3000,
      yMm: 1000,
      micUnitId: null,
      equipmentItemId: null,
      recommendationRef: null
    })
    expect(copied.id).not.toBe('i')
  })

  it("copies another session's layout keeping its microphones", async () => {
    db.layout.findFirst.mockResolvedValue({
      widthMm: 6000,
      lengthMm: 5000,
      items: [
        {
          id: 'i',
          type: 'mic',
          xMm: 10,
          yMm: 20,
          micUnitId: 'u1',
          equipmentItemId: null,
          recommendationRef: 'x'
        }
      ]
    })
    await createSession(
      owner,
      input({ startFrom: { kind: 'session', sessionId: 's0' } })
    )
    expect(db.layout.findFirst.mock.calls[0][0].where).toEqual({
      sessionId: 's0'
    })
    expect(db.layoutItem.createMany.mock.calls[0][0].data[0]).toMatchObject({
      micUnitId: 'u1',
      recommendationRef: null
    })
  })

  it("404s for another organisation's room, template or session", async () => {
    db.room.findFirst.mockResolvedValue(null)
    await expectCode(createSession(owner, input()), 'NOT_FOUND')
    db.room.findFirst.mockResolvedValue(room)
    db.layout.findFirst.mockResolvedValue(null)
    await expectCode(
      createSession(
        owner,
        input({ startFrom: { kind: 'session', sessionId: 'x' } })
      ),
      'NOT_FOUND'
    )
  })

  it('rejects an end before the start and impossible dates', async () => {
    await expectCode(
      createSession(owner, input({ endsAt: '2026-07-01T09:00' })),
      'BAD_REQUEST'
    )
    await expectCode(
      createSession(owner, input({ startsAt: '2026-02-31T10:00' })),
      'BAD_REQUEST'
    )
    await expect(createSession(owner, input({ name: ' ' }))).rejects.toThrow()
  })

  it('uses a default footprint when no room is chosen', async () => {
    await createSession(owner, input({ roomId: null }))
    expect(db.room.findFirst).not.toHaveBeenCalled()
    expect(db.layout.create.mock.calls[0][0].data).toMatchObject({
      widthMm: 6000,
      lengthMm: 5000
    })
  })
})

describe('reading sessions', () => {
  const overviewRow = {
    id: 's1',
    organisationId: 'org_1',
    name: 'Drum day',
    client: 'Band',
    notes: null,
    status: 'planned',
    startsAt: new Date('2026-07-01T09:00:00Z'),
    endsAt: new Date('2026-07-01T17:00:00Z'),
    roomId: 'r1',
    channelsAvailable: null,
    phantomMode: 'per_channel',
    room: { name: 'Live room', studio: { timezone: 'Europe/London' } }
  }

  it('lets a viewer read but hides the share token from them', async () => {
    db.recordingSession.findFirst.mockResolvedValue(overviewRow)
    db.layout.findFirst.mockResolvedValue(null)
    db.sessionShareLink.findFirst.mockResolvedValue({
      tokenSealed: sealToken('secret', SHARE_TOKEN_PURPOSE),
      expiresAt: null
    })
    const asViewer = await getSession(viewer, 's1')
    expect(asViewer.share).toBeNull()
    expect(asViewer.startsLocal).toBe('2026-07-01T10:00')
    const asEngineer = await getSession(engineer, 's1')
    expect(asEngineer.share).toEqual({ token: 'secret', expiresAt: null })
  })

  it('reports a live link it can no longer show as having no token', async () => {
    db.recordingSession.findFirst.mockResolvedValue(overviewRow)
    db.layout.findFirst.mockResolvedValue(null)
    for (const tokenSealed of [null, 'tampered-or-other-secret']) {
      db.sessionShareLink.findFirst.mockResolvedValue({
        tokenSealed,
        expiresAt: null
      })
      expect((await getSession(engineer, 's1')).share).toEqual({
        token: null,
        expiresAt: null
      })
    }
  })

  it('404s for a session in another organisation', async () => {
    db.recordingSession.findFirst.mockResolvedValue(null)
    await expectCode(getSession(owner, 'other'), 'NOT_FOUND')
  })

  it('lists with local start time and channel count', async () => {
    db.recordingSession.findMany.mockResolvedValue([
      {
        ...overviewRow,
        room: { name: 'Live room', studio: { timezone: 'Europe/London' } },
        _count: { channels: 5 }
      }
    ])
    const [row] = await listSessions(viewer, { scope: 'past' })
    expect(row).toMatchObject({
      channelCount: 5,
      startsLocal: '2026-07-01T10:00'
    })
    expect(db.recordingSession.findMany.mock.calls[0][0].orderBy).toEqual({
      startsAt: 'desc'
    })
  })
})

describe('updateSession and deleteSession', () => {
  const existing = {
    name: 'Drum day',
    startsAt: new Date('2026-07-01T09:00:00Z'),
    endsAt: new Date('2026-07-01T17:00:00Z'),
    roomId: 'r1',
    room: { studio: { timezone: 'Europe/London' } }
  }

  it('updates only what was sent', async () => {
    db.recordingSession.findFirst.mockResolvedValue(existing)
    db.recordingSession.updateMany.mockResolvedValue({ count: 1 })
    await updateSession(engineer, 's1', { status: 'confirmed' })
    expect(db.recordingSession.updateMany).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { status: 'confirmed' }
    })
  })

  it('rejects a new end before the stored start', async () => {
    db.recordingSession.findFirst.mockResolvedValue(existing)
    await expectCode(
      updateSession(engineer, 's1', { endsAt: '2026-07-01T09:30' }),
      'BAD_REQUEST'
    )
    expect(db.recordingSession.updateMany).not.toHaveBeenCalled()
  })

  it('404s across organisations and refuses viewers', async () => {
    db.recordingSession.findFirst.mockResolvedValue(null)
    await expectCode(updateSession(engineer, 'x', { name: 'N' }), 'NOT_FOUND')
    await expectCode(deleteSession(engineer, 'x'), 'NOT_FOUND')
    await expectCode(updateSession(viewer, 's1', { name: 'N' }), 'FORBIDDEN')
    await expectCode(deleteSession(viewer, 's1'), 'FORBIDDEN')
  })

  it('deletes and audits', async () => {
    db.recordingSession.findFirst.mockResolvedValue({ name: 'Drum day' })
    await deleteSession(owner, 's1')
    expect(db.recordingSession.deleteMany).toHaveBeenCalledWith({
      where: { id: 's1' }
    })
    expect(recordAudit).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ action: 'session.delete' })
    )
  })

  it('removes the desk photos of its recall sheet before deleting', async () => {
    db.recordingSession.findFirst.mockResolvedValue({ name: 'Drum day' })
    db.recallSheet.findFirst.mockResolvedValue({ id: 'rs1' })
    await deleteSession(owner, 's1')
    expect(deleteAttachmentsFor).toHaveBeenCalledWith(
      owner,
      'recall_sheet',
      'rs1'
    )
  })

  it('duplicates through a copy of the session', async () => {
    db.recordingSession.findFirst.mockResolvedValue({
      id: 's1',
      organisationId: 'org_1',
      name: 'Drum day',
      client: null,
      notes: null,
      status: 'planned',
      startsAt: existing.startsAt,
      endsAt: existing.endsAt,
      roomId: 'r1',
      channelsAvailable: 8,
      phantomMode: 'per_channel',
      room: { name: 'Live room', studio: { timezone: 'Europe/London' } }
    })
    db.layout.findFirst.mockResolvedValue({
      widthMm: 6000,
      lengthMm: 5000,
      items: []
    })
    await duplicateSession(engineer, 's1')
    expect(db.recordingSession.create.mock.calls[0][0].data).toMatchObject({
      name: 'Drum day (copy)',
      channelsAvailable: 8
    })
  })
})

describe('input channels', () => {
  beforeEach(() => {
    db.recordingSession.findFirst.mockResolvedValue({ id: 's1', name: 'S' })
  })

  it('adds a manual line channel with the lowest free number', async () => {
    db.inputChannel.findMany.mockResolvedValue([{ number: 1 }, { number: 3 }])
    db.inputChannel.create.mockResolvedValue({ id: 'c9' })
    expect(await createChannel(engineer, 's1', { source: 'Synth' })).toEqual({
      id: 'c9',
      number: 2
    })
    expect(db.inputChannel.create.mock.calls[0][0].data).toMatchObject({
      layoutItemId: null,
      kind: 'line',
      sessionId: 's1'
    })
  })

  it('refuses to add channels to another organisation’s session', async () => {
    db.recordingSession.findFirst.mockResolvedValue(null)
    await expectCode(
      createChannel(engineer, 'x', { source: 'Synth' }),
      'NOT_FOUND'
    )
    await expectCode(
      createChannel(viewer, 's1', { source: 'Synth' }),
      'FORBIDDEN'
    )
  })

  it('writes a linked channel’s source and unit through to its layout item', async () => {
    db.inputChannel.findFirst.mockResolvedValue({
      id: 'c1',
      number: 1,
      layoutItemId: 'i1',
      micUnitId: null
    })
    db.microphoneUnit.findMany.mockResolvedValue([
      {
        id: 'u1',
        equipmentItem: { status: 'in_service' },
        micModel: {
          manufacturer: 'Neumann',
          model: 'U 87 Ai',
          transducerType: 'ldc',
          powering: 'phantom',
          phantomSafe: null
        }
      }
    ])
    await updateChannel(engineer, 's1', 'c1', {
      source: 'Lead vocal',
      micUnitId: 'u1'
    })
    expect(db.layoutItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { label: 'Lead vocal', micUnitId: 'u1' }
    })
    // A new unit resets phantom to that mic's default (condenser: on).
    expect(db.inputChannel.updateMany.mock.calls[0][0].data).toMatchObject({
      source: 'Lead vocal',
      micUnitId: 'u1',
      phantom: true
    })
  })

  it('leaves the layout alone when only channel-owned fields change', async () => {
    db.inputChannel.findFirst.mockResolvedValue({
      id: 'c1',
      number: 1,
      layoutItemId: 'i1',
      micUnitId: 'u1'
    })
    await updateChannel(engineer, 's1', 'c1', { stand: 'Boom', padDb: 10 })
    expect(db.layoutItem.updateMany).not.toHaveBeenCalled()
  })

  it('404s for an unknown channel and for a unit from another organisation', async () => {
    db.inputChannel.findFirst.mockResolvedValue(null)
    await expectCode(
      updateChannel(engineer, 's1', 'x', { stand: 'a' }),
      'NOT_FOUND'
    )
    db.inputChannel.findFirst.mockResolvedValue({
      id: 'c1',
      number: 1,
      layoutItemId: null,
      micUnitId: null
    })
    db.microphoneUnit.count.mockResolvedValue(0)
    await expectCode(
      updateChannel(engineer, 's1', 'c1', { micUnitId: 'foreign' }),
      'NOT_FOUND'
    )
  })

  it('refuses to delete a channel that comes from the layout', async () => {
    db.inputChannel.findFirst.mockResolvedValue({
      number: 1,
      layoutItemId: 'i1',
      source: 'Vocal'
    })
    await expectCode(deleteChannel(engineer, 's1', 'c1'), 'BAD_REQUEST')
    db.inputChannel.findFirst.mockResolvedValue({
      number: 2,
      layoutItemId: null,
      source: 'Synth'
    })
    await deleteChannel(engineer, 's1', 'c2')
    expect(db.inputChannel.deleteMany).toHaveBeenCalledWith({
      where: { id: 'c2', sessionId: 's1' }
    })
  })

  it('reorders in two passes so the unique number never clashes', async () => {
    db.inputChannel.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }])
    await orderChannels(engineer, 's1', { ids: ['b', 'a'] })
    const calls = db.inputChannel.updateMany.mock.calls.map((c) => c[0])
    expect(calls[0]).toEqual({
      where: { sessionId: 's1' },
      data: { number: { increment: 1000 } }
    })
    expect(calls.slice(1)).toEqual([
      { where: { id: 'b', sessionId: 's1' }, data: { number: 1 } },
      { where: { id: 'a', sessionId: 's1' }, data: { number: 2 } }
    ])
  })

  it('requires every channel exactly once', async () => {
    db.inputChannel.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }])
    await expectCode(
      orderChannels(engineer, 's1', { ids: ['a'] }),
      'BAD_REQUEST'
    )
    await expectCode(
      orderChannels(engineer, 's1', { ids: ['a', 'a'] }),
      'BAD_REQUEST'
    )
    await expectCode(
      orderChannels(engineer, 's1', { ids: ['a', 'x'] }),
      'BAD_REQUEST'
    )
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})

describe('applyRecommendation', () => {
  const view = {
    answerable: true,
    summary: null,
    warnings: [],
    sources: [
      {
        sourceId: 's1',
        label: 'Snare',
        kind: 'snare_top',
        technique: 'mono',
        micCount: 1,
        line: false,
        unfillable: null,
        adjusted: null,
        rulesPickOptionId: 'o1',
        alternatives: [],
        primary: {
          optionId: 'o1',
          units: [
            {
              unitId: 'u1',
              micSlug: 'shure-sm57',
              name: 'Shure SM57',
              role: 'single',
              patternSetting: 'cardioid'
            }
          ],
          matchedGroup: null,
          warnings: [],
          origin: 'ai',
          reasoning: 'x',
          placement: {
            position: 'Over the rim',
            distanceMm: 50,
            angleDeg: null,
            spacingMm: null,
            includedAngleDeg: null
          }
        }
      },
      {
        sourceId: 's2',
        label: 'Synth',
        kind: 'di',
        technique: 'mono',
        micCount: 0,
        line: true,
        unfillable: null,
        adjusted: null,
        rulesPickOptionId: null,
        alternatives: [],
        primary: null
      }
    ]
  }

  beforeEach(() => {
    db.layout.findFirst.mockResolvedValue({
      id: 'l1',
      widthMm: 6000,
      lengthMm: 5000,
      session: { name: 'Drum day' },
      items: []
    })
    db.recommendationResult.findFirst.mockResolvedValue({ final: view })
    db.microphoneUnit.findMany.mockResolvedValue([{ id: 'u1' }])
    db.layoutItem.findMany.mockResolvedValue([])
  })

  it('needs permission and 404s for another organisation’s session or result', async () => {
    await expectCode(
      applyRecommendation(viewer, 's1', { resultId: 'r' }),
      'FORBIDDEN'
    )
    db.layout.findFirst.mockResolvedValue(null)
    await expectCode(
      applyRecommendation(engineer, 'x', { resultId: 'r' }),
      'NOT_FOUND'
    )
    db.layout.findFirst.mockResolvedValue({
      id: 'l1',
      items: [],
      session: null
    })
    db.recommendationResult.findFirst.mockResolvedValue(null)
    await expectCode(
      applyRecommendation(engineer, 's1', { resultId: 'x' }),
      'NOT_FOUND'
    )
  })

  it('stages new mics, syncs the list, adds a line channel and audits once', async () => {
    const result = await applyRecommendation(engineer, 's1', {
      resultId: 'res1'
    })
    expect(result).toMatchObject({ created: 1, updated: 0, lineChannels: 1 })
    const [created] = db.layoutItem.createMany.mock.calls[0][0].data
    expect(created).toMatchObject({
      micUnitId: 'u1',
      label: 'Snare',
      layoutId: 'l1',
      organisationId: 'org_1',
      yMm: 4700
    })
    expect(db.layout.updateMany).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { version: { increment: 1 } }
    })
    expect(db.inputChannel.create.mock.calls[0][0].data).toMatchObject({
      kind: 'line',
      source: 'Synth'
    })
    expect(recordAudit).toHaveBeenCalledTimes(1)
    expect(recordAudit).toHaveBeenCalledWith(
      engineer,
      expect.objectContaining({ action: 'session.recommendation.apply' })
    )
  })

  it('skips a source whose microphone has left the locker', async () => {
    db.microphoneUnit.findMany.mockResolvedValue([])
    const result = await applyRecommendation(engineer, 's1', {
      resultId: 'res1'
    })
    expect(result.created).toBe(0)
    expect(result.skipped).toEqual([
      { sourceId: 's1', label: 'Snare', reason: 'unit_removed' }
    ])
  })
})

describe('share links', () => {
  beforeEach(() => {
    db.recordingSession.findFirst.mockResolvedValue({ name: 'Drum day' })
  })

  it('creates a 256-bit URL-safe token and revokes the previous link', async () => {
    const info = await createShareLink(engineer, 's1', { expiresInDays: 7 })
    expect(info.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(info.expiresAt).not.toBeNull()
    expect(db.sessionShareLink.updateMany).toHaveBeenCalledWith({
      where: { sessionId: 's1', revokedAt: null },
      data: { revokedAt: expect.any(Date) }
    })
    const data = db.sessionShareLink.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      sessionId: 's1',
      organisationId: 'org_1',
      tokenHash: hashToken(info.token!)
    })
    // Never stored in plain text; the sealed copy opens back to the token.
    expect(JSON.stringify(data)).not.toContain(info.token)
    expect(openToken(data.tokenSealed, SHARE_TOKEN_PURPOSE)).toBe(info.token)
    const second = await createShareLink(engineer, 's1')
    expect(second.token).not.toBe(info.token)
    expect(second.expiresAt).toBeNull()
  })

  it('is for people who can manage, and 404s across organisations', async () => {
    await expectCode(createShareLink(viewer, 's1'), 'FORBIDDEN')
    await expectCode(revokeShareLink(viewer, 's1'), 'FORBIDDEN')
    db.recordingSession.findFirst.mockResolvedValue(null)
    await expectCode(createShareLink(engineer, 'x'), 'NOT_FOUND')
    await expectCode(revokeShareLink(engineer, 'x'), 'NOT_FOUND')
  })

  it('revokes, and says so when there was no live link', async () => {
    db.sessionShareLink.updateMany.mockResolvedValue({ count: 1 })
    await revokeShareLink(engineer, 's1')
    db.sessionShareLink.updateMany.mockResolvedValue({ count: 0 })
    await expectCode(revokeShareLink(engineer, 's1'), 'NOT_FOUND')
  })
})

describe('getSharedSession', () => {
  const token = 'a'.repeat(43)
  const live = {
    id: 'link1',
    organisationId: 'org_9',
    sessionId: 's1',
    expiresAt: null,
    revokedAt: null
  }

  beforeEach(() => {
    raw.sessionShareLink.findUnique.mockResolvedValue(live as never)
    raw.sessionShareLink.update.mockResolvedValue({} as never)
    raw.organization.findFirst.mockResolvedValue({
      name: 'Northern Lights',
      planTier: 'free'
    } as never)
    db.recordingSession.findFirst.mockResolvedValue({
      id: 's1',
      organisationId: 'org_9',
      name: 'Drum day',
      client: 'Secret client',
      notes: 'Private notes',
      status: 'planned',
      startsAt: new Date('2026-07-01T09:00:00Z'),
      endsAt: new Date('2026-07-01T17:00:00Z'),
      roomId: 'r1',
      channelsAvailable: null,
      phantomMode: 'per_channel',
      room: { name: 'Live room', studio: { timezone: 'Europe/London' } }
    })
    db.layout.findFirst.mockResolvedValue(null)
    db.inputChannel.findMany.mockImplementation(
      async (args: { select?: object }) =>
        args.select && 'micUnitId' in args.select && 'session' in args.select
          ? [
              {
                micUnitId: 'u1',
                session: { id: 's2', name: 'Other client session' }
              }
            ]
          : [
              {
                id: 'c1',
                number: 1,
                layoutItemId: null,
                kind: 'mic',
                source: 'Vocal',
                micUnitId: 'u1',
                stand: 'Boom',
                preampInput: null,
                phantom: true,
                padDb: null,
                dawName: null,
                notes: 'Channel notes'
              }
            ]
    )
    db.microphoneUnit.findMany.mockResolvedValue([
      {
        id: 'u1',
        equipmentItem: { status: 'in_service' },
        micModel: {
          manufacturer: 'Neumann',
          model: 'U 87 Ai',
          transducerType: 'ldc',
          powering: 'phantom',
          phantomSafe: null
        }
      }
    ])
  })

  it('looks the link up by the token hash, never the token', async () => {
    await getSharedSession(token)
    expect(raw.sessionShareLink.findUnique.mock.calls[0][0].where).toEqual({
      tokenHash: hashToken(token)
    })
  })

  it('reads through a client scoped to the link’s own organisation', async () => {
    await getSharedSession(token)
    expect(tenantDb).toHaveBeenCalledWith({ organisationId: 'org_9' })
  })

  it('returns a projection with no ids, notes, client or other session names', async () => {
    const view = await getSharedSession(token)
    expect(view).toMatchObject({
      name: 'Drum day',
      organisationName: 'Northern Lights',
      branded: true,
      roomName: 'Live room'
    })
    expect(view.channels[0]).toEqual({
      number: 1,
      kind: 'mic',
      source: 'Vocal',
      mic: 'Neumann U 87 Ai',
      stand: 'Boom',
      preampInput: null,
      phantom: true,
      padDb: null,
      notes: null
    })
    const text = JSON.stringify(view)
    for (const secret of [
      'Secret client',
      'Private notes',
      'Channel notes',
      'Other client session',
      'org_9',
      'link1',
      'c1'
    ]) {
      expect(text).not.toContain(secret)
    }
    expect(view.warnings.some((w) => w.text.includes('another session'))).toBe(
      true
    )
  })

  it('drops the Kigumi branding on Pro and above', async () => {
    raw.organization.findFirst.mockResolvedValue({
      name: 'N',
      planTier: 'pro'
    } as never)
    expect((await getSharedSession(token)).branded).toBe(false)
  })

  it('looks the same for unknown, malformed, revoked and expired links', async () => {
    raw.sessionShareLink.findUnique.mockResolvedValue(null)
    await expectCode(getSharedSession(token), 'NOT_FOUND')
    await expectCode(getSharedSession('short'), 'NOT_FOUND')
    expect(raw.sessionShareLink.findUnique).toHaveBeenCalledTimes(1)
    raw.sessionShareLink.findUnique.mockResolvedValue({
      ...live,
      revokedAt: new Date()
    } as never)
    await expectCode(getSharedSession(token), 'NOT_FOUND')
    raw.sessionShareLink.findUnique.mockResolvedValue({
      ...live,
      expiresAt: new Date(Date.now() - 1000)
    } as never)
    await expectCode(getSharedSession(token), 'NOT_FOUND')
    expect(tenantDb).not.toHaveBeenCalled()
  })

  it('still works if recording the view fails', async () => {
    raw.sessionShareLink.update.mockRejectedValue(new Error('db'))
    await expect(getSharedSession(token)).resolves.toBeTruthy()
  })
})
