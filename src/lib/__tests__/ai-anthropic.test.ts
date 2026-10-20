import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { AnthropicProvider, toProviderError } from '@/lib/ai/anthropic'
import { AiOutputError, AiProviderError } from '@/lib/ai/provider'

const schema = z.object({ answer: z.string() })
const base = {
  schema,
  system: 'sys',
  messages: [{ role: 'user' as const, content: 'hi' }],
  model: 'claude-sonnet-5-5'
}

function clientReturning(response: unknown) {
  const create = vi.fn().mockResolvedValue(response)
  return {
    create,
    provider: new AnthropicProvider({ messages: { create } } as never)
  }
}

const message = (overrides: Record<string, unknown> = {}) => ({
  model: 'claude-sonnet-5-5',
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: '{"answer":"yes"}' }],
  usage: { input_tokens: 120, output_tokens: 30 },
  ...overrides
})

describe('AnthropicProvider', () => {
  it('requests structured output and returns parsed JSON with usage', async () => {
    const { create, provider } = clientReturning(message())

    const result = await provider.generateStructured(base)

    expect(result).toEqual({
      output: { answer: 'yes' },
      rawText: '{"answer":"yes"}',
      usage: { inputTokens: 120, outputTokens: 30 },
      model: 'claude-sonnet-5-5'
    })
    const body = create.mock.calls[0][0]
    expect(body.model).toBe('claude-sonnet-5-5')
    expect(body.system).toBe('sys')
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }])
    expect(body.output_config.effort).toBe('low')
    expect(body.output_config.format.type).toBe('json_schema')
    expect(body.output_config.format.schema.properties.answer).toBeDefined()
    // These are rejected by current models; the provider must not send them.
    expect(body).not.toHaveProperty('temperature')
    expect(body).not.toHaveProperty('thinking')
    expect(body).not.toHaveProperty('tool_choice')
  })

  it('passes effort and max tokens through', async () => {
    const { create, provider } = clientReturning(message())
    await provider.generateStructured({
      ...base,
      effort: 'high',
      maxTokens: 99
    })
    expect(create.mock.calls[0][0].max_tokens).toBe(99)
    expect(create.mock.calls[0][0].output_config.effort).toBe('high')
  })

  it('joins text blocks and skips thinking blocks', async () => {
    const { provider } = clientReturning(
      message({
        content: [
          { type: 'thinking', thinking: '' },
          { type: 'text', text: '{"answer":' },
          { type: 'text', text: '"split"}' }
        ]
      })
    )
    const result = await provider.generateStructured(base)
    expect(result.output).toEqual({ answer: 'split' })
  })

  it('reports invalid JSON as an output error carrying the usage', async () => {
    const { provider } = clientReturning(
      message({ content: [{ type: 'text', text: 'Sure! Here you go' }] })
    )
    const error = await provider.generateStructured(base).catch((e) => e)
    expect(error).toBeInstanceOf(AiOutputError)
    expect(error.rawText).toBe('Sure! Here you go')
    expect(error.usage).toEqual({ inputTokens: 120, outputTokens: 30 })
  })

  it('reports a truncated reply as an output error', async () => {
    const { provider } = clientReturning(
      message({
        stop_reason: 'max_tokens',
        content: [{ type: 'text', text: '{"ans' }]
      })
    )
    const error = await provider.generateStructured(base).catch((e) => e)
    expect(error).toBeInstanceOf(AiOutputError)
    expect(error.message).toMatch(/cut off/)
  })

  it('reports a refusal as a provider error, not output to retry', async () => {
    const { provider } = clientReturning(
      message({
        stop_reason: 'refusal',
        stop_details: { type: 'refusal', category: 'cyber' },
        content: []
      })
    )
    const error = await provider.generateStructured(base).catch((e) => e)
    expect(error).toBeInstanceOf(AiProviderError)
    expect(error.userMessage).toMatch(/declined/)
  })

  it('maps SDK failures to provider errors', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(
        new Anthropic.RateLimitError(429, {}, 'slow down', new Headers())
      )
    const provider = new AnthropicProvider({ messages: { create } } as never)
    const error = await provider.generateStructured(base).catch((e) => e)
    expect(error).toBeInstanceOf(AiProviderError)
    expect(error.userMessage).toMatch(/busy/)
  })
})

describe('toProviderError', () => {
  const headers = new Headers()

  it.each([
    [
      new Anthropic.AuthenticationError(401, {}, 'bad key', headers),
      /not set up/
    ],
    [new Anthropic.PermissionDeniedError(403, {}, 'no', headers), /not set up/],
    [new Anthropic.RateLimitError(429, {}, 'slow', headers), /busy/],
    [new Anthropic.InternalServerError(500, {}, 'oops', headers), /problem/],
    [new Anthropic.APIConnectionError({ message: 'offline' }), /reach/],
    [new Error('anything'), /problem/]
  ])('maps %o', (error, message) => {
    const mapped = toProviderError(error)
    expect(mapped).toBeInstanceOf(AiProviderError)
    expect(mapped.userMessage).toMatch(message)
  })

  it('never puts the raw error text in the user message', () => {
    const mapped = toProviderError(
      new Anthropic.AuthenticationError(
        401,
        {},
        'sk-secret-key rejected',
        headers
      )
    )
    expect(mapped.userMessage).not.toContain('sk-secret')
  })

  it('passes existing provider errors through', () => {
    const original = new AiProviderError('x')
    expect(toProviderError(original)).toBe(original)
  })
})
