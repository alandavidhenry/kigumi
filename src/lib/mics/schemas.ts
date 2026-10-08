import { z } from 'zod'

import { slugify } from '@/lib/slug'

import {
  MIC_CONDITIONS,
  MIC_CONFIDENCE,
  MIC_CURVE_METHODS,
  MIC_EXTRACTIONS,
  MIC_POLAR_PATTERNS,
  MIC_POWERING,
  MIC_SPEC_FIELDS,
  MIC_STATUSES,
  MIC_TRANSDUCER_TYPES
} from './types'

// Input schemas for the global microphone catalogue (ADR 0008). Shared by the
// admin API, the seed-file validator and the ingest script.

const text = (max: number) => z.string().trim().min(1).max(max)

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null))

const optionalNumber = (min: number, max: number) =>
  z.number().min(min).max(max).optional().nullable()

const textList = (max: number) => z.array(text(max)).max(30).default([])

export const provenanceInputSchema = z
  .object({
    sourceUrl: z.url().max(500).optional().nullable(),
    documentTitle: optionalText(300),
    documentPage: optionalText(50),
    documentSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/i, 'Expected a SHA-256 hex digest')
      .optional()
      .nullable(),
    retrievedAt: z.iso.date().optional().nullable(),
    licenceNotes: optionalText(1000),
    attribution: optionalText(500),
    confidence: z.enum(MIC_CONFIDENCE).default('low'),
    extraction: z.enum(MIC_EXTRACTIONS),
    // Spec fields this source supports. Curves reference the source by index.
    fields: z.array(z.enum(MIC_SPEC_FIELDS)).default([])
  })
  .superRefine((value, ctx) => {
    if (value.extraction === 'drafted_unverified') return
    if (!value.sourceUrl) {
      ctx.addIssue({
        code: 'custom',
        path: ['sourceUrl'],
        message:
          'A source URL is required unless the data is an unverified draft'
      })
    }
    if (!value.retrievedAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['retrievedAt'],
        message:
          'A retrieved date is required unless the data is an unverified draft'
      })
    }
  })

export type ProvenanceInput = z.infer<typeof provenanceInputSchema>

const frPointSchema = z.tuple([
  z.number().min(5).max(40000),
  z.number().min(-80).max(40)
])

const polarPointSchema = z.tuple([
  z.number().min(0).max(360),
  z.number().min(-80).max(10)
])

const provenanceIndex = z.number().int().min(0).optional().nullable()

export const frequencyResponseInputSchema = z.object({
  pattern: z.enum(MIC_POLAR_PATTERNS),
  filterSetting: optionalText(60),
  points: z.array(frPointSchema).min(2).max(400),
  method: z.enum(MIC_CURVE_METHODS),
  provenanceIndex
})

export const polarDataInputSchema = z.object({
  pattern: z.enum(MIC_POLAR_PATTERNS),
  frequencyHz: z.number().int().min(20).max(20000),
  points: z.array(polarPointSchema).min(4).max(400),
  method: z.enum(MIC_CURVE_METHODS),
  mirrored: z.boolean().default(false),
  provenanceIndex
})

const micFields = {
  manufacturer: text(100),
  model: text(100),
  transducerType: z.enum(MIC_TRANSDUCER_TYPES),
  polarPatterns: z.array(z.enum(MIC_POLAR_PATTERNS)).min(1).max(6),
  freqRangeMinHz: optionalNumber(1, 100000),
  freqRangeMaxHz: optionalNumber(1, 200000),
  sensitivityMvPa: optionalNumber(0.01, 1000),
  selfNoiseDbA: optionalNumber(-10, 60),
  maxSplDb: optionalNumber(60, 200),
  impedanceOhm: optionalNumber(1, 100000),
  powering: z.enum(MIC_POWERING),
  phantomSafe: z.boolean().optional().nullable(),
  pads: z.array(z.number().int().min(1).max(60)).max(5).default([]),
  filters: textList(60),
  weightG: optionalNumber(1, 5000),
  dimensions: optionalText(120),
  connector: optionalText(60),
  discontinued: z.boolean().default(false),
  statedApplications: textList(60),
  specSheetUrl: z.url().max(500).optional().nullable(),
  wikidataId: z
    .string()
    .regex(/^Q\d+$/, 'Expected a Wikidata id like Q123')
    .optional()
    .nullable(),
  specConditions: z
    .record(z.string(), z.string().max(200))
    .optional()
    .nullable(),
  provenance: z.array(provenanceInputSchema).max(20).default([]),
  frequencyResponses: z.array(frequencyResponseInputSchema).max(30).default([]),
  polarData: z.array(polarDataInputSchema).max(60).default([])
}

