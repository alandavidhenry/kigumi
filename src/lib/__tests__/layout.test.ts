import { describe, expect, it } from 'vitest'

import { changedItems, diffItems } from '@/lib/layout/diff'
import {
  clampToRoom,
  displaySize,
  facing,
  fitScale,
  isInsideRoom,
  itemBounds,
  normaliseRotation,
  snapPoint,
  snapRotation,
  snapValue
} from '@/lib/layout/geometry'
import { patternOutline } from '@/lib/layout/pattern'
import { buildLayoutScene } from '@/lib/layout/scene'
import { saveLayoutSchema } from '@/lib/layout/schemas'
import type { SaveLayoutItem } from '@/lib/layout/schemas'
import {
  BUILT_IN_TEMPLATES,
  getBuiltInTemplate,
  placeTemplate
} from '@/lib/layout/templates'
import type { LayoutDoc, LayoutItemDoc } from '@/lib/layout/types'

function item(overrides: Partial<LayoutItemDoc> = {}): LayoutItemDoc {
  return {
    id: 'i1',
    type: 'mic',
    variant: null,
    label: 'Vocal',
    xMm: 1000,
    yMm: 1000,
    zMm: 1500,
    rotationDeg: 0,
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

const room = { widthMm: 5000, lengthMm: 4000 }

describe('geometry', () => {
  it('normalises rotation into [0, 360)', () => {
    expect(normaliseRotation(-90)).toBe(270)
    expect(normaliseRotation(360)).toBe(0)
    expect(normaliseRotation(725)).toBe(5)
  })

  it('snaps to a grid, and does not snap with a step of 0', () => {
    expect(snapValue(124, 50)).toBe(100)
    expect(snapValue(126, 50)).toBe(150)
    expect(snapValue(124.4, 0)).toBe(124)
    expect(snapPoint({ x: 260, y: 90 }, 100)).toEqual({ x: 300, y: 100 })
  })

  it('snaps rotation to 15 degrees and wraps', () => {
    expect(snapRotation(52)).toBe(45)
    expect(snapRotation(353)).toBe(0)
    expect(snapRotation(-10)).toBe(345)
  })

  it('computes rotated bounds', () => {
    const b = itemBounds({
      xMm: 1000,
      yMm: 1000,
      widthMm: 1000,
      depthMm: 200,
      rotationDeg: 90
    })
    expect(Math.round(b.minX)).toBe(900)
    expect(Math.round(b.maxX)).toBe(1100)
    expect(Math.round(b.minY)).toBe(500)
    expect(Math.round(b.maxY)).toBe(1500)
  })

  it('knows when an item is inside the room, with rotation', () => {
    expect(isInsideRoom(item(), room)).toBe(true)
    expect(isInsideRoom(item({ xMm: -100 }), room)).toBe(false)
    // A 1.2 m gobo against the left wall fits flat but not once turned.
    const gobo = item({ widthMm: 1200, depthMm: 100, xMm: 700, yMm: 50 })
    expect(isInsideRoom(gobo, room)).toBe(true)
    expect(isInsideRoom({ ...gobo, rotationDeg: 90, xMm: 40 }, room)).toBe(
      false
    )
  })

  it('clamps an item back inside, and centres one bigger than the room', () => {
    expect(clampToRoom(item({ xMm: -500, yMm: 9000 }), room)).toEqual({
      x: 50,
      y: 3950
    })
    expect(
      clampToRoom(item({ widthMm: 9000, xMm: 100, yMm: 100 }), room).x
    ).toBe(2500)
  })

  it('faces plan-up at 0 and turns clockwise', () => {
    const up = facing(0)
    expect(up.x).toBeCloseTo(0)
    expect(up.y).toBeCloseTo(-1)
    const right = facing(90)
    expect(right.x).toBeCloseTo(1)
    expect(right.y).toBeCloseTo(0)
  })

  it('fits the room to the viewport', () => {
    expect(fitScale(room, { width: 548, height: 1000 }, 24)).toBeCloseTo(
      500 / 5000
    )
  })
})

describe('displaySize', () => {
  it('grows tiny microphones but leaves everything else alone', () => {
    expect(displaySize({ type: 'mic', widthMm: 100, depthMm: 400 })).toEqual({
      widthMm: 250,
      depthMm: 400
    })
    expect(displaySize({ type: 'amp', widthMm: 100, depthMm: 100 })).toEqual({
      widthMm: 100,
      depthMm: 100
    })
  })
})

describe('patternOutline', () => {
  it('reaches furthest on axis for a cardioid and not at all at the rear null', () => {
    const outline = patternOutline({ x: 0, y: 0 }, 0, 'cardioid', 600, 90)
    // 0° (front, plan-up) first; 180° (rear) is the third point.
    expect(outline[0]).toEqual({ x: 0, y: -600 })
    expect(Math.abs(outline[2].x)).toBeLessThan(2)
    expect(Math.abs(outline[2].y)).toBeLessThan(2)
  })

  it('turns with the mic', () => {
    const outline = patternOutline({ x: 0, y: 0 }, 90, 'omni', 600, 90)
    expect(outline[0]).toEqual({ x: 600, y: 0 })
  })
})

describe('buildLayoutScene', () => {
  const layout: LayoutDoc = {
    id: 'l1',
    name: 'Test',
    ...room,
    heightMm: null,
    gridMm: 1000,
    snapMm: 50,
    version: 1,
    items: [
      item({
        id: 'b',
        sortOrder: 2,
        showPattern: true,
        patternSetting: 'cardioid'
      }),
      item({ id: 'a', sortOrder: 1, type: 'amp', label: 'Amp' }),
      item({ id: 'c', sortOrder: 3, xMm: -100 })
    ]
  }

  it('orders by sortOrder and puts grid lines inside the room', () => {
    const scene = buildLayoutScene(layout)
    expect(scene.items.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(scene.gridLines.vertical).toEqual([1000, 2000, 3000, 4000])
    expect(scene.gridLines.horizontal).toEqual([1000, 2000, 3000])
  })

  it('gives only mics an arrow, and a pattern only when shown with a setting', () => {
    const scene = buildLayoutScene(layout)
    const byId = Object.fromEntries(scene.items.map((i) => [i.id, i]))
    expect(byId.a.arrow).toBeNull()
    expect(byId.b.arrow).not.toBeNull()
    expect(byId.b.pattern).not.toBeNull()
    expect(byId.c.pattern).toBeNull()
    expect(scene.hasPattern).toBe(true)
  })

  it('draws a microphone as a symbol of at least 250 mm so it can be seen and grabbed', () => {
    const scene = buildLayoutScene(layout)
    const mic = scene.items.find((i) => i.id === 'b')
    const xs = mic?.polygon.map((p) => p.x) ?? []
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(249)
    const amp = scene.items.find((i) => i.id === 'a')
    const ax = amp?.polygon.map((p) => p.x) ?? []
    expect(Math.max(...ax) - Math.min(...ax)).toBe(100)
  })

  it('flags items outside the room', () => {
    const scene = buildLayoutScene(layout)
    expect(scene.items.find((i) => i.id === 'c')?.outsideRoom).toBe(true)
    expect(scene.items.find((i) => i.id === 'b')?.outsideRoom).toBe(false)
  })
})

describe('saveLayoutSchema', () => {
  const base = {
    id: 'n1',
    type: 'mic',
    xMm: 100,
    yMm: 100,
    widthMm: 100,
    depthMm: 100
  }

  it('accepts a minimal item and fills defaults', () => {
    const parsed = saveLayoutSchema.parse({ version: 1, items: [base] })
    expect(parsed.items[0]).toMatchObject({
      zMm: 0,
      rotationDeg: 0,
      pitchDeg: 0,
      locked: false,
      showPattern: false,
      micUnitId: null,
      label: null
    })
  })

  it('rejects more than 300 items', () => {
    const items = Array.from({ length: 301 }, (_, i) => ({
      ...base,
      id: `n${i}`
    }))
    expect(saveLayoutSchema.safeParse({ version: 1, items }).success).toBe(
      false
    )
  })

  it('rejects fractional, tiny, huge and unknown values', () => {
    const bad = (extra: object) =>
      saveLayoutSchema.safeParse({
        version: 1,
        items: [{ ...base, ...extra }]
      }).success
    expect(bad({ xMm: 10.5 })).toBe(false)
    expect(bad({ widthMm: 5 })).toBe(false)
    expect(bad({ widthMm: 30_000 })).toBe(false)
    expect(bad({ type: 'sofa' })).toBe(false)
    expect(bad({ rotationDeg: 360 })).toBe(false)
    expect(bad({ patternSetting: 'banana' })).toBe(false)
  })

  it('rejects duplicate ids and unsupported grid sizes', () => {
    expect(
      saveLayoutSchema.safeParse({ version: 1, items: [base, base] }).success
    ).toBe(false)
    expect(
      saveLayoutSchema.safeParse({ version: 1, gridMm: 123, items: [] }).success
    ).toBe(false)
  })
})

describe('diffItems', () => {
  const stored = [
    { id: 'a', micUnitId: 'u1', type: 'mic' },
    { id: 'b', micUnitId: null, type: 'amp' }
  ]
  const incoming = (ids: Array<[string, string | null]>) =>
    saveLayoutSchema.parse({
      version: 1,
      items: ids.map(([id, micUnitId]) => ({
        id,
        type: 'mic',
        xMm: 1,
        yMm: 1,
        widthMm: 100,
        depthMm: 100,
        micUnitId
      }))
    }).items

  it('treats a pure move as not structural', () => {
    const d = diffItems(
      stored,
      incoming([
        ['a', 'u1'],
        ['b', null]
      ])
    )
    expect(d.structural).toBe(false)
  })

  it('detects added, removed and unit-changed items', () => {
    const d = diffItems(
      stored,
      incoming([
        ['a', 'u2'],
        ['n', null]
      ])
    )
    expect(d.added.map((i) => i.id)).toEqual(['n'])
    expect(d.removed.map((i) => i.id)).toEqual(['b'])
    expect(d.unitChanged.map((i) => i.id)).toEqual(['a'])
    expect(d.structural).toBe(true)
  })
})

describe('built-in templates', () => {
  it('has the four starters, each findable by id', () => {
    expect(BUILT_IN_TEMPLATES.map((t) => t.id)).toEqual([
      'band-tracking',
      'vocal-booth',
      'podcast-two',
      'small-ensemble'
    ])
    expect(getBuiltInTemplate('vocal-booth')?.name).toBe('Vocal booth')
    expect(getBuiltInTemplate('nope')).toBeNull()
  })

  it('places every item inside rooms of very different sizes, without units', () => {
    for (const size of [
      { widthMm: 2500, lengthMm: 2500 },
      { widthMm: 8000, lengthMm: 6000 }
    ]) {
      for (const template of BUILT_IN_TEMPLATES) {
        for (const placed of placeTemplate(template, size)) {
          expect(
            isInsideRoom(
              {
                xMm: placed.xMm,
                yMm: placed.yMm,
                widthMm: placed.widthMm,
                depthMm: placed.depthMm,
                rotationDeg: placed.rotationDeg
              },
              size
            )
          ).toBe(true)
          expect(placed).not.toHaveProperty('micUnitId')
        }
      }
    }
  })
})

describe('changedItems', () => {
  const base = {
    id: 'a',
    type: 'mic',
    variant: null,
    label: 'Kick',
    xMm: 100,
    yMm: 200,
    zMm: 0,
    rotationDeg: 0,
    pitchDeg: 0,
    widthMm: 100,
    depthMm: 100,
    heightMm: null,
    sortOrder: 0,
    locked: false,
    groupId: null,
    micUnitId: null,
    equipmentItemId: null,
    patternSetting: null,
    showPattern: false,
    recommendationRef: null,
    notes: null
  } as const

  it('keeps only items with a different value', () => {
    const kept = [
      { ...base },
      { ...base, id: 'b', xMm: 150 },
      { ...base, id: 'c', label: 'Snare' }
    ] as SaveLayoutItem[]
    const stored = [{ ...base }, { ...base, id: 'b' }, { ...base, id: 'c' }]
    expect(changedItems(stored, kept).map((i) => i.id)).toEqual(['b', 'c'])
  })

  it('treats undefined and null as the same, and a missing row as changed', () => {
    const kept = [
      { ...base, heightMm: undefined }
    ] as unknown as SaveLayoutItem[]
    expect(changedItems([{ ...base }], kept)).toEqual([])
    expect(changedItems([], kept)).toHaveLength(1)
  })
})
