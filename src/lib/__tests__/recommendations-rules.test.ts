import { describe, expect, it } from 'vitest'

import {
  PROFILES_VERSION,
  SPL_THRESHOLD_DB
} from '@/lib/recommendations/profiles'
import {
  CANDIDATES_PER_SOURCE,
  RULES_VERSION,
  runRules
} from '@/lib/recommendations/rules'
import type {
  LockerSnapshot,
  RuleOption,
  RulesOutput
} from '@/lib/recommendations/types'
import {
  lockerUnit,
  requestOf,
  ruleMic,
  snapshotOf
} from '@/test/recommendations'

// The rules layer is pure: a request and a locker snapshot in, candidates and a
// plan out. These tests are the contract the LLM layer is built on (PLAN §4.4).

const sm57 = ruleMic('sm57')
const sm58 = ruleMic('sm58')
const u87 = ruleMic('u87', {
  transducerType: 'ldc',
  polarPatterns: ['omni', 'cardioid', 'figure8'],
  powering: 'phantom'
})
const km184 = ruleMic('km184', { transducerType: 'sdc', powering: 'phantom' })
const nt5 = ruleMic('nt5', { transducerType: 'sdc', powering: 'phantom' })
const r121 = ruleMic('r121', {
  transducerType: 'ribbon',
  polarPatterns: ['figure8']
})
const c414 = ruleMic('c414', {
  transducerType: 'ldc',
  polarPatterns: [
    'omni',
    'subcardioid',
    'cardioid',
    'hypercardioid',
    'figure8'
  ],
  powering: 'phantom'
})

const planOf = (out: RulesOutput, index = 0): RuleOption | undefined => {
  const source = out.sources[index]
  return source.candidates.find((c) => c.id === source.planOptionId)
}
const warningCodes = (option: RuleOption | undefined) =>
  option?.warnings.map((w) => w.code) ?? []

describe('output shape', () => {
  it('carries versions, positional ids and rank-ordered option ids', () => {
    const out = runRules(
      requestOf(['snare_top', 'tom']),
      snapshotOf(
        [lockerUnit('a', 'sm57'), lockerUnit('b', 'sm58')],
        [sm57, sm58]
      )
    )
    expect(out.rulesVersion).toBe(RULES_VERSION)
    expect(out.profilesVersion).toBe(PROFILES_VERSION)
    expect(out.sources.map((s) => s.id)).toEqual(['s1', 's2'])
    expect(out.sources[0].candidates.map((c) => c.id)).toEqual(['s1-1', 's1-2'])
  })

  it('treats a line source as needing a channel but no microphone', () => {
    const out = runRules(
      requestOf(['di']),
      snapshotOf([lockerUnit('a', 'sm57')], [sm57])
    )
    expect(out.sources[0]).toMatchObject({
      line: true,
      micCount: 0,
      candidates: [],
      planOptionId: null,
      unfillable: null
    })
    expect(out.channels.required).toBe(1)
  })

  it('reports every source as unfillable for an empty locker without throwing', () => {
    const out = runRules(
      requestOf(['vocal_lead', 'overheads']),
      snapshotOf([], [])
    )
    expect(out.sources.map((s) => s.unfillable)).toEqual([
      'no_suitable_mic',
      'no_suitable_mic'
    ])
    expect(out.excluded).toEqual([])
  })

  it('handles a one-source question request the same way', () => {
    const out = runRules(
      requestOf(['vocal_lead'], {
        kind: 'question',
        question: 'breathy vocal'
      }),
      snapshotOf([lockerUnit('a', 'u87')], [u87])
    )
    expect(planOf(out)?.unitIds).toEqual(['a'])
  })
})

