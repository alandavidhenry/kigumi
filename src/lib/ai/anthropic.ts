import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'

import {
  AiOutputError,
  AiProviderError,
  type AiProvider,
  type GenerateStructuredRequest,
  type GenerateStructuredResult
} from './provider'

// Anthropic implementation of AiProvider (ADR 0007). Uses the Messages API's
// native structured output (`output_config.format`) so the reply is JSON that
// follows the Zod schema; the service validates it again regardless.

const DEFAULT_MAX_TOKENS = 6000

export function toProviderError(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) return error
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return new AiProviderError(
      'The AI service is not set up correctly. Ask an administrator to check the API key.',
      `Anthropic rejected the credentials (${error.status})`
    )
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiProviderError(
      'The AI service is busy right now. Try again in a minute.',
      'Anthropic rate limit'
    )
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiProviderError(
      'Could not reach the AI service. Try again shortly.',
      error.message
    )
  }
  if (error instanceof Anthropic.APIError) {
    return new AiProviderError(
      'The AI service had a problem. Try again shortly.',
      `Anthropic API error ${error.status}: ${error.message}`
    )
  }
  return new AiProviderError(
    'The AI service had a problem. Try again shortly.',
    error instanceof Error ? error.message : String(error)
  )
}

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic'
  readonly costsMoney = true

  constructor(private readonly client: Pick<Anthropic, 'messages'>) {}

  async generateStructured<T>(
    request: GenerateStructuredRequest<T>
  ): Promise<GenerateStructuredResult> {
    let response: Anthropic.Message
    try {
      response = await this.client.messages.create({
        model: request.model,
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: request.system,
        messages: request.messages,
        output_config: {
          effort: request.effort ?? 'low',
          format: zodOutputFormat(request.schema)
        }
      })
    } catch (error) {
      throw toProviderError(error)
    }

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens
    }
    const rawText = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('')

    if (response.stop_reason === 'refusal') {
      throw new AiProviderError(
        'The AI service declined to answer this request.',
        `Anthropic refusal (${response.stop_details?.category ?? 'no category'})`
      )
    }
    if (response.stop_reason === 'max_tokens') {
      throw new AiOutputError('The reply was cut off.', rawText, usage)
    }

    let output: unknown
    try {
      output = JSON.parse(rawText)
    } catch {
      throw new AiOutputError('The reply was not valid JSON.', rawText, usage)
    }
    return { output, rawText, usage, model: response.model }
  }
}
