import { vi } from 'vitest'

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
  'create',
  'createMany',
  'updateMany',
  'deleteMany'
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
  return {
    studio: fakeModel(),
    room: fakeModel(),
    equipmentItem: fakeModel(),
    attachment: fakeModel(),
    microphoneUnit: fakeModel(),
    auditLog: fakeModel()
  }
}

export type FakeDb = ReturnType<typeof makeFakeDb>
