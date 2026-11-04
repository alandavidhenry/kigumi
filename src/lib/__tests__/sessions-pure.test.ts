import { describe, expect, it } from 'vitest'

import type { LayoutItemDoc } from '@/lib/layout/types'
import type { FinalSource, FinalView } from '@/lib/recommendations/finalise'
import { planApply, refFor } from '@/lib/sessions/apply-recommendation'
import {
  cleanTrackName,
  dawCsv,
  dawText,
  trackNames
} from '@/lib/sessions/daw-export'
import {
  dayWindow,
  formatLocalInput,
  localToUtc,
  utcToLocalParts
} from '@/lib/sessions/time'

describe('time', () => {
  it('converts London summer and winter local times to UTC', () => {
    expect(localToUtc('2026-07-01T10:00', 'Europe/London')?.toISOString()).toBe(
      '2026-07-01T09:00:00.000Z'
    )
    expect(localToUtc('2026-12-01T10:00', 'Europe/London')?.toISOString()).toBe(
      '2026-12-01T10:00:00.000Z'
    )
  })

  it('handles other zones and round-trips', () => {
    const d = localToUtc('2026-06-15T09:30', 'America/New_York')
    expect(d?.toISOString()).toBe('2026-06-15T13:30:00.000Z')
    expect(formatLocalInput(d as Date, 'America/New_York')).toBe(
      '2026-06-15T09:30'
    )
  })

  it('moves a time in the spring-forward gap forward, and takes the first autumn repeat', () => {
    // Clocks go 01:00 -> 02:00 on 2026-03-29 in London.
    expect(localToUtc('2026-03-29T01:30', 'Europe/London')?.toISOString()).toBe(
      '2026-03-29T01:30:00.000Z'
    )
    // Clocks go 02:00 -> 01:00 on 2026-10-25; 01:30 happens twice.
    expect(localToUtc('2026-10-25T01:30', 'Europe/London')?.toISOString()).toBe(
      '2026-10-25T00:30:00.000Z'
    )
  })

  it('rejects malformed and impossible dates', () => {
    expect(localToUtc('nonsense', 'UTC')).toBeNull()
    expect(localToUtc('2026-02-31T10:00', 'UTC')).toBeNull()
    expect(localToUtc('2026-13-01T10:00', 'UTC')).toBeNull()
  })

  it('gives a 23 hour day when clocks go forward and 25 when they go back', () => {
    const hours = (day: string) => {
      const w = dayWindow(day, 'Europe/London')
      return ((w?.end.getTime() ?? 0) - (w?.start.getTime() ?? 0)) / 3_600_000
    }
    expect(hours('2026-03-29')).toBe(23)
    expect(hours('2026-10-25')).toBe(25)
    expect(hours('2026-06-01')).toBe(24)
  })

  it('reads local parts', () => {
    expect(
      utcToLocalParts(new Date('2026-07-01T23:30:00Z'), 'Europe/London')
    ).toMatchObject({ day: 2, hour: 0, minute: 30 })
  })
})

describe('DAW track names', () => {
  it('strips forbidden characters and collapses spaces', () => {
    expect(cleanTrackName('Kick/In: "A"?')).toBe('Kick In A')
    expect(cleanTrackName('  Snare   Top ')).toBe('Snare Top')
  })

  it('prefers the DAW name, falls back to source, then to a numbered input', () => {
    const names = trackNames([
      { number: 1, source: 'Kick', dawName: 'KICK_IN' },
      { number: 2, source: 'Snare', dawName: null },
      { number: 3, source: '///', dawName: null }
    ])
    expect(names.map((n) => n.name)).toEqual(['KICK_IN', 'Snare', 'Input 3'])
  })

  it('numbers duplicates case-insensitively and sorts by channel', () => {
    const names = trackNames([
      { number: 3, source: 'tom', dawName: null },
      { number: 1, source: 'Tom', dawName: null },
      { number: 2, source: 'Tom', dawName: null }
    ])
    expect(names).toEqual([
      { number: 1, name: 'Tom' },
      { number: 2, name: 'Tom 2' },
      { number: 3, name: 'tom 3' }
    ])
  })

  it('caps the length', () => {
    const [t] = trackNames([
      { number: 1, source: 'x'.repeat(200), dawName: null }
    ])
    expect(t.name.length).toBe(48)
  })

  it('writes CSV and text, neutralising spreadsheet formulas', () => {
    const rows = [{ number: 1, source: '=SUM(A1)', dawName: null }]
    expect(dawCsv(rows)).toBe("Track,Name\r\n1,'=SUM(A1)\r\n")
    expect(dawText([{ number: 1, source: 'Kick', dawName: null }])).toBe(
      '1. Kick\n'
    )
  })
})

function mic(overrides: Partial<LayoutItemDoc> = {}): LayoutItemDoc {
  return {
    id: 'i1',
    type: 'mic',
    variant: null,
    label: null,
    xMm: 2000,
    yMm: 1500,
    zMm: 1500,
    rotationDeg: 90,
    pitchDeg: 0,
    widthMm: 100,
    depthMm: 100,
    heightMm: 200,
    sortOrder: 0,
    locked: false,
    groupId: null,
    micUnitId: null,
    equipmentItemId: null,
    patternSetting: null,
    showPattern: false,
    recommendationRef: null,
    notes: null,
    ...overrides
  }
}

