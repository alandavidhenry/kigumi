import type { Prisma } from '@/generated/prisma/client'
import type { LayoutDoc, LayoutItemDoc } from '@/lib/layout/types'
import type { MicPolarPattern, MicTransducerType } from '@/lib/mics/types'
import { micName } from '@/lib/recommendations/names'
import type { TenantDb } from '@/lib/tenant-db'

import type { ChannelKind, ChannelRow, UnitInfo } from './types'
import type { OverlappingBooking } from './warnings'

// Shared reads for layouts and sessions. Everything takes a tenant-scoped
// client (or the transaction client derived from one), so nothing here can
// reach another organisation's rows.

export type Db = Omit<
  TenantDb,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>

export const itemSelect = {
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
} satisfies Prisma.LayoutItemSelect

export const layoutSelect = {
  id: true,
  name: true,
  widthMm: true,
  lengthMm: true,
  heightMm: true,
  gridMm: true,
  snapMm: true,
  version: true,
  items: {
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: itemSelect
  }
} satisfies Prisma.LayoutSelect

export const channelSelect = {
  id: true,
  number: true,
  layoutItemId: true,
  kind: true,
  source: true,
  micUnitId: true,
  stand: true,
  preampInput: true,
  phantom: true,
  padDb: true,
  dawName: true,
  notes: true
} satisfies Prisma.InputChannelSelect

interface RawItem extends Omit<LayoutItemDoc, 'type' | 'patternSetting'> {
  type: string
  patternSetting: string | null
}

interface RawLayout extends Omit<LayoutDoc, 'items'> {
  items: RawItem[]
}

export function toLayoutDoc(row: RawLayout): LayoutDoc {
  return {
    id: row.id,
    name: row.name,
    widthMm: row.widthMm,
    lengthMm: row.lengthMm,
    heightMm: row.heightMm,
    gridMm: row.gridMm,
    snapMm: row.snapMm,
    version: row.version,
    items: row.items.map((item) => ({
      ...item,
      type: item.type as LayoutItemDoc['type'],
      patternSetting: item.patternSetting as MicPolarPattern | null
    }))
  }
}

interface RawChannel extends Omit<ChannelRow, 'kind'> {
  kind: string
}

export function toChannelRow(row: RawChannel): ChannelRow {
  return { ...row, kind: row.kind as ChannelKind }
}

export async function loadUnitInfos(
  db: Db,
  unitIds: Iterable<string | null | undefined>
): Promise<Map<string, UnitInfo>> {
  const ids = [...new Set([...unitIds].filter((id): id is string => !!id))]
  const map = new Map<string, UnitInfo>()
  if (ids.length === 0) return map
  const rows = await db.microphoneUnit.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      equipmentItem: { select: { status: true } },
      micModel: {
        select: {
          manufacturer: true,
          model: true,
          transducerType: true,
          powering: true,
          phantomSafe: true
        }
      }
    }
  })
  for (const row of rows) {
    map.set(row.id, {
      unitId: row.id,
      name: micName(row.micModel),
      transducerType: row.micModel.transducerType as MicTransducerType,
      powering: row.micModel.powering as UnitInfo['powering'],
      phantomSafe: row.micModel.phantomSafe,
      equipmentStatus: row.equipmentItem.status
    })
  }
  return map
}

// Units used in other, non-cancelled sessions that overlap the window.
export async function loadBookings(
  db: Db,
  window: { start: Date; end: Date },
  excludeSessionId?: string
): Promise<Map<string, OverlappingBooking[]>> {
  const rows = await db.inputChannel.findMany({
    where: {
      micUnitId: { not: null },
      session: {
        status: { not: 'cancelled' },
        startsAt: { lt: window.end },
        endsAt: { gt: window.start },
        ...(excludeSessionId && { id: { not: excludeSessionId } })
      }
    },
    select: {
      micUnitId: true,
      session: { select: { id: true, name: true } }
    }
  })
  const map = new Map<string, OverlappingBooking[]>()
  for (const row of rows) {
    if (!row.micUnitId) continue
    const list = map.get(row.micUnitId) ?? []
    if (!list.some((b) => b.sessionId === row.session.id)) {
      list.push({ sessionId: row.session.id, name: row.session.name })
    }
    map.set(row.micUnitId, list)
  }
  return map
}
