import type { Prisma } from '@/generated/prisma/client'
import { recommendationPrompt } from '@/lib/ai/prompts/mic-recommendation'
import { generateForTenant } from '@/lib/ai/service'
import { recordAudit } from '@/lib/audit'
import { badRequest, notFound } from '@/lib/errors'
import prisma from '@/lib/prisma'
import { toJsonValue } from '@/lib/prisma-json'
import { requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { Permission } from '@/types/rbac'

import { finalise } from './finalise'
import {
  MAX_AI_SOURCES,
  buildRecommendationInput,
  hashRecommendationInput,
  namesForMic
} from './llm-input'
import { micName } from './names'
import { runRules } from './rules'
import { normaliseRequest, recommendationRequestSchema } from './schemas'
import { loadLockerSnapshot } from './snapshot'

import type { Adjustment, FinalView } from './finalise'
import type { AliasMap } from './llm-input'
import type {
  LockerSnapshot,
  NormalisedRequest,
  RequestRoom,
  RulesOutput
} from './types'

// Recommendation orchestration (PLAN §4.4, ADR 0015):
//
//   preview  = request -> locker snapshot -> rules          (free, stores nothing)
//   create   = preview -> model input -> cache or model -> validate -> finalise
//              -> store request + result in tenant tables   (spends AI allowance)
//
// The rules result is a complete recommendation on its own, so every AI
// failure leaves the caller with something useful.

export interface PreviewResult {
  request: NormalisedRequest
  rules: RulesOutput
  room: RequestRoom | null
  // unit id -> "Maker Model", so the client can name the candidates.
  unitNames: Record<string, string>
}

interface Prepared extends PreviewResult {
  snapshot: LockerSnapshot
}

// Required JSON columns take a value, never undefined or a null sentinel.
const asJson = (value: unknown) => value as Prisma.InputJsonValue

async function prepare(ctx: TenantContext, input: unknown): Promise<Prepared> {
  const request = normaliseRequest(recommendationRequestSchema.parse(input))
  const db = tenantDb(ctx)

  let room: RequestRoom | null = null
  if (request.roomId) {
    const row = await db.room.findFirst({
      where: { id: request.roomId },
      select: {
        id: true,
        studioId: true,
        name: true,
        widthMm: true,
        lengthMm: true,
        heightMm: true
      }
    })
    if (!row) throw notFound('Room')
    room = row
  }

  const snapshot = await loadLockerSnapshot(ctx)
  const rules = runRules(request, snapshot, { room })

  const unitNames: Record<string, string> = {}
  for (const unit of snapshot.units) {
    const mic = snapshot.mics[unit.micSlug]
    if (mic) unitNames[unit.unitId] = micName(mic)
  }
  return { request, rules, room, unitNames, snapshot }
}

export async function previewRecommendation(
  ctx: TenantContext,
  input: unknown
): Promise<PreviewResult> {
  requirePermission(ctx, Permission.VIEW_INVENTORY)
  const { request, rules, room, unitNames } = await prepare(ctx, input)
  return { request, rules, room, unitNames }
}

// ---------------------------------------------------------------------------
// Stored recommendations

export type UnitState = 'available' | 'unavailable' | 'removed'

export interface FeedbackView {
  sourceKey: string
  verdict: string
  swappedToUnitIds: string[]
  swappedToModelSlugs: string[]
  swappedToCandidate: boolean | null
  rating: number | null
  reasons: string[]
  comment: string | null
  updatedAt: string
}

export interface RecommendationDetail {
  id: string
  requestId: string
  createdAt: string
  model: string
  promptVersion: string
  request: NormalisedRequest
  rules: RulesOutput
  view: FinalView
  adjustments: Adjustment[]
  // Where each unit in the view stands now, which may differ from when it was
  // recommended.
  unitState: Record<string, UnitState>
  // The caller's own feedback.
  feedback: FeedbackView[]
}

interface ResultRow {
  id: string
  requestId: string
  promptVersion: string
  model: string
  final: unknown
  adjustments: unknown
  createdAt: Date
  request: {
    input: unknown
    rules: unknown
  }
}

interface FeedbackRow {
  sourceKey: string
  verdict: string
  swappedToUnitIds: string[]
  swappedToModelSlugs: string[]
  swappedToCandidate: boolean | null
  rating: number | null
  reasons: string[]
  comment: string | null
  updatedAt: Date
}

export function toFeedbackView(row: FeedbackRow): FeedbackView {
  return {
    sourceKey: row.sourceKey,
    verdict: row.verdict,
    swappedToUnitIds: row.swappedToUnitIds,
    swappedToModelSlugs: row.swappedToModelSlugs,
    swappedToCandidate: row.swappedToCandidate,
    rating: row.rating,
    reasons: row.reasons,
    comment: row.comment,
    updatedAt: row.updatedAt.toISOString()
  }
}

async function unitStates(
  ctx: TenantContext,
  view: FinalView
): Promise<Record<string, UnitState>> {
  const ids = [
    ...new Set(
      view.sources
        .flatMap((source) => [
          ...(source.primary?.units ?? []),
          ...source.alternatives.flatMap((a) => a.units)
        ])
        .map((unit) => unit.unitId)
    )
  ]
  if (ids.length === 0) return {}
  const rows = await tenantDb(ctx).microphoneUnit.findMany({
    where: { id: { in: ids } },
    select: { id: true, equipmentItem: { select: { status: true } } }
  })
  const current = new Map(rows.map((r) => [r.id, r.equipmentItem.status]))
  return Object.fromEntries(
    ids.map((id) => [
      id,
      !current.has(id)
        ? 'removed'
        : current.get(id) === 'in_service'
          ? 'available'
          : 'unavailable'
    ])
  )
}

async function toDetail(
  ctx: TenantContext,
  row: ResultRow,
  feedback: FeedbackRow[]
): Promise<RecommendationDetail> {
  const view = row.final as unknown as FinalView
  return {
    id: row.id,
    requestId: row.requestId,
    createdAt: row.createdAt.toISOString(),
    model: row.model,
    promptVersion: row.promptVersion,
    request: row.request.input as unknown as NormalisedRequest,
    rules: row.request.rules as unknown as RulesOutput,
    view,
    adjustments: (row.adjustments as unknown as Adjustment[] | null) ?? [],
    unitState: await unitStates(ctx, view),
    feedback: feedback.map(toFeedbackView)
  }
}

const resultInclude = {
  request: { select: { input: true, rules: true } }
} as const

export async function getRecommendation(
  ctx: TenantContext,
  id: string
): Promise<RecommendationDetail> {
  requirePermission(ctx, Permission.VIEW_INVENTORY)
  const db = tenantDb(ctx)
  const row = await db.recommendationResult.findFirst({
    where: { id },
    include: resultInclude
  })
  if (!row) throw notFound('Recommendation')
  const feedback = await db.recommendationFeedback.findMany({
    where: { resultId: id, userId: ctx.userId }
  })
  return toDetail(ctx, row as ResultRow, feedback)
}

export interface RecommendationSummary {
  id: string
  createdAt: string
  kind: string
  title: string
  sourceCount: number
}

export async function listRecommendations(
  ctx: TenantContext,
  limit = 20
): Promise<RecommendationSummary[]> {
  requirePermission(ctx, Permission.VIEW_INVENTORY)
  const rows = await tenantDb(ctx).recommendationResult.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(Math.trunc(limit) || 20, 1), 50),
    select: { id: true, createdAt: true, request: { select: { input: true } } }
  })
  return rows.map((row) => {
    const request = row.request.input as unknown as NormalisedRequest
    const labels = request.sources.map((s) => s.label)
    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      kind: request.kind,
      title:
        request.kind === 'question'
          ? (request.question ?? 'Question')
          : labels.slice(0, 3).join(', ') +
            (labels.length > 3 ? ` and ${labels.length - 3} more` : ''),
      sourceCount: request.sources.length
    }
  })
}

