import { describe, expect, it } from 'vitest'

import { classifySource } from '@/lib/recommendations/classify'
import { PRESETS } from '@/lib/recommendations/labels'
import { MAX_AI_SOURCES } from '@/lib/recommendations/llm-input'
import {
  normaliseRequest,
  recommendationRequestSchema
} from '@/lib/recommendations/schemas'
import { techniqueAllowed } from '@/lib/recommendations/techniques'
import { SOURCE_KINDS, TECHNIQUES } from '@/lib/recommendations/types'
import {
  ENSEMBLE_PRESETS,
  expandPreset,
  getEnsemblePreset
} from '@/lib/sessions/ensembles'

describe('ensemble presets', () => {
  it('has about twenty presets with unique ids and names', () => {
    expect(ENSEMBLE_PRESETS.length).toBeGreaterThanOrEqual(18)
    const ids = ENSEMBLE_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    const names = ENSEMBLE_PRESETS.map((p) => p.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('uses only valid source kinds and techniques allowed for each kind', () => {
    for (const preset of ENSEMBLE_PRESETS) {
      for (const source of preset.sources) {
        expect(SOURCE_KINDS, preset.id).toContain(source.kind)
        const technique = source.technique ?? 'mono'
        expect(TECHNIQUES, preset.id).toContain(technique)
        expect(
          techniqueAllowed(source.kind, technique),
          `${preset.id}: ${source.label} ${technique}`
        ).toBe(true)
        if (source.count !== undefined) {
          expect(Number.isInteger(source.count), preset.id).toBe(true)
          expect(source.count, preset.id).toBeGreaterThanOrEqual(1)
        }
      }
    }
  })

  it('keeps expanded labels unique within each preset and within the AI limit', () => {
    for (const preset of ENSEMBLE_PRESETS) {
      const labels = expandPreset(preset).map((s) => s.label)
      expect(new Set(labels).size, preset.id).toBe(labels.length)
      expect(labels.length, preset.id).toBeLessThanOrEqual(MAX_AI_SOURCES)
    }
  })

  it('is accepted by the request schema and normaliser', () => {
    for (const preset of ENSEMBLE_PRESETS) {
      const parsed = recommendationRequestSchema.safeParse({
        sources: expandPreset(preset)
      })
      expect(parsed.success, preset.id).toBe(true)
      if (!parsed.success) continue
      const request = normaliseRequest(parsed.data)
      expect(request.sources.length, preset.id).toBe(
        expandPreset(preset).length
      )
    }
  })

  it('expands counts into numbered labels and defaults technique to mono', () => {
    const podcast = getEnsemblePreset('podcast-four')
    expect(podcast).toBeDefined()
    if (!podcast) return
    expect(expandPreset(podcast)).toEqual([
      { label: 'Host 1', kind: 'spoken_word', technique: 'mono' },
      { label: 'Host 2', kind: 'spoken_word', technique: 'mono' },
      { label: 'Host 3', kind: 'spoken_word', technique: 'mono' },
      { label: 'Host 4', kind: 'spoken_word', technique: 'mono' }
    ])

    const drums = getEnsemblePreset('drums-close-miked')
    expect(drums).toBeDefined()
    if (!drums) return
    const labels = expandPreset(drums).map((s) => s.label)
    expect(labels).toContain('Tom 1')
    expect(labels).toContain('Tom 3')
    expect(labels).not.toContain('Tom')
  })

  it('looks presets up by id', () => {
    expect(getEnsemblePreset('choir')?.name).toBe('Choir')
    expect(getEnsemblePreset('no-such-preset')).toBeUndefined()
  })
})

describe('recommendation presets derive from ensembles', () => {
  it('keeps the four original starting points with the same source labels', () => {
    expect(PRESETS.map((p) => p.name)).toEqual([
      'Singer-songwriter',
      'Drums: 4 mics',
      'Drums: close-miked kit',
      'Rock band basics'
    ])
    expect(PRESETS[2].sources.map((s) => s.label)).toEqual([
      'Kick in',
      'Kick out',
      'Snare top',
      'Snare bottom',
      'Hi-hat',
      'Tom 1',
      'Tom 2',
      'Tom 3',
      'Drum overheads'
    ])
  })

  it('carries kinds that match what the classifier already gives each label', () => {
    for (const preset of PRESETS) {
      for (const source of preset.sources) {
        expect(classifySource(source.label).kind, source.label).toBe(
          source.kind
        )
      }
    }
  })
})
