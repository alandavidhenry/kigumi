import { randomUUID } from 'node:crypto'

import { recordAudit } from '@/lib/audit'
import { conflict, notFound } from '@/lib/errors'
import { requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { Permission } from '@/types/rbac'

import { BUILTIN_CONSOLE_TEMPLATES, getBuiltInConsoleTemplate } from './builtin'
import {
  consoleInputSchema,
  consoleUpdateSchema,
  stripSchema,
  templateInputSchema,
  templateUpdateSchema
} from './schemas'

import type { StripDefinition } from './types'

// Console definitions and their channel-strip templates (PLAN §4.7, ADR 0017).
// Free on every plan: console templates you define yourself are core workflow.

export interface TemplateSummary {
  id: string
  name: string
  description: string | null
  controlCount: number
  consoleCount: number
}

export interface TemplateDetail extends TemplateSummary {
  strip: StripDefinition
}

export interface ConsoleSummary {
  id: string
  name: string
  make: string | null
  model: string | null
  channelCount: number
  notes: string | null
  templateId: string
  templateName: string
}

// A stored strip is validated on every read; a row that no longer fits is
// treated as empty rather than crashing the page.
export function readStrip(json: unknown): StripDefinition {
  const parsed = stripSchema.safeParse(json)
  return parsed.success ? parsed.data : { sections: [] }
}

const countControls = (strip: StripDefinition) =>
  strip.sections.reduce((n, s) => n + s.controls.length, 0)

export function listBuiltInTemplates() {
  return BUILTIN_CONSOLE_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    controlCount: countControls(t.strip)
  }))
}

// ---------------------------------------------------------------------------
// Templates

export async function listConsoleTemplates(
  ctx: TenantContext
): Promise<TemplateSummary[]> {
  requirePermission(ctx, Permission.VIEW_SESSIONS)
  const rows = await tenantDb(ctx).consoleTemplate.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      strip: true,
      _count: { select: { consoles: true } }
    }
  })
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    controlCount: countControls(readStrip(row.strip)),
    consoleCount: row._count.consoles
  }))
}

export async function getConsoleTemplate(
  ctx: TenantContext,
  templateId: string
): Promise<TemplateDetail> {
  requirePermission(ctx, Permission.VIEW_SESSIONS)
  const row = await tenantDb(ctx).consoleTemplate.findFirst({
    where: { id: templateId },
    select: {
      id: true,
      name: true,
      description: true,
      strip: true,
      _count: { select: { consoles: true } }
    }
  })
  if (!row) throw notFound('Template')
  const strip = readStrip(row.strip)
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    strip,
    controlCount: countControls(strip),
    consoleCount: row._count.consoles
  }
}

export async function createConsoleTemplate(
  ctx: TenantContext,
  input: unknown
): Promise<{ id: string }> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const data = templateInputSchema.parse(input)
  const created = await tenantDb(ctx).consoleTemplate.create({
    data: {
      organisationId: ctx.organisationId,
      name: data.name,
      description: data.description ?? null,
      strip: data.strip
    },
    select: { id: true }
  })
  await recordAudit(ctx, {
    action: 'console_template.create',
    entityType: 'console_template',
    entityId: created.id,
    summary: `Created channel-strip template ${data.name}`
  })
  return created
}

export async function updateConsoleTemplate(
  ctx: TenantContext,
  templateId: string,
  input: unknown
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const data = templateUpdateSchema.parse(input)
  const db = tenantDb(ctx)
  const existing = await db.consoleTemplate.findFirst({
    where: { id: templateId },
    select: { name: true }
  })
  if (!existing) throw notFound('Template')

  const { count } = await db.consoleTemplate.updateMany({
    where: { id: templateId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.strip !== undefined && { strip: data.strip })
    }
  })
  if (count === 0) throw notFound('Template')
  await recordAudit(ctx, {
    action: 'console_template.update',
    entityType: 'console_template',
    entityId: templateId,
    summary: `Updated channel-strip template ${data.name ?? existing.name}`,
    metadata: { fields: Object.keys(data) }
  })
}

