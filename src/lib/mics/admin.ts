import { Prisma } from '@/generated/prisma/client'
import { badRequest, notFound } from '@/lib/errors'
import type { PlatformAdminContext } from '@/lib/platform-admin'
import prisma from '@/lib/prisma'

import {
  micDetailSelect,
  micSummarySelect,
  toMicDetail,
  toMicSummary
} from './catalogue'
import {
  adminMicFilterSchema,
  micInputSchema,
  micSlug,
  micStatusChangeSchema,
  micUpdateSchema
} from './schemas'
import { MIC_SPEC_FIELDS, MIC_SPEC_LABELS } from './types'
import { createMicRecord, updateMicRecord } from './write'

import type { MicDetail, MicSummary } from './catalogue'
import type { MicSpecField, MicStatus } from './types'

// Platform-admin side of the catalogue (ADR 0008): manual entry and edits, the
// review queue and the publish gate. Callers hold a PlatformAdminContext from
// getPlatformAdminContext(), which already enforced the admin check.

export interface AdminMicSummary extends MicSummary {
  updatedAt: string
  unverifiedFields: number
}

// A spec field counts as populated when it states something. `discontinued`
// only when true and `phantomSafe` only when known, so the defaults make no
// unsourced claim.
export function isFieldPopulated(
  mic: Pick<MicDetail, MicSpecField>,
  field: MicSpecField
): boolean {
  const value = mic[field]
  if (field === 'discontinued') return value === true
  if (Array.isArray(value)) return value.length > 0
  return value !== null && value !== undefined
}

export interface PublishCheck {
  blockers: string[]
  needsVerification: boolean // LLM-drafted values awaiting reviewer attestation
}

// The publish gate (ADR 0008): every populated spec field needs a source, a
// real source (not an unverified draft), and non-idealised curves need one.
export function checkPublishable(mic: MicDetail): PublishCheck {
  const blockers: string[] = []
  const sourced = new Map<MicSpecField, MicDetail['provenance'][number]>()
  for (const source of mic.provenance) {
    for (const field of source.fields) sourced.set(field, source)
  }

  for (const field of MIC_SPEC_FIELDS) {
    if (!isFieldPopulated(mic, field)) continue
    const source = sourced.get(field)
    if (!source) {
      blockers.push(`${MIC_SPEC_LABELS[field]} has no source`)
    } else if (source.extraction === 'drafted_unverified') {
      blockers.push(`${MIC_SPEC_LABELS[field]} is an unverified draft`)
    }
  }

  const curves = [
    ...mic.frequencyResponses.map((c) => ({
      ...c,
      label: `Frequency response (${c.pattern})`
    })),
    ...mic.polarData.map((c) => ({
      ...c,
      label: `Polar plot (${c.pattern}, ${c.frequencyHz} Hz)`
    }))
  ]
  for (const curve of curves) {
    if (curve.method === 'idealised') continue
    const source = mic.provenance.find((p) => p.id === curve.provenanceId)
    if (!source) blockers.push(`${curve.label} has no source`)
    else if (source.extraction === 'drafted_unverified') {
      blockers.push(`${curve.label} is an unverified draft`)
    }
  }

  const needsVerification = mic.provenance.some(
    (source) => source.extraction === 'llm_drafted' && !source.verified
  )
  return { blockers, needsVerification }
}

export async function listMicsForReview(
  _admin: PlatformAdminContext,
  filter: unknown = {}
): Promise<AdminMicSummary[]> {
  const { q, status, transducerType, pattern, powering, manufacturer } =
    adminMicFilterSchema.parse(filter ?? {})
  const rows = await prisma.microphoneModel.findMany({
    where: {
      ...(status && { status }),
      ...(transducerType && { transducerType }),
      ...(pattern && { polarPatterns: { has: pattern } }),
      ...(powering && { powering }),
      ...(manufacturer && {
        manufacturer: { equals: manufacturer, mode: 'insensitive' }
      }),
      ...(q && {
        OR: [
          { manufacturer: { contains: q, mode: 'insensitive' } },
          { model: { contains: q, mode: 'insensitive' } }
        ]
      })
    },
    orderBy: [{ manufacturer: 'asc' }, { model: 'asc' }],
    select: {
      ...micSummarySelect,
      updatedAt: true,
      fieldProvenance: {
        where: {
          provenance: {
            OR: [
              { extraction: 'drafted_unverified' },
              { extraction: 'llm_drafted', verifiedById: null }
            ]
          }
        },
        select: { id: true }
      }
    }
  })
  return rows.map(({ updatedAt, fieldProvenance, ...row }) => ({
    ...toMicSummary(row),
    updatedAt: updatedAt.toISOString(),
    unverifiedFields: fieldProvenance.length
  }))
}

