// Seeds a demo organisation for local development and E2E tests.
// Usage: npm run db:seed -- <password>   (defaults to SEED_PASSWORD or a dev password)
//
// Creates verified users for every role so each permission path can be
// exercised: owner@, manager@, engineer@ and viewer@kigumi.test.
import fs from 'node:fs'
import path from 'node:path'

import { PrismaPg } from '@prisma/adapter-pg'
import { hashPassword } from 'better-auth/crypto'
import { config } from 'dotenv'

import { PrismaClient } from '../src/generated/prisma/client'
import { RECOMMENDATION_PROMPT_VERSION } from '../src/lib/ai/prompts/mic-recommendation'
import { micSlug } from '../src/lib/mics/schemas'
import { ingestEntries, seedFileSchema } from '../src/lib/mics/seed'
import { finalise } from '../src/lib/recommendations/finalise'
import {
  buildRecommendationInput,
  hashRecommendationInput
} from '../src/lib/recommendations/llm-input'
import { runRules } from '../src/lib/recommendations/rules'
import {
  normaliseRequest,
  recommendationRequestSchema
} from '../src/lib/recommendations/schemas'
import { buildSnapshot } from '../src/lib/recommendations/snapshot-build'

import type { Prisma } from '../src/generated/prisma/client'
import type { RecommendationContent } from '../src/lib/recommendations/reply'

config({ path: '.env.local', override: true })
config()

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! })
})

const ORG_ID = 'seed-org-northern-lights'
const ROLES = ['owner', 'manager', 'engineer', 'viewer'] as const

async function upsertUser(role: (typeof ROLES)[number], passwordHash: string) {
  const email = `${role}@kigumi.test`
  const id = `seed-user-${role}`
  const name = `${role[0].toUpperCase()}${role.slice(1)} Demo`

  await prisma.user.upsert({
    where: { email },
    update: { name, emailVerified: true },
    create: { id, email, name, emailVerified: true }
  })
  await prisma.account.upsert({
    where: { id: `seed-account-${role}` },
    update: { password: passwordHash },
    create: {
      id: `seed-account-${role}`,
      accountId: id,
      providerId: 'credential',
      userId: id,
      password: passwordHash
    }
  })
  await prisma.member.upsert({
    where: { id: `seed-member-${role}` },
    update: { role },
    create: {
      id: `seed-member-${role}`,
      organizationId: ORG_ID,
      userId: id,
      role
    }
  })
}

// Loads the starter mic seed files and, for local development and E2E only,
// publishes them so the catalogue and locker can be exercised without a review
// pass. They keep their "unverified draft" provenance, which the UI shows.
// Never run this seed against production: real publishing goes through the
// admin review queue (ADR 0008).
async function seedMicCatalogue() {
  const dir = path.resolve('data/mics')
  const entries = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json') && name !== 'makers.json')
    .flatMap(
      (name) =>
        seedFileSchema.parse(
          JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))
        ).entries
    )
  await prisma.$transaction((tx) => ingestEntries(tx, entries), {
    timeout: 120_000
  })

  const slugs = entries.map((entry) => micSlug(entry.manufacturer, entry.model))
  await prisma.microphoneModel.updateMany({
    where: { slug: { in: slugs }, status: { not: 'published' } },
    data: {
      status: 'published',
      publishedAt: new Date(),
      reviewNotes:
        'Dev seed: published without review. Values are unverified drafts.'
    }
  })

  const units = [
    {
      id: 'seed-unit-u87',
      slug: 'neumann-u-87-ai',
      equipmentItemId: 'seed-eq-u87'
    },
    {
      id: 'seed-unit-sm57',
      slug: 'shure-sm57',
      equipmentItemId: 'seed-eq-sm57'
    }
  ]
  for (const unit of units) {
    const model = await prisma.microphoneModel.findUnique({
      where: { slug: unit.slug },
      select: { id: true }
    })
    if (!model) continue
    await prisma.microphoneUnit.upsert({
      where: { id: unit.id },
      update: {},
      create: {
        id: unit.id,
        organisationId: ORG_ID,
        micModelId: model.id,
        equipmentItemId: unit.equipmentItemId
      }
    })
  }
}

