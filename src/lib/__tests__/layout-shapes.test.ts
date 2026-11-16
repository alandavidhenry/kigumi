import { describe, expect, it } from 'vitest'

import { itemShape, placeShape } from '@/lib/layout/shapes'
import { ITEM_TYPE_DEFAULTS } from '@/lib/layout/types'

describe('layout item shapes', () => {
  it('draws the drum kit as six circles inside its footprint', () => {
    const { widthMm: w, depthMm: d } = ITEM_TYPE_DEFAULTS.drum_kit
    const parts = itemShape({ type: 'drum_kit', widthMm: w, depthMm: d })
    expect(parts).toHaveLength(6)
    for (const p of parts?.flatMap((part) => part.points) ?? []) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(w / 2 + 1)
      expect(Math.abs(p.y)).toBeLessThanOrEqual(d / 2 + 1)
    }
  })

  it('points the microphone beam toward plan-up at 0 degrees', () => {
    const parts = itemShape({ type: 'mic', widthMm: 100, depthMm: 100 }) ?? []
    const beam = parts.find((p) => p.tone === 'beam')
    expect(beam).toBeDefined()
    expect(Math.max(...(beam?.points.map((p) => p.y) ?? []))).toBeLessThan(0)
  })

  it('rotates a shape clockwise about the item centre', () => {
    const placed = placeShape(
      [{ tone: 'body', points: [{ x: 0, y: -100 }] }],
      { x: 1000, y: 1000 },
      90
    )
    expect(placed[0].points[0]).toEqual({ x: 1100, y: 1000 })
  })

  it('gives plain items no symbol', () => {
    expect(itemShape({ type: 'gobo', widthMm: 1200, depthMm: 100 })).toBeNull()
  })
})
