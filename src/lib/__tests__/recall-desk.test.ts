import { describe, expect, it } from 'vitest'

import {
  GENERIC_ANALOGUE_DESK,
  GENERIC_ANALOGUE_STRIP
} from '@/lib/recall/builtin'
import { readLayout } from '@/lib/recall/consoles'
import {
  componentSize,
  dragValue,
  editableText,
  formatValue,
  fromNorm,
  knobAngle,
  parseTypedValue,
  selectorButtons,
  snap,
  stepValue,
  toNorm
} from '@/lib/recall/desk-geometry'
import {
  controlsOf,
  cannotAdd,
  emptyLayout,
  finaliseIds,
  collidesAt,
  findFreeSpot,
  layoutFromStrip,
  moveComponent,
  newComponent,
  panelFor,
  pickKnown,
  removeComponent,
  slugId,
  tempId,
  updateComponent
} from '@/lib/recall/desk-layout'
import { reconcileValues } from '@/lib/recall/desk-reconcile'
import type { DeskComponent, DeskLayout } from '@/lib/recall/desk-types'
import { recallLines } from '@/lib/recall/format'
import { prefillChannels } from '@/lib/recall/prefill'
import {
  deskLayoutSchema,
  templateInputSchema,
  validateValues
} from '@/lib/recall/schemas'
import type { StripDefinition } from '@/lib/recall/types'

const knob = (extra: Partial<DeskComponent> = {}): DeskComponent => ({
  id: 'k',
  kind: 'knob',
  x: 0,
  y: 0,
  label: 'Knob',
  ...extra
})

const layoutWith = (
  strip: DeskComponent[],
  master: DeskComponent[] = []
): DeskLayout => ({
  version: 2,
  heightMm: 300,
  strip: { widthMm: 40, components: strip },
  master: { widthMm: 100, components: master }
})

describe('the shipped generic analogue desk', () => {
  it('is a valid desk with the controls the input list pre-fills', () => {
    const parsed = deskLayoutSchema.safeParse(GENERIC_ANALOGUE_DESK)
    expect(parsed.success).toBe(true)
    const keys = GENERIC_ANALOGUE_STRIP.sections.flatMap((s) =>
      s.controls.map((c) => c.key)
    )
    expect(keys).toEqual(expect.arrayContaining(['phantom', 'pad', 'input']))
  })

  it('keeps every component inside its area', () => {
    for (const area of ['strip', 'master'] as const) {
      for (const c of GENERIC_ANALOGUE_DESK[area].components) {
        const { w, h } = componentSize(c)
        expect(c.x + w, c.id).toBeLessThanOrEqual(
          GENERIC_ANALOGUE_DESK[area].widthMm
        )
        expect(c.y + h, c.id).toBeLessThanOrEqual(
          GENERIC_ANALOGUE_DESK.heightMm
        )
      }
    }
  })

  it('groups controls by the panel they sit in', () => {
    expect(GENERIC_ANALOGUE_STRIP.sections.map((s) => s.label)).toEqual([
      'Input',
      'EQ',
      'Aux sends',
      'Output'
    ])
    expect(
      controlsOf(GENERIC_ANALOGUE_DESK, 'master').sections.map((s) => s.label)
    ).toEqual(['Aux masters', 'Monitor', 'Buses', 'Main'])
  })
})

