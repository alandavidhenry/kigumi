import { profileFor } from '@/lib/recommendations/profiles'
import type {
  LockerSnapshot,
  NormalisedRequest,
  RequestSource,
  RuleMic,
  SnapshotUnit,
  SourceKind,
  Technique
} from '@/lib/recommendations/types'

// Builders for recommendation tests. Defaults describe a plain passive
// dynamic cardioid with no stated figures, the same shape as most seeded mics.

export function ruleMic(
  slug: string,
  overrides: Partial<RuleMic> = {}
): RuleMic {
  return {
    slug,
    manufacturer: 'Maker',
    model: slug,
    transducerType: 'dynamic',
    polarPatterns: ['cardioid'],
    powering: 'none',
    phantomSafe: null,
    discontinued: false,
    freqRangeMinHz: null,
    freqRangeMaxHz: null,
    sensitivityMvPa: null,
    selfNoiseDbA: null,
    maxSplDb: null,
    impedanceOhm: null,
    pads: [],
    filters: [],
    weightG: null,
    dimensions: null,
    connector: null,
    statedApplications: [],
    specConditions: {},
    ...overrides
  }
}

export function lockerUnit(
  unitId: string,
  micSlug: string,
  overrides: Partial<SnapshotUnit> = {}
): SnapshotUnit {
  return {
    unitId,
    micSlug,
    equipmentStatus: 'in_service',
    condition: 'good',
    matchedPairGroup: null,
    quantity: 1,
    roomId: null,
    studioId: null,
    published: true,
    ...overrides
  }
}

export function snapshotOf(
  units: SnapshotUnit[],
  mics: RuleMic[]
): LockerSnapshot {
  return {
    units,
    mics: Object.fromEntries(mics.map((mic) => [mic.slug, mic]))
  }
}

export type SourceSpec =
  SourceKind | { label?: string; kind: SourceKind; technique?: Technique }

export function requestOf(
  sources: SourceSpec[],
  overrides: Partial<NormalisedRequest> = {}
): NormalisedRequest {
  const built: RequestSource[] = sources.map((spec, index) => {
    const { kind, label, technique } =
      typeof spec === 'string'
        ? { kind: spec, label: undefined, technique: undefined }
        : spec
    return {
      id: `s${index + 1}`,
      label: label ?? profileFor(kind).label,
      kind,
      technique: technique ?? profileFor(kind).defaultTechnique
    }
  })
  return {
    kind: 'sources',
    sources: built,
    question: null,
    intent: null,
    roomId: null,
    forDate: null,
    channels: null,
    phantomMode: 'per_channel',
    ...overrides
  }
}
