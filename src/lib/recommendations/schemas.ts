import { z } from 'zod'

import { badRequest } from '@/lib/errors'

import { classifySource } from './classify'
import { profileFor } from './profiles'
import { TECHNIQUE_RULES, techniqueAllowed } from './techniques'
import {
  PHANTOM_MODES,
  SOURCE_KINDS,
  TECHNIQUES,
  type NormalisedRequest
} from './types'

// Input validation for recommendation requests and feedback (PLAN §4.4).
// Everything user-typed is collapsed to single spaces here, so the same words
// always produce the same request and the same cache key.

export const MAX_SOURCES = 48

const collapse = (value: string) => value.replace(/\s+/g, ' ').trim()
const text = (min: number, max: number) =>
  z.string().transform(collapse).pipe(z.string().min(min).max(max))

const isCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  )
}

export const sourceInputSchema = z.object({
  label: text(1, 80),
  kind: z.enum(SOURCE_KINDS).optional(),
  technique: z.enum(TECHNIQUES).optional()
})

export const recommendationRequestSchema = z
  .object({
    sources: z.array(sourceInputSchema).min(1).max(MAX_SOURCES).optional(),
    question: text(1, 500).optional(),
    intent: text(0, 500).optional(),
    roomId: z.string().min(1).optional(),
    forDate: z
      .string()
      .refine(isCalendarDate, 'Use a real date as YYYY-MM-DD')
      .optional(),
    channels: z.number().int().min(1).max(256).optional(),
    phantomMode: z.enum(PHANTOM_MODES).default('per_channel')
  })
  .refine((value) => (value.sources ? 1 : 0) + (value.question ? 1 : 0) === 1, {
    message: 'Give either a list of sources or a question, not both',
    path: ['sources']
  })

export type RecommendationRequestInput = z.infer<
  typeof recommendationRequestSchema
>

export function normaliseRequest(
  input: RecommendationRequestInput
): NormalisedRequest {
  const base = {
    intent: input.intent || null,
    roomId: input.roomId ?? null,
    forDate: input.forDate ?? null,
    channels: input.channels ?? null,
    phantomMode: input.phantomMode
  }

  if (input.question) {
    const kind = classifySource(input.question).kind
    return {
      ...base,
      kind: 'question',
      question: input.question,
      sources: [
        {
          id: 's1',
          label: 'Your question',
          kind,
          technique: profileFor(kind).defaultTechnique
        }
      ]
    }
  }

  const sources = (input.sources ?? []).map((source, index) => {
    const kind = source.kind ?? classifySource(source.label).kind
    const technique = source.technique ?? profileFor(kind).defaultTechnique
    if (!techniqueAllowed(kind, technique)) {
      throw badRequest(
        `${profileFor(kind).label} cannot use ${TECHNIQUE_RULES[technique].label}. Use a single microphone, or pick a source that suits a stereo technique.`,
        { source: index + 1 }
      )
    }
    return { id: `s${index + 1}`, label: source.label, kind, technique }
  })
  return { ...base, kind: 'sources', question: null, sources }
}

// ---------------------------------------------------------------------------
// Feedback

export const FEEDBACK_VERDICTS = ['accepted', 'swapped', 'rejected'] as const
export type FeedbackVerdict = (typeof FEEDBACK_VERDICTS)[number]

export const FEEDBACK_REASONS = [
  'wrong_character',
  'spl_risk',
  'placement',
  'unavailable',
  'prefer_other',
  'unsafe',
  'other'
] as const

export const feedbackInputSchema = z
  .object({
    // 's3', or '*' for the recommendation as a whole.
    sourceKey: z.string().min(1).max(12),
    verdict: z.enum(FEEDBACK_VERDICTS),
    swappedToUnitIds: z.array(z.string().min(1)).max(3).default([]),
    rating: z.number().int().min(1).max(5).optional(),
    reasons: z
      .array(z.enum(FEEDBACK_REASONS))
      .max(FEEDBACK_REASONS.length)
      .default([]),
    // Untrusted text. Stored for the owner to read; never sent to a model.
    comment: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().max(1000))
      .optional()
      .transform((value) => value || undefined)
  })
  .superRefine((value, ctx) => {
    if (value.verdict === 'swapped') {
      if (value.sourceKey === '*') {
        ctx.addIssue({
          code: 'custom',
          path: ['verdict'],
          message: 'A swap belongs to one source'
        })
      }
      if (value.swappedToUnitIds.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['swappedToUnitIds'],
          message: 'Say which microphones you used instead'
        })
      }
    } else if (value.swappedToUnitIds.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['swappedToUnitIds'],
        message: 'Only a swap names replacement microphones'
      })
    }
  })

export type FeedbackInput = z.infer<typeof feedbackInputSchema>
