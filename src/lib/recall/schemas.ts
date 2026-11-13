import { z } from 'zod'

import { layoutFromStrip } from './desk-layout'
import {
  DESK_COMPONENT_KINDS,
  DESK_LIMITS,
  DESK_TONES,
  VALUE_KINDS
} from './desk-types'
import {
  CONTROL_TYPES,
  MAX_CONSOLE_CHANNELS,
  MAX_OUTBOARD_SETTINGS,
  MAX_STRIP_CONTROLS,
  MAX_STRIP_SECTIONS
} from './types'

import type { RecallValues, StripDefinition } from './types'

const text = (max: number) => z.string().trim().max(max)
const optionalText = (max: number) =>
  text(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()

const controlSchema = z
  .object({
    key: z
      .string()
      .trim()
      .regex(
        /^[a-z][a-z0-9_]{0,39}$/,
        'Keys are lower case letters, digits and _'
      ),
    label: text(40).min(1),
    type: z.enum(CONTROL_TYPES),
    unit: text(10)
      .optional()
      .transform((v) => (v ? v : undefined)),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    options: z.array(text(30).min(1)).max(24).optional()
  })
  .superRefine((control, ctx) => {
    if (control.type === 'select' && !control.options?.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'A selector needs at least one option'
      })
    }
    if (
      control.min !== undefined &&
      control.max !== undefined &&
      control.min > control.max
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['min'],
        message: 'The minimum is above the maximum'
      })
    }
  })

export const stripSchema = z
  .object({
    sections: z
      .array(
        z.object({
          label: text(40).min(1),
          controls: z.array(controlSchema).min(1)
        })
      )
      .min(1)
      .max(MAX_STRIP_SECTIONS)
  })
  .superRefine((strip, ctx) => {
    const keys = strip.sections.flatMap((s) => s.controls.map((c) => c.key))
    if (keys.length > MAX_STRIP_CONTROLS) {
      ctx.addIssue({
        code: 'custom',
        message: `A channel strip has at most ${MAX_STRIP_CONTROLS} controls`
      })
    }
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Every control needs its own key'
      })
    }
  })

// ---------------------------------------------------------------------------
// The visual desk (ADR 0023)

const componentIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{0,39}$/, 'Keys are lower case letters, digits and _')
const position = z.number().finite().min(0).max(3000)
const extent = z.number().finite().min(5).max(1500)
const isValueKind = (kind: string) =>
  (VALUE_KINDS as readonly string[]).includes(kind)

export const deskComponentSchema = z
  .object({
    id: componentIdSchema,
    kind: z.enum(DESK_COMPONENT_KINDS),
    x: position,
    y: position,
    w: extent.optional(),
    h: extent.optional(),
    label: text(40),
    unit: text(10)
      .optional()
      .transform((v) => (v ? v : undefined)),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    step: z.number().finite().positive().optional(),
    centre: z.number().finite().optional(),
    taper: z.enum(['linear', 'log']).optional(),
    options: z.array(text(30).min(1)).max(DESK_LIMITS.options).optional(),
    multi: z.boolean().optional(),
    tone: z.enum(DESK_TONES).optional()
  })
  .superRefine((c, ctx) => {
    if ((isValueKind(c.kind) || c.kind === 'label') && c.label === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['label'],
        message: 'Every control needs a label'
      })
    }
    if (c.kind === 'selector') {
      if (!c.options?.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['options'],
          message: 'A selector needs at least one option'
        })
      } else if (new Set(c.options).size !== c.options.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['options'],
          message: 'Selector options must differ'
        })
      }
    }
    if (c.min !== undefined && c.max !== undefined && c.min > c.max) {
      ctx.addIssue({
        code: 'custom',
        path: ['min'],
        message: 'The minimum is above the maximum'
      })
    }
    if (c.taper === 'log' && !(c.min !== undefined && c.min > 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['taper'],
        message: 'A log taper needs a minimum above zero'
      })
    }
    if (
      c.centre !== undefined &&
      ((c.min !== undefined && c.centre < c.min) ||
        (c.max !== undefined && c.centre > c.max))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['centre'],
        message: 'The centre is outside the range'
      })
    }
  })

const areaSchema = (width: { min: number; max: number }) =>
  z.object({
    widthMm: z.number().finite().min(width.min).max(width.max),
    components: z.array(deskComponentSchema).max(400)
  })

export const deskLayoutSchema = z
  .object({
    version: z.literal(2),
    heightMm: z
      .number()
      .finite()
      .min(DESK_LIMITS.heightMm.min)
      .max(DESK_LIMITS.heightMm.max),
    strip: areaSchema(DESK_LIMITS.stripWidthMm),
    master: areaSchema(DESK_LIMITS.masterWidthMm)
  })
  .superRefine((layout, ctx) => {
    const ids = [...layout.strip.components, ...layout.master.components].map(
      (c) => c.id
    )
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Every control needs its own key'
      })
    }
    const limits = {
      strip: DESK_LIMITS.stripControls,
      master: DESK_LIMITS.masterControls
    }
    for (const area of ['strip', 'master'] as const) {
      const values = layout[area].components.filter((c) => isValueKind(c.kind))
      const decor = layout[area].components.length - values.length
      if (values.length > limits[area]) {
        ctx.addIssue({
          code: 'custom',
          path: [area],
          message: `The ${area === 'strip' ? 'channel strip' : 'master area'} has at most ${limits[area]} controls`
        })
      }
      if (decor > DESK_LIMITS.decorPerArea) {
        ctx.addIssue({
          code: 'custom',
          path: [area],
          message: `At most ${DESK_LIMITS.decorPerArea} labels and panels in each area`
        })
      }
    }
  })

