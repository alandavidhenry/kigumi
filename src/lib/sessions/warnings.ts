import { phantomWarning } from '@/lib/mics/format'

import type { ChannelRow, UnitInfo } from './types'

// Session-level warnings (PLAN §4.6, ADR 0016 decision 4). Pure: the service
// gathers the channels, units and bookings and this decides what to say. The
// text comes from the rules and the catalogue, never a model.

export const SESSION_WARNING_CODES = [
  'ribbon_phantom',
  'phantom_off',
  'global_phantom_conflict',
  'unit_twice',
  'too_many_inputs',
  'double_booked',
  'unit_unavailable',
  'mic_no_unit',
  'outside_room'
] as const
export type SessionWarningCode = (typeof SESSION_WARNING_CODES)[number]

export interface SessionWarning {
  code: SessionWarningCode
  severity: 'warning' | 'blocking'
  text: string
  channelIds: string[]
}

export interface OverlappingBooking {
  sessionId: string
  name: string
}

export interface WarningInput {
  phantomMode: 'per_channel' | 'global'
  channelsAvailable: number | null
  channels: readonly Pick<
    ChannelRow,
    'id' | 'number' | 'kind' | 'source' | 'micUnitId' | 'phantom'
  >[]
  units: ReadonlyMap<string, UnitInfo>
  // Mic items on the layout with no unit chosen, and items outside the room.
  micItemsWithoutUnit: readonly { channelId: string | null; label: string }[]
  itemsOutsideRoom: readonly { label: string }[]
  // Other, non-cancelled sessions that overlap this one, by unit.
  bookings: ReadonlyMap<string, readonly OverlappingBooking[]>
}

const ch = (c: { number: number; source: string }) =>
  `channel ${c.number} (${c.source})`

export function sessionWarnings(input: WarningInput): SessionWarning[] {
  const out: SessionWarning[] = []
  const micChannels = input.channels.filter((c) => c.kind !== 'line')

  // Phantom on a passive ribbon.
  for (const c of micChannels) {
    const unit = c.micUnitId ? input.units.get(c.micUnitId) : undefined
    if (!unit || !c.phantom) continue
    const hazard = phantomWarning(unit)
    if (hazard) {
      out.push({
        code: 'ribbon_phantom',
        severity: 'blocking',
        text: `${unit.name} on ${ch(c)} has phantom power on. ${hazard}`,
        channelIds: [c.id]
      })
    }
  }

  // Phantom needed but off.
  for (const c of micChannels) {
    const unit = c.micUnitId ? input.units.get(c.micUnitId) : undefined
    if (unit?.powering === 'phantom' && !c.phantom) {
      out.push({
        code: 'phantom_off',
        severity: 'warning',
        text: `${unit.name} on ${ch(c)} needs phantom power but it is off.`,
        channelIds: [c.id]
      })
    }
  }

  // Global phantom: one switch for every channel, so a ribbon in the same
  // session as a phantom-powered mic can't be kept safe.
  if (input.phantomMode === 'global') {
    const needs = micChannels.filter((c) => {
      const unit = c.micUnitId ? input.units.get(c.micUnitId) : undefined
      return unit?.powering === 'phantom'
    })
    const ribbons = micChannels.filter((c) => {
      const unit = c.micUnitId ? input.units.get(c.micUnitId) : undefined
      return unit ? phantomWarning(unit) !== null : false
    })
    if (needs.length > 0 && ribbons.length > 0) {
      out.push({
        code: 'global_phantom_conflict',
        severity: 'blocking',
        text: 'The desk has one phantom switch for every channel, but this session has both phantom-powered mics and a ribbon that phantom can damage. Use per-channel phantom or a different mic.',
        channelIds: [...needs, ...ribbons].map((c) => c.id)
      })
    }
  }

  // One physical unit on two channels.
  const byUnit = new Map<string, typeof micChannels>()
  for (const c of micChannels) {
    if (!c.micUnitId) continue
    byUnit.set(c.micUnitId, [...(byUnit.get(c.micUnitId) ?? []), c])
  }
  for (const [unitId, list] of byUnit) {
    if (list.length < 2) continue
    const name = input.units.get(unitId)?.name ?? 'A microphone'
    out.push({
      code: 'unit_twice',
      severity: 'blocking',
      text: `${name} is used on ${list.length} channels (${list.map((c) => c.number).join(', ')}). One microphone can only be in one place.`,
      channelIds: list.map((c) => c.id)
    })
  }

  // More inputs than the desk or interface has.
  if (
    input.channelsAvailable !== null &&
    input.channels.length > input.channelsAvailable
  ) {
    out.push({
      code: 'too_many_inputs',
      severity: 'warning',
      text: `This session has ${input.channels.length} inputs but only ${input.channelsAvailable} channels are available.`,
      channelIds: []
    })
  }

  // Double-booked and out-of-service units.
  for (const c of micChannels) {
    if (!c.micUnitId) continue
    const unit = input.units.get(c.micUnitId)
    const booked = input.bookings.get(c.micUnitId) ?? []
    if (booked.length > 0) {
      out.push({
        code: 'double_booked',
        severity: 'blocking',
        text: `${unit?.name ?? 'A microphone'} on ${ch(c)} is also in ${booked.map((b) => b.name).join(', ')} at the same time.`,
        channelIds: [c.id]
      })
    }
    if (unit && unit.equipmentStatus !== 'in_service') {
      out.push({
        code: 'unit_unavailable',
        severity: 'warning',
        text: `${unit.name} on ${ch(c)} is marked ${unit.equipmentStatus.replace('_', ' ')}, not in service.`,
        channelIds: [c.id]
      })
    }
  }

  for (const item of input.micItemsWithoutUnit) {
    out.push({
      code: 'mic_no_unit',
      severity: 'warning',
      text: `${item.label} is on the layout but no microphone from your locker is chosen.`,
      channelIds: item.channelId ? [item.channelId] : []
    })
  }
  for (const item of input.itemsOutsideRoom) {
    out.push({
      code: 'outside_room',
      severity: 'warning',
      text: `${item.label} is outside the room outline.`,
      channelIds: []
    })
  }
  return out
}
