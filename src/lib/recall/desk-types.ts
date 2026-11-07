import type { RecallValues } from './types'

// The visual desk a console template describes (ADR 0023). One input strip is
// designed once and repeated for the console's channel count; a free-form
// master area sits to its right. Geometry is in millimetres from the top-left
// of each area.

export const DESK_COMPONENT_KINDS = [
  'knob',
  'fader',
  'switch',
  'selector',
  'label',
  'panel',
  // Legacy: v1 templates had free-text controls. They still render and can be
  // edited, but the library does not offer them.
  'text'
] as const
export type DeskComponentKind = (typeof DESK_COMPONENT_KINDS)[number]

export const LIBRARY_KINDS = [
  'fader',
  'knob',
  'switch',
  'selector',
  'label',
  'panel'
] as const satisfies readonly DeskComponentKind[]
export type LibraryKind = (typeof LIBRARY_KINDS)[number]

// Kinds that hold a recorded value. Labels and panels are only layout.
export const VALUE_KINDS = [
  'knob',
  'fader',
  'switch',
  'selector',
  'text'
] as const satisfies readonly DeskComponentKind[]
export type ValueKind = (typeof VALUE_KINDS)[number]

export const DESK_KIND_LABELS: Readonly<Record<DeskComponentKind, string>> = {
  knob: 'Knob',
  fader: 'Fader',
  switch: 'Switch',
  selector: 'Selector buttons',
  label: 'Label',
  panel: 'Panel',
  text: 'Text'
}

export const DESK_TONES = [
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5'
] as const
export type DeskTone = (typeof DESK_TONES)[number]

export const DESK_AREAS = ['strip', 'master'] as const
export type DeskArea = (typeof DESK_AREAS)[number]

export interface DeskComponent {
  // Stable key the values are stored under. Unique across the whole layout and
  // never changed once values may point at it.
  id: string
  kind: DeskComponentKind
  x: number
  y: number
  w?: number
  h?: number
  label: string
  unit?: string
  min?: number
  max?: number
  step?: number
  // Detent / bipolar centre (pan, EQ gain): the knob arc grows from here.
  centre?: number
  taper?: 'linear' | 'log'
  options?: string[]
  multi?: boolean
  tone?: DeskTone
}

export interface DeskAreaLayout {
  widthMm: number
  components: DeskComponent[]
}

export interface DeskLayout {
  version: 2
  heightMm: number
  strip: DeskAreaLayout
  // widthMm 0 means the desk has no master area.
  master: DeskAreaLayout
}

// Template "home" values: one set applied to every channel strip, and the
// master area's own.
export interface DeskDefaults {
  strip: RecallValues
  master: RecallValues
}

export const DESK_GRID_MM = 5
export const DESK_LIMITS = {
  stripWidthMm: { min: 15, max: 120 },
  masterWidthMm: { min: 0, max: 1500 },
  heightMm: { min: 100, max: 1500 },
  // Value controls per area; labels and panels are counted separately.
  stripControls: 80,
  masterControls: 120,
  decorPerArea: 60,
  options: 24
} as const

// Default footprint of each kind, label included.
export const KIND_SIZE: Readonly<
  Record<DeskComponentKind, { w: number; h: number }>
> = {
  knob: { w: 20, h: 25 },
  fader: { w: 20, h: 110 },
  switch: { w: 15, h: 15 },
  selector: { w: 30, h: 15 },
  label: { w: 30, h: 5 },
  panel: { w: 30, h: 60 },
  text: { w: 20, h: 15 }
}

// Which kinds the editor lets you resize, and along which axes.
export const RESIZABLE: Readonly<
  Partial<Record<DeskComponentKind, { w: boolean; h: boolean }>>
> = {
  fader: { w: false, h: true },
  selector: { w: true, h: true },
  label: { w: true, h: false },
  panel: { w: true, h: true },
  text: { w: true, h: false }
}
