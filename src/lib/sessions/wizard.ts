import { randomUUID } from 'node:crypto'

import { recordAudit } from '@/lib/audit'
import { badRequest, notFound } from '@/lib/errors'
import { placeSources } from '@/lib/layout/auto-place'
import { logger } from '@/lib/logger'
import { Feature } from '@/lib/plans'
import { createRecallSheet } from '@/lib/recall/service'
import { rulesView } from '@/lib/recommendations/finalise'
import type { FinalView } from '@/lib/recommendations/finalise'
import { prepareRules } from '@/lib/recommendations/service'
import { requireFeature, requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { Permission } from '@/types/rbac'

import { writeApplyPlanTx } from './apply'
import { planApply } from './apply-recommendation'
import { DEFAULT_TIMEZONE } from './overview'
import {
  DEFAULT_ROOM,
  insertSessionTx,
  itemsForStart,
  parseTimes,
  resolveRoom
} from './service'
import { saveSessionAsTemplate } from './templates'
import { formatLocalInput, localToUtc } from './time'
import { toRequestSources, wizardInputSchema } from './wizard-schemas'

import type { StartFrom } from './schemas'
import type { NewItem } from './service'
import type { WizardInput, WizardResult } from './wizard-schemas'

// Creates a session, its layout, mic picks, input list and (after commit) the
// recall sheet and an optional saved template in one call (session wizard).

const DEFAULT_START = '10:00'
const DEFAULT_LENGTH_MS = 4 * 60 * 60 * 1000

async function viewFromRules(
  ctx: TenantContext,
  input: WizardInput,
  roomId: string | null,
  forDate: string,
  overrides: Record<string, string>
): Promise<FinalView> {
  const prepared = await prepareRules(ctx, {
    sources: toRequestSources(input.sources),
    roomId: roomId ?? undefined,
    forDate,
    channels: input.details.channelsAvailable ?? undefined,
    phantomMode: input.details.phantomMode
  })
  // The request numbers its sources s1, s2, ... by array order.
  const byRequestId: Record<string, string> = {}
  input.sources.forEach((source, index) => {
    const option = overrides[source.id]
    if (option) byRequestId[`s${index + 1}`] = option
  })
  return rulesView(prepared.rules, prepared.snapshot, byRequestId)
}

async function viewFromAi(
  ctx: TenantContext,
  resultId: string,
  input: WizardInput
): Promise<FinalView> {
  const row = await tenantDb(ctx).recommendationResult.findFirst({
    where: { id: resultId },
    select: { final: true, request: { select: { input: true } } }
  })
  if (!row) throw notFound('Recommendation')
  const requested = (
    row.request.input as { sources?: Array<{ label: string }> }
  ).sources
  const same =
    requested?.length === input.sources.length &&
    requested.every((s, i) => s.label === input.sources[i].label)
  if (!same) {
    throw badRequest(
      'That recommendation was made for different sources. Pick again, or use the rules-based picks.'
    )
  }
  return row.final as unknown as FinalView
}

export async function createSessionFromWizard(
  ctx: TenantContext,
  rawInput: unknown
): Promise<WizardResult> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const input = wizardInputSchema.parse(rawInput)
  const { details } = input
  const db = tenantDb(ctx)
  const warnings: string[] = []

  // Everything that can 404 or be refused happens before anything is written.
  const room = await resolveRoom(ctx, details.roomId)
  if (input.recall) {
    const desk = await db.console.findFirst({
      where: { id: input.recall.consoleId },
      select: { id: true }
    })
    if (!desk) throw notFound('Console')
  }
  if (input.saveAsTemplate) requireFeature(ctx, Feature.TEMPLATES)

  const timeZone = room?.studio.timezone ?? DEFAULT_TIMEZONE
  const today = formatLocalInput(new Date(), timeZone).slice(0, 10)
  const startsLocal = details.startsAt ?? `${today}T${DEFAULT_START}`
  const startsAt = localToUtc(startsLocal, timeZone)
  if (!startsAt) throw badRequest('Use a real date and time')
  // A missing end defaults to four hours after the start.
  const endsAt = details.endsAt
    ? parseTimes(startsLocal, details.endsAt, timeZone).endsAt
    : new Date(startsAt.getTime() + DEFAULT_LENGTH_MS)
  const dims = room ?? DEFAULT_ROOM
  const forDate = input.forDate ?? startsLocal.slice(0, 10)

  let view: FinalView | null = null
  let pickRef = 'none'
  if (input.picks.mode === 'rules') {
    view = await viewFromRules(
      ctx,
      input,
      room?.id ?? null,
      forDate,
      input.picks.overrides ?? {}
    )
    pickRef = 'rules'
  } else if (input.picks.mode === 'ai') {
    view = await viewFromAi(ctx, input.picks.resultId, input)
    pickRef = input.picks.resultId
  }

  let items: NewItem[]
  if (input.layout.kind === 'auto') {
    items = placeSources(input.sources, dims).map((item, index) => ({
      ...item,
      sortOrder: index
    }))
  } else {
    const startFrom: StartFrom =
      input.layout.kind === 'blank'
        ? { kind: 'blank' }
        : input.layout.kind === 'builtin'
          ? { kind: 'builtin', templateId: input.layout.templateId }
          : { kind: 'template', layoutId: input.layout.layoutId }
    items = await itemsForStart(ctx, startFrom, dims)
  }

  const sessionId = randomUUID()
  let notes: Record<string, string> = {}
  let lineChannels: string[] = []
  if (view) {
    for (const source of view.sources) {
      if (source.primary || source.line) continue
      warnings.push(
        source.unfillable === 'all_in_use'
          ? `Every suitable microphone for ${source.label} is booked or already used.`
          : `No microphone you own suits ${source.label}.`
      )
    }
    const tagged = items.map((item, index) => ({
      ...item,
      id: `tmp-${index}`
    }))
    const plan = planApply({
      resultId: `${pickRef}:${sessionId}`,
      view,
      items: tagged as never,
      room: dims
    })
    const updates = new Map(plan.update.map((u) => [u.id, u]))
    const merged = tagged.map(({ id, ...item }) => {
      const update = updates.get(id)
      if (!update) return item
      const fields = { ...update, id: undefined }
      return { ...item, ...fields }
    })
    const created = plan.create.map((item, index) => ({
      ...item,
      type: 'mic',
      rotationDeg: 0,
      pitchDeg: 0,
      sortOrder: merged.length + index
    }))
    items = [...merged, ...created]
    notes = plan.notes
    lineChannels = plan.lineChannels
    for (const skipped of plan.skipped) {
      if (skipped.reason === 'unit_in_use') {
        warnings.push(
          `${skipped.label} shares a microphone with another source and was left without one.`
        )
      }
    }
  }

  await db.$transaction(async (tx) => {
    const layoutId = await insertSessionTx(
      tx,
      ctx,
      {
        id: sessionId,
        roomId: room?.id ?? null,
        name: details.name,
        client: details.client ?? null,
        startsAt,
        endsAt,
        status: 'planned',
        channelsAvailable: details.channelsAvailable ?? null,
        phantomMode: details.phantomMode,
        notes: null,
        dims
      },
      items
    )
    // The items are in, so this adds the line channels and notes and syncs the
    // input list.
    await writeApplyPlanTx(tx, ctx, {
      sessionId,
      layoutId,
      plan: { update: [], create: [], notes, lineChannels, skipped: [] },
      existingMaxSort: -1
    })
  })

  await recordAudit(ctx, {
    action: 'session.create',
    entityType: 'session',
    entityId: sessionId,
    summary: `Created session ${details.name}`,
    metadata: {
      source: 'wizard',
      presetId: input.presetId ?? null,
      items: items.length
    }
  })

  const result: WizardResult = {
    id: sessionId,
    recall: 'skipped',
    template: 'skipped',
    warnings
  }

  if (input.recall) {
    try {
      await createRecallSheet(ctx, sessionId, {
        consoleId: input.recall.consoleId
      })
      result.recall = 'created'
    } catch (error) {
      result.recall = 'failed'
      warnings.push('The recall sheet could not be created. Add it later.')
      logger.warn('session.wizard.recall_failed', { error })
    }
  }

  if (input.saveAsTemplate) {
    try {
      await saveSessionAsTemplate(ctx, sessionId, {
        name: input.saveAsTemplate.name,
        description: input.saveAsTemplate.description,
        presetId: input.presetId,
        sources: input.sources,
        consoleId: input.recall?.consoleId ?? null,
        channelsAvailable: details.channelsAvailable ?? null,
        phantomMode: details.phantomMode
      })
      result.template = 'created'
    } catch (error) {
      result.template = 'failed'
      warnings.push('The session could not be saved as a template.')
      logger.warn('session.wizard.template_failed', { error })
    }
  }

  logger.info('session.wizard.created', {
    organisationId: ctx.organisationId,
    sources: input.sources.length,
    items: items.length,
    picks: input.picks.mode,
    recall: result.recall,
    warnings: warnings.length
  })
  return result
}
