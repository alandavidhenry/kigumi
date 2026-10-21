import { z } from 'zod'

import { MAX_AI_SOURCES } from './llm-input'

// The shape of the model's reply (PLAN §4.4 step 3). Options are referred to by
// alias id; validation resolves and checks them, and finalise() maps them back
// to real units. Placement numbers are whole numbers inside ranges that the
// request supplied, so they are checked rather than trusted.

const text = (max: number) => z.string().trim().min(1).max(max)
const aliasId = z.string().trim().min(1).max(12)
const wholeNumber = z.number().int().nullable()

export const placementSchema = z.object({
  position: text(160),
  distanceMm: wholeNumber,
  angleDeg: wholeNumber,
  spacingMm: wholeNumber,
  includedAngleDeg: wholeNumber
})

export const recommendationSchema = z.object({
  // False only when a question is not about choosing or placing microphones.
  answerable: z.boolean(),
  sources: z
    .array(
      z.object({
        sourceId: aliasId,
        primary: z.object({
          option: aliasId,
          reasoning: text(300),
          placement: placementSchema
        }),
        alternatives: z
          .array(z.object({ option: aliasId, reason: text(200) }))
          .max(2)
      })
    )
    .max(MAX_AI_SOURCES),
  summary: text(400).nullable()
})

export type RecommendationContent = z.infer<typeof recommendationSchema>
export type ReplyPlacement = z.infer<typeof placementSchema>
