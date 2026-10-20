import { z } from 'zod'

import { micInputSchema, micSlug } from './schemas'
import { createMicRecord, updateMicRecord } from './write'

import type { MicInput } from './schemas'
import type { MicDb } from './write'

// Versioned seed files (data/mics/<maker>.json) and the ingest that loads
// them as drafts (ADR 0008, decision 1). Ingest is a script, never a request.

export const seedFileSchema = z.object({
  maker: z.string().trim().min(1),
  entries: z.array(micInputSchema).min(1)
})
export type SeedFile = z.infer<typeof seedFileSchema>

// Per-maker range sizes counted from the maker's product listing at
// transcription time, for the cap in decision 7 (L2).
export const makersFileSchema = z.record(
  z.string(),
  z.object({
    currentRange: z.number().int().positive().nullable(),
    countedOn: z.iso.date().nullable()
  })
)
export type MakersFile = z.infer<typeof makersFileSchema>

export interface SeedReport {
  errors: string[]
  warnings: string[]
  countsByMaker: Record<string, number>
  total: number
}

// Entries sourced only from open datasets don't count towards the cap.
function countsTowardsCap(entry: MicInput): boolean {
  if (entry.provenance.length === 0) return true
  return entry.provenance.some(
    (source) => source.extraction !== 'dataset_import'
  )
}

export function capFor(currentRange: number): number {
  return Math.ceil(currentRange / 3)
}

export function validateSeedSet(
  files: readonly SeedFile[],
  makers: MakersFile
): SeedReport {
  const errors: string[] = []
  const warnings: string[] = []
  const countsByMaker: Record<string, number> = {}
  const seen = new Map<string, string>()
  let total = 0

  for (const file of files) {
    for (const entry of file.entries) {
      total++
      const label = `${entry.manufacturer} ${entry.model}`
      if (entry.manufacturer.toLowerCase() !== file.maker.toLowerCase()) {
        errors.push(`${label}: listed in the ${file.maker} file`)
      }
      const slug = micSlug(entry.manufacturer, entry.model)
      const previous = seen.get(slug)
      if (previous) errors.push(`${label}: duplicates ${previous} (${slug})`)
      seen.set(slug, label)

      if (countsTowardsCap(entry)) {
        countsByMaker[entry.manufacturer] =
          (countsByMaker[entry.manufacturer] ?? 0) + 1
      }
    }
  }

  for (const [maker, count] of Object.entries(countsByMaker)) {
    const range = makers[maker]?.currentRange
    if (range == null) {
      warnings.push(
        `${maker}: ${count} transcribed, range size not recorded in makers.json, so the cap is unchecked`
      )
    } else if (count > capFor(range)) {
      errors.push(
        `${maker}: ${count} transcribed exceeds the cap of ${capFor(range)} (a third of ${range})`
      )
    }
  }
  return { errors, warnings, countsByMaker, total }
}

export interface IngestResult {
  created: string[]
  updated: string[]
  skippedPublished: string[]
}

// Loads entries as drafts. New rows are created; existing draft or in-review
// rows are replaced from the file; published rows are never touched, so a
// reviewed record can't be silently overwritten by a re-run.
export async function ingestEntries(
  db: MicDb,
  entries: readonly MicInput[],
  { dryRun = false }: { dryRun?: boolean } = {}
): Promise<IngestResult> {
  const result: IngestResult = {
    created: [],
    updated: [],
    skippedPublished: []
  }
  for (const entry of entries) {
    const slug = micSlug(entry.manufacturer, entry.model)
    const existing = await db.microphoneModel.findUnique({
      where: { slug },
      select: { id: true, status: true }
    })
    if (!existing) {
      if (!dryRun) await createMicRecord(db, entry)
      result.created.push(slug)
    } else if (existing.status === 'published') {
      result.skippedPublished.push(slug)
    } else {
      if (!dryRun) {
        await updateMicRecord(db, existing.id, {
          ...entry,
          // updateMicRecord replaces the sets it is given.
          provenance: entry.provenance,
          frequencyResponses: entry.frequencyResponses,
          polarData: entry.polarData
        })
      }
      result.updated.push(slug)
    }
  }
  return result
}
