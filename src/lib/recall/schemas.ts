import { z } from 'zod'

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

export const templateInputSchema = z.object({
  name: text(80).min(1),
  description: optionalText(300).optional(),
  strip: stripSchema
})

export const templateUpdateSchema = z.object({
  name: text(80).min(1).optional(),
  description: optionalText(300).optional(),
  strip: stripSchema.optional()
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

const valueSchema = z.union([
  z.string().max(60),
  z.number().finite(),
  z.boolean()
])
export const valuesSchema = z.record(z.string().max(40), valueSchema)

export const recallChannelUpdateSchema = z.object({
  label: text(80).min(1).optional(),
  values: valuesSchema.optional(),
  notes: optionalText(500).optional()
})

export const recallSheetUpdateSchema = z.object({
  notes: optionalText(2000).optional()
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
