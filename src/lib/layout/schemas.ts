import { z } from 'zod'

import { MIC_POLAR_PATTERNS } from '@/lib/mics/types'

import {
  GRID_CHOICES_MM,
  LAYOUT_ITEM_TYPES,
  MAX_ITEM_SIZE_MM,
  MAX_LAYOUT_ITEMS,
  MIN_ITEM_SIZE_MM,
  SNAP_CHOICES_MM
} from './types'

// Save payload for PUT /api/layouts/[id] (ADR 0016 decision 6). Everything is
// integer millimetres or degrees, bounded so a bad client can't store absurd
// geometry.

const MAX_COORD_MM = 200_000
const text = (max: number) => z.string().trim().max(max)
const nullableText = (max: number) =>
  text(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null)

const coord = z.number().int().min(-MAX_COORD_MM).max(MAX_COORD_MM)
const size = z.number().int().min(MIN_ITEM_SIZE_MM).max(MAX_ITEM_SIZE_MM)

export const layoutItemSchema = z.object({
  id: z.string().trim().min(1).max(64),
  type: z.enum(LAYOUT_ITEM_TYPES),
  variant: nullableText(40),
  label: nullableText(80),
  xMm: coord,
  yMm: coord,
  zMm: z.number().int().min(0).max(50_000).default(0),
  rotationDeg: z.number().int().min(0).max(359).default(0),
  pitchDeg: z.number().int().min(-90).max(90).default(0),
  widthMm: size,
  depthMm: size,
  heightMm: size
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  sortOrder: z.number().int().min(0).max(100_000).default(0),
  locked: z.boolean().default(false),
  groupId: nullableText(64),
  micUnitId: nullableText(64),
  equipmentItemId: nullableText(64),
  patternSetting: z
    .enum(MIC_POLAR_PATTERNS)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  showPattern: z.boolean().default(false),
  recommendationRef: nullableText(64),
  notes: nullableText(500)
})

export const saveLayoutSchema = z
  .object({
    version: z.number().int().min(1),
    name: text(80).min(1).optional(),
    gridMm: z
      .number()
      .int()
      .refine((v) => (GRID_CHOICES_MM as readonly number[]).includes(v), {
        message: 'Unsupported grid size'
      })
      .optional(),
    snapMm: z
      .number()
      .int()
      .refine((v) => (SNAP_CHOICES_MM as readonly number[]).includes(v), {
        message: 'Unsupported snap size'
      })
      .optional(),
    items: z.array(layoutItemSchema).max(MAX_LAYOUT_ITEMS)
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>()
    value.items.forEach((item, index) => {
      if (seen.has(item.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'id'],
          message: 'Duplicate item id'
        })
      }
      seen.add(item.id)
    })
  })

export type SaveLayoutInput = z.infer<typeof saveLayoutSchema>
export type SaveLayoutItem = z.infer<typeof layoutItemSchema>

export const templateInputSchema = z.object({
  name: text(80).min(1),
  // Save the layout of this session as a template.
  fromSessionId: z.string().trim().min(1).max(64)
})

export const templateUpdateSchema = z.object({
  name: text(80).min(1)
})
