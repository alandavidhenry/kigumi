import type {
  MicCondition,
  MicPolarPattern,
  MicTransducerType
} from '@/lib/mics/types'

// Vocabulary and result shapes for the microphone recommendation pipeline
// (PLAN §4.4, ADR 0015). Everything here is plain data so the rules engine
// stays a pure function that can be tested and replayed.

export const SOURCE_KINDS = [
  'vocal_lead',
  'vocal_backing',
  'spoken_word',
  'kick_in',
  'kick_out',
  'snare_top',
  'snare_bottom',
  'hihat',
  'tom',
  'overheads',
  'drum_room',
  'guitar_cab',
  'bass_cab',
  'acoustic_guitar',
  'piano',
  'strings',
  'brass',
  'woodwind',
  'hand_percussion',
  'ensemble',
  'room_ambience',
  'di',
  'general'
] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]

export const TECHNIQUES = [
  'mono',
  'xy',
  'ortf',
  'nos',
  'ab',
  'blumlein',
  'ms',
  'decca'
] as const
export type Technique = (typeof TECHNIQUES)[number]

// Where a microphone sits in a technique. Mono uses `single`.
export type MicRole = 'single' | 'left' | 'right' | 'mid' | 'side' | 'centre'

export const SPL_BANDS = ['quiet', 'moderate', 'loud', 'very_loud'] as const
export type SplBand = (typeof SPL_BANDS)[number]

export const PHANTOM_MODES = ['per_channel', 'global'] as const
export type PhantomMode = (typeof PHANTOM_MODES)[number]

export type Range = readonly [number, number]

// Replies are capped at 6,000 tokens (ADR 0014); this many sources fit with
// room to spare. Lives here so client code can show the limit without pulling
// in the server-side model-input builder.
export const MAX_AI_SOURCES = 16

// ---------------------------------------------------------------------------
// Request

export interface RequestSource {
  // Positional ('s1', 's2', ...). Labels may repeat, ids never do.
  id: string
  label: string
  kind: SourceKind
  technique: Technique
}

export interface RequestRoom {
  id: string
  studioId: string
  name: string
  widthMm: number
  lengthMm: number
  heightMm: number | null
}

export interface NormalisedRequest {
  kind: 'sources' | 'question'
  sources: RequestSource[]
  question: string | null
  intent: string | null
  roomId: string | null
  forDate: string | null
  channels: number | null
  phantomMode: PhantomMode
}

// ---------------------------------------------------------------------------
// Locker snapshot (what the rules saw; stored with the request)

// The catalogue fields the rules and the model facts need. Structurally a
// subset of MicDetail, so the catalogue's own rows satisfy it.
export interface RuleMic {
  slug: string
  manufacturer: string
  model: string
  transducerType: MicTransducerType
  polarPatterns: MicPolarPattern[]
  powering: 'none' | 'phantom' | 'battery' | 'psu'
  phantomSafe: boolean | null
  discontinued: boolean
  freqRangeMinHz: number | null
  freqRangeMaxHz: number | null
  sensitivityMvPa: number | null
  selfNoiseDbA: number | null
  maxSplDb: number | null
  impedanceOhm: number | null
  pads: number[]
  filters: string[]
  weightG: number | null
  dimensions: string | null
  connector: string | null
  statedApplications: string[]
  specConditions: Record<string, string>
}

export interface SnapshotUnit {
  unitId: string
  micSlug: string
  equipmentStatus: string
  condition: MicCondition
  matchedPairGroup: string | null
  quantity: number
  roomId: string | null
  studioId: string | null
  // False when the catalogue model has been unpublished since it was added.
  published: boolean
}

export interface LockerSnapshot {
  units: SnapshotUnit[]
  mics: Record<string, RuleMic>
}

// ---------------------------------------------------------------------------
// Rules output

export const EXCLUSION_REASONS = [
  'status_repair',
  'status_on_loan',
  'status_retired',
  'booked',
  'catalogue_unpublished',
  'transducer_unsuitable',
  'spl_below',
  'pattern_unavailable'
] as const
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number]

export const WARNING_CODES = [
  'needs_service',
  'quantity_ambiguous',
  'other_studio',
  'use_pad',
  'spl_not_recorded',
  'ribbon_air_blast',
  'phantom_required',
  'phantom_off',
  'psu_required',
  'battery',
  'not_matched',
  'channel_overflow',
  'global_phantom_conflict'
] as const
export type WarningCode = (typeof WARNING_CODES)[number]

export type WarningSeverity = 'info' | 'warning' | 'blocking'

export interface RuleWarning {
  code: WarningCode
  severity: WarningSeverity
  text: string
  unitIds?: string[]
}

export interface RuleReason {
  code: string
  text: string
}

export interface Exclusion {
  unitId: string
  reason: ExclusionReason
  // Absent when the unit is out for every source.
  sourceId?: string
}

export interface RuleOption {
  id: string
  unitIds: string[]
  roles: MicRole[]
  // Aligned with unitIds. The pattern to set on a multi-pattern mic.
  patternSettings: Array<MicPolarPattern | null>
  score: number
  matchedGroup: string | null
  reasons: RuleReason[]
  warnings: RuleWarning[]
}

export type UnfillableReason = 'no_suitable_mic' | 'all_in_use'

export interface RuleSource {
  id: string
  label: string
  kind: SourceKind
  technique: Technique
  micCount: number
  // True for sources that go straight to a line input and need no mic.
  line: boolean
  candidates: RuleOption[]
  planOptionId: string | null
  unfillable: UnfillableReason | null
}

export interface RulesOutput {
  rulesVersion: string
  profilesVersion: string
  sources: RuleSource[]
  excluded: Exclusion[]
  warnings: RuleWarning[]
  channels: {
    required: number
    available: number | null
    overflow: number
  }
}
