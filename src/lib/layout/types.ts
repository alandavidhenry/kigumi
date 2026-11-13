import type { MicPolarPattern } from '@/lib/mics/types'

// Vocabulary and document shapes for layouts (PLAN §4.5, ADR 0016). All
// lengths are millimetres, angles degrees. The origin is the room's top-left
// corner in plan view: x runs along the room width, y along its length, and
// plan-up (-y) is the front wall. z is height above the floor.

export const LAYOUT_ITEM_TYPES = [
  'mic',
  'stand',
  'instrument',
  'amp',
  'drum_kit',
  'vocalist',
  'di',
  'monitor',
  'headphone_amp',
  'gobo',
  'booth',
  'furniture',
  'other'
] as const
export type LayoutItemType = (typeof LAYOUT_ITEM_TYPES)[number]

export const LAYOUT_ITEM_LABELS: Readonly<Record<LayoutItemType, string>> = {
  mic: 'Microphone',
  stand: 'Stand',
  instrument: 'Instrument',
  amp: 'Amp',
  drum_kit: 'Drum kit',
  vocalist: 'Vocalist',
  di: 'DI box',
  monitor: 'Monitor',
  headphone_amp: 'Headphone amp',
  gobo: 'Gobo',
  booth: 'Booth',
  furniture: 'Furniture',
  other: 'Other'
}

export interface ItemDefaults {
  widthMm: number
  depthMm: number
  heightMm: number | null
  zMm: number
}

// Drawing defaults only, editable per item. They are not spec claims.
export const ITEM_TYPE_DEFAULTS: Readonly<
  Record<LayoutItemType, ItemDefaults>
> = {
  mic: { widthMm: 100, depthMm: 100, heightMm: 200, zMm: 1500 },
  stand: { widthMm: 300, depthMm: 300, heightMm: 1500, zMm: 0 },
  instrument: { widthMm: 600, depthMm: 600, heightMm: 1000, zMm: 0 },
  amp: { widthMm: 600, depthMm: 300, heightMm: 600, zMm: 0 },
  drum_kit: { widthMm: 1800, depthMm: 1600, heightMm: 1000, zMm: 0 },
  vocalist: { widthMm: 500, depthMm: 350, heightMm: 1700, zMm: 0 },
  di: { widthMm: 150, depthMm: 100, heightMm: 50, zMm: 0 },
  monitor: { widthMm: 400, depthMm: 300, heightMm: 300, zMm: 1000 },
  headphone_amp: { widthMm: 250, depthMm: 150, heightMm: 80, zMm: 0 },
  gobo: { widthMm: 1200, depthMm: 100, heightMm: 1800, zMm: 0 },
  booth: { widthMm: 2000, depthMm: 2000, heightMm: 2200, zMm: 0 },
  furniture: { widthMm: 1000, depthMm: 500, heightMm: 750, zMm: 0 },
  other: { widthMm: 500, depthMm: 500, heightMm: null, zMm: 0 }
}

export const MAX_LAYOUT_ITEMS = 300
export const MIN_ITEM_SIZE_MM = 10
export const MAX_ITEM_SIZE_MM = 20_000
export const GRID_CHOICES_MM = [100, 250, 500, 1000] as const
export const SNAP_CHOICES_MM = [0, 10, 50, 100, 250] as const
export const ROTATION_SNAP_DEG = 15

// Items that get an input-list channel (ADR 0016 decision 3).
export function isChannelItem(type: string): boolean {
  return type === 'mic' || type === 'di'
}

// One item as the editor, the save payload and the database all see it.
// `id` is the database id for stored items; the editor gives new items a
// client-side id that the server replaces.
export interface LayoutItemDoc {
  id: string
  type: LayoutItemType
  variant: string | null
  label: string | null
  xMm: number
  yMm: number
  zMm: number
  rotationDeg: number
  pitchDeg: number
  widthMm: number
  depthMm: number
  heightMm: number | null
  sortOrder: number
  locked: boolean
  groupId: string | null
  micUnitId: string | null
  equipmentItemId: string | null
  patternSetting: MicPolarPattern | null
  showPattern: boolean
  recommendationRef: string | null
  notes: string | null
}

export interface LayoutDoc {
  id: string
  name: string
  widthMm: number
  lengthMm: number
  heightMm: number | null
  gridMm: number
  snapMm: number
  version: number
  items: LayoutItemDoc[]
}