describe('unit eligibility', () => {
  it.each([
    ['repair', 'status_repair'],
    ['on_loan', 'status_on_loan'],
    ['retired', 'status_retired']
  ])('excludes an item that is %s', (status, reason) => {
    const out = runRules(
      requestOf(['snare_top']),
      snapshotOf([lockerUnit('a', 'sm57', { equipmentStatus: status })], [sm57])
    )
    expect(out.excluded).toContainEqual({ unitId: 'a', reason })
    expect(out.sources[0].candidates).toEqual([])
    expect(out.sources[0].unfillable).toBe('no_suitable_mic')
  })

  it('excludes a unit the caller says is booked', () => {
    const out = runRules(
      requestOf(['snare_top']),
      snapshotOf([lockerUnit('a', 'sm57')], [sm57]),
      { isBooked: (id) => id === 'a' }
    )
    expect(out.excluded).toContainEqual({ unitId: 'a', reason: 'booked' })
  })

  it('excludes a model that is no longer published, or missing from the catalogue', () => {
    const out = runRules(
      requestOf(['snare_top']),
      snapshotOf(
        [
          lockerUnit('a', 'sm57', { published: false }),
          lockerUnit('b', 'ghost')
        ],
        [sm57]
      )
    )
    expect(out.excluded).toEqual([
      { unitId: 'a', reason: 'catalogue_unpublished' },
      { unitId: 'b', reason: 'catalogue_unpublished' }
    ])
  })

  it('keeps a unit that needs service but warns and ranks it below a good one', () => {
    const out = runRules(
      requestOf(['snare_top']),
      snapshotOf(
        [
          lockerUnit('a', 'sm57', { condition: 'needs_service' }),
          lockerUnit('b', 'sm57')
        ],
        [sm57]
      )
    )
    const [first, second] = out.sources[0].candidates
    expect(first.unitIds).toEqual(['b'])
    expect(second.unitIds).toEqual(['a'])
    expect(warningCodes(second)).toContain('needs_service')
    expect(warningCodes(first)).not.toContain('needs_service')
  })

  it('ranks fair below good without a warning', () => {
    const out = runRules(
      requestOf(['snare_top']),
      snapshotOf(
        [
          lockerUnit('a', 'sm57', { condition: 'fair' }),
          lockerUnit('b', 'sm57')
        ],
        [sm57]
      )
    )
    expect(out.sources[0].candidates.map((c) => c.unitIds[0])).toEqual([
      'b',
      'a'
    ])
    expect(warningCodes(out.sources[0].candidates[1])).toEqual([])
  })

  it('warns when the inventory row holds more than one', () => {
    const out = runRules(
      requestOf(['snare_top']),
      snapshotOf([lockerUnit('a', 'sm57', { quantity: 3 })], [sm57])
    )
    expect(warningCodes(planOf(out))).toContain('quantity_ambiguous')
  })

  it('warns only when a unit is known to be in a different studio from the room', () => {
    const room = {
      id: 'r1',
      studioId: 'st1',
      name: 'Live room',
      widthMm: 5000,
      lengthMm: 7000,
      heightMm: 3000
    }
    const run = (studioId: string | null, withRoom = true) =>
      runRules(
        requestOf(['snare_top']),
        snapshotOf([lockerUnit('a', 'sm57', { studioId })], [sm57]),
        { room: withRoom ? room : null }
      )
    expect(warningCodes(planOf(run('st2')))).toContain('other_studio')
    expect(warningCodes(planOf(run('st1')))).not.toContain('other_studio')
    expect(warningCodes(planOf(run(null)))).not.toContain('other_studio')
    expect(warningCodes(planOf(run('st2', false)))).not.toContain(
      'other_studio'
    )
  })
})

