import type { MicPolarPattern, MicTransducerType } from '@/lib/mics/types'

import type { Range, SourceKind, SplBand, Technique } from './types'

// Source profiles: Kigumi's reviewed engineering priors for each kind of
// source (PLAN §4.4, ADR 0015). The catalogue is sparse (most mics have no
// stated applications or SPL yet), so scoring leans on these. They are
// heuristics from common studio practice, NOT manufacturer data:
//
//  - never present them to a user as a spec;
//  - bump PROFILES_VERSION whenever anything in this file changes meaning;
//  - hints contain no digits, so the placement ranges are the only numbers a
//    model may quote for placement (see grounding in the recommendation prompt).

export const PROFILES_VERSION = '1'

// Internal SPL thresholds per band, in dB SPL. Only compared against a mic's
// own stated maxSplDb; never shown to users or sent to a model.
export const SPL_THRESHOLD_DB: Readonly<Record<SplBand, number | null>> = {
  quiet: null,
  moderate: 115,
  loud: 125,
  very_loud: 135
}

export interface Placement {
  // Distance from the source (or from the centre of the source for a pair).
  distanceMm: Range
  // Aim angle off the source's main axis (0 = straight at the source).
  angleDeg: Range
  hints: readonly string[]
}

export interface SourceProfile {
  kind: SourceKind
  label: string
  // Matched against the normalised label (whole words, longest wins).
  keywords: readonly string[]
  defaultTechnique: Technique
  // True for sources that go to a line input and need no microphone.
  line: boolean
  splBand: SplBand
  // −2..3 per transducer type; the main scoring prior.
  transducerAffinity: Readonly<Record<MicTransducerType, number>>
  // Best first.
  preferredPatterns: readonly MicPolarPattern[]
  // Lower-case fragments matched against a mic's stated applications.
  applicationTags: readonly string[]
  excludeTransducers: readonly MicTransducerType[]
  // Heavy air movement (kick port, cab speaker) that can damage a ribbon.
  airBlast: boolean
  placement: Placement | null
}

type Affinity = [
  dynamic: number,
  ldc: number,
  sdc: number,
  ribbon: number,
  boundary: number,
  other?: number
]

const affinity = ([
  dynamic,
  ldc,
  sdc,
  ribbon,
  boundary,
  other = 0
]: Affinity): Record<MicTransducerType, number> => ({
  dynamic,
  ldc,
  sdc,
  ribbon,
  boundary,
  other
})

interface ProfileInput {
  label: string
  keywords: string[]
  defaultTechnique?: Technique
  splBand: SplBand
  affinity: Affinity
  patterns: MicPolarPattern[]
  tags: string[]
  exclude?: MicTransducerType[]
  airBlast?: boolean
  distanceMm: Range
  angleDeg: Range
  hints: string[]
}

function profile(kind: SourceKind, input: ProfileInput): SourceProfile {
  return {
    kind,
    label: input.label,
    keywords: input.keywords,
    defaultTechnique: input.defaultTechnique ?? 'mono',
    line: false,
    splBand: input.splBand,
    transducerAffinity: affinity(input.affinity),
    preferredPatterns: input.patterns,
    applicationTags: input.tags,
    excludeTransducers: input.exclude ?? [],
    airBlast: input.airBlast ?? false,
    placement: {
      distanceMm: input.distanceMm,
      angleDeg: input.angleDeg,
      hints: input.hints
    }
  }
}

