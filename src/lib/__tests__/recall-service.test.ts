import { beforeEach, describe, expect, it, vi } from 'vitest'

import { deleteAttachmentsFor, storePhoto } from '@/lib/attachments'
import { AppError } from '@/lib/errors'
import { PlanTier } from '@/lib/plans'
import {
  GENERIC_ANALOGUE_DESK,
  GENERIC_ANALOGUE_STRIP
} from '@/lib/recall/builtin'
import {
  createConsole,
  createConsoleTemplate,
  deleteConsole,
  deleteConsoleTemplate,
  getConsoleTemplate,
  listConsoles,
  updateConsole,
  updateConsoleTemplate
} from '@/lib/recall/consoles'
import { addRecallPhoto } from '@/lib/recall/photos'
import {
  addMissingRecallChannels,
  createOutboard,
  createRecallSheet,
  deleteOutboard,
  deleteRecallSheet,
  getRecallSheet,
  listRecallSources,
  updateOutboard,
  updateRecallChannel,
  updateRecallSheet
} from '@/lib/recall/service'
import { getRecallPrintView } from '@/lib/recall/sheet'
import { tenantDb } from '@/lib/tenant-db'
import { makeContext, makeFakeDb, type FakeDb } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

vi.mock('@/lib/tenant-db', () => ({ tenantDb: vi.fn() }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/lib/attachments', () => ({
  deleteAttachmentsFor: vi.fn(),
  storePhoto: vi.fn()
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

const { recordAudit } = vi.mocked(await import('@/lib/audit'))

let db: FakeDb
const owner = makeContext()
const engineer = makeContext({ role: MemberRole.ENGINEER })
const viewer = makeContext({ role: MemberRole.VIEWER })
const free = makeContext({ planTier: PlanTier.FREE, role: MemberRole.ENGINEER })

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AppError)
  await expect(promise).rejects.toMatchObject({ code })
}

const strip = {
  sections: [
    {
      label: 'Input',
      controls: [
        { key: 'gain', label: 'Gain', type: 'knob', unit: 'dB', min: 0 },
        { key: 'phantom', label: '48V', type: 'switch' }
      ]
    }
  ]
}

const newTemplate = { name: 'My desk', strip }

beforeEach(() => {
  vi.clearAllMocks()
  db = makeFakeDb()
  vi.mocked(tenantDb).mockReturnValue(db as never)
  db.microphoneUnit.findMany.mockResolvedValue([])
})

describe('console templates', () => {
  it('create needs permission to manage sessions and a valid strip', async () => {
    await expectCode(createConsoleTemplate(viewer, newTemplate), 'FORBIDDEN')
    await expect(
      createConsoleTemplate(engineer, { name: 'x', strip: { sections: [] } })
    ).rejects.toThrow()
    expect(db.consoleTemplate.create).not.toHaveBeenCalled()
  })

  it('stores the template on any plan and audits it', async () => {
    db.consoleTemplate.create.mockResolvedValue({ id: 't1' })
    await createConsoleTemplate(free, newTemplate)
    expect(db.consoleTemplate.create.mock.calls[0][0].data).toMatchObject({
      organisationId: 'org_1',
      name: 'My desk'
    })
    expect(recordAudit).toHaveBeenCalledWith(
      free,
      expect.objectContaining({ action: 'console_template.create' })
    )
  })

  it('reads a template and treats a corrupt stored strip as empty', async () => {
    db.consoleTemplate.findFirst.mockResolvedValue({
      id: 't1',
      name: 'Bad',
      description: null,
      strip: { oops: true },
      _count: { consoles: 2 }
    })
    expect(await getConsoleTemplate(viewer, 't1')).toMatchObject({
      strip: { sections: [] },
      controlCount: 0,
      consoleCount: 2
    })
  })

  it('404s on an id from another organisation', async () => {
    db.consoleTemplate.findFirst.mockResolvedValue(null)
    await expectCode(getConsoleTemplate(owner, 'x'), 'NOT_FOUND')
    await expectCode(
      updateConsoleTemplate(owner, 'x', { name: 'N' }),
      'NOT_FOUND'
    )
    await expectCode(deleteConsoleTemplate(owner, 'x'), 'NOT_FOUND')
  })

  it('refuses to delete a template a console uses', async () => {
    db.consoleTemplate.findFirst.mockResolvedValue({ name: 'My desk' })
    db.console.count.mockResolvedValue(1)
    await expectCode(deleteConsoleTemplate(owner, 't1'), 'CONFLICT')
    expect(db.consoleTemplate.deleteMany).not.toHaveBeenCalled()
  })

  it('updates through updateMany so a foreign id cannot be written', async () => {
    db.consoleTemplate.findFirst.mockResolvedValue({ name: 'A' })
    db.consoleTemplate.updateMany.mockResolvedValue({ count: 0 })
    await expectCode(
      updateConsoleTemplate(owner, 't1', { name: 'B' }),
      'NOT_FOUND'
    )
  })
})