describe('per-source suitability', () => {
  it('keeps a ribbon out of a kick drum but not out of other sources', () => {
    const out = runRules(
      requestOf(['kick_in']),
      snapshotOf(
        [lockerUnit('r', 'r121'), lockerUnit('d', 'sm57')],
        [r121, sm57]
      )
    )
    expect(out.excluded).toContainEqual({
      unitId: 'r',
      reason: 'transducer_unsuitable',
      sourceId: 's1'
    })
    expect(planOf(out)?.unitIds).toEqual(['d'])
  })

  it('keeps a boundary microphone off a vocal', () => {
    const pzm = ruleMic('pzm', { transducerType: 'boundary' })
    const out = runRules(
      requestOf(['vocal_lead']),
      snapshotOf([lockerUnit('p', 'pzm')], [pzm])
    )
    expect(out.excluded).toContainEqual({
      unitId: 'p',
      reason: 'transducer_unsuitable',
      sourceId: 's1'
    })
  })

  describe('SPL (snare top is a very loud source)', () => {
    const threshold = SPL_THRESHOLD_DB.very_loud!
    const run = (overrides: Parameters<typeof ruleMic>[1]) =>
      runRules(
        requestOf(['snare_top']),
        snapshotOf([lockerUnit('a', 'x')], [ruleMic('x', overrides)])
      )

    it('excludes a mic whose stated maximum is below the threshold and has no pad', () => {
      const out = run({ maxSplDb: threshold - 1 })
      expect(out.excluded).toContainEqual({
        unitId: 'a',
        reason: 'spl_below',
        sourceId: 's1'
      })
      expect(out.sources[0].candidates).toEqual([])
    })

    it('passes exactly at the threshold with no warning', () => {
      const out = run({ maxSplDb: threshold })
      expect(planOf(out)).toBeDefined()
      expect(warningCodes(planOf(out))).toEqual([])
    })

    it('keeps a mic that is short but has a pad that covers the gap, with a warning', () => {
      const out = run({ maxSplDb: threshold - 10, pads: [10, 20] })
      expect(warningCodes(planOf(out))).toContain('use_pad')
    })

    it('still excludes a mic whose largest pad does not cover the gap', () => {
      const out = run({ maxSplDb: threshold - 15, pads: [10] })
      expect(out.excluded).toContainEqual({
        unitId: 'a',
        reason: 'spl_below',
        sourceId: 's1'
      })
    })

    it('warns about an unrecorded maximum on a condenser but not on a dynamic', () => {
      const condenser = run({ transducerType: 'ldc', powering: 'phantom' })
      expect(warningCodes(planOf(condenser))).toContain('spl_not_recorded')
      expect(warningCodes(planOf(run({})))).not.toContain('spl_not_recorded')
    })

    it('does not warn about an unrecorded maximum on a moderate source', () => {
      const out = runRules(
        requestOf(['overheads']),
        snapshotOf(
          [lockerUnit('a', 'km184'), lockerUnit('b', 'km184')],
          [km184]
        )
      )
      expect(warningCodes(planOf(out))).not.toContain('spl_not_recorded')
    })

    it('never checks SPL for a quiet source', () => {
      const out = runRules(
        requestOf(['spoken_word']),
        snapshotOf([lockerUnit('a', 'x')], [ruleMic('x', { maxSplDb: 60 })])
      )
      expect(planOf(out)).toBeDefined()
      expect(out.excluded).toEqual([])
    })
  })

  it('treats an unknown maximum as unknown, never as a pass or a fail', () => {
    const out = runRules(
      requestOf(['kick_in']),
      snapshotOf([lockerUnit('a', 'sm57')], [sm57])
    )
    expect(out.excluded).toEqual([])
    expect(planOf(out)?.unitIds).toEqual(['a'])
  })
})

describe('power and ribbon warnings', () => {
  const run = (mic: ReturnType<typeof ruleMic>, kind = 'acoustic_guitar') =>
    runRules(
      requestOf([kind as 'acoustic_guitar']),
      snapshotOf([lockerUnit('a', mic.slug)], [mic])
    )

  it('notes phantom power for a phantom-powered condenser', () => {
    expect(warningCodes(planOf(run(u87)))).toContain('phantom_required')
  })

  it('warns a passive ribbon with unrecorded tolerance to keep phantom off', () => {
    const warning = planOf(run(r121))?.warnings.find(
      (w) => w.code === 'phantom_off'
    )
    expect(warning?.severity).toBe('warning')
    expect(warning?.text).toMatch(/not recorded/)
  })

  it('warns a passive ribbon known to be phantom-unsafe', () => {
    const unsafe = ruleMic('old-ribbon', {
      transducerType: 'ribbon',
      polarPatterns: ['figure8'],
      phantomSafe: false
    })
    const warning = planOf(run(unsafe))?.warnings.find(
      (w) => w.code === 'phantom_off'
    )
    expect(warning?.text).toMatch(/can damage/)
  })

  it('does not warn a ribbon the maker says is phantom-safe', () => {
    const safe = ruleMic('safe-ribbon', {
      transducerType: 'ribbon',
      polarPatterns: ['figure8'],
      phantomSafe: true
    })
    expect(warningCodes(planOf(run(safe)))).not.toContain('phantom_off')
  })

  it('needs phantom, not a warning to remove it, for an active ribbon', () => {
    const active = ruleMic('active-ribbon', {
      transducerType: 'ribbon',
      polarPatterns: ['figure8'],
      powering: 'phantom'
    })
    const codes = warningCodes(planOf(run(active)))
    expect(codes).toContain('phantom_required')
    expect(codes).not.toContain('phantom_off')
  })

  it('notes external power and batteries', () => {
    const tube = ruleMic('tube', {
      transducerType: 'ldc',
      powering: 'psu',
      polarPatterns: ['cardioid']
    })
    const batt = ruleMic('batt', { powering: 'battery' })
    expect(warningCodes(planOf(run(tube)))).toContain('psu_required')
    expect(warningCodes(planOf(run(batt)))).toContain('battery')
  })

  it('warns that air blast can hurt a ribbon on a guitar cab and prefers a dynamic', () => {
    const out = runRules(
      requestOf(['guitar_cab']),
      snapshotOf(
        [lockerUnit('r', 'r121'), lockerUnit('d', 'sm57')],
        [r121, sm57]
      )
    )
    const ribbon = out.sources[0].candidates.find((c) => c.unitIds[0] === 'r')
    expect(warningCodes(ribbon)).toContain('ribbon_air_blast')
    expect(planOf(out)?.unitIds).toEqual(['d'])
  })

  it('raises a blocking conflict only when phantom is global and the plan mixes both', () => {
    const snapshot = snapshotOf(
      [lockerUnit('c', 'u87'), lockerUnit('r', 'r121')],
      [u87, r121]
    )
    const sources = ['vocal_lead', 'acoustic_guitar'] as const
    const global = runRules(
      requestOf([...sources], { phantomMode: 'global' }),
      snapshot
    )
    const conflict = global.warnings.find(
      (w) => w.code === 'global_phantom_conflict'
    )
    expect(conflict?.severity).toBe('blocking')
    expect(conflict?.unitIds?.sort()).toEqual(['c', 'r'])

    const perChannel = runRules(requestOf([...sources]), snapshot)
    expect(perChannel.warnings.map((w) => w.code)).not.toContain(
      'global_phantom_conflict'
    )
  })
})

