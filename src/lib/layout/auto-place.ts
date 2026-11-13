import type { FinalSource, FinalUnit } from '@/lib/recommendations/finalise'
import {
  TECHNIQUE_RULES,
  techniqueAllowed
} from '@/lib/recommendations/techniques'
import type {
  MicRole,
  SourceKind,
  Technique
} from '@/lib/recommendations/types'
import { itemLabel } from '@/lib/sessions/apply-recommendation'

import { clampToRoom, normaliseRotation } from './geometry'
import { ITEM_TYPE_DEFAULTS } from './types'

import type { PlacedItem } from './templates'
import type { LayoutItemType } from './types'

// Generates a sensible layout from a list of recording sources (session
// wizard). Pure and deterministic. Convention matches the built-in templates:
// the back of the room is the top of the plan (small y) with the drum kit, the
// front / control-room side is the bottom (large y) with vocalists. Rotation
// is clockwise, 0 = facing plan-up. Mic items are labelled with itemLabel so
// planApply attaches the recommended units to them later.

export interface AutoPlaceSource {
  label: string
  kind: SourceKind
  technique: Technique
}

interface Pt {
  x: number
  y: number
}

const DRUM_KINDS: ReadonlySet<SourceKind> = new Set([
  'kick_in',
  'kick_out',
  'snare_top',
  'snare_bottom',
  'hihat',
  'tom',
  'overheads',
  'drum_room'
])
const AMP_KINDS: ReadonlySet<SourceKind> = new Set(['guitar_cab', 'bass_cab'])
const VOCAL_KINDS: ReadonlySet<SourceKind> = new Set([
  'vocal_lead',
  'vocal_backing'
])
const ARC_KINDS: ReadonlySet<SourceKind> = new Set([
  'acoustic_guitar',
  'piano',
  'strings',
  'brass',
  'woodwind',
  'hand_percussion',
  'general'
])
const ROOM_KINDS: ReadonlySet<SourceKind> = new Set([
  'ensemble',
  'room_ambience'
])

const MIN_SEP_MM = 60
const MIC_Z: Partial<Record<SourceKind, number>> = {
  kick_in: 300,
  kick_out: 300,
  snare_top: 700,
  snare_bottom: 500,
  hihat: 1200,
  tom: 900,
  overheads: 2000,
  drum_room: 1800,
  guitar_cab: 500,
  bass_cab: 500,
  vocal_lead: 1600,
  vocal_backing: 1600,
  spoken_word: 1000,
  acoustic_guitar: 1200,
  piano: 1300,
  strings: 1500,
  brass: 1500,
  woodwind: 1500,
  hand_percussion: 1200,
  ensemble: 2000,
  room_ambience: 1800
}

const rad = (deg: number) => (deg * Math.PI) / 180
const fwd = (deg: number): Pt => ({
  x: Math.sin(rad(deg)),
  y: -Math.cos(rad(deg))
})

// Rotation (degrees) that makes something at `from` face `to`.
function lookAt(from: Pt, to: Pt): number {
  return normaliseRotation(
    (Math.atan2(to.x - from.x, -(to.y - from.y)) * 180) / Math.PI
  )
}

// Offsets of each technique role relative to the pair centre, in the pair's
// own frame: side = to its right, ahead = along its facing, turn = degrees.
const ROLE_GEOMETRY: Record<
  Technique,
  Partial<Record<MicRole, { side: number; ahead: number; turn: number }>>
> = {
  mono: { single: { side: 0, ahead: 0, turn: 0 } },
  xy: {
    left: { side: -30, ahead: 0, turn: -45 },
    right: { side: 30, ahead: 0, turn: 45 }
  },
  ortf: {
    left: { side: -85, ahead: 0, turn: -55 },
    right: { side: 85, ahead: 0, turn: 55 }
  },
  nos: {
    left: { side: -150, ahead: 0, turn: -45 },
    right: { side: 150, ahead: 0, turn: 45 }
  },
  ab: {
    left: { side: -300, ahead: 0, turn: 0 },
    right: { side: 300, ahead: 0, turn: 0 }
  },
  blumlein: {
    left: { side: -30, ahead: 0, turn: -45 },
    right: { side: 30, ahead: 0, turn: 45 }
  },
  ms: {
    mid: { side: 0, ahead: 0, turn: 0 },
    side: { side: 0, ahead: -60, turn: 0 }
  },
  decca: {
    left: { side: -750, ahead: -300, turn: -15 },
    centre: { side: 0, ahead: 300, turn: 0 },
    right: { side: 750, ahead: -300, turn: 15 }
  }
}