// A stored recommendation for the demo organisation, so the recommendation
// screens can be exercised (and tested end to end) without spending any AI. It
// is built with the real rules and finalise code from the seeded locker; only
// the "model" text is written by hand, and its model name says so. Dev only.
async function seedRecommendation() {
  const rows = await prisma.microphoneUnit.findMany({
    where: { organisationId: ORG_ID },
    select: {
      id: true,
      micModelId: true,
      condition: true,
      matchedPairGroup: true,
      equipmentItem: {
        select: {
          status: true,
          quantity: true,
          roomId: true,
          room: { select: { studioId: true } }
        }
      }
    }
  })
  const models = await prisma.microphoneModel.findMany({
    where: { id: { in: rows.map((row) => row.micModelId) } }
  })
  const snapshot = buildSnapshot(rows, models)

  const request = normaliseRequest(
    recommendationRequestSchema.parse({
      sources: [{ label: 'Lead vocal' }, { label: 'Snare' }]
    })
  )
  const rules = runRules(request, snapshot)
  const { input, aliases } = buildRecommendationInput({
    request,
    rules,
    snapshot,
    room: null,
    unownedNames: []
  })
  if (input.data.sources.length === 0) return

  const content: RecommendationContent = {
    answerable: true,
    sources: input.data.sources.map((source) => ({
      sourceId: source.id,
      primary: {
        option: source.rulesPick ?? source.options[0].id,
        reasoning:
          source.id === 's1'
            ? 'A large-diaphragm condenser suits a close lead vocal. (Dev seed text, not written by a model.)'
            : 'A rugged dynamic is the usual choice for a loud snare. (Dev seed text, not written by a model.)',
        placement: {
          position:
            source.id === 's1'
              ? 'In front of the singer, just above mouth height'
              : 'Just over the rim, aimed at the centre of the head',
          distanceMm: source.placement.distanceMm[0],
          angleDeg: source.placement.angleDeg[0],
          spacingMm: null,
          includedAngleDeg: null
        }
      },
      alternatives: []
    })),
    summary: null
  }
  const { view, adjustments } = finalise({
    request,
    rules,
    snapshot,
    aliases,
    content
  })
  const json = (value: unknown) => value as Prisma.InputJsonValue

  await prisma.recommendationRequest.upsert({
    where: { id: 'seed-rec-request' },
    update: {},
    create: {
      id: 'seed-rec-request',
      organisationId: ORG_ID,
      createdById: 'seed-user-owner',
      kind: request.kind,
      input: json(request),
      rules: json(rules),
      locker: json(snapshot),
      aliases: json(aliases),
      rulesVersion: rules.rulesVersion,
      profilesVersion: rules.profilesVersion,
      inputHash: hashRecommendationInput(input, aliases)
    }
  })
  await prisma.recommendationResult.upsert({
    where: { id: 'seed-rec-result' },
    update: {},
    create: {
      id: 'seed-rec-result',
      organisationId: ORG_ID,
      requestId: 'seed-rec-request',
      promptVersion: RECOMMENDATION_PROMPT_VERSION,
      model: 'dev-seed (not a real model)',
      content: json(content),
      final: json(view),
      adjustments: json(adjustments)
    }
  })
}