describe('stereo and multi-mic options', () => {
  const kmPair = (extra: Parameters<typeof lockerUnit>[2] = {}) => [
    lockerUnit('k1', 'km184', { matchedPairGroup: 'A', ...extra }),
    lockerUnit('k2', 'km184', { matchedPairGroup: 'A' })
  ]

  it('uses a matched pair as one option, marked matched with no warning', () => {
    const out = runRules(
      requestOf(['overheads']),
      snapshotOf(kmPair(), [km184])
    )
    const option = planOf(out)!
    expect(option.unitIds).toEqual(['k1', 'k2'])
    expect(option.matchedGroup).toBe('A')
    expect(warningCodes(option)).not.toContain('not_matched')
    expect(option.reasons.map((r) => r.code)).toContain('matched_pair')
    expect(option.roles).toEqual(['left', 'right'])
  })

  it('accepts two unmatched units of one model with a warning', () => {
    const out = runRules(
      requestOf(['overheads']),
      snapshotOf([lockerUnit('n1', 'nt5'), lockerUnit('n2', 'nt5')], [nt5])
    )
    const option = planOf(out)!
    expect(option.matchedGroup).toBeNull()
    expect(warningCodes(option)).toContain('not_matched')
  })

  it('ranks a matched pair above an unmatched pair of the same model', () => {
    const out = runRules(
      requestOf(['overheads']),
      snapshotOf(
        [lockerUnit('a1', 'km184'), lockerUnit('a2', 'km184'), ...kmPair()],
        [km184]
      )
    )
    expect(out.sources[0].candidates[0].unitIds).toEqual(['k1', 'k2'])
    expect(out.sources[0].candidates[1].unitIds).toEqual(['a1', 'a2'])
  })

  it('never builds a pair from different models', () => {
    const out = runRules(
      requestOf(['overheads']),
      snapshotOf(
        [lockerUnit('k', 'km184'), lockerUnit('n', 'nt5')],
        [km184, nt5]
      )
    )
    expect(out.sources[0].candidates).toEqual([])
    expect(out.sources[0].unfillable).toBe('no_suitable_mic')
  })

  it('uses the best two of a group of three and leaves the third free', () => {
    const out = runRules(
      requestOf(['overheads', 'hihat']),
      snapshotOf(
        [
          lockerUnit('g1', 'km184', {
            matchedPairGroup: 'A',
            condition: 'fair'
          }),
          lockerUnit('g2', 'km184', { matchedPairGroup: 'A' }),
          lockerUnit('g3', 'km184', { matchedPairGroup: 'A' })
        ],
        [km184]
      )
    )
    expect(planOf(out, 0)?.unitIds).toEqual(['g2', 'g3'])
    expect(planOf(out, 1)?.unitIds).toEqual(['g1'])
  })

  it('drops the pair option when a member is in repair', () => {
    const out = runRules(
      requestOf(['overheads']),
      snapshotOf(
        [
          lockerUnit('g1', 'km184', { matchedPairGroup: 'A' }),
          lockerUnit('g2', 'km184', {
            matchedPairGroup: 'A',
            equipmentStatus: 'repair'
          })
        ],
        [km184]
      )
    )
    expect(out.sources[0].unfillable).toBe('no_suitable_mic')
    expect(out.excluded).toContainEqual({
      unitId: 'g2',
      reason: 'status_repair'
    })
  })

  it('falls back to the surviving member plus a loose unit of the same model', () => {
    const out = runRules(
      requestOf(['overheads']),
      snapshotOf(
        [
          lockerUnit('g1', 'km184', { matchedPairGroup: 'A' }),
          lockerUnit('g2', 'km184', {
            matchedPairGroup: 'A',
            equipmentStatus: 'repair'
          }),
          lockerUnit('g3', 'km184')
        ],
        [km184]
      )
    )
    const option = planOf(out)!
    expect(option.unitIds).toEqual(['g1', 'g3'])
    expect(warningCodes(option)).toContain('not_matched')
  })

  it('rejects mics that cannot take the pattern the technique needs', () => {
    const out = runRules(
      requestOf([{ kind: 'overheads', technique: 'xy' }]),
      snapshotOf(
        [lockerUnit('a', 'omni'), lockerUnit('b', 'omni')],
        [ruleMic('omni', { polarPatterns: ['omni'] })]
      )
    )
    expect(out.sources[0].unfillable).toBe('no_suitable_mic')
    expect(out.excluded).toContainEqual({
      unitId: 'a',
      reason: 'pattern_unavailable',
      sourceId: 's1'
    })
  })

  describe('mid-side', () => {
    const ms = [{ kind: 'overheads' as const, technique: 'ms' as const }]

    it('pairs a cardioid-capable mid with a figure-of-eight side, even two units of one model', () => {
      const out = runRules(
        requestOf(ms),
        snapshotOf([lockerUnit('a', 'u87'), lockerUnit('b', 'u87')], [u87])
      )
      const option = planOf(out)!
      expect(option.roles).toEqual(['mid', 'side'])
      expect(option.patternSettings).toEqual(['cardioid', 'figure8'])
      expect(new Set(option.unitIds).size).toBe(2)
    })

    it('allows different models for mid and side', () => {
      const out = runRules(
        requestOf(ms),
        snapshotOf(
          [lockerUnit('k', 'km184'), lockerUnit('u', 'u87')],
          [km184, u87]
        )
      )
      expect(planOf(out)?.unitIds).toEqual(['k', 'u'])
    })

    it('is unfillable with no figure-of-eight microphone', () => {
      const out = runRules(
        requestOf(ms),
        snapshotOf(
          [lockerUnit('a', 'km184'), lockerUnit('b', 'km184')],
          [km184]
        )
      )
      expect(out.sources[0].unfillable).toBe('no_suitable_mic')
    })

    it('cannot use a single unit as both mid and side', () => {
      const out = runRules(
        requestOf(ms),
        snapshotOf([lockerUnit('a', 'u87')], [u87])
      )
      expect(out.sources[0].unfillable).toBe('no_suitable_mic')
    })
  })

  describe('Blumlein and Decca', () => {
    it('needs two figure-of-eight units of one model', () => {
      const blumlein = [
        { kind: 'overheads' as const, technique: 'blumlein' as const }
      ]
      const same = runRules(
        requestOf(blumlein),
        snapshotOf([lockerUnit('a', 'r121'), lockerUnit('b', 'r121')], [r121])
      )
      expect(planOf(same)?.patternSettings).toEqual(['figure8', 'figure8'])
      expect(warningCodes(planOf(same))).toContain('not_matched')

      const mixed = runRules(
        requestOf(blumlein),
        snapshotOf(
          [lockerUnit('a', 'r121'), lockerUnit('b', 'c414')],
          [r121, c414]
        )
      )
      expect(mixed.sources[0].unfillable).toBe('no_suitable_mic')
    })

    it('needs three omni-capable units of one model for a Decca tree', () => {
      const decca = [{ kind: 'ensemble' as const, technique: 'decca' as const }]
      const three = runRules(
        requestOf(decca),
        snapshotOf(
          ['d1', 'd2', 'd3'].map((id) =>
            lockerUnit(id, 'u87', { matchedPairGroup: 'T' })
          ),
          [u87]
        )
      )
      const option = planOf(three)!
      expect(option.roles).toEqual(['left', 'centre', 'right'])
      expect(option.patternSettings).toEqual(['omni', 'omni', 'omni'])
      expect(option.matchedGroup).toBe('T')

      const two = runRules(
        requestOf(decca),
        snapshotOf([lockerUnit('d1', 'u87'), lockerUnit('d2', 'u87')], [u87])
      )
      expect(two.sources[0].unfillable).toBe('no_suitable_mic')
    })
  })

  it('bounds the options it builds for mid-side', () => {
    const units = Array.from({ length: 6 }, (_, i) =>
      lockerUnit(`u${i}`, 'u87')
    )
    const out = runRules(
      requestOf([{ kind: 'overheads', technique: 'ms' }]),
      snapshotOf(units, [u87])
    )
    expect(out.sources[0].candidates.length).toBeLessThanOrEqual(
      CANDIDATES_PER_SOURCE + 1
    )
  })
})

