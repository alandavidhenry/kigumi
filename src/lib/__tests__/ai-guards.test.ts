import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import {
  aiEnabled,
  dailyRequestCap,
  localConfig,
  providerName
} from '@/lib/ai/config'
import { LocalProvider } from '@/lib/ai/local'
import {
  dayKey,
  recordPlatformTokens,
  releasePlatformRequest,
  reservePlatformRequest
} from '@/lib/ai/platform-cap'
import { AiOutputError, AiProviderError } from '@/lib/ai/provider'
import { getAiProvider, setAiProvider } from '@/lib/ai/registry'
import prisma from '@/lib/prisma'

vi.mock('@/lib/prisma', () => ({
  default: { aiPlatformUsage: { upsert: vi.fn(), updateMany: vi.fn() } }
}))

const usage = vi.mocked(prisma.aiPlatformUsage, true)

afterEach(() => {
  vi.unstubAllEnvs()
  setAiProvider(null)
})

describe('config', () => {
  it('AI is on unless explicitly switched off', () => {
    expect(aiEnabled()).toBe(true)
    for (const off of ['false', 'FALSE', '0', 'off']) {
      vi.stubEnv('AI_ENABLED', off)
      expect(aiEnabled()).toBe(false)
    }
    vi.stubEnv('AI_ENABLED', 'true')
    expect(aiEnabled()).toBe(true)
  })

  it('defaults the daily cap low outside production and higher in production', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(dailyRequestCap()).toBe(100)
    vi.stubEnv('NODE_ENV', 'production')
    expect(dailyRequestCap()).toBe(1000)
  })

  it('reads the daily cap from the environment, ignoring junk', () => {
    vi.stubEnv('AI_DAILY_REQUEST_CAP', '25')
    expect(dailyRequestCap()).toBe(25)
    vi.stubEnv('AI_DAILY_REQUEST_CAP', '0')
    expect(dailyRequestCap()).toBe(0)
    for (const junk of ['-5', '1.5', 'lots', '']) {
      vi.stubEnv('AI_DAILY_REQUEST_CAP', junk)
      vi.stubEnv('NODE_ENV', 'development')
      expect(dailyRequestCap()).toBe(100)
    }
  })

  it('picks the provider and local server settings', () => {
    expect(providerName()).toBe('anthropic')
    vi.stubEnv('AI_PROVIDER', ' LOCAL ')
    expect(providerName()).toBe('local')
    expect(localConfig()).toEqual({
      baseUrl: 'http://localhost:11434/v1',
      model: null
    })
    vi.stubEnv('AI_LOCAL_BASE_URL', 'http://localhost:1234/v1/')
    vi.stubEnv('AI_LOCAL_MODEL', 'qwen2.5:7b')
    expect(localConfig()).toEqual({
      baseUrl: 'http://localhost:1234/v1',
      model: 'qwen2.5:7b'
    })
  })
})

describe('platform daily cap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('AI_DAILY_REQUEST_CAP', '3')
  })

  it('uses the UTC day', () => {
    expect(dayKey(new Date('2026-10-31T23:59:00Z'))).toBe('2026-10-31')
    expect(dayKey(new Date('2026-11-01T00:00:00Z'))).toBe('2026-11-01')
  })

  it('counts a request against today and returns the day', async () => {
    usage.upsert.mockResolvedValue({ requests: 1 } as never)
    const day = await reservePlatformRequest(new Date('2026-10-15T12:00:00Z'))
    expect(day).toBe('2026-10-15')
    expect(usage.upsert).toHaveBeenCalledWith({
      where: { day: '2026-10-15' },
      create: { day: '2026-10-15', requests: 1 },
      update: { requests: { increment: 1 } },
      select: { requests: true }
    })
  })

  it('allows the last request under the cap', async () => {
    usage.upsert.mockResolvedValue({ requests: 3 } as never)
    await expect(reservePlatformRequest()).resolves.toBeTruthy()
    expect(usage.updateMany).not.toHaveBeenCalled()
  })

  it('refuses over the cap, says so plainly, and gives the increment back', async () => {
    usage.upsert.mockResolvedValue({ requests: 4 } as never)
    const error = await reservePlatformRequest(
      new Date('2026-10-15T12:00:00Z')
    ).catch((e) => e)
    expect(error.code).toBe('AI_UNAVAILABLE')
    expect(error.message).toMatch(/daily usage limit/)
    expect(usage.updateMany).toHaveBeenCalledWith({
      where: { day: '2026-10-15', requests: { gt: 0 } },
      data: { requests: { decrement: 1 } }
    })
  })

  it('a cap of 0 blocks every paid call', async () => {
    vi.stubEnv('AI_DAILY_REQUEST_CAP', '0')
    usage.upsert.mockResolvedValue({ requests: 1 } as never)
    await expect(reservePlatformRequest()).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE'
    })
  })

  it('releases and records tokens', async () => {
    await releasePlatformRequest('2026-10-15')
    expect(usage.updateMany).toHaveBeenCalledWith({
      where: { day: '2026-10-15', requests: { gt: 0 } },
      data: { requests: { decrement: 1 } }
    })
    await recordPlatformTokens('2026-10-15', {
      inputTokens: 7,
      outputTokens: 2
    })
    expect(usage.updateMany).toHaveBeenLastCalledWith({
      where: { day: '2026-10-15' },
      data: {
        inputTokens: { increment: 7 },
        outputTokens: { increment: 2 }
      }
    })
  })

  it('skips the token write when nothing was spent', async () => {
    await recordPlatformTokens('2026-10-15', {
      inputTokens: 0,
      outputTokens: 0
    })
    expect(usage.updateMany).not.toHaveBeenCalled()
  })
})

