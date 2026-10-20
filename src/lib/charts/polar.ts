import { MIC_PATTERN_A } from '@/lib/mics/types'
import type { MicPolarPattern } from '@/lib/mics/types'

// Pure maths for polar plots (ADR 0006). Angles are degrees, levels are dB
// relative to the on-axis (0°) response.

export const POLAR_FLOOR_DB = -30

export type PolarPoint = readonly [angleDeg: number, db: number]

// First-order pattern r(θ) = A + (1 − A)·cos θ, as a linear magnitude.
export function patternResponse(
  pattern: MicPolarPattern,
  angleDeg: number
): number {
  const a = MIC_PATTERN_A[pattern]
  const theta = (angleDeg * Math.PI) / 180
  return Math.abs(a + (1 - a) * Math.cos(theta))
}

export function toDb(magnitude: number, floorDb = POLAR_FLOOR_DB): number {
  if (magnitude <= 0) return floorDb
  return Math.max(floorDb, 20 * Math.log10(magnitude))
}

// Idealised pattern as dB points every `stepDeg`, 0° to 360° inclusive so the
// path closes. Normalised to the on-axis response.
export function idealisedPolar(
  pattern: MicPolarPattern,
  stepDeg = 5
): PolarPoint[] {
  const onAxis = patternResponse(pattern, 0)
  const points: PolarPoint[] = []
  for (let angle = 0; angle <= 360; angle += stepDeg) {
    points.push([angle, toDb(patternResponse(pattern, angle) / onAxis)])
  }
  return points
}

// Mirrors a half-plot (0° to 180°) onto the full circle and closes the path.
export function mirrorHalfPlot(points: readonly PolarPoint[]): PolarPoint[] {
  const half = points
    .filter(([angle]) => angle >= 0 && angle <= 180)
    .sort((a, b) => a[0] - b[0])
  if (half.length === 0) return []
  const mirrored = half
    .filter(([angle]) => angle > 0 && angle < 180)
    .map(([angle, db]): PolarPoint => [360 - angle, db])
  return [...half, ...mirrored, [360, half[0][1]] as PolarPoint].sort(
    (a, b) => a[0] - b[0]
  )
}

// Clamps to the plot floor, wraps angles into 0-360 and closes the path.
export function normalisePolarPoints(
  points: readonly PolarPoint[]
): PolarPoint[] {
  const sorted = points
    .map(([angle, db]): PolarPoint => [
      angle === 360 ? 360 : ((angle % 360) + 360) % 360,
      Math.max(POLAR_FLOOR_DB, db)
    ])
    .sort((a, b) => a[0] - b[0])
  if (sorted.length === 0) return []
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (last[0] < 360 && first[0] === 0) sorted.push([360, first[1]])
  return sorted
}

// Angle of the rear null of a first-order pattern, or null if it has none.
export function nullAngleDeg(pattern: MicPolarPattern): number | null {
  const a = MIC_PATTERN_A[pattern]
  if (a >= 0.5) return null
  return (Math.acos(-a / (1 - a)) * 180) / Math.PI
}
