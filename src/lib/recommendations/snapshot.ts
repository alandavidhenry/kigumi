import prisma from '@/lib/prisma'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'

import { buildSnapshot } from './snapshot-build'

import type { LockerSnapshot } from './types'

// Reads the studio's whole mic locker, with each unit's catalogue model, into
// the plain snapshot the rules run on. The snapshot is stored with the request
// so a recommendation can always be explained, and replayed, as it was.

const modelSelect = {
  id: true,
  slug: true,
  manufacturer: true,
  model: true,
  transducerType: true,
  polarPatterns: true,
  powering: true,
  phantomSafe: true,
  discontinued: true,
  freqRangeMinHz: true,
  freqRangeMaxHz: true,
  sensitivityMvPa: true,
  selfNoiseDbA: true,
  maxSplDb: true,
  impedanceOhm: true,
  pads: true,
  filters: true,
  weightG: true,
  dimensions: true,
  connector: true,
  statedApplications: true,
  specConditions: true,
  status: true
} as const

// Callers must already have checked permission.
export async function loadLockerSnapshot(
  ctx: TenantContext
): Promise<LockerSnapshot> {
  const rows = await tenantDb(ctx).microphoneUnit.findMany({
    orderBy: { id: 'asc' },
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

  const ids = [...new Set(rows.map((row) => row.micModelId))]
  const models = ids.length
    ? await prisma.microphoneModel.findMany({
        where: { id: { in: ids } },
        select: modelSelect
      })
    : []
  return buildSnapshot(rows, models)
}
