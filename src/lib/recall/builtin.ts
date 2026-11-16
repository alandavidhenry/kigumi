import { controlsOf } from './desk-layout'

import type { DeskComponent, DeskLayout } from './desk-types'
import type { StripDefinition } from './types'

// The generic analogue desk shipped with Kigumi (PLAN §4.7, ADR 0023). It is
// not a row: choosing it when you add a console copies it into your own
// template, which you can then edit. Millimetres, 40 mm strips.

export const BUILTIN_GENERIC_ANALOGUE_ID = 'generic-analogue'

const knob = (
  id: string,
  label: string,
  x: number,
  y: number,
  extra: Partial<DeskComponent> = {}
): DeskComponent => ({ id, kind: 'knob', x, y, label, ...extra })

const toggle = (
  id: string,
  label: string,
  x: number,
  y: number,
  extra: Partial<DeskComponent> = {}
): DeskComponent => ({ id, kind: 'switch', x, y, label, ...extra })

const panel = (
  id: string,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number
): DeskComponent => ({ id, kind: 'panel', x, y, w, h, label })

const eqGain = { unit: 'dB', min: -18, max: 18, centre: 0, step: 0.5 }
const freq = (min: number, max: number) => ({
  unit: 'Hz',
  min,
  max,
  taper: 'log' as const
})
const q = { min: 0.5, max: 4, step: 0.1 }
const send = { unit: 'dB', min: -60, max: 10, step: 0.5 }
const fader = { unit: 'dB', min: -70, max: 10, step: 0.5 }

export const GENERIC_ANALOGUE_DESK: DeskLayout = {
  version: 2,
  heightMm: 480,
  strip: {
    widthMm: 40,
    components: [
      panel('panel_input', 'Input', 0, 0, 40, 80),
      {
        id: 'input',
        kind: 'selector',
        x: 7,
        y: 5,
        label: 'Source',
        options: ['Mic', 'Line']
      },
      toggle('phantom', '48V', 2.5, 20, { tone: 'chart-2' }),
      toggle('pad', 'Pad', 22.5, 20),
      toggle('phase', 'Phase', 2.5, 35),
      toggle('hpf_in', 'HPF', 22.5, 35),
      knob('gain', 'Gain', 0, 50, { unit: 'dB', min: 0, max: 70, step: 0.5 }),
      knob('hpf_freq', 'HPF freq', 20, 50, freq(20, 400)),

      panel('panel_eq', 'EQ', 0, 80, 40, 150),
      toggle('eq_in', 'EQ in', 12.5, 85),
      knob('hf_gain', 'HF', 0, 100, { ...eqGain, tone: 'chart-1' }),
      knob('hf_freq', 'HF freq', 20, 100, {
        ...freq(1500, 16000),
        tone: 'chart-1'
      }),
      knob('hmf_gain', 'HMF', 0, 125, { ...eqGain, tone: 'chart-1' }),
      knob('hmf_freq', 'HMF freq', 20, 125, {
        ...freq(400, 8000),
        tone: 'chart-1'
      }),
      knob('lmf_gain', 'LMF', 0, 150, { ...eqGain, tone: 'chart-1' }),
      knob('lmf_freq', 'LMF freq', 20, 150, {
        ...freq(100, 2000),
        tone: 'chart-1'
      }),
      knob('hmf_q', 'HMF Q', 0, 175, { ...q, tone: 'chart-1' }),
      knob('lmf_q', 'LMF Q', 20, 175, { ...q, tone: 'chart-1' }),
      knob('lf_gain', 'LF', 0, 200, { ...eqGain, tone: 'chart-1' }),
      knob('lf_freq', 'LF freq', 20, 200, {
        ...freq(30, 450),
        tone: 'chart-1'
      }),

      panel('panel_sends', 'Aux sends', 0, 235, 40, 60),
      knob('aux1', 'Aux 1', 0, 240, { ...send, tone: 'chart-3' }),
      knob('aux2', 'Aux 2', 20, 240, { ...send, tone: 'chart-3' }),
      knob('aux3', 'Aux 3', 0, 265, { ...send, tone: 'chart-4' }),
      knob('aux4', 'Aux 4', 20, 265, { ...send, tone: 'chart-4' }),

      panel('panel_output', 'Output', 0, 300, 40, 175),
      knob('pan', 'Pan', 10, 305, {
        unit: 'L/R',
        min: -100,
        max: 100,
        centre: 0,
        step: 1
      }),
      {
        id: 'routing',
        kind: 'selector',
        x: 3,
        y: 330,
        label: 'Routing',
        options: ['1-2', '3-4', 'L-R'],
        multi: true
      },
      toggle('mute', 'Mute', 12.5, 345, { tone: 'chart-5' }),
      { id: 'fader', kind: 'fader', x: 10, y: 360, label: 'Fader', ...fader }
    ]
  },
  master: {
    widthMm: 140,
    components: [
      panel('panel_aux_masters', 'Aux masters', 0, 0, 45, 60),
      knob('aux1_master', 'Aux 1', 2.5, 5, { ...send, tone: 'chart-3' }),
      knob('aux2_master', 'Aux 2', 22.5, 5, { ...send, tone: 'chart-3' }),
      knob('aux3_master', 'Aux 3', 2.5, 30, { ...send, tone: 'chart-4' }),
      knob('aux4_master', 'Aux 4', 22.5, 30, { ...send, tone: 'chart-4' }),

      panel('panel_monitor', 'Monitor', 50, 0, 45, 100),
      {
        id: 'monitor_source',
        kind: 'selector',
        x: 54,
        y: 5,
        label: 'Source',
        options: ['Ext', '2Trk', 'Mix']
      },
      knob('monitor_level', 'Level', 62.5, 25, {
        unit: 'dB',
        min: -60,
        max: 10,
        step: 0.5
      }),
      toggle('talkback', 'Talkback', 65, 55, { tone: 'chart-5' }),
      knob('talkback_level', 'TB level', 62.5, 70, {
        unit: 'dB',
        min: -60,
        max: 10,
        step: 0.5
      }),

      panel('panel_buses', 'Buses', 0, 355, 95, 120),
      { id: 'bus1', kind: 'fader', x: 2.5, y: 360, label: 'Bus 1', ...fader },
      { id: 'bus2', kind: 'fader', x: 25, y: 360, label: 'Bus 2', ...fader },
      { id: 'bus3', kind: 'fader', x: 47.5, y: 360, label: 'Bus 3', ...fader },
      { id: 'bus4', kind: 'fader', x: 70, y: 360, label: 'Bus 4', ...fader },

      panel('panel_main', 'Main', 100, 355, 40, 120),
      {
        id: 'main_lr',
        kind: 'fader',
        x: 110,
        y: 360,
        label: 'Mix L-R',
        ...fader
      }
    ]
  }
}

// The channel strip's controls, grouped by panel (what recall works from).
export const GENERIC_ANALOGUE_STRIP: StripDefinition = controlsOf(
  GENERIC_ANALOGUE_DESK,
  'strip'
)

export const BUILTIN_CONSOLE_TEMPLATES = [
  {
    id: BUILTIN_GENERIC_ANALOGUE_ID,
    name: 'Generic analogue desk',
    description:
      'Mic/line input with 48V, pad, phase and gain; high-pass filter; four-band EQ; four aux sends; pan, routing, mute and fader. Master area with aux masters, monitor, talkback, four buses and the main mix.',
    layout: GENERIC_ANALOGUE_DESK
  }
] as const

export function getBuiltInConsoleTemplate(id: string) {
  return BUILTIN_CONSOLE_TEMPLATES.find((t) => t.id === id) ?? null
}
