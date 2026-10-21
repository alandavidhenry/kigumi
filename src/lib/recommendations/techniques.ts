import type { MicPolarPattern } from '@/lib/mics/types'

import type { MicRole, Range, SourceKind, Technique } from './types'

// Mic-technique definitions (PLAN §4.4: "matched pairs for stereo
// techniques"). Spacing and angle ranges are Kigumi engineering heuristics from
// common practice, not manufacturer data; a range whose ends are equal is a
// fixed standard (for example ORTF). Review them as content, like profiles.ts.

export interface TechniqueRole {
  role: MicRole
  // Patterns that can fill the role; null means the source profile decides.
  patterns: readonly MicPolarPattern[] | null
  // Tried first when a unit offers several.
  preferred: readonly MicPolarPattern[]
}

export interface TechniqueRule {
  technique: Technique
  label: string
  micCount: number
  stereo: boolean
  roles: readonly TechniqueRole[]
  // True when every microphone must be the same model.
  sameModel: boolean
  // Capsule spacing, or null for a coincident (or inherently fixed) pair.
  spacingMm: Range | null
  includedAngleDeg: Range | null
}

const CARDIOID_FAMILY = [
  'cardioid',
  'subcardioid',
  'supercardioid',
  'hypercardioid'
] as const

const pair = (
  patterns: readonly MicPolarPattern[] | null,
  preferred: readonly MicPolarPattern[]
): readonly TechniqueRole[] => [
  { role: 'left', patterns, preferred },
  { role: 'right', patterns, preferred }
]

export const TECHNIQUE_RULES: Readonly<Record<Technique, TechniqueRule>> = {
  mono: {
    technique: 'mono',
    label: 'Single microphone',
    micCount: 1,
    stereo: false,
    roles: [{ role: 'single', patterns: null, preferred: [] }],
    sameModel: true,
    spacingMm: null,
    includedAngleDeg: null
  },
  xy: {
    technique: 'xy',
    label: 'XY coincident pair',
    micCount: 2,
    stereo: true,
    roles: pair(CARDIOID_FAMILY, ['cardioid']),
    sameModel: true,
    spacingMm: null,
    includedAngleDeg: [90, 135]
  },
  ortf: {
    technique: 'ortf',
    label: 'ORTF pair',
    micCount: 2,
    stereo: true,
    roles: pair(['cardioid'], ['cardioid']),
    sameModel: true,
    spacingMm: [170, 170],
    includedAngleDeg: [110, 110]
  },
  nos: {
    technique: 'nos',
    label: 'NOS pair',
    micCount: 2,
    stereo: true,
    roles: pair(['cardioid'], ['cardioid']),
    sameModel: true,
    spacingMm: [300, 300],
    includedAngleDeg: [90, 90]
  },
  ab: {
    technique: 'ab',
    label: 'Spaced pair (A/B)',
    micCount: 2,
    stereo: true,
    roles: pair(['omni', 'subcardioid', 'cardioid'], ['omni', 'subcardioid']),
    sameModel: true,
    spacingMm: [400, 2000],
    includedAngleDeg: null
  },
  blumlein: {
    technique: 'blumlein',
    label: 'Blumlein pair',
    micCount: 2,
    stereo: true,
    roles: pair(['figure8'], ['figure8']),
    sameModel: true,
    spacingMm: null,
    includedAngleDeg: [90, 90]
  },
  ms: {
    technique: 'ms',
    label: 'Mid-side pair',
    micCount: 2,
    stereo: true,
    roles: [
      {
        role: 'mid',
        patterns: ['cardioid', 'omni', 'subcardioid', 'supercardioid'],
        preferred: ['cardioid', 'omni']
      },
      { role: 'side', patterns: ['figure8'], preferred: ['figure8'] }
    ],
    sameModel: false,
    spacingMm: null,
    includedAngleDeg: null
  },
  decca: {
    technique: 'decca',
    label: 'Decca tree',
    micCount: 3,
    stereo: true,
    roles: [
      { role: 'left', patterns: ['omni'], preferred: ['omni'] },
      { role: 'centre', patterns: ['omni'], preferred: ['omni'] },
      { role: 'right', patterns: ['omni'], preferred: ['omni'] }
    ],
    sameModel: true,
    spacingMm: [1500, 2000],
    includedAngleDeg: null
  }
}

// Sources a stereo technique makes sense for. Everything else is one mic.
const STEREO_KINDS: ReadonlySet<SourceKind> = new Set([
  'overheads',
  'drum_room',
  'acoustic_guitar',
  'piano',
  'strings',
  'ensemble',
  'room_ambience',
  'general'
])

export function techniqueAllowed(
  kind: SourceKind,
  technique: Technique
): boolean {
  if (technique === 'mono') return true
  if (kind === 'di') return false
  return STEREO_KINDS.has(kind)
}
