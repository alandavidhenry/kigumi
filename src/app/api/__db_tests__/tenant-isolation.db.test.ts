import fs from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import * as aiUsage from '@/app/api/ai/usage/route'
import * as attachment from '@/app/api/attachments/[attachmentId]/route'
import * as auditLog from '@/app/api/audit-log/route'
import * as consoleTemplateId from '@/app/api/console-templates/[templateId]/route'
import * as consoleTemplates from '@/app/api/console-templates/route'
import * as consoleId from '@/app/api/consoles/[consoleId]/route'
import * as consoles from '@/app/api/consoles/route'
import * as equipmentPhotos from '@/app/api/equipment/[equipmentId]/photos/route'
import * as equipmentId from '@/app/api/equipment/[equipmentId]/route'
import * as equipmentUsage from '@/app/api/equipment/[equipmentId]/usage/route'
import * as equipmentExport from '@/app/api/equipment/export/route'
import * as equipmentImport from '@/app/api/equipment/import/route'
import * as equipment from '@/app/api/equipment/route'
import * as valuation from '@/app/api/equipment/valuation/route'
import * as matchRoom from '@/app/api/layouts/[layoutId]/match-room/route'
import * as layoutPdf from '@/app/api/layouts/[layoutId]/pdf/route'
import * as layoutId from '@/app/api/layouts/[layoutId]/route'
import * as templateId from '@/app/api/layouts/templates/[layoutId]/route'
import * as templates from '@/app/api/layouts/templates/route'
import * as lockerUnit from '@/app/api/locker/[unitId]/route'
import * as locker from '@/app/api/locker/route'
import * as logFiles from '@/app/api/maintenance/log/[logId]/files/route'
import * as logId from '@/app/api/maintenance/log/[logId]/route'
import * as logs from '@/app/api/maintenance/log/route'
import * as planId from '@/app/api/maintenance/plans/[planId]/route'
import * as plans from '@/app/api/maintenance/plans/route'
import * as completeTask from '@/app/api/maintenance/tasks/[taskId]/complete/route'
import * as tasks from '@/app/api/maintenance/tasks/route'
import * as micId from '@/app/api/mics/[micId]/route'
import * as micSummary from '@/app/api/mics/[micId]/summary/route'
import * as micCompare from '@/app/api/mics/compare/route'
import * as mics from '@/app/api/mics/route'
import * as notificationsRead from '@/app/api/notifications/read/route'
import * as notifications from '@/app/api/notifications/route'
import * as patId from '@/app/api/pat/[testId]/route'
import * as pat from '@/app/api/pat/route'
import * as feedback from '@/app/api/recommendations/[recommendationId]/feedback/route'
import * as recommendationId from '@/app/api/recommendations/[recommendationId]/route'
import * as preview from '@/app/api/recommendations/preview/route'
import * as recommendations from '@/app/api/recommendations/route'
import * as roomId from '@/app/api/rooms/[roomId]/route'
import * as applyRec from '@/app/api/sessions/[sessionId]/apply-recommendation/route'
import * as channelId from '@/app/api/sessions/[sessionId]/channels/[channelId]/route'
import * as channelOrder from '@/app/api/sessions/[sessionId]/channels/order/route'
import * as channels from '@/app/api/sessions/[sessionId]/channels/route'
import * as dawExport from '@/app/api/sessions/[sessionId]/daw-export/route'
import * as duplicate from '@/app/api/sessions/[sessionId]/duplicate/route'
import * as recallChannel from '@/app/api/sessions/[sessionId]/recall/channels/[channelId]/route'
import * as outboardId from '@/app/api/sessions/[sessionId]/recall/outboard/[outboardId]/route'
import * as outboard from '@/app/api/sessions/[sessionId]/recall/outboard/route'
import * as recallPdf from '@/app/api/sessions/[sessionId]/recall/pdf/route'
import * as recallPhotos from '@/app/api/sessions/[sessionId]/recall/photos/route'
import * as recall from '@/app/api/sessions/[sessionId]/recall/route'
import * as recallSync from '@/app/api/sessions/[sessionId]/recall/sync/route'
import * as sessionId from '@/app/api/sessions/[sessionId]/route'
import * as share from '@/app/api/sessions/[sessionId]/share/route'
import * as sheet from '@/app/api/sessions/[sessionId]/sheet/route'
import * as sessions from '@/app/api/sessions/route'
import * as studioRooms from '@/app/api/studios/[studioId]/rooms/route'
import * as studioId from '@/app/api/studios/[studioId]/route'
import * as studios from '@/app/api/studios/route'
import * as warrantyFiles from '@/app/api/warranties/[warrantyId]/files/route'
import * as warrantyId from '@/app/api/warranties/[warrantyId]/route'
import * as warranties from '@/app/api/warranties/route'
import { getTenantContext } from '@/lib/tenant-context'
import {
  MIC_MODEL_ID,
  disconnectDatabase,
  resetDatabase,
  seedMicModel,
  seedOrganisation,
  snapshotOrganisation,
  type SeededOrg
} from '@/test/db/seed'