// Two demo sessions (dev only). The first has a layout with a drum kit, a
// snare mic (SM57), a lead vocal mic (U 87 Ai) and a guitar amp, with the input
// list the editor would have built from it. The second is empty, so the stored
// recommendation can be applied to it end to end.
async function seedSessions() {
  const room = 'seed-room-live'
  const sessions = [
    {
      id: 'seed-session-tracking',
      name: 'Drum and vocal tracking',
      client: 'The Harbour Lights',
      startsAt: new Date('2030-06-15T09:00:00Z'),
      endsAt: new Date('2030-06-15T17:00:00Z'),
      channelsAvailable: 16
    },
    {
      id: 'seed-session-apply',
      name: 'Overdubs',
      client: null,
      startsAt: new Date('2030-06-22T09:00:00Z'),
      endsAt: new Date('2030-06-22T17:00:00Z'),
      channelsAvailable: null
    }
  ]
  for (const session of sessions) {
    await prisma.recordingSession.upsert({
      where: { id: session.id },
      update: {},
      create: {
        ...session,
        organisationId: ORG_ID,
        roomId: room,
        createdById: 'seed-user-owner'
      }
    })
    await prisma.layout.upsert({
      where: { sessionId: session.id },
      update: {},
      create: {
        id: `${session.id}-layout`,
        organisationId: ORG_ID,
        sessionId: session.id,
        roomId: room,
        name: session.name,
        widthMm: 7200,
        lengthMm: 9400,
        heightMm: 4200,
        createdById: 'seed-user-owner'
      }
    })
  }

  const layoutId = 'seed-session-tracking-layout'
  const base = {
    organisationId: ORG_ID,
    layoutId,
    variant: null,
    pitchDeg: 0,
    locked: false,
    groupId: null,
    equipmentItemId: null,
    showPattern: false,
    recommendationRef: null,
    notes: null
  }
  const items = [
    {
      id: 'seed-item-kit',
      type: 'instrument',
      label: 'Drum kit',
      xMm: 3600,
      yMm: 2600,
      zMm: 0,
      rotationDeg: 0,
      widthMm: 1800,
      depthMm: 1600,
      heightMm: 1000,
      sortOrder: 0,
      micUnitId: null,
      patternSetting: null
    },
    {
      id: 'seed-item-snare',
      type: 'mic',
      label: 'Snare',
      xMm: 3300,
      yMm: 2600,
      zMm: 700,
      rotationDeg: 90,
      widthMm: 100,
      depthMm: 100,
      heightMm: 200,
      sortOrder: 1,
      micUnitId: 'seed-unit-sm57',
      patternSetting: 'cardioid'
    },
    {
      id: 'seed-item-vocal',
      type: 'mic',
      label: 'Lead vocal',
      xMm: 3600,
      yMm: 6200,
      zMm: 1600,
      rotationDeg: 180,
      widthMm: 100,
      depthMm: 100,
      heightMm: 200,
      sortOrder: 2,
      micUnitId: 'seed-unit-u87',
      patternSetting: 'cardioid'
    },
    {
      id: 'seed-item-amp',
      type: 'amp',
      label: 'Guitar amp',
      xMm: 1400,
      yMm: 5000,
      zMm: 0,
      rotationDeg: 90,
      widthMm: 600,
      depthMm: 300,
      heightMm: 600,
      sortOrder: 3,
      micUnitId: null,
      patternSetting: null
    }
  ]
  for (const item of items) {
    await prisma.layoutItem.upsert({
      where: { id: item.id },
      update: {},
      create: { ...base, ...item }
    })
  }

  const channels = [
    {
      id: 'seed-ch-snare',
      number: 1,
      layoutItemId: 'seed-item-snare',
      kind: 'mic',
      source: 'Snare',
      micUnitId: 'seed-unit-sm57',
      phantom: false
    },
    {
      id: 'seed-ch-vocal',
      number: 2,
      layoutItemId: 'seed-item-vocal',
      kind: 'mic',
      source: 'Lead vocal',
      micUnitId: 'seed-unit-u87',
      phantom: true
    },
    {
      id: 'seed-ch-synth',
      number: 3,
      layoutItemId: null,
      kind: 'line',
      source: 'Synth',
      micUnitId: null,
      phantom: false
    }
  ]
  for (const channel of channels) {
    await prisma.inputChannel.upsert({
      where: { id: channel.id },
      update: {},
      create: {
        ...channel,
        organisationId: ORG_ID,
        sessionId: 'seed-session-tracking'
      }
    })
  }
}

