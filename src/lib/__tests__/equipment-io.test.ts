import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { EquipmentRow } from '@/lib/equipment'
import {
  buildValuation,
  exportEquipmentCsv,
  getValuationReport,
  importEquipmentCsv,
  valuationToCsv
} from '@/lib/equipment-io'
import { AppError } from '@/lib/errors'
import { PlanTier } from '@/lib/plans'
import { tenantDb } from '@/lib/tenant-db'
import { makeContext, makeFakeDb, type FakeDb } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

vi.mock('@/lib/tenant-db', () => ({ tenantDb: vi.fn() }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/lib/tenant-context', async () => {
  const { forbidden, featureNotInPlan } = await import('@/lib/errors')
  const { hasPermission } = await import('@/types/rbac')
  const { hasFeature } = await import('@/lib/plans')
  return {
    requirePermission: (ctx: { role: MemberRole }, permission: never) => {
      if (!hasPermission(ctx.role, permission)) throw forbidden()
    },
    requireFeature: (ctx: { planTier: PlanTier }, feature: never) => {
      if (!hasFeature(ctx.planTier, feature)) throw featureNotInPlan('x', 'Pro')
    }
  }
})

let db: FakeDb
const owner = makeContext()
const viewer = makeContext({ role: MemberRole.VIEWER })
const freeOwner = makeContext({ planTier: PlanTier.FREE })

async function thrown(promise: Promise<unknown>) {
  const error = await promise.catch((caught) => caught)
  expect(error).toBeInstanceOf(AppError)
  return error as AppError
}

beforeEach(() => {
  vi.clearAllMocks()
  db = makeFakeDb()
  vi.mocked(tenantDb).mockReturnValue(db as never)
  db.room.findMany.mockResolvedValue([{ id: 'r1', name: 'Live Room' }])
  db.equipmentItem.count.mockResolvedValue(0)
})

const HEADER =
  'category,make,model,serial,quantity,status,room,purchase_price,tags'

describe('importEquipmentCsv', () => {
  it('imports valid rows, resolving rooms, aliases and prices', async () => {
    const csv = [
      HEADER,
      'Mic,Neumann,U 87,123,,In service,live room,"£2,500.00",vocal;tube',
      'cables,Mogami,2534,,20,,,1.50,'
    ].join('\n')
    expect(await importEquipmentCsv(owner, csv)).toEqual({ imported: 2 })

    const { data } = db.equipmentItem.createMany.mock.calls[0][0]
    expect(data[0]).toMatchObject({
      organisationId: 'org_1',
      category: 'microphone',
      roomId: 'r1',
      status: 'in_service',
      purchasePriceMinor: 250000,
      tags: ['vocal', 'tube'],
      quantity: 1
    })
    expect(data[1]).toMatchObject({
      category: 'cable',
      quantity: 20,
      purchasePriceMinor: 150
    })
  })

  it('imports nothing and reports every bad row', async () => {
    const csv = [
      HEADER,
      'toaster,A,B,,,,,,',
      'mic,C,D,,,,Nowhere,,',
      'mic,,E,,,,,,',
      'mic,F,G,,,,,abc,',
      'mic,Fine,Row,,,,,,'
    ].join('\n')
    const error = await thrown(importEquipmentCsv(owner, csv))
    expect(error.code).toBe('BAD_REQUEST')
    const rows = (error.details as { errors: { row: number }[] }).errors
    expect(rows.map((entry) => entry.row)).toEqual([2, 3, 4, 5])
    expect(db.equipmentItem.createMany).not.toHaveBeenCalled()
  })

  it('requires the category, make and model columns', async () => {
    const error = await thrown(importEquipmentCsv(owner, 'make,model\nA,B'))
    expect(error.message).toMatch(/category/)
  })

  it('needs at least one data row', async () => {
    await thrown(importEquipmentCsv(owner, HEADER))
  })

  it('stops at the plan limit', async () => {
    db.equipmentItem.count.mockResolvedValue(249)
    const error = await thrown(
      importEquipmentCsv(freeOwner, `${HEADER}\nmic,A,B,,,,,,\nmic,C,D,,,,,,`)
    )
    expect(error.code).toBe('PLAN_LIMIT')
    expect(db.equipmentItem.createMany).not.toHaveBeenCalled()
  })

  it('forbids viewers', async () => {
    const error = await thrown(
      importEquipmentCsv(viewer, `${HEADER}\nmic,A,B,,,,,,`)
    )
    expect(error.code).toBe('FORBIDDEN')
  })
})

describe('exportEquipmentCsv', () => {
  it('writes a header and a row per item, neutralising formulas', async () => {
    db.equipmentItem.findMany.mockResolvedValue([
      {
        id: 'e1',
        category: 'microphone',
        make: '=cmd',
        model: 'U 87',
        serial: null,
        quantity: 1,
        status: 'in_service',
        roomId: 'r1',
        purchaseDate: new Date('2024-03-12T00:00:00Z'),
        purchasePriceMinor: 250000,
        supplier: null,
        tags: ['a', 'b'],
        customFields: null,
        notes: null,
        room: { name: 'Live Room' }
      }
    ])
    const csv = await exportEquipmentCsv(viewer)
    const [header, row] = csv.trim().split('\r\n')
    expect(header).toBe(
      'category,make,model,serial,quantity,status,room,purchase_date,purchase_price,supplier,tags,notes'
    )
    expect(row).toBe(
      "microphone,'=cmd,U 87,,1,in_service,Live Room,2024-03-12,2500.00,,a;b,"
    )
  })
})

describe('valuation', () => {
  const item = (overrides: Partial<EquipmentRow>): EquipmentRow => ({
    id: 'e',
    category: 'microphone',
    make: 'M',
    model: 'X',
    serial: null,
    quantity: 1,
    status: 'in_service',
    roomId: null,
    roomName: null,
    purchaseDate: null,
    purchasePriceMinor: 10000,
    supplier: null,
    tags: [],
    customFields: null,
    notes: null,
    ...overrides
  })

  it('totals quantity x price, excludes retired and counts unpriced', () => {
    const report = buildValuation([
      item({ id: 'a', quantity: 2, purchasePriceMinor: 5000 }),
      item({
        id: 'b',
        category: 'cable',
        purchasePriceMinor: 300,
        quantity: 10
      }),
      item({ id: 'c', purchasePriceMinor: null }),
      item({ id: 'd', status: 'retired' })
    ])
    expect(report.lines.map((line) => line.id)).toEqual(['a', 'b', 'c'])
    expect(report.totalMinor).toBe(13000)
    expect(report.unpricedCount).toBe(1)
    expect(report.byCategory).toEqual([
      { category: 'microphone', items: 3, totalMinor: 10000 },
      { category: 'cable', items: 10, totalMinor: 3000 }
    ])
  })

  it('renders CSV with a total row', () => {
    const csv = valuationToCsv(buildValuation([item({ id: 'a' })]))
    expect(csv.trim().split('\r\n').at(-1)).toBe('TOTAL,,,,,,,,100.00')
  })

  it('is gated to the Pro plan and above', async () => {
    db.equipmentItem.findMany.mockResolvedValue([])
    const error = await thrown(getValuationReport(freeOwner))
    expect(error.code).toBe('FEATURE_NOT_IN_PLAN')
    await expect(
      getValuationReport(makeContext({ planTier: PlanTier.PRO }))
    ).resolves.toMatchObject({ totalMinor: 0 })
  })
})
