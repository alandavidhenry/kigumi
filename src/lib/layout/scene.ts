import { displaySize, facing, isInsideRoom, itemCorners } from './geometry'
import { patternOutline } from './pattern'
import { itemShape, placeShape } from './shapes'

import type { Point } from './geometry'
import type { ShapePart } from './shapes'
import type { LayoutDoc, LayoutItemDoc, LayoutItemType } from './types'

// A layout reduced to plain drawing primitives in millimetres (ADR 0016
// decision 5). The session page, share page and PDF all render this same
// scene (SVG on the web, react-pdf's Svg on the server), so Konva only loads
// inside the editor.

export interface SceneItem {
  id: string
  type: LayoutItemType
  polygon: Point[]
  label: string | null
  labelAt: Point
  // Mics: a short arrow showing where the capsule points.
  arrow: { from: Point; to: Point } | null
  // Mics with the overlay on: the idealised pattern outline.
  pattern: Point[] | null
  // Symbol drawn in place of the plain footprint (amp, drum kit, vocalist, mic).
  parts: ShapePart[] | null
  outsideRoom: boolean
}

export interface Scene {
  widthMm: number
  lengthMm: number
  gridLines: { vertical: number[]; horizontal: number[] }
  items: SceneItem[]
  hasPattern: boolean
}

const ARROW_LENGTH_MM = 300

function gridPositions(extent: number, step: number): number[] {
  if (step <= 0) return []
  const lines: number[] = []
  for (let at = step; at < extent; at += step) lines.push(at)
  return lines
}

export function sceneItem(item: LayoutItemDoc, layout: LayoutDoc): SceneItem {
  const centre = { x: item.xMm, y: item.yMm }
  const isMic = item.type === 'mic'
  const axis = facing(item.rotationDeg)
  const arrow = isMic
    ? {
        from: centre,
        to: {
          x: Math.round(centre.x + axis.x * ARROW_LENGTH_MM),
          y: Math.round(centre.y + axis.y * ARROW_LENGTH_MM)
        }
      }
    : null
  const pattern =
    isMic && item.showPattern && item.patternSetting
      ? patternOutline(centre, item.rotationDeg, item.patternSetting, 600)
      : null
  const shape = itemShape({ ...item, ...displaySize(item) })
  return {
    id: item.id,
    type: item.type,
    polygon: itemCorners({ ...item, ...displaySize(item) }).map((p) => ({
      x: Math.round(p.x),
      y: Math.round(p.y)
    })),
    label: item.label,
    labelAt: centre,
    arrow,
    pattern,
    parts: shape ? placeShape(shape, centre, item.rotationDeg) : null,
    outsideRoom: !isInsideRoom(item, layout)
  }
}

export function buildLayoutScene(layout: LayoutDoc): Scene {
  const items = [...layout.items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => sceneItem(item, layout))
  return {
    widthMm: layout.widthMm,
    lengthMm: layout.lengthMm,
    gridLines: {
      vertical: gridPositions(layout.widthMm, layout.gridMm),
      horizontal: gridPositions(layout.lengthMm, layout.gridMm)
    },
    items,
    hasPattern: items.some((i) => i.pattern !== null)
  }
}