// ---------------------------------------------------------------------------
// Create

export interface CreateOptions {
  // Skip the stored answer and ask the model again (spends a request).
  regenerate?: boolean
}

export interface CreateResult {
  // False when there was nothing to rank: no model was called and nothing was
  // spent. The preview still says why.
  recommendation: RecommendationDetail | null
  preview: PreviewResult
  cached: boolean
}

// Catalogue models the studio does not own are named only to catch a reply
// that mentions one.
async function catalogueNames(): Promise<string[]> {
  const models = await prisma.microphoneModel.findMany({
    where: { status: 'published' },
    select: { manufacturer: true, model: true }
  })
  return models.flatMap(namesForMic)
}

export async function createRecommendation(
  ctx: TenantContext,
  input: unknown,
  options: CreateOptions = {}
): Promise<CreateResult> {
  requirePermission(ctx, Permission.USE_AI)
  const prepared = await prepare(ctx, input)
  const { snapshot, ...preview } = prepared
  const { request, rules, room } = prepared

  const built = buildRecommendationInput({
    request,
    rules,
    snapshot,
    room,
    unownedNames: await catalogueNames()
  })
  const sent = built.input.data.sources.length
  if (sent === 0) return { recommendation: null, preview, cached: false }
  if (sent > MAX_AI_SOURCES) {
    throw badRequest(
      `The AI can rank up to ${MAX_AI_SOURCES} sources at a time; this has ${sent}. Split it up, or use the rules-based result.`,
      { sources: sent, max: MAX_AI_SOURCES }
    )
  }

  const { aliases } = built
  const inputHash = hashRecommendationInput(built.input, aliases)
  const db = tenantDb(ctx)

  const { stored, cached } = await generateForTenant(
    ctx,
    recommendationPrompt,
    built.input,
    {
      force: options.regenerate,
      // Same input, same prompt version, same organisation: nothing to spend.
      find: () =>
        db.recommendationResult.findFirst({
          where: {
            promptVersion: recommendationPrompt.version,
            request: { inputHash }
          },
          orderBy: { createdAt: 'desc' },
          include: resultInclude
        }),
      save: async (generated) => {
        const { view, adjustments } = finalise({
          request,
          rules,
          snapshot,
          aliases: aliases as AliasMap,
          content: generated.content
        })
        const created = await db.recommendationRequest.create({
          data: {
            organisationId: ctx.organisationId,
            createdById: ctx.userId,
            kind: request.kind,
            roomId: request.roomId,
            forDate: request.forDate,
            input: asJson(request),
            rules: asJson(rules),
            locker: asJson(snapshot),
            aliases: asJson(aliases),
            rulesVersion: rules.rulesVersion,
            profilesVersion: rules.profilesVersion,
            inputHash,
            results: {
              create: {
                // Nested writes are not scoped by tenantDb, so name the
                // organisation here.
                organisationId: ctx.organisationId,
                promptVersion: recommendationPrompt.version,
                model: generated.model,
                content: asJson(generated.content),
                final: asJson(view),
                adjustments: toJsonValue(adjustments),
                inputTokens: generated.inputTokens,
                outputTokens: generated.outputTokens
              }
            }
          },
          select: {
            id: true,
            input: true,
            rules: true,
            results: {
              select: {
                id: true,
                requestId: true,
                promptVersion: true,
                model: true,
                final: true,
                adjustments: true,
                createdAt: true
              }
            }
          }
        })
        const result = created.results[0]
        return {
          ...result,
          request: { input: created.input, rules: created.rules }
        }
      }
    }
  )

  if (!cached) {
    await recordAudit(ctx, {
      action: 'recommendation.create',
      entityType: 'recommendation',
      entityId: stored.id,
      summary: `Generated a microphone recommendation for ${request.sources.length} ${request.sources.length === 1 ? 'source' : 'sources'}`,
      metadata: {
        kind: request.kind,
        sources: request.sources.length,
        model: stored.model,
        regenerated: options.regenerate === true
      }
    })
  }

  const feedback = cached
    ? await db.recommendationFeedback.findMany({
        where: { resultId: stored.id, userId: ctx.userId }
      })
    : []
  return {
    recommendation: await toDetail(ctx, stored as ResultRow, feedback),
    preview,
    cached
  }
}
