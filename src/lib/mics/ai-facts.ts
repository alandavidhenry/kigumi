import { mvPaToDbvPa } from './format'
import {
  MIC_PATTERN_LABELS,
  MIC_POWERING_LABELS,
  MIC_TRANSDUCER_LABELS
} from './types'

import type { MicDetail } from './catalogue'

// The only data the AI ever sees about a microphone (PLAN §4.3: numeric specs
// come only from the database). Built from the catalogue row, never from
// tenant data, so the generated text is safe to cache and share across
// organisations. `null` means the catalogue has no recorded value.
export interface MicFacts {
  slug: string
  name: string
  transducerType: string
  polarPatterns: string[]
  frequencyRangeMinHz: number | null
  frequencyRangeMaxHz: number | null
  sensitivityMvPa: number | null
  sensitivityDbvPa: number | null
  selfNoiseDbA: number | null
  maxSplDb: number | null
  impedanceOhm: number | null
  powering: string
  // true / false when the catalogue states it; null when it does not.
  phantomSafe: boolean | null
  padsDb: number[]
  filters: string[]
  weightG: number | null
  dimensions: string | null
  connector: string | null
  discontinued: boolean
  statedApplications: string[]
  // Conditions printed beside a figure, e.g. { maxSplDb: '@ 1% THD' }.
  specConditions: Record<string, string>
}

const round2 = (value: number) => Math.round(value * 100) / 100

// The catalogue fields facts are built from. A MicDetail satisfies it, and so
// does the locker snapshot's copy of a model (recommendations), so both paths
// show the model exactly the same record.
export type MicFactsSource = Pick<
  MicDetail,
  | 'slug'
  | 'manufacturer'
  | 'model'
  | 'transducerType'
  | 'polarPatterns'
  | 'freqRangeMinHz'
  | 'freqRangeMaxHz'
  | 'sensitivityMvPa'
  | 'selfNoiseDbA'
  | 'maxSplDb'
  | 'impedanceOhm'
  | 'powering'
  | 'phantomSafe'
  | 'pads'
  | 'filters'
  | 'weightG'
  | 'dimensions'
  | 'connector'
  | 'discontinued'
  | 'statedApplications'
  | 'specConditions'
>

export function buildMicFacts(mic: MicFactsSource): MicFacts {
  return {
    slug: mic.slug,
    name: `${mic.manufacturer} ${mic.model}`,
    transducerType: MIC_TRANSDUCER_LABELS[mic.transducerType],
    polarPatterns: mic.polarPatterns.map((p) => MIC_PATTERN_LABELS[p]),
    frequencyRangeMinHz: mic.freqRangeMinHz,
    frequencyRangeMaxHz: mic.freqRangeMaxHz,
    sensitivityMvPa: mic.sensitivityMvPa,
    sensitivityDbvPa:
      mic.sensitivityMvPa === null
        ? null
        : round2(mvPaToDbvPa(mic.sensitivityMvPa)),
    selfNoiseDbA: mic.selfNoiseDbA,
    maxSplDb: mic.maxSplDb,
    impedanceOhm: mic.impedanceOhm,
    powering: MIC_POWERING_LABELS[mic.powering],
    phantomSafe: mic.phantomSafe,
    padsDb: [...mic.pads].sort((a, b) => a - b),
    filters: [...mic.filters].sort(),
    weightG: mic.weightG,
    dimensions: mic.dimensions,
    connector: mic.connector,
    discontinued: mic.discontinued,
    statedApplications: [...mic.statedApplications].sort(),
    specConditions: mic.specConditions
  }
}
