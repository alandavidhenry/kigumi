import { recordAudit } from '@/lib/audit'
import { parseCsv, toCsv } from '@/lib/csv'
import {
  buildWhere,
  toDate,
  toEquipmentRow,
  equipmentSelect
} from '@/lib/equipment'
import type { EquipmentRow } from '@/lib/equipment'
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CATEGORY_LABELS,
  EQUIPMENT_STATUSES,
  EQUIPMENT_STATUS_LABELS
} from '@/lib/equipment-types'
import type { EquipmentCategory } from '@/lib/equipment-types'
import { badRequest, planLimit } from '@/lib/errors'
import { Feature, canAdd, getPlanLimits } from '@/lib/plans'
import { requireFeature, requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import {
  equipmentInputSchema,
  majorToMinor,
  minorToMajor
} from '@/lib/validation'
import { Permission } from '@/types/rbac'

export const MAX_IMPORT_ROWS = 1000

export const CSV_HEADER = [
  'category',
  'make',
  'model',
  'serial',
  'quantity',
  'status',
  'room',
  'purchase_date',
  'purchase_price',
  'supplier',
  'tags',
  'notes'
] as const

export interface ImportRowError {
  row: number // 1-based spreadsheet row, header is row 1
  message: string
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function exportEquipmentCsv(
  ctx: TenantContext,
  filter: unknown = {}
): Promise<string> {
  requirePermission(ctx, Permission.VIEW_INVENTORY)
  const rows = await tenantDb(ctx).equipmentItem.findMany({
    where: buildWhere(filter),
    orderBy: [{ category: 'asc' }, { make: 'asc' }, { model: 'asc' }],
    select: equipmentSelect
  })
  return toCsv(
    CSV_HEADER,
    rows
      .map(toEquipmentRow)
      .map((item) => [
        item.category,
        item.make,
        item.model,
        item.serial,
        item.quantity,
        item.status,
        item.roomName,
        item.purchaseDate,
        item.purchasePriceMinor === null
          ? ''
          : minorToMajor(item.purchasePriceMinor).toFixed(2),
        item.supplier,
        item.tags.join(';'),
        item.notes
      ])
  )
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

const normaliseHeader = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

const CATEGORY_ALIASES = new Map<string, EquipmentCategory>([
  ...EQUIPMENT_CATEGORIES.map((key) => [key, key] as const),
  ...EQUIPMENT_CATEGORIES.map(
    (key) =>
      [EQUIPMENT_CATEGORY_LABELS[key].toLowerCase(), key] as [
        string,
        EquipmentCategory
      ]
  ),
  ['mic', 'microphone'],
  ['mics', 'microphone'],
  ['di', 'di_box'],
  ['di box', 'di_box'],
  ['headphone', 'headphones'],
  ['monitors', 'monitor'],
  ['cables', 'cable'],
  ['stands', 'stand'],
  ['amps', 'amp'],
  ['accessories', 'accessory']
])

const STATUS_ALIASES = new Map<string, string>([
  ...EQUIPMENT_STATUSES.map((key) => [key, key] as const),
  ...EQUIPMENT_STATUSES.map(
    (key) => [EQUIPMENT_STATUS_LABELS[key].toLowerCase(), key] as const
  )
])

function parsePrice(raw: string): number | null | 'invalid' {
  const cleaned = raw.replace(/[£$€,\s]/g, '')
  if (cleaned === '') return null
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return 'invalid'
  return majorToMinor(Number(cleaned))
}

export async function importEquipmentCsv(
  ctx: TenantContext,
  text: string
): Promise<{ imported: number }> {
  requirePermission(ctx, Permission.MANAGE_INVENTORY)
  const table = parseCsv(text)
  if (table.length < 2) {
    throw badRequest('The CSV needs a header row and at least one item')
  }
  if (table.length - 1 > MAX_IMPORT_ROWS) {
    throw badRequest(`Import at most ${MAX_IMPORT_ROWS} items at a time`)
  }

  const headers = table[0].map(normaliseHeader)
  for (const required of ['category', 'make', 'model']) {
    if (!headers.includes(required)) {
      throw badRequest(`Missing required column: ${required}`)
    }
  }

  const db = tenantDb(ctx)
  const [rooms, existing] = await Promise.all([
    db.room.findMany({ select: { id: true, name: true } }),
    db.equipmentItem.count()
  ])
  const roomIds = new Map(
    rooms.map((room) => [room.name.toLowerCase(), room.id])
  )

  const errors: ImportRowError[] = []
  const valid: Array<ReturnType<typeof equipmentInputSchema.parse>> = []

  table.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2
    const cell = (name: string) => cells[headers.indexOf(name)]?.trim() ?? ''
    const fail = (message: string) => errors.push({ row: rowNumber, message })

    const category = CATEGORY_ALIASES.get(cell('category').toLowerCase())
    if (!category) return fail(`Unknown category "${cell('category')}"`)

    const statusRaw = cell('status').toLowerCase()
    const status = statusRaw ? STATUS_ALIASES.get(statusRaw) : 'in_service'
    if (!status) return fail(`Unknown status "${cell('status')}"`)

    const roomName = cell('room')
    const roomId = roomName ? roomIds.get(roomName.toLowerCase()) : null
    if (roomName && !roomId) return fail(`Unknown room "${roomName}"`)

    const price = parsePrice(cell('purchase_price'))
    if (price === 'invalid') return fail('Purchase price is not a number')

    const quantityRaw = cell('quantity')
    const quantity = quantityRaw === '' ? 1 : Number(quantityRaw)

    const parsed = equipmentInputSchema.safeParse({
      category,
      make: cell('make'),
      model: cell('model'),
      serial: cell('serial'),
      quantity,
      status,
      roomId: roomId ?? null,
      purchaseDate: cell('purchase_date') || null,
      purchasePriceMinor: price,
      supplier: cell('supplier'),
      tags: cell('tags')
        .split(';')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
      notes: cell('notes')
    })
    if (!parsed.success) {
      return fail(parsed.error.issues.map((issue) => issue.message).join('; '))
    }
    valid.push(parsed.data)
  })

  if (errors.length > 0) {
    throw badRequest('Fix the problems in the CSV and try again', { errors })
  }

  if (!canAdd(ctx.planTier, 'inventoryItems', existing + valid.length - 1)) {
    throw planLimit(
      'inventory items',
      getPlanLimits(ctx.planTier).inventoryItems
    )
  }

  await db.equipmentItem.createMany({
    data: valid.map(({ purchaseDate, customFields, ...rest }) => ({
      ...rest,
      organisationId: ctx.organisationId,
      purchaseDate: toDate(purchaseDate),
      customFields: customFields ?? undefined
    }))
  })
  await recordAudit(ctx, {
    action: 'equipment.import',
    entityType: 'equipment',
    entityId: ctx.organisationId,
    summary: `Imported ${valid.length} equipment items from CSV`,
    metadata: { count: valid.length }
  })
  return { imported: valid.length }
}

// ---------------------------------------------------------------------------
// Insurance / valuation report (Pro and above)
// ---------------------------------------------------------------------------

export interface ValuationLine {
  id: string
  category: EquipmentCategory
  make: string
  model: string
  serial: string | null
  quantity: number
  roomName: string | null
  purchaseDate: string | null
  unitPriceMinor: number | null
  totalMinor: number | null
}

export interface ValuationReport {
  generatedAt: string
  lines: ValuationLine[]
  byCategory: Array<{
    category: EquipmentCategory
    items: number
    totalMinor: number
  }>
  totalMinor: number
  unpricedCount: number
}

// Retired items are excluded: they are no longer insured assets.
export function buildValuation(
  items: EquipmentRow[],
  generatedAt = new Date()
): ValuationReport {
  const lines: ValuationLine[] = items
    .filter((item) => item.status !== 'retired')
    .map((item) => ({
      id: item.id,
      category: item.category,
      make: item.make,
      model: item.model,
      serial: item.serial,
      quantity: item.quantity,
      roomName: item.roomName,
      purchaseDate: item.purchaseDate,
      unitPriceMinor: item.purchasePriceMinor,
      totalMinor:
        item.purchasePriceMinor === null
          ? null
          : item.purchasePriceMinor * item.quantity
    }))

  const totals = new Map<EquipmentCategory, { items: number; total: number }>()
  for (const line of lines) {
    const entry = totals.get(line.category) ?? { items: 0, total: 0 }
    entry.items += line.quantity
    entry.total += line.totalMinor ?? 0
    totals.set(line.category, entry)
  }

  return {
    generatedAt: generatedAt.toISOString(),
    lines,
    byCategory: EQUIPMENT_CATEGORIES.filter((key) => totals.has(key)).map(
      (category) => ({
        category,
        items: totals.get(category)!.items,
        totalMinor: totals.get(category)!.total
      })
    ),
    totalMinor: lines.reduce((sum, line) => sum + (line.totalMinor ?? 0), 0),
    unpricedCount: lines.filter((line) => line.totalMinor === null).length
  }
}

export async function getValuationReport(
  ctx: TenantContext
): Promise<ValuationReport> {
  requirePermission(ctx, Permission.VIEW_INVENTORY)
  requireFeature(ctx, Feature.VALUATION_REPORT)
  const rows = await tenantDb(ctx).equipmentItem.findMany({
    orderBy: [{ category: 'asc' }, { make: 'asc' }, { model: 'asc' }],
    select: equipmentSelect
  })
  return buildValuation(rows.map(toEquipmentRow))
}

export function valuationToCsv(report: ValuationReport): string {
  const money = (minor: number | null) =>
    minor === null ? '' : minorToMajor(minor).toFixed(2)
  return toCsv(
    [
      'category',
      'make',
      'model',
      'serial',
      'quantity',
      'room',
      'purchase_date',
      'unit_price',
      'total'
    ],
    [
      ...report.lines.map((line) => [
        line.category,
        line.make,
        line.model,
        line.serial,
        line.quantity,
        line.roomName,
        line.purchaseDate,
        money(line.unitPriceMinor),
        money(line.totalMinor)
      ]),
      ['TOTAL', '', '', '', '', '', '', '', money(report.totalMinor)]
    ]
  )
}