// Tenant isolation against real Postgres (Phase 8, H2; ADR 0003, 0021).
//
// Two organisations each own a full graph of every tenant model. Signed in as
// organisation A's owner (the most privileged role, so a permission check can't
// hide a leak), every tenant route is called with organisation B's ids, and
// every write that takes a reference is called with A's own target but B's
// referenced id. Each must answer 404 (or, for a few, refuse without effect),
// no response may contain anything of B's, and neither organisation's rows
// may change. The mocked route tests check the code paths; this checks the
// real queries, relations and constraints.

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))
vi.mock('@/lib/tenant-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tenant-context')>()),
  getTenantContext: vi.fn()
}))
vi.mock('@/lib/email', () => ({
  sendInvitationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
  sendReminderDigestEmail: vi.fn()
}))
// Blob storage in memory: isolation is about which rows a query can reach.
const blobs = new Map<string, Buffer>()
vi.mock('@/lib/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage')>()),
  uploadBlob: vi.fn(async (p: string, data: Buffer) => {
    blobs.set(p, data)
  }),
  downloadBlob: vi.fn(async (p: string) => {
    const data = blobs.get(p)
    if (!data)
      throw Object.assign(new Error('BlobNotFound'), { statusCode: 404 })
    return data
  }),
  deleteBlob: vi.fn(async (p: string) => {
    blobs.delete(p)
  })
}))

let A: SeededOrg
let B: SeededOrg

const params = <T>(value: T) => ({ params: Promise.resolve(value) })
const get = (url = 'http://localhost/api') => new Request(url)
const send = (method: string, body: unknown = {}) =>
  new Request('http://localhost/api', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
const png = () => {
  const form = new FormData()
  form.set(
    'file',
    new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      'x.png',
      { type: 'image/png' }
    )
  )
  return new Request('http://localhost/api', { method: 'POST', body: form })
}
const pdf = () => {
  const form = new FormData()
  form.set(
    'file',
    new File([new TextEncoder().encode('%PDF-1.7 x')], 'x.pdf', {
      type: 'application/pdf'
    })
  )
  return new Request('http://localhost/api', { method: 'POST', body: form })
}
const today = () => new Date().toISOString().slice(0, 10)
const inAMonth = () =>
  new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)

interface Case {
  // The route file, relative to src/app/api (used for the coverage check).
  route: string
  name: string
  call: () => Promise<Response>
  // 404 unless stated: anything else must still be a refusal.
  expect?: number[]
}