describe('consoles', () => {
  const base = { name: 'Big desk', channelCount: 32 }

  it('copies the built-in template into the studio when asked', async () => {
    db.consoleTemplate.create.mockResolvedValue({ id: 't_copy' })
    const { id } = await createConsole(engineer, {
      ...base,
      builtinTemplateId: 'generic-analogue'
    })
    expect(db.consoleTemplate.create.mock.calls[0][0].data).toMatchObject({
      organisationId: 'org_1',
      name: 'Generic analogue desk',
      strip: GENERIC_ANALOGUE_DESK,
      defaultValues: { strip: {}, master: {} }
    })
    expect(db.console.create.mock.calls[0][0].data).toMatchObject({
      id,
      templateId: 't_copy',
      channelCount: 32
    })
  })

  it('404s on an unknown built-in or a template that is not yours', async () => {
    await expectCode(
      createConsole(engineer, { ...base, builtinTemplateId: 'nope' }),
      'NOT_FOUND'
    )
    db.consoleTemplate.findFirst.mockResolvedValue(null)
    await expectCode(
      createConsole(engineer, { ...base, templateId: 'theirs' }),
      'NOT_FOUND'
    )
    expect(db.console.create).not.toHaveBeenCalled()
  })

  it('forbids viewers from changing consoles but lets them list', async () => {
    await expectCode(
      createConsole(viewer, { ...base, templateId: 't1' }),
      'FORBIDDEN'
    )
    await expectCode(deleteConsole(viewer, 'c1'), 'FORBIDDEN')
    db.console.findMany.mockResolvedValue([
      {
        id: 'c1',
        name: 'Desk',
        make: null,
        model: null,
        channelCount: 8,
        notes: null,
        templateId: 't1',
        template: { name: 'T' }
      }
    ])
    expect(await listConsoles(viewer)).toEqual([
      expect.objectContaining({ id: 'c1', templateName: 'T' })
    ])
  })

  it('checks the new template when repointing a console', async () => {
    db.console.findFirst.mockResolvedValue({ name: 'Desk' })
    db.consoleTemplate.findFirst.mockResolvedValue(null)
    await expectCode(
      updateConsole(owner, 'c1', { templateId: 'theirs' }),
      'NOT_FOUND'
    )
  })

  it('deletes by id within the organisation', async () => {
    db.console.findFirst.mockResolvedValue({ name: 'Desk' })
    await deleteConsole(owner, 'c1')
    expect(db.console.deleteMany).toHaveBeenCalledWith({ where: { id: 'c1' } })
  })
})

