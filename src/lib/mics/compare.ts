import { MIC_PATTERN_LABELS } from './types'

import type { MicDetail } from './catalogue'
import type { MicCurveMethod } from './types'

// Overlaid frequency response for a comparison: one curve per mic, so the
// chart stays readable with four mics. Prefers the mic's first listed pattern
// with no filter engaged (its flat, default response).

// How many microphones a comparison takes. Lives here, not in the prompt
// module, so client components can import it without the prompt text.
export const MIN_COMPARE = 2
export const MAX_COMPARE = 4

export interface OverlayCurve {
  key: string
  label: string
  points: Array<[number, number]>
  method: MicCurveMethod
}

export interface OverlaySelection {
  curves: OverlayCurve[]
  // Mics with no frequency-response data, so the page can say so.
  missing: string[]
}

const nameOf = (mic: Pick<MicDetail, 'manufacturer' | 'model'>) =>
  `${mic.manufacturer} ${mic.model}`

export function overlayCurves(mics: readonly MicDetail[]): OverlaySelection {
  const curves: OverlayCurve[] = []
  const missing: string[] = []
  for (const mic of mics) {
    const preferred = mic.polarPatterns[0]
    const unfiltered = mic.frequencyResponses.filter((c) => !c.filterSetting)
    const curve =
      unfiltered.find((c) => c.pattern === preferred) ??
      unfiltered[0] ??
      mic.frequencyResponses[0]
    if (!curve) {
      missing.push(nameOf(mic))
      continue
    }
    const showPattern = mic.polarPatterns.length > 1
    curves.push({
      key: `${mic.id}:${curve.id}`,
      label: showPattern
        ? `${nameOf(mic)} (${MIC_PATTERN_LABELS[curve.pattern]})`
        : nameOf(mic),
      points: curve.points,
      method: curve.method
    })
  }
  return { curves, missing }
}

// "?mics=a,b" to a clean list: trimmed, de-duplicated, in order.
export function parseMicRefs(raw: string | string[] | undefined): string[] {
  const text = Array.isArray(raw) ? raw.join(',') : (raw ?? '')
  return [
    ...new Set(
      text
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    )
  ]
}