// Calls with organisation B's ids, made as organisation A.
function crossTenantCases(): Case[] {
  const b = B.ids
  const a = A.ids
  return [
    // Studios and rooms
    {
      route: 'studios/[studioId]',
      name: 'GET B studio',
      call: () => studioId.GET(get(), params({ studioId: b.studio }))
    },
    {
      route: 'studios/[studioId]',
      name: 'PATCH B studio',
      call: () =>
        studioId.PATCH(
          send('PATCH', { name: 'x' }),
          params({ studioId: b.studio })
        )
    },
    {
      route: 'studios/[studioId]',
      name: 'DELETE B studio',
      call: () => studioId.DELETE(get(), params({ studioId: b.studio }))
    },
    {
      route: 'studios/[studioId]/rooms',
      name: 'add a room to B studio',
      call: () =>
        studioRooms.POST(
          send('POST', { name: 'x', widthMm: 3000, lengthMm: 3000 }),
          params({ studioId: b.studio })
        )
    },
    {
      route: 'rooms/[roomId]',
      name: 'PATCH B room',
      call: () =>
        roomId.PATCH(send('PATCH', { name: 'x' }), params({ roomId: b.room }))
    },
    {
      route: 'rooms/[roomId]',
      name: 'DELETE B room',
      call: () => roomId.DELETE(get(), params({ roomId: b.room }))
    },

    // Equipment, photos, attachments
    {
      route: 'equipment',
      name: 'create an item in B room',
      call: () =>
        equipment.POST(
          send('POST', {
            category: 'cable',
            make: 'x',
            model: 'y',
            roomId: b.room
          })
        )
    },
    {
      route: 'equipment/[equipmentId]',
      name: 'GET B item',
      call: () => equipmentId.GET(get(), params({ equipmentId: b.micItem }))
    },
    {
      route: 'equipment/[equipmentId]',
      name: 'PATCH B item',
      call: () =>
        equipmentId.PATCH(
          send('PATCH', { make: 'x' }),
          params({ equipmentId: b.micItem })
        )
    },
    {
      route: 'equipment/[equipmentId]',
      name: 'move A item into B room',
      call: () =>
        equipmentId.PATCH(
          send('PATCH', { roomId: b.room }),
          params({ equipmentId: a.micItem })
        )
    },
    {
      route: 'equipment/[equipmentId]',
      name: 'DELETE B item',
      call: () => equipmentId.DELETE(get(), params({ equipmentId: b.micItem }))
    },
    {
      route: 'equipment/[equipmentId]/photos',
      name: 'upload a photo to B item',
      call: () =>
        equipmentPhotos.POST(png(), params({ equipmentId: b.micItem }))
    },
    {
      route: 'equipment/[equipmentId]/usage',
      name: 'set B item hours',
      call: () =>
        equipmentUsage.PUT(
          send('PUT', { hours: 99 }),
          params({ equipmentId: b.outboardItem })
        )
    },
    ...[b.attPhoto, b.attWarranty, b.attLog, b.attRecall].flatMap(
      (id): Case[] => [
        {
          route: 'attachments/[attachmentId]',
          name: `GET B attachment ${id}`,
          call: () => attachment.GET(get(), params({ attachmentId: id }))
        },
        {
          route: 'attachments/[attachmentId]',
          name: `DELETE B attachment ${id}`,
          call: () => attachment.DELETE(get(), params({ attachmentId: id }))
        }
      ]
    ),

    // Mic locker
    {
      route: 'locker',
      name: 'link B item into A locker',
      call: () =>
        locker.POST(
          send('POST', { micModelId: MIC_MODEL_ID, equipmentItemId: b.micItem })
        )
    },
    {
      route: 'locker',
      name: 'create a locker item in B room',
      call: () =>
        locker.POST(send('POST', { micModelId: MIC_MODEL_ID, roomId: b.room }))
    },
    {
      route: 'locker/[unitId]',
      name: 'PATCH B unit',
      call: () =>
        lockerUnit.PATCH(
          send('PATCH', { notes: 'x' }),
          params({ unitId: b.unit })
        )
    },
    {
      route: 'locker/[unitId]',
      name: 'DELETE B unit',
      call: () => lockerUnit.DELETE(get(), params({ unitId: b.unit }))
    },

    // Recommendations
    {
      route: 'recommendations/preview',
      name: 'preview in B room',
      call: () =>
        preview.POST(
          send('POST', { sources: [{ label: 'Vocal' }], roomId: b.room })
        )
    },
    {
      route: 'recommendations/preview',
      name: 'preview for B session',
      call: () =>
        preview.POST(
          send('POST', { sources: [{ label: 'Vocal' }], sessionId: b.session })
        )
    },
    {
      route: 'recommendations',
      name: 'generate in B room',
      call: () =>
        recommendations.POST(
          send('POST', { sources: [{ label: 'Vocal' }], roomId: b.room })
        ),
      expect: [404, 503]
    },
    {
      route: 'recommendations/[recommendationId]',
      name: 'GET B result',
      call: () =>
        recommendationId.GET(get(), params({ recommendationId: b.recResult }))
    },
    {
      route: 'recommendations/[recommendationId]/feedback',
      name: 'feedback on B result',
      call: () =>
        feedback.PUT(
          send('PUT', { sourceKey: '*', verdict: 'accepted' }),
          params({ recommendationId: b.recResult })
        )
    },

    // Sessions, channels, share links
    {
      route: 'sessions',
      name: 'create a session in B room',
      call: () =>
        sessions.POST(
          send('POST', {
            name: 'x',
            roomId: b.room,
            startsAt: '2030-01-01T10:00',
            endsAt: '2030-01-01T12:00'
          })
        )
    },
    {
      route: 'sessions',
      name: 'start a session from B session',
      call: () =>
        sessions.POST(
          send('POST', {
            name: 'x',
            startsAt: '2030-01-01T10:00',
            endsAt: '2030-01-01T12:00',
            startFrom: { kind: 'session', sessionId: b.session }
          })
        )
    },
    {
      route: 'sessions',
      name: 'start a session from B template',
      call: () =>
        sessions.POST(
          send('POST', {
            name: 'x',
            startsAt: '2030-01-01T10:00',
            endsAt: '2030-01-01T12:00',
            startFrom: { kind: 'template', layoutId: b.templateLayout }
          })
        )
    },
    {
      route: 'sessions/[sessionId]',
      name: 'GET B session',
      call: () => sessionId.GET(get(), params({ sessionId: b.session }))
    },
    {
      route: 'sessions/[sessionId]',
      name: 'PATCH B session',
      call: () =>
        sessionId.PATCH(
          send('PATCH', { name: 'x' }),
          params({ sessionId: b.session })
        )
    },
    {
      route: 'sessions/[sessionId]',
      name: 'move A session into B room',
      call: () =>
        sessionId.PATCH(
          send('PATCH', { roomId: b.room }),
          params({ sessionId: a.session })
        )
    },
    {
      route: 'sessions/[sessionId]',
      name: 'DELETE B session',
      call: () => sessionId.DELETE(get(), params({ sessionId: b.session }))
    },
    {
      route: 'sessions/[sessionId]/duplicate',
      name: 'duplicate B session',
      call: () => duplicate.POST(send('POST'), params({ sessionId: b.session }))
    },
    {
      route: 'sessions/[sessionId]/channels',
      name: 'add a channel to B session',
      call: () =>
        channels.POST(
          send('POST', { source: 'x' }),
          params({ sessionId: b.session })
        )
    },
    {
      route: 'sessions/[sessionId]/channels/[channelId]',
      name: 'PATCH B channel',
      call: () =>
        channelId.PATCH(
          send('PATCH', { source: 'x' }),
          params({ sessionId: b.session, channelId: b.channel })
        )
    },
    {
      route: 'sessions/[sessionId]/channels/[channelId]',
      name: 'B channel through A session',
      call: () =>
        channelId.PATCH(
          send('PATCH', { source: 'x' }),
          params({ sessionId: a.session, channelId: b.channel })
        )
    },
    {
      route: 'sessions/[sessionId]/channels/[channelId]',
      name: 'put B unit on A channel',
      call: () =>
        channelId.PATCH(
          send('PATCH', { micUnitId: b.unit }),
          params({ sessionId: a.session, channelId: a.channel })
        )
    },
    {
      route: 'sessions/[sessionId]/channels/[channelId]',
      name: 'DELETE B channel',
      call: () =>
        channelId.DELETE(
          get(),
          params({ sessionId: b.session, channelId: b.channel })
        )
    },
    {
      route: 'sessions/[sessionId]/channels/order',
      name: 'reorder B session',
      call: () =>
        channelOrder.PUT(
          send('PUT', { ids: [b.channel] }),
          params({ sessionId: b.session })
        )
    },
    {
      route: 'sessions/[sessionId]/channels/order',
      name: 'reorder A session with B channel',
      call: () =>
        channelOrder.PUT(
          send('PUT', { ids: [b.channel] }),
          params({ sessionId: a.session })
        ),
      expect: [400, 404]
    },
    {
      route: 'sessions/[sessionId]/apply-recommendation',
      name: 'apply to B session',
      call: () =>
        applyRec.POST(
          send('POST', { resultId: a.recResult }),
          params({ sessionId: b.session })
        )
    },
    {
      route: 'sessions/[sessionId]/apply-recommendation',
      name: 'apply B result to A session',
      call: () =>
        applyRec.POST(
          send('POST', { resultId: b.recResult }),
          params({ sessionId: a.session })
        )
    },
    {
      route: 'sessions/[sessionId]/daw-export',
      name: 'DAW export of B session',
      call: () =>
        dawExport.GET(
          get('http://localhost/api?format=csv'),
          params({ sessionId: b.session })
        )
    },
    {
      route: 'sessions/[sessionId]/sheet',
      name: 'B session sheet PDF',
      call: () => sheet.GET(get(), params({ sessionId: b.session }))
    },
    {
      route: 'sessions/[sessionId]/share',
      name: 'share B session',
      call: () => share.POST(send('POST'), params({ sessionId: b.session }))
    },
    {
      route: 'sessions/[sessionId]/share',
      name: 'revoke B share link',
      call: () => share.DELETE(get(), params({ sessionId: b.session }))
    },

    // Layouts and templates
    {
      route: 'layouts/[layoutId]',
      name: 'GET B layout',
      call: () => layoutId.GET(get(), params({ layoutId: b.layout }))
    },
    {
      route: 'layouts/[layoutId]',
      name: 'GET B template layout',
      call: () => layoutId.GET(get(), params({ layoutId: b.templateLayout }))
    },
    {
      route: 'layouts/[layoutId]',
      name: 'save B layout',
      call: () =>
        layoutId.PUT(
          send('PUT', { version: 1, items: [] }),
          params({ layoutId: b.layout })
        )
    },
    {
      route: 'layouts/[layoutId]',
      name: 'place B unit in A layout',
      call: () =>
        layoutId.PUT(
          send('PUT', {
            version: 1,
            items: [
              {
                id: 'new_1',
                type: 'mic',
                xMm: 500,
                yMm: 500,
                widthMm: 100,
                depthMm: 100,
                micUnitId: b.unit
              }
            ]
          }),
          params({ layoutId: a.layout })
        )
    },
    {
      route: 'layouts/[layoutId]',
      name: 'place B item in A layout',
      call: () =>
        layoutId.PUT(
          send('PUT', {
            version: 1,
            items: [
              {
                id: 'new_1',
                type: 'amp',
                xMm: 500,
                yMm: 500,
                widthMm: 100,
                depthMm: 100,
                equipmentItemId: b.outboardItem
              }
            ]
          }),
          params({ layoutId: a.layout })
        )
    },
    {
      route: 'layouts/[layoutId]/match-room',
      name: 'match B layout to its room',
      call: () => matchRoom.POST(send('POST'), params({ layoutId: b.layout }))
    },
    {
      route: 'layouts/[layoutId]/pdf',
      name: 'B layout PDF',
      call: () => layoutPdf.GET(get(), params({ layoutId: b.layout }))
    },
    {
      route: 'layouts/templates',
      name: 'save B session as A template',
      call: () =>
        templates.POST(send('POST', { name: 'x', fromSessionId: b.session }))
    },
    {
      route: 'layouts/templates/[layoutId]',
      name: 'rename B template',
      call: () =>
        templateId.PATCH(
          send('PATCH', { name: 'x' }),
          params({ layoutId: b.templateLayout })
        )
    },
    {
      route: 'layouts/templates/[layoutId]',
      name: 'DELETE B template',
      call: () =>
        templateId.DELETE(get(), params({ layoutId: b.templateLayout }))
    },

    // Consoles and recall
    {
      route: 'consoles',
      name: 'create a console on B template',
      call: () =>
        consoles.POST(
          send('POST', {
            name: 'x',
            channelCount: 8,
            templateId: b.consoleTemplate
          })
        )
    },
    {
      route: 'consoles/[consoleId]',
      name: 'PATCH B console',
      call: () =>
        consoleId.PATCH(
          send('PATCH', { name: 'x' }),
          params({ consoleId: b.console })
        )
    },
    {
      route: 'consoles/[consoleId]',
      name: 'point A console at B template',
      call: () =>
        consoleId.PATCH(
          send('PATCH', { templateId: b.consoleTemplate }),
          params({ consoleId: a.console })
        )
    },
    {
      route: 'consoles/[consoleId]',
      name: 'DELETE B console',
      call: () => consoleId.DELETE(get(), params({ consoleId: b.console }))
    },
    {
      route: 'console-templates/[templateId]',
      name: 'GET B strip template',
      call: () =>
        consoleTemplateId.GET(get(), params({ templateId: b.consoleTemplate }))
    },
    {
      route: 'console-templates/[templateId]',
      name: 'PATCH B strip template',
      call: () =>
        consoleTemplateId.PATCH(
          send('PATCH', { name: 'x' }),
          params({ templateId: b.consoleTemplate })
        )
    },
    {
      route: 'console-templates/[templateId]',
      name: 'DELETE B strip template',
      call: () =>
        consoleTemplateId.DELETE(
          get(),
          params({ templateId: b.consoleTemplate })
        )
    },
    {
      route: 'sessions/[sessionId]/recall',
      name: 'GET B recall sheet',
      call: () => recall.GET(get(), params({ sessionId: b.session }))
    },
    {
      route: 'sessions/[sessionId]/recall',
      name: 'create a sheet on B session',
      call: () =>
        recall.POST(
          send('POST', { consoleId: a.console }),
          params({ sessionId: b.session2 })
        )
    },
    {
      route: 'sessions/[sessionId]/recall',
      name: 'A sheet on B console',
      call: () =>
        recall.POST(
          send('POST', { consoleId: b.console }),
          params({ sessionId: a.session2 })
        )
    },
    {
      route: 'sessions/[sessionId]/recall',
      name: 'A sheet copied from B session',
      call: () =>
        recall.POST(
          send('POST', { fromSessionId: b.session }),
          params({ sessionId: a.session2 })
        )
    },
    {
      route: 'sessions/[sessionId]/recall',
      name: 'PATCH B sheet notes',
      call: () =>
        recall.PATCH(
          send('PATCH', { notes: 'x' }),
          params({ sessionId: b.session })
        )
    },
    {
      route: 'sessions/[sessionId]/recall',
      name: 'DELETE B sheet',
      call: () => recall.DELETE(get(), params({ sessionId: b.session }))
    },
    {
      route: 'sessions/[sessionId]/recall/sync',
      name: 'sync B sheet',
      call: () =>
        recallSync.POST(send('POST'), params({ sessionId: b.session }))
    },
    {
      route: 'sessions/[sessionId]/recall/channels/[channelId]',
      name: 'PATCH B strip',
      call: () =>
        recallChannel.PATCH(
          send('PATCH', { label: 'x' }),
          params({ sessionId: b.session, channelId: b.recallChannel })
        )
    },
    {
      route: 'sessions/[sessionId]/recall/channels/[channelId]',
      name: 'B strip through A session',
      call: () =>
        recallChannel.PATCH(
          send('PATCH', { label: 'x' }),
          params({ sessionId: a.session, channelId: b.recallChannel })
        )
    },
    {
      route: 'sessions/[sessionId]/recall/outboard',
      name: 'add outboard to B sheet',
      call: () =>
        outboard.POST(
          send('POST', { name: 'x' }),
          params({ sessionId: b.session })
        )
    },
    {
      route: 'sessions/[sessionId]/recall/outboard',
      name: 'link B item as A outboard',
      call: () =>
        outboard.POST(
          send('POST', { name: 'x', equipmentItemId: b.outboardItem }),
          params({ sessionId: a.session })
        )
    },
    {
      route: 'sessions/[sessionId]/recall/outboard/[outboardId]',
      name: 'PATCH B outboard',
      call: () =>
        outboardId.PATCH(
          send('PATCH', { name: 'x' }),
          params({ sessionId: b.session, outboardId: b.outboard })
        )
    },
    {
      route: 'sessions/[sessionId]/recall/outboard/[outboardId]',
      name: 'relink A outboard to B item',
      call: () =>
        outboardId.PATCH(
          send('PATCH', { equipmentItemId: b.outboardItem }),
          params({ sessionId: a.session, outboardId: a.outboard })
        )
    },
    {
      route: 'sessions/[sessionId]/recall/outboard/[outboardId]',
      name: 'DELETE B outboard',
      call: () =>
        outboardId.DELETE(
          get(),
          params({ sessionId: b.session, outboardId: b.outboard })
        )
    },
    {
      route: 'sessions/[sessionId]/recall/photos',
      name: 'upload a desk photo to B sheet',
      call: () => recallPhotos.POST(png(), params({ sessionId: b.session }))
    },
    {
      route: 'sessions/[sessionId]/recall/pdf',
      name: 'B recall PDF',
      call: () => recallPdf.GET(get(), params({ sessionId: b.session }))
    },

    // Maintenance, PAT, warranties, notifications
    {
      route: 'maintenance/plans',
      name: 'plan for B item',
      call: () =>
        plans.POST(
          send('POST', {
            equipmentItemId: b.outboardItem,
            title: 'x',
            intervalDays: 30
          })
        )
    },
    {
      route: 'maintenance/plans/[planId]',
      name: 'PATCH B plan',
      call: () =>
        planId.PATCH(send('PATCH', { title: 'x' }), params({ planId: b.plan }))
    },
    {
      route: 'maintenance/plans/[planId]',
      name: 'DELETE B plan',
      call: () => planId.DELETE(get(), params({ planId: b.plan }))
    },
    {
      route: 'maintenance/tasks/[taskId]/complete',
      name: 'complete B task',
      call: () =>
        completeTask.POST(send('POST', {}), params({ taskId: b.task }))
    },
    {
      route: 'maintenance/log',
      name: 'log work on B item',
      call: () =>
        logs.POST(send('POST', { equipmentItemId: b.outboardItem, title: 'x' }))
    },
    {
      route: 'maintenance/log/[logId]',
      name: 'DELETE B log entry',
      call: () => logId.DELETE(get(), params({ logId: b.log }))
    },
    {
      route: 'maintenance/log/[logId]/files',
      name: 'attach a file to B log entry',
      call: () => logFiles.POST(pdf(), params({ logId: b.log }))
    },
    {
      route: 'pat',
      name: 'PAT test on B item',
      call: () =>
        pat.POST(
          send('POST', {
            equipmentItemId: b.outboardItem,
            testedAt: today(),
            result: 'pass'
          })
        )
    },
    {
      route: 'pat/[testId]',
      name: 'PATCH B PAT test',
      call: () =>
        patId.PATCH(send('PATCH', { notes: 'x' }), params({ testId: b.pat }))
    },
    {
      route: 'pat/[testId]',
      name: 'DELETE B PAT test',
      call: () => patId.DELETE(get(), params({ testId: b.pat }))
    },
    {
      route: 'warranties',
      name: 'warranty on B item',
      call: () =>
        warranties.POST(
          send('POST', { equipmentItemId: b.micItem, endsOn: inAMonth() })
        )
    },
    {
      route: 'warranties/[warrantyId]',
      name: 'PATCH B warranty',
      call: () =>
        warrantyId.PATCH(
          send('PATCH', { provider: 'x' }),
          params({ warrantyId: b.warranty })
        )
    },
    {
      route: 'warranties/[warrantyId]',
      name: 'DELETE B warranty',
      call: () => warrantyId.DELETE(get(), params({ warrantyId: b.warranty }))
    },
    {
      route: 'warranties/[warrantyId]/files',
      name: 'attach a receipt to B warranty',
      call: () => warrantyFiles.POST(pdf(), params({ warrantyId: b.warranty }))
    },
    // Scoped to your own unread notifications: B's ids simply match nothing.
    {
      route: 'notifications/read',
      name: 'mark B notification read',
      call: () =>
        notificationsRead.POST(send('POST', { ids: [b.notification] })),
      expect: [200]
    }
  ]
}

