import { randomUUID } from 'node:crypto'

import { recordAudit } from '@/lib/audit'
import { notFound } from '@/lib/errors'
import type { FinalView } from '@/lib/recommendations/finalise'
import { requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { Permission } from '@/types/rbac'

import { planApply } from './apply-recommendation'
import { nextChannelNumber } from './input-list'
import { applyRecommendationSchema } from './schemas'
import { syncInputList } from './sync'

import type { ApplyPlan } from './apply-recommendation'
import type { Db } from './queries'

// Applies a stored recommendation to a session's layout and input list
// (PLAN §4.4). See apply-recommendation.ts for the rules; this wraps the plan
// in one transaction and keeps the input list in step.

export interface ApplyResult {
  updated: number
  created: number
  lineChannels: number
  skipped: ApplyPlan['skipped']
}

const AI_NOTE_PREFIX = 'AI placement:'

export interface ApplyPlanWrite {
  sessionId: string
  layoutId: string
  plan: ApplyPlan
  existingMaxSort: number
}

// Writes an apply plan (item updates and creates, input-list sync, AI notes and
// line channels) inside the caller's transaction.
export async function writeApplyPlanTx(
  tx: Db,
  ctx: TenantContext,
  { sessionId, layoutId, plan, existingMaxSort }: ApplyPlanWrite
): Promise<void> {
  await tx.layout.updateMany({
    where: { id: layoutId },
    data: { version: { increment: 1 } }
  })
  for (const update of plan.update) {
    const { id, ...data } = update
    await tx.layoutItem.updateMany({
      where: { id, layoutId: layoutId },
      data
    })
  }
  if (plan.create.length > 0) {
    const maxSort = existingMaxSort
    await tx.layoutItem.createMany({
      data: plan.create.map((item, index) => ({
        ...item,
        type: 'mic',
        rotationDeg: 0,
        pitchDeg: 0,
        sortOrder: maxSort + 1 + index,
        id: randomUUID(),
        layoutId: layoutId,
        organisationId: ctx.organisationId
      }))
    })
  }
  await syncInputList(tx, ctx.organisationId, sessionId, layoutId)

  // AI placement text goes in the channel's notes, never into coordinates.
  const refs = Object.keys(plan.notes)
  if (refs.length > 0) {
    const items = await tx.layoutItem.findMany({
      where: { layoutId: layoutId, recommendationRef: { in: refs } },
      select: { id: true, recommendationRef: true }
    })
    for (const item of items) {
      const note = item.recommendationRef
        ? plan.notes[item.recommendationRef]
        : undefined
      if (!note) continue
      const channel = await tx.inputChannel.findFirst({
        where: { layoutItemId: item.id },
        select: { id: true, notes: true }
      })
      if (!channel) continue
      const current = channel.notes?.trim() ?? ''
      if (current.includes(note)) continue
      const next =
        !current || current.startsWith(AI_NOTE_PREFIX)
          ? note
          : `${current}\n${note}`
      await tx.inputChannel.updateMany({
        where: { id: channel.id },
        data: { notes: next.slice(0, 500) }
      })
    }
  }

  if (plan.lineChannels.length > 0) {
    const existing = await tx.inputChannel.findMany({
      where: { sessionId },
      select: { number: true, kind: true, source: true }
    })
    const used = existing.map((c) => c.number)
    for (const label of plan.lineChannels) {
      if (existing.some((c) => c.kind === 'line' && c.source === label)) {
        continue
      }
      const number = nextChannelNumber(used)
      used.push(number)
      await tx.inputChannel.create({
        data: {
          organisationId: ctx.organisationId,
          sessionId,
          number,
          kind: 'line',
          source: label,
          phantom: false
        }
      })
    }
  }
}

export async function applyRecommendation(
  ctx: TenantContext,
  sessionId: string,
  input: unknown
): Promise<ApplyResult> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const { resultId } = applyRecommendationSchema.parse(input)
  const db = tenantDb(ctx)

  const layout = await db.layout.findFirst({
    where: { sessionId },
    select: {
      id: true,
      widthMm: true,
      lengthMm: true,
      session: { select: { name: true } },
      items: {
        select: {
          id: true,
          type: true,
          label: true,
          recommendationRef: true,
          micUnitId: true
        }
      }
    }
  })
  if (!layout) throw notFound('Session')

  const result = await db.recommendationResult.findFirst({
    where: { id: resultId },
    select: { final: true }
  })
  if (!result) throw notFound('Recommendation')
  const original = result.final as unknown as FinalView

  // A microphone that has left the locker since the recommendation was made
  // can't be applied.
  const unitIds = [
    ...new Set(
      original.sources.flatMap((s) =>
        (s.primary?.units ?? []).map((u) => u.unitId)
      )
    )
  ]
  const present = new Set(
    unitIds.length > 0
      ? (
          await db.microphoneUnit.findMany({
            where: { id: { in: unitIds } },
            select: { id: true }
          })
        ).map((u) => u.id)
      : []
  )
  const removed: ApplyPlan['skipped'] = []
  const view: FinalView = {
    ...original,
    sources: original.sources.map((source) => {
      if (source.primary?.units.every((u) => present.has(u.unitId)) ?? true) {
        return source
      }
      removed.push({
        sourceId: source.sourceId,
        label: source.label,
        reason: 'unit_removed'
      })
      return { ...source, primary: null }
    })
  }

  // The planner needs the full item shape to match by position-free fields.
  const fullItems = await db.layoutItem.findMany({
    where: { layoutId: layout.id },
    select: {
      id: true,
      type: true,
      variant: true,
      label: true,
      xMm: true,
      yMm: true,
      zMm: true,
      rotationDeg: true,
      pitchDeg: true,
      widthMm: true,
      depthMm: true,
      heightMm: true,
      sortOrder: true,
      locked: true,
      groupId: true,
      micUnitId: true,
      equipmentItemId: true,
      patternSetting: true,
      showPattern: true,
      recommendationRef: true,
      notes: true
    }
  })
  const plan = planApply({
    resultId,
    view,
    items: fullItems as never,
    room: layout
  })
  // `removed` sources have no pick now, so the planner counted them as
  // no_pick; report the more useful reason instead.
  const removedIds = new Set(removed.map((r) => r.sourceId))
  const skipped = [
    ...plan.skipped.filter((s) => !removedIds.has(s.sourceId)),
    ...removed
  ]

  await db.$transaction(async (tx) => {
    await writeApplyPlanTx(tx, ctx, {
      sessionId,
      layoutId: layout.id,
      plan,
      existingMaxSort: fullItems.reduce(
        (max, item) => Math.max(max, item.sortOrder),
        -1
      )
    })
  })

  await recordAudit(ctx, {
    action: 'session.recommendation.apply',
    entityType: 'session',
    entityId: sessionId,
    summary: `Applied a microphone recommendation to ${layout.session?.name ?? 'a session'}: ${plan.update.length} updated, ${plan.create.length} added`,
    metadata: { resultId, skipped: skipped.length }
  })
  return {
    updated: plan.update.length,
    created: plan.create.length,
    lineChannels: plan.lineChannels.length,
    skipped
  }
}
