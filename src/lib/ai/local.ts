import { z } from 'zod'

import {
  AiOutputError,
  AiProviderError,
  type AiProvider,
  type GenerateStructuredRequest,
  type GenerateStructuredResult
} from './provider'

// A model running on your own machine, reached through the OpenAI-compatible
// chat endpoint that Ollama, LM Studio and llama.cpp's server all expose
// (ADR 0014). It is for developing and testing the AI features for free; it
// is never used in production because its output would be stored in the
// shared AiSummary cache. Quality is well below Claude's, so expect the
// grounding check to reject more replies.

const DEFAULT_MAX_TOKENS = 2000
const TIMEOUT_MS = 180_000

interface ChatCompletion {
  model?: string
  choices?: Array<{
    message?: { content?: string | null }
    finish_reason?: string | null
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

// Small local models often wrap JSON in a code fence despite being asked not to.
function stripFence(text: string): string {
  const match = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(text)
  return match ? match[1] : text
}

export class LocalProvider implements AiProvider {
  readonly name = 'local'
  readonly costsMoney = false

  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async generateStructured<T>(
    request: GenerateStructuredRequest<T>
  ): Promise<GenerateStructuredResult> {
    // The service asks for a Claude model id; a local server needs its own.
    const body = {
      model: this.model,
      stream: false,
      temperature: 0.2,
      max_tokens: request.maxTokens
        ? Math.min(request.maxTokens, DEFAULT_MAX_TOKENS)
        : DEFAULT_MAX_TOKENS,
      messages: [
        {
          role: 'system',
          content: `${request.system}\n\nReply with a single JSON object only: no prose and no code fence.`
        },
        ...request.messages
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'response',
          strict: true,
          schema: z.toJSONSchema(request.schema)
        }
      }
    }

    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
    } catch (error) {
      throw new AiProviderError(
        `Could not reach the local model server at ${this.baseUrl}. Is it running?`,
        error instanceof Error ? error.message : String(error)
      )
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new AiProviderError(
        `The local model server returned an error (${response.status}). Check that the model "${this.model}" is installed.`,
        `Local server ${response.status}: ${detail.slice(0, 300)}`
      )
    }

    const data = (await response
      .json()
      .catch(() => null)) as ChatCompletion | null
    const choice = data?.choices?.[0]
    const rawText = choice?.message?.content ?? ''
    const usage = {
      inputTokens: data?.usage?.prompt_tokens ?? 0,
      outputTokens: data?.usage?.completion_tokens ?? 0
    }

    if (choice?.finish_reason === 'length') {
      throw new AiOutputError('The reply was cut off.', rawText, usage)
    }
    let output: unknown
    try {
      output = JSON.parse(stripFence(rawText))
    } catch {
      throw new AiOutputError('The reply was not valid JSON.', rawText, usage)
    }
    return {
      output,
      rawText,
      usage,
      model: `local:${data?.model ?? this.model}`
    }
  }
}