describe('createRecallSheet', () => {
  beforeEach(() => {
    db.recordingSession.findFirst.mockResolvedValue({ id: 's1', name: 'Drums' })
    db.recallSheet.count.mockResolvedValue(0)
    db.console.findFirst.mockResolvedValue({
      id: 'c1',
      name: 'Big desk',
      channelCount: 2,
      template: { strip: GENERIC_ANALOGUE_DESK, defaultValues: null }
    })
    db.inputChannel.findMany.mockResolvedValue([
      {
        id: 'i1',
        number: 1,
        layoutItemId: null,
        kind: 'mic',
        source: 'Kick',
        micUnitId: null,
        stand: null,
        preampInput: 'Pre 1',
        phantom: false,
        padDb: null,
        dawName: null,
        notes: 'private'
      },
      {
        id: 'i3',
        number: 3,
        layoutItemId: null,
        kind: 'line',
        source: 'Synth',
        micUnitId: null,
        stand: null,
        preampInput: null,
        phantom: false,
        padDb: null,
        dawName: null,
        notes: null
      }
    ])
  })

  it('needs permission, a session of this organisation and a console', async () => {
    await expectCode(
      createRecallSheet(viewer, 's1', { consoleId: 'c1' }),
      'FORBIDDEN'
    )
    db.recordingSession.findFirst.mockResolvedValue(null)
    await expectCode(
      createRecallSheet(owner, 's1', { consoleId: 'c1' }),
      'NOT_FOUND'
    )
    db.recordingSession.findFirst.mockResolvedValue({ id: 's1', name: 'Drums' })
    await expectCode(createRecallSheet(owner, 's1', {}), 'BAD_REQUEST')
    db.console.findFirst.mockResolvedValue(null)
    await expectCode(
      createRecallSheet(owner, 's1', { consoleId: 'x' }),
      'NOT_FOUND'
    )
  })

  it('refuses a second sheet for the same session', async () => {
    db.recallSheet.count.mockResolvedValue(1)
    await expectCode(
      createRecallSheet(owner, 's1', { consoleId: 'c1' }),
      'CONFLICT'
    )
    expect(db.recallSheet.create).not.toHaveBeenCalled()
  })

  it('pre-fills from the input list, snapshots the strip and counts inputs past the desk', async () => {
    const { id, skipped } = await createRecallSheet(engineer, 's1', {
      consoleId: 'c1'
    })
    expect(skipped).toBe(1)
    expect(db.recallSheet.create.mock.calls[0][0].data).toMatchObject({
      id,
      sessionId: 's1',
      consoleId: 'c1',
      consoleName: 'Big desk',
      channelCount: 2,
      strip: GENERIC_ANALOGUE_DESK,
      organisationId: 'org_1'
    })
    const rows = db.recallChannel.createMany.mock.calls[0][0].data
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      recallSheetId: id,
      stripNumber: 1,
      inputChannelId: 'i1',
      label: 'Kick',
      notes: 'Preamp: Pre 1',
      organisationId: 'org_1'
    })
    // The channel's own notes are not copied onto the desk sheet.
    expect(rows[0].notes).not.toContain('private')
  })

  it('starts every strip from the template home values, with the input list on top', async () => {
    db.console.findFirst.mockResolvedValue({
      id: 'c1',
      name: 'Big desk',
      channelCount: 2,
      template: {
        strip: GENERIC_ANALOGUE_DESK,
        defaultValues: {
          strip: { phantom: true, fader: 0, gone: 3 },
          master: { main_lr: -5, nothing: 1 }
        }
      }
    })
    await createRecallSheet(engineer, 's1', { consoleId: 'c1' })
    expect(db.recallSheet.create.mock.calls[0][0].data).toMatchObject({
      stripDefaults: { phantom: true, fader: 0 },
      masterValues: { main_lr: -5 }
    })
    const [row] = db.recallChannel.createMany.mock.calls[0][0].data
    // The input list says no phantom on the kick: that wins over the default.
    expect(row.values).toEqual({ phantom: false, fader: 0 })
  })

  it('still works from a template written before the visual desk (v1)', async () => {
    db.console.findFirst.mockResolvedValue({
      id: 'c1',
      name: 'Old desk',
      channelCount: 2,
      template: { strip: GENERIC_ANALOGUE_STRIP, defaultValues: null }
    })
    await createRecallSheet(engineer, 's1', { consoleId: 'c1' })
    const stored = db.recallSheet.create.mock.calls[0][0].data.strip
    expect(stored.version).toBe(2)
    expect(stored.strip.components.map((c: { id: string }) => c.id)).toEqual(
      expect.arrayContaining(['phantom', 'gain', 'fader'])
    )
  })

  it('copies a previous session recall exactly, without photos or input links', async () => {
    db.recallSheet.findFirst.mockResolvedValue({
      consoleId: 'c1',
      consoleName: 'Big desk',
      channelCount: 24,
      strip: GENERIC_ANALOGUE_DESK,
      stripDefaults: { fader: 0 },
      masterValues: { main_lr: -3 },
      notes: 'Tape op: Sam',
      channels: [
        {
          stripNumber: 4,
          label: 'Vocal',
          micName: 'Neumann U 87 Ai',
          values: { gain: 41, phantom: true },
          notes: null
        }
      ],
      outboard: [
        {
          equipmentItemId: 'e1',
          name: 'LA-2A',
          insertOn: 'Vocal',
          settings: [{ label: 'Peak reduction', value: '35' }],
          notes: null,
          sortOrder: 0
        }
      ]
    })
    const result = await createRecallSheet(engineer, 's2', {
      fromSessionId: 's1'
    })
    expect(result.skipped).toBe(0)
    expect(db.recallSheet.findFirst.mock.calls[0][0].where).toEqual({
      sessionId: 's1'
    })
    expect(db.recallSheet.create.mock.calls[0][0].data).toMatchObject({
      sessionId: 's2',
      consoleName: 'Big desk',
      channelCount: 24,
      notes: 'Tape op: Sam',
      strip: GENERIC_ANALOGUE_DESK,
      stripDefaults: { fader: 0 },
      masterValues: { main_lr: -3 }
    })
    expect(db.recallChannel.createMany.mock.calls[0][0].data[0]).toMatchObject({
      stripNumber: 4,
      inputChannelId: null,
      values: { gain: 41, phantom: true }
    })
    expect(db.outboardRecall.createMany.mock.calls[0][0].data[0]).toMatchObject(
      {
        name: 'LA-2A',
        settings: [{ label: 'Peak reduction', value: '35' }]
      }
    )
    expect(db.attachment.findMany).not.toHaveBeenCalled()
  })

  it('404s copying from a session with no sheet or from another organisation', async () => {
    db.recallSheet.findFirst.mockResolvedValue(null)
    await expectCode(
      createRecallSheet(owner, 's2', { fromSessionId: 'theirs' }),
      'NOT_FOUND'
    )
    expect(db.recallSheet.create).not.toHaveBeenCalled()
  })

  it('refuses to copy a session onto itself', async () => {
    await expectCode(
      createRecallSheet(owner, 's1', { fromSessionId: 's1' }),
      'BAD_REQUEST'
    )
  })
})