export async function countMicsByStatus(
  _admin: PlatformAdminContext
): Promise<Record<MicStatus, number>> {
  const groups = await prisma.microphoneModel.groupBy({
    by: ['status'],
    _count: { _all: true }
  })
  const counts: Record<MicStatus, number> = {
    draft: 0,
    in_review: 0,
    published: 0
  }
  for (const group of groups) {
    counts[group.status as MicStatus] = group._count._all
  }
  return counts
}

export async function getMicForAdmin(
  _admin: PlatformAdminContext,
  id: string
): Promise<MicDetail & { publish: PublishCheck }> {
  const row = await prisma.microphoneModel.findUnique({
    where: { id },
    select: micDetailSelect
  })
  if (!row) throw notFound('Microphone')
  const detail = toMicDetail(row)
  return { ...detail, publish: checkPublishable(detail) }
}

function isUniqueViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  )
}

export async function createMic(
  _admin: PlatformAdminContext,
  input: unknown
): Promise<MicDetail> {
  const data = micInputSchema.parse(input)
  const slug = micSlug(data.manufacturer, data.model)
  if (await prisma.microphoneModel.findUnique({ where: { slug } })) {
    throw badRequest(
      `${data.manufacturer} ${data.model} is already in the catalogue`
    )
  }
  try {
    const id = await prisma.$transaction((tx) => createMicRecord(tx, data))
    const row = await prisma.microphoneModel.findUniqueOrThrow({
      where: { id },
      select: micDetailSelect
    })
    return toMicDetail(row)
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw badRequest('That microphone is already in the catalogue')
    }
    throw error
  }
}

export async function updateMic(
  _admin: PlatformAdminContext,
  id: string,
  input: unknown
): Promise<MicDetail> {
  const data = micUpdateSchema.parse(input)
  const existing = await prisma.microphoneModel.findUnique({
    where: { id },
    select: { id: true }
  })
  if (!existing) throw notFound('Microphone')
  await prisma.$transaction((tx) => updateMicRecord(tx, id, data))
  const row = await prisma.microphoneModel.findUniqueOrThrow({
    where: { id },
    select: micDetailSelect
  })
  return toMicDetail(row)
}

const ALLOWED_TRANSITIONS: Readonly<Record<MicStatus, readonly MicStatus[]>> = {
  draft: ['in_review'],
  in_review: ['published', 'draft'],
  published: ['draft', 'in_review']
}

export async function changeMicStatus(
  admin: PlatformAdminContext,
  id: string,
  input: unknown
): Promise<MicDetail> {
  const { status, notes, confirmVerified } = micStatusChangeSchema.parse(input)
  const current = await prisma.microphoneModel.findUnique({
    where: { id },
    select: micDetailSelect
  })
  if (!current) throw notFound('Microphone')
  const detail = toMicDetail(current)

  if (!ALLOWED_TRANSITIONS[detail.status].includes(status)) {
    throw badRequest(`A ${detail.status} microphone cannot move to ${status}`)
  }
  if (status === 'draft' && !notes) {
    throw badRequest('Say what needs fixing when sending a microphone back')
  }

  if (status === 'published') {
    const { blockers, needsVerification } = checkPublishable(detail)
    if (blockers.length > 0) {
      throw badRequest('This microphone is not ready to publish', { blockers })
    }
    if (needsVerification && !confirmVerified) {
      throw badRequest(
        'Confirm that you checked each LLM-drafted value against its source',
        { blockers: ['LLM-drafted values need verification'] }
      )
    }
  }

  const now = new Date()
  await prisma.$transaction(async (tx) => {
    if (status === 'published' && confirmVerified) {
      await tx.provenance.updateMany({
        where: {
          extraction: 'llm_drafted',
          verifiedById: null,
          OR: [
            { fields: { some: { micModelId: id } } },
            { freqs: { some: { micModelId: id } } },
            { polars: { some: { micModelId: id } } }
          ]
        },
        data: { verifiedById: admin.userId, verifiedAt: now }
      })
    }
    await tx.microphoneModel.update({
      where: { id },
      data: {
        status,
        reviewNotes: notes ?? (status === 'published' ? null : undefined),
        reviewedById: admin.userId,
        reviewedAt: now,
        publishedAt: status === 'published' ? now : null
      }
    })
  })

  const row = await prisma.microphoneModel.findUniqueOrThrow({
    where: { id },
    select: micDetailSelect
  })
  return toMicDetail(row)
}
