import { describe, expect, it } from 'vitest'

import { classifySource } from '@/lib/recommendations/classify'
import {
  PROFILES_VERSION,
  SOURCE_PROFILES,
  SPL_THRESHOLD_DB,
  profileFor
} from '@/lib/recommendations/profiles'
import {
  TECHNIQUE_RULES,
  techniqueAllowed
} from '@/lib/recommendations/techniques'
import {
  SOURCE_KINDS,
  SPL_BANDS,
  TECHNIQUES
} from '@/lib/recommendations/types'

describe('source profiles', () => {
  it('has exactly one profile per source kind and a version', () => {
    expect(PROFILES_VERSION).toMatch(/^\d+$/)
    expect(Object.keys(SOURCE_PROFILES).sort()).toEqual(
      [...SOURCE_KINDS].sort()
    )
    for (const kind of SOURCE_KINDS) expect(profileFor(kind).kind).toBe(kind)
  })

  it('keeps every range ordered and inside sane physical bounds', () => {
    for (const profile of Object.values(SOURCE_PROFILES)) {
      if (!profile.placement) {
        // Line sources have nothing to place.
        expect(profile.line, profile.kind).toBe(true)
        continue
      }
      const { distanceMm, angleDeg } = profile.placement
      expect(distanceMm[0], profile.kind).toBeGreaterThanOrEqual(0)
      expect(distanceMm[0], profile.kind).toBeLessThan(distanceMm[1])
      expect(distanceMm[1], profile.kind).toBeLessThanOrEqual(6000)
      expect(angleDeg[0], profile.kind).toBeGreaterThanOrEqual(0)
      expect(angleDeg[0], profile.kind).toBeLessThan(angleDeg[1])
      expect(angleDeg[1], profile.kind).toBeLessThanOrEqual(180)
      expect(profile.placement.hints.length, profile.kind).toBeGreaterThan(0)
    }
  })

  it('keeps digits out of hints so the ranges are the only placement numbers', () => {
    for (const profile of Object.values(SOURCE_PROFILES)) {
      for (const hint of profile.placement?.hints ?? []) {
        expect(hint, profile.kind).not.toMatch(/\d/)
      }
    }
  })

  it('uses a known SPL band, a valid default technique and bounded affinities', () => {
    for (const profile of Object.values(SOURCE_PROFILES)) {
      expect(SPL_BANDS).toContain(profile.splBand)
      expect(techniqueAllowed(profile.kind, profile.defaultTechnique)).toBe(
        true
      )
      for (const value of Object.values(profile.transducerAffinity)) {
        expect(value).toBeGreaterThanOrEqual(-2)
        expect(value).toBeLessThanOrEqual(3)
      }
    }
  })

  it('never excludes a transducer it also rates highest', () => {
    for (const profile of Object.values(SOURCE_PROFILES)) {
      const best = Math.max(...Object.values(profile.transducerAffinity))
      for (const type of profile.excludeTransducers) {
        expect(profile.transducerAffinity[type], profile.kind).toBeLessThan(
          best
        )
      }
    }
  })

  it('only the di profile is a line source', () => {
    expect(SOURCE_PROFILES.di.line).toBe(true)
    for (const profile of Object.values(SOURCE_PROFILES)) {
      if (profile.kind !== 'di') expect(profile.line).toBe(false)
    }
  })

  it('keeps kick and snare out of ribbons and flags air blast', () => {
    expect(SOURCE_PROFILES.kick_in.excludeTransducers).toContain('ribbon')
    expect(SOURCE_PROFILES.kick_out.airBlast).toBe(true)
    expect(SOURCE_PROFILES.guitar_cab.airBlast).toBe(true)
  })

  it('has increasing SPL thresholds', () => {
    expect(SPL_THRESHOLD_DB.moderate!).toBeLessThan(SPL_THRESHOLD_DB.loud!)
    expect(SPL_THRESHOLD_DB.loud!).toBeLessThan(SPL_THRESHOLD_DB.very_loud!)
    expect(SPL_THRESHOLD_DB.quiet).toBeNull()
  })
})

