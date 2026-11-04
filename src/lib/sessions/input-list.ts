import { phantomWarning } from '@/lib/mics/format'

import type { ChannelItemRef, ChannelKind, ChannelRow, UnitInfo } from './types'

// The input list stays in step with the layout (ADR 0016 decision 3). A mic or
// DI item always has exactly one linked channel. This module is the pure part:
// given the items and channels it says what to create, update and delete. The
// service runs it in the same transaction as every layout write, and because
// it is idempotent any drift heals on the next save.

export interface ChannelCreate {
  layoutItemId: string
  number: number
  kind: ChannelKind
  source: string
  micUnitId: string | null
  phantom: boolean
}

export interface ChannelMirrorUpdate {
  id: string
  kind: ChannelKind
  source: string
  micUnitId: string | null
  // Present only when the unit changed, so a new unit can't inherit a
  // phantom setting that was right for the old one.
  phantom?: boolean
}

export interface ReconcileOps {
  create: ChannelCreate[]
  update: ChannelMirrorUpdate[]
  remove: string[]
}

export function channelKindFor(type: string): ChannelKind {
  return type === 'di' ? 'di' : 'mic'
}

// Phantom is off unless the mic is built to take it. A passive ribbon is never
// switched on by default, whatever the catalogue says about its powering.
export function defaultPhantom(unit: UnitInfo | null | undefined): boolean {
  if (!unit) return false
  if (phantomWarning(unit)) return false
  return unit.powering === 'phantom'
}

export function sourceFor(
  item: ChannelItemRef,
  unit: UnitInfo | null | undefined
): string {
  return item.label?.trim() || unit?.name || (item.type === 'di' ? 'DI' : 'Mic')
}

// Lowest channel number not in use, so a gap left by a removed mic is reused.
export function nextChannelNumber(used: Iterable<number>): number {
  const taken = new Set(used)
  let n = 1
  while (taken.has(n)) n++
  return n
}

export function reconcileInputList(
  items: readonly ChannelItemRef[],
  channels: readonly ChannelRow[],
  units: ReadonlyMap<string, UnitInfo>
): ReconcileOps {
  const ops: ReconcileOps = { create: [], update: [], remove: [] }
  const channelItems = items.filter((i) => i.type === 'mic' || i.type === 'di')
  const itemIds = new Set(channelItems.map((i) => i.id))
  const byItem = new Map<string, ChannelRow>()
  const used = new Set<number>()

  for (const channel of channels) {
    // Linked to something that is no longer a channel item: it goes. A channel
    // with no layout item at all is manual and is never touched.
    if (channel.layoutItemId && !itemIds.has(channel.layoutItemId)) {
      ops.remove.push(channel.id)
      continue
    }
    used.add(channel.number)
    if (channel.layoutItemId) byItem.set(channel.layoutItemId, channel)
  }

  for (const item of channelItems) {
    const unit = item.micUnitId ? units.get(item.micUnitId) : undefined
    const kind = channelKindFor(item.type)
    const source = sourceFor(item, unit)
    const existing = byItem.get(item.id)

    if (!existing) {
      const number = nextChannelNumber(used)
      used.add(number)
      ops.create.push({
        layoutItemId: item.id,
        number,
        kind,
        source,
        micUnitId: item.micUnitId,
        phantom: defaultPhantom(unit)
      })
      continue
    }

    const unitChanged = existing.micUnitId !== item.micUnitId
    if (unitChanged || existing.kind !== kind || existing.source !== source) {
      ops.update.push({
        id: existing.id,
        kind,
        source,
        micUnitId: item.micUnitId,
        ...(unitChanged ? { phantom: defaultPhantom(unit) } : {})
      })
    }
  }
  return ops
}
