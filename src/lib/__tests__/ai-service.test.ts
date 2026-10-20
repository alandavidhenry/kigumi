import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import {
  recordPlatformTokens,
  releasePlatformRequest,
  reservePlatformRequest
} from '@/lib/ai/platform-cap'
import type { Prompt } from '@/lib/ai/prompts/types'
import {
  AiOutputError,
  AiProviderError,
  type AiProvider,
  type GenerateStructuredRequest,
  type GenerateStructuredResult
} from '@/lib/ai/provider'
import { aiRateLimiter } from '@/lib/ai/rate-limit'
import { getAiProvider, setAiProvider } from '@/lib/ai/registry'
import { findCachedAi, generateCached } from '@/lib/ai/service'
import {
  recordAiTokens,
  releaseAiRequest,
  reserveAiRequest
} from '@/lib/ai/usage'
import { aiUnavailable, planLimit } from '@/lib/errors'
import prisma from '@/lib/prisma'
import { makeContext } from '@/test/fixtures'
import { MemberRole } from '@/types/rbac'

vi.mock('@/lib/prisma', () => ({
  default: { aiSummary: { findUnique: vi.fn(), upsert: vi.fn() } }
}))
vi.mock('@/lib/ai/usage', () => ({
  reserveAiRequest: vi.fn(),
  releaseAiRequest: vi.fn(),
  recordAiTokens: vi.fn()
}))
vi.mock('@/lib/ai/platform-cap', () => ({
  reservePlatformRequest: vi.fn(),
  releasePlatformRequest: vi.fn(),
  recordPlatformTokens: vi.fn()
}))
vi.mock('@/lib/tenant-context', async () => {
  const { forbidden } = await import('@/lib/errors')
  const { hasPermission } = await import('@/types/rbac')
  return {
    requirePermission: (ctx: { role: never }, permission: never) => {
      if (!hasPermission(ctx.role, permission)) throw forbidden()
    }
  }
})

const db = vi.mocked(prisma, true)
const ctx = makeContext()

interface Answer {
  answer: string
}
const prompt: Prompt<{ topic: string }, Answer> = {
  id: 'test',
  kind: 'mic',
  version: '7',
  tier: 'default',
  system: 'system text',
  schema: z.object({ answer: z.string().min(1) }),
  build: (input) => `about ${input.topic}`,
  validate: (output) => (output.answer === 'bad' ? ['answer is bad'] : [])
}
const input = { topic: 'snares' }

const ok = (answer: string, tokens = [10, 5]): GenerateStructuredResult => ({
  output: { answer },
  rawText: JSON.stringify({ answer }),
  usage: { inputTokens: tokens[0], outputTokens: tokens[1] },
  model: 'fake-model'
})

function fakeProvider(
  ...steps: Array<
    GenerateStructuredResult | Error | (() => GenerateStructuredResult)
  >
) {
  const calls: GenerateStructuredRequest<unknown>[] = []
  const provider: AiProvider = {
    name: 'fake',
    costsMoney: true,
    async generateStructured<T>(request: GenerateStructuredRequest<T>) {
      calls.push(request as GenerateStructuredRequest<unknown>)
      const step = steps[Math.min(calls.length - 1, steps.length - 1)]
      if (step instanceof Error) throw step
      return typeof step === 'function' ? step() : step
    }
  }
  return { provider, calls }
}

// The compound unique key a findUnique call looked up.
const uniqueKey = (call: unknown[]) =>
  (
    call[0] as {
      where: {
        kind_inputHash_promptVersion: {
          kind: string
          inputHash: string
          promptVersion: string
        }
      }
    }
  ).where.kind_inputHash_promptVersion

const storedRow = {
  content: { answer: 'cached' },
  model: 'old-model',
  createdAt: new Date('2026-10-01T10:00:00Z')
}

beforeEach(() => {
  vi.clearAllMocks()
  aiRateLimiter.reset()
  db.aiSummary.findUnique.mockResolvedValue(null)
  db.aiSummary.upsert.mockImplementation((async (args: {
    create: { model: string }
  }) => ({
    model: args.create.model,
    createdAt: new Date('2026-10-08T09:00:00Z')
  })) as never)
  vi.mocked(reserveAiRequest).mockResolvedValue('2026-10')
  vi.mocked(reservePlatformRequest).mockResolvedValue('2026-10-08')
})

afterEach(() => {
  setAiProvider(null)
  vi.unstubAllEnvs()
})