describe('pattern settings', () => {
  const pattern = (kind: Parameters<typeof requestOf>[0][number]) =>
    planOf(
      runRules(
        requestOf([kind]),
        snapshotOf([lockerUnit('a', 'c414'), lockerUnit('b', 'c414')], [c414])
      )
    )?.patternSettings

  it('picks the first preferred pattern the mic offers for the source', () => {
    expect(pattern('vocal_lead')).toEqual(['cardioid'])
    expect(pattern('drum_room')).toEqual(['omni'])
  })

  it('lets the technique decide for stereo sources', () => {
    expect(pattern('overheads')).toEqual(['cardioid', 'cardioid'])
    expect(pattern({ kind: 'overheads', technique: 'blumlein' })).toEqual([
      'figure8',
      'figure8'
    ])
  })

  it('falls back to what the mic has, and scores that below a preferred pattern', () => {
    const odd = ruleMic('odd', {
      transducerType: 'ldc',
      polarPatterns: ['hypercardioid', 'figure8'],
      powering: 'phantom'
    })
    const normal = ruleMic('normal', {
      transducerType: 'ldc',
      polarPatterns: ['cardioid'],
      powering: 'phantom'
    })
    const out = runRules(
      requestOf(['vocal_lead']),
      snapshotOf(
        [lockerUnit('o', 'odd'), lockerUnit('n', 'normal')],
        [odd, normal]
      )
    )
    expect(out.sources[0].candidates.map((c) => c.unitIds[0])).toEqual([
      'n',
      'o'
    ])
    expect(out.sources[0].candidates[1].patternSettings).toEqual([
      'hypercardioid'
    ])
  })
})

