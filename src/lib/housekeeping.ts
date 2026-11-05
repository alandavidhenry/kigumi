import { pruneAiRateWindows } from '@/lib/ai/rate-limit'
import { logger } from '@/lib/logger'
import prisma from '@/lib/prisma'
import { deleteBlob, listBlobs } from '@/lib/storage'

// Daily housekeeping (/api/cron/housekeeping, ADR 0009). Like the reminder job
// it runs without a session, so it is a documented exception to ADR 0003: it
// reads Attachment across organisations, but only to ask "is this blob path
// still referenced?" and it never returns tenant data.

// A blob younger than this may belong to an upload still in flight.
export const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000
// Better Auth rate-limit rows idle this long are no longer counting anything.
export const AUTH_RATE_LIMIT_MAX_AGE_MS = 24 * 60 * 60 * 1000
// Safety valve: a run that wants to delete more than this stops and reports,
// in case something (a wrong container, an empty table) makes every blob look
// orphaned.
export const MAX_ORPHANS_PER_RUN = 500
const LOOKUP_BATCH = 200

export interface OrphanSweepResult {
  scanned: number
  deleted: number
  stoppedAtLimit: boolean
}

export async function sweepOrphanBlobs(
  now: Date = new Date()
): Promise<OrphanSweepResult> {
  const cutoff = now.getTime() - ORPHAN_MIN_AGE_MS
  let scanned = 0
  let deleted = 0
  let batch: string[] = []

  const flush = async (): Promise<boolean> => {
    if (batch.length === 0) return true
    const referenced = await prisma.attachment.findMany({
      where: { blobPath: { in: batch } },
      select: { blobPath: true }
    })
    const keep = new Set(referenced.map((row) => row.blobPath))
    for (const path of batch) {
      if (keep.has(path)) continue
      if (deleted >= MAX_ORPHANS_PER_RUN) return false
      await deleteBlob(path)
      deleted++
    }
    batch = []
    return true
  }

  for await (const blob of listBlobs()) {
    scanned++
    if (blob.lastModified.getTime() > cutoff) continue
    batch.push(blob.path)
    if (batch.length >= LOOKUP_BATCH && !(await flush())) {
      return { scanned, deleted, stoppedAtLimit: true }
    }
  }
  const finished = await flush()
  return { scanned, deleted, stoppedAtLimit: !finished }
}

export async function pruneAuthRateLimits(
  now: Date = new Date()
): Promise<number> {
  const { count } = await prisma.rateLimit.deleteMany({
    where: {
      lastRequest: { lt: BigInt(now.getTime() - AUTH_RATE_LIMIT_MAX_AGE_MS) }
    }
  })
  return count
}

export interface HousekeepingResult {
  aiRateWindows: number
  authRateLimits: number
  orphanBlobs: OrphanSweepResult
}

export async function runHousekeeping(
  now: Date = new Date()
): Promise<HousekeepingResult> {
  const aiRateWindows = await pruneAiRateWindows(now)
  const authRateLimits = await pruneAuthRateLimits(now)
  const orphanBlobs = await sweepOrphanBlobs(now)
  if (orphanBlobs.stoppedAtLimit) {
    logger.error('housekeeping.orphan_sweep_stopped', {
      limit: MAX_ORPHANS_PER_RUN,
      scanned: orphanBlobs.scanned
    })
  }
  return { aiRateWindows, authRateLimits, orphanBlobs }
}
