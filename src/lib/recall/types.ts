// Vocabulary for console definitions and recall sheets (PLAN §4.7, ADR 0017).

export const CONTROL_TYPES = ['knob', 'switch', 'select', 'text'] as const
export type ControlType = (typeof CONTROL_TYPES)[number]

export const CONTROL_TYPE_LABELS: Readonly<Record<ControlType, string>> = {
  knob: 'Knob or fader (a number)',
  switch: 'Switch (on or off)',
  select: 'Selector (pick one)',
  text: 'Text'
}

export interface ControlDef {
  // Stable key the recall values are stored under; unique across the strip.
  key: string
  label: string
  type: ControlType
  unit?: string
  min?: number
  max?: number
  options?: string[]
  // Derived from a visual desk (ADR 0023); a v1 strip never sets these.
  multi?: boolean
  centre?: number
  step?: number
  taper?: 'linear' | 'log'
}

export interface StripSection {
  label: string
  controls: ControlDef[]
}

export interface StripDefinition {
  sections: StripSection[]
}

// A multi-select selector (routing 1-2 / 3-4 / L-R) records its lit buttons.
export type RecallValue = string | number | boolean | string[]
export type RecallValues = Record<string, RecallValue>

export interface OutboardSetting {
  label: string
  value: string
}

// Keys the input list can pre-fill. A template without them simply isn't
// pre-filled for that control (ADR 0017 decision 4).
export const PREFILL_KEYS = {
  phantom: 'phantom',
  pad: 'pad',
  input: 'input'
} as const

export const MAX_STRIP_CONTROLS = 80
export const MAX_STRIP_SECTIONS = 12
export const MAX_OUTBOARD_SETTINGS = 40
export const MAX_OUTBOARD_UNITS = 60
export const MAX_CONSOLE_CHANNELS = 128
export const MAX_RECALL_PHOTOS = 12