describe('scoring and ranking', () => {
  it('prefers a large-diaphragm condenser for lead vocal and a dynamic for spoken word', () => {
    const snapshot = snapshotOf(
      [lockerUnit('d', 'sm58'), lockerUnit('c', 'u87')],
      [sm58, u87]
    )
    expect(
      planOf(runRules(requestOf(['vocal_lead']), snapshot))?.unitIds
    ).toEqual(['c'])
    expect(
      planOf(runRules(requestOf(['spoken_word']), snapshot))?.unitIds
    ).toEqual(['d'])
  })

  it('boosts a mic whose stated applications mention the source', () => {
    const tagged = ruleMic('tagged', { statedApplications: ['Snare drum'] })
    const out = runRules(
      requestOf(['snare_top']),
      snapshotOf(
        [lockerUnit('a-plain', 'sm57'), lockerUnit('z-tagged', 'tagged')],
        [sm57, tagged]
      )
    )
    expect(out.sources[0].candidates[0].unitIds).toEqual(['z-tagged'])
    expect(out.sources[0].candidates[0].reasons.map((r) => r.code)).toContain(
      'application_match'
    )
  })

  it('breaks ties by unit id, not by input order', () => {
    const out = runRules(
      requestOf(['snare_top']),
      snapshotOf([lockerUnit('b', 'sm57'), lockerUnit('a', 'sm57')], [sm57])
    )
    expect(out.sources[0].candidates.map((c) => c.unitIds[0])).toEqual([
      'a',
      'b'
    ])
  })

  it('caps candidates per source', () => {
    const units = 'abcdefgh'.split('').map((id) => lockerUnit(id, 'sm57'))
    const out = runRules(requestOf(['snare_top']), snapshotOf(units, [sm57]))
    expect(out.sources[0].candidates).toHaveLength(CANDIDATES_PER_SOURCE)
  })

  it('always includes the plan pick among the candidates, even when it ranks below the cap', () => {
    const units = 'abcdefg'.split('').map((id) => lockerUnit(id, 'sm57'))
    const out = runRules(
      requestOf(Array(7).fill('snare_top')),
      snapshotOf(units, [sm57])
    )
    for (const source of out.sources) {
      expect(
        source.candidates.map((c) => c.id),
        source.id
      ).toContain(source.planOptionId)
    }
    expect(out.sources[5].candidates).toHaveLength(CANDIDATES_PER_SOURCE + 1)
    expect(out.sources[6].candidates).toHaveLength(CANDIDATES_PER_SOURCE + 1)
  })

  it('gives the same output however the locker is ordered', () => {
    const units = [
      lockerUnit('a', 'u87'),
      lockerUnit('b', 'sm57'),
      lockerUnit('c', 'km184', { matchedPairGroup: 'P' }),
      lockerUnit('d', 'km184', { matchedPairGroup: 'P' }),
      lockerUnit('e', 'sm58', { condition: 'fair' }),
      lockerUnit('f', 'r121', { equipmentStatus: 'repair' })
    ]
    const mics = [u87, sm57, km184, sm58, r121]
    const request = requestOf(['vocal_lead', 'overheads', 'snare_top', 'tom'])
    const forward = runRules(request, snapshotOf(units, mics))
    const shuffled = runRules(
      request,
      snapshotOf([...units].reverse(), [...mics].reverse())
    )
    expect(shuffled).toEqual(forward)
  })
})

