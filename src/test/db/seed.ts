import { PlanTier } from '@/lib/plans'
import prisma from '@/lib/prisma'
import { GENERIC_ANALOGUE_STRIP } from '@/lib/recall/builtin'
import { hashToken } from '@/lib/secret-box'
import type { TenantContext } from '@/lib/tenant-context'
import { TENANT_MODELS } from '@/lib/tenant-scope'
import { MemberRole } from '@/types/rbac'

// A complete graph of every tenant-owned model for one organisation, with
// predictable ids (`<prefix>_<thing>`) and a marker string in its free text,
// so a test can look for either leaking into another organisation's responses.

export const MIC_MODEL_ID = 'iso_mic_model'
const DAY = 86_400_000

export interface SeededOrg {
  prefix: string
  marker: string
  ctx: TenantContext
  ids: {
    org: string
    user: string
    studio: string
    room: string
    micItem: string
    outboardItem: string
    unit: string
    attPhoto: string
    attWarranty: string
    attLog: string
    attRecall: string
    session: string
    session2: string
    layout: string
    layoutItem: string
    channel: string
    templateLayout: string
    shareToken: string
    consoleTemplate: string
    console: string
    sheet: string
    recallChannel: string
    outboard: string
    plan: string
    task: string
    log: string
    pat: string
    warranty: string
    notification: string
    recRequest: string
    recResult: string
  }
}

export async function resetDatabase(): Promise<void> {
  // Every application table, emptied in one statement.
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'`
  const tables = rows.map((row) => `"${row.tablename}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables} CASCADE`)
}

export async function seedMicModel(): Promise<void> {
  await prisma.microphoneModel.create({
    data: {
      id: MIC_MODEL_ID,
      slug: 'iso-test-mic',
      manufacturer: 'Isolation',
      model: 'Test Mic',
      transducerType: 'ldc',
      polarPatterns: ['cardioid'],
      powering: 'phantom',
      status: 'published',
      publishedAt: new Date()
    }
  })
}

// The token every seeded share link uses (43 URL-safe characters).
export function shareTokenFor(prefix: string): string {
  return `${prefix}_share_`.padEnd(43, 'x')
}

