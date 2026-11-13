import { describe, expect, it } from 'vitest'

import {
  moveTile,
  resolveLayout,
  savedLayoutSchema,
  toSavedLayout,
  type TileId
} from '@/lib/dashboard/tiles'

const available: TileId[] = ['wizards', 'sessions', 'maintenance', 'usage']

describe('resolveLayout', () => {
  it('uses the default order with nothing saved', () => {
    expect(resolveLayout(available, null)).toEqual({
      visible: available,
      hidden: []
    })
  })

  it('applies a saved order and hidden tiles', () => {
    const result = resolveLayout(available, {
      order: ['usage', 'sessions', 'wizards', 'maintenance'],
      hidden: ['sessions']
    })
    expect(result.visible).toEqual(['usage', 'wizards', 'maintenance'])
    expect(result.hidden).toEqual(['sessions'])
  })

  it('drops tiles the person can no longer see', () => {
    const result = resolveLayout(['wizards', 'usage'], {
      order: ['pat', 'usage', 'wizards'],
      hidden: ['pat']
    })
    expect(result).toEqual({ visible: ['usage', 'wizards'], hidden: [] })
  })

  it('places a new tile after the one before it by default', () => {
    const result = resolveLayout(available, {
      order: ['sessions', 'usage', 'wizards'],
      hidden: []
    })
    expect(result.visible).toContain('maintenance')
    expect(result.visible.indexOf('maintenance')).toBe(
      result.visible.indexOf('sessions') + 1
    )
  })

  it('puts a new first tile at the top', () => {
    const result = resolveLayout(['wizards', 'usage'], {
      order: ['usage'],
      hidden: []
    })
    expect(result.visible).toEqual(['wizards', 'usage'])
  })

  it('ignores duplicates', () => {
    const result = resolveLayout(['wizards', 'usage'], {
      order: ['usage', 'usage', 'wizards'],
      hidden: ['wizards', 'wizards']
    })
    expect(result).toEqual({ visible: ['usage'], hidden: ['wizards'] })
  })
})

describe('toSavedLayout', () => {
  it('round-trips through resolveLayout', () => {
    const layout = {
      visible: ['usage', 'wizards'] as TileId[],
      hidden: ['sessions'] as TileId[]
    }
    const saved = toSavedLayout(layout)
    expect(resolveLayout(['wizards', 'sessions', 'usage'], saved)).toEqual(
      layout
    )
  })
})

describe('savedLayoutSchema', () => {
  it('rejects unknown tiles', () => {
    expect(
      savedLayoutSchema.safeParse({ order: ['nope'], hidden: [] }).success
    ).toBe(false)
  })
  it('accepts a valid layout', () => {
    expect(
      savedLayoutSchema.safeParse({ order: ['usage'], hidden: [] }).success
    ).toBe(true)
  })
})

describe('moveTile', () => {
  it('moves forward and back', () => {
    expect(moveTile(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveTile(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })
  it('clamps and ignores no-ops', () => {
    expect(moveTile(['a', 'b'], 0, 9)).toEqual(['b', 'a'])
    expect(moveTile(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
    expect(moveTile(['a', 'b'], 5, 0)).toEqual(['a', 'b'])
  })
})
