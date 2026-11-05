import type { ControlDef, StripDefinition } from './types'

// The generic analogue desk shipped with Kigumi (PLAN §4.7). It is not a row:
// choosing it when you add a console copies it into your own template, which
// you can then edit.

export const BUILTIN_GENERIC_ANALOGUE_ID = 'generic-analogue'

function eqBand(prefix: string, label: string, hasQ: boolean): ControlDef[] {
  return [
    {
      key: `${prefix}_gain`,
      label: `${label} gain`,
      type: 'knob',
      unit: 'dB',
      min: -18,
      max: 18
    },
    {
      key: `${prefix}_freq`,
      label: `${label} frequency`,
      type: 'knob',
      unit: 'Hz',
      min: 20,
      max: 20000
    },
    ...(hasQ
      ? [{ key: `${prefix}_q`, label: `${label} Q`, type: 'knob' as const }]
      : [])
  ]
}

export const GENERIC_ANALOGUE_STRIP: StripDefinition = {
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
        { key: 'phantom', label: '48V', type: 'switch' },
        { key: 'pad', label: 'Pad', type: 'switch' },
        { key: 'phase', label: 'Phase', type: 'switch' },
        {
          key: 'gain',
          label: 'Gain',
          type: 'knob',
          unit: 'dB',
          min: 0,
          max: 70
        }
      ]
    },
    {
      label: 'Filter',
      controls: [
        { key: 'hpf_in', label: 'HPF in', type: 'switch' },
        {
          key: 'hpf_freq',
          label: 'HPF frequency',
          type: 'knob',
          unit: 'Hz',
          min: 20,
          max: 400
        }
      ]
    },
    {
      label: 'EQ',
      controls: [
        { key: 'eq_in', label: 'EQ in', type: 'switch' },
        ...eqBand('hf', 'HF', false),
        ...eqBand('hmf', 'HMF', true),
        ...eqBand('lmf', 'LMF', true),
        ...eqBand('lf', 'LF', false)
      ]
    },
    {
      label: 'Sends',
      controls: [
        { key: 'aux1', label: 'Aux 1', type: 'knob', unit: 'dB' },
        { key: 'aux2', label: 'Aux 2', type: 'knob', unit: 'dB' },
        { key: 'aux3', label: 'Aux 3', type: 'knob', unit: 'dB' },
        { key: 'aux4', label: 'Aux 4', type: 'knob', unit: 'dB' }
      ]
    },
    {
      label: 'Output',
      controls: [
        { key: 'pan', label: 'Pan', type: 'text' },
        { key: 'mute', label: 'Mute', type: 'switch' },
        {
          key: 'fader',
          label: 'Fader',
          type: 'knob',
          unit: 'dB',
          min: -70,
          max: 10
        },
        { key: 'routing', label: 'Routing', type: 'text' }
      ]
    }
  ]
}

export const BUILTIN_CONSOLE_TEMPLATES = [
  {
    id: BUILTIN_GENERIC_ANALOGUE_ID,
    name: 'Generic analogue desk',
    description:
      'Mic/line input with 48V, pad, phase and gain; high-pass filter; four-band EQ; four aux sends; pan, mute, fader and routing.',
    strip: GENERIC_ANALOGUE_STRIP
  }
] as const

export function getBuiltInConsoleTemplate(id: string) {
  return BUILTIN_CONSOLE_TEMPLATES.find((t) => t.id === id) ?? null
}