// Reads as organisation A; none may contain anything of B's.
function listCases(): Case[] {
  return [
    { route: 'studios', name: 'studios', call: () => studios.GET() },
    {
      route: 'equipment',
      name: 'equipment',
      call: () => equipment.GET(get('http://localhost/api/equipment'))
    },
    {
      route: 'equipment/export',
      name: 'equipment CSV',
      call: () =>
        equipmentExport.GET(get('http://localhost/api/equipment/export'))
    },
    {
      route: 'equipment/valuation',
      name: 'valuation',
      call: () => valuation.GET(get('http://localhost/api/equipment/valuation'))
    },
    { route: 'locker', name: 'locker', call: () => locker.GET() },
    {
      route: 'sessions',
      name: 'sessions',
      call: () => sessions.GET(get('http://localhost/api/sessions?scope=all'))
    },
    {
      route: 'layouts/templates',
      name: 'layout templates',
      call: () => templates.GET()
    },
    { route: 'consoles', name: 'consoles', call: () => consoles.GET() },
    {
      route: 'console-templates',
      name: 'strip templates',
      call: () => consoleTemplates.GET()
    },
    {
      route: 'maintenance/plans',
      name: 'plans',
      call: () => plans.GET(get('http://localhost/api/maintenance/plans'))
    },
    {
      route: 'maintenance/tasks',
      name: 'tasks',
      call: () =>
        tasks.GET(get('http://localhost/api/maintenance/tasks?scope=all'))
    },
    {
      route: 'maintenance/log',
      name: 'service log',
      call: () => logs.GET(get('http://localhost/api/maintenance/log'))
    },
    {
      route: 'pat',
      name: 'PAT register',
      call: () => pat.GET(get('http://localhost/api/pat'))
    },
    {
      route: 'warranties',
      name: 'warranties',
      call: () => warranties.GET(get('http://localhost/api/warranties'))
    },
    {
      route: 'notifications',
      name: 'notifications',
      call: () => notifications.GET()
    },
    {
      route: 'recommendations',
      name: 'recommendation history',
      call: () =>
        recommendations.GET(get('http://localhost/api/recommendations'))
    },
    {
      route: 'audit-log',
      name: 'activity log',
      call: () => auditLog.GET(get('http://localhost/api/audit-log'))
    },
    { route: 'ai/usage', name: 'AI usage', call: () => aiUsage.GET() },
    // The catalogue is global by design; it must still hold no tenant data.
    {
      route: 'mics',
      name: 'catalogue',
      call: () => mics.GET(get('http://localhost/api/mics'))
    },
    {
      route: 'mics/[micId]',
      name: 'catalogue mic',
      call: () => micId.GET(get(), params({ micId: 'iso-test-mic' }))
    },
    {
      route: 'mics/[micId]/summary',
      name: 'cached mic summary',
      call: () => micSummary.GET(get(), params({ micId: 'iso-test-mic' }))
    },
    {
      route: 'mics/compare',
      name: 'cached comparison',
      call: () =>
        micCompare.GET(
          get(
            'http://localhost/api/mics/compare?mics=iso-test-mic,iso-test-mic-2'
          )
        ),
      expect: [200, 400, 404]
    }
  ]
}