interface MicSpot {
  label: string
  x: number
  y: number
  rotationDeg: number
}

function roleLabel(sourceLabel: string, role: MicRole): string {
  return itemLabel({ label: sourceLabel } as FinalSource, { role } as FinalUnit)
}

// One mic per technique role around `centre`, the pair facing `faceDeg`.
function micsAround(
  source: AutoPlaceSource,
  centre: Pt,
  faceDeg: number
): MicSpot[] {
  const technique = techniqueAllowed(source.kind, source.technique)
    ? source.technique
    : 'mono'
  const f = fwd(faceDeg)
  const right = { x: -f.y, y: f.x }
  return TECHNIQUE_RULES[technique].roles.map(({ role }) => {
    const g = ROLE_GEOMETRY[technique][role] ?? { side: 0, ahead: 0, turn: 0 }
    return {
      label: roleLabel(source.label, role),
      x: centre.x + right.x * g.side + f.x * g.ahead,
      y: centre.y + right.y * g.side + f.y * g.ahead,
      rotationDeg: faceDeg + g.turn
    }
  })
}

const SPIRAL: readonly Pt[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 }
]

const ANCHOR_STOP = new Set([
  'di',
  'direct',
  'amp',
  'cab',
  'box',
  'input',
  'mic',
  'line'
])
const tokens = (label: string) =>
  label
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !ANCHOR_STOP.has(t))

