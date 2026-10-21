import { describe, expect, it } from 'vitest'

import { finalise } from '@/lib/recommendations/finalise'
import { buildRecommendationInput } from '@/lib/recommendations/llm-input'
import type { AliasMap } from '@/lib/recommendations/llm-input'
import type { RecommendationContent } from '@/lib/recommendations/reply'
import { runRules } from '@/lib/recommendations/rules'
import type {
  LockerSnapshot,
  NormalisedRequest
} from '@/lib/recommendations/types'
import type { SourceSpec } from '@/test/recommendations'
import {
  lockerUnit,
  requestOf,
  ruleMic,
  snapshotOf
} from '@/test/recommendations'

const u87 = ruleMic('u87', {
  manufacturer: 'Neumann',
  model: 'U 87 Ai',
  transducerType: 'ldc',
  polarPatterns: ['omni', 'cardioid', 'figure8'],
  powering: 'phantom'
})
const sm58 = ruleMic('sm58', { manufacturer: 'Shure', model: 'SM58' })
const km184 = ruleMic('km184', {
  manufacturer: 'Neumann',
  model: 'KM 184',
  transducerType: 'sdc',
  powering: 'phantom'
})

const placement = {
  position: 'Aimed at the source',
  distanceMm: 200,
  angleDeg: 5,
  spacingMm: null,
  includedAngleDeg: null
}

function pipeline(
  sources: SourceSpec[],
  snapshot: LockerSnapshot,
  overrides: Partial<NormalisedRequest> = {}
) {
  const request = requestOf(sources, overrides)
  const rules = runRules(request, snapshot)
  const { aliases } = buildRecommendationInput({
    request,
    rules,
    snapshot,
    room: null,
    unownedNames: []
  })
  const alias = (optionId: string) =>
    Object.entries(aliases.options).find(([, v]) => v.optionId === optionId)![0]
  const run = (content: RecommendationContent) =>
    finalise({ request, rules, snapshot, aliases, content })
  return { request, rules, aliases, alias, run }
}

const reply = (
  entries: Array<{
    sourceId: string
    primary: string
    alternatives?: string[]
  }>,
  extra: Partial<RecommendationContent> = {}
): RecommendationContent => ({
  answerable: true,
  sources: entries.map((e) => ({
    sourceId: e.sourceId,
    primary: {
      option: e.primary,
      reasoning: `Why ${e.primary}`,
      placement
    },
    alternatives: (e.alternatives ?? []).map((option) => ({
      option,
      reason: `Or ${option}`
    }))
  })),
  summary: null,
  ...extra
})

const twoVocals = () =>
  snapshotOf([lockerUnit('ua', 'u87'), lockerUnit('ub', 'sm58')], [u87, sm58])

