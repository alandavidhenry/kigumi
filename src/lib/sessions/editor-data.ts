import type { MicPolarPattern, MicTransducerType } from '@/lib/mics/types'
import { micName } from '@/lib/recommendations/names'
import { requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { tenantDb } from '@/lib/tenant-db'
import { Permission } from '@/types/rbac'

// The locker as the layout editor and the input list need it: a name to pick,
// the patterns the mic can be set to, and whether it is in service. Names carry
// a suffix when a unit is out of service so it can still be chosen, but not by
// accident.
export interface EditorUnit {
  id: string
  name: string
  transducerType: MicTransducerType
  patterns: MicPolarPattern[]
  inService: boolean
}

export async function listEditorUnits(
  ctx: TenantContext
): Promise<EditorUnit[]> {
  requirePermission(ctx, Permission.VIEW_SESSIONS)
  const rows = await tenantDb(ctx).microphoneUnit.findMany({
    select: {
      id: true,
      serial: true,
      equipmentItem: { select: { status: true } },
      micModel: {
        select: {
          manufacturer: true,
          model: true,
          transducerType: true,
          polarPatterns: true
        }
      }
    }
  })
  const units = rows.map((row) => {
    const inService = row.equipmentItem.status === 'in_service'
    return {
      id: row.id,
      base: micName(row.micModel),
      serial: row.serial,
      transducerType: row.micModel.transducerType as MicTransducerType,
      patterns: row.micModel.polarPatterns as MicPolarPattern[],
      inService
    }
  })
  // Two units of one model need telling apart: use the serial, else a number.
  const seen = new Map<string, number>()
  const totals = new Map<string, number>()
  for (const u of units) totals.set(u.base, (totals.get(u.base) ?? 0) + 1)
  return units
    .map((u) => {
      let name = u.base
      if ((totals.get(u.base) ?? 0) > 1) {
        const n = (seen.get(u.base) ?? 0) + 1
        seen.set(u.base, n)
        name += u.serial ? ` (S/N ${u.serial})` : ` #${n}`
      }
      if (!u.inService) name += ' — not in service'
      return {
        id: u.id,
        name,
        transducerType: u.transducerType,
        patterns: u.patterns,
        inService: u.inService
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