describe('geometry', () => {
  it('snaps to the grid', () => {
    expect(snap(12, 5)).toBe(10)
    expect(snap(13, 5)).toBe(15)
    expect(snap(13, 0)).toBe(13)
  })

  it('round-trips values through the drag position, linear and log', () => {
    const gain = knob({ min: 0, max: 70, step: 0.5 })
    expect(fromNorm(gain, toNorm(gain, 32))).toBe(32)
    const freq = knob({ min: 20, max: 20000, taper: 'log', unit: 'Hz' })
    expect(toNorm(freq, 632)).toBeCloseTo(0.5, 2)
    expect(fromNorm(freq, 0.5)).toBe(630)
    expect(fromNorm(freq, 1)).toBe(20000)
  })

  it('turns a vertical drag into a value, finer with Shift, within range', () => {
    const eq = knob({ min: -18, max: 18, centre: 0, step: 0.5 })
    // Nothing recorded: the drag starts from the centre detent.
    expect(dragValue(eq, undefined, 0, false)).toBe(0)
    expect(dragValue(eq, 0, 100, false)).toBe(18)
    expect(dragValue(eq, 0, 100, true)).toBe(2)
    expect(dragValue(eq, 0, -1000, false)).toBe(-18)
    const fader = knob({ kind: 'fader', min: -70, max: 10 })
    expect(dragValue(fader, undefined, 0, false)).toBe(-70)
  })

  it('steps with the keyboard', () => {
    const gain = knob({ min: 0, max: 70, step: 0.5 })
    expect(stepValue(gain, 10, 1)).toBe(10.5)
    expect(stepValue(gain, 70, 1)).toBe(70)
    expect(stepValue(gain, undefined, 1)).toBe(0)
    expect(stepValue(knob({ min: 0, max: 10 }), 5, -1)).toBe(4.9)
  })

  it('maps the knob pointer through 270 degrees', () => {
    expect(knobAngle(0)).toBe(-135)
    expect(knobAngle(0.5)).toBe(0)
    expect(knobAngle(1)).toBe(135)
  })

  it('sizes and lays out selector buttons from their width', () => {
    const routing = knob({
      kind: 'selector',
      options: ['1-2', '3-4', 'L-R', 'Dir']
    })
    const size = componentSize(routing)
    expect(size.w).toBe(37)
    const buttons = selectorButtons(routing)
    expect(buttons).toHaveLength(4)
    expect(buttons[3].y).toBeGreaterThan(buttons[0].y)
    const narrow = componentSize({ ...routing, w: 15 })
    expect(narrow.h).toBeGreaterThan(size.h)
  })
})

describe('reading and typing values', () => {
  it('formats pan, bipolar dB, kHz, switches and multi-select', () => {
    const pan = { unit: 'L/R', min: -100 }
    expect(formatValue(pan, -30)).toBe('L30')
    expect(formatValue(pan, 0)).toBe('C')
    expect(formatValue(pan, 12)).toBe('R12')
    expect(formatValue({ unit: 'dB', min: -18 }, 3)).toBe('+3 dB')
    expect(formatValue({ unit: 'dB', min: 0 }, 32)).toBe('32 dB')
    expect(formatValue({ unit: 'Hz' }, 2500)).toBe('2.5 kHz')
    expect(formatValue({}, true)).toBe('on')
    expect(formatValue({}, ['1-2', 'L-R'])).toBe('1-2, L-R')
    expect(formatValue({}, [])).toBe('none')
  })

  it('parses numbers with units, pan sides and kHz', () => {
    const eq = knob({ unit: 'dB', min: -18, max: 18 })
    expect(parseTypedValue(eq, '+3 dB')).toEqual({ ok: true, value: 3 })
    expect(parseTypedValue(eq, '')).toEqual({ ok: true, value: undefined })
    expect(parseTypedValue(eq, '30')).toEqual({
      ok: false,
      error: 'Knob is at most 18'
    })
    expect(parseTypedValue(eq, 'loud').ok).toBe(false)
    const pan = knob({ unit: 'L/R', min: -100, max: 100 })
    expect(parseTypedValue(pan, 'L30')).toEqual({ ok: true, value: -30 })
    expect(parseTypedValue(pan, 'c')).toEqual({ ok: true, value: 0 })
    const freq = knob({ unit: 'Hz', min: 20, max: 20000 })
    expect(parseTypedValue(freq, '2.5k')).toEqual({ ok: true, value: 2500 })
    expect(parseTypedValue(freq, '2.5 kHz')).toEqual({ ok: true, value: 2500 })
  })

  it('parses switches, selectors and text', () => {
    const sw = knob({ kind: 'switch' })
    expect(parseTypedValue(sw, 'On')).toEqual({ ok: true, value: true })
    expect(parseTypedValue(sw, 'off')).toEqual({ ok: true, value: false })
    expect(parseTypedValue(sw, 'maybe').ok).toBe(false)
    const source = knob({ kind: 'selector', options: ['Mic', 'Line'] })
    expect(parseTypedValue(source, 'line')).toEqual({ ok: true, value: 'Line' })
    expect(parseTypedValue(source, 'Tape').ok).toBe(false)
    const routing = knob({
      kind: 'selector',
      multi: true,
      options: ['1-2', '3-4', 'L-R']
    })
    // Kept in the selector's own order, without repeats.
    expect(parseTypedValue(routing, 'l-r, 1-2, 1-2')).toEqual({
      ok: true,
      value: ['1-2', 'L-R']
    })
    expect(parseTypedValue(routing, 'none')).toEqual({ ok: true, value: [] })
    expect(parseTypedValue(routing, '5-6').ok).toBe(false)
    expect(parseTypedValue(knob({ kind: 'text' }), 'x'.repeat(61)).ok).toBe(
      false
    )
    expect(parseTypedValue(knob({ kind: 'label' }), 'x').ok).toBe(false)
  })

  it('puts a value back into the box the way it can be typed', () => {
    expect(editableText(knob({ unit: 'L/R' }), -20)).toBe('L20')
    expect(editableText(knob(), 3.25)).toBe('3.25')
    expect(editableText(knob(), undefined)).toBe('')
    expect(editableText(knob({ kind: 'switch' }), false)).toBe('off')
    expect(editableText(knob({ kind: 'selector' }), ['a', 'b'])).toBe('a, b')
  })
})