describe('allocation', () => {
  const plannedUnits = (out: RulesOutput) =>
    out.sources.flatMap(
      (s) => planOf(out, out.sources.indexOf(s))?.unitIds ?? []
    )

  it('never uses a unit for two sources', () => {
    const snapshot: LockerSnapshot = snapshotOf(
      [lockerUnit('a', 'sm57'), lockerUnit('b', 'sm57')],
      [sm57]
    )
    const out = runRules(requestOf(['snare_top', 'tom', 'hihat']), snapshot)
    const used = plannedUnits(out)
    expect(new Set(used).size).toBe(used.length)
    expect(used).toHaveLength(2)
  })

  it('plans stereo sources before mono ones so a pair is not broken up', () => {
    const out = runRules(
      requestOf(['hihat', 'overheads']),
      snapshotOf(
        [
          lockerUnit('k1', 'km184', { matchedPairGroup: 'A' }),
          lockerUnit('k2', 'km184', { matchedPairGroup: 'A' }),
          lockerUnit('d', 'sm57')
        ],
        [km184, sm57]
      )
    )
    expect(planOf(out, 1)?.unitIds).toEqual(['k1', 'k2'])
    expect(planOf(out, 0)?.unitIds).toEqual(['d'])
  })

  it('plans the source with fewer options first', () => {
    // The loud mic is too quiet for a kick, so only the SM58 can do it. Spoken
    // word prefers the dynamic; the kick must win it.
    const quiet = ruleMic('quiet', {
      transducerType: 'ldc',
      powering: 'phantom',
      maxSplDb: 130
    })
    const out = runRules(
      requestOf(['spoken_word', 'kick_in']),
      snapshotOf(
        [lockerUnit('d', 'sm58'), lockerUnit('q', 'quiet')],
        [sm58, quiet]
      )
    )
    expect(planOf(out, 1)?.unitIds).toEqual(['d'])
    expect(planOf(out, 0)?.unitIds).toEqual(['q'])
  })

  it('gives earlier sources the better mic when options are equal', () => {
    const out = runRules(
      requestOf(['vocal_lead', 'vocal_lead']),
      snapshotOf([lockerUnit('c', 'u87'), lockerUnit('d', 'sm58')], [u87, sm58])
    )
    expect(planOf(out, 0)?.unitIds).toEqual(['c'])
    expect(planOf(out, 1)?.unitIds).toEqual(['d'])
  })

  it('tells "none suitable" apart from "all in use"', () => {
    const out = runRules(
      requestOf(['snare_top', 'snare_top', 'snare_top']),
      snapshotOf([lockerUnit('a', 'sm57'), lockerUnit('b', 'sm57')], [sm57])
    )
    expect(out.sources.map((s) => s.unfillable)).toEqual([
      null,
      null,
      'all_in_use'
    ])
    // Candidates are still shown so the user can see what was wanted.
    expect(out.sources[2].candidates.length).toBeGreaterThan(0)
    expect(out.sources[2].planOptionId).toBeNull()

    const none = runRules(
      requestOf(['kick_in']),
      snapshotOf([lockerUnit('r', 'r121')], [r121])
    )
    expect(none.sources[0].unfillable).toBe('no_suitable_mic')
  })
})