describe('getAiProvider with AI_PROVIDER=local', () => {
  beforeEach(() => {
    vi.stubEnv('AI_PROVIDER', 'local')
    vi.stubEnv('NODE_ENV', 'development')
  })

  it('needs a model to be named', () => {
    expect(() => getAiProvider()).toThrow(/AI_LOCAL_MODEL/)
  })

  it('builds a free provider pointed at the local server', () => {
    vi.stubEnv('AI_LOCAL_MODEL', 'qwen2.5:7b')
    const provider = getAiProvider()
    expect(provider.name).toBe('local')
    expect(provider.costsMoney).toBe(false)
  })

  it('is refused in production, whatever else is set', () => {
    vi.stubEnv('AI_LOCAL_MODEL', 'qwen2.5:7b')
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => getAiProvider()).toThrow(/development only/)
  })

  it('does not need an Anthropic key', () => {
    vi.stubEnv('AI_LOCAL_MODEL', 'qwen2.5:7b')
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    expect(() => getAiProvider()).not.toThrow()
  })

  it('is still subject to the kill switch', () => {
    vi.stubEnv('AI_LOCAL_MODEL', 'qwen2.5:7b')
    vi.stubEnv('AI_ENABLED', 'false')
    expect(() => getAiProvider()).toThrow(/switched off/)
  })
})

describe('LocalProvider', () => {
  const schema = z.object({ answer: z.string() })
  const request = {
    schema,
    system: 'sys',
    messages: [{ role: 'user' as const, content: 'hi' }],
    model: 'claude-sonnet-5-5'
  }

  const completion = (overrides: Record<string, unknown> = {}) => ({
    model: 'qwen2.5:7b',
    choices: [
      { message: { content: '{"answer":"yes"}' }, finish_reason: 'stop' }
    ],
    usage: { prompt_tokens: 80, completion_tokens: 20 },
    ...overrides
  })

  function providerReturning(body: unknown, init: ResponseInit = {}) {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status: 200,
        ...init
      })
    )
    return {
      fetchImpl,
      provider: new LocalProvider(
        'http://localhost:11434/v1',
        'qwen2.5:7b',
        fetchImpl as unknown as typeof fetch
      )
    }
  }

  it('is free and sends a JSON-schema chat request to the local model', async () => {
    const { fetchImpl, provider } = providerReturning(completion())

    const result = await provider.generateStructured(request)

    expect(provider.costsMoney).toBe(false)
    expect(result).toEqual({
      output: { answer: 'yes' },
      rawText: '{"answer":"yes"}',
      usage: { inputTokens: 80, outputTokens: 20 },
      model: 'local:qwen2.5:7b'
    })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:11434/v1/chat/completions')
    const body = JSON.parse(init.body)
    // The Claude model id the service asked for is replaced by the local one.
    expect(body.model).toBe('qwen2.5:7b')
    expect(body.stream).toBe(false)
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[0].content).toContain('sys')
    expect(body.messages[1]).toEqual({ role: 'user', content: 'hi' })
    expect(body.response_format.type).toBe('json_schema')
    expect(
      body.response_format.json_schema.schema.properties.answer
    ).toBeDefined()
    // No credentials are sent to a local server.
    expect(init.headers).not.toHaveProperty('authorization')
  })

  it('caps output tokens so a runaway local model stays bounded', async () => {
    const { fetchImpl, provider } = providerReturning(completion())
    await provider.generateStructured({ ...request, maxTokens: 50_000 })
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).max_tokens).toBe(2000)
  })

  it('accepts JSON wrapped in a code fence', async () => {
    const { provider } = providerReturning(
      completion({
        choices: [{ message: { content: '```json\n{"answer":"fenced"}\n```' } }]
      })
    )
    expect((await provider.generateStructured(request)).output).toEqual({
      answer: 'fenced'
    })
  })

  it('reports prose as retryable output, with the tokens it used', async () => {
    const { provider } = providerReturning(
      completion({ choices: [{ message: { content: 'Sure, here it is' } }] })
    )
    const error = await provider.generateStructured(request).catch((e) => e)
    expect(error).toBeInstanceOf(AiOutputError)
    expect(error.usage).toEqual({ inputTokens: 80, outputTokens: 20 })
  })

  it('reports a cut-off reply as retryable output', async () => {
    const { provider } = providerReturning(
      completion({
        choices: [{ message: { content: '{"ans' }, finish_reason: 'length' }]
      })
    )
    const error = await provider.generateStructured(request).catch((e) => e)
    expect(error).toBeInstanceOf(AiOutputError)
    expect(error.message).toMatch(/cut off/)
  })

  it('says so when the server is not running', async () => {
    const provider = new LocalProvider(
      'http://localhost:11434/v1',
      'qwen2.5:7b',
      vi.fn().mockRejectedValue(new TypeError('fetch failed')) as never
    )
    const error = await provider.generateStructured(request).catch((e) => e)
    expect(error).toBeInstanceOf(AiProviderError)
    expect(error.userMessage).toMatch(/Is it running/)
  })

  it('names the model when the server rejects the request', async () => {
    const { provider } = providerReturning('model not found', { status: 404 })
    const error = await provider.generateStructured(request).catch((e) => e)
    expect(error).toBeInstanceOf(AiProviderError)
    expect(error.userMessage).toContain('qwen2.5:7b')
  })

  it('tolerates a server that reports no token usage', async () => {
    const { provider } = providerReturning(completion({ usage: undefined }))
    expect((await provider.generateStructured(request)).usage).toEqual({
      inputTokens: 0,
      outputTokens: 0
    })
  })
})
