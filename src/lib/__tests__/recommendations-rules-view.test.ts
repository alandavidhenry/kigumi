import { describe, expect, it } from 'vitest'

import { rulesView } from '@/lib/recommendations/finalise'
import { runRules } from '@/lib/recommendations/rules'
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
  powering: 'phantom'
})
const sm58 = ruleMic('sm58', { manufacturer: 'Shure', model: 'SM58' })

const snapshot = () =>
  snapshotOf([lockerUnit('ua', 'u87'), lockerUnit('ub', 'sm58')], [u87, sm58])

describe('rulesView', () => {
  it("uses the rules' planned option with origin 'rules'", () => {
    const rules = runRules(requestOf(['vocal_lead']), snapshot())
    const view = rulesView(rules, snapshot())
    const source = view.sources[0]
    expect(source.primary?.origin).toBe('rules')
    expect(source.primary?.optionId).toBe(rules.sources[0].planOptionId)
    expect(source.primary?.units[0].name).toMatch(/U 87|SM58/)
    expect(source.alternatives).toEqual([])
    expect(view.answerable).toBe(true)
  })

  it('takes a valid override and ignores an unknown one', () => {
    const rules = runRules(requestOf(['vocal_lead']), snapshot())
    const other = rules.sources[0].candidates.find(
      (c) => c.id !== rules.sources[0].planOptionId
    )!
    expect(
      rulesView(rules, snapshot(), { s1: other.id }).sources[0].primary
        ?.optionId
    ).toBe(other.id)
    expect(
      rulesView(rules, snapshot(), { s1: 'nope' }).sources[0].primary?.optionId
    ).toBe(rules.sources[0].planOptionId)
  })

  it('never gives two sources the same unit', () => {
    const rules = runRules(requestOf(['vocal_lead', 'vocal_lead']), snapshot())
    const view = rulesView(rules, snapshot())
    const ids = view.sources.flatMap((s) =>
      (s.primary?.units ?? []).map((u) => u.unitId)
    )
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(2)
  })

  it('falls back to the next free candidate when an override is taken', () => {
    const rules = runRules(requestOf(['vocal_lead', 'vocal_lead']), snapshot())
    const first = rules.sources[0].candidates[0]
    const clash = rules.sources[1].candidates.find((c) =>
      c.unitIds.some((id) => first.unitIds.includes(id))
    )!
    const view = rulesView(rules, snapshot(), {
      s1: first.id,
      s2: clash.id
    })
    expect(view.sources[0].primary?.optionId).toBe(first.id)
    expect(view.sources[1].primary?.optionId).not.toBe(clash.id)
  })

  it('leaves a source with no candidates without a pick', () => {
    const rules = runRules(requestOf(['vocal_lead']), snapshotOf([], []))
    const view = rulesView(rules, snapshotOf([], []))
    expect(view.sources[0].primary).toBeNull()
    expect(view.sources[0].unfillable).not.toBeNull()
  })
})