describe('finalise', () => {
  it('maps the reply back to real units with names from the catalogue', () => {
    const p = pipeline(['vocal_lead'], twoVocals())
    const { view, adjustments } = p.run(
      reply([{ sourceId: 's1', primary: p.alias('s1-1') }])
    )
    const [source] = view.sources
    expect(source.primary).toMatchObject({
      optionId: 's1-1',
      origin: 'ai',
      reasoning: 'Why ' + p.alias('s1-1'),
      placement,
      units: [
        {
          unitId: 'ua',
          micSlug: 'u87',
          name: 'Neumann U 87 Ai',
          role: 'single',
          patternSetting: 'cardioid'
        }
      ]
    })
    expect(source.adjusted).toBeNull()
    expect(adjustments).toEqual([])
  })

  it("attaches the rules layer's warnings, never text from the model", () => {
    const p = pipeline(['vocal_lead'], twoVocals())
    const { view } = p.run(
      reply([{ sourceId: 's1', primary: p.alias('s1-1') }])
    )
    expect(view.sources[0].primary?.warnings.map((w) => w.code)).toContain(
      'phantom_required'
    )
  })

  it('keeps the earlier source on a clash and moves the other to an alternative', () => {
    const p = pipeline(['vocal_lead', 'vocal_lead'], twoVocals())
    const { view, adjustments } = p.run(
      reply([
        { sourceId: 's1', primary: p.alias('s1-1') },
        {
          sourceId: 's2',
          primary: p.alias('s2-1'), // also the U 87
          alternatives: [p.alias('s2-2')]
        }
      ])
    )
    expect(view.sources[0].primary?.units[0].unitId).toBe('ua')
    const second = view.sources[1]
    expect(second.primary).toMatchObject({
      origin: 'ai_alternative',
      units: [{ unitId: 'ub' }]
    })
    expect(second.primary?.placement).toBeNull()
    expect(second.adjusted).toEqual({
      reason: 'unit_in_use',
      originalOptionId: 's2-1'
    })
    expect(adjustments).toEqual([
      { sourceId: 's2', from: 's2-1', to: 's2-2', reason: 'unit_in_use' }
    ])
    // The displaced pick is still shown, flagged as in use by the other source.
    expect(second.alternatives).toEqual([
      expect.objectContaining({ optionId: 's2-1', inUseBy: 's1' })
    ])
  })

  it("falls back to the rules' own pick when there is no free alternative", () => {
    const p = pipeline(['vocal_lead', 'vocal_lead'], twoVocals())
    const { view } = p.run(
      reply([
        { sourceId: 's1', primary: p.alias('s1-1') },
        { sourceId: 's2', primary: p.alias('s2-1') }
      ])
    )
    expect(view.sources[1].primary).toMatchObject({
      origin: 'rules',
      optionId: 's2-2',
      units: [{ unitId: 'ub' }]
    })
  })

  it('leaves a source without a pick when nothing else is free', () => {
    const only = snapshotOf([lockerUnit('ua', 'u87')], [u87])
    const p = pipeline(['vocal_lead', 'vocal_lead'], only)
    // The rules layer already knew s2 had no free mic.
    expect(p.rules.sources[1].unfillable).toBe('all_in_use')
    const { view, adjustments } = p.run(
      reply([
        { sourceId: 's1', primary: p.alias('s1-1') },
        { sourceId: 's2', primary: p.alias('s2-1') }
      ])
    )
    expect(view.sources[1].primary).toBeNull()
    expect(view.sources[1].unfillable).toBe('all_in_use')
    expect(adjustments).toEqual([
      { sourceId: 's2', from: 's2-1', to: null, reason: 'unit_in_use' }
    ])
  })

  it('gives stereo sources priority over mono ones in a clash', () => {
    const snapshot = snapshotOf(
      [
        lockerUnit('k1', 'km184', { matchedPairGroup: 'A' }),
        lockerUnit('k2', 'km184', { matchedPairGroup: 'A' }),
        lockerUnit('d', 'sm58')
      ],
      [km184, sm58]
    )
    const p = pipeline(['hihat', 'overheads'], snapshot)
    const hihatKm = p.rules.sources[0].candidates.find(
      (c) => c.unitIds[0] === 'k1'
    )!
    const hihatDynamic = p.rules.sources[0].candidates.find(
      (c) => c.unitIds[0] === 'd'
    )!
    const { view } = p.run(
      reply([
        {
          sourceId: 's1',
          primary: p.alias(hihatKm.id),
          alternatives: [p.alias(hihatDynamic.id)]
        },
        {
          sourceId: 's2',
          primary: p.alias(p.rules.sources[1].candidates[0].id)
        }
      ])
    )
    expect(view.sources[1].primary?.units.map((u) => u.unitId)).toEqual([
      'k1',
      'k2'
    ])
    expect(view.sources[0].primary?.units[0].unitId).toBe('d')
  })

  it('passes a line source through with no pick', () => {
    const p = pipeline(['di', 'vocal_lead'], twoVocals())
    const { view } = p.run(
      reply([{ sourceId: 's2', primary: p.alias('s2-1') }])
    )
    expect(view.sources[0]).toMatchObject({
      sourceId: 's1',
      line: true,
      primary: null,
      alternatives: []
    })
    expect(view.sources.map((s) => s.sourceId)).toEqual(['s1', 's2'])
    expect(view.sources[1].primary).not.toBeNull()
  })

  it('uses the rules pick for a source the reply left out', () => {
    const p = pipeline(['vocal_lead', 'spoken_word'], twoVocals())
    const { view } = p.run(
      reply([{ sourceId: 's1', primary: p.alias('s1-1') }])
    )
    expect(view.sources[1].primary).toMatchObject({ origin: 'rules' })
  })

  it('marks alternatives that another source is using', () => {
    const p = pipeline(['vocal_lead', 'spoken_word'], twoVocals())
    const { view } = p.run(
      reply([
        {
          sourceId: 's1',
          primary: p.alias('s1-1'),
          alternatives: [p.alias('s1-2')]
        },
        // Spoken word prefers the dynamic, which is s1's alternative.
        { sourceId: 's2', primary: p.alias('s2-1') }
      ])
    )
    expect(view.sources[0].alternatives[0].inUseBy).toBe('s2')
  })

  it('carries summary and session-level warnings, and an unanswerable question has no sources', () => {
    const p = pipeline(['vocal_lead'], twoVocals(), {
      kind: 'question',
      question: 'what is a good pizza topping',
      channels: 0
    })
    const off = p.run({ answerable: false, sources: [], summary: null })
    expect(off.view.answerable).toBe(false)
    expect(off.view.sources).toEqual([])

    const asked = p.run({
      ...reply([{ sourceId: 's1', primary: p.alias('s1-1') }]),
      summary: 'Short note.'
    })
    expect(asked.view.summary).toBe('Short note.')
    expect(asked.view.warnings.map((w) => w.code)).toContain('channel_overflow')
  })

  it('is deterministic and does not change its inputs', () => {
    const p = pipeline(['vocal_lead', 'vocal_lead'], twoVocals())
    const content = reply([
      { sourceId: 's1', primary: p.alias('s1-1') },
      { sourceId: 's2', primary: p.alias('s2-1') }
    ])
    const before = JSON.stringify(content)
    expect(p.run(content)).toEqual(p.run(content))
    expect(JSON.stringify(content)).toBe(before)
  })

  it('ignores an option alias that does not resolve rather than throwing', () => {
    const p = pipeline(['vocal_lead'], twoVocals())
    const aliases: AliasMap = { options: {}, units: {}, models: {} }
    const { view } = finalise({
      request: p.request,
      rules: p.rules,
      snapshot: twoVocals(),
      aliases,
      content: reply([{ sourceId: 's1', primary: 'c1' }])
    })
    // Falls back to what the rules planned.
    expect(view.sources[0].primary).toMatchObject({ origin: 'rules' })
  })
})
