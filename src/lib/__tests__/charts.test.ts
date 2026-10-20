import { describe, expect, it } from 'vitest'

import {
  FR_TICKS,
  ISO_THIRD_OCTAVES,
  formatHz,
  interpolateDb,
  mergeCurves
} from '@/lib/charts/frequency'
import {
  POLAR_FLOOR_DB,
  idealisedPolar,
  mirrorHalfPlot,
  nullAngleDeg,
  normalisePolarPoints,
  patternResponse,
  toDb
} from '@/lib/charts/polar'
import { MIC_POLAR_PATTERNS } from '@/lib/mics/types'

const at = (pattern: Parameters<typeof idealisedPolar>[0], angle: number) =>
  idealisedPolar(pattern, 1).find(([a]) => a === angle)![1]

describe('patternResponse', () => {
  it('is 1 on axis for every pattern', () => {
    for (const pattern of MIC_POLAR_PATTERNS) {
      expect(patternResponse(pattern, 0)).toBeCloseTo(1)
    }
  })

  it('follows r = A + (1 - A) cos θ', () => {
    expect(patternResponse('cardioid', 90)).toBeCloseTo(0.5)
    expect(patternResponse('cardioid', 180)).toBeCloseTo(0)
    expect(patternResponse('omni', 137)).toBeCloseTo(1)
    expect(patternResponse('figure8', 60)).toBeCloseTo(0.5)
    expect(patternResponse('hypercardioid', 180)).toBeCloseTo(0.5)
  })
})

describe('idealisedPolar', () => {
  it('closes the path from 0 to 360 degrees', () => {
    const points = idealisedPolar('cardioid')
    expect(points[0][0]).toBe(0)
    expect(points[points.length - 1][0]).toBe(360)
    expect(points[0][1]).toBeCloseTo(points[points.length - 1][1])
  })

  it('is 0 dB on axis and -6 dB at 90 degrees for a cardioid', () => {
    expect(at('cardioid', 0)).toBeCloseTo(0)
    expect(at('cardioid', 90)).toBeCloseTo(-6.02, 1)
  })

  it('floors nulls at the plot floor', () => {
    expect(at('cardioid', 180)).toBe(POLAR_FLOOR_DB)
    expect(at('figure8', 90)).toBe(POLAR_FLOOR_DB)
  })

  it('is flat for an omni', () => {
    expect(new Set(idealisedPolar('omni').map(([, db]) => db))).toEqual(
      new Set([0])
    )
  })
})

describe('toDb', () => {
  it('converts magnitudes and clamps silence', () => {
    expect(toDb(1)).toBe(0)
    expect(toDb(0.1)).toBeCloseTo(-20)
    expect(toDb(0)).toBe(POLAR_FLOOR_DB)
    expect(toDb(1e-9)).toBe(POLAR_FLOOR_DB)
  })
})

describe('nullAngleDeg', () => {
  it('finds the rear nulls', () => {
    expect(nullAngleDeg('cardioid')).toBeNull()
    expect(nullAngleDeg('omni')).toBeNull()
    expect(nullAngleDeg('figure8')).toBeCloseTo(90)
    expect(nullAngleDeg('hypercardioid')).toBeCloseTo(109.47, 1)
    expect(nullAngleDeg('supercardioid')).toBeCloseTo(125.97, 1)
  })
})

describe('mirrorHalfPlot', () => {
  it('mirrors 0-180 onto the full circle and closes it', () => {
    const full = mirrorHalfPlot([
      [0, 0],
      [90, -6],
      [180, -20]
    ])
    expect(full.map(([a]) => a)).toEqual([0, 90, 180, 270, 360])
    expect(full[3][1]).toBe(-6)
    expect(full[4][1]).toBe(0)
  })

  it('returns nothing for an empty plot', () => {
    expect(mirrorHalfPlot([])).toEqual([])
  })
})

describe('normalisePolarPoints', () => {
  it('clamps below the floor and closes the path', () => {
    const points = normalisePolarPoints([
      [90, -50],
      [0, 0],
      [180, -10]
    ])
    expect(points[0]).toEqual([0, 0])
    expect(points[1][1]).toBe(POLAR_FLOOR_DB)
    expect(points[points.length - 1]).toEqual([360, 0])
  })
})

describe('frequency helpers', () => {
  it('has 31 ISO third-octave centres spanning 20 Hz to 20 kHz', () => {
    expect(ISO_THIRD_OCTAVES).toHaveLength(31)
    expect(ISO_THIRD_OCTAVES[0]).toBe(20)
    expect(ISO_THIRD_OCTAVES[30]).toBe(20000)
    expect(FR_TICKS[0]).toBe(20)
  })

  it('formats frequencies', () => {
    expect(formatHz(500)).toBe('500')
    expect(formatHz(2000)).toBe('2k')
    expect(formatHz(12500)).toBe('12.5k')
  })

  it('interpolates on a log axis and refuses to extrapolate', () => {
    const curve = [
      [100, 0],
      [10000, 10]
    ] as const
    expect(interpolateDb(curve, 1000)).toBeCloseTo(5)
    expect(interpolateDb(curve, 50)).toBeNull()
    expect(interpolateDb(curve, 20000)).toBeNull()
    expect(interpolateDb([], 1000)).toBeNull()
  })

  it('merges curves onto shared frequencies without inventing values', () => {
    const rows = mergeCurves([
      {
        key: 'a',
        points: [
          [100, 0],
          [1000, 2]
        ]
      },
      {
        key: 'b',
        points: [
          [500, -1],
          [2000, 1]
        ]
      }
    ])
    expect(rows.map((row) => row.hz)).toEqual([100, 500, 1000, 2000])
    expect(rows[0].b).toBeUndefined()
    expect(rows[3].a).toBeUndefined()
    expect(rows[1].a).toBeGreaterThan(0)
  })
})
