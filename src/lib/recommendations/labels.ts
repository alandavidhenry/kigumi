import { expandPreset, getEnsemblePreset } from '@/lib/sessions/ensembles'

import { SOURCE_PROFILES } from './profiles'
import { FEEDBACK_REASONS } from './schemas'
import { TECHNIQUE_RULES } from './techniques'
import {
  SOURCE_KINDS,
  type ExclusionReason,
  type SourceKind,
  type Technique,
  type UnfillableReason,
  type WarningSeverity
} from './types'

// Plain-English labels for the recommendation screens. Warning and reason text
// itself is written by the rules layer (so it is the same everywhere); these
// cover the codes the screens show on their own.

export const EXCLUSION_LABELS: Readonly<Record<ExclusionReason, string>> = {
  status_repair: 'In repair',
  status_on_loan: 'On loan',
  status_retired: 'Retired',
  booked: 'Booked for this date',
  catalogue_unpublished: 'No longer in the catalogue',
  transducer_unsuitable: 'Not suited to this source',
  spl_below: 'Its stated maximum SPL is too low for this source',
  pattern_unavailable: 'Has no polar pattern this technique can use'
}

export const UNFILLABLE_LABELS: Readonly<Record<UnfillableReason, string>> = {
  no_suitable_mic:
    'None of the microphones in your locker suit this source. The list below says why each was left out.',
  all_in_use:
    'Your suitable microphones are already used for other sources in this plan.'
}

// Badge variants for rules-layer warnings.
export const WARNING_VARIANTS: Readonly<
  Record<WarningSeverity, 'info' | 'warning' | 'destructive'>
> = {
  info: 'info',
  warning: 'warning',
  blocking: 'destructive'
}

export const FEEDBACK_REASON_LABELS: Readonly<
  Record<(typeof FEEDBACK_REASONS)[number], string>
> = {
  wrong_character: 'Wrong sound for the job',
  spl_risk: 'Level too high for it',
  placement: 'Placement did not work',
  unavailable: 'It was not available',
  prefer_other: 'I prefer something else',
  unsafe: 'Unsafe advice',
  other: 'Something else'
}

export const KIND_OPTIONS: ReadonlyArray<{ value: SourceKind; label: string }> =
  SOURCE_KINDS.map((value) => ({
    value,
    label: SOURCE_PROFILES[value].label
  }))

export function kindLabel(kind: SourceKind): string {
  return SOURCE_PROFILES[kind].label
}

export function techniqueLabel(technique: Technique): string {
  return TECHNIQUE_RULES[technique].label
}

// Starting points for the source list. Labels are what a person would type, so
// the classifier is exercised the same way as for typed input. Derived from the
// ensemble presets (src/lib/sessions/ensembles.ts) so there is one source of
// truth; only the kind is carried over, and the screen defaults to mono.
export interface Preset {
  name: string
  sources: Array<{ label: string; kind?: SourceKind; technique?: Technique }>
}

const RECOMMENDATION_PRESET_IDS = [
  'singer-songwriter',
  'drums-four-mics',
  'drums-close-miked',
  'rock-band-basics'
] as const

export const PRESETS: readonly Preset[] = RECOMMENDATION_PRESET_IDS.flatMap(
  (id) => {
    const preset = getEnsemblePreset(id)
    if (!preset) return []
    return [
      {
        name: preset.name,
        sources: expandPreset(preset).map(({ label, kind }) => ({
          label,
          kind
        }))
      }
    ]
  }
)