export async function deleteConsoleTemplate(
  ctx: TenantContext,
  templateId: string
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const db = tenantDb(ctx)
  const existing = await db.consoleTemplate.findFirst({
    where: { id: templateId },
    select: { name: true }
  })
  if (!existing) throw notFound('Template')
  const inUse = await db.console.count({ where: { templateId } })
  if (inUse > 0) {
    throw conflict(
      `${existing.name} is used by ${inUse} console${inUse === 1 ? '' : 's'}. Point them at another template first.`
    )
  }
  await db.consoleTemplate.deleteMany({ where: { id: templateId } })
  await recordAudit(ctx, {
    action: 'console_template.delete',
    entityType: 'console_template',
    entityId: templateId,
    summary: `Deleted channel-strip template ${existing.name}`
  })
}

// ---------------------------------------------------------------------------
// Consoles

const consoleSelect = {
  id: true,
  name: true,
  make: true,
  model: true,
  channelCount: true,
  notes: true,
  templateId: true,
  template: { select: { name: true } }
} as const

export async function listConsoles(
  ctx: TenantContext
): Promise<ConsoleSummary[]> {
  requirePermission(ctx, Permission.VIEW_SESSIONS)
  const rows = await tenantDb(ctx).console.findMany({
    orderBy: { name: 'asc' },
    select: consoleSelect
  })
  return rows.map(({ template, ...row }) => ({
    ...row,
    templateName: template.name
  }))
}

export async function createConsole(
  ctx: TenantContext,
  input: unknown
): Promise<{ id: string }> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const data = consoleInputSchema.parse(input)
  const db = tenantDb(ctx)

  const id = randomUUID()
  await db.$transaction(async (tx) => {
    let templateId = data.templateId
    if (data.builtinTemplateId) {
      // Copy the shipped template so the studio can edit its own version.
      const builtIn = getBuiltInConsoleTemplate(data.builtinTemplateId)
      if (!builtIn) throw notFound('Template')
      const copy = await tx.consoleTemplate.create({
        data: {
          organisationId: ctx.organisationId,
          name: builtIn.name,
          description: builtIn.description,
          strip: builtIn.strip as never
        },
        select: { id: true }
      })
      templateId = copy.id
    } else {
      const own = await tx.consoleTemplate.findFirst({
        where: { id: templateId },
        select: { id: true }
      })
      if (!own) throw notFound('Template')
    }
    await tx.console.create({
      data: {
        id,
        organisationId: ctx.organisationId,
        templateId: templateId as string,
        name: data.name,
        make: data.make ?? null,
        model: data.model ?? null,
        channelCount: data.channelCount,
        notes: data.notes ?? null
      }
    })
  })
  await recordAudit(ctx, {
    action: 'console.create',
    entityType: 'console',
    entityId: id,
    summary: `Added console ${data.name}`
  })
  return { id }
}

export async function updateConsole(
  ctx: TenantContext,
  consoleId: string,
  input: unknown
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const data = consoleUpdateSchema.parse(input)
  const db = tenantDb(ctx)
  const existing = await db.console.findFirst({
    where: { id: consoleId },
    select: { name: true }
  })
  if (!existing) throw notFound('Console')
  if (data.templateId) {
    const own = await db.consoleTemplate.findFirst({
      where: { id: data.templateId },
      select: { id: true }
    })
    if (!own) throw notFound('Template')
  }
  const { count } = await db.console.updateMany({
    where: { id: consoleId },
    data
  })
  if (count === 0) throw notFound('Console')
  await recordAudit(ctx, {
    action: 'console.update',
    entityType: 'console',
    entityId: consoleId,
    summary: `Updated console ${data.name ?? existing.name}`,
    metadata: { fields: Object.keys(data) }
  })
}

// Recall sheets keep their own snapshot of the desk, so deleting a console
// never changes a sheet that was already written.
export async function deleteConsole(
  ctx: TenantContext,
  consoleId: string
): Promise<void> {
  requirePermission(ctx, Permission.MANAGE_SESSIONS)
  const db = tenantDb(ctx)
  const existing = await db.console.findFirst({
    where: { id: consoleId },
    select: { name: true }
  })
  if (!existing) throw notFound('Console')
  await db.console.deleteMany({ where: { id: consoleId } })
  await recordAudit(ctx, {
    action: 'console.delete',
    entityType: 'console',
    entityId: consoleId,
    summary: `Deleted console ${existing.name}`
  })
}
