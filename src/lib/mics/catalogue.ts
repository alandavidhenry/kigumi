import type { Prisma } from '@/generated/prisma/client'
import { notFound } from '@/lib/errors'
import prisma from '@/lib/prisma'
import { requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { Permission } from '@/types/rbac'

import { micFilterSchema } from './schemas'

import type {
  MicConfidence,
  MicCurveMethod,
  MicExtraction,
  MicPolarPattern,
  MicPowering,
  MicSpecField,
  MicStatus,
  MicTransducerType
} from './types'

// Read side of the global microphone catalogue (ADR 0008). Tenants only ever
// see published rows; platform admins read everything through ./admin.

export interface MicSummary {
  id: string
  slug: string
  manufacturer: string
  model: string
  transducerType: MicTransducerType
  polarPatterns: MicPolarPattern[]
  powering: MicPowering
  phantomSafe: boolean | null
  discontinued: boolean
  status: MicStatus
}

export interface ProvenanceView {
  id: string
  sourceUrl: string | null
  documentTitle: string | null
  documentPage: string | null
  retrievedAt: string | null // YYYY-MM-DD
  licenceNotes: string | null
  attribution: string | null
  confidence: MicConfidence
  extraction: MicExtraction
  verified: boolean
  fields: MicSpecField[]
}

export interface FrequencyResponseView {
  id: string
  pattern: MicPolarPattern
  filterSetting: string | null
  points: Array<[number, number]>
  method: MicCurveMethod
  provenanceId: string | null
}

export interface PolarDataView {
  id: string
  pattern: MicPolarPattern
  frequencyHz: number
  points: Array<[number, number]>
  method: MicCurveMethod
  mirrored: boolean
  provenanceId: string | null
}

export interface MicDetail extends MicSummary {
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
  specSheetUrl: string | null
  wikidataId: string | null
  specConditions: Record<string, string>
  reviewNotes: string | null
  reviewedAt: string | null
  publishedAt: string | null
  frequencyResponses: FrequencyResponseView[]
  polarData: PolarDataView[]
  provenance: ProvenanceView[]
}

export const micSummarySelect = {
  id: true,
  slug: true,
  manufacturer: true,
  model: true,
  transducerType: true,
  polarPatterns: true,
  powering: true,
  phantomSafe: true,
  discontinued: true,
  status: true
} as const

const provenanceSelect = {
  id: true,
  sourceUrl: true,
  documentTitle: true,
  documentPage: true,
  retrievedAt: true,
  licenceNotes: true,
  attribution: true,
  confidence: true,
  extraction: true,
  verifiedById: true
} as const

export const micDetailSelect = {
  ...micSummarySelect,
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
  specSheetUrl: true,
  wikidataId: true,
  specConditions: true,
  reviewNotes: true,
  reviewedAt: true,
  publishedAt: true,
  frequencyResponses: {
    orderBy: [{ pattern: 'asc' }, { filterSetting: 'asc' }],
    select: {
      id: true,
      pattern: true,
      filterSetting: true,
      points: true,
      method: true,
      provenanceId: true,
      provenance: { select: provenanceSelect }
    }
  },
  polarData: {
    orderBy: [{ pattern: 'asc' }, { frequencyHz: 'asc' }],
    select: {
      id: true,
      pattern: true,
      frequencyHz: true,
      points: true,
      method: true,
      mirrored: true,
      provenanceId: true,
      provenance: { select: provenanceSelect }
    }
  },
  fieldProvenance: {
    select: {
      field: true,
      provenance: { select: provenanceSelect }
    }
  }
} satisfies Prisma.MicrophoneModelSelect

type RawProvenance = {
  id: string
  sourceUrl: string | null
  documentTitle: string | null
  documentPage: string | null
  retrievedAt: Date | null
  licenceNotes: string | null
  attribution: string | null
  confidence: string
  extraction: string
  verifiedById: string | null
}

export interface RawMicDetail {
  id: string
  slug: string
  manufacturer: string
  model: string
  transducerType: string
  polarPatterns: string[]
  powering: string
  phantomSafe: boolean | null
  discontinued: boolean
  status: string
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
  specSheetUrl: string | null
  wikidataId: string | null
  specConditions: unknown
  reviewNotes: string | null
  reviewedAt: Date | null
  publishedAt: Date | null
  frequencyResponses: Array<{
    id: string
    pattern: string
    filterSetting: string | null
    points: unknown
    method: string
    provenanceId: string | null
    provenance: RawProvenance | null
  }>
  polarData: Array<{
    id: string
    pattern: string
    frequencyHz: number
    points: unknown
    method: string
    mirrored: boolean
    provenanceId: string | null
    provenance: RawProvenance | null
  }>
  fieldProvenance: Array<{ field: string; provenance: RawProvenance }>
}

export function toMicSummary(raw: {
  id: string
  slug: string
  manufacturer: string
  model: string
  transducerType: string
  polarPatterns: string[]
  powering: string
  phantomSafe: boolean | null
  discontinued: boolean
  status: string
}): MicSummary {
  return {
    id: raw.id,
    slug: raw.slug,
    manufacturer: raw.manufacturer,
    model: raw.model,
    transducerType: raw.transducerType as MicTransducerType,
    polarPatterns: raw.polarPatterns as MicPolarPattern[],
    powering: raw.powering as MicPowering,
    phantomSafe: raw.phantomSafe,
    discontinued: raw.discontinued,
    status: raw.status as MicStatus
  }
}

const day = (date: Date | null) =>
  date ? date.toISOString().slice(0, 10) : null

// Groups the per-field rows back into one entry per source document.
export function toProvenanceViews(
  raw: Pick<
    RawMicDetail,
    'fieldProvenance' | 'frequencyResponses' | 'polarData'
  >
): ProvenanceView[] {
  const byId = new Map<string, ProvenanceView>()
  const viewFor = (p: RawProvenance) => {
    let view = byId.get(p.id)
    if (!view) {
      view = {
        id: p.id,
        sourceUrl: p.sourceUrl,
        documentTitle: p.documentTitle,
        documentPage: p.documentPage,
        retrievedAt: day(p.retrievedAt),
        licenceNotes: p.licenceNotes,
        attribution: p.attribution,
        confidence: p.confidence as MicConfidence,
        extraction: p.extraction as MicExtraction,
        verified:
          p.extraction === 'drafted_unverified'
            ? false
            : p.extraction !== 'llm_drafted' || p.verifiedById !== null,
        fields: []
      }
      byId.set(p.id, view)
    }
    return view
  }
  for (const { field, provenance } of raw.fieldProvenance) {
    viewFor(provenance).fields.push(field as MicSpecField)
  }
  for (const curve of [...raw.frequencyResponses, ...raw.polarData]) {
    if (curve.provenance) viewFor(curve.provenance)
  }
  return [...byId.values()]
}

export function toMicDetail(raw: RawMicDetail): MicDetail {
  return {
    ...toMicSummary(raw),
    freqRangeMinHz: raw.freqRangeMinHz,
    freqRangeMaxHz: raw.freqRangeMaxHz,
    sensitivityMvPa: raw.sensitivityMvPa,
    selfNoiseDbA: raw.selfNoiseDbA,
    maxSplDb: raw.maxSplDb,
    impedanceOhm: raw.impedanceOhm,
    pads: raw.pads,
    filters: raw.filters,
    weightG: raw.weightG,
    dimensions: raw.dimensions,
    connector: raw.connector,
    statedApplications: raw.statedApplications,
    specSheetUrl: raw.specSheetUrl,
    wikidataId: raw.wikidataId,
    specConditions: (raw.specConditions as Record<string, string> | null) ?? {},
    reviewNotes: raw.reviewNotes,
    reviewedAt: raw.reviewedAt?.toISOString() ?? null,
    publishedAt: raw.publishedAt?.toISOString() ?? null,
    frequencyResponses: raw.frequencyResponses.map(
      ({ provenance: _source, ...curve }) => ({
        ...curve,
        pattern: curve.pattern as MicPolarPattern,
        method: curve.method as MicCurveMethod,
        points: curve.points as Array<[number, number]>
      })
    ),
    polarData: raw.polarData.map(({ provenance: _source, ...curve }) => ({
      ...curve,
      pattern: curve.pattern as MicPolarPattern,
      method: curve.method as MicCurveMethod,
      points: curve.points as Array<[number, number]>
    })),
    provenance: toProvenanceViews(raw)
  }
}

export function buildMicWhere(filter: unknown) {
  const { q, transducerType, pattern, powering, manufacturer } =
    micFilterSchema.parse(filter ?? {})
  return {
    ...(transducerType && { transducerType }),
    ...(pattern && { polarPatterns: { has: pattern } }),
    ...(powering && { powering }),
    ...(manufacturer && {
      manufacturer: { equals: manufacturer, mode: 'insensitive' as const }
    }),
    ...(q && {
      OR: [
        { manufacturer: { contains: q, mode: 'insensitive' as const } },
        { model: { contains: q, mode: 'insensitive' as const } },
        { statedApplications: { has: q.toLowerCase() } }
      ]
    })
  }
}

// Published catalogue, for any signed-in member.
export async function listMics(
  ctx: TenantContext,
  filter: unknown = {}
): Promise<MicSummary[]> {
  requirePermission(ctx, Permission.VIEW_MIC_CATALOGUE)
  const rows = await prisma.microphoneModel.findMany({
    where: { ...buildMicWhere(filter), status: 'published' },
    orderBy: [{ manufacturer: 'asc' }, { model: 'asc' }],
    select: micSummarySelect
  })
  return rows.map(toMicSummary)
}

export async function listMicManufacturers(
  ctx: TenantContext
): Promise<string[]> {
  requirePermission(ctx, Permission.VIEW_MIC_CATALOGUE)
  const rows = await prisma.microphoneModel.findMany({
    where: { status: 'published' },
    distinct: ['manufacturer'],
    orderBy: { manufacturer: 'asc' },
    select: { manufacturer: true }
  })
  return rows.map((row) => row.manufacturer)
}

// Accepts the cuid or the slug. Unpublished models are 404 for tenants.
export async function getMic(
  ctx: TenantContext,
  idOrSlug: string
): Promise<MicDetail> {
  requirePermission(ctx, Permission.VIEW_MIC_CATALOGUE)
  const row = await prisma.microphoneModel.findFirst({
    where: {
      status: 'published',
      OR: [{ id: idOrSlug }, { slug: idOrSlug }]
    },
    select: micDetailSelect
  })
  if (!row) throw notFound('Microphone')
  return toMicDetail(row)
}
