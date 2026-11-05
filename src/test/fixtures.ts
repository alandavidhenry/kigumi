import { vi } from 'vitest'

import type { MicDetail } from '@/lib/mics/catalogue'
import { PlanTier } from '@/lib/plans'
import type { TenantContext } from '@/lib/tenant-context'
import { MemberRole } from '@/types/rbac'

export function makeContext(
  overrides: Partial<TenantContext> = {}
): TenantContext {
  return {
    userId: 'user_1',
    userName: 'Ada Engineer',
    userEmail: 'ada@example.com',
    organisationId: 'org_1',
    organisationName: 'Kigumi Studios',
    organisationSlug: 'kigumi-studios',
    role: MemberRole.OWNER,
    planTier: PlanTier.STUDIO,
    ...overrides
  }
}

const MODEL_METHODS = [
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'create',
  'createMany',
  'updateMany',
  'deleteMany',
  'upsert'
] as const

type FakeModel = Record<
  (typeof MODEL_METHODS)[number],
  ReturnType<typeof vi.fn>
>

function fakeModel(): FakeModel {
  return Object.fromEntries(
    MODEL_METHODS.map((method) => [method, vi.fn()])
  ) as FakeModel
}

// Stand-in for tenantDb(ctx) in unit tests: one vi.fn per model method.
export function makeFakeDb() {
  const db = {
    studio: fakeModel(),
    room: fakeModel(),
    equipmentItem: fakeModel(),
    attachment: fakeModel(),
    microphoneUnit: fakeModel(),
    aiUsage: fakeModel(),
    auditLog: fakeModel(),
    recommendationRequest: fakeModel(),
    recommendationResult: fakeModel(),
    recommendationFeedback: fakeModel(),
    recordingSession: fakeModel(),
    layout: fakeModel(),
    layoutItem: fakeModel(),
    inputChannel: fakeModel(),
    sessionShareLink: fakeModel(),
    consoleTemplate: fakeModel(),
    console: fakeModel(),
    recallSheet: fakeModel(),
    recallChannel: fakeModel(),
    outboardRecall: fakeModel(),
    usageCounter: fakeModel(),
    maintenancePlan: fakeModel(),
    maintenanceTask: fakeModel(),
    maintenanceLog: fakeModel(),
    patTest: fakeModel(),
    warranty: fakeModel(),
    notification: fakeModel(),
    // Interactive transactions run against the same fake, so a test sees every
    // write the service makes.
    $transaction: vi.fn(async (run: (tx: unknown) => unknown) => run(db)),
    $executeRaw: vi.fn(async () => 0)
  }
  // Upload checks: an empty owner and no storage used, unless a test says so.
  db.attachment.count.mockResolvedValue(0)
  db.attachment.aggregate.mockResolvedValue({ _sum: { sizeBytes: null } })
  return db
}

export type FakeDb = ReturnType<typeof makeFakeDb>

// A published catalogue microphone with sensible defaults (Shure SM57-like).
export function makeMic(overrides: Partial<MicDetail> = {}): MicDetail {
  return {
    id: 'mic_1',
    slug: 'shure-sm57',
    manufacturer: 'Shure',
    model: 'SM57',
    transducerType: 'dynamic',
    polarPatterns: ['cardioid'],
    powering: 'none',
    phantomSafe: null,
    discontinued: false,
    status: 'published',
    freqRangeMinHz: 40,
    freqRangeMaxHz: 15000,
    sensitivityMvPa: 1.6,
    selfNoiseDbA: null,
    maxSplDb: null,
    impedanceOhm: 310,
    pads: [],
    filters: [],
    weightG: null,
    dimensions: null,
    connector: null,
    statedApplications: ['snare', 'guitar amp'],
    specSheetUrl: null,
    wikidataId: null,
    specConditions: {},
    reviewNotes: null,
    reviewedAt: null,
    publishedAt: null,
    frequencyResponses: [],
    polarData: [],
    provenance: [],
    ...overrides
  }
}
