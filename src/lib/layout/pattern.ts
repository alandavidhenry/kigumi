import { idealisedPolar } from '@/lib/charts/polar'
import type { MicPolarPattern } from '@/lib/mics/types'

import { facing } from './geometry'

import type { Point } from './geometry'

// Outline of an idealised pickup pattern, drawn around a mic in plan view. It
// shows the SHAPE of the pattern (relative sensitivity by angle), not how far
// the mic reaches, and the UI says so. `sizeMm` is the radius of the on-axis
// lobe; the -30 dB floor maps to the centre.

export const PATTERN_FLOOR_DB = -30
export const PATTERN_NOTE = 'Idealised pattern (shape only, not reach)'

export function patternOutline(
  centre: Point,
  rotationDeg: number,
  pattern: MicPolarPattern,
  sizeMm: number,
  stepDeg = 10
): Point[] {
  const axis = facing(rotationDeg)
  // Perpendicular, clockwise seen from above.
  const side = { x: -axis.y, y: axis.x }
  return idealisedPolar(pattern, stepDeg).map(([angle, db]) => {
    const r = Math.max(0, 1 + db / -PATTERN_FLOOR_DB) * sizeMm
    const rad = (angle * Math.PI) / 180
    const along = Math.cos(rad) * r
    const across = Math.sin(rad) * r
    return {
      x: Math.round(centre.x + axis.x * along + side.x * across) || 0,
      y: Math.round(centre.y + axis.y * along + side.y * across) || 0
    }
  })
}