describe('the desk schema', () => {
  it('rejects duplicate ids across the strip and master areas', () => {
    const layout = layoutWith([knob({ id: 'a' })], [knob({ id: 'a' })])
    expect(deskLayoutSchema.safeParse(layout).success).toBe(false)
  })

  it('needs labels, selector options, a sane range and a log minimum', () => {
    const bad = [
      knob({ label: '' }),
      knob({ kind: 'selector' }),
      knob({ kind: 'selector', options: ['A', 'A'] }),
      knob({ min: 5, max: 1 }),
      knob({ taper: 'log', min: 0, max: 10 }),
      knob({ min: 0, max: 10, centre: 20 })
    ]
    for (const component of bad) {
      expect(
        deskLayoutSchema.safeParse(layoutWith([component])).success,
        JSON.stringify(component)
      ).toBe(false)
    }
    // A panel may be unlabelled.
    expect(
      deskLayoutSchema.safeParse(
        layoutWith([knob({ kind: 'panel', label: '' })])
      ).success
    ).toBe(true)
  })

  it('limits controls per area', () => {
    const many = Array.from({ length: 81 }, (_, i) => knob({ id: `k${i}` }))
    expect(deskLayoutSchema.safeParse(layoutWith(many)).success).toBe(false)
    expect(deskLayoutSchema.safeParse(layoutWith([], many)).success).toBe(true)
  })

  it('accepts a v1 strip on the way in and converts it', () => {
    const parsed = templateInputSchema.parse({
      name: 'Old',
      strip: {
        sections: [
          {
            label: 'Input',
            controls: [{ key: 'gain', label: 'Gain', type: 'knob' }]
          }
        ]
      }
    })
    expect(parsed.strip).toMatchObject({ version: 2 })
  })
})

describe('v1 strips become desks', () => {
  const v1: StripDefinition = {
    sections: [
      {
        label: 'Input',
        controls: [
          {
            key: 'input',
            label: 'Source',
            type: 'select',
            options: ['Mic', 'Line']
          },
          {
            key: 'gain',
            label: 'Gain',
            type: 'knob',
            unit: 'dB',
            min: 0,
            max: 70
          },
          { key: 'phantom', label: '48V', type: 'switch' },
          {
            key: 'hpf',
            label: 'HPF',
            type: 'knob',
            unit: 'Hz',
            min: 20,
            max: 400
          }
        ]
      },
      {
        label: 'Output',
        controls: [
          { key: 'pan', label: 'Pan', type: 'text' },
          { key: 'fader', label: 'Fader', type: 'knob', min: -70, max: 10 }
        ]
      }
    ]
  }

  it('keeps every key and the same grouping', () => {
    const layout = layoutFromStrip(v1)
    expect(deskLayoutSchema.safeParse(layout).success).toBe(true)
    expect(controlsOf(layout, 'strip')).toEqual({
      sections: [
        {
          label: 'Input',
          controls: [
            expect.objectContaining({ key: 'input', type: 'select' }),
            expect.objectContaining({ key: 'gain', type: 'knob' }),
            expect.objectContaining({ key: 'phantom', type: 'switch' }),
            expect.objectContaining({ key: 'hpf', type: 'knob', taper: 'log' })
          ]
        },
        {
          label: 'Output',
          controls: [
            expect.objectContaining({ key: 'pan', type: 'text' }),
            expect.objectContaining({ key: 'fader', type: 'knob' })
          ]
        }
      ]
    })
    expect(layout.strip.components.find((c) => c.id === 'fader')?.kind).toBe(
      'fader'
    )
  })

  it('reads stored JSON of either version, and junk as an empty desk', () => {
    expect(readLayout(v1).strip.components.length).toBe(8)
    expect(readLayout(GENERIC_ANALOGUE_DESK)).toEqual(GENERIC_ANALOGUE_DESK)
    const junk = readLayout({ nope: 1 })
    expect(junk.strip.components).toEqual([])
    expect(junk.master.widthMm).toBe(0)
  })
})

