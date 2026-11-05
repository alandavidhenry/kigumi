import { beforeEach, describe, expect, it, vi } from 'vitest'

import { pruneAiRateWindows } from '@/lib/ai/rate-limit'
import {
  MAX_ORPHANS_PER_RUN,
  pruneAuthRateLimits,
  runHousekeeping,
  sweepOrphanBlobs
} from '@/lib/housekeeping'
import prisma from '@/lib/prisma'
import { deleteBlob, listBlobs } from '@/lib/storage'

vi.mock('@/lib/prisma', () => ({
  default: {
    attachment: { findMany: vi.fn() },
    rateLimit: { deleteMany: vi.fn() }
  }
}))
vi.mock('@/lib/storage', () => ({ listBlobs: vi.fn(), deleteBlob: vi.fn() }))
vi.mock('@/lib/ai/rate-limit', () => ({ pruneAiRateWindows: vi.fn() }))

const now = new Date('2026-11-05T03:30:00Z')
const old = new Date('2026-11-01T00:00:00Z')
const fresh = new Date('2026-11-05T03:00:00Z')

function blobs(list: { path: string; lastModified: Date }[]) {
  vi.mocked(listBlobs).mockImplementation(async function* () {
    yield* list
  })
}

// The database knows these paths.
function referenced(paths: string[]) {
  vi.mocked(prisma.attachment.findMany).mockImplementation((async (args: {
    where: { blobPath: { in: string[] } }
  }) =>
    args.where.blobPath.in
      .filter((p) => paths.includes(p))
      .map((blobPath) => ({ blobPath }))) as never)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('sweepOrphanBlobs', () => {
  it('deletes old blobs with no attachment row, and nothing else', async () => {
    blobs([
      { path: 'org_1/kept.png', lastModified: old },
      { path: 'org_1/orphan.png', lastModified: old },
      { path: 'org_2/in-flight.png', lastModified: fresh }
    ])
    referenced(['org_1/kept.png'])
    const result = await sweepOrphanBlobs(now)
    expect(result).toEqual({ scanned: 3, deleted: 1, stoppedAtLimit: false })
    expect(deleteBlob).toHaveBeenCalledTimes(1)
    expect(deleteBlob).toHaveBeenCalledWith('org_1/orphan.png')
    // A recent blob may be an upload still in progress: never even looked up.
    const looked = vi
      .mocked(prisma.attachment.findMany)
      .mock.calls.flatMap(
        ([args]) =>
          (args as { where: { blobPath: { in: string[] } } }).where.blobPath.in
      )
    expect(looked).not.toContain('org_2/in-flight.png')
  })

  it('stops at the per-run limit instead of emptying the container', async () => {
    blobs(
      Array.from({ length: MAX_ORPHANS_PER_RUN + 50 }, (_, i) => ({
        path: `org_1/${i}.png`,
        lastModified: old
      }))
    )
    referenced([])
    const result = await sweepOrphanBlobs(now)
    expect(result.stoppedAtLimit).toBe(true)
    expect(deleteBlob).toHaveBeenCalledTimes(MAX_ORPHANS_PER_RUN)
  })

  it('deletes nothing when the database lookup fails', async () => {
    blobs([{ path: 'org_1/a.png', lastModified: old }])
    vi.mocked(prisma.attachment.findMany).mockRejectedValue(new Error('down'))
    await expect(sweepOrphanBlobs(now)).rejects.toThrow('down')
    expect(deleteBlob).not.toHaveBeenCalled()
  })
})

describe('pruneAuthRateLimits', () => {
  it('removes rows idle for over a day', async () => {
    vi.mocked(prisma.rateLimit.deleteMany).mockResolvedValue({
      count: 3
    } as never)
    expect(await pruneAuthRateLimits(now)).toBe(3)
    expect(prisma.rateLimit.deleteMany).toHaveBeenCalledWith({
      where: { lastRequest: { lt: BigInt(now.getTime() - 86_400_000) } }
    })
  })
})

describe('runHousekeeping', () => {
  it('runs every step and reports the counts', async () => {
    vi.mocked(pruneAiRateWindows).mockResolvedValue(7)
    vi.mocked(prisma.rateLimit.deleteMany).mockResolvedValue({
      count: 2
    } as never)
    blobs([])
    referenced([])
    expect(await runHousekeeping(now)).toEqual({
      aiRateWindows: 7,
      authRateLimits: 2,
      orphanBlobs: { scanned: 0, deleted: 0, stoppedAtLimit: false }
    })
  })
})
