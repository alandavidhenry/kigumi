import { badRequest, notFound } from '@/lib/errors'
import prisma from '@/lib/prisma'
import { requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { Permission } from '@/types/rbac'

import { feedbackInputSchema } from './schemas'
import { toFeedbackView } from './service'

import type { FinalView } from './finalise'
import type { FeedbackView } from './service'
import type { RulesOutput } from './types'

// Feedback on a stored recommendation (PLAN §4.4: "feedback on every
// recommendation, stored with the full request context"). The context is the
// result's own request, rules and snapshot rows; this adds the verdict. One
// row per person per source, replaced when they change their mind. Comments
// are the user's own text and are never sent to a model.

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id) => b.includes(id))

export async function submitFeedback(
  ctx: TenantContext,
  resultId: string,
  input: unknown
): Promise<FeedbackView> {
  requirePermission(ctx, Permission.USE_AI)
  const data = feedbackInputSchema.parse(input)
  const db = tenantDb(ctx)

  const result = await db.recommendationResult.findFirst({
    where: { id: resultId },
    select: {
      id: true,
      final: true,
      request: { select: { rules: true } }
    }
  })
  if (!result) throw notFound('Recommendation')
  const view = result.final as unknown as FinalView
  const rules = result.request.rules as unknown as RulesOutput

  let swappedToModelSlugs: string[] = []
  let swappedToCandidate: boolean | null = null

  if (data.sourceKey !== '*') {
    const source = rules.sources.find((s) => s.id === data.sourceKey)
    if (!source || source.line)
      throw badRequest('That source is not part of this recommendation')

    if (data.verdict === 'swapped') {
      if (data.swappedToUnitIds.length !== source.micCount) {
        throw badRequest(
          `This source uses ${source.micCount} ${source.micCount === 1 ? 'microphone' : 'microphones'}; say which ${source.micCount === 1 ? 'one' : 'ones'} you used instead.`
        )
      }
      if (
        new Set(data.swappedToUnitIds).size !== data.swappedToUnitIds.length
      ) {
        throw badRequest('Each microphone can only be used once')
      }

      // Another organisation's unit is simply not found.
      const units = await db.microphoneUnit.findMany({
        where: { id: { in: data.swappedToUnitIds } },
        select: { id: true, micModelId: true }
      })
      if (units.length !== data.swappedToUnitIds.length) {
        throw notFound('Mic locker unit')
      }

      const picked = view.sources
        .find((s) => s.sourceId === data.sourceKey)
        ?.primary?.units.map((u) => u.unitId)
      if (picked && sameSet(picked, data.swappedToUnitIds)) {
        throw badRequest(
          'Those are the microphones that were recommended. Mark it as accepted instead.'
        )
      }

      const models = await prisma.microphoneModel.findMany({
        where: { id: { in: units.map((u) => u.micModelId) } },
        select: { id: true, slug: true }
      })
      const slugById = new Map(models.map((m) => [m.id, m.slug]))
      swappedToModelSlugs = data.swappedToUnitIds.map(
        (id) => slugById.get(units.find((u) => u.id === id)!.micModelId) ?? ''
      )
      swappedToCandidate = source.candidates.some((c) =>
        sameSet(c.unitIds, data.swappedToUnitIds)
      )
    }
  }

  const fields = {
    verdict: data.verdict,
    swappedToUnitIds: data.swappedToUnitIds,
    swappedToModelSlugs,
    swappedToCandidate,
    rating: data.rating ?? null,
    reasons: data.reasons,
    comment: data.comment ?? null
  }
  const row = await db.recommendationFeedback.upsert({
    where: {
      resultId_sourceKey_userId: {
        resultId,
        sourceKey: data.sourceKey,
        userId: ctx.userId
      }
    },
    create: {
      organisationId: ctx.organisationId,
      resultId,
      userId: ctx.userId,
      sourceKey: data.sourceKey,
      ...fields
    },
    update: fields
  })
  return toFeedbackView(row)
}