function source(overrides: Partial<FinalSource> = {}): FinalSource {
  return {
    sourceId: 's1',
    label: 'Snare',
    kind: 'snare_top',
    technique: 'mono',
    micCount: 1,
    line: false,
    unfillable: null,
    primary: {
      optionId: 'o1',
      units: [
        {
          unitId: 'sm57',
          micSlug: 'shure-sm57',
          name: 'Shure SM57',
          role: 'single',
          patternSetting: 'cardioid'
        }
      ],
      matchedGroup: null,
      warnings: [],
      origin: 'ai',
      reasoning: 'Classic.',
      placement: {
        position: 'Over the rim',
        distanceMm: 50,
        angleDeg: 45,
        spacingMm: null,
        includedAngleDeg: null
      }
    },
    alternatives: [],
    rulesPickOptionId: 'o1',
    adjusted: null,
    ...overrides
  }
}

function other(sourceId: string, label: string, unitId: string): FinalSource {
  const base = source()
  return {
    ...source({ sourceId, label }),
    primary: {
      ...(base.primary as NonNullable<FinalSource['primary']>),
      units: [
        {
          unitId,
          micSlug: 'x',
          name: 'X',
          role: 'single',
          patternSetting: null
        }
      ]
    }
  }
}

const view = (...sources: FinalSource[]): FinalView => ({
  answerable: true,
  summary: null,
  sources,
  warnings: []
})
const room = { widthMm: 5000, lengthMm: 4000 }

describe('planApply', () => {
  it('puts the unit on an existing mic with the same label and keeps its position', () => {
    const plan = planApply({
      resultId: 'r1',
      view: view(source()),
      items: [mic({ label: 'snare' })],
      room
    })
    expect(plan.create).toEqual([])
    expect(plan.update).toEqual([
      {
        id: 'i1',
        label: 'Snare',
        micUnitId: 'sm57',
        patternSetting: 'cardioid',
        groupId: null,
        recommendationRef: refFor('r1', 's1', 0)
      }
    ])
    expect(plan.update[0]).not.toHaveProperty('xMm')
  })

  it('stages new mics along the bottom edge instead of inventing positions', () => {
    const plan = planApply({
      resultId: 'r1',
      view: view(source(), other('s2', 'Kick', 'kick-unit')),
      items: [],
      room
    })
    expect(plan.create).toHaveLength(2)
    const [a, b] = plan.create
    expect(a.yMm).toBe(3700)
    expect(b.yMm).toBe(3700)
    expect(b.xMm - a.xMm).toBe(400)
    // The AI's distances are text in the note, never coordinates.
    expect(plan.notes[refFor('r1', 's1', 0)]).toBe(
      'AI placement: Over the rim, 50 mm away, 45° off axis'
    )
  })

  it('is idempotent: a second apply finds the items by reference', () => {
    const first = planApply({
      resultId: 'r1',
      view: view(source()),
      items: [],
      room
    })
    const stored = mic({
      id: 'made',
      label: first.create[0].label,
      micUnitId: first.create[0].micUnitId,
      recommendationRef: first.create[0].recommendationRef,
      xMm: 123
    })
    const second = planApply({
      resultId: 'r1',
      view: view(source()),
      items: [stored],
      room
    })
    expect(second.create).toEqual([])
    expect(second.update.map((u) => u.id)).toEqual(['made'])
  })

  it('labels stereo pairs L/R, groups them, and fills them in order', () => {
    const plan = planApply({
      resultId: 'r1',
      view: view(
        source({
          label: 'Overheads',
          technique: 'xy',
          micCount: 2,
          primary: {
            ...(source().primary as NonNullable<FinalSource['primary']>),
            units: [
              {
                unitId: 'a',
                micSlug: 'a',
                name: 'A',
                role: 'left',
                patternSetting: 'cardioid'
              },
              {
                unitId: 'b',
                micSlug: 'b',
                name: 'B',
                role: 'right',
                patternSetting: 'cardioid'
              }
            ]
          }
        })
      ),
      items: [],
      room
    })
    expect(plan.create.map((c) => c.label)).toEqual([
      'Overheads L',
      'Overheads R'
    ])
    expect(plan.create[0].groupId).toBe('r1:s1')
    expect(plan.create[1].groupId).toBe('r1:s1')
  })

  it('skips sources with no pick, adds line sources as line channels, and skips clashes', () => {
    const none = source({ sourceId: 's2', label: 'Tom', primary: null })
    const line = source({
      sourceId: 's3',
      label: 'Synth',
      line: true,
      primary: null
    })
    const clash = source({ sourceId: 's4', label: 'Snare 2' })
    const plan = planApply({
      resultId: 'r1',
      view: view(source(), none, line, clash),
      items: [],
      room
    })
    expect(plan.skipped).toEqual([
      { sourceId: 's2', label: 'Tom', reason: 'no_pick' },
      { sourceId: 's4', label: 'Snare 2', reason: 'unit_in_use' }
    ])
    expect(plan.lineChannels).toEqual(['Synth'])
    expect(plan.create).toHaveLength(1)
  })

  it('wraps the staging row on a narrow room', () => {
    const many = Array.from({ length: 4 }, (_, i) =>
      source({
        sourceId: `s${i}`,
        label: `M${i}`,
        primary: {
          ...(source().primary as NonNullable<FinalSource['primary']>),
          units: [
            {
              unitId: `u${i}`,
              micSlug: 'x',
              name: 'X',
              role: 'single',
              patternSetting: null
            }
          ]
        }
      })
    )
    const plan = planApply({
      resultId: 'r',
      view: view(...many),
      items: [],
      room: { widthMm: 1100, lengthMm: 3000 }
    })
    const ys = new Set(plan.create.map((c) => c.yMm))
    expect(ys.size).toBeGreaterThan(1)
    expect(plan.create.every((c) => c.xMm <= 1100)).toBe(true)
  })
})
