import prisma from '@/lib/prisma'
import type { TenantContext } from '@/lib/tenant-context'
import { scopeArgs } from '@/lib/tenant-scope'

/*
  Prisma client scoped to the caller's active organisation (ADR 0003).
  Every query on a tenant model (TENANT_MODELS in tenant-scope.ts) gets
  organisationId merged in; anything naming another organisation throws
  CROSS_TENANT. This is the only way src/lib touches tenant data.
*/
export function tenantDb(ctx: Pick<TenantContext, 'organisationId'>) {
  const { organisationId } = ctx
  return prisma.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return query(
            scopeArgs(
              model,
              operation,
              args as Record<string, unknown>,
              organisationId
            ) as typeof args
          )
        }
      }
    }
  })
}

export type TenantDb = ReturnType<typeof tenantDb>