describe('grouping and ids', () => {
  it('puts a control in the smallest panel containing its centre', () => {
    const outer = knob({
      id: 'outer',
      kind: 'panel',
      x: 0,
      y: 0,
      w: 40,
      h: 100
    })
    const inner = knob({ id: 'inner', kind: 'panel', x: 0, y: 0, w: 40, h: 40 })
    expect(panelFor(knob({ x: 10, y: 5 }), [outer, inner])?.id).toBe('inner')
    expect(panelFor(knob({ x: 10, y: 60 }), [outer, inner])?.id).toBe('outer')
    expect(panelFor(knob({ x: 10, y: 200 }), [outer, inner])).toBeNull()
  })

  it('names loose controls after their area', () => {
    const layout = layoutWith([knob()], [knob({ id: 'm' })])
    expect(controlsOf(layout, 'strip').sections[0].label).toBe('Channel')
    expect(controlsOf(layout, 'master').sections[0].label).toBe('Master')
  })

  it('makes readable ids for new components and moves their values across', () => {
    expect(slugId('48V', 'switch')).toBe('c48v')
    expect(slugId('!!!', 'switch')).toBe('switch')
    const a = tempId()
    const b = tempId()
    expect(a).toMatch(/^new_[a-z0-9]+$/)
    const layout = layoutWith(
      [
        knob({ id: 'gain', label: 'Gain' }),
        knob({ id: a, label: 'Gain' }),
        knob({ id: b, label: 'Phantom', kind: 'switch' })
      ],
      [knob({ id: 'x', label: 'X' })]
    )
    const result = finaliseIds(layout, {
      strip: { [a]: 3, gain: 1, [b]: true },
      master: {}
    })
    expect(result.layout.strip.components.map((c) => c.id)).toEqual([
      'gain',
      'gain_2',
      'phantom'
    ])
    expect(result.defaults.strip).toEqual({ gain: 1, gain_2: 3, phantom: true })
    // The input is not changed.
    expect(layout.strip.components[1].id).toBe(a)
  })

  it('keeps only values for controls that exist', () => {
    const layout = layoutWith([knob(), knob({ id: 'p', kind: 'panel' })])
    expect(pickKnown(layout, 'strip', { k: 1, p: 2, z: 3 })).toEqual({ k: 1 })
  })

  it('starts a new template with an empty strip and a master area', () => {
    expect(emptyLayout()).toMatchObject({
      strip: { components: [] },
      master: { widthMm: 100 }
    })
  })
})

