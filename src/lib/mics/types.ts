// Microphone catalogue vocabulary (ADR 0008). Stored as plain strings in
// Postgres; this module is the source of truth for validation and the UI.

export const MIC_TRANSDUCER_TYPES = [
  'dynamic',
  'ldc',
  'sdc',
  'ribbon',
  'boundary',
  'other'
] as const
export type MicTransducerType = (typeof MIC_TRANSDUCER_TYPES)[number]

export const MIC_TRANSDUCER_LABELS: Readonly<
  Record<MicTransducerType, string>
> = {
  dynamic: 'Dynamic',
  ldc: 'Large-diaphragm condenser',
  sdc: 'Small-diaphragm condenser',
  ribbon: 'Ribbon',
  boundary: 'Boundary',
  other: 'Other'
}

export const MIC_POLAR_PATTERNS = [
  'omni',
  'subcardioid',
  'cardioid',
  'supercardioid',
  'hypercardioid',
  'figure8'
] as const
export type MicPolarPattern = (typeof MIC_POLAR_PATTERNS)[number]

export const MIC_PATTERN_LABELS: Readonly<Record<MicPolarPattern, string>> = {
  omni: 'Omnidirectional',
  subcardioid: 'Sub-cardioid',
  cardioid: 'Cardioid',
  supercardioid: 'Supercardioid',
  hypercardioid: 'Hypercardioid',
  figure8: 'Figure-of-eight'
}

// First-order pattern coefficient A in r(θ) = A + (1 − A)·cos θ (PLAN §4.3).
export const MIC_PATTERN_A: Readonly<Record<MicPolarPattern, number>> = {
  omni: 1,
  subcardioid: 0.7,
  cardioid: 0.5,
  supercardioid: 0.37,
  hypercardioid: 0.25,
  figure8: 0
}

export const MIC_POWERING = ['none', 'phantom', 'battery', 'psu'] as const
export type MicPowering = (typeof MIC_POWERING)[number]

export const MIC_POWERING_LABELS: Readonly<Record<MicPowering, string>> = {
  none: 'Passive (no power)',
  phantom: 'Phantom power',
  battery: 'Battery',
  psu: 'External power supply'
}

export const MIC_STATUSES = ['draft', 'in_review', 'published'] as const
export type MicStatus = (typeof MIC_STATUSES)[number]

export const MIC_STATUS_LABELS: Readonly<Record<MicStatus, string>> = {
  draft: 'Draft',
  in_review: 'In review',
  published: 'Published'
}

// How a frequency response or polar curve was obtained (ADR 0008).
export const MIC_CURVE_METHODS = [
  'dataset_measured',
  'manufacturer_numeric',
  'digitised_from_graph',
  'idealised'
] as const
export type MicCurveMethod = (typeof MIC_CURVE_METHODS)[number]

export const MIC_CURVE_METHOD_LABELS: Readonly<Record<MicCurveMethod, string>> =
  {
    dataset_measured: 'Measured (dataset)',
    manufacturer_numeric: 'Manufacturer data',
    digitised_from_graph: 'Manufacturer data (digitised)',
    idealised: 'Idealised — not measured'
  }

export const MIC_CONFIDENCE = ['low', 'medium', 'high'] as const
export type MicConfidence = (typeof MIC_CONFIDENCE)[number]

// How the values were extracted from the source.
//  - manual_transcription: a person read the source and typed the value
//  - llm_drafted: an offline script drafted it (L6); needs human verification
//  - dataset_import: derived by script from an open dataset
//  - drafted_unverified: entered without a checked source; cannot be published
export const MIC_EXTRACTIONS = [
  'manual_transcription',
  'llm_drafted',
  'dataset_import',
  'drafted_unverified'
] as const
export type MicExtraction = (typeof MIC_EXTRACTIONS)[number]

export const MIC_EXTRACTION_LABELS: Readonly<Record<MicExtraction, string>> = {
  manual_transcription: 'Transcribed by hand',
  llm_drafted: 'LLM-drafted',
  dataset_import: 'Open dataset',
  drafted_unverified: 'Unverified draft'
}

export const MIC_CONDITIONS = ['new', 'good', 'fair', 'needs_service'] as const
export type MicCondition = (typeof MIC_CONDITIONS)[number]

export const MIC_CONDITION_LABELS: Readonly<Record<MicCondition, string>> = {
  new: 'New',
  good: 'Good',
  fair: 'Fair',
  needs_service: 'Needs service'
}

// Scalar spec columns that carry per-field provenance. Order is display order.
export const MIC_SPEC_FIELDS = [
  'transducerType',
  'polarPatterns',
  'freqRangeMinHz',
  'freqRangeMaxHz',
  'sensitivityMvPa',
  'selfNoiseDbA',
  'maxSplDb',
  'impedanceOhm',
  'powering',
  'phantomSafe',
  'pads',
  'filters',
  'weightG',
  'dimensions',
  'connector',
  'discontinued',
  'statedApplications'
] as const
export type MicSpecField = (typeof MIC_SPEC_FIELDS)[number]

export const MIC_SPEC_LABELS: Readonly<Record<MicSpecField, string>> = {
  transducerType: 'Transducer type',
  polarPatterns: 'Polar patterns',
  freqRangeMinHz: 'Frequency range (low)',
  freqRangeMaxHz: 'Frequency range (high)',
  sensitivityMvPa: 'Sensitivity',
  selfNoiseDbA: 'Self-noise',
  maxSplDb: 'Max SPL',
  impedanceOhm: 'Impedance',
  powering: 'Powering',
  phantomSafe: 'Phantom-power safe',
  pads: 'Pads',
  filters: 'Filters',
  weightG: 'Weight',
  dimensions: 'Dimensions',
  connector: 'Connector',
  discontinued: 'Discontinued',
  statedApplications: 'Stated applications'
}

export function isOneOf<T extends string>(
  list: readonly T[],
  value: unknown
): value is T {
  return (
    typeof value === 'string' && (list as readonly string[]).includes(value)
  )
}