describe('addMissingRecallChannels', () => {
  it('adds strips for new inputs and leaves the written ones alone', async () => {
    db.recordingSession.findFirst.mockResolvedValue({ id: 's1', name: 'x' })
    db.recallSheet.findFirst.mockResolvedValue({
      id: 'rs1',
      strip: GENERIC_ANALOGUE_DESK,
      channelCount: 8,
      stripDefaults: { fader: -10, phantom: true }
    })
    db.recallChannel.findMany.mockResolvedValue([{ stripNumber: 1 }])
    const channel = (id: string, number: number) => ({
      id,
      number,
      layoutItemId: null,
      kind: 'line',
      source: `S${number}`,
      micUnitId: null,
      stand: null,
      preampInput: null,
      phantom: false,
      padDb: null,
      dawName: null,
      notes: null
    })
    db.inputChannel.findMany.mockResolvedValue([
      channel('a', 1),
      channel('b', 2)
    ])
    const result = await addMissingRecallChannels(engineer, 's1')
    expect(result).toEqual({ added: 1, skipped: 0 })
    const rows = db.recallChannel.createMany.mock.calls[0][0].data
    expect(rows.map((r: { stripNumber: number }) => r.stripNumber)).toEqual([2])
    // The sheet's own snapshot of the home values, then the input list.
    expect(rows[0].values).toEqual({ fader: -10, phantom: false })
  })
})

