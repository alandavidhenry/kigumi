import type { MicTransducerType } from '@/lib/mics/types'

// Vocabulary for sessions and input lists (PLAN §4.6, ADR 0016).

export const SESSION_STATUSES = [
  'planned',
  'confirmed',
  'completed',
  'cancelled'
] as const
export type SessionStatus = (typeof SESSION_STATUSES)[number]

export const SESSION_STATUS_LABELS: Readonly<Record<SessionStatus, string>> = {
  planned: 'Planned',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled'
}

export const CHANNEL_KINDS = ['mic', 'di', 'line'] as const
export type ChannelKind = (typeof CHANNEL_KINDS)[number]

export const MAX_CHANNELS = 128

// What the input-list logic needs to know about a locker unit. Built from the
// locker snapshot; kept small so the pure functions stay easy to test.
export interface UnitInfo {
  unitId: string
  name: string
  transducerType: MicTransducerType
  powering: 'none' | 'phantom' | 'battery' | 'psu'
  phantomSafe: boolean | null
  equipmentStatus: string
}

export interface ChannelRow {
  id: string
  number: number
  layoutItemId: string | null
  kind: ChannelKind
  source: string
  micUnitId: string | null
  stand: string | null
  preampInput: string | null
  phantom: boolean
  padDb: number | null
  dawName: string | null
  notes: string | null
}

// The part of a layout item the input list mirrors.
export interface ChannelItemRef {
  id: string
  type: string
  label: string | null
  micUnitId: string | null
}
