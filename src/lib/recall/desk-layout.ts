import { componentSize, snap } from './desk-geometry'
import { DESK_GRID_MM, DESK_LIMITS, VALUE_KINDS } from './desk-types'

import type {
  DeskArea,
  DeskAreaLayout,
  DeskComponent,
  DeskDefaults,
  DeskLayout,
  LibraryKind,
  ValueKind
} from './desk-types'
import type {
  ControlDef,
  ControlType,
  RecallValues,
  StripDefinition
} from './types'

// Building, converting and reading a visual desk (ADR 0023). Pure, with no
// schema imports, so the schemas can use it without a cycle.

export const isValueKind = (kind: string): kind is ValueKind =>
  (VALUE_KINDS as readonly string[]).includes(kind)

export function emptyLayout(): DeskLayout {
  return {
    version: 2,
    heightMm: 400,
    strip: { widthMm: 30, components: [] },
    master: { widthMm: 100, components: [] }
  }
}

export const emptyDefaults = (): DeskDefaults => ({ strip: {}, master: {} })

export function allIds(layout: DeskLayout): Set<string> {
  return new Set(
    [...layout.strip.components, ...layout.master.components].map((c) => c.id)
  )
}

export function findComponent(
  layout: DeskLayout,
  area: DeskArea,
  id: string
): DeskComponent | undefined {
  return layout[area].components.find((c) => c.id === id)
}

export const countValueControls = (layout: DeskLayout, area: DeskArea) =>
  layout[area].components.filter((c) => isValueKind(c.kind)).length

// ---------------------------------------------------------------------------
// Ids

export function slugId(label: string, fallback: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 'c$1')
    .slice(0, 36)
  return base || fallback
}

export function uniqueId(base: string, taken: Set<string>): string {
  let id = base
  for (let n = 2; taken.has(id); n += 1) id = `${base}_${n}`
  return id
}

// A temporary id for a component placed in the editor. It is replaced with
// one made from its label when the template is saved (finaliseIds).
export function tempId(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14)
  return `new_${random.toLowerCase().replace(/[^a-z0-9]/g, '0')}`
}

export const isTempId = (id: string) => id.startsWith('new_')

// Gives every component placed since the last save a readable id from its
// label ("48V" -> "c48v", "Phantom" -> "phantom"), so the input list can
// pre-fill controls named phantom / pad / input, and moves any values recorded
// against the temporary id across. Ids already saved never change.
export function finaliseIds(
  layout: DeskLayout,
  defaults: DeskDefaults
): { layout: DeskLayout; defaults: DeskDefaults } {
  const taken = new Set([...allIds(layout)].filter((id) => !isTempId(id)))
  const next: DeskLayout = structuredClone(layout)
  const values: DeskDefaults = {
    strip: { ...defaults.strip },
    master: { ...defaults.master }
  }
  for (const area of ['strip', 'master'] as const) {
    for (const component of next[area].components) {
      if (!isTempId(component.id)) continue
      const id = uniqueId(slugId(component.label, component.kind), taken)
      taken.add(id)
      if (component.id in values[area]) {
        values[area][id] = values[area][component.id]
        delete values[area][component.id]
      }
      component.id = id
    }
  }
  return { layout: next, defaults: values }
}

// ---------------------------------------------------------------------------
// Grouping: a control belongs to the smallest panel that contains its centre.

const CONTROL_TYPE: Readonly<Record<ValueKind, ControlType>> = {
  knob: 'knob',
  fader: 'knob',
  switch: 'switch',
  selector: 'select',
  text: 'text'
}

export function toControlDef(c: DeskComponent): ControlDef {
  return {
    key: c.id,
    label: c.label,
    type: CONTROL_TYPE[c.kind as ValueKind] ?? 'text',
    ...(c.unit && { unit: c.unit }),
    ...(c.min !== undefined && { min: c.min }),
    ...(c.max !== undefined && { max: c.max }),
    ...(c.options && { options: c.options }),
    ...(c.multi && { multi: true }),
    ...(c.centre !== undefined && { centre: c.centre }),
    ...(c.step !== undefined && { step: c.step }),
    ...(c.taper && { taper: c.taper })
  }
}

