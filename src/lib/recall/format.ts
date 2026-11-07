import { formatValue } from './desk-geometry'

import type {
  ControlDef,
  RecallValue,
  RecallValues,
  StripDefinition
} from './types'

// Turns recorded values into the short text a printed recall sheet shows.
// Only what was written down is printed: a blank control means "not recorded",
// never a default.

export function formatControlValue(
  control: ControlDef,
  value: RecallValue
): string {
  if (control.type === 'switch') return value ? 'on' : 'off'
  return formatValue(control, value)
}

export interface RecallLine {
  section: string
  text: string
}

// One line per section that has at least one recorded value, e.g.
// { section: 'Input', text: '48V on · Gain 32 dB' }.
export function recallLines(
  strip: StripDefinition,
  values: RecallValues
): RecallLine[] {
  const lines: RecallLine[] = []
  for (const section of strip.sections) {
    const parts: string[] = []
    for (const control of section.controls) {
      const value = values[control.key]
      if (value === undefined || value === '') continue
      // A switch reads as its label when on ("48V") so lines stay short.
      parts.push(
        control.type === 'switch'
          ? `${control.label} ${value ? 'on' : 'off'}`
          : `${control.label} ${formatControlValue(control, value)}`
      )
    }
    if (parts.length > 0) {
      lines.push({ section: section.label, text: parts.join(' · ') })
    }
  }
  return lines
}
