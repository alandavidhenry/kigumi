import type { Prisma } from '@/generated/prisma/client'
import { toJsonValue } from '@/lib/prisma-json'

import { micSlug } from './schemas'

import type { MicInput } from './schemas'

// Shared writer for catalogue rows, used by the admin API and the ingest
// script. It never decides review status: callers do.

export type MicDb = Prisma.TransactionClient

type ProvenanceInputLike = MicInput['provenance'][number]

const toDate = (value: string | null | undefined) =>
  value ? new Date(`${value}T00:00:00.000Z`) : null

const NESTED_KEYS = new Set(['provenance', 'frequencyResponses', 'polarData'])

export function scalarData<T extends Partial<MicInput>>(input: T) {
  const { specConditions, ...rest } = input
  const scalars = Object.fromEntries(
    Object.entries(rest).filter(([key]) => !NESTED_KEYS.has(key))
  ) as Omit<
    T,
    'provenance' | 'frequencyResponses' | 'polarData' | 'specConditions'
  >
  return {
    ...scalars,
    ...(specConditions !== undefined && {
      specConditions: toJsonValue(specConditions)
    })
  }
}

async function createProvenance(db: MicDb, input: ProvenanceInputLike) {
  return db.provenance.create({
    data: {
      sourceUrl: input.sourceUrl ?? null,
      documentTitle: input.documentTitle,
      documentPage: input.documentPage,
      documentSha256: input.documentSha256 ?? null,
      retrievedAt: toDate(input.retrievedAt),
      licenceNotes: input.licenceNotes,
      attribution: input.attribution,
      confidence: input.confidence,
      extraction: input.extraction
    },
    select: { id: true }
  })
}

// Drops a mic's provenance links, then any provenance rows nothing else uses.
export async function clearProvenance(db: MicDb, micModelId: string) {
  const links = await db.micFieldProvenance.findMany({
    where: { micModelId },
    select: { provenanceId: true }
  })
  await db.micFieldProvenance.deleteMany({ where: { micModelId } })
  const ids = [...new Set(links.map((link) => link.provenanceId))]
  if (ids.length > 0) {
    await db.provenance.deleteMany({
      where: {
        id: { in: ids },
        fields: { none: {} },
        freqs: { none: {} },
        polars: { none: {} }
      }
    })
  }
}

export async function clearCurves(db: MicDb, micModelId: string) {
  const [freqs, polars] = await Promise.all([
    db.micFrequencyResponse.findMany({
      where: { micModelId },
      select: { provenanceId: true }
    }),
    db.micPolarData.findMany({
      where: { micModelId },
      select: { provenanceId: true }
    })
  ])
  await db.micFrequencyResponse.deleteMany({ where: { micModelId } })
  await db.micPolarData.deleteMany({ where: { micModelId } })
  const ids = [
    ...new Set(
      [...freqs, ...polars]
        .map((row) => row.provenanceId)
        .filter((id): id is string => id !== null)
    )
  ]
  if (ids.length > 0) {
    await db.provenance.deleteMany({
      where: {
        id: { in: ids },
        fields: { none: {} },
        freqs: { none: {} },
        polars: { none: {} }
      }
    })
  }
}

// Creates provenance rows and returns their ids in input order, linking each
// to the spec fields it supports.
export async function writeProvenance(
  db: MicDb,
  micModelId: string,
  entries: readonly ProvenanceInputLike[]
): Promise<string[]> {
  const ids: string[] = []
  for (const entry of entries) {
    const { id } = await createProvenance(db, entry)
    ids.push(id)
    for (const field of new Set(entry.fields)) {
      // One source per field: a later entry for the same field wins.
      await db.micFieldProvenance.upsert({
        where: { micModelId_field: { micModelId, field } },
        update: { provenanceId: id },
        create: { micModelId, field, provenanceId: id }
      })
    }
  }
  return ids
}

export async function writeCurves(
  db: MicDb,
  micModelId: string,
  input: Pick<MicInput, 'frequencyResponses' | 'polarData'>,
  provenanceIds: readonly string[]
) {
  const source = (index: number | null | undefined) =>
    index == null ? null : (provenanceIds[index] ?? null)

  for (const curve of input.frequencyResponses) {
    await db.micFrequencyResponse.create({
      data: {
        micModelId,
        pattern: curve.pattern,
        filterSetting: curve.filterSetting,
        points: curve.points,
        method: curve.method,
        provenanceId: source(curve.provenanceIndex)
      }
    })
  }
  for (const curve of input.polarData) {
    await db.micPolarData.create({
      data: {
        micModelId,
        pattern: curve.pattern,
        frequencyHz: curve.frequencyHz,
        points: curve.points,
        method: curve.method,
        mirrored: curve.mirrored,
        provenanceId: source(curve.provenanceIndex)
      }
    })
  }
}

// Creates a full catalogue row (scalars, provenance, curves) as a draft.
export async function createMicRecord(db: MicDb, input: MicInput) {
  const row = await db.microphoneModel.create({
    data: {
      ...scalarData(input),
      slug: micSlug(input.manufacturer, input.model),
      status: 'draft'
    },
    select: { id: true }
  })
  const provenanceIds = await writeProvenance(db, row.id, input.provenance)
  await writeCurves(db, row.id, input, provenanceIds)
  return row.id
}

// Replaces the parts of a row named in `input` (scalars always; provenance
// and curves only when sent).
export async function updateMicRecord(
  db: MicDb,
  id: string,
  input: Partial<MicInput>
) {
  const data = scalarData(input)
  if (Object.keys(data).length > 0) {
    await db.microphoneModel.update({ where: { id }, data })
  }
  let provenanceIds: string[] | null = null
  if (input.provenance !== undefined) {
    await clearProvenance(db, id)
    provenanceIds = await writeProvenance(db, id, input.provenance)
  }
  if (input.frequencyResponses !== undefined || input.polarData !== undefined) {
    // Curves reference provenance by index into the same payload; without a
    // fresh provenance list they keep no source link.
    if (provenanceIds === null) {
      provenanceIds = []
    }
    if (input.frequencyResponses !== undefined) {
      await db.micFrequencyResponse.deleteMany({ where: { micModelId: id } })
    }
    if (input.polarData !== undefined) {
      await db.micPolarData.deleteMany({ where: { micModelId: id } })
    }
    await writeCurves(
      db,
      id,
      {
        frequencyResponses: input.frequencyResponses ?? [],
        polarData: input.polarData ?? []
      },
      provenanceIds
    )
  }
}
