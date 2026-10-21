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
import { isTenantPrompt } from './prompts/types'
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

import type { Prompt, TenantPrompt } from './prompts/types'

// The AI service (ADR 0007, 0013). One entry point, generateCached, runs the
// whole pipeline for a prompt:
//
//   cache lookup (free) -> per-org rate limit -> monthly allowance
//   -> platform daily cap (paid providers only)
//   -> provider call -> Zod + grounding validation (one retry) -> cache
//
// Failure closes: invalid output is never stored or shown.
//
// Two front doors share that pipeline. generateCached stores in the global
// AiSummary cache and only accepts prompts whose input is catalogue data.
// generateForTenant is for prompts that include tenant data: the caller
// supplies the tenant-scoped lookup and store, and nothing is ever written to
// the global cache (ADR 0013 section 1, ADR 0015).

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
  refuseTenantPrompt(prompt)
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

// Runtime backstop for the types: a tenant prompt must never reach the global
// cache, even through a cast.
function refuseTenantPrompt(prompt: { id: string; tenant?: unknown }): void {
  if (isTenantPrompt(prompt)) {
    throw new Error(
      `Prompt "${prompt.id}" holds tenant data and cannot use the global AI cache. Use generateForTenant.`
    )
  }
}

function describeIssues(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>
) {
  return issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.') || 'reply'}: ${issue.message}`)
}

// Calls the model and checks the reply against the prompt's schema and rules,
// retrying once with the rejection fed back. Exported so the offline
// evaluation can run a prompt without a tenant or an allowance.
export async function callWithValidation<Input, Output>(
  provider: AiProvider,
  prompt: Prompt<Input, Output> | TenantPrompt<Input, Output>,
  input: Input,
  tokens: AiTokenUsage,
  // Told how each attempt went (no problems = accepted). The evaluation uses
  // it to report first-attempt validity; the app does not.
  onAttempt?: (attempt: number, problems: string[]) => void
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
          onAttempt?.(attempt, [])
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
    onAttempt?.(attempt, problems)

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

export interface Generated<Output> {
  content: Output
  model: string
  inputTokens: number
  outputTokens: number
}

// Everything after the cache lookup: provider, rate limit, allowance, platform
// cap, validated call, store, and the bookkeeping that hands the request back
// when the user got nothing. `store` is the only part that differs between
// the global and the tenant paths.
async function generateAndStore<Input, Output, Stored>(
  ctx: TenantContext,
  prompt: Prompt<Input, Output> | TenantPrompt<Input, Output>,
  input: Input,
  store: (generated: Generated<Output>) => Promise<Stored>
): Promise<Stored> {
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
    const stored = await store({
      content,
      model,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens
    })
    succeeded = true
    return stored
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

// Returns the cached result for (kind, input hash, prompt version) or
// generates, validates and caches a new one. Spends one request of the
// organisation's monthly allowance only when it has to generate.
export async function generateCached<Input, Output>(
  ctx: TenantContext,
  prompt: Prompt<Input, Output>,
  input: Input,
  subjectKey: string
): Promise<AiResult<Output>> {
  refuseTenantPrompt(prompt)
  requirePermission(ctx, Permission.USE_AI)

  const cached = await findCachedAi(prompt, input)
  if (cached) return cached

  return generateAndStore(ctx, prompt, input, async (generated) => {
    const inputHash = inputHashFor(input)
    const data = {
      subjectKey,
      model: generated.model,
      content: generated.content as Prisma.InputJsonValue,
      inputTokens: generated.inputTokens,
      outputTokens: generated.outputTokens
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
    return {
      content: generated.content,
      model: row.model,
      promptVersion: prompt.version,
      createdAt: row.createdAt.toISOString(),
      cached: false
    }
  })
}

export interface TenantHooks<Output, Stored> {
  // Looks for an earlier result for this exact input, inside the tenant's own
  // data. Returns null on a miss.
  find(): Promise<Stored | null>
  // Stores a validated reply in tenant-scoped tables.
  save(generated: Generated<Output>): Promise<Stored>
  // Skip the lookup and spend a request ("regenerate").
  force?: boolean
}

// The tenant-data twin of generateCached: same guards, same accounting, but
// the lookup and store belong to the caller and the global AiSummary cache is
// never touched. A failed save hands the request back like any other failure.
export async function generateForTenant<Input, Output, Stored>(
  ctx: TenantContext,
  prompt: TenantPrompt<Input, Output>,
  input: Input,
  hooks: TenantHooks<Output, Stored>
): Promise<{ stored: Stored; cached: boolean }> {
  requirePermission(ctx, Permission.USE_AI)

  if (!hooks.force) {
    const hit = await hooks.find()
    if (hit) return { stored: hit, cached: true }
  }

  const stored = await generateAndStore(ctx, prompt, input, hooks.save)
  return { stored, cached: false }
}