describe('recall channel, notes and delete', () => {
  beforeEach(() => {
    db.recordingSession.findFirst.mockResolvedValue({ id: 's1', name: 'x' })
    db.recallSheet.findFirst.mockResolvedValue({ id: 'rs1', strip })
    db.recallChannel.findFirst.mockResolvedValue({ stripNumber: 3 })
  })

  it('saves valid values scoped to this sheet', async () => {
    await updateRecallChannel(engineer, 's1', 'rc1', {
      values: { gain: 30, phantom: true },
      notes: 'Pad on the preamp'
    })
    expect(db.recallChannel.updateMany).toHaveBeenCalledWith({
      where: { id: 'rc1', recallSheetId: 'rs1' },
      data: { values: { gain: 30, phantom: true }, notes: 'Pad on the preamp' }
    })
  })

  it('rejects values that do not fit the sheet strip, and writes nothing', async () => {
    await expectCode(
      updateRecallChannel(engineer, 's1', 'rc1', { values: { gain: -5 } }),
      'BAD_REQUEST'
    )
    await expectCode(
      updateRecallChannel(engineer, 's1', 'rc1', { values: { hpf: 1 } }),
      'BAD_REQUEST'
    )
    expect(db.recallChannel.updateMany).not.toHaveBeenCalled()
  })

  it('404s on a channel from another sheet or organisation', async () => {
    db.recallChannel.findFirst.mockResolvedValue(null)
    await expectCode(
      updateRecallChannel(engineer, 's1', 'theirs', { label: 'x' }),
      'NOT_FOUND'
    )
  })

  it('404s when the session has no sheet', async () => {
    db.recallSheet.findFirst.mockResolvedValue(null)
    await expectCode(
      updateRecallSheet(owner, 's1', { notes: 'n' }),
      'NOT_FOUND'
    )
    await expectCode(deleteRecallSheet(owner, 's1'), 'NOT_FOUND')
  })

  it('forbids viewers', async () => {
    await expectCode(
      updateRecallChannel(viewer, 's1', 'rc1', { label: 'x' }),
      'FORBIDDEN'
    )
    await expectCode(
      updateRecallSheet(viewer, 's1', { notes: 'n' }),
      'FORBIDDEN'
    )
    await expectCode(deleteRecallSheet(viewer, 's1'), 'FORBIDDEN')
  })

  it('deleting removes the photo blobs first', async () => {
    await deleteRecallSheet(owner, 's1')
    expect(deleteAttachmentsFor).toHaveBeenCalledWith(
      owner,
      'recall_sheet',
      'rs1'
    )
    expect(db.recallSheet.deleteMany).toHaveBeenCalledWith({
      where: { id: 'rs1' }
    })
    expect(recordAudit).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ action: 'recall.delete' })
    )
  })
})

describe('outboard recall', () => {
  beforeEach(() => {
    db.recordingSession.findFirst.mockResolvedValue({ id: 's1', name: 'x' })
    db.recallSheet.findFirst.mockResolvedValue({ id: 'rs1', strip })
    db.outboardRecall.count.mockResolvedValue(0)
    db.outboardRecall.create.mockResolvedValue({ id: 'o1' })
    db.equipmentItem.findFirst.mockResolvedValue({ id: 'e1' })
  })

  it('adds a unit with its settings, linked to inventory', async () => {
    await createOutboard(engineer, 's1', {
      name: 'LA-2A',
      equipmentItemId: 'e1',
      insertOn: 'Vocal',
      settings: [{ label: 'Gain', value: '40' }]
    })
    expect(db.outboardRecall.create.mock.calls[0][0].data).toMatchObject({
      organisationId: 'org_1',
      recallSheetId: 'rs1',
      equipmentItemId: 'e1',
      settings: [{ label: 'Gain', value: '40' }]
    })
  })

  it("404s when the linked inventory item is not the organisation's", async () => {
    db.equipmentItem.findFirst.mockResolvedValue(null)
    await expectCode(
      createOutboard(engineer, 's1', { name: 'x', equipmentItemId: 'theirs' }),
      'NOT_FOUND'
    )
    expect(db.outboardRecall.create).not.toHaveBeenCalled()
  })

  it('caps the number of units on a sheet', async () => {
    db.outboardRecall.count.mockResolvedValue(60)
    await expectCode(
      createOutboard(engineer, 's1', { name: 'x' }),
      'BAD_REQUEST'
    )
  })

  it('updates and deletes only within this sheet', async () => {
    db.outboardRecall.findFirst.mockResolvedValue({ name: 'LA-2A' })
    await updateOutboard(engineer, 's1', 'o1', {
      settings: [{ label: 'Gain', value: '42' }]
    })
    expect(db.outboardRecall.updateMany.mock.calls[0][0].where).toEqual({
      id: 'o1',
      recallSheetId: 'rs1'
    })
    await deleteOutboard(engineer, 's1', 'o1')
    expect(db.outboardRecall.deleteMany).toHaveBeenCalledWith({
      where: { id: 'o1', recallSheetId: 'rs1' }
    })
    db.outboardRecall.findFirst.mockResolvedValue(null)
    await expectCode(deleteOutboard(engineer, 's1', 'theirs'), 'NOT_FOUND')
    await expectCode(
      updateOutboard(engineer, 's1', 'theirs', { name: 'x' }),
      'NOT_FOUND'
    )
  })

  it('forbids viewers', async () => {
    await expectCode(createOutboard(viewer, 's1', { name: 'x' }), 'FORBIDDEN')
    await expectCode(deleteOutboard(viewer, 's1', 'o1'), 'FORBIDDEN')
  })
})