describe('channels', () => {
  const sources = ['overheads', 'snare_top', 'di'] as const

  it('counts every mic plus line sources and reports the overflow', () => {
    const out = runRules(
      requestOf([...sources], { channels: 3 }),
      snapshotOf([], [])
    )
    expect(out.channels).toEqual({ required: 4, available: 3, overflow: 1 })
    const warning = out.warnings.find((w) => w.code === 'channel_overflow')
    expect(warning?.severity).toBe('warning')
  })

  it('makes no claim without a channel count', () => {
    const out = runRules(requestOf([...sources]), snapshotOf([], []))
    expect(out.channels).toEqual({ required: 4, available: null, overflow: 0 })
    expect(out.warnings.map((w) => w.code)).not.toContain('channel_overflow')
  })

  it('raises nothing when the channels fit', () => {
    const out = runRules(
      requestOf([...sources], { channels: 4 }),
      snapshotOf([], [])
    )
    expect(out.channels.overflow).toBe(0)
    expect(out.warnings).toEqual([])
  })
})

// Pins the scoring arithmetic. These numbers are WEIGHTS applied to the
// profile priors; changing a weight or a prior is a deliberate act that needs a
// RULES_VERSION or PROFILES_VERSION bump, the golden scenarios re-checked and
// these numbers updated.
describe('scoring arithmetic', () => {
  const scoreOf = (
    kind: Parameters<typeof requestOf>[0][number],
    mic: ReturnType<typeof ruleMic>,
    unit: Parameters<typeof lockerUnit>[2] = {}
  ) =>
    runRules(
      requestOf([kind]),
      snapshotOf([lockerUnit('u', mic.slug, unit)], [mic])
    ).sources[0].candidates[0].score

  const ldc = (overrides: Parameters<typeof ruleMic>[1] = {}) =>
    ruleMic('x', {
      transducerType: 'ldc',
      powering: 'phantom',
      ...overrides
    })

  it('adds transducer affinity and the first preferred pattern', () => {
    // dynamic affinity 3 on a snare = 30, cardioid is first preferred = +8
    expect(scoreOf('snare_top', ruleMic('x'))).toBe(38)
  })

  it('takes a point off an unrecorded maximum SPL on a loud condenser', () => {
    // ldc affinity 0 on a snare + 8 for the pattern - 2 for no stated SPL
    expect(scoreOf('snare_top', ldc())).toBe(6)
  })

  it('rewards stated headroom, more when comfortable', () => {
    expect(scoreOf('snare_top', ldc({ maxSplDb: 135 }))).toBe(11)
    expect(scoreOf('snare_top', ldc({ maxSplDb: 145 }))).toBe(13)
  })

  it('charges a little for needing a pad', () => {
    expect(scoreOf('snare_top', ldc({ maxSplDb: 125, pads: [10] }))).toBe(5)
  })

  it('adjusts for condition', () => {
    expect(scoreOf('snare_top', ruleMic('x'), { condition: 'new' })).toBe(39)
    expect(scoreOf('snare_top', ruleMic('x'), { condition: 'fair' })).toBe(34)
    expect(
      scoreOf('snare_top', ruleMic('x'), { condition: 'needs_service' })
    ).toBe(8)
  })

  it('adds a bonus for a stated application', () => {
    expect(
      scoreOf('snare_top', ruleMic('x', { statedApplications: ['Snare drum'] }))
    ).toBe(44)
  })

  it('penalises a ribbon in an air blast', () => {
    // ribbon affinity 3 = 30, figure-of-eight is second preferred = +6, -15
    const ribbon = ruleMic('x', {
      transducerType: 'ribbon',
      polarPatterns: ['figure8']
    })
    expect(scoreOf('guitar_cab', ribbon)).toBe(21)
  })

  it('penalises falling back to a pattern outside the preferred list', () => {
    // ldc affinity 3 on a lead vocal = 30, an omni-only mic is -6
    expect(scoreOf('vocal_lead', ldc({ polarPatterns: ['omni'] }))).toBe(24)
  })

  it('adds a bonus for a matched group', () => {
    const score = (group: string | null) =>
      runRules(
        requestOf(['overheads']),
        snapshotOf(
          [
            lockerUnit('a', 'km184', { matchedPairGroup: group }),
            lockerUnit('b', 'km184', { matchedPairGroup: group })
          ],
          [km184]
        )
      ).sources[0].candidates[0].score
    // sdc affinity 3 = 30, cardioid +8 = 38; a matched group adds 8
    expect(score(null)).toBe(38)
    expect(score('A')).toBe(46)
  })
})
