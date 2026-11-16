import type { SourceKind, Technique } from '@/lib/recommendations/types'

// Starting setups for common sessions: a band, a podcast, a string quartet.
// Pure data, no database access. Each source is what a person would type into
// the recommendation request, so the same labels and kinds flow through the
// rules engine unchanged. Miking is conventional practice, not a recording
// spec. Keep every preset at or below MAX_AI_SOURCES (16) so the model can
// rank it; the test suite enforces that.

export type EnsembleCategory =
  'band' | 'acoustic' | 'jazz' | 'classical' | 'vocal' | 'spoken' | 'drums'

export interface EnsembleSource {
  label: string
  kind: SourceKind
  technique?: Technique
  // Expands to `label 1` ... `label count`. Defaults to one.
  count?: number
}

export interface EnsemblePreset {
  id: string
  name: string
  category: EnsembleCategory
  description: string
  sources: EnsembleSource[]
}

export const ENSEMBLE_PRESETS: EnsemblePreset[] = [
  {
    id: 'singer-songwriter',
    name: 'Singer-songwriter',
    category: 'vocal',
    description: 'One singer with an acoustic guitar.',
    sources: [
      { label: 'Lead vocal', kind: 'vocal_lead' },
      { label: 'Acoustic guitar', kind: 'acoustic_guitar' }
    ]
  },
  {
    id: 'acoustic-duo',
    name: 'Acoustic duo',
    category: 'acoustic',
    description: 'Two singers sharing one acoustic guitar.',
    sources: [
      { label: 'Vocal', kind: 'vocal_lead', count: 2 },
      { label: 'Acoustic guitar', kind: 'acoustic_guitar' }
    ]
  },
  {
    id: 'podcast-two',
    name: 'Podcast: two hosts',
    category: 'spoken',
    description: 'Two speakers at a table, one mic each.',
    sources: [{ label: 'Host', kind: 'spoken_word', count: 2 }]
  },
  {
    id: 'podcast-four',
    name: 'Podcast: four hosts',
    category: 'spoken',
    description: 'Four speakers around a table, one mic each.',
    sources: [{ label: 'Host', kind: 'spoken_word', count: 4 }]
  },
  {
    id: 'voiceover',
    name: 'Voiceover',
    category: 'spoken',
    description: 'A single narrator, close and dry.',
    sources: [{ label: 'Narration', kind: 'spoken_word' }]
  },
  {
    id: 'solo-piano',
    name: 'Solo piano',
    category: 'classical',
    description: 'A stereo pair over the instrument.',
    sources: [{ label: 'Piano', kind: 'piano', technique: 'xy' }]
  },
  {
    id: 'drums-four-mics',
    name: 'Drums: 4 mics',
    category: 'drums',
    description: 'Kick, snare, overheads and room.',
    sources: [
      { label: 'Kick in', kind: 'kick_in' },
      { label: 'Snare top', kind: 'snare_top' },
      { label: 'Drum overheads', kind: 'overheads' },
      { label: 'Drum room', kind: 'drum_room' }
    ]
  },
  {
    id: 'drums-close-miked',
    name: 'Drums: close-miked kit',
    category: 'drums',
    description: 'Every drum close-miked, with a stereo overhead pair.',
    sources: [
      { label: 'Kick in', kind: 'kick_in' },
      { label: 'Kick out', kind: 'kick_out' },
      { label: 'Snare top', kind: 'snare_top' },
      { label: 'Snare bottom', kind: 'snare_bottom' },
      { label: 'Hi-hat', kind: 'hihat' },
      { label: 'Tom', kind: 'tom', count: 3 },
      { label: 'Drum overheads', kind: 'overheads', technique: 'xy' }
    ]
  },
  {
    id: 'small-rock-band',
    name: 'Small rock band (4-piece)',
    category: 'band',
    description: 'Drums, bass, guitar and a lead vocal.',
    sources: [
      { label: 'Kick in', kind: 'kick_in' },
      { label: 'Snare top', kind: 'snare_top' },
      { label: 'Drum overheads', kind: 'overheads', technique: 'xy' },
      { label: 'Drum room', kind: 'drum_room', technique: 'ab' },
      { label: 'Bass amp', kind: 'bass_cab' },
      { label: 'Bass DI', kind: 'di' },
      { label: 'Guitar amp', kind: 'guitar_cab' },
      { label: 'Lead vocal', kind: 'vocal_lead' }
    ]
  },
  {
    id: 'rock-band-basics',
    name: 'Rock band basics',
    category: 'band',
    description: 'Lead vocal, guitar and bass.',
    sources: [
      { label: 'Lead vocal', kind: 'vocal_lead' },
      { label: 'Guitar amp', kind: 'guitar_cab' },
      { label: 'Bass amp', kind: 'bass_cab' },
      { label: 'Bass DI', kind: 'di' }
    ]
  },
  {
    id: 'full-rock-band',
    name: 'Full rock band',
    category: 'band',
    description: 'Close-miked kit, bass, two guitars, keys and vocals.',
    sources: [
      { label: 'Kick in', kind: 'kick_in' },
      { label: 'Snare top', kind: 'snare_top' },
      { label: 'Snare bottom', kind: 'snare_bottom' },
      { label: 'Hi-hat', kind: 'hihat' },
      { label: 'Tom', kind: 'tom', count: 3 },
      { label: 'Drum overheads', kind: 'overheads', technique: 'xy' },
      { label: 'Bass amp', kind: 'bass_cab' },
      { label: 'Bass DI', kind: 'di' },
      { label: 'Guitar', kind: 'guitar_cab', count: 2 },
      { label: 'Keys DI', kind: 'di' },
      { label: 'Lead vocal', kind: 'vocal_lead' },
      { label: 'Backing vocal', kind: 'vocal_backing', count: 2 }
    ]
  },
  {
    id: 'singer-live-band',
    name: 'Singer with live band',
    category: 'band',
    description: 'A lead singer with a small live backing band.',
    sources: [
      { label: 'Lead vocal', kind: 'vocal_lead' },
      { label: 'Backing vocal', kind: 'vocal_backing', count: 2 },
      { label: 'Guitar amp', kind: 'guitar_cab' },
      { label: 'Bass DI', kind: 'di' },
      { label: 'Kick in', kind: 'kick_in' },
      { label: 'Snare top', kind: 'snare_top' },
      { label: 'Drum overheads', kind: 'overheads', technique: 'xy' },
      { label: 'Keys DI', kind: 'di' }
    ]
  },
  {
    id: 'jazz-trio',
    name: 'Jazz trio',
    category: 'jazz',
    description: 'Piano, upright bass and drums with an overhead pair.',
    sources: [
      { label: 'Piano', kind: 'piano' },
      { label: 'Upright bass', kind: 'strings' },
      { label: 'Kick in', kind: 'kick_in' },
      { label: 'Snare top', kind: 'snare_top' },
      { label: 'Drum overheads', kind: 'overheads', technique: 'xy' }
    ]
  },
  {
    id: 'jazz-quartet',
    name: 'Jazz quartet',
    category: 'jazz',
    description: 'The jazz trio with a tenor saxophone.',
    sources: [
      { label: 'Piano', kind: 'piano' },
      { label: 'Upright bass', kind: 'strings' },
      { label: 'Tenor sax', kind: 'woodwind' },
      { label: 'Kick in', kind: 'kick_in' },
      { label: 'Snare top', kind: 'snare_top' },
      { label: 'Drum overheads', kind: 'overheads', technique: 'xy' }
    ]
  },
  {
    id: 'small-big-band',
    name: 'Small big band',
    category: 'jazz',
    description: 'Saxophone, brass and rhythm sections.',
    sources: [
      { label: 'Alto sax', kind: 'woodwind', count: 2 },
      { label: 'Tenor sax', kind: 'woodwind', count: 2 },
      { label: 'Trumpet', kind: 'brass', count: 3 },
      { label: 'Trombone', kind: 'brass', count: 2 },
      { label: 'Piano', kind: 'piano' },
      { label: 'Upright bass', kind: 'strings' },
      { label: 'Kick in', kind: 'kick_in' },
      { label: 'Snare top', kind: 'snare_top' }
    ]
  },
  {
    id: 'brass-quintet',
    name: 'Brass quintet',
    category: 'classical',
    description: 'Two trumpets, horn, trombone and tuba with a stereo pair.',
    sources: [
      { label: 'Trumpet', kind: 'brass', count: 2 },
      { label: 'Horn', kind: 'brass' },
      { label: 'Trombone', kind: 'brass' },
      { label: 'Tuba', kind: 'brass' },
      { label: 'Ensemble pair', kind: 'ensemble', technique: 'ortf' }
    ]
  },
  {
    id: 'string-quartet',
    name: 'String quartet',
    category: 'classical',
    description: 'Four strings with a stereo ensemble pair.',
    sources: [
      { label: 'Violin', kind: 'strings', count: 2 },
      { label: 'Viola', kind: 'strings' },
      { label: 'Cello', kind: 'strings' },
      { label: 'Ensemble pair', kind: 'ensemble', technique: 'ortf' }
    ]
  },
  {
    id: 'woodwind-quintet',
    name: 'Woodwind quintet',
    category: 'classical',
    description: 'Flute, oboe, clarinet, bassoon and horn with a stereo pair.',
    sources: [
      { label: 'Flute', kind: 'woodwind' },
      { label: 'Oboe', kind: 'woodwind' },
      { label: 'Clarinet', kind: 'woodwind' },
      { label: 'Bassoon', kind: 'woodwind' },
      { label: 'Horn', kind: 'brass' },
      { label: 'Ensemble pair', kind: 'ensemble', technique: 'ortf' }
    ]
  },
  {
    id: 'choir',
    name: 'Choir',
    category: 'vocal',
    description: 'A stereo main pair with spot mics for sections.',
    sources: [
      { label: 'Choir main pair', kind: 'ensemble', technique: 'ortf' },
      { label: 'Choir spot', kind: 'vocal_backing', count: 2 }
    ]
  },
  {
    id: 'gospel-rhythm-section',
    name: 'Gospel rhythm section',
    category: 'band',
    description: 'Drums, bass, keys and guitar behind the singers.',
    sources: [
      { label: 'Kick in', kind: 'kick_in' },
      { label: 'Snare top', kind: 'snare_top' },
      { label: 'Drum overheads', kind: 'overheads', technique: 'xy' },
      { label: 'Bass DI', kind: 'di' },
      { label: 'Guitar amp', kind: 'guitar_cab' },
      { label: 'Keys DI', kind: 'di' }
    ]
  }
]

export function getEnsemblePreset(id: string): EnsemblePreset | undefined {
  return ENSEMBLE_PRESETS.find((preset) => preset.id === id)
}

export function expandPreset(preset: EnsemblePreset): {
  label: string
  kind: SourceKind
  technique: Technique
}[] {
  return preset.sources.flatMap((source) => {
    const technique = source.technique ?? 'mono'
    const count = source.count ?? 1
    if (count === 1) {
      return [{ label: source.label, kind: source.kind, technique }]
    }
    return Array.from({ length: count }, (_, index) => ({
      label: `${source.label} ${index + 1}`,
      kind: source.kind,
      technique
    }))
  })
}