describe('getRecallSheet and the print view', () => {
  const sheetRow = {
    id: 'rs1',
    consoleId: 'c1',
    consoleName: 'Big desk',
    channelCount: 24,
    strip: GENERIC_ANALOGUE_STRIP,
    notes: null,
    channels: [
      {
        id: 'rc1',
        stripNumber: 1,
        label: 'Kick',
        micName: null,
        values: { gain: 32, nonsense: { nested: true } },
        notes: null
      }
    ],
    outboard: [
      {
        id: 'o1',
        name: 'LA-2A',
        equipmentItemId: null,
        insertOn: null,
        settings: [{ label: 'Gain', value: '40' }, 'junk'],
        notes: null
      }
    ]
  }

  beforeEach(() => {
    db.recordingSession.findFirst.mockResolvedValue({
      id: 's1',
      name: 'Drums',
      client: 'The Band',
      startsAt: new Date('2026-07-01T09:00:00Z'),
      endsAt: new Date('2026-07-01T17:00:00Z'),
      room: { name: 'Live room', studio: { timezone: 'Europe/London' } }
    })
    db.recallSheet.findFirst.mockResolvedValue(sheetRow)
    db.attachment.findMany.mockResolvedValue([
      { id: 'p1', fileName: 'desk.jpg' }
    ])
  })

  it('lets a viewer read, and ignores malformed stored JSON', async () => {
    const sheet = await getRecallSheet(viewer, 's1')
    expect(sheet?.channels[0].values).toEqual({})
    expect(sheet?.outboard[0].settings).toEqual([
      { label: 'Gain', value: '40' }
    ])
    expect(sheet?.photos).toEqual([{ id: 'p1', fileName: 'desk.jpg' }])
    expect(db.attachment.findMany.mock.calls[0][0].where).toEqual({
      entityType: 'recall_sheet',
      entityId: 'rs1'
    })
  })

  it('returns null when the session has no sheet yet, 404 for another organisation', async () => {
    db.recallSheet.findFirst.mockResolvedValue(null)
    expect(await getRecallSheet(viewer, 's1')).toBeNull()
    db.recordingSession.findFirst.mockResolvedValue(null)
    await expectCode(getRecallSheet(viewer, 'theirs'), 'NOT_FOUND')
  })

  it('builds the print view with recorded values only and the plan footer', async () => {
    db.recallSheet.findFirst.mockResolvedValue({
      ...sheetRow,
      channels: [{ ...sheetRow.channels[0], values: { gain: 32 } }]
    })
    const view = await getRecallPrintView(free, 's1')
    expect(view).toMatchObject({
      sessionName: 'Drums',
      consoleName: 'Big desk',
      branded: true,
      organisationName: 'Kigumi Studios'
    })
    expect(view.channels[0].lines).toEqual([
      { section: 'Input', text: 'Gain 32 dB' }
    ])
    const pro = await getRecallPrintView(
      makeContext({ planTier: PlanTier.PRO }),
      's1'
    )
    expect(pro.branded).toBe(false)
  })

  it('404s the print view when there is no sheet', async () => {
    db.recallSheet.findFirst.mockResolvedValue(null)
    await expectCode(getRecallPrintView(owner, 's1'), 'NOT_FOUND')
  })
})

describe('addRecallPhoto', () => {
  it('stores against the session sheet', async () => {
    db.recordingSession.findFirst.mockResolvedValue({ id: 's1', name: 'x' })
    db.recallSheet.findFirst.mockResolvedValue({ id: 'rs1', strip })
    vi.mocked(storePhoto).mockResolvedValue({ id: 'p1' } as never)
    const file = { name: 'd.png', type: 'image/png', data: Buffer.from([1]) }
    await addRecallPhoto(engineer, 's1', file)
    expect(storePhoto).toHaveBeenCalledWith(
      engineer,
      expect.objectContaining({ entityType: 'recall_sheet', entityId: 'rs1' }),
      file
    )
  })

  it('forbids viewers and 404s without a sheet', async () => {
    const file = { name: 'd.png', type: 'image/png', data: Buffer.from([1]) }
    await expectCode(addRecallPhoto(viewer, 's1', file), 'FORBIDDEN')
    db.recordingSession.findFirst.mockResolvedValue({ id: 's1', name: 'x' })
    db.recallSheet.findFirst.mockResolvedValue(null)
    await expectCode(addRecallPhoto(engineer, 's1', file), 'NOT_FOUND')
    expect(storePhoto).not.toHaveBeenCalled()
  })
})