const byPosition = (a: DeskComponent, b: DeskComponent) =>
  Math.round(a.y / DESK_GRID_MM) - Math.round(b.y / DESK_GRID_MM) || a.x - b.x

export function panelFor(
  component: DeskComponent,
  panels: DeskComponent[]
): DeskComponent | null {
  const size = componentSize(component)
  const cx = component.x + size.w / 2
  const cy = component.y + size.h / 2
  let best: DeskComponent | null = null
  let bestArea = Infinity
  for (const panel of panels) {
    const p = componentSize(panel)
    if (
      cx >= panel.x &&
      cx <= panel.x + p.w &&
      cy >= panel.y &&
      cy <= panel.y + p.h &&
      p.w * p.h < bestArea
    ) {
      best = panel
      bestArea = p.w * p.h
    }
  }
  return best
}

// The controls of one area, grouped by panel, in reading order. Recall
// validation, pre-fill, the list editor and the printout all work from this.
export function controlsOf(
  layout: DeskLayout,
  area: DeskArea
): StripDefinition {
  const components = layout[area].components
  const panels = components.filter((c) => c.kind === 'panel').sort(byPosition)
  const groups = new Map<DeskComponent | null, DeskComponent[]>()
  for (const component of [...components].sort(byPosition)) {
    if (!isValueKind(component.kind)) continue
    const panel = panelFor(component, panels)
    groups.set(panel, [...(groups.get(panel) ?? []), component])
  }
  const sections = panels
    .filter((p) => groups.has(p))
    .map((p) => ({
      label: p.label || 'Controls',
      controls: groups.get(p)!.map(toControlDef)
    }))
  const loose = groups.get(null)
  if (loose) {
    sections.push({
      label: sections.length
        ? 'Other'
        : area === 'strip'
          ? 'Channel'
          : 'Master',
      controls: loose.map(toControlDef)
    })
  }
  return { sections }
}

// ---------------------------------------------------------------------------
// v1 -> v2: a form-built strip becomes stacked panels, two controls a row,
// keeping every key so recorded values still point at the right control.

const V1_WIDTH = 50
const COLUMN_X = [5, 25]
const HEADER_MM = 7

function v1Kind(control: ControlDef): DeskComponent['kind'] {
  if (control.type === 'switch') return 'switch'
  if (control.type === 'select') return 'selector'
  if (control.type === 'text') return 'text'
  return /fader/i.test(control.key) || /fader/i.test(control.label)
    ? 'fader'
    : 'knob'
}

