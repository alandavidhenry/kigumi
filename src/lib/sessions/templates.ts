import { z } from 'zod'

import { recordAudit } from '@/lib/audit'
import { notFound } from '@/lib/errors'
import { saveTemplate } from '@/lib/layout/service'
import { Feature } from '@/lib/plans'
import { toJsonValue } from '@/lib/prisma-json'
import { MAX_SOURCES } from '@/lib/recommendations/schemas'
import { PHANTOM_MODES } from '@/lib/recommendations/types'
import { requireFeature, requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { Permission } from '@/types/rbac'

import { MAX_CHANNELS } from './types'
import { wizardSourceSchema, type WizardSource } from './wizard-schemas'

// A studio's own session templates (Pro, ADR 0024): the wizard's sources, an
// optional template Layout and an optional console.

const collapse = (value: string) => value.replace(/\s+/g, ' ').trim()
const id = z.string().trim().min(1).max(64)

const base = {
  name: z.string().transform(collapse).pipe(z.string().min(1).max(80)),
  description: z.string().trim().max(500).optional()
}

const shared = {
  ...base,
  presetId: z.string().trim().min(1).max(40).optional(),
  sources: z.array(wizardSourceSchema).min(1).max(MAX_SOURCES),
  consoleId: id.nullable().optional(),
  channelsAvailable: z
    .number()
    .int()
    .min(1)
    .max(MAX_CHANNELS)
    .nullable()
    .optional(),
  phantomMode: z.enum(PHANTOM_MODES).default('per_channel')
}

export const sessionTemplateInputSchema = z.object({
  ...shared,
  layoutId: id.nullable().optional()
})
export type SessionTemplateInput = z.input<typeof sessionTemplateInputSchema>

const saveSessionSchema = z.object(shared)

export const sessionTemplateUpdateSchema = z.object(base)

export interface SessionTemplateSummary {
  id: string
  name: string
  description: string | null
  presetId: string | null
  sources: WizardSource[]
  layoutId: string | null
  consoleId: string | null
  consoleName: string | null
  channelsAvailable: number | null
  phantomMode: string
  createdAt: Date
}

const summarySelect = {
  id: true,
  name: true,
  description: true,
  presetId: true,
  sources: true,
  layoutId: true,
  consoleId: true,
  console: { select: { name: true } },
  channelsAvailable: true,
  phantomMode: true,
  createdAt: true
} as const

function toSummary(row: {
  id: string
  name: string
  description: string | null
  presetId: string | null
  sources: unknown
  layoutId: string | null
  consoleId: string | null
  console: { name: string } | null
  channelsAvailable: number | null
  phantomMode: string
  createdAt: Date
}): SessionTemplateSummary {
  const { console: desk, sources, ...rest } = row
  return {
    ...rest,
    sources: Array.isArray(sources) ? (sources as WizardSource[]) : [],
    consoleName: desk?.name ?? null
  }
}

function guard(ctx: TenantContext, permission: Permission) {
  requirePermission(ctx, permission)
  requireFeature(ctx, Feature.TEMPLATES)
}

export async function listSessionTemplates(
  ctx: TenantContext
): Promise<SessionTemplateSummary[]> {
  guard(ctx, Permission.VIEW_SESSIONS)
  const rows = await tenantDb(ctx).sessionTemplate.findMany({
    orderBy: { name: 'asc' },
    select: summarySelect
  })
  return rows.map(toSummary)
}

export async function getSessionTemplate(
  ctx: TenantContext,
  templateId: string
): Promise<SessionTemplateSummary> {
  guard(ctx, Permission.VIEW_SESSIONS)
  const row = await tenantDb(ctx).sessionTemplate.findFirst({
    where: { id: templateId },
    select: summarySelect
  })
  if (!row) throw notFound('Session template')
  return toSummary(row)
}

type Db = ReturnType<typeof tenantDb>

// Core insert; the caller has already checked permission and plan.
export async function createSessionTemplateTx(
  db: Pick<Db, 'layout' | 'console' | 'sessionTemplate'>,
  ctx: TenantContext,
  data: z.output<typeof sessionTemplateInputSchema>
): Promise<{ id: string }> {
  if (data.layoutId) {
    const layout = await db.layout.findFirst({
      where: { id: data.layoutId, isTemplate: true },
      select: { id: true }
    })
    if (!layout) throw notFound('Template')
  }
  if (data.consoleId) {
    const desk = await db.console.findFirst({
      where: { id: data.consoleId },
      select: { id: true }
    })
    if (!desk) throw notFound('Console')
  }
  return db.sessionTemplate.create({
    data: {
      organisationId: ctx.organisationId,
      name: data.name,
      description: data.description ?? null,
      presetId: data.presetId ?? null,
      sources: toJsonValue(data.sources) ?? [],
      layoutId: data.layoutId ?? null,
      consoleId: data.consoleId ?? null,
      channelsAvailable: data.channelsAvailable ?? null,
      phantomMode: data.phantomMode,
      createdById: ctx.userId
    },
    select: { id: true }
  })
}

export async function createSessionTemplate(
  ctx: TenantContext,
  input: unknown
): Promise<{ id: string }> {
  guard(ctx, Permission.MANAGE_SESSIONS)
  const data = sessionTemplateInputSchema.parse(input)
  const created = await createSessionTemplateTx(tenantDb(ctx), ctx, data)
  await recordAudit(ctx, {
    action: 'session_template.create',
    entityType: 'session_template',
    entityId: created.id,
    summary: `Saved the session template ${data.name}`,
    metadata: { sources: data.sources.length }
  })
  return created
}

// Copies a session's layout into a new template Layout, then stores the
// session template that points at it. If the second step fails the copied
// layout is removed again.
export async function saveSessionAsTemplate(
  ctx: TenantContext,
  sessionId: string,
  input: unknown
): Promise<{ id: string; layoutId: string }> {
  guard(ctx, Permission.MANAGE_SESSIONS)
  const data = saveSessionSchema.parse(input)
  const layout = await saveTemplate(ctx, {
    name: data.name,
    fromSessionId: sessionId
  })
  try {
    const created = await createSessionTemplateTx(tenantDb(ctx), ctx, {
      ...data,
      layoutId: layout.id
    })
    await recordAudit(ctx, {
      action: 'session_template.create',
      entityType: 'session_template',
      entityId: created.id,
      summary: `Saved the session template ${data.name}`,
      metadata: { sources: data.sources.length, fromSession: sessionId }
    })
    return { id: created.id, layoutId: layout.id }
  } catch (error) {
    await tenantDb(ctx).layout.deleteMany({
      where: { id: layout.id, isTemplate: true }
    })
    throw error
  }
}

export async function renameSessionTemplate(
  ctx: TenantContext,
  templateId: string,
  input: unknown
): Promise<void> {
  guard(ctx, Permission.MANAGE_SESSIONS)
  const data = sessionTemplateUpdateSchema.parse(input)
  const { count } = await tenantDb(ctx).sessionTemplate.updateMany({
    where: { id: templateId },
    data: { name: data.name, description: data.description ?? null }
  })
  if (count === 0) throw notFound('Session template')
  await recordAudit(ctx, {
    action: 'session_template.update',
    entityType: 'session_template',
    entityId: templateId,
    summary: `Renamed a session template to ${data.name}`
  })
}

export async function deleteSessionTemplate(
  ctx: TenantContext,
  templateId: string
): Promise<void> {
  guard(ctx, Permission.MANAGE_SESSIONS)
  const db = tenantDb(ctx)
  const row = await db.sessionTemplate.findFirst({
    where: { id: templateId },
    select: { name: true, layoutId: true }
  })
  if (!row) throw notFound('Session template')
  await db.$transaction(async (tx) => {
    await tx.sessionTemplate.deleteMany({ where: { id: templateId } })
    if (row.layoutId) {
      await tx.layout.deleteMany({
        where: { id: row.layoutId, isTemplate: true }
      })
    }
  })
  await recordAudit(ctx, {
    action: 'session_template.delete',
    entityType: 'session_template',
    entityId: templateId,
    summary: `Deleted the session template ${row.name}`
  })
}