describe('listRecallSources', () => {
  it('lists other sessions that have a sheet, newest first', async () => {
    db.recallSheet.findMany.mockResolvedValue([
      {
        session: {
          id: 's0',
          name: 'Drums',
          startsAt: new Date('2026-06-01T09:00:00Z')
        }
      }
    ])
    expect(await listRecallSources(viewer, 's1')).toEqual([
      { sessionId: 's0', name: 'Drums', date: '2026-06-01' }
    ])
    const args = db.recallSheet.findMany.mock.calls[0][0]
    expect(args.where).toEqual({ sessionId: { not: 's1' } })
    expect(args.orderBy).toEqual({ session: { startsAt: 'desc' } })
  })
})

describe('visual desk templates (ADR 0023)', () => {
  const desk = {
    version: 2,
    heightMm: 300,
    strip: {
      widthMm: 30,
      components: [
        {
          id: 'gain',
          kind: 'knob',
          x: 5,
          y: 5,
          label: 'Gain',
          min: 0,
          max: 60
        },
        { id: 'mute', kind: 'switch', x: 5, y: 40, label: 'Mute' }
      ]
    },
    master: {
      widthMm: 60,
      components: [{ id: 'main', kind: 'fader', x: 5, y: 5, label: 'Main' }]
    }
  }

  it('reads a v1 template as a desk with the same keys and only live home values', async () => {
    db.consoleTemplate.findFirst.mockResolvedValue({
      id: 't1',
      name: 'Old',
      description: null,
      strip,
      defaultValues: { strip: { gain: 20, removed: 1 }, master: {} },
      _count: { consoles: 0 }
    })
    const template = await getConsoleTemplate(viewer, 't1')
    expect(template.layout.version).toBe(2)
    expect(template.layout.strip.components.map((c) => c.id)).toEqual(
      expect.arrayContaining(['gain', 'phantom'])
    )
    expect(template.defaultValues).toEqual({ strip: { gain: 20 }, master: {} })
    expect(template.controlCount).toBe(2)
  })

  it('creates a template with home values that fit it, refusing ones that do not', async () => {
    db.consoleTemplate.create.mockResolvedValue({ id: 't1' })
    await createConsoleTemplate(engineer, {
      name: 'Desk',
      strip: desk,
      defaultValues: { strip: { gain: 30 }, master: { main: 0 } }
    })
    expect(db.consoleTemplate.create.mock.calls[0][0].data).toMatchObject({
      strip: desk,
      defaultValues: { strip: { gain: 30 }, master: { main: 0 } }
    })
    await expectCode(
      createConsoleTemplate(engineer, {
        name: 'Desk',
        strip: desk,
        defaultValues: { strip: { main: 0 }, master: {} }
      }),
      'BAD_REQUEST'
    )
    await expectCode(
      createConsoleTemplate(engineer, {
        name: 'Desk',
        strip: desk,
        defaultValues: { strip: { gain: 99 }, master: {} }
      }),
      'BAD_REQUEST'
    )
  })

  it('drops stored home values whose control was removed when only the layout changes', async () => {
    db.consoleTemplate.findFirst.mockResolvedValue({
      name: 'Desk',
      strip: desk,
      defaultValues: { strip: { gain: 30, mute: true }, master: { main: -5 } }
    })
    db.consoleTemplate.updateMany.mockResolvedValue({ count: 1 })
    const smaller = {
      ...desk,
      strip: {
        ...desk.strip,
        components: [{ ...desk.strip.components[0], max: 20 }]
      }
    }
    await updateConsoleTemplate(engineer, 't1', { strip: smaller })
    expect(
      db.consoleTemplate.updateMany.mock.calls[0][0].data.defaultValues
    ).toEqual({ strip: { gain: 20 }, master: { main: -5 } })
    expect(recordAudit).toHaveBeenCalledWith(
      engineer,
      expect.objectContaining({
        metadata: expect.objectContaining({ droppedValues: 1 })
      })
    )
  })

  it('stores home values sent with a layout as they are, after checking them', async () => {
    db.consoleTemplate.findFirst.mockResolvedValue({
      name: 'Desk',
      strip: desk,
      defaultValues: null
    })
    db.consoleTemplate.updateMany.mockResolvedValue({ count: 1 })
    await updateConsoleTemplate(engineer, 't1', {
      defaultValues: { strip: { mute: false }, master: {} }
    })
    expect(db.consoleTemplate.updateMany.mock.calls[0][0].data).toEqual({
      defaultValues: { strip: { mute: false }, master: {} }
    })
    await expectCode(
      updateConsoleTemplate(engineer, 't1', {
        defaultValues: { strip: { mute: 'yes' }, master: {} }
      }),
      'BAD_REQUEST'
    )
  })
})