function crossChecks(
  value: Partial<{
    freqRangeMinHz: number | null
    freqRangeMaxHz: number | null
    provenance: unknown[]
    frequencyResponses: Array<{ provenanceIndex?: number | null }>
    polarData: Array<{ provenanceIndex?: number | null }>
  }>,
  ctx: z.RefinementCtx
) {
  const { freqRangeMinHz: min, freqRangeMaxHz: max } = value
  if (min != null && max != null && min >= max) {
    ctx.addIssue({
      code: 'custom',
      path: ['freqRangeMaxHz'],
      message: 'Upper frequency must be above the lower frequency'
    })
  }
  const count = value.provenance?.length ?? 0
  const curves = [
    ...(value.frequencyResponses ?? []).map(
      (c, i) => ['frequencyResponses', i, c] as const
    ),
    ...(value.polarData ?? []).map((c, i) => ['polarData', i, c] as const)
  ]
  for (const [key, index, curve] of curves) {
    if (curve.provenanceIndex != null && curve.provenanceIndex >= count) {
      ctx.addIssue({
        code: 'custom',
        path: [key, index, 'provenanceIndex'],
        message: 'Refers to a provenance entry that does not exist'
      })
    }
  }
}

export const micInputSchema = z.object(micFields).superRefine(crossChecks)

// Update: every field optional and no defaults, so omitted fields stay
// untouched (a default here would wipe stored pads, filters or sources).
// `provenance`, `frequencyResponses` and `polarData`, when sent, replace the
// stored sets.
const withoutDefault = (schema: z.ZodType): z.ZodType =>
  schema instanceof z.ZodDefault
    ? (schema.removeDefault() as unknown as z.ZodType)
    : schema

export const micUpdateSchema = (
  z.object(
    Object.fromEntries(
      Object.entries(micFields).map(([key, schema]) => [
        key,
        withoutDefault(schema as z.ZodType).optional()
      ])
    )
  ) as unknown as z.ZodType<Partial<MicInput>>
).superRefine((value, ctx) => {
  crossChecks(value as Parameters<typeof crossChecks>[0], ctx)
})

export type MicInput = z.infer<typeof micInputSchema>

export const micFilterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  transducerType: z.enum(MIC_TRANSDUCER_TYPES).optional(),
  pattern: z.enum(MIC_POLAR_PATTERNS).optional(),
  powering: z.enum(MIC_POWERING).optional(),
  manufacturer: z.string().trim().max(100).optional()
})

export const adminMicFilterSchema = micFilterSchema.extend({
  status: z.enum(MIC_STATUSES).optional()
})

export const micStatusChangeSchema = z.object({
  status: z.enum(MIC_STATUSES),
  notes: optionalText(2000),
  // Publishing LLM-drafted values requires the reviewer to attest that they
  // checked each field against the source (ADR 0008, decision 8).
  confirmVerified: z.boolean().default(false)
})

export const lockerUnitInputSchema = z.object({
  micModelId: text(40),
  // Link an existing inventory item, or omit to create one from the model.
  equipmentItemId: text(40).optional().nullable(),
  serial: optionalText(100),
  condition: z.enum(MIC_CONDITIONS).default('good'),
  matchedPairGroup: optionalText(60),
  roomId: text(40).optional().nullable(),
  notes: optionalText(2000)
})

export const lockerUnitUpdateSchema = z
  .object({
    serial: optionalText(100),
    condition: z.enum(MIC_CONDITIONS),
    matchedPairGroup: optionalText(60),
    notes: optionalText(2000)
  })
  .partial()

export function micSlug(manufacturer: string, model: string): string {
  return slugify(`${manufacturer} ${model}`.replace(/\+/g, ' plus '))
    .slice(0, 80)
    .replace(/-+$/g, '')
}
