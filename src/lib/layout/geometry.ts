import { ROTATION_SNAP_DEG } from './types'

import type { LayoutItemDoc } from './types'

// Pure geometry for the editor and scene builder. Millimetres and degrees;
// rotation is clockwise seen from above, 0 = facing plan-up.

export interface Point {
  x: number
  y: number
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

type Footprint = Pick<
  LayoutItemDoc,
  'xMm' | 'yMm' | 'widthMm' | 'depthMm' | 'rotationDeg'
>

// A microphone is a few centimetres across, which is a few pixels at room
// scale and too small to grab or to read. It is drawn (and hit-tested) as a
// symbol of at least this size; the stored size is unchanged.
export const MIC_SYMBOL_MM = 250

export function displaySize(
  item: Pick<LayoutItemDoc, 'type' | 'widthMm' | 'depthMm'>
): { widthMm: number; depthMm: number } {
  return item.type === 'mic'
    ? {
        widthMm: Math.max(item.widthMm, MIC_SYMBOL_MM),
        depthMm: Math.max(item.depthMm, MIC_SYMBOL_MM)
      }
    : { widthMm: item.widthMm, depthMm: item.depthMm }
}

export function normaliseRotation(deg: number): number {
  return ((Math.round(deg) % 360) + 360) % 360
}

export function snapValue(value: number, stepMm: number): number {
  if (!stepMm || stepMm <= 0) return Math.round(value)
  return Math.round(value / stepMm) * stepMm
}

export function snapPoint(point: Point, stepMm: number): Point {
  return { x: snapValue(point.x, stepMm), y: snapValue(point.y, stepMm) }
}

export function snapRotation(deg: number, stepDeg = ROTATION_SNAP_DEG): number {
  return normaliseRotation(Math.round(deg / stepDeg) * stepDeg)
}

export function mmToPx(mm: number, pxPerMm: number): number {
  return mm * pxPerMm
}

export function pxToMm(px: number, pxPerMm: number): number {
  return px / pxPerMm
}

// Scale that fits the room in a viewport with a margin.
export function fitScale(
  room: { widthMm: number; lengthMm: number },
  viewport: { width: number; height: number },
  marginPx = 24
): number {
  const w = Math.max(1, viewport.width - marginPx * 2)
  const h = Math.max(1, viewport.height - marginPx * 2)
  return Math.min(w / room.widthMm, h / room.lengthMm)
}

// Corners of an item's footprint after rotation about its centre.
export function itemCorners(item: Footprint): Point[] {
  const rad = (item.rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const hw = item.widthMm / 2
  const hd = item.depthMm / 2
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd]
  ].map(([dx, dy]) => ({
    x: item.xMm + dx * cos - dy * sin,
    y: item.yMm + dx * sin + dy * cos
  }))
}

export function itemBounds(item: Footprint): Bounds {
  const corners = itemCorners(item)
  const xs = corners.map((c) => c.x)
  const ys = corners.map((c) => c.y)
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys)
  }
}

// Tolerance of 1 mm absorbs rounding in the rotated corners.
export function isInsideRoom(
  item: Footprint,
  room: { widthMm: number; lengthMm: number }
): boolean {
  const b = itemBounds(item)
  return (
    b.minX >= -1 &&
    b.minY >= -1 &&
    b.maxX <= room.widthMm + 1 &&
    b.maxY <= room.lengthMm + 1
  )
}

// Moves a centre so the item's rotated footprint stays inside the room. An
// item bigger than the room is centred on that axis.
export function clampToRoom(
  item: Footprint,
  room: { widthMm: number; lengthMm: number }
): Point {
  const b = itemBounds(item)
  const w = b.maxX - b.minX
  const h = b.maxY - b.minY
  let x = item.xMm
  let y = item.yMm
  if (w >= room.widthMm) x = room.widthMm / 2
  else if (b.minX < 0) x -= b.minX
  else if (b.maxX > room.widthMm) x -= b.maxX - room.widthMm
  if (h >= room.lengthMm) y = room.lengthMm / 2
  else if (b.minY < 0) y -= b.minY
  else if (b.maxY > room.lengthMm) y -= b.maxY - room.lengthMm
  return { x: Math.round(x), y: Math.round(y) }
}

// Unit vector an item faces (plan-up at 0°, clockwise).
export function facing(rotationDeg: number): Point {
  const rad = (rotationDeg * Math.PI) / 180
  return { x: Math.sin(rad), y: -Math.cos(rad) }
}