describe('saving the desk view in one go', () => {
  beforeEach(() => {
    db.recordingSession.findFirst.mockResolvedValue({ id: 's1', name: 'x' })
    db.recallSheet.findFirst.mockResolvedValue({
      id: 'rs1',
      strip: GENERIC_ANALOGUE_DESK,
      channelCount: 4,
      stripDefaults: null
    })
    db.recallChannel.findMany.mockResolvedValue([{ stripNumber: 1 }])
  })

  it('updates strips that exist, adds ones that do not, and saves the master area', async () => {
    await updateRecallSheet(engineer, 's1', {
      masterValues: { main_lr: -2, monitor_source: 'Mix' },
      channels: [
        { stripNumber: 1, values: { gain: 30, routing: ['1-2', 'L-R'] } },
        { stripNumber: 3, values: { fader: 0 } }
      ]
    })
    expect(db.recallSheet.updateMany).toHaveBeenCalledWith({
      where: { id: 'rs1' },
      data: { masterValues: { main_lr: -2, monitor_source: 'Mix' } }
    })
    expect(db.recallChannel.updateMany).toHaveBeenCalledWith({
      where: { recallSheetId: 'rs1', stripNumber: 1 },
      data: { values: { gain: 30, routing: ['1-2', 'L-R'] } }
    })
    expect(db.recallChannel.create.mock.calls[0][0].data).toMatchObject({
      organisationId: 'org_1',
      recallSheetId: 'rs1',
      stripNumber: 3,
      label: 'Ch 3',
      values: { fader: 0 }
    })
    expect(db.recallChannel.findMany.mock.calls[0][0].where).toEqual({
      recallSheetId: 'rs1',
      stripNumber: { in: [1, 3] }
    })
  })

  it('checks every strip and the master area before writing anything', async () => {
    await expectCode(
      updateRecallSheet(engineer, 's1', {
        channels: [
          { stripNumber: 1, values: { gain: 30 } },
          { stripNumber: 2, values: { routing: ['9-10'] } }
        ]
      }),
      'BAD_REQUEST'
    )
    await expectCode(
      updateRecallSheet(engineer, 's1', { masterValues: { gain: 3 } }),
      'BAD_REQUEST'
    )
    await expectCode(
      updateRecallSheet(engineer, 's1', {
        channels: [{ stripNumber: 5, values: {} }]
      }),
      'BAD_REQUEST'
    )
    // The same strip twice is a malformed request (Zod, 400 at the route).
    await expect(
      updateRecallSheet(engineer, 's1', {
        channels: [
          { stripNumber: 1, values: {} },
          { stripNumber: 1, values: {} }
        ]
      })
    ).rejects.toThrow('Each strip appears once')
    expect(db.recallChannel.updateMany).not.toHaveBeenCalled()
    expect(db.recallChannel.create).not.toHaveBeenCalled()
    expect(db.recallSheet.updateMany).not.toHaveBeenCalled()
  })

  it('returns the desk and only master values that still have a control', async () => {
    db.recallSheet.findFirst.mockResolvedValue({
      id: 'rs1',
      consoleId: null,
      consoleName: 'Desk',
      channelCount: 4,
      strip: GENERIC_ANALOGUE_DESK,
      masterValues: { main_lr: 0, gone: 1 },
      notes: null,
      channels: [],
      outboard: []
    })
    db.attachment.findMany.mockResolvedValue([])
    const sheet = await getRecallSheet(viewer, 's1')
    expect(sheet?.layout).toEqual(GENERIC_ANALOGUE_DESK)
    expect(sheet?.masterValues).toEqual({ main_lr: 0 })
    expect(sheet?.strip.sections.map((s) => s.label)).toEqual([
      'Input',
      'EQ',
      'Aux sends',
      'Output'
    ])
  })
})