export const SOURCE_PROFILES: Readonly<Record<SourceKind, SourceProfile>> = {
  vocal_lead: profile('vocal_lead', {
    label: 'Lead vocal',
    keywords: [
      'vocal',
      'vocals',
      'vox',
      'lead vocal',
      'lead vox',
      'lead vocals',
      'voice',
      'singer',
      'singing'
    ],
    splBand: 'moderate',
    affinity: [1, 3, 0, 1, -2],
    patterns: ['cardioid', 'supercardioid', 'subcardioid'],
    tags: ['vocal', 'voice', 'singing'],
    exclude: ['boundary'],
    distanceMm: [150, 300],
    angleDeg: [0, 20],
    hints: [
      'In front of the singer, just above mouth height, with a pop filter',
      'Move further back for louder passages'
    ]
  }),
  vocal_backing: profile('vocal_backing', {
    label: 'Backing vocal',
    keywords: [
      'backing vocal',
      'backing vocals',
      'backing vox',
      'backing',
      'bv',
      'bvs',
      'bgv',
      'harmony',
      'harmonies'
    ],
    splBand: 'moderate',
    affinity: [2, 2, 0, 1, -2],
    patterns: ['cardioid', 'supercardioid'],
    tags: ['vocal', 'voice'],
    exclude: ['boundary'],
    distanceMm: [200, 400],
    angleDeg: [0, 20],
    hints: ['In front of the singer with a pop filter']
  }),
  spoken_word: profile('spoken_word', {
    label: 'Spoken word',
    keywords: [
      'voiceover',
      'voice over',
      'vo',
      'narration',
      'narrator',
      'podcast',
      'spoken',
      'speech',
      'dialogue'
    ],
    splBand: 'quiet',
    affinity: [3, 2, 0, 1, -1],
    patterns: ['cardioid', 'supercardioid'],
    tags: ['broadcast', 'voice-over', 'speech', 'podcast', 'voice'],
    distanceMm: [100, 250],
    angleDeg: [0, 15],
    hints: [
      'Close to the speaker, slightly off to the side of the mouth to avoid plosives'
    ]
  }),
  kick_in: profile('kick_in', {
    label: 'Kick drum (inside)',
    keywords: ['kick in', 'kick inside', 'kick', 'bass drum', 'kik'],
    splBand: 'very_loud',
    affinity: [3, 0, -1, -2, 2],
    patterns: ['cardioid', 'supercardioid', 'hypercardioid'],
    tags: ['kick', 'bass drum'],
    exclude: ['ribbon'],
    distanceMm: [50, 200],
    angleDeg: [0, 45],
    hints: [
      'Inside the drum through the port, aimed at the beater',
      'Move toward the beater for more attack and away for more body'
    ]
  }),
  kick_out: profile('kick_out', {
    label: 'Kick drum (outside)',
    keywords: [
      'kick out',
      'kick outside',
      'kick front',
      'kick resonant',
      'sub kick'
    ],
    splBand: 'very_loud',
    affinity: [3, 1, -1, -2, 1],
    patterns: ['cardioid', 'supercardioid'],
    tags: ['kick', 'bass drum'],
    exclude: ['ribbon'],
    airBlast: true,
    distanceMm: [100, 400],
    angleDeg: [0, 30],
    hints: [
      'Just outside the resonant head, on the centre line',
      'Check the polarity against the inside microphone'
    ]
  }),
  snare_top: profile('snare_top', {
    label: 'Snare drum (top)',
    keywords: ['snare', 'snare top', 'top snare'],
    splBand: 'very_loud',
    affinity: [3, 0, 1, -1, -1],
    patterns: ['cardioid', 'supercardioid', 'hypercardioid'],
    tags: ['snare'],
    distanceMm: [25, 75],
    angleDeg: [0, 60],
    hints: [
      'Just over the rim, aimed at the centre of the head',
      'Keep clear of the hi-hat and the drummer’s stick path'
    ]
  }),
  snare_bottom: profile('snare_bottom', {
    label: 'Snare drum (bottom)',
    keywords: [
      'snare bottom',
      'snare btm',
      'snare bot',
      'bottom snare',
      'snare under',
      'snare underneath'
    ],
    splBand: 'loud',
    affinity: [2, 0, 2, -1, -1],
    patterns: ['cardioid', 'supercardioid', 'hypercardioid'],
    tags: ['snare'],
    distanceMm: [25, 75],
    angleDeg: [0, 45],
    hints: [
      'Under the drum, aimed at the snare wires',
      'Flip the polarity against the top microphone'
    ]
  }),
  hihat: profile('hihat', {
    label: 'Hi-hat',
    keywords: ['hi hat', 'hihat', 'hh', 'hats', 'hat'],
    splBand: 'loud',
    affinity: [1, 1, 3, 0, -1],
    patterns: ['cardioid', 'supercardioid'],
    tags: ['hi-hat', 'hihat', 'cymbal'],
    distanceMm: [75, 200],
    angleDeg: [30, 60],
    hints: [
      'Above the edge of the top cymbal, angled away from the snare',
      'Keep clear of the air pushed out when the hats close'
    ]
  }),
  tom: profile('tom', {
    label: 'Tom',
    keywords: ['tom', 'toms', 'floor tom', 'rack tom'],
    splBand: 'loud',
    affinity: [3, 1, 0, -1, 0],
    patterns: ['cardioid', 'supercardioid', 'hypercardioid'],
    tags: ['tom'],
    distanceMm: [25, 100],
    angleDeg: [30, 60],
    hints: ['Over the rim, aimed toward the centre of the head']
  }),
  overheads: profile('overheads', {
    label: 'Drum overheads',
    keywords: ['oh', 'ohs', 'overhead', 'overheads', 'over head', 'cymbals'],
    defaultTechnique: 'xy',
    splBand: 'moderate',
    affinity: [0, 3, 3, 2, -1],
    patterns: ['cardioid', 'omni', 'subcardioid'],
    tags: ['overhead', 'cymbal', 'drum kit'],
    distanceMm: [1000, 1800],
    angleDeg: [0, 45],
    hints: [
      'Above the kit, centred on the snare so the two sides are the same distance from it',
      'Raise the pair for a wider, more distant picture'
    ]
  }),
  drum_room: profile('drum_room', {
    label: 'Drum room',
    keywords: ['drum room', 'drums room', 'room kit'],
    defaultTechnique: 'mono',
    splBand: 'moderate',
    affinity: [0, 3, 2, 3, 1],
    patterns: ['omni', 'figure8', 'cardioid'],
    tags: ['room', 'ambient', 'drum'],
    distanceMm: [1500, 4000],
    angleDeg: [0, 45],
    hints: [
      'Out in the room, away from walls, at about drummer head height or lower',
      'Move to taste while listening to the room'
    ]
  }),
  guitar_cab: profile('guitar_cab', {
    label: 'Guitar amp',
    keywords: [
      'guitar',
      'gtr',
      'guitar amp',
      'guitar cab',
      'guitar cabinet',
      'gtr amp',
      'gtr cab',
      'electric guitar',
      'electric',
      'amp',
      'cab'
    ],
    splBand: 'loud',
    affinity: [3, 1, 0, 3, -1],
    patterns: ['cardioid', 'figure8', 'supercardioid'],
    tags: ['guitar amp', 'guitar cabinet', 'electric guitar'],
    airBlast: true,
    distanceMm: [25, 150],
    angleDeg: [0, 45],
    hints: [
      'Close to the speaker grille, aimed at the cone',
      'Move from the centre of the cone toward the edge to soften the tone'
    ]
  }),
  bass_cab: profile('bass_cab', {
    label: 'Bass amp',
    keywords: [
      'bass amp',
      'bass cab',
      'bass cabinet',
      'bass guitar',
      'bass gtr'
    ],
    splBand: 'loud',
    affinity: [3, 1, -1, 0, -1],
    patterns: ['cardioid', 'supercardioid'],
    tags: ['bass amp', 'bass cabinet', 'bass'],
    airBlast: true,
    distanceMm: [25, 200],
    angleDeg: [0, 30],
    hints: ['Close to the speaker grille, aimed at the cone']
  }),
  acoustic_guitar: profile('acoustic_guitar', {
    label: 'Acoustic guitar',
    keywords: [
      'acoustic guitar',
      'acoustic gtr',
      'acoustic',
      'ac gtr',
      'acoustic git'
    ],
    splBand: 'moderate',
    affinity: [0, 3, 3, 2, -1],
    patterns: ['cardioid', 'subcardioid', 'omni'],
    tags: ['acoustic guitar', 'acoustic'],
    distanceMm: [150, 400],
    angleDeg: [0, 45],
    hints: [
      'Aimed where the neck meets the body, rather than at the sound hole',
      'Move closer for more detail and further back for more body'
    ]
  }),
  piano: profile('piano', {
    label: 'Piano',
    keywords: ['piano', 'grand piano', 'upright piano', 'upright', 'grand'],
    splBand: 'moderate',
    affinity: [-1, 3, 3, 1, 2],
    patterns: ['cardioid', 'omni', 'subcardioid'],
    tags: ['piano'],
    distanceMm: [300, 1200],
    angleDeg: [0, 45],
    hints: [
      'Over the strings with the lid open, or in the room for a more natural picture',
      'Keep the pair at equal distances from the hammers'
    ]
  }),
  strings: profile('strings', {
    label: 'Strings',
    keywords: [
      'violin',
      'viola',
      'cello',
      'double bass',
      'strings',
      'string',
      'orchestra strings'
    ],
    splBand: 'quiet',
    affinity: [-1, 3, 3, 2, 0],
    patterns: ['omni', 'subcardioid', 'cardioid'],
    tags: ['strings', 'violin', 'cello', 'orchestral'],
    distanceMm: [600, 2500],
    angleDeg: [0, 30],
    hints: [
      'Slightly above and back from the player so the bow noise stays low'
    ]
  }),
  brass: profile('brass', {
    label: 'Brass',
    keywords: ['trumpet', 'trombone', 'horn', 'horns', 'tuba', 'brass'],
    splBand: 'loud',
    affinity: [3, 1, 0, 3, -1],
    patterns: ['figure8', 'cardioid', 'supercardioid'],
    tags: ['brass', 'trumpet', 'trombone', 'horn'],
    distanceMm: [300, 1000],
    angleDeg: [0, 30],
    hints: [
      'Off to the side of the bell rather than straight down it',
      'Back off for louder players'
    ]
  }),
  woodwind: profile('woodwind', {
    label: 'Woodwind',
    keywords: [
      'sax',
      'saxophone',
      'clarinet',
      'oboe',
      'flute',
      'bassoon',
      'woodwind'
    ],
    splBand: 'moderate',
    affinity: [1, 2, 2, 2, -1],
    patterns: ['cardioid', 'subcardioid', 'omni'],
    tags: ['woodwind', 'flute', 'clarinet', 'saxophone'],
    distanceMm: [300, 900],
    angleDeg: [0, 45],
    hints: [
      'Aimed at the middle of the body of the instrument, not at the bell or mouthpiece'
    ]
  }),
  hand_percussion: profile('hand_percussion', {
    label: 'Hand percussion',
    keywords: [
      'conga',
      'congas',
      'bongo',
      'bongos',
      'djembe',
      'tambourine',
      'shaker',
      'percussion',
      'cajon'
    ],
    splBand: 'moderate',
    affinity: [1, 2, 3, 1, 0],
    patterns: ['cardioid', 'omni'],
    tags: ['percussion', 'conga'],
    distanceMm: [200, 600],
    angleDeg: [0, 45],
    hints: ['Above and slightly in front of the heads']
  }),
  ensemble: profile('ensemble', {
    label: 'Ensemble or choir',
    keywords: ['choir', 'ensemble', 'orchestra', 'band', 'group', 'chorus'],
    defaultTechnique: 'mono',
    splBand: 'moderate',
    affinity: [-1, 2, 2, 2, 2],
    patterns: ['omni', 'subcardioid', 'cardioid'],
    tags: ['ensemble', 'choir', 'orchestra', 'group'],
    distanceMm: [1500, 4000],
    angleDeg: [0, 30],
    hints: ['Back from the group and above head height']
  }),
  room_ambience: profile('room_ambience', {
    label: 'Room ambience',
    keywords: ['room mics', 'room mic', 'room', 'ambience', 'ambient'],
    splBand: 'quiet',
    affinity: [-1, 3, 3, 2, 1],
    patterns: ['omni', 'figure8', 'cardioid'],
    tags: ['ambient', 'room', 'ambience'],
    distanceMm: [2000, 6000],
    angleDeg: [0, 90],
    hints: [
      'Away from the walls and the source, facing the area you want to capture'
    ]
  }),
  di: {
    kind: 'di',
    label: 'Direct input (line)',
    keywords: ['bass di', 'keys di', 'di', 'direct', 'line in', 'line'],
    defaultTechnique: 'mono',
    line: true,
    splBand: 'quiet',
    transducerAffinity: affinity([0, 0, 0, 0, 0]),
    preferredPatterns: [],
    applicationTags: [],
    excludeTransducers: [],
    airBlast: false,
    placement: null
  },
  general: profile('general', {
    label: 'General source',
    keywords: [],
    splBand: 'moderate',
    affinity: [1, 1, 1, 0, 0],
    patterns: ['cardioid'],
    tags: [],
    distanceMm: [200, 1000],
    angleDeg: [0, 45],
    hints: ['Start about a hand span from the source, aimed at its centre']
  })
}

export function profileFor(kind: SourceKind): SourceProfile {
  return SOURCE_PROFILES[kind]
}
