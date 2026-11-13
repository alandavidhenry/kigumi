import { clampToRoom } from './geometry'
import { ITEM_TYPE_DEFAULTS } from './types'

import type { LayoutItemType } from './types'

// Built-in starter templates (free on every plan; saving your own is Pro).
// Positions are fractions of the room (0 to 1, from the top-left) so they fit
// any room, and sizes are drawing defaults in millimetres. Mic items carry no
// unit: choosing real microphones is the studio's job, not the template's.

export interface TemplateItem {
  type: LayoutItemType
  label: string
  fx: number
  fy: number
  rotationDeg?: number
  widthMm?: number
  depthMm?: number
  zMm?: number
  showPattern?: boolean
}

export interface BuiltInTemplate {
  id: string
  name: string
  description: string
  items: TemplateItem[]
}

export const BUILT_IN_TEMPLATES: readonly BuiltInTemplate[] = [
  {
    id: 'band-tracking',
    name: 'Band tracking',
    description: 'Drum kit, bass and guitar amps, and a vocal position.',
    items: [
      { type: 'drum_kit', label: 'Drum kit', fx: 0.5, fy: 0.3 },
      {
        type: 'mic',
        label: 'Kick',
        fx: 0.5,
        fy: 0.22,
        rotationDeg: 180,
        zMm: 300
      },
      {
        type: 'mic',
        label: 'Snare',
        fx: 0.44,
        fy: 0.3,
        rotationDeg: 90,
        zMm: 700
      },
      {
        type: 'mic',
        label: 'Overhead L',
        fx: 0.4,
        fy: 0.3,
        rotationDeg: 180,
        zMm: 2000
      },
      {
        type: 'mic',
        label: 'Overhead R',
        fx: 0.6,
        fy: 0.3,
        rotationDeg: 180,
        zMm: 2000
      },
      { type: 'amp', label: 'Guitar amp', fx: 0.2, fy: 0.55, rotationDeg: 90 },
      {
        type: 'mic',
        label: 'Guitar cab',
        fx: 0.24,
        fy: 0.55,
        rotationDeg: 270,
        zMm: 500
      },
      { type: 'amp', label: 'Bass amp', fx: 0.8, fy: 0.55, rotationDeg: 270 },
      { type: 'di', label: 'Bass DI', fx: 0.8, fy: 0.62 },
      {
        type: 'mic',
        label: 'Lead vocal',
        fx: 0.5,
        fy: 0.7,
        rotationDeg: 0,
        zMm: 1600
      },
      {
        type: 'vocalist',
        label: 'Vocalist',
        fx: 0.5,
        fy: 0.62,
        rotationDeg: 180
      },
      { type: 'gobo', label: 'Gobo', fx: 0.5, fy: 0.45, widthMm: 1500 }
    ]
  },
  {
    id: 'vocal-booth',
    name: 'Vocal booth',
    description: 'A single vocalist with a pop shield position and a chair.',
    items: [
      {
        type: 'mic',
        label: 'Vocal',
        fx: 0.5,
        fy: 0.4,
        rotationDeg: 180,
        zMm: 1600,
        showPattern: true
      },
      { type: 'stand', label: 'Mic stand', fx: 0.5, fy: 0.4 },
      {
        type: 'furniture',
        label: 'Stool',
        fx: 0.5,
        fy: 0.55,
        widthMm: 400,
        depthMm: 400
      },
      { type: 'headphone_amp', label: 'Headphone amp', fx: 0.8, fy: 0.8 }
    ]
  },
  {
    id: 'podcast-two',
    name: 'Two-person podcast',
    description: 'Two presenters facing each other across a table.',
    items: [
      {
        type: 'furniture',
        label: 'Table',
        fx: 0.5,
        fy: 0.5,
        widthMm: 1800,
        depthMm: 900
      },
      {
        type: 'mic',
        label: 'Host',
        fx: 0.4,
        fy: 0.5,
        rotationDeg: 270,
        zMm: 1000
      },
      {
        type: 'mic',
        label: 'Guest',
        fx: 0.6,
        fy: 0.5,
        rotationDeg: 90,
        zMm: 1000
      },
      { type: 'monitor', label: 'Monitor', fx: 0.5, fy: 0.12 }
    ]
  },
  {
    id: 'small-ensemble',
    name: 'Small ensemble',
    description: 'Piano, acoustic guitar and a vocalist with a room pair.',
    items: [
      {
        type: 'instrument',
        label: 'Piano',
        fx: 0.25,
        fy: 0.45,
        widthMm: 1500,
        depthMm: 600,
        rotationDeg: 90
      },
      {
        type: 'mic',
        label: 'Piano L',
        fx: 0.3,
        fy: 0.38,
        rotationDeg: 270,
        zMm: 1300
      },
      {
        type: 'mic',
        label: 'Piano R',
        fx: 0.3,
        fy: 0.52,
        rotationDeg: 270,
        zMm: 1300
      },
      { type: 'instrument', label: 'Acoustic guitar', fx: 0.65, fy: 0.5 },
      {
        type: 'mic',
        label: 'Acoustic guitar',
        fx: 0.62,
        fy: 0.5,
        rotationDeg: 90,
        zMm: 1200
      },
      {
        type: 'mic',
        label: 'Vocal',
        fx: 0.5,
        fy: 0.72,
        rotationDeg: 0,
        zMm: 1600
      },
      {
        type: 'mic',
        label: 'Room L',
        fx: 0.3,
        fy: 0.9,
        rotationDeg: 0,
        zMm: 1800
      },
      {
        type: 'mic',
        label: 'Room R',
        fx: 0.7,
        fy: 0.9,
        rotationDeg: 0,
        zMm: 1800
      }
    ]
  }
]

export function getBuiltInTemplate(id: string): BuiltInTemplate | null {
  return BUILT_IN_TEMPLATES.find((t) => t.id === id) ?? null
}

export interface PlacedItem {
  type: LayoutItemType
  label: string
  xMm: number
  yMm: number
  zMm: number
  rotationDeg: number
  widthMm: number
  depthMm: number
  heightMm: number | null
  showPattern: boolean
}

// Scales a template to a room. Each item is then clamped so its rotated
// footprint stays inside the walls.
export function placeTemplate(
  template: BuiltInTemplate,
  room: { widthMm: number; lengthMm: number }
): PlacedItem[] {
  return template.items.map((item) => {
    const defaults = ITEM_TYPE_DEFAULTS[item.type]
    const widthMm = item.widthMm ?? defaults.widthMm
    const depthMm = item.depthMm ?? defaults.depthMm
    const rotationDeg = item.rotationDeg ?? 0
    const at = clampToRoom(
      {
        xMm: Math.round(item.fx * room.widthMm),
        yMm: Math.round(item.fy * room.lengthMm),
        widthMm,
        depthMm,
        rotationDeg
      },
      room
    )
    return {
      type: item.type,
      label: item.label,
      xMm: at.x,
      yMm: at.y,
      zMm: item.zMm ?? defaults.zMm,
      rotationDeg,
      widthMm,
      depthMm,
      heightMm: defaults.heightMm,
      showPattern: item.showPattern ?? false
    }
  })
}
