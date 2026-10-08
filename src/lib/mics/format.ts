import { formatHz } from '@/lib/charts/frequency'

import {
  MIC_PATTERN_LABELS,
  MIC_POWERING_LABELS,
  MIC_SPEC_FIELDS,
  MIC_SPEC_LABELS,
  MIC_TRANSDUCER_LABELS
} from './types'

import type { MicDetail } from './catalogue'
import type { MicSpecField } from './types'

// Display formatting for the spec table. Values are shown exactly as stored,
// with their stated conditions; nothing is derived except unit conversions
// that are pure arithmetic.

export const NOT_RECORDED = 'Not yet recorded'

// mV/Pa -> dBV/Pa (re 1 V/Pa).
export function mvPaToDbvPa(mvPa: number): number {
  return 20 * Math.log10(mvPa / 1000)
}

const trim = (value: number) => String(Math.round(value * 100) / 100)

export interface SpecRow {
  field: MicSpecField
  label: string
  value: string
  conditions: string | null
  recorded: boolean
}

function valueFor(mic: MicDetail, field: MicSpecField): string | null {
  switch (field) {
    case 'transducerType':
      return MIC_TRANSDUCER_LABELS[mic.transducerType]
    case 'polarPatterns':
      return mic.polarPatterns.map((p) => MIC_PATTERN_LABELS[p]).join(', ')
    case 'freqRangeMinHz':
      return mic.freqRangeMinHz === null
        ? null
        : `${formatHz(mic.freqRangeMinHz)} Hz`
    case 'freqRangeMaxHz':
      return mic.freqRangeMaxHz === null
        ? null
        : `${formatHz(mic.freqRangeMaxHz)} Hz`
    case 'sensitivityMvPa':
      return mic.sensitivityMvPa === null
        ? null
        : `${trim(mic.sensitivityMvPa)} mV/Pa (${trim(mvPaToDbvPa(mic.sensitivityMvPa))} dBV/Pa)`
    case 'selfNoiseDbA':
      return mic.selfNoiseDbA === null ? null : `${trim(mic.selfNoiseDbA)} dB-A`
    case 'maxSplDb':
      return mic.maxSplDb === null ? null : `${trim(mic.maxSplDb)} dB SPL`
    case 'impedanceOhm':
      return mic.impedanceOhm === null ? null : `${trim(mic.impedanceOhm)} Ω`
    case 'powering':
      return MIC_POWERING_LABELS[mic.powering]
    case 'phantomSafe':
      return mic.phantomSafe === null ? null : mic.phantomSafe ? 'Yes' : 'No'
    case 'pads':
      return mic.pads.length > 0
        ? mic.pads.map((db) => `−${db} dB`).join(', ')
        : null
    case 'filters':
      return mic.filters.length > 0 ? mic.filters.join(', ') : null
    case 'weightG':
      return mic.weightG === null ? null : `${trim(mic.weightG)} g`
    case 'dimensions':
      return mic.dimensions
    case 'connector':
      return mic.connector
    case 'discontinued':
      return mic.discontinued ? 'Yes' : null
    case 'statedApplications':
      return mic.statedApplications.length > 0
        ? mic.statedApplications.join(', ')
        : null
  }
}

// Fields always listed even when empty, so gaps are visible rather than
// silently missing. Everything else is hidden when not recorded.
const ALWAYS_SHOWN: readonly MicSpecField[] = [
  'freqRangeMinHz',
  'freqRangeMaxHz',
  'sensitivityMvPa',
  'selfNoiseDbA',
  'maxSplDb',
  'impedanceOhm'
]

export function specRows(mic: MicDetail): SpecRow[] {
  const rows: SpecRow[] = []
  for (const field of MIC_SPEC_FIELDS) {
    const value = valueFor(mic, field)
    if (value === null && !ALWAYS_SHOWN.includes(field)) continue
    rows.push({
      field,
      label: MIC_SPEC_LABELS[field],
      value: value ?? NOT_RECORDED,
      conditions: mic.specConditions[field] ?? null,
      recorded: value !== null
    })
  }
  return rows
}

// Ribbons are the phantom-power hazard: unless the spec sheet says it is
// safe, warn.
export function phantomWarning(
  mic: Pick<MicDetail, 'transducerType' | 'phantomSafe'>
): string | null {
  if (mic.transducerType !== 'ribbon' || mic.phantomSafe === true) return null
  return mic.phantomSafe === false
    ? 'Passive ribbon: phantom power can damage this microphone. Switch phantom off before connecting.'
    : 'Ribbon microphone: phantom-power tolerance is not recorded. Treat it as unsafe and switch phantom off unless the manufacturer says otherwise.'
}
