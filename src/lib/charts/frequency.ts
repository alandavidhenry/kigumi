// Pure helpers for frequency-response charts (ADR 0006).

export type FrPoint = readonly [hz: number, db: number]

export const FR_MIN_HZ = 20
export const FR_MAX_HZ = 20000
export const FR_TICKS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]

// The 31 ISO 1/3-octave centres from 20 Hz to 20 kHz.
export const ISO_THIRD_OCTAVES = [
  20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630,
  800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500,
  16000, 20000
] as const

export function formatHz(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : String(hz)
}

// Linear interpolation on a log-frequency axis. Null outside the data range.
export function interpolateDb(
  points: readonly FrPoint[],
  hz: number
): number | null {
  if (points.length === 0) return null
  const sorted = [...points].sort((a, b) => a[0] - b[0])
  if (hz < sorted[0][0] || hz > sorted[sorted.length - 1][0]) return null
  for (let i = 1; i < sorted.length; i++) {
    const [h0, d0] = sorted[i - 1]
    const [h1, d1] = sorted[i]
    if (hz <= h1) {
      if (h1 === h0) return d1
      const t = (Math.log(hz) - Math.log(h0)) / (Math.log(h1) - Math.log(h0))
      return d0 + t * (d1 - d0)
    }
  }
  return sorted[sorted.length - 1][1]
}

// Merges named curves onto one set of frequencies so Recharts can overlay
// them. A curve has no value outside its own range.
export function mergeCurves(
  curves: ReadonlyArray<{ key: string; points: readonly FrPoint[] }>
): Array<Record<string, number>> {
  const frequencies = new Set<number>()
  for (const curve of curves) {
    for (const [hz] of curve.points) frequencies.add(hz)
  }
  return [...frequencies]
    .sort((a, b) => a - b)
    .map((hz) => {
      const row: Record<string, number> = { hz }
      for (const curve of curves) {
        const db = interpolateDb(curve.points, hz)
        if (db !== null) row[curve.key] = Math.round(db * 100) / 100
      }
      return row
    })
}