// A little maintenance and warranty data so the dashboard has something to
// show in development. Dates are relative to the first time the seed runs.
async function seedCare() {
  const day = 86_400_000
  const at = (offsetDays: number) => {
    const date = new Date(Date.now() + offsetDays * day)
    date.setUTCHours(0, 0, 0, 0)
    return date
  }

  await prisma.maintenancePlan.upsert({
    where: { id: 'seed-plan-sm57' },
    update: {},
    create: {
      id: 'seed-plan-sm57',
      organisationId: ORG_ID,
      equipmentItemId: 'seed-eq-sm57',
      title: 'Check cable and clean grille',
      intervalDays: 90,
      leadDays: 14,
      startsOn: at(-80)
    }
  })
  await prisma.maintenanceTask.upsert({
    where: {
      planId_equipmentItemId: {
        planId: 'seed-plan-sm57',
        equipmentItemId: 'seed-eq-sm57'
      }
    },
    update: {},
    create: {
      organisationId: ORG_ID,
      planId: 'seed-plan-sm57',
      equipmentItemId: 'seed-eq-sm57',
      dueAt: at(10)
    }
  })

  await prisma.warranty.upsert({
    where: { id: 'seed-warranty-u87' },
    update: {},
    create: {
      id: 'seed-warranty-u87',
      organisationId: ORG_ID,
      equipmentItemId: 'seed-eq-u87',
      startsOn: at(-340),
      endsOn: at(25),
      provider: 'Sennheiser UK (Neumann)',
      leadDays: 30
    }
  })

  await prisma.patTest.upsert({
    where: { id: 'seed-pat-u87' },
    update: {},
    create: {
      id: 'seed-pat-u87',
      organisationId: ORG_ID,
      equipmentItemId: 'seed-eq-u87',
      testedAt: at(-350),
      testType: 'combined',
      result: 'pass',
      testerName: 'In-house',
      intervalMonths: 12,
      nextDueAt: at(15)
    }
  })
}

async function main() {
  const password =
    process.argv[2] ?? process.env.SEED_PASSWORD ?? 'kigumi-dev-password'
  const passwordHash = await hashPassword(password)

  await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: {},
    create: {
      id: ORG_ID,
      name: 'Northern Lights Recording',
      slug: 'northern-lights-recording',
      planTier: 'studio'
    }
  })

  for (const role of ROLES) await upsertUser(role, passwordHash)

  const studio = await prisma.studio.upsert({
    where: { id: 'seed-studio-main' },
    update: {},
    create: {
      id: 'seed-studio-main',
      organisationId: ORG_ID,
      name: 'Main studio',
      address: '1 Harbour Street, Leith',
      timezone: 'Europe/London'
    }
  })

  const rooms = [
    {
      id: 'seed-room-live',
      name: 'Live room',
      widthMm: 7200,
      lengthMm: 9400,
      heightMm: 4200
    },
    {
      id: 'seed-room-control',
      name: 'Control room',
      widthMm: 5200,
      lengthMm: 6100,
      heightMm: 3000
    },
    {
      id: 'seed-room-booth',
      name: 'Vocal booth',
      widthMm: 2100,
      lengthMm: 2400,
      heightMm: 2700
    }
  ]
  for (const room of rooms) {
    await prisma.room.upsert({
      where: { id: room.id },
      update: {},
      create: { ...room, organisationId: ORG_ID, studioId: studio.id }
    })
  }

  const equipment = [
    {
      id: 'seed-eq-u87',
      category: 'microphone',
      make: 'Neumann',
      model: 'U 87 Ai',
      serial: 'U87-1042',
      roomId: 'seed-room-booth',
      purchasePriceMinor: 229900,
      tags: ['vocal', 'ldc']
    },
    {
      id: 'seed-eq-sm57',
      category: 'microphone',
      make: 'Shure',
      model: 'SM57',
      quantity: 6,
      roomId: 'seed-room-live',
      purchasePriceMinor: 9900,
      tags: ['dynamic', 'snare']
    },
    {
      id: 'seed-eq-1176',
      category: 'outboard',
      make: 'Universal Audio',
      model: '1176LN',
      roomId: 'seed-room-control',
      status: 'repair',
      purchasePriceMinor: 189900,
      tags: ['compressor']
    },
    {
      id: 'seed-eq-xlr',
      category: 'cable',
      make: 'Mogami',
      model: '2534 XLR 5 m',
      quantity: 24,
      purchasePriceMinor: 2800,
      tags: []
    }
  ]
  for (const item of equipment) {
    await prisma.equipmentItem.upsert({
      where: { id: item.id },
      update: {},
      create: { ...item, organisationId: ORG_ID }
    })
  }

  await seedMicCatalogue()
  await seedRecommendation()
  await seedSessions()
  await seedCare()

  console.warn(
    `Seeded ${ROLES.map((role) => `${role}@kigumi.test`).join(', ')} with the given password`
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