export async function seedOrganisation(prefix: string): Promise<SeededOrg> {
  const marker = `${prefix.toUpperCase()}-MARKER`
  const id = (name: string) => `${prefix}_${name}`
  const ids: SeededOrg['ids'] = {
    org: id('org'),
    user: id('user'),
    studio: id('studio'),
    room: id('room'),
    micItem: id('item_mic'),
    outboardItem: id('item_outboard'),
    unit: id('unit'),
    attPhoto: id('att_photo'),
    attWarranty: id('att_warranty'),
    attLog: id('att_log'),
    attRecall: id('att_recall'),
    session: id('session'),
    session2: id('session2'),
    layout: id('layout'),
    layoutItem: id('layout_item'),
    channel: id('channel'),
    templateLayout: id('template_layout'),
    shareToken: shareTokenFor(prefix),
    consoleTemplate: id('console_template'),
    console: id('console'),
    sheet: id('sheet'),
    recallChannel: id('recall_channel'),
    outboard: id('outboard'),
    plan: id('plan'),
    task: id('task'),
    log: id('log'),
    pat: id('pat'),
    warranty: id('warranty'),
    notification: id('notification'),
    recRequest: id('rec_request'),
    recResult: id('rec_result')
  }
  const org = ids.org
  const now = Date.now()
  const strip = JSON.parse(JSON.stringify(GENERIC_ANALOGUE_STRIP))

  await prisma.user.create({
    data: {
      id: ids.user,
      name: `${marker} owner`,
      email: `${prefix}@isolation.test`,
      emailVerified: true
    }
  })
  await prisma.organization.create({
    data: {
      id: org,
      name: `${marker} org`,
      slug: prefix,
      planTier: 'studio'
    }
  })
  await prisma.member.create({
    data: {
      id: id('member'),
      organizationId: org,
      userId: ids.user,
      role: 'owner'
    }
  })

  await prisma.studio.create({
    data: { id: ids.studio, organisationId: org, name: `${marker} studio` }
  })
  await prisma.room.create({
    data: {
      id: ids.room,
      organisationId: org,
      studioId: ids.studio,
      name: `${marker} room`,
      widthMm: 6000,
      lengthMm: 5000
    }
  })
  await prisma.equipmentItem.createMany({
    data: [
      {
        id: ids.micItem,
        organisationId: org,
        roomId: ids.room,
        category: 'microphone',
        make: 'Isolation',
        model: 'Test Mic',
        serial: `${marker}-SN`,
        purchasePriceMinor: 10_000,
        tags: [prefix]
      },
      {
        id: ids.outboardItem,
        organisationId: org,
        category: 'outboard',
        make: 'Isolation',
        model: `${marker} compressor`,
        tags: []
      }
    ]
  })
  await prisma.microphoneUnit.create({
    data: {
      id: ids.unit,
      organisationId: org,
      micModelId: MIC_MODEL_ID,
      equipmentItemId: ids.micItem,
      notes: marker
    }
  })

  await prisma.recordingSession.createMany({
    data: [
      {
        id: ids.session,
        organisationId: org,
        roomId: ids.room,
        name: `${marker} session`,
        client: marker,
        startsAt: new Date(now + 7 * DAY),
        endsAt: new Date(now + 7 * DAY + 4 * 3_600_000)
      },
      {
        id: ids.session2,
        organisationId: org,
        name: `${marker} session two`,
        startsAt: new Date(now + 14 * DAY),
        endsAt: new Date(now + 14 * DAY + 4 * 3_600_000)
      }
    ]
  })
  await prisma.layout.createMany({
    data: [
      {
        id: ids.layout,
        organisationId: org,
        sessionId: ids.session,
        roomId: ids.room,
        name: `${marker} layout`,
        widthMm: 6000,
        lengthMm: 5000
      },
      {
        id: ids.templateLayout,
        organisationId: org,
        isTemplate: true,
        name: `${marker} template`,
        widthMm: 6000,
        lengthMm: 5000
      }
    ]
  })
  await prisma.layoutItem.create({
    data: {
      id: ids.layoutItem,
      organisationId: org,
      layoutId: ids.layout,
      type: 'mic',
      label: marker,
      xMm: 1000,
      yMm: 1000,
      widthMm: 200,
      depthMm: 200,
      micUnitId: ids.unit
    }
  })
  await prisma.inputChannel.create({
    data: {
      id: ids.channel,
      organisationId: org,
      sessionId: ids.session,
      number: 1,
      layoutItemId: ids.layoutItem,
      kind: 'mic',
      source: `${marker} vocal`,
      micUnitId: ids.unit
    }
  })
  await prisma.sessionShareLink.create({
    data: {
      id: id('share'),
      organisationId: org,
      sessionId: ids.session,
      tokenHash: hashToken(ids.shareToken)
    }
  })

  await prisma.consoleTemplate.create({
    data: {
      id: ids.consoleTemplate,
      organisationId: org,
      name: `${marker} strip`,
      strip
    }
  })
  await prisma.console.create({
    data: {
      id: ids.console,
      organisationId: org,
      templateId: ids.consoleTemplate,
      name: `${marker} desk`,
      channelCount: 24
    }
  })
  await prisma.recallSheet.create({
    data: {
      id: ids.sheet,
      organisationId: org,
      sessionId: ids.session,
      consoleId: ids.console,
      consoleName: `${marker} desk`,
      channelCount: 24,
      strip
    }
  })
  await prisma.recallChannel.create({
    data: {
      id: ids.recallChannel,
      organisationId: org,
      recallSheetId: ids.sheet,
      stripNumber: 1,
      inputChannelId: ids.channel,
      label: `${marker} vocal`
    }
  })
  await prisma.outboardRecall.create({
    data: {
      id: ids.outboard,
      organisationId: org,
      recallSheetId: ids.sheet,
      equipmentItemId: ids.outboardItem,
      name: `${marker} insert`
    }
  })

  await prisma.usageCounter.create({
    data: {
      id: id('usage'),
      organisationId: org,
      equipmentItemId: ids.outboardItem,
      hours: 10
    }
  })
  await prisma.maintenancePlan.create({
    data: {
      id: ids.plan,
      organisationId: org,
      equipmentItemId: ids.outboardItem,
      title: `${marker} service`,
      intervalDays: 90
    }
  })
  await prisma.maintenanceTask.create({
    data: {
      id: ids.task,
      organisationId: org,
      planId: ids.plan,
      equipmentItemId: ids.outboardItem,
      dueAt: new Date(now - DAY)
    }
  })
  await prisma.maintenanceLog.create({
    data: {
      id: ids.log,
      organisationId: org,
      equipmentItemId: ids.outboardItem,
      title: `${marker} repair`,
      performedAt: new Date(now - 30 * DAY)
    }
  })
  await prisma.patTest.create({
    data: {
      id: ids.pat,
      organisationId: org,
      equipmentItemId: ids.outboardItem,
      testedAt: new Date(now - 60 * DAY),
      testType: 'combined',
      result: 'pass',
      testerName: marker,
      intervalMonths: 12,
      nextDueAt: new Date(now + 300 * DAY)
    }
  })
  await prisma.warranty.create({
    data: {
      id: ids.warranty,
      organisationId: org,
      equipmentItemId: ids.micItem,
      endsOn: new Date(now + 20 * DAY),
      provider: marker
    }
  })
  await prisma.notification.create({
    data: {
      id: ids.notification,
      organisationId: org,
      userId: ids.user,
      kind: 'warranty_expiring',
      title: `${marker} warranty`,
      dedupeKey: `${prefix}-dedupe`
    }
  })

  await prisma.attachment.createMany({
    data: (
      [
        [ids.attPhoto, 'equipment', ids.micItem, 'image/png', 'png'],
        [ids.attWarranty, 'warranty', ids.warranty, 'application/pdf', 'pdf'],
        [ids.attLog, 'maintenance_log', ids.log, 'application/pdf', 'pdf'],
        [ids.attRecall, 'recall_sheet', ids.sheet, 'image/png', 'png']
      ] as const
    ).map(([attachmentId, entityType, entityId, mimeType, ext]) => ({
      id: attachmentId,
      organisationId: org,
      entityType,
      entityId,
      blobPath: `${org}/${attachmentId}.${ext}`,
      fileName: `${marker}.${ext}`,
      mimeType,
      sizeBytes: 8,
      kind:
        entityType === 'equipment' || entityType === 'recall_sheet'
          ? 'photo'
          : 'receipt'
    }))
  })

  await prisma.recommendationRequest.create({
    data: {
      id: ids.recRequest,
      organisationId: org,
      createdById: ids.user,
      kind: 'sources',
      roomId: ids.room,
      // A normalised request, as the history list reads it.
      input: {
        kind: 'sources',
        sources: [
          {
            id: 's1',
            label: `${marker} vocal`,
            kind: 'vocal_lead',
            technique: 'single'
          }
        ],
        question: null,
        intent: null,
        roomId: ids.room,
        forDate: null,
        channels: null,
        phantomMode: 'per_channel'
      },
      rules: {},
      locker: {},
      aliases: {},
      rulesVersion: '1',
      profilesVersion: '1',
      inputHash: `${prefix}-hash`
    }
  })
  await prisma.recommendationResult.create({
    data: {
      id: ids.recResult,
      organisationId: org,
      requestId: ids.recRequest,
      promptVersion: '2',
      model: 'isolation-model',
      content: {},
      final: {}
    }
  })
  await prisma.recommendationFeedback.create({
    data: {
      id: id('feedback'),
      organisationId: org,
      resultId: ids.recResult,
      userId: ids.user,
      sourceKey: '*',
      verdict: 'accepted',
      comment: marker
    }
  })
  await prisma.aiUsage.create({
    data: {
      id: id('ai_usage'),
      organisationId: org,
      month: new Date().toISOString().slice(0, 7),
      requests: 1
    }
  })
  await prisma.auditLog.create({
    data: {
      id: id('audit'),
      organisationId: org,
      actorUserId: ids.user,
      action: 'studio.create',
      entityType: 'studio',
      entityId: ids.studio,
      summary: `Created ${marker} studio`
    }
  })

  return {
    prefix,
    marker,
    ids,
    ctx: {
      userId: ids.user,
      userName: `${marker} owner`,
      userEmail: `${prefix}@isolation.test`,
      organisationId: org,
      organisationName: `${marker} org`,
      organisationSlug: prefix,
      role: MemberRole.OWNER,
      planTier: PlanTier.STUDIO
    }
  }
}

// Prisma delegate names for every tenant model (TENANT_MODELS is PascalCase).
export const TENANT_DELEGATES = [...TENANT_MODELS].map(
  (model) => model[0].toLowerCase() + model.slice(1)
)

// Every tenant row an organisation owns, in a stable order: compared before and
// after a batch of requests to prove nothing was written.
export async function snapshotOrganisation(
  organisationId: string
): Promise<string> {
  const parts: Record<string, unknown> = {}
  for (const delegate of TENANT_DELEGATES) {
    const model = (
      prisma as unknown as Record<
        string,
        {
          findMany: (args: unknown) => Promise<unknown[]>
        }
      >
    )[delegate]
    parts[delegate] = await model.findMany({
      where: { organisationId },
      orderBy: { id: 'asc' }
    })
  }
  return JSON.stringify(parts)
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect()
}