describe('reconcileValues', () => {
  const before = layoutWith(
    [
      knob({ id: 'gain', label: 'Gain', unit: 'dB', min: 0, max: 70 }),
      knob({ id: 'mute', label: 'Mute', kind: 'switch' }),
      knob({
        id: 'src',
        label: 'Source',
        kind: 'selector',
        options: ['Mic', 'Line']
      }),
      knob({
        id: 'route',
        label: 'Routing',
        kind: 'selector',
        multi: true,
        options: ['1-2', '3-4']
      })
    ],
    [knob({ id: 'main', label: 'Main', kind: 'fader', min: -70, max: 10 })]
  )
  const values = {
    strip: { gain: 60, mute: true, src: 'Line', route: ['3-4'] },
    master: { main: 0 }
  }

  it('keeps everything when nothing changed', () => {
    const result = reconcileValues(before, before, values)
    expect(result).toEqual({ values, lost: [], clamped: [] })
  })

  it('drops removed controls, changed kinds and removed options; clamps narrowed ranges', () => {
    const after = layoutWith(
      [
        knob({ id: 'gain', label: 'Gain', unit: 'dB', min: 0, max: 50 }),
        knob({ id: 'mute', label: 'Mute' }),
        knob({
          id: 'src',
          label: 'Source',
          kind: 'selector',
          options: ['Mic']
        }),
        knob({
          id: 'route',
          label: 'Routing',
          kind: 'selector',
          options: ['1-2', '3-4']
        })
      ],
      []
    )
    const result = reconcileValues(before, after, values)
    expect(result.values).toEqual({
      strip: { gain: 50, route: '3-4' },
      master: {}
    })
    expect(result.lost.map((n) => `${n.area}:${n.label} ${n.before}`)).toEqual([
      'strip:Mute on',
      'strip:Source Line',
      'master:Main 0'
    ])
    expect(result.clamped).toEqual([
      {
        area: 'strip',
        id: 'gain',
        label: 'Gain',
        before: '60 dB',
        after: '50 dB'
      }
    ])
  })

  it('turns a single choice into a multi-select one and back when it fits', () => {
    const multi = layoutWith([
      knob({
        id: 'src',
        label: 'S',
        kind: 'selector',
        multi: true,
        options: ['Mic', 'Line']
      })
    ])
    expect(
      reconcileValues(null, multi, { strip: { src: 'Mic' }, master: {} }).values
        .strip
    ).toEqual({ src: ['Mic'] })
    const single = layoutWith([
      knob({
        id: 'src',
        label: 'S',
        kind: 'selector',
        options: ['Mic', 'Line']
      })
    ])
    const back = reconcileValues(null, single, {
      strip: { src: ['Mic', 'Line'] },
      master: {}
    })
    expect(back.lost).toHaveLength(1)
  })
})

describe('recall with a visual desk', () => {
  it('validates multi-select values', () => {
    const strip = controlsOf(GENERIC_ANALOGUE_DESK, 'strip')
    expect(validateValues(strip, { routing: ['1-2', 'L-R'] })).toBeNull()
    expect(validateValues(strip, { routing: [] })).toBeNull()
    expect(validateValues(strip, { routing: '1-2' })).toMatch(/Routing/)
    expect(validateValues(strip, { routing: ['1-2', '1-2'] })).toMatch(
      /Routing/
    )
    expect(validateValues(strip, { gain: ['1'] })).toMatch(/number/)
  })

  it('prints pan and routing readably', () => {
    const strip = controlsOf(GENERIC_ANALOGUE_DESK, 'strip')
    expect(
      recallLines(strip, { pan: -20, routing: ['L-R'], hf_gain: 2.5 })
    ).toEqual([
      { section: 'EQ', text: 'HF +2.5 dB' },
      { section: 'Output', text: 'Pan L20 · Routing L-R' }
    ])
  })

  it('pre-fills the source only on a single-choice selector', () => {
    const multi = controlsOf(
      layoutWith([
        knob({
          id: 'input',
          label: 'Source',
          kind: 'selector',
          multi: true,
          options: ['Mic', 'Line']
        })
      ]),
      'strip'
    )
    const { channels } = prefillChannels(multi, 8, [
      {
        id: 'i',
        number: 1,
        source: 'Kick',
        micName: 'SM57',
        phantom: false,
        padDb: null,
        preampInput: null
      }
    ])
    expect(channels[0].values).toEqual({})
    const builtIn = prefillChannels(GENERIC_ANALOGUE_STRIP, 8, [
      {
        id: 'i',
        number: 1,
        source: 'Kick',
        micName: 'SM57',
        phantom: true,
        padDb: 10,
        preampInput: null
      }
    ])
    expect(builtIn.channels[0].values).toEqual({
      phantom: true,
      pad: true,
      input: 'Mic'
    })
  })
})

describe('adding components', () => {
  it('gives a new component a temporary id and sensible defaults', () => {
    const fader = newComponent('fader', { x: 5, y: 10 })
    expect(fader).toMatchObject({
      kind: 'fader',
      x: 5,
      y: 10,
      min: -70,
      max: 10
    })
    expect(fader.id).toMatch(/^new_/)
    expect(deskLayoutSchema.safeParse(layoutWith([fader])).success).toBe(true)
  })

  it('finds the first free spot, letting controls sit on panels', () => {
    const area = {
      widthMm: 40,
      components: [
        knob({ id: 'a', x: 0, y: 0 }),
        knob({ id: 'p', kind: 'panel', x: 0, y: 0, w: 40, h: 100 })
      ]
    }
    expect(findFreeSpot(area, 300, knob({ id: 'n' }))).toEqual({ x: 20, y: 0 })
    expect(
      findFreeSpot(area, 300, knob({ id: 'q', kind: 'panel', w: 40, h: 50 }))
    ).toEqual({ x: 0, y: 100 })
    expect(findFreeSpot(area, 20, knob({ id: 'n' }))).toBeNull()
  })
})

