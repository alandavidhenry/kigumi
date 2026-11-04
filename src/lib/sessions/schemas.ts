import { z } from 'zod'

import { PHANTOM_MODES } from '@/lib/recommendations/types'

import { CHANNEL_KINDS, MAX_CHANNELS, SESSION_STATUSES } from './types'

// Input schemas for sessions and channels. Times arrive as studio-local
// 'YYYY-MM-DDTHH:mm' strings and are converted to UTC by the service using the
// room's studio timezone.

const text = (max: number) => z.string().trim().max(max)
const optionalText = (max: number) =>
  text(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
const localTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Use a date and time')

export const startFromSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('blank') }),
  z.object({
    kind: z.literal('builtin'),
    templateId: z.string().trim().min(1).max(40)
  }),
  z.object({
    kind: z.literal('template'),
    layoutId: z.string().trim().min(1).max(64)
  }),
  z.object({
    kind: z.literal('session'),
    sessionId: z.string().trim().min(1).max(64)
  })
])
export type StartFrom = z.infer<typeof startFromSchema>

const channelsAvailable = z.number().int().min(1).max(MAX_CHANNELS).nullable()

export const sessionInputSchema = z.object({
  name: text(120).min(1),
  roomId: z.string().trim().min(1).nullable().optional(),
  client: optionalText(120).optional(),
  startsAt: localTime,
  endsAt: localTime,
  status: z.enum(SESSION_STATUSES).default('planned'),
  channelsAvailable: channelsAvailable.optional(),
  phantomMode: z.enum(PHANTOM_MODES).default('per_channel'),
  notes: optionalText(2000).optional(),
  startFrom: startFromSchema.default({ kind: 'blank' })
})
export type SessionInput = z.infer<typeof sessionInputSchema>

// Built from raw fields so defaults never overwrite stored values.
export const sessionUpdateSchema = z.object({
  name: text(120).min(1).optional(),
  roomId: z.string().trim().min(1).nullable().optional(),
  client: optionalText(120).optional(),
  startsAt: localTime.optional(),
  endsAt: localTime.optional(),
  status: z.enum(SESSION_STATUSES).optional(),
  channelsAvailable: channelsAvailable.optional(),
  phantomMode: z.enum(PHANTOM_MODES).optional(),
  notes: optionalText(2000).optional()
})

export const sessionListSchema = z.object({
  scope: z.enum(['upcoming', 'past', 'all']).default('upcoming'),
  roomId: z.string().trim().min(1).optional()
})

// Manual channel (line sources, a DI with no layout item).
export const channelInputSchema = z.object({
  kind: z.enum(CHANNEL_KINDS).default('line'),
  source: text(80).min(1),
  stand: optionalText(60).optional(),
  preampInput: optionalText(40).optional(),
  phantom: z.boolean().default(false),
  padDb: z.number().int().min(0).max(60).nullable().optional(),
  dawName: optionalText(60).optional(),
  notes: optionalText(500).optional()
})

export const channelUpdateSchema = z.object({
  source: text(80).min(1).optional(),
  micUnitId: z.string().trim().min(1).nullable().optional(),
  stand: optionalText(60).optional(),
  preampInput: optionalText(40).optional(),
  phantom: z.boolean().optional(),
  padDb: z.number().int().min(0).max(60).nullable().optional(),
  dawName: optionalText(60).optional(),
  notes: optionalText(500).optional()
})

export const channelOrderSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(MAX_CHANNELS)
})

export const applyRecommendationSchema = z.object({
  resultId: z.string().trim().min(1).max(64)
})

export const shareInputSchema = z.object({
  // Days until the link stops working; omitted means it doesn't expire.
  expiresInDays: z.number().int().min(1).max(365).optional()
})
