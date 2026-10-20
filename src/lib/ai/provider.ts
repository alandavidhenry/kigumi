import type { ZodType } from 'zod'

// Provider-agnostic AI interface (ADR 0007). Everything outside this folder
// talks to AiProvider, never to a vendor SDK, so moving to Claude on Foundry
// or Bedrock only touches the implementation.

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
}

export type AiEffort = 'low' | 'medium' | 'high'

export interface AiTokenUsage {
  inputTokens: number
  outputTokens: number
}

export interface GenerateStructuredRequest<T> {
  // Describes the JSON the model must return. Providers with native
  // structured output derive their JSON schema from it; the caller still
  // validates the result with the same schema.
  schema: ZodType<T>
  system: string
  messages: AiMessage[]
  model: string
  maxTokens?: number
  effort?: AiEffort
}

export interface GenerateStructuredResult {
  // Parsed JSON, not yet validated against the schema.
  output: unknown
  // The model's raw reply, kept so a retry can show it what was wrong.
  rawText: string
  usage: AiTokenUsage
  model: string
}

export interface AiProvider {
  readonly name: string
  // True when each call is billed. Only these count against the platform
  // daily cap; a local model on your own machine is free.
  readonly costsMoney: boolean
  generateStructured<T>(
    request: GenerateStructuredRequest<T>
  ): Promise<GenerateStructuredResult>
}

// The call worked but the reply was unusable (not JSON, or cut off). The
// service retries once with feedback and then fails closed.
export class AiOutputError extends Error {
  readonly rawText: string
  readonly usage: AiTokenUsage

  constructor(message: string, rawText = '', usage?: AiTokenUsage) {
    super(message)
    this.name = 'AiOutputError'
    this.rawText = rawText
    this.usage = usage ?? { inputTokens: 0, outputTokens: 0 }
  }
}

// The call itself failed (network, auth, overload, refusal). `userMessage` is
// safe to show; `message` carries the detail for logs.
export class AiProviderError extends Error {
  readonly userMessage: string

  constructor(userMessage: string, detail?: string) {
    super(detail ?? userMessage)
    this.name = 'AiProviderError'
    this.userMessage = userMessage
  }
}