// A template accepts a visual desk, or a v1 strip (older clients and the API),
// which is converted on the way in. Stored templates are always v2.
export const layoutInputSchema = z.union([
  deskLayoutSchema,
  stripSchema.transform((strip) => layoutFromStrip(strip))
])

const valueSchema = z.union([
  z.string().max(60),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(30)).max(DESK_LIMITS.options)
])
export const valuesSchema = z.record(z.string().max(40), valueSchema)

export const defaultsSchema = z.object({
  strip: valuesSchema.default({}),
  master: valuesSchema.default({})
})

export const templateInputSchema = z.object({
  name: text(80).min(1),
  description: optionalText(300).optional(),
  strip: layoutInputSchema,
  defaultValues: defaultsSchema.optional()
})

export const templateUpdateSchema = z.object({
  name: text(80).min(1).optional(),
  description: optionalText(300).optional(),
  strip: layoutInputSchema.optional(),
  defaultValues: defaultsSchema.optional()
})

// A console uses one of your own templates, or copies a built-in one.
export const consoleInputSchema = z
  .object({
    name: text(80).min(1),
    make: optionalText(60).optional(),
    model: optionalText(60).optional(),
    channelCount: z.number().int().min(1).max(MAX_CONSOLE_CHANNELS),
    notes: optionalText(500).optional(),
    templateId: z.string().trim().min(1).max(64).optional(),
    builtinTemplateId: z.string().trim().min(1).max(40).optional()
  })
  .refine((v) => Boolean(v.templateId) !== Boolean(v.builtinTemplateId), {
    message: 'Choose one channel-strip template',
    path: ['templateId']
  })

export const consoleUpdateSchema = z.object({
  name: text(80).min(1).optional(),
  make: optionalText(60).optional(),
  model: optionalText(60).optional(),
  channelCount: z.number().int().min(1).max(MAX_CONSOLE_CHANNELS).optional(),
  notes: optionalText(500).optional(),
  templateId: z.string().trim().min(1).max(64).optional()
})

export const recallCreateSchema = z.object({
  consoleId: z.string().trim().min(1).max(64).optional(),
  // Copy another session's recall (its desk, values and outboard) instead of
  // filling from this session's input list.
  fromSessionId: z.string().trim().min(1).max(64).optional()
})

export const recallChannelUpdateSchema = z.object({
  label: text(80).min(1).optional(),
  values: valuesSchema.optional(),
  notes: optionalText(500).optional()
})

// The desk view saves every changed strip and the master area in one go. A
// strip with no row yet (no input on it) gets one.
export const recallSheetUpdateSchema = z.object({
  notes: optionalText(2000).optional(),
  masterValues: valuesSchema.optional(),
  channels: z
    .array(
      z.object({
        stripNumber: z.number().int().min(1).max(MAX_CONSOLE_CHANNELS),
        label: text(80).min(1).optional(),
        values: valuesSchema.optional(),
        notes: optionalText(500).optional()
      })
    )
    .max(MAX_CONSOLE_CHANNELS)
    .refine(
      (rows) => new Set(rows.map((r) => r.stripNumber)).size === rows.length,
      'Each strip appears once'
    )
    .optional()
})

const settingSchema = z.object({
  label: text(40).min(1),
  value: text(60)
})

export const outboardInputSchema = z.object({
  name: text(80).min(1),
  equipmentItemId: z.string().trim().min(1).max(64).nullable().optional(),
  insertOn: optionalText(80).optional(),
  settings: z.array(settingSchema).max(MAX_OUTBOARD_SETTINGS).default([]),
  notes: optionalText(500).optional()
})

export const outboardUpdateSchema = z.object({
  name: text(80).min(1).optional(),
  equipmentItemId: z.string().trim().min(1).max(64).nullable().optional(),
  insertOn: optionalText(80).optional(),
  settings: z.array(settingSchema).max(MAX_OUTBOARD_SETTINGS).optional(),
  notes: optionalText(500).optional()
})

// Checks recall values against the strip they were recorded on. Unknown keys,
// wrong types, numbers outside a control's stated range and selector values
// that are not options are all rejected, so a sheet cannot hold nonsense.
export function validateValues(
  strip: StripDefinition,
  values: RecallValues
): string | null {
  const controls = new Map(
    strip.sections.flatMap((s) => s.controls).map((c) => [c.key, c])
  )
  for (const [key, value] of Object.entries(values)) {
    const control = controls.get(key)
    if (!control) return `"${key}" is not a control on this channel strip`
    switch (control.type) {
      case 'switch':
        if (typeof value !== 'boolean') return `${control.label} is on or off`
        break
      case 'knob':
        if (typeof value !== 'number') return `${control.label} is a number`
        if (control.min !== undefined && value < control.min)
          return `${control.label} is at least ${control.min}`
        if (control.max !== undefined && value > control.max)
          return `${control.label} is at most ${control.max}`
        break
      case 'select':
        if (control.multi) {
          if (
            !Array.isArray(value) ||
            new Set(value).size !== value.length ||
            !value.every((v) => control.options?.includes(v))
          )
            return `${control.label} is any of ${control.options?.join(', ')}`
          break
        }
        if (typeof value !== 'string' || !control.options?.includes(value))
          return `${control.label} must be one of ${control.options?.join(', ')}`
        break
      case 'text':
        if (typeof value !== 'string') return `${control.label} is text`
        break
    }
  }
  return null
}

export type TemplateInput = z.infer<typeof templateInputSchema>
export type OutboardInput = z.infer<typeof outboardInputSchema>
