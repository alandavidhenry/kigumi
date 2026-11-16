import { displaySize } from './geometry'

import type { Point } from './geometry'
import type { LayoutItemDoc } from './types'

// Simple plan-view symbols for the item types that benefit from one (amp, drum
// kit, vocalist, microphone). Pure data so the Konva editor, the SVG scene and
// the PDF all draw the same thing. Everything is a polygon in millimetres,
// relative to the item's centre, with the item facing plan-up (-y) at 0°.
// These are drawing aids, not scale models.

export type ShapeTone = 'body' | 'accent' | 'detail' | 'beam'

export interface ShapePart {
  tone: ShapeTone
  points: Point[]
}

type Footprint = Pick<LayoutItemDoc, 'type' | 'widthMm' | 'depthMm'>

const CIRCLE_STEPS = 28

function ellipse(cx: number, cy: number, rx: number, ry: number): Point[] {
  return Array.from({ length: CIRCLE_STEPS }, (_, i) => {
    const a = (i / CIRCLE_STEPS) * Math.PI * 2
    return {
      x: Math.round(cx + Math.cos(a) * rx),
      y: Math.round(cy + Math.sin(a) * ry)
    }
  })
}

function rect(cx: number, cy: number, w: number, h: number): Point[] {
  return [
    { x: cx - w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy + h / 2 },
    { x: cx - w / 2, y: cy + h / 2 }
  ]
}

// Six drums as circles, listed as [x, y, radius] fractions of the footprint
// (radius of the shorter side). The drummer sits at the bottom, kick facing up.
const DRUMS: ReadonlyArray<readonly [number, number, number]> = [
  [0, -0.02, 0.19], // kick
  [-0.22, 0.24, 0.13], // snare
  [-0.38, -0.05, 0.1], // hi-hat
  [-0.13, -0.35, 0.12], // rack tom 1
  [0.13, -0.35, 0.12], // rack tom 2
  [0.35, 0.1, 0.14] // floor tom
]

export const HAS_SHAPE: ReadonlySet<string> = new Set([
  'mic',
  'amp',
  'drum_kit',
  'vocalist'
])

export function itemShape(item: Footprint): ShapePart[] | null {
  if (!HAS_SHAPE.has(item.type)) return null

  if (item.type === 'amp') {
    const { widthMm: w, depthMm: d } = item
    return [
      { tone: 'body', points: rect(0, 0, w, d) },
      { tone: 'detail', points: ellipse(0, d * 0.05, w * 0.3, w * 0.3) },
      // Front edge, so it is clear which way the cabinet faces.
      { tone: 'accent', points: rect(0, -d / 2 + d * 0.06, w, d * 0.12) }
    ]
  }

  if (item.type === 'drum_kit') {
    const { widthMm: w, depthMm: d } = item
    const m = Math.min(w, d)
    return DRUMS.map(([x, y, r]) => ({
      tone: 'body' as const,
      points: ellipse(x * w, y * d, r * m, r * m)
    }))
  }

  if (item.type === 'vocalist') {
    // A person from above: shoulders, head and a nose to show facing.
    const { widthMm: w, depthMm: d } = item
    const head = Math.min(d * 0.34, w * 0.26)
    return [
      { tone: 'body', points: ellipse(0, d * 0.06, w / 2, d * 0.44) },
      { tone: 'detail', points: ellipse(0, 0, head, head) },
      {
        tone: 'detail',
        points: [
          { x: -head * 0.3, y: -head * 0.85 },
          { x: 0, y: -head * 1.35 },
          { x: head * 0.3, y: -head * 0.85 }
        ]
      }
    ]
  }

  // Microphone: the capsule, and a beam fanning out from it showing where it
  // points. A symbol, not a pickup pattern (that is the optional overlay).
  const r = displaySize(item).widthMm / 2
  return [
    {
      tone: 'beam',
      points: [
        { x: -r * 0.5, y: -r },
        { x: r * 0.5, y: -r },
        { x: r * 1.7, y: -r * 4.4 },
        { x: -r * 1.7, y: -r * 4.4 }
      ]
    },
    { tone: 'accent', points: ellipse(0, 0, r, r) },
    // Arrowhead at the tip of the beam.
    {
      tone: 'detail',
      points: [
        { x: 0, y: -r * 5.2 },
        { x: -r * 0.8, y: -r * 3.9 },
        { x: r * 0.8, y: -r * 3.9 }
      ]
    }
  ]
}

// Moves a shape into plan coordinates for an item at (x, y) rotated clockwise.
export function placeShape(
  parts: ShapePart[],
  at: Point,
  rotationDeg: number
): ShapePart[] {
  const rad = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return parts.map((part) => ({
    tone: part.tone,
    points: part.points.map((p) => ({
      x: Math.round(at.x + p.x * cos - p.y * sin),
      y: Math.round(at.y + p.x * sin + p.y * cos)
    }))
  }))
}
