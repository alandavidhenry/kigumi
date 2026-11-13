import { describe, expect, it } from 'vitest'

import { placeSources } from '@/lib/layout/auto-place'
import { isInsideRoom } from '@/lib/layout/geometry'
import type { LayoutItemDoc } from '@/lib/layout/types'
import type {
  FinalSource,
  FinalUnit,
  FinalView
} from '@/lib/recommendations/finalise'
import { TECHNIQUE_RULES } from '@/lib/recommendations/techniques'
import { SOURCE_KINDS, TECHNIQUES } from '@/lib/recommendations/types'
import { itemLabel, planApply } from '@/lib/sessions/apply-recommendation'
import { ENSEMBLE_PRESETS, expandPreset } from '@/lib/sessions/ensembles'

const SMALL = { widthMm: 3000, lengthMm: 2500 }
const LARGE = { widthMm: 12000, lengthMm: 9000 }

const everyKind = SOURCE_KINDS.map((kind) => ({
  label: `S ${kind}`,
  kind,
  technique: 'mono' as const
}))

function noCollisions(items: { xMm: number; yMm: number }[]) {
  const keys = items.map((i) => `${i.xMm},${i.yMm}`)
  expect(new Set(keys).size).toBe(keys.length)
}

describe('placeSources', () => {
  it.each([SMALL, LARGE])('keeps every item inside the room %o', (room) => {
    const items = placeSources(everyKind, room)
    expect(items.length).toBeGreaterThan(0)
    for (const it of items) expect(isInsideRoom({ ...it }, room)).toBe(true)
    noCollisions(items)
  })

  it('is deterministic', () => {
    expect(placeSources(everyKind, SMALL)).toEqual(
      placeSources(everyKind, SMALL)
    )
  })

  it('labels mic items with itemLabel for every role of every technique', () => {
    for (const technique of TECHNIQUES) {
      const items = placeSources(
        [{ label: 'Room', kind: 'ensemble', technique }],
        LARGE
      )
      const expected = TECHNIQUE_RULES[technique].roles.map(({ role }) =>
        itemLabel({ label: 'Room' } as FinalSource, { role } as FinalUnit)
      )
      expect(items.filter((i) => i.type === 'mic').map((i) => i.label)).toEqual(
        expected
      )
    }
  })

  it('gives DI sources no mic and a di item', () => {
    const items = placeSources(
      [
        { label: 'Bass DI', kind: 'di', technique: 'mono' },
        { label: 'Bass amp', kind: 'bass_cab', technique: 'mono' }
      ],
      SMALL
    )
    expect(
      items.filter((i) => i.label === 'Bass DI').map((i) => i.type)
    ).toEqual(['di'])
    expect(items.filter((i) => i.type === 'mic').map((i) => i.label)).toEqual([
      'Bass amp'
    ])
  })

  it('creates one drum kit for all drum sources', () => {
    const items = placeSources(
      [
        { label: 'Kick', kind: 'kick_in', technique: 'mono' },
        { label: 'Snare', kind: 'snare_top', technique: 'mono' },
        { label: 'OH', kind: 'overheads', technique: 'xy' }
      ],
      SMALL
    )
    expect(items.filter((i) => i.type === 'drum_kit')).toHaveLength(1)
    expect(items.filter((i) => i.type === 'mic')).toHaveLength(4)
  })

  it('lets planApply attach units to the placed mics instead of creating new ones', () => {
    const placed = placeSources(
      [
        { label: 'Lead vocal', kind: 'vocal_lead', technique: 'mono' },
        { label: 'Piano', kind: 'piano', technique: 'xy' }
      ],
      SMALL
    )
    const docs = placed.map(
      (p, i) =>
        ({
          ...p,
          id: `i${i}`,
          variant: null,
          recommendationRef: null,
          micUnitId: null,
          groupId: null,
          patternSetting: null
        }) as unknown as LayoutItemDoc
    )
    const mkSource = (label: string, roles: FinalUnit['role'][]) =>
      ({
        sourceId: label,
        label,
        kind: 'general',
        technique: 'mono',
        micCount: roles.length,
        line: false,
        unfillable: null,
        alternatives: [],
        rulesPickOptionId: null,
        adjusted: null,
        primary: {
          units: roles.map((role, n) => ({
            unitId: `${label}-${n}`,
            role,
            patternSetting: null
          })),
          placement: null
        }
      }) as unknown as FinalSource
    const view = {
      answerable: true,
      summary: null,
      warnings: [],
      sources: [
        mkSource('Lead vocal', ['single']),
        mkSource('Piano', ['left', 'right'])
      ]
    } as FinalView
    const plan = planApply({ resultId: 'r', view, items: docs, room: SMALL })
    expect(plan.create).toHaveLength(0)
    expect(plan.update).toHaveLength(3)
  })

  it.each(ENSEMBLE_PRESETS.map((p) => [p.id, p] as const))(
    'places preset %s without collisions',
    (_id, preset) => {
      for (const room of [SMALL, LARGE]) {
        const items = placeSources(expandPreset(preset), room)
        for (const it of items) expect(isInsideRoom({ ...it }, room)).toBe(true)
        noCollisions(items)
      }
    }
  )
})