export function layoutFromStrip(strip: StripDefinition): DeskLayout {
  const components: DeskComponent[] = []
  const taken = new Set(
    strip.sections.flatMap((s) => s.controls.map((c) => c.key))
  )
  let y = 0
  strip.sections.forEach((section, index) => {
    const top = y
    let cursor = top + HEADER_MM
    let column = 0
    let rowHeight = 0
    const newRow = () => {
      if (column > 0) cursor += rowHeight
      column = 0
      rowHeight = 0
    }
    const faders: DeskComponent[] = []
    for (const control of section.controls) {
      const kind = v1Kind(control)
      const base: DeskComponent = {
        id: control.key,
        kind,
        x: 0,
        y: 0,
        label: control.label,
        ...(control.unit && { unit: control.unit }),
        ...(control.min !== undefined && { min: control.min }),
        ...(control.max !== undefined && { max: control.max }),
        ...(control.options && { options: control.options }),
        ...(kind === 'knob' &&
          control.unit === 'Hz' &&
          (control.min ?? 0) > 0 && { taper: 'log' as const })
      }
      if (kind === 'fader') {
        faders.push(base)
        continue
      }
      // Selectors and text boxes take a whole row.
      const wide = kind === 'selector' || kind === 'text'
      if (wide) {
        newRow()
        const component = { ...base, x: COLUMN_X[0], y: cursor, w: 40 }
        components.push(component)
        cursor += componentSize(component).h
        continue
      }
      const component = { ...base, x: COLUMN_X[column], y: cursor }
      components.push(component)
      rowHeight = Math.max(rowHeight, componentSize(component).h)
      column += 1
      if (column === COLUMN_X.length) {
        cursor += rowHeight
        column = 0
        rowHeight = 0
      }
    }
    newRow()
    for (const fader of faders) {
      const component = { ...fader, x: 15, y: cursor }
      components.push(component)
      cursor += componentSize(component).h
    }
    const height = snap(cursor - top + 3, DESK_GRID_MM)
    components.push({
      id: uniqueId(`panel_${index + 1}`, taken),
      kind: 'panel',
      x: 0,
      y: top,
      w: V1_WIDTH,
      h: Math.max(height, 10),
      label: section.label
    })
    y = top + Math.max(height, 10) + DESK_GRID_MM
  })
  return {
    version: 2,
    heightMm: Math.min(
      DESK_LIMITS.heightMm.max,
      Math.max(DESK_LIMITS.heightMm.min, snap(y, DESK_GRID_MM))
    ),
    strip: { widthMm: V1_WIDTH, components },
    master: { widthMm: 0, components: [] }
  }
}

// Keeps only values whose key is a value control of the area. Used where the
// stored JSON could be older than the layout.
export function pickKnown(
  layout: DeskLayout,
  area: DeskArea,
  values: RecallValues
): RecallValues {
  const known = new Set(
    layout[area].components.filter((c) => isValueKind(c.kind)).map((c) => c.id)
  )
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => known.has(key))
  )
}

// ---------------------------------------------------------------------------
// Adding components

const NEW_COMPONENT: Readonly<
  Record<LibraryKind, Omit<DeskComponent, 'id' | 'x' | 'y'>>
> = {
  knob: { kind: 'knob', label: 'Knob', min: 0, max: 10 },
  fader: {
    kind: 'fader',
    label: 'Fader',
    unit: 'dB',
    min: -70,
    max: 10,
    step: 0.5
  },
  switch: { kind: 'switch', label: 'Switch' },
  selector: { kind: 'selector', label: 'Select', options: ['A', 'B'] },
  label: { kind: 'label', label: 'Label', w: 30 },
  panel: { kind: 'panel', label: 'Panel', w: 30, h: 60 }
}

export function newComponent(
  kind: LibraryKind,
  at: { x: number; y: number }
): DeskComponent {
  return {
    id: tempId(),
    x: at.x,
    y: at.y,
    ...structuredClone(NEW_COMPONENT[kind])
  }
}

const overlaps = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

// Whether `component` placed at (x, y) would overlap another component. Boxes
// may touch (shared edges are fine). Panels only collide with panels;
// everything else collides with everything but panels.
export function collidesAt(
  components: readonly DeskComponent[],
  component: DeskComponent,
  x: number,
  y: number
): boolean {
  const { w, h } = componentSize(component)
  const isPanel = component.kind === 'panel'
  const box = { x, y, w, h }
  return components.some(
    (o) =>
      o.id !== component.id &&
      (o.kind === 'panel') === isPanel &&
      overlaps(box, { x: o.x, y: o.y, ...componentSize(o) })
  )
}

