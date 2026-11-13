import { describe, expect, it } from 'vitest'

import {
  normaliseRequest,
  recommendationRequestSchema
} from '@/lib/recommendations/schemas'
import {
  toRequestSources,
  wizardInputSchema,
  wizardLayoutSchema
} from '@/lib/sessions/wizard-schemas'

const valid = () => ({
  details: { name: 'Demo day' },
  sources: [
    { id: 'a', label: 'Lead vocal', kind: 'vocal_lead' },
    { id: 'b', label: 'Kick', kind: 'kick_in', technique: 'mono' }
  ],
  picks: { mode: 'rules' },
  layout: { kind: 'auto' }
})

describe('wizardInputSchema', () => {
  it('parses valid input and applies defaults', () => {
    const r = wizardInputSchema.parse(valid())
    expect(r.details.phantomMode).toBe('per_channel')
    expect(r.sources[0].technique).toBe('mono')
  })

  it('rejects duplicate labels and ids', () => {
    const dupLabel = valid()
    dupLabel.sources[1].label = 'lead  vocal'
    expect(wizardInputSchema.safeParse(dupLabel).success).toBe(false)
    const dupId = valid()
    dupId.sources[1].id = 'a'
    expect(wizardInputSchema.safeParse(dupId).success).toBe(false)
  })

  it('rejects a bad kind, no sources and too many sources', () => {
    const bad = valid()
    bad.sources[0].kind = 'banjo'
    expect(wizardInputSchema.safeParse(bad).success).toBe(false)
    expect(
      wizardInputSchema.safeParse({ ...valid(), sources: [] }).success
    ).toBe(false)
    const many = Array.from({ length: 49 }, (_, i) => ({
      id: `i${i}`,
      label: `S${i}`,
      kind: 'vocal_lead'
    }))
    expect(
      wizardInputSchema.safeParse({ ...valid(), sources: many }).success
    ).toBe(false)
  })

  it('accepts picks modes, recall and saveAsTemplate', () => {
    const r = wizardInputSchema.parse({
      ...valid(),
      picks: { mode: 'ai', resultId: 'r1' },
      recall: { consoleId: 'c1' },
      saveAsTemplate: { name: 'Mine' }
    })
    expect(r.picks.mode).toBe('ai')
    expect(
      wizardInputSchema.safeParse({ ...valid(), picks: { mode: 'ai' } }).success
    ).toBe(false)
  })
})

describe('wizardLayoutSchema', () => {
  it('accepts the four kinds', () => {
    for (const l of [
      { kind: 'auto' },
      { kind: 'blank' },
      { kind: 'builtin', templateId: 'band-tracking' },
      { kind: 'template', layoutId: 'l1' }
    ]) {
      expect(wizardLayoutSchema.safeParse(l).success).toBe(true)
    }
  })

  it('rejects unknown kinds and missing ids', () => {
    expect(wizardLayoutSchema.safeParse({ kind: 'session' }).success).toBe(
      false
    )
    expect(wizardLayoutSchema.safeParse({ kind: 'builtin' }).success).toBe(
      false
    )
  })
})

describe('toRequestSources', () => {
  it('produces a valid recommendation request', () => {
    const input = wizardInputSchema.parse(valid())
    const req = recommendationRequestSchema.parse({
      sources: toRequestSources(input.sources)
    })
    const n = normaliseRequest(req)
    expect(n.sources.map((s) => s.label)).toEqual(['Lead vocal', 'Kick'])
    expect(n.sources[0].kind).toBe('vocal_lead')
  })
})
