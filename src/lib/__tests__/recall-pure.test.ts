import { describe, expect, it } from 'vitest'

import {
  BUILTIN_CONSOLE_TEMPLATES,
  GENERIC_ANALOGUE_STRIP,
  getBuiltInConsoleTemplate
} from '@/lib/recall/builtin'
import { formatControlValue, recallLines } from '@/lib/recall/format'
import { prefillChannels } from '@/lib/recall/prefill'
import type { PrefillInput } from '@/lib/recall/prefill'
import {
  consoleInputSchema,
  outboardInputSchema,
  stripSchema,
  templateInputSchema,
  validateValues
} from '@/lib/recall/schemas'
import type { StripDefinition } from '@/lib/recall/types'

const input = (extra: Partial<PrefillInput> = {}): PrefillInput => ({
  id: 'c1',
  number: 1,
  source: 'Kick',
  micName: 'Shure SM57',
  phantom: false,
  padDb: null,
  preampInput: null,
  ...extra
})

describe('the shipped generic analogue desk', () => {
  it('is a valid strip with unique keys', () => {
    expect(stripSchema.safeParse(GENERIC_ANALOGUE_STRIP).success).toBe(true)
    const keys = GENERIC_ANALOGUE_STRIP.sections.flatMap((s) =>
      s.controls.map((c) => c.key)
    )
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('has the controls the input list pre-fills', () => {
    const keys = GENERIC_ANALOGUE_STRIP.sections.flatMap((s) =>
      s.controls.map((c) => c.key)
    )
    expect(keys).toEqual(expect.arrayContaining(['phantom', 'pad', 'input']))
  })

  it('is found by id', () => {
    expect(getBuiltInConsoleTemplate('generic-analogue')?.name).toBe(
      BUILTIN_CONSOLE_TEMPLATES[0].name
    )
    expect(getBuiltInConsoleTemplate('nope')).toBeNull()
  })
})

describe('stripSchema', () => {
  const strip = (controls: unknown[]) => ({
    sections: [{ label: 'Input', controls }]
  })

  it('rejects duplicate keys, bad keys, empty selectors and inverted ranges', () => {
    const knob = { key: 'gain', label: 'Gain', type: 'knob' }
    expect(stripSchema.safeParse(strip([knob, knob])).success).toBe(false)
    expect(
      stripSchema.safeParse(strip([{ ...knob, key: 'Gain!' }])).success
    ).toBe(false)
    expect(
      stripSchema.safeParse(
        strip([{ key: 'src', label: 'Src', type: 'select' }])
      ).success
    ).toBe(false)
    expect(
      stripSchema.safeParse(strip([{ ...knob, min: 10, max: 1 }])).success
    ).toBe(false)
  })

  it('rejects an empty strip and an empty section', () => {
    expect(stripSchema.safeParse({ sections: [] }).success).toBe(false)
    expect(stripSchema.safeParse(strip([])).success).toBe(false)
  })

  it('accepts a user-defined strip', () => {
    expect(
      templateInputSchema.safeParse({
        name: 'My desk',
        strip: strip([
          { key: 'gain', label: 'Gain', type: 'knob', unit: 'dB' },
          { key: 'in', label: 'In', type: 'select', options: ['Mic', 'Line'] }
        ])
      }).success
    ).toBe(true)
  })
})

describe('consoleInputSchema', () => {
  const base = { name: 'Desk', channelCount: 24 }

  it('needs exactly one template source', () => {
    expect(consoleInputSchema.safeParse(base).success).toBe(false)
    expect(
      consoleInputSchema.safeParse({
        ...base,
        templateId: 't1',
        builtinTemplateId: 'generic-analogue'
      }).success
    ).toBe(false)
    expect(
      consoleInputSchema.safeParse({ ...base, templateId: 't1' }).success
    ).toBe(true)
  })

  it('bounds the channel count', () => {
    expect(
      consoleInputSchema.safeParse({
        ...base,
        channelCount: 0,
        templateId: 't'
      }).success
    ).toBe(false)
    expect(
      consoleInputSchema.safeParse({
        ...base,
        channelCount: 129,
        templateId: 't'
      }).success
    ).toBe(false)
  })
})

describe('outboardInputSchema', () => {
  it('defaults to no settings and bounds them', () => {
    expect(outboardInputSchema.parse({ name: 'LA-2A' }).settings).toEqual([])
    const many = Array.from({ length: 41 }, (_, i) => ({
      label: `s${i}`,
      value: '1'
    }))
    expect(
      outboardInputSchema.safeParse({ name: 'x', settings: many }).success
    ).toBe(false)
  })
})

describe('validateValues', () => {
  const strip: StripDefinition = {
    sections: [
      {
        label: 'Input',
        controls: [
          { key: 'gain', label: 'Gain', type: 'knob', min: 0, max: 70 },
          { key: 'phantom', label: '48V', type: 'switch' },
          { key: 'src', label: 'Source', type: 'select', options: ['Mic'] },
          { key: 'pan', label: 'Pan', type: 'text' }
        ]
      }
    ]
  }

  it('accepts values that fit the strip', () => {
    expect(
      validateValues(strip, {
        gain: 32,
        phantom: true,
        src: 'Mic',
        pan: 'L30'
      })
    ).toBeNull()
  })

  it.each([
    [{ nope: 1 }, 'not a control'],
    [{ gain: 'loud' }, 'number'],
    [{ gain: 80 }, 'at most 70'],
    [{ gain: -1 }, 'at least 0'],
    [{ phantom: 'on' }, 'on or off'],
    [{ src: 'Line' }, 'one of Mic'],
    [{ pan: 3 }, 'text']
  ])('rejects %j', (values, message) => {
    expect(validateValues(strip, values as never)).toContain(message)
  })
})

describe('prefillChannels', () => {
  const strip = GENERIC_ANALOGUE_STRIP

  it('puts each input on the strip with its number and copies only what the list says', () => {
    const { channels, skipped } = prefillChannels(strip, 24, [
      input({ id: 'a', number: 2, source: 'Vocal', phantom: true, padDb: 10 }),
      input({ id: 'b', number: 1, source: 'Kick', micName: null })
    ])
    expect(skipped).toEqual([])
    expect(channels.map((c) => c.stripNumber)).toEqual([1, 2])
    expect(channels[0]).toMatchObject({
      label: 'Kick',
      inputChannelId: 'b',
      values: { phantom: false }
    })
    expect(channels[1].values).toEqual({
      phantom: true,
      pad: true,
      input: 'Mic'
    })
    // Gain, EQ and the rest are never guessed.
    expect(Object.keys(channels[1].values)).not.toContain('gain')
  })

  it('reports inputs beyond the desk instead of dropping them silently', () => {
    const { channels, skipped } = prefillChannels(strip, 2, [
      input({ number: 2 }),
      input({ id: 'x', number: 3 })
    ])
    expect(channels).toHaveLength(1)
    expect(skipped.map((s) => s.id)).toEqual(['x'])
  })

  it('leaves out controls a custom template does not have', () => {
    const custom: StripDefinition = {
      sections: [
        { label: 'A', controls: [{ key: 'gain', label: 'G', type: 'knob' }] }
      ]
    }
    const { channels } = prefillChannels(custom, 8, [
      input({ phantom: true, preampInput: 'Pre 3' })
    ])
    expect(channels[0].values).toEqual({})
    expect(channels[0].notes).toBe('Preamp: Pre 3')
  })

  it('does not claim a mic source for an input with no mic', () => {
    const { channels } = prefillChannels(strip, 8, [input({ micName: null })])
    expect(channels[0].values).not.toHaveProperty('input')
  })

  it('writes values that validate against the strip', () => {
    const { channels } = prefillChannels(strip, 8, [
      input({ phantom: true, padDb: 20 })
    ])
    expect(validateValues(strip, channels[0].values)).toBeNull()
  })
})

describe('recall text', () => {
  const strip = GENERIC_ANALOGUE_STRIP

  it('formats values with units and on/off', () => {
    const gain = strip.sections[0].controls.find((c) => c.key === 'gain')!
    const phantom = strip.sections[0].controls.find((c) => c.key === 'phantom')!
    expect(formatControlValue(gain, 32)).toBe('32 dB')
    expect(formatControlValue(phantom, true)).toBe('on')
    expect(formatControlValue(phantom, false)).toBe('off')
  })

  it('prints only what was recorded, one line per section', () => {
    const lines = recallLines(strip, { gain: 32, phantom: true, fader: -6 })
    expect(lines).toEqual([
      { section: 'Input', text: '48V on · Gain 32 dB' },
      { section: 'Output', text: 'Fader -6 dB' }
    ])
  })

  it('prints nothing for a channel with no values', () => {
    expect(recallLines(strip, {})).toEqual([])
  })
})