// The first free spot, reading top-left to bottom-right, for a component added
// without dropping it (click or keyboard). Panels only avoid other panels;
// everything else avoids everything but panels. Null when the area is full.
export function findFreeSpot(
  area: DeskAreaLayout,
  heightMm: number,
  component: DeskComponent
): { x: number; y: number } | null {
  const { w, h } = componentSize(component)
  const isPanel = component.kind === 'panel'
  const others = area.components
    .filter((c) => c.id !== component.id && (c.kind === 'panel') === isPanel)
    .map((c) => ({ x: c.x, y: c.y, ...componentSize(c) }))
  for (let y = 0; y + h <= heightMm; y += DESK_GRID_MM) {
    for (let x = 0; x + w <= area.widthMm; x += DESK_GRID_MM) {
      const box = { x, y, w, h }
      if (!others.some((o) => overlaps(box, o))) return { x, y }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Editing (pure, so undo is just keeping the previous value)

export function updateComponent(
  layout: DeskLayout,
  area: DeskArea,
  id: string,
  patch: Partial<DeskComponent>
): DeskLayout {
  // A change of position or size that would overlap a neighbour is refused.
  const current = findComponent(layout, area, id)
  if (
    current &&
    (patch.x !== undefined ||
      patch.y !== undefined ||
      patch.w !== undefined ||
      patch.h !== undefined)
  ) {
    const moved = { ...current, ...patch }
    if (collidesAt(layout[area].components, moved, moved.x, moved.y)) {
      return layout
    }
  }
  return {
    ...layout,
    [area]: {
      ...layout[area],
      components: layout[area].components.map((c) => {
        if (c.id !== id) return c
        const next = { ...c, ...patch }
        // An unset optional field is left out, not stored as undefined.
        for (const key of Object.keys(next) as (keyof DeskComponent)[]) {
          if (next[key] === undefined) delete next[key]
        }
        return next
      })
    }
  }
}

// Moves a component, keeping it inside its area. A panel carries the
// components sitting in it.
export function moveComponent(
  layout: DeskLayout,
  area: DeskArea,
  id: string,
  x: number,
  y: number
): DeskLayout {
  const target = findComponent(layout, area, id)
  if (!target) return layout
  const { w, h } = componentSize(target)
  const nx = Math.max(0, Math.min(x, layout[area].widthMm - w))
  const ny = Math.max(0, Math.min(y, layout.heightMm - h))
  const dx = nx - target.x
  const dy = ny - target.y
  if (dx === 0 && dy === 0) return layout
  if (collidesAt(layout[area].components, target, nx, ny)) return layout
  const panels = layout[area].components.filter((c) => c.kind === 'panel')
  const carried =
    target.kind === 'panel'
      ? new Set(
          layout[area].components
            .filter((c) => c.kind !== 'panel' && panelFor(c, panels) === target)
            .map((c) => c.id)
        )
      : new Set<string>()
  return {
    ...layout,
    [area]: {
      ...layout[area],
      components: layout[area].components.map((c) =>
        c.id === id
          ? { ...c, x: nx, y: ny }
          : carried.has(c.id)
            ? { ...c, x: Math.max(0, c.x + dx), y: Math.max(0, c.y + dy) }
            : c
      )
    }
  }
}

export function removeComponent(
  layout: DeskLayout,
  area: DeskArea,
  id: string
): DeskLayout {
  return {
    ...layout,
    [area]: {
      ...layout[area],
      components: layout[area].components.filter((c) => c.id !== id)
    }
  }
}

// Why a component of this kind cannot be added to the area, or null.
export function cannotAdd(
  layout: DeskLayout,
  area: DeskArea,
  kind: DeskComponent['kind']
): string | null {
  if (area === 'master' && layout.master.widthMm === 0) {
    return 'This desk has no master area. Give it a width first.'
  }
  if (isValueKind(kind)) {
    const limit =
      area === 'strip' ? DESK_LIMITS.stripControls : DESK_LIMITS.masterControls
    return countValueControls(layout, area) >= limit
      ? `The ${area === 'strip' ? 'channel strip' : 'master area'} has room for ${limit} controls`
      : null
  }
  const decor = layout[area].components.filter((c) => !isValueKind(c.kind))
  return decor.length >= DESK_LIMITS.decorPerArea
    ? `At most ${DESK_LIMITS.decorPerArea} labels and panels in each area`
    : null
}