describe('editing a layout', () => {
  const panel = knob({ id: 'p', kind: 'panel', x: 0, y: 0, w: 40, h: 60 })
  const inside = knob({ id: 'in', x: 5, y: 10 })
  const outside = knob({ id: 'out', x: 5, y: 100 })
  const base = layoutWith([panel, inside, outside])

  it('moves a panel with what sits in it, and keeps it inside the area', () => {
    const moved = moveComponent(base, 'strip', 'p', 0, 20)
    const at = (id: string) => moved.strip.components.find((c) => c.id === id)!
    expect(at('p')).toMatchObject({ x: 0, y: 20 })
    expect(at('in')).toMatchObject({ x: 5, y: 30 })
    expect(at('out')).toMatchObject({ x: 5, y: 100 })
    const clamped = moveComponent(base, 'strip', 'out', 500, 900)
    expect(clamped.strip.components[2]).toMatchObject({ x: 20, y: 275 })
    expect(moveComponent(base, 'strip', 'in', 5, 10)).toBe(base)
    expect(moveComponent(base, 'strip', 'nope', 5, 10)).toBe(base)
  })

  it('refuses a move that overlaps, but lets edges touch', () => {
    // knob 'in' sits at (5,10); moving 'out' onto it is refused.
    expect(moveComponent(base, 'strip', 'out', 5, 10)).toBe(base)
    const { w, h } = componentSize(inside)
    // Directly below 'in', touching its bottom edge.
    const touching = moveComponent(base, 'strip', 'out', 5, 10 + h)
    expect(touching).not.toBe(base)
    expect(collidesAt(base.strip.components, outside, 5, 10 + h - 1)).toBe(true)
    expect(collidesAt(base.strip.components, outside, 5 + w, 10)).toBe(false)
    // A control may sit on a panel.
    expect(collidesAt(base.strip.components, inside, 5, 20)).toBe(false)
  })

  it('refuses a resize that would overlap, but allows touching', () => {
    const a = knob({ id: 'a', kind: 'fader', x: 0, y: 0, w: 10, h: 40 })
    const b = knob({ id: 'b', kind: 'fader', x: 20, y: 0, w: 10, h: 40 })
    const two = layoutWith([a, b])
    expect(updateComponent(two, 'strip', 'a', { w: 25 })).toBe(two)
    expect(
      updateComponent(two, 'strip', 'a', { w: 20 }).strip.components[0]
    ).toMatchObject({ w: 20 })
  })

  it('updates and removes without leaving undefined fields behind', () => {
    const updated = updateComponent(base, 'strip', 'in', {
      label: 'Drive',
      unit: undefined,
      max: 5
    })
    const c = updated.strip.components[1]
    expect(c).toMatchObject({ label: 'Drive', max: 5 })
    expect('unit' in c).toBe(false)
    expect(removeComponent(base, 'strip', 'in').strip.components).toHaveLength(
      2
    )
    // The original is untouched (undo keeps it).
    expect(base.strip.components[1].label).toBe('Knob')
  })

  it('says why a component cannot be added', () => {
    expect(cannotAdd(base, 'strip', 'knob')).toBeNull()
    const noMaster = { ...base, master: { widthMm: 0, components: [] } }
    expect(cannotAdd(noMaster, 'master', 'knob')).toMatch(/no master area/)
    const full = layoutWith(
      Array.from({ length: 80 }, (_, i) => knob({ id: `k${i}` }))
    )
    expect(cannotAdd(full, 'strip', 'fader')).toMatch(/80 controls/)
    expect(cannotAdd(full, 'strip', 'label')).toBeNull()
    const decor = layoutWith(
      Array.from({ length: 60 }, (_, i) => knob({ id: `l${i}`, kind: 'label' }))
    )
    expect(cannotAdd(decor, 'strip', 'panel')).toMatch(/labels and panels/)
  })
})
