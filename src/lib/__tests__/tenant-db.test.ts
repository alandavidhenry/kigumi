import { beforeEach, describe, expect, it, vi } from 'vitest'

import prisma from '@/lib/prisma'
import { tenantDb } from '@/lib/tenant-db'

vi.mock('@/lib/prisma', () => ({
  default: { $extends: vi.fn((extension) => extension) }
}))

interface CapturedExtension {
  name: string
  query: {
    $allModels: {
      $allOperations: (params: {
        model: string
        operation: string
        args: unknown
        query: (args: unknown) => unknown
      }) => unknown
    }
  }
}

function capture(organisationId: string) {
  return tenantDb({ organisationId }) as unknown as CapturedExtension
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('tenantDb', () => {
  it('registers a named query extension on the shared client', () => {
    const extension = capture('org_1')
    expect(prisma.$extends).toHaveBeenCalledTimes(1)
    expect(extension.name).toBe('tenant-scope')
  })

  it('scopes tenant model queries to the organisation', () => {
    const query = vi.fn((args) => args)
    capture('org_1').query.$allModels.$allOperations({
      model: 'Room',
      operation: 'findMany',
      args: { where: { studioId: 's1' } },
      query
    })
    expect(query).toHaveBeenCalledWith({
      where: { studioId: 's1', organisationId: 'org_1' }
    })
  })

  it('leaves non-tenant models alone', () => {
    const query = vi.fn((args) => args)
    const args = { where: { email: 'a@b.c' } }
    capture('org_1').query.$allModels.$allOperations({
      model: 'User',
      operation: 'findFirst',
      args,
      query
    })
    expect(query).toHaveBeenCalledWith(args)
  })

  it('throws before querying when another organisation is named', () => {
    const query = vi.fn()
    expect(() =>
      capture('org_1').query.$allModels.$allOperations({
        model: 'Studio',
        operation: 'findMany',
        args: { where: { organisationId: 'org_2' } },
        query
      })
    ).toThrow(expect.objectContaining({ code: 'CROSS_TENANT' }))
    expect(query).not.toHaveBeenCalled()
  })
})
