import { AppError } from '@/lib/errors'

// Pure query-rewriting rules behind tenantDb() (ADR 0003). Kept free of Prisma
// and auth imports so the rules can be unit tested exhaustively.

// Prisma model names (PascalCase) that carry a non-null organisationId.
// Every new tenant-owned model must be added here.
export const TENANT_MODELS: ReadonlySet<string> = new Set([
  'Studio',
  'Room',
  'EquipmentItem',
  'Attachment',
  'AuditLog'
])

type Args = Record<string, unknown> | undefined

const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'upsert'
])

const CREATE_OPERATIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn'
])

const UPDATE_DATA_OPERATIONS = new Set([
  'update',
  'updateMany',
  'updateManyAndReturn'
])

function crossTenant(): AppError {
  return new AppError('CROSS_TENANT', 'Resource not found')
}

function assertSameOrganisation(value: unknown, organisationId: string) {
  if (value !== undefined && value !== organisationId) throw crossTenant()
}

function scopeWhere(where: unknown, organisationId: string) {
  const current = (where ?? {}) as Record<string, unknown>
  assertSameOrganisation(current.organisationId, organisationId)
  return { ...current, organisationId }
}

function scopeCreateData(data: unknown, organisationId: string) {
  const current = (data ?? {}) as Record<string, unknown>
  assertSameOrganisation(current.organisationId, organisationId)
  if ('organisation' in current) {
    // Relation-style connects could point anywhere; require the scalar form.
    throw crossTenant()
  }
  return { ...current, organisationId }
}

function checkUpdateData(data: unknown, organisationId: string) {
  const current = (data ?? {}) as Record<string, unknown>
  assertSameOrganisation(current.organisationId, organisationId)
  if ('organisation' in current) throw crossTenant()
  return current
}

/*
  Returns a copy of `args` for `model.operation` with the organisation scope
  applied. Non-tenant models pass through untouched.

  - Reads, updates, deletes, counts and aggregates get organisationId merged
    into `where` (Prisma accepts extra filters alongside unique fields, so a
    findUnique/update/delete by id from another organisation finds nothing).
  - Creates get organisationId set on `data`.
  - Any attempt to name a different organisation, or to move a row between
    organisations, throws CROSS_TENANT (surfaced as 404).
*/
export function scopeArgs(
  model: string | undefined,
  operation: string,
  args: Args,
  organisationId: string
): Args {
  if (!model || !TENANT_MODELS.has(model)) return args
  if (!organisationId) throw crossTenant()

  const next: Record<string, unknown> = { ...(args ?? {}) }

  if (WHERE_OPERATIONS.has(operation)) {
    next.where = scopeWhere(next.where, organisationId)
  }

  if (CREATE_OPERATIONS.has(operation)) {
    next.data = Array.isArray(next.data)
      ? next.data.map((row) => scopeCreateData(row, organisationId))
      : scopeCreateData(next.data, organisationId)
  }

  if (UPDATE_DATA_OPERATIONS.has(operation)) {
    next.data = checkUpdateData(next.data, organisationId)
  }

  if (operation === 'upsert') {
    next.create = scopeCreateData(next.create, organisationId)
    next.update = checkUpdateData(next.update, organisationId)
  }

  return next
}