describe('findCachedAi', () => {
  it('looks up by kind, input hash and prompt version', async () => {
    db.aiSummary.findUnique.mockResolvedValue(storedRow as never)
    const hit = await findCachedAi(prompt, input)
    expect(hit).toEqual({
      content: { answer: 'cached' },
      model: 'old-model',
      promptVersion: '7',
      createdAt: '2026-10-01T10:00:00.000Z',
      cached: true
    })
    const key = uniqueKey(db.aiSummary.findUnique.mock.calls[0])
    expect(key).toMatchObject({ kind: 'mic', promptVersion: '7' })
    expect(key.inputHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('uses the same hash whatever the key order of the input', async () => {
    await findCachedAi(prompt, { a: 1, b: 2 } as never)
    await findCachedAi(prompt, { b: 2, a: 1 } as never)
    const [first, second] = db.aiSummary.findUnique.mock.calls.map(
      (call) => uniqueKey(call).inputHash
    )
    expect(first).toBe(second)
  })

  it('misses when nothing is cached', async () => {
    expect(await findCachedAi(prompt, input)).toBeNull()
  })

  it('treats a row that no longer fits the schema as a miss', async () => {
    db.aiSummary.findUnique.mockResolvedValue({
      ...storedRow,
      content: { old: 'shape' }
    } as never)
    expect(await findCachedAi(prompt, input)).toBeNull()
  })
})

describe('generateCached', () => {
  it('serves a cache hit without a provider call or any allowance', async () => {
    db.aiSummary.findUnique.mockResolvedValue(storedRow as never)
    const { provider, calls } = fakeProvider(ok('fresh'))
    setAiProvider(provider)

    const result = await generateCached(ctx, prompt, input, 'subject')

    expect(result.cached).toBe(true)
    expect(result.content.answer).toBe('cached')
    expect(calls).toHaveLength(0)
    expect(reserveAiRequest).not.toHaveBeenCalled()
  })

  it('serves a cache hit even when AI is not configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    db.aiSummary.findUnique.mockResolvedValue(storedRow as never)
    await expect(
      generateCached(ctx, prompt, input, 's')
    ).resolves.toMatchObject({ cached: true })
  })

  it('generates, validates, caches and records usage on a miss', async () => {
    const { provider, calls } = fakeProvider(ok('hello'))
    setAiProvider(provider)

    const result = await generateCached(ctx, prompt, input, 'snares')

    expect(result).toMatchObject({
      content: { answer: 'hello' },
      model: 'fake-model',
      promptVersion: '7',
      cached: false
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].system).toBe('system text')
    expect(calls[0].messages).toEqual([
      { role: 'user', content: 'about snares' }
    ])
    expect(calls[0].model).toBe('claude-sonnet-5-5')

    const upsert = db.aiSummary.upsert.mock.calls[0][0]
    expect(upsert.create).toMatchObject({
      kind: 'mic',
      promptVersion: '7',
      subjectKey: 'snares',
      model: 'fake-model',
      content: { answer: 'hello' },
      inputTokens: 10,
      outputTokens: 5
    })
    expect(reserveAiRequest).toHaveBeenCalledTimes(1)
    expect(releaseAiRequest).not.toHaveBeenCalled()
    expect(recordAiTokens).toHaveBeenCalledWith(ctx, '2026-10', {
      inputTokens: 10,
      outputTokens: 5
    })
  })

  it('uses the model from AI_MODEL_FAST for fast prompts', async () => {
    vi.stubEnv('AI_MODEL_FAST', 'tiny-model')
    const { provider, calls } = fakeProvider(ok('x'))
    setAiProvider(provider)
    await generateCached(ctx, { ...prompt, tier: 'fast' }, input, 's')
    expect(calls[0].model).toBe('tiny-model')
  })

  it('retries once with feedback when the output fails the schema', async () => {
    const { provider, calls } = fakeProvider(
      { ...ok(''), output: { answer: '' }, rawText: '{"answer":""}' },
      ok('fixed')
    )
    setAiProvider(provider)

    const result = await generateCached(ctx, prompt, input, 's')

    expect(result.content.answer).toBe('fixed')
    expect(calls).toHaveLength(2)
    const retry = calls[1].messages
    expect(retry.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(retry[1].content).toBe('{"answer":""}')
    expect(retry[2].content).toContain('answer')
    // Tokens from both attempts are counted; the user paid for one request.
    expect(recordAiTokens).toHaveBeenCalledWith(ctx, '2026-10', {
      inputTokens: 20,
      outputTokens: 10
    })
    expect(reserveAiRequest).toHaveBeenCalledTimes(1)
  })

  it('retries when a custom validation rule fails', async () => {
    const { provider, calls } = fakeProvider(ok('bad'), ok('good'))
    setAiProvider(provider)
    const result = await generateCached(ctx, prompt, input, 's')
    expect(result.content.answer).toBe('good')
    expect(calls[1].messages.at(-1)?.content).toContain('answer is bad')
  })

  it('retries when the reply was not JSON', async () => {
    const { provider, calls } = fakeProvider(
      new AiOutputError('The reply was not valid JSON.', 'oops', {
        inputTokens: 4,
        outputTokens: 2
      }),
      ok('fine')
    )
    setAiProvider(provider)
    const result = await generateCached(ctx, prompt, input, 's')
    expect(result.content.answer).toBe('fine')
    expect(calls[1].messages.at(-1)?.content).toContain('not valid JSON')
    expect(recordAiTokens).toHaveBeenCalledWith(ctx, '2026-10', {
      inputTokens: 14,
      outputTokens: 7
    })
  })

  it('fails closed after the retry and stores nothing', async () => {
    const { provider, calls } = fakeProvider(ok('bad'))
    setAiProvider(provider)

    const error = await generateCached(ctx, prompt, input, 's').catch((e) => e)

    expect(error.code).toBe('AI_UNAVAILABLE')
    expect(error.status).toBe(503)
    expect(calls).toHaveLength(2)
    expect(db.aiSummary.upsert).not.toHaveBeenCalled()
    // The user got nothing, so the request is handed back, tokens still logged.
    expect(releaseAiRequest).toHaveBeenCalledWith(ctx, '2026-10')
    expect(recordAiTokens).toHaveBeenCalledWith(ctx, '2026-10', {
      inputTokens: 20,
      outputTokens: 10
    })
  })

  it('turns provider failures into AI_UNAVAILABLE and releases the request', async () => {
    const { provider } = fakeProvider(
      new AiProviderError('The AI service is busy right now.', 'rate limit')
    )
    setAiProvider(provider)

    const error = await generateCached(ctx, prompt, input, 's').catch((e) => e)

    expect(error.code).toBe('AI_UNAVAILABLE')
    expect(error.message).toBe('The AI service is busy right now.')
    expect(releaseAiRequest).toHaveBeenCalledTimes(1)
    expect(db.aiSummary.upsert).not.toHaveBeenCalled()
  })

  it('lets unexpected errors through, still releasing the request', async () => {
    const { provider } = fakeProvider(new Error('boom'))
    setAiProvider(provider)
    await expect(generateCached(ctx, prompt, input, 's')).rejects.toThrow(
      'boom'
    )
    expect(releaseAiRequest).toHaveBeenCalledTimes(1)
  })

  it('stops at the monthly allowance before calling the provider', async () => {
    vi.mocked(reserveAiRequest).mockRejectedValue(
      planLimit('AI requests this month', 25)
    )
    const { provider, calls } = fakeProvider(ok('x'))
    setAiProvider(provider)

    const error = await generateCached(ctx, prompt, input, 's').catch((e) => e)

    expect(error.code).toBe('PLAN_LIMIT')
    expect(calls).toHaveLength(0)
  })

  it('rate limits bursts per organisation, with Retry-After detail', async () => {
    const { provider } = fakeProvider(ok('x'))
    setAiProvider(provider)
    for (let i = 0; i < 10; i++) {
      db.aiSummary.findUnique.mockResolvedValue(null)
      await generateCached(ctx, prompt, input, 's')
    }

    const error = await generateCached(ctx, prompt, input, 's').catch((e) => e)
    expect(error.code).toBe('RATE_LIMITED')
    expect(error.status).toBe(429)
    expect(error.details.retryAfterSeconds).toBeGreaterThan(0)
    expect(reserveAiRequest).toHaveBeenCalledTimes(10)

    // A different organisation is unaffected.
    await expect(
      generateCached(
        makeContext({ organisationId: 'org_2' }),
        prompt,
        input,
        's'
      )
    ).resolves.toMatchObject({ cached: false })
  })

  it('does not rate limit cache hits', async () => {
    db.aiSummary.findUnique.mockResolvedValue(storedRow as never)
    for (let i = 0; i < 30; i++) {
      await generateCached(ctx, prompt, input, 's')
    }
  })

  it('is unavailable, without spending allowance, when no API key is set', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const error = await generateCached(ctx, prompt, input, 's').catch((e) => e)
    expect(error.code).toBe('AI_UNAVAILABLE')
    expect(reserveAiRequest).not.toHaveBeenCalled()
  })

  it('needs the USE_AI permission, even for a cache hit', async () => {
    db.aiSummary.findUnique.mockResolvedValue(storedRow as never)
    const error = await generateCached(
      makeContext({ role: MemberRole.VIEWER }),
      prompt,
      input,
      's'
    ).catch((e) => e)
    expect(error.code).toBe('FORBIDDEN')
    expect(db.aiSummary.findUnique).not.toHaveBeenCalled()
  })

  it('does not fail the request when usage bookkeeping fails', async () => {
    vi.mocked(recordAiTokens).mockRejectedValueOnce(new Error('db blip'))
    const { provider } = fakeProvider(ok('hello'))
    setAiProvider(provider)
    await expect(
      generateCached(ctx, prompt, input, 's')
    ).resolves.toMatchObject({
      content: { answer: 'hello' }
    })
  })
})

describe('platform daily cap', () => {
  it('reserves a paid call and records its tokens against the platform', async () => {
    const { provider } = fakeProvider(ok('hello'))
    setAiProvider(provider)
    await generateCached(ctx, prompt, input, 's')
    expect(reservePlatformRequest).toHaveBeenCalledTimes(1)
    expect(releasePlatformRequest).not.toHaveBeenCalled()
    expect(recordPlatformTokens).toHaveBeenCalledWith('2026-10-08', {
      inputTokens: 10,
      outputTokens: 5
    })
  })

  it('does not count a free (local) provider against the cap', async () => {
    const { provider } = fakeProvider(ok('hello'))
    setAiProvider({ ...provider, costsMoney: false })
    await generateCached(ctx, prompt, input, 's')
    expect(reservePlatformRequest).not.toHaveBeenCalled()
    expect(recordPlatformTokens).not.toHaveBeenCalled()
  })

  it('stops a paid call before the model when the daily cap is reached', async () => {
    vi.mocked(reservePlatformRequest).mockRejectedValue(
      aiUnavailable('AI is paused for today')
    )
    const { provider, calls } = fakeProvider(ok('x'))
    setAiProvider(provider)

    const error = await generateCached(ctx, prompt, input, 's').catch((e) => e)

    expect(error.code).toBe('AI_UNAVAILABLE')
    expect(calls).toHaveLength(0)
    // The organisation's request is handed back.
    expect(releaseAiRequest).toHaveBeenCalledWith(ctx, '2026-10')
    expect(db.aiSummary.upsert).not.toHaveBeenCalled()
  })

  it('hands the platform request back when the user got nothing', async () => {
    const { provider } = fakeProvider(ok('bad'))
    setAiProvider(provider)
    await generateCached(ctx, prompt, input, 's').catch(() => null)
    expect(releasePlatformRequest).toHaveBeenCalledWith('2026-10-08')
    // The two attempts' tokens were still spent.
    expect(recordPlatformTokens).toHaveBeenCalledWith('2026-10-08', {
      inputTokens: 20,
      outputTokens: 10
    })
  })

  it('checks the organisation allowance first, so a refused org spends no platform budget', async () => {
    vi.mocked(reserveAiRequest).mockRejectedValue(
      planLimit('AI requests this month', 25)
    )
    const { provider } = fakeProvider(ok('x'))
    setAiProvider(provider)
    await generateCached(ctx, prompt, input, 's').catch(() => null)
    expect(reservePlatformRequest).not.toHaveBeenCalled()
  })

  it('never reserves for a cache hit', async () => {
    db.aiSummary.findUnique.mockResolvedValue(storedRow as never)
    await generateCached(ctx, prompt, input, 's')
    expect(reservePlatformRequest).not.toHaveBeenCalled()
  })
})

describe('getAiProvider', () => {
  it('returns the override when one is set', () => {
    const { provider } = fakeProvider(ok('x'))
    setAiProvider(provider)
    expect(getAiProvider()).toBe(provider)
  })

  it('throws AI_UNAVAILABLE without an API key', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    expect(() => getAiProvider()).toThrow(/not configured/)
  })

  it('is switched off by AI_ENABLED=false, even with a key and an override', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
    vi.stubEnv('AI_ENABLED', 'false')
    expect(() => getAiProvider()).toThrow(/switched off/)
    setAiProvider(fakeProvider(ok('x')).provider)
    expect(() => getAiProvider()).toThrow(/switched off/)
  })

  it('builds the Anthropic provider when a key is set', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
    expect(getAiProvider().name).toBe('anthropic')
  })
})