export function placeSources(
  sources: readonly AutoPlaceSource[],
  room: { widthMm: number; lengthMm: number }
): PlacedItem[] {
  const W = room.widthMm
  const L = room.lengthMm
  const out: PlacedItem[] = []
  const taken: Pt[] = []
  const anchors: Array<{ words: string[]; at: Pt }> = []

  function add(spec: {
    type: LayoutItemType
    label: string
    x: number
    y: number
    rotationDeg?: number
    zMm?: number
    widthMm?: number
    depthMm?: number
  }): Pt {
    const d = ITEM_TYPE_DEFAULTS[spec.type]
    const widthMm = Math.round(spec.widthMm ?? d.widthMm)
    const depthMm = Math.round(spec.depthMm ?? d.depthMm)
    const rotationDeg = normaliseRotation(spec.rotationDeg ?? 0)
    let at: Pt = { x: 0, y: 0 }
    for (let k = 0; k <= 60; k++) {
      const dir = k === 0 ? { x: 0, y: 0 } : SPIRAL[(k - 1) % 4]
      const mag = k === 0 ? 0 : 80 * Math.ceil(k / 4)
      at = clampToRoom(
        {
          xMm: Math.round(spec.x + dir.x * mag),
          yMm: Math.round(spec.y + dir.y * mag),
          widthMm,
          depthMm,
          rotationDeg
        },
        room
      )
      if (!taken.some((t) => Math.hypot(t.x - at.x, t.y - at.y) < MIN_SEP_MM))
        break
    }
    taken.push(at)
    out.push({
      type: spec.type,
      label: spec.label,
      xMm: at.x,
      yMm: at.y,
      zMm: spec.zMm ?? d.zMm,
      rotationDeg,
      widthMm,
      depthMm,
      heightMm: d.heightMm,
      showPattern: false
    })
    return at
  }

  function addMics(
    source: AutoPlaceSource,
    centre: Pt,
    faceDeg: number,
    zMm?: number
  ) {
    for (const m of micsAround(source, centre, faceDeg)) {
      add({
        type: 'mic',
        label: m.label,
        x: m.x,
        y: m.y,
        rotationDeg: m.rotationDeg,
        zMm: zMm ?? MIC_Z[source.kind] ?? ITEM_TYPE_DEFAULTS.mic.zMm
      })
    }
  }

  // Mic centre `dist` ahead of `from` toward `target`, facing back at `from`.
  const micAhead = (from: Pt, target: Pt, dist: number) => {
    const f = fwd(lookAt(from, target))
    const centre = { x: from.x + f.x * dist, y: from.y + f.y * dist }
    return { centre, face: lookAt(centre, from) }
  }

  const by = (pred: (s: AutoPlaceSource) => boolean) => sources.filter(pred)
  const margin = Math.min(600, Math.max(300, Math.min(W, L) * 0.08))

  // ---- Drums: one kit at the back centre -------------------------------
  const drums = by((s) => DRUM_KINDS.has(s.kind))
  let kitBottom = 0
  if (drums.length > 0) {
    const s = Math.min(1, (W * 0.5) / 1800, (L * 0.35) / 1600)
    const kw = Math.round(1800 * s)
    const kd = Math.round(1600 * s)
    const kit = { x: W / 2, y: 300 + kd }
    add({
      type: 'drum_kit',
      label: 'Drum kit',
      x: kit.x,
      y: kit.y,
      widthMm: kw,
      depthMm: kd
    })
    kitBottom = kit.y + kd / 2
    const seen: Partial<Record<SourceKind, number>> = {}
    const toms = drums.filter((d) => d.kind === 'tom').length
    let tomIndex = 0
    for (const src of drums) {
      const k = (seen[src.kind] = (seen[src.kind] ?? -1) + 1)
      const rel = (u: number, v: number): Pt => ({
        x: kit.x + u * kw,
        y: kit.y + v * kd
      })
      const jitter = k * 0.08
      switch (src.kind) {
        case 'kick_out':
        case 'kick_in': {
          const at = rel(jitter, src.kind === 'kick_out' ? -0.55 : -0.32)
          addMics(src, at, 180)
          break
        }
        case 'snare_top':
        case 'snare_bottom': {
          const snare = rel(-0.22 + jitter, 0.24)
          const top = src.kind === 'snare_top'
          const at = {
            x: snare.x + (top ? -0.14 : -0.1) * kw,
            y: snare.y + (top ? -0.1 : 0.12) * kd
          }
          addMics(src, at, lookAt(at, snare))
          break
        }
        case 'hihat': {
          const hat = rel(-0.38 + jitter, -0.05)
          const at = { x: hat.x - 0.04 * kw, y: hat.y - 0.14 * kd }
          addMics(src, at, lookAt(at, hat))
          break
        }
        case 'tom': {
          const u = toms === 1 ? 0.05 : -0.15 + (0.5 * tomIndex) / (toms - 1)
          tomIndex++
          const at = rel(u, -0.33)
          addMics(src, at, lookAt(at, rel(u, -0.05)))
          break
        }
        case 'overheads':
          addMics(src, rel(jitter, -0.15), 180)
          break
        default: {
          // drum_room: out in front of the kit, facing it
          const at = { x: kit.x + k * 0.08 * kw, y: kitBottom + 0.2 * L }
          addMics(src, at, lookAt(at, kit))
        }
      }
    }
  }

  // ---- Amps along the side walls ---------------------------------------
  const amps = by((s) => AMP_KINDS.has(s.kind))
  amps.forEach((src, i) => {
    const left = i % 2 === 0
    const row = Math.floor(i / 2)
    const y = Math.max(L * 0.5, kitBottom + 600) + row * 900
    const at = add({
      type: 'amp',
      label: `${src.label} (amp)`,
      x: left ? 450 : W - 450,
      y,
      rotationDeg: left ? 90 : 270
    })
    anchors.push({ words: tokens(src.label), at })
    addMics(src, { x: at.x + (left ? 450 : -450), y: at.y }, left ? 270 : 90)
  })

  // ---- Vocalists and spoken word ---------------------------------------
  const spoken = by((s) => s.kind === 'spoken_word')
  const table = spoken.length >= 2
  const vocals = by(
    (s) => VOCAL_KINDS.has(s.kind) || (s.kind === 'spoken_word' && !table)
  )
  const vocalY = Math.min(L * 0.74, L - 1000)
  if (vocals.length > 0) {
    const step = Math.min(900, (W - margin * 2) / vocals.length)
    vocals.forEach((src, i) => {
      const at = add({
        type: 'vocalist',
        label: `${src.label} (${src.kind === 'spoken_word' ? 'speaker' : 'singer'})`,
        x: W / 2 + (i - (vocals.length - 1) / 2) * step,
        y: vocalY,
        rotationDeg: 180
      })
      addMics(src, { x: at.x, y: at.y + 450 }, 0)
    })
  }
  if (table) {
    const c = { x: W / 2, y: L * 0.5 }
    const n = spoken.length
    const R = Math.min(Math.min(W, L) * 0.3, 900 + n * 150)
    add({
      type: 'furniture',
      label: 'Table',
      x: c.x,
      y: c.y,
      widthMm: n === 2 ? 1800 : 1200,
      depthMm: n === 2 ? 900 : 1200
    })
    spoken.forEach((src, i) => {
      const f = fwd((i * 360) / n + (n === 2 ? 90 : 0))
      const p = { x: c.x + f.x * R, y: c.y + f.y * R }
      const at = add({
        type: 'vocalist',
        label: `${src.label} (speaker)`,
        x: p.x,
        y: p.y,
        rotationDeg: lookAt(p, c)
      })
      const mic = micAhead(at, c, 450)
      addMics(src, mic.centre, mic.face)
    })
  }

  // ---- Instruments in an arc across the middle -------------------------
  const arc = by((s) => ARC_KINDS.has(s.kind))
  const backEdge = drums.length > 0 ? kitBottom + 500 : margin + 400
  const frontEdge = Math.max(
    backEdge + 400,
    vocals.length > 0 ? vocalY - 500 : L - 900
  )
  const focus = { x: W / 2, y: frontEdge }
  const arcDepth = Math.max(300, frontEdge - backEdge)
  const arcCentreY = (backEdge + frontEdge) / 2
  arc.forEach((src, i) => {
    const n = arc.length
    let p: Pt
    if (n === 1) p = { x: W / 2, y: arcCentreY }
    else {
      const spread = Math.min(75, 25 + 12 * n)
      const phi = -spread + (2 * spread * i) / (n - 1)
      p = {
        x: focus.x + Math.min(W * 0.38, 1000 + n * 250) * Math.sin(rad(phi)),
        y: focus.y - arcDepth * Math.cos(rad(phi))
      }
    }
    const piano = src.kind === 'piano'
    const at = add({
      type: 'instrument',
      label: `${src.label} (position)`,
      x: p.x,
      y: p.y,
      rotationDeg: lookAt(p, focus),
      widthMm: piano ? 1500 : undefined,
      depthMm: piano ? 1100 : undefined
    })
    anchors.push({ words: tokens(src.label), at })
    const mic = micAhead(at, focus, piano ? 1000 : 700)
    addMics(src, mic.centre, mic.face)
  })

  // ---- Ensemble and room mics at the front, facing the room ------------
  const roomMics = by((s) => ROOM_KINDS.has(s.kind))
  roomMics.forEach((src, i) => {
    const x = W / 2 + (i - (roomMics.length - 1) / 2) * Math.min(1500, W * 0.4)
    const centre = { x, y: L - 400 }
    addMics(src, centre, lookAt(centre, { x: W / 2, y: arcCentreY }))
  })

  // ---- DI boxes: beside the related instrument, else along a wall ------
  let wallDis = 0
  for (const src of by((s) => s.kind === 'di')) {
    const words = tokens(src.label)
    const match = anchors.find((a) => a.words.some((w) => words.includes(w)))
    if (match) {
      add({ type: 'di', label: src.label, x: match.at.x, y: match.at.y + 300 })
    } else {
      add({
        type: 'di',
        label: src.label,
        x: W - 300,
        y: L * 0.35 + wallDis * 300
      })
      wallDis++
    }
  }

  return out
}
