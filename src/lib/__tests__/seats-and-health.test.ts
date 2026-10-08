import { beforeEach, describe, expect, it, vi } from 'vitest'

import { checkDatabase, checkStorage } from '@/lib/health'
import prisma from '@/lib/prisma'
import { countUsedSeats } from '@/lib/seats'

vi.mock('@/lib/prisma', () => ({
  default: {
    member: { count: vi.fn() },
    invitation: { count: vi.fn() },
    $queryRaw: vi.fn()
  }
}))

const getProperties = vi.fn()
vi.mock('@azure/storage-blob', () => ({
  BlobServiceClient: {
    fromConnectionString: vi.fn(() => ({
      getContainerClient: vi.fn(() => ({ getProperties }))
    }))
  }
}))

const mockedPrisma = vi.mocked(prisma, true)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('countUsedSeats', () => {
  it('adds members and live pending invitations', async () => {
    mockedPrisma.member.count.mockResolvedValue(2 as never)
    mockedPrisma.invitation.count.mockResolvedValue(1 as never)
    const now = new Date('2026-10-08T00:00:00Z')

    expect(await countUsedSeats('org_1', now)).toBe(3)
    expect(mockedPrisma.invitation.count).toHaveBeenCalledWith({
      where: {
        organizationId: 'org_1',
        status: 'pending',
        expiresAt: { gt: now }
      }
    })
  })
})

describe('health checks', () => {
  it('reports the database as up or down', async () => {
    mockedPrisma.$queryRaw.mockResolvedValue([] as never)
    expect(await checkDatabase()).toBe(true)
    mockedPrisma.$queryRaw.mockRejectedValue(new Error('down'))
    expect(await checkDatabase()).toBe(false)
  })

  it('reports storage as up or down', async () => {
    getProperties.mockResolvedValue({})
    expect(await checkStorage()).toBe(true)
    getProperties.mockRejectedValue(new Error('down'))
    expect(await checkStorage()).toBe(false)
  })
})