describe('techniques', () => {
  it('defines every technique with a sensible mic count', () => {
    expect(Object.keys(TECHNIQUE_RULES).sort()).toEqual([...TECHNIQUES].sort())
    expect(TECHNIQUE_RULES.mono.micCount).toBe(1)
    expect(TECHNIQUE_RULES.xy.micCount).toBe(2)
    expect(TECHNIQUE_RULES.ms.micCount).toBe(2)
    expect(TECHNIQUE_RULES.decca.micCount).toBe(3)
  })

  it('requires figure-of-eight for Blumlein and the MS side, omni for Decca', () => {
    expect(TECHNIQUE_RULES.blumlein.roles.map((r) => r.patterns)).toEqual([
      ['figure8'],
      ['figure8']
    ])
    const side = TECHNIQUE_RULES.ms.roles.find((r) => r.role === 'side')
    expect(side?.patterns).toEqual(['figure8'])
    for (const role of TECHNIQUE_RULES.decca.roles) {
      expect(role.patterns).toEqual(['omni'])
    }
  })

  it('only MS may mix models', () => {
    for (const technique of TECHNIQUES) {
      expect(TECHNIQUE_RULES[technique].sameModel).toBe(technique !== 'ms')
    }
  })

  it('keeps geometry ranges ordered', () => {
    for (const rule of Object.values(TECHNIQUE_RULES)) {
      for (const range of [rule.spacingMm, rule.includedAngleDeg]) {
        if (range) expect(range[0]).toBeLessThanOrEqual(range[1])
      }
    }
  })

  it('allows stereo techniques only on stereo-friendly sources', () => {
    expect(techniqueAllowed('overheads', 'xy')).toBe(true)
    expect(techniqueAllowed('piano', 'ortf')).toBe(true)
    expect(techniqueAllowed('snare_top', 'decca')).toBe(false)
    expect(techniqueAllowed('vocal_lead', 'xy')).toBe(false)
    expect(techniqueAllowed('vocal_lead', 'mono')).toBe(true)
    expect(techniqueAllowed('general', 'blumlein')).toBe(true)
    // A line source never takes a microphone technique.
    expect(techniqueAllowed('di', 'xy')).toBe(false)
  })
})

describe('classifySource', () => {
  const kindOf = (text: string) => classifySource(text).kind

  it.each([
    ['breathy female vocal', 'vocal_lead'],
    ['Lead Vox', 'vocal_lead'],
    ['BV 2', 'vocal_backing'],
    ['backing vocals', 'vocal_backing'],
    ['kick in', 'kick_in'],
    ['kick inside', 'kick_in'],
    ['kick out', 'kick_out'],
    ['Kick (front)', 'kick_out'],
    ['snare', 'snare_top'],
    ['snare top', 'snare_top'],
    ['snare bottom', 'snare_bottom'],
    ['Snare BTM', 'snare_bottom'],
    ['Tom 2', 'tom'],
    ['floor tom', 'tom'],
    ['hi-hat', 'hihat'],
    ['HH', 'hihat'],
    ['OH', 'overheads'],
    ['drum overheads', 'overheads'],
    ['drum room', 'drum_room'],
    ['gtr cab', 'guitar_cab'],
    ['guitar amp', 'guitar_cab'],
    ['bass amp', 'bass_cab'],
    ['acoustic guitar', 'acoustic_guitar'],
    ['upright piano', 'piano'],
    ['violin', 'strings'],
    ['trumpet', 'brass'],
    ['flute', 'woodwind'],
    ['congas', 'hand_percussion'],
    ['choir', 'ensemble'],
    ['room mics', 'room_ambience'],
    ['bass DI', 'di'],
    ['keys DI', 'di'],
    ['didgeridoo', 'general']
  ])('%s -> %s', (text, expected) => {
    expect(kindOf(text)).toBe(expected)
  })

  it('prefers the longest keyword so "snare bottom" beats "snare"', () => {
    expect(kindOf('snare bottom')).toBe('snare_bottom')
    expect(kindOf('bass di')).toBe('di')
    expect(kindOf('bass cab')).toBe('bass_cab')
  })

  it('ignores case and extra whitespace and does not match inside words', () => {
    expect(kindOf('  SNARE   TOP ')).toBe('snare_top')
    // "oh" must not match inside "ohm" or "bohemian"
    expect(kindOf('bohemian')).toBe('general')
    expect(kindOf('Kick')).toBe('kick_in')
  })

  it('is stable for equal-length matches', () => {
    const a = classifySource('tom kick')
    const b = classifySource('tom kick')
    expect(a).toEqual(b)
  })

  it('returns the matched keyword and general with no match', () => {
    expect(classifySource('snare bottom').matched).toBe('snare bottom')
    expect(classifySource('xyzzy')).toEqual({ kind: 'general', matched: null })
  })
})
