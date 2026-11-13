import { z } from 'zod'

import {
  MAX_SOURCES,
  type RecommendationRequestInput
} from '@/lib/recommendations/schemas'
import {
  PHANTOM_MODES,
  SOURCE_KINDS,
  TECHNIQUES
} from '@/lib/recommendations/types'

import { MAX_CHANNELS } from './types'

// Shared input shape for the session wizard (backend and UI). Times are
// studio-local 'YYYY-MM-DDTHH:mm' strings, like createSession.

const collapse = (value: string) => value.replace(/\s+/g, ' ').trim()
const localTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Use a date and time')

export const wizardSourceSchema = z.object({
  id: z.string().trim().min(1).max(24),
  label: z.string().transform(collapse).pipe(z.string().min(1).max(60)),
  kind: z.enum(SOURCE_KINDS),
  technique: z.enum(TECHNIQUES).default('mono'),
  notes: z.string().trim().max(200).optional()
})
export type WizardSource = z.infer<typeof wizardSourceSchema>

export const wizardDetailsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  client: z.string().trim().max(120).optional(),
  roomId: z.string().trim().min(1).nullable().optional(),
  startsAt: localTime.optional(),
  endsAt: localTime.optional(),
  channelsAvailable: z
    .number()
    .int()
    .min(1)
    .max(MAX_CHANNELS)
    .nullable()
    .optional(),
  phantomMode: z.enum(PHANTOM_MODES).default('per_channel')
})
export type WizardDetails = z.infer<typeof wizardDetailsSchema>

// 'auto' places the sources in the room; the rest mirror createSession's startFrom.
export const wizardLayoutSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('auto') }),
  z.object({ kind: z.literal('blank') }),
  z.object({
    kind: z.literal('builtin'),
    templateId: z.string().trim().min(1).max(40)
  }),
  z.object({
    kind: z.literal('template'),
    layoutId: z.string().trim().min(1).max(64)
  })
])
export type WizardLayout = z.infer<typeof wizardLayoutSchema>

export const wizardPicksSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('rules'),
    overrides: z.record(z.string(), z.string().min(1).max(64)).optional()
  }),
  z.object({
    mode: z.literal('ai'),
    resultId: z.string().trim().min(1).max(64)
  }),
  z.object({ mode: z.literal('none') })
])
export type WizardPicks = z.infer<typeof wizardPicksSchema>

export const wizardRecallSchema = z.object({
  consoleId: z.string().trim().min(1).max(64)
})
export type WizardRecall = z.infer<typeof wizardRecallSchema>

export const wizardInputSchema = z
  .object({
    details: wizardDetailsSchema,
    presetId: z.string().trim().min(1).max(40).optional(),
    sources: z.array(wizardSourceSchema).min(1).max(MAX_SOURCES),
    picks: wizardPicksSchema,
    layout: wizardLayoutSchema,
    recall: wizardRecallSchema.nullable().optional(),
    // Derived by the service from details.startsAt; accepted for previews.
    forDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    saveAsTemplate: z
      .object({
        name: z.string().trim().min(1).max(80),
        description: z.string().trim().max(500).optional()
      })
      .optional()
  })
  .superRefine((value, ctx) => {
    const ids = new Set<string>()
    const labels = new Set<string>()
    value.sources.forEach((source, index) => {
      if (ids.has(source.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['sources', index, 'id'],
          message: 'Source ids must be unique'
        })
      }
      ids.add(source.id)
      const key = source.label.toLowerCase()
      if (labels.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['sources', index, 'label'],
          message: 'Source names must be unique'
        })
      }
      labels.add(key)
    })
  })
export type WizardInput = z.infer<typeof wizardInputSchema>

export type WizardResult = {
  id: string
  recall: 'created' | 'failed' | 'skipped'
  template?: 'created' | 'failed' | 'skipped'
  warnings: string[]
}

// Recommendation request sources (no ids; the request assigns s1, s2, ...).
export function toRequestSources(
  sources: readonly WizardSource[]
): NonNullable<RecommendationRequestInput['sources']> {
  return sources.map((s) => ({
    label: s.label,
    kind: s.kind,
    technique: s.technique
  }))
}
