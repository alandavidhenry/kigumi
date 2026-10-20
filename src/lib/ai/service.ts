import type { Prisma } from '@/generated/prisma/client'
import { aiUnavailable, rateLimited } from '@/lib/errors'
import prisma from '@/lib/prisma'
import { requirePermission } from '@/lib/tenant-context'
import type { TenantContext } from '@/lib/tenant-context'
import { Permission } from '@/types/rbac'

import { modelFor } from './config'
import { hashInput } from './hash'
import {
  recordPlatformTokens,
  releasePlatformRequest,
  reservePlatformRequest
} from './platform-cap'
import {
  AiOutputError,
  AiProviderError,
  type AiMessage,
  type AiTokenUsage,
  type AiProvider
} from './provider'
import { aiRateLimiter } from './rate-limit'
import { getAiProvider } from './registry'
import { recordAiTokens, releaseAiRequest, reserveAiRequest } from './usage'

import type { Prompt } from './prompts/types'

// The AI service (ADR 0007, 0013). One entry point, generateCached, runs the
// whole pipeline for a prompt:
//
//   cache lookup (free) -> per-org rate limit -> monthly allowance
//   -> platform daily cap (paid providers only)
//   -> provider call -> Zod + grounding validation (one retry) -> cache
//
// Failure closes: invalid output is never stored or shown.

export interface AiResult<Output> {
  content: Output
  model: string
  promptVersion: string
  createdAt: string
  // True when served from the cache, so nothing was spent.
  cached: boolean
}

const MAX_ATTEMPTS = 2

export function inputHashFor(input: unknown): string {
  return hashInput(input)
}

function toResult<Output>(
  prompt: Prompt<unknown, Output>,
  row: { content: unknown; model: string; createdAt: Date },
  cached: boolean
): AiResult<Output> | null {
  // A row written under an older schema fails here and counts as a miss.
  const parsed = prompt.schema.safeParse(row.content)
  if (!parsed.success) return null
  return {
    content: parsed.data,
    model: row.model,
    promptVersion: prompt.version,
    createdAt: row.createdAt.toISOString(),
    cached
  }
}

// Reads the cache only. Never calls the provider and never spends allowance.
export async function findCachedAi<Input, Output>(
  prompt: Prompt<Input, Output>,
  input: Input
): Promise<AiResult<Output> | null> {
  const row = await prisma.aiSummary.findUnique({
    where: {
      kind_inputHash_promptVersion: {
        kind: prompt.kind,
        inputHash: inputHashFor(input),
        promptVersion: prompt.version
      }
    }
  })
  return row ? toResult(prompt as Prompt<unknown, Output>, row, true) : null
}

function describeIssues(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>
) {
  return issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.') || 'reply'}: ${issue.message}`)
}

async function callWithValidation<Input, Output>(
  provider: AiProvider,
  prompt: Prompt<Input, Output>,
  input: Input,
  tokens: AiTokenUsage
): Promise<{ content: Output; model: string }> {
  const messages: AiMessage[] = [{ role: 'user', content: prompt.build(input) }]
  const model = modelFor(prompt.tier)
  let problems: string[] = []

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let rawText: string
    try {
      const result = await provider.generateStructured({
        schema: prompt.schema,
        system: prompt.system,
        messages,
        model
      })
      tokens.inputTokens += result.usage.inputTokens
      tokens.outputTokens += result.usage.outputTokens
      rawText = result.rawText

      const parsed = prompt.schema.safeParse(result.output)
      if (parsed.success) {
        problems = prompt.validate?.(parsed.data, input) ?? []
        if (problems.length === 0) {
          return { content: parsed.data, model: result.model }
        }
      } else {
        problems = describeIssues(parsed.error.issues)
      }
    } catch (error) {
      if (!(error instanceof AiOutputError)) throw error
      tokens.inputTokens += error.usage.inputTokens
      tokens.outputTokens += error.usage.outputTokens
      rawText = error.rawText
      problems = [error.message]
    }

    if (attempt < MAX_ATTEMPTS) {
      if (rawText) messages.push({ role: 'assistant', content: rawText })
      messages.push({
        role: 'user',
        content: `Your reply was rejected:\n${problems.map((p) => `- ${p}`).join('\n')}\nReply again with corrected JSON that follows the schema and every rule in the instructions.`
      })
    }
  }

  console.error('AI output rejected after retry', {
    prompt: prompt.id,
    version: prompt.version,
    problems
  })
  throw aiUnavailable(
    'The AI response could not be checked against the catalogue data, so it was not shown. Try again.'
  )
}

// Returns the cached result for (kind, input hash, prompt version) or
// generates, validates and caches a new one. Spends one request of the
// organisation's monthly allowance only when it has to generate.
export async function generateCached<Input, Output>(
  ctx: TenantContext,
  prompt: Prompt<Input, Output>,
  input: Input,
  subjectKey: string
): Promise<AiResult<Output>> {
  requirePermission(ctx, Permission.USE_AI)

  const cached = await findCachedAi(prompt, input)
  if (cached) return cached

  // Fail early when AI is not configured, before spending any allowance.
  const provider = getAiProvider()

  const wait = aiRateLimiter.consume(ctx.organisationId)
  if (wait > 0) throw rateLimited(wait)

  const month = await reserveAiRequest(ctx)
  // Paid calls also draw on the platform-wide daily ceiling (ADR 0014); a
  // local model is free and skips it.
  let platformDay: string | null = null
  try {
    if (provider.costsMoney) platformDay = await reservePlatformRequest()
  } catch (error) {
    await releaseAiRequest(ctx, month)
    throw error
  }
  const tokens: AiTokenUsage = { inputTokens: 0, outputTokens: 0 }
  let succeeded = false
  try {
    const { content, model } = await callWithValidation(
      provider,
      prompt,
      input,
      tokens
    )
    const inputHash = inputHashFor(input)
    const data = {
      subjectKey,
      model,
      content: content as Prisma.InputJsonValue,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens
    }
    const row = await prisma.aiSummary.upsert({
      where: {
        kind_inputHash_promptVersion: {
          kind: prompt.kind,
          inputHash,
          promptVersion: prompt.version
        }
      },
      create: {
        kind: prompt.kind,
        inputHash,
        promptVersion: prompt.version,
        ...data
      },
      update: data
    })
    succeeded = true
    return {
      content,
      model: row.model,
      promptVersion: prompt.version,
      createdAt: row.createdAt.toISOString(),
      cached: false
    }
  } catch (error) {
    if (error instanceof AiProviderError) {
      console.error('AI provider error', error.message)
      throw aiUnavailable(error.userMessage)
    }
    throw error
  } finally {
    // Nothing to show means nothing charged; the tokens were still spent.
    // Bookkeeping must never hide the result or the real error.
    try {
      if (!succeeded) {
        await releaseAiRequest(ctx, month)
        if (platformDay) await releasePlatformRequest(platformDay)
      }
      await recordAiTokens(ctx, month, tokens)
      if (platformDay) await recordPlatformTokens(platformDay, tokens)
    } catch (bookkeeping) {
      console.error('Could not update AI usage', bookkeeping)
    }
  }
}
