import type {
  MicCondition,
  MicPolarPattern,
  MicTransducerType
} from '@/lib/mics/types'

import type { LockerSnapshot, RuleMic, SnapshotUnit } from './types'

// The pure half of loading a locker snapshot: database rows in, the plain
// snapshot out. Kept free of Prisma so the dev seed can use it too.

export interface SnapshotUnitRow {
  id: string
  micModelId: string
  condition: string
  matchedPairGroup: string | null
  equipmentItem: {
    status: string
    quantity: number
    roomId: string | null
    room: { studioId: string } | null
  }
}

export interface SnapshotModelRow {
  id: string
  slug: string
  manufacturer: string
  model: string
  transducerType: string
  polarPatterns: string[]
  powering: string
  phantomSafe: boolean | null
  discontinued: boolean
  freqRangeMinHz: number | null
  freqRangeMaxHz: number | null
  sensitivityMvPa: number | null
  selfNoiseDbA: number | null
  maxSplDb: number | null
  impedanceOhm: number | null
  pads: number[]
  filters: string[]
  weightG: number | null
  dimensions: string | null
  connector: string | null
  statedApplications: string[]
  specConditions: unknown
  status: string
}

export function buildSnapshot(
  rows: readonly SnapshotUnitRow[],
  models: readonly SnapshotModelRow[]
): LockerSnapshot {
  const byId = new Map(models.map((model) => [model.id, model]))
  const units: SnapshotUnit[] = []
  const mics: Record<string, RuleMic> = {}

  for (const row of rows) {
    const model = byId.get(row.micModelId)
    if (!model) continue // the model row is gone; nothing to recommend from
    const published = model.status === 'published'
    units.push({
      unitId: row.id,
      micSlug: model.slug,
      equipmentStatus: row.equipmentItem.status,
      condition: row.condition as MicCondition,
      matchedPairGroup: row.matchedPairGroup,
      quantity: row.equipmentItem.quantity,
      roomId: row.equipmentItem.roomId,
      studioId: row.equipmentItem.room?.studioId ?? null,
      published
    })
    // Draft or in-review models are never shown to a model or a user.
    if (published && !mics[model.slug]) {
      mics[model.slug] = {
        slug: model.slug,
        manufacturer: model.manufacturer,
        model: model.model,
        transducerType: model.transducerType as MicTransducerType,
        polarPatterns: model.polarPatterns as MicPolarPattern[],
        powering: model.powering as RuleMic['powering'],
        phantomSafe: model.phantomSafe,
        discontinued: model.discontinued,
        freqRangeMinHz: model.freqRangeMinHz,
        freqRangeMaxHz: model.freqRangeMaxHz,
        sensitivityMvPa: model.sensitivityMvPa,
        selfNoiseDbA: model.selfNoiseDbA,
        maxSplDb: model.maxSplDb,
        impedanceOhm: model.impedanceOhm,
        pads: model.pads,
        filters: model.filters,
        weightG: model.weightG,
        dimensions: model.dimensions,
        connector: model.connector,
        statedApplications: model.statedApplications,
        specConditions:
          (model.specConditions as Record<string, string> | null) ?? {}
      }
    }
  }
  return { units, mics }
}