// Writes with no foreign id in them; listed so the coverage check below sees
// every route. Their isolation is the create-time scoping already exercised.
const NO_FOREIGN_INPUT = new Set([
  'equipment/import',
  'mics/[micId]/summary',
  'mics/compare'
])

beforeAll(async () => {
  await resetDatabase()
  await seedMicModel()
  A = await seedOrganisation('orgalpha')
  B = await seedOrganisation('orgbeta')
  vi.mocked(getTenantContext).mockResolvedValue(A.ctx)
})

afterAll(async () => {
  await disconnectDatabase()
})

describe('tenant isolation against Postgres', () => {
  it('the seed gives both organisations a row in every tenant table', async () => {
    const a = JSON.parse(await snapshotOrganisation(A.ids.org))
    const b = JSON.parse(await snapshotOrganisation(B.ids.org))
    for (const [model, rows] of Object.entries(b)) {
      expect(
        rows as unknown[],
        `organisation B has no ${model}`
      ).not.toHaveLength(0)
      expect(
        a[model] as unknown[],
        `organisation A has no ${model}`
      ).not.toHaveLength(0)
    }
  })

  it('every call with another organisation’s ids is refused, leaks nothing and changes nothing', async () => {
    const beforeA = await snapshotOrganisation(A.ids.org)
    const beforeB = await snapshotOrganisation(B.ids.org)

    const failures: string[] = []
    for (const testCase of crossTenantCases()) {
      const response = await testCase.call()
      const allowed = testCase.expect ?? [404]
      const body = await response.text()
      if (!allowed.includes(response.status)) {
        failures.push(
          `${testCase.name}: ${response.status} ${body.slice(0, 200)}`
        )
      }
      if (body.includes(B.marker) || body.includes('orgbeta_')) {
        failures.push(`${testCase.name}: response mentions organisation B`)
      }
    }
    expect(failures).toEqual([])

    expect(await snapshotOrganisation(B.ids.org)).toBe(beforeB)
    expect(await snapshotOrganisation(A.ids.org)).toBe(beforeA)
  })

  it('every list and read shows only the caller’s own data', async () => {
    const failures: string[] = []
    for (const testCase of listCases()) {
      const response = await testCase.call()
      const body = await response.text()
      const allowed = testCase.expect ?? [200]
      if (!allowed.includes(response.status)) {
        failures.push(
          `${testCase.name}: ${response.status} ${body.slice(0, 200)}`
        )
      }
      if (body.includes(B.marker) || body.includes('orgbeta_')) {
        failures.push(`${testCase.name}: lists organisation B's data`)
      }
    }
    expect(failures).toEqual([])
  })

  it('the same calls work for the owning organisation (the 404s are not just broken routes)', async () => {
    const a = A.ids
    const own: [string, () => Promise<Response>][] = [
      ['studio', () => studioId.GET(get(), params({ studioId: a.studio }))],
      [
        'item',
        () => equipmentId.GET(get(), params({ equipmentId: a.micItem }))
      ],
      [
        'attachment',
        async () => {
          blobs.set(
            `${a.org}/${a.attPhoto}.png`,
            Buffer.from([0x89, 0x50, 0x4e, 0x47])
          )
          return attachment.GET(get(), params({ attachmentId: a.attPhoto }))
        }
      ],
      ['session', () => sessionId.GET(get(), params({ sessionId: a.session }))],
      ['layout', () => layoutId.GET(get(), params({ layoutId: a.layout }))],
      [
        'recall sheet',
        () => recall.GET(get(), params({ sessionId: a.session }))
      ],
      [
        'strip template',
        () =>
          consoleTemplateId.GET(
            get(),
            params({ templateId: a.consoleTemplate })
          )
      ],
      [
        'DAW export',
        () =>
          dawExport.GET(
            get('http://localhost/api?format=csv'),
            params({ sessionId: a.session })
          )
      ]
    ]
    for (const [name, call] of own) {
      expect((await call()).status, name).toBe(200)
    }
  })

  it('covers every tenant route in src/app/api', () => {
    const root = path.resolve('src/app/api')
    const routes: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('__')) walk(full)
        } else if (entry.name === 'route.ts') {
          if (fs.readFileSync(full, 'utf8').includes('getTenantContext')) {
            routes.push(path.relative(root, dir).split(path.sep).join('/'))
          }
        }
      }
    }
    walk(root)

    const covered = new Set([
      ...crossTenantCases().map((c) => c.route),
      ...listCases().map((c) => c.route),
      ...NO_FOREIGN_INPUT
    ])
    expect(routes.filter((route) => !covered.has(route))).toEqual([])
  })
})

// Keep the import live for the coverage list above.
void equipmentImport
